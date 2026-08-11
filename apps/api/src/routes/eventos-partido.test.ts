import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { getPrisma } from '../db.js'
import { conCookie, login } from '../test/helpers.js'
import { agregarMiembroEquipo, agregarJugadorAEquipo, crearEquipo, crearOrganizacion, crearPersonaJugador, crearTemporada, crearTorneo, crearTorneoCategoria, crearUsuario, crearPartido } from '../test/seed.js'
import { limpiarBase } from '../test/limpiar.js'

const suf = Date.now().toString(36)
const email = (rol: string) => `${rol}-${suf}@test.dev`

describe('FASE 9: eventos, estadísticas y disciplina HTTP/integración', () => {
  let app: FastifyInstance
  let equipoA: { id: string }
  let equipoB: { id: string }
  let jugadorX: { id: string }
  let jugadorY: { id: string }
  let jugadorZ: { id: string }
  let jugadorB: { id: string }
  let tokenDelegado: string
  let tokenTecnico: string
  let tokenAuxiliar: string
  let tokenJugador: string
  let adminId: string

  beforeAll(async () => {
    app = buildApp(); await app.ready()
    equipoA = await crearEquipo('F9 A'); equipoB = await crearEquipo('F9 B')
    jugadorX = (await crearPersonaJugador('X')).jugador
    jugadorY = (await crearPersonaJugador('Y')).jugador
    jugadorZ = (await crearPersonaJugador('Z')).jugador
    jugadorB = (await crearPersonaJugador('B')).jugador
    for (const [jugador, equipo] of [[jugadorX, equipoA], [jugadorY, equipoA], [jugadorZ, equipoA], [jugadorB, equipoB]] as const) await agregarJugadorAEquipo(jugador.id, equipo.id)

    const delegado = await crearUsuario({ email: email('delegado'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    const tecnico = await crearUsuario({ email: email('tecnico'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    const auxiliar = await crearUsuario({ email: email('auxiliar'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    const jugador = await crearUsuario({ email: email('jugador'), jugadorId: jugadorX.id, roles: [{ codigo: 'JUGADOR' }] })
    const org = await crearOrganizacion('F9 org')
    const admin = await crearUsuario({ email: email('admin'), roles: [{ codigo: 'ADMINISTRADOR', organizacionId: org.id }] }); adminId = admin.id
    await agregarMiembroEquipo(delegado.id, equipoA.id, 'DELEGADO')
    await agregarMiembroEquipo(tecnico.id, equipoA.id, 'TECNICO')
    await agregarMiembroEquipo(auxiliar.id, equipoA.id, 'AUXILIAR')
    tokenDelegado = (await login(app, delegado.email, 'contraseña123')).token!
    tokenTecnico = (await login(app, tecnico.email, 'contraseña123')).token!
    tokenAuxiliar = (await login(app, auxiliar.email, 'contraseña123')).token!
    tokenJugador = (await login(app, jugador.email, 'contraseña123')).token!
  })

  afterAll(async () => { await app.close(); await limpiarBase() })

  async function partido(): Promise<string> {
    return (await crearPartido(equipoA.id)).id
  }

  async function evento(partidoId: string, payload: Record<string, unknown>, token = tokenDelegado) {
    return app.inject({ method: 'POST', url: `/api/partidos/${partidoId}/eventos`, payload, headers: conCookie(token) })
  }

  it('carga GOL, ASISTENCIA independiente y TARJETAS; ignora anulado', async () => {
    const id = await partido()
    expect((await evento(id, { equipoId: equipoA.id, jugadorId: jugadorX.id, tipo: 'GOL', minuto: 10 })).statusCode).toBe(200)
    expect((await evento(id, { equipoId: equipoA.id, jugadorId: jugadorX.id, jugadorRelacionadoId: jugadorY.id, tipo: 'ASISTENCIA', minuto: 10 })).statusCode).toBe(200)
    const tarjeta = await evento(id, { equipoId: equipoA.id, jugadorId: jugadorY.id, tipo: 'TARJETA', subtipo: 'AMARILLA', minuto: 20 })
    expect(tarjeta.statusCode).toBe(200)
    const anulada = await app.inject({ method: 'POST', url: `/api/eventos-partido/${tarjeta.json().data.id}/anular`, headers: conCookie(tokenDelegado) })
    expect(anulada.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/partidos/${id}/estadisticas`, headers: conCookie(tokenDelegado) })).json().data.jugadores.find((j: { jugadorId: string }) => j.jugadorId === jugadorY.id).amarillas).toBe(0)
    expect(await getPrisma().eventoPartido.count({ where: { partidoId: id } })).toBe(3)
  })

  it('rechaza otro equipo, BAJA, INVITADO y sustitución inválida; permite asistencia sin gol', async () => {
    const id = await partido()
    expect((await evento(id, { equipoId: equipoA.id, jugadorId: jugadorB.id, tipo: 'GOL' })).statusCode).toBe(400)
    const baja = await getPrisma().equipoJugador.findFirstOrThrow({ where: { jugadorId: jugadorY.id, equipoId: equipoA.id } })
    await getPrisma().equipoJugador.update({ where: { id: baja.id }, data: { estado: 'BAJA' } })
    expect((await evento(id, { equipoId: equipoA.id, jugadorId: jugadorY.id, jugadorRelacionadoId: jugadorX.id, tipo: 'ASISTENCIA' })).statusCode).toBe(400)
    await getPrisma().equipoJugador.update({ where: { id: baja.id }, data: { estado: 'INVITADO' } })
    expect((await evento(id, { equipoId: equipoA.id, jugadorId: jugadorY.id, tipo: 'GOL' })).statusCode).toBe(400)
    expect((await evento(id, { equipoId: equipoA.id, jugadorId: jugadorX.id, jugadorRelacionadoId: jugadorY.id, tipo: 'SUSTITUCION', minuto: 20, periodo: 'PRIMER_TIEMPO' })).statusCode).toBe(400)
    await getPrisma().equipoJugador.update({ where: { id: baja.id }, data: { estado: 'ACTIVO' } })
    expect((await evento(id, { equipoId: equipoA.id, jugadorId: jugadorX.id, jugadorRelacionadoId: jugadorY.id, tipo: 'ASISTENCIA' })).statusCode).toBe(200)
  })

  it('registra participación y sustituciones sin calcular minutos todavía', async () => {
    const id = await partido()
    const formacion = await getPrisma().formacion.create({ data: { equipoId: equipoA.id, nombre: 'F9', formacionTipo: 'FUTBOL_7' } })
    const instancia = await getPrisma().formacionInstancia.create({ data: { formacionId: formacion.id, partidoId: id, nombre: 'F9', formacionTipo: 'FUTBOL_7', jugadores: { create: [
      { jugadorId: jugadorX.id, nombreSnapshot: 'X', posicion: 'DEL', esTitular: true },
      { jugadorId: jugadorY.id, nombreSnapshot: 'Y', posicion: 'DEL', esTitular: false },
      { jugadorId: jugadorZ.id, nombreSnapshot: 'Z', posicion: 'DEL', esTitular: false },
    ] } } })
    expect(instancia.id).toBeTruthy()
    expect((await evento(id, { equipoId: equipoA.id, jugadorId: jugadorX.id, jugadorRelacionadoId: jugadorY.id, tipo: 'SUSTITUCION', minuto: 30, periodo: 'PRIMER_TIEMPO' })).statusCode).toBe(200)
    expect((await evento(id, { equipoId: equipoA.id, jugadorId: jugadorY.id, jugadorRelacionadoId: jugadorZ.id, tipo: 'SUSTITUCION', minuto: 70, periodo: 'SEGUNDO_TIEMPO' })).statusCode).toBe(200)
    const stats = (await app.inject({ method: 'GET', url: `/api/partidos/${id}/estadisticas`, headers: conCookie(tokenDelegado) })).json().data.jugadores
    expect(stats.find((j: { jugadorId: string }) => j.jugadorId === jugadorX.id).participo).toBe(true)
    expect(stats.find((j: { jugadorId: string }) => j.jugadorId === jugadorX.id).salidaMinuto).toBe(30)
    expect(stats.find((j: { jugadorId: string }) => j.jugadorId === jugadorY.id).participo).toBe(true)
    expect(stats.find((j: { jugadorId: string }) => j.jugadorId === jugadorY.id).ingresoMinuto).toBe(30)
    expect(stats.find((j: { jugadorId: string }) => j.jugadorId === jugadorY.id).salidaMinuto).toBe(70)
    expect(stats.find((j: { jugadorId: string }) => j.jugadorId === jugadorX.id).minutos).toBeNull()
    expect(stats.find((j: { jugadorId: string }) => j.jugadorId === jugadorY.id).minutos).toBeNull()
    expect(stats.find((j: { jugadorId: string }) => j.jugadorId === jugadorZ.id).minutosNoDeterminados).toBe(true)
  })

  it('permisos: TECNICO carga, AUXILIAR/JUGADOR no; partido finalizado no carga ni reabre', async () => {
    const id = await partido()
    expect((await evento(id, { equipoId: equipoA.id, jugadorId: jugadorX.id, tipo: 'GOL' }, tokenTecnico)).statusCode).toBe(200)
    expect((await evento(id, { equipoId: equipoA.id, jugadorId: jugadorX.id, tipo: 'GOL' }, tokenAuxiliar)).statusCode).toBe(403)
    expect((await evento(id, { equipoId: equipoA.id, jugadorId: jugadorX.id, tipo: 'GOL' }, tokenJugador)).statusCode).toBe(403)
    await app.inject({ method: 'POST', url: `/api/partidos/${id}/estado`, payload: { estado: 'EN_CURSO' }, headers: conCookie(tokenDelegado) })
    expect((await app.inject({ method: 'POST', url: `/api/partidos/${id}/resultado`, payload: { golesLocal: 1, golesVisitante: 0 }, headers: conCookie(tokenDelegado) })).statusCode).toBe(200)
    expect((await evento(id, { equipoId: equipoA.id, jugadorId: jugadorX.id, tipo: 'GOL' })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url: `/api/partidos/${id}/estado`, payload: { estado: 'EN_CURSO' }, headers: conCookie(tokenDelegado) })).statusCode).toBe(409)
  })

  it('anulación y corrección quedan auditadas; tarjeta no crea sanción automática', async () => {
    const id = await partido()
    const creado = await evento(id, { equipoId: equipoA.id, jugadorId: jugadorX.id, tipo: 'GOL', minuto: 1 })
    const eventoId = creado.json().data.id
    await app.inject({ method: 'PATCH', url: `/api/eventos-partido/${eventoId}`, payload: { minuto: 2 }, headers: conCookie(tokenDelegado) })
    await app.inject({ method: 'POST', url: `/api/eventos-partido/${eventoId}/anular`, headers: conCookie(tokenDelegado) })
    expect(await getPrisma().eventoPartido.findUnique({ where: { id: eventoId } })).not.toBeNull()
    expect(await getPrisma().auditoriaLog.count({ where: { entidad: 'EventoPartido', entidadId: eventoId } })).toBeGreaterThanOrEqual(3)
    expect(await getPrisma().sancion.count({ where: { partidoId: id } })).toBe(0)
    expect(adminId).toBeTruthy()
  })

  it('estadística oficial excluye independiente y publicación respeta privacidad', async () => {
    const org = await crearOrganizacion('F9 torneo org')
    const torneo = await crearTorneo(org.id, 'F9 torneo', { estado: 'ACTIVO' })
    const temporada = await crearTemporada(torneo.id, 'F9 temporada')
    const categoria = await crearTorneoCategoria(torneo.id, temporada.id, (await getPrisma().categoria.create({ data: { nombre: 'F9 cat' } })).id)
    await getPrisma().equipoParticipacion.createMany({ data: [{ torneoId: torneo.id, temporadaId: temporada.id, equipoId: equipoA.id, estado: 'CONFIRMADO', torneoCategoriaId: categoria.id }, { torneoId: torneo.id, temporadaId: temporada.id, equipoId: equipoB.id, estado: 'CONFIRMADO', torneoCategoriaId: categoria.id }] })
    const oficial = await getPrisma().partido.create({ data: { tipo: 'OFICIAL', equipoLocalId: equipoA.id, equipoVisitanteId: equipoB.id, equipoResponsableId: equipoA.id, torneoId: torneo.id, temporadaId: temporada.id, torneoCategoriaId: categoria.id, fechaHora: new Date(), estado: 'FINALIZADO', publicada: true, golesLocal: 1, golesVisitante: 0 } })
    await getPrisma().eventoPartido.create({ data: { partidoId: oficial.id, equipoId: equipoA.id, jugadorId: jugadorX.id, tipo: 'GOL', creadoPorId: adminId } })
    const general = await app.inject({ method: 'GET', url: `/api/equipos/${equipoA.id}/estadisticas`, headers: conCookie(tokenDelegado) })
    expect(general.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: `/api/torneo-categorias/${categoria.id}/goleadores`, headers: conCookie(tokenDelegado) })).json().data[0].goles).toBe(1)
    expect((await app.inject({ method: 'GET', url: `/api/publico/partidos/${oficial.id}/estadisticas` })).statusCode).toBe(404)
  })
})
