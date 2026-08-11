# FASE 15 - UX, navegacion y experiencia de beta

## Objetivo

Convertir capacidades existentes de ControlLiga en flujos claros para beta controlada. FASE 15 mejora navegacion, pantallas, formularios, estados y accesibilidad basica. No agrega modelos Prisma, migraciones ni reglas deportivas nuevas.

## 1. Inventario frontend actual

### Rutas

| Area                | Rutas actuales                                                           | Estado UX                                                                                                          |
| ------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Portal              | `/`, `/publico/torneos`, torneo, temporada, competencia, partido, equipo | Inicio de portal correcto; recursos hijos se muestran como JSON en `PublicResourcePage`.                           |
| Auth                | `/login`, `/register`, `/forgot-password`, `/reset-password`, `/profile` | Funcional; registro/vinculacion requieren UUID manual y feedback de password insuficiente.                         |
| Inicio              | `/dashboard`                                                             | Tarjetas por permiso, pero mezcla accesos utiles con "Proximamente" y no cambia realmente por flujo/rol.           |
| Torneos             | `/torneos`, `/torneos/:id`                                               | CRUD/tab basico. Fixture administra solo lectura; configuracion y participaciones usan prompts/UUID.               |
| Equipos             | `/equipos`, `/equipos/:id`, `/jugadores/:id`                             | Base funcional; `EquipoPage` concentra plantel, administradores, caja, configuracion e invitaciones en 647 lineas. |
| Operacion deportiva | `/formaciones`, detalle, `/convocatorias`, detalle, `/partidos`, detalle | Lectura y parte de CRUD. Eventos, sanciones, fixture operativo y partido oficial quedan incompletos en UI.         |
| Comunicacion        | `/invitaciones`, `/notificaciones`                                       | Mejor cobertura visual actual; falta confirmacion de rechazo y textos de roles/estados amigables.                  |

### Inventario componentes/estilos/tests

- Componentes globales: `Layout`, `NotificacionesBadge`, guards auth. No hay shell por rol, toast, dialog, estados reutilizables, breadcrumb ni tabla responsive.
- `index.css` contiene primitives iniciales (`tarjeta`, `boton`, `campo`, `estado`) y estilo propio del portal. Solo media query para encabezado publico; navbar privada, tablas y formularios no responden bien en movil.
- Tests web: 21. Cubren helper API, badge, invitaciones y notificaciones. No cubren dashboard, guards por permiso, portal, torneo, equipo, partidos, formaciones, convocatorias, caja, formularios ni accesibilidad.

## 2. Problemas

### Criticos para beta UX

| Problema                              | Evidencia                                      | Consecuencia                                                                                         |
| ------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Portal publico termina en JSON        | `PublicResourcePage.tsx:11-25`                 | Visitante no puede consultar categoria, zona, fixture, tabla, partido o equipo como producto.        |
| Fixture no se opera                   | `FixtureTablaSection.tsx:12-20` solo lee API   | Organizador no genera, valida, regenera ni programa jornadas desde web.                              |
| Eventos de partido sin UI             | `PartidoPage.tsx:88-89`                        | Resultado oficial exige goles consistentes con eventos, pero usuario no puede cargarlos/corregirlos. |
| SUPERADMIN no ve controles de partido | `PartidoPage.tsx:45` solo revisa rol de equipo | Backend autoriza; interfaz bloquea operacion global.                                                 |

### Importantes

- Navbar privada muestra todos modulos sin permiso, sin enlace activo, agrupacion, colapso movil o contexto actual (`Layout.tsx:12-27`).
- Dashboard anuncia organizaciones, plantel, caja y administracion como "Proximamente" (`DashboardPage.tsx:17-30`), en vez de orientar a acciones reales.
- Formularios usan UUID manual o `window.prompt`: equipos de torneo, jugadores de competicion, administradores, plantel y categorias. No hay seleccion contextual, validacion visible ni revision de accion.
- `PartidosPage` solo crea amistosos; no presenta contexto oficial existente (torneo/temporada/categoria/zona/jornada), ni edicion/reprogramacion.
- `FormacionPage` no asocia formacion a partido pese a endpoint existente.
- Caja muestra subset minimo: sin filtros, deuda, detalle, categorias completas, comprobante ni confirmacion de anulacion.
- Estadisticas de jugador/equipo/competicion, goleadores/tarjetas y sanciones existen en API pero no en producto web.
- Invitacion de cuerpo tecnico espera contrato antiguo `existe`; FASE 14 responde mensaje uniforme. Hoy la UI puede informar falsamente que cuenta no existe.
- Acciones destructivas son directas: cancelar convocatoria, anular caja, baja de jugador, revocar invitacion, cambios de estado. Solo borrar formacion usa `window.confirm`.
- Errores/exitos/cargas varian por pagina; muchos muestran textos tecnicos de API sin contexto, sin retry ni anuncio accesible.

### Cosmeticos y accesibilidad

- Enums internos visibles: `DELEGADO_TECNICO`, `FUTBOL_11`, `PENDIENTE` y roles/scopes UUID en perfil.
- Tabs no anuncian `tablist`, `tab`, `aria-selected` ni panel asociado.
- Errores/exitos no usan `role="alert"` o region `aria-live`.
- Inputs de caja y algunos controles de filas no tienen labels asociados.
- Tablas de posiciones/formacion no tienen wrapper horizontal, encabezados compactos ni alternativa de cards movil.
- Alto contraste/focus visibles no estan sistematizados.

## 3. Flujos por rol

### ORGANIZADOR / ADMINISTRADOR

Flujo objetivo: Dashboard -> Torneos activos -> Torneo -> Temporada -> Competencia/Zona -> Equipos -> Fixture -> Jornada/Partidos -> Tabla/estadisticas/sanciones.

Problemas actuales: selector de temporada/competencia no persiste como contexto operativo; tabs no explican siguiente paso; fixture solo lectura; gestion de organizaciones/usuarios/roles no tiene UI y no debe prometerse como disponible.

FASE 15: dashboard con accesos a torneos, solicitudes/participaciones y partidos pendientes; workspace de torneo con selector visible de temporada/competencia/zona, progreso contextual y controles existentes de fixture. No incluir administracion de usuarios/roles/organizaciones: API actual no es suficiente para flujo seguro completo.

### DELEGADO

Flujo objetivo: Dashboard -> Mi equipo -> Plantel -> Convocatoria/Formacion -> Partido -> Caja -> Invitaciones -> Notificaciones.

Problemas actuales: `EquipoPage` mezcla tareas; UUID/prompt para altas; caja poco operable; no confirma bajas/anulaciones; links Formaciones/Convocatorias/Partidos aparecen como "proximamente" aun existiendo rutas.

FASE 15: panel de equipo ordenado, accesos a modulos existentes, formularios guiados, caja con filtros/deuda y confirmacion de acciones sensibles.

### TECNICO

Flujo objetivo: Plantel -> Formacion -> Convocatoria -> Partido -> Estadisticas.

Problemas actuales: navbar muestra administracion/caja/invitacion de cuerpo no aplicables; botones pueden terminar en 403; no puede completar eventos necesarios para resultado.

FASE 15: navegacion y CTAs segun permiso/rol en equipo; solo invitacion de jugador, no cuerpo tecnico/caja escritura/configuracion. Eventos disponibles donde backend permite.

### AUXILIAR

Flujo objetivo: consultar equipo, convocatoria, partido, formacion y notificaciones.

Problemas actuales: misma navegacion que rol gestor y formularios de escritura visibles.

FASE 15: workspace de consulta, cards de proximos eventos y ocultacion de CTAs sin permiso. Backend sigue siendo autoridad.

### JUGADOR

Flujo objetivo: inicio simple -> proxima convocatoria -> proximo partido -> equipo -> invitaciones -> notificaciones -> perfil.

Problemas actuales: dashboard generico; no resume acciones pendientes; perfil expone UUID/scopes internos; estadisticas no son descubribles.

FASE 15: dashboard jugador con CTA de convocatoria/invitacion, enlaces a equipo/partidos y resumen de notificaciones. No inventar metricas si endpoint no devuelve agenda agregada; usar enlaces a listados existentes y datos ya cargados.

### PUBLICO

Flujo objetivo: Torneos -> Temporada -> Categoria/Zona -> Fixture/Resultados/Tabla -> Partido/Equipo -> Estadisticas publicas.

Problemas actuales: jerarquia se rompe en JSON. FASE 15 reemplaza render generico por vistas de lectura reales, respetando flags y 404 de API publica.

## 4. Navegacion propuesta

### App shell autenticado

- Una barra superior con marca, enlace activo, centro de notificaciones y menu de cuenta.
- Desktop: grupos `Competir` (Torneos, Partidos), `Equipo` (Equipos, Convocatorias, Formaciones), `Cuenta` (Invitaciones, Perfil, Salir). Mostrar grupo/modulo solo si usuario tiene permiso potencial o membresia relevante.
- Mobile 360/390: boton menu con dialog/menu semantico, foco atrapado mientras abierto, Escape cierra; no duplicar navbar secundaria.
- `NavLink` para estado activo; nombre de usuario solo en menu de cuenta.
- Breadcrumb solo en detalles: `Torneos / Nombre`, `Equipos / Nombre`, `Partidos / Local vs Visitante`. No repetirlo en dashboard/listas.
- Tabs de torneo/equipo/notificaciones se vuelven semanticamente tabs, con estado visible y panel asociado.

### Deep links

- Notificaciones conservan `notificacionEnlace`; si recurso no existe/no esta permitido, mostrar estado "Ya no tenes acceso" y volver al centro, no error tecnico.
- Resumen de equipo enlaza a convocatorias/formaciones/partidos filtrados por equipo cuando API existente permite; donde no permita filtro, no inventar query contract.

## 5. Dashboard propuesto

No crear agregados costosos. Cards usan datos ya presentes o carga puntual de endpoints existentes, con limite pequeno.

| Rol                       | Cards/CTAs                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| ORGANIZADOR/ADMINISTRADOR | Torneos, participaciones pendientes existentes, acceso a fixture/tabla desde ultimo torneo elegido, partidos para resultado. |
| DELEGADO                  | Mis equipos, convocatorias, partidos, caja de equipo elegible, invitaciones y notificaciones.                                |
| TECNICO                   | Equipo, formaciones, convocatorias, partidos y estadisticas. Sin caja escritura/configuracion/invitacion cuerpo.             |
| AUXILIAR                  | Equipo, convocatorias, formaciones, partidos y notificaciones; solo lectura.                                                 |
| JUGADOR                   | Invitaciones pendientes, convocatoria, partidos, equipo vinculado, notificaciones y perfil.                                  |

Eliminar tarjetas "Proximamente" del dashboard. Una capacidad sin ruta no se promociona.

## 6. Formularios y lenguaje

### Principios

- Cada input con label, ayuda corta y error asociado mediante `aria-describedby`.
- Boton submit muestra estado ocupado y evita doble envio.
- Validar en cliente lo obvio (obligatorio, fecha, rango, seleccion duplicada) sin reemplazar API.
- Traducir valores visuales: `DELEGADO_TECNICO` a "Delegado / tecnico", `FUTBOL_11` a "Futbol 11", estados a etiquetas humanas. Valor enviado no cambia.
- Reemplazar UUID visible por selector cuando endpoint/listado actual lo permita. Si API no permite busqueda segura, explicar limite y dejar campo avanzado solo para gestores, nunca `prompt`.

### Cambios por flujo

- Auth: indicador de politica password, confirmar password, toggle mostrar/ocultar, mensaje generico de login/rate limit, post-cambio password explica cierre de sesion antes de redirigir.
- Equipo/plantel: separar incorporar jugador existente, crear jugador e invitar; selector de resultados desde endpoints existentes; baja y cambios de estado con confirmacion.
- Torneo: wizard liviano por contexto (torneo -> temporada -> categoria/zona), no wizard global nuevo. Participaciones y jugadores usan formularios inline o dialog, no prompts.
- Fixture: validar antes de generar, resumen de cantidad de equipos/jornadas, confirmacion de regeneracion y estado bloqueado entendible.
- Partido: selector de tipo/contexto; partido oficial solo cuando contexto esta seleccionado; fecha/hora local clara. Detalle con scorecard, timeline de eventos y CTA segun permiso.
- Formacion/convocatoria: seleccion de jugadores sin tabla duplicada por fila; asociar partido; confirmacion de eliminar/cancelar/publicar cuando corresponde.
- Caja: categoria y estado legibles, filtros, resumen/deuda, detalle de movimiento y confirmacion de anular.
- Invitaciones: mensaje uniforme de cuerpo tecnico, respuesta aceptar/rechazar con confirmacion de rechazo cuando causa salida/rechazo visible.

## 7. Estados, feedback y confirmaciones

### Componentes necesarios

| Componente        | Uso                                                                         | Limite                                                                                    |
| ----------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `PageHeader`      | titulo, breadcrumb, accion primaria contextual                              | No usar en login/portal.                                                                  |
| `PageState`       | loading, error con retry, empty con CTA condicional, forbidden/not-found    | Reemplaza textos dispersos.                                                               |
| `ToastRegion`     | exito/error breve despues de acciones                                       | Region `aria-live`; no sustituye errores de formulario.                                   |
| `ConfirmDialog`   | cancelacion, baja, anular, revocar, regenerar fixture, despublicar sensible | Dialog reutilizable; no `window.confirm`.                                                 |
| `StatusBadge`     | estados de torneo, partido, invitacion, caja, convocatoria                  | Mapeo central enum -> etiqueta/color.                                                     |
| `ResponsiveTable` | tabla/fixture/formacion/caja                                                | Scroll horizontal con primer campo legible; card-list solo si tabla tiene pocas columnas. |
| `PermissionGate`  | ocultar CTA no permitida y explicar modo lectura                            | No reemplaza checks backend.                                                              |

No crear DataTable generico, modal universal o design system completo. `ConfirmDialog`, `ToastRegion`, `PageState`, `StatusBadge` y shell reducen duplicacion real.

### Confirmaciones obligatorias

- Cancelar convocatoria.
- Anular movimiento de caja.
- Baja de jugador o administrador.
- Revocar/rechazar invitacion cuando afecta pertenencia.
- Regenerar fixture.
- Eliminar formacion.
- Suspender partido y despublicar contenido.

Publicar, guardar, confirmar disponibilidad y marcar pago pueden usar toast sin dialog, salvo que contexto muestre impacto irreversible adicional.

## 8. Responsive y accesibilidad basica

### Viewports

- 360/390: menu colapsado, una columna, acciones grandes tactiles, filtros plegables, tablas con scroll horizontal y encabezado fijo cuando aplique.
- 768: grid de 2 columnas para cards, panel de acciones alineado, formularios de dos campos cuando no reduzca legibilidad.
- Desktop: max-width por pagina, sidebar no requerida en primera entrega; evitar tercer sistema de navegacion.

### Accesibilidad

- HTML semantico, botones para acciones, links para navegacion.
- Focus visible comun, contraste de badges/errores revisado, areas tactiles minimas 44px en movil.
- `aria-live="polite"` para toast/exito y `role="alert"` para error.
- Dialog con foco inicial, Escape, retorno de foco y label/describedby.
- Tabs con roles ARIA y teclado flechas/inicio/fin.
- Tabla con `caption` o encabezado asociado; no esconder dato critico solo por viewport.

## 9. Flujos criticos de beta

1. Registro/login/reset/cambio password con feedback seguro.
2. Crear equipo y administrar plantel sin UUID/prompt para camino comun.
3. Crear/editar convocatoria, publicar, responder como jugador y cancelar con confirmacion.
4. Crear/editar formacion, asociarla a partido, publicar/despublicar/eliminar con confirmacion.
5. Crear partido, cargar eventos y resultado consistente, cambiar estado y publicar.
6. Organizador prepara contexto torneo y genera/consulta fixture-tabla.
7. Delegado consulta caja, filtra movimientos, marca pago y anula con confirmacion.
8. Jugador acepta/rechaza invitacion y lee notificacion deep-link.
9. Publico navega torneo -> competencia -> fixture/tabla -> partido/equipo sin JSON interno.

## 10. Alcance exacto FASE 15

1. Shell, navbar responsive, navegacion por permiso, breadcrumbs y tabs accesibles.
2. Estados comunes, toast, confirm dialog, status badge y tablas responsive.
3. Dashboard orientado por rol, sin tarjetas falsas ni metricas nuevas costosas.
4. Portal publico de lectura usable sobre endpoints existentes: torneo, temporada, competencia, zonas, fixture, tabla, partido, equipo, estadisticas/goleadores/tarjetas cuando API/flags las habiliten.
5. UX de torneo para contexto y operaciones de fixture ya existentes.
6. UX de partido para eventos existentes, resultado, estado, publicacion y rol SUPERADMIN; mostrar minutos siempre como no determinados.
7. UX de equipo/caja/invitaciones/formaciones/convocatorias: selectors disponibles, mensajes coherentes, feedback y confirmaciones.
8. Correcciones puntuales de contrato frontend ya roto, incluida invitacion de cuerpo tecnico uniforme.
9. Tests frontend de rutas, roles, estados, confirmaciones, formularios prioritarios y accesibilidad basica.

## 11. Fuera de alcance

- Grupos, playoffs, eliminacion, minutos calculados, pagos, MercadoPago, noticias, fotos, WhatsApp, PWA, app movil, push, arbitros, canchas, reprogramacion historica y schema.
- Administracion completa de organizaciones, usuarios y roles: requiere producto/API dedicada posterior.
- Nuevo design system, dependencia UI grande, router/state manager nuevo o refactor masivo de backend.
- SEO/slugs/CMS: portal de lectura primero; contenido editorial despues.

## 12. Archivos probables

- `apps/web/src/App.tsx`, `components/Layout.tsx`, `index.css`, guards/auth helpers.
- Nuevos componentes puntuales en `apps/web/src/components/`: shell/menu, page state, toast, dialog, status badge, responsive table.
- `DashboardPage.tsx`, `PublicPortalPage.tsx`, reemplazo de `PublicResourcePage.tsx` por vistas publicas especificas.
- Paginas `torneos/*`, `equipos/*`, `partidos/*`, `formaciones/*`, `convocatorias/*`, `invitaciones/*`, `notificaciones/*`, auth/perfil.
- Tipos frontend por dominio y tests RTL asociados.
- No `schema.prisma`; cambios API solo si discovery/listado actual demuestra bloqueo real y debe aprobarse por separado.

## 13. Tests necesarios

- Navbar desktop/movil muestra enlaces por permiso y no muestra CTAs prohibidas.
- Dashboard por SUPERADMIN, delegado, tecnico, auxiliar y jugador.
- Guard redirect conserva destino y forbidden/not-found usa estado comprensible.
- Portal navega jerarquia publica y no renderiza JSON/IDs internos.
- Fixture: vacio, carga, error, generar/regenerar con confirmacion y tabla responsive logica.
- Partido: SUPERADMIN ve controles; delegado/tecnico ve acciones permitidas; auxiliar/jugador no ven escritura; eventos y resultado muestran feedback.
- Caja: filtros, estado vacio, anular con confirmacion, tecnico solo lectura.
- Convocatoria/formacion/invitacion: CTA por rol, rechazo/cancelacion con dialog, mensaje uniforme de cuerpo tecnico.
- `PageState`, `ToastRegion`, `ConfirmDialog`, `StatusBadge` y tabs: foco, roles ARIA, Escape, `aria-live` y labels.
- Viewport logico: menu movil, tablas scrollables y acciones no se solapan. No intentar snapshot visual exhaustivo.

## 14. Riesgos y mitigacion

| Riesgo                                | Mitigacion                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| FASE UX crece hacia producto completo | Priorizar 9 flujos beta; dejar organizaciones/roles, CMS y funciones nuevas fuera.                                               |
| Permisos frontend divergen backend    | Frontend solo oculta/mejora UX; API FASE 14 sigue autoridad. Tests por rol contra props/session.                                 |
| APIs no dan datos para selector       | Usar selector solo donde contrato existe; documentar endpoint faltante, no agregar UUID oculto ni backend grande sin aprobacion. |
| Portal filtra datos privados          | Usar exclusivamente `/publico/*`; no recomponer datos desde endpoints autenticados.                                              |
| Componentes comunes sobredisenados    | Crear primitives solo despues de segunda repeticion concreta.                                                                    |
| Mobile rompe tablas                   | Wrapper horizontal primero; card-list selectivo, no conversion automatica.                                                       |

## 15. FASE 16

FASE 16 sigue propuesta como competencia avanzada, despues de beta UX: fase de grupos, clasificacion, playoffs y llaves con diseño/modelo propio. No mezclarla con mejoras UX de FASE 15.

# QA Manual Pre-Beta

Antes de beta, validar manualmente con API local activa y usuarios de prueba:

- Viewports 360px, 390px, 768px y desktop: navegación, formularios, tablas, dialogs y toast sin overflow ni controles inaccesibles.
- Portal público con datos reales y estados de error/vacío.
- Fixture, tabla y regeneración confirmada.
- Partido, eventos y correcciones/anulaciones.
- Equipo, plantel, administradores y formación.
- Roles SUPERADMIN, DELEGADO, TECNICO, AUXILIAR y JUGADOR.

Esto es QA manual pre-beta; no representa funcionalidad pendiente.
