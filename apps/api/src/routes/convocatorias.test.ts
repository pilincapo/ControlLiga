import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { getPrisma } from '../db.js'
import { conCookie, login } from '../test/helpers.js'
import { crearPartido, crearUsuario } from '../test/seed.js'
import { limpiarBase } from '../test/limpiar.js'

const suf = Date.now().toString(36)
const email = (rol: string) => `${rol}-${suf}@test.dev`

describe('módulo de convocatorias (FASE 6)', () => {
  let app: FastifyInstance

  let usuarioDelegadoA: { id: string; email: string }
  let usuarioTecnicoA: { id: string; email: string }
  let usuarioAuxiliarA: { id: string; email: string }
  let usuarioDelegadoB: { id: string; email: string }
  let usuarioJugador: { id: string; email: string }
  let usuarioJugador2: { id: string; email: string }

  let tokenDelegadoA: string
  let tokenTecnicoA: string
  let tokenAuxiliarA: string
  let tokenDelegadoB: string
  let tokenJugador: string
  let tokenJugador2: string

  let equipoA: { id: string }
  let jugadorX: string
  let jugadorY: string
  let jugadorBaja: string

  async function incorporar(equipoId: string, nombre: string, apellido: string, dni?: string): Promise<string> {
    const res = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoId}/jugadores`,
      payload: { persona: { nombre, apellido, dni }, dorsal: 10 },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    return res.json().data.id
  }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()

    usuarioDelegadoA = await crearUsuario({ email: email('delegadoa'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    usuarioTecnicoA = await crearUsuario({ email: email('tecnicoa'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    usuarioAuxiliarA = await crearUsuario({ email: email('auxiliara'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    usuarioDelegadoB = await crearUsuario({ email: email('delegadob'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    usuarioJugador = await crearUsuario({ email: email('jugador'), roles: [{ codigo: 'JUGADOR' }] })
    usuarioJugador2 = await crearUsuario({ email: email('jugador2'), roles: [{ codigo: 'JUGADOR' }] })

    tokenDelegadoA = (await login(app, usuarioDelegadoA.email, 'contraseña123')).token!
    tokenTecnicoA = (await login(app, usuarioTecnicoA.email, 'contraseña123')).token!
    tokenAuxiliarA = (await login(app, usuarioAuxiliarA.email, 'contraseña123')).token!
    tokenDelegadoB = (await login(app, usuarioDelegadoB.email, 'contraseña123')).token!
    tokenJugador = (await login(app, usuarioJugador.email, 'contraseña123')).token!
    tokenJugador2 = (await login(app, usuarioJugador2.email, 'contraseña123')).token!

    const eqA = await app.inject({ method: 'POST', url: '/api/equipos', payload: { nombre: 'Convoc A' }, headers: conCookie(tokenDelegadoA) })
    equipoA = { id: eqA.json().data.id }

    await app.inject({ method: 'POST', url: `/api/equipos/${equipoA.id}/administradores`, payload: { usuarioId: usuarioTecnicoA.id, rolEnEquipo: 'TECNICO' }, headers: conCookie(tokenDelegadoA) })
    await app.inject({ method: 'POST', url: `/api/equipos/${equipoA.id}/administradores`, payload: { usuarioId: usuarioAuxiliarA.id, rolEnEquipo: 'AUXILIAR' }, headers: conCookie(tokenDelegadoA) })

    jugadorX = await incorporar(equipoA.id, 'Jugador', 'Uno')
    jugadorY = await incorporar(equipoA.id, 'Jugador', 'Dos')

    // vincular jugadores a usuarios
    const jx = await getPrisma().equipoJugador.findUnique({ where: { id: jugadorX }, select: { jugadorId: true } })
    const jy = await getPrisma().equipoJugador.findUnique({ where: { id: jugadorY }, select: { jugadorId: true } })
    await getPrisma().usuario.update({ where: { id: usuarioJugador.id }, data: { jugadorId: jx!.jugadorId } })
    await getPrisma().usuario.update({ where: { id: usuarioJugador2.id }, data: { jugadorId: jy!.jugadorId } })
    tokenJugador = (await login(app, usuarioJugador.email, 'contraseña123')).token!
    tokenJugador2 = (await login(app, usuarioJugador2.email, 'contraseña123')).token!

    const jbId = await incorporar(equipoA.id, 'Bajado', 'Baja', '32000999')
    await app.inject({ method: 'POST', url: `/api/equipo-jugadores/${jbId}/baja`, payload: { motivo: 'Se fue' }, headers: conCookie(tokenDelegadoA) })
    jugadorBaja = jbId
  })

  afterAll(async () => {
    await app.close()
    await limpiarBase()
  })

  it('DELEGADO crea una convocatoria con jugadores PENDIENTE', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2026-03-15', lugar: 'Cancha 1', jugadores: [{ equipoJugadorId: jugadorX }, { equipoJugadorId: jugadorY, orden: 5 }] },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.cancelada).toBe(false)
    expect(res.json().data.publicada).toBe(false)
  })

  it('crear con partido (validación de involucramiento)', async () => {
    const partido = await crearPartido(equipoA.id)
    const res = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2026-04-01', partidoId: partido.id, jugadores: [{ equipoJugadorId: jugadorX }] },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
  })

  it('crear con fechaLimite', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2026-05-01', fechaLimite: '2026-04-30', jugadores: [{ equipoJugadorId: jugadorX }] },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
  })

  it('jugador BAJA no puede ser convocado', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2026-06-01', jugadores: [{ equipoJugadorId: jugadorBaja }] },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(400)
  })

  it('INACTIVO/LESIONADO pueden ser convocados', async () => {
    const jid = await incorporar(equipoA.id, 'Lesion', 'Ado', '32000111')
    await app.inject({ method: 'POST', url: `/api/equipo-jugadores/${jid}/estado`, payload: { estado: 'LESIONADO' }, headers: conCookie(tokenDelegadoA) })
    const res = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2026-07-01', jugadores: [{ equipoJugadorId: jid }] },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    const enBase = await getPrisma().equipoJugador.findUnique({ where: { id: jid }, select: { estado: true } })
    expect(enBase?.estado).toBe('LESIONADO')
  })

  it('TECNICO puede crear y editar convocatorias', async () => {
    const creada = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2026-08-01', lugar: 'Original', jugadores: [{ equipoJugadorId: jugadorX }] },
      headers: conCookie(tokenTecnicoA),
    })
    expect(creada.statusCode).toBe(200)
    const id = creada.json().data.id

    const editada = await app.inject({
      method: 'PATCH', url: `/api/convocatorias/${id}`,
      payload: { lugar: 'Modificada' },
      headers: conCookie(tokenTecnicoA),
    })
    expect(editada.statusCode).toBe(200)
    expect(editada.json().data.lugar).toBe('Modificada')
  })

  it('AUXILIAR no puede crear convocatorias', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2026-09-01', jugadores: [{ equipoJugadorId: jugadorX }] },
      headers: conCookie(tokenAuxiliarA),
    })
    expect(res.statusCode).toBe(403)
  })

  it('DELEGADO de otro equipo no puede crear en equipo ajeno', async () => {
    const res = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2026-10-01', jugadores: [{ equipoJugadorId: jugadorX }] },
      headers: conCookie(tokenDelegadoB),
    })
    expect(res.statusCode).toBe(403)
  })

  it('jugador responde CONFIRMADO a su convocatoria', async () => {
    const creada = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2026-11-01', jugadores: [{ equipoJugadorId: jugadorX }] },
      headers: conCookie(tokenDelegadoA),
    })
    const cid = creada.json().data.id
    const detalle = await app.inject({ method: 'GET', url: `/api/convocatorias/${cid}`, headers: conCookie(tokenJugador) })
    const cj = detalle.json().data.jugadores[0]

    const res = await app.inject({
      method: 'PATCH', url: `/api/convocatorias-jugador/${cj.id}/responder`,
      payload: { estado: 'CONFIRMADO', nota: 'Voy' },
      headers: conCookie(tokenJugador),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('CONFIRMADO')
    expect(res.json().data.respondioEn).not.toBeNull()
  })

  it('jugador responde NO_DISPONIBLE', async () => {
    const creada = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2026-12-01', jugadores: [{ equipoJugadorId: jugadorY }] },
      headers: conCookie(tokenDelegadoA),
    })
    const cid = creada.json().data.id
    const detalle = await app.inject({ method: 'GET', url: `/api/convocatorias/${cid}`, headers: conCookie(tokenJugador2) })
    const cj = detalle.json().data.jugadores[0]

    const res = await app.inject({
      method: 'PATCH', url: `/api/convocatorias-jugador/${cj.id}/responder`,
      payload: { estado: 'NO_DISPONIBLE' },
      headers: conCookie(tokenJugador2),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('NO_DISPONIBLE')
  })

  it('jugador ajeno no puede responder otra convocatoria', async () => {
    const creada = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2027-01-01', jugadores: [{ equipoJugadorId: jugadorX }] },
      headers: conCookie(tokenDelegadoA),
    })
    const cid = creada.json().data.id
    const detalle = await app.inject({ method: 'GET', url: `/api/convocatorias/${cid}`, headers: conCookie(tokenJugador) })
    const cj = detalle.json().data.jugadores[0]

    const res = await app.inject({
      method: 'PATCH', url: `/api/convocatorias-jugador/${cj.id}/responder`,
      payload: { estado: 'CONFIRMADO' },
      headers: conCookie(tokenJugador2),
    })
    expect(res.statusCode).toBe(403)
  })

  it('DELEGADO cambia estado de jugador a AUSENTE', async () => {
    const creada = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2027-02-01', jugadores: [{ equipoJugadorId: jugadorY }] },
      headers: conCookie(tokenDelegadoA),
    })
    const cid = creada.json().data.id
    const detalle = await app.inject({ method: 'GET', url: `/api/convocatorias/${cid}`, headers: conCookie(tokenDelegadoA) })
    const cj = detalle.json().data.jugadores[0]

    const res = await app.inject({
      method: 'PATCH', url: `/api/convocatorias-jugador/${cj.id}/estado`,
      payload: { estado: 'AUSENTE' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('AUSENTE')
  })

  it('publicar permite acceso público y despublicar lo revierte', async () => {
    const creada = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2027-03-01', jugadores: [{ equipoJugadorId: jugadorX }] },
      headers: conCookie(tokenDelegadoA),
    })
    const id = creada.json().data.id

    const priv = await app.inject({ method: 'GET', url: `/api/publico/convocatorias/${id}` })
    expect(priv.statusCode).toBe(404)

    await app.inject({ method: 'POST', url: `/api/convocatorias/${id}/publicar`, headers: conCookie(tokenDelegadoA) })
    const pub = await app.inject({ method: 'GET', url: `/api/publico/convocatorias/${id}` })
    expect(pub.statusCode).toBe(200)

    await app.inject({ method: 'POST', url: `/api/convocatorias/${id}/despublicar`, headers: conCookie(tokenDelegadoA) })
    const otra = await app.inject({ method: 'GET', url: `/api/publico/convocatorias/${id}` })
    expect(otra.statusCode).toBe(404)
  })

  it('no miembro no ve convocatoria privada', async () => {
    const creada = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2027-04-01', jugadores: [{ equipoJugadorId: jugadorX }] },
      headers: conCookie(tokenDelegadoA),
    })
    const res = await app.inject({ method: 'GET', url: `/api/convocatorias/${creada.json().data.id}`, headers: conCookie(tokenDelegadoB) })
    expect(res.statusCode).toBe(403)
  })

  it('cancelar la convocatoria como soft delete', async () => {
    const creada = await app.inject({
      method: 'POST', url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2027-05-01', jugadores: [{ equipoJugadorId: jugadorX }] },
      headers: conCookie(tokenDelegadoA),
    })
    const id = creada.json().data.id

    const cancel = await app.inject({ method: 'DELETE', url: `/api/convocatorias/${id}`, headers: conCookie(tokenDelegadoA) })
    expect(cancel.statusCode).toBe(200)
    expect(cancel.json().data.cancelada).toBe(true)

    const lista = await app.inject({ method: 'GET', url: `/api/equipos/${equipoA.id}/convocatorias`, headers: conCookie(tokenDelegadoA) })
    const activas = lista.json().data.filter((c: { id: string }) => c.id === id)
    expect(activas.length).toBe(0)

    const editar = await app.inject({ method: 'PATCH', url: `/api/convocatorias/${id}`, payload: { lugar: 'No debería' }, headers: conCookie(tokenDelegadoA) })
    expect(editar.statusCode).toBe(400)

    const fila = await getPrisma().convocatoria.findUnique({ where: { id }, select: { id: true, cancelada: true } })
    expect(fila).not.toBeNull()
    expect(fila?.cancelada).toBe(true)
  })

  it('JUGADOR ve las convocatorias de su equipo', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/equipos/${equipoA.id}/convocatorias`, headers: conCookie(tokenJugador) })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.length).toBeGreaterThan(0)
  })

  it('las acciones quedan auditadas', async () => {
    const auditCreate = await getPrisma().auditoriaLog.findFirst({ where: { entidad: 'Convocatoria', accion: 'CREATE' } })
    expect(auditCreate).not.toBeNull()
    const auditJugador = await getPrisma().auditoriaLog.findFirst({ where: { entidad: 'ConvocatoriaJugador', accion: 'UPDATE' } })
    expect(auditJugador).not.toBeNull()
    const auditCancel = await getPrisma().auditoriaLog.findFirst({ where: { entidad: 'Convocatoria', accion: 'DELETE' } })
    expect(auditCancel).not.toBeNull()
  })
})
