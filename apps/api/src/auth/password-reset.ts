import { createHash, randomBytes } from 'node:crypto'
import type { FastifyRequest } from 'fastify'
import { env } from '../env.js'
import { getPrisma } from '../db.js'
import { auditar } from './auditoria.js'
import { hashPassword, validarPoliticaPassword, verifyPassword } from './password.js'
import { emailSender } from './email.js'
import { passwordRateLimiter } from './rate-limiter.js'
import { badRequest, noAutenticado } from '../http.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const hash = (valor: string) => createHash('sha256').update(valor).digest('hex')
const normalizarEmail = (email: string) => email.trim().toLowerCase()

function validarEntrada(email: string, password?: string): void {
  if (!EMAIL_RE.test(email)) throw badRequest('El email no es válido')
  if (password !== undefined) {
    const error = validarPoliticaPassword(password)
    if (error) throw badRequest(error)
  }
}

export async function solicitarReset(emailEntrada: string, request: FastifyRequest): Promise<void> {
  const email = normalizarEmail(emailEntrada)
  const emailClave = hash(email)
  const permitido = passwordRateLimiter.permitir(`forgot:ip:${request.ip}`) && passwordRateLimiter.permitir(`forgot:email:${emailClave}`)
  const prisma = getPrisma()
  if (!permitido) {
    await auditar(prisma, { entidad: 'PasswordReset', entidadId: 'rate-limit', accion: 'UPDATE', cambios: { tipo: 'bloqueado', ip: request.ip } })
    return
  }
  if (!EMAIL_RE.test(email)) return
  const usuario = await prisma.usuario.findUnique({ where: { email } })
  if (!usuario || !usuario.activo) return
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * 60_000)
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({ where: { usuarioId: usuario.id, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() } })
    await tx.passwordResetToken.create({ data: { usuarioId: usuario.id, tokenHash: hash(token), expiresAt } })
    await auditar(tx, { entidad: 'PasswordReset', entidadId: usuario.id, accion: 'CREATE', usuarioId: usuario.id, cambios: { tipo: 'solicitud' } })
  })
  try {
    await emailSender.enviarRecuperacion({ destinatario: email, url: `${env.PASSWORD_RESET_URL_BASE}?token=${encodeURIComponent(token)}`, expiraEn: expiresAt })
  } catch (error) {
    request.log.error({ err: error, usuarioId: usuario.id }, 'falló envío de recuperación')
  }
}

export async function resetearPassword(token: string, password: string): Promise<void> {
  const errorPassword = validarPoliticaPassword(password)
  if (errorPassword) throw badRequest(errorPassword)
  const tokenHash = hash(token)
  const prisma = getPrisma()
  const ahora = new Date()
  const registro = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { usuario: true } })
  if (!registro || registro.expiresAt <= ahora || registro.usedAt || registro.revokedAt || !registro.usuario.activo) throw badRequest('El enlace no es válido o expiró')
  const passwordHash = await hashPassword(password)
  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: registro.usuarioId }, data: { passwordHash } })
    await tx.passwordResetToken.update({ where: { id: registro.id }, data: { usedAt: ahora } })
    await tx.passwordResetToken.updateMany({ where: { usuarioId: registro.usuarioId, id: { not: registro.id }, usedAt: null, revokedAt: null }, data: { revokedAt: ahora } })
    const sesiones = await tx.session.updateMany({ where: { usuarioId: registro.usuarioId, revokedAt: null }, data: { revokedAt: ahora } })
    await auditar(tx, { entidad: 'Usuario', entidadId: registro.usuarioId, accion: 'UPDATE', usuarioId: registro.usuarioId, cambios: { tipo: 'password_reset', sesionesRevocadas: sesiones.count } })
  })
}

export async function cambiarPassword(usuarioId: string, actual: string, nueva: string): Promise<void> {
  const error = validarPoliticaPassword(nueva)
  if (error) throw badRequest(error)
  const prisma = getPrisma()
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } })
  if (!usuario || !usuario.activo || !(await verifyPassword(actual, usuario.passwordHash))) throw noAutenticado()
  const passwordHash = await hashPassword(nueva)
  const ahora = new Date()
  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: usuarioId }, data: { passwordHash } })
    const sesiones = await tx.session.updateMany({ where: { usuarioId, revokedAt: null }, data: { revokedAt: ahora } })
    await auditar(tx, { entidad: 'Usuario', entidadId: usuarioId, accion: 'UPDATE', usuarioId, cambios: { tipo: 'password_change', sesionesRevocadas: sesiones.count } })
  })
}

export function resetRateLimitado(token: string, request: FastifyRequest): boolean {
  return passwordRateLimiter.permitir(`reset:ip:${request.ip}`) && passwordRateLimiter.permitir(`reset:token:${hash(token)}`)
}

export { hash as hashPasswordResetToken, validarEntrada }
