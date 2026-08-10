# Arquitectura

## Vista general

```
apps/web ──HTTP──> apps/api ──Prisma──> PostgreSQL (Docker)
    │                    │
    └────── imports @controlliga/shared
```

- **apps/web**: React + Vite. Se conecta al API vía proxy de Vite (`/api` → `http://localhost:3000`). URL configurable con `VITE_API_URL`.
- **apps/api**: Fastify. Rutas con prefijo `/api`. La conexión a base de datos se hace con Prisma 7 + driver adapter `@prisma/adapter-pg`.
- **packages/shared**: código que comparte web y api. Se compila a `dist/` con `tsc`; el resto del monorepo lo importa por nombre (`@controlliga/shared`).

## Decisiones técnicas

- **pnpm workspaces**: un solo `pnpm-lock.yaml`, instalación rápida y dependencias aisladas.
- **Prisma 7**: cambió respecto a Prisma 6 — la URL vive en `prisma.config.ts`, el cliente se genera en una carpeta propia y la conexión requiere driver adapter.
- **tsx** para desarrollo del backend: ejecuta TypeScript sin build previo (watch + reload).
- **ESLint flat config**: config única en la raíz, con reglas de React solo para `apps/web`.
- **TypeScript 5.9**: se evitó la 7.x por compatibilidad con el ecosistema de linting.

## Convenciones

- Nuevas rutas del API: archivos en `apps/api/src/routes/`, registradas en `apps/api/src/app.ts`.
- Tipos de contratos entre web y api: definirlos en `@controlliga/shared`.
- Tests junto al código: `*.test.ts`, ejecutados con Vitest.
