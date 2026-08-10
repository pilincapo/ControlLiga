# FASE 3 — Módulo de Torneos: diseño aprobado

Estado: **APROBADO** para implementación. Este documento es la referencia del diseño.

## Flujo de creación de torneo

```
ADMIN (con organizacionesAdministrar)
  └─ valida alcance: RolUsuario.organizacionId == torneo.organizacionId
  └─ POST /torneos  → estado = BORRADOR
       ├─ datos: nombre, descripción, logoUrl, reglas
       ├─ config pública inicial (todo oculto)
  └─ Configuración (solo BORRADOR):
       ├─ formato + config por categoría
       ├─ sistema de puntos (3/1/0 por defecto)
       ├─ criterios de desempate (orden)
  └─ PATCH estado → INSCRIPCIONES   (habilita inscribir/invitar equipos)
  └─ (temporadas ya publicadas) → ACTIVO
  └─ FINALIZADO → solo lectura de resultados
  └─ ARCHIVADO → oculto del activo, historial intacto
```

Reglas:
- No borrar torneos: se usan estados. Toda transición queda en `AuditoriaLog`.
- `BORRADOR ↔ INSCRIPCIONES ↔ ACTIVO → FINALIZADO → ARCHIVADO`.
- No volver de FINALIZADO a ACTIVO sin flujo explícito de reapertura (auditable).

## Estados del torneo

`BORRADOR`, `INSCRIPCIONES`, `ACTIVO`, `FINALIZADO`, `ARCHIVADO`.

El campo `activo` (boolean) se reemplaza por `estado` para evitar estados inconsistentes duplicados.

## Temporadas

Un torneo tiene varias temporadas/ediciones (Apertura 2026, Clausura 2026...). Cada una conserva su propio historial.

Estados de temporada: `BORRADOR`, `PUBLICADO`, `EN_CURSO`, `FINALIZADO`, `CANCELADO`.

Cada temporada tiene sus propias `TorneoCategoria`, `EquipoParticipacion`, `Partido` y configuraciones.

## Categorías

- `Categoria` = catálogo global de etiquetas (Primera, Reserva, Femenino...), se crean una vez.
- `TorneoCategoria` = la competición real de una temporada: `unique(torneoId, temporadaId, categoriaId)`.
- Cada `TorneoCategoria` tiene su `ConfiguracionCompetencia` (formato, puntos, desempates).

## Zonas

- `Zona` cuelga de `TorneoCategoria`.
- Zona única: crear una zona por defecto o dejar `zonaId` null en participaciones.
- Varias zonas: `Zona A`, `Zona B`... y asignar equipos con `EquipoParticipacion.zonaId`.
- La relación de zona con torneo se deriva por `Zona -> TorneoCategoria -> Temporada -> Torneo` (no hay `torneoId` redundante).

## Inscripción de equipos

Modelo único `EquipoParticipacion`. Dos caminos:

```
A) INVITACIÓN (organizador → equipo): estado PENDIENTE
   → el delegado del equipo acepta/rechaza → CONFIRMADO / RECHAZADO

B) SOLICITUD (equipo → organizador): estado INSCRIPTO
   → organizador acepta → CONFIRMADO / RECHAZADO
```

Estados: `PENDIENTE`, `INSCRIPTO`, `CONFIRMADO`, `RECHAZADO`, `BAJA`.

- Después de CONFIRMADO: asignar categoría y zona.
- Baja: `estado = BAJA` + `fechaBaja`. No se borra fila → historial.
- No duplicar equipos: un mismo `Equipo` no se duplica; la participación es por temporada.

### Regla de unicidad de participación

Se elimina la restricción estricta `@@unique([equipoId, torneoId, temporadaId])` porque impediría una reinscripción válida tras una baja histórica.

Regla de integridad (implementada transaccionalmente en backend, documentada):

> Un equipo puede tener a lo sumo **una participación activa** por `(torneo, temporada)`, donde activa = estado `PENDIENTE | INSCRIPTO | CONFIRMADO`. Las participaciones `RECHAZADO` y `BAJA` no bloquean una nueva participación y conservan su historial.

## Formato de competición

Formato = enum + JSON de configuración tipado, validado con tipos/esquemas en `@controlliga/shared`.

`FormatoCompetencia`: `TODOS_CONTRA_TODOS`, `UNA_RUEDA`, `DOS_RUEDAS`, `FASE_DE_GRUPOS`, `GRUPOS_PLAYOFFS`, `ELIMINACION_DIRECTA`, `LIGA_FASE_FINAL`, `FASE_REGULAR_PLAYOFFS`.

`configuracionFormato` (Json) expresa fases encadenadas:

```jsonc
{
  "fases": [
    { "tipo": "LIGA",       "ruedas": 2 },
    { "tipo": "GRUPOS",     "cantidadGrupos": 2, "clasificanPorGrupo": 2 },
    { "tipo": "PLAYOFFS",   "llaves": ["CUARTOS", "SEMIS", "FINAL"], "definenTercerPuesto": true }
  ],
  "eliminacionDirectaIdaYVuelta": true
}
```

El motor de fixture futuro solo lee esta config.

## Sistema de puntos

Configurable por competición (`ConfiguracionCompetencia`). Por defecto:

```
victoria = 3, empate = 1, derrota = 0
```

Se congela en `EN_CURSO` (con auditoría del cambio). Validado por tipos en shared.

## Desempates

Lista **ordenada** de criterios:

```jsonc
[ "PUNTOS", "DIFERENCIA_GOLES", "GOLES_FAVOR", "RESULTADO_ENFRENTAMIENTO", "MENOS_TARJETAS", "PARTIDO_DESEMPATE" ]
```

- El orden define prioridad.
- `PARTIDO_DESEMPATE` no es un cálculo: es acción manual del organizador (se audita).
- `MENOS_TARJETAS` se aplica cuando existan datos de tarjetas (fase de estadísticas).

## Permisos

Se amplía el RBAC existente con:

| Permiso | Roles |
|---|---|
| `torneos:ver` | ADMINISTRADOR, DELEGADO_TECNICO, JUGADOR |
| `torneos:administrar` (existente) | ADMINISTRADOR, SUPERADMIN |
| `equipos:inscribir` | ADMINISTRADOR, DELEGADO_TECNICO |
| `partidos:cargarResultados` | ADMINISTRADOR, DELEGADO_TECNICO |
| `sanciones:gestionar` | ADMINISTRADOR, DELEGADO_TECNICO |
| `estadisticas:ver` | ADMINISTRADOR, DELEGADO_TECNICO, JUGADOR |

### Alcance

- `ADMINISTRADOR`: solo organizaciones/torneos de `RolUsuario.organizacionId`. Nunca torneos de otra organización.
- `DELEGADO_TECNICO`: **sin permisos globales**; su alcance se limita a los equipos que administra (`EquipoUsuario` activo) y solo donde su equipo participa.
- `SUPERADMIN`: global.

## Portal público

- Solo lectura, sin autenticación, rutas separadas `/publico/*` (fase posterior).
- Visibilidad gobernada por `Torneo.visiblePublico` + `configuracionPublica` (Json): mostrar info, categorías, zonas, equipos, tabla, fixture, resultados, estadísticas, goleadores, tarjetas.
- Nunca exponer: caja, pagos, gastos, información financiera ni datos privados del equipo.

## Panel del organizador

Secciones: Resumen, Configuración, Temporadas, Categorías, Zonas, Equipos, Jugadores, Configuración pública. Fixture/Tabla/Estadísticas/Sanciones quedan para fases posteriores.

## Auditoría

Se reutiliza `AuditoriaLog` (entidad, entidadId, acción CREATE/UPDATE/DELETE, cambios JSON). Toda transición de estado y toda acción relevante (creación de torneo/temporada, inscripción/retiro, cambios de categoría/zona, configuración) se audita.

## Separación FASE 3 / fases posteriores

**FASE 3 (esta):** modelos aprobados + migración; CRUD y flujos de torneos, temporadas, categorías, zonas, inscripción de equipos y `JugadorParticipacion`; máquina de estados; permisos y alcance; `configuracionPublica` (tipos y validación); panel del organizador básico; tests.

**Fases posteriores:** generador de fixture y `PartidoReprogramacion`; carga de resultados y cálculo de tabla; estadísticas (goleadores, tarjetas, minutos); sanciones completas; portal público frontend; caja; notificaciones y WhatsApp.
