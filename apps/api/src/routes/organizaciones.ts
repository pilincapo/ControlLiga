import type { FastifyInstance } from 'fastify'
import { getPrisma } from '../db.js'
import { noEncontrado, prohibido } from '../http.js'
import { autenticar, getAuth } from '../plugins/auth.js'
import { esAdministradorOrganizacion } from '../auth/permisos.js'

export async function organizacionesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/organizaciones/:id', { preHandler: autenticar }, async (request, reply) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    if (!esAdministradorOrganizacion(auth, id)) {
      return reply.status(403).send(prohibido('No tenés acceso a esa organización'))
    }
    const organizacion = await getPrisma().organizacion.findUnique({
      where: { id },
      include: { torneos: { select: { id: true, nombre: true, activo: true } } },
    })
    if (!organizacion) {
      throw noEncontrado('Organización')
    }
    return { data: organizacion }
  })
}
