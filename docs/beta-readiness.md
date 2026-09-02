# Beta readiness

Estado actual: FASE 17 cerrada (competencias avanzadas 16A/16B/16C, hardening cross-tenant y Operacion de Liga implementados). Pendiente de verificar despliegue real para validar beta en produccion.

> **Funciones financieras retiradas.** No hay caja, cuotas/pagos del plantel ni MercadoPago/gateways en el producto actual; tampoco los hay previstos post-beta. Las migraciones y modelos históricos de caja (`MovimientoCaja`) se conservan solo por compatibilidad e historial, sin exponerse a usuarios.

| Area | Estado | Criterio |
|---|---|---|
| Auth y sesiones | LISTO PARA BETA | Sesiones hasheadas, revocacion de cuentas inactivas, reset y cambio de password. |
| RBAC y multi-tenant | LISTO PARA BETA | Requiere suite FASE 14 verde antes de habilitar usuarios. |
| Privacidad publica | LISTO PARA BETA | Requiere pruebas directas por IDs de equipo privado. |
| Rate limiting | LISTO PARA BETA | En memoria, una instancia. Migrar a almacenamiento compartido antes de escalar horizontalmente. |
| HTTPS, cookies y proxy | BLOQUEANTE | Produccion requiere HTTPS, `COOKIE_SECURE=true`, CORS exacto y `TRUST_PROXY` restringido. |
| Email reset | BLOQUEANTE | Adapter actual es desarrollo. Configurar y probar proveedor real antes de beta con cuentas externas. |
| Database y backups | BLOQUEANTE | Programar backup diario fuera de Git y ejecutar restore de prueba documentado. |
| Logging | LISTO PARA BETA | No loguear secretos; configurar retencion y acceso de operador. |
| Monitoreo | PENDIENTE PRODUCCION | Agregar metricas, alertas y trazas antes de escalar. |
| Warning `pg` | PENDIENTE PRODUCCION | Trazas ubican aviso en `@prisma/adapter-pg` 7.9.1 al ejecutar transacciones concurrentes sobre `pg` 8.23.0. Suite verde; no actualizar dependencia sin compatibilidad Prisma validada. |
| PWA, movil, push | PENDIENTE PRODUCCION | Fuera de FASE 14. |

## Backup y restore

Prerequisito: instalar herramientas PostgreSQL compatibles (`pg_dump`, `pg_restore`) en maquina operadora. Nunca guardar archivos `.dump` en Git.

Backup:

```powershell
pwsh scripts/backup-postgres.ps1 -DatabaseUrl $env:DATABASE_URL -OutputPath C:\backups\controlliga-YYYYMMDD.dump
```

Restore de prueba, solo en base aislada:

```powershell
pwsh scripts/restore-postgres.ps1 -DatabaseUrl $env:DATABASE_URL_TEST -BackupPath C:\backups\controlliga-YYYYMMDD.dump
```

Frecuencia minima beta: diario y antes de migracion. Verificar restore al menos antes de abrir beta y despues de cambios relevantes de schema. Cifrar backups, restringir acceso y definir retencion fuera del repositorio.

## Proxy HTTPS

- Terminar TLS en proxy confiable.
- Configurar `TRUST_PROXY` con IP/CIDR del proxy o numero de hops, nunca `true` global.
- Proxy envia `X-Forwarded-For`, `X-Forwarded-Proto` y host correcto solo desde salto confiable.
- Produccion usa origen HTTPS exacto en `CORS_ORIGIN`, `COOKIE_SECURE=true` y URL HTTPS de reset.
- En produccion, proteger `GET /api/health/db` con header `x-health-token` igual a `HEALTH_DB_TOKEN`.

## Antes de abrir beta

1. Ejecutar `pnpm test`, `pnpm lint`, `pnpm typecheck` y `pnpm build`.
2. Configurar proveedor real de email y enviar/resetear cuenta de prueba.
3. Ejecutar backup y restore de prueba en base aislada.
4. Confirmar secretos fuera de Git, CORS exacto, HTTPS y proxy confiable.
5. Registrar operador responsable, contacto de incidentes y ventana de soporte.
