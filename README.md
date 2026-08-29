# Service Campaign (`service-campaign`)

**Microservicio de Campañas de Recolección y Versionado de Formularios JSON Schema**

Responsable de administrar el ciclo de vida de las campañas de levantamiento de datos en terreno y web, así como del almacenamiento, validación y versionado inmutable de los esquemas de formulario.

---

## 🚀 Ficha Técnica

| Parámetro | Detalle |
| :--- | :--- |
| **Framework** | NestJS 11 + TypeScript |
| **ORM / Persistencia** | Prisma ORM + PostgreSQL (`JSONB`) |
| **Puerto por Defecto** | `4005` |
| **Documentación Técnica** | [`docs/architecture.md`](./docs/architecture.md) y [`docs/database.md`](./docs/database.md) |

---

## 🛠️ Variables de Entorno (`.env`)

```env
NODE_ENV=development
APP_NAME=service-campaign
PORT=4005
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/campaign_db?schema=public"
LOKI_URL="http://host.docker.internal:3100"
```

---

## 💻 Comandos de Ejecución

```bash
# Instalar dependencias
yarn install

# Sincronizar esquema Prisma
npx prisma db push --schema ./prisma/campaign/schema.prisma

# Iniciar en desarrollo
yarn start:dev
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
