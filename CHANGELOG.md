# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Unreleased]

### Agregado

- Cobertura HTTP/integración FASE 16B para clasificación de grupos y LIGA, snapshots, idempotencia, invalidación, mejores terceros, RBAC y privacidad pública.
- FASE 16B backend: reglas de clasificación, clasificados y participantes por fase, transición trazable con seeds y FK restrictivas para llaves.
- FASE 16B: clasificación transaccional ahora materializa participantes y genera eliminación destino con slots de participante-fase; tablas y partidos quedan limitados a fase origen, incluyendo LIGA.
- FASE 16A backend: fases de grupos y eliminación directa con seeds manuales, BYE, llaves estructurales, avance seguro, tablas con snapshots y regeneración bloqueada ante actividad.
- FASE 16A web: administración privada de fases de grupos y eliminación directa desde participaciones confirmadas, con confirmación de generación/regeneración y visualización de grupos, rondas y llaves.
- FASE 16B web: reglas de clasificación entre fases seleccionadas, vista previa, confirmación/invalidez protegida, trazabilidad visible de participantes/origen/seeds y portal público legible.
- Portal público FASE 16A para fases, grupos, rondas y llaves, sujeto a `mostrarFixture` y sin exponer equipos privados.

### Documentación

- Diseño propuesto de FASE 16 para competencia avanzada, con recomendación de dividir grupos/eliminación, clasificación y series ida/vuelta en entregas compatibles con historial.
- Diseño de FASE 16B para clasificación automática, transiciones entre fases, snapshots, trazabilidad y bloqueo histórico.

## [0.15.0] - 2026-08-11

### Cambiado

- FASE 15 UX beta: primitives reutilizables de estados, toast, confirmación accesible, badges y tablas responsive; navegación privada filtrada por permisos y adaptada a móvil.
- Fixture y tabla incorporan estados legibles, carga/error explícitos y generación o regeneración confirmada para administradores, sin modificar contratos backend.
- Portal público reemplaza JSON crudo por presentación legible; categorías reemplazan prompts de configuración por formulario visible y validable.
- Tests monorepo se ejecutan con un workspace a la vez para evitar contención entre Prisma/API y jsdom/web que agotaba el timeout de un test asíncrono existente.
- Eventos de partido incorporan alta, corrección y anulación confirmada para goles, asistencias, tarjetas y sustituciones; formularios de zonas y jugadores en competición reemplazan prompts nativos.
- Flujos beta web eliminan diálogos nativos: bajas, cambios de rol y eliminación de formación usan formularios o ConfirmDialog reutilizable.
- Cobertura UX agrega navegación filtrada por permisos y generación de fixture con confirmación, cancelación y permiso de administración.

## [0.14.0] - 2026-08-11

### Seguridad

- **FASE 14 - Hardening multi-tenant y preparación para beta**, diseñada en `docs/fase-14-diseno-hardening-beta.md`.
- Política centralizada para asignación de roles: impide auto-escalamiento, scopes inválidos y cambios administrativos fuera de organización; audita cambios.
- Sesiones de usuarios desactivados quedan invalidadas; desactivación o cambio administrativo de contraseña revoca sesiones y tokens de reset pendientes.
- Rate limit de login por IP e identidad hasheada; limitador de memoria acotado para beta de una instancia.
- Estadísticas, sanciones y caja validan ámbito de equipo/torneo; historial de caja de jugador filtra equipos autorizados.
- Endpoints públicos bloquean partidos, formaciones, convocatorias, fixture, tabla y estadísticas vinculados a equipos privados.
- Invitación de cuerpo técnico responde de forma uniforme para evitar enumeración de cuentas.

### Operación

- Producción valida environment crítico, HTTPS, cookies seguras, CORS exacto, URL de reset y token de health DB; `TRUST_PROXY` es explícito.
- Scripts `scripts/backup-postgres.ps1` y `scripts/restore-postgres.ps1`; checklist en `docs/beta-readiness.md`.

### Tests

- Suite FASE 14 para sesión desactivada, rate limit login y accesos IDOR de estadísticas/caja; regresiones públicas y RBAC ampliadas.

## [0.13.0] - 2026-08-11

### Agregado

- **FASE 13 — Invitaciones y notificaciones**, diseñada en `docs/fase-13-diseno-invitaciones-notificaciones.md`.
- Migración `fase13_invitaciones_notificaciones`: modelos `Invitacion` y `Notificacion`, enums `EstadoInvitacion`, `TipoInvitacion` y `TipoNotificacion`, y columna `equipo_jugador.invitacionId`.
- Invitaciones de jugador (existente o persona nueva) y de cuerpo técnico por email exacto, con TTL configurable (`INVITACION_TTL_HORAS`, 168 h por defecto) y expiración lazy sin cron.
- Aceptación/rechazo/revocación con permisos por rol de equipo, estados de plantel y membresía; historial por equipo y lista propia `/invitaciones/mias`; sin exponer email, DNI ni teléfono en listados.
- Notificaciones en base con deep-link (`entidadTipo`/`entidadId`), listado con filtros y paginación, contador de no leídas, marcar una/todas leídas; deduplicación por usuario y exclusión del actor.
- Hooks de notificación en participaciones (invitación y solicitud de torneo, respuestas), convocatorias (crear/publicar), fixture (generar/regenerar) y partidos (cambio de fecha o lugar), sin cambiar contratos existentes.
- Rutas `GET /equipos/:id` recalibran el plantel separando `cantidades.invitados` de `cantidades.jugadores`.

### Tests

- 23 escenarios de invitaciones y 10 de notificaciones HTTP/integración (permisos, duplicados, expiración lazy, privacidad, deduplicación y scoping entre usuarios).

## [0.12.0] - 2026-08-11

### Agregado

- **FASE 12 — Recuperación y hardening de autenticación**: tokens de recuperación persistidos como hash SHA-256, TTL configurable, EmailSender, rate limiter en memoria, reset/cambio de contraseña, revocación de sesiones, auditoría y frontend responsive básico.
- Política central de contraseñas de 8 a 128 caracteres compartida por registro, reset y cambio.
- Migración `fase12_password_reset` y 20 escenarios de seguridad/auth.

## [0.11.0] - 2026-08-11

### Agregado

- **FASE 11 — Portal público unificado**, documentada en `docs/fase-11-diseno-portal-publico.md`, sin cambios de schema ni migraciones.
- Navegación pública de torneos, temporadas, categorías, zonas, fixture, tabla, partidos, estadísticas, goleadores, tarjetas, equipos, formaciones y convocatorias.
- Proyecciones conservadoras de equipos y jugadores; `mostrarPlantel`, publicación de formaciones y `publicada && !cancelada` para convocatorias.
- Landing responsive mobile-first con rutas públicas y acceso separado a login/registro.

### Seguridad

- Validación de torneo padre público en recursos descendientes y bloqueo de IDs cruzados.
- Caja sin endpoints públicos; sin DNI, email, teléfono ni fecha de nacimiento.
- Minutos permanecen `null` con `minutosNoDeterminados = true`.

### Tests

- 25 escenarios HTTP públicos de publicación, jerarquía, privacidad, estadísticas, caja y regresión de exposición de secretos.

## [0.10.0] - 2026-08-11

### Agregado

- **FASE 10 — Caja privada de equipo**, documentada en `docs/fase-10-diseno-caja.md`, reutilizando `MovimientoCaja` sin cambios de schema ni migraciones.
- Permiso compartido `caja:ver`; CRUD controlado, estados, anulación lógica, resumen, deudas, historial de jugador, filtros y auditoría.
- RBAC estricto por equipo: DELEGADO administra, TECNICO consulta, AUXILIAR sin acceso, JUGADOR solo su historial/deuda, ADMINISTRADOR sin acceso automático y SUPERADMIN operativo/auditable.
- Sección básica Caja en detalle de equipo.

## [0.9.0] - 2026-08-11

### Agregado

- **FASE 9 — Eventos, estadísticas y disciplina** con diseño definitivo en `docs/fase-9-diseno.md`.
- Modelo extensible `EventoPartido` y enum mínimo `GOL`, `ASISTENCIA`, `TARJETA`, `SUSTITUCION`; migración y cliente Prisma regenerado.
- Endpoints protegidos de eventos, corrección auditada, anulación no destructiva y estadísticas bajo demanda por partido, jugador, equipo y torneo/categoría.
- Validación de pertenencia, estados de plantel, secuencias de sustitución, consistencia entre goles oficiales y eventos al finalizar/publicar, y soporte de partidos independientes fuera de estadísticas oficiales de torneo.
- Frontend básico de línea temporal y estadísticas en detalle de partido.

### Cambiado

- `FormacionInstancia`, convocatorias canceladas, `EquipoJugador` y `Sancion` permanecen sin mutaciones automáticas; tarjetas no crean sanciones.
- Partidos finalizados no se reabren; eventos corregidos se auditan y anulan, sin borrado físico.
- Suite HTTP/integración de FASE 9 y correcciones de minutos por intervalos cerrados, permisos de estadísticas/disciplina y bloqueo de reapertura.
- FASE 9 registra participación y sustituciones, pero no calcula todavía minutos jugados; los eventos quedan preparados para activarlo posteriormente sin reconstruir históricos.

## [0.8.1] - 2026-08-11

### Cambiado

- Configuración Git del proyecto: hook `post-commit` para subir automáticamente cada commit a `origin` en la rama actual.

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
