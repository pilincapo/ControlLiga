# FASE 4 — Equipos, planteles y jugadores: diseño aprobado

Estado: **APROBADO** para implementación. Base: commit `5b27ccc`.

## Concepto fundamental

EQUIPO = entidad independiente de cualquier torneo. Puede existir indefinidamente sin participar en una competición.

```
DELEGADO/TECNICO → CREAR EQUIPO → ADMINISTRAR EQUIPO → AGREGAR JUGADORES → PLANTEL → FORMACIONES → CONVOCATORIAS → PARTIDOS
```

Formaciones, convocatorias y partidos independientes se desarrollan en fases posteriores; el diseño los integra sin cambios.

## Diagrama conceptual

```
USUARIO (opcional)
   │ 1:1 (jugadorId)
   ▼
PERSONA ◄──1:1── JUGADOR
   │                │
   │                │ pertenencias (historial, N equipos)
   │                ▼
   │            EQUIPOJUGADOR {dorsal, posiciones, estado, alta/baja, observaciones}
   │                ▲
   │                │ participantes (FASE 3)
   │                └────► JUGADORPARTICIPACION
   │
EQUIPO {privado, contacto, configuracionPublica}
   ├── EQUIPOUSUARIO {DELEGADO/TECNICO/AUXILIAR, activo, invitadoPor, fechaBaja}
   ├── FORMACION / CONVOCATORIA (futuro, referencian EQUIPOJUGADOR)
   └── SANCION / CAJA / PARTICIPACION
```

Plantel actual = `EquipoJugador` con `estado != BAJA`. Historial = todas las filas. No se crea entidad adicional para el plantel.

## Creación de equipo

```
POST /equipos  (DELEGADO_TECNICO autenticado)
  ├─ nombre, escudoUrl, descripcion, colores, categoriaHabitual?, telefono?, email?, configuracionPublica?
  ├─ estado = ACTIVO, privado = true
  ├─ creadoPor = auth.usuarioId
  └─ auto: EquipoUsuario { usuarioId, rolEnEquipo: DELEGADO, activo: true }
       → el creador queda como DELEGADO
  └─ AuditoriaLog CREATE Equipo
```

Luego `PATCH /equipos/:id` (solo DELEGADO del equipo) edita datos, contacto y privacidad.

## Incorporación de jugador

```
A) NUEVO (sin cuenta): POST /equipos/:id/jugadores { persona: { nombre, apellido, dni?, fechaNacimiento?, ... }, dorsal?, posiciones? }
     ├─ si Persona.dni ya existe → 409 (no duplicar)
     ├─ crear Persona + Jugador + EquipoJugador { estado ACTIVO }
B) EXISTENTE: GET /jugadores?dni=... ; POST /equipos/:id/jugadores { jugadorId, dorsal?, posiciones? }
     ├─ validar: jugador existe; no hay pertenencia ACTIVA duplicada en el mismo equipo
     └─ nueva fila EquipoJugador (historial intacto)
```

Baja: `POST /equipo-jugadores/:id/baja` → `estado=BAJA`, `fechaSalida=now`, `motivoBaja`. Nunca borrar.

## Cambio de equipo

```
Jugador en Equipo A → baja en A (BAJA + fechaSalida + motivo, historial NO se toca)
                   → alta en B (nueva fila EquipoJugador ACTIVO)
```

Se conservan historial, estadísticas futuras, torneos anteriores, `JugadorParticipacion` y sanciones. No se exige exclusividad: se permite pertenencia activa en varios equipos.

## Modelo de estados

```
EstadoEquipo { ACTIVO, INACTIVO, ARCHIVADO }                 → en Equipo
EstadoEquipoJugador { ACTIVO, INACTIVO, LESIONADO, SUSPENDIDO, INVITADO, BAJA }
```

Regla general (AJUSTE 1 aprobado):
- `BAJA` = dejó de pertenecer al equipo.
- `ACTIVO` = pertenece actualmente.
- `INACTIVO` = pertenece pero no disponible/activo.
- `LESIONADO` / `SUSPENDIDO` = estado interno del equipo.
- `INVITADO` = todavía no confirmó su incorporación (prepara invitaciones futuras).

La suspensión oficial de una competición es responsabilidad de `Sancion` y NO se confunde con este estado.

`EstadoEquipoJugador` reemplaza `EquipoJugador.activo: Boolean`. ANTES de eliminarlo: buscar TODAS las referencias (permisos, consultas, torneos, `JugadorParticipacion`, endpoints, tests, frontend) y reemplazarlas. No dejar filtros antiguos.

## Permisos por rol de equipo

Los permisos globales de `DELEGADO_TECNICO` cubren las capacidades; la distinción fina se hace por `EquipoUsuario.rolEnEquipo` (helper `puedeEnEquipo` + hook `requiereRolEnEquipo`).

| Acción | DELEGADO | TECNICO | AUXILIAR |
|---|---|---|---|
| Editar equipo, contacto, privacidad, admins | ✔ | ✖ | ✖ |
| Crear/modificar jugadores, incorporar, alta/baja plantel, dorsal, estado | ✔ | ✔ | ✖ |
| Ver plantel y ficha | ✔ | ✔ | ✔ |
| Caja | ✔ | ✖ | ✖ |
| Convocatorias gestionar | ✔ | ✔ | ✖ |
| Convocatorias ver | ✔ | ✔ | ✔ |
| Formaciones gestionar | ✔ | ✔ | ✖ |

La autorización comprueba siempre `usuario → EquipoUsuario activo → equipoId`. Nunca confiar en un `equipoId` enviado por el frontend. DELEGADO de Equipo A nunca modifica Equipo B.

## Privacidad

- `Equipo.privado = true` al crear. Teléfono, email y observaciones son privados: solo visibles para miembros.
- `Equipo.configuracionPublica Json?`: `mostrarEscudo`, `mostrarNombre`, `mostrarPlantel`, `mostrarContacto=false` por defecto. El DELEGADO decide qué se publica.
- `EquipoJugador.observaciones` nunca se exponen fuera del equipo.

## Auditoría

Con `AuditoriaLog`, se auditan: creación/modificación de equipo, cambios de privacidad, alta/baja de administradores, cambio de rol, creación de jugador, incorporación al equipo, baja, cambio de dorsal, cambio de estado, vinculación de usuario. Sin datos sensibles en los logs (nunca DNI completo, teléfono ni email).

## Vinculación segura jugador/usuario (AJUSTE 2 aprobado)

No se permite vincularse arbitrariamente con un `jugadorId`.

- Registro acepta `dni` opcional.
- `POST /auth/me/vincular-jugador` (y el vínculo durante el registro) exige que la identidad coincida: `Persona.dni` igual al DNI declarado O `Persona.email` igual al email de la cuenta.
- Si no hay información suficiente para verificar → NO se vincula; la cuenta queda sin jugador. Preparado para futura invitación/código.
- Nunca: `POST { jugadorId: "otro-jugador" }` sin comprobación. Un delegado tampoco convierte silenciosamente su cuenta en la de otro jugador.
- La invitación formal jugador → equipo queda para fase posterior.

## No implementar todavía

Formaciones, convocatorias, partidos independientes, resultados, estadísticas, portal público completo, caja, pagos, notificaciones, invitaciones formales a jugadores.

## Cambios de schema (propuesta)

1. `enum EstadoEquipo { ACTIVO INACTIVO ARCHIVADO }` + `Equipo.estado`, `categoriaHabitual`, `telefono`, `email`, `configuracionPublica`.
2. `EquipoUsuario.invitadoPorId` (FK `Usuario`), `fechaBaja`.
3. `enum EstadoEquipoJugador { ACTIVO INACTIVO LESIONADO SUSPENDIDO INVITADO BAJA }`; `EquipoJugador.estado` reemplaza `activo`; agregar `observaciones`.
4. `posiciones` sigue `String?` (extensible); en shared: `POSICIONES_BASE = [ARQUERO, DEFENSOR, MEDIOCAMPISTA, DELANTERO]` para validación.
5. Vinculación segura sin cambios de schema (`Usuario.jugadorId` ya existe).

## Separación de fases

**FASE 4:** migración + backend (equipos CRUD + admins, jugadores crear/buscar/ficha/editar, plantel con historial, estados, permisos por rol, vinculación segura, auditoría) + frontend (`/equipos/:id`, `/jugadores/:id`, crear, plantel; Formaciones/Convocatorias/Partidos/Caja deshabilitadas) + 20 tests obligatorios + CHANGELOG `[0.4.0]`.

**Fases posteriores:** formaciones (5), convocatorias (6), partidos (7), resultados y tablas (8), estadísticas (9), caja/pagos (10).
