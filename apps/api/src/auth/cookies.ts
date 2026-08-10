import type { FastifyReply } from 'fastify'
import { env } from '../env.js'

const BASE_OPTS = {
  path: '/',
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: 'lax' as const,
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(env.SESSION_COOKIE_NAME, token, {
    ...BASE_OPTS,
    expires: expiresAt,
  })
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(env.SESSION_COOKIE_NAME, { ...BASE_OPTS })
}
