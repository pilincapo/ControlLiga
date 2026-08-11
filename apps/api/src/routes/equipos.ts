import type { FastifyInstance } from 'fastify'
import { CONFIGURACION_PUBLICA_EQUIPO_DEFECTO, ESTADOS_EQUIPO, PERMISOS, ROLES_POR_EQUIPO, validarConfiguracionPublicaEquipo } from '@controlliga/shared'
import type { EstadoEquipo, RolEnEquipo } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { badRequest, conflicto, noEncontrado, prohibido } from '../http.js'
import { autenticar, getAuth, requierePermiso, requiereRolEnEquipo } from '../plugins/auth.js'
import { esMiembroEquipo, esSuperadmin } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'
import { EstadoEquipoJugador } from '../generated/prisma/enums.js'

interface CrearEquipoBody {
  nombre: string
  escudoUrl?: string
  descripcion?: string
  colorPrincipal?: string
  colorSecundario?: string
  categoriaHabitual?: string
  telefono?: string
  email?: string
  configuracionPublica?: unknown
}

interface ModificarEquipoBody {
  nombre?: string
  descripcion?: string
  escudoUrl?: string
  colorPrincipal?: string
  colorSecundario?: string
  categoriaHabitual?: string
  telefono?: string
  email?: string
  estado?: EstadoEquipo
  privado?: boolean
  configuracionPublica?: unknown
}

interface AgregarAdminBody {
  usuarioId: string
  rolEnEquipo: RolEnEquipo
}

interface CambiarRolAdminBody {
  rolEnEquipo: RolEnEquipo
}

export async function equiposRoutes(app: FastifyInstance): Promise<void> {
  app.post('/equipos', { preHandler: requierePermiso(PERMISOS.equiposAdministrar) }, async (request) => {
    const auth = getAuth(request)
    const body = request.body as CrearEquipoBody
    const nombre = body.nombre?.trim()
    if (!nombre || nombre.length < 2) {
      throw badRequest('El nombre es obligatorio')
    }
    if (body.configuracionPublica !== undefined && !validarConfiguracionPublicaEquipo(body.configuracionPublica)) {
      throw badRequest('La configuración pública no es válida')
    }
    const prisma = getPrisma()
    const equipo = await prisma.$transaction(async (tx) => {
      const creado = await tx.equipo.create({
        data: {
          nombre,
          escudoUrl: body.escudoUrl?.trim() || null,
          descripcion: body.descripcion?.trim() || null,
          colorPrincipal: body.colorPrincipal?.trim() || null,
          colorSecundario: body.colorSecundario?.trim() || null,
          categoriaHabitual: body.categoriaHabitual?.trim() || null,
          telefono: body.telefono?.trim() || null,
          email: body.email?.trim() || null,
          creadoPorId: auth.usuarioId,
          configuracionPublica:
            body.configuracionPublica !== undefined
              ? (body.configuracionPublica as never)
              : (CONFIGURACION_PUBLICA_EQUIPO_DEFECTO as never),
        },
      })
      await tx.equipoUsuario.create({
        data: { equipoId: creado.id, usuarioId: auth.usuarioId, rolEnEquipo: 'DELEGADO' },
      })
      return creado
    })
    await auditar(prisma, {
      entidad: 'Equipo',
      entidadId: equipo.id,
      accion: 'CREATE',
      usuarioId: auth.usuarioId,
      cambios: { nombre: equipo.nombre },
    })
    await auditar(prisma, {
      entidad: 'EquipoUsuario',
      entidadId: equipo.id,
      accion: 'CREATE',
      usuarioId: auth.usuarioId,
      cambios: { rol: 'DELEGADO', creador: true },
    })
    return { data: equipo }
  })

  app.get('/equipos', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const prisma = getPrisma()
    if (esSuperadmin(auth)) {
      const todos = await prisma.equipo.findMany({
        select: { id: true, nombre: true, escudoUrl: true, estado: true, privado: true },
        orderBy: { createdAt: 'desc' },
      })
      return { data: todos }
    }
    const equipoIds = new Set<string>()
    const eus = await prisma.equipoUsuario.findMany({
      where: { usuarioId: auth.usuarioId, activo: true },
      select: { equipoId: true },
    })
    eus.forEach((e) => equipoIds.add(e.equipoId))
    if (auth.jugadorId) {
      const pertenencias = await prisma.equipoJugador.findMany({
        where: { jugadorId: auth.jugadorId, estado: { not: EstadoEquipoJugador.BAJA } },
        select: { equipoId: true },
      })
      pertenencias.forEach((p) => equipoIds.add(p.equipoId))
    }
    const equipos = await prisma.equipo.findMany({
      where: { id: { in: [...equipoIds] } },
      select: { id: true, nombre: true, escudoUrl: true, estado: true, privado: true },
      orderBy: { nombre: 'asc' },
    })
    return { data: equipos }
  })

  app.get('/equipos/:id', { preHandler: autenticar }, async (request, reply) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    if (!(await esMiembroEquipo(getPrisma(), auth, id))) {
      return reply.status(403).send(prohibido('No tenés acceso a ese equipo'))
    }
    const prisma = getPrisma()
    const equipo = await prisma.equipo.findUnique({
      where: { id },
      include: {
        usuarios: {
          where: { activo: true },
          include: { usuario: { select: { id: true, nombre: true, apellido: true, email: true } } },
        },
        jugadores: { select: { id: true, estado: true } },
      },
    })
    if (!equipo) {
      throw noEncontrado('Equipo')
    }
    const plantelActivo = equipo.jugadores.filter((j) => j.estado !== EstadoEquipoJugador.BAJA && j.estado !== EstadoEquipoJugador.INVITADO).length
    const invitados = equipo.jugadores.filter((j) => j.estado === EstadoEquipoJugador.INVITADO).length
    const bajas = equipo.jugadores.length - plantelActivo - invitados
    return {
      data: {
        id: equipo.id,
        nombre: equipo.nombre,
        escudoUrl: equipo.escudoUrl,
        descripcion: equipo.descripcion,
        colorPrincipal: equipo.colorPrincipal,
        colorSecundario: equipo.colorSecundario,
        categoriaHabitual: equipo.categoriaHabitual,
        estado: equipo.estado,
        privado: equipo.privado,
        configuracionPublica: equipo.configuracionPublica,
        telefono: equipo.telefono,
        email: equipo.email,
        administradores: equipo.usuarios,
        cantidades: {
          jugadores: plantelActivo,
          invitados,
          bajas,
          administradores: equipo.usuarios.length,
          delegados: equipo.usuarios.filter((u) => u.rolEnEquipo === 'DELEGADO').length,
        },
      },
    }
  })

  app.patch('/equipos/:id', { preHandler: requiereRolEnEquipo('DELEGADO') }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as ModificarEquipoBody
    const prisma = getPrisma()
    const equipo = await prisma.equipo.findUnique({ where: { id }, select: { id: true } })
    if (!equipo) {
      throw noEncontrado('Equipo')
    }
    if (body.estado !== undefined && !ESTADOS_EQUIPO.includes(body.estado)) {
      throw badRequest('El estado no es válido')
    }
    if (body.configuracionPublica !== undefined && !validarConfiguracionPublicaEquipo(body.configuracionPublica)) {
      throw badRequest('La configuración pública no es válida')
    }
    const cambios = await prisma.equipo.update({
      where: { id },
      data: {
        nombre: body.nombre !== undefined ? body.nombre.trim() : undefined,
        descripcion: body.descripcion !== undefined ? body.descripcion.trim() || null : undefined,
        escudoUrl: body.escudoUrl !== undefined ? body.escudoUrl.trim() || null : undefined,
        colorPrincipal: body.colorPrincipal !== undefined ? body.colorPrincipal.trim() || null : undefined,
        colorSecundario: body.colorSecundario !== undefined ? body.colorSecundario.trim() || null : undefined,
        categoriaHabitual: body.categoriaHabitual !== undefined ? body.categoriaHabitual.trim() || null : undefined,
        telefono: body.telefono !== undefined ? body.telefono.trim() || null : undefined,
        email: body.email !== undefined ? body.email.trim() || null : undefined,
        estado: body.estado,
        privado: body.privado,
        configuracionPublica: body.configuracionPublica !== undefined ? (body.configuracionPublica as never) : undefined,
      },
    })
    await auditar(prisma, {
      entidad: 'Equipo',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { campos: Object.keys(body) },
    })
    return { data: cambios }
  })

  app.post('/equipos/:id/administradores', { preHandler: requiereRolEnEquipo('DELEGADO') }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as AgregarAdminBody
    const prisma = getPrisma()
    if (!body.usuarioId) {
      throw badRequest('El usuario es obligatorio')
    }
    if (!ROLES_POR_EQUIPO.includes(body.rolEnEquipo)) {
      throw badRequest('El rol no es válido')
    }
    const usuario = await prisma.usuario.findUnique({ where: { id: body.usuarioId }, select: { id: true } })
    if (!usuario) {
      throw noEncontrado('Usuario')
    }
    const existente = await prisma.equipoUsuario.findFirst({
      where: { equipoId: id, usuarioId: body.usuarioId, activo: true },
      select: { id: true },
    })
    if (existente) {
      throw conflicto('admin_existente', 'Ese usuario ya es administrador del equipo')
    }
    const eu = await prisma.$transaction(async (tx) => {
      const previo = await tx.equipoUsuario.findFirst({
        where: { equipoId: id, usuarioId: body.usuarioId },
        select: { id: true },
      })
      if (previo) {
        return tx.equipoUsuario.update({
          where: { id: previo.id },
          data: { activo: true, fechaBaja: null, rolEnEquipo: body.rolEnEquipo, invitadoPorId: auth.usuarioId },
        })
      }
      return tx.equipoUsuario.create({
        data: {
          equipoId: id,
          usuarioId: body.usuarioId,
          rolEnEquipo: body.rolEnEquipo,
          invitadoPorId: auth.usuarioId,
        },
      })
    })
    await auditar(prisma, {
      entidad: 'EquipoUsuario',
      entidadId: eu.id,
      accion: 'CREATE',
      usuarioId: auth.usuarioId,
      cambios: { equipoId: id, usuarioId: body.usuarioId, rol: body.rolEnEquipo },
    })
    return { data: eu }
  })

  app.patch('/equipos/:id/administradores/:euId', { preHandler: requiereRolEnEquipo('DELEGADO') }, async (request) => {
    const auth = getAuth(request)
    const { id, euId } = request.params as { id: string; euId: string }
    const body = request.body as CambiarRolAdminBody
    const prisma = getPrisma()
    if (!ROLES_POR_EQUIPO.includes(body.rolEnEquipo)) {
      throw badRequest('El rol no es válido')
    }
    const eu = await prisma.equipoUsuario.findFirst({
      where: { id: euId, equipoId: id, activo: true },
      select: { id: true },
    })
    if (!eu) {
      throw noEncontrado('Administrador')
    }
    const actualizado = await prisma.equipoUsuario.update({
      where: { id: euId },
      data: { rolEnEquipo: body.rolEnEquipo },
      select: { id: true, rolEnEquipo: true },
    })
    await auditar(prisma, {
      entidad: 'EquipoUsuario',
      entidadId: euId,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { equipoId: id, rolNuevo: body.rolEnEquipo },
    })
    return { data: actualizado }
  })

  app.post('/equipos/:id/administradores/:euId/baja', { preHandler: requiereRolEnEquipo('DELEGADO') }, async (request) => {
    const auth = getAuth(request)
    const { id, euId } = request.params as { id: string; euId: string }
    const prisma = getPrisma()
    const eu = await prisma.equipoUsuario.findFirst({
      where: { id: euId, equipoId: id, activo: true },
      select: { id: true, rolEnEquipo: true },
    })
    if (!eu) {
      throw noEncontrado('Administrador')
    }
    if (eu.rolEnEquipo === 'DELEGADO') {
      const delegadosActivos = await prisma.equipoUsuario.count({
        where: { equipoId: id, activo: true, rolEnEquipo: 'DELEGADO' },
      })
      if (delegadosActivos <= 1) {
        throw conflicto('ultimo_delegado', 'No se puede dar de baja al último DELEGADO del equipo')
      }
    }
    const actualizado = await prisma.equipoUsuario.update({
      where: { id: euId },
      data: { activo: false, fechaBaja: new Date() },
      select: { id: true, activo: true, fechaBaja: true },
    })
    await auditar(prisma, {
      entidad: 'EquipoUsuario',
      entidadId: euId,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { equipoId: id, baja: true },
    })
    return { data: actualizado }
  })
}
