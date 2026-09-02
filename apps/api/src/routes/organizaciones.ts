import type { FastifyInstance } from 'fastify'
import { getPrisma } from '../db.js'
import { noEncontrado, prohibido } from '../http.js'
import { badRequest, conflicto } from '../http.js'
import { autenticar, getAuth } from '../plugins/auth.js'
import { esAdministradorOrganizacion, esSuperadmin } from '../auth/permisos.js'
import type { ContextoAuth } from '../auth/contexto.js'
import { auditar } from '../auth/auditoria.js'
import { esSlugValido, slugDesdeNombre } from '../slug.js'

interface ModificarOrganizacionBody {
  slug?: string
  zonaHoraria?: string
}

interface CrearOrganizacionBody {
  nombre: string
  descripcion?: string
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

function organizacionesDelUsuario(auth: ContextoAuth): { todas: boolean; ids: string[] } {
  if (esSuperadmin(auth)) {
    return { todas: true, ids: [] }
  }
  const orgs = auth.roles.filter((r) => r.codigo === 'ADMINISTRADOR' && r.organizacionId !== null).map((r) => r.organizacionId as string)
  const adminGlobal = auth.roles.some((r) => r.codigo === 'ADMINISTRADOR' && r.organizacionId === null)
  return { todas: adminGlobal, ids: adminGlobal ? [] : orgs }
}

export async function organizacionesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/organizaciones', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const prisma = getPrisma()
    const { todas, ids } = organizacionesDelUsuario(auth)
    const organizaciones = await prisma.organizacion.findMany({
      where: todas ? undefined : { id: { in: ids } },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        slug: true,
        zonaHoraria: true,
        _count: { select: { torneos: true } },
      },
      orderBy: { nombre: 'asc' },
    })
    return { data: organizaciones }
  })

  app.post('/organizaciones', { preHandler: autenticar }, async (request, reply) => {
    const auth = getAuth(request)
    if (!esSuperadmin(auth)) {
      throw prohibido('Solo el SUPERADMIN puede crear organizaciones')
    }
    const body = request.body as CrearOrganizacionBody
    const nombre = body.nombre?.trim()
    if (!nombre || nombre.length < 2) {
      throw badRequest('El nombre es obligatorio')
    }
    if (body.slug !== undefined && !esSlugValido(body.slug)) throw badRequest('El slug no es válido')
    if (body.zonaHoraria !== undefined && !zonaHorariaValida(body.zonaHoraria)) throw badRequest('La zona horaria no es válida')

    const prisma = getPrisma()
    const slug = body.slug ?? slugDesdeNombre(nombre)
    const existente = await prisma.organizacion.findUnique({ where: { slug }, select: { id: true } })
    if (existente) throw conflicto('slug_ocupado', 'El slug ya está en uso')

    let rolAdminId = (await prisma.rol.findUnique({ where: { codigo: 'ADMINISTRADOR' }, select: { id: true } }))?.id
    if (!rolAdminId) {
      const creado = await prisma.rol.create({ data: { codigo: 'ADMINISTRADOR', nombre: 'ADMINISTRADOR' } })
      rolAdminId = creado.id
    }

    const organizacion = await prisma.$transaction(async (tx) => {
      const nueva = await tx.organizacion.create({
        data: {
          nombre,
          descripcion: body.descripcion?.trim() || null,
          slug,
          zonaHoraria: body.zonaHoraria ?? 'America/Argentina/Buenos_Aires',
        },
      })
      await tx.rolUsuario.create({
        data: { usuarioId: auth.usuarioId, rolId: rolAdminId!, organizacionId: nueva.id },
      })
      await auditar(tx, {
        entidad: 'Organizacion',
        entidadId: nueva.id,
        accion: 'CREATE',
        usuarioId: auth.usuarioId,
        cambios: { nombre: nueva.nombre, slug: nueva.slug },
      })
      return nueva
    })
    reply.status(201)
    return { data: organizacion }
  })

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

  app.get('/organizaciones/:id/usuarios', { preHandler: autenticar }, async (request, reply) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    if (!esAdministradorOrganizacion(auth, id)) {
      return reply.status(403).send(prohibido('No tenés acceso a esa organización'))
    }
    const prisma = getPrisma()
    const organizacion = await prisma.organizacion.findUnique({ where: { id }, select: { id: true } })
    if (!organizacion) {
      throw noEncontrado('Organización')
    }
    const filas = await prisma.rolUsuario.findMany({
      where: { organizacionId: id, activo: true },
      include: {
        rol: { select: { codigo: true } },
        usuario: { select: { id: true, email: true, nombre: true, apellido: true, activo: true } },
      },
      orderBy: { usuarioId: 'asc' },
    })
    type RolMapeado = { codigo: string; torneoId: string | null; equipoId: string | null }
    type UsuarioOrg = {
      usuarioId: string
      email: string
      nombre: string
      apellido: string
      activo: boolean
      roles: RolMapeado[]
    }
    const porUsuario = new Map<string, UsuarioOrg>()
    for (const fila of filas) {
      let previo = porUsuario.get(fila.usuario.id)
      if (!previo) {
        previo = {
          usuarioId: fila.usuario.id,
          email: fila.usuario.email,
          nombre: fila.usuario.nombre,
          apellido: fila.usuario.apellido,
          activo: fila.usuario.activo,
          roles: [],
        }
        porUsuario.set(fila.usuario.id, previo)
      }
      previo.roles.push({ codigo: fila.rol.codigo, torneoId: fila.torneoId, equipoId: fila.equipoId })
    }
    return { data: [...porUsuario.values()] }
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