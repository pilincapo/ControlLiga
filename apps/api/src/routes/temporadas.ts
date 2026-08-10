import type { FastifyInstance } from 'fastify'
import { ESTADOS_TEMPORADA, PERMISOS } from '@controlliga/shared'
import type { EstadoTemporada } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { badRequest, conflicto, noEncontrado, prohibido } from '../http.js'
import { getAuth, requierePermiso } from '../plugins/auth.js'
import { esAdminDeTorneo, puedeVerTorneo } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'
import { transicionValidaTemporada } from '../torneos/estados.js'

interface CrearTemporadaBody {
  nombre: string
  fechaInicio: string
  fechaFin?: string
}

interface ModificarTemporadaBody {
  nombre?: string
  fechaInicio?: string
  fechaFin?: string
}

interface CambiarEstadoBody {
  estado: EstadoTemporada
}

async function cargarTemporadaConTorneo(id: string) {
  const prisma = getPrisma()
  const temporada = await prisma.temporada.findUnique({
    where: { id },
    select: { id: true, torneoId: true },
  })
  return temporada
}

export async function temporadasRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/torneos/:torneoId/temporadas',
    { preHandler: requierePermiso(PERMISOS.torneosAdministrar) },
    async (request) => {
      const auth = getAuth(request)
      const { torneoId } = request.params as { torneoId: string }
      const body = request.body as CrearTemporadaBody
      const prisma = getPrisma()
      if (!(await esAdminDeTorneo(prisma, auth, torneoId))) {
        throw prohibido('No tenés permiso para administrar ese torneo')
      }
      const nombre = body.nombre?.trim()
      if (!nombre || nombre.length < 2) {
        throw badRequest('El nombre es obligatorio')
      }
      if (!body.fechaInicio || Number.isNaN(Date.parse(body.fechaInicio))) {
        throw badRequest('La fecha de inicio es obligatoria')
      }
      const torneo = await prisma.torneo.findUnique({ where: { id: torneoId }, select: { id: true } })
      if (!torneo) {
        throw noEncontrado('Torneo')
      }
      const temporada = await prisma.temporada.create({
        data: {
          torneoId,
          nombre,
          fechaInicio: new Date(body.fechaInicio),
          fechaFin: body.fechaFin && !Number.isNaN(Date.parse(body.fechaFin)) ? new Date(body.fechaFin) : null,
        },
      })
      await auditar(prisma, {
        entidad: 'Temporada',
        entidadId: temporada.id,
        accion: 'CREATE',
        usuarioId: auth.usuarioId,
        cambios: { nombre: temporada.nombre, torneoId },
      })
      return { data: temporada }
    },
  )

  app.get(
    '/torneos/:torneoId/temporadas',
    { preHandler: requierePermiso(PERMISOS.torneosVer) },
    async (request) => {
      const auth = getAuth(request)
      const { torneoId } = request.params as { torneoId: string }
      const prisma = getPrisma()
      if (!(await puedeVerTorneo(prisma, auth, torneoId))) {
        throw prohibido('No tenés acceso a ese torneo')
      }
      const temporadas = await prisma.temporada.findMany({
        where: { torneoId },
        orderBy: { fechaInicio: 'asc' },
        select: {
          id: true,
          nombre: true,
          estado: true,
          fechaInicio: true,
          fechaFin: true,
          _count: { select: { torneoCategorias: true, participaciones: true, partidos: true } },
        },
      })
      return { data: temporadas }
    },
  )

  app.get('/temporadas/:id', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const temporada = await prisma.temporada.findUnique({
      where: { id },
      include: {
        torneoCategorias: { include: { categoria: true, configuracion: true, _count: { select: { zonas: true, participaciones: true } } } },
        participaciones: {
          include: {
            equipo: { select: { id: true, nombre: true, escudoUrl: true } },
            zona: { select: { id: true, nombre: true } },
            torneoCategoria: { include: { categoria: true } },
          },
          orderBy: { fechaInscripcion: 'asc' },
        },
      },
    })
    if (!temporada) {
      throw noEncontrado('Temporada')
    }
    if (!(await puedeVerTorneo(prisma, auth, temporada.torneoId))) {
      throw prohibido('No tenés acceso a ese torneo')
    }
    return { data: temporada }
  })

  app.patch('/temporadas/:id', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as ModificarTemporadaBody
    const prisma = getPrisma()
    const temporada = await cargarTemporadaConTorneo(id)
    if (!temporada) {
      throw noEncontrado('Temporada')
    }
    if (!(await esAdminDeTorneo(prisma, auth, temporada.torneoId))) {
      throw prohibido('No tenés permiso para administrar esa temporada')
    }
    const cambios = await prisma.temporada.update({
      where: { id },
      data: {
        nombre: body.nombre !== undefined ? body.nombre.trim() : undefined,
        fechaInicio:
          body.fechaInicio !== undefined
            ? Number.isNaN(Date.parse(body.fechaInicio))
              ? undefined
              : new Date(body.fechaInicio)
            : undefined,
        fechaFin:
          body.fechaFin !== undefined
            ? body.fechaFin.length === 0 || Number.isNaN(Date.parse(body.fechaFin))
              ? null
              : new Date(body.fechaFin)
            : undefined,
      },
    })
    await auditar(prisma, {
      entidad: 'Temporada',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { campos: Object.keys(body) },
    })
    return { data: cambios }
  })

  app.post('/temporadas/:id/estado', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as CambiarEstadoBody
    const prisma = getPrisma()
    const temporada = await prisma.temporada.findUnique({ where: { id }, select: { id: true, torneoId: true, estado: true } })
    if (!temporada) {
      throw noEncontrado('Temporada')
    }
    if (!(await esAdminDeTorneo(prisma, auth, temporada.torneoId))) {
      throw prohibido('No tenés permiso para administrar esa temporada')
    }
    if (!ESTADOS_TEMPORADA.includes(body.estado)) {
      throw badRequest('El estado no es válido')
    }
    if (temporada.estado === body.estado) {
      throw badRequest('La temporada ya está en ese estado')
    }
    if (!transicionValidaTemporada(temporada.estado, body.estado)) {
      throw conflicto(
        'transicion_invalida',
        `No se puede pasar la temporada de ${temporada.estado} a ${body.estado}`,
      )
    }
    const actualizado = await prisma.temporada.update({
      where: { id },
      data: { estado: body.estado },
      select: { id: true, estado: true },
    })
    await auditar(prisma, {
      entidad: 'Temporada',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { cambioDeEstado: { de: temporada.estado, a: body.estado } },
    })
    return { data: actualizado }
  })
}
