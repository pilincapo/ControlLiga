import type { FastifyInstance } from 'fastify'
import { PERMISOS } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { badRequest, noEncontrado, prohibido } from '../http.js'
import { autenticar, getAuth, requierePermiso, requiereRolEnEquipo } from '../plugins/auth.js'
import { esMiembroEquipo, esSuperadmin, puedeEnEquipo } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'
import { EstadoEquipoJugador } from '../generated/prisma/enums.js'
import type { ContextoAuth } from '../auth/contexto.js'
import type { PrismaClient } from '../generated/prisma/client.js'
import { notificarJugadoresVinculados } from '../notificaciones/servicio.js'

interface JugadorBody {
  equipoJugadorId: string
  orden?: number
}

interface CrearBody {
  fecha: string
  fechaLimite?: string
  lugar?: string
  hora?: string
  notas?: string
  partidoId?: string
  jugadores?: JugadorBody[]
}

interface ModificarBody {
  fecha?: string
  fechaLimite?: string
  lugar?: string
  hora?: string
  notas?: string
  jugadores?: JugadorBody[]
}

interface ResponderBody {
  estado: 'CONFIRMADO' | 'NO_DISPONIBLE'
  nota?: string
}

interface CambiarEstadoBody {
  estado: string
}

async function validarJugadores(
  prisma: PrismaClient,
  equipoId: string,
  jugadores: JugadorBody[] | undefined,
): Promise<Array<{ equipoJugadorId: string; orden: number }>> {
  if (!jugadores || jugadores.length === 0) return []
  const vistos = new Set<string>()
  const resultado: Array<{ equipoJugadorId: string; orden: number }> = []
  for (const [i, j] of jugadores.entries()) {
    if (!j.equipoJugadorId) throw badRequest('Cada jugador requiere equipoJugadorId')
    if (vistos.has(j.equipoJugadorId)) throw badRequest('Un jugador no puede convocarse dos veces')
    vistos.add(j.equipoJugadorId)
    const ej = await prisma.equipoJugador.findFirst({ where: { id: j.equipoJugadorId, equipoId }, select: { id: true, estado: true } })
    if (!ej) throw badRequest('Un jugador de la convocatoria no pertenece al equipo')
    if (ej.estado === EstadoEquipoJugador.BAJA || ej.estado === EstadoEquipoJugador.INVITADO) {
      throw badRequest('Un jugador dado de baja o sin confirmar no puede ser convocado')
    }
    resultado.push({ equipoJugadorId: j.equipoJugadorId, orden: j.orden ?? i + 1 })
  }
  return resultado
}

async function validarPartido(prisma: PrismaClient, partidoId: string, equipoId: string): Promise<void> {
  const partido = await prisma.partido.findUnique({ where: { id: partidoId }, select: { equipoResponsableId: true, equipoLocalId: true, equipoVisitanteId: true } })
  if (!partido) throw noEncontrado('Partido')
  if (partido.equipoResponsableId !== equipoId && partido.equipoLocalId !== equipoId && partido.equipoVisitanteId !== equipoId) {
    throw badRequest('El partido no involucra al equipo')
  }
}

async function cargarConvocatoria(id: string) {
  return getPrisma().convocatoria.findUnique({ where: { id }, select: { id: true, equipoId: true, cancelada: true, publicada: true } })
}

async function puedeGestionar(prisma: PrismaClient, auth: ContextoAuth, equipoId: string): Promise<boolean> {
  return esSuperadmin(auth) || (await puedeEnEquipo(prisma, auth, equipoId, 'DELEGADO', 'TECNICO'))
}

async function puedeVer(prisma: PrismaClient, auth: ContextoAuth, conv: { equipoId: string; publicada: boolean; cancelada: boolean }): Promise<boolean> {
  if (conv.cancelada && !conv.publicada) return esSuperadmin(auth)
  if (conv.publicada && !conv.cancelada) return true
  if (esSuperadmin(auth)) return true
  if (await esMiembroEquipo(prisma, auth, conv.equipoId)) return true
  if (auth.jugadorId) {
    const p = await prisma.equipoJugador.findFirst({ where: { jugadorId: auth.jugadorId, equipoId: conv.equipoId, estado: { not: EstadoEquipoJugador.BAJA } }, select: { id: true } })
    if (p) return true
  }
  return false
}

export async function convocatoriasRoutes(app: FastifyInstance): Promise<void> {
  app.get('/equipos/:id/convocatorias', { preHandler: autenticar }, async (request, reply) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const miembro = await esMiembroEquipo(prisma, auth, id)
    let jugador = false
    if (!miembro && auth.jugadorId) {
      const p = await prisma.equipoJugador.findFirst({ where: { jugadorId: auth.jugadorId, equipoId: id, estado: { not: EstadoEquipoJugador.BAJA } }, select: { id: true } })
      jugador = p !== null
    }
    if (!miembro && !jugador && !esSuperadmin(auth)) {
      return reply.status(403).send(prohibido('No tenés acceso a las convocatorias de ese equipo'))
    }
    const todas = (request.query as { todas?: string }).todas === 'true'
    const where = todas ? { equipoId: id } : { equipoId: id, cancelada: false }
    const convocatorias = await prisma.convocatoria.findMany({
      where,
      orderBy: { fecha: 'desc' },
      select: { id: true, fecha: true, lugar: true, hora: true, cancelada: true, publicada: true, partidoId: true, _count: { select: { jugadores: true } } },
    })
    return { data: convocatorias }
  })

  app.post('/equipos/:id/convocatorias', { preHandler: requiereRolEnEquipo('DELEGADO', 'TECNICO') }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as CrearBody
    const prisma = getPrisma()
    if (!body.fecha || Number.isNaN(Date.parse(body.fecha))) throw badRequest('La fecha es obligatoria')
    const jugadores = await validarJugadores(prisma, id, body.jugadores)
    if (body.partidoId) await validarPartido(prisma, body.partidoId, id)

    const convocatoria = await prisma.$transaction(async (tx) => {
      const creada = await tx.convocatoria.create({
        data: {
          equipoId: id,
          partidoId: body.partidoId ?? null,
          fecha: new Date(body.fecha),
          fechaLimite: body.fechaLimite ? new Date(body.fechaLimite) : null,
          lugar: body.lugar?.trim() || null,
          hora: body.hora?.trim() || null,
          notas: body.notas?.trim() || null,
          creadoPorId: auth.usuarioId,
          jugadores: { create: jugadores },
        },
      })
      return creada
    })
    const convocados = await prisma.equipoJugador.findMany({
      where: { id: { in: jugadores.map((j) => j.equipoJugadorId) } },
      select: { jugadorId: true },
    })
    if (convocados.length > 0) {
      await notificarJugadoresVinculados(
        prisma,
        convocados.map((c) => c.jugadorId),
        {
          tipo: 'CONVOCATORIA',
          titulo: 'Nueva convocatoria',
          mensaje: `Fuiste convocado para el ${new Date(body.fecha).toLocaleDateString('es-AR')}`,
          entidadTipo: 'Convocatoria',
          entidadId: convocatoria.id,
        },
        auth.usuarioId,
      )
    }
    await auditar(prisma, { entidad: 'Convocatoria', entidadId: convocatoria.id, accion: 'CREATE', usuarioId: auth.usuarioId, cambios: { equipoId: id, fecha: body.fecha, partidoId: body.partidoId ?? null } })
    return { data: convocatoria }
  })

  app.get('/convocatorias/:id', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const conv = await prisma.convocatoria.findUnique({
      where: { id },
      include: {
        equipo: { select: { id: true, nombre: true, escudoUrl: true } },
        partido: { select: { id: true, tipo: true, fechaHora: true, lugar: true, equipoLocalId: true, equipoVisitanteId: true } },
        jugadores: { include: { equipoJugador: { include: { jugador: { include: { persona: { select: { nombre: true, apellido: true } } } } } } }, orderBy: { orden: 'asc' } },
      },
    })
    if (!conv) throw noEncontrado('Convocatoria')
    if (!(await puedeVer(prisma, auth, conv))) throw prohibido('No tenés acceso a esa convocatoria')
    return {
      data: {
        ...conv,
        jugadores: conv.jugadores.map((j) => ({
          id: j.id,
          equipoJugadorId: j.equipoJugadorId,
          jugadorId: j.equipoJugador.jugadorId,
          nombre: `${j.equipoJugador.jugador.persona.nombre} ${j.equipoJugador.jugador.persona.apellido}`,
          dorsal: j.equipoJugador.dorsal,
          estado: j.estado,
          orden: j.orden,
          nota: j.nota,
          respondioEn: j.respondioEn,
        })),
      },
    }
  })

  app.patch('/convocatorias/:id', { preHandler: requierePermiso(PERMISOS.convocatoriasGestionar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as ModificarBody
    const prisma = getPrisma()
    const conv = await cargarConvocatoria(id)
    if (!conv) throw noEncontrado('Convocatoria')
    if (conv.cancelada) throw badRequest('No se puede editar una convocatoria cancelada')
    if (!(await puedeGestionar(prisma, auth, conv.equipoId))) throw prohibido('No tenés permiso para modificar esa convocatoria')

    const jugadores = body.jugadores !== undefined ? await validarJugadores(prisma, conv.equipoId, body.jugadores) : null

    const actualizada = await prisma.$transaction(async (tx) => {
      if (jugadores !== null) {
        await tx.convocatoriaJugador.deleteMany({ where: { convocatoriaId: id } })
        await tx.convocatoriaJugador.createMany({ data: jugadores.map((j) => ({ convocatoriaId: id, ...j })) })
      }
      return tx.convocatoria.update({
        where: { id },
        data: {
          fecha: body.fecha ? new Date(body.fecha) : undefined,
          fechaLimite: body.fechaLimite !== undefined ? (body.fechaLimite ? new Date(body.fechaLimite) : null) : undefined,
          lugar: body.lugar !== undefined ? body.lugar.trim() || null : undefined,
          hora: body.hora !== undefined ? body.hora.trim() || null : undefined,
          notas: body.notas !== undefined ? body.notas.trim() || null : undefined,
        },
      })
    })
    await auditar(prisma, { entidad: 'Convocatoria', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { campos: Object.keys(body) } })
    return { data: actualizada }
  })

  app.delete('/convocatorias/:id', { preHandler: requierePermiso(PERMISOS.convocatoriasGestionar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const conv = await cargarConvocatoria(id)
    if (!conv) throw noEncontrado('Convocatoria')
    if (!(await puedeGestionar(prisma, auth, conv.equipoId))) throw prohibido('No tenés permiso para cancelar esa convocatoria')
    const actualizada = await prisma.convocatoria.update({ where: { id }, data: { cancelada: true }, select: { id: true, cancelada: true } })
    await auditar(prisma, { entidad: 'Convocatoria', entidadId: id, accion: 'DELETE', usuarioId: auth.usuarioId, cambios: { cancelada: true } })
    return { data: actualizada }
  })

  app.post('/convocatorias/:id/publicar', { preHandler: requierePermiso(PERMISOS.convocatoriasGestionar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const conv = await cargarConvocatoria(id)
    if (!conv) throw noEncontrado('Convocatoria')
    if (!(await puedeGestionar(prisma, auth, conv.equipoId))) throw prohibido('No tenés permiso para publicar esa convocatoria')
    const res = await prisma.convocatoria.update({ where: { id }, data: { publicada: true }, select: { id: true, publicada: true } })
    const convocados = await prisma.convocatoriaJugador.findMany({
      where: { convocatoriaId: id },
      select: { equipoJugador: { select: { jugadorId: true } } },
    })
    if (convocados.length > 0) {
      await notificarJugadoresVinculados(
        prisma,
        convocados.map((c) => c.equipoJugador.jugadorId),
        {
          tipo: 'CONVOCATORIA',
          titulo: 'Convocatoria publicada',
          mensaje: 'Una convocatoria en la que participás fue publicada',
          entidadTipo: 'Convocatoria',
          entidadId: id,
        },
        auth.usuarioId,
      )
    }
    await auditar(prisma, { entidad: 'Convocatoria', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { publicada: true } })
    return { data: res }
  })

  app.post('/convocatorias/:id/despublicar', { preHandler: requierePermiso(PERMISOS.convocatoriasGestionar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const conv = await cargarConvocatoria(id)
    if (!conv) throw noEncontrado('Convocatoria')
    if (!(await puedeGestionar(prisma, auth, conv.equipoId))) throw prohibido('No tenés permiso para despublicar esa convocatoria')
    const res = await prisma.convocatoria.update({ where: { id }, data: { publicada: false }, select: { id: true, publicada: true } })
    await auditar(prisma, { entidad: 'Convocatoria', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { publicada: false } })
    return { data: res }
  })

  app.patch('/convocatorias-jugador/:id/responder', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as ResponderBody
    const prisma = getPrisma()
    if (body.estado !== 'CONFIRMADO' && body.estado !== 'NO_DISPONIBLE') throw badRequest('El estado debe ser CONFIRMADO o NO_DISPONIBLE')
    const cj = await prisma.convocatoriaJugador.findUnique({
      where: { id },
      include: { equipoJugador: { select: { jugadorId: true } }, convocatoria: { select: { cancelada: true } } },
    })
    if (!cj) throw noEncontrado('Jugador convocado')
    if (cj.convocatoria.cancelada) throw badRequest('La convocatoria fue cancelada')
    if (cj.equipoJugador.jugadorId !== auth.jugadorId) throw prohibido('Solo podés responder tu propia convocatoria')
    if (cj.estado === 'AUSENTE') throw badRequest('No se puede responder una convocatoria donde ya fuiste marcado como ausente')
    const actualizado = await prisma.convocatoriaJugador.update({ where: { id }, data: { estado: body.estado, nota: body.nota?.trim() || null, respondioEn: new Date() }, select: { id: true, estado: true, respondioEn: true } })
    await auditar(prisma, { entidad: 'ConvocatoriaJugador', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { estado: body.estado } })
    return { data: actualizado }
  })

  app.patch('/convocatorias-jugador/:id/estado', { preHandler: requierePermiso(PERMISOS.convocatoriasGestionar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as CambiarEstadoBody
    const prisma = getPrisma()
    const cj = await prisma.convocatoriaJugador.findUnique({
      where: { id },
      include: { convocatoria: { select: { equipoId: true } } },
    })
    if (!cj) throw noEncontrado('Jugador convocado')
    if (!(await puedeGestionar(prisma, auth, cj.convocatoria.equipoId))) throw prohibido('No tenés permiso para modificar ese estado')
    const estados = ['PENDIENTE', 'CONFIRMADO', 'NO_DISPONIBLE', 'AUSENTE']
    if (!estados.includes(body.estado)) throw badRequest('Estado inválido')
    const actualizado = await prisma.convocatoriaJugador.update({ where: { id }, data: { estado: body.estado as never }, select: { id: true, estado: true } })
    await auditar(prisma, { entidad: 'ConvocatoriaJugador', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { estado: body.estado } })
    return { data: actualizado }
  })

  app.get('/publico/convocatorias', async () => {
    const convocatorias = await getPrisma().convocatoria.findMany({
      where: { publicada: true, cancelada: false, equipo: { privado: false }, OR: [{ partidoId: null }, { partido: { publicada: true, equipoLocal: { privado: false }, equipoVisitante: { privado: false }, OR: [{ torneoId: null }, { torneo: { visiblePublico: true } }] } }] },
      orderBy: { fecha: 'desc' },
       select: { id: true, fecha: true, lugar: true, hora: true, equipo: { select: { id: true, nombre: true, escudoUrl: true, configuracionPublica: true } }, _count: { select: { jugadores: true } } },
    })
    return { data: convocatorias }
  })

  app.get('/publico/convocatorias/:id', async (request) => {
    const { id } = request.params as { id: string }
    const conv = await getPrisma().convocatoria.findUnique({
      where: { id, publicada: true, cancelada: false, equipo: { privado: false }, OR: [{ partidoId: null }, { partido: { publicada: true, equipoLocal: { privado: false }, equipoVisitante: { privado: false }, OR: [{ torneoId: null }, { torneo: { visiblePublico: true } }] } }] },
      include: {
         equipo: { select: { id: true, nombre: true, escudoUrl: true, configuracionPublica: true } },
        jugadores: { include: { equipoJugador: { select: { dorsal: true, jugador: { include: { persona: { select: { nombre: true, apellido: true } } } } } } }, orderBy: { orden: 'asc' } },
      },
    })
    if (!conv) throw noEncontrado('Convocatoria')
    return {
      data: {
        id: conv.id, fecha: conv.fecha, lugar: conv.lugar, hora: conv.hora, equipo: conv.equipo,
        jugadores: conv.jugadores.map((j) => ({
          nombre: `${j.equipoJugador.jugador.persona.nombre} ${j.equipoJugador.jugador.persona.apellido}`,
          dorsal: j.equipoJugador.dorsal,
          estado: j.estado,
        })),
      },
    }
  })
}
