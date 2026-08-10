import type { FastifyInstance } from 'fastify'
import type { RolCodigo } from '@controlliga/shared'
import { getPrisma } from '../db.js'
import { badRequest, noEncontrado, prohibido } from '../http.js'
import { hashPassword } from '../auth/password.js'
import { autenticar, getAuth } from '../plugins/auth.js'
import { esSuperadmin } from '../auth/permisos.js'
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function usuariosRoutes(app: FastifyInstance): Promise<void> {
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
    const cambios = await prisma.usuario.update({
      where: { id },
      data: {
        activo: body.activo,
        email: body.email,
        nombre: body.nombre,
        apellido: body.apellido,
        passwordHash: body.password ? await hashPassword(body.password) : undefined,
      },
      select: SELECT_USUARIO_PUBLICO,
    })
    await auditar(prisma, {
      entidad: 'Usuario',
      entidadId: id,
      accion: 'UPDATE',
      usuarioId: auth.usuarioId,
      cambios: { campos: Object.keys(body) },
    })
    return { data: cambios }
  })

  app.post('/usuarios/:id/roles', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    if (!esSuperadmin(auth) && !auth.roles.some((r) => r.codigo === 'ADMINISTRADOR')) {
      throw prohibido('No tenés permiso para modificar roles')
    }
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
    const tieneSuperadmin = existente.roles.some((r) => r.activo && r.rol.codigo === 'SUPERADMIN')
    const actorSuperadmin = esSuperadmin(auth)
    if (tieneSuperadmin && !actorSuperadmin) {
      throw prohibido('No podés modificar los roles de un SUPERADMIN')
    }
    if (!actorSuperadmin && body.roles.some((r) => r.codigo === 'SUPERADMIN')) {
      throw prohibido('Solo el SUPERADMIN puede asignar ese rol')
    }

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
}
