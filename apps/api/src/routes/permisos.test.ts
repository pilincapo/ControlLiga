import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { getPrisma } from '../db.js'
import { conCookie, login } from '../test/helpers.js'
import {
  agregarJugadorAEquipo,
  agregarMiembroEquipo,
  crearEquipo,
  crearOrganizacion,
  crearPersonaJugador,
  crearUsuario,
} from '../test/seed.js'
import { limpiarBase } from '../test/limpiar.js'

const suf = Date.now().toString(36)
const email = (rol: string) => `${rol}-${suf}@test.dev`

describe('autorización por rol y alcance', () => {
  let app: FastifyInstance

  let orgA: { id: string }
  let orgB: { id: string }
  let equipoA: { id: string }
  let equipoB: { id: string }
  let jugadorX: { id: string }
  let jugadorY: { id: string }
  let usuarioJugador: { id: string }
  let usuarioDelegado: { id: string }
  let usuarioAdmin: { id: string }
  let usuarioSuper: { id: string }

  let tokenJugador: string
  let tokenDelegado: string
  let tokenAdmin: string
  let tokenSuper: string

  beforeAll(async () => {
    app = buildApp()
    await app.ready()

    orgA = await crearOrganizacion('Org A')
    orgB = await crearOrganizacion('Org B')
    equipoA = await crearEquipo('Equipo A')
    equipoB = await crearEquipo('Equipo B')

    const jx = await crearPersonaJugador('Jugador', 'X')
    const jy = await crearPersonaJugador('Jugador', 'Y')
    jugadorX = jx.jugador
    jugadorY = jy.jugador
    await agregarJugadorAEquipo(jugadorX.id, equipoA.id, 10)
    await agregarJugadorAEquipo(jugadorY.id, equipoB.id, 9)

    usuarioJugador = await crearUsuario({
      email: email('jugador'),
      jugadorId: jugadorX.id,
      roles: [{ codigo: 'JUGADOR' }],
    })
    usuarioDelegado = await crearUsuario({
      email: email('delegado'),
      roles: [{ codigo: 'DELEGADO_TECNICO' }],
    })
    await agregarMiembroEquipo(usuarioDelegado.id, equipoA.id, 'DELEGADO')

    usuarioAdmin = await crearUsuario({
      email: email('admin'),
      roles: [{ codigo: 'ADMINISTRADOR', organizacionId: orgA.id }],
    })
    usuarioSuper = await crearUsuario({
      email: email('super'),
      roles: [{ codigo: 'SUPERADMIN' }],
    })

    tokenJugador = (await login(app, usuarioJugador.email, 'contraseña123')).token!
    tokenDelegado = (await login(app, usuarioDelegado.email, 'contraseña123')).token!
    tokenAdmin = (await login(app, usuarioAdmin.email, 'contraseña123')).token!
    tokenSuper = (await login(app, usuarioSuper.email, 'contraseña123')).token!
  })

  afterAll(async () => {
    await app.close()
    await limpiarBase()
  })

  it('endpoint protegido sin autenticación da 401', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/equipos/${equipoA.id}` })
    expect(res.statusCode).toBe(401)
  })

  it('ADMINISTRADOR accede a su organización', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/organizaciones/${orgA.id}`,
      headers: conCookie(tokenAdmin),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.id).toBe(orgA.id)
  })

  it('ADMINISTRADOR no accede a otra organización', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/organizaciones/${orgB.id}`,
      headers: conCookie(tokenAdmin),
    })
    expect(res.statusCode).toBe(403)
  })

  it('DELEGADO_TECNICO accede a su equipo', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/equipos/${equipoA.id}`,
      headers: conCookie(tokenDelegado),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.nombre).toBe('Equipo A')
  })

  it('DELEGADO_TECNICO no accede a otro equipo', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/equipos/${equipoB.id}`,
      headers: conCookie(tokenDelegado),
    })
    expect(res.statusCode).toBe(403)
  })

  it('JUGADOR accede a su propio perfil de jugador', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/jugadores/${jugadorX.id}`,
      headers: conCookie(tokenJugador),
    })
    expect(res.statusCode).toBe(200)
  })

  it('JUGADOR no accede al perfil de otro jugador', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/jugadores/${jugadorY.id}`,
      headers: conCookie(tokenJugador),
    })
    expect(res.statusCode).toBe(403)
  })

  it('JUGADOR no puede modificar su cuenta de usuario', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/${usuarioJugador.id}`,
      payload: { nombre: 'Hackeado' },
      headers: conCookie(tokenJugador),
    })
    expect(res.statusCode).toBe(403)
  })

  it('JUGADOR no puede modificar a otro jugador', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/jugadores/${jugadorY.id}`,
      payload: { telefono: '1555000000' },
      headers: conCookie(tokenJugador),
    })
    expect(res.statusCode).toBe(403)
  })

  it('JUGADOR puede modificar sus datos personales', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/jugadores/${jugadorX.id}`,
      payload: { pieDominante: 'Zurdo', alturaCm: 178 },
      headers: conCookie(tokenJugador),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.pieDominante).toBe('Zurdo')
  })

  it('JUGADOR no puede modificar datos de contacto propios (no permitido)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/jugadores/${jugadorX.id}`,
      payload: { telefono: '1555111111' },
      headers: conCookie(tokenJugador),
    })
    expect(res.statusCode).toBe(403)
  })

  it('DELEGADO_TECNICO modifica jugador de su equipo', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/jugadores/${jugadorX.id}`,
      payload: { telefono: '1555999999' },
      headers: conCookie(tokenDelegado),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.persona.telefono).toBe('1555999999')
  })

  it('SUPERADMIN accede globalmente', async () => {
    const org = await app.inject({
      method: 'GET',
      url: `/api/organizaciones/${orgB.id}`,
      headers: conCookie(tokenSuper),
    })
    expect(org.statusCode).toBe(200)

    const equipo = await app.inject({
      method: 'GET',
      url: `/api/equipos/${equipoB.id}`,
      headers: conCookie(tokenSuper),
    })
    expect(equipo.statusCode).toBe(200)

    const jugador = await app.inject({
      method: 'GET',
      url: `/api/jugadores/${jugadorY.id}`,
      headers: conCookie(tokenSuper),
    })
    expect(jugador.statusCode).toBe(200)
  })

  it('SUPERADMIN puede modificar cuentas', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/usuarios/${usuarioJugador.id}`,
      payload: { nombre: 'Juan Actualizado' },
      headers: conCookie(tokenSuper),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.nombre).toBe('Juan Actualizado')
  })

  it('ADMINISTRADOR no puede asignar SUPERADMIN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/usuarios/${usuarioJugador.id}/roles`,
      payload: { roles: [{ codigo: 'SUPERADMIN' }] },
      headers: conCookie(tokenAdmin),
    })
    expect(res.statusCode).toBe(403)
  })

  it('ADMINISTRADOR no puede asignar alcance de otra organización', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/usuarios/${usuarioJugador.id}/roles`,
      payload: { roles: [{ codigo: 'ADMINISTRADOR', organizacionId: orgB.id }] },
      headers: conCookie(tokenAdmin),
    })
    expect(res.statusCode).toBe(403)
  })

  it('ADMINISTRADOR no puede asignar DELEGADO_TECNICO ni editarse roles propios', async () => {
    const vertical = await app.inject({
      method: 'POST',
      url: `/api/usuarios/${usuarioJugador.id}/roles`,
      payload: { roles: [{ codigo: 'DELEGADO_TECNICO' }] },
      headers: conCookie(tokenAdmin),
    })
    expect(vertical.statusCode).toBe(403)
    const propio = await app.inject({
      method: 'POST',
      url: `/api/usuarios/${usuarioAdmin.id}/roles`,
      payload: { roles: [{ codigo: 'ADMINISTRADOR', organizacionId: orgA.id }] },
      headers: conCookie(tokenAdmin),
    })
    expect(propio.statusCode).toBe(403)
  })

  it('ADMINISTRADOR asigna roles de su organización y queda auditado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/usuarios/${usuarioJugador.id}/roles`,
      payload: { roles: [{ codigo: 'JUGADOR' }, { codigo: 'ADMINISTRADOR', organizacionId: orgA.id }] },
      headers: conCookie(tokenAdmin),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.roles.length).toBe(2)

    const audit = await getPrisma().auditoriaLog.findFirst({
      where: { entidad: 'Usuario', entidadId: usuarioJugador.id, accion: 'UPDATE' },
      orderBy: { fecha: 'desc' },
    })
    expect(audit).not.toBeNull()
  })

  it('el mismo usuario puede tener varios roles', async () => {
    const usuarioMixto = await crearUsuario({
      email: email('mixto'),
      roles: [{ codigo: 'ADMINISTRADOR', organizacionId: orgA.id }, { codigo: 'JUGADOR' }],
    })
    const tokenMixto = (await login(app, usuarioMixto.email, 'contraseña123')).token!
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: conCookie(tokenMixto),
    })
    expect(me.statusCode).toBe(200)
    const codigos = me.json().data.roles.map((r: { codigo: string }) => r.codigo)
    expect(codigos).toContain('ADMINISTRADOR')
    expect(codigos).toContain('JUGADOR')
  })
})
