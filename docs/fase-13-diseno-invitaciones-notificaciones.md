# FASE 13 — Invitaciones y notificaciones: diseño

Estado: **PROPUESTA** (pendiente de aprobación). Base: commit `57581fb` (FASE 12). No se implementó ni modificó schema.

---

## 1. Estado actual del schema relacionado

| Modelo | Campos relevantes | Estado actual |
|---|---|---|
| `Usuario` | `email` unique, `activo`, `jugadorId?`, `roles`, `equipos` (`EquipoUsuario`), `sesiones` | Sin relación a invitaciones propias |
| `Persona` | `dni?` unique, `email?`, `telefono?` | Sin invitaciones |
| `Jugador` | `personaId` 1:1, `usuario?` (1:1), `pertenencias` (`EquipoJugador`) | Sin invitaciones |
| `Equipo` | `estado`, `privado`, `configuracionPublica`, `creadoPor` | Sin invitaciones |
| `EquipoUsuario` | `rolEnEquipo`, `activo`, `invitadoPorId`, `fechaBaja` | Rastro de quién agregó, sin consentimiento ni expiración |
| `EquipoJugador` | `dorsal`, `posiciones`, `estado` (`EstadoEquipoJugador` con `INVITADO`), `fechaIngreso`, `fechaSalida`, `motivoBaja`, `observaciones` | `INVITADO` existe pero solo se setea manualmente |
| `EquipoParticipacion` | `estado` (`PENDIENTE/INSCRIPTO/CONFIRMADO/RECHAZADO/BAJA`), `invitadoPorId`, `fechaInscripcion`, `fechaBaja` | Flujo de invitación/solicitud a torneo YA completo |
| `RolUsuario` | rol global + ámbito `organizacionId/torneoId/equipoId/jugadorId` | — |
| `AuditoriaLog` | `entidad`, `entidadId`, `accion`, `usuarioId`, `cambios` | Reutilizable para invitaciones |
| `Session`, `PasswordResetToken` | FASE 12 | Sin relación |

## 2. Qué ya existe

- **Equipo → torneo (invitación)**: `POST /torneos/:torneoId/temporadas/:temporadaId/participaciones/invitar` crea `EquipoParticipacion` `PENDIENTE` + `invitadoPorId`; `POST /participaciones/:id/responder-invitacion { aceptar }` → `CONFIRMADO`/`RECHAZADO` (solo integrante del equipo).
- **Equipo → torneo (solicitud)**: `POST .../participaciones/solicitar` crea `INSCRIPTO` (solo miembro del equipo); `POST /participaciones/:id/decidir-solicitud` → `CONFIRMADO`/`RECHAZADO` (solo admin de torneo).
- **Cuerpo técnico**: `POST /equipos/:id/administradores` agrega/activa `EquipoUsuario` en el momento (sin invitación ni consentimiento), con `invitadoPorId`.
- **Jugador**: `POST /equipos/:id/jugadores` crea `EquipoJugador` `ACTIVO` inmediato (incorporación directa); existe búsqueda `GET /jugadores?dni=`.
- **Estado `INVITADO`**: definido en `EstadoEquipoJugador`, excluido de formaciones/convocatorias/eventos, pero alcanzable solo vía `POST /equipo-jugadores/:id/estado` (manual).
- **Permisos/hooks**: `requierePermiso`, `requiereRolEnEquipo`, `requiereAccesoEquipo`, `esMiembroEquipo`, `puedeEnEquipo`, `esAdminDeTorneo`, `esElJugador`, `esDelegadoDelJugador`.
- **Frontend**: navegación con `Layout` (Dashboard/Torneos/Equipos/Formaciones/Convocatorias/Partidos/Perfil), sin centro de avisos.

## 3. Qué falta

1. Invitación formal **jugador → equipo** (con consentimiento, historial, expiración).
2. Invitación formal **usuario → cuerpo técnico** (DELEGADO/TECNICO/AUXILIAR, con consentimiento).
3. **Centro de notificaciones** internas (modelo persistente + endpoints + UI).
4. Cablear notificaciones en eventos existentes (participaciones, convocatorias, partidos, fixture).
5. UI de invitaciones pendientes y contador de no leídas.

## 4. Diagrama conceptual

```
                    INVITACION
              ┌──────────────────────┐
              │ tipo, estado, mensaje │
              │ expiraEn, creadoPor   │
              └──────┬───────┬───────┘
                     │       │
        (JUGADOR)    │       │ (CUERPO_TECNICO)
        equipoId + jugadorId  equipoId + usuarioId + rolEnEquipo
              │       │       │
              ▼       ▼       ▼
        EquipoJugador   EquipoUsuario
        estado INVITADO (al invitar) / ACTIVO (al aceptar)

        NOTIFICACION
        usuarioId + tipo + titulo/mensaje + entidadTipo/entidadId + leidaAt
              ▲
        generada en transacción del negocio:
        invitaciones, respuestas, convocatorias, partidos, fixture,
        participaciones a torneo, altas/bajas de equipo

        EquipoParticipacion (NO se toca):
        PENDIENTE (invitación organizador) / INSCRIPTO (solicitud) →
        CONFIRMADO / RECHAZADO
```

## 5. Modelos nuevos

### 5.1 `Invitacion` (sirve para jugador y cuerpo técnico; el torneo reusa `EquipoParticipacion`)

```
model Invitacion {
  id            String             @id @default(uuid()) @db.Uuid
  tipo          TipoInvitacion     // JUGADOR | CUERPO_TECNICO
  equipoId      String             @db.Uuid
  equipo        Equipo             @relation(fields: [equipoId], references: [id])
  jugadorId     String?            @db.Uuid   // obligatorio si tipo=JUGADOR
  jugador       Jugador?           @relation("InvitacionJugador", ...)
  usuarioId     String?            @db.Uuid   // obligatorio si tipo=CUERPO_TECNICO
  usuario       Usuario?           @relation("InvitacionUsuario", ...)
  rolEnEquipo   RolEnEquipo?       // obligatorio si tipo=CUERPO_TECNICO
  estado        EstadoInvitacion   @default(PENDIENTE)
  mensaje       String?
  expiraEn      DateTime?
  creadoPorId   String?            @db.Uuid
  creadoPor     Usuario?           @relation("InvitacionCreador", ...)
  respondidoEn  DateTime?
  decididoPorId String?            @db.Uuid
  decididoPor   Usuario?           @relation("InvitacionDecisor", ...)
  createdAt     DateTime           @default(now())
  updatedAt     DateTime           @updatedAt

  @@index([equipoId, estado])
  @@index([usuarioId, estado])
  @@index([jugadorId, estado])
  @@map("invitaciones")
}
```

Relaciones nuevas en `Usuario`/`Jugador`/`Equipo` (nombres exactos a definir en implementación, patrón `InvitacionCreador` etc.).

### 5.2 `Notificacion`

```
model Notificacion {
  id          String             @id @default(uuid()) @db.Uuid
  usuarioId   String             @db.Uuid
  usuario     Usuario            @relation(fields: [usuarioId], references: [id])
  tipo        TipoNotificacion
  titulo      String
  mensaje     String
  entidadTipo String?            // Invitacion | EquipoParticipacion | Convocatoria | Partido | ...
  entidadId   String?            // id de la entidad referenciada (para deep-link)
  leidaAt     DateTime?
  createdAt   DateTime           @default(now())

  @@index([usuarioId, leidaAt, createdAt])
  @@map("notificaciones")
}
```

### 5.3 Enums nuevos

```
enum EstadoInvitacion { PENDIENTE, ACEPTADA, RECHAZADA, EXPIRADA, REVOCADA }
enum TipoInvitacion { JUGADOR, CUERPO_TECNICO }

enum TipoNotificacion {
  INVITACION_JUGADOR
  INVITACION_CUERPO_TECNICO
  INVITACION_TORNEO          // participación PENDIENTE creada por el organizador
  SOLICITUD_TORNEO           // participación INSCRIPTO creada por el equipo
  RESPUESTA_INVITACION       // el destinatario aceptó/rechazó → notifica al emisor
  CONVOCATORIA               // convocatoria creada/publicada → jugadores convocados
  PARTIDO                    // cambio de fecha/hora/lugar/estado
  FIXTURE                    // fixture publicado → delegados de equipos participantes
  SANCION                    // tipo definido; trigger cuando exista la ruta de sanciones (FASE 14)
  EQUIPO                     // altas/bajas de jugadores y de administradores
}
```

## 6. Cambios Prisma potenciales

Migración `20260811XXXXXX_fase13_invitaciones_notificaciones`:

1. Enums `EstadoInvitacion`, `TipoInvitacion`, `TipoNotificacion`.
2. Modelo `Invitacion` (con FK a `Equipo`, `Jugador`, `Usuario` creador/destinatario/decidor + índices).
3. Modelo `Notificacion` (FK a `Usuario` + índice).
4. Relaciones en `Usuario` (`invitacionesRecibidas`, `invitacionesCreadas`, `invitacionesDecididas`, `notificaciones`), `Jugador` (`invitaciones`), `Equipo` (`invitaciones`).
5. **Opción A (recomendada)** en `EquipoJugador`: `invitacionId String? @db.Uuid` + FK a `Invitacion` (traza de origen de la pertenencia; sin reemplazar historial). Si se rechaza/expira, la fila `EquipoJugador` pasa a `BAJA` con `motivoBaja` (`invitación rechazada/expirada/revocada`).
6. **`EquipoParticipacion` NO cambia** (se reutiliza tal cual; la expiración de invitaciones de torneo queda fuera de FASE 13).

Regenerar cliente y aplicar en dev/test con el procedimiento estándar.

## 7. Flujos de invitación

### 7.1 Jugador → equipo

```
DELEGADO/TECNICO
  POST /equipos/:id/invitaciones-jugador
    { jugadorId }                  → jugador existente
    { persona: {nombre, apellido, dni?} } → persona nueva (se crea Persona+Jugador)
  → si no existe pertenencia confirmada/INVITADO pendiente en el equipo:
      crear Invitacion PENDIENTE (expiraEn = now + INVITACION_TTL_HORAS)
      crear/actualizar EquipoJugador estado = INVITADO (+ invitacionId)
      Notificacion INVITACION_JUGADOR al usuario del jugador (si tiene cuenta)
      auditar CREATE Invitacion

JUGADOR (cuenta vinculada al Jugador, o tras vincularse por DNI/email)
  POST /invitaciones/:id/responder { aceptar: true|false }
  → solo si esElJugador(contexto, invitacion.jugadorId) o su cuenta está vinculada
  → solo si estado == PENDIENTE y no expirada
  aceptar   → EquipoJugador estado = ACTIVO, fechaIngreso = now, observaciones preservadas
             Notificacion RESPUESTA_INVITACION al emisor (aceptada)
  rechazar  → EquipoJugador estado = BAJA, fechaSalida = now, motivoBaja = "invitación rechazada"
             Notificacion RESPUESTA_INVITACION al emisor (rechazada)
  → Invitacion estado = ACEPTADA/RECHAZADA, respondidoEn = now, decididoPor = auth
  → auditar UPDATE Invitacion

Jugador sin cuenta: la invitación queda PENDIENTE y se materializa como pendiente
de "mis invitaciones" cuando la persona se registra y vincula su Jugador (FASE 4).
```

Reglas:
- Duplicados: no re-invitar si ya existe `EquipoJugador` del jugador en ese equipo con estado distinto de `BAJA`, ni `Invitacion` `PENDIENTE` activa.
- `INVITADO` no cuenta como plantel activo (ver permisos/privacidad y ajuste de conteos).
- Identidad: aceptar exige pertenencia real (`contexto.jugadorId === jugadorId` o cuenta vinculada); un delegado no puede aceptar en nombre del jugador.

### 7.2 Usuario → cuerpo técnico

```
DELEGADO (solo DELEGADO, no TECNICO)
  POST /equipos/:id/invitaciones-cuerpo
    { email, rolEnEquipo: DELEGADO|TECNICO|AUXILIAR, mensaje? }
  → validar email existe; no hay EquipoUsuario activo ni Invitacion PENDIENTE duplicada
  → Invitacion PENDIENTE (CUERPO_TECNICO) + Notificacion INVITACION_CUERPO_TECNICO
  → auditar CREATE Invitacion

USUARIO destinatario
  POST /invitaciones/:id/responder { aceptar }
  → solo su propio usuarioId; estado PENDIENTE y no expirada
  aceptar   → crear/activar EquipoUsuario { rolEnEquipo, invitadoPorId, activo: true, fechaBaja: null }
             (si ya existía con rol previo, se actualiza el rol)
             Notificacion RESPUESTA_INVITACION al emisor (aceptada)
  rechazar  → solo marca Invitacion RECHAZADA (historial conservado)
  → auditar UPDATE Invitacion (+ CREATE/UPDATE EquipoUsuario)
```

Reglas:
- Invitar un nuevo DELEGADO no viola la regla de "último DELEGADO" (esa regla aplica a bajas, no a altas).
- Un DELEGADO existente que es invitado a otro equipo es válido (multi-equipo permitido).

### 7.3 Equipo → torneo (reusa `EquipoParticipacion`, NO crea `Invitacion`)

```
ORGANIZADOR:  POST .../participaciones/invitar    → EquipoParticipacion PENDIENTE
              + Notificacion INVITACION_TORNEO a DELEGADOs del equipo
DELEGADO:     POST /participaciones/:id/responder-invitacion { aceptar }  (ya existe)
              + Notificacion RESPUESTA_INVITACION al organizador que invitó

EQUIPO:       POST .../participaciones/solicitar   → EquipoParticipacion INSCRIPTO
              + Notificacion SOLICITUD_TORNEO a admins del torneo
ORGANIZADOR:  POST /participaciones/:id/decidir-solicitud { aceptar }  (ya existe)
              + Notificacion RESPUESTA_INVITACION a los DELEGADOs del equipo
```

Sin tabla nueva: el estado `PENDIENTE`/`INSCRIPTO` de `EquipoParticipacion` ya es la invitación.

## 8. Estados de invitación

`EstadoInvitacion { PENDIENTE, ACEPTADA, RECHAZADA, EXPIRADA, REVOCADA }` con la máquina:

```
PENDIENTE ─aceptar──→ ACEPTADA
   │  ─rechazar──→ RECHAZADA
   │  ─revocar──→ REVOCADA       (emisor/DELEGADO la retira)
   │  ─expira──→ EXPIRADA        (lazy: al consultar/responder, si expiraEn < now)
   ▼
terminales: ACEPTADA, RECHAZADA, EXPIRADA, REVOCADA (nunca vuelven a PENDIENTE)
```

- No se borra físicamente: la fila es el historial.
- `responder` sobre un estado terminal → 409 (`estado_invalido`).
- Revocar solo mientras `PENDIENTE`.

## 9. Expiración

- **Invitaciones `Invitacion`**: sí. `INVITACION_TTL_HORAS` (env, default `168` = 7 días). Configurable, sin hardcodear. No borrado histórico: expirada se marca `EXPIRADA` y queda en el historial. No puede aceptarse. Evaluación **lazy** en el servicio (al consultar o responder), sin job programado en FASE 13.
- Al expirar una de tipo JUGADOR, la `EquipoJugador` asociada pasa a `BAJA` (`motivoBaja = 'invitación expirada'`) en la misma transacción.
- **Invitaciones a torneo (`EquipoParticipacion`)**: sin expiración en FASE 13 (decisión pendiente; no agregar columna por ahora).

## 10. Notificaciones

- Modelo persistente `Notificacion` (justificado: se necesitan contador de no leídas, historial y deep-links entre sesiones; no existe ningún mecanismo hoy).
- Alcance FASE 13: **solo internas** (usuarios autenticados). Sin email, sin push, sin WhatsApp.
- Creación **siempre dentro de la transacción del negocio** que dispara el evento (consistencia garantizada).
- Destinatarios por tipo:
  - `INVITACION_JUGADOR` → usuario vinculado al `Jugador` (si existe cuenta).
  - `INVITACION_CUERPO_TECNICO` → usuario destinatario.
  - `INVITACION_TORNEO` / `SOLUCION` → DELEGADOs del equipo / admins del torneo.
  - `RESPUESTA_INVITACION` → usuario emisor (aceptada/rechazada).
  - `CONVOCATORIA` → jugadores convocados con cuenta.
  - `PARTIDO` → miembros (`EquipoUsuario` activos) de ambos equipos.
  - `FIXTURE` → DELEGADOs de los equipos participantes.
  - `SANCION` → tipo definido, sin trigger hasta que exista la ruta de sanciones.
  - `EQUIPO` → miembros del equipo (alta/baja de jugador o administrador).
- **`password/reset` nunca genera notificación interna**.
- Deduplicación: un evento dirige una notificación por usuario; no se crea para el propio actor que origina la acción si es destinatario (p. ej. el DELEGADO que convoca no recibe su propia notificación de convocatoria).
- `entidadTipo/entidadId` permiten deep-link (`/equipos/:id`, `/torneos/:id`, `/partidos/:id`, `/invitaciones`, ...).

## 11. Permisos

Enforcement en backend (hooks y helpers existentes; sin confiar en `equipoId` del frontend).

| Acción | Permiso / hook |
|---|---|
| Invitar jugador | `requiereRolEnEquipo('DELEGADO','TECNICO')` |
| Invitar cuerpo técnico | `requiereRolEnEquipo('DELEGADO')` |
| Revocar invitación (jugador o cuerpo) | emisor de la invitación o DELEGADO del equipo |
| Aceptar/rechazar invitación JUGADOR | `esElJugador` / cuenta vinculada al `Jugador` |
| Aceptar/rechazar invitación CUERPO_TECNICO | el usuario destinatario |
| Invitar equipo a torneo | `requierePermiso(torneosAdministrar)` + `esAdminDeTorneo` (existe) |
| Solicitar inscripción a torneo | `requierePermiso(equiposInscribir)` + `esMiembroEquipo` (existe) |
| Responder invitación a torneo | `esMiembroEquipo` (existe) |
| Decidir solicitud a torneo | admin de torneo (existe) |
| Consultar historial de invitaciones de un equipo | miembro del equipo (DELEGADO puede ver todo; TECNICO/AUXILIAR solo confirmadas) |
| Ver / marcar notificaciones | solo el propio usuario (`usuarioId` del contexto) |

Sin permisos globales nuevos: las capacidades ya cubren los roles; la distinción fina sigue por `rolEnEquipo`.

## 12. Privacidad

- Una invitación es visible únicamente para: emisor autorizado, destinatario y DELEGADOs del equipo (o admins del torneo en participaciones).
- `GET /invitaciones/:id` valida siempre pertenencia (emisor/DELEGADO o destinatario). **Sin endpoints públicos**.
- Búsqueda de usuarios para invitar cuerpo técnico: **solo por email exacto** (no exponer listados ni emails ajenos). La respuesta de búsqueda no revela más que "existe/no existe" según el patrón FASE 12 (mensaje genérico).
- Notificaciones: cada usuario solo ve las suyas; el listado filtra por `usuarioId` del contexto (nunca por parámetro).
- `EquipoJugador.observaciones` nunca sale del equipo; `Persona.dni/email/telefono` no se exponen en listados de invitaciones.

## 13. Auditoría

Con `AuditoriaLog`, sin secretos (nunca DNI completo, email de terceros, token):

- `CREATE Invitacion` (cambios: tipo, equipoId, destinatario anónimo según tipo, rol, expiraEn).
- `UPDATE Invitacion` en aceptar/rechazar/revocar/expirada (cambios: estado resultante, respondidoEn).
- Acciones de negocio ya auditadas que ahora además notifican (participación invitada/respondida, convocatoria, partido, fixture): **sin auditoría extra por la notificación**.

**Estrategia anti-ruido**: NO se audita la creación de notificaciones individuales ni la marcación de leídas ni las lecturas. Se audita únicamente la transición de estado de las invitaciones y las acciones de negocio que ya lo hacen.

## 14. Endpoints

Rutas nuevas (`apps/api/src/routes/invitaciones.ts`, `apps/api/src/routes/notificaciones.ts`), registradas en `app.ts` con prefijo `/api`:

```
# Invitaciones
POST   /equipos/:id/invitaciones-jugador      # DELEGADO/TECNICO — { jugadorId | persona{...}, mensaje? }
POST   /equipos/:id/invitaciones-cuerpo       # DELEGADO — { email, rolEnEquipo, mensaje? }
GET    /equipos/:id/invitaciones              # historial del equipo (miembros)
POST   /invitaciones/:id/responder            # destinatario — { aceptar }
POST   /invitaciones/:id/revocar              # emisor/DELEGADO
GET    /invitaciones/mias                     # invitaciones del usuario autenticado (pendientes + historial)

# Notificaciones
GET    /notificaciones                        # ?leidas=true|false&limite=&desdeId=
GET    /notificaciones/no-leidas              # { count }
POST   /notificaciones/:id/leida              # marcar leída
POST   /notificaciones/leer-todas             # marcar todas como leídas

# Existentes que SOLO suman notificación (sin cambios de contrato)
POST   /torneos/:torneoId/temporadas/:temporadaId/participaciones/invitar     (+ notif a DELEGADOs)
POST   .../participaciones/solicitar                                          (+ notif a admins torneo)
POST   /participaciones/:id/responder-invitacion                              (+ notif al emisor)
POST   /participaciones/:id/decidir-solicitud                                 (+ notif a DELEGADOs equipo)
POST   /convocatorias/:id/publicar y crear                                    (+ notif a convocados)
PATCH  /partidos/:id (fechaHora/lugar/estado)                                 (+ notif a miembros equipos)
POST   .../fixture (generar/publicar)                                         (+ notif FIXTURE)
```

## 15. Frontend

- **Navbar** (`Layout.tsx`): ítem "Notificaciones" con **badge de no leídas** (consulta `/notificaciones/no-leidas` al montar y tras acciones; sin polling).
- **`/notificaciones`** (`NotificacionesPage`): listado (filtro pendientes/historial), marcar leída, "leer todas", deep-link por `entidadTipo/entidadId`.
- **`/invitaciones`** (`InvitacionesPage`): invitaciones del usuario con aceptar/rechazar; integración desde dashboard.
- **Dashboard**: sección "Invitaciones pendientes" (aceptar/rechazar) y contador de no leídas.
- **`EquipoPage`**: nueva sección "Invitaciones" — crear invitación (jugador por ID o persona nueva, o cuerpo técnico por email+rol), listar historial, revocar pendientes, y separar `INVITADO` del plantel activo en "Plantel".
- **Perfil**: bloque "Mis invitaciones".
- Reutiliza clases CSS existentes (`tarjeta`, `boton`, `campo`, `error`, `mensaje`, `lista`, `navbar`) y `apiFetch`.
- Sin push del navegador en FASE 13.

## 16. Tests

Suites nuevas `invitaciones.test.ts` y `notificaciones.test.ts` + ajustes de regresión:

**Invitación de jugador**: invita jugador existente (PENDIENTE + EquipoJugador INVITADO); jugador sin cuenta queda pendiente y se materializa tras vinculación; persona nueva crea Persona+Jugador; rechazo de duplicado (pertenencia activa o invitación pendiente); DELEGADO de Equipo A no invita para Equipo B; TECNICO invita y AUXILIAR no; aceptación deja ACTIVO; rechazo deja BAJA con motivo; expirada no puede aceptarse (lazy); revocación por emisor y por DELEGADO; solo el jugador destinatario acepta (un tercero recibe 403); INVITADO no aparece en formaciones/convocatorias/eventos; conteos de plantel no incluyen INVITADO.
**Invitación de cuerpo técnico**: por email exacto; usuario inexistente no revela email (respuesta genérica); aceptación crea/activa EquipoUsuario con rol correcto e invitadoPorId; rechazo conserva historial; revocación; DELEGADO invita y TECNICO no; duplicado rechazado; rol inválido rechazado.
**Torneo (regresión/notificación)**: invitar equipo (PENDIENTE) notifica a DELEGADOs; responder-invitacion notifica al organizador; solicitar (INSCRIPTO) notifica a admins; decidir-solicitud notifica a DELEGADOs del equipo.
**Notificaciones**: se crean por evento; solo del destinatario (usuario A no ve las de B); marcar leída; leer todas; contador; deep-link `entidadTipo/entidadId` presente; el propio actor no recibe su propia notificación; reset de contraseña NO genera notificación.
**Privacidad/auditoría**: historial de invitaciones solo para miembro; sin emails/DNI en respuestas; auditoría CREATE/UPDATE de invitaciones sin datos sensibles; no borrado físico (rechazada/expirada/revocada conserva fila).
**Regresión**: `pnpm test` completo de FASE 1–12 (se ajustan tests de equipos si cambia la semántica de conteo de plantel).

## 17. Riesgos

1. **Semántica de plantel**: hoy `GET /equipos/:id` cuenta plantel como `estado != BAJA` (incluye INVITADO). Al usar INVITADO de forma real hay que redefinir: plantel activo = `ACTIVO/INACTIVO/LESIONADO/SUSPENDIDO`; `INVITADO` aparte. Puede romper tests existentes de equipos (migrar y ajustar).
2. **Personas "fantasma"**: invitar persona nueva crea `Persona+Jugador` antes del consentimiento. Aceptado explícitamente (opción A); el rechazo/expiración los deja como `BAJA`, no borra el registro.
3. **Deduplicación de notificaciones**: sin índice único de deduplicación; control en el servicio (transacción). Riesgo bajo en volumen actual.
4. **Emails en auditoría**: nunca registrar email completo del destinatario en `AuditoriaLog`.
5. **`INVITADO` y fixture/tablas**: la tabla de posiciones usa participaciones, no `EquipoJugador`, así que no afecta. Verificar formaciones/convocatorias ya excluyen INVITADO (confirmado en código).
6. **Notificación de partidos**: el hook en `PATCH /partidos/:id` debe evitar notificar cuando no cambian campos relevantes.
7. **Volumen de notificaciones**: sin límite de retención en FASE 13 (decisión pendiente: purge/archive a futuro).

## 18. Decisiones pendientes

1. **Persona nueva al invitar**: (A) crear `Persona+Jugador` + `EquipoJugador` INVITADO en el momento (recomendado; mantiene `Invitacion.jugadorId` siempre seteado y reutiliza `INVITADO`), vs (B) guardar nombre/apellido/dni en `Invitacion` y materializar recién al aceptar.
2. **`POST /equipos/:id/jugadores` (incorporación directa ACTIVO)**: (A) mantener como "carga directa sin consentimiento" para personas sin cuenta (recomendado) y usar invitación para el resto, vs (B) prohibirla y exigir invitación siempre para jugadores con cuenta.
3. **`POST /equipos/:id/administradores` (agregar admin directo)**: (A) mantener solo para DELEGADO y sumar flujo de invitación (recomendado), vs (B) reemplazarlo por invitación obligatoria.
4. **Expiración**: confirmar default `INVITACION_TTL_HORAS=168` (7 días) y evaluación lazy. Invitaciones a torneo: sin expiración en FASE 13 (recomendado).
5. **Alcance de `TipoNotificacion`**: confirmar set (incluye `SANCION` sin trigger y `EQUIPO` para altas/bajas) o reducirlo.
6. **`EquipoJugador.invitacionId`**: agregar FK de trazabilidad (recomendado) o prescindir.
7. **Solicitud jugador → equipo**: NO entra en FASE 13 (se diseña en FASE 14) salvo confirmación en contra.
8. **Notificación de partido**: destinatarios = miembros (`EquipoUsuario` activos) de ambos equipos (recomendado) o solo DELEGADOs/TECNICOs.

## 19. Alcance exacto de FASE 13

- Migración `fase13_invitaciones_notificaciones` + regeneración de cliente.
- Backend: modelo/servicio de `Invitacion` (jugador + cuerpo técnico), `Notificacion` (solo internas), endpoints nuevos, hooks de notificación en participaciones/convocatorias/partidos/fixture, expiración lazy configurable.
- Frontend: `/notificaciones`, `/invitaciones`, badge en navbar, dashboard con pendientes, sección "Invitaciones" en equipo, perfil.
- Auditoría de transiciones de invitación; sin auditar lecturas.
- Tests de invitaciones/notificaciones + ajuste de regresión de conteo de plantel.
- CHANGELOG `[0.13.0]`.

**Fuera de FASE 13**: email de invitación/notificaciones, push (navegador/móvil), WhatsApp, sanción trigger (sin ruta previa), expiración de participaciones a torneo, solicitud jugador→equipo, retención/purga de notificaciones.

## 20. Qué queda para FASE 14

- Solicitud de incorporación **jugador → equipo** (reusa `Invitacion` tipo `SOLICITUD` o flujo simétrico con el equipo como aceptador).
- Ruta de sanciones + trigger `SANCION`.
- Email general (invitaciones y avisos) sobre `EmailSender` de FASE 12.
- Push del navegador / app móvil.
- WhatsApp.
- Noticias/fotos.
- Expiración masiva programada (job/CRON) y retención/purga de notificaciones.
- MercadoPago, pagos parciales, grupos/playoffs, minutos calculados (fases ulteriores, no FASE 14).
