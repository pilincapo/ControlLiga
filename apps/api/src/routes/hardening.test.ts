import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { getPrisma } from '../db.js'
import { loginIpRateLimiter, loginRateLimiter } from '../auth/rate-limiter.js'
import { conCookie, login } from '../test/helpers.js'
import {
  agregarJugadorAEquipo,
  agregarMiembroEquipo,
  crearEquipo,
  crearPersonaJugador,
  crearUsuario,
} from '../test/seed.js'
import { limpiarBase } from '../test/limpiar.js'

const sufijo = Date.now().toString(36)
const email = (nombre: string) => `${nombre}-hardening-${sufijo}@test.dev`

describe('hardening FASE 14', () => {
  let app: FastifyInstance
  let tokenSuper: string
  let tokenDelegadoA: string
  let usuarioDesactivado: { id: string; email: string }
  let tokenDesactivado: string
  let equipoB: { id: string }
  let jugadorB: { id: string }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
    const superadmin = await crearUsuario({ email: email('super'), roles: [{ codigo: 'SUPERADMIN' }] })
    const delegado = await crearUsuario({ email: email('delegado'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    const equipoA = await crearEquipo('Equipo hardening A')
    equipoB = await crearEquipo('Equipo hardening B')
    await agregarMiembroEquipo(delegado.id, equipoA.id, 'DELEGADO')
    jugadorB = (await crearPersonaJugador('Jugador', 'Privado')).jugador
    await agregarJugadorAEquipo(jugadorB.id, equipoB.id)
    usuarioDesactivado = await crearUsuario({ email: email('desactivado'), roles: [{ codigo: 'JUGADOR' }] })
    tokenSuper = (await login(app, superadmin.email, 'contraseña123')).token!
    tokenDelegadoA = (await login(app, delegado.email, 'contraseña123')).token!
    tokenDesactivado = (await login(app, usuarioDesactivado.email, 'contraseña123')).token!
  })

  afterAll(async () => {
    loginRateLimiter.limpiar()
    loginIpRateLimiter.limpiar()
    await app.close()
    await limpiarBase()
  })

  it('revoca sesión y tokens de reset al desactivar usuario', async () => {
    const ahora = new Date(Date.now() + 60_000)
    await getPrisma().passwordResetToken.create({
      data: { usuarioId: usuarioDesactivado.id, tokenHash: `token-${sufijo}`, expiresAt: ahora },
    })
    const cambio = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/${usuarioDesactivado.id}`,
      payload: { activo: false },
      headers: conCookie(tokenSuper),
    })
    expect(cambio.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/api/auth/me', headers: conCookie(tokenDesactivado) })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: '/api/auth/refresh', headers: conCookie(tokenDesactivado) })).statusCode).toBe(401)
    expect(await getPrisma().session.count({ where: { usuarioId: usuarioDesactivado.id, revokedAt: null } })).toBe(0)
    expect(await getPrisma().passwordResetToken.count({ where: { usuarioId: usuarioDesactivado.id, revokedAt: null } })).toBe(0)
  })

  it('limita login por IP e identidad sin bloqueo permanente', async () => {
    loginRateLimiter.limpiar()
    loginIpRateLimiter.limpiar()
    const respuestas = await Promise.all(
      Array.from({ length: 11 }, () =>
        app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: email('rate'), password: 'incorrecta' } }),
      ),
    )
    expect(respuestas.slice(0, 10).every((respuesta) => respuesta.statusCode === 401)).toBe(true)
    expect(respuestas[10]?.statusCode).toBe(429)
    loginRateLimiter.limpiar()
    loginIpRateLimiter.limpiar()
  })

  it('bloquea estadísticas privadas de otro equipo', async () => {
    const estadisticas = await app.inject({
      method: 'GET',
      url: `/api/equipos/${equipoB.id}/estadisticas`,
      headers: conCookie(tokenDelegadoA),
    })
    expect(estadisticas.statusCode).toBe(403)
  })
})
