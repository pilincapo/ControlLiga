import type { FastifyInstance } from 'fastify'
import type { RolCodigo } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { badRequest, noEncontrado, prohibido } from '../http.js'
import { hashPassword } from '../auth/password.js'
import { autenticar, getAuth } from '../plugins/auth.js'
import { esAdministradorOrganizacion, esSuperadmin, puedeAsignarRoles } from '../auth/permisos.js'
import { auditar } from '../auth/auditoria.js'
import { SELECT_USUARIO_PUBLICO } from './helpers.js'

interface CambiarUsuarioBody {
  activo?: boolean
  email?: string
  nombre?: string
  apellido?: string
  password?: string
}

interface AsignarRolesBody {
  roles: Array<{
    codigo: RolCodigo
    organizacionId?: string | null
    torneoId?: string | null
    equipoId?: string | null
  }>
}

interface RetirarRolBody {
  codigo: RolCodigo
  organizacionId?: string | null
  torneoId?: string | null
  equipoId?: string | null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function usuariosRoutes(app: FastifyInstance): Promise<void> {
  app.get('/usuarios', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const query = request.query as { organizacionId?: string }
    const prisma = getPrisma()
    if (query.organizacionId) {
      if (!esAdministradorOrganizacion(auth, query.organizacionId)) {
        throw prohibido('No tenés acceso a esa organización')
      }
      const organizacion = await prisma.organizacion.findUnique({ where: { id: query.organizacionId }, select: { id: true } })
      if (!organizacion) throw noEncontrado('Organización')
      const miembros = await prisma.rolUsuario.findMany({
        where: { organizacionId: query.organizacionId, activo: true },
        select: { usuario: { select: SELECT_USUARIO_PUBLICO } },
        distinct: ['usuarioId'],
      })
      return { data: miembros.map((m) => m.usuario) }
    }
    if (!esSuperadmin(auth)) {
      throw prohibido('Solo el SUPERADMIN puede listar usuarios')
    }
    const usuarios = await prisma.usuario.findMany({
      select: { id: true, email: true, nombre: true, apellido: true, activo: true },
      orderBy: { email: 'asc' },
    })
    return { data: usuarios }
  })

  app.get('/usuarios/:id', { preHandler: autenticar }, async (request, reply) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const esPropio = auth.usuarioId === id
    if (!esSuperadmin(auth) && !esPropio) {
      return reply.status(403).send(prohibido('Solo podés ver tu propio perfil'))
    }
    const usuario = await getPrisma().usuario.findUnique({
      where: { id },
      select: SELECT_USUARIO_PUBLICO,
    })
    if (!usuario) {
      throw noEncontrado('Usuario')
    }
    return { data: usuario }
  })

  app.patch('/usuarios/:id', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    if (!esSuperadmin(auth)) {
      throw prohibido('Solo el SUPERADMIN puede modificar cuentas')
    }
    const { id } = request.params as { id: string }
    const body = request.body as CambiarUsuarioBody
    const prisma = getPrisma()
    const existente = await prisma.usuario.findUnique({ where: { id }, select: { id: true } })
    if (!existente) {
      throw noEncontrado('Usuario')
    }
    if (body.email !== undefined && !EMAIL_RE.test(body.email)) {
      throw badRequest('El email no es válido')
    }
    if (body.password !== undefined && body.password.length < 8) {
      throw badRequest('La contraseña debe tener al menos 8 caracteres')
    }
    const passwordHash = body.password ? await hashPassword(body.password) : undefined
    const revocarAcceso = body.activo === false || passwordHash !== undefined
    const cambios = await prisma.$transaction(async (tx) => {
      const actualizado = await tx.usuario.update({
        where: { id },
        data: {
          activo: body.activo,
          email: body.email,
          nombre: body.nombre,
          apellido: body.apellido,
          passwordHash,
        },
        select: SELECT_USUARIO_PUBLICO,
      })
      if (revocarAcceso) {
        const ahora = new Date()
        await tx.session.updateMany({ where: { usuarioId: id, revokedAt: null }, data: { revokedAt: ahora } })
        await tx.passwordResetToken.updateMany({
          where: { usuarioId: id, usedAt: null, revokedAt: null },
          data: { revokedAt: ahora },
        })
      }
      await auditar(tx, {
        entidad: 'Usuario',
        entidadId: id,
        accion: 'UPDATE',
        usuarioId: auth.usuarioId,
        cambios: { campos: Object.keys(body), accesoRevocado: revocarAcceso },
      })
      return actualizado
    })
    return { data: cambios }
  })

  app.post('/usuarios/:id/roles', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as AsignarRolesBody
    if (!Array.isArray(body.roles)) {
      throw badRequest('El campo roles debe ser un arreglo')
    }
    const prisma = getPrisma()

    const existente = await prisma.usuario.findUnique({
      where: { id },
      include: { roles: { include: { rol: true } } },
    })
    if (!existente) {
      throw noEncontrado('Usuario')
    }
    await puedeAsignarRoles(
      prisma,
      auth,
      id,
      existente.roles
        .filter((rol) => rol.activo)
        .map((rol) => ({
          codigo: rol.rol.codigo,
          organizacionId: rol.organizacionId,
          torneoId: rol.torneoId,
          equipoId: rol.equipoId,
          jugadorId: rol.jugadorId,
        })),
      body.roles,
    )

    const rolesExistentes = await prisma.rol.findMany({
      where: { codigo: { in: body.roles.map((r) => r.codigo) } },
      select: { id: true, codigo: true },
    })
    const rolPorCodigo = new Map(rolesExistentes.map((r) => [r.codigo, r.id]))
    const rolIds = await Promise.all(
      body.roles.map(async (r) => {
        const idExistente = rolPorCodigo.get(r.codigo)
        if (idExistente) {
          return idExistente
        }
        const creado = await prisma.rol.create({ data: { codigo: r.codigo, nombre: r.codigo } })
        return creado.id
      }),
    )

    const antes = existente.roles.filter((r) => r.activo).map((r) => r.rol.codigo)
    await prisma.$transaction(async (tx) => {
      await tx.rolUsuario.deleteMany({ where: { usuarioId: id } })
      await tx.rolUsuario.createMany({
        data: body.roles.map((r, i) => ({
          usuarioId: id,
          rolId: rolIds[i] ?? '',
          organizacionId: r.organizacionId ?? null,
          torneoId: r.torneoId ?? null,
          equipoId: r.equipoId ?? null,
        })),
      })
    })
    const despues = body.roles.map((r) => r.codigo)
    await auditar(prisma, {
      entidad: 'Usuario',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { rolAntes: antes, rolDespues: despues },
    })

    const resultado = await prisma.usuario.findUnique({
      where: { id },
      select: SELECT_USUARIO_PUBLICO,
    })
    return { data: resultado }
  })

  app.delete('/usuarios/:id/roles', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const body = request.body as RetirarRolBody
    const prisma = getPrisma()

    const existente = await prisma.usuario.findUnique({
      where: { id },
      include: { roles: { include: { rol: true } } },
    })
    if (!existente) {
      throw noEncontrado('Usuario')
    }
    const actuales = existente.roles
      .filter((rol) => rol.activo)
      .map((rol) => ({
        codigo: rol.rol.codigo as RolCodigo,
        organizacionId: rol.organizacionId,
        torneoId: rol.torneoId,
        equipoId: rol.equipoId,
        jugadorId: rol.jugadorId,
      }))
    const objetivo = actuales.filter(
      (r) =>
        r.codigo !== body.codigo ||
        r.organizacionId !== (body.organizacionId ?? null) ||
        r.torneoId !== (body.torneoId ?? null) ||
        r.equipoId !== (body.equipoId ?? null),
    )
    if (objetivo.length === actuales.length) {
      throw badRequest('El rol indicado no existe para ese usuario')
    }

    const rol = await prisma.rol.findUnique({ where: { codigo: body.codigo }, select: { id: true } })
    if (!rol) {
      throw badRequest('El rol no existe')
    }

    const { organizacionId, torneoId, equipoId } = body
    const membresiasOrg = await prisma.rolUsuario.findMany({
      where: { organizacionId: organizacionId ?? undefined, activo: true, rol: { codigo: body.codigo } },
      select: { usuarioId: true },
    })
    if (
      body.codigo === 'ADMINISTRADOR' &&
      organizacionId &&
      !objetivo.some((o) => o.codigo === 'ADMINISTRADOR' && o.organizacionId === organizacionId) &&
      !membresiasOrg.some((m) => m.usuarioId !== id)
    ) {
      throw prohibido('No se puede retirar al último administrador de la organización')
    }

    await puedeAsignarRoles(prisma, auth, id, actuales, objetivo)

    await prisma.$transaction(async (tx) => {
      await tx.rolUsuario.deleteMany({
        where: { usuarioId: id, rolId: rol.id, organizacionId: organizacionId ?? null, torneoId: torneoId ?? null, equipoId: equipoId ?? null },
      })
      await auditar(tx, {
        entidad: 'Usuario',
        entidadId: id,
        accion: 'UPDATE',
        usuarioId: auth.usuarioId,
        cambios: { rolRetirado: { codigo: body.codigo, organizacionId, torneoId, equipoId } },
      })
    })

    const resultado = await prisma.usuario.findUnique({ where: { id }, select: SELECT_USUARIO_PUBLICO })
    return { data: resultado }
  })
}
