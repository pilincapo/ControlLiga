import type { FastifyInstance } from 'fastify'

type Headers = Record<string, unknown>

const COOKIE_NAME = 'cl_session'

export function cookieDe(res: { headers: Headers }): string | undefined {
  const setCookie = res.headers['set-cookie']
  const valor = Array.isArray(setCookie) ? setCookie[0] : setCookie
  if (typeof valor !== 'string') {
    return undefined
  }
  const match = valor.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
  return match?.[1]
}

export function conCookie(token: string): { cookie: string } {
  return { cookie: `${COOKIE_NAME}=${token}` }
}

export async function registrar(
  app: FastifyInstance,
  datos: Record<string, unknown>,
): Promise<{ res: Awaited<ReturnType<FastifyInstance['inject']>>; token?: string }> {
  const res = await app.inject({ method: 'POST', url: '/api/auth/register', payload: datos })
  return { res, token: cookieDe(res) }
}

export async function login(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<{ res: Awaited<ReturnType<FastifyInstance['inject']>>; token?: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  })
  return { res, token: cookieDe(res) }
}
