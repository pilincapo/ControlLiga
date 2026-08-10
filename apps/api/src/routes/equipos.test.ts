import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { getPrisma } from '../db.js'
import { conCookie, login, registrar } from '../test/helpers.js'
import { crearPersonaJugador, crearUsuario } from '../test/seed.js'
import { limpiarBase } from '../test/limpiar.js'

const suf = Date.now().toString(36)
const email = (rol: string) => `${rol}-${suf}@test.dev`

describe('módulo de equipos, planteles y jugadores (FASE 4)', () => {
  let app: FastifyInstance

  let usuarioSuper: { id: string; email: string }
  let usuarioDelegadoA: { id: string; email: string }
  let usuarioTecnicoA: { id: string; email: string }
  let usuarioAuxiliarA: { id: string; email: string }
  let usuarioDelegadoB: { id: string; email: string }
  let usuarioJugador: { id: string; email: string }
  let usuarioTemp: { id: string; email: string }

  let tokenSuper: string
  let tokenDelegadoA: string
  let tokenTecnicoA: string
  let tokenAuxiliarA: string
  let tokenDelegadoB: string
  let tokenJugador: string

  let equipoA: { id: string }
  let equipoB: { id: string }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()

    usuarioSuper = await crearUsuario({ email: email('super'), roles: [{ codigo: 'SUPERADMIN' }] })
    usuarioDelegadoA = await crearUsuario({ email: email('delegadoa'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    usuarioTecnicoA = await crearUsuario({ email: email('tecnicoa'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    usuarioAuxiliarA = await crearUsuario({ email: email('auxiliara'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    usuarioDelegadoB = await crearUsuario({ email: email('delegadob'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    usuarioTemp = await crearUsuario({ email: email('temp'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })

    const jx = await crearPersonaJugador('Jugador', 'X')
    usuarioJugador = await crearUsuario({
      email: email('jugador'),
      jugadorId: jx.jugador.id,
      roles: [{ codigo: 'JUGADOR' }],
    })

    tokenSuper = (await login(app, usuarioSuper.email, 'contraseña123')).token!
    tokenDelegadoA = (await login(app, usuarioDelegadoA.email, 'contraseña123')).token!
    tokenTecnicoA = (await login(app, usuarioTecnicoA.email, 'contraseña123')).token!
    tokenAuxiliarA = (await login(app, usuarioAuxiliarA.email, 'contraseña123')).token!
    tokenDelegadoB = (await login(app, usuarioDelegadoB.email, 'contraseña123')).token!
    tokenJugador = (await login(app, usuarioJugador.email, 'contraseña123')).token!
  })

  afterAll(async () => {
    await app.close()
    await limpiarBase()
  })

  // ---------- CREACIÓN DE EQUIPO Y ADMINISTRADORES ----------

  it('DELEGADO crea un equipo y el creador queda como DELEGADO', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/equipos',
      payload: { nombre: 'Club Atlético A', descripcion: 'Equipo de barrio', telefono: '1555111111' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    equipoA = { id: res.json().data.id }
    expect(res.json().data.privado).toBe(true)

    const detalle = await app.inject({
      method: 'GET',
      url: `/api/equipos/${equipoA.id}`,
      headers: conCookie(tokenDelegadoA),
    })
    expect(detalle.statusCode).toBe(200)
    expect(detalle.json().data.administradores.some((a: { rolEnEquipo: string; usuarioId: string }) => a.rolEnEquipo === 'DELEGADO' && a.usuarioId === usuarioDelegadoA.id)).toBe(true)
    expect(detalle.json().data.telefono).toBe('1555111111')
  })

  it('DELEGADO agrega TECNICO y AUXILIAR, cambia rol y da de baja', async () => {
    const agregaT = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/administradores`,
      payload: { usuarioId: usuarioTecnicoA.id, rolEnEquipo: 'TECNICO' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(agregaT.statusCode).toBe(200)

    const agregaX = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/administradores`,
      payload: { usuarioId: usuarioAuxiliarA.id, rolEnEquipo: 'AUXILIAR' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(agregaX.statusCode).toBe(200)

    const agregaTemp = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/administradores`,
      payload: { usuarioId: usuarioTemp.id, rolEnEquipo: 'AUXILIAR' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(agregaTemp.statusCode).toBe(200)
    const euTemp = agregaTemp.json().data.id

    const cambia = await app.inject({
      method: 'PATCH',
      url: `/api/equipos/${equipoA.id}/administradores/${euTemp}`,
      payload: { rolEnEquipo: 'AUXILIAR' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(cambia.statusCode).toBe(200)
    expect(cambia.json().data.rolEnEquipo).toBe('AUXILIAR')

    const daBaja = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/administradores/${euTemp}/baja`,
      headers: conCookie(tokenDelegadoA),
    })
    expect(daBaja.statusCode).toBe(200)
    expect(daBaja.json().data.activo).toBe(false)
  })

  it('no se puede dar de baja al último DELEGADO', async () => {
    const detalle = await app.inject({
      method: 'GET',
      url: `/api/equipos/${equipoA.id}`,
      headers: conCookie(tokenSuper),
    })
    const delegado = detalle.json().data.administradores.find(
      (a: { rolEnEquipo: string }) => a.rolEnEquipo === 'DELEGADO',
    )
    expect(delegado).toBeDefined()

    const res = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/administradores/${delegado.id}/baja`,
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('ultimo_delegado')
  })

  it('DELEGADO puede modificar su equipo', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/equipos/${equipoA.id}`,
      payload: { nombre: 'Club Atlético A Renovado', privado: false },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.nombre).toBe('Club Atlético A Renovado')
    expect(res.json().data.privado).toBe(false)
  })

  it('TECNICO no puede modificar la configuración del equipo', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/equipos/${equipoA.id}`,
      payload: { nombre: 'Hackeado' },
      headers: conCookie(tokenTecnicoA),
    })
    expect(res.statusCode).toBe(403)
  })

  it('DELEGADO de Equipo A no puede modificar Equipo B', async () => {
    const creado = await app.inject({
      method: 'POST',
      url: '/api/equipos',
      payload: { nombre: 'Equipo B' },
      headers: conCookie(tokenDelegadoB),
    })
    expect(creado.statusCode).toBe(200)
    equipoB = { id: creado.json().data.id }

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/equipos/${equipoB.id}`,
      payload: { nombre: 'Hackeado' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(403)
  })

  it('SUPERADMIN puede crear y ver cualquier equipo', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/equipos/${equipoB.id}`,
      headers: conCookie(tokenSuper),
    })
    expect(res.statusCode).toBe(200)
  })

  // ---------- JUGADORES ----------

  it('se crea un jugador sin DNI', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jugadores',
      payload: {
        persona: { nombre: 'Juan', apellido: 'Perez' },
        pieDominante: 'Derecho',
        posicionFavorita: 'DELANTERO',
      },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.id).toBeDefined()
  })

  it('se crea un jugador con DNI', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jugadores',
      payload: {
        persona: { nombre: 'Ana', apellido: 'Gomez', dni: '30123456' },
      },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.id).toBeDefined()
  })

  it('no se duplica una Persona por DNI', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/jugadores',
      payload: {
        persona: { nombre: 'Ana', apellido: 'Gomez', dni: '30123456' },
      },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(409)
  })

  it('búsqueda por DNI encuentra el jugador existente', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/jugadores?dni=30123456`,
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.length).toBeGreaterThanOrEqual(1)
    expect(res.json().data[0].dni).toBe('30123456')
  })

  it('TECNICO puede gestionar jugadores (incorporar al plantel)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/jugadores`,
      payload: {
        persona: { nombre: 'Luis', apellido: 'Tecnico', dni: '30129999' },
        dorsal: 10,
        posiciones: 'MEDIOCAMPISTA',
      },
      headers: conCookie(tokenTecnicoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('ACTIVO')
    expect(res.json().data.dorsal).toBe(10)
  })

  it('AUXILIAR no puede gestionar jugadores', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/jugadores`,
      payload: { persona: { nombre: 'X', apellido: 'Y' } },
      headers: conCookie(tokenAuxiliarA),
    })
    expect(res.statusCode).toBe(403)
  })

  it('AUXILIAR puede consultar el plantel', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/equipos/${equipoA.id}/jugadores`,
      headers: conCookie(tokenAuxiliarA),
    })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json().data)).toBe(true)
  })

  it('se incorpora un jugador existente', async () => {
    const creado = await app.inject({
      method: 'POST',
      url: '/api/jugadores',
      payload: { persona: { nombre: 'Marta', apellido: 'Diaz', dni: '30123333' } },
      headers: conCookie(tokenDelegadoA),
    })
    const jugadorId = creado.json().data.id

    const res = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/jugadores`,
      payload: { jugadorId, dorsal: 7 },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.jugadorId).toBe(jugadorId)
    expect(res.json().data.dorsal).toBe(7)
  })

  it('no se incorpora dos veces el mismo jugador al mismo equipo', async () => {
    const creado = await app.inject({
      method: 'POST',
      url: '/api/jugadores',
      payload: { persona: { nombre: 'Nora', apellido: 'Lopez', dni: '30124444' } },
      headers: conCookie(tokenDelegadoA),
    })
    const jugadorId = creado.json().data.id

    const primero = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/jugadores`,
      payload: { jugadorId },
      headers: conCookie(tokenDelegadoA),
    })
    expect(primero.statusCode).toBe(200)

    const segundo = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/jugadores`,
      payload: { jugadorId },
      headers: conCookie(tokenDelegadoA),
    })
    expect(segundo.statusCode).toBe(409)
  })

  it('se cambia el dorsal por equipo', async () => {
    const plantel = await app.inject({
      method: 'GET',
      url: `/api/equipos/${equipoA.id}/jugadores`,
      headers: conCookie(tokenDelegadoA),
    })
    const jp = plantel.json().data.find((j: { nombre: string }) => j.nombre === 'Marta Diaz')

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/equipo-jugadores/${jp.id}`,
      payload: { dorsal: 11, posiciones: 'ARQUERO' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.dorsal).toBe(11)
    expect(res.json().data.posiciones).toBe('ARQUERO')
  })

  it('se cambia el estado del jugador en el equipo', async () => {
    const plantel = await app.inject({
      method: 'GET',
      url: `/api/equipos/${equipoA.id}/jugadores`,
      headers: conCookie(tokenDelegadoA),
    })
    const jp = plantel.json().data.find((j: { nombre: string }) => j.nombre === 'Marta Diaz')

    const res = await app.inject({
      method: 'POST',
      url: `/api/equipo-jugadores/${jp.id}/estado`,
      payload: { estado: 'LESIONADO' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('LESIONADO')
  })

  it('se da de baja un jugador sin eliminar el historial', async () => {
    const plantel = await app.inject({
      method: 'GET',
      url: `/api/equipos/${equipoA.id}/jugadores`,
      headers: conCookie(tokenDelegadoA),
    })
    const jp = plantel.json().data.find((j: { nombre: string }) => j.nombre === 'Marta Diaz')

    const res = await app.inject({
      method: 'POST',
      url: `/api/equipo-jugadores/${jp.id}/baja`,
      payload: { motivo: 'Cambio de club' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('BAJA')
    expect(res.json().data.fechaSalida).not.toBeNull()

    const enBase = await getPrisma().equipoJugador.findUnique({ where: { id: jp.id } })
    expect(enBase).not.toBeNull()
    expect(enBase?.estado).toBe('BAJA')
  })

  it('el jugador cambia de equipo conservando historial', async () => {
    const plantel = await app.inject({
      method: 'GET',
      url: `/api/equipos/${equipoA.id}/jugadores`,
      headers: conCookie(tokenDelegadoA),
    })
    const jpA = plantel.json().data.find((j: { nombre: string }) => j.nombre === 'Marta Diaz')

    const incorporar = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoB.id}/jugadores`,
      payload: { jugadorId: jpA.jugadorId, dorsal: 9 },
      headers: conCookie(tokenDelegadoB),
    })
    expect(incorporar.statusCode).toBe(200)

    const enA = await getPrisma().equipoJugador.findUnique({ where: { id: jpA.id } })
    expect(enA?.estado).toBe('BAJA')
    expect(enA?.fechaSalida).not.toBeNull()

    const enB = await getPrisma().equipoJugador.findFirst({
      where: { equipoId: equipoB.id, jugadorId: jpA.jugadorId },
    })
    expect(enB?.estado).toBe('ACTIVO')
    expect(enB?.dorsal).toBe(9)
  })

  it('la información privada del equipo no se expone a quienes no son miembros', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/equipos/${equipoA.id}`,
      headers: conCookie(tokenJugador),
    })
    expect(res.statusCode).toBe(403)
  })

  // ---------- VINCULACIÓN SEGURA ----------

  it('un usuario con DNI correcto se vincula al registrarse', async () => {
    const { jugador } = await crearPersonaJugador('Pedro', 'Registro', { dni: '30000444' })
    const { res } = await registrar(app, {
      email: email('pedro'),
      password: 'contraseña123',
      nombre: 'Pedro',
      apellido: 'Registro',
      dni: '30000444',
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().data.usuario.jugadorId).toBe(jugador.id)
  })

  it('no se permite apropiarse de otro jugador con DNI incorrecto', async () => {
    const { jugador: victima } = await crearPersonaJugador('Victima', 'Perfil', { dni: '30000666' })

    const { token } = await registrar(app, {
      email: email('atacante'),
      password: 'contraseña123',
      nombre: 'Atacante',
      apellido: 'Perfil',
    })
    expect(token).toBeDefined()

    const intento = await app.inject({
      method: 'POST',
      url: '/api/auth/me/vincular-jugador',
      payload: { jugadorId: victima.id, dni: '99999999' },
      headers: conCookie(token!),
    })
    expect(intento.statusCode).toBe(400)
  })

  it('la ficha del jugador muestra su historial de equipos y competiciones', async () => {
    const plantel = await app.inject({
      method: 'GET',
      url: `/api/equipos/${equipoA.id}/jugadores`,
      headers: conCookie(tokenDelegadoA),
    })
    const jp = plantel.json().data.find((j: { nombre: string }) => j.nombre === 'Luis Tecnico')

    const ficha = await app.inject({
      method: 'GET',
      url: `/api/jugadores/${jp.jugadorId}`,
      headers: conCookie(tokenDelegadoA),
    })
    expect(ficha.statusCode).toBe(200)
    expect(Array.isArray(ficha.json().data.historialEquipos)).toBe(true)
    expect(ficha.json().data.persona.dni).toBe('30129999')
  })

  it('las acciones sensibles quedan auditadas', async () => {
    const auditEquipo = await getPrisma().auditoriaLog.findFirst({
      where: { entidad: 'Equipo', entidadId: equipoA.id, accion: 'CREATE' },
    })
    expect(auditEquipo).not.toBeNull()

    const auditJugador = await getPrisma().auditoriaLog.findFirst({
      where: { entidad: 'Jugador', accion: 'CREATE' },
    })
    expect(auditJugador).not.toBeNull()

    const auditPlantel = await getPrisma().auditoriaLog.findFirst({
      where: { entidad: 'EquipoJugador', accion: 'CREATE' },
    })
    expect(auditPlantel).not.toBeNull()
  })
})
