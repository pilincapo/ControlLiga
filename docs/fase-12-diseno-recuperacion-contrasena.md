# FASE 12 — Recuperación y hardening de autenticación

Estado: **IMPLEMENTADA**. Base: commit `a01adbc`.

## Alcance

- recuperación de contraseña por email;
- cambio de contraseña autenticado;
- tokens persistidos como hash;
- expiración configurable;
- tokens de un solo uso;
- invalidación de tokens anteriores;
- revocación de sesiones;
- rate limiting;
- auditoría;
- frontend `/forgot-password` y `/reset-password`;
- hardening de autenticación.

Fuera de alcance: proveedores de identidad externos, MFA, passkeys, SMS, administración de usuarios por terceros y cambios de roles.

## Modelo Prisma propuesto

### `PasswordResetToken`

```prisma
model PasswordResetToken {
  id          String    @id @default(uuid()) @db.Uuid
  usuarioId   String    @db.Uuid
  usuario     Usuario   @relation(fields: [usuarioId], references: [id])
  tokenHash   String    @unique
  expiresAt   DateTime
  usedAt      DateTime?
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())

  @@index([usuarioId, expiresAt])
  @@map("password_reset_tokens")
}
```

Agregar en `Usuario`:

```prisma
passwordResetTokens PasswordResetToken[]
```

No se persiste el token plano. `tokenHash` almacena únicamente SHA-256 del token aleatorio.

## Generación del token

- usar `crypto.randomBytes(32)` o equivalente criptográficamente seguro;
- codificar como base64url para el enlace;
- entregar token plano solo una vez al proveedor de email;
- persistir solo hash SHA-256;
- no incluir token en logs, auditorías, respuestas API ni base de datos;
- usar comparación por igualdad sobre hashes ya calculados, no aceptar variantes.

## Expiración

Variable configurable:

```text
PASSWORD_RESET_TTL_MINUTES=60
```

Default recomendado: 1 hora.

Token válido solo si:

- `expiresAt > now`;
- `usedAt IS NULL`;
- `revokedAt IS NULL`;
- usuario existe y está activo.

## Flujo Forgot Password

```text
POST /auth/password/forgot { email }
  ├─ normalizar email
  ├─ responder siempre 202 con mensaje genérico
  ├─ si cuenta existe y está activa:
  │    ├─ revocar tokens anteriores no usados
  │    ├─ crear token nuevo hash
  │    ├─ crear URL de reset
  │    └─ enviarla mediante EmailSender
  └─ no revelar si email existe
```

Respuesta idéntica para email existente o inexistente.

## Flujo Reset Password

```text
POST /auth/password/reset { token, password }
  ├─ hash del token recibido
  ├─ buscar tokenHash
  ├─ validar expiración, usedAt, revokedAt y usuario activo
  ├─ validar contraseña nueva
  ├─ transacción:
  │    ├─ actualizar passwordHash con scrypt
  │    ├─ marcar token usedAt = now
  │    └─ revocar todas las Session del usuario
  ├─ auditar cambio sin token ni password
  └─ responder éxito; usuario debe iniciar sesión nuevamente
```

No devolver sesión automáticamente después de reset.

## Flujo Change Password autenticado

```text
POST /auth/password/change { passwordActual, passwordNueva }
  ├─ autenticar sesión
  ├─ verificar passwordActual
  ├─ validar passwordNueva
  ├─ transacción:
  │    ├─ actualizar passwordHash
  │    └─ revocar todas las Session del usuario
  ├─ limpiar cookie actual
  └─ auditar operación
```

El usuario inicia sesión nuevamente. Esto evita mantener sesiones emitidas con credenciales anteriores.

## Rate limiting

Aplicar en `/auth/password/forgot` y `/auth/password/reset`:

- por IP;
- por email normalizado hasheado, nunca email en claves de log;
- por tokenHash para intentos de reset;
- ventana configurable, por ejemplo 5 solicitudes cada 15 minutos por IP y email;
- respuesta genérica, sin enumeración de cuentas;
- no incrementar límites por token válido usado una vez;
- registrar solo evento de bloqueo y metadatos mínimos.

### Implementación inicial

Proveedor abstracto `RateLimiter` con almacenamiento en memoria para una instancia. No agregar Redis ni tabla de rate limit en FASE 12.

La interfaz debe permitir reemplazarlo por Redis en despliegues multi-instancia sin cambiar rutas ni reglas.

## Estrategia de email

Definir interfaz:

```ts
interface EmailSender {
  enviarRecuperacion(datos: { destinatario: string; url: string; expiraEn: Date }): Promise<void>
}
```

Configuración:

- `PASSWORD_RESET_URL_BASE`;
- `EMAIL_FROM`;
- proveedor implementable por SMTP/API;
- adapter no-op para tests;
- adapter de desarrollo sin imprimir token completo.

API no devuelve URL ni token. Si el proveedor falla, no revelar el fallo ni la existencia de la cuenta; registrar error técnico sin secretos.

## Revocación de sesiones

- Reset: revocar todas las sesiones activas del usuario.
- Change password: revocar todas las sesiones activas del usuario.
- No borrar sesiones: conservar historial con `revokedAt`.
- Limpiar cookie de la sesión actual.
- Auditoría no incluye tokenHash, cookie ni passwordHash.

## Endpoints

- `POST /auth/password/forgot`
- `POST /auth/password/reset`
- `POST /auth/password/change`

No modificar endpoints existentes de login/register/logout/refresh salvo integración necesaria para `dni` o sesiones.

## Permisos

- Forgot/reset: público, protegido por rate limiting y token.
- Change: sesión autenticada, solo propia.
- SUPERADMIN no cambia contraseñas ajenas mediante esta API.
- Ningún rol puede consultar tokens o hashes.

## Auditoría

Auditar:

- solicitud de recuperación aceptada/rechazada por rate limit;
- reset exitoso o fallido por token inválido/expirado, sin token;
- cambio autenticado exitoso o fallido, sin password;
- cantidad de sesiones revocadas;
- uso/revocación de token.

No registrar:

- token plano;
- tokenHash;
- password nueva/anterior;
- email completo si no es imprescindible.

## Frontend

- `/forgot-password`: email + mensaje genérico.
- `/reset-password?token=...`: nueva contraseña + confirmación.
- `/profile`: cambio autenticado de contraseña actual/nueva.
- manejo de sesión revocada → redirigir a login.
- no mostrar existencia de cuenta ni detalles de error del proveedor.

## Tests obligatorios

1. Forgot con email existente responde 202 genérico.
2. Forgot con email inexistente responde igual.
3. Token no aparece en respuesta, logs ni auditoría.
4. Token válido permite reset.
5. Token expirado rechaza.
6. Token inválido rechaza.
7. Token usado nuevamente rechaza.
8. Crear nuevo token revoca tokens anteriores.
9. Reset revoca todas las sesiones.
10. Password anterior deja de funcionar.
11. Password nueva funciona.
12. Change requiere autenticación.
13. Change valida password actual.
14. Change revoca sesiones.
15. Rate limit por IP.
16. Rate limit por email normalizado.
17. Usuario inactivo no recibe token utilizable.
18. Auditoría no contiene secretos.
19. `PasswordResetToken` conserva token usado/revocado sin texto plano.
20. No regresión de login/logout/refresh.

## Riesgos

- proveedor de email y entregabilidad;
- rate limiting en múltiples instancias;
- URL base correcta por ambiente;
- no filtrar existencia de usuarios;
- revocación de sesiones puede cerrar todas las pestañas/dispositivos, decisión elegida por seguridad;
- limpieza de tokens expirados: tarea posterior, no necesaria para validar seguridad;
- ausencia de MFA queda explícita para fase posterior.

## CHANGELOG

Agregar `[0.12.0]` con recuperación de contraseña, cambio autenticado, tokens persistidos como hash, rate limiting, revocación de sesiones, auditoría y frontend.
