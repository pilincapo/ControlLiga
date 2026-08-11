# FASE 10 — Caja, pagos y gastos del equipo: diseño

Estado: **IMPLEMENTADO**. Base: FASE 9.

## 1. Objetivo

Implementar caja privada por equipo para registrar ingresos, gastos, obligaciones simples de jugadores y pagos liquidados, manteniendo historial completo y sin contabilidad compleja.

Fuera de alcance: MercadoPago, cobros online, facturación, WhatsApp, cuotas automáticas, contabilidad de doble partida y conciliación bancaria.

## 2. Estado actual del schema

`MovimientoCaja` ya existe y contiene:

| Campo | Tipo | Uso |
|---|---|---|
| `id` | UUID PK | movimiento |
| `equipoId` | UUID FK → Equipo | caja privada |
| `tipo` | `TipoMovimiento` | INGRESO / EGRESO |
| `categoria` | `CategoriaMovimiento` | cuota, aporte, inscripción, cancha, árbitro, etc. |
| `concepto` | String | descripción |
| `importe` | Decimal(10,2) | importe positivo |
| `fecha` | DateTime | fecha del movimiento |
| `jugadorId?` | UUID FK → Jugador | deuda/pago asociado a jugador |
| `comprobanteUrl?` | String | comprobante externo |
| `observaciones?` | String | nota privada |
| `estado` | `EstadoMovimiento` | PENDIENTE/PAGADO/ANULADO |
| `creadoPorId?` | UUID FK → Usuario | actor |
| timestamps | DateTime | historial |

Índices actuales: `[equipoId, fecha]`, `[equipoId, estado]`, `[jugadorId]`.

## 3. Qué ya existe y se reutiliza

- `Equipo.movimientosCaja` ya relaciona caja con equipo.
- `Jugador.movimientosCaja` ya relaciona movimientos opcionalmente con jugador.
- `Usuario.movimientosCajaCreados` ya identifica al creador.
- `TipoMovimiento`, `CategoriaMovimiento` y `EstadoMovimiento` ya cubren el alcance solicitado.
- `AuditoriaLog` conserva actor, acción y cambios.
- `EquipoUsuario` + `puedeEnEquipo` permiten alcance estricto por equipo.
- `Equipo.privado` y ausencia de endpoints públicos de caja soportan privacidad.

No crear `Caja`, `Pago`, `Deuda` ni `Gasto` duplicados en FASE 10.

## 4. Deuda, obligación y pago

Se separan conceptualmente, pero se resuelven con un único `MovimientoCaja` en esta fase:

```text
INGRESO + CUOTA + PENDIENTE = obligación/importe esperado
INGRESO + CUOTA + PAGADO    = pago registrado/liquidado
EGRESO + PAGADO              = gasto realizado
ANULADO                     = registro histórico inválido, no cuenta en totales
```

Limitación explícita:

- no hay pagos parciales;
- un movimiento pendiente representa una obligación completa;
- un pago se registra cambiando a `PAGADO` o creando un nuevo movimiento de ingreso pagado, según flujo elegido;
- para evitar duplicación, FASE 10 recomienda crear la obligación como movimiento PENDIENTE y marcarlo PAGADO cuando se cobra.

Si después se necesitan cuotas parciales, vencimientos, planes o aplicación de pagos, será necesario diseñar entidades específicas (`ObligacionJugador`, `Pago`, `AplicacionPago`) en fase posterior.

## 5. Diagrama conceptual

```text
EQUIPO
  └── MOVIMIENTOCAJA
        ├── INGRESO / EGRESO
        ├── CATEGORIA
        ├── ESTADO
        ├── JUGADOR opcional
        └── USUARIO creador

MOVIMIENTOCAJA PENDIENTE asociado a JUGADOR
  └── obligación/deuda simple

MOVIMIENTOCAJA PAGADO
  └── ingreso liquidado o gasto realizado

MOVIMIENTOCAJA ANULADO
  └── historial conservado, excluido de totales
```

## 6. Ingresos y gastos

### Ingresos

Categorías existentes:

- `CUOTA`;
- `APORTE`;
- `INSCRIPCION`;
- `OTROS`.

### Gastos

Categorías existentes:

- `CANCHA`;
- `ARBITRO`;
- `EQUIPAMIENTO`;
- `VIAJE`;
- `TERCER_TIEMPO`;
- `INSCRIPCION`;
- `OTROS`.

La categoría `INSCRIPCION` puede aparecer en ingresos o egresos; el tipo define el sentido.

## 7. Totales y deuda

Solo movimientos no `ANULADO` participan:

```text
totalIngresos = SUM(importe WHERE tipo=INGRESO AND estado != ANULADO)
totalGastos   = SUM(importe WHERE tipo=EGRESO AND estado != ANULADO)
saldo         = totalIngresos - totalGastos
totalPendiente = SUM(importe WHERE estado=PENDIENTE)
```

Deuda por jugador:

```text
SUM(importe WHERE tipo=INGRESO AND jugadorId=X AND estado=PENDIENTE)
```

Historial por jugador: todos los movimientos asociados, incluyendo `PAGADO` y `ANULADO`, con filtros.

No sumar ingresos `PENDIENTE` al saldo disponible si el equipo interpreta saldo como dinero cobrado. La respuesta debe diferenciar `totalIngresos`, `totalIngresosPendientes`, `totalIngresosPagados`, `totalGastos` y `saldoCobrado`.

## 8. Flujo de ingreso

```text
DELEGADO/rol autorizado
  └── POST /equipos/:id/caja
       ├── tipo=INGRESO
       ├── categoria CUOTA/APORTE/INSCRIPCION/OTROS
       ├── importe > 0
       ├── jugadorId opcional
       └── estado PENDIENTE o PAGADO
```

Si se vincula a jugador, validar que el jugador tenga una pertenencia al equipo histórica o activa según política. Recomendación: permitir historial del equipo, pero no permitir asociar un jugador inexistente.

## 9. Flujo de gasto

```text
DELEGADO/rol autorizado
  └── POST /equipos/:id/caja
       ├── tipo=EGRESO
       ├── categoría de gasto
       ├── importe > 0
       ├── jugadorId opcional
       └── estado PAGADO o PENDIENTE
```

Un gasto no debe aparecer en información pública, aunque el equipo sea público.

## 10. Flujo de pago/deuda

1. Crear ingreso de cuota con `estado=PENDIENTE` y `jugadorId`.
2. Mostrar deuda pendiente en caja y ficha financiera privada del equipo.
3. Al cobrar, `PATCH /movimientos-caja/:id/estado` → `PAGADO`.
4. Registrar auditoría del cambio.
5. Si el registro fue incorrecto, cancelar con `ANULADO`; no borrar.

No se implementan pagos parciales ni pasarela online.

## 11. Anulaciones e historial

- No DELETE físico.
- `DELETE /movimientos-caja/:id` puede existir como alias de anulación lógica.
- Solo se permite `estado=ANULADO` mediante operación autorizada y auditada.
- Movimiento anulado no cuenta en totales ni deuda.
- No se modifica importe/concepto histórico para ocultar errores; se anula y, si corresponde, se crea un movimiento nuevo.
- No se anulan movimientos de otro equipo.

## 12. Privacidad

- No crear endpoints públicos de caja.
- `GET /equipos/:id/caja` requiere miembro autorizado del equipo.
- `observaciones`, `comprobanteUrl`, conceptos y deudas son privados.
- Un jugador ve únicamente sus movimientos/deuda si el equipo lo permite; no ve caja completa.
- ADMINISTRADOR de organización no obtiene caja automáticamente: caja pertenece al alcance de `EquipoUsuario`.
- SUPERADMIN puede acceder para soporte/auditoría, dejando registro.

## 13. Permisos

Permisos actuales: `cajaAdministrar` existe y lo posee `DELEGADO_TECNICO` global. Se recomienda agregar `cajaVer` para separar lectura de escritura.

| Acción | DELEGADO | TECNICO | AUXILIAR | JUGADOR | ADMINISTRADOR | SUPERADMIN |
|---|---|---|---|---|---|---|
| Ver caja completa | ✔ | ✔ si se otorga `cajaVer` | ✖ | ✖ | ✖ por defecto | ✔ |
| Crear ingreso/gasto | ✔ | ✖ por defecto | ✖ | ✖ | ✖ | ✔ |
| Marcar PAGADO/PENDIENTE | ✔ | ✖ por defecto | ✖ | ✖ | ✖ | ✔ |
| Anular movimiento | ✔ | ✖ | ✖ | ✖ | ✖ | ✔ |
| Ver propia deuda/historial | ✔ | ✔ | ✖ | ✔ | ✖ | ✔ |

Decisión recomendada: TECNICO puede consultar caja, pero solo DELEGADO administra movimientos, porque FASE 4 aprobó caja exclusiva del DELEGADO.

Siempre verificar:

```text
usuario → EquipoUsuario activo → equipoId → movimiento.equipoId
```

Nunca confiar solo en `equipoId` del frontend.

## 14. Auditoría

Auditar:

- creación de ingreso/gasto;
- modificación limitada de campos no financieros si se permite;
- cambio de estado;
- anulación;
- acceso administrativo sensible, si la política lo requiere.

No guardar en `AuditoriaLog` comprobantes, datos bancarios, teléfonos ni datos personales innecesarios. Registrar actor, equipo, movimiento, tipo de operación y campos/cambio de estado.

## 15. Endpoints propuestos

- `GET /equipos/:id/caja` — resumen + movimientos filtrables.
- `POST /equipos/:id/caja` — crear movimiento.
- `GET /movimientos-caja/:id` — detalle privado.
- `PATCH /movimientos-caja/:id/estado` — PENDIENTE/PAGADO/ANULADO según permiso.
- `DELETE /movimientos-caja/:id` — anulación lógica, no borrado.
- `GET /equipos/:id/caja/resumen` — ingresos, gastos, saldo y pendientes.
- `GET /equipos/:id/caja/deudas` — deuda agrupada por jugador.
- `GET /jugadores/:id/caja` — propio o autorizado por equipo.

Filtros:

- `desde`, `hasta`;
- `tipo`;
- `categoria`;
- `estado`;
- `jugadorId`;
- paginación y orden por fecha.

No endpoints `/publico/*` para caja.

## 16. Frontend

Agregar sección Caja en `/equipos/:id` habilitada según rol.

- resumen: ingresos, gastos, saldo cobrado, pendientes;
- filtros de fecha, tipo, categoría, estado y jugador;
- alta de ingreso/gasto;
- marcar pago;
- anular movimiento;
- deuda por jugador;
- historial por jugador;
- comprobante como enlace privado;
- mensajes claros de privacidad.

No MercadoPago, facturación ni WhatsApp.

## 17. Tests

1. DELEGADO crea ingreso CUOTA PENDIENTE.
2. DELEGADO crea aporte PAGADO.
3. DELEGADO crea gastos de cada categoría.
4. Importe cero/negativo rechazado.
5. Movimiento asociado a jugador.
6. Movimiento sin jugador.
7. TECNICO consulta si se aprueba `cajaVer`.
8. TECNICO no crea/anula.
9. AUXILIAR no accede.
10. JUGADOR ve solo su deuda/historial.
11. JUGADOR no ve caja completa.
12. DELEGADO de otro equipo recibe 403.
13. Cambio PENDIENTE → PAGADO.
14. Anulación lógica conserva fila.
15. ANULADO excluido de ingresos/gastos/saldo/deuda.
16. Totales de ingresos/gastos/saldo correctos.
17. Filtros por fecha/categoría/estado/jugador.
18. No existe endpoint público accesible.
19. Auditoría de creación, pago y anulación.
20. Historial por jugador conserva PAGADO y ANULADO.

## 18. Cambios Prisma

### Recomendación base

No modificar `MovimientoCaja` para FASE 10 inicial: alcanza requisitos básicos.

### Cambio opcional recomendado

Agregar en shared el permiso:

```text
caja:ver
```

No requiere Prisma ni migración.

No agregar `Pago`, `Deuda` ni `ObligacionJugador` en esta fase.

## 19. Qué entra en FASE 10

- Backend caja privada por equipo.
- CRUD controlado de movimientos.
- Ingresos/gastos/categorías existentes.
- Deuda simple como ingreso PENDIENTE.
- Estado PAGADO y ANULADO.
- Totales, saldo, pendientes, deuda e historial.
- Filtros.
- RBAC estricto.
- Auditoría.
- Frontend básico.
- Tests.
- CHANGELOG `[0.10.0]`.

## 20. Qué queda para después

- pagos parciales;
- vencimientos recurrentes;
- cuotas automáticas;
- entidad formal de deuda/pago;
- MercadoPago y cobros online;
- facturación;
- conciliación bancaria;
- contabilidad avanzada;
- WhatsApp/notificaciones.

## 21. Decisiones definitivas FASE 10

1. `caja:ver` pertenece a DELEGADO y TECNICO; AUXILIAR y JUGADOR no ven caja completa.
2. ADMINISTRADOR no obtiene acceso por organización. SUPERADMIN tiene acceso operativo y queda auditado.
3. `saldoActual` solo suma INGRESO PAGADO menos EGRESO PAGADO; `totalPendiente` solo suma INGRESO PENDIENTE.
4. BAJA conserva historial, pero bloquea nuevos cargos INGRESO PENDIENTE.
5. PENDIENTE solo transiciona completo a PAGADO o ANULADO; ANULADO es terminal.
6. FASE 10 no implementa pagos parciales, online, contabilidad ni WhatsApp.
