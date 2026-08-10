# FASE 6 — Convocatorias: diseño aprobado

Estado: **APROBADO** para implementación. Base: commit `f9aaed2`.

## Diagrama

```
EQUIPO
  ├── EQUIPOJUGADOR ──── JUGADOR ──1:1── USUARIO (opcional)
  ├── PARTIDO (opcional)
  └── CONVOCATORIA {fecha, fechaLimite?, lugar?, hora?, notas?, publicada, cancelada, creadoPor}
         └── CONVOCATORIAJUGADOR {estado, nota, respondioEn, orden}
               └── EquipoJugador.dorsal (lectura, no duplicado)
```

## Cambios de schema

2 cambios a modelos existentes. Ninguna tabla nueva. Ninguna FK ni índice nuevos.

### Convocatoria
- `fechaLimite DateTime?` — fecha/hora límite para responder (opcional).
- `publicada Boolean @default(false)` — privacidad por defecto.
- `cancelada Boolean @default(false)` — soft delete. Al cancelar se setea `true`; no se borra físicamente.

### ConvocatoriaJugador
- `orden Int @default(0)` — orden de presentación.

## Estados y transiciones

`EstadoConvocado` (ya existe): `PENDIENTE, CONFIRMADO, NO_DISPONIBLE, AUSENTE`.

- Jugador: `PENDIENTE → CONFIRMADO | NO_DISPONIBLE`; `CONFIRMADO → NO_DISPONIBLE`.
- DELEGADO/TECNICO: cualquier transición, incluyendo marcar `AUSENTE` manualmente.
- `cancelada = true` → no se aceptan respuestas ni ediciones.

## Permisos

| Acción | DELEGADO | TECNICO | AUXILIAR | JUGADOR | PÚBLICO |
|---|---|---|---|---|---|
| Crear / editar / cancelar / cambiar estado jugadores | ✔ | ✔ | ✖ | ✖ | ✖ |
| Consultar | ✔ | ✔ | ✔ (miembro) | ✔ (sus equipos) | ✔ (solo publicadas, no canceladas) |
| Responder su propia convocatoria | — | — | — | ✔ | ✖ |

Verificación: `usuario → EquipoUsuario → equipo → convocatoria` con `puedeEnEquipo`.

## Reglas

- BAJA e INVITADO bloqueados al convocar. INACTIVO/LESIONADO/SUSPENDIDO permitidos sin tocar `EquipoJugador`.
- `fechaLimite` no bloquea respuestas automáticamente; solo es informativo.
- `partidoId?` opcional; si se provee, validar que el partido involucre al equipo.
- Jugador solo responde su propia convocatoria (`equipoJugador.jugador.usuario.id === auth.usuarioId`).
- Soft delete: `cancelada = true`. No se borran filas. Cancelada no se edita, no recibe respuestas y no aparece en listados activos.

## Auditoría

`AuditoriaLog`: CREATE/UPDATE/DELETE (cancelar) de `Convocatoria`; UPDATE de `ConvocatoriaJugador` (respuesta del jugador o cambio por DELEGADO/TECNICO).

## Relaciones futuras

- Con `Partido` (FASE 7): generación automática de convocatoria al crear partido.
- Con `FormacionInstancia` (FASE 5): generar convocatoria desde la formación del partido. No implementado ahora.

## Alcance FASE 6

Migración + backend (CRUD, respuesta, publicar, cancelar, listados, endpoint público) + validaciones + permisos + auditoría + 19 tests + frontend (listado, crear, ver, responder, editar, cancelar, publicar). CHANGELOG `[0.6.0]`.

## Excluido

WhatsApp, estadísticas, sustituciones, generación desde formaciones, creación automática desde partidos.
