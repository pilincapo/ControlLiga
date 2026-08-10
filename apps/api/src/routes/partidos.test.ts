import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { getPrisma } from '../db.js'
import { conCookie, login } from '../test/helpers.js'
import { crearOrganizacion, crearParticipacion, crearTemporada, crearTorneo, crearUsuario } from '../test/seed.js'
import { limpiarBase } from '../test/limpiar.js'

const suf = Date.now().toString(36)
const email = (rol: string) => `${rol}-${suf}@test.dev`

describe('módulo de partidos (FASE 7)', () => {
  let app: FastifyInstance
  let usuarioDelegadoA: { id: string; email: string }
  let usuarioJugador: { id: string; email: string }
  let tokenDelegadoA: string
  let tokenJugador: string
  let equipoA: { id: string }
  let equipoB: { id: string }
  let orgA: { id: string }
  let torneoA: { id: string }
  let temporadaA: { id: string }
  let tokenAdminTorneo: string
  let delegadoX: { id: string; email: string }
  let tokenDelegadoX: string

  beforeAll(async () => {
    app = buildApp(); await app.ready()
    usuarioDelegadoA = await crearUsuario({ email: email('delegadoa'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    usuarioJugador = await crearUsuario({ email: email('jugador'), roles: [{ codigo: 'JUGADOR' }] })
    const uDelegadoB = await crearUsuario({ email: email('delegadob'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })

    tokenDelegadoA = (await login(app, usuarioDelegadoA.email, 'contraseña123')).token!
    tokenJugador = (await login(app, usuarioJugador.email, 'contraseña123')).token!
    const tokenDelegadoB = (await login(app, uDelegadoB.email, 'contraseña123')).token!

    const eqA = await app.inject({ method: 'POST', url: '/api/equipos', payload: { nombre: 'Partido A' }, headers: conCookie(tokenDelegadoA) })
    equipoA = { id: eqA.json().data.id }
    const eqB = await app.inject({ method: 'POST', url: '/api/equipos', payload: { nombre: 'Partido B' }, headers: conCookie(tokenDelegadoB) })
    equipoB = { id: eqB.json().data.id }

    const jx = await app.inject({ method: 'POST', url: `/api/equipos/${equipoA.id}/jugadores`, payload: { persona: { nombre: 'Jug', apellido: 'Xx', dni: '34000111' }, dorsal: 10 }, headers: conCookie(tokenDelegadoA) })
    const ejX = await getPrisma().equipoJugador.findUnique({ where: { id: jx.json().data.id }, select: { jugadorId: true } })
    await getPrisma().usuario.update({ where: { id: usuarioJugador.id }, data: { jugadorId: ejX!.jugadorId } })
    tokenJugador = (await login(app, usuarioJugador.email, 'contraseña123')).token!

    orgA = await crearOrganizacion('Org Partidos')
    torneoA = await crearTorneo(orgA.id, 'Torneo Partidos', { estado: 'INSCRIPCIONES' })
    temporadaA = await crearTemporada(torneoA.id, 'Temp 2026')
    await crearParticipacion(torneoA.id, temporadaA.id, equipoA.id, { estado: 'CONFIRMADO' })
    await crearParticipacion(torneoA.id, temporadaA.id, equipoB.id, { estado: 'CONFIRMADO' })
    const uAdmin = await crearUsuario({ email: email('admin'), roles: [{ codigo: 'ADMINISTRADOR', organizacionId: orgA.id }] })
    tokenAdminTorneo = (await login(app, uAdmin.email, 'contraseña123')).token!
    delegadoX = await crearUsuario({ email: email('delegadox'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    tokenDelegadoX = (await login(app, delegadoX.email, 'contraseña123')).token!
  })

  afterAll(async () => { await app.close(); await limpiarBase() })

  it('crear partido AMISTOSO', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'AMISTOSO', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, fechaHora: '2026-06-01T15:00:00Z' }, headers: conCookie(tokenDelegadoA) })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('PROGRAMADO')
    expect(res.json().data.torneoId).toBeNull()
  })

  it('crear OFICIAL con torneo y temporada', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'OFICIAL', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, fechaHora: '2026-07-01T15:00:00Z', torneoId: torneoA.id, temporadaId: temporadaA.id }, headers: conCookie(tokenAdminTorneo) })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.tipo).toBe('OFICIAL')
  })

  it('OFICIAL sin torneo da 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'OFICIAL', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, fechaHora: '2026-08-01T15:00:00Z' }, headers: conCookie(tokenDelegadoA) })
    expect(res.statusCode).toBe(400)
  })

  it('equipos iguales da 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'AMISTOSO', equipoLocalId: equipoA.id, equipoVisitanteId: equipoA.id, fechaHora: '2026-09-01T15:00:00Z' }, headers: conCookie(tokenDelegadoA) })
    expect(res.statusCode).toBe(400)
  })

  it('transiciones PROGRAMADO → EN_CURSO → FINALIZADO', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'AMISTOSO', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, fechaHora: '2026-10-01T15:00:00Z' }, headers: conCookie(tokenDelegadoA) })
    const id = c.json().data.id
    await app.inject({ method: 'POST', url: `/api/partidos/${id}/resultado`, payload: { golesLocal: 2, golesVisitante: 1 }, headers: conCookie(tokenDelegadoA) })

    const ec = await app.inject({ method: 'POST', url: `/api/partidos/${id}/estado`, payload: { estado: 'EN_CURSO' }, headers: conCookie(tokenDelegadoA) })
    expect(ec.statusCode).toBe(200)
    expect(ec.json().data.estado).toBe('EN_CURSO')

    const fin = await app.inject({ method: 'POST', url: `/api/partidos/${id}/estado`, payload: { estado: 'FINALIZADO' }, headers: conCookie(tokenDelegadoA) })
    expect(fin.statusCode).toBe(200)
    expect(fin.json().data.estado).toBe('FINALIZADO')
  })

  it('resultado en EN_CURSO finaliza el partido', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'AMISTOSO', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, fechaHora: '2026-11-01T15:00:00Z' }, headers: conCookie(tokenDelegadoA) })
    const id = c.json().data.id
    await app.inject({ method: 'POST', url: `/api/partidos/${id}/estado`, payload: { estado: 'EN_CURSO' }, headers: conCookie(tokenDelegadoA) })

    const res = await app.inject({ method: 'POST', url: `/api/partidos/${id}/resultado`, payload: { golesLocal: 1, golesVisitante: 1 }, headers: conCookie(tokenDelegadoA) })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('FINALIZADO')
  })

  it('resultado en FINALIZADO da 400', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'AMISTOSO', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, fechaHora: '2026-12-01T15:00:00Z' }, headers: conCookie(tokenDelegadoA) })
    const id = c.json().data.id
    await app.inject({ method: 'POST', url: `/api/partidos/${id}/estado`, payload: { estado: 'EN_CURSO' }, headers: conCookie(tokenDelegadoA) })
    await app.inject({ method: 'POST', url: `/api/partidos/${id}/resultado`, payload: { golesLocal: 0, golesVisitante: 0 }, headers: conCookie(tokenDelegadoA) })
    const res = await app.inject({ method: 'POST', url: `/api/partidos/${id}/resultado`, payload: { golesLocal: 1, golesVisitante: 0 }, headers: conCookie(tokenDelegadoA) })
    expect(res.statusCode).toBe(400)
  })

  it('goles negativos da 400', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'AMISTOSO', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, fechaHora: '2027-01-01T15:00:00Z' }, headers: conCookie(tokenDelegadoA) })
    const res = await app.inject({ method: 'POST', url: `/api/partidos/${c.json().data.id}/resultado`, payload: { golesLocal: -1, golesVisitante: 0 }, headers: conCookie(tokenDelegadoA) })
    expect(res.statusCode).toBe(400)
  })

  it('PROGRAMADO → APLAZADO → PROGRAMADO', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'AMISTOSO', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, fechaHora: '2027-02-01T15:00:00Z' }, headers: conCookie(tokenDelegadoA) })
    const id = c.json().data.id
    const ap = await app.inject({ method: 'POST', url: `/api/partidos/${id}/estado`, payload: { estado: 'APLAZADO' }, headers: conCookie(tokenDelegadoA) })
    expect(ap.statusCode).toBe(200)
    const pr = await app.inject({ method: 'POST', url: `/api/partidos/${id}/estado`, payload: { estado: 'PROGRAMADO' }, headers: conCookie(tokenDelegadoA) })
    expect(pr.statusCode).toBe(200)
  })

  it('SUSPENDIDO → PROGRAMADO', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'AMISTOSO', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, fechaHora: '2027-03-01T15:00:00Z' }, headers: conCookie(tokenDelegadoA) })
    const id = c.json().data.id
    await app.inject({ method: 'POST', url: `/api/partidos/${id}/estado`, payload: { estado: 'SUSPENDIDO' }, headers: conCookie(tokenDelegadoA) })
    const pr = await app.inject({ method: 'POST', url: `/api/partidos/${id}/estado`, payload: { estado: 'PROGRAMADO' }, headers: conCookie(tokenDelegadoA) })
    expect(pr.statusCode).toBe(200)
  })

  it('DELEGADO de otro equipo no gestiona (403)', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'AMISTOSO', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, fechaHora: '2027-04-01T15:00:00Z' }, headers: conCookie(tokenDelegadoA) })
    const id = c.json().data.id
    const res = await app.inject({ method: 'POST', url: `/api/partidos/${id}/estado`, payload: { estado: 'EN_CURSO' }, headers: conCookie(tokenDelegadoX) })
    expect(res.statusCode).toBe(403)
  })

  it('JUGADOR ve partido de su equipo', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'AMISTOSO', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, fechaHora: '2027-05-01T15:00:00Z' }, headers: conCookie(tokenDelegadoA) })
    const res = await app.inject({ method: 'GET', url: `/api/partidos/${c.json().data.id}`, headers: conCookie(tokenJugador) })
    expect(res.statusCode).toBe(200)
  })

  it('publicar + endpoint público', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'AMISTOSO', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, fechaHora: '2027-06-01T15:00:00Z' }, headers: conCookie(tokenDelegadoA) })
    const id = c.json().data.id
    const priv = await app.inject({ method: 'GET', url: `/api/publico/partidos/${id}` })
    expect(priv.statusCode).toBe(404)

    await app.inject({ method: 'POST', url: `/api/partidos/${id}/publicar`, headers: conCookie(tokenDelegadoA) })
    const pub = await app.inject({ method: 'GET', url: `/api/publico/partidos/${id}` })
    expect(pub.statusCode).toBe(200)
  })

  it('ADMIN del torneo puede cambiar estado de partido oficial', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'OFICIAL', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, fechaHora: '2027-07-01T15:00:00Z', torneoId: torneoA.id, temporadaId: temporadaA.id }, headers: conCookie(tokenDelegadoA) })
    const id = c.json().data.id
    await app.inject({ method: 'POST', url: `/api/partidos/${id}/resultado`, payload: { golesLocal: 3, golesVisitante: 0 }, headers: conCookie(tokenDelegadoA) })
    const res = await app.inject({ method: 'POST', url: `/api/partidos/${id}/estado`, payload: { estado: 'EN_CURSO' }, headers: conCookie(tokenAdminTorneo) })
    expect(res.statusCode).toBe(200)
  })

  it('las acciones quedan auditadas', async () => {
    const create = await getPrisma().auditoriaLog.findFirst({ where: { entidad: 'Partido', accion: 'CREATE' } })
    expect(create).not.toBeNull()
    const update = await getPrisma().auditoriaLog.findFirst({ where: { entidad: 'Partido', accion: 'UPDATE' } })
    expect(update).not.toBeNull()
  })

  it('no se puede modificar un partido en EN_CURSO', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'AMISTOSO', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, fechaHora: '2027-08-01T15:00:00Z' }, headers: conCookie(tokenDelegadoA) })
    const id = c.json().data.id
    await app.inject({ method: 'POST', url: `/api/partidos/${id}/estado`, payload: { estado: 'EN_CURSO' }, headers: conCookie(tokenDelegadoA) })
    const res = await app.inject({ method: 'PATCH', url: `/api/partidos/${id}`, payload: { lugar: 'No debería' }, headers: conCookie(tokenDelegadoA) })
    expect(res.statusCode).toBe(400)
  })

  it('transición inválida da 409', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/partidos', payload: { tipo: 'AMISTOSO', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, fechaHora: '2027-09-01T15:00:00Z' }, headers: conCookie(tokenDelegadoA) })
    const id = res.json().data.id
    await app.inject({ method: 'POST', url: `/api/partidos/${id}/resultado`, payload: { golesLocal: 0, golesVisitante: 0 }, headers: conCookie(tokenDelegadoA) })
    const intento = await app.inject({ method: 'POST', url: `/api/partidos/${id}/estado`, payload: { estado: 'FINALIZADO' }, headers: conCookie(tokenDelegadoA) })
    expect(intento.statusCode).toBe(409)
  })
})
