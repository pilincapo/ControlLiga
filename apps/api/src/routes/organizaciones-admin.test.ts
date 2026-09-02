import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { conCookie, login } from '../test/helpers.js'
import { crearOrganizacion, crearUsuario } from '../test/seed.js'
import { limpiarBase } from '../test/limpiar.js'

const suf = Date.now().toString(36)
const email = (rol: string) => `${rol}-${suf}@test.dev`

describe('administración de organizaciones', () => {
  let app: FastifyInstance

  let orgA: { id: string }
  let orgDelegado: { id: string }
  let usuarioAdmin: { id: string }
  let usuarioSuper: { id: string }
  let usuarioMiembro: { id: string }
  let usuarioSoloAdmin: { id: string }

  let tokenAdmin: string
  let tokenSuper: string

  beforeAll(async () => {
    app = buildApp()
    await app.ready()

    orgA = await crearOrganizacion('Org Admin')
    orgDelegado = await crearOrganizacion('Org Delegado')

    usuarioAdmin = await crearUsuario({
      email: email('admin'),
      roles: [{ codigo: 'ADMINISTRADOR', organizacionId: orgA.id }],
    })
    usuarioSuper = await crearUsuario({
      email: email('super'),
      roles: [{ codigo: 'SUPERADMIN' }],
    })
    usuarioMiembro = await crearUsuario({
      email: email('miembro'),
      roles: [{ codigo: 'JUGADOR' }, { codigo: 'ADMINISTRADOR', organizacionId: orgA.id }],
    })
    usuarioSoloAdmin = await crearUsuario({
      email: email('soloadmin'),
      roles: [{ codigo: 'ADMINISTRADOR', organizacionId: orgDelegado.id }],
    })

    tokenAdmin = (await login(app, usuarioAdmin.email, 'contraseña123')).token!
    tokenSuper = (await login(app, usuarioSuper.email, 'contraseña123')).token!
  })

  afterAll(async () => {
    await app.close()
    await limpiarBase()
  })

  it('GET /organizaciones devuelve solo las organizaciones del admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/organizaciones',
      headers: conCookie(tokenAdmin),
    })
    expect(res.statusCode).toBe(200)
    const ids = (res.json().data as Array<{ id: string }>).map((o) => o.id)
    expect(ids).toContain(orgA.id)
    expect(ids).not.toContain(orgDelegado.id)
  })

  it('GET /organizaciones del superadmin devuelve todas', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/organizaciones',
      headers: conCookie(tokenSuper),
    })
    expect(res.statusCode).toBe(200)
    const ids = (res.json().data as Array<{ id: string }>).map((o) => o.id)
    expect(ids).toContain(orgA.id)
    expect(ids).toContain(orgDelegado.id)
  })

  it('POST /organizaciones solo lo puede hacer el SUPERADMIN', async () => {
    const admin = await app.inject({
      method: 'POST',
      url: '/api/organizaciones',
      payload: { nombre: 'Org No Autorizada' },
      headers: conCookie(tokenAdmin),
    })
    expect(admin.statusCode).toBe(403)

    const superadmin = await app.inject({
      method: 'POST',
      url: '/api/organizaciones',
      payload: { nombre: 'Nueva Org Supe' },
      headers: conCookie(tokenSuper),
    })
    expect(superadmin.statusCode).toBe(201)
    const creada = superadmin.json().data
    expect(creada.nombre).toBe('Nueva Org Supe')

    const membresia = await app.inject({
      method: 'GET',
      url: `/api/organizaciones/${creada.id}/usuarios`,
      headers: conCookie(tokenSuper),
    })
    expect(membresia.statusCode).toBe(200)
    const miembros = (membresia.json().data as Array<{ email: string; roles: Array<{ codigo: string }> }>)
    const superComoMiembro = miembros.find((m) => m.email === usuarioSuper.email)
    expect(superComoMiembro).toBeDefined()
    expect(superComoMiembro!.roles.map((r) => r.codigo)).toContain('ADMINISTRADOR')
  })

  it('GET /organizaciones/:id/usuarios lista los miembros de la org', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/organizaciones/${orgA.id}/usuarios`,
      headers: conCookie(tokenAdmin),
    })
    expect(res.statusCode).toBe(200)
    const emails = (res.json().data as Array<{ email: string }>).map((u) => u.email)
    expect(emails).toContain(usuarioAdmin.email)
    expect(emails).toContain(usuarioMiembro.email)
  })

  it('GET /usuarios?organizacionId= lista los miembros de la org', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/usuarios?organizacionId=${orgA.id}`,
      headers: conCookie(tokenAdmin),
    })
    expect(res.statusCode).toBe(200)
    const emails = (res.json().data as Array<{ email: string }>).map((u) => u.email)
    expect(emails).toContain(usuarioMiembro.email)
  })

  it('DELETE /usuarios/:id/roles retira un rol específico sin romper los demás', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/usuarios/${usuarioMiembro.id}/roles`,
      payload: { codigo: 'JUGADOR' },
      headers: conCookie(tokenAdmin),
    })
    expect(res.statusCode).toBe(200)
    const codigos = (res.json().data.roles as Array<{ rol: { codigo: string } }>).map((r) => r.rol.codigo)
    expect(codigos).not.toContain('JUGADOR')
    expect(codigos).toContain('ADMINISTRADOR')
  })

  it('DELETE no puede retirar al último ADMINISTRADOR de una organización', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/usuarios/${usuarioSoloAdmin.id}/roles`,
      payload: { codigo: 'ADMINISTRADOR', organizacionId: orgDelegado.id },
      headers: conCookie(tokenSuper),
    })
    expect(res.statusCode).toBe(403)
  })

  it('DELETE retira el último ADMINISTRADOR si queda otro en la org', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/usuarios/${usuarioAdmin.id}/roles`,
      payload: { codigo: 'ADMINISTRADOR', organizacionId: orgA.id },
      headers: conCookie(tokenSuper),
    })
    expect(res.statusCode).toBe(200)
  })
})