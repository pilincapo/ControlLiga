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
  crearTemporada,
  crearTorneo,
  crearTorneoCategoria,
  crearUsuario,
} from '../test/seed.js'
import { limpiarBase } from '../test/limpiar.js'

const sufijo = Date.now().toString(36)
const email = (nombre: string) => `${nombre}-stats-${sufijo}@test.dev`

describe('seguridad estadísticas y sanciones', () => {
  let app: FastifyInstance
  let orgA: string
  let orgB: string
  let torneoA: string
  let torneoB: string
  let equipoA: string
  let jugadorX: string
  let partidoA: string
  let partidoB: string
  let tokenAdminA: string
  let tokenAdminB: string

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
    orgA = (await crearOrganizacion('Stats org A')).id
    orgB = (await crearOrganizacion('Stats org B')).id
    const adminA = await crearUsuario({ email: email('admina'), roles: [{ codigo: 'ADMINISTRADOR', organizacionId: orgA }] })
    const adminB = await crearUsuario({ email: email('adminb'), roles: [{ codigo: 'ADMINISTRADOR', organizacionId: orgB }] })
    const delegadoA = await crearUsuario({ email: email('delegadoa'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    equipoA = (await crearEquipo('Stats equipo A')).id
    const equipoB = (await crearEquipo('Stats equipo B')).id
    if (!equipoA || !equipoB) throw new Error(`equipos indefinidos: A=${equipoA} B=${equipoB}`)
    await agregarMiembroEquipo(delegadoA.id, equipoA, 'DELEGADO')
    jugadorX = (await crearPersonaJugador('Stats', 'Jugador X')).jugador.id
    await agregarJugadorAEquipo(jugadorX, equipoA)

    torneoA = (await crearTorneo(orgA, 'Stats torneo A', { estado: 'ACTIVO' })).id
    const temporadaA = (await crearTemporada(torneoA, 'Temporada A')).id
    const categoriaA = (await crearTorneoCategoria(torneoA, temporadaA, (await getPrisma().categoria.create({ data: { nombre: 'Stats cat A' } })).id)).id
    torneoB = (await crearTorneo(orgB, 'Stats torneo B', { estado: 'ACTIVO' })).id
    const temporadaB = (await crearTemporada(torneoB, 'Temporada B')).id
    const categoriaB = (await crearTorneoCategoria(torneoB, temporadaB, (await getPrisma().categoria.create({ data: { nombre: 'Stats cat B' } })).id)).id
    await getPrisma().equipoParticipacion.createMany({ data: [
      { torneoId: torneoA, temporadaId: temporadaA, equipoId: equipoA, estado: 'CONFIRMADO', torneoCategoriaId: categoriaA },
      { torneoId: torneoA, temporadaId: temporadaA, equipoId: equipoB, estado: 'CONFIRMADO', torneoCategoriaId: categoriaA },
    ] })
    const pA = await getPrisma().partido.create({ data: { tipo: 'OFICIAL', equipoLocalId: equipoA, equipoVisitanteId: equipoB, equipoResponsableId: equipoA, torneoId: torneoA, temporadaId: temporadaA, torneoCategoriaId: categoriaA, fechaHora: new Date(), estado: 'PROGRAMADO', publicada: false } })
    const pB = await getPrisma().partido.create({ data: { tipo: 'OFICIAL', equipoLocalId: equipoA, equipoVisitanteId: equipoB, equipoResponsableId: equipoA, torneoId: torneoB, temporadaId: temporadaB, torneoCategoriaId: categoriaB, fechaHora: new Date(), estado: 'PROGRAMADO', publicada: false } })
    partidoA = pA.id
    partidoB = pB.id
    tokenAdminA = (await login(app, adminA.email, 'contraseña123')).token!
    tokenAdminB = (await login(app, adminB.email, 'contraseña123')).token!
  })

  afterAll(async () => {
    await app.close()
    await limpiarBase()
  })

  it('admin scoped no lee estadísticas ni sanciones de un partido de otra organización', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/partidos/${partidoB}/estadisticas`, headers: conCookie(tokenAdminA) })).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: `/api/partidos/${partidoB}/sanciones`, headers: conCookie(tokenAdminA) })).statusCode).toBe(403)
  })

  it('admin scoped puede leer estadísticas de partido, equipo y jugador de su organización', async () => {
    expect((await app.inject({ method: 'GET', url: `/api/partidos/${partidoA}/estadisticas`, headers: conCookie(tokenAdminA) })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/equipos/${equipoA}/estadisticas`, headers: conCookie(tokenAdminA) })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/jugadores/${jugadorX}/estadisticas`, headers: conCookie(tokenAdminA) })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/equipos/${equipoA}/estadisticas`, headers: conCookie(tokenAdminB) })).statusCode).toBe(403)
  })

  it('sanciones: partido ajeno al torneo o equipo ajeno al torneo se rechazan', async () => {
    const base = { origen: 'PARTIDO', tipo: 'ROJA', motivo: 'test', fechaInicio: new Date().toISOString() }
    const partidoOtroTorneo = await app.inject({ method: 'POST', url: '/api/sanciones', payload: { ...base, equipoId: equipoA, partidoId: partidoB, torneoId: torneoA }, headers: conCookie(tokenAdminA) })
    expect(partidoOtroTorneo.statusCode).toBe(400)
    const equipoNoParticipa = await app.inject({ method: 'POST', url: '/api/sanciones', payload: { ...base, equipoId: equipoA, partidoId: partidoB, torneoId: torneoB }, headers: conCookie(tokenAdminB) })
    expect(equipoNoParticipa.statusCode).toBe(400)
  })

  it('sanciones: admin ajeno no resuelve sanción de otro torneo', async () => {
    const sancion = await getPrisma().sancion.create({ data: { equipoId: equipoA, torneoId: torneoB, origen: 'ADMINISTRATIVA', tipo: 'SUSPENSION', motivo: 'test', fechaInicio: new Date() } })
    expect((await app.inject({ method: 'POST', url: `/api/sanciones/${sancion.id}/resolver`, headers: conCookie(tokenAdminA) })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: `/api/sanciones/${sancion.id}/resolver`, headers: conCookie(tokenAdminB) })).statusCode).toBe(200)
  })
})