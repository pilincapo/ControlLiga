import type { FastifyInstance } from 'fastify'
import { getPrisma } from '../db.js'
import { noEncontrado, prohibido } from '../http.js'
import { autenticar, getAuth } from '../plugins/auth.js'
import { esMiembroEquipo } from '../auth/permisos.js'

export async function equiposRoutes(app: FastifyInstance): Promise<void> {
  app.get('/equipos/:id', { preHandler: autenticar }, async (request, reply) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    if (!(await esMiembroEquipo(getPrisma(), auth, id))) {
      return reply.status(403).send(prohibido('No tenés acceso a ese equipo'))
    }
    const equipo = await getPrisma().equipo.findUnique({
      where: { id },
      include: {
        usuarios: {
          where: { activo: true },
          include: { usuario: { select: { id: true, nombre: true, apellido: true } } },
        },
        jugadores: {
          where: { activo: true },
          select: { id: true, dorsal: true },
        },
      },
    })
    if (!equipo) {
      throw noEncontrado('Equipo')
    }
    return {
      data: {
        id: equipo.id,
        nombre: equipo.nombre,
        escudoUrl: equipo.escudoUrl,
        colorPrincipal: equipo.colorPrincipal,
        colorSecundario: equipo.colorSecundario,
        privado: equipo.privado,
        integrantes: equipo.usuarios,
        cantidadJugadores: equipo.jugadores.length,
      },
    }
  })
}
