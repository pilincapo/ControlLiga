# FASE 14 - Hardening multi-tenant y preparacion para beta controlada

## Objetivo

Corregir aislamiento de datos, RBAC, privacidad publica, sesiones y configuracion operativa antes de beta con usuarios reales. No agrega funcionalidad deportiva.

## Sin cambios de schema

FASE 14 no requiere modelos ni migraciones. Roles, sesiones, tokens, auditoria, equipos, torneos y relaciones existentes alcanzan para aplicar controles. Indices nuevos quedan fuera hasta medir consultas reales.

## Decisiones

### RBAC

- `SUPERADMIN` administra cualquier rol/scope.
- `ADMINISTRADOR` solo administra asignaciones dentro de organizaciones que ya administra.
- Nunca puede crear `SUPERADMIN`, alcance global ni alcance de otra organizacion.
- Ningun actor puede editar su propia asignacion de roles.
- `DELEGADO_TECNICO`, `JUGADOR`, `TECNICO` y `AUXILIAR` no administran `RolUsuario`.
- Politica central: `puedeAsignarRol(actor, rolesActuales, rolObjetivo, scopeObjetivo)`.
- Cambios de roles siempre se auditan; cambios sensibles revocan sesiones del objetivo.

### Aislamiento y visibilidad

- Recurso autenticado requiere permiso y pertenencia/alcance de recurso padre.
- Estadisticas, sanciones y caja filtran por equipo/torneo autorizado; UUID conocido nunca es autorizacion.
- Recurso publico requiere que todos sus padres sean publicables.
- Equipo privado bloquea partido, convocatoria, formacion y plantel publico, incluso con `publicada = true`.
- Politica publica se concentra en helper servidor; frontend no decide seguridad.

### Sesiones y rate limit

- Validar `Usuario.activo` en sesion y refresh.
- Desactivar usuario revoca sesiones y tokens reset pendientes.
- Login limita por IP y hash SHA-256 de email normalizado. Respuesta queda generica.
- Limite en memoria sirve solo beta de una instancia; documentar reemplazo distribuido antes de escalado.

### Produccion beta

- Produccion exige `COOKIE_SECURE=true`, `CORS_ORIGIN` HTTPS sin comodines y `PASSWORD_RESET_URL_BASE` HTTPS.
- `TRUST_PROXY` es lista explicita de IP/CIDR o numero de hops. Nunca confiar todos proxies por defecto.
- Email sigue adapter desarrollo hasta configurar proveedor; beta con recuperacion debe usar proveedor real.
- Backups PostgreSQL quedan fuera de app: scripts de operador, restore probado, almacenamiento fuera de Git.

## Alcance

1. Politica central de asignacion de roles y rutas protegidas.
2. Helpers de acceso/visibilidad y correccion de endpoints IDOR conocidos.
3. Sesiones de cuentas inactivas, cambio administrativo y reset tokens.
4. Login rate limit y limites de memoria acotados.
5. Respuesta uniforme de invitacion de cuerpo tecnico.
6. Environment validado, proxy confiable configurado y documentacion HTTPS.
7. Scripts/documentacion de backup y checklist beta.
8. Tests de escalamiento, aislamiento, privacidad publica, sesiones y rate limit.

## Fuera de alcance

- Schema/migraciones, competencia avanzada, PWA, push, WhatsApp, app movil, storage, noticias, SEO, arbitros, reprogramacion formal y minutos calculados.
- Minutos siguen `null` y `minutosNoDeterminados: true`.

## Riesgos

- Endurecer access control puede bloquear flujos antes permitidos. Mitigar con pruebas actor x organizacion x equipo.
- Rate limit por IP puede afectar NAT; combina IP e identidad hasheada sin bloqueo permanente.
- Produccion detendra inicio con environment inseguro. Decision deliberada: fallo temprano es preferible a beta insegura.

## Verificacion

- `pnpm test`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- Restore de backup probado por operador antes de beta.
