import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { getPrisma } from '../db.js'
import { conCookie, login } from '../test/helpers.js'
import { agregarMiembroEquipo, crearEquipo, crearPersonaJugador, crearUsuario } from '../test/seed.js'
import { limpiarBase } from '../test/limpiar.js'

const suf = Date.now().toString(36)
const email = (rol: string) => `${rol}-${suf}@test.dev`

async function jugadorConCuenta(rol: string) {
  const pj = await crearPersonaJugador(`Jugador ${rol}`, suf)
  const usuario = await crearUsuario({
    email: email(rol),
    jugadorId: pj.jugador.id,
    roles: [{ codigo: 'JUGADOR' }],
  })
  return { jugadorId: pj.jugador.id, usuario }
}

describe('invitaciones de jugador y cuerpo técnico (FASE 13)', () => {
  let app: FastifyInstance

  let tokenDelegadoA: string
  let tokenTecnicoA: string
  let tokenAuxiliarA: string
  let tokenDelegadoB: string

  let equipoA: { id: string }
  let equipoB: { id: string }

  let jugadorX: { jugadorId: string; usuario: { id: string; email: string } }
  let jugadorOtro: { jugadorId: string; usuario: { id: string; email: string } }
  let jugadorRechaza: { jugadorId: string; usuario: { id: string; email: string } }
  let jugadorExpirado: { jugadorId: string; usuario: { id: string; email: string } }
  let jugadorRevocado1: { jugadorId: string; usuario: { id: string; email: string } }
  let jugadorRevocado2: { jugadorId: string; usuario: { id: string; email: string } }

  let cuerpoUser: { id: string; email: string }
  let cuerpoRechaza: { id: string; email: string }
  let cuerpoRevocado: { id: string; email: string }

  let tokenJugadorX: string
  let tokenJugadorOtro: string
  let tokenJugadorRechaza: string
  let tokenJugadorExpirado: string
  let tokenCuerpoUser: string

  beforeAll(async () => {
    app = buildApp()
    await app.ready()

    const delegadoA = await crearUsuario({ email: email('delegadoa'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    const tecnicoA = await crearUsuario({ email: email('tecnicoa'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    const auxiliarA = await crearUsuario({ email: email('auxiliara'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    const delegadoB = await crearUsuario({ email: email('delegadob'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })

    equipoA = await crearEquipo('Invitaciones A')
    equipoB = await crearEquipo('Invitaciones B')
    await agregarMiembroEquipo(delegadoA.id, equipoA.id, 'DELEGADO')
    await agregarMiembroEquipo(tecnicoA.id, equipoA.id, 'TECNICO')
    await agregarMiembroEquipo(auxiliarA.id, equipoA.id, 'AUXILIAR')
    await agregarMiembroEquipo(delegadoB.id, equipoB.id, 'DELEGADO')

    tokenDelegadoA = (await login(app, delegadoA.email, 'contraseña123')).token!
    tokenTecnicoA = (await login(app, tecnicoA.email, 'contraseña123')).token!
    tokenAuxiliarA = (await login(app, auxiliarA.email, 'contraseña123')).token!
    tokenDelegadoB = (await login(app, delegadoB.email, 'contraseña123')).token!

    jugadorX = await jugadorConCuenta('jugadorx')
    jugadorOtro = await jugadorConCuenta('jugadorotro')
    jugadorRechaza = await jugadorConCuenta('jugadorrechaza')
    jugadorExpirado = await jugadorConCuenta('jugadorexpirado')
    jugadorRevocado1 = await jugadorConCuenta('jugadorrevocado1')
    jugadorRevocado2 = await jugadorConCuenta('jugadorrevocado2')

    tokenJugadorX = (await login(app, jugadorX.usuario.email, 'contraseña123')).token!
    tokenJugadorOtro = (await login(app, jugadorOtro.usuario.email, 'contraseña123')).token!
    tokenJugadorRechaza = (await login(app, jugadorRechaza.usuario.email, 'contraseña123')).token!
    tokenJugadorExpirado = (await login(app, jugadorExpirado.usuario.email, 'contraseña123')).token!

    cuerpoUser = await crearUsuario({ email: email('cuerpouser'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    cuerpoRechaza = await crearUsuario({ email: email('cuerporechaza'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    cuerpoRevocado = await crearUsuario({ email: email('cuerporevocado'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    tokenCuerpoUser = (await login(app, cuerpoUser.email, 'contraseña123')).token!
  })

  afterAll(async () => {
    await app.close()
    await limpiarBase()
  })

  it('1. TECNICO invita un jugador con cuenta: queda PENDIENTE, EquipoJugador INVITADO y se notifica al jugador', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-jugador`,
      payload: { jugadorId: jugadorX.jugadorId, mensaje: 'Sumate al plantel' },
      headers: conCookie(tokenTecnicoA),
    })
    expect(res.statusCode).toBe(200)
    const inv = res.json().data
    expect(inv.tipo).toBe('JUGADOR')
    expect(inv.estado).toBe('PENDIENTE')
    expect(inv.mensaje).toBe('Sumate al plantel')
    expect(inv.jugadorId).toBe(jugadorX.jugadorId)

    const ej = await getPrisma().equipoJugador.findFirst({
      where: { equipoId: equipoA.id, jugadorId: jugadorX.jugadorId },
    })
    expect(ej?.estado).toBe('INVITADO')
    expect(ej?.invitacionId).toBe(inv.id)

    const notis = await app.inject({ method: 'GET', url: '/api/notificaciones', headers: conCookie(tokenJugadorX) })
    const lista = notis.json().data as Array<{ tipo: string; entidadTipo: string; entidadId: string }>
    expect(lista.some((n) => n.tipo === 'INVITACION_JUGADOR' && n.entidadTipo === 'Invitacion' && n.entidadId === inv.id)).toBe(true)
  })

  it('2. el conteo de plantel excluye a los INVITADO y agrega cantidades.invitados', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/equipos/${equipoA.id}`, headers: conCookie(tokenDelegadoA) })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.cantidades).toMatchObject({ jugadores: 0, invitados: 1 })
  })

  it('3. no se puede invitar dos veces mientras haya una pendiente', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-jugador`,
      payload: { jugadorId: jugadorX.jugadorId },
      headers: conCookie(tokenTecnicoA),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('invitacion_pendiente')
  })

  it('4. AUXILIAR y un DELEGADO de otro equipo no pueden invitar', async () => {
    const aux = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-jugador`,
      payload: { jugadorId: jugadorOtro.jugadorId },
      headers: conCookie(tokenAuxiliarA),
    })
    expect(aux.statusCode).toBe(403)

    const ajeno = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-jugador`,
      payload: { jugadorId: jugadorOtro.jugadorId },
      headers: conCookie(tokenDelegadoB),
    })
    expect(ajeno.statusCode).toBe(403)
  })

  it('5. persona nueva crea Persona+Jugador y queda INVITADO', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-jugador`,
      payload: { persona: { nombre: 'Nuevo', apellido: 'Jugador' } },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    const inv = res.json().data
    const creado = await getPrisma().jugador.findUnique({
      where: { id: inv.jugadorId },
      include: { persona: true },
    })
    expect(creado?.persona.nombre).toBe('Nuevo')
    expect(creado?.persona.apellido).toBe('Jugador')
    const ej = await getPrisma().equipoJugador.findFirst({
      where: { equipoId: equipoA.id, jugadorId: inv.jugadorId },
    })
    expect(ej?.estado).toBe('INVITADO')
  })

  it('6. persona duplicada por DNI es rechazada', async () => {
    const primer = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-jugador`,
      payload: { persona: { nombre: 'Con', apellido: 'Documento', dni: '33333333' } },
      headers: conCookie(tokenDelegadoA),
    })
    expect(primer.statusCode).toBe(200)
    const segundo = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-jugador`,
      payload: { persona: { nombre: 'Otro', apellido: 'Nombre', dni: '33333333' } },
      headers: conCookie(tokenDelegadoA),
    })
    expect(segundo.statusCode).toBe(409)
    expect(segundo.json().error.code).toBe('persona_duplicada')
  })

  it('7. el jugador destinatario puede aceptar y queda ACTIVO', async () => {
    const pendiente = await getPrisma().invitacion.findFirstOrThrow({
      where: { equipoId: equipoA.id, jugadorId: jugadorX.jugadorId, estado: 'PENDIENTE' },
      select: { id: true },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/invitaciones/${pendiente.id}/responder`,
      payload: { aceptar: true },
      headers: conCookie(tokenJugadorX),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('ACEPTADA')
    const ej = await getPrisma().equipoJugador.findFirst({
      where: { equipoId: equipoA.id, jugadorId: jugadorX.jugadorId },
    })
    expect(ej?.estado).toBe('ACTIVO')
  })

  it('8. el creador recibe la notificación de respuesta', async () => {
    const notis = await app.inject({ method: 'GET', url: '/api/notificaciones', headers: conCookie(tokenTecnicoA) })
    const lista = notis.json().data as Array<{ tipo: string; mensaje: string }>
    expect(lista.some((n) => n.tipo === 'RESPUESTA_INVITACION' && n.mensaje.includes('aceptó'))).toBe(true)
  })

  it('9. un tercero no puede responder una invitación ajena', async () => {
    const inv = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-jugador`,
      payload: { jugadorId: jugadorOtro.jugadorId },
      headers: conCookie(tokenDelegadoA),
    })
    expect(inv.statusCode).toBe(200)
    const pendiente = inv.json().data as { id: string }
    const propio = await app.inject({
      method: 'POST',
      url: `/api/invitaciones/${pendiente.id}/responder`,
      payload: { aceptar: true },
      headers: conCookie(tokenJugadorOtro),
    })
    expect(propio.statusCode).toBe(200)
    expect(propio.json().data.estado).toBe('ACEPTADA')
    const ajeno = await app.inject({
      method: 'POST',
      url: `/api/invitaciones/${pendiente.id}/responder`,
      payload: { aceptar: false },
      headers: conCookie(tokenJugadorX),
    })
    expect(ajeno.statusCode).toBe(403)
  })

  it('10. rechazar deja al jugador en BAJA con motivo', async () => {
    const inv = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-jugador`,
      payload: { jugadorId: jugadorRechaza.jugadorId },
      headers: conCookie(tokenDelegadoA),
    })
    const id = inv.json().data.id
    const res = await app.inject({
      method: 'POST',
      url: `/api/invitaciones/${id}/responder`,
      payload: { aceptar: false },
      headers: conCookie(tokenJugadorRechaza),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('RECHAZADA')
    const ej = await getPrisma().equipoJugador.findFirst({
      where: { equipoId: equipoA.id, jugadorId: jugadorRechaza.jugadorId },
    })
    expect(ej?.estado).toBe('BAJA')
    expect(ej?.motivoBaja).toBe('invitación rechazada')
  })

  it('11. una invitación vencida no puede aceptarse (expiración lazy)', async () => {
    const inv = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-jugador`,
      payload: { jugadorId: jugadorExpirado.jugadorId },
      headers: conCookie(tokenDelegadoA),
    })
    const id = inv.json().data.id
    await getPrisma().invitacion.update({ where: { id }, data: { expiraEn: new Date(Date.now() - 1000) } })

    const res = await app.inject({
      method: 'POST',
      url: `/api/invitaciones/${id}/responder`,
      payload: { aceptar: true },
      headers: conCookie(tokenJugadorExpirado),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('invitacion_expirada')

    const expirada = await getPrisma().invitacion.findUniqueOrThrow({ where: { id } })
    expect(expirada.estado).toBe('EXPIRADA')
    const ej = await getPrisma().equipoJugador.findFirst({
      where: { equipoId: equipoA.id, jugadorId: jugadorExpirado.jugadorId },
    })
    expect(ej?.estado).toBe('BAJA')
    expect(ej?.motivoBaja).toBe('invitación expirada')
  })

  it('12. revocación por el emisor y por un DELEGADO', async () => {
    const porEmisor = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-jugador`,
      payload: { jugadorId: jugadorRevocado1.jugadorId },
      headers: conCookie(tokenTecnicoA),
    })
    const id1 = porEmisor.json().data.id
    const r1 = await app.inject({
      method: 'POST',
      url: `/api/invitaciones/${id1}/revocar`,
      headers: conCookie(tokenTecnicoA),
    })
    expect(r1.statusCode).toBe(200)
    expect(r1.json().data.estado).toBe('REVOCADA')

    const porDelegado = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-jugador`,
      payload: { jugadorId: jugadorRevocado2.jugadorId },
      headers: conCookie(tokenTecnicoA),
    })
    const id2 = porDelegado.json().data.id
    const r2 = await app.inject({
      method: 'POST',
      url: `/api/invitaciones/${id2}/revocar`,
      headers: conCookie(tokenDelegadoA),
    })
    expect(r2.statusCode).toBe(200)
    expect(r2.json().data.estado).toBe('REVOCADA')

    const ej = await getPrisma().equipoJugador.findFirst({
      where: { equipoId: equipoA.id, jugadorId: jugadorRevocado2.jugadorId },
    })
    expect(ej?.estado).toBe('BAJA')
    expect(ej?.motivoBaja).toBe('invitación revocada')
  })

  it('13. un no-miembro no puede ver el historial de invitaciones', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/equipos/${equipoA.id}/invitaciones`, headers: conCookie(tokenJugadorOtro) })
    expect(res.statusCode).toBe(403)
  })

  it('14. el DELEGADO ve el historial completo y no se exponen emails ni DNI', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/equipos/${equipoA.id}/invitaciones`, headers: conCookie(tokenDelegadoA) })
    expect(res.statusCode).toBe(200)
    const lista = res.json().data as Array<{ destinatario: Record<string, unknown> }>
    expect(lista.length).toBeGreaterThan(0)
    expect(JSON.stringify(lista)).not.toMatch(/@test\.dev|dni|email/)
    for (const inv of lista) {
      expect(inv.destinatario).toHaveProperty('nombre')
      expect(inv.destinatario).toHaveProperty('apellido')
    }
  })

  it('15. un miembro no-DELEGADO solo ve invitaciones ACEPTADA', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/equipos/${equipoA.id}/invitaciones`, headers: conCookie(tokenTecnicoA) })
    expect(res.statusCode).toBe(200)
    const lista = res.json().data as Array<{ estado: string }>
    expect(lista.length).toBeGreaterThan(0)
    for (const inv of lista) {
      expect(inv.estado).toBe('ACEPTADA')
    }
  })

  it('16. DELEGADO invita al cuerpo técnico por email exacto', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-cuerpo`,
      payload: { email: cuerpoUser.email, rolEnEquipo: 'TECNICO', mensaje: 'Te esperamos' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(202)
    expect(res.json().data.mensaje).toContain('Si existe')
    const inv = await getPrisma().invitacion.findFirstOrThrow({ where: { equipoId: equipoA.id, usuarioId: cuerpoUser.id, tipo: 'CUERPO_TECNICO' } })
    expect(inv.tipo).toBe('CUERPO_TECNICO')
    expect(inv.estado).toBe('PENDIENTE')
    expect(inv.rolEnEquipo).toBe('TECNICO')

    const notis = await app.inject({ method: 'GET', url: '/api/notificaciones', headers: conCookie(tokenCuerpoUser) })
    const lista = notis.json().data as Array<{ tipo: string; entidadId: string }>
    expect(lista.some((n) => n.tipo === 'INVITACION_CUERPO_TECNICO' && n.entidadId === inv.id)).toBe(true)
  })

  it('17. email existente e inexistente responden igual sin enumerar cuentas', async () => {
    const antes = await getPrisma().invitacion.count()
    const res = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-cuerpo`,
      payload: { email: `nadie-${suf}@test.dev`, rolEnEquipo: 'TECNICO' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(202)
    expect(res.json().data).toEqual({ mensaje: 'Si existe una cuenta elegible, recibirá una invitación' })
    expect(await getPrisma().invitacion.count()).toBe(antes)
  })

  it('18. un TECNICO no puede invitar al cuerpo y un rol inválido es rechazado', async () => {
    const sinPermiso = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-cuerpo`,
      payload: { email: email('otrosinpermiso'), rolEnEquipo: 'TECNICO' },
      headers: conCookie(tokenTecnicoA),
    })
    expect(sinPermiso.statusCode).toBe(403)

    const rolInvalido = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-cuerpo`,
      payload: { email: email('otrosrol'), rolEnEquipo: 'ENTRENADOR' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(rolInvalido.statusCode).toBe(400)
  })

  it('19. una invitación de cuerpo duplicada conserva respuesta uniforme', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-cuerpo`,
      payload: { email: cuerpoUser.email, rolEnEquipo: 'TECNICO' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(202)
    expect(res.json().data).toEqual({ mensaje: 'Si existe una cuenta elegible, recibirá una invitación' })
  })

  it('20. al aceptar, el usuario queda como miembro activo con el rol e invitadoPorId', async () => {
    const pendiente = await getPrisma().invitacion.findFirstOrThrow({
      where: { equipoId: equipoA.id, usuarioId: cuerpoUser.id, estado: 'PENDIENTE' },
      select: { id: true, creadoPorId: true },
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/invitaciones/${pendiente.id}/responder`,
      payload: { aceptar: true },
      headers: conCookie(tokenCuerpoUser),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('ACEPTADA')

    const eu = await getPrisma().equipoUsuario.findFirstOrThrow({
      where: { equipoId: equipoA.id, usuarioId: cuerpoUser.id },
    })
    expect(eu.activo).toBe(true)
    expect(eu.rolEnEquipo).toBe('TECNICO')
    expect(eu.invitadoPorId).toBe(pendiente.creadoPorId)
  })

  it('21. rechazo de cuerpo técnico no crea membresía', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-cuerpo`,
      payload: { email: cuerpoRechaza.email, rolEnEquipo: 'AUXILIAR' },
      headers: conCookie(tokenDelegadoA),
    })
    const id = (await getPrisma().invitacion.findFirstOrThrow({ where: { equipoId: equipoA.id, usuarioId: cuerpoRechaza.id, tipo: 'CUERPO_TECNICO' } })).id
    const res = await app.inject({
      method: 'POST',
      url: `/api/invitaciones/${id}/responder`,
      payload: { aceptar: false },
      headers: conCookie((await login(app, cuerpoRechaza.email, 'contraseña123')).token!),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('RECHAZADA')
    const eu = await getPrisma().equipoUsuario.findFirst({
      where: { equipoId: equipoA.id, usuarioId: cuerpoRechaza.id, activo: true },
    })
    expect(eu).toBeNull()
  })

  it('22. revocación de invitación de cuerpo por un DELEGADO', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/invitaciones-cuerpo`,
      payload: { email: cuerpoRevocado.email, rolEnEquipo: 'AUXILIAR' },
      headers: conCookie(tokenDelegadoA),
    })
    const id = (await getPrisma().invitacion.findFirstOrThrow({ where: { equipoId: equipoA.id, usuarioId: cuerpoRevocado.id, tipo: 'CUERPO_TECNICO' } })).id
    const res = await app.inject({
      method: 'POST',
      url: `/api/invitaciones/${id}/revocar`,
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('REVOCADA')
  })

  it('23. el destinatario ve sus invitaciones en /invitaciones/mias', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/invitaciones/mias', headers: conCookie(tokenCuerpoUser) })
    expect(res.statusCode).toBe(200)
    const lista = res.json().data as Array<{ tipo: string; estado: string; equipo: { id: string; nombre: string } }>
    expect(lista.some((i) => i.tipo === 'CUERPO_TECNICO' && i.estado === 'ACEPTADA' && i.equipo.id === equipoA.id)).toBe(true)
  })
})
