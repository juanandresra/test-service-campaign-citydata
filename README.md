# Service Campaign (`service-campaign`)

**Microservicio de Campañas de Recolección y Versionado de Formularios JSON Schema**

Responsable de administrar el ciclo de vida de las campañas de levantamiento de datos en terreno y web, así como del almacenamiento, validación y versionado inmutable de los esquemas de formulario.

---

## 🚀 Ficha Técnica

| Parámetro | Detalle |
| :--- | :--- |
| **Framework** | NestJS 11 + TypeScript |
| **ORM / Persistencia** | Prisma ORM + PostgreSQL (`JSONB`) |
| **Puerto por Defecto** | `4003` |
| **Caché / Broker** | Valkey (Redis-compatible) en puerto `6379` |
| **Documentación Técnica** | [`docs/architecture.md`](./docs/architecture.md) y [`docs/database.md`](./docs/database.md) |

---

## 🏗️ Construcción Docker / Dokploy (Build Time)

> [!IMPORTANT]
> **Variable en tiempo de construcción (Build Argument):**
> Al compilar la imagen Docker en Dokploy o mediante `docker build`, es **obligatorio** pasar `DATABASE_URL` como **Build Argument** (`ARG DATABASE_URL`). Esto permite que Prisma genere el cliente tipado (`prisma:generate`) durante la fase de compilación del contenedor:
>
> * **Build Argument en Dokploy / Docker**:
>   ```env
>   DATABASE_URL=postgresql://postgres:your_postgres_password@citydata-postgres-b1mysl:5432/service_campaign
>   ```

---

## 🛠️ Variables de Entorno (`.env`)

```env
NODE_ENV=production
APP_NAME=service-campaign
PORT=4003

LOKI_URL=http://citydata-loki:3100
VALKEY_URL=redis://:your_valkey_password@valkey:6379/0
CACHE_TTL=10000

DATABASE_URL=postgresql://postgres:your_postgres_password@citydata-postgres-b1mysl:5432/service_campaign
```

---

## 💻 Comandos de Ejecución

```bash
# 1. Instalar dependencias
yarn install

# 2. Aplicar migraciones en base de datos (Producción)
yarn prisma:deploy:cam

# 3. Iniciar en desarrollo
yarn start:dev

# 4. Compilar e iniciar en producción
yarn build
yarn start:prod
```

---

## 🌐 Endpoints Principales

| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/campaign/:researchId` | Lista campañas de un estudio |
| `POST` | `/campaign/:researchId` | Crea una nueva campaña |
| `GET` | `/campaign/:researchId/:id` | Detalle de la campaña con formulario activo |
| `PATCH` | `/campaign/:researchId/:id` | Actualiza metadata, estado o flags (`trackable`) |
| `POST` | `/campaign/:researchId/:id/form` | Guarda o publica una versión de formulario |
| `GET` | `/campaign/:researchId/:id/form-versions` | Historial de versiones del formulario |
