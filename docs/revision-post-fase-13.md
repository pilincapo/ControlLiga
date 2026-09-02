# Revision post FASE 13

Fecha: 2026-08-11

Base revisada: `main`, commit `7a96b66`.

> **Nota de vigencia sobre funciones financieras.** Este documento es un registro histórico de la revisión post FASE 13. Desde entonces la Caja fue retirada del producto actual: **no hay caja, cuotas/pagos del plantel ni MercadoPago/gateways** en las hojas de ruta vigentes. Las migraciones y modelos históricos de caja (`MovimientoCaja`) se conservan solo por compatibilidad e historial, sin exponerse a usuarios. Las referencias a «Caja» abajo como módulo activo o como pendiente quedan anuladas por esta nota.

## 1. Resumen ejecutivo

ControlLiga tiene una base funcional y probada para operar ligas simples, equipos, planteles, partidos, convocatorias, formaciones, eventos basicos, caja simple, portal publico e invitaciones internas. La suite declarada al inicio de esta revision permanece verde: 275 tests API, 21 web y 2 shared. Durante esta revision se ejecuto API: 275 tests verdes en 113 s.

No recomiendo iniciar ahora competencia avanzada. Hay brechas de aislamiento entre organizaciones/equipos, exposicion publica de recursos privados, administracion de roles con escalamiento de privilegios y ausencia de infraestructura de beta. Esas brechas pesan mas que agregar formatos de torneo.

Recomendacion: FASE 14 debe ser **Hardening multi-tenant y preparacion para beta controlada**. No es un refactor estetico: corrige controles de acceso y privacidad antes de incorporar usuarios reales. No requiere schema ni migracion como alcance base.

## 2. Estado FASE 1-13

### Modulos completos o funcionales

| Modulo | Estado real |
|---|---|
| Base monorepo, PostgreSQL Docker, Prisma, shared, lint, typecheck y Vitest | Funcional desde FASE 1. |
| Auth | Registro, login, cookie httpOnly, sesiones opacas hasheadas, refresh, logout, vinculacion jugador y auditoria. Reset y cambio de password existen desde FASE 12. |
| RBAC base | Roles globales, ambitos de organizacion/torneo/equipo, permisos shared y roles por equipo. Enforcement presente en gran parte de rutas. |
| Equipos y jugadores | CRUD principal, plantilla, estados, administradores, historial, privacidad y vinculacion por identidad. |
| Torneos | Torneo, temporada, categoria, zona, participaciones, jugadores por participacion y estados. |
| Fixture y tabla | Round-robin de una/dos ruedas, jornadas, descansos, regeneracion protegida y tabla para liga. |
| Partidos | CRUD, estados, resultado, publicacion, convocatorias/formaciones asociadas y auditoria. |
| Formaciones y convocatorias | Operacion principal, snapshots de formacion, respuestas y publicacion. |
| Eventos, estadisticas y disciplina | Goles, asistencias, tarjetas, sustituciones, anulacion/correccion auditada, estadisticas bajo demanda y sanciones explicitas. |
| Caja simple | ~~Movimientos, estados, resumen, deudas simples, filtros API, auditoria y privacidad por equipo.~~ **RETIRADA del producto actual** (solo datos historicos conservados, sin exponerse). |
| Portal publico API | Torneos, temporadas, categorias, zonas, fixture, tabla, estadisticas, equipos, partidos, formaciones y convocatorias con proyecciones limitadas. |
| Invitaciones y notificaciones | Invitacion formal de jugador/cuerpo tecnico, TTL lazy, aceptacion/rechazo/revocacion, notificaciones internas persistentes, contador y deep-links. |

### Modulos parciales

| Modulo | Estado y faltante |
|---|---|
| Competencia | Schema/shared enumeran grupos, playoffs y eliminacion; motor solo acepta `TODOS_CONTRA_TODOS`, `UNA_RUEDA` y `DOS_RUEDAS` (`apps/api/src/fixture/servicio.ts:11,57-61`). |
| Portal publico web | Existe navegacion de torneo/temporada/categoria, pero `PublicResourcePage` muestra JSON crudo y no hay pantallas de fixture, tabla, goleadores, tarjetas, formaciones ni convocatorias. |
| Caja web | ~~Alta simple, pago/anulacion y resumen dentro de `EquipoPage`; faltan filtros, deudas, historial, detalle, comprobantes y categorias completas.~~ **RETIRADA**: sin UI de caja en el producto actual. |
| Eventos y disciplina web | Detalle muestra informacion; no hay UI para crear/corregir/anular eventos ni gestionar sanciones/leaderboards. |
| Gestion administrativa | API de usuarios/roles existe; no hay UI de usuarios, roles u organizaciones. `organizaciones` solo expone detalle. |
| Comunicacion externa | Email de password reset usa `EmailSenderDesarrollo`, sin SMTP/API real. Invitaciones y notificaciones son internas solamente. |
| Movil/operacion | No PWA, app movil, storage de imagenes, observabilidad, backups, deploy ni configuracion de produccion. |

### Funciones diseniadas como pendientes que ya existen

- Recuperacion/cambio de password, tokens hasheados, TTL, revocacion de sesiones y limitador de reset: implementados, aunque email real no lo esta.
- Invitaciones formales de jugador y cuerpo tecnico, lista propia, revocacion y notificaciones internas: implementadas.
- Notificaciones de participaciones, convocatorias, fixture y cambios de partido: implementadas.
- Sanciones y endpoints de estadisticas: existen en API, aunque UX y aislamiento tienen faltantes.

### Discrepancias documentacion/codigo

- `README.md:5` declara estado hasta FASE 11; codigo y changelog incluyen FASE 12 y 13.
- `docs/fase-13-diseno-invitaciones-notificaciones.md:3` mantiene estado `PROPUESTA` y dice que no se modifico schema. Contradice schema, rutas, frontend y commit `7a96b66`.
- `CHANGELOG.md:5-19` describe backend de FASE 13, pero omite paginas, badge y tests web existentes.
- Changelog/FASE 11 presentan portal como navegable; `apps/web/src/pages/PublicResourcePage.tsx:11-25` expone JSON generico, no una experiencia de portal terminada.
- `docs/fase-9-diseno.md:419-426` y codigo coinciden correctamente: no se calculan minutos. Debe mantenerse `minutos: null` y `minutosNoDeterminados: true`.

## 3. Pendientes funcionales evaluados

### Competencia avanzada

- Fase de grupos: hay `Zona` y tabla por zona, pero solo asignacion manual. No hay generador por grupos, ranking cruzado ni clasificacion.
- Playoffs/eliminacion/llaves: no hay modelos de fase, llave, serie, slot, origen de participante o avance por ganador. `Partido` no puede representar participantes futuros.
- Tercer puesto e ida/vuelta eliminatorio: sin modelo de serie, agregado, penales, tiempo extra ni relacion entre partidos. Dos ruedas actuales son solo liga.
- Cruces: configuracion JSON menciona `fases`, `llaves` y clasificados, pero `validarConfiguracionFormato` solo valida tipo de fase (`packages/shared/src/torneos.ts:121-135`).
- Reprogramacion: PATCH de partido permite fecha/lugar y manda notificacion, pero auditoria guarda solo nombres de campos. No hay razon, valor anterior/nuevo, aprobacion, revision ni historial consultable.
- Arbitro/cancha: `Partido.arbitro` y `Partido.lugar` son texto libre. No hay entidad, disponibilidad, conflictos ni asignaciones.

### Jugadores y equipos

- Solicitud jugador -> equipo: fuera de FASE 13 y no implementada. Debe definir descubrimiento, consentimiento, privacidad, antiflood y quien aprueba.
- Busqueda/unirse a equipos: no existe producto de descubrimiento ni solicitud de adhesion. La busqueda actual se centra en jugador por DNI para gestion interna.
- Invitaciones de FASE 13: cubren jugador y cuerpo tecnico. Invitaciones de equipo a torneo siguen en `EquipoParticipacion` sin TTL; es una decision explicita, no una omision accidental.

### Comunicacion

- Email real para reset: interfaz lista, adapter de desarrollo solamente (`apps/api/src/auth/email.ts`).
- Email de invitaciones, push, WhatsApp y compartir enlaces: no implementados. No deben entrar antes de resolver seguridad, proveedor, consentimientos, colas/reintentos y observabilidad.

### Portal y contenido

- No hay noticias, galerias/fotos ni tarjetas de contenido.
- No hay slugs ni SEO de servidor/metadatos por recurso.
- Portal necesita pantallas de producto antes de sumar contenido editorial.

### Partidos y estadisticas

- Reprogramacion historica, sede/cancha y arbitros como entidades: pendientes.
- Estadisticas adicionales: propios, penales, tiempo extra, walkover, disciplina acumulada y criterios por reglamento: pendientes.
- Minutos: no activar con infraestructura actual. No hay duracion confiable ni semantica temporal suficiente. Mantener `null`/`minutosNoDeterminados: true`.

### Caja y plataforma

- Caja: **RETIRADA del producto actual.** No hay pagos parciales, vencimientos, obligaciones/cuotas recurrentes, MercadoPago, facturacion ni contabilidad; tampoco estan previstos post-beta. Migraciones/modelos historicos se conservan solo por compatibilidad.
- Plataforma: sin PWA/app movil, storage seguro de imagenes, proveedor de email, limitador distribuido, CI/CD/deploy, backups, metricas, trazas, alertas ni retencion de notificaciones/tokens.

## 4. Deuda tecnica

### Critica

| Hallazgo | Evidencia | Impacto |
|---|---|---|
| Escalamiento RBAC por administradores | `apps/api/src/routes/usuarios.ts:87-143` acepta que cualquier ADMINISTRADOR reemplace roles/scope de cualquier usuario. Puede asignar ADMINISTRADOR con `organizacionId: null`; `auth/permisos.ts:18-26` lo interpreta global. | Admin de tenant A puede obtener alcance transversal. |
| Exposicion de equipo privado por formacion publicada sin partido | `apps/api/src/routes/formaciones.ts:538-558` permite `partidoId: null` sin comprobar `equipo.privado`. | Filtra formaciones/equipo privado al publico. |
| Exposicion de equipo privado por convocatoria publicada sin partido | `apps/api/src/routes/convocatorias.ts:322-349` omite privacidad de equipo para `partidoId: null`. | Filtra plantel y convocatoria privada. |
| Exposicion de amistosos publicados de equipos privados | `apps/api/src/routes/partidos.ts:308-324` permite partido sin torneo sin revisar privacidad de ambos equipos. | Filtra actividad de equipo privado. |
| Estadisticas cross-tenant | `apps/api/src/routes/eventos-partido.ts:143-160,180` usa permiso/autenticacion sin validar torneo/equipo visible. | Un usuario autorizado puede consultar datos de otro tenant por UUID. |

### Importante

| Hallazgo | Evidencia | Impacto |
|---|---|---|
| Cuenta desactivada conserva sesiones | `apps/api/src/auth/servicio.ts:55-78` no comprueba `usuario.activo`; cambios administrativos tampoco revocan sesiones (`routes/usuarios.ts:66-74`). | Baja de cuenta no es inmediata. |
| Login sin rate limit | `apps/api/src/routes/auth.ts:50-54`. Limite actual cubre solo reset. | Brute force/password spraying. |
| Limitador solo en memoria | `apps/api/src/auth/rate-limiter.ts:7-28`. | Reinicio/multi-instancia lo evaden; mapa puede crecer sin limite. |
| Enumeracion de cuentas al invitar cuerpo tecnico | `apps/api/src/routes/invitaciones.ts:181-184` devuelve `existe`; UI lo comunica. Contradice el diseno FASE 13. | Privacidad de cuentas internas. |
| Historial de caja de jugador demasiado amplio | `apps/api/src/routes/caja.ts:183-190` autoriza por cualquier equipo historico y luego consulta movimientos de todos los equipos. | Delegado de A puede ver caja de B para jugador compartido. |
| Integridad de invitacion de persona nueva | Persona/Jugador se crean en transaccion separada antes de crear invitacion (`routes/invitaciones.ts:84-102`). | Puede quedar persona/jugador huerfano si falla paso posterior. |
| Fixture sin constraint de jornada | Falta unique `(torneoCategoriaId, zonaId, numero)`; precheck interno en `fixture/servicio.ts:85-87`. | Carrera/duplicado por insercion paralela/manual. |
| Dos ruedas no garantiza revancha real | `calcularRondas` invierte pares, pero persistencia rebalancea localia (`fixture/servicio.ts:36,91-96`). | No garantiza ida/vuelta local/visitante. |
| Auditoria de reprogramacion insuficiente | `routes/partidos.ts:183-219`. | No reconstruye agenda anterior ni motivo. |

### Conveniente

| Hallazgo | Evidencia | Impacto |
|---|---|---|
| Indices compuestos pendientes | Propuestos en `docs/fase-8-diseno.md:401-411`; faltan en `Partido` y `Jornada`. | Rendimiento cuando crezcan fixture/tabla. |
| Notificaciones seriales | `apps/api/src/notificaciones/servicio.ts:29-45` crea una por una. | Latencia en eventos con muchos destinatarios; sin retencion. |
| N+1 publico equipos | `/publico/equipos` carga IDs y llama `equipoPublico` por cada equipo (`routes/publico.ts:144-147`). | N+1 al crecer portal. |
| Carga repetida de autorizacion | `puedeVerTorneo` consulta membresias y pertenencias por uso (`auth/permisos.ts:61-105`). | Coste repetido en endpoints/listas. |
| Schema/contratos locales duplicados | Muchos `interface Body` y tipos frontend por pagina; `shared` no contiene contratos API. | Riesgo de drift API/web. |
| Archivos grandes y densos | `EquipoPage.tsx` 647 lineas; `invitaciones.ts` 458; handlers de eventos/caja concentran lineas extensas. | Mantenimiento, revision y pruebas mas dificiles. |
| Tests web limitados | Cubren helper API, badge e invitaciones/notificaciones; no caja, portal, auth, fixture, partidos, formaciones o convocatorias. | Regresiones UI probables. |

### Cosmetica

- Import duplicado de `autenticar` en `apps/api/src/routes/auth.ts:13,15`.
- Formato de handlers y JSX comprimido en una linea, especialmente caja/eventos/fixture, reduce legibilidad.
- Dashboard duplica tarjeta Convocatorias y anuncia funciones sin enlace (`apps/web/src/pages/DashboardPage.tsx:17-30`).

### Warning PostgreSQL/pg

Se reprodujo al ejecutar API: `DeprecationWarning: Calling client.query() when the client is already executing a query ... pg@9`. API paso 275 tests, pero el warning es real. Debe aislarse con `node --trace-deprecation`, version de `pg` transitiva y patron de concurrencia del adapter/limpieza de tests antes de actualizar a pg 9. Clasificacion: importante para compatibilidad futura, no bloqueo inmediato de beta si no hay fallo operativo.

## 5. Seguridad

### Aspectos correctos

- Tokens de sesion y reset se guardan hasheados; cookies son `httpOnly` y `SameSite=Lax`.
- Reset invalida tokens anteriores y revoca sesiones.
- Notificaciones filtran por `usuarioId` en todas sus rutas (`routes/notificaciones.ts`).
- Invitaciones validan destinatario al responder, emisor/delegado al revocar y no exponen DNI/email en listados.
- Caja no tiene endpoint publico y operaciones principales validan rol por equipo.

### Antes de agregar funcionalidades

1. Corregir asignacion de roles por scope y prohibir asignaciones globales salvo SUPERADMIN.
2. Validar usuario activo en cada sesion/refresh y revocar sesiones ante desactivacion/reset administrativo de password.
3. Aplicar rate limit a login y definir proveedor distribuido antes de multiples instancias.
4. Centralizar politica de visibilidad de equipos/torneos y aplicarla a partidos, formaciones, convocatorias y estadisticas.
5. Corregir scoping de estadisticas, sanciones y caja de jugador por equipo/torneo visible.
6. Reemplazar respuesta de invitacion de cuerpo tecnico por resultado no enumerativo.
7. Exigir `COOKIE_SECURE=true` en produccion, HTTPS, CORS exacto y health restringido por red/orquestador.
8. Agregar pruebas negativas explicitas para cada frontera de organizacion/equipo/publico.

## 6. Experiencia de usuario por rol

| Rol | Flujo actual | Faltante prioritario |
|---|---|---|
| ORGANIZADOR/ADMINISTRADOR | Administra torneos/temporadas/categorias/zonas/participaciones por web; puede operar API de roles. | Sin UI de organizaciones/usuarios/roles; sin UI para generar/validar/regenerar fixture ni jornadas; sin gestion de sanciones. |
| DELEGADO | Gestiona plantel, administradores, configuracion, caja simple, invitaciones, partidos, formaciones y convocatorias. | Caja incompleta; eventos/sanciones sin UI; solicitud/unirse equipos ausente; reprogramacion sin historial. |
| TECNICO | Gestiona plantel, invita jugadores, participa en partidos/formaciones/convocatorias y consulta caja. | UI no comunica capacidades claramente; no puede ver flujo de invitacion de cuerpo tecnico; eventos/sanciones sin UI. |
| AUXILIAR | Puede acceder como miembro a datos autorizados. | Navbar y formularios muestran acciones que backend rechaza; no hay espacio de trabajo de solo lectura intencional. |
| JUGADOR | Perfil, vinculacion, respuesta de convocatoria, invitaciones y caja propia por API. | No tiene dashboard de calendario, convocatorias, historial, estadisticas o caja propia claramente integrado. |
| Publico | Landing y navegacion inicial de torneos. | Recurso generico JSON; faltan fixture/tabla/resultados/estadisticas/plantel navegables y SEO. |

## 7. Candidatos FASE 14

| Candidato | Beneficio | Complejidad/riesgo | Dependencias/schema probable | Por que ahora/despues |
|---|---|---|---|---|
| A. Hardening multi-tenant y beta | Protege datos, habilita prueba real controlada, elimina flujos 403 confusos y fija fronteras para modulos futuros. | Media. Riesgo funcional por endurecer accesos existentes. | Base: sin schema. Opcionalmente indices tras medir. Cambios API, RBAC, tests, UX de permisos y operacion. | **Ahora**: hay bloqueantes de seguridad. |
| B. Competencia avanzada | Alto valor para ligas con grupos/playoffs; diferencia de producto. | Alta/muy alta: motor, reglas, estado, trazabilidad, UI de llaves y migracion compleja. | Nuevos modelos Fase/Llave/Serie/slot/origen/resultado; cambios en Partido, tabla, fixture y portal. | Despues de hardening y diseno completo. No hay base de dominio suficiente. |
| C. Portal publico de producto | Hace visible valor del sistema a jugadores/publico; usa API existente. | Media. Riesgo bajo de datos si primero se corrigen politicas publicas. | Sin schema en primera entrega; potencial slugs/contenido despues. Mucho frontend y tests. | Despues de hardening. Es buen candidato FASE 15. |
| D. Solicitudes jugador-equipo | Completa onboarding de planteles y usa notificaciones. | Media: privacidad, busqueda, antispam, estados y aprobacion. | Probable modelo `SolicitudIngresoEquipo` o extension bien definida de invitaciones; migracion probable. | Despues de seguridad; antes solo si beta necesita captacion. |
| E. Caja de cuotas/pagos | ~~Valor operativo para equipos.~~ **Descartado y RETIRADO:** no hay funciones financieras (caja, cuotas/pagos, MercadoPago/gateways) en el horizonte; migraciones/modelos historicos se conservan solo por compatibilidad. | — | — | — |

## 8. Recomendacion: FASE 14

### Nombre

**FASE 14 - Hardening multi-tenant y preparacion para beta controlada**.

La propuesta historica al final de `docs/fase-13-diseno-invitaciones-notificaciones.md:394-403` priorizaba solicitud jugador -> equipo, sanciones y canales externos. No debe adoptarse automaticamente: esas funciones aumentan superficie de datos y permisos sobre una base que hoy tiene hallazgos criticos de aislamiento. La solicitud jugador -> equipo queda como candidato posterior, una vez corregidas las fronteras de acceso.

### Alcance preliminar

1. RBAC con alcance obligatorio y validado para administradores; asignacion de roles segura y auditada.
2. Revocacion/invalidacion efectiva de sesiones de usuarios inactivos y despues de cambios administrativos sensibles.
3. Rate limiting de login y contrato reemplazable por proveedor distribuido; limite de memoria acotado/expirable mientras se mantenga una instancia.
4. Politica unica de visibilidad publica/privada aplicada a partidos, convocatorias, formaciones, estadisticas y sanciones.
5. Aislamiento de estadisticas/caja por equipo/torneo al consultar recursos por ID.
6. Privacidad de invitaciones de cuerpo tecnico: eliminar enumeracion de cuentas.
7. Health, cookie secure, CORS y configuracion de produccion documentados y validados al iniciar.
8. UI de navegacion/acciones condicionada por permisos efectivos y mensajes de acceso legibles.
9. Suite de regresion de seguridad con matriz actor x organizacion x equipo x visibilidad.
10. Runbook minimo de beta: variables, migraciones, backups, restore probado, logs y responsable de incidentes.

### Que no debe entrar

- Competencia avanzada, grupos, playoffs, llaves, tercer puesto o ida/vuelta.
- Migracion de schema solo por conveniencia; no hay cambio obligatorio identificado para alcance base.
- Email real, push, WhatsApp, MercadoPago, PWA, app movil, storage de imagenes o SEO/contenido.
- Calculo de minutos. Debe permanecer `null` y `minutosNoDeterminados: true`.
- Refactor masivo de paginas/handlers: separar solo cuando sea necesario para aplicar controles o pruebas.

### Cambios de schema potenciales

- Alcance base: ninguno.
- Solo despues de medir: unique de jornadas y/o indices compuestos de fixture/tabla.
- No usar FASE 14 para introducir modelos de competencia avanzada, pagos ni comunicaciones externas.

### Riesgos

- Endurecer permisos puede revelar flujos que hoy dependen de accesos amplios. Mitigar con pruebas de matriz y beta interna.
- Revalidar usuario activo por request agrega consulta; se puede incluir en lookup de sesion y medir.
- Rate limit de login puede afectar usuarios detras de NAT; combinar clave IP y usuario/email hasheado, respuestas genericas y observabilidad.
- Unificar visibilidad puede cambiar que contenido publicado aparece; priorizar privacidad por defecto y pruebas de regresion.

### Tests necesarios

- ADMIN scoped no modifica usuarios/roles fuera de su organizacion ni genera rol global.
- Solo SUPERADMIN asigna roles globales o modifica SUPERADMIN.
- Usuario desactivado, cambiado administrativamente o con password cambiado no usa sesion/refresh existente.
- Login limitado por IP y credencial, sin enumeracion; comportamiento con reset preservado.
- Equipo privado nunca aparece en formacion, convocatoria, partido, estadisticas, sanciones o portal sin relacion publica valida.
- Estadisticas de jugador/equipo/competicion y sanciones rechazan usuario de otro tenant.
- Caja de jugador devuelve solo movimientos de equipos autorizados.
- Invitacion de cuerpo tecnico no diferencia cuenta existente/inexistente en contrato externo.
- Web: navegacion y formularios por rol, manejo de 403 y rutas publicas sin JSON crudo para recursos que se expongan en beta.
- Pruebas de carga basicas para limitador, notificaciones a multiples destinatarios y endpoints de fixture/tablas.

## 9. Roadmap tentativo

1. **FASE 14:** Hardening multi-tenant y preparacion beta controlada.
2. **FASE 15:** Portal publico de producto y experiencia de usuario por rol. Completar fixture/tabla/resultados/estadisticas publicas, vistas de jugador y navegacion condicionada. Sin CMS, noticias o storage al inicio.
3. **FASE 16:** Competencia avanzada, previo diseno aprobado. Empezar por fase de grupos + clasificacion y luego playoffs; no mezclar pagos, arbitros o reprogramacion compleja en misma fase.

Alternativa si primeras pruebas de beta demuestran que captacion de jugadores es necesidad principal: intercambiar FASE 15 por solicitud jugador -> equipo, manteniendo FASE 14 antes.

## 10. Preparacion para beta con usuarios reales

### Bloqueantes para beta controlada

- Corregir los cinco hallazgos criticos de RBAC, privacidad publica y estadisticas cross-tenant.
- Revocar/bloquear sesiones de cuentas inactivas y aplicar limite de login.
- Resolver enumeracion de usuarios al invitar cuerpo tecnico.
- Configuracion productiva verificable: HTTPS, `COOKIE_SECURE=true`, CORS de origen exacto, secretos reales y health no expuesto publicamente.
- Backup automatizado de PostgreSQL, procedimiento de restore probado y responsable operativo.
- Proveedor de email real o decision explicita: beta sin reset por email no es aceptable si usuarios no pueden recuperar acceso; al menos habilitar SMTP transaccional y monitorear entregas.
- Politica de privacidad/terminos y proceso minimo para datos personales, especialmente DNI y planteles.

### No bloqueantes para beta controlada

- Grupos/playoffs, llave visual y tercer puesto, si beta se limita a ligas round-robin.
- ~~PWA/app movil, push, WhatsApp, MercadoPago, facturacion y contabilidad avanzada.~~ **Corregido:** MercadoPago, facturacion y contabilidad ya no se contemplan (Caja retirada); queda PWA/app movil, push y WhatsApp.
- Noticias, fotos, slugs/SEO avanzados.
- Entidades de arbitro/cancha y reprogramacion con historial formal, si se opera manualmente con alcance limitado.
- ~~Pagos parciales/cuotas recurrentes.~~ **Corregido:** pagos/cuotas retirados del horizonte.
- Calculo de minutos.

### Condicion de beta sugerida

Beta cerrada con una organizacion, pocos equipos y formato liga simple. Activar solo despues de FASE 14, con monitoreo de errores, copias diarias, soporte manual y prohibicion temporal de publicar contenido de equipos privados hasta que pasen pruebas de privacidad.

## 11. Estado Git

- Rama observada: `main`.
- Head observado: `7a96b66 feat: add invitations and notifications (FASE 13)`.
- Working tree estaba limpio al comenzar esta revision.
- Esta revision no modifica `schema.prisma`, no crea migraciones, no implementa FASE 14 y no hace commit.
