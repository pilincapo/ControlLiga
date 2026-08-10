# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

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
