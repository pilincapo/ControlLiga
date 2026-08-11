import type { FastifyInstance } from 'fastify'
import { PERMISOS } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { auditar } from '../auth/auditoria.js'
import { autenticar, getAuth, requierePermiso } from '../plugins/auth.js'
import { esSuperadmin, puedeEnEquipo } from '../auth/permisos.js'
import { badRequest, noEncontrado, prohibido } from '../http.js'
import { CategoriaMovimiento, EstadoEquipoJugador, EstadoMovimiento, TipoMovimiento } from '../generated/prisma/enums.js'

interface MovimientoBody {
  tipo: string
  categoria: string
  concepto: string
  importe: number | string
  fecha?: string
  jugadorId?: string | null
  comprobanteUrl?: string | null
  observaciones?: string | null
  estado?: string
}

interface Filtros {
  desde?: string
  hasta?: string
  tipo?: string
  categoria?: string
  estado?: string
  jugadorId?: string
}

const camposMovimiento = {
  id: true,
  equipoId: true,
  tipo: true,
  categoria: true,
  concepto: true,
  importe: true,
  fecha: true,
  jugadorId: true,
  comprobanteUrl: true,
  observaciones: true,
  estado: true,
  creadoPorId: true,
  createdAt: true,
  updatedAt: true,
  jugador: { select: { persona: { select: { nombre: true, apellido: true } } } },
}

function importeNumero(valor: unknown): number {
  return Number(valor)
}

function validarFiltros(query: Filtros) {
  for (const [campo, valor] of Object.entries(query)) {
    if (!valor) continue
    if (campo === 'desde' || campo === 'hasta') {
      if (Number.isNaN(Date.parse(valor))) throw badRequest(`Fecha ${campo} inválida`)
    } else if (campo === 'tipo' && !Object.values(TipoMovimiento).includes(valor as never)) {
      throw badRequest('Tipo inválido')
    } else if (campo === 'categoria' && !Object.values(CategoriaMovimiento).includes(valor as never)) {
      throw badRequest('Categoría inválida')
    } else if (campo === 'estado' && !Object.values(EstadoMovimiento).includes(valor as never)) {
      throw badRequest('Estado inválido')
    }
  }
}

function construirWhere(equipoId: string, query: Filtros) {
  validarFiltros(query)
  return {
    equipoId,
    ...(query.desde || query.hasta ? { fecha: { ...(query.desde ? { gte: new Date(query.desde) } : {}), ...(query.hasta ? { lte: new Date(query.hasta) } : {}) } } : {}),
    ...(query.tipo ? { tipo: query.tipo as never } : {}),
    ...(query.categoria ? { categoria: query.categoria as never } : {}),
    ...(query.estado ? { estado: query.estado as never } : {}),
    ...(query.jugadorId ? { jugadorId: query.jugadorId } : {}),
  }
}

function resumen(movimientos: Array<{ tipo: string; estado: string; importe: unknown }>) {
  const suma = (filtro: (m: (typeof movimientos)[number]) => boolean) => movimientos.filter(filtro).reduce((total, m) => total + importeNumero(m.importe), 0)
  const totalIngresosPagados = suma((m) => m.tipo === 'INGRESO' && m.estado === 'PAGADO')
  const totalEgresosPagados = suma((m) => m.tipo === 'EGRESO' && m.estado === 'PAGADO')
  const totalPendiente = suma((m) => m.tipo === 'INGRESO' && m.estado === 'PENDIENTE')
  return {
    totalIngresos: suma((m) => m.tipo === 'INGRESO' && m.estado !== 'ANULADO'),
    totalGastos: suma((m) => m.tipo === 'EGRESO' && m.estado !== 'ANULADO'),
    totalIngresosPagados,
    totalIngresosPendientes: totalPendiente,
    totalGastosPagados: totalEgresosPagados,
    saldoActual: totalIngresosPagados - totalEgresosPagados,
    totalPendiente,
  }
}

async function puedeVerCaja(equipoId: string, auth: ReturnType<typeof getAuth>) {
  return esSuperadmin(auth) || (await puedeEnEquipo(getPrisma(), auth, equipoId, 'DELEGADO', 'TECNICO'))
}

async function cargarMovimiento(id: string) {
  const movimiento = await getPrisma().movimientoCaja.findUnique({ where: { id }, select: { ...camposMovimiento } })
  if (!movimiento) throw noEncontrado('Movimiento de caja')
  return movimiento
}

function validarBody(body: MovimientoBody) {
  if (!Object.values(TipoMovimiento).includes(body.tipo as never)) throw badRequest('Tipo inválido')
  if (!Object.values(CategoriaMovimiento).includes(body.categoria as never)) throw badRequest('Categoría inválida')
  const categorias = body.tipo === 'INGRESO' ? ['CUOTA', 'APORTE', 'INSCRIPCION', 'OTROS'] : ['CANCHA', 'ARBITRO', 'EQUIPAMIENTO', 'VIAJE', 'TERCER_TIEMPO', 'INSCRIPCION', 'OTROS']
  if (!categorias.includes(body.categoria)) throw badRequest('La categoría no corresponde al tipo de movimiento')
  if (!body.concepto?.trim()) throw badRequest('El concepto es obligatorio')
  const importe = importeNumero(body.importe)
  if (!Number.isFinite(importe) || importe <= 0) throw badRequest('El importe debe ser mayor que cero')
  if (body.fecha && Number.isNaN(Date.parse(body.fecha))) throw badRequest('Fecha inválida')
  if (body.estado && (!Object.values(EstadoMovimiento).includes(body.estado as never) || body.estado === 'ANULADO')) throw badRequest('Estado inválido')
}

export async function cajaRoutes(app: FastifyInstance): Promise<void> {
  app.get('/equipos/:id/caja', { preHandler: requierePermiso(PERMISOS.cajaVer) }, async (request) => {
    const auth = getAuth(request); const equipoId = (request.params as { id: string }).id
    if (!(await puedeVerCaja(equipoId, auth))) throw prohibido('No tenés acceso a la caja de ese equipo')
    const movimientos = await getPrisma().movimientoCaja.findMany({ where: construirWhere(equipoId, request.query as Filtros), orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }], select: camposMovimiento })
    return { data: { resumen: resumen(movimientos), movimientos } }
  })

  app.post('/equipos/:id/caja', { preHandler: requierePermiso(PERMISOS.cajaAdministrar) }, async (request) => {
    const auth = getAuth(request); const equipoId = (request.params as { id: string }).id; const body = request.body as MovimientoBody
    if (!(await puedeEnEquipo(getPrisma(), auth, equipoId, 'DELEGADO')) && !esSuperadmin(auth)) throw prohibido('Solo un DELEGADO puede administrar caja')
    validarBody(body)
    if (body.jugadorId) {
      const jugador = await getPrisma().equipoJugador.findFirst({ where: { equipoId, jugadorId: body.jugadorId } })
      if (!jugador) throw badRequest('El jugador no pertenece al historial del equipo')
      if (jugador.estado === EstadoEquipoJugador.BAJA && body.tipo === 'INGRESO') throw badRequest('No se pueden crear nuevos cargos para un jugador dado de baja')
    }
    const movimiento = await getPrisma().movimientoCaja.create({ data: { equipoId, tipo: body.tipo as never, categoria: body.categoria as never, concepto: body.concepto.trim(), importe: body.importe, fecha: body.fecha ? new Date(body.fecha) : undefined, jugadorId: body.jugadorId ?? null, comprobanteUrl: body.comprobanteUrl?.trim() || null, observaciones: body.observaciones?.trim() || null, estado: (body.estado ?? 'PENDIENTE') as never, creadoPorId: auth.usuarioId }, select: camposMovimiento })
    await auditar(getPrisma(), { entidad: 'MovimientoCaja', entidadId: movimiento.id, accion: 'CREATE', usuarioId: auth.usuarioId, cambios: { equipoId, tipo: movimiento.tipo, categoria: movimiento.categoria, estado: movimiento.estado, importe: movimiento.importe.toString() } })
    return { data: movimiento }
  })

  app.get('/movimientos-caja/:id', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request); const movimiento = await cargarMovimiento((request.params as { id: string }).id)
    const propio = auth.jugadorId === movimiento.jugadorId
    if (!propio && !(await puedeVerCaja(movimiento.equipoId, auth))) throw prohibido('No tenés acceso a ese movimiento')
    return { data: movimiento }
  })

  app.patch('/movimientos-caja/:id/estado', { preHandler: requierePermiso(PERMISOS.cajaAdministrar) }, async (request) => {
    const auth = getAuth(request); const id = (request.params as { id: string }).id; const previo = await cargarMovimiento(id); const estado = (request.body as { estado?: string }).estado
    if (!(await puedeEnEquipo(getPrisma(), auth, previo.equipoId, 'DELEGADO')) && !esSuperadmin(auth)) throw prohibido('Solo un DELEGADO puede cambiar estados')
    if (!estado || !Object.values(EstadoMovimiento).includes(estado as never)) throw badRequest('Estado inválido')
    if (previo.estado === 'ANULADO') throw badRequest('Un movimiento anulado no puede volver a otro estado')
    if (previo.estado === 'PAGADO' && estado === 'PENDIENTE') throw badRequest('Un movimiento pagado no puede volver a pendiente')
    const movimiento = await getPrisma().movimientoCaja.update({ where: { id }, data: { estado: estado as never }, select: camposMovimiento })
    await auditar(getPrisma(), { entidad: 'MovimientoCaja', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { estadoAnterior: previo.estado, estado: movimiento.estado } })
    return { data: movimiento }
  })

  app.delete('/movimientos-caja/:id', { preHandler: requierePermiso(PERMISOS.cajaAdministrar) }, async (request) => {
    const auth = getAuth(request); const id = (request.params as { id: string }).id; const previo = await cargarMovimiento(id)
    if (!(await puedeEnEquipo(getPrisma(), auth, previo.equipoId, 'DELEGADO')) && !esSuperadmin(auth)) throw prohibido('Solo un DELEGADO puede anular movimientos')
    if (previo.estado === 'ANULADO') throw badRequest('El movimiento ya está anulado')
    const movimiento = await getPrisma().movimientoCaja.update({ where: { id }, data: { estado: 'ANULADO' }, select: camposMovimiento })
    await auditar(getPrisma(), { entidad: 'MovimientoCaja', entidadId: id, accion: 'DELETE', usuarioId: auth.usuarioId, cambios: { estadoAnterior: previo.estado, estado: 'ANULADO' } })
    return { data: movimiento }
  })

  app.get('/equipos/:id/caja/resumen', { preHandler: requierePermiso(PERMISOS.cajaVer) }, async (request) => {
    const auth = getAuth(request); const equipoId = (request.params as { id: string }).id
    if (!(await puedeVerCaja(equipoId, auth))) throw prohibido('No tenés acceso a la caja de ese equipo')
    const movimientos = await getPrisma().movimientoCaja.findMany({ where: construirWhere(equipoId, request.query as Filtros), select: { tipo: true, estado: true, importe: true } })
    return { data: resumen(movimientos) }
  })

  app.get('/equipos/:id/caja/deudas', { preHandler: requierePermiso(PERMISOS.cajaVer) }, async (request) => {
    const auth = getAuth(request); const equipoId = (request.params as { id: string }).id
    if (!(await puedeVerCaja(equipoId, auth))) throw prohibido('No tenés acceso a las deudas de ese equipo')
    const movimientos = await getPrisma().movimientoCaja.findMany({ where: { ...construirWhere(equipoId, request.query as Filtros), tipo: 'INGRESO', estado: 'PENDIENTE' }, select: { jugadorId: true, importe: true, jugador: { select: { persona: { select: { nombre: true, apellido: true } } } } } })
    const porJugador = new Map<string, { jugadorId: string; jugador: string; importe: number }>()
    for (const movimiento of movimientos) if (movimiento.jugadorId) { const actual = porJugador.get(movimiento.jugadorId) ?? { jugadorId: movimiento.jugadorId, jugador: `${movimiento.jugador?.persona.nombre ?? ''} ${movimiento.jugador?.persona.apellido ?? ''}`.trim(), importe: 0 }; actual.importe += importeNumero(movimiento.importe); porJugador.set(movimiento.jugadorId, actual) }
    return { data: [...porJugador.values()] }
  })

  app.get('/jugadores/:id/caja', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request); const jugadorId = (request.params as { id: string }).id
    const prisma = getPrisma()
    let equipoIdsAutorizados: string[] | undefined
    if (auth.jugadorId !== jugadorId && !esSuperadmin(auth)) {
      const equipos = await prisma.equipoJugador.findMany({ where: { jugadorId }, select: { equipoId: true } })
      equipoIdsAutorizados = []
      for (const equipo of equipos) {
        if (await puedeVerCaja(equipo.equipoId, auth)) equipoIdsAutorizados.push(equipo.equipoId)
      }
      if (equipoIdsAutorizados.length === 0) throw prohibido('No tenés acceso a la caja de ese jugador')
    }
    const movimientos = await prisma.movimientoCaja.findMany({ where: { jugadorId, ...(equipoIdsAutorizados ? { equipoId: { in: equipoIdsAutorizados } } : {}), ...(() => { const q = request.query as Filtros; validarFiltros(q); return { ...(q.desde || q.hasta ? { fecha: { ...(q.desde ? { gte: new Date(q.desde) } : {}), ...(q.hasta ? { lte: new Date(q.hasta) } : {}) } } : {}), ...(q.tipo ? { tipo: q.tipo as never } : {}), ...(q.categoria ? { categoria: q.categoria as never } : {}), ...(q.estado ? { estado: q.estado as never } : {}), } })() }, orderBy: { fecha: 'desc' }, select: camposMovimiento })
    return { data: { jugadorId, resumen: resumen(movimientos), movimientos } }
  })
}
