# FASE 7 — Partidos: diseño

Estado: **REVISIÓN PENDIENTE**. Base: commit `0c4469f`.

---

## 1. Estado actual del schema

`Partido` (existe desde FASE 1, sin endpoints propios todavía):

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | — |
| `tipo` | `TipoPartido` enum | OFICIAL, AMISTOSO, ENTRENAMIENTO, INTERNO, INFORMAL, OTRO |
| `equipoResponsableId` | UUID FK → `Equipo` | Quién creó/gestiona el partido (nullable) |
| `torneoId` | UUID FK → `Torneo` | Torneo al que pertenece (nullable) |
| `temporadaId` | UUID FK → `Temporada` | (nullable) |
| `torneoCategoriaId` | UUID FK → `TorneoCategoria` | (nullable) |
| `zonaId` | UUID FK → `Zona` | (nullable) |
| `equipoLocalId` | UUID FK → `Equipo` | (nullable) |
| `equipoVisitanteId` | UUID FK → `Equipo` | (nullable) |
| `jornadaId` | UUID FK → `Jornada` | (nullable) |
| `fechaHora` | DateTime (obligatorio) | Fecha y hora |
| `lugar` | String? | Cancha/lugar |
| `estado` | `EstadoPartido` enum | PROGRAMADO, EN_CURSO, FINALIZADO, SUSPENDIDO, APLAZADO |
| `golesLocal` | Int? | Resultado |
| `golesVisitante` | Int? | Resultado |
| `observaciones` | String? | Notas |
| `convocatorias[]` | FK inversa | Convocatorias asociadas (F6) |
| `formaciones[]` | FK inversa | Formaciones asociadas (F1) |
| `formacionInstancias[]` | FK inversa | Instancias snapshot (F5) |
| `sanciones[]` | FK inversa | Sanciones del partido (F1) |

Índices: `equipoLocalId`, `equipoVisitanteId`, `torneoId`, `temporadaId`, `fechaHora`, `jornadaId`, `equipoResponsableId+tipo`.

### Modelos ya relacionados

- **`FormacionInstancia`** (F5): FK `partidoId` obligatoria. Snapshot inmutable de la formación usada en el partido (con `dorsalSnapshot`, `nombreSnapshot`). Al cerrar o editar la formación, la instancia NO cambia.
- **`Convocatoria`** (F6): FK `partidoId?` opcional. Convocatoria de jugadores para el partido.
- **`Sancion`** (F1): FK `partidoId?` opcional. Tarjetas, suspensiones originadas en el partido.
- **`Jornada`** (F3): `torneoCategoriaId`, `zonaId?`, `numero`, `estado`. Agrupa partidos de un fixture.

### Funcionalidad existente que referencia Partido

- **formaciones.ts**: `asociar-partido` crea `FormacionInstancia` con `partidoId`. `validarPartido()` verifica que el partido involucre al equipo.
- **convocatorias.ts**: `validarPartido()` misma verificación. `partidoId` opcional en el body de crear.
- **seed.ts**: `crearPartido(equipoId)` crea un partido AMISTOSO con `equipoResponsableId = equipoLocalId = equipoId` y `fechaHora = now()`.

**No existen rutas CRUD para Partido. Se implementan en esta fase.**

---

## 2. Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/partidos` | Crear partido |
| `GET` | `/partidos` | Listar (scoped por equipos del usuario + torneos + públicas) |
| `GET` | `/partidos/:id` | Detalle con formacionInstancias, convocatorias (si corresponde) |
| `PATCH` | `/partidos/:id` | Editar fecha/lugar/observaciones/arbitro (solo PROGRAMADO/APLAZADO) |
| `POST` | `/partidos/:id/estado` | Transición de estado: `{ estado }` |
| `POST` | `/partidos/:id/resultado` | Cargar resultado: `{ golesLocal, golesVisitante }` (EN_CURSO → FINALIZADO) |
| `GET` | `/equipos/:id/partidos` | Partidos de un equipo |
| `GET` | `/publico/partidos` | Partidos `publicada = true` (sin auth) |
| `GET` | `/publico/partidos/:id` | Detalle público |

No se implementa DELETE físico. El partido se da de baja transicionando a `SUSPENDIDO`.

---

## 3. Permisos

Reusar RBAC + `puedeEnEquipo` / `requiereRolEnEquipo`. Permisos globales existentes: `partidosVer`, `partidosCargarResultados`.

| Acción | DELEGADO | TECNICO | AUXILIAR | JUGADOR | PÚBLICO | ADMIN (torneo) |
|---|---|---|---|---|---|---|
| Crear partido | ✔ (sus equipos) | ✔ (sus equipos) | ✖ | ✖ | ✖ | ✔ (oficiales) |
| Editar (estado PROGRAMADO/APLAZADO) | ✔ (resp.) | ✔ (resp.) | ✖ | ✖ | ✖ | ✔ (oficiales) |
| Cambiar estado / cargar resultado | ✔ (resp.) | ✔ (resp.) | ✖ | ✖ | ✖ | ✔ (oficiales) |
| Ver detalle | ✔ | ✔ | ✔ (miembro) | ✔ (sus equipos) | ✔ (publicadas) | ✔ |

- **resp.** = equipoResponsable del partido (puedeEnEquipo(equipoResponsableId, 'DELEGADO','TECNICO')).
- Para partidos oficiales: ADMIN del torneo también puede gestionar.
- Superadmin global en todo.

---

## 4. Reglas de negocio

### Estados y transiciones

```
PROGRAMADO → EN_CURSO, SUSPENDIDO, APLAZADO
EN_CURSO → FINALIZADO, SUSPENDIDO
APLAZADO → PROGRAMADO, SUSPENDIDO
SUSPENDIDO → PROGRAMADO
FINALIZADO → (sin salida)
```

- Transición a `FINALIZADO` **requiere** `golesLocal` y `golesVisitante` definidos (>= 0).
- Mismo estado → 409.
- Cada transición auditada (`cambioDeEstado: { de, a }`).

### Resultado

- `POST /partidos/:id/resultado { golesLocal, golesVisitante }`:
  - Si `estado == EN_CURSO` → transiciona automáticamente a `FINALIZADO`.
  - Si `estado == PROGRAMADO` → solo actualiza goles (precarga), NO cambia estado.
  - Si `estado == FINALIZADO` → 409 (ya cerrado).
  - `goles` >= 0 obligatorio.

### Validaciones de torneo (partidos OFICIALES)

- Si `tipo == OFICIAL` → `torneoId` y `temporadaId` **obligatorios**.
- `torneoCategoriaId` debe pertenecer a la `temporadaId` indicada.
- `zonaId` debe pertenecer al `torneoCategoriaId`.
- `jornadaId` debe pertenecer al `torneoCategoriaId` (y `zonaId` si aplica).
- `equipoLocalId` y `equipoVisitanteId` **deben ser distintos**.
- Ambos equipos deben tener `EquipoParticipacion` **CONFIRMADO** en la misma `temporadaId` y `torneoCategoriaId` (si se especifica).

### Partidos independientes

- `tipo IN (AMISTOSO, ENTRENAMIENTO, INTERNO, INFORMAL, OTRO)` → campos de torneo **opcionales**.
- `equipoLocal` y `equipoVisitante` pueden ser cualquier equipo (no se validan participaciones).
- Siguen siendo distintos entre sí.
- `equipoResponsableId` se auto-asigna al `equipoLocalId` si no se envía en el body.

### Relación con FormacionInstancia (F5)

- Al asociar una formación al partido (`POST /formaciones/:id/asociar-partido`, ya existe) se crea la instancia snapshot. El cierre del partido (FINALIZADO) **no la modifica**.
- Al obtener el detalle del partido se incluyen las instancias (formación usada en ese partido), con sus jugadores snapshot.

### Relación con Convocatoria (F6)

- Las convocatorias ya tienen `partidoId?`. Al crear/ver un partido, se pueden listar sus convocatorias.
- Al cerrar el partido las convocatorias **no se modifican** (fueron decisiones logísticas previas).

---

## 5. Cambios de schema propuestos

2 campos nuevos en `Partido`. Ningún modelo nuevo. Ninguna FK nueva.

| Modelo | Campo | Tipo | Default | Motivo |
|---|---|---|---|---|
| `Partido` | `publicada` | `Boolean` | `false` | Visibilidad pública |
| `Partido` | `arbitro` | `String?` | `null` | Nombre del árbitro (texto libre, sin modelo) |

---

## 6. Backend

- Nuevo archivo `src/routes/partidos.ts`. Registrado en `app.ts`.
- Helpers: `validarPartidoTorneo(prisma, tipo, torneoId, ...)` — validación de contexto de torneo.
- `puedeGestionarPartido(prisma, auth, partido)` → super || admin del torneo (si oficial) || puedeEnEquipo(responsable, DELEGADO/TECNICO).
- `puedeVerPartido(prisma, auth, partido)` → super || admin torneo || miembro equipo || jugador equipo || publicada.
- Máquina de estados en `src/partidos/estados.ts` (como `src/torneos/estados.ts`).
- Reutilizar `crearPartido` del seed como helper en rutas? No — el seed es para tests. La ruta implementa su propio create con validaciones.
- Auditoría: CREATE, UPDATE, cambio de estado, resultado.

---

## 7. Frontend

- `/partidos` — listar partidos del usuario (por equipos, filtro por tipo/estado).
- `/partidos/:id` — detalle: datos, estado actual + botones de transición, resultado, formaciones usadas (instancias), convocatorias.
- Crear partido: formulario con tipo, equipos local/visitante, fecha/hora, lugar, torneo opcional.
- Sin editor de fixture (FASE 8). Sin tabla de posiciones (FASE 8).

---

## 8. Tests (~20 escenarios)

1. Crear partido independiente (AMISTOSO) con equipos distintos.
2. Crear partido OFICIAL con torneoId/temporadaId obligatorios.
3. OFICIAL sin torneo → 400.
4. Validar EquipoParticipacion CONFIRMADO para torneo.
5. Equipos iguales → 400.
6. Transición PROGRAMADO → EN_CURSO → FINALIZADO.
7. Resultado: set goles en EN_CURSO → FINALIZADO automático.
8. Resultado en FINALIZADO → 409.
9. Goles negativos → 400.
10. PROGRAMADO → APLAZADO → PROGRAMADO.
11. SUSPENDIDO → PROGRAMADO.
12. DELEGADO gestiona partido de su equipo (resp.).
13. DELEGADO otro equipo no gestiona (403).
14. JUGADOR ve partido de su equipo.
15. Publicar + endpoint público.
16. Partido oficial: ADMIN del torneo gestiona.
17. FormacionInstancia no cambia al cerrar partido.
18. Convocatoria asociada se lista en detalle.
19. Auditoría de creación, estado, resultado.
20. JornadaId debe pertenecer al torneoCategoriaId.

---

## 9. Riesgos / decisiones pendientes

1. **Árbitros**: se propone `Partido.arbitro String?` (texto libre). No se crea modelo `Arbitro` porque el sistema actual no gestiona personas externas. Si más adelante se necesita (historial, sanciones asignadas por árbitro), se podrá migrar a un modelo con FK a `Usuario` o `Persona`. **Decisión: campo simple. ¿Aprobás?**

2. **Fixture generator**: NO implementado en FASE 7. Las jornadas y partidos de torneo se crean manualmente. El fixture automático (round-robin, fechas, descansos) es FASE 8. El modelo `Jornada` ya está preparado (FASE 3).

3. **Tabla de posiciones**: NO en FASE 7. Se calcula a partir de los resultados de partidos OFICIALES FINALIZADOS usando `ConfiguracionCompetencia.sistemaPuntos` y `desempates`. FASE 8.

4. **Sanciones**: NO se implementan en FASE 7 como flujo propio. El modelo `Sancion` ya existe y referencia `partidoId`. En esta fase solo se listan las sanciones asociadas en el detalle del partido; la creación/edición de sanciones es fase posterior.

5. **`publicada` vs público**: los partidos OFICIALES de un torneo con `visiblePublico = true` podrían heredar publicación automática. Para FASE 7, la publicación es manual (`publicada` en el Partido). No se hereda del torneo automáticamente. **Decisión: manual. ¿Aprobás?**

---

## 10. Qué entra en FASE 7

- Schema: `publicada` + `arbitro` en `Partido`. Migración.
- Backend: CRUD partidos, estado, resultado, listados, endpoint público.
- Permisos: DELEGADO/TECNICO gestionan los de su equipo; ADMIN torneo gestiona oficiales.
- Audit: create, update, cambio de estado, resultado.
- Validaciones: torneo, participaciones, equipos distintos, estados, goles.
- Frontend: listado, detalle, crear, cargar resultado, cambiar estado.
- Tests: ~20 escenarios.
- CHANGELOG `[0.7.0]`.

## 11. Qué queda para FASE 8/9

- Fixture automático (generar jornadas/partidos desde `ConfiguracionCompetencia`).
- Tabla de posiciones calculada.
- Estadísticas (goleadores, tarjetas, minutos, sustituciones).
- Sanciones completas.
- Partido en vivo con eventos.
