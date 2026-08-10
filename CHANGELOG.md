# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [0.3.0] - 2026-08-10

### Agregado

- **FASE 3 — Módulo de torneos** (diseño aprobado en `docs/fase-3-diseno-torneos.md`).
- Schema: `Torneo` con `estado` (`BORRADOR/INSCRIPCIONES/ACTIVO/FINALIZADO/ARCHIVADO`, reemplaza `activo`), `logoUrl`, `reglas`, `configuracionPublica`; `organizacionId` obligatorio. Enums `FormatoCompetencia` (8 formatos) y `EstadoJornada`.
- `ConfiguracionCompetencia` (1:1 con `TorneoCategoria`): formato, config de formato, sistema de puntos y desempates en JSON tipado, validado con esquemas en `@controlliga/shared` (default 3/1/0 y `[PUNTOS, DIFERENCIA_GOLES, GOLES_FAVOR]`).
- `EquipoParticipacion`: estados `PENDIENTE`/`RECHAZADO` + `fechaBaja` + `invitadoPorId`. Se eliminó la unicidad estricta; regla de integridad documentada (una participación activa por equipo/torneo/temporada) implementada transaccionalmente en backend, permitiendo reinscripción tras baja sin perder historial.
- `JugadorParticipacion` (plantilla de jugador por competición con historial), `Jornada` y `JornadaEquipoDescanso` (preparan el fixture futuro); `Partido.jornadaId` opcional; `Zona` sin `torneoId` redundante.
- Migración `fase3_torneos` aplicada y cliente Prisma regenerado.
- Backend: CRUD y flujos de torneos (crear/consultar/modificar/estado), temporadas (crear/publicar/finalizar/cancelar), categorías (asociar + configuración), zonas (crear/modificar/asignar equipos), participaciones (invitar/solicitar/aceptar/rechazar/baja/asignar categoría y zona) y jugadores en competición (agregar/dorsal/baja/historial).
- Máquina de estados para torneo y temporada con transiciones validadas y auditadas.
- Permisos nuevos en shared: `torneos:ver`, `equipos:inscribir`, `partidos:cargarResultados`, `sanciones:gestionar`, `estadisticas:ver`. Alcance: ADMIN solo su organización; DELEGADO_TECNICO limitado a sus equipos.
- Frontend: panel de torneos (`/torneos` y `/torneos/:id`) con secciones resumen, configuración, temporadas, categorías, zonas, equipos, jugadores y configuración pública; enlace desde dashboard.
- Tests: 40 tests de backend del módulo de torneos (torneo, temporada, categorías/configuración, zonas, participaciones, jugadores, seguridad y unicidad). Total API: 71.

## [0.2.0] - 2026-08-10

### Agregado

- **FASE 2 — Autenticación, usuarios y permisos.**
- Estrategia: sesiones con token opaco (32 bytes) en cookie `httpOnly` + tabla `Session` en BD; token guardado solo como hash SHA-256; `SameSite=Lax`, `Secure` en producción, CORS restringido con credentials.
- Contraseñas con `scrypt` (node:crypto, salt por usuario, `timingSafeEqual`); nunca en texto plano ni en respuestas.
- Endpoints: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/refresh` (rotación de token), `POST /auth/me/vincular-jugador`.
- Hooks de Fastify: `autenticar`, `requiereRol`, `requierePermiso`, `requiereAccesoEquipo`.
- Permisos por recurso/alcance: SUPERADMIN global; ADMINISTRADOR por organización/torneo; DELEGADO_TECNICO solo equipos con `EquipoUsuario` activo (DELEGADO/TECNICO/AUXILIAR); JUGADOR solo su perfil vía `Usuario.jugadorId`. Usuarios multi-rol.
- Endpoints protegidos de referencia: `GET/PATCH /usuarios/:id`, `POST /usuarios/:id/roles`, `GET /equipos/:id`, `GET/PATCH /jugadores/:id`, `GET /organizaciones/:id`.
- Auditoría con `AuditoriaLog`: login, logout, registro, cambios de roles, cambios de cuenta, vinculación de jugador.
- Catálogo de roles y permisos en `@controlliga/shared` (`ROL_PERMISOS`) compartido entre backend y frontend.
- Frontend: React Router, `AuthProvider` + guards, cliente API con cookies y auto-refresh ante 401; páginas `/login`, `/register`, `/dashboard` (secciones según rol) y `/profile` (vinculación de jugador).
- Migración `fase2_autenticacion`: modelo `Session` y rename de enum `ORGANIZADOR` → `ADMINISTRADOR` (lista de roles del spec; BD vacía).
- Base de test dedicada (`controlliga_test`) con `globalSetup` que aplica migraciones; 31 tests de backend (13 auth + 17 permisos + 1 health) y 2 de frontend.

## [0.1.0] - 2026-08-10

### Agregado

- Monorepo pnpm con workspaces (`apps/*`, `packages/*`).
- Frontend React 19 + Vite 8 + TypeScript (`apps/web`).
- Backend Fastify 5 + TypeScript con `tsx watch` (`apps/api`).
- Package compartido `@controlliga/shared` (tipos genéricos y utilidades).
- PostgreSQL 16 en Docker Compose (`docker/`).
- Prisma 7 configurado: `prisma.config.ts`, generator `prisma-client`, driver adapter `@prisma/adapter-pg`.
- Modelo de datos completo en `schema.prisma`: 23 modelos + 16 enums (usuarios, roles, equipos, jugadores, torneos, temporadas, categorías, zonas, partidos, sanciones, formaciones, convocatorias, caja del equipo y auditoría).
- Migración inicial `init` aplicada a PostgreSQL (Docker) y cliente Prisma generado.
- Scripts `prisma:migrate` en `@controlliga/api` y raíz.
- ESLint (flat config) + Prettier + Vitest + TypeScript estricto.
- Scripts raíz de dev/build/test/lint/typecheck y de base de datos.
- Variables de entorno separadas por app con plantillas `.env.example`.
- README, docs de arquitectura y AGENTS.md con reglas de trabajo.
