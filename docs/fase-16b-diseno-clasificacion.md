# FASE 16B - Clasificación automática y transición entre fases

Estado: IMPLEMENTADA Y APROBADA.

## 1. Objetivo y límites

16B conecta fases ya existentes mediante clasificación deportiva determinística y trazable:

- grupos a eliminación directa;
- liga/fase regular a playoffs;
- primeros, segundos, posiciones específicas, top general y mejores terceros;
- seeding derivado y congelado;
- invalidación/reclasificación solo cuando toda dependencia destino sea virgen.

Fuera de alcance: ida/vuelta, global, penales, alargue, tercer puesto, sorteos, definición administrativa de empates y cambios de resultados históricos.

## 2. Auditoría de 16A

### Reutilizable sin cambio

- `FaseCompetencia`: orden único por `TorneoCategoria`, tipo, estado, configuración y snapshots de puntos/desempates.
- `GrupoCompetencia` y `EquipoParticipacion.grupoCompetenciaId`: asignación de participantes, jornadas y tabla por grupo.
- `RondaEliminatoria`, `LlaveCompetencia`, `Partido.llaveCompetenciaId`: bracket, seed, BYE, avance desde ganador de llave y trazabilidad intra-bracket.
- `calcularTabla`/`leerReglas`: tabla calculada, no persistida; 16B la usa como fuente de cálculo.
- `Partido`, eventos, convocatorias, `FormacionInstancia`, sanciones y publicación: fuente de actividad/historial.
- `esAdminDeTorneo`, `puedeVerTorneo`, `torneos:administrar`, `torneos:ver`, auditoría y proyección pública endurecida.

### Limitaciones que 16B debe resolver

- Una participación es de torneo/categoría, no de fase; hoy no explica por qué entra en una fase posterior.
- `LlaveCompetencia.origen*LlaveId` solo representa ganador de llave, no puesto de grupo ni ranking general.
- No existe vínculo explícito entre fases ni configuración estructurada de clasificación.
- `LIGA` está reservado en enum, pero no tiene generación de fixture por fase ni participantes de fase.
- No existe snapshot histórico de clasificación/seeds ni estado de clasificación.
- La regeneración 16A revisa historia propia, pero no grafo entre fases.

## 3. Decisión de modelo

No agregar `faseAnteriorId`/`faseSiguienteId` a `FaseCompetencia`: una fase puede alimentar varias fases futuras, y una fase destino puede recibir clasificados de varias fuentes. La relación correcta es una regla de clasificación, con fase origen y destino, más sus resultados materializados.

No copiar `equipoId` ni crear equipos paralelos. Cada clasificado referencia la `EquipoParticipacion` existente y captura snapshot deportivo/origen.

### Enums propuestos

```prisma
enum TipoReglaClasificacion {
  POSICION_GRUPO
  MEJORES_ENTRE_GRUPOS
  POSICION_GENERAL
}

enum EstadoReglaClasificacion {
  BORRADOR
  CLASIFICADA
  INVALIDADA
  BLOQUEADA
}

enum TipoSeedClasificacion {
  ORDEN_CLASIFICACION
  CRUCE_EXPLICITO
}
```

`POSICION_GRUPO` cubre primero/segundo o posición exacta. `MEJORES_ENTRE_GRUPOS` cubre mejores terceros u otra posición elegida entre grupos. `POSICION_GENERAL` cubre liga/fase regular. No se agrega enum para cada nombre comercial.

### Modelos propuestos

```prisma
model ReglaClasificacionFase {
  id                 String                    @id @default(uuid()) @db.Uuid
  faseOrigenId       String                    @db.Uuid
  faseOrigen         FaseCompetencia           @relation("ReglaClasificacionOrigen", fields: [faseOrigenId], references: [id], onDelete: Restrict)
  faseDestinoId      String                    @db.Uuid
  faseDestino        FaseCompetencia           @relation("ReglaClasificacionDestino", fields: [faseDestinoId], references: [id], onDelete: Restrict)
  orden              Int
  tipo               TipoReglaClasificacion
  posicionDesde      Int
  posicionHasta      Int
  cantidad           Int?
  grupoCompetenciaId String?                   @db.Uuid
  grupoCompetencia   GrupoCompetencia?         @relation(fields: [grupoCompetenciaId], references: [id], onDelete: Restrict)
  seedTipo           TipoSeedClasificacion
  seedInicio         Int
  configuracion      Json
  estado             EstadoReglaClasificacion  @default(BORRADOR)
  clasificados       ClasificadoFase[]
  createdAt          DateTime                  @default(now())
  updatedAt          DateTime                  @updatedAt

  @@unique([faseDestinoId, orden])
  @@index([faseOrigenId, estado])
  @@index([faseDestinoId, estado])
  @@index([grupoCompetenciaId])
  @@map("reglas_clasificacion_fase")
}

model ClasificadoFase {
  id                    String                    @id @default(uuid()) @db.Uuid
  reglaClasificacionId  String                    @db.Uuid
  reglaClasificacion    ReglaClasificacionFase    @relation(fields: [reglaClasificacionId], references: [id], onDelete: Restrict)
  participacionId       String                    @db.Uuid
  participacion         EquipoParticipacion       @relation(fields: [participacionId], references: [id], onDelete: Restrict)
  posicion              Int
  seed                  Int
  etiquetaOrigen        String
  tablaSnapshot         Json
  desempatesSnapshot    Json
  createdAt             DateTime                  @default(now())

  @@unique([reglaClasificacionId, participacionId])
  @@unique([reglaClasificacionId, posicion])
  @@unique([reglaClasificacionId, seed])
  @@index([participacionId])
  @@map("clasificados_fase")
}

model ParticipanteFase {
  id                    String              @id @default(uuid()) @db.Uuid
  faseCompetenciaId     String              @db.Uuid
  faseCompetencia       FaseCompetencia     @relation(fields: [faseCompetenciaId], references: [id], onDelete: Restrict)
  participacionId       String              @db.Uuid
  participacion         EquipoParticipacion @relation(fields: [participacionId], references: [id], onDelete: Restrict)
  clasificadoOrigenId   String?             @unique @db.Uuid
  clasificadoOrigen     ClasificadoFase?    @relation(fields: [clasificadoOrigenId], references: [id], onDelete: Restrict)
  seed                  Int?
  createdAt             DateTime            @default(now())

  @@unique([faseCompetenciaId, participacionId])
  @@unique([faseCompetenciaId, seed])
  @@index([participacionId])
  @@map("participantes_fase")
}
```

Relaciones inversas propuestas:

```prisma
model FaseCompetencia {
  reglasClasificacionOrigen  ReglaClasificacionFase[] @relation("ReglaClasificacionOrigen")
  reglasClasificacionDestino ReglaClasificacionFase[] @relation("ReglaClasificacionDestino")
  participantesFase          ParticipanteFase[]
}

model GrupoCompetencia {
  reglasClasificacion ReglaClasificacionFase[]
}

model EquipoParticipacion {
  clasificaciones ClasificadoFase[]
  fases           ParticipanteFase[]
}
```

`configuracion` de regla solo conserva políticas validadas, nunca IDs libres sin FK. En 16B contiene: orden de grupos para comparación, política de criterios intergrupos y mapeo de cruces `CRUCE_EXPLICITO`. `ParticipanteFase` materializa conjunto de una fase LIGA y cada entrada clasificada de fase destino; así no se usa `Zona` ni se infiere equipo desde una llave.

### Migración futura

Nombre: `fase16b_clasificacion_automatica`.

Es aditiva: crea tres enums, tres tablas, índices, uniques y FK `RESTRICT`. No modifica schema histórico, no actualiza filas 16A y no infiere clasificaciones existentes.

## 4. Reglas y formatos

### Grupos a playoffs

Para cuatro grupos de cuatro, se crean ocho reglas `POSICION_GRUPO`: A1, A2, B1, B2, C1, C2, D1, D2. `CRUCE_EXPLICITO` define slots de destino de forma auditada, por ejemplo A1-B2, B1-A2, C1-D2, D1-C2. Los clasificados se materializan con seed y etiqueta `1.º Grupo A`.

No hardcodear cruces por nombres: la regla destino guarda slots determinísticos `{ seed, origenReglaId }`. Al clasificar, los seeds resultantes alimentan fase destino eliminatoria antes de generar sus llaves.

### Liga/fase regular a playoffs

16B habilita `LIGA` como fase con participantes explícitos y fixture FASE 8 parametrizado por fase, no por zona. Una regla `POSICION_GENERAL` con `posicionDesde=1`, `posicionHasta=8`, `seedTipo=ORDEN_CLASIFICACION` genera seeds 1..8. Bracket estándar 1v8, 2v7, 3v6, 4v5 se reutiliza de 16A.

`LIGA_FASE_FINAL` y `FASE_REGULAR_PLAYOFFS` usan fase `LIGA` seguida por eliminación. `GRUPOS_PLAYOFFS` usa fase `GRUPOS` seguida por eliminación. `FASE_DE_GRUPOS` sigue siendo grupos sin transición obligatoria. No se crean enums de formato nuevos.

### Mejores terceros

Cada grupo produce primero/segundo con `POSICION_GRUPO`. Una regla `MEJORES_ENTRE_GRUPOS` selecciona solo posición 3, cantidad N y lista explícita de grupos. Comparación usa el orden de `desempates` snapshot de fase, aplicado sobre filas de tabla de cada tercero; snapshot conserva filas y criterios usados.

Precondición obligatoria: todos los grupos comparados deben tener igual cantidad de participantes y misma cantidad programada de partidos por equipo. Si no, `409 clasificacion_grupos_no_comparables`. No usar PTS/PJ, exclusión del último ni normalización implícita en 16B. Esas políticas requieren futuro enum/configuración explícita y aprobación.

## 5. Snapshot, trazabilidad y publicación

`ClasificadoFase` congela posición, seed, etiqueta, PJ/PG/PE/PP/GF/GC/DG/PTS, reglas de puntos, desempates y orden de desempate aplicado dentro de `tablaSnapshot`/`desempatesSnapshot`. La tabla sigue calculada; snapshot explica hecho histórico de clasificación.

En fase destino, `ParticipanteFase` referencia el `ClasificadoFase` de origen y congela seed global; cada seed debe poder proyectarse desde ese vínculo, no desde una lista manual. Para 16B, las llaves de primera ronda agregarán `participanteFaseLocalId`/`participanteFaseVisitanteId` nullable a `LlaveCompetencia`, ambos `RESTRICT`. Las FKs actuales a `EquipoParticipacion` se conservan para compatibilidad 16A; en 16B deben coincidir con participante-fase asociado. Esto permite responder por qué llegó cada equipo sin duplicar snapshots. Requiere aprobación por extender 16A.

Portal público muestra fase, tabla actual cuando corresponde, clasificados snapshot y etiqueta origen, seed, grupos, rondas y resultados publicados. Sigue requiriendo `visiblePublico`, `mostrarFixture` y filtra cualquier grupo/llave/clasificado que revele equipo privado. Si un lado de llave depende de clasificado privado, se omite llave completa, igual política 16A.

## 6. Momento y flujo de clasificación

Endpoint propuesto: `POST /fases-competencia/:id/clasificar` con `{ confirmar: true }`. Clasifica todas reglas salientes de fase origen dentro de una única transacción `Serializable`.

Precondiciones:

1. fase origen `GENERADA` o `FINALIZADA`, configuración y snapshots presentes;
2. todos los partidos de grupos/liga programados pertenecientes a fase están `FINALIZADO`, con goles consistentes;
3. no hay llave de fase origen en `PENDIENTE_DEFINICION`, `EN_CURSO` o sin ganador cuando sea origen;
4. tabla calculable y cada regla devuelve exactamente cantidad esperada, sin duplicados entre reglas destino;
5. fase destino en `BORRADOR`, sin grupos/rondas/llaves/partidos; o clasificación previa de misma fuente invalidable;
6. fase destino comparte `torneoCategoriaId` con origen.

Flujo:

1. cargar y bloquear fases/reglas destino mediante transaction serializable y uniques;
2. calcular tablas desde partidos finales y snapshots origen;
3. previsualizar resultado internamente y validar cardinalidad/duplicados;
4. crear `ClasificadoFase`, congelar seeds y marcar reglas `CLASIFICADA`;
5. crear/asignar participantes de destino según tipo: grupos o seeds/slots de eliminación;
6. generar estructura destino solo tras participantes completos;
7. auditar actor, reglas, ids no sensibles, etiquetas, seeds, criterios y contador.

El primer POST exitoso devuelve resultado existente para misma configuración, sin duplicar. Si hay configuración distinta o estado inválido, `409 clasificacion_existente`/`fase_destino_bloqueada`; no sobrescribe.

Endpoint de lectura/previsualización: `GET /fases-competencia/:id/clasificacion/preview`. Recalcula sin escribir, aplica mismas precondiciones salvo destino, y devuelve bloqueos/candidatos/slots.

## 7. Idempotencia, concurrencia y correcciones

Uniques de regla, clasificado, seed y orden destino hacen visible cualquier carrera. La transacción serializable relee estado antes de insertar; conflictos de serialización se reintentan acotadamente o devuelven `409 clasificacion_en_progreso`.

No confiar en frontend. Dos clics o requests simultáneos no pueden duplicar clasificados, llaves ni partidos.

Corrección de resultado posterior no forma parte de 16B: FASE 7 no reabre finalizados. Si flujo administrativo futuro modifica origen, operación de invalidación debe:

- permitir solo si cada destino y descendiente es virgen: partidos solo `PROGRAMADO`, sin goles/publicación/eventos/convocatorias/formaciones/sanciones; sin llaves resueltas/pendientes definición; sin clasificaciones posteriores materializadas;
- borrar solo materialización 16B virgen de abajo hacia arriba en transacción;
- marcar reglas previas `INVALIDADA`, preservar snapshots/auditoría y recalcular explícitamente;
- bloquear con `409 fase_destino_historica` ante cualquier actividad, sin mover participantes ni seeds.

Para 16B, si una fase destino ya fue generada pero sigue completamente virgen, se permite invalidar clasificación, eliminar estructura destino y regenerar con nueva clasificación. Si destino o descendiente tiene historia, se bloquea.

## 8. Seguridad y auditoría

Configurar, previsualizar con datos privados, clasificar, invalidar y regenerar: `torneos:administrar` más `esAdminDeTorneo`; SUPERADMIN permitido. DELEGADO, TECNICO, AUXILIAR y JUGADOR nunca clasifican. Lectura privada mantiene `torneos:ver` más `puedeVerTorneo`. Cada ID se scopea mediante fase -> torneoCategoria -> torneo.

Auditar: creación/cambio de regla, preview confirmada solo como lectura no auditada, clasificación, idempotencia retornada, invalidación, regeneración, bloqueo y cambios de seed. Contexto: fase origen/destino, reglas, cantidades, seeds, etiquetas y razones; sin datos personales.

## 9. Frontend

Administración en `FasesCompetenciaSection`:

1. crear fases en orden y seleccionar origen/destino desde fases existentes, nunca UUID;
2. configurar regla mediante selectores de grupo, posición, cantidad y política seed;
3. mostrar tabla y preview responsive de clasificados/origen/seed/cruces/bloqueos;
4. confirmar clasificación y generación con `ConfirmDialog`;
5. mostrar `PageState`, `ToastRegion`, `PermissionGate`, `StatusBadge` y razón de bloqueo;
6. permitir regeneración/invalidate solo si backend responde estructura virgen.

Portal público en `/publico/competencias/:id/fases`: fases ordenadas, bloque de clasificados entre fases, origen y seed, grupos/tablas y rondas por lista responsive. Sin bracket gráfico complejo.

## 10. Endpoints propuestos

- `POST /fases-competencia/:id/reglas-clasificacion`
- `PATCH /reglas-clasificacion/:id` solo BORRADOR y sin materialización
- `GET /fases-competencia/:id/clasificacion/preview`
- `POST /fases-competencia/:id/clasificar`
- `POST /fases-competencia/:id/invalidar-clasificacion` solo árbol virgen
- extender `GET /torneo-categorias/:id/competencia-avanzada`
- extender `GET /publico/torneo-categorias/:id/fases`

No agregar endpoint de resolución de empate, sorteo o corrección de resultados.

## 11. Tests obligatorios

- 4 grupos x 4, top 2, ocho clasificados y cruces explícitos correctos.
- liga de 12, top 8, seeds y 1v8/2v7/3v6/4v5.
- mejores terceros: selección, desempates snapshot y rechazo de grupos desiguales.
- clasificación antes de finalizar, empate pendiente y reglas incompletas bloquean.
- doble POST e intentos concurrentes no duplican datos.
- invalidación/reclasificación destino virgen; bloqueo con cada tipo de actividad y con descendiente usado.
- snapshot/origen/seed permanecen tras cambios posteriores de configuración.
- ADMIN tenant ajeno, DELEGADO e IDOR rechazados; SUPERADMIN permitido.
- portal respeta visibilidad, `mostrarFixture`, partidos publicados y equipos privados.
- regresión FASE 7/8/9/11/14/15/16A.

## 12. Riesgos y aprobación requerida

1. Aprobar tres nuevos modelos y tres enums, más FK de `ParticipanteFase` por lado en llave para trazabilidad de destino.
2. Aprobar que liga 16B requiere participantes explícitos de fase, no reutilizar `Zona`.
3. Aprobar rechazo explícito de mejores terceros con grupos desiguales; sin normalización 16B.
4. Aprobar `CRUCE_EXPLICITO` determinístico por slots, sin sorteo.
5. Aprobar invalidación solo de árbol destino totalmente virgen y bloqueo `409` ante historia.
6. Confirmar si 16B genera automáticamente estructura destino tras clasificar o separa clasificación/generación. Recomendación: clasificar y generar en una confirmación atómica para evitar destinos con participantes sin estructura.

## 13. Compatibilidad

FASE 7 Partido, FASE 8 fixture/tabla, FASE 9 eventos, FASE 11 portal, FASE 14 scopes, FASE 15 primitives y 16A grupos/BYE/llaves se preservan. Todas FK nuevas son nullable donde extienden 16A y `RESTRICT`; no se modifica ni migra historia previa.

## 14. Archivos estimados para implementación

- `apps/api/prisma/schema.prisma`
- nueva migración `apps/api/prisma/migrations/*_fase16b_clasificacion_automatica/migration.sql`
- `apps/api/src/competencia-avanzada/servicio.ts`
- `apps/api/src/routes/competencia-avanzada.ts`
- `apps/api/src/routes/publico.ts`
- `apps/api/src/routes/partidos.ts` solo si debe actualizar estado de fase; no modificar resultado deportivo
- `apps/api/src/routes/competencia-avanzada.test.ts`
- `apps/web/src/pages/torneos/FasesCompetenciaSection.tsx`
- `apps/web/src/pages/torneos/tipos.ts`
- tests web/públicos nuevos
- `CHANGELOG.md`
