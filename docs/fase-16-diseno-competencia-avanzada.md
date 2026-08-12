# FASE 16 - Competencia avanzada: diseño propuesto

Estado: DECISIONES DE ALCANCE APROBADAS; SCHEMA PENDIENTE DE APROBACION EXPLICITA. Este documento no autoriza cambios de schema, migraciones ni código.

## 0. Decisiones aprobadas

- 16A implementará grupos y eliminación directa a partido único, BYE, seed manual y avance seguro.
- 16B implementará clasificación automática, híbridos y mejores terceros; 16C ida/vuelta, global, tercer puesto y definición deportiva.
- `Zona` no representa grupo avanzado. Se crean modelos específicos y se reutilizan `Partido`, `Jornada` y `EquipoParticipacion`.
- No habrá partido/equipo paralelo ni tabla persistida.
- Correcciones y regeneración se bloquean estrictamente ante descendientes o actividad histórica.
- Empate de eliminatoria queda pendiente de definición; resolución administrativa explícita es admisible solo si queda modelada, confirmada y auditada.
- `.gitattributes` queda para mantenimiento separado, sin renormalización masiva ni migraciones históricas.

## 1. Decisión y alcance recomendado

Competencia avanzada debe ser siguiente iniciativa funcional: `FormatoCompetencia` ya declara sus formatos, pero FASE 8 rechaza todo excepto `TODOS_CONTRA_TODOS`, `UNA_RUEDA` y `DOS_RUEDAS`.

No conviene una única FASE 16. Combinar motor de grupos, árbol eliminatorio, clasificación, resultados globales y corrección histórica en una entrega aumentaría mucho el riesgo de alterar partidos oficiales. Propuesta:

| Entrega | Incluye | No incluye |
|---|---|---|
| 16A | Modelo relacional de fases/llaves, grupos, eliminación directa a partido único, BYE, avance seguro, tablas de grupo, público/RBAC/auditoría | Ida/vuelta, mejores terceros, ligas con fase final |
| 16B | Clasificación automática grupos a playoffs, liga/fase regular a fase final, reglas de seeding y mejores terceros explícitos | Ida/vuelta |
| 16C | Ida/vuelta, global, tercer puesto configurable y definición de empates globales | Penales sin modelo aprobado |

La aprobación requerida ahora es si 16A debe empezar por **grupos + eliminación directa a partido único**. Los nombres de enum restantes siguen reservados, no implementados.

## 2. Auditoría real actual

### Reutilizable

- Jerarquía: `Organizacion -> Torneo -> Temporada -> TorneoCategoria -> Zona`.
- Inscripción: `EquipoParticipacion` conserva alta/baja e incorpora categoría/zona.
- Reglas: `ConfiguracionCompetencia` ya tiene `formato`, puntos, desempates y `configuracionFormato` JSON; `@controlliga/shared` valida una forma mínima de fases, no sus invariantes.
- Calendario: `Jornada`, `JornadaEquipoDescanso` y `Partido` oficial con contexto completo.
- Resultado/historial: `Partido` no reabre FINALIZADO; eventos, formaciones snapshot, convocatorias y sanciones dependen del partido.
- Tabla: se calcula, no persiste, desde oficiales FINALIZADOS por competencia/zona; soporta mini-tabla H2H incluso múltiple.
- Seguridad: `esAdminDeTorneo`, `puedeVerTorneo`, permisos `torneos:administrar`, `torneos:ver`, auditoría y publicación por `Partido.publicada`.

### Limitaciones

- `Zona` sirve para grupos, pero no expresa fase, orden de grupo ni clasificación.
- `Jornada.numero` solo ordena calendario; no identifica ronda/eliminatoria ni vincula cruces.
- `Partido` no conoce llave, serie, fase, orden de partido de ida/vuelta, condición de clasificación ni ganador resultante.
- No existe resultado de definición distinto de goles oficiales: no se pueden representar penales, global, walkover o criterio de desempate de serie con integridad.
- `configuracionFormato` es insuficiente como fuente de verdad para llaves: JSON no aporta FK, snapshot ni bloqueo histórico.
- FASE 8 puede regenerar solo fixture virgen; no hay versiones de competencia.

## 3. Modelo conceptual y schema Prisma exacto propuesto

```text
TorneoCategoria
  └─ FaseCompetencia (orden, tipo, estado, reglas snapshot)
       ├─ GrupoCompetencia (solo GRUPOS)
       │    └─ EquipoParticipacion asignada a grupo
       ├─ RondaEliminatoria (solo ELIMINACION)
       │    └─ LlaveCompetencia
       │         ├─ participante A / B: participación o origen clasificado
       │         ├─ Partido existente (uno o dos)
       │         └─ ganador -> siguiente llave / posición
       └─ jornadas y partidos existentes
```

### Enums propuestos

```prisma
enum TipoFaseCompetencia {
  GRUPOS
  ELIMINACION_DIRECTA
  LIGA
}

enum EstadoFaseCompetencia {
  BORRADOR
  GENERADA
  EN_CURSO
  FINALIZADA
  BLOQUEADA
}

enum EstadoLlaveCompetencia {
  PENDIENTE_PARTICIPANTES
  PROGRAMADA
  EN_CURSO
  PENDIENTE_DEFINICION
  RESUELTA
  BYE
  BLOQUEADA
}

enum TipoOrigenLlave {
  SEED
  GANADOR_LLAVE
  PERDEDOR_LLAVE
  ASIGNACION_ADMINISTRATIVA
}

enum MetodoResolucionLlave {
  RESULTADO_PARTIDO
  BYE
  ADMINISTRATIVA
}
```

`LIGA`, `PERDEDOR_LLAVE` y `ASIGNACION_ADMINISTRATIVA` quedan reservados para 16B/16C o la operación administrativa aprobada; no habilitan esos formatos en 16A.

### Modelos y relaciones propuestos

```prisma
model FaseCompetencia {
  id                  String                 @id @default(uuid()) @db.Uuid
  torneoCategoriaId   String                 @db.Uuid
  torneoCategoria     TorneoCategoria        @relation(fields: [torneoCategoriaId], references: [id], onDelete: Restrict)
  orden               Int
  nombre              String
  tipo                TipoFaseCompetencia
  estado              EstadoFaseCompetencia  @default(BORRADOR)
  configuracion       Json
  sistemaPuntos       Json?
  desempates          Json?
  grupos              GrupoCompetencia[]
  rondas              RondaEliminatoria[]
  createdAt           DateTime               @default(now())
  updatedAt           DateTime               @updatedAt

  @@unique([torneoCategoriaId, orden])
  @@index([torneoCategoriaId, estado])
  @@map("fases_competencia")
}

model GrupoCompetencia {
  id                  String             @id @default(uuid()) @db.Uuid
  faseCompetenciaId   String             @db.Uuid
  faseCompetencia     FaseCompetencia    @relation(fields: [faseCompetenciaId], references: [id], onDelete: Restrict)
  orden               Int
  nombre              String
  participaciones     EquipoParticipacion[]
  jornadas            Jornada[]
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt

  @@unique([faseCompetenciaId, orden])
  @@unique([faseCompetenciaId, nombre])
  @@index([faseCompetenciaId])
  @@map("grupos_competencia")
}

model RondaEliminatoria {
  id                  String             @id @default(uuid()) @db.Uuid
  faseCompetenciaId   String             @db.Uuid
  faseCompetencia     FaseCompetencia    @relation(fields: [faseCompetenciaId], references: [id], onDelete: Restrict)
  orden               Int
  nombre              String
  llaves              LlaveCompetencia[]
  createdAt           DateTime           @default(now())
  updatedAt           DateTime           @updatedAt

  @@unique([faseCompetenciaId, orden])
  @@index([faseCompetenciaId])
  @@map("rondas_eliminatorias")
}

model LlaveCompetencia {
  id                       String                    @id @default(uuid()) @db.Uuid
  rondaEliminatoriaId      String                    @db.Uuid
  rondaEliminatoria        RondaEliminatoria         @relation(fields: [rondaEliminatoriaId], references: [id], onDelete: Restrict)
  orden                    Int
  participacionLocalId     String?                   @db.Uuid
  participacionLocal       EquipoParticipacion?      @relation("LlaveLocal", fields: [participacionLocalId], references: [id], onDelete: Restrict)
  participacionVisitanteId String?                   @db.Uuid
  participacionVisitante   EquipoParticipacion?      @relation("LlaveVisitante", fields: [participacionVisitanteId], references: [id], onDelete: Restrict)
  seedLocal                Int?
  seedVisitante            Int?
  origenLocalTipo          TipoOrigenLlave?
  origenLocalLlaveId       String?                   @db.Uuid
  origenLocalLlave         LlaveCompetencia?         @relation("OrigenLocal", fields: [origenLocalLlaveId], references: [id], onDelete: Restrict)
  origenVisitanteTipo      TipoOrigenLlave?
  origenVisitanteLlaveId   String?                   @db.Uuid
  origenVisitanteLlave     LlaveCompetencia?         @relation("OrigenVisitante", fields: [origenVisitanteLlaveId], references: [id], onDelete: Restrict)
  llaveSiguienteId         String?                   @db.Uuid
  llaveSiguiente           LlaveCompetencia?         @relation("LlaveSiguiente", fields: [llaveSiguienteId], references: [id], onDelete: Restrict)
  ladoSiguiente            String?
  ganadorParticipacionId   String?                   @db.Uuid
  ganadorParticipacion     EquipoParticipacion?      @relation("LlaveGanador", fields: [ganadorParticipacionId], references: [id], onDelete: Restrict)
  estado                   EstadoLlaveCompetencia    @default(PENDIENTE_PARTICIPANTES)
  metodoResolucion         MetodoResolucionLlave?
  partidos                 Partido[]
  origenLocalDe            LlaveCompetencia[]        @relation("OrigenLocal")
  origenVisitanteDe        LlaveCompetencia[]        @relation("OrigenVisitante")
  anteriores               LlaveCompetencia[]        @relation("LlaveSiguiente")
  createdAt                DateTime                  @default(now())
  updatedAt                DateTime                  @updatedAt

  @@unique([rondaEliminatoriaId, orden])
  @@index([rondaEliminatoriaId, estado])
  @@index([llaveSiguienteId])
  @@index([participacionLocalId])
  @@index([participacionVisitanteId])
  @@map("llaves_competencia")
}
```

### Cambios exactos a modelos existentes

```prisma
model TorneoCategoria {
  // relación nueva
  fasesCompetencia FaseCompetencia[]
}

model EquipoParticipacion {
  grupoCompetenciaId String?
  grupoCompetencia   GrupoCompetencia? @relation(fields: [grupoCompetenciaId], references: [id], onDelete: Restrict)
  llavesLocal        LlaveCompetencia[] @relation("LlaveLocal")
  llavesVisitante    LlaveCompetencia[] @relation("LlaveVisitante")
  llavesGanadas      LlaveCompetencia[] @relation("LlaveGanador")

  @@index([grupoCompetenciaId])
}

model Jornada {
  grupoCompetenciaId String?
  grupoCompetencia   GrupoCompetencia? @relation(fields: [grupoCompetenciaId], references: [id], onDelete: Restrict)

  @@index([grupoCompetenciaId])
}

model Partido {
  llaveCompetenciaId String?
  llaveCompetencia   LlaveCompetencia? @relation(fields: [llaveCompetenciaId], references: [id], onDelete: Restrict)

  @@index([llaveCompetenciaId])
}
```

`onDelete: Restrict` es deliberado: la aplicación solo borra/regenera estructura virgen dentro de transacción; la base impide borrar fase/grupo/llave que ya tiene relaciones históricas. Las nullables preservan todo partido, jornada y participación existentes.

### Snapshot de reglas: decisión

Para grupos, `FaseCompetencia.sistemaPuntos` y `desempates` son snapshots obligatorios al generar la fase, copiados desde `ConfiguracionCompetencia`. `configuracion` conserva forma, cantidad de grupos y ruedas. No se vuelve a leer la configuración mutable para recalcular grupos generados. Antes de generar, la configuración de competencia sigue siendo editable bajo reglas actuales; después, fase usa snapshot.

### BYE, seeds, orígenes y empate

- BYE: `LlaveCompetencia` tiene un solo `participacion*Id`, su seed, `estado=BYE`, `ganadorParticipacionId` igual a esa participación y `metodoResolucion=BYE`; el lado vacío nunca genera `Partido`.
- Seed: `seedLocal/seedVisitante` se congelan en la llave de primera ronda. Validación de servicio exige un seed entero único por participación de fase antes de generar; no hay modelo de seed separado.
- Origen: siguiente llave apunta a llaves previas con `origenLocalLlaveId`/`origenVisitanteLlaveId` y tipo `GANADOR_LLAVE`. Esto conserva procedencia, a diferencia de copiar IDs sin rastro.
- Ganador: FK `ganadorParticipacionId`, `metodoResolucion=RESULTADO_PARTIDO` tras resultado inequívoco; alimenta siguiente llave solo si está virgen.
- Empate: `estado=PENDIENTE_DEFINICION`, ganador null, ningún avance. Una resolución administrativa futura usaría `metodoResolucion=ADMINISTRATIVA`, actor, motivo obligatorio y AuditoriaLog; requiere endpoint separado con confirmación. No se debe habilitar en 16A sin aprobación final de ese endpoint.

- `TipoFaseCompetencia`: `GRUPOS`, `ELIMINACION_DIRECTA`, `LIGA`.
- `EstadoFaseCompetencia`: `BORRADOR`, `GENERADA`, `EN_CURSO`, `FINALIZADA`, `BLOQUEADA`.
- `FaseCompetencia`: FK `torneoCategoriaId`, `orden`, tipo, estado, nombre, configuración snapshot JSON validada; unique `(torneoCategoriaId, orden)`.
- `GrupoCompetencia`: FK fase, `orden`, nombre; unique `(faseId, orden)`.
- Agregar `grupoCompetenciaId` nullable a `EquipoParticipacion`. Reutiliza participación sin duplicar equipo; `Zona` queda compatible como división actual, no se reutiliza como grupo de fase porque una participación puede cruzar a otra fase sin cambiar su zona histórica.
- `RondaEliminatoria`: FK fase, `orden`, nombre deportivo (`OCTAVOS`, `CUARTOS`, `SEMIFINAL`, `FINAL`, `TERCER_PUESTO`), cantidad de partidos por llave.
- `LlaveCompetencia`: FK ronda; `orden`; `participacionLocalId`/`participacionVisitanteId` nullable; `origenLocal`/`origenVisitante` JSON mínimo solo para referencia de clasificación hasta resolver; `ganadorParticipacionId`; `siguienteLlaveId` nullable y lado siguiente; `estado`. Uniques por ronda/orden y FK de ganador.
- Agregar `llaveCompetenciaId` nullable a `Partido`. Un partido pertenece a máximo una llave; partidos existentes permanecen null.

No crear tabla persistida, equipo paralelo ni partido paralelo. No agregar `ResultadoPenales` en 16A: si un eliminatorio empata al finalizar, queda `requiereDefinicionManual` y no avanza. 16C debe definir un modelo explícito de definición, por ejemplo `ResultadoSerie` con goles globales derivados, ganador y `metodoDefinicion` (`GOLES`, `PENALES`, `WALKOVER`, `ADMINISTRATIVA`) antes de habilitar penales.

## 4. Formatos y reglas

### 16A: grupos

- `FASE_DE_GRUPOS`: una fase GRUPOS; 2+ grupos configurados, cada uno genera round-robin reutilizando algoritmo FASE 8 con `grupoCompetenciaId` como ámbito, no mezcla partidos entre grupos.
- 6 equipos: UI exige partición explícita compatible, por ejemplo 2x3 o 3x2. 2x3 genera una rueda con tres jornadas por grupo y descanso; no inferir formato.
- 10 equipos: 2x5 o 5x2 según elección explícita; evitar reparto implícito desigual salvo aprobación.
- 12 equipos: 2x6, 3x4 o 4x3.
- Tabla y H2H se reutilizan por grupo; puntos/desempates snapshot de fase para evitar que PATCH posterior reordene clasificación.

### 16A: eliminación directa, partido único

- `ELIMINACION_DIRECTA` soporta 4, 8 y 16 participantes y genera cuartos/semis/final según tamaño.
- Seeding ordena participaciones determinísticamente por ranking ingresado y congelado; cruce estándar `1-vs-N`, `2-vs-N-1`.
- Si cantidad no es potencia de dos, bracket se completa a próxima potencia y BYE se asigna a mejores seeds. Ejemplos: 6 -> cuadro de 8 con dos BYE; 10 -> cuadro de 16 con seis BYE.
- BYE no crea Partido; crea `LlaveCompetencia` marcada resuelta y avanza una participación solo si siguiente llave aún no tiene actividad.
- Semifinal -> final se genera al crear cuadro con participantes null/orígenes, pero partidos solo se materializan cuando ambos participantes se resuelven. Esto evita partidos con equipos incorrectos.
- Tercer puesto es excluido en 16A. 16C agrega ronda independiente con perdedores de semifinales, solo si ambas semis se resuelven y el organizador lo configuró.

### 16B: híbridos

- `GRUPOS_PLAYOFFS`: fase grupos seguida por eliminación. Clasifican primeros o primeros/segundos según `clasificanPorGrupo`; seeding se congela al cerrar grupos.
- `LIGA_FASE_FINAL` y `FASE_REGULAR_PLAYOFFS`: fase LIGA reutiliza FASE 8; luego una fase eliminación con posiciones finales como origen.
- Mejores terceros no entra en 16A: exige comparar grupos con diferente tamaño y reglas de ranking (`PTS/PJ`, criterios habilitados, exclusión de resultados contra último). Debe ser una opción explícita 16B y almacenar snapshot de cálculo.

### 16C: ida/vuelta y tercer puesto

- Ronda configurada a uno o dos partidos. Ida/vuelta crea dos `Partido` de misma llave con `ordenSerie` 1/2; localía se invierte.
- Ganador por global se deriva solo cuando ambos partidos FINALIZADOS. Empate global bloquea avance hasta una definición modelada/auditada; no se inventan penales.
- Tercer puesto puede ser un partido único; no debe bloquear final.

## 5. Clasificación, seeding y correcciones

- La clasificación siempre proviene de tabla calculada de grupo/fase con snapshot de reglas de fase.
- Primeros/segundos: reglas por posición y grupo, auditadas al materializar clasificadas.
- Empate de puntos/múltiple/H2H: mismo algoritmo FASE 8. Si termina `desempateResuelto=false`, fase queda bloqueada y requiere acción administrativa explícita; no usar UUID/nombre como desempate deportivo.
- Seeding manual solo antes de generar ronda y con lista completa sin duplicados. Seeding automático usa posiciones snapshot.
- Resultado corregido: mientras ningún partido descendiente existe, está EN_CURSO, FINALIZADO, tiene eventos, convocatoria o `FormacionInstancia`, se puede recalcular clasificación mediante operación explícita, transaccional y auditada. Si hay cualquier dependencia descendiente, responder `409 llave_historica_bloqueada`; no mover equipos silenciosamente.
- Partido FINALIZADO ya no reabre en FASE 7. Corrección posterior requiere flujo administrativo nuevo, fuera de 16A, que preserve resultado previo/auditoría y ejecute la misma regla de bloqueo descendente.

## 6. Generación, regeneración e integridad

- Generar solo en `Temporada.BORRADOR/PUBLICADO`, con participaciones CONFIRMADO, configuración válida y administrador del torneo/SUPERADMIN.
- Operación transaccional serializable por fase. Materializar fases/rondas/llaves y partidos de primera ronda; auditar configuración snapshot, seeds, BYE y orígenes.
- Regenerar solo una fase GENERADA completamente virgen: todos sus partidos PROGRAMADO, sin goles, eventos, formaciones, convocatorias, sanciones ni descendientes resueltos. Misma seguridad FASE 8, más dependencia de llaves.
- Nunca modificar partido histórico, `FormacionInstancia`, convocatoria, evento, estadística o sanción. Bloquear, no borrar selectivamente, ante historial.
- Fixture round-robin FASE 8 existente no cambia: formatos actuales mantienen ruta/servicio y `llaveCompetenciaId = null`.

## 7. Integración

- FASE 7: `Partido` oficial sigue fuente de fecha, estado y goles. Para partido de llave, su contexto torneo/temporada/categoría se conserva y añade FK de llave.
- FASE 8: algoritmo y tabla se extraen a función parametrizada por conjunto de participaciones/fase-grupo; no cambiar consultas históricas por zona.
- FASE 9: eventos y estadísticas siguen por `Partido`; goles oficiales deben coincidir antes de finalizar. No calcular minutos.
- Formaciones/convocatorias: solo se crean cuando partido con participantes definitivos existe; nunca se reescriben por avance/corrección.
- Sanciones: validación actual por partido/equipo se mantiene. Elegibilidad por sanción para una llave es posterior; 16A no excluye automáticamente jugadores/equipos.

## 8. API, portal y frontend futuros

Administración:

- `POST /torneo-categorias/:id/fases/validar`
- `POST /torneo-categorias/:id/fases/generar`
- `POST /fases-competencia/:id/regenerar`
- `GET /torneo-categorias/:id/competencia-avanzada`
- `POST /llaves/:id/resolver-avance` solo para caso manual bloqueado, con confirmación/auditoría; no entra 16A salvo aprobación.

Público:

- `GET /publico/torneo-categorias/:id/fases`
- Datos limitados a fases, grupos, tablas, llaves, partidos publicados y siguiente ronda; respetar torneo visible, configuración pública y equipos no privados.

Frontend admin mobile-first:

- asistente visual: formato, grupos/equipos por grupo, clasificación, seeding, una/dos ruedas, ida/vuelta y tercer puesto según entrega;
- vista previa con validación antes de confirmar;
- árbol navegable sin UUID, alertas de fase bloqueada y confirmación fuerte para generar/regenerar.

Frontend público:

- tabs Grupos / Tabla / Llaves / Resultados; llaves horizontales con scroll controlado y alternativa por ronda en móvil.

## 9. RBAC, publicación y auditoría

- Generar, editar configuración, seeding, avanzar/manual y regenerar: `torneos:administrar` + `esAdminDeTorneo`, SUPERADMIN global.
- Lectura privada: `torneos:ver` + `puedeVerTorneo`.
- DELEGADO/TECNICO no administran competencia, pero conservan permisos actuales para sus partidos; backend valida cada operación.
- Público solo ve fases si `visiblePublico` y una nueva bandera de configuración pública, propuesta `mostrarFases`/`mostrarLlaves`, está activa; no publicar automáticamente partidos ni datos privados.
- Auditar configuración, validación, generación, seeds, asignaciones, BYE, clasificación, avance, regeneración, bloqueos y operaciones manuales. Lectura no se audita.

## 10. Tests obligatorios

- Eliminación: 4, 8, 16; 6/10 no potencia de dos con BYE; seed y cruces determinísticos.
- Grupos: 6, 10, 12 equipos y distribución explícita; no duplicados; tabla por grupo.
- Clasificación: primeros, primeros/segundos, empate puntos, H2H múltiple, bloqueo por empate sin criterio; mejores terceros cuando llegue 16B.
- Avance: ganador, semifinal-final, BYE, tercero cuando llegue 16C.
- Series: ida/vuelta, global, empate global bloqueado; definición de penales solo tras modelo aprobado.
- Historial: partido finalizado, corrección, descendiente con convocatoria/formación/eventos/sanciones, regeneración bloqueada.
- Seguridad: tenant ajeno, rol equipo sin admin de torneo, SUPERADMIN, visibilidad pública y equipos privados.
- Regresión: fixture FASE 8 y tabla round-robin existentes sin `LlaveCompetencia` mantienen resultados y endpoints.

## 11. Riesgos y decisiones para aprobar

1. Aprobar división 16A/16B/16C o exigir alcance único.
2. Aprobar grupos como entidad nueva, sin reutilizar `Zona` como grupo de fase.
3. Aprobar bloqueo estricto de correcciones cuando hay descendientes históricos.
4. Aprobar que empate eliminatorio en 16A bloquea avance: sin penales ni ganador inventado.
5. Definir para 16B si soportar mejores terceros y método de comparación.
6. Definir para 16C si ida/vuelta incluye regla de gol visitante (recomendación: no), penales y/o decisión administrativa.
7. Definir si la bandera pública nueva publica estructura de fase sin publicar partidos; recomendación: sí, pero resultados solo si partido está publicado.

## 12. LF/CRLF: propuesta sin aplicar

No existe `.gitattributes`. Propuesta a aprobar, sin renormalización masiva:

```gitattributes
* text=auto
*.ts text eol=lf
*.tsx text eol=lf
*.js text eol=lf
*.json text eol=lf
*.md text eol=lf
*.sql text eol=lf
*.ps1 text eol=crlf
*.bat text eol=crlf
```

Agregarlo solo en un commit aislado de normalización/configuración, sin ejecutar `git add --renormalize .`. Primero validar en clon Windows limpio que las migraciones dejan de aparecer. No cambiar contenido SQL ni regenerar migraciones históricas.

## 13. Migración futura exacta y definición de virginidad

La única migración de 16A sería una nueva migración Prisma, por ejemplo `fase16a_competencia_avanzada`. Debe:

1. crear los cuatro enums y las tablas `fases_competencia`, `grupos_competencia`, `rondas_eliminatorias`, `llaves_competencia`;
2. agregar campos nullable e índices a `equipo_participacion`, `jornadas` y `partidos`;
3. crear todas las FK con `ON DELETE RESTRICT`;
4. no actualizar filas existentes, no inferir grupos/llaves desde zonas/jornadas y no tocar ninguna migración anterior.

Una fase es **virgen** únicamente si todas estas condiciones se cumplen:

- no tiene `Partido` con estado distinto de `PROGRAMADO`, goles, publicación, eventos, convocatorias, `FormacionInstancia` o sanciones;
- no tiene llave resuelta por resultado o administración, salvo BYE creado dentro de la misma generación que se va a reemplazar;
- no tiene una ronda/fase descendiente con participantes materializados, partidos, o actividad;
- no tiene auditoría de operación posterior a su generación que represente seeding/asignación manual distinta de la estructura que se desea regenerar.

La última condición se valida por datos estructurales, no solo por auditoría: la auditoría explica el bloqueo, no se usa como única fuente de verdad. Si alguna condición falla, responder `409 fase_bloqueada` con motivo no sensible. Una operación de recalcular descendientes solo podrá existir después de 16A y deberá comprobar el mismo criterio, de abajo hacia arriba, en una transacción serializable.
