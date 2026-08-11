# FASE 11 — Diseño del portal público

## Objetivo

Crear portal público unificado, de solo lectura y mobile-first. Reutiliza reglas, cálculos y publicación existentes; no crea una segunda fuente de verdad ni modifica el schema Prisma.

## API pública

Todos los endpoints viven bajo `/api/publico` y no requieren autenticación:

- `GET /torneos` y `GET /torneos/:id`: torneos `visiblePublico = true`, con configuración pública segura.
- `GET /torneos/:id/temporadas`: temporadas cuyo torneo padre es público.
- `GET /temporadas/:id/categorias`: categoría solo si temporada y torneo padre son públicos.
- `GET /torneo-categorias/:id/zonas`: zona solo si categoría, temporada y torneo padre son públicos.
- `GET /torneo-categorias/:id/fixture` y `GET /zonas/:id/fixture`: reutilizan fixture existente; requieren torneo público, `mostrarFixture = true` y partidos `publicada = true`.
- `GET /torneo-categorias/:id/tabla` y `GET /zonas/:id/tabla`: reutilizan cálculo existente; requieren `mostrarTabla = true` y solo partidos oficiales finalizados publicados.
- `GET /torneo-categorias/:id/estadisticas`, `/goleadores`, `/tarjetas`: reutilizan cálculos existentes; requieren configuración correspondiente y partidos publicados.
- `GET /partidos` y `GET /partidos/:id`: solo partidos publicados de torneos públicos cuando son oficiales; amistosos publicados pueden mostrarse sin torneo.
- `GET /equipos` y `GET /equipos/:id`: solo equipos públicos vinculados a contenido público; campos limitados por configuración. Plantel solo con `mostrarPlantel = true`.
- `GET /formaciones` y `GET /formaciones/:id`: solo formaciones publicadas, y además solo si partido publicado y equipo/torneo permiten el contenido.
- `GET /convocatorias` y `GET /convocatorias/:id`: solo `publicada = true && cancelada = false`, dentro de contenido público.

No existe endpoint público de caja. Nunca se exponen DNI, email, teléfono, fecha de nacimiento, credenciales, datos de contacto de equipo no habilitados, auditoría ni saldos.

## Seguridad y consistencia

- Resolver siempre entidad padre desde el ID recibido; un ID de zona/categoría/temporada ajeno devuelve 404, nunca filtra datos.
- La visibilidad pública del torneo y configuración se valida en cada navegación y recurso descendiente.
- `mostrarNombre`, `mostrarEscudo`, `mostrarPlantel` y `mostrarContacto` controlan la proyección de equipo; contacto queda fuera del portal para mantener política conservadora.
- Jugadores públicos solo exponen nombre, apellido, dorsal y posición cuando corresponda.
- Formaciones solo se muestran publicadas y respetan política del equipo y del partido.
- Convocatorias siempre respetan publicación y cancelación.
- Minutos conservan `null` y `minutosNoDeterminados = true` cuando no hay cálculo determinable.

## Frontend

Rutas públicas: `/`, `/publico/torneos`, `/publico/torneos/:id`, `/publico/torneos/:id/temporadas/:temporadaId`, `/publico/competencias/:id`, `/publico/partidos/:id`, `/publico/equipos/:id`, `/login` y `/register`. Navegación responsive mobile-first. Login y registro permanecen separados del portal y no se exige autenticación para consultar contenido público.

## Verificación

Tests HTTP cubren publicación, configuración, jerarquía padre, IDs cruzados, privacidad de equipos/jugadores, formaciones, convocatorias, estadísticas, minutos, ausencia de caja y regresión de fases 1–10.
