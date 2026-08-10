import type { FastifyInstance } from 'fastify'
import { PERMISOS } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { badRequest, conflicto, noEncontrado, prohibido } from '../http.js'
import { autenticar, getAuth, requierePermiso } from '../plugins/auth.js'
import { esAdminDeTorneo, esMiembroEquipo, puedeVerTorneo } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'
import type { ContextoAuth } from '../auth/contexto.js'
import type { PrismaClient } from '../generated/prisma/client.js'

interface AgregarJugadorBody {
  jugadorId: string
  dorsal?: number
}

interface ModificarJugadorBody {
  dorsal?: number
}

async function cargarParticipacionConTorneo(id: string) {
  const prisma = getPrisma()
  const participacion = await prisma.equipoParticipacion.findUnique({
    where: { id },
    select: { id: true, torneoId: true, equipoId: true },
  })
  return participacion
}

async function puedeGestionar(
  prisma: PrismaClient,
  auth: ContextoAuth,
  participacion: { torneoId: string; equipoId: string },
): Promise<boolean> {
  if (await esAdminDeTorneo(prisma, auth, participacion.torneoId)) {
    return true
  }
  return esMiembroEquipo(prisma, auth, participacion.equipoId)
}

export async function jugadorParticipacionesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/participaciones/:id/jugadores', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const participacion = await cargarParticipacionConTorneo(id)
    if (!participacion) {
      throw noEncontrado('Participación')
    }
    if (!(await puedeVerTorneo(prisma, auth, participacion.torneoId))) {
      throw prohibido('No tenés acceso a esa participación')
    }
    const jugadores = await prisma.jugadorParticipacion.findMany({
      where: { equipoParticipacionId: id },
      orderBy: [{ activo: 'desc' }, { fechaAlta: 'asc' }],
      include: {
        jugador: { include: { persona: { select: { id: true, nombre: true, apellido: true } } } },
      },
    })
    return { data: jugadores }
  })

  app.post('/participaciones/:id/jugadores', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as AgregarJugadorBody
    const prisma = getPrisma()
    const participacion = await cargarParticipacionConTorneo(id)
    if (!participacion) {
      throw noEncontrado('Participación')
    }
    if (!(await puedeGestionar(prisma, auth, participacion))) {
      throw prohibido('No tenés permiso para administrar la plantilla de esa participación')
    }
    if (!body.jugadorId) {
      throw badRequest('El jugador es obligatorio')
    }
    const jugador = await prisma.jugador.findUnique({ where: { id: body.jugadorId }, select: { id: true } })
    if (!jugador) {
      throw noEncontrado('Jugador')
    }
    const pertenece = await prisma.equipoJugador.findFirst({
      where: { jugadorId: body.jugadorId, equipoId: participacion.equipoId, activo: true },
      select: { id: true },
    })
    if (!pertenece) {
      throw badRequest('El jugador no pertenece al equipo de la participación')
    }

    const creado = await prisma.$transaction(async (tx) => {
      const existente = await tx.jugadorParticipacion.findUnique({
        where: { jugadorId_equipoParticipacionId: { jugadorId: body.jugadorId, equipoParticipacionId: id } },
        select: { id: true, activo: true },
      })
      if (existente && existente.activo) {
        throw conflicto('jugador_participando', 'El jugador ya participa en esta competición')
      }
      if (existente && !existente.activo) {
        return tx.jugadorParticipacion.update({
          where: { id: existente.id },
          data: { activo: true, fechaBaja: null, dorsal: body.dorsal ?? null },
        })
      }
      return tx.jugadorParticipacion.create({
        data: {
          equipoParticipacionId: id,
          jugadorId: body.jugadorId,
          dorsal: body.dorsal ?? null,
        },
      })
    })

    await auditar(prisma, {
      entidad: 'JugadorParticipacion',
      entidadId: creado.id,
      accion: 'CREATE',
      usuarioId: auth.usuarioId,
      cambios: { jugadorId: body.jugadorId, equipoParticipacionId: id },
    })
    return { data: creado }
  })

  app.patch('/jugador-participaciones/:id', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as ModificarJugadorBody
    const prisma = getPrisma()
    const jp = await prisma.jugadorParticipacion.findUnique({
      where: { id },
      select: { id: true, equipoParticipacion: { select: { torneoId: true, equipoId: true } } },
    })
    if (!jp) {
      throw noEncontrado('Participación de jugador')
    }
    if (!(await puedeGestionar(prisma, auth, jp.equipoParticipacion))) {
      throw prohibido('No tenés permiso para administrar esa participación de jugador')
    }
    const actualizado = await prisma.jugadorParticipacion.update({
      where: { id },
      data: { dorsal: body.dorsal !== undefined ? body.dorsal : undefined },
    })
    await auditar(prisma, {
      entidad: 'JugadorParticipacion',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { campos: Object.keys(body) },
    })
    return { data: actualizado }
  })

  app.post('/jugador-participaciones/:id/baja', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const jp = await prisma.jugadorParticipacion.findUnique({
      where: { id },
      select: { id: true, activo: true, equipoParticipacion: { select: { torneoId: true, equipoId: true } } },
    })
    if (!jp) {
      throw noEncontrado('Participación de jugador')
    }
    if (!(await puedeGestionar(prisma, auth, jp.equipoParticipacion))) {
      throw prohibido('No tenés permiso para administrar esa participación de jugador')
    }
    if (!jp.activo) {
      throw conflicto('estado_invalido', 'El jugador ya está dado de baja')
    }
    const actualizado = await prisma.jugadorParticipacion.update({
      where: { id },
      data: { activo: false, fechaBaja: new Date() },
      select: { id: true, activo: true, fechaBaja: true },
    })
    await auditar(prisma, {
      entidad: 'JugadorParticipacion',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { baja: true },
    })
    return { data: actualizado }
  })
}
