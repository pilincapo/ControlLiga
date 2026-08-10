import type { FastifyInstance } from 'fastify'
import { PERMISOS } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { badRequest, noEncontrado, prohibido } from '../http.js'
import { getAuth, requierePermiso } from '../plugins/auth.js'
import { esAdminDeTorneo, puedeVerTorneo } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'

async function torneoIdDeCompeticion(torneoCategoriaId: string): Promise<string | null> {
  const prisma = getPrisma()
  const tc = await prisma.torneoCategoria.findUnique({
    where: { id: torneoCategoriaId },
    select: { temporada: { select: { torneoId: true } } },
  })
  return tc?.temporada.torneoId ?? null
}

interface CrearZonaBody {
  nombre: string
}

interface ModificarZonaBody {
  nombre?: string
}

export async function zonasRoutes(app: FastifyInstance): Promise<void> {
  app.post('/torneo-categorias/:id/zonas', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as CrearZonaBody
    const prisma = getPrisma()
    const torneoId = await torneoIdDeCompeticion(id)
    if (!torneoId) {
      throw noEncontrado('Competición')
    }
    if (!(await esAdminDeTorneo(prisma, auth, torneoId))) {
      throw prohibido('No tenés permiso para administrar esa competición')
    }
    const nombre = body.nombre?.trim()
    if (!nombre || nombre.length < 1) {
      throw badRequest('El nombre es obligatorio')
    }
    const zona = await prisma.zona.create({ data: { torneoCategoriaId: id, nombre } })
    await auditar(prisma, {
      entidad: 'Zona',
      entidadId: zona.id,
      accion: 'CREATE',
      usuarioId: auth.usuarioId,
      cambios: { nombre: zona.nombre, torneoCategoriaId: id },
    })
    return { data: zona }
  })

  app.get('/torneo-categorias/:id/zonas', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const torneoId = await torneoIdDeCompeticion(id)
    if (!torneoId) {
      throw noEncontrado('Competición')
    }
    if (!(await puedeVerTorneo(prisma, auth, torneoId))) {
      throw prohibido('No tenés acceso a esa competición')
    }
    const zonas = await prisma.zona.findMany({
      where: { torneoCategoriaId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        nombre: true,
        _count: { select: { participaciones: true } },
      },
    })
    return { data: zonas }
  })

  app.patch('/zonas/:id', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as ModificarZonaBody
    const prisma = getPrisma()
    const zona = await prisma.zona.findUnique({
      where: { id },
      select: { id: true, torneoCategoriaId: true },
    })
    if (!zona) {
      throw noEncontrado('Zona')
    }
    const torneoId = await torneoIdDeCompeticion(zona.torneoCategoriaId)
    if (!torneoId) {
      throw noEncontrado('Competición')
    }
    if (!(await esAdminDeTorneo(prisma, auth, torneoId))) {
      throw prohibido('No tenés permiso para administrar esa zona')
    }
    const cambios = await prisma.zona.update({
      where: { id },
      data: { nombre: body.nombre !== undefined ? body.nombre.trim() : undefined },
    })
    await auditar(prisma, {
      entidad: 'Zona',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { campos: Object.keys(body) },
    })
    return { data: cambios }
  })
}
