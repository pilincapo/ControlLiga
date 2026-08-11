import type { FastifyInstance } from 'fastify'
import { PERMISOS } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { badRequest, conflicto, noEncontrado, prohibido } from '../http.js'
import { autenticar, getAuth, requierePermiso } from '../plugins/auth.js'
import { esAdminDeTorneo, esMiembroEquipo, puedeVerTorneo } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'
import { EstadoParticipacion } from '../generated/prisma/enums.js'
import type { Prisma } from '../generated/prisma/client.js'
import { notificarAdminsTorneo, notificarDelegadosEquipos, notificarUsuarios } from '../notificaciones/servicio.js'

const ESTADOS_ACTIVOS: EstadoParticipacion[] = [
  EstadoParticipacion.PENDIENTE,
  EstadoParticipacion.INSCRIPTO,
  EstadoParticipacion.CONFIRMADO,
]

interface CrearParticipacionBody {
  equipoId: string
  torneoCategoriaId?: string
  zonaId?: string
}

interface AceptacionBody {
  aceptar: boolean
}

interface AsignarBody {
  torneoCategoriaId?: string
  zonaId?: string
}

async function verificarParticipacionUnica(
  prisma: Prisma.TransactionClient,
  torneoId: string,
  temporadaId: string,
  equipoId: string,
): Promise<void> {
  const existente = await prisma.equipoParticipacion.findFirst({
    where: { torneoId, temporadaId, equipoId, estado: { in: ESTADOS_ACTIVOS } },
    select: { id: true },
  })
  if (existente) {
    throw conflicto('participacion_activa', 'El equipo ya tiene una participación activa en esta temporada')
  }
}

async function validarCategoriaYZona(
  prisma: Prisma.TransactionClient,
  torneoId: string,
  temporadaId: string,
  categoriaId?: string,
  zonaId?: string,
): Promise<{ torneoCategoriaId: string | null; zonaId: string | null }> {
  let torneoCategoriaId = categoriaId ?? null

  if (zonaId) {
    const zona = await prisma.zona.findUnique({ where: { id: zonaId }, select: { torneoCategoriaId: true } })
    if (!zona) {
      throw noEncontrado('Zona')
    }
    if (torneoCategoriaId !== null && torneoCategoriaId !== zona.torneoCategoriaId) {
      throw badRequest('La zona no pertenece a la categoría indicada')
    }
    torneoCategoriaId = zona.torneoCategoriaId
  }

  if (torneoCategoriaId !== null) {
    const tc = await prisma.torneoCategoria.findUnique({
      where: { id: torneoCategoriaId },
      select: { torneoId: true, temporadaId: true },
    })
    if (!tc || tc.torneoId !== torneoId || tc.temporadaId !== temporadaId) {
      throw badRequest('La categoría no corresponde a la temporada indicada')
    }
  }

  return { torneoCategoriaId, zonaId: zonaId ?? null }
}

async function cargarParticipacion(id: string) {
  const prisma = getPrisma()
  const participacion = await prisma.equipoParticipacion.findUnique({
    where: { id },
    select: { id: true, torneoId: true, temporadaId: true, equipoId: true, estado: true, torneoCategoriaId: true, zonaId: true, invitadoPorId: true },
  })
  return participacion
}

async function puedeGestionarParticipacion(
  prisma: import('../generated/prisma/client.js').PrismaClient,
  auth: import('../auth/contexto.js').ContextoAuth,
  participacion: { torneoId: string; equipoId: string },
): Promise<boolean> {
  if (await esAdminDeTorneo(prisma, auth, participacion.torneoId)) {
    return true
  }
  return esMiembroEquipo(prisma, auth, participacion.equipoId)
}

export async function participacionesRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/torneos/:torneoId/temporadas/:temporadaId/participaciones/invitar',
    { preHandler: requierePermiso(PERMISOS.torneosAdministrar) },
    async (request) => {
      const auth = getAuth(request)
      const { torneoId, temporadaId } = request.params as { torneoId: string; temporadaId: string }
      const body = request.body as CrearParticipacionBody
      const prisma = getPrisma()
      if (!(await esAdminDeTorneo(prisma, auth, torneoId))) {
        throw prohibido('No tenés permiso para administrar ese torneo')
      }
      if (!body.equipoId) {
        throw badRequest('El equipo es obligatorio')
      }
      const temporada = await prisma.temporada.findUnique({
        where: { id: temporadaId },
        select: { id: true, torneoId: true },
      })
      if (!temporada || temporada.torneoId !== torneoId) {
        throw noEncontrado('Temporada')
      }
      const torneo = await prisma.torneo.findUnique({ where: { id: torneoId }, select: { nombre: true } })
      const equipo = await prisma.equipo.findUnique({ where: { id: body.equipoId }, select: { id: true, nombre: true } })
      if (!equipo) {
        throw noEncontrado('Equipo')
      }
      const { torneoCategoriaId, zonaId } = await validarCategoriaYZona(
        prisma,
        torneoId,
        temporadaId,
        body.torneoCategoriaId,
        body.zonaId,
      )

      const participacion = await prisma.$transaction(async (tx) => {
        await verificarParticipacionUnica(tx, torneoId, temporadaId, body.equipoId)
        return tx.equipoParticipacion.create({
          data: {
            torneoId,
            temporadaId,
            equipoId: body.equipoId,
            torneoCategoriaId,
            zonaId,
            estado: EstadoParticipacion.PENDIENTE,
            invitadoPorId: auth.usuarioId,
          },
        })
      })

      await notificarDelegadosEquipos(
        prisma,
        [body.equipoId],
        {
          tipo: 'INVITACION_TORNEO',
          titulo: 'Invitación a torneo',
          mensaje: `El torneo ${torneo?.nombre ?? ''} invitó a ${equipo.nombre} a participar`,
          entidadTipo: 'EquipoParticipacion',
          entidadId: participacion.id,
        },
        auth.usuarioId,
      )

      await auditar(prisma, {
        entidad: 'EquipoParticipacion',
        entidadId: participacion.id,
        accion: 'CREATE',
        usuarioId: auth.usuarioId,
        cambios: { tipo: 'invitacion', torneoId, temporadaId, equipoId: body.equipoId },
      })
      return { data: participacion }
    },
  )

  app.post(
    '/torneos/:torneoId/temporadas/:temporadaId/participaciones/solicitar',
    { preHandler: requierePermiso(PERMISOS.equiposInscribir) },
    async (request) => {
      const auth = getAuth(request)
      const { torneoId, temporadaId } = request.params as { torneoId: string; temporadaId: string }
      const body = request.body as CrearParticipacionBody
      const prisma = getPrisma()
      if (!body.equipoId) {
        throw badRequest('El equipo es obligatorio')
      }
      if (!(await esMiembroEquipo(prisma, auth, body.equipoId))) {
        throw prohibido('Solo un integrante del equipo puede solicitar su inscripción')
      }
      const temporada = await prisma.temporada.findUnique({
        where: { id: temporadaId },
        select: { id: true, torneoId: true },
      })
      if (!temporada || temporada.torneoId !== torneoId) {
        throw noEncontrado('Temporada')
      }
      const torneo = await prisma.torneo.findUnique({ where: { id: torneoId }, select: { nombre: true, organizacionId: true } })
      const equipo = await prisma.equipo.findUnique({ where: { id: body.equipoId }, select: { id: true, nombre: true } })
      if (!equipo) {
        throw noEncontrado('Equipo')
      }
      const { torneoCategoriaId, zonaId } = await validarCategoriaYZona(
        prisma,
        torneoId,
        temporadaId,
        body.torneoCategoriaId,
        body.zonaId,
      )

      const participacion = await prisma.$transaction(async (tx) => {
        await verificarParticipacionUnica(tx, torneoId, temporadaId, body.equipoId)
        return tx.equipoParticipacion.create({
          data: {
            torneoId,
            temporadaId,
            equipoId: body.equipoId,
            torneoCategoriaId,
            zonaId,
            estado: EstadoParticipacion.INSCRIPTO,
          },
        })
      })

      if (torneo) {
        await notificarAdminsTorneo(
          prisma,
          torneoId,
          torneo.organizacionId,
          {
            tipo: 'SOLICITUD_TORNEO',
            titulo: 'Solicitud de inscripción',
            mensaje: `El equipo ${equipo.nombre} solicitó inscribirse en ${torneo.nombre}`,
            entidadTipo: 'EquipoParticipacion',
            entidadId: participacion.id,
          },
          auth.usuarioId,
        )
      }

      await auditar(prisma, {
        entidad: 'EquipoParticipacion',
        entidadId: participacion.id,
        accion: 'CREATE',
        usuarioId: auth.usuarioId,
        cambios: { tipo: 'solicitud', torneoId, temporadaId, equipoId: body.equipoId },
      })
      return { data: participacion }
    },
  )

  app.post('/participaciones/:id/responder-invitacion', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as AceptacionBody
    const prisma = getPrisma()
    const participacion = await cargarParticipacion(id)
    if (!participacion) {
      throw noEncontrado('Participación')
    }
    if (!(await esMiembroEquipo(prisma, auth, participacion.equipoId))) {
      throw prohibido('Solo un integrante del equipo puede responder la invitación')
    }
    if (participacion.estado !== EstadoParticipacion.PENDIENTE) {
      throw conflicto('estado_invalido', 'La invitación ya fue respondida')
    }
    const equipo = await prisma.equipo.findUnique({ where: { id: participacion.equipoId }, select: { nombre: true } })
    const nuevoEstado = body.aceptar ? EstadoParticipacion.CONFIRMADO : EstadoParticipacion.RECHAZADO
    const actualizado = await prisma.equipoParticipacion.update({
      where: { id },
      data: { estado: nuevoEstado },
      select: { id: true, estado: true },
    })
    if (participacion.invitadoPorId) {
      await notificarUsuarios(
        prisma,
        [participacion.invitadoPorId],
        {
          tipo: 'RESPUESTA_INVITACION',
          titulo: 'Respuesta de invitación a torneo',
          mensaje: `${equipo?.nombre ?? ''} ${body.aceptar ? 'aceptó' : 'rechazó'} la invitación al torneo`,
          entidadTipo: 'EquipoParticipacion',
          entidadId: id,
        },
        auth.usuarioId,
      )
    }
    await auditar(prisma, {
      entidad: 'EquipoParticipacion',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { invitacionRespondida: body.aceptar ? 'CONFIRMADO' : 'RECHAZADO' },
    })
    return { data: actualizado }
  })

  app.post('/participaciones/:id/decidir-solicitud', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as AceptacionBody
    const prisma = getPrisma()
    const participacion = await cargarParticipacion(id)
    if (!participacion) {
      throw noEncontrado('Participación')
    }
    if (!(await esAdminDeTorneo(prisma, auth, participacion.torneoId))) {
      throw prohibido('No tenés permiso para administrar ese torneo')
    }
    if (participacion.estado !== EstadoParticipacion.INSCRIPTO) {
      throw conflicto('estado_invalido', 'No hay una solicitud pendiente para esta participación')
    }
    const equipo = await prisma.equipo.findUnique({ where: { id: participacion.equipoId }, select: { nombre: true } })
    const nuevoEstado = body.aceptar ? EstadoParticipacion.CONFIRMADO : EstadoParticipacion.RECHAZADO
    const actualizado = await prisma.equipoParticipacion.update({
      where: { id },
      data: { estado: nuevoEstado },
      select: { id: true, estado: true },
    })
    await notificarDelegadosEquipos(
      prisma,
      [participacion.equipoId],
      {
        tipo: 'RESPUESTA_INVITACION',
        titulo: 'Solicitud de inscripción decidida',
        mensaje: `La solicitud de ${equipo?.nombre ?? ''} fue ${body.aceptar ? 'aceptada' : 'rechazada'}`,
        entidadTipo: 'EquipoParticipacion',
        entidadId: id,
      },
      auth.usuarioId,
    )
    await auditar(prisma, {
      entidad: 'EquipoParticipacion',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { solicitudDecidida: body.aceptar ? 'CONFIRMADO' : 'RECHAZADO' },
    })
    return { data: actualizado }
  })

  app.post('/participaciones/:id/baja', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const participacion = await cargarParticipacion(id)
    if (!participacion) {
      throw noEncontrado('Participación')
    }
    if (!(await puedeGestionarParticipacion(prisma, auth, participacion))) {
      throw prohibido('No tenés permiso para retirar esa participación')
    }
    if (!ESTADOS_ACTIVOS.includes(participacion.estado)) {
      throw conflicto('estado_invalido', 'La participación ya no está activa')
    }
    const actualizado = await prisma.equipoParticipacion.update({
      where: { id },
      data: { estado: EstadoParticipacion.BAJA, fechaBaja: new Date() },
      select: { id: true, estado: true, fechaBaja: true },
    })
    await auditar(prisma, {
      entidad: 'EquipoParticipacion',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { baja: true, equipoId: participacion.equipoId },
    })
    return { data: actualizado }
  })

  app.patch('/participaciones/:id', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as AsignarBody
    const prisma = getPrisma()
    const participacion = await cargarParticipacion(id)
    if (!participacion) {
      throw noEncontrado('Participación')
    }
    if (!(await esAdminDeTorneo(prisma, auth, participacion.torneoId))) {
      throw prohibido('No tenés permiso para administrar ese torneo')
    }
    if (participacion.estado === EstadoParticipacion.BAJA || participacion.estado === EstadoParticipacion.RECHAZADO) {
      throw conflicto('estado_invalido', 'No se puede asignar categoría o zona a una participación retirada')
    }
    const { torneoCategoriaId, zonaId } = await validarCategoriaYZona(
      prisma,
      participacion.torneoId,
      participacion.temporadaId,
      body.torneoCategoriaId !== undefined ? body.torneoCategoriaId : participacion.torneoCategoriaId ?? undefined,
      body.zonaId !== undefined ? body.zonaId : participacion.zonaId ?? undefined,
    )
    const actualizado = await prisma.equipoParticipacion.update({
      where: { id },
      data: { torneoCategoriaId, zonaId },
      select: { id: true, torneoCategoriaId: true, zonaId: true },
    })
    await auditar(prisma, {
      entidad: 'EquipoParticipacion',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { campos: Object.keys(body) },
    })
    return { data: actualizado }
  })

  app.get('/participaciones/:id', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const participacion = await prisma.equipoParticipacion.findUnique({
      where: { id },
      include: {
        equipo: { select: { id: true, nombre: true, escudoUrl: true } },
        torneo: { select: { id: true, nombre: true } },
        temporada: { select: { id: true, nombre: true } },
        torneoCategoria: { include: { categoria: true } },
        zona: { select: { id: true, nombre: true } },
        jugadores: { include: { jugador: { include: { persona: true } } }, orderBy: { fechaAlta: 'asc' } },
      },
    })
    if (!participacion) {
      throw noEncontrado('Participación')
    }
    if (!(await puedeVerTorneo(prisma, auth, participacion.torneoId))) {
      throw prohibido('No tenés acceso a esa participación')
    }
    return { data: participacion }
  })
}
