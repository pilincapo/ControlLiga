# FASE 9 — Estadísticas, eventos y disciplina: diseño

Estado: **DISEÑO DEFINITIVO E IMPLEMENTADO**. Base funcional: FASE 8.

## 1. Objetivo

Implementar fuente de verdad para eventos de partidos, estadísticas de jugadores/equipos y disciplina completa, sin modificar datos históricos de FASE 4–8.

La regla principal es:

```text
EVENTOS OFICIALES DEL PARTIDO
  └── métricas derivadas de jugador/equipo
        └── estadísticas, goleadores, tarjetas, minutos, tabla disciplinaria
```

No guardar agregados manuales como fuente independiente si pueden calcularse desde eventos y partidos finalizados.

## Decisiones definitivas aprobadas

1. **Participación y minutos:** FASE 9 registra titularidad, ingreso, salida y minuto del cambio. No calcula minutos jugados todavía. La función futura usará `FormacionInstanciaJugador` y sustituciones; si faltan datos, devolverá `noDeterminados`. No se solicita carga manual de minutos.
2. **Goles:** `EventoPartido(GOL)` es fuente de estadísticas; `Partido.golesLocal/golesVisitante` sigue siendo resultado oficial. No se finaliza con discrepancias no resueltas.
3. **Tarjetas/sanciones:** tarjeta = evento; `Sancion` = resolución oficial. Nunca crear sanción automáticamente.
4. **Eventos:** un único modelo extensible `EventoPartido`, con tipos `GOL`, `ASISTENCIA`, `TARJETA`, `SUSTITUCION`.
5. **Estadísticas:** cálculo bajo demanda desde datos base; no persistir agregados en FASE 9.
6. **Sustituciones:** completas, con jugador que sale/entra, minuto, período, pertenencia y elegibilidad. Sirven como fuente futura de minutos, pero FASE 9 no calcula aún minutos.
7. **Independientes:** contribuyen a estadísticas generales de equipo/jugador, pero nunca a estadísticas oficiales de torneo.
8. **Finalizados:** no se reabren; correcciones mediante operaciones específicas, auditadas, sin borrar eventos.
9. **Privacidad:** estadísticas públicas requieren `Partido.publicada` y configuración pública; nunca datos privados.
10. **Identidad histórica:** si existe instancia, usar `FormacionInstanciaJugador` para nombre/dorsal/identidad del momento.

## 2. Estado actual revisado

### `Partido`

Ya contiene tipo, equipos, torneo/temporada/categoría/zona/jornada, fecha, estado, goles, publicación, formaciones snapshot, convocatorias y sanciones.

Se reutiliza como contexto de toda estadística. Solo partidos válidos y finalizados alimentan estadísticas oficiales.

### `FormacionInstancia` / `FormacionInstanciaJugador`

FASE 5 conserva snapshot de la formación usada en partido:

- titulares/suplentes;
- posición táctica;
- coordenadas;
- nombre y dorsal snapshot.

No modificar snapshots. Sirven como contexto inicial, no prueban por sí solos minutos jugados.

### `Convocatoria` / `ConvocatoriaJugador`

FASE 6 representa disponibilidad/respuesta logística. No equivale a participación real.

- `PENDIENTE`, `CONFIRMADO`, `NO_DISPONIBLE`, `AUSENTE` no deben convertirse automáticamente en minutos o apariciones.
- Convocatorias canceladas (`cancelada = true`) permanecen históricas y no generan estadísticas.

### `EquipoJugador` / `JugadorParticipacion`

Definen pertenencia al equipo y participación en competición. Se usan para validar que un jugador podía actuar, pero no se alteran al cargar eventos históricos.

### `Sancion`

Ya existe y contiene jugador/equipo/partido, origen, tipo, motivo, vigencia y resolución. Es suficiente como base de la sanción disciplinaria, pero no reemplaza el evento de tarjeta ocurrido durante un partido.

### Roadmap previo

FASE 7 dejó explícitamente para FASE 9: goleadores, tarjetas, minutos, sustituciones y eventos. FASE 3/7 dejaron sanciones completas para una fase posterior. FASE 9 debe cubrirlos solo si se aprueba el alcance; caja, pagos, portal completo y WhatsApp siguen fuera.

## 3. Alcance propuesto

### Incluido

- eventos de partido oficiales e independientes;
- goles y asistencias;
- tarjetas amarillas/rojas;
- sustituciones;
- minutos jugados y apariciones;
- estadísticas por jugador y equipo;
- goleadores y rankings;
- sanciones completas basadas en `Sancion`;
- recalculación derivada al corregir eventos;
- auditoría e historial de cambios;
- permisos por equipo/torneo;
- frontend básico de carga y consulta.

### Fuera de alcance

- caja/pagos;
- WhatsApp e imágenes;
- algoritmo de fixture;
- cambios automáticos de plantel;
- edición de `FormacionInstancia` histórica;
- edición de convocatorias canceladas;
- inteligencia automática sobre rendimiento;
- video, tracking físico o GPS.

## 4. Modelo conceptual

```text
PARTIDO FINALIZADO
  ├── EVENTOPARTIDO
  │     ├── GOL
  │     ├── ASISTENCIA
  │     ├── TARJETA
  │     └── SUSTITUCION
  │
  ├── FORMACIÓNINSTANCIA (snapshot inicial, inmutable)
  ├── CONVOCATORIA (disponibilidad, no participación real)
  └── SANCION (resolución disciplinaria)

EVENTOPARTIDO + estado del partido
  └── ESTADISTICAPARTIDOJUGADOR (derivada o materialización invalidable)
        └── consultas de jugador/equipo/torneo
```

## 5. Modelo recomendado de eventos

### `EventoPartido` (nuevo)

Fuente normalizada de eventos deportivos.

| Campo | Tipo | Default | Motivo |
|---|---|---|---|
| `id` | UUID PK | uuid | Identidad |
| `partidoId` | UUID FK → Partido | obligatorio | Contexto |
| `equipoId` | UUID FK → Equipo | obligatorio | Equipo del evento |
| `jugadorId` | UUID FK → Jugador | nullable | Jugador principal |
| `jugadorRelacionadoId` | UUID FK → Jugador | nullable | Asistencia o jugador sustituido |
| `tipo` | `TipoEventoPartido` | obligatorio | GOL, ASISTENCIA, TARJETA, SUSTITUCION |
| `subtipo` | String? | null | AMARILLA, ROJA, ENTRA, SALE, etc. |
| `minuto` | Int? | null | Minuto reglamentario |
| `minutoAdicional` | Int? | null | Tiempo añadido |
| `orden` | Int | 0 | Orden estable dentro del minuto |
| `periodo` | String? | null | PRIMER_TIEMPO, SEGUNDO_TIEMPO, etc. |
| `observaciones` | String? | null | Nota operativa no sensible |
| `anulado` | Boolean | false | Corrección sin borrar historial |
| `creadoPorId` | UUID FK → Usuario | null | Actor |
| `createdAt` | DateTime | now | Auditoría temporal |
| `updatedAt` | DateTime | updatedAt | Cambios |

Constraints:

- `@@index([partidoId, minuto, orden])`;
- `@@index([jugadorId, tipo])`;
- `@@index([equipoId, tipo])`;
- `@@unique([partidoId, orden])` si `orden` es asignado globalmente; alternativa: no usarlo como unique y ordenar por `createdAt`.

**Recomendación:** no usar unique global sobre `orden`, porque correcciones y concurrencia hacen frágil esa regla. Usar `(minuto, orden, createdAt)` para orden visual.

### `TipoEventoPartido` (nuevo)

```text
GOL
ASISTENCIA
TARJETA
SUSTITUCION
```

No agregar eventos de estadísticas agregadas. Las métricas se calculan desde estos eventos y el contexto del partido.

## 6. Reglas de eventos

### Goles

- `GOL` requiere partido, equipo y jugador;
- jugador debe pertenecer al equipo en la competencia o al equipo del partido en independientes;
- el equipo debe ser local o visitante;
- el resultado oficial de FASE 7 sigue siendo `Partido.golesLocal/golesVisitante`;
- al finalizar debe validarse que goles no anulados por eventos coincidan con `Partido.golesLocal/golesVisitante`;
- una discrepancia bloquea el cierre y la publicación de estadísticas;
- una operación administrativa explícita y auditada puede corregir eventos o resultado; no se corrige silenciosamente.

### Asistencias

- `ASISTENCIA` requiere jugador principal y jugador asistidor;
- ambos deben corresponder al equipo del gol;
- no contar automáticamente asistencias si no fueron cargadas;
- una asistencia no modifica el resultado.

### Tarjetas

- `TARJETA` requiere jugador, equipo y subtipo `AMARILLA` o `ROJA`;
- una tarjeta no debe duplicarse por accidente: validar minuto/orden, pero permitir dos tarjetas reales en un partido;
- la tarjeta ocurrida es evento; la sanción resultante es `Sancion`.

### Sustituciones

- `SUSTITUCION` requiere jugador que sale y jugador que entra;
- ambos deben pertenecer al mismo equipo y estar habilitados para el partido;
- jugador que entra no puede ser BAJA/INVITADO;
- jugador que entra no puede estar ya activo en el campo sin una salida previa;
- jugador que sale debe haber entrado o ser titular inicial de la `FormacionInstancia`;
- si existe `FormacionInstancia`, ambos jugadores deben ser coherentes con ella o con una incorporación válida al partido;
- `minuto` y `periodo` son obligatorios y `minuto` no puede ser negativo;
- no modificar `EquipoJugador.estado`;
- derivar minutos desde sustituciones y límites del partido.

## 7. Estadísticas derivadas

### Opción recomendada

Calcular bajo demanda desde `Partido`, `EventoPartido`, `FormacionInstancia` y pertenencias. No crear tabla persistida inicialmente.

Si el volumen futuro exige materialización, agregar cache invalidable, nunca una segunda fuente manual.

### Métricas de jugador

- partidos convocado: no es aparición;
- partidos jugados: requiere titularidad snapshot o evento de entrada/participación validada;
- titularidades: `FormacionInstanciaJugador.esTitular` cuando la instancia representa el partido;
- participación: `participo`, `titular`, `ingresoMinuto` y `salidaMinuto` se derivan de snapshot/eventos;
- minutos jugados: quedan fuera de cálculo obligatorio en FASE 9 y se devuelven como `noDeterminados`;
- una futura activación calculará con inicio/final del partido y tiempo adicional, sin modificar eventos históricos;
- goles: eventos `GOL` no anulados;
- asistencias: eventos `ASISTENCIA` no anulados;
- amarillas/rojas: eventos `TARJETA` no anulados;
- sanciones: registros `Sancion` vigentes/resueltos.

### Métricas de equipo

- goles a favor/en contra: resultado oficial de `Partido` para tabla; eventos para desglose;
- victorias/empates/derrotas: resultado final;
- tarjetas: eventos agregados;
- convocados y ausentes: solo estadísticas logísticas, nunca minutos.

## 8. Sanciones

Reutilizar `Sancion`; no duplicar una tabla disciplinaria.

Flujo:

```text
Evento TARJETA
  └── autoridad crea Sancion (si corresponde)
        ├── origen PARTIDO / ACUMULACION_TARJETAS / TRIBUNAL
        ├── fechaInicio/fechaFin
        ├── resuelta
        └── auditoría
```

No se crean sanciones automáticamente desde tarjetas. Una autoridad puede ejecutar una acción explícita para crear o modificar `Sancion` tomando una tarjeta como referencia; la operación queda auditada.

## 9. Historial y correcciones

- No borrar eventos: `anulado = true` y auditoría.
- Corregir un evento crea auditoría con valores anteriores/nuevos.
- Las métricas ignoran eventos anulados.
- No modificar `FormacionInstancia`.
- No modificar convocatorias canceladas.
- Cambiar resultado del partido requiere permisos de FASE 7 y dispara invalidación/recalculo de métricas.
- Partido no finalizado puede tener eventos preliminares, pero no genera estadísticas oficiales publicadas.
- Partido independiente sí genera estadísticas generales de equipo/jugador, pero nunca estadísticas oficiales de torneo ni afecta tabla.
- Partido finalizado no se reabre. Correcciones usan endpoints administrativos específicos y auditoría; eventos se anulan, nunca se borran.

## 10. Posible modelo de estadísticas materializadas

No implementar inicialmente.

Si luego se necesita:

### `EstadisticaPartidoJugador`

- `id` PK;
- `partidoId` FK;
- `jugadorId` FK;
- campos derivados: minutos, titular, goles, asistencias, amarillas, rojas;
- unique `(partidoId, jugadorId)`;
- regenerable desde eventos;
- nunca editar manualmente.

Esta tabla solo se justifica por rendimiento, no por necesidad funcional inicial.

## 11. Permisos

Reutilizar permisos existentes y agregar solo los necesarios:

| Acción | DELEGADO | TECNICO | AUXILIAR | JUGADOR | ADMINISTRADOR | PÚBLICO |
|---|---|---|---|---|---|---|
| Cargar eventos de su equipo | ✔ | ✔ | ✖ | ✖ | oficial según alcance | ✖ |
| Editar/anular eventos | ✔ | ✔ | ✖ | ✖ | oficial según alcance | ✖ |
| Ver estadísticas de equipo | ✔ | ✔ | ✔ | ✔ | ✔ | publicadas |
| Ver estadísticas propias | ✔ | ✔ | ✔ | ✔ | ✔ | solo publicadas |
| Crear Sancion | ✔ según alcance | ✔ según alcance | ✖ | ✖ | ✔ torneo | ✖ |
| Resolver Sancion | ✖ por defecto | ✖ | ✖ | ✖ | ✔ autoridad torneo | ✖ |

Permisos shared previstos:

- `estadisticasVer` ya existe;
- `estadisticasGestionar` nuevo solo si se separa carga de eventos de consulta;
- `sanciones:gestionar` ya existe, pero requiere enforcement por equipo/torneo.

## 12. Endpoints propuestos

### Eventos

- `GET /partidos/:id/eventos`;
- `POST /partidos/:id/eventos`;
- `PATCH /eventos-partido/:id`;
- `POST /eventos-partido/:id/anular`.

### Estadísticas

- `GET /partidos/:id/estadisticas`;
- `GET /jugadores/:id/estadisticas`;
- `GET /equipos/:id/estadisticas`;
- `GET /torneo-categorias/:id/estadisticas`;
- `GET /torneo-categorias/:id/goleadores`;
- `GET /torneo-categorias/:id/tarjetas`.

### Disciplina

- `GET /partidos/:id/sanciones`;
- `POST /sanciones`;
- `PATCH /sanciones/:id`;
- `POST /sanciones/:id/resolver`;
- `POST /sanciones/:id/anular` o estado equivalente, sin borrar.

### Público

- `GET /publico/partidos/:id/estadisticas` si partido publicado;
- `GET /publico/torneo-categorias/:id/goleadores` según configuración pública;
- no exponer datos privados ni notas internas.

## 13. Privacidad/publicación

- Eventos y estadísticas privadas por defecto.
- Estadísticas públicas solo si el partido/torneo permite publicación.
- `Partido.publicada` sigue siendo filtro base para datos públicos del partido.
- La configuración pública del torneo controla tabla, estadísticas, goleadores y tarjetas.
- No publicar notas internas de eventos, sanciones ni datos de contacto.

## 14. Integración con FASE 4–8

- `EquipoJugador`: valida pertenencia y estado; no se modifica al registrar eventos.
- `JugadorParticipacion`: valida habilitación en una competencia oficial.
- `FormacionInstancia`: informa titularidad inicial y dorsal snapshot; permanece inmutable.
- `Convocatoria`: informa convocatoria/respuesta, no aparición ni minutos.
- `Partido`: contexto, resultado y publicación; eventos se subordinan a él.
- `Sancion`: resolución disciplinaria vinculada opcionalmente al evento/partido.
- `TorneoCategoria`: limita estadísticas oficiales por temporada/zona.

## 15. Frontend

- Detalle de partido: línea temporal de eventos, cargar/anular evento, resumen de estadísticas.
- Panel de equipo: jugadores, minutos, goles, tarjetas, sanciones.
- Panel de torneo: goleadores, asistencias, tarjetas y disciplina.
- Ficha de jugador: estadísticas por equipo, temporada y torneo.
- Panel administrativo de sanciones.
- Estados de carga y corrección visibles.
- Sin editor de video, tracking ni generación de imágenes.

## 16. Tests obligatorios

### Eventos

1. Cargar gol válido.
2. Rechazar jugador/equipo ajeno.
3. Cargar asistencia válida.
4. Cargar tarjetas amarilla/roja.
5. Cargar sustitución con jugadores del mismo equipo.
6. Rechazar BAJA/INVITADO.
7. Permitir INACTIVO/LESIONADO/SUSPENDIDO sin cambiar estado.
8. Anular evento sin borrarlo.
9. Eventos anulados no suman.
10. Partido no finalizado no publica estadísticas oficiales.

### Estadísticas

11. Goles por jugador.
12. Asistencias.
13. Tarjetas.
14. Titularidad desde snapshot.
15. Minutos con sustituciones.
16. Estadísticas por equipo.
17. Estadísticas por torneo/categoría/zona.
18. Corrección de resultado recalcula métricas dependientes.

### Disciplina

19. Crear sanción desde autoridad permitida.
20. Resolver sanción.
21. Sanción no se borra físicamente.
22. Acumulación no inventa sanciones automáticamente.

### Seguridad/publicación

23. DELEGADO no carga eventos para equipo ajeno.
24. AUXILIAR no modifica eventos.
25. JUGADOR no modifica estadísticas.
26. ADMIN de torneo gestiona oficiales dentro de alcance.
27. Público no ve datos no publicados.
28. Auditoría sin datos sensibles.

## 17. Migración y seed

FASE 9 requerirá migración si se aprueba `EventoPartido` y sus enums.

No hay seed obligatorio de datos de negocio. Puede existir seed de tipos de evento si se elige catálogo, pero se recomienda enum validado compartido para tipos base.

## 18. CHANGELOG

Agregar `[0.9.0]` con eventos, estadísticas derivadas, disciplina, permisos, auditoría, endpoints, frontend y tests.

## 19. Decisiones cerradas y riesgos restantes

Decisiones cerradas:

1. Minutos desde snapshot inicial + sustituciones; corrección explícita si datos insuficientes.
2. Eventos GOL y resultado del partido deben coincidir antes de finalizar/publicar.
3. Tarjetas no crean sanciones automáticamente.
4. Un único `EventoPartido` extensible.
5. Estadísticas calculadas bajo demanda, sin agregados persistidos.
6. Sustituciones completas dentro de FASE 9.
7. Partidos independientes entran en estadísticas generales, no oficiales.
8. Partido finalizado no se reabre; correcciones auditadas sin borrado físico.
9. Privacidad existente, sin política especial de menores.

Decisiones finales de implementación:

1. Duración oficial no existe en schema actual: no se presume duración; minutos sin cierre verificable se devuelven como `noDeterminados`.
2. Eventos sin `FormacionInstancia` son válidos para goles, asistencias y tarjetas; minutos permanecen `noDeterminados`.
3. Asistencias se validan por equipo y jugador, sin relación obligatoria con un gol.
4. `Sancion` se reutiliza sin FK a evento; su creación/resolución queda explícita y auditada.
5. No se materializan estadísticas agregadas en FASE 9.
6. `minutoAdicional` no forma parte del modelo mínimo aprobado; `periodo` y `orden` conservan orden operativo.
