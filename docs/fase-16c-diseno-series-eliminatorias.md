# FASE 16C - Series eliminatorias avanzadas

Estado: APROBADA PARA IMPLEMENTACION.

## 1. Objetivo y limites

16C extiende eliminacion directa de 16A/16B con series de partido unico o ida/vuelta, global derivado, alargue, penales, tercer puesto y recalculo conservador. Fuera de alcance: gol de visitante, minutos calculados, reprogramaciones con historial propio, pagos, PWA, CMS, arbitraje avanzado y disciplina nueva.

## 2. Auditoria 16A/16B

### Reutilizable

- `FaseCompetencia` ordena fases, conserva configuracion JSON y concentra rondas.
- `RondaEliminatoria` agrupa llaves; `LlaveCompetencia.partidos` ya es relacion uno-a-muchos. No hace falta entidad `Serie` paralela: la llave es serie.
- `LlaveCompetencia` tiene participantes, seeds, ganador, estado, metodo, BYE y origenes de ganador. `TipoOrigenLlave.PERDEDOR_LLAVE` ya existe, pero no hay enlace de propagacion para perdedor.
- `ParticipanteFase`, `ClasificadoFase` y `ReglaClasificacionFase` preservan entrada trazable desde grupos o LIGA hasta playoff.
- `Partido` ya pertenece a llave y concentra resultado, eventos, formaciones, convocatorias y sanciones. `EventoPartido.periodo` permite ubicar goles, aunque hoy es texto sin contrato de serie.
- Finalizar resultado llama `actualizarLlavePorPartidoFinalizado` dentro de transaccion serializable. RBAC usa permiso global mas alcance de administrador del torneo; auditoria existente sirve para operaciones mutables.
- Portal privado/público ya proyecta fases, rondas, llaves, ganador y partidos publicados. UI administrativa ya usa `ConfirmDialog`; `PartidoPage` ya muestra estado, resultado y eventos.

### Limitaciones exactas

- Generador siempre crea un partido por llave; propagacion crea partido futuro solo al conocer ambos ganadores.
- Resolucion exige `llave.partidos.length === 1`, compara marcador de ese partido y deja empate en `PENDIENTE_DEFINICION`; no hay global ni cierre manual controlado.
- `MetodoResolucionLlave` solo expresa resultado de partido, BYE o administrativa.
- No existe orden/tipo de partido dentro de llave, configuracion por ronda congelada, resultado a 90, datos de alargue, tanda, origen de perdedor enlazado ni tercer puesto.
- Correccion de evento finalizado puede existir para administrador; no hay invalidez/recalculo del grafo de llaves. Bloqueos de regeneracion/clasificacion ya detectan publicación, estado, resultado, eventos, convocatorias, formaciones y sanciones, pero deben abarcar definiciones y descendencia de llave.

## 3. Decisiones de modelo

1. `LlaveCompetencia` representa serie. Se conserva `LlaveCompetencia -> Partido[]`; no se crea entidad `Serie`.
2. Configuracion vive en `RondaEliminatoria`, porque semifinal, final y tercer puesto pueden tener reglas distintas dentro de misma fase. `FaseCompetencia.configuracion` solo entrega defaults al crear rondas.
3. Global es derivado de partidos finalizados por llave, usando participante estable de llave, no condicion local/visitante de cada partido. No es fuente manual de verdad.
4. `DefinicionLlave` unica concentra penales o decisión administrativa. No se usa `EventoPartido` para tiros de tanda.
5. Goles de alargue son goles normales de partido y estadistica. Penales de tanda nunca son goles, eventos ni estadisticas.
6. Gol de visitante queda explícitamente no soportado. No hay flag latente ni criterio implícito.

## 4. Schema propuesto

```prisma
enum FormatoSerieEliminatoria {
  PARTIDO_UNICO
  IDA_VUELTA
}

enum TipoRondaEliminatoria {
  PRINCIPAL
  TERCER_PUESTO
}

enum TipoDefinicionLlave {
  PENALES
  ADMINISTRATIVA
}

enum MetodoResolucionLlave {
  RESULTADO_PARTIDO
  RESULTADO_GLOBAL
  ALARGUE
  PENALES
  BYE
  ADMINISTRATIVA
}
```

`MetodoResolucionLlave` reemplaza enum existente. `RESULTADO_PARTIDO` significa ganador dentro de 90 minutos; `ALARGUE` identifica partido unico resuelto tras 90; `RESULTADO_GLOBAL` identifica global no empatado; `PENALES` y `ADMINISTRATIVA` remiten a definición persistida.

```prisma
model RondaEliminatoria {
  // Campos 16A existentes sin cambio
  tipo                   TipoRondaEliminatoria    @default(PRINCIPAL)
  formatoSerie           FormatoSerieEliminatoria @default(PARTIDO_UNICO)
  permiteAlargue         Boolean                  @default(false)
  permitePenales         Boolean                  @default(false)
  configuracionSnapshot  Json
  reglasCongeladasEn     DateTime?

  @@unique([faseCompetenciaId, orden])
  @@index([faseCompetenciaId, tipo])
}

model LlaveCompetencia {
  // Campos 16A/16B existentes sin cambio
  llavePerdedorSiguienteId String?             @db.Uuid
  llavePerdedorSiguiente   LlaveCompetencia?   @relation("LlavePerdedorSiguiente", fields: [llavePerdedorSiguienteId], references: [id], onDelete: Restrict)
  ladoPerdedorSiguiente    String?
  anterioresPerdedor       LlaveCompetencia[]  @relation("LlavePerdedorSiguiente")
  definicion               DefinicionLlave?

  @@index([llavePerdedorSiguienteId])
}

model Partido {
  // Campos existentes mantienen resultado final deportivo en golesLocal/golesVisitante.
  ordenSerie               Int?
  golesLocalReglamentario  Int?
  golesVisitanteReglamentario Int?

  @@unique([llaveCompetenciaId, ordenSerie])
  @@index([llaveCompetenciaId, ordenSerie])
}

model DefinicionLlave {
  id                       String              @id @default(uuid()) @db.Uuid
  llaveCompetenciaId        String              @unique @db.Uuid
  llaveCompetencia          LlaveCompetencia    @relation(fields: [llaveCompetenciaId], references: [id], onDelete: Restrict)
  tipo                     TipoDefinicionLlave
  participacionLocalId      String              @db.Uuid
  participacionLocal        EquipoParticipacion @relation("DefinicionLlaveLocal", fields: [participacionLocalId], references: [id], onDelete: Restrict)
  participacionVisitanteId  String              @db.Uuid
  participacionVisitante    EquipoParticipacion @relation("DefinicionLlaveVisitante", fields: [participacionVisitanteId], references: [id], onDelete: Restrict)
  penalesLocal              Int?
  penalesVisitante          Int?
  ganadorParticipacionId    String              @db.Uuid
  ganadorParticipacion      EquipoParticipacion @relation("DefinicionLlaveGanador", fields: [ganadorParticipacionId], references: [id], onDelete: Restrict)
  motivo                    String?
  creadoPorId               String              @db.Uuid
  creadoPor                 Usuario             @relation("DefinicionLlaveCreador", fields: [creadoPorId], references: [id], onDelete: Restrict)
  createdAt                 DateTime            @default(now())
  updatedAt                 DateTime            @updatedAt

  @@index([participacionLocalId])
  @@index([participacionVisitanteId])
  @@index([ganadorParticipacionId])
  @@map("definiciones_llave")
}
```

Motivos: `ordenSerie` asigna ida=1 y vuelta=2 sin inferencia por fecha; unique evita duplicados. El unique nullable permite varios partidos legacy con `ordenSerie = NULL`, pero 16C exige orden no nulo en llaves configuradas. Marcadores reglamentarios permiten distinguir 90 y final; alargue se deriva como `goles finales - goles reglamentarios`. `configuracionSnapshot` guarda objeto normalizado aplicado al generar; no se lee configuracion mutable de fase para resolver historia. `onDelete: Restrict` bloquea borrados que rompan trazabilidad. Validaciones de pertenencia, no-negatividad, distinto ganador y motivo administrativo obligatorio van en servicio dentro de transaccion; Prisma no expresa esas restricciones cruzadas.

Relaciones inversas requeridas: arrays `definicionesLlaveLocal`, `definicionesLlaveVisitante`, `definicionesLlaveGanador` en `EquipoParticipacion`, y `definicionesLlaveCreadas` en `Usuario`.

## 5. Configuracion y generacion

Entrada de creación o configuración de fase eliminación:

```json
{
  "defaultsRonda": {
    "formatoSerie": "PARTIDO_UNICO",
    "permiteAlargue": false,
    "permitePenales": true
  },
  "rondas": [
    { "orden": 1, "formatoSerie": "IDA_VUELTA", "permiteAlargue": false, "permitePenales": true },
    { "orden": 2, "formatoSerie": "PARTIDO_UNICO", "permiteAlargue": true, "permitePenales": true }
  ],
  "tercerPuesto": false
}
```

- Valores se validan antes de generar: ida/vuelta requiere penales si se quiere resolver empate por tanda; alargue solo puede usarse en partido unico o en vuelta de una serie, nunca tras ida.
- Cada ronda persiste columnas consultables y `configuracionSnapshot` normalizada. Al crear primer partido se fija `reglasCongeladasEn`.
- Cambiar formato, alargue, penales o tercer puesto solo mientras ronda y llaves no tengan partido, definición ni propagación. Si hay actividad, devolver 409; no mutar snapshot.
- Generación serializable e idempotente: unique de ronda/orden, llave/orden y partido/ordenSerie; repetir solicitud devuelve estructura existente o 409 coherente, nunca duplica.
- Partido unico crea `ordenSerie=1`. Ida/vuelta crea ambos partidos cuando llave tiene ambos participantes: ida con local A y vuelta con local B. Ambos parten `PROGRAMADO`; fechas iniciales pueden ser iguales/default actuales, luego fechas se editan por flujo existente. No se publica automáticamente.
- Llaves futuras no crean partidos hasta recibir ambos participantes. Cuando los reciben, crean uno o dos según snapshot de su ronda. BYE propaga solo ganador, nunca genera serie.

Tercer puesto es ronda de tipo `TERCER_PUESTO`, normalmente posterior a semifinales y con configuración propia. Se crea solo cuando fase tiene semifinales y flag confirmado. Cada semifinal mantiene ruta de ganador a final y nueva ruta de perdedor al único partido de tercer puesto; la llave destino usa `origen*Tipo=PERDEDOR_LLAVE` y FKs de origen. No se copia `equipoId` sin origen.

## 6. Global, alargue y penales

### Global

Para cada partido finalizado de orden 1/2, se traduce marcador por identidad de participante:

- si `partido.equipoLocalId` corresponde a participante local de llave, suma `golesLocal` a A y `golesVisitante` a B;
- si corresponde a B, invierte suma;
- cualquier otro equipo es conflicto de integridad.

Global usa resultado final deportivo de cada partido, incluido alargue de vuelta si existe. No usa penales. Respuesta de lectura devuelve `globalLocal`, `globalVisitante`, partidos esperados/finalizados y `empatado`; puede incluir snapshot de cierre derivado dentro de auditoría, pero no se persiste como verdad duplicada.

### Alargue

- Solo se acepta al cerrar partido que snapshot permita alargue y sea partido unico o vuelta.
- API recibe `goles*Reglamentario` y `goles*Alargue`; persiste totales en campos existentes y reglamentario en nuevos campos. Requiere que total sea suma válida y que goles de eventos coincidan con total.
- Eventos GOL de 16C deben usar vocabulario validado en `periodo`: `PRIMER_TIEMPO`, `SEGUNDO_TIEMPO`, `ALARGUE_PRIMER_TIEMPO`, `ALARGUE_SEGUNDO_TIEMPO`. No se agrega texto libre ni se modifica eventos históricos. Goles de alargue cuentan para marcador final, global y estadísticas FASE 9.
- `ALARGUE` solo resuelve partido unico empatado a 90 que deja ganador tras prórroga. En ida/vuelta, alargue de vuelta puede desempatar global; método será `ALARGUE` si ese fue criterio decisivo.

### Penales y administrativa

- Si global o partido unico queda empatado tras alargue permitido/no permitido, llave queda `PENDIENTE_DEFINICION`. No avanza.
- `POST /llaves-competencia/:id/definicion/penales` crea única `DefinicionLlave` tipo `PENALES`; exige llave pendiente, ambos participantes, snapshot permite penales, enteros >= 0, marcador distinto y ganador congruente. Graba participantes estables de llave y ganador.
- Penales no crean `EventoPartido`, no alteran `golesLocal/golesVisitante`, global ni goleadores. Portal muestra `Penales A 4-3 B` como definición de llave.
- Administrativa queda soportada solo como excepción aprobada: `POST /llaves-competencia/:id/definicion/administrativa` exige `motivo` no vacío, ganador perteneciente a llave, administrador torneo o superadmin y confirmación explícita. Nunca la ejecuta cálculo automático.

## 7. Resolucion, avance e invalidacion

Una llave queda `RESUELTA` solo cuando:

- BYE tiene único participante;
- partido unico finalizó y tiene ganador por 90/alargue; o empate tiene definición válida;
- ida/vuelta tiene ambos partidos `FINALIZADO`, global no empatado o definición válida.

Al finalizar ida: recalcular estado, mantener `PROGRAMADA`/`EN_CURSO`, nunca avanzar. Al finalizar vuelta: calcular global dentro de transacción serializable, fijar ganador y método solo si resolución válida, luego propagar ganador y, si aplica, perdedor. Propagación es idempotente: actualiza slot solo vacío o igual; diferencia devuelve 409. Crear partidos de destino queda en misma transacción.

Corrección histórica no reabre ni reemplaza silenciosamente. Operación explícita `POST /llaves-competencia/:id/invalidar-resolucion`:

1. Reúne grafo descendiente por rutas de ganador y perdedor.
2. Rechaza 409 si cualquier llave descendiente está resuelta, pendiente de definición, en curso, bloqueada o tiene definición.
3. Rechaza 409 si cualquier partido descendiente fue publicado, no está `PROGRAMADO`, tiene resultado, evento, convocatoria, `FormacionInstancia`, sanción o definición.
4. Si todo es virgen, elimina partidos futuros, definiciones y slots derivados de grafo, restaura estados pendientes y deja origen disponible para corrección/recalculo explícito.
5. Corrección de resultado/evento finalizado debe invocar este bloqueo antes de mutar si llave ya resolvió. Después: `POST /llaves-competencia/:id/recalcular` bajo confirmación vuelve a derivar global/ganador y propaga.

No se elimina evidencia de partidos fuente finalizados. Descendencia posterior, incluso tercer puesto, cuenta como actividad bloqueante.

## 8. Endpoints, RBAC y auditoria

Propuesta privada:

- `PATCH /rondas-eliminatorias/:id/configuracion`: solo ronda virgen; admin torneo/superadmin.
- `POST /fases-competencia/:id/generar`: amplía generación existente según snapshots.
- `GET /llaves-competencia/:id/resumen`: global derivado, partidos ordenados, configuración y bloqueo.
- `POST /llaves-competencia/:id/definicion/penales`: confirmación, administrador torneo/superadmin.
- `POST /llaves-competencia/:id/definicion/administrativa`: confirmación y motivo; administrador torneo/superadmin.
- `POST /llaves-competencia/:id/invalidar-resolucion`: confirmación; administrador torneo/superadmin.
- `POST /llaves-competencia/:id/recalcular`: confirmación; administrador torneo/superadmin.

Carga ordinaria de eventos, resultado y estado conserva permisos existentes de partido. Servicio valida siempre alcance de torneo antes de mutación sensible; delegados externos y tenants ajenos reciben 403.

Auditar: configuración/snapshot de ronda, generación de cada serie, cierre por global/alargue, penales, administrativa, invalidación, recalculo, creación de tercer puesto y bloqueos relevantes. No auditar lecturas ni cálculo puro. Auditoría incluye IDs, snapshot, método, global derivado y motivo administrativo, nunca datos sensibles ajenos.

## 9. Portal y frontend

### Público

`GET /publico/torneo-categorias/:id/fases` incorpora, condicionado por `visiblePublico`, `mostrarFixture`, partido publicado y equipos no privados:

- configuración legible de serie;
- ida/vuelta ordenadas y sus marcadores;
- global derivado y ganador;
- estado `PENDIENTE_DEFINICION` con global empatado;
- penales publicados como definición, sin simular goles;
- ronda y partido de tercer puesto.

No expone definición administrativa si expone motivo sensible: mostrar método/ganador; motivo queda privado salvo política pública posterior.

### Administración

`FasesCompetenciaSection` suma formulario visible, sin UUID manual, para defaults/rondas/tercer puesto antes de generar. Usa selects, switches accesibles, validación previa, `ConfirmDialog`, `StatusBadge`, `ToastRegion` y `PageState`. Llave muestra ida/vuelta, global, método, definición y motivo de bloqueo. Acciones penales, administrativa, invalidar y recalcular requieren confirmación; administrativa exige textarea de motivo.

### Partido

`PartidoPage` recibe bloque `serie` desde endpoint de partido: llave, orden ida/vuelta, rival, global, reglas y enlaces a encuentros hermanos. UI muestra contexto/navegación sin calcular deporte localmente. Formulario resultado distingue 90, alargue y final cuando reglas lo permiten. Tanda se registra en pantalla de llave, no como evento de partido. Frontend no replica resolución ni estadísticas.

## 10. Migracion futura

Crear única migración aditiva `apps/api/prisma/migrations/<timestamp>_fase16c_series_eliminatorias/migration.sql`:

- tipos nuevos y alteración aditiva de `MetodoResolucionLlave` según sintaxis PostgreSQL segura;
- columnas nullable/defaults en ronda, llave y partido;
- tabla `definiciones_llave`, FKs `RESTRICT`, uniques e índices descritos;
- backfill: rondas/llaves existentes conservan `PARTIDO_UNICO`, flags false, `configuracionSnapshot` normalizado y partidos existentes pueden conservar `ordenSerie=NULL` para no reescribir historia.

No editar migraciones históricas ni renormalizar LF/CRLF. Cliente Prisma se genera localmente, no se commitea.

## 11. Tests requeridos

- Ida/vuelta: dos partidos, localías invertidas, global correcto, no avance tras ida, avance tras vuelta e idempotencia de generación.
- Empate global: permanece pendiente sin definición; penales resuelven y no suman a goles/eventos/goleadores.
- Alargue: 90 y final distinguibles; goles prórroga cuentan en resultado, global y estadísticas.
- Tercer puesto: perdedores de ambas semifinales, origen `PERDEDOR_LLAVE`, propagación y no duplicación.
- Final: partido único y ida/vuelta con configuraciones separadas.
- Histórico: recalculo con descendencia virgen; 409 por partido/publicación/convocatoria/formación/evento/sanción/definición/descendiente usado.
- Seguridad: tenant externo, delegado, admin correcto y superadmin para configuración, penales, administrativa, invalidación y recalculo.
- Público: global, ida/vuelta, penales, tercer puesto, privacidad y visibilidad de fixture.
- Regresión: 16A/16B, FASE 7/8/9, partidos/eventos, portal y fixture.
- Concurrencia: dos finales de vuelta, dos penales y dos recalculos simultáneos; una única definición/ganador/propagación.

## 12. Riesgos y compatibilidad

- Reutilizar `LlaveCompetencia` evita duplicar participantes y grafo, pero obliga a centralizar toda resolución en servicio transaccional; ningún route de partido puede decidir ganador por sí solo.
- `golesLocal/golesVisitante` históricos se conservan como total deportivo. Campos reglamentarios nuevos no se fuerzan retroactivamente; vistas muestran "no discriminado" para legado.
- Unique nullable de orden de serie no impone legado; validación runtime impone estructura 16C y migración no reescribe partidos.
- Postgres no expresa fácilmente todas invariantes deportivas entre filas. `Serializable`, constraints, unique y verificación tras escritura son obligatorios; conflictos se devuelven como 409, no con reemplazo silencioso.
- Reprogramación sigue usando edición de fecha existente. Historial detallado de reprogramación queda para fase posterior.
- Sanciones, convocatorias y formaciones siguen vinculadas a cada partido. No hay disciplina de arrastre nueva; la seguridad histórica solo las detecta como actividad.

## 13. Decisiones que requieren aprobación

1. Aprobar `LlaveCompetencia` como entidad serie, sin modelo `Serie` adicional.
2. Aprobar reglas por `RondaEliminatoria` y snapshot al generar, con terceros como ronda separada.
3. Aprobar que alargue cuente en resultado/global/estadísticas y que penales no cuenten en ninguno.
4. Aprobar soporte excepcional de `ADMINISTRATIVA` con motivo obligatorio, RBAC estricto, confirmación y auditoría; si no, eliminar enum/endpoint de esta fase.
5. Aprobar sin gol de visitante en 16C.
6. Aprobar política de corrección: solo invalidación/recalculo explícito con toda descendencia virgen; 409 ante cualquier actividad.
