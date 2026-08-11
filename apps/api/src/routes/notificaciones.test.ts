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
  crearUsuario,
} from '../test/seed.js'
import { limpiarBase } from '../test/limpiar.js'

const suf = Date.now().toString(36)
const email = (rol: string) => `${rol}-${suf}@test.dev`

describe('notificaciones por eventos (FASE 13)', () => {
  let app: FastifyInstance

  let tokenSuper: string
  let tokenAdminTorneo: string
  let tokenDelegadoA: string
  let tokenDelegadoB: string
  let tokenJugadorConv: string

  let equipoA: { id: string }
  let equipoB: { id: string }
  let torneo: { id: string }
  let temporada: { id: string }

  let jugadorConv: { jugadorId: string; usuarioId: string }

  let partidoId: string

  beforeAll(async () => {
    app = buildApp()
    await app.ready()

    const superAdmin = await crearUsuario({ email: email('super'), roles: [{ codigo: 'SUPERADMIN' }] })
    const delegadoA = await crearUsuario({ email: email('delegadoa'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    const delegadoB = await crearUsuario({ email: email('delegadob'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })

    const organizacion = await crearOrganizacion('Org Notif')
    torneo = await crearTorneo(organizacion.id, 'Torneo Notif')
    temporada = await crearTemporada(torneo.id, 'Temporada Notif')

    const adminTorneo = await crearUsuario({
      email: email('admin'),
      roles: [{ codigo: 'ADMINISTRADOR', torneoId: torneo.id }],
    })

    equipoA = await crearEquipo('Notif A')
    equipoB = await crearEquipo('Notif B')
    await agregarMiembroEquipo(delegadoA.id, equipoA.id, 'DELEGADO')
    await agregarMiembroEquipo(delegadoB.id, equipoA.id, 'DELEGADO')
    await agregarMiembroEquipo(delegadoB.id, equipoB.id, 'DELEGADO')

    const pj = await crearPersonaJugador('Jugador', 'Convocado')
    const usuarioJugador = await crearUsuario({
      email: email('jugadorconv'),
      jugadorId: pj.jugador.id,
      roles: [{ codigo: 'JUGADOR' }],
    })
    await agregarJugadorAEquipo(pj.jugador.id, equipoA.id)
    jugadorConv = { jugadorId: pj.jugador.id, usuarioId: usuarioJugador.id }

    tokenSuper = (await login(app, superAdmin.email, 'contraseña123')).token!
    tokenAdminTorneo = (await login(app, adminTorneo.email, 'contraseña123')).token!
    tokenDelegadoA = (await login(app, delegadoA.email, 'contraseña123')).token!
    tokenDelegadoB = (await login(app, delegadoB.email, 'contraseña123')).token!
    tokenJugadorConv = (await login(app, usuarioJugador.email, 'contraseña123')).token!

    const partido = await getPrisma().partido.create({
      data: {
        tipo: 'AMISTOSO',
        equipoResponsableId: equipoA.id,
        equipoLocalId: equipoA.id,
        equipoVisitanteId: equipoB.id,
        fechaHora: new Date(),
      },
    })
    partidoId = partido.id
  })

  afterAll(async () => {
    await app.close()
    await limpiarBase()
  })

  async function notis(token: string): Promise<Array<{ id: string; tipo: string; mensaje: string; entidadTipo: string | null; entidadId: string | null }>> {
    const res = await app.inject({ method: 'GET', url: '/api/notificaciones', headers: conCookie(token) })
    expect(res.statusCode).toBe(200)
    return res.json().data
  }

  it('1. invitar un equipo al torneo notifica a sus DELEGADOs y excluye al actor', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneo.id}/temporadas/${temporada.id}/participaciones/invitar`,
      payload: { equipoId: equipoA.id },
      headers: conCookie(tokenSuper),
    })
    expect(res.statusCode).toBe(200)
    const participacionId = res.json().data.id

    const deA = await notis(tokenDelegadoA)
    const deB = await notis(tokenDelegadoB)
    for (const lista of [deA, deB]) {
      expect(lista.some((n) => n.tipo === 'INVITACION_TORNEO' && n.entidadTipo === 'EquipoParticipacion' && n.entidadId === participacionId)).toBe(true)
    }
    const deSuper = await notis(tokenSuper)
    expect(deSuper.some((n) => n.tipo === 'INVITACION_TORNEO')).toBe(false)
  })

  it('2. solicitar inscripción notifica a los administradores del torneo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneo.id}/temporadas/${temporada.id}/participaciones/solicitar`,
      payload: { equipoId: equipoB.id },
      headers: conCookie(tokenDelegadoB),
    })
    expect(res.statusCode).toBe(200)
    const participacionId = res.json().data.id

    const deAdmin = await notis(tokenAdminTorneo)
    expect(deAdmin.some((n) => n.tipo === 'SOLICITUD_TORNEO' && n.entidadTipo === 'EquipoParticipacion' && n.entidadId === participacionId)).toBe(true)
  })

  it('3. responder la invitación notifica a quien invitó', async () => {
    const participacion = await getPrisma().equipoParticipacion.findFirstOrThrow({
      where: { torneoId: torneo.id, temporadaId: temporada.id, equipoId: equipoA.id, estado: 'PENDIENTE' },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/participaciones/${participacion.id}/responder-invitacion`,
      payload: { aceptar: true },
      headers: conCookie(tokenDelegadoB),
    })
    expect(res.statusCode).toBe(200)

    const deSuper = await notis(tokenSuper)
    expect(deSuper.some((n) => n.tipo === 'RESPUESTA_INVITACION' && n.entidadId === participacion.id && n.mensaje?.includes('aceptó'))).toBe(true)
  })

  it('4. decidir una solicitud notifica a los DELEGADOs del equipo', async () => {
    const participacion = await getPrisma().equipoParticipacion.findFirstOrThrow({
      where: { torneoId: torneo.id, temporadaId: temporada.id, equipoId: equipoB.id, estado: 'INSCRIPTO' },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/participaciones/${participacion.id}/decidir-solicitud`,
      payload: { aceptar: true },
      headers: conCookie(tokenAdminTorneo),
    })
    expect(res.statusCode).toBe(200)

    const deB = await notis(tokenDelegadoB)
    expect(deB.some((n) => n.tipo === 'RESPUESTA_INVITACION' && n.entidadId === participacion.id)).toBe(true)
    const deA = await notis(tokenDelegadoA)
    expect(deA.some((n) => n.tipo === 'RESPUESTA_INVITACION' && n.entidadId === participacion.id)).toBe(false)
  })

  it('5. crear una convocatoria notifica a los convocados y no al creador', async () => {
    const ej = await getPrisma().equipoJugador.findFirstOrThrow({
      where: { equipoId: equipoA.id, jugadorId: jugadorConv.jugadorId },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/convocatorias`,
      payload: { fecha: '2026-09-05T20:00:00.000Z', jugadores: [{ equipoJugadorId: ej.id }] },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    const convocatoriaId = res.json().data.id

    const deJugador = await notis(tokenJugadorConv)
    expect(deJugador.some((n) => n.tipo === 'CONVOCATORIA' && n.entidadTipo === 'Convocatoria' && n.entidadId === convocatoriaId)).toBe(true)

    const deA = await notis(tokenDelegadoA)
    expect(deA.some((n) => n.tipo === 'CONVOCATORIA')).toBe(false)
  })

  it('6. publicar una convocatoria notifica de nuevo a los convocados', async () => {
    const convocatoria = await getPrisma().convocatoria.findFirstOrThrow({
      where: { equipoId: equipoA.id, publicada: false },
      orderBy: { createdAt: 'desc' },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/convocatorias/${convocatoria.id}/publicar`,
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)

    const deJugador = await notis(tokenJugadorConv)
    expect(deJugador.filter((n) => n.tipo === 'CONVOCATORIA' && n.entidadId === convocatoria.id).length).toBeGreaterThanOrEqual(2)
  })

  it('7. modificar fecha o lugar de un partido notifica a los miembros de ambos equipos', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/partidos/${partidoId}`,
      payload: { fechaHora: '2026-09-10T21:30:00.000Z' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)

    const deB = await notis(tokenDelegadoB)
    expect(deB.some((n) => n.tipo === 'PARTIDO' && n.entidadTipo === 'Partido' && n.entidadId === partidoId)).toBe(true)
    const deA = await notis(tokenDelegadoA)
    expect(deA.some((n) => n.tipo === 'PARTIDO')).toBe(false)
  })

  it('8. cada usuario solo ve sus propias notificaciones y las ajenas dan 404', async () => {
    const deJugador = await notis(tokenJugadorConv)
    for (const n of deJugador) {
      expect(n.tipo).toBe('CONVOCATORIA')
    }
    const deA = await notis(tokenDelegadoA)
    expect(deA.length).toBeGreaterThan(0)
    const notificacionAjena = deA[0] as { id: string }
    const ajena = await app.inject({
      method: 'POST',
      url: `/api/notificaciones/${notificacionAjena.id}/leida`,
      headers: conCookie(tokenJugadorConv),
    })
    expect(ajena.statusCode).toBe(404)
  })

  it('9. marcar una notificación leída es idempotente y leer-todas actualiza el contador', async () => {
    const deJugador = await notis(tokenJugadorConv)
    const primera = deJugador[0]
    const antes = await app.inject({ method: 'GET', url: '/api/notificaciones/no-leidas', headers: conCookie(tokenJugadorConv) })
    const countAntes = antes.json().data.count as number
    expect(countAntes).toBeGreaterThanOrEqual(2)

    const leida = await app.inject({
      method: 'POST',
      url: `/api/notificaciones/${primera.id}/leida`,
      headers: conCookie(tokenJugadorConv),
    })
    expect(leida.statusCode).toBe(200)
    expect(leida.json().data.leidaAt).not.toBeNull()

    const conLeida = await app.inject({ method: 'GET', url: '/api/notificaciones/no-leidas', headers: conCookie(tokenJugadorConv) })
    expect(conLeida.json().data.count).toBe(countAntes - 1)

    const repite = await app.inject({
      method: 'POST',
      url: `/api/notificaciones/${primera.id}/leida`,
      headers: conCookie(tokenJugadorConv),
    })
    expect(repite.statusCode).toBe(200)
    expect(repite.json().data.leidaAt).toBe(leida.json().data.leidaAt)

    const todas = await app.inject({ method: 'POST', url: '/api/notificaciones/leer-todas', headers: conCookie(tokenJugadorConv) })
    expect(todas.statusCode).toBe(200)
    expect(todas.json().data.marcadas).toBe(countAntes - 1)

    const final = await app.inject({ method: 'GET', url: '/api/notificaciones/no-leidas', headers: conCookie(tokenJugadorConv) })
    expect(final.json().data.count).toBe(0)
  })

  it('10. resetear la contraseña no genera notificaciones', async () => {
    const usuario = await crearUsuario({ email: email('resetsinnotif') })
    const token = (await login(app, usuario.email, 'contraseña123')).token!
    const forgot = await app.inject({ method: 'POST', url: '/api/auth/password/forgot', payload: { email: usuario.email } })
    expect(forgot.statusCode).toBe(202)
    const res = await app.inject({ method: 'GET', url: '/api/notificaciones', headers: conCookie(token) })
    expect(res.json().data).toHaveLength(0)
  })
})
