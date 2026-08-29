# Base de Datos y Modelo Físico — service-campaign

## 1. Diagrama Entidad-Relación (ERD)

```mermaid
erDiagram
    CAMPAIGN ||--o{ CAMPAIGN_FORM_VERSION : "versiona"

    CAMPAIGN {
        uuid id PK
        uuid organization_id "Indexado"
        uuid research_id "Indexado"
        varchar name "150 chars"
        text description
        enum type "WEB  /  MOBILE  /  FIELD  /  PHONE"
        enum status "DRAFT  /  ACTIVE  /  PAUSED  /  COMPLETED  /  ARCHIVED"
        datetime starts_at
        datetime ends_at
        jsonb configuration "Opciones operacionales ej: trackable"
        varchar current_form_version "Versión activa"
        uuid created_by
        varchar[] user_emails "Lista de correos autorizados"
        datetime deleted_at
        datetime created_at
        datetime updated_at
    }

    CAMPAIGN_FORM_VERSION {
        uuid id PK
        uuid campaign_id FK
        varchar version "ej: 1.0.0"
        enum status "DRAFT  /  PUBLISHED  /  ARCHIVED"
        jsonb schema "Estructura JSON con Header y Body"
        datetime published_at
        uuid published_by
        uuid created_by
        datetime deleted_at
        datetime created_at
        datetime updated_at
    }
```

---

## 2. Estructura del JSON Schema del Formulario

```json
{
  "form": {
    "header": [
      {
        "id": "codigo_estacion",
        "type": "text",
        "label": "Código de Estación",
        "dynamic": { "required": true }
      }
    ],
    "body": [
      {
        "id": "tipo_vehiculo",
        "type": "select",
        "label": "Tipo de Vehículo",
        "options": [
          { "value": "auto", "label": "Automóvil" },
          { "value": "bus", "label": "Autobús" }
        ]
      },
      {
        "id": "foto_aforo",
        "type": "camera",
        "label": "Fotografía"
      }
    ]
  }
}
```
