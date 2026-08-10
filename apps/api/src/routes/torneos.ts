import type { FastifyInstance } from 'fastify'
import { CONFIGURACION_PUBLICA_DEFECTO, ESTADOS_TORNEO, PERMISOS, validarConfiguracionPublica } from '@controlliga/shared'
import type { EstadoTorneo } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { badRequest, conflicto, noEncontrado, prohibido } from '../http.js'
import { autenticar, getAuth, requierePermiso } from '../plugins/auth.js'
import { esAdminDeTorneo, esAdministradorOrganizacion, esSuperadmin, puedeVerTorneo } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'
import { transicionValidaTorneo } from '../torneos/estados.js'
import { EstadoParticipacion } from '../generated/prisma/enums.js'
import type { Prisma } from '../generated/prisma/client.js'

interface CrearTorneoBody {
  organizacionId: string
  nombre: string
  descripcion?: string
  logoUrl?: string
  reglas?: string
  configuracionPublica?: unknown
}

interface ModificarTorneoBody {
  nombre?: string
  descripcion?: string
  logoUrl?: string
  reglas?: string
  visiblePublico?: boolean
  configuracionPublica?: unknown
}

interface CambiarEstadoBody {
  estado: EstadoTorneo
}

export async function torneosRoutes(app: FastifyInstance): Promise<void> {
  app.get('/torneos', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request)
    const prisma = getPrisma()

    if (esSuperadmin(auth)) {
      const todos = await prisma.torneo.findMany({
        include: { organizacion: { select: { id: true, nombre: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return { data: todos }
    }

    const esAdmin = auth.roles.some((r) => r.codigo === 'ADMINISTRADOR')
    const orgsAdmin = auth.roles
      .filter((r) => r.codigo === 'ADMINISTRADOR' && r.organizacionId !== null)
      .map((r) => r.organizacionId as string)
    const adminGlobal = esAdmin && orgsAdmin.length === 0
    const adminPorOrgs = esAdmin && !adminGlobal && orgsAdmin.length > 0

    const equipoIds = new Set<string>()
    const eus = await prisma.equipoUsuario.findMany({
      where: { usuarioId: auth.usuarioId, activo: true },
      select: { equipoId: true },
    })
    eus.forEach((e) => equipoIds.add(e.equipoId))
    if (auth.jugadorId) {
      const ej = await prisma.equipoJugador.findMany({
        where: { jugadorId: auth.jugadorId, activo: true },
        select: { equipoId: true },
      })
      ej.forEach((e) => equipoIds.add(e.equipoId))
    }

    const condiciones: Prisma.TorneoWhereInput[] = []
    if (adminGlobal) {
      condiciones.push({})
    }
    if (adminPorOrgs) {
      condiciones.push({ organizacionId: { in: orgsAdmin } })
    }
    if (equipoIds.size > 0) {
      condiciones.push({
        participaciones: {
          some: {
            equipoId: { in: [...equipoIds] },
            estado: { in: [EstadoParticipacion.PENDIENTE, EstadoParticipacion.INSCRIPTO, EstadoParticipacion.CONFIRMADO] },
          },
        },
      })
    }

    const torneos = await prisma.torneo.findMany({
      where: condiciones.length > 0 ? { OR: condiciones } : undefined,
      include: { organizacion: { select: { id: true, nombre: true } } },
      orderBy: { createdAt: 'desc' },
      distinct: ['id'],
    })
    return { data: torneos }
  })

  app.post('/torneos', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request)
    const body = request.body as CrearTorneoBody
    const nombre = body.nombre?.trim()
    if (!nombre || nombre.length < 2) {
      throw badRequest('El nombre es obligatorio')
    }
    if (!body.organizacionId) {
      throw badRequest('La organización es obligatoria')
    }
    if (!esAdministradorOrganizacion(auth, body.organizacionId)) {
      throw prohibido('No tenés permiso para crear torneos en esa organización')
    }
    if (body.configuracionPublica !== undefined && !validarConfiguracionPublica(body.configuracionPublica)) {
      throw badRequest('La configuración pública no es válida')
    }
    const prisma = getPrisma()
    const organizacion = await prisma.organizacion.findUnique({
      where: { id: body.organizacionId },
      select: { id: true },
    })
    if (!organizacion) {
      throw noEncontrado('Organización')
    }
    const torneo = await prisma.torneo.create({
      data: {
        organizacionId: body.organizacionId,
        nombre,
        descripcion: body.descripcion?.trim() || null,
        logoUrl: body.logoUrl?.trim() || null,
        reglas: body.reglas?.trim() || null,
        configuracionPublica:
          body.configuracionPublica !== undefined
            ? (body.configuracionPublica as never)
            : (CONFIGURACION_PUBLICA_DEFECTO as never),
      },
      include: { organizacion: { select: { id: true, nombre: true } } },
    })
    await auditar(prisma, {
      entidad: 'Torneo',
      entidadId: torneo.id,
      accion: 'CREATE',
      usuarioId: auth.usuarioId,
      cambios: { nombre: torneo.nombre, organizacionId: torneo.organizacionId },
    })
    return { data: torneo }
  })

  app.get('/torneos/:id', { preHandler: requierePermiso(PERMISOS.torneosVer) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const torneo = await prisma.torneo.findUnique({
      where: { id },
      include: {
        organizacion: { select: { id: true, nombre: true } },
        temporadas: {
          orderBy: { fechaInicio: 'asc' },
          select: {
            id: true,
            nombre: true,
            estado: true,
            fechaInicio: true,
            fechaFin: true,
            _count: { select: { torneoCategorias: true, participaciones: true, partidos: true } },
          },
        },
        _count: { select: { temporadas: true, participaciones: true, partidos: true } },
      },
    })
    if (!torneo) {
      throw noEncontrado('Torneo')
    }
    if (!(await puedeVerTorneo(prisma, auth, id))) {
      throw prohibido('No tenés acceso a ese torneo')
    }
    return { data: torneo }
  })

  app.patch('/torneos/:id', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as ModificarTorneoBody
    const prisma = getPrisma()
    if (!(await esAdminDeTorneo(prisma, auth, id))) {
      throw prohibido('No tenés permiso para modificar ese torneo')
    }
    if (body.configuracionPublica !== undefined && !validarConfiguracionPublica(body.configuracionPublica)) {
      throw badRequest('La configuración pública no es válida')
    }
    const torneo = await prisma.torneo.findUnique({ where: { id }, select: { id: true } })
    if (!torneo) {
      throw noEncontrado('Torneo')
    }
    const cambios = await prisma.torneo.update({
      where: { id },
      data: {
        nombre: body.nombre !== undefined ? body.nombre.trim() : undefined,
        descripcion: body.descripcion !== undefined ? body.descripcion.trim() || null : undefined,
        logoUrl: body.logoUrl !== undefined ? body.logoUrl.trim() || null : undefined,
        reglas: body.reglas !== undefined ? body.reglas.trim() || null : undefined,
        visiblePublico: body.visiblePublico,
        configuracionPublica: body.configuracionPublica !== undefined ? (body.configuracionPublica as never) : undefined,
      },
      include: { organizacion: { select: { id: true, nombre: true } } },
    })
    await auditar(prisma, {
      entidad: 'Torneo',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { campos: Object.keys(body) },
    })
    return { data: cambios }
  })

  app.post('/torneos/:id/estado', { preHandler: requierePermiso(PERMISOS.torneosAdministrar) }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as CambiarEstadoBody
    const prisma = getPrisma()
    if (!(await esAdminDeTorneo(prisma, auth, id))) {
      throw prohibido('No tenés permiso para modificar ese torneo')
    }
    if (!ESTADOS_TORNEO.includes(body.estado)) {
      throw badRequest('El estado no es válido')
    }
    const torneo = await prisma.torneo.findUnique({ where: { id }, select: { id: true, estado: true } })
    if (!torneo) {
      throw noEncontrado('Torneo')
    }
    if (torneo.estado === body.estado) {
      throw badRequest('El torneo ya está en ese estado')
    }
    if (!transicionValidaTorneo(torneo.estado, body.estado)) {
      throw conflicto(
        'transicion_invalida',
        `No se puede pasar el torneo de ${torneo.estado} a ${body.estado}`,
      )
    }
    const actualizado = await prisma.torneo.update({
      where: { id },
      data: { estado: body.estado },
      select: { id: true, estado: true },
    })
    await auditar(prisma, {
      entidad: 'Torneo',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { cambioDeEstado: { de: torneo.estado, a: body.estado } },
    })
    return { data: actualizado }
  })

  app.get('/organizaciones/:id/torneos', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    if (!esAdministradorOrganizacion(auth, id)) {
      throw prohibido('No tenés acceso a esa organización')
    }
    const torneos = await prisma.torneo.findMany({
      where: { organizacionId: id },
      select: { id: true, nombre: true, estado: true, visiblePublico: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    return { data: torneos }
  })
}
