import type { FastifyInstance } from 'fastify'
import { PERMISOS } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { auditar } from '../auth/auditoria.js'
import { autenticar, getAuth, requierePermiso } from '../plugins/auth.js'
import { esAdminDeTorneo, esDelegadoDelJugador, esMiembroEquipo, esSuperadmin, puedeEnEquipo, puedeVerEquipo, puedeVerTorneo } from '../auth/permisos.js'
import { badRequest, conflicto, noEncontrado, prohibido } from '../http.js'
import { EstadoEquipoJugador, EstadoPartido, TipoEventoPartido } from '../generated/prisma/enums.js'

interface EventoBody {
  equipoId: string
  jugadorId?: string
  jugadorRelacionadoId?: string
  tipo: string
  minuto?: number
  periodo?: string
  orden?: number
  subtipo?: string
  observaciones?: string
}

const estadosInvalidosParaGestion: EstadoPartido[] = [EstadoPartido.FINALIZADO]

function bloquearCorreccionDeLlaveResuelta(partido: { llaveCompetencia: { estado: string } | null } | null): void {
  if (partido?.llaveCompetencia?.estado === 'RESUELTA') throw conflicto('llave_resuelta', 'Corrección bloqueada: primero invalidá la resolución de la llave')
}

async function puedeGestionarEvento(prisma: ReturnType<typeof getPrisma>, auth: ReturnType<typeof getAuth>, partido: { tipo: string; torneoId: string | null; equipoResponsableId: string | null; equipoLocalId: string | null; equipoVisitanteId: string | null }, equipoId: string) {
  if (esSuperadmin(auth)) return true
  if (partido.tipo === 'OFICIAL' && partido.torneoId && await esAdminDeTorneo(prisma, auth, partido.torneoId)) return true
  return puedeEnEquipo(prisma, auth, equipoId, 'DELEGADO', 'TECNICO')
}

function esAdministrador(auth: ReturnType<typeof getAuth>): boolean {
  return esSuperadmin(auth) || auth.roles.some((rol) => rol.codigo === 'ADMINISTRADOR')
}

async function puedeVerPartido(prisma: ReturnType<typeof getPrisma>, auth: ReturnType<typeof getAuth>, partidoId: string): Promise<boolean> {
  if (esAdministrador(auth)) return true
  const partido = await prisma.partido.findUnique({ where: { id: partidoId }, select: { publicada: true, equipoLocalId: true, equipoVisitanteId: true, equipoLocal: { select: { privado: true } }, equipoVisitante: { select: { privado: true } } } })
  if (!partido) return false
  if (partido.publicada && !partido.equipoLocal?.privado && !partido.equipoVisitante?.privado) return true
  for (const equipoId of [partido.equipoLocalId, partido.equipoVisitanteId]) {
    if (equipoId && await esMiembroEquipo(prisma, auth, equipoId)) return true
    if (equipoId && auth.jugadorId && await prisma.equipoJugador.findFirst({ where: { equipoId, jugadorId: auth.jugadorId, estado: { not: EstadoEquipoJugador.BAJA } }, select: { id: true } })) return true
  }
  return false
}

async function puedeVerEstadisticasJugador(prisma: ReturnType<typeof getPrisma>, auth: ReturnType<typeof getAuth>, jugadorId: string): Promise<boolean> {
  return esSuperadmin(auth) || auth.jugadorId === jugadorId || (await esDelegadoDelJugador(prisma, auth, jugadorId))
}

async function puedeVerCompetencia(prisma: ReturnType<typeof getPrisma>, auth: ReturnType<typeof getAuth>, torneoCategoriaId: string): Promise<boolean> {
  const competencia = await prisma.torneoCategoria.findUnique({ where: { id: torneoCategoriaId }, select: { torneoId: true } })
  return competencia !== null && puedeVerTorneo(prisma, auth, competencia.torneoId)
}

async function cargarContexto(prisma: ReturnType<typeof getPrisma>, id: string) {
  const partido = await prisma.partido.findUnique({ where: { id }, include: { formacionInstancias: { include: { jugadores: true } }, llaveCompetencia: { select: { estado: true } } } })
  if (!partido) throw noEncontrado('Partido')
  return partido
}

async function validarEvento(prisma: ReturnType<typeof getPrisma>, partido: Awaited<ReturnType<typeof cargarContexto>>, body: EventoBody, excluirId?: string) {
  if (!Object.values(TipoEventoPartido).includes(body.tipo as TipoEventoPartido)) throw badRequest('Tipo de evento inválido')
  if (![partido.equipoLocalId, partido.equipoVisitanteId].includes(body.equipoId)) throw badRequest('El equipo no participa del partido')
  if (body.minuto !== undefined && (!Number.isInteger(body.minuto) || body.minuto < 0)) throw badRequest('El minuto debe ser entero no negativo')
  if (body.tipo === 'SUSTITUCION' && (body.minuto === undefined || !body.periodo?.trim())) throw badRequest('La sustitución requiere minuto y período')
  if (body.tipo === 'GOL' && !body.jugadorId) throw badRequest('El gol requiere jugador')
  if (body.tipo === 'GOL' && body.periodo && !['PRIMER_TIEMPO', 'SEGUNDO_TIEMPO', 'ALARGUE_PRIMER_TIEMPO', 'ALARGUE_SEGUNDO_TIEMPO'].includes(body.periodo)) throw badRequest('Período de gol inválido')
  if (body.tipo === 'TARJETA' && (!body.jugadorId || !['AMARILLA', 'ROJA'].includes(body.subtipo ?? ''))) throw badRequest('La tarjeta requiere jugador y subtipo AMARILLA o ROJA')
  if (body.tipo === 'ASISTENCIA' && (!body.jugadorId || !body.jugadorRelacionadoId)) throw badRequest('La asistencia requiere jugador y jugador relacionado')
  if (body.tipo === 'SUSTITUCION' && (!body.jugadorId || !body.jugadorRelacionadoId || body.jugadorId === body.jugadorRelacionadoId)) throw badRequest('La sustitución requiere jugador que sale y jugador que entra')

  const jugadores = [body.jugadorId, body.jugadorRelacionadoId].filter((id): id is string => Boolean(id))
  if (jugadores.length) {
    const pertenencias = await prisma.equipoJugador.findMany({ where: { equipoId: body.equipoId, jugadorId: { in: jugadores } }, select: { jugadorId: true, estado: true } })
    if (pertenencias.length !== jugadores.length) throw badRequest('Jugador ajeno al equipo del evento')
    if (pertenencias.some((p) => p.estado === EstadoEquipoJugador.BAJA || p.estado === EstadoEquipoJugador.INVITADO)) throw badRequest('Jugador no habilitado para eventos')
  }
  if (body.tipo === 'SUSTITUCION') {
    const eventos = await prisma.eventoPartido.findMany({ where: { partidoId: partido.id, equipoId: body.equipoId, anulado: false, tipo: 'SUSTITUCION', ...(excluirId ? { id: { not: excluirId } } : {}) }, orderBy: [{ minuto: 'asc' }, { orden: 'asc' }] })
    const instancia = partido.formacionInstancias.find((fi) => fi.jugadores.some((j) => j.jugadorId === body.jugadorId || j.jugadorId === body.jugadorRelacionadoId))
    const titulares = new Set(instancia?.jugadores.filter((j) => j.esTitular).map((j) => j.jugadorId) ?? [])
    const activos = new Set(titulares)
    for (const evento of eventos) {
      if (evento.jugadorId) activos.delete(evento.jugadorId)
      if (evento.jugadorRelacionadoId) activos.add(evento.jugadorRelacionadoId)
    }
    if (!activos.has(body.jugadorId!)) throw badRequest('El jugador que sale no está activo')
    if (activos.has(body.jugadorRelacionadoId!)) throw badRequest('El jugador que entra ya está activo')
  }
}

async function validarGoles(prisma: ReturnType<typeof getPrisma>, partidoId: string, golesLocal: number | null, golesVisitante: number | null) {
  if (golesLocal == null || golesVisitante == null) return false
  const partido = await prisma.partido.findUnique({ where: { id: partidoId }, select: { equipoLocalId: true, equipoVisitanteId: true } })
  if (!partido) return false
  const goles = await prisma.eventoPartido.groupBy({ by: ['equipoId'], where: { partidoId, tipo: 'GOL', anulado: false }, _count: true })
  return (goles.find((g) => g.equipoId === partido.equipoLocalId)?._count ?? 0) === golesLocal && (goles.find((g) => g.equipoId === partido.equipoVisitanteId)?._count ?? 0) === golesVisitante
}

export async function estadisticasPartido(prisma: ReturnType<typeof getPrisma>, partidoId: string) {
  const partido = await prisma.partido.findUnique({ where: { id: partidoId }, include: { eventos: { where: { anulado: false } }, formacionInstancias: { include: { jugadores: true } } } })
  if (!partido) throw noEncontrado('Partido')
  const ids = new Set<string>()
  partido.formacionInstancias.forEach((i) => i.jugadores.forEach((j) => ids.add(j.jugadorId)))
  partido.eventos.forEach((e) => { if (e.jugadorId) ids.add(e.jugadorId); if (e.jugadorRelacionadoId) ids.add(e.jugadorRelacionadoId) })
  const filas = [...ids].map((jugadorId) => {
    const propios = partido.eventos.filter((e) => e.jugadorId === jugadorId)
    const relacionados = partido.eventos.filter((e) => e.jugadorRelacionadoId === jugadorId)
    const titular = partido.formacionInstancias.some((i) => i.jugadores.some((j) => j.jugadorId === jugadorId && j.esTitular))
    const salida = partido.eventos.find((e) => e.tipo === 'SUSTITUCION' && e.jugadorId === jugadorId)
    const entrada = partido.eventos.find((e) => e.tipo === 'SUSTITUCION' && e.jugadorRelacionadoId === jugadorId)
    const participo = titular || entrada !== undefined || salida !== undefined
    return { jugadorId, participo, titular, ingresoMinuto: entrada?.minuto ?? (titular ? 0 : null), salidaMinuto: salida?.minuto ?? null, minutos: null, minutosNoDeterminados: true, goles: propios.filter((e) => e.tipo === 'GOL').length, asistencias: relacionados.filter((e) => e.tipo === 'ASISTENCIA').length, amarillas: propios.filter((e) => e.tipo === 'TARJETA' && e.subtipo === 'AMARILLA').length, rojas: propios.filter((e) => e.tipo === 'TARJETA' && e.subtipo === 'ROJA').length }
  })
  return { partidoId, oficial: partido.tipo === 'OFICIAL' && partido.estado === 'FINALIZADO', jugadores: filas, eventos: partido.eventos }
}

export async function eventosPartidoRoutes(app: FastifyInstance): Promise<void> {
  app.get('/partidos/:id/eventos', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request); const prisma = getPrisma(); const partido = await cargarContexto(prisma, (request.params as { id: string }).id)
    if (!(await puedeGestionarEvento(prisma, auth, partido, partido.equipoResponsableId ?? partido.equipoLocalId!))) throw prohibido('No tenés acceso a los eventos')
    return { data: await prisma.eventoPartido.findMany({ where: { partidoId: partido.id }, orderBy: [{ minuto: 'asc' }, { orden: 'asc' }, { createdAt: 'asc' }] }) }
  })

  app.post('/partidos/:id/eventos', { preHandler: requierePermiso(PERMISOS.partidosCargarResultados) }, async (request) => {
    const auth = getAuth(request); const prisma = getPrisma(); const partido = await cargarContexto(prisma, (request.params as { id: string }).id); const body = request.body as EventoBody
    bloquearCorreccionDeLlaveResuelta(partido)
    if (estadosInvalidosParaGestion.includes(partido.estado)) throw badRequest('Partido finalizado: usar corrección administrativa')
    if (!(await puedeGestionarEvento(prisma, auth, partido, body.equipoId))) throw prohibido('No tenés permiso para cargar eventos en ese equipo')
    await validarEvento(prisma, partido, body)
    const evento = await prisma.eventoPartido.create({ data: { partidoId: partido.id, equipoId: body.equipoId, jugadorId: body.jugadorId ?? null, jugadorRelacionadoId: body.jugadorRelacionadoId ?? null, tipo: body.tipo as TipoEventoPartido, minuto: body.minuto ?? null, periodo: body.periodo?.trim() || null, orden: body.orden ?? 0, subtipo: body.subtipo?.trim() || null, observaciones: body.observaciones?.trim() || null, creadoPorId: auth.usuarioId } })
    await auditar(prisma, { entidad: 'EventoPartido', entidadId: evento.id, accion: 'CREATE', usuarioId: auth.usuarioId, cambios: { tipo: evento.tipo, equipoId: evento.equipoId, jugadorId: evento.jugadorId, jugadorRelacionadoId: evento.jugadorRelacionadoId, minuto: evento.minuto } })
    return { data: evento }
  })

  app.patch('/eventos-partido/:id', { preHandler: requierePermiso(PERMISOS.partidosCargarResultados) }, async (request) => {
    const auth = getAuth(request); const prisma = getPrisma(); const id = (request.params as { id: string }).id; const previo = await prisma.eventoPartido.findUnique({ where: { id }, include: { partido: { include: { formacionInstancias: { include: { jugadores: true } }, llaveCompetencia: { select: { estado: true } } } } } }); if (!previo) throw noEncontrado('Evento')
    if (previo.partido.estado === EstadoPartido.FINALIZADO && !esAdministrador(auth)) throw badRequest('Partido finalizado: solo permite corrección administrativa')
    bloquearCorreccionDeLlaveResuelta(previo.partido)
    if (!(await puedeGestionarEvento(prisma, auth, previo.partido, previo.equipoId))) throw prohibido('No tenés permiso para corregir este evento')
    const body = { equipoId: previo.equipoId, jugadorId: previo.jugadorId ?? undefined, jugadorRelacionadoId: previo.jugadorRelacionadoId ?? undefined, tipo: previo.tipo, minuto: previo.minuto ?? undefined, periodo: previo.periodo ?? undefined, orden: previo.orden, subtipo: previo.subtipo ?? undefined, observaciones: previo.observaciones ?? undefined, ...(request.body as Partial<EventoBody>) }
    await validarEvento(prisma, previo.partido, body, id)
    const actualizado = await prisma.$transaction(async (tx) => { const r = await tx.eventoPartido.update({ where: { id }, data: { equipoId: body.equipoId, jugadorId: body.jugadorId ?? null, jugadorRelacionadoId: body.jugadorRelacionadoId ?? null, tipo: body.tipo as TipoEventoPartido, minuto: body.minuto ?? null, periodo: body.periodo ?? null, orden: body.orden ?? 0, subtipo: body.subtipo ?? null, observaciones: body.observaciones ?? null } }); await auditar(tx, { entidad: 'EventoPartido', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { anterior: { tipo: previo.tipo, minuto: previo.minuto, jugadorId: previo.jugadorId, jugadorRelacionadoId: previo.jugadorRelacionadoId }, nuevo: { tipo: r.tipo, minuto: r.minuto, jugadorId: r.jugadorId, jugadorRelacionadoId: r.jugadorRelacionadoId } } }); return r })
    return { data: actualizado }
  })

  app.post('/eventos-partido/:id/anular', { preHandler: requierePermiso(PERMISOS.partidosCargarResultados) }, async (request) => {
    const auth = getAuth(request); const prisma = getPrisma(); const id = (request.params as { id: string }).id; const evento = await prisma.eventoPartido.findUnique({ where: { id }, include: { partido: { include: { llaveCompetencia: { select: { estado: true } } } } } }); if (!evento) throw noEncontrado('Evento')
    if (evento.partido.estado === EstadoPartido.FINALIZADO && !esAdministrador(auth)) throw badRequest('Partido finalizado: solo permite corrección administrativa')
    bloquearCorreccionDeLlaveResuelta(evento.partido)
    if (!(await puedeGestionarEvento(prisma, auth, evento.partido, evento.equipoId))) throw prohibido('No tenés permiso para anular este evento')
    const actualizado = await prisma.$transaction(async (tx) => { const r = await tx.eventoPartido.update({ where: { id }, data: { anulado: true } }); await auditar(tx, { entidad: 'EventoPartido', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { anulado: true } }); return r }); return { data: actualizado }
  })

  app.get('/partidos/:id/estadisticas', { preHandler: requierePermiso(PERMISOS.estadisticasVer) }, async (request) => { const id = (request.params as { id: string }).id; if (!(await puedeVerPartido(getPrisma(), getAuth(request), id))) throw prohibido('No tenés acceso a estas estadísticas'); return { data: await estadisticasPartido(getPrisma(), id) } })
  app.get('/jugadores/:id/estadisticas', { preHandler: requierePermiso(PERMISOS.estadisticasVer) }, async (request) => { const auth = getAuth(request); const jugadorId = (request.params as { id: string }).id; const prisma = getPrisma(); if (!(await puedeVerEstadisticasJugador(prisma, auth, jugadorId))) throw prohibido('No tenés acceso a estas estadísticas'); const filas = await prisma.eventoPartido.findMany({ where: { jugadorId, anulado: false }, select: { partidoId: true, tipo: true, subtipo: true } }); return { data: { jugadorId, goles: filas.filter((e) => e.tipo === 'GOL').length, asistencias: await prisma.eventoPartido.count({ where: { jugadorRelacionadoId: jugadorId, tipo: 'ASISTENCIA', anulado: false } }), amarillas: filas.filter((e) => e.tipo === 'TARJETA' && e.subtipo === 'AMARILLA').length, rojas: filas.filter((e) => e.tipo === 'TARJETA' && e.subtipo === 'ROJA').length } } })
  app.get('/equipos/:id/estadisticas', { preHandler: requierePermiso(PERMISOS.estadisticasVer) }, async (request) => { const auth = getAuth(request); const equipoId = (request.params as { id: string }).id; const prisma = getPrisma(); if (!(await puedeVerEquipo(prisma, auth, equipoId))) throw prohibido('No tenés acceso a estas estadísticas'); const eventos = await prisma.eventoPartido.findMany({ where: { equipoId, anulado: false }, include: { partido: { select: { estado: true } } } }); return { data: { equipoId, goles: eventos.filter((e) => e.tipo === 'GOL').length, asistencias: eventos.filter((e) => e.tipo === 'ASISTENCIA').length, amarillas: eventos.filter((e) => e.tipo === 'TARJETA' && e.subtipo === 'AMARILLA').length, rojas: eventos.filter((e) => e.tipo === 'TARJETA' && e.subtipo === 'ROJA').length } } })
  app.get('/torneo-categorias/:id/estadisticas', { preHandler: autenticar }, async (request) => {
    const torneoCategoriaId = (request.params as { id: string }).id
    const prisma = getPrisma()
    if (!(await puedeVerCompetencia(prisma, getAuth(request), torneoCategoriaId))) throw prohibido('No tenés acceso a estas estadísticas')
    const eventos = await prisma.eventoPartido.findMany({ where: { partido: { torneoCategoriaId, estado: 'FINALIZADO', tipo: 'OFICIAL' }, anulado: false } })
    return { data: { torneoCategoriaId, goles: eventos.filter((e) => e.tipo === 'GOL').length, asistencias: eventos.filter((e) => e.tipo === 'ASISTENCIA').length, tarjetas: eventos.filter((e) => e.tipo === 'TARJETA').length } }
  })
  app.get('/torneo-categorias/:id/goleadores', { preHandler: autenticar }, async (request) => {
    const torneoCategoriaId = (request.params as { id: string }).id
    const prisma = getPrisma()
    if (!(await puedeVerCompetencia(prisma, getAuth(request), torneoCategoriaId))) throw prohibido('No tenés acceso a estos goleadores')
    const eventos = await prisma.eventoPartido.findMany({ where: { partido: { torneoCategoriaId, estado: 'FINALIZADO', tipo: 'OFICIAL' }, tipo: 'GOL', anulado: false }, select: { jugadorId: true } })
    const conteo = new Map<string, number>(); eventos.forEach((e) => { if (e.jugadorId) conteo.set(e.jugadorId, (conteo.get(e.jugadorId) ?? 0) + 1) })
    return { data: [...conteo].map(([jugadorId, goles]) => ({ jugadorId, goles })).sort((a, b) => b.goles - a.goles) }
  })
  app.get('/torneo-categorias/:id/tarjetas', { preHandler: autenticar }, async (request) => {
    const torneoCategoriaId = (request.params as { id: string }).id
    const prisma = getPrisma()
    if (!(await puedeVerCompetencia(prisma, getAuth(request), torneoCategoriaId))) throw prohibido('No tenés acceso a estas tarjetas')
    const eventos = await prisma.eventoPartido.findMany({ where: { partido: { torneoCategoriaId, estado: 'FINALIZADO', tipo: 'OFICIAL' }, tipo: 'TARJETA', anulado: false }, select: { jugadorId: true, subtipo: true } })
    const conteo = new Map<string, { amarillas: number; rojas: number }>(); eventos.forEach((e) => { if (!e.jugadorId) return; const v = conteo.get(e.jugadorId) ?? { amarillas: 0, rojas: 0 }; if (e.subtipo === 'AMARILLA') v.amarillas++; if (e.subtipo === 'ROJA') v.rojas++; conteo.set(e.jugadorId, v) })
    return { data: [...conteo].map(([jugadorId, v]) => ({ jugadorId, ...v })) }
  })
  app.get('/publico/torneo-categorias/:id/goleadores', async (request) => {
    const id = (request.params as { id: string }).id
    const tc = await getPrisma().torneoCategoria.findUnique({ where: { id }, select: { torneo: { select: { visiblePublico: true, configuracionPublica: true } } } })
    const config = tc?.torneo.configuracionPublica as { mostrarGoleadores?: boolean } | null
    if (!tc?.torneo.visiblePublico || config?.mostrarGoleadores !== true) throw noEncontrado('Goleadores')
    const eventos = await getPrisma().eventoPartido.findMany({ where: { partido: { torneoCategoriaId: id, estado: 'FINALIZADO', tipo: 'OFICIAL', publicada: true, equipoLocal: { privado: false }, equipoVisitante: { privado: false } }, tipo: 'GOL', anulado: false }, select: { jugadorId: true } })
    const conteo = new Map<string, number>(); eventos.forEach((e) => { if (e.jugadorId) conteo.set(e.jugadorId, (conteo.get(e.jugadorId) ?? 0) + 1) })
    return { data: [...conteo].map(([jugadorId, goles]) => ({ jugadorId, goles })).sort((a, b) => b.goles - a.goles) }
  })
  app.get('/publico/torneo-categorias/:id/tarjetas', async (request) => {
    const id = (request.params as { id: string }).id
    const tc = await getPrisma().torneoCategoria.findUnique({ where: { id }, select: { torneo: { select: { visiblePublico: true, configuracionPublica: true } } } })
    const config = tc?.torneo.configuracionPublica as { mostrarTarjetas?: boolean } | null
    if (!tc?.torneo.visiblePublico || config?.mostrarTarjetas !== true) throw noEncontrado('Tarjetas')
    const eventos = await getPrisma().eventoPartido.findMany({ where: { partido: { torneoCategoriaId: id, estado: 'FINALIZADO', tipo: 'OFICIAL', publicada: true, equipoLocal: { privado: false }, equipoVisitante: { privado: false } }, tipo: 'TARJETA', anulado: false }, select: { jugadorId: true, subtipo: true } })
    const conteo = new Map<string, { amarillas: number; rojas: number }>(); eventos.forEach((e) => { if (!e.jugadorId) return; const v = conteo.get(e.jugadorId) ?? { amarillas: 0, rojas: 0 }; if (e.subtipo === 'AMARILLA') v.amarillas++; if (e.subtipo === 'ROJA') v.rojas++; conteo.set(e.jugadorId, v) })
    return { data: [...conteo].map(([jugadorId, v]) => ({ jugadorId, ...v })) }
  })
  app.get('/partidos/:id/sanciones', { preHandler: requierePermiso(PERMISOS.estadisticasVer) }, async (request) => { const id = (request.params as { id: string }).id; const prisma = getPrisma(); if (!(await puedeVerPartido(prisma, getAuth(request), id))) throw prohibido('No tenés acceso a estas sanciones'); return { data: await prisma.sancion.findMany({ where: { partidoId: id }, orderBy: { createdAt: 'asc' } }) } })
  app.post('/sanciones', { preHandler: requierePermiso(PERMISOS.sancionesGestionar) }, async (request) => {
    const auth = getAuth(request); const body = request.body as { equipoId: string; jugadorId?: string; partidoId?: string; torneoId?: string; origen: string; tipo: string; motivo: string; fechaInicio: string; fechaFin?: string }
    if (!body.equipoId || !body.origen || !body.tipo || !body.motivo || !body.fechaInicio) throw badRequest('Datos de sanción incompletos')
    if (!(await puedeEnEquipo(getPrisma(), auth, body.equipoId, 'DELEGADO')) && !(body.torneoId && await esAdminDeTorneo(getPrisma(), auth, body.torneoId))) throw prohibido('No tenés permiso para crear sanciones')
    const sancion = await getPrisma().sancion.create({ data: { equipoId: body.equipoId, jugadorId: body.jugadorId ?? null, partidoId: body.partidoId ?? null, torneoId: body.torneoId ?? null, origen: body.origen as never, tipo: body.tipo as never, motivo: body.motivo.trim(), fechaInicio: new Date(body.fechaInicio), fechaFin: body.fechaFin ? new Date(body.fechaFin) : null } })
    await auditar(getPrisma(), { entidad: 'Sancion', entidadId: sancion.id, accion: 'CREATE', usuarioId: auth.usuarioId, cambios: { equipoId: body.equipoId, partidoId: body.partidoId ?? null, tipo: body.tipo, origen: body.origen } })
    return { data: sancion }
  })
  app.patch('/sanciones/:id', { preHandler: requierePermiso(PERMISOS.sancionesGestionar) }, async (request) => {
    const auth = getAuth(request); const id = (request.params as { id: string }).id; const previo = await getPrisma().sancion.findUnique({ where: { id } }); if (!previo) throw noEncontrado('Sanción')
    if (!(await puedeEnEquipo(getPrisma(), auth, previo.equipoId, 'DELEGADO'))) throw prohibido('No tenés permiso para corregir sanciones')
    const body = request.body as { motivo?: string; fechaFin?: string; resuelta?: boolean }; const sancion = await getPrisma().sancion.update({ where: { id }, data: { motivo: body.motivo?.trim(), fechaFin: body.fechaFin ? new Date(body.fechaFin) : undefined, resuelta: body.resuelta } }); await auditar(getPrisma(), { entidad: 'Sancion', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { campos: Object.keys(body) } }); return { data: sancion }
  })
  app.post('/sanciones/:id/resolver', { preHandler: requierePermiso(PERMISOS.sancionesGestionar) }, async (request) => { const auth = getAuth(request); const id = (request.params as { id: string }).id; const previa = await getPrisma().sancion.findUnique({ where: { id } }); if (!previa) throw noEncontrado('Sanción'); if (!esAdministrador(auth) && !(previa.torneoId && await esAdminDeTorneo(getPrisma(), auth, previa.torneoId))) throw prohibido('No tenés permiso para resolver sanciones'); const sancion = await getPrisma().sancion.update({ where: { id }, data: { resuelta: true } }); await auditar(getPrisma(), { entidad: 'Sancion', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { resuelta: true } }); return { data: sancion } })
}

export { validarGoles }
