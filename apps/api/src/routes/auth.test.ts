import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { getPrisma } from '../db.js'
import { conCookie, cookieDe, login, registrar } from '../test/helpers.js'
import { crearPersonaJugador } from '../test/seed.js'
import { limpiarBase } from '../test/limpiar.js'

const EMAIL = `auth-${Date.now()}@test.dev`

describe('autenticación', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await limpiarBase()
  })

  it('registro: crea cuenta, emite cookie y no expone la contraseña', async () => {
    const { res, token } = await registrar(app, {
      email: EMAIL,
      password: 'contraseña123',
      nombre: 'Juan',
      apellido: 'Prueba',
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.data.usuario.email).toBe(EMAIL)
    expect(body.data.usuario.roles.some((r: { codigo: string }) => r.codigo === 'JUGADOR')).toBe(true)
    expect(body.data.usuario.permisos).toContain('perfil:ver')
    expect(body.data.usuario).not.toHaveProperty('passwordHash')
    expect(JSON.stringify(body)).not.toContain('password')
    expect(token).toBeDefined()

    const enBase = await getPrisma().usuario.findUnique({ where: { email: EMAIL } })
    expect(enBase?.passwordHash).not.toBe('contraseña123')
    expect(enBase?.passwordHash).toMatch(/^scrypt\$/)
  })

  it('registro: rechaza email duplicado', async () => {
    const { res } = await registrar(app, {
      email: EMAIL,
      password: 'contraseña123',
      nombre: 'Juan',
      apellido: 'Prueba',
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('email_en_uso')
  })

  it('registro: rechaza contraseña corta', async () => {
    const { res } = await registrar(app, {
      email: `corto-${Date.now()}@test.dev`,
      password: '123',
      nombre: 'Ana',
      apellido: 'Prueba',
    })
    expect(res.statusCode).toBe(400)
  })

  it('registro con jugadorId vincula la cuenta', async () => {
    const { jugador } = await crearPersonaJugador('Carlos', 'Vinculado')
    const { res } = await registrar(app, {
      email: `vinculo-${Date.now()}@test.dev`,
      password: 'contraseña123',
      nombre: 'Carlos',
      apellido: 'Vinculado',
      jugadorId: jugador.id,
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().data.usuario.jugadorId).toBe(jugador.id)
  })

  it('login correcto: emite cookie de sesión', async () => {
    const { res, token } = await login(app, EMAIL, 'contraseña123')
    expect(res.statusCode).toBe(200)
    expect(token).toBeDefined()
  })

  it('login incorrecto: contraseña errónea da 401', async () => {
    const { res, token } = await login(app, EMAIL, 'contraseña-incorrecta')
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('no_autenticado')
    expect(token).toBeUndefined()
  })

  it('login incorrecto: email desconocido da 401', async () => {
    const { res } = await login(app, `noexiste-${Date.now()}@test.dev`, 'contraseña123')
    expect(res.statusCode).toBe(401)
  })

  it('sesión: /auth/me devuelve el usuario autenticado', async () => {
    const { token } = await login(app, EMAIL, 'contraseña123')
    expect(token).toBeDefined()
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: conCookie(token!),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.email).toBe(EMAIL)
    expect(res.json().data.roles.length).toBeGreaterThan(0)
  })

  it('endpoint protegido sin autenticación da 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.code).toBe('no_autenticado')
  })

  it('logout: revoca la sesión y la cookie deja de servir', async () => {
    const { token } = await login(app, EMAIL, 'contraseña123')
    expect(token).toBeDefined()

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: conCookie(token!),
    })
    expect(logout.statusCode).toBe(204)

    const trasLogout = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: conCookie(token!),
    })
    expect(trasLogout.statusCode).toBe(401)
  })

  it('refresh: rota el token y deja el anterior invalidado', async () => {
    const { token: tokenViejo } = await login(app, EMAIL, 'contraseña123')
    expect(tokenViejo).toBeDefined()

    const refresh = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: conCookie(tokenViejo!),
    })
    expect(refresh.statusCode).toBe(200)
    const tokenNuevo = cookieDe(refresh)
    expect(tokenNuevo).toBeDefined()
    expect(tokenNuevo).not.toBe(tokenViejo)

    const conNuevo = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: conCookie(tokenNuevo!),
    })
    expect(conNuevo.statusCode).toBe(200)

    const conViejo = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: conCookie(tokenViejo!),
    })
    expect(conViejo.statusCode).toBe(401)
  })

  it('refresh sin sesión da 401', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh' })
    expect(res.statusCode).toBe(401)
  })

  it('vinculación de jugador: se vincula la cuenta y queda auditado', async () => {
    const { jugador } = await crearPersonaJugador('Daniela', 'Vinculo')
    const email = `vincula2-${Date.now()}@test.dev`
    const { token } = await registrar(app, {
      email,
      password: 'contraseña123',
      nombre: 'Daniela',
      apellido: 'Vinculo',
    })
    expect(token).toBeDefined()

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/me/vincular-jugador',
      payload: { jugadorId: jugador.id },
      headers: conCookie(token!),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.jugadorId).toBe(jugador.id)

    const audit = await getPrisma().auditoriaLog.findFirst({
      where: { entidad: 'Jugador', entidadId: jugador.id },
    })
    expect(audit).not.toBeNull()

    const deNuevo = await app.inject({
      method: 'POST',
      url: '/api/auth/me/vincular-jugador',
      payload: { jugadorId: jugador.id },
      headers: conCookie(token!),
    })
    expect(deNuevo.statusCode).toBe(409)
  })
})
