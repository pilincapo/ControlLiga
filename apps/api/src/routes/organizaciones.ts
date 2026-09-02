import type { FastifyInstance } from 'fastify'
import { getPrisma } from '../db.js'
import { noEncontrado, prohibido } from '../http.js'
import { autenticar, getAuth } from '../plugins/auth.js'
import { esAdministradorOrganizacion } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'
import { badRequest, conflicto } from '../http.js'
import { esSlugValido } from '../slug.js'

interface ModificarOrganizacionBody {
  slug?: string
  zonaHoraria?: string
}

function zonaHorariaValida(zonaHoraria: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: zonaHoraria })
    return true
  } catch {
    return false
  }
}

export async function organizacionesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/organizaciones/:id', { preHandler: autenticar }, async (request, reply) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    if (!esAdministradorOrganizacion(auth, id)) {
      return reply.status(403).send(prohibido('No tenés acceso a esa organización'))
    }
    const organizacion = await getPrisma().organizacion.findUnique({
      where: { id },
      include: { torneos: { select: { id: true, nombre: true, estado: true } } },
    })
    if (!organizacion) {
      throw noEncontrado('Organización')
    }
    return { data: organizacion }
  })

  app.patch('/organizaciones/:id', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as ModificarOrganizacionBody
    if (!esAdministradorOrganizacion(auth, id)) throw prohibido('No tenés acceso a esa organización')
    if (body.slug !== undefined && !esSlugValido(body.slug)) throw badRequest('El slug no es válido')
    if (body.zonaHoraria !== undefined && !zonaHorariaValida(body.zonaHoraria)) throw badRequest('La zona horaria no es válida')

    const prisma = getPrisma()
    const organizacion = await prisma.organizacion.findUnique({ where: { id }, select: { id: true } })
    if (!organizacion) throw noEncontrado('Organización')
    if (body.slug !== undefined) {
      const existente = await prisma.organizacion.findUnique({ where: { slug: body.slug }, select: { id: true } })
      if (existente && existente.id !== id) throw conflicto('slug_ocupado', 'El slug ya está en uso')
    }
    const actualizada = await prisma.organizacion.update({
      where: { id },
      data: { slug: body.slug, zonaHoraria: body.zonaHoraria },
    })
    await auditar(prisma, { entidad: 'Organizacion', entidadId: id, accion: 'UPDATE', usuarioId: auth.usuarioId, cambios: { campos: Object.keys(body) } })
    return { data: actualizada }
  })
}
