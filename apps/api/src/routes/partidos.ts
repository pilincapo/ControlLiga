import type { FastifyInstance } from 'fastify'
import { PERMISOS } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { badRequest, conflicto, noEncontrado, prohibido } from '../http.js'
import { autenticar, getAuth, requierePermiso } from '../plugins/auth.js'
import { esAdminDeTorneo, esMiembroEquipo, esSuperadmin, puedeEnEquipo } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'
import { EstadoEquipoJugador, EstadoParticipacion } from '../generated/prisma/enums.js'
import { transicionValida } from '../partidos/estados.js'
import type { ContextoAuth } from '../auth/contexto.js'
import type { PrismaClient } from '../generated/prisma/client.js'
import type { EstadoPartido } from '../generated/prisma/enums.js'
import { validarGoles } from './eventos-partido.js'

interface CrearPartidoBody {
  tipo: string
  equipoLocalId: string
  equipoVisitanteId: string
  fechaHora: string
  lugar?: string
  torneoId?: string
  temporadaId?: string
  torneoCategoriaId?: string
  zonaId?: string
  jornadaId?: string
  observaciones?: string
  arbitro?: string
}

interface ModificarBody {
  fechaHora?: string
  lugar?: string
  observaciones?: string
  arbitro?: string
}

interface CambiarEstadoBody {
  estado: string
}

interface GolesBody {
  golesLocal: number
  golesVisitante: number
}

async function validarPartidoTorneo(
  prisma: PrismaClient,
  tipo: string,
  equipoLocalId: string,
  equipoVisitanteId: string,
  torneoId?: string,
  temporadaId?: string,
  torneoCategoriaId?: string,
  zonaId?: string,
  jornadaId?: string,
): Promise<void> {
  if (tipo === 'OFICIAL') {
    if (!torneoId) throw badRequest('El torneo es obligatorio para partidos oficiales')
    if (!temporadaId) throw badRequest('La temporada es obligatoria para partidos oficiales')
    const temporada = await prisma.temporada.findUnique({ where: { id: temporadaId }, select: { torneoId: true } })
    if (!temporada || temporada.torneoId !== torneoId) throw badRequest('La temporada no pertenece al torneo indicado')
  }
  if (temporadaId) {
    const estados = [EstadoParticipacion.CONFIRMADO]
    for (const equipoId of [equipoLocalId, equipoVisitanteId]) {
      const partic = await prisma.equipoParticipacion.findFirst({
        where: { equipoId, temporadaId, torneoId: torneoId ?? undefined, estado: { in: estados } },
        select: { id: true },
      })
      if (!partic) throw badRequest('Uno de los equipos no está confirmado en la temporada')
    }
  }
  if (torneoCategoriaId) {
    const tc = await prisma.torneoCategoria.findUnique({ where: { id: torneoCategoriaId }, select: { torneoId: true, temporadaId: true } })
    if (!tc) throw noEncontrado('Competición')
    if ((torneoId && tc.torneoId !== torneoId) || (temporadaId && tc.temporadaId !== temporadaId)) throw badRequest('La categoría no pertenece a la temporada/torneo')
  }
  if (zonaId) {
    const zona = await prisma.zona.findUnique({ where: { id: zonaId }, select: { torneoCategoriaId: true } })
    if (!zona) throw noEncontrado('Zona')
    if (torneoCategoriaId && zona.torneoCategoriaId !== torneoCategoriaId) throw badRequest('La zona no pertenece a la categoría')
  }
  if (jornadaId) {
    const jornada = await prisma.jornada.findUnique({ where: { id: jornadaId }, select: { torneoCategoriaId: true, zonaId: true } })
    if (!jornada) throw noEncontrado('Jornada')
    if (torneoCategoriaId && jornada.torneoCategoriaId !== torneoCategoriaId) throw badRequest('La jornada no pertenece a la categoría')
    if (zonaId && jornada.zonaId !== zonaId && jornada.zonaId !== null) throw badRequest('La jornada no pertenece a la zona')
  }
}

async function puedeGestionar(prisma: PrismaClient, auth: ContextoAuth, partido: { tipo: string; torneoId?: string | null; equipoResponsableId?: string | null; equipoLocalId?: string | null }): Promise<boolean> {
  if (esSuperadmin(auth)) return true
  if (partido.tipo === 'OFICIAL' && partido.torneoId) {
    if (await esAdminDeTorneo(prisma, auth, partido.torneoId)) return true
  }
  const equipoId = partido.equipoResponsableId ?? partido.equipoLocalId
  if (equipoId && (await puedeEnEquipo(prisma, auth, equipoId, 'DELEGADO', 'TECNICO'))) return true
  return false
}

async function puedeVer(prisma: PrismaClient, auth: ContextoAuth, p: { publicada: boolean; equipoLocalId?: string | null; equipoVisitanteId?: string | null }): Promise<boolean> {
  if (p.publicada || esSuperadmin(auth)) return true
  const equipos = [p.equipoLocalId, p.equipoVisitanteId].filter((id): id is string => id !== null && id !== undefined)
  for (const eid of equipos) {
    if (await esMiembroEquipo(prisma, auth, eid)) return true
  }
  if (auth.jugadorId) {
    for (const eid of equipos) {
      const ej = await prisma.equipoJugador.findFirst({ where: { jugadorId: auth.jugadorId, equipoId: eid, estado: { not: EstadoEquipoJugador.BAJA } }, select: { id: true } })
      if (ej) return true
    }
  }
  return false
}

export async function partidosRoutes(app: FastifyInstance): Promise<void> {
  app.post('/partidos', { preHandler: requierePermiso(PERMISOS.partidosCargarResultados) }, async (request) => {
    const auth = getAuth(request)
    const body = request.body as CrearPartidoBody
    const prisma = getPrisma()
    if (!body.equipoLocalId || !body.equipoVisitanteId || !body.fechaHora) throw badRequest('Equipos y fecha son obligatorios')
    if (body.equipoLocalId === body.equipoVisitanteId) throw badRequest('Los equipos deben ser distintos')
    const tipos = ['OFICIAL','AMISTOSO','ENTRENAMIENTO','INTERNO','INFORMAL','OTRO']
    if (!tipos.includes(body.tipo)) throw badRequest('Tipo de partido inválido')
    const [el, ev] = await Promise.all([prisma.equipo.findUnique({ where: { id: body.equipoLocalId }, select: { id: true } }), prisma.equipo.findUnique({ where: { id: body.equipoVisitanteId }, select: { id: true } })])
    if (!el || !ev) throw noEncontrado('Equipo')
    await validarPartidoTorneo(prisma, body.tipo, body.equipoLocalId, body.equipoVisitanteId, body.torneoId, body.temporadaId, body.torneoCategoriaId, body.zonaId, body.jornadaId)
    const responsableId = body.equipoLocalId
    if (!(await puedeGestionar(prisma, auth, { tipo: body.tipo, torneoId: body.torneoId, equipoResponsableId: null, equipoLocalId: responsableId }))) {
      throw prohibido('No tenés permiso para crear partidos en ese equipo')
    }
    const partido = await prisma.partido.create({
      data: {
        tipo: body.tipo as never, equipoLocalId: body.equipoLocalId, equipoVisitanteId: body.equipoVisitanteId,
        equipoResponsableId: responsableId, fechaHora: new Date(body.fechaHora),
        lugar: body.lugar?.trim() || null, torneoId: body.torneoId ?? null, temporadaId: body.temporadaId ?? null,
        torneoCategoriaId: body.torneoCategoriaId ?? null, zonaId: body.zonaId ?? null, jornadaId: body.jornadaId ?? null,
        observaciones: body.observaciones?.trim() || null, arbitro: body.arbitro?.trim() || null,
      },
    })
    await auditar(prisma, { entidad: 'Partido', entidadId: partido.id, accion: 'CREATE', usuarioId: auth.usuarioId, cambios: { tipo: body.tipo, local: body.equipoLocalId, visitante: body.equipoVisitanteId } })
    return { data: partido }
  })

  app.get('/partidos', { preHandler: requierePermiso(PERMISOS.partidosVer) }, async (request) => {
    const auth = getAuth(request)
    const prisma = getPrisma()
    if (esSuperadmin(auth)) { const todos = await prisma.partido.findMany({ include: { equipoLocal: { select: { nombre: true } }, equipoVisitante: { select: { nombre: true } } }, orderBy: { fechaHora: 'desc' } }); return { data: todos } }
    const equipoIds = new Set<string>()
    const eus = await prisma.equipoUsuario.findMany({ where: { usuarioId: auth.usuarioId, activo: true }, select: { equipoId: true } })
    eus.forEach((e) => equipoIds.add(e.equipoId))
    if (auth.jugadorId) {
      const ejs = await prisma.equipoJugador.findMany({ where: { jugadorId: auth.jugadorId, estado: { not: EstadoEquipoJugador.BAJA } }, select: { equipoId: true } })
      ejs.forEach((e) => equipoIds.add(e.equipoId))
    }
    const where = equipoIds.size > 0 ? { OR: [{ equipoLocalId: { in: [...equipoIds] } }, { equipoVisitanteId: { in: [...equipoIds] } }, { publicada: true }] } : { publicada: true }
    const partidos = await prisma.partido.findMany({ where, include: { equipoLocal: { select: { nombre: true } }, equipoVisitante: { select: { nombre: true } } }, orderBy: { fechaHora: 'desc' } })
    return { data: partidos }
  })

  app.get('/partidos/:id', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const partido = await prisma.partido.findUnique({
      where: { id },
      include: {
        equipoLocal: { select: { id: true, nombre: true, escudoUrl: true } },
        equipoVisitante: { select: { id: true, nombre: true, escudoUrl: true } },
        formacionInstancias: { include: { jugadores: { include: { jugador: { include: { persona: { select: { nombre: true, apellido: true } } } } }, orderBy: { orden: 'asc' } } } },
        convocatorias: { include: { jugadores: { include: { equipoJugador: { include: { jugador: { include: { persona: { select: { nombre: true, apellido: true } } } } } } }, orderBy: { orden: 'asc' } } } },
        sanciones: { select: { id: true, tipo: true, motivo: true, jugadorId: true } },
        torneo: { select: { id: true, nombre: true } },
        temporada: { select: { id: true, nombre: true } },
      },
    })
    if (!partido) throw noEncontrado('Partido')
    if (!(await puedeVer(prisma, auth, partido))) throw prohibido('No tenés acceso a ese partido')
    return { data: partido }
  })

  app.patch('/partidos/:id', { preHandler: requierePermiso(PERMISOS.partidosCargarResultados) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as ModificarBody
    const prisma = getPrisma()
    const p = await prisma.partido.findUnique({ where: { id }, select: { id: true, estado: true, tipo: true, torneoId: true, equipoResponsableId: true, equipoLocalId: true } })
    if (!p) throw noEncontrado('Partido')
    if (p.estado !== 'PROGRAMADO' && p.estado !== 'APLAZADO') throw badRequest('Solo se puede modificar un partido programado o aplazado')
    if (!(await puedeGestionar(prisma, auth, p))) throw prohibido('No tenés permiso para modificar ese partido')
    const actualizado = await prisma.partido.update({
      where: { id },
      data: {
        fechaHora: body.fechaHora ? new Date(body.fechaHora) : undefined,
        lugar: body.lugar !== undefined ? body.lugar.trim() || null : undefined,
        observaciones: body.observaciones !== undefined ? body.observaciones.trim() || null : undefined,
        arbitro: body.arbitro !== undefined ? body.arbitro.trim() || null : undefined,
      },
    })
    await auditar(prisma, { entidad: 'Partido', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { campos: Object.keys(body) } })
    return { data: actualizado }
  })

  app.post('/partidos/:id/estado', { preHandler: requierePermiso(PERMISOS.partidosCargarResultados) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as CambiarEstadoBody
    const prisma = getPrisma()
    const estados = ['PROGRAMADO','EN_CURSO','FINALIZADO','SUSPENDIDO','APLAZADO']
    if (!estados.includes(body.estado)) throw badRequest('Estado inválido')
    const p = await prisma.partido.findUnique({ where: { id }, select: { id: true, estado: true, golesLocal: true, golesVisitante: true, tipo: true, torneoId: true, equipoResponsableId: true, equipoLocalId: true } })
    if (!p) throw noEncontrado('Partido')
    if (!(await puedeGestionar(prisma, auth, p))) throw prohibido('No tenés permiso para cambiar el estado')
    if (p.estado === body.estado) throw badRequest('El partido ya está en ese estado')
    if (p.estado === 'FINALIZADO') throw conflicto('partido_finalizado', 'Un partido finalizado no se puede reabrir')
    if (!transicionValida(p.estado, body.estado as EstadoPartido)) throw conflicto('transicion_invalida', `No se puede pasar de ${p.estado} a ${body.estado}`)
    if (body.estado === 'FINALIZADO' && (p.golesLocal == null || p.golesVisitante == null || p.golesLocal < 0 || p.golesVisitante < 0)) {
      throw badRequest('El resultado (goles) debe estar cargado antes de finalizar')
    }
    if (body.estado === 'FINALIZADO' && !(await validarGoles(prisma, p.id, p.golesLocal, p.golesVisitante))) throw badRequest('Los goles oficiales no coinciden con eventos GOL no anulados')
    const actualizado = await prisma.partido.update({ where: { id }, data: { estado: body.estado as EstadoPartido }, select: { id: true, estado: true } })
    await auditar(prisma, { entidad: 'Partido', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { cambioDeEstado: { de: p.estado, a: body.estado } } })
    return { data: actualizado }
  })

  app.post('/partidos/:id/resultado', { preHandler: requierePermiso(PERMISOS.partidosCargarResultados) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as GolesBody
    const prisma = getPrisma()
    if (body.golesLocal == null || body.golesVisitante == null || body.golesLocal < 0 || body.golesVisitante < 0 || !Number.isInteger(body.golesLocal) || !Number.isInteger(body.golesVisitante)) {
      throw badRequest('Los goles deben ser números enteros no negativos')
    }
    const p = await prisma.partido.findUnique({ where: { id }, select: { id: true, estado: true, tipo: true, torneoId: true, equipoResponsableId: true, equipoLocalId: true } })
    if (!p) throw noEncontrado('Partido')
    if (p.estado === 'FINALIZADO') throw badRequest('El partido ya está finalizado')
    if (!(await puedeGestionar(prisma, auth, p))) throw prohibido('No tenés permiso para cargar el resultado')
    const nuevoEstado = p.estado === 'EN_CURSO' ? 'FINALIZADO' : undefined
    const data: Record<string, unknown> = { golesLocal: body.golesLocal, golesVisitante: body.golesVisitante }
    if (nuevoEstado) {
      if (!(await validarGoles(prisma, p.id, body.golesLocal, body.golesVisitante))) throw badRequest('Los goles oficiales no coinciden con eventos GOL no anulados')
      data.estado = nuevoEstado
    }
    const actualizado = await prisma.partido.update({ where: { id }, data, select: { id: true, golesLocal: true, golesVisitante: true, estado: true } })
    await auditar(prisma, { entidad: 'Partido', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { resultado: { golesLocal: body.golesLocal, golesVisitante: body.golesVisitante }, ...(nuevoEstado ? { finalizado: true } : {}) } })
    return { data: actualizado }
  })

  app.get('/equipos/:id/partidos', { preHandler: autenticar }, async (request, reply) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    let ok = esSuperadmin(auth) || (await esMiembroEquipo(prisma, auth, id))
    if (!ok && auth.jugadorId) {
      const ej = await prisma.equipoJugador.findFirst({ where: { jugadorId: auth.jugadorId, equipoId: id, estado: { not: EstadoEquipoJugador.BAJA } }, select: { id: true } })
      ok = ej !== null
    }
    if (!ok) return reply.status(403).send(prohibido('No tenés acceso a los partidos de ese equipo'))
    const partidos = await prisma.partido.findMany({
      where: { OR: [{ equipoLocalId: id }, { equipoVisitanteId: id }] },
      include: { equipoLocal: { select: { nombre: true } }, equipoVisitante: { select: { nombre: true } } },
      orderBy: { fechaHora: 'desc' },
    })
    return { data: partidos }
  })

  app.post('/partidos/:id/publicar', { preHandler: requierePermiso(PERMISOS.partidosCargarResultados) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const prisma = getPrisma()
    const p = await prisma.partido.findUnique({ where: { id }, select: { id: true, tipo: true, torneoId: true, equipoResponsableId: true, equipoLocalId: true } })
    if (!p) throw noEncontrado('Partido')
    if (!(await puedeGestionar(prisma, auth, p))) throw prohibido('No tenés permiso para publicar este partido')
    const completo = await prisma.partido.findUnique({ where: { id }, select: { estado: true, golesLocal: true, golesVisitante: true } })
    if (!completo || completo.estado !== 'FINALIZADO') throw badRequest('Solo se pueden publicar partidos finalizados')
    if (!(await validarGoles(prisma, id, completo.golesLocal, completo.golesVisitante))) throw badRequest('Los goles oficiales no coinciden con eventos GOL no anulados')
    const res = await prisma.partido.update({ where: { id }, data: { publicada: true }, select: { id: true, publicada: true } })
    await auditar(prisma, { entidad: 'Partido', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { publicada: true } })
    return { data: res }
  })

  app.post('/partidos/:id/despublicar', { preHandler: requierePermiso(PERMISOS.partidosCargarResultados) }, async (request) => {
    const auth = getAuth(request); const { id } = request.params as { id: string }; const prisma = getPrisma()
    const p = await prisma.partido.findUnique({ where: { id }, select: { id: true, tipo: true, torneoId: true, equipoResponsableId: true, equipoLocalId: true } })
    if (!p) throw noEncontrado('Partido')
    if (!(await puedeGestionar(prisma, auth, p))) throw prohibido('No tenés permiso para despublicar este partido')
    const res = await prisma.partido.update({ where: { id }, data: { publicada: false }, select: { id: true, publicada: true } })
    await auditar(prisma, { entidad: 'Partido', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { publicada: false } })
    return { data: res }
  })

  app.get('/publico/partidos', async () => {
    const partidos = await getPrisma().partido.findMany({
      where: { publicada: true, OR: [{ torneoId: null }, { torneo: { visiblePublico: true } }] },
      include: { equipoLocal: { select: { nombre: true, escudoUrl: true } }, equipoVisitante: { select: { nombre: true, escudoUrl: true } } },
      orderBy: { fechaHora: 'desc' },
    })
    return { data: partidos }
  })

  app.get('/publico/partidos/:id', async (request) => {
    const { id } = request.params as { id: string }
    const partido = await getPrisma().partido.findUnique({
      where: { id, publicada: true, OR: [{ torneoId: null }, { torneo: { visiblePublico: true } }] },
      include: { equipoLocal: { select: { nombre: true, escudoUrl: true } }, equipoVisitante: { select: { nombre: true, escudoUrl: true } } },
    })
    if (!partido) throw noEncontrado('Partido')
    return { data: partido }
  })
}
