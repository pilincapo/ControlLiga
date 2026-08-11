# FASE 8 — Fixture y tabla: diseño

Estado: **IMPLEMENTADA**. Base aprobada: commit `fe52076`.

## 1. Objetivo exacto

FASE 8 debe:

- generar fixture automático para competencias oficiales;
- organizar partidos en jornadas;
- registrar descansos cuando el formato los produzca;
- mostrar fixture por competición, zona y equipo;
- calcular tabla de posiciones desde partidos oficiales finalizados;
- aplicar sistema de puntos y desempates configurados en `ConfiguracionCompetencia`;
- mantener datos derivados, sin duplicar resultados ni guardar una tabla manual.

No debe implementar estadísticas de jugadores, tarjetas, goles por jugador, sustituciones, sanciones completas ni eventos en vivo.

## 2. Estado actual revisado

### Modelos reutilizables

- `Organizacion → Torneo → Temporada → TorneoCategoria → Zona`.
- `EquipoParticipacion`: equipo inscripto en torneo/temporada, con categoría, zona y estado.
- `ConfiguracionCompetencia`: formato, configuración JSON, puntos y desempates.
- `Jornada`: competición, zona opcional, número, nombre, fecha y estado.
- `JornadaEquipoDescanso`: equipo que descansa en una jornada.
- `Partido`: equipos, tipo, contexto oficial, jornada, fecha, estado, goles y publicación.
- `Equipo`: entidad independiente del torneo.
- `FormacionInstancia`: snapshot histórico asociado a partido. No debe ser modificado por fixture ni tabla.
- `Convocatoria`: logística asociada opcionalmente a partido. No debe ser modificada por fixture ni tabla.
- `Sancion`: relación existente con partido, sin implementar su flujo en esta fase.

### Funcionalidad existente a reutilizar

- `Partido` ya tiene `jornadaId`, `equipoLocalId`, `equipoVisitanteId`, `fechaHora`, `estado` y resultado.
- FASE 7 ya valida contexto de torneo al crear partidos y contiene máquina de estados/resultados.
- FASE 3 ya contiene `Jornada`, `JornadaEquipoDescanso` y `ConfiguracionCompetencia`.
- FASE 3 ya contiene `FormatoCompetencia`, incluyendo formatos de grupos y playoffs.
- No crear tabla redundante de posiciones.
- No crear modelos duplicados de equipos, participaciones ni partidos.

## 3. Diagrama conceptual

```text
TORNEO
  └── TEMPORADA
        └── TORNEOCATEGORIA
              ├── CONFIGURACIONCOMPETENCIA
              ├── ZONA
              │     └── EQUIPOPARTICIPACION
              └── JORNADA
                    ├── JORNADAEQUIPODESCANSO
                    └── PARTIDO
                          ├── EQUIPO LOCAL
                          ├── EQUIPO VISITANTE
                          ├── RESULTADO (golesLocal/golesVisitante)
                          ├── FORMACIONINSTANCIA
                          └── CONVOCATORIA

PARTIDOS OFICIALES FINALIZADOS
  └── agregación por equipo
        └── tabla calculada
              └── puntos + desempates configurados
```

## 4. Funcionalidades incluidas

### Fixture

- Generar fixture para una `TorneoCategoria` y una `Zona`.
- Crear jornadas y partidos oficiales.
- Soportar inicialmente todos contra todos:
  - una rueda;
  - dos ruedas.
- Asignar localía de manera balanceada cuando el formato lo permita.
- Generar descanso automático cuando la cantidad de equipos sea impar.
- Validar que solo participaciones `CONFIRMADO` entren al fixture.
- Evitar duplicar fixture si ya existe una generación para la misma competición/configuración.
- Permitir regeneración solo mediante operación explícita y con restricciones.

### Tabla

- Calcular tabla por `TorneoCategoria` y opcionalmente por `Zona`.
- Usar solo partidos `tipo = OFICIAL` y `estado = FINALIZADO`.
- Calcular `PJ`, `PG`, `PE`, `PP`, `GF`, `GC`, `DG`, `PTS`.
- Aplicar puntos de `ConfiguracionCompetencia.sistemaPuntos`.
- Aplicar criterios de `ConfiguracionCompetencia.desempates` en orden.
- No persistir filas de tabla como fuente de verdad.

## 5. Funcionalidades excluidas

- Estadísticas de jugadores o equipos fuera de la tabla básica.
- Goleadores, asistencias, minutos y tarjetas.
- Sustituciones y eventos en vivo.
- Sanciones completas.
- Fixture de partidos independientes.
- Integración real con WhatsApp.
- Generación de imágenes.
- Reprogramaciones con historial detallado, salvo que se apruebe como parte separada.
- Motor completo de grupos, playoffs y eliminación directa, salvo aprobación explícita del alcance.

## 6. Modelos nuevos

No se propone ningún modelo nuevo para tabla.

### Fixture

El schema actual ya tiene modelos suficientes: `Jornada`, `JornadaEquipoDescanso` y `Partido`.

### Generación

No persistir inicialmente un modelo `FixtureGeneracion`. La generación puede identificarse por jornadas/partidos existentes y la configuración vigente. Si se necesita historial de ejecuciones, reversiones o regeneraciones, será una decisión posterior.

## 7. Regeneración del fixture

Regeneración nunca silenciosa.

`POST /torneo-categorias/:id/fixture/regenerar` requiere:

- ADMINISTRADOR con alcance del torneo o SUPERADMIN;
- confirmación explícita en body (`confirmar: true`);
- auditoría previa y posterior.

### Regeneración permitida

Se permite solo si **todos** los partidos generados por ese fixture están en `PROGRAMADO`, sin goles, sin `FormacionInstancia` y sin dependencia histórica que deba preservarse.

En ese caso, operación transaccional:

1. conservar auditoría de generación anterior;
2. eliminar solo jornadas/partidos generados que sigan completamente vírgenes;
3. eliminar descansos de esas jornadas;
4. generar nuevo fixture;
5. auditar identificador lógico de generación anterior y nueva.

Partidos `APLAZADO`, `SUSPENDIDO`, `EN_CURSO` o `FINALIZADO` bloquean regeneración. Aunque `APLAZADO` no haya comenzado, ya tiene una decisión operativa y no se destruye automáticamente.

Si existe cualquier resultado, formación snapshot, convocatoria asociada o estado distinto de `PROGRAMADO`, regeneración devuelve `409 fixture_bloqueado`.

No se agrega modelo de generación en esta fase; la auditoría documenta operación y elementos afectados. Historial detallado de versiones de fixture queda pendiente si luego hace falta.

## 8. Cambios de puntos y desempates

La tabla siempre se calcula desde partidos oficiales `FINALIZADO`. No existe tabla persistida.

`ConfiguracionCompetencia.sistemaPuntos` se lee como objeto validado:

```json
{ "victoria": 3, "empate": 1, "derrota": 0 }
```

`ConfiguracionCompetencia.desempates` se lee como array ordenado:

```json
["PUNTOS", "DIFERENCIA_GOLES", "GOLES_FAVOR", "RESULTADO_ENFRENTAMIENTO"]
```

El primer elemento tiene prioridad; cada criterio recibe el subconjunto todavía empatado.

### Bloqueo

- En `Temporada.BORRADOR` o `PUBLICADO`: configuración editable por ADMIN del torneo.
- Cuando `Temporada` pasa a `EN_CURSO`: puntos y desempates quedan bloqueados.
- No se permite modificar configuración si existe algún partido oficial `FINALIZADO`.
- Antes de existir resultados finalizados, una operación administrativa explícita y auditada podría desbloquearla; no es un PATCH normal y requiere `confirmar: true`.
- Cambiar puntos/desempates no regenera fixture ni modifica partidos; solo afecta cálculos posteriores si la operación fue permitida.

La API debe devolver versión/configuración aplicada junto con la tabla para hacer visible qué reglas se usaron.

## 9. Algoritmo round-robin

FASE 8.0 implementa `TODOS_CONTRA_TODOS`, `UNA_RUEDA` y `DOS_RUEDAS`.

### Preparación

1. Obtener equipos `EquipoParticipacion.CONFIRMADO` de la misma competencia/zona.
2. Ordenar equipos de forma determinista por `equipoId`.
3. Si `n` es impar, agregar un elemento virtual `DESCANSO`.
4. Aplicar método de círculo: fijar primer elemento y rotar los restantes.
5. En cada jornada emparejar posiciones simétricas.
6. No repetir equipo dentro de jornada.

### Cantidades exactas

| Equipos | Una rueda: jornadas | Una rueda: partidos | Dos ruedas: jornadas | Dos ruedas: partidos |
|---:|---:|---:|---:|---:|
| 4 | 3 | 6 | 6 | 12 |
| 5 | 5 | 10 | 10 | 20 |
| 6 | 5 | 15 | 10 | 30 |
| 7 | 7 | 21 | 14 | 42 |

Para `n` par:

- jornadas de una rueda = `n - 1`;
- partidos por jornada = `n / 2`;
- partidos totales = `n * (n - 1) / 2`.

Para `n` impar:

- jornadas de una rueda = `n`;
- partidos por jornada = `(n - 1) / 2`;
- un descanso exacto por jornada;
- partidos totales = `n * (n - 1) / 2`.

Dos ruedas duplica partidos y jornadas. Segunda rueda repite cada pareja exactamente una vez y revierte localía.

### Localía

- Cada emparejamiento recibe local/visitante de forma determinista.
- Segunda rueda invierte la localía de la primera.
- En una rueda, el algoritmo alterna localía por jornada y ajusta la última asignación cuando un equipo acumula desequilibrio.
- Invariante objetivo: diferencia entre partidos de local y visitante por equipo no mayor a 1 cuando la cantidad lo permite.
- Si restricciones matemáticas impiden equilibrio perfecto, se conserva la asignación determinista y se informa metadata de balance.

### Descansos

- Con cantidad impar existe exactamente un `JornadaEquipoDescanso` por jornada.
- El descanso es el equipo emparejado contra `DESCANSO`.
- `@@unique([jornadaId, equipoId])` existente impide duplicarlo.
- En una rueda cada equipo descansa exactamente una vez; en dos ruedas, exactamente dos veces.

## 10. Jornadas y zonas

Una jornada de zona se identifica por:

```text
(torneoCategoriaId, zonaId, numero)
```

Una jornada global se identifica por:

```text
(torneoCategoriaId, zonaId = NULL, numero)
```

Regla backend obligatoria:

- antes de crear una jornada, consultar dentro de transacción si ya existe otra con misma competencia, misma zona (incluido NULL) y mismo número;
- si existe, devolver `409 jornada_duplicada`;
- no depender de `UNIQUE` nullable de PostgreSQL;
- no mezclar jornadas globales con jornadas de zona en un mismo fixture.

La implementación puede usar dos consultas explícitas (`zonaId: null` versus `zonaId: valor`) o un lock lógico de la competencia dentro de la transacción.

No aplicar todavía un índice parcial SQL sin decisión posterior.

## 11. Algoritmo de tabla y desempates

### Acumulación

Para cada equipo confirmado, inicializar una fila en cero. Leer únicamente partidos:

- `tipo = OFICIAL`;
- `estado = FINALIZADO`;
- pertenecientes a la competencia/zona consultada;
- ambos equipos válidos en esa competencia.

Por partido:

- `PJ += 1` para ambos;
- gana local: `PG += 1`, puntos de victoria;
- gana visitante: equivalente;
- empate: `PE += 1`, puntos de empate;
- perdedor: `PP += 1`;
- sumar GF/GC según localía;
- `DG = GF - GC`;
- puntos según configuración, nunca hardcodear 3/1/0.

### Orden de criterios

1. Agrupar equipos con igual `PTS`.
2. Para cada grupo empatado, consumir criterios en el orden exacto de `desempates`.
3. Cada criterio divide el grupo en subgrupos; los subgrupos ya separados conservan su orden.
4. Aplicar criterios restantes recursivamente a cada subgrupo todavía empatado.

### Resultado entre sí

Para un grupo empatado de 2 o más equipos:

- construir mini-tabla usando únicamente partidos `FINALIZADO` entre equipos de ese grupo;
- calcular en mini-tabla puntos, diferencia de goles y goles a favor;
- el criterio `RESULTADO_ENFRENTAMIENTO` usa, en ese orden, `PTS_H2H`, `DG_H2H`, `GF_H2H`;
- si divide el grupo, continuar criterios normales por subgrupo;
- si no divide, pasar al siguiente criterio configurado;
- aplica igual para empate entre 2, 3 o más equipos;
- partidos aún no disputados entre empatados no aportan datos.

No reiniciar automáticamente el proceso completo sobre todos los equipos después de dividir; cada subgrupo continúa con criterios posteriores.

Si se agotan criterios y sigue empate:

- equipos comparten posición deportiva;
- respuesta incluye `desempateResuelto: false` y `equiposEmpatados`;
- `PARTIDO_DESEMPATE` se marca como `requiereAccionManual` y no se calcula;
- no usar nombre/id como desempate deportivo silencioso. Se podrá usar nombre solo para ordenar visualmente filas con posición compartida.

### Criterios no disponibles

`MENOS_TARJETAS` queda `NO_DISPONIBLE` en FASE 8: no hay eventos/tarjetas suficientes y no se inventan datos.

- La configuración puede contenerlo para preparar fases futuras.
- La tabla devuelve metadata `criteriosNoDisponibles: ["MENOS_TARJETAS"]`.
- El criterio se omite para ordenar hasta que exista fuente de datos aprobada.
- `PARTIDO_DESEMPATE` nunca se resuelve automáticamente.

## 12. Publicación

FASE 8 reutiliza exclusivamente `Partido.publicada`.

- No se agrega publicación global de `Jornada` ni de fixture.
- El fixture público se obtiene filtrando partidos publicados y respetando configuración pública del torneo.
- Un partido no publicado no aparece en endpoint público aunque el torneo sea público.
- Publicar/despublicar partido ya existe en FASE 7 y queda auditado.
- Publicación global del fixture queda para fase posterior si se vuelve necesaria.

## 13. Historial y reprogramaciones

- `FormacionInstancia` nunca se modifica.
- `Convocatoria.cancelada = true` nunca se reactiva ni se modifica por generación.
- Cambios de fecha, lugar, estado o contexto de un partido deben auditarse.
- FASE 8 no agrega `PartidoReprogramacion`; el historial queda en `AuditoriaLog`.
- Si se necesita historial consultable de cada fecha anterior, será decisión separada antes de implementar.

## 14. Endpoints

### Fixture

- `POST /torneo-categorias/:id/fixture/validar` — valida equipos/configuración sin crear.
- `POST /torneo-categorias/:id/fixture/generar` — genera fixture; requiere confirmación explícita.
- `POST /torneo-categorias/:id/fixture/regenerar` — solo fixture virgen; bloquea con partidos operativos.
- `GET /torneo-categorias/:id/fixture` — jornadas, descansos y partidos.
- `GET /zonas/:id/fixture` — fixture de zona.
- `GET /jornadas/:id` — jornada y partidos.
- `PATCH /jornadas/:id` — datos editables antes de uso operativo.

### Tabla

- `GET /torneo-categorias/:id/tabla`.
- `GET /zonas/:id/tabla`.
- `GET /publico/torneo-categorias/:id/tabla` — si la configuración pública lo permite.

No crear endpoint para editar filas de tabla.

## 15. Permisos

| Acción | DELEGADO | TECNICO | AUXILIAR | JUGADOR | ADMINISTRADOR | PÚBLICO |
|---|---|---|---|---|---|---|
| Ver fixture propio | ✔ | ✔ | ✔ | ✔ | según alcance | publicado |
| Generar/regenerar fixture | ✖ | ✖ | ✖ | ✖ | torneo propio | ✖ |
| Ver tabla | ✔ | ✔ | ✔ | ✔ | según alcance | publicada |
| Cambiar configuración | ✖ | ✖ | ✖ | ✖ | torneo propio | ✖ |
| Modificar jornada | ✖ por defecto | ✖ | ✖ | ✖ | torneo propio | ✖ |

## 16. Cambios de schema

No hay cambios obligatorios para FASE 8 base.

Índices opcionales a evaluar después de medir:

- `Partido([torneoCategoriaId, zonaId, estado])`;
- `Partido([tipo, estado, temporadaId])`;
- `Jornada([torneoCategoriaId, zonaId, numero])`.

No aplicar un unique nullable para jornadas como única defensa; backend transaccional es obligatorio.

## 17. Riesgos y decisiones ahora resueltas

- Fixture inicial limitado a ligas round-robin; grupos/playoffs fuera.
- Regeneración explícita, auditada y bloqueada si fixture dejó de estar virgen.
- Puntos/desempates bloqueados al iniciar temporada; sin cambios después de resultados finalizados.
- Desempate múltiple definido por mini-tabla H2H y criterios recursivos.
- `MENOS_TARJETAS` no disponible, sin datos inventados.
- Publicación por `Partido.publicada`, sin mecanismo duplicado.
- Reprogramación histórica detallada queda fuera; auditoría obligatoria.

## 18. Qué entra en FASE 8

- Motor round-robin una/dos ruedas.
- Jornadas y descansos.
- Validación y regeneración segura.
- Fixture por competencia/zona/equipo.
- Tabla calculada y desempates definidos.
- Permisos, auditoría, frontend y tests.
- CHANGELOG `[0.8.0]`.

## 19. Qué queda fuera

- Grupos, playoffs, eliminación directa y fases compuestas.
- Estadísticas individuales/equipo.
- Tarjetas, goleadores, minutos y sustituciones.
- Sanciones completas.
- Eventos en vivo.
- WhatsApp/imágenes.
- Historial de reprogramación como entidad propia.

### Cambio mínimo recomendado

No son necesarios cambios obligatorios para implementar FASE 8 base.

### Índices a evaluar

Agregar solo si las consultas reales lo justifican:

| Modelo | Campo | Tipo | Motivo |
|---|---|---|---|
| `Partido` | `[torneoCategoriaId, zonaId, estado]` | índice compuesto | fixture y tabla por competición/zona |
| `Partido` | `[tipo, estado, temporadaId]` | índice compuesto | filtrar oficiales finalizados |
| `Jornada` | `[torneoCategoriaId, zonaId, numero]` | índice o unique | ordenar jornadas y evitar números duplicados |

No aplicar estos índices sin medir consultas y validar la semántica de `zonaId NULL`.

### Constraint pendiente

`Jornada` actualmente no garantiza que `numero` sea único por competición/zona. Un `@@unique([torneoCategoriaId, zonaId, numero])` con `zonaId` nullable no evita duplicados con NULL en PostgreSQL. Opciones:

1. mantener validación transaccional en backend;
2. usar índice parcial SQL;
3. separar jornadas con y sin zona.

No resolver arbitrariamente antes de aprobar una opción.

## 8. Formatos y alcance del motor

`FormatoCompetencia` ya contiene:

- TODOS_CONTRA_TODOS;
- UNA_RUEDA;
- DOS_RUEDAS;
- FASE_DE_GRUPOS;
- GRUPOS_PLAYOFFS;
- ELIMINACION_DIRECTA;
- LIGA_FASE_FINAL;
- FASE_REGULAR_PLAYOFFS.

### Recomendación de implementación

FASE 8.0 debe implementar solamente `TODOS_CONTRA_TODOS`, `UNA_RUEDA` y `DOS_RUEDAS`. Es el único alcance con reglas de generación suficientemente definidas por el schema actual.

Los formatos de grupos/playoffs requieren decidir:

- estructura de fases;
- clasificación entre fases;
- nombres de fases;
- cómo se representan llaves;
- cómo se conectan partidos de una fase con la siguiente.

Se dejan preparados por `ConfiguracionCompetencia`, pero no se ejecutan en FASE 8.0 sin aprobación adicional.

## 9. Flujo de generación de fixture

```text
ADMIN torneo / SUPERADMIN
  └── selecciona TorneoCategoria + Zona
        ├── lee ConfiguracionCompetencia
        ├── obtiene EquipoParticipacion CONFIRMADO
        ├── valida cantidad mínima de equipos
        ├── calcula rondas y localías
        ├── crea Jornada número 1..N
        ├── crea JornadaEquipoDescanso si corresponde
        └── crea Partido OFICIAL PROGRAMADO
```

Reglas:

- No incluir BAJA, RECHAZADO, PENDIENTE ni INSCRIPTO.
- Cada partido tiene equipos distintos.
- Cada partido creado apunta al mismo torneo, temporada, categoría y zona de su fixture.
- `jornadaId` debe pertenecer a la misma competición.
- No crear partidos si faltan equipos confirmados.
- No modificar formaciones ni convocatorias durante la generación.
- No generar partidos duplicados.

## 10. Fixture y partidos existentes

FASE 8 debe generar usando el mismo `Partido` de FASE 7. No crear `PartidoFixture` ni modelos paralelos.

Partidos independientes no participan en generación ni tabla oficial.

La generación debe ser transaccional: si falla una jornada o partido, no debe quedar fixture parcial.

## 11. Flujo de tabla

```text
GET /torneo-categorias/:id/tabla
  └── validar alcance
  └── leer configuración de puntos/desempates
  └── leer participaciones CONFIRMADO
  └── leer Partido OFICIAL + FINALIZADO
  └── agregar resultados por equipo
  └── calcular PTS/DG
  └── aplicar desempates
  └── devolver posiciones calculadas
```

### Reglas de cálculo

- Partido suspendido, aplazado o programado no suma.
- Partido independiente no suma.
- Partido finalizado con 0-0 es válido.
- El equipo participa en la tabla aunque tenga 0 partidos.
- `GF`, `GC` y `DG` derivan exclusivamente de goles del partido.
- `PTS` deriva exclusivamente de `sistemaPuntos`.
- No almacenar manualmente `PJ`, `PTS` ni posiciones.

### Desempates

Implementar en FASE 8:

- PUNTOS;
- DIFERENCIA_GOLES;
- GOLES_FAVOR;
- RESULTADO_ENFRENTAMIENTO, cuando los datos sean aplicables.

Dejar explícitamente sin cálculo:

- MENOS_TARJETAS (estadísticas/sanciones);
- PARTIDO_DESEMPATE (requiere flujo administrativo).

Si un criterio configurado no tiene datos disponibles, debe informarse en metadata de respuesta o aplicarse como no disponible, no inventarse.

## 12. Endpoints propuestos

### Fixture

- `POST /torneo-categorias/:id/fixture/generar` — generar para categoría/zona.
- `GET /torneo-categorias/:id/fixture` — fixture agrupado por jornada.
- `GET /zonas/:id/fixture` — fixture de una zona.
- `POST /torneo-categorias/:id/fixture/validar` — validar si se puede generar sin crear.

### Jornadas

- `GET /jornadas/:id` — detalle de jornada y partidos.
- `PATCH /jornadas/:id` — modificar nombre/fecha antes de iniciar partidos, según permisos.

### Tabla

- `GET /torneo-categorias/:id/tabla` — tabla completa.
- `GET /zonas/:id/tabla` — tabla por zona.
- `GET /publico/torneo-categorias/:id/tabla` — solo si el torneo/categoría permite visibilidad pública.

### Operaciones administrativas

- `POST /partidos/:id/recalcular-contexto` no se recomienda: el contexto no debe repararse silenciosamente. Usar endpoints específicos y auditoría si se necesita corregir.

## 13. Permisos

| Acción | DELEGADO | TECNICO | AUXILIAR | JUGADOR | ADMINISTRADOR | PÚBLICO |
|---|---|---|---|---|---|---|
| Ver fixture propio | ✔ | ✔ | ✔ | ✔ | ✔ según alcance | público si publicado |
| Generar fixture | ✖ por defecto | ✖ | ✖ | ✖ | ✔ del torneo | ✖ |
| Regenerar fixture | ✖ | ✖ | ✖ | ✖ | ✔ con confirmación | ✖ |
| Ver tabla | ✔ | ✔ | ✔ | ✔ | ✔ | publicada |
| Configurar puntos/desempates | ✖ | ✖ | ✖ | ✖ | ✔ | ✖ |
| Modificar jornada | según equipo, no por defecto | no | no | no | ✔ | no |

Decisión recomendada: generación de fixture y cambios de configuración son responsabilidad del `ADMINISTRADOR` del torneo/SUPERADMIN, no del DELEGADO de un equipo.

## 14. Privacidad y publicación

- Fixture y tabla privadas para usuarios con alcance.
- Público solo accede si:
  - `Partido.publicada = true` para partidos;
  - la configuración pública del torneo/categoría permite mostrar fixture/tabla.
- No exponer caja, datos de contacto privados ni observaciones internas.
- No crear `publicada` en `Jornada`: la visibilidad se deriva del torneo y de los partidos publicados, salvo que se apruebe una política de publicación de fixture completo.

## 15. Auditoría

Auditar:

- generación de fixture;
- validación fallida relevante, sin datos sensibles;
- regeneración o rechazo de regeneración;
- modificación de jornada;
- cambios manuales de partido asociados al fixture;
- consulta/cambio de configuración de puntos y desempates si se implementa aquí.

Un cálculo de tabla de solo lectura no necesita auditoría por cada consulta. Cambios de resultados ya se auditan en FASE 7.

## 16. Integración con módulos anteriores

### Equipos y jugadores

Fixture usa `EquipoParticipacion` confirmado. No modifica `Equipo`, `EquipoJugador` ni `JugadorParticipacion`.

### Formaciones

Los partidos generados pueden recibir posteriormente `FormacionInstancia`. El fixture no crea ni modifica formaciones.

### Convocatorias

Los partidos generados pueden asociarse posteriormente a convocatorias. El fixture no crea ni cancela convocatorias.

### Partidos

Usa `Partido` existente. Resultado y estado siguen siendo responsabilidad de FASE 7.

### Torneos

El alcance deriva de `TorneoCategoria`, `Temporada`, `Zona`, `ConfiguracionCompetencia` y `EquipoParticipacion`.

## 17. Frontend necesario

- `/torneos/:id/temporadas/:temporadaId/categorias/:categoriaId/fixture`:
  - jornadas;
  - partidos por jornada;
  - descansos;
  - generar fixture;
  - validar antes de generar;
  - regenerar con confirmación fuerte.
- `/torneos/:id/.../tabla`:
  - posición;
  - equipo;
  - PJ/PG/PE/PP/GF/GC/DG/PTS;
  - criterio aplicado en desempate.
- Vista de jornada y navegación al detalle de partido.
- Portal público posterior, respetando configuración pública.

No agregar UI de estadísticas, tarjetas, sustituciones ni sanciones completas.

## 18. Tests obligatorios

### Fixture

1. Generar una rueda con cantidad par de equipos.
2. Generar una rueda con cantidad impar y descansos.
3. Generar dos ruedas.
4. No incluir equipos no confirmados.
5. Rechazar categoría sin equipos suficientes.
6. No duplicar fixture existente.
7. Validar partido local/visitante distinto.
8. Todos los partidos comparten contexto torneo/temporada/categoría/zona.
9. Jornada pertenece a la competencia correcta.
10. Generación transaccional: fallo no deja datos parciales.

### Tabla

11. Tabla vacía con equipos confirmados sin partidos.
12. Victoria/empate/derrota con puntos configurados.
13. Partido independiente no suma.
14. Partido no finalizado no suma.
15. Partido oficial finalizado suma goles y puntos.
16. Diferencia de goles.
17. Goles a favor como desempate.
18. Resultado entre sí cuando aplica.
19. Sistema de puntos personalizado.
20. Configuración de desempates personalizada.
21. No tabla pública si visibilidad está desactivada.
22. Tabla pública si configuración y partidos lo permiten.

### Seguridad/regresión

23. Delegado no genera fixture de torneo ajeno.
24. Auxiliar no genera fixture.
25. Admin de otra organización no accede.
26. FormacionInstancia no cambia.
27. Convocatoria cancelada no se modifica.
28. Partidos independientes siguen funcionando.

## 19. Migración y seed

### Migración

No hay cambios obligatorios de schema para FASE 8 base. Podrían agregarse índices después de medir.

### Seed

No hace falta seed de negocio. Los tests deben crear torneos, categorías, zonas, participaciones y partidos controlados.

## 20. CHANGELOG

Agregar `[0.8.0]` con:

- fixture automático;
- jornadas/descansos reutilizando modelos existentes;
- tabla calculada;
- puntos y desempates;
- endpoints, permisos, auditoría y tests.

## 21. Riesgos y decisiones pendientes

1. **Alcance del motor**: se recomienda FASE 8.0 con todos contra todos, una rueda y dos ruedas. Grupos/playoffs quedan preparados pero requieren diseño adicional.
2. **Regeneración**: falta decidir si se permite borrar/regenerar partidos PROGRAMADOS, si se versiona la generación o si se bloquea al existir cualquier resultado.
3. **Índice/unique de jornadas**: `zonaId NULL` hace insuficiente un unique simple. Decidir validación transaccional, índice parcial o separación de jornadas.
4. **Configuración histórica**: si cambian puntos/desempates después de resultados, la tabla recalculada puede cambiar. Decidir si la configuración se congela al iniciar la competición o si la tabla siempre usa configuración actual.
5. **Resultado entre sí**: decidir si se aplica solo con empate de dos equipos o también con empate múltiple.
6. **Partido desempate**: queda fuera; requiere flujo administrativo antes de ordenar tabla.
7. **Publicación del fixture completo**: decidir si basta `Partido.publicada` + configuración del torneo o si se necesita una bandera de publicación en Jornada.
8. **Reprogramaciones**: `Partido` puede cambiar fecha en FASE 7, pero no existe historial de reprogramaciones. No agregarlo silenciosamente en FASE 8; aprobar como extensión separada si hace falta.
9. **Sanciones/tarjetas**: `MENOS_TARJETAS` queda sin datos hasta FASE 9 o sanciones completas.
