import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { getPrisma } from '../db.js'
import { conCookie, login } from '../test/helpers.js'
import { agregarMiembroEquipo, agregarJugadorAEquipo as agregarPlantel, crearEquipo, crearPersonaJugador, crearUsuario } from '../test/seed.js'
import { limpiarBase } from '../test/limpiar.js'

describe('FASE 10 caja privada', () => {
  let app: FastifyInstance
  let equipo: { id: string }; let otroEquipo: { id: string }; let jugador: { id: string }
  let delegado: string; let otroDelegado: string; let tecnico: string; let auxiliar: string; let jugadorToken: string; let admin: string; let superToken: string
  let movimientoId = ''
  const sufijo = Date.now().toString(36)
  const headers = (token: string) => conCookie(token)
  const crear = (token: string, payload: unknown, equipoId = equipo.id) => app.inject({ method: 'POST', url: `/api/equipos/${equipoId}/caja`, headers: headers(token), payload })

  beforeAll(async () => {
    app = buildApp(); await app.ready()
    equipo = await crearEquipo('Caja A'); otroEquipo = await crearEquipo('Caja B')
    jugador = (await crearPersonaJugador('Caja', 'Jugador')).jugador
    await agregarPlantel(jugador.id, equipo.id)
    const uDelegado = await crearUsuario({ email: `caja-delegado-${sufijo}@test.dev`, roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    const uOtroDelegado = await crearUsuario({ email: `caja-otro-delegado-${sufijo}@test.dev`, roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    const uTecnico = await crearUsuario({ email: `caja-tecnico-${sufijo}@test.dev`, roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    const uAuxiliar = await crearUsuario({ email: `caja-auxiliar-${sufijo}@test.dev`, roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    const uJugador = await crearUsuario({ email: `caja-jugador-${sufijo}@test.dev`, jugadorId: jugador.id, roles: [{ codigo: 'JUGADOR' }] })
    const uAdmin = await crearUsuario({ email: `caja-admin-${sufijo}@test.dev`, roles: [{ codigo: 'ADMINISTRADOR' }] })
    const uSuper = await crearUsuario({ email: `caja-super-${sufijo}@test.dev`, roles: [{ codigo: 'SUPERADMIN' }] })
    await agregarMiembroEquipo(uDelegado.id, equipo.id, 'DELEGADO'); await agregarMiembroEquipo(uOtroDelegado.id, otroEquipo.id, 'DELEGADO'); await agregarMiembroEquipo(uTecnico.id, equipo.id, 'TECNICO'); await agregarMiembroEquipo(uAuxiliar.id, equipo.id, 'AUXILIAR')
    delegado = (await login(app, uDelegado.email, 'contraseña123')).token!; otroDelegado = (await login(app, uOtroDelegado.email, 'contraseña123')).token!; tecnico = (await login(app, uTecnico.email, 'contraseña123')).token!; auxiliar = (await login(app, uAuxiliar.email, 'contraseña123')).token!; jugadorToken = (await login(app, uJugador.email, 'contraseña123')).token!; admin = (await login(app, uAdmin.email, 'contraseña123')).token!; superToken = (await login(app, uSuper.email, 'contraseña123')).token!
  })
  afterAll(async () => { await app.close(); await limpiarBase() })

  it('1. exige autenticación', async () => expect((await app.inject({ method: 'GET', url: `/api/equipos/${equipo.id}/caja` })).statusCode).toBe(401))
  it('2. DELEGADO crea cuota pendiente', async () => { const r = await crear(delegado, { tipo: 'INGRESO', categoria: 'CUOTA', concepto: 'Cuota 1', importe: 100, jugadorId: jugador.id }); expect(r.statusCode).toBe(200); movimientoId = r.json().data.id; expect(r.json().data.estado).toBe('PENDIENTE') })
  it('3. DELEGADO crea aporte pagado', async () => expect((await crear(delegado, { tipo: 'INGRESO', categoria: 'APORTE', concepto: 'Aporte', importe: 50, estado: 'PAGADO' })).statusCode).toBe(200))
  it('4. rechaza importe cero', async () => expect((await crear(delegado, { tipo: 'INGRESO', categoria: 'CUOTA', concepto: 'x', importe: 0 })).statusCode).toBe(400))
  it('5. rechaza importe negativo', async () => expect((await crear(delegado, { tipo: 'EGRESO', categoria: 'OTROS', concepto: 'x', importe: -1 })).statusCode).toBe(400))
  it('6. asocia jugador existente del equipo', async () => expect((await crear(delegado, { tipo: 'INGRESO', categoria: 'CUOTA', concepto: 'Cuota 2', importe: 20, jugadorId: jugador.id })).statusCode).toBe(200))
  it('7. permite movimiento sin jugador', async () => expect((await crear(delegado, { tipo: 'EGRESO', categoria: 'CANCHA', concepto: 'Cancha', importe: 30, estado: 'PAGADO' })).statusCode).toBe(200))
  it('8. TECNICO consulta caja', async () => expect((await app.inject({ method: 'GET', url: `/api/equipos/${equipo.id}/caja`, headers: headers(tecnico) })).statusCode).toBe(200))
  it('9. TECNICO no crea', async () => expect((await crear(tecnico, { tipo: 'INGRESO', categoria: 'CUOTA', concepto: 'No', importe: 1 })).statusCode).toBe(403))
  it('10. AUXILIAR no consulta', async () => expect((await app.inject({ method: 'GET', url: `/api/equipos/${equipo.id}/caja`, headers: headers(auxiliar) })).statusCode).toBe(403))
  it('11. JUGADOR ve solo su historial', async () => { const r = await app.inject({ method: 'GET', url: `/api/jugadores/${jugador.id}/caja`, headers: headers(jugadorToken) }); expect(r.statusCode).toBe(200); expect(r.json().data.movimientos.every((m: { jugadorId: string }) => m.jugadorId === jugador.id)).toBe(true) })
  it('12. JUGADOR no ve caja completa', async () => expect((await app.inject({ method: 'GET', url: `/api/equipos/${equipo.id}/caja`, headers: headers(jugadorToken) })).statusCode).toBe(403))
  it('13. DELEGADO de otro equipo recibe 403', async () => expect((await app.inject({ method: 'GET', url: `/api/equipos/${equipo.id}/caja`, headers: headers(otroDelegado) })).statusCode).toBe(403))
  it('14. cambio pendiente a pagado', async () => { const r = await app.inject({ method: 'PATCH', url: `/api/movimientos-caja/${movimientoId}/estado`, headers: headers(delegado), payload: { estado: 'PAGADO' } }); expect(r.statusCode).toBe(200) })
  it('15. anulación lógica por DELETE', async () => expect((await app.inject({ method: 'DELETE', url: `/api/movimientos-caja/${movimientoId}`, headers: headers(delegado) })).statusCode).toBe(200))
  it('16. anulado conserva fila', async () => { const r = await app.inject({ method: 'GET', url: `/api/movimientos-caja/${movimientoId}`, headers: headers(delegado) }); expect(r.statusCode).toBe(200); expect(r.json().data.estado).toBe('ANULADO') })
  it('17. resumen excluye anulado y calcula saldo pagado', async () => { const r = await app.inject({ method: 'GET', url: `/api/equipos/${equipo.id}/caja/resumen`, headers: headers(delegado) }); expect(r.statusCode).toBe(200); expect(r.json().data.saldoActual).toBe(20) })
  it('18. filtra por estado y tipo', async () => { const r = await app.inject({ method: 'GET', url: `/api/equipos/${equipo.id}/caja?estado=PENDIENTE&tipo=INGRESO`, headers: headers(delegado) }); expect(r.statusCode).toBe(200); expect(r.json().data.movimientos.every((m: { estado: string; tipo: string }) => m.estado === 'PENDIENTE' && m.tipo === 'INGRESO')).toBe(true) })
  it('19. no existe caja pública', async () => expect((await app.inject({ method: 'GET', url: `/api/publico/equipos/${equipo.id}/caja` })).statusCode).toBe(404))
  it('20. audita create, estado y anulación', async () => { const n = await getPrisma().auditoriaLog.count({ where: { entidad: 'MovimientoCaja', entidadId: movimientoId } }); expect(n).toBe(3); expect((await app.inject({ method: 'GET', url: `/api/equipos/${equipo.id}/caja`, headers: headers(admin) })).statusCode).toBe(403); expect((await app.inject({ method: 'GET', url: `/api/equipos/${equipo.id}/caja`, headers: headers(superToken) })).statusCode).toBe(200) })
})
