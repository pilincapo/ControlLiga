# FASE 5 — Formaciones: diseño aprobado

Estado: **APROBADO** para implementación. Base: commit `10c3fba`.

## Concepto

Una formación es una **decisión táctica** de un equipo: lista de jugadores, titulares/suplentes, posiciones y ubicación en cancha. NO necesita pertenecer a un partido (puede existir independientemente). Opcionalmente puede asociarse a un partido, y en ese caso se conserva su estado histórico (snapshot).

```
EQUIPO
  ├── EQUIPOJUGADOR ──── JUGADOR (dorsal, estado, posición habitual)
  ├── PLANTILLAFORMACION  (catálogo de sistemas, coordenadas iniciales normalizadas)
  │      └── PLANTILLAFORMACIONPOSICION
  └── FORMACION  (plantilla editable, privada por defecto)
         ├── partidoId? (opcional)
         ├── FORMACIONJUGADOR (jugador, esTitular, posicion, x, y, orden)  [dorsal leído de EquipoJugador]
         └── FORMACIONINSTANCIA  (snapshot inmutable al usarse en un partido)
               └── FORMACIONINSTANCIAJUGADOR (nombreSnapshot, dorsalSnapshot, posicion, esTitular, x, y, orden)
                     └── PARTIDO
```

## Modelos

### `Formacion` (modificar)
- Agregar: `publicada Boolean @default(false)`, `@@index([partidoId])`, relación `instancias FormacionInstancia[]`.
- Mantener: `id`, `equipoId` (FK), `partidoId?` (FK `Partido`), `nombre`, `formacionTipo` (enum `TipoFormacion`), `esquema String?` (sistema táctico, texto libre), `fecha`, `notas`, `jugadores[]`.

### `FormacionJugador` (modificar)
- Agregar: `x Int?`, `y Int?` (coordenadas normalizadas 0..100).
- Mantener: `posicion String` (posición en la formación), `esTitular Boolean` (TITULAR/SUPLENTE), `orden Int`, `@@unique([formacionId, equipoJugadorId])` (no duplicar jugador), `@@index([equipoJugadorId])`.
- El dorsal NO se guarda aquí: se lee de `EquipoJugador` en vivo.

### `PlantillaFormacion` (nueva — catálogo de sistemas)
- `id` PK, `nombre` (ej. "4-3-3"), `formacionTipo` (FK enum), `esquema String`, `descripcion String?`, `orden Int`, `posiciones PlantillaFormacionPosicion[]`, `@@index([formacionTipo])`.

### `PlantillaFormacionPosicion` (nueva)
- `id` PK, `plantillaId` (FK), `posicion String` (ej. "ARQ", "EXTREMO DERECHO"), `esTitular Boolean`, `x Int?`, `y Int?` (0..100), `orden Int`, `@@unique([plantillaId, orden])`.

### `FormacionInstancia` (nueva — snapshot histórico de uso en partido)
- `id` PK, `formacionId?` (FK, plantilla de origen, nullable), `partidoId` (FK `Partido`, obligatorio), `nombre`, `formacionTipo`, `esquema String?`, `fecha`, `jugadores FormacionInstanciaJugador[]`, `@@unique([formacionId, partidoId])`, `@@index([partidoId])`.

### `FormacionInstanciaJugador` (nueva)
- `id` PK, `formacionInstanciaId` (FK), `jugadorId` (FK `Jugador`, identidad), `nombreSnapshot String`, `dorsalSnapshot Int?`, `posicion String`, `esTitular Boolean`, `x Int?`, `y Int?`, `orden Int`, `@@unique([formacionInstanciaId, jugadorId])`, `@@index([jugadorId])`.

## Sistemas tácticos

- `esquema` es texto libre → nunca limita a predefinidos (sistemas personalizados válidos).
- `PlantillaFormacion` cataloga los sistemas con coordenadas iniciales normalizadas. Seed:
  - F5: 1-2-1, 2-1-1 · F7: 3-2-1, 2-3-1, 2-2-2 · F8: 3-3-1, 2-3-2 · F9: 3-3-2, 3-2-3 · F11: 4-4-2, 4-3-3, 4-2-3-1, 3-5-2, 5-3-2.
- El usuario elige una plantilla → se crea la formación con las posiciones y (x,y) iniciales → después mueve jugadores libremente (editor en fase posterior).

## Posiciones

- **Habitual**: `Jugador.posicionFavorita` / `EquipoJugador.posiciones` — NO se modifica.
- **En la formación**: `FormacionJugador.posicion` (String), independiente.

## Coordenadas visuales

- `x Int?`, `y Int?` normalizados 0..100. Independientes de resolución. El editor gráfico (drag & drop) NO se implementa en FASE 5; solo se persisten.

## Titulares / suplentes

- `esTitular Boolean` (TITULAR/SUPLENTE).
- Reglas: no duplicar jugador (unique); titular/suplente excluyentes por construcción; el jugador debe pertenecer al equipo; **BAJA e INVITADO bloqueados**; **INACTIVO/LESIONADO/SUSPENDIDO permitidos** (decisión táctica). La formación jamás modifica `EquipoJugador.estado`.

## Formación sin partido / con partido

- Sin partido: `partidoId = null` (válida, ej. "11 ideal 2026").
- Con partido: vínculo opcional `Formacion.partidoId` (ya existe) + creación de `FormacionInstancia` al asociar.

## Snapshot / historial

- **Formación guardada** = `Formacion` + `FormacionJugador` → editable.
- **Formación usada en un partido** = `FormacionInstancia` + `FormacionInstanciaJugador` → inmutable (snapshot con `nombreSnapshot` y `dorsalSnapshot` del momento).
- Al asociar una plantilla a un partido se copia el estado actual a la instancia. Editar la plantilla jamás altera la instancia → "el partido de ayer NO cambia".
- Alternativa evaluada (rechazada): congelar la plantilla + clonar al editar; impide reutilizar una plantilla en varios partidos y complica el snapshot del dorsal.

## Clonado

- `POST /formaciones/:id/clonar` → nueva `Formacion` + filas `FormacionJugador` copiadas (ids nuevos). Original intacta. Auditado.

## Privacidad

- `publicada Boolean @default(false)` → privada por defecto.
- Solo aparece públicamente si `publicada = true` (endpoint público de solo lectura mínimo). No en búsquedas ni endpoints públicos sin publicación explícita.

## Permisos

Verificación siempre `usuario → EquipoUsuario → equipo → formación`.

| Acción | DELEGADO | TECNICO | AUXILIAR | JUGADOR | PÚBLICO |
|---|---|---|---|---|---|
| Crear / editar / clonar / asociar a partido / publicar | ✔ | ✔ | ✖ | ✖ | ✖ |
| Eliminar | ✔ | ✖ | ✖ | ✖ | ✖ |
| Consultar | ✔ | ✔ | ✔ (miembro) | ✔ (sus equipos) | ✔ (solo publicadas) |

Permisos shared: `formacionesGestionar` (existe) + `formacionesVer` (nuevo, para AUXILIAR/JUGADOR/ADMINISTRADOR). Backend comprueba rol por equipo con `puedeEnEquipo`.

## Auditoría

`AuditoriaLog` para: creación, modificación, eliminación, clonación, asociación a partido, publicación/despublicación. Sin datos sensibles.

## Compartir

Sin WhatsApp. Los datos para la futura tarjeta quedan modelados (escudo, nombre, rival, cancha, fecha, sistema, titulares/suplentes, dorsales, posiciones).

## Cambios de schema

1. `Formacion`: `publicada`, `@@index([partidoId])`, `instancias[]`.
2. `FormacionJugador`: `x`, `y`.
3. Nuevos: `PlantillaFormacion`, `PlantillaFormacionPosicion`, `FormacionInstancia`, `FormacionInstanciaJugador` (+ relación inversa en `Partido.formacionInstancias`).
4. Seed del catálogo de sistemas.
5. `shared`: `formacionesVer`, `TIPOS_FORMACION`, validaciones de coordenadas.

## No implementar en FASE 5

Editor gráfico drag & drop, imágenes/tarjetas, WhatsApp, convocatorias, sustituciones, estadísticas, fixture, módulo completo de partidos.

## Separación de fases

**FASE 5:** migración + seed + backend (CRUD, clonar, asociar a partido con snapshot, publicar, permisos, auditoría) + tests + frontend básico (listar, crear/editar sin editor gráfico, ver, clonar, publicar). CHANGELOG `[0.5.0]`.

**Fases posteriores:** editor gráfico, tarjeta/WhatsApp, convocatorias (6), partidos completos (7), sustituciones y estadísticas (9).
