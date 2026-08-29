import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { PinoLogger } from 'pino-nestjs';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError } from 'rxjs';
import { GenerateAiFormDto } from '../dto/generate-ai-form.dto';

export interface LlmConfig {
  hasConfig: boolean;
  provider: 'openai' | 'gemini' | 'anthropic' | 'openai_compatible' | null;
  apiKey: string | null;
  model: string | null;
  baseUrl: string | null;
  temperature: number;
}

const FORM_GENERATOR_SYSTEM_PROMPT = `Eres un diseñador experto en formularios de recolección de datos en terreno, encuestas urbanas e investigación técnica para CityData.
Tu tarea es generar o modificar una estructura JSON de formulario ("FormDefinition") válida para el motor de formularios CityData a partir de las instrucciones del usuario, documentos de referencia (como hojas de cálculo Excel) y formularios existentes.

REGLAS ESTRICTAS DE ESQUEMA JSON:
Debes responder ÚNICAMENTE con un objeto JSON válido (sin explicaciones adicionales, sin bloques de texto fuera del JSON).

ESTRUCTURA DEL FORMULARIO ("FormDefinition"):
{
  "name": "Título descriptivo del formulario",
  "description": "Breve resumen del objetivo",
  "form": {
    "header": [
      // Lista de campos de cabecera (metadatos, folio, fecha inicial, encuestador, etc.)
    ],
    "body": [
      // Lista de campos principales del formulario / encuesta
    ]
  }
}

TIPOS DE CAMPO DISPONIBLES (propiedad "type"):
1. "text": Campo de texto o respuesta abierta.
2. "number": Campo numérico. Puede incluir "dynamic": { "min": ["const", 0], "max": ["const", 100] }.
3. "select": Lista desplegable de selección única. Requiere array "options": [{ "label": "Opción visible", "value": "codigo_valor" }].
4. "radio": Botones de selección única. Requiere array "options": [{ "label": "Opción visible", "value": "codigo_valor" }].
5. "checkbox": Casillas de selección múltiple. Requiere array "options": [{ "label": "Opción visible", "value": "codigo_valor" }].
6. "truefalse": Selector booleano Sí / No.
7. "date": Selector de fecha (YYYY-MM-DD).
8. "datetime": Selector de fecha y hora.
9. "time": Selector de hora (HH:mm).
10. "camera": Captura de foto / evidencia visual de campo.
11. "map": Selector de coordenadas GPS / ubicación en mapa. Puede incluir "dynamic": { "centerLat": ["const", -33.4489], "centerLng": ["const", -70.6693], "zoom": ["const", 14] }.
12. "polygons": Selección de polígono geográfico o cuadrante.
13. "separator": Separador visual con título de sección. Propiedad "label": "Título de la subsección".
14. "label": Texto instructivo o nota explicativa para el encuestador.

FORMATO OBLIGATORIO DE CADA CAMPO:
{
  "id": "identificador_unico_snake_o_camel_case",
  "type": "text" | "number" | "select" | "radio" | "checkbox" | "truefalse" | "date" | "datetime" | "time" | "camera" | "map" | "polygons" | "separator" | "label",
  "label": "¿Pregunta o título visible para el usuario?",
  "placeholder": "Texto orientativo en el input",
  "saveData": true,
  "dynamic": {
    "required": ["const", true], // o ["const", false]
    "visible": ["const", true],
    "disabled": ["const", false]
  },
  "options": [ // OBLIGATORIO solo para select, radio y checkbox
    { "label": "Opción 1", "value": "opcion_1" },
    { "label": "Opción 2", "value": "opcion_2" }
  ]
}

REGLAS DE EDICIÓN Y CORRECCIÓN DE FORMULARIOS EXISTENTES:
- Si se proporciona un "Formulario base actual":
  1. Si el usuario pide agregar campos, añádelos en la sección adecuada ("header" o "body") sin borrar los campos existentes.
  2. Si el usuario pide modificar o corregir un campo existente (cambiar opciones, label, requerido, etc.), actualiza ese campo manteniendo su "id" original.
  3. Si el usuario pide eliminar un campo, remuévelo.
  4. Preserva el "name", "description" y la estructura de los campos no modificados.

REGLAS DE EXTRACCIÓN DESDE DOCUMENTOS / HOJAS EXCEL:
- Si se proporcionan tablas de Excel o documentos adjuntos:
  1. Analiza las columnas y filas para identificar nombres de variables, preguntas, tipos de respuesta y opciones.
  2. Si una columna o fila lista opciones de respuesta (ej: "Masculino, Femenino, Otro"), crea un campo "select" o "radio" con esas opciones estructuradas en el array "options".
  3. Si hay secciones temáticas en el Excel, crea campos de tipo "separator" para organizar el formulario de manera clara.
- Todos los textos, etiquetas y opciones deben estar en español claro y profesional.
`;

@Injectable()
export class AiFormGeneratorService {
  constructor(
    private readonly logger: PinoLogger,
    @Inject('ORGANIZATION_SERVICE')
    private readonly organizationClient: ClientProxy,
  ) {
    this.logger.setContext(AiFormGeneratorService.name);
  }

  async generateForm(organizationId: string, dto: GenerateAiFormDto) {
    this.logger.info(
      {
        organizationId,
        promptLength: dto.prompt.length,
        hasCurrentForm: Boolean(dto.currentForm),
        documentsCount: dto.documents?.length ?? 0,
        historyCount: dto.history?.length ?? 0,
      },
      'initiating AI form generation',
    );

    // 1. Obtener credenciales LLM de la organización
    const llmConfig = await this.getOrganizationLlmConfig(organizationId);

    if (!llmConfig || !llmConfig.hasConfig || !llmConfig.apiKey) {
      throw new BadRequestException(
        'No se ha configurado un proveedor de Inteligencia Artificial (API Key) para esta organización. Configúralo en los Ajustes de la Organización.',
      );
    }

    const { provider, apiKey, model, baseUrl, temperature } = llmConfig;

    // 2. Construir los mensajes para el LLM
    const promptSections: string[] = [];

    // Contexto de documentos adjuntos (Excel, CSV, texto)
    if (dto.documents && dto.documents.length > 0) {
      promptSections.push(
        '=== DOCUMENTOS Y ARCHIVOS DE REFERENCIA ADJUNTOS (EXCEL / TABLAS / TEXTO) ===',
      );
      for (const doc of dto.documents) {
        promptSections.push(
          `--- Documento: ${doc.name} (${doc.type || 'DOCUMENTO'}) ---\n${doc.content}`,
        );
      }
      promptSections.push('================================================================');
    }

    // Historial previo de conversación
    if (dto.history && dto.history.length > 0) {
      promptSections.push('=== HISTORIAL RECIENTE DE LA CONVERSACIÓN ===');
      for (const msg of dto.history) {
        promptSections.push(
          `[${msg.role === 'user' ? 'USUARIO' : 'ASISTENTE'}]: ${msg.content}`,
        );
      }
      promptSections.push('=============================================');
    }

    // Formulario base actual (si existe para edición/corrección)
    if (dto.currentForm) {
      promptSections.push(
        '=== FORMULARIO BASE ACTUAL (A MODIFICAR / EXTENDER / CORREGIR) ===',
      );
      promptSections.push(JSON.stringify(dto.currentForm, null, 2));
      promptSections.push('================================================================');
    }

    // Instrucción actual del usuario
    promptSections.push('=== INSTRUCCIÓN DEL USUARIO ===');
    promptSections.push(dto.prompt);

    const userPromptContent = promptSections.join('\n\n');

    let rawJsonResponse: string;

    switch (provider) {
      case 'gemini':
        rawJsonResponse = await this.callGemini({
          apiKey,
          model: model || 'gemini-3.6-flash',
          prompt: userPromptContent,
          temperature,
        });
        break;

      case 'anthropic':
        rawJsonResponse = await this.callAnthropic({
          apiKey,
          model: model || 'claude-3-5-sonnet-20241022',
          prompt: userPromptContent,
          temperature,
        });
        break;

      case 'openai':
      case 'openai_compatible':
      default:
        rawJsonResponse = await this.callOpenAi({
          apiKey,
          model: model || 'gpt-4o-mini',
          baseUrl: baseUrl || 'https://api.openai.com/v1',
          prompt: userPromptContent,
          temperature,
        });
        break;
    }

    // 3. Sanitizar y validar la estructura JSON
    const parsedForm = this.sanitizeAndValidateForm(rawJsonResponse);

    this.logger.info(
      {
        organizationId,
        formName: parsedForm.name,
        headerFieldsCount: parsedForm.form.header?.length ?? 0,
        bodyFieldsCount: parsedForm.form.body?.length ?? 0,
      },
      'AI form generated successfully',
    );

    return parsedForm;
  }

  private async getOrganizationLlmConfig(
    organizationId: string,
  ): Promise<LlmConfig | null> {
    try {
      const config = await firstValueFrom(
        this.organizationClient
          .send<LlmConfig>('get-organization-llm-config', { organizationId })
          .pipe(
            timeout(5000),
            catchError((err: Error) => {
              this.logger.error(
                { organizationId, error: err },
                'Error fetching LLM config from organization service',
              );
              throw err;
            }),
          ),
      );
      return config;
    } catch {
      return null;
    }
  }

  private async callOpenAi(params: {
    apiKey: string;
    model: string;
    baseUrl: string;
    prompt: string;
    temperature: number;
  }): Promise<string> {
    const url = `${params.baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const body = {
      model: params.model,
      temperature: params.temperature ?? 0.7,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: FORM_GENERATOR_SYSTEM_PROMPT },
        { role: 'user', content: params.prompt },
      ],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      this.logger.error(
        { status: res.status, errorText },
        'OpenAI API call failed',
      );

      let customMessage = `Error de OpenAI (${res.status})`;
      try {
        const errorJson = JSON.parse(errorText);
        const code = errorJson.error?.code;
        const msg = errorJson.error?.message;

        if (code === 'insufficient_quota' || res.status === 429) {
          customMessage =
            'Se ha agotado la cuota o créditos de tu cuenta de OpenAI (429: insufficient_quota). Por favor recarga saldo o revisa tu facturación en platform.openai.com.';
        } else if (code === 'invalid_api_key' || res.status === 401) {
          customMessage =
            'La clave API de OpenAI no es válida o ha expirado. Por favor actualiza la clave en la configuración de la organización.';
        } else if (msg) {
          customMessage = `Error de OpenAI: ${msg}`;
        }
      } catch {
        customMessage = `Error de OpenAI (${res.status}): ${errorText}`;
      }

      throw new BadRequestException(customMessage);
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? '{}';
  }

  private async callGemini(params: {
    apiKey: string;
    model: string;
    prompt: string;
    temperature: number;
  }): Promise<string> {
    const rawModel = params.model || 'gemini-3.6-flash';
    const cleanModel = rawModel.replace(/^models\//, '');

    // 1. Descubrir los modelos habilitados para la API Key vía ListModels
    let candidateModelPaths: string[] = [];

    try {
      const listModelsRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${params.apiKey}`,
      );

      if (listModelsRes.ok) {
        const listData = await listModelsRes.json();
        const availableModels: any[] = listData.models || [];
        const contentModels: string[] = availableModels
          .filter((m) =>
            Array.isArray(m.supportedGenerationMethods)
              ? m.supportedGenerationMethods.includes('generateContent')
              : true,
          )
          .map((m) => m.name);

        this.logger.info(
          {
            availableCount: contentModels.length,
            available: contentModels,
          },
          'Discovered available Gemini models for API key',
        );

        // Si el usuario pidió un modelo específico que está en la lista, ponerlo primero
        if (contentModels.includes(`models/${cleanModel}`)) {
          candidateModelPaths.push(`models/${cleanModel}`);
        }

        // Orden de preferencia para modelos modernos de alta velocidad y calidad
        const priorityPatterns = [
          '3.6-flash',
          '3.7-flash',
          '3.5-flash',
          'flash-latest',
          '3.1-flash',
          '3.1-pro',
          'pro-latest',
          'flash',
        ];

        for (const pattern of priorityPatterns) {
          for (const mName of contentModels) {
            if (mName.includes(pattern) && !candidateModelPaths.includes(mName)) {
              candidateModelPaths.push(mName);
            }
          }
        }

        // Agregar los restantes como fallback
        for (const mName of contentModels) {
          if (!candidateModelPaths.includes(mName)) {
            candidateModelPaths.push(mName);
          }
        }
      } else {
        const listErrText = await listModelsRes.text();
        this.logger.warn(
          { status: listModelsRes.status, listErrText },
          'ListModels call failed, continuing with direct model candidates',
        );
        if (listModelsRes.status === 400 || listModelsRes.status === 403) {
          throw new BadRequestException(
            `Error de autenticación con Google Gemini (${listModelsRes.status}): Clave API inválida o sin permisos. Detalle: ${listErrText}`,
          );
        }
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn(
        { err },
        'Could not list Gemini models, using default candidate list',
      );
    }

    // Si ListModels no funcionó o candidateModelPaths está vacío, usar lista por defecto
    if (candidateModelPaths.length === 0) {
      candidateModelPaths = [
        `models/${cleanModel}`,
        'models/gemini-3.6-flash',
        'models/gemini-3.7-flash',
        'models/gemini-3.5-flash',
        'models/gemini-flash-latest',
        'models/gemini-pro-latest',
      ];
    }

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `${FORM_GENERATOR_SYSTEM_PROMPT}\n\n---\n\n${params.prompt}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: params.temperature ?? 0.7,
        responseMimeType: 'application/json',
      },
    };

    let lastError: any = null;

    // 2. Probar candidatos hasta que uno responda exitosamente
    for (const targetModelPath of candidateModelPaths) {
      const finalUrl = `https://generativelanguage.googleapis.com/v1beta/${targetModelPath}:generateContent?key=${params.apiKey}`;

      try {
        const res = await fetch(finalUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          this.logger.info(
            { usedModel: targetModelPath },
            'Gemini generateContent succeeded',
          );
          const data = await res.json();
          const rawText =
            data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
          return rawText;
        }

        const errorText = await res.text();
        lastError = { status: res.status, errorText, targetModelPath };

        // Si es 404 (no disponible), 503 (alta demanda), 429 (límite temporal de modelo) o 500, probar el siguiente candidato
        if (
          res.status === 404 ||
          res.status === 503 ||
          res.status === 429 ||
          res.status === 500
        ) {
          this.logger.warn(
            { targetModelPath, status: res.status, errorSnippet: errorText.slice(0, 150) },
            'Model returned error (503/429/404), trying next available Gemini model',
          );
          continue;
        }

        // Si es otro error (ej: 400 bad request, 401/403 auth), lanzar error
        this.logger.error(
          { status: res.status, errorText, targetModelPath },
          'Gemini API call failed',
        );
        throw new BadRequestException(
          `Error del proveedor de IA (Gemini ${res.status}): ${errorText}`,
        );
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        lastError = err;
      }
    }

    this.logger.error({ lastError }, 'All Gemini candidate models failed');
    throw new BadRequestException(
      `Error del proveedor de IA (Gemini): Ninguno de los modelos disponibles respondió correctamente. Detalle: ${lastError?.errorText || lastError?.message || JSON.stringify(lastError)}`,
    );
  }

  private async callAnthropic(params: {
    apiKey: string;
    model: string;
    prompt: string;
    temperature: number;
  }): Promise<string> {
    const url = 'https://api.anthropic.com/v1/messages';

    const body = {
      model: params.model,
      max_tokens: 4096,
      temperature: params.temperature ?? 0.7,
      system: FORM_GENERATOR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: params.prompt }],
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': params.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text();
      this.logger.error(
        { status: res.status, errorText },
        'Anthropic API call failed',
      );

      let customMessage = `Error de Anthropic Claude (${res.status})`;
      try {
        const errorJson = JSON.parse(errorText);
        const msg = errorJson.error?.message;
        const type = errorJson.error?.type;

        if (res.status === 429 || type === 'rate_limit_error') {
          customMessage =
            'Se ha agotado la cuota o excedido el límite de velocidad en Anthropic Claude. Por favor revisa los créditos en tu consola de Anthropic.';
        } else if (res.status === 401 || type === 'authentication_error') {
          customMessage =
            'La clave API de Anthropic Claude no es válida. Por favor actualiza la clave en la configuración de la organización.';
        } else if (msg) {
          customMessage = `Error de Anthropic: ${msg}`;
        }
      } catch {
        customMessage = `Error de Anthropic Claude (${res.status}): ${errorText}`;
      }

      throw new BadRequestException(customMessage);
    }

    const data = await res.json();
    const rawText = data.content?.[0]?.text ?? '{}';
    return rawText;
  }

  private sanitizeAndValidateForm(rawJson: string) {
    try {
      let cleaned = rawJson.trim();
      if (cleaned.startsWith('```json')) {
        cleaned = cleaned.replace(/^```json/, '').replace(/```$/, '').trim();
      } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```/, '').replace(/```$/, '').trim();
      }

      const parsed = JSON.parse(cleaned);

      const normalizeField = (f: any, idx: number, prefix: string) => ({
        id: f.id || `${prefix}_field_${idx + 1}`,
        type: f.type || 'text',
        label: f.label || `Campo ${idx + 1}`,
        ...(f.placeholder ? { placeholder: f.placeholder } : {}),
        saveData: f.saveData !== false,
        dynamic: {
          required: Array.isArray(f.dynamic?.required)
            ? f.dynamic.required
            : ['const', Boolean(f.dynamic?.required || f.required)],
          visible: Array.isArray(f.dynamic?.visible)
            ? f.dynamic.visible
            : ['const', true],
          disabled: Array.isArray(f.dynamic?.disabled)
            ? f.dynamic.disabled
            : ['const', false],
          ...(f.dynamic?.min ? { min: f.dynamic.min } : {}),
          ...(f.dynamic?.max ? { max: f.dynamic.max } : {}),
          ...(f.dynamic?.centerLat ? { centerLat: f.dynamic.centerLat } : {}),
          ...(f.dynamic?.centerLng ? { centerLng: f.dynamic.centerLng } : {}),
          ...(f.dynamic?.zoom ? { zoom: f.dynamic.zoom } : {}),
        },
        ...(Array.isArray(f.options)
          ? {
              options: f.options.map((opt: any, optIdx: number) => ({
                label:
                  typeof opt === 'string'
                    ? opt
                    : opt.label || `Opción ${optIdx + 1}`,
                value:
                  typeof opt === 'string'
                    ? opt.toLowerCase().replace(/\s+/g, '_')
                    : opt.value || `opt_${optIdx + 1}`,
              })),
            }
          : {}),
      });

      // Asegurar que header y body sean arrays de FormField
      let rawHeader = parsed.form?.header;
      let rawBody = parsed.form?.body;

      // Si el LLM devolvió array de secciones con .fields, aplanamos
      if (Array.isArray(rawHeader) && rawHeader.length > 0 && rawHeader[0]?.fields) {
        rawHeader = rawHeader.flatMap((s: any) => s.fields || []);
      }
      if (Array.isArray(rawBody) && rawBody.length > 0 && rawBody[0]?.fields) {
        rawBody = rawBody.flatMap((s: any) => s.fields || []);
      }

      const headerFields = Array.isArray(rawHeader)
        ? rawHeader.map((f: any, idx: number) => normalizeField(f, idx, 'h'))
        : [];

      const bodyFields = Array.isArray(rawBody)
        ? rawBody.map((f: any, idx: number) => normalizeField(f, idx, 'b'))
        : [];

      // Si body quedó vacío, creamos al menos un campo
      if (bodyFields.length === 0 && headerFields.length === 0) {
        bodyFields.push({
          id: 'observaciones',
          type: 'text',
          label: 'Observaciones generales',
          placeholder: 'Escriba observaciones...',
          saveData: true,
          dynamic: {
            required: ['const', false],
            visible: ['const', true],
            disabled: ['const', false],
          },
        });
      }

      return {
        name:
          typeof parsed.name === 'string'
            ? parsed.name
            : 'Formulario Generado con IA',
        description:
          typeof parsed.description === 'string' ? parsed.description : '',
        form: {
          header: headerFields,
          body: bodyFields,
        },
      };
    } catch (err: any) {
      this.logger.error({ err, rawJson }, 'Failed to parse AI generated JSON');
      throw new InternalServerErrorException(
        'El modelo de IA no devolvió un formato JSON válido para el formulario. Intenta nuevamente con un prompt más descriptivo.',
      );
    }
  }
}
