import type { FastifyInstance } from 'fastify'
import { getPrisma } from '../db.js'
import { badRequest, noEncontrado, prohibido } from '../http.js'
import { autenticar, getAuth } from '../plugins/auth.js'
import { esDelegadoDelJugador, esElJugador, esSuperadmin } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'

interface ModificarJugadorBody {
  pieDominante?: string
  posicionFavorita?: string
  alturaCm?: number | null
  pesoKg?: number | null
  telefono?: string
  email?: string
}

const CAMPOS_PERSONALES = ['pieDominante', 'posicionFavorita', 'alturaCm', 'pesoKg'] as const
const CAMPOS_COMPLETOS = ['pieDominante', 'posicionFavorita', 'alturaCm', 'pesoKg', 'telefono', 'email'] as const

export async function jugadoresRoutes(app: FastifyInstance): Promise<void> {
  app.get('/jugadores/:id', { preHandler: autenticar }, async (request, reply) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const permitido =
      esSuperadmin(auth) ||
      esElJugador(auth, id) ||
      (await esDelegadoDelJugador(prisma, auth, id))
    if (!permitido) {
      return reply.status(403).send(prohibido('No tenés acceso a ese jugador'))
    }
    const jugador = await prisma.jugador.findUnique({
      where: { id },
      include: {
        persona: true,
        pertenencias: {
          where: { activo: true },
          include: { equipo: { select: { id: true, nombre: true } } },
        },
      },
    })
    if (!jugador) {
      throw noEncontrado('Jugador')
    }
    return {
      data: {
        id: jugador.id,
        persona: jugador.persona,
        pieDominante: jugador.pieDominante,
        posicionFavorita: jugador.posicionFavorita,
        alturaCm: jugador.alturaCm,
        pesoKg: jugador.pesoKg,
        equipos: jugador.pertenencias.map((p) => ({ id: p.equipo.id, nombre: p.equipo.nombre, dorsal: p.dorsal })),
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
