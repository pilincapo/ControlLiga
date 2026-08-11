import type { FastifyRequest } from 'fastify'
import { env } from '../env.js'
import { getPrisma } from '../db.js'
import { conflicto, noAutenticado, noEncontrado, badRequest } from '../http.js'
import { hashPassword, validarPoliticaPassword, verifyPassword } from './password.js'
import { generarTokenSesion, hashTokenSesion } from './sesiones.js'
import { aContextoAuth, aUsuarioSesion, INCLUDE_USUARIO_SESION } from './contexto.js'
import type { ContextoAuth, UsuarioSesionPayload } from './contexto.js'
import { auditar } from './auditoria.js'
import type { PrismaClient } from '../generated/prisma/client.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface MetaConexion {
  ip?: string
  userAgent?: string
}

export interface SesionEmitida {
  token: string
  expiresAt: Date
  usuario: UsuarioSesionPayload
}

function metaDe(request: FastifyRequest): MetaConexion {
  return {
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  }
}

export function tokenDeCookie(request: FastifyRequest): string | null {
  return request.cookies?.[env.SESSION_COOKIE_NAME] ?? null
}

export async function crearSesion(
  prisma: PrismaClient,
  usuarioId: string,
  meta: MetaConexion,
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const token = generarTokenSesion()
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_MS)
  const sesion = await prisma.session.create({
    data: {
      usuarioId,
      tokenHash: hashTokenSesion(token),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      expiresAt,
    },
  })
  return { token, expiresAt, id: sesion.id }
}

export async function validarSesion(request: FastifyRequest): Promise<ContextoAuth | null> {
  const token = tokenDeCookie(request)
  if (!token) {
    return null
  }
  const prisma = getPrisma()
  const sesion = await prisma.session.findUnique({
    where: { tokenHash: hashTokenSesion(token) },
  })
  if (!sesion || sesion.revokedAt !== null || sesion.expiresAt < new Date()) {
    return null
  }
  await prisma.session.update({
    where: { id: sesion.id },
    data: { lastUsedAt: new Date() },
  })
  const usuario = await prisma.usuario.findUnique({
    where: { id: sesion.usuarioId },
    include: INCLUDE_USUARIO_SESION,
  })
  if (!usuario) {
    return null
  }
  return aContextoAuth(usuario)
}

export async function revocarSesionActual(request: FastifyRequest): Promise<boolean> {
  const token = tokenDeCookie(request)
  if (!token) {
    return false
  }
  const prisma = getPrisma()
  const resultado = await prisma.session.updateMany({
    where: { tokenHash: hashTokenSesion(token), revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return resultado.count > 0
}

export async function rotarSesion(request: FastifyRequest): Promise<SesionEmitida | null> {
  const token = tokenDeCookie(request)
  if (!token) {
    return null
  }
  const prisma = getPrisma()
  const sesion = await prisma.session.findUnique({
    where: { tokenHash: hashTokenSesion(token) },
  })
  if (!sesion || sesion.revokedAt !== null || sesion.expiresAt < new Date()) {
    return null
  }
  const usuario = await prisma.usuario.findUniqueOrThrow({
    where: { id: sesion.usuarioId },
    include: INCLUDE_USUARIO_SESION,
  })
  await prisma.session.update({
    where: { id: sesion.id },
    data: { revokedAt: new Date() },
  })
  const nueva = await crearSesion(prisma, sesion.usuarioId, metaDe(request))
  return { ...nueva, usuario }
}

export async function registrarUsuario(datos: {
  email: string
  password: string
  nombre: string
  apellido: string
  jugadorId?: string
  dni?: string
}, request: FastifyRequest): Promise<SesionEmitida> {
  const email = datos.email.trim().toLowerCase()
  const nombre = datos.nombre.trim()
  const apellido = datos.apellido.trim()
  const dni = datos.dni?.trim() || undefined

  if (!EMAIL_RE.test(email)) {
    throw badRequest('El email no es válido')
  }
  if (nombre.length < 2) {
    throw badRequest('El nombre es obligatorio')
  }
  if (apellido.length < 2) {
    throw badRequest('El apellido es obligatorio')
  }
  const errorPassword = validarPoliticaPassword(datos.password)
  if (errorPassword) {
    throw badRequest(errorPassword)
  }

  const prisma = getPrisma()
  const existente = await prisma.usuario.findUnique({ where: { email }, select: { id: true } })
  if (existente) {
    throw conflicto('email_en_uso', 'Ya existe una cuenta con ese email')
  }

  let jugadorId: string | undefined

  if (datos.jugadorId) {
    const jugador = await prisma.jugador.findUnique({
      where: { id: datos.jugadorId },
      include: { persona: true },
    })
    if (!jugador) {
      throw noEncontrado('Jugador')
    }
    const identidadCoincide =
      (dni !== undefined && jugador.persona.dni !== null && jugador.persona.dni === dni) ||
      (jugador.persona.email !== null && jugador.persona.email.toLowerCase() === email)
    if (!identidadCoincide) {
      throw badRequest('No se pudo verificar la identidad: el DNI o el email no coinciden con el jugador')
    }
    const vinculado = await prisma.usuario.findUnique({ where: { jugadorId: jugador.id } })
    if (vinculado) {
      throw conflicto('jugador_vinculado', 'Ese jugador ya está vinculado a otra cuenta')
    }
    jugadorId = jugador.id
  } else if (dni !== undefined) {
    const persona = await prisma.persona.findUnique({
      where: { dni },
      include: { jugador: true },
    })
    if (persona?.jugador) {
      const vinculado = await prisma.usuario.findUnique({ where: { jugadorId: persona.jugador.id } })
      if (!vinculado) {
        jugadorId = persona.jugador.id
      }
    }
  }

  const rol = await prisma.rol.upsert({
    where: { codigo: 'JUGADOR' },
    update: {},
    create: { codigo: 'JUGADOR', nombre: 'Jugador' },
  })

  const usuario = await prisma.usuario.create({
    data: {
      email,
      passwordHash: await hashPassword(datos.password),
      nombre,
      apellido,
      jugadorId: jugadorId ?? null,
      roles: { create: [{ rolId: rol.id }] },
    },
    include: INCLUDE_USUARIO_SESION,
  })

  await auditar(prisma, {
    entidad: 'Usuario',
    entidadId: usuario.id,
    accion: 'CREATE',
    cambios: { email: usuario.email },
  })
  if (jugadorId) {
    await auditar(prisma, {
      entidad: 'Jugador',
      entidadId: jugadorId,
      accion: 'UPDATE',
      usuarioId: usuario.id,
      cambios: { vinculadoAUsuarioId: usuario.id },
    })
  }

  const sesion = await crearSesion(prisma, usuario.id, metaDe(request))
  return { ...sesion, usuario }
}

export async function iniciarSesion(datos: { email: string; password: string }, request: FastifyRequest): Promise<SesionEmitida> {
  const prisma = getPrisma()
  const email = datos.email.trim().toLowerCase()
  const usuario = await prisma.usuario.findUnique({
    where: { email },
    include: INCLUDE_USUARIO_SESION,
  })
  if (!usuario || !usuario.activo) {
    throw noAutenticado()
  }
  const valida = await verifyPassword(datos.password, usuario.passwordHash)
  if (!valida) {
    throw noAutenticado()
  }

  const sesion = await crearSesion(prisma, usuario.id, metaDe(request))
  await auditar(prisma, {
    entidad: 'Sesion',
      entidadId: sesion.id,
    accion: 'CREATE',
    usuarioId: usuario.id,
    cambios: { tipo: 'login', ip: metaDe(request).ip ?? null },
  })
  return { ...sesion, usuario }
}

export async function cerrarSesion(request: FastifyRequest): Promise<void> {
  const prisma = getPrisma()
  const revocada = await revocarSesionActual(request)
  if (revocada) {
    await auditar(prisma, {
      entidad: 'Sesion',
      entidadId: 'sesion-actual',
      accion: 'DELETE',
      usuarioId: request.auth?.usuarioId ?? null,
      cambios: { tipo: 'logout' },
    })
  }
}

export async function vincularJugador(
  contexto: ContextoAuth,
  jugadorId: string,
  dni?: string,
): Promise<UsuarioSesionPayload> {
  if (contexto.jugadorId) {
    throw conflicto('ya_vinculado', 'Tu cuenta ya está vinculada a un jugador')
  }
  const prisma = getPrisma()
  const jugador = await prisma.jugador.findUnique({
    where: { id: jugadorId },
    include: { persona: true },
  })
  if (!jugador) {
    throw noEncontrado('Jugador')
  }
  const identidadCoincide =
    (dni !== undefined && dni.trim().length > 0 && jugador.persona.dni !== null && jugador.persona.dni === dni.trim()) ||
    (jugador.persona.email !== null && jugador.persona.email.toLowerCase() === contexto.email.toLowerCase())
  if (!identidadCoincide) {
    throw badRequest('No se pudo verificar la identidad: el DNI o el email no coinciden con el jugador')
  }
  const vinculado = await prisma.usuario.findUnique({ where: { jugadorId } })
  if (vinculado) {
    throw conflicto('jugador_vinculado', 'Ese jugador ya está vinculado a otra cuenta')
  }
  const usuario = await prisma.usuario.update({
    where: { id: contexto.usuarioId },
    data: { jugadorId },
    include: INCLUDE_USUARIO_SESION,
  })
  await auditar(prisma, {
    entidad: 'Jugador',
    entidadId: jugadorId,
    accion: 'UPDATE',
    usuarioId: contexto.usuarioId,
    cambios: { vinculadoAUsuarioId: contexto.usuarioId },
  })
  return usuario
}

export async function obtenerUsuarioSesion(usuarioId: string): Promise<UsuarioSesionPayload> {
  return getPrisma().usuario.findUniqueOrThrow({
    where: { id: usuarioId },
    include: INCLUDE_USUARIO_SESION,
  })
}

export function aSesionResponder(emitida: SesionEmitida): {
  usuario: ReturnType<typeof aUsuarioSesion>
  expira: string
} {
  return { usuario: aUsuarioSesion(emitida.usuario), expira: emitida.expiresAt.toISOString() }
}

export function aMeResponder(usuario: UsuarioSesionPayload): ReturnType<typeof aUsuarioSesion> {
  return aUsuarioSesion(usuario)
}
