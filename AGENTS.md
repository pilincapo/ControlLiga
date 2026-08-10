# CONTROL LIGA — Reglas de trabajo

## Persistentes

- **Changelog obligatorio**: toda modificación relevante (feature, fix, refactor, diseño) se documenta en `CHANGELOG.md` ANTES o en el MISMO commit. Nunca commitear código sin su entrada de changelog.

## Convenciones

- **Gestor de paquetes**: pnpm (nunca mezclar con npm/yarn). Workspace: `apps/*`, `packages/*`.
- **TypeScript estricto** en todo el repo. No relajar config sin justificación.
- **Antes de commitear**: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- **Compartido**: tipos y utilidades genéricas van en `@controlliga/shared`, nunca duplicar.
- **Secretos**: jamás commitear `.env`. Copiar `.env.example` a `.env` local.
- **Postgres local**: siempre por Docker (`pnpm db:up`), no instalar en Windows.
- **Prisma**: generar cliente con `pnpm prisma:generate` después de cambiar `schema.prisma`. El cliente generado no se commitea.
- **Idioma de código**: identificadores y mensajes en español, estilo Prettier (sin punto y coma, comillas simples).
