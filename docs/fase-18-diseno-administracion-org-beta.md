# FASE 18 — Administración de organización + primera beta real

Estado: **PROPUESTA DE DISEÑO.** No implementada. Alcance sujeto a aprobación.

Fecha: 2026-09-02.

## Objetivo

Cerrar la brecha operativa detectada al cerrar FASE 17: hoy la app se opera con IDs crudos (UUID) y no hay panel de administración. Sin esto no se puede abrir una beta controlada con usuarios reales.

Objetivos explícitos:

- Eliminar el ingreso manual de UUID de organización.
- UI para administrar una organización.
- Gestión de usuarios, membresías y roles.
- Gestión más operativa de torneos.
- Configurar email real para invitaciones / reset.
- Preparar una beta controlada.

## Inventario existente (reutilizar, no recrear)

### Backend que ya existe y se aprovecha

| Capacidad | Dónde |
|---|---|
| Crear torneo (valida `esAdministradorOrganizacion`) | `POST /torneos` en `routes/torneos.ts:106` |
| Listar torneos visibles filtrados por scope del usuario | `GET /torneos` en `routes/torneos.ts:46` |
| Ver / editar organización (slug, zona horaria) | `GET/PATCH /organizaciones/:id` en `routes/organizaciones.ts` |
| Asignar roles con anti-escalada por tenant | `POST /usuarios/:id/roles` en `routes/usuarios.ts:100` + `puedeAsignarRoles` en `auth/permisos.ts:240` |
| Permisos de administración scoped | `esAdministradorOrganizacion`, `esAdminDeTorneo`, `esSuperadmin` en `auth/permisos.ts` |
| Reset de password por email | `auth/password-reset.ts` + `EmailSender` en `auth/email.ts` |
| Envío de email (solo adapter de desarrollo hoy) | `auth/email.ts` (`EmailSenderDesarrollo`) |

### Frontend que ya existe y se aprovecha

- `TorneosPage.tsx` — listado + creación (hoy con input de UUID manual en línea 70).
- `TorneoDetailPage.tsx` — panel por torneo con secciones (categorías, zonas, fases, fixture, etc.).
- `PermissionGate`, `ResponsiveTable`, `ConfirmDialog`, `StatusBadge`, `ToastRegion` — componentes reutilizables.
- `ProfilePage.tsx` — muestra roles/permisos, hoy como IDs crudos (líneas 79-81).
- `useAuth` / auth-context — la sesión ya trae `roles[]` con `organizacionId`/`torneoId`/`equipoId`.
- `apiFetch` — cliente HTTP común.

### Modelo (schema) — suficiente, sin cambios de schema obligatorios

- `Organizacion` (nombre, descripcion, slug, zonaHoraria).
- `Torneo` (organizacionId, nombre, descripcion, slug, estado, visiblePublico, configuracionPublica).
- `RolUsuario` (usuarioId, rolId, organizacionId?, torneoId?, equipoId?, jugadorId?, activo).
- `Usuario` (email, activo, nombre, apellido).
- Roles globales: `SUPERADMIN`, `ADMINISTRADOR` (con scope organización o torneo), `DELEGADO_TECNICO`, `JUGADOR`.

No se requiere migración para el alcance base. Solo si se decide añadir tracking de "invitación de organización por email a usuario inexistente" se necesitaría schema (ver §Apéndice).

## Gaps detectados (lo que FASE 18 añade)

### Backend — rutas nuevas

1. **`GET /organizaciones`** — listar organizaciones sobre las que el usuario tiene rol `ADMINISTRADOR` (o todas si `SUPERADMIN`). Resuelve el UUID manual: el front pide esta lista y usa su `id`/`nombre`.
   - Permiso: `organizacionesAdministrar`.
   - Respuesta: `[{ id, nombre, descripcion, slug, zonaHoraria, torneosCount }]`.

2. **`POST /organizaciones`** — crear una organización.
   - Permiso: solo `SUPERADMIN` (crear tenant requiere privilegio global; evitar que un admin se auto-cree tenants).
   - Cuerpo: `{ nombre, descripcion?, slug?, zonaHoraria? }`.
   - Si el actor es `SUPERADMIN`, auto-asignar su `RolUsuario ADMINISTRADOR` con `organizacionId = nueva` (para que quede operativa de inmediato y no requiera edición posterior).

3. **`GET /organizaciones/:id/usuarios`** — listar miembros de la organización con sus roles activos.
   - Permiso: `esAdministradorOrganizacion` (SUPERADMIN incluido por `esSuperadmin`).
   - Respuesta: `[{ usuarioId, email, nombre, apellido, activo, roles: [{ codigo, torneoId, equipoId }] }]`.
   - Desde la UI, un SUPERADMIN (o admin de la org) puede asignar a cualquier usuario con cuenta como `ADMINISTRADOR` de esa org, sin depender de seed manual: primer administrador se asigna por UI tras crear la organización (o auto-asignado por el SUPERADMIN que la crea).

4. **`DELETE /usuarios/:id/roles`** (o `PATCH` de retiro) — quitar membresía/rol de un usuario en una organización.
   - Permiso: `puedeAsignarRoles` (mismo guard anti-escalada que el POST).
   - Protección: no permitir quitar el último `ADMINISTRADOR` activo de una organización (evitar orphan de tenant).

5. **`GET /usuarios` (filtrado por organización)** — listar usuarios para asignar roles dentro de una org.
   - Permiso: `usuariosGestionar`.
   - Parámetro: `?organizacionId=`.
   - Respuesta: `[{ id, email, nombre, apellido, activo }]` (sin password/privados).

> Estas 5 rutas son el backend nuevo completo. Todo lo demás (crear torneo, editar org, asignar roles) ya existe.

### Backend — cambios de permiso/infra

- **Listado de orgs desde roles**: derivar de `auth.roles` (ya disponible en sesión) en `organizaciones.ts`.
- **Email real (SMTP)**: hoy `emailSender` es `EmailSenderDesarrollo`. FASE 18 lo hace configurable por env:
  - Nuevas variables en `env.ts`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` (obligatorias en producción: sin credenciales SMTP en `NODE_ENV=production` la app no arranca; en desarrollo se conserva el `EmailSenderDesarrollo`).
  - Nuevo `EmailSenderSmtp` con `nodemailer` (única dependencia nueva). Implementa la misma interfaz `EmailSender`.
  - `password-reset.ts` ya usa `emailSender.enviarRecuperacion` — solo cambia la implementación, no el flujo.
- **Nota**: las invitaciones a cuerpo técnico (`POST /equipos/:id/invitaciones-cuerpo`) hoy notifican por notificación interna y, si no existe la cuenta, responden 202 genérico "Si existe una cuenta elegible...". **No** se agrega envío de invitación por email en FASE 18 (ver §Apéndice/Ajustes de alcance). El email real de FASE 18 cubre **reset de password** (ya cableado) y se deja la interfaz lista para invitaciones.

## Pantallas y flujos (frontend)

### Nueva: `OrganizacionesPage` (`/organizaciones`)

- Visible para quien tenga `organizacionesAdministrar`.
- Lista las organizaciones del usuario (de `GET /organizaciones`), con nombre, slug, zona horaria y cantidad de torneos.
- Acción en cada tarjeta: abrir panel → `/organizaciones/:id`.
- Botón "Crear organización" (solo visible si `SUPERADMIN`).

### Nueva: `OrganizacionDetailPage` (`/organizaciones/:id`)

Pestañas/secciones:

1. **Configuración** — nombre, descripción, slug, zona horaria (usar `GET/PATCH /organizaciones/:id` existente; ya validan slug y zona horaria).
2. **Torneos** — listar torneos de la org, crear nuevo desde aquí (sin UUID: el `organizacionId` se toma del contexto de la ruta) y enlazar a `TorneoDetailPage` existente. Reutiliza la lógica de creación de `TorneosPage` pero con org ya resuelta.
3. **Usuarios y roles** — listar miembros (`GET /organizaciones/:id/usuarios`); buscar usuario por email dentro de la org (`GET /usuarios?organizacionId=`); asignar/quitar rol `ADMINISTRADOR` (con scope org) usando `POST /usuarios/:id/roles` y el nuevo retiro.
4. **Invitar usuario** — alta de un `ADMINISTRADOR` de la org apuntando a un email existente. (Si el email no tiene cuenta, queda fuera de alcance base; ver §Ajustes.)

### Cambios a pantallas existentes

- **`TorneosPage.tsx`**: reemplazar el input manual de UUID (línea 70) por un `<select>` con las organizaciones del usuario (de `GET /organizaciones`). Si el usuario es admin de una sola org, pre-seleccionarla.
- **`Layout.tsx`**: añadir enlace "Organizaciones" visible con `organizacionesAdministrar`.
- **`ProfilePage.tsx`**: mostrar nombres de organización/torneo en vez de UUID. Si la sesión no trae nombre, mapear contra `GET /organizaciones` (listado scoped).
- **Login/Registro**: sin cambios; el alta de usuarios sigue por registro/login normal.

## Flujos

### Crear torneo sin UUID

1. Usuario abre `/torneos` (admin de 1..n orgs).
2. Carga `GET /organizaciones`, poblada en el `<select>`.
3. Elige org por nombre → `organizacionId` se envía al `POST /torneos` existente.
4. El backend ya valida `esAdministradorOrganizacion`. Sin cambio de seguridad.

### Asignar administrador de org

1. Actor con permiso abre `/organizaciones/:id` → Usuarios (SUPERADMIN o admin de la org).
2. Busca usuario por email (`GET /usuarios?organizacionId=`) o listando miembros.
3. Asigna rol `ADMINISTRADOR` con `{ codigo:'ADMINISTRADOR', organizacionId: id }` → `POST /usuarios/:id/roles`.
4. El backend (`puedeAsignarRoles`) ya exige que el actor administre esa org y bloquea escalada (no puede crear SUPERADMIN/DELEGADO_TECNICO).

> El SUPERADMIN crea la org (auto-asignado como `ADMINISTRADOR`) y luego asigna el administrador operativo por esta UI. No hay seed manual.

## Permisos y seguridad

| Acción | Permiso / guard |
|---|---|
| Listar / ver org | `organizacionesAdministrar` + `esAdministradorOrganizacion` |
| Crear org | `SUPERADMIN` solamente |
| Editar org (slug/zona) | `esAdministradorOrganizacion` (existente) |
| Crear torneo | `esAdministradorOrganizacion` (existente) |
| Listar usuarios de org | `esAdministradorOrganizacion` |
| Asignar roles | `puedeAsignarRoles` (existente, anti-escalada) |
| Retirar roles | `puedeAsignarRoles` + guard último-admin |

Requisitos de seguridad nuevos:

1. **Crear org = solo SUPERADMIN.** Un admin con scope org no puede crear tenants.
2. **No quitar el último ADMINISTRADOR** de una org en `DELETE /usuarios/:id/roles`.
3. **`GET /usuarios?organizacionId=`** solo devuelve usuarios con rol en esa org o busca por email global pero solo si el actor administra la org objetivo (evitar enumeración masiva de usuarios fuera de tenant).
4. Todos los cambios de rol/vistas quedan en `auditoria.ts` (patrón ya usado).
5. Email SMTP: credenciales solo por env, nunca loguear; mantener rate-limiter de `password-reset.ts`.

## Cambios por capa (resumen)

- **`packages/shared`**: sin cambios de tipos de rol (no se introducen roles nuevos). Eventualmente helpers de filtrado, no necesario al inicio.
- **`apps/api`**:
  - `routes/organizaciones.ts`: `GET /organizaciones`, `POST /organizaciones`.
  - `routes/organizaciones.ts` (o nuevo `organizacion-usuarios.ts`): `GET /organizaciones/:id/usuarios`.
  - `routes/usuarios.ts`: `GET /usuarios?organizacionId=`, `DELETE /usuarios/:id/roles`.
  - `auth/email.ts`: `EmailSenderSmtp`; `app.ts`/`index.ts`: seleccionar sender por env.
  - `env.ts`: variables SMTP opcionales.
- **`apps/web`**:
  - `OrganizacionesPage.tsx` (nuevo).
  - `OrganizacionDetailPage.tsx` (nuevo, con secciones de usuarios/roles/torneos/config).
  - `TorneosPage.tsx`: `<select>` de org en vez de UUID.
  - `Layout.tsx`: enlace "Organizaciones".
  - `ProfilePage.tsx`: nombres en vez de UUID.
  - `torneos/`, nuevo `organizaciones/tipos.ts` para tipos.
- **Dependencias**: `nodemailer` (sola dependencia nueva, solo API).
- **Migración**: ninguna requerida para el alcance base.

## Pruebas

- **API (Vitest seriado)**: cubrir `GET/POST /organizaciones`, `GET /organizaciones/:id/usuarios`, `GET /usuarios?organizacionId=`, `DELETE /usuarios/:id/roles` + guardas (crear org solo SUPERADMIN; último-admin protegido; enumeración por tenant acotada).
- **Web**: `TorneosPage` con select de org; `OrganizacionesPage`; asignación de rol desde la org.
- Validar con `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Qué necesitamos realmente para abrir la primera beta

Lo mínimo viable para beta controlada (sin esto, no abrir):

1. `GET /orga+POST/GET organizaciones` y el select en `TorneosPage` → desaparece el UUID manual.
2. Alta de un primer `ADMINISTRADOR` de org **desde UI de SUPERADMIN** (o auto-alta del SUPERADMIN al crear la org) — no seed manual. El SUPERADMIN ve la org recién creada y asigna el rol por `POST /usuarios/:id/roles` desde `OrganizacionDetailPage` → Usuarios.
3. Email SMTP real para **reset de password** (`EMAIL_FROM` + `SMTP_*` + `EmailSenderSmtp`); en producción `env.ts` ya exige `EMAIL_FROM` no `.local`.
4. Verificar **despliegue** (FASE 17 marcó "pendiente de verificar despliegue real") antes de exponer a terceros.

Fuera del requisito de la primera beta: invitaciones por email a usuarios inexistentes, notificaciones push, PWA, monitoreo avanzado, y el alta masiva de jugadores.

## Ajustes de alcance explícitos (decisión de diseño)

- **No** se agrega envío de invitación por email a usuarios sin cuenta en FASE 18. Es un cambio de schema (invitación con email externo) y merece fase propia. El email real de FASE 18 = reset de password + interfaz lista para reusarse.
- **No** se crea rol nuevo (ej. `ORGANIZADOR`). Se opera con `ADMINISTRADOR` scoped a org/torneo ya soportado por `RolUsuario`. Añadir un rol nuevo implica permiso nuevo en `shared/auth.ts` y auditar cada ruta; no aporta a la beta.
- **Superadmin** conserva `global`; no se añade UI de gestión de SUPERADMINs.
- La gestión por UI de **temporadas/categorías/zonas/fases** ya vive en `TorneoDetailPage`; FASE 18 no la rehace, solo la enlaza desde la org.

## Apéndice — schema opcional (solo si se decide invitación por email)

Si más adelante se quiere "invitar por email a que cree cuenta y adopte rol", se necesitaría una tabla de invitaciones de organización:

```
model InvitacionOrganizacion {
  id             String   @id @default(uuid()) @db.Uuid
  organizacionId String   @db.Uuid
  email          String
  rol             RolCodigo  // ADMINISTRADOR
  tokenHash      String   @unique
  invitadoPorId  String   @db.Uuid
  estado         EstadoInvitacion
  expiraEn       DateTime
  aceptadaPorId  String?
  ...
}
```

Diferido. El alcance base de FASE 18 no la incluye.