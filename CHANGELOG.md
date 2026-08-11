# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [0.8.0] - 2026-08-11

### Agregado

- **FASE 8 — Fixture y tabla** (diseño aprobado en `docs/fase-8-diseno.md`).
- Fixture round-robin `TODOS_CONTRA_TODOS`, `UNA_RUEDA` y `DOS_RUEDAS`, con jornadas, descansos, localías balanceadas y regeneración explícita segura.
- Tabla calculada desde partidos oficiales finalizados, puntos configurables, desempate H2H múltiple y metadata de criterios no disponibles.
- Endpoints protegidos de fixture, jornadas y tabla, endpoints públicos filtrados por configuración y `Partido.publicada`.
- Auditoría de generación, validación, regeneración, rechazo de regeneración y edición de jornadas.
- Frontend básico para consultar/generar fixture y tabla desde detalle de torneo.
- No se agregan modelos ni migraciones Prisma.
- Tests HTTP/integración de permisos, confirmación, regeneración segura, auditoría y publicación pública del fixture.

## [0.7.0] - 2026-08-10

### Agregado

- **FASE 7 — Partidos** (diseño aprobado en `docs/fase-7-diseno-partidos.md`).
- Schema: `Partido.publicada` (visibilidad manual) y `Partido.arbitro` (texto libre, sin modelo de árbitros).
- Backend: CRUD de partidos (crear OFICIAL con validación de torneo/temporada/participaciones, AMISTOSO independiente), máquina de estados (`PROGRAMADO → EN_CURSO/SUSPENDIDO/APLAZADO → ... → FINALIZADO`), carga de resultado (goles ≥ 0; desde EN_CURSO transiciona a FINALIZADO automáticamente), modificación solo en PROGRAMADO/APLAZADO, publicar/despublicar, listados por equipo y por usuario, endpoint público solo publicados.
- Validaciones: equipos distintos, OFICIAL requiere torneoId+temporadaId y `EquipoParticipacion` CONFIRMADO, `torneoCategoria/zona/jornada` deben pertenecer a la temporada, transiciones auditadas.
- Permisos: DELEGADO/TECNICO gestionan partidos donde su equipo es responsable; ADMIN del torneo gestiona OFICIALES; JUGADOR/AUXILIAR ven; PÚBLICO solo publicados.
- No DELETE físico: cancelación = `SUSPENDIDO`. Sin fixture automático ni tabla de posiciones (FASE 8).
- Respeto de FASE 5: `FormacionInstancia` no se modifica al cerrar el partido; se lista en el detalle.
- Respeto de FASE 6: `Convocatoria` asociada se lista en el detalle del partido; no se altera.
- Frontend: `/partidos` (listar + crear) y `/partidos/:id` (detalle, resultado, estado, formaciones, convocatorias).
- Tests: 17 tests de partidos (crear, OFICIAL/independiente, validaciones, máquina de estados, resultado, permisos, público, auditoría). Total API: 152.
- Migración `fase7_partidos` aplicada y cliente Prisma regenerado.

## [0.6.0] - 2026-08-10

### Agregado

- **FASE 6 — Convocatorias** (diseño aprobado en `docs/fase-6-diseno-convocatorias.md`).
- Schema: `Convocatoria.fechaLimite`, `publicada`, `cancelada` (soft delete); `ConvocatoriaJugador.orden`.
- Backend: CRUD de convocatorias (crear con jugadores, editar reemplazando plantel, cancelar como soft delete), respuesta del jugador (`CONFIRMADO/NO_DISPONIBLE` con verificación de identidad), DELEGADO/TECNICO cambian estado de cualquier convocado, publicar/despublicar, listado por equipo, endpoint público solo publicadas y no canceladas.
- Validaciones: BAJA/INVITADO bloqueados al convocar; INACTIVO/LESIONADO/SUSPENDIDO permitidos sin tocar `EquipoJugador`; jugador solo responde su propia convocatoria; cancelada no editable ni respuestas.
- Permisos por rol (DELEGADO/TECNICO gestionan y cancelan, AUXILIAR consulta, JUGADOR consulta y responde la propia, PÚBLICO solo publicadas). Enforcement con `puedeEnEquipo`/`requiereRolEnEquipo`.
- Auditoría: creación/modificación/cancelación de `Convocatoria`, respuesta de jugador (UPDATE `ConvocatoriaJugador`).
- Frontend: `/convocatorias` (listar por equipo + crear con selección de jugadores del plantel) y `/convocatorias/:id` (ver, responder como jugador, cambiar estado, cancelar, publicar).
- Tests: 17 tests de convocatorias. Total API: 135.
- Migración `fase6_convocatorias` aplicada y cliente Prisma regenerado.

## [0.5.0] - 2026-08-10

### Agregado

- **FASE 5 — Formaciones** (diseño aprobado en `docs/fase-5-diseno-formaciones.md`).
- Schema: `Formacion.publicada` y `@@index([partidoId])`; `FormacionJugador.x/y` (coordenadas normalizadas 0..100); nuevos `PlantillaFormacion` + `PlantillaFormacionPosicion` (catálogo de sistemas con posiciones iniciales) y `FormacionInstancia` + `FormacionInstanciaJugador` (snapshot histórico al usar una formación en un partido, con `nombreSnapshot`/`dorsalSnapshot`).
- Seed `seed:plantillas` con 14 sistemas (F5/F7/F8/F9/F11) y coordenadas normalizadas; sembrado también en la BD de test.
- Backend: CRUD de formaciones (crear con o sin partido, con o sin plantilla, leer, editar reemplazando plantel, eliminar solo DELEGADO), clonar, asociar a partido (crea instancia snapshot inmutable), publicar/despublicar, catálogo de plantillas, endpoint público mínimo solo para publicadas.
- Validaciones: pertenencia al equipo, no duplicar jugador, coordenadas 0..100, jugadores BAJA/INVITADO bloqueados, INACTIVO/LESIONADO/SUSPENDIDO permitidos sin tocar `EquipoJugador`; partido asociado debe involucrar al equipo; una instancia por plantilla+partido.
- Permisos por rol de equipo (DELEGADO gestiona/elimina, TECNICO gestiona, AUXILIAR consulta, JUGADOR ve los de su equipo, PÚBLICO solo publicadas); nuevo permiso `formaciones:ver` en shared.
- Auditoría: creación, modificación, eliminación, clonación, asociación a partido, publicación/despublicación.
- Frontend: `/formaciones` (listar + crear con plantilla y armado de plantel) y `/formaciones/:id` (ver, editar, clonar, publicar/despublicar, eliminar, historial de uso). Sin editor gráfico.
- Tests: 21 tests de formaciones (catálogo, CRUD, plantilla, validaciones, clonado, snapshot inmutable, partido ajeno, permisos por rol, privacidad, público, auditoría). Total API: 118.
- Migración `fase5_formaciones` aplicada y cliente Prisma regenerado.

## [0.4.0] - 2026-08-10

### Agregado

- **FASE 4 — Equipos, planteles y jugadores** (diseño aprobado en `docs/fase-4-diseno-equipos.md`).
- Schema: `EstadoEquipo` (`ACTIVO/INACTIVO/ARCHIVADO`) y `EstadoEquipoJugador` (`ACTIVO/INACTIVO/LESIONADO/SUSPENDIDO/INVITADO/BAJA`) que reemplaza `EquipoJugador.activo`; campos nuevos en `Equipo` (`estado`, `categoriaHabitual`, `telefono`, `email`, `configuracionPublica`) y `EquipoUsuario` (`invitadoPorId`, `fechaBaja`); `EquipoJugador.observaciones`.
- Todas las referencias a `EquipoJugador.activo` reemplazadas en backend (permisos, torneos, `JugadorParticipacion`, endpoints); sin filtros antiguos.
- Backend equipos: crear (el creador queda DELEGADO), consultar (dashboard), listar, editar (datos, contacto, estado, privacidad, config pública), administradores (agregar/cambiar rol/dar de baja con historial; protección del último DELEGADO).
- Backend jugadores: crear (con/sin DNI, sin duplicar Persona), búsqueda por DNI, ficha completa (historial de equipos y competiciones, estado de vínculo), editar (por rol).
- Backend plantel: incorporar jugador nuevo o existente, dorsal/posiciones/observaciones por equipo, cambio de estado, baja sin borrado físico, historial conservado en cambios de equipo.
- Permisos: hooks `requiereRolEnEquipo` y helper `puedeEnEquipo` (DELEGADO/TECNICO/AUXILIAR); corrección de seguridad en hooks (el `equipoId` se resuelve del param correcto y no se acepta ausente). El DELEGADO solo administra sus equipos.
- Vinculación segura: registro acepta `dni` opcional; vincular exige coincidencia de DNI o email (`Persona`). Imposible apropiarse de otro jugador sin identidad verificada.
- Shared: `POSICIONES_BASE` (`ARQUERO/DEFENSOR/MEDIOCAMPISTA/DELANTERO`), estados de equipo/jugador y `ConfiguracionPublicaEquipo` con validación.
- Frontend: `/equipos` (listar + crear), `/equipos/:id` (dashboard con plantel, jugadores, administradores y configuración; Formaciones/Convocatorias/Partidos/Caja deshabilitados), `/jugadores/:id` (ficha).
- Tests: 26 tests nuevos de FASE 4 (equipos, roles por equipo, jugadores, plantel, historial, privacidad, vinculación segura, auditoría) + ajuste de auth por identidad. Total API: 97.
- Migración `fase4_equipos` aplicada y cliente Prisma regenerado.

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
