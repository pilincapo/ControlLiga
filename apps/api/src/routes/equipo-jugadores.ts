import type { FastifyInstance } from 'fastify'
import { ESTADOS_EQUIPO_JUGADOR, PERMISOS } from '@controlliga/shared'
import type { EstadoEquipoJugador } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { badRequest, conflicto, noEncontrado, prohibido } from '../http.js'
import { getAuth, requiereAccesoEquipo, requierePermiso, requiereRolEnEquipo } from '../plugins/auth.js'
import { puedeEnEquipo } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'
import { EstadoEquipoJugador as EstadoEquipoJugadorEnum } from '../generated/prisma/enums.js'
import type { ContextoAuth } from '../auth/contexto.js'
import type { PrismaClient } from '../generated/prisma/client.js'

interface PersonaBody {
  nombre: string
  apellido: string
  dni?: string
  fechaNacimiento?: string
  email?: string
  telefono?: string
  fotoUrl?: string
  sexo?: string
}

interface IncorporarBody {
  persona?: PersonaBody
  jugadorId?: string
  dorsal?: number
  posiciones?: string
  observaciones?: string
}

interface ModificarPlantelBody {
  dorsal?: number
  posiciones?: string
  observaciones?: string
}

interface CambiarEstadoBody {
  estado: EstadoEquipoJugador
}

const ESTADOS_MANUALES = ['ACTIVO', 'INACTIVO', 'LESIONADO', 'SUSPENDIDO', 'INVITADO'] as const

async function cargarEjConEquipo(id: string) {
  const prisma = getPrisma()
  const ej = await prisma.equipoJugador.findUnique({
    where: { id },
    select: { id: true, equipoId: true, estado: true },
  })
  return ej
}

async function puedeGestionarPlantel(
  prisma: PrismaClient,
  auth: ContextoAuth,
  equipoId: string,
): Promise<boolean> {
  return puedeEnEquipo(prisma, auth, equipoId, 'DELEGADO', 'TECNICO')
}

export async function equipoJugadoresRoutes(app: FastifyInstance): Promise<void> {
  app.get('/equipos/:id/jugadores', { preHandler: requiereAccesoEquipo }, async (request) => {
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const jugadores = await prisma.equipoJugador.findMany({
      where: { equipoId: id },
      orderBy: [{ estado: 'asc' }, { fechaIngreso: 'asc' }],
      include: {
        jugador: { include: { persona: { select: { id: true, nombre: true, apellido: true, dni: true, fotoUrl: true } } } },
      },
    })
    return {
      data: jugadores.map((ej) => ({
        id: ej.id,
        jugadorId: ej.jugadorId,
        nombre: `${ej.jugador.persona.nombre} ${ej.jugador.persona.apellido}`,
        dni: ej.jugador.persona.dni,
        fotoUrl: ej.jugador.persona.fotoUrl,
        dorsal: ej.dorsal,
        posiciones: ej.posiciones,
        estado: ej.estado,
        fechaIngreso: ej.fechaIngreso,
        fechaSalida: ej.fechaSalida,
        motivoBaja: ej.motivoBaja,
        observaciones: ej.observaciones,
      })),
    }
  })

  app.post('/equipos/:id/jugadores', { preHandler: requiereRolEnEquipo('DELEGADO', 'TECNICO') }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as IncorporarBody
    const prisma = getPrisma()
    const tienePersona = body.persona !== undefined
    const tieneJugador = Boolean(body.jugadorId)
    if (tienePersona === tieneJugador) {
      throw badRequest('Se debe indicar la persona nueva o el jugador existente')
    }

    const equipo = await prisma.equipo.findUnique({ where: { id }, select: { id: true } })
    if (!equipo) {
      throw noEncontrado('Equipo')
    }

    let jugadorId: string
    if (tienePersona) {
      const persona = body.persona as PersonaBody
      const nombre = persona.nombre?.trim()
      const apellido = persona.apellido?.trim()
      if (!nombre || nombre.length < 2 || !apellido || apellido.length < 2) {
        throw badRequest('Nombre y apellido son obligatorios')
      }
      if (persona.dni?.trim()) {
        const existente = await prisma.persona.findUnique({ where: { dni: persona.dni.trim() }, select: { id: true } })
        if (existente) {
          throw conflicto('persona_duplicada', 'Ya existe una persona con ese DNI')
        }
      }
      const creado = await prisma.$transaction(async (tx) => {
        const p = await tx.persona.create({
          data: {
            nombre,
            apellido,
            dni: persona.dni?.trim() || null,
            fechaNacimiento: persona.fechaNacimiento ? new Date(persona.fechaNacimiento) : null,
            email: persona.email?.trim() || null,
            telefono: persona.telefono?.trim() || null,
            fotoUrl: persona.fotoUrl?.trim() || null,
            sexo: persona.sexo?.trim() || null,
          },
        })
        const j = await tx.jugador.create({ data: { personaId: p.id } })
        return { persona: p, jugador: j }
      })
      jugadorId = creado.jugador.id
      await auditar(prisma, {
        entidad: 'Jugador',
        entidadId: jugadorId,
        accion: 'CREATE',
        usuarioId: auth.usuarioId,
        cambios: { nombre, apellido, equipoId: id },
      })
    } else {
      const jugador = await prisma.jugador.findUnique({ where: { id: body.jugadorId }, select: { id: true } })
      if (!jugador) {
        throw noEncontrado('Jugador')
      }
      jugadorId = jugador.id
      const existente = await prisma.equipoJugador.findFirst({
        where: { equipoId: id, jugadorId, estado: { not: EstadoEquipoJugadorEnum.BAJA } },
        select: { id: true },
      })
      if (existente) {
        throw conflicto('jugador_en_equipo', 'El jugador ya pertenece al equipo')
      }
    }

    const pertenencia = await prisma.equipoJugador.create({
      data: {
        equipoId: id,
        jugadorId,
        dorsal: body.dorsal ?? null,
        posiciones: body.posiciones?.trim() || null,
        observaciones: body.observaciones?.trim() || null,
      },
    })
    await auditar(prisma, {
      entidad: 'EquipoJugador',
      entidadId: pertenencia.id,
      accion: 'CREATE',
      usuarioId: auth.usuarioId,
      cambios: { equipoId: id, jugadorId, dorsal: body.dorsal ?? null },
    })
    return { data: pertenencia }
  })

  app.patch('/equipo-jugadores/:id', { preHandler: requierePermiso(PERMISOS.jugadoresGestionar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as ModificarPlantelBody
    const prisma = getPrisma()
    const ej = await cargarEjConEquipo(id)
    if (!ej) {
      throw noEncontrado('Pertenencia')
    }
    if (!(await puedeGestionarPlantel(prisma, auth, ej.equipoId))) {
      throw prohibido('No tenés permiso para gestionar el plantel de ese equipo')
    }
    if (body.dorsal !== undefined && body.dorsal !== null && (body.dorsal < 1 || body.dorsal > 999)) {
      throw badRequest('Dorsal fuera de rango')
    }
    const cambios = await prisma.equipoJugador.update({
      where: { id },
      data: {
        dorsal: body.dorsal !== undefined ? body.dorsal : undefined,
        posiciones: body.posiciones !== undefined ? body.posiciones.trim() || null : undefined,
        observaciones: body.observaciones !== undefined ? body.observaciones.trim() || null : undefined,
      },
    })
    await auditar(prisma, {
      entidad: 'EquipoJugador',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { campos: Object.keys(body) },
    })
    return { data: cambios }
  })

  app.post('/equipo-jugadores/:id/estado', { preHandler: requierePermiso(PERMISOS.jugadoresGestionar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as CambiarEstadoBody
    const prisma = getPrisma()
    const ej = await cargarEjConEquipo(id)
    if (!ej) {
      throw noEncontrado('Pertenencia')
    }
    if (!(await puedeGestionarPlantel(prisma, auth, ej.equipoId))) {
      throw prohibido('No tenés permiso para gestionar el plantel de ese equipo')
    }
    if (!ESTADOS_EQUIPO_JUGADOR.includes(body.estado)) {
      throw badRequest('El estado no es válido')
    }
    if (body.estado === 'BAJA') {
      throw badRequest('Usá el endpoint de baja para ese estado')
    }
    if (!(ESTADOS_MANUALES as readonly string[]).includes(body.estado)) {
      throw badRequest('El estado no es válido')
    }
    const actualizado = await prisma.equipoJugador.update({
      where: { id },
      data: { estado: body.estado as EstadoEquipoJugadorEnum },
      select: { id: true, estado: true },
    })
    await auditar(prisma, {
      entidad: 'EquipoJugador',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { estado: body.estado },
    })
    return { data: actualizado }
  })

  app.post('/equipo-jugadores/:id/baja', { preHandler: requierePermiso(PERMISOS.jugadoresGestionar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = (request.body ?? {}) as { motivo?: string }
    const prisma = getPrisma()
    const ej = await cargarEjConEquipo(id)
    if (!ej) {
      throw noEncontrado('Pertenencia')
    }
    if (!(await puedeGestionarPlantel(prisma, auth, ej.equipoId))) {
      throw prohibido('No tenés permiso para gestionar el plantel de ese equipo')
    }
    if (ej.estado === EstadoEquipoJugadorEnum.BAJA) {
      throw conflicto('estado_invalido', 'El jugador ya está dado de baja')
    }
    const actualizado = await prisma.equipoJugador.update({
      where: { id },
      data: { estado: EstadoEquipoJugadorEnum.BAJA, fechaSalida: new Date(), motivoBaja: body.motivo?.trim() || null },
      select: { id: true, estado: true, fechaSalida: true, motivoBaja: true },
    })
    await auditar(prisma, {
      entidad: 'EquipoJugador',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { baja: true, motivo: body.motivo?.trim() || null },
    })
    return { data: actualizado }
  })
}
