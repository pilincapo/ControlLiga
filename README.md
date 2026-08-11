# CONTROL LIGA

Sistema de gestión de ligas de fútbol: torneos, equipos, jugadores, partidos, fixture, estadísticas y pagos.

> **Estado actual**: aplicación funcional hasta FASE 14, con hardening multi-tenant y preparación para beta controlada. Ver `docs/beta-readiness.md` antes de desplegar.

## Stack

| Capa          | Tecnología                       |
| ------------- | -------------------------------- |
| Frontend      | React 19 + Vite 8 + TypeScript   |
| Backend       | Node.js + Fastify 5 + TypeScript |
| Base de datos | PostgreSQL 16 (Docker)           |
| ORM           | Prisma 7                         |
| Paquetes      | pnpm workspaces (monorepo)       |
| Calidad       | ESLint 10 + Prettier 3 + Vitest  |

## Estructura

```
controlliga/
├── apps/
│   ├── web/          # Frontend React + Vite
│   └── api/          # Backend Fastify + Prisma
├── packages/
│   └── shared/       # Tipos y utilidades compartidas
├── docker/           # PostgreSQL (Docker Compose)
├── docs/             # Documentación
├── package.json      # Scripts raíz
└── pnpm-workspace.yaml
```

## Requisitos

- Node.js >= 22
- pnpm >= 10
- Docker Desktop (con daemon corriendo)

## Primer uso

```bash
pnpm install                 # instala dependencias
pnpm db:up                   # levanta PostgreSQL
pnpm prisma:generate         # genera el cliente Prisma
pnpm dev                     # levanta web + api juntos
```

## Scripts principales

| Comando              | Qué hace                                                  |
| -------------------- | --------------------------------------------------------- |
| `pnpm dev`           | Build de `shared` + web (puerto 5173) + api (puerto 3000) |
| `pnpm dev:web`       | Solo frontend                                             |
| `pnpm dev:api`       | Solo backend                                              |
| `pnpm build`         | Compila todos los paquetes                                |
| `pnpm typecheck`     | Verifica tipos TypeScript                                 |
| `pnpm test`          | Ejecuta tests (Vitest)                                    |
| `pnpm lint`          | Ejecuta ESLint                                            |
| `pnpm format`        | Aplica Prettier                                           |
| `pnpm db:up`         | Levanta PostgreSQL en Docker                              |
| `pnpm db:down`       | Detiene PostgreSQL                                        |
| `pnpm db:logs`       | Muestra logs de PostgreSQL                                |
| `pnpm db:reset`      | Elimina datos y el contenedor                             |
| `pnpm prisma:studio` | Abre Prisma Studio (navegador)                            |

## Variables de entorno

Cada app usa su propio `.env` (no se commitea). Los archivos `.env.example` son las plantillas:

- `docker/.env` → credenciales de PostgreSQL
- `apps/api/.env` → `DATABASE_URL`, puerto del API
- `apps/web/.env` → URL del API para el frontend

Pasos: copiar `.env.example` a `.env` en cada carpeta y ajustar valores locales.

## Verificar que todo funciona

1. `pnpm db:up` → luego `docker ps` (contenedor `controlliga-postgres` arriba).
2. `pnpm dev` → abrir http://localhost:5173 (debe mostrar "API OK").
3. Health del backend: http://localhost:3000/api/health
4. Portal público: http://localhost:5173/publico/torneos
5. Check de base de datos: http://localhost:3000/api/health/db (responde `{"data":{"database":"connected"}}` si Prisma conecta).

## Beta y producción

- Producción exige HTTPS, `COOKIE_SECURE=true`, `CORS_ORIGIN` HTTPS exacto y `PASSWORD_RESET_URL_BASE` HTTPS.
- Configurar `TRUST_PROXY` solo con IP/CIDR del proxy confiable o cantidad conocida de hops. Nunca usar confianza global.
- `GET /api/health/db` requiere header `x-health-token` con `HEALTH_DB_TOKEN` en producción.
- Rate limiting actual vive en memoria y sirve para una instancia beta. Migrar a almacenamiento compartido antes de escalar horizontalmente.
- Email de recuperación usa adapter de desarrollo. Configurar y probar proveedor real antes de beta externa.
- Backup/restore, checklist y bloqueantes: `docs/beta-readiness.md`.

## Notas de versión

- Se usa **TypeScript 5.9** (no 7) por compatibilidad total con ESLint y tooling del ecosistema.
- **Prisma 7**: cliente generado en `apps/api/src/generated/prisma`, se conecta vía driver adapter `@prisma/adapter-pg`.
