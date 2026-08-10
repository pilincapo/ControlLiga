import type { FastifyInstance } from 'fastify'
import { PERMISOS } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { badRequest, conflicto, noEncontrado, prohibido } from '../http.js'
import { autenticar, getAuth, requierePermiso } from '../plugins/auth.js'
import { esDelegadoDelJugador, esElJugador, esMiembroEquipo, esSuperadmin } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'
import { EstadoEquipoJugador } from '../generated/prisma/enums.js'
import type { ContextoAuth } from '../auth/contexto.js'
import type { PrismaClient } from '../generated/prisma/client.js'

interface ModificarJugadorBody {
  pieDominante?: string
  posicionFavorita?: string
  alturaCm?: number | null
  pesoKg?: number | null
  telefono?: string
  email?: string
}

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

interface CrearJugadorBody {
  persona: PersonaBody
  pieDominante?: string
  posicionFavorita?: string
  alturaCm?: number
  pesoKg?: number
}

const CAMPOS_PERSONALES = ['pieDominante', 'posicionFavorita', 'alturaCm', 'pesoKg'] as const
const CAMPOS_COMPLETOS = ['pieDominante', 'posicionFavorita', 'alturaCm', 'pesoKg', 'telefono', 'email'] as const

async function puedeVerJugador(
  prisma: PrismaClient,
  auth: ContextoAuth,
  jugadorId: string,
): Promise<boolean> {
  if (esSuperadmin(auth) || esElJugador(auth, jugadorId) || (await esDelegadoDelJugador(prisma, auth, jugadorId))) {
    return true
  }
  const equipos = await prisma.equipoJugador.findMany({
    where: { jugadorId, estado: { not: EstadoEquipoJugador.BAJA } },
    select: { equipoId: true },
  })
  for (const e of equipos) {
    if (await esMiembroEquipo(prisma, auth, e.equipoId)) {
      return true
    }
  }
  return false
}

export async function jugadoresRoutes(app: FastifyInstance): Promise<void> {
  app.get('/jugadores', { preHandler: requierePermiso(PERMISOS.jugadoresVer) }, async (request) => {
    const dni = (request.query as { dni?: string }).dni?.trim()
    if (!dni) {
      return { data: [] }
    }
    const personas = await getPrisma().persona.findMany({
      where: { dni: { contains: dni, mode: 'insensitive' } },
      select: {
        id: true,
        nombre: true,
        apellido: true,
        dni: true,
        jugador: { select: { id: true } },
      },
      take: 20,
    })
    return {
      data: personas
        .filter((p) => p.jugador !== null)
        .map((p) => ({ id: p.jugador!.id, nombre: p.nombre, apellido: p.apellido, dni: p.dni })),
    }
  })

  app.post('/jugadores', { preHandler: requierePermiso(PERMISOS.jugadoresGestionar) }, async (request) => {
    const auth = getAuth(request)
    const body = request.body as CrearJugadorBody
    const persona = body.persona
    if (!persona) {
      throw badRequest('La persona es obligatoria')
    }
    const nombre = persona.nombre?.trim()
    const apellido = persona.apellido?.trim()
    if (!nombre || nombre.length < 2 || !apellido || apellido.length < 2) {
      throw badRequest('Nombre y apellido son obligatorios')
    }
    const prisma = getPrisma()
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
      return tx.jugador.create({
        data: {
          personaId: p.id,
          pieDominante: body.pieDominante?.trim() || null,
          posicionFavorita: body.posicionFavorita?.trim() || null,
          alturaCm: body.alturaCm ?? null,
          pesoKg: body.pesoKg ?? null,
        },
      })
    })
    await auditar(prisma, {
      entidad: 'Jugador',
      entidadId: creado.id,
      accion: 'CREATE',
      usuarioId: auth.usuarioId,
      cambios: { nombre, apellido },
    })
    return { data: creado }
  })

  app.get('/jugadores/:id', { preHandler: autenticar }, async (request, reply) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    if (!(await puedeVerJugador(prisma, auth, id))) {
      return reply.status(403).send(prohibido('No tenés acceso a ese jugador'))
    }
    const jugador = await prisma.jugador.findUnique({
      where: { id },
      include: {
        persona: true,
        pertenencias: {
          include: { equipo: { select: { id: true, nombre: true, escudoUrl: true } } },
          orderBy: { fechaIngreso: 'desc' },
        },
        participaciones: {
          include: {
            equipoParticipacion: {
              include: {
                equipo: { select: { id: true, nombre: true } },
                temporada: { select: { id: true, nombre: true, torneo: { select: { id: true, nombre: true } } } },
                torneoCategoria: { include: { categoria: true } },
              },
            },
          },
          orderBy: { fechaAlta: 'desc' },
        },
      },
    })
    if (!jugador) {
      throw noEncontrado('Jugador')
    }
    const vinculado = await prisma.usuario.findUnique({
      where: { jugadorId: jugador.id },
      select: { id: true },
    })
    return {
      data: {
        id: jugador.id,
        persona: jugador.persona,
        pieDominante: jugador.pieDominante,
        posicionFavorita: jugador.posicionFavorita,
        alturaCm: jugador.alturaCm,
        pesoKg: jugador.pesoKg,
        vinculado: vinculado !== null,
        historialEquipos: jugador.pertenencias.map((p) => ({
          id: p.id,
          equipoId: p.equipo.id,
          equipo: p.equipo.nombre,
          escudoUrl: p.equipo.escudoUrl,
          dorsal: p.dorsal,
          posiciones: p.posiciones,
          estado: p.estado,
          fechaIngreso: p.fechaIngreso,
          fechaSalida: p.fechaSalida,
          motivoBaja: p.motivoBaja,
        })),
        historialCompeticiones: jugador.participaciones.map((p) => ({
          id: p.id,
          torneo: p.equipoParticipacion.temporada.torneo.nombre,
          temporada: p.equipoParticipacion.temporada.nombre,
          categoria: p.equipoParticipacion.torneoCategoria?.categoria.nombre ?? null,
          equipo: p.equipoParticipacion.equipo.nombre,
          dorsal: p.dorsal,
          activo: p.activo,
        })),
      },
    }
  })

  app.patch('/jugadores/:id', { preHandler: autenticar }, async (request, reply) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as ModificarJugadorBody
    const prisma = getPrisma()

    const esPersonal = esElJugador(auth, id)
    const esCompleto = esSuperadmin(auth) || (await esDelegadoDelJugador(prisma, auth, id))
    if (!esCompleto && !esPersonal) {
      return reply.status(403).send(prohibido('No tenés permiso para modificar ese jugador'))
    }

    const camposEnviados = Object.keys(body)
    const permitidos = esCompleto ? CAMPOS_COMPLETOS : CAMPOS_PERSONALES
    const noPermitidos = camposEnviados.filter((c) => !(permitidos as readonly string[]).includes(c))
    if (noPermitidos.length > 0) {
      throw prohibido(`No podés modificar los campos: ${noPermitidos.join(', ')}`)
    }

    const jugador = await prisma.jugador.findUnique({
      where: { id },
      include: { persona: true },
    })
    if (!jugador) {
      throw noEncontrado('Jugador')
    }
    if (body.alturaCm !== undefined && body.alturaCm !== null && (body.alturaCm < 100 || body.alturaCm > 250)) {
      throw badRequest('Altura fuera de rango')
    }

    const [jugadorActualizado, personaActualizada] = await prisma.$transaction([
      prisma.jugador.update({
        where: { id },
        data: {
          pieDominante: body.pieDominante,
          posicionFavorita: body.posicionFavorita,
          alturaCm: body.alturaCm,
          pesoKg: body.pesoKg,
        },
      }),
      prisma.persona.update({
        where: { id: jugador.personaId },
        data: {
          telefono: body.telefono !== undefined ? body.telefono : jugador.persona.telefono,
          email: body.email !== undefined ? body.email : jugador.persona.email,
        },
      }),
    ])

    await auditar(prisma, {
      entidad: 'Jugador',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { campos: camposEnviados },
    })

    return {
      data: {
        id: jugadorActualizado.id,
        persona: { telefono: personaActualizada.telefono, email: personaActualizada.email },
        pieDominante: jugadorActualizado.pieDominante,
        posicionFavorita: jugadorActualizado.posicionFavorita,
        alturaCm: jugadorActualizado.alturaCm,
        pesoKg: jugadorActualizado.pesoKg,
      },
    }
  })
}
