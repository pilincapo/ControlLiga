import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { getPrisma } from '../db.js'
import { conCookie, login } from '../test/helpers.js'
import { crearPartido, crearUsuario } from '../test/seed.js'
import { limpiarBase } from '../test/limpiar.js'

const suf = Date.now().toString(36)
const email = (rol: string) => `${rol}-${suf}@test.dev`

describe('módulo de formaciones (FASE 5)', () => {
  let app: FastifyInstance

  let usuarioDelegadoA: { id: string; email: string }
  let usuarioTecnicoA: { id: string; email: string }
  let usuarioAuxiliarA: { id: string; email: string }
  let usuarioDelegadoB: { id: string; email: string }
  let usuarioJugador: { id: string; email: string }

  let tokenDelegadoA: string
  let tokenTecnicoA: string
  let tokenAuxiliarA: string
  let tokenDelegadoB: string
  let tokenJugador: string

  let equipoA: { id: string }
  let equipoB: { id: string }
  let jugadorX: { id: string }
  let jugadorY: { id: string }

  async function incorporar(equipoId: string, nombre: string, apellido: string, dni?: string): Promise<string> {
    const res = await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoId}/jugadores`,
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

    tokenDelegadoA = (await login(app, usuarioDelegadoA.email, 'contraseña123')).token!
    tokenTecnicoA = (await login(app, usuarioTecnicoA.email, 'contraseña123')).token!
    tokenAuxiliarA = (await login(app, usuarioAuxiliarA.email, 'contraseña123')).token!
    tokenDelegadoB = (await login(app, usuarioDelegadoB.email, 'contraseña123')).token!

    const eqA = await app.inject({ method: 'POST', url: '/api/equipos', payload: { nombre: 'Formaciones A' }, headers: conCookie(tokenDelegadoA) })
    equipoA = { id: eqA.json().data.id }
    const eqB = await app.inject({ method: 'POST', url: '/api/equipos', payload: { nombre: 'Formaciones B' }, headers: conCookie(tokenDelegadoB) })
    equipoB = { id: eqB.json().data.id }

    await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/administradores`,
      payload: { usuarioId: usuarioTecnicoA.id, rolEnEquipo: 'TECNICO' },
      headers: conCookie(tokenDelegadoA),
    })
    await app.inject({
      method: 'POST',
      url: `/api/equipos/${equipoA.id}/administradores`,
      payload: { usuarioId: usuarioAuxiliarA.id, rolEnEquipo: 'AUXILIAR' },
      headers: conCookie(tokenDelegadoA),
    })

    const jx = await incorporar(equipoA.id, 'Jugador', 'Xabier', '31000111')
    const jy = await incorporar(equipoA.id, 'Jugador', 'Yanez', '31000222')
    jugadorX = { id: jx }
    jugadorY = { id: jy }

    usuarioJugador = await crearUsuario({ email: email('jugador'), roles: [{ codigo: 'JUGADOR' }] })
    const jxj = await getPrisma().equipoJugador.findUnique({ where: { id: jugadorX.id }, select: { jugadorId: true } })
    await getPrisma().usuario.update({ where: { id: usuarioJugador.id }, data: { jugadorId: jxj!.jugadorId } })
    tokenJugador = (await login(app, usuarioJugador.email, 'contraseña123')).token!
  })

  afterAll(async () => {
    await app.close()
    await limpiarBase()
  })

  it('el catálogo de plantillas está sembrado', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/plantillas', headers: conCookie(tokenDelegadoA) })
    expect(res.statusCode).toBe(200)
    const nombres = res.json().data.map((p: { esquema: string }) => p.esquema)
    expect(nombres).toContain('4-3-3')
    expect(nombres).toContain('4-2-3-1')
    expect(nombres.length).toBeGreaterThanOrEqual(10)
  })

  it('DELEGADO crea una formación sin partido', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: {
        equipoId: equipoA.id,
        nombre: '11 ideal 2026',
        formacionTipo: 'FUTBOL_11',
        esquema: '4-4-2',
        jugadores: [{ equipoJugadorId: jugadorX.id, posicion: 'ARQ', esTitular: true, x: 50, y: 8, orden: 1 }],
      },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.partidoId).toBeNull()
    expect(res.json().data.publicada).toBe(false)
  })

  it('crear desde plantilla copia esquema y tipo', async () => {
    const plantillas = await app.inject({ method: 'GET', url: '/api/plantillas', headers: conCookie(tokenDelegadoA) })
    const p433 = plantillas.json().data.find((p: { esquema: string }) => p.esquema === '4-3-3')

    const res = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: { equipoId: equipoA.id, nombre: 'Titulares domingo', plantillaId: p433.id },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.esquema).toBe('4-3-3')
    expect(res.json().data.formacionTipo).toBe('FUTBOL_11')
  })

  it('TECNICO puede crear formaciones', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: { equipoId: equipoA.id, nombre: 'Vs Los Pibes', formacionTipo: 'FUTBOL_7' },
      headers: conCookie(tokenTecnicoA),
    })
    expect(res.statusCode).toBe(200)
  })

  it('AUXILIAR no puede crear formaciones', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: { equipoId: equipoA.id, nombre: 'No autorizada', formacionTipo: 'FUTBOL_7' },
      headers: conCookie(tokenAuxiliarA),
    })
    expect(res.statusCode).toBe(403)
  })

  it('DELEGADO de otro equipo no puede crear formaciones ajenas', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: { equipoId: equipoA.id, nombre: 'Intrusión', formacionTipo: 'FUTBOL_7' },
      headers: conCookie(tokenDelegadoB),
    })
    expect(res.statusCode).toBe(403)
  })

  it('no se puede incluir un jugador que no pertenece al equipo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: {
        equipoId: equipoA.id,
        nombre: 'Con intruso',
        formacionTipo: 'FUTBOL_7',
        jugadores: [{ equipoJugadorId: '00000000-0000-0000-0000-000000000000', posicion: 'ARQ' }],
      },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(400)
  })

  it('un jugador no puede aparecer dos veces en la misma formación', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: {
        equipoId: equipoA.id,
        nombre: 'Duplicado',
        formacionTipo: 'FUTBOL_7',
        jugadores: [
          { equipoJugadorId: jugadorX.id, posicion: 'ARQ' },
          { equipoJugadorId: jugadorX.id, posicion: 'DEL' },
        ],
      },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(400)
  })

  it('un jugador dado de baja no puede incorporarse a una formación', async () => {
    const ejId = await incorporar(equipoA.id, 'Bajado', 'Player', '31000333')
    await app.inject({
      method: 'POST',
      url: `/api/equipo-jugadores/${ejId}/baja`,
      payload: { motivo: 'Se fue' },
      headers: conCookie(tokenDelegadoA),
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: {
        equipoId: equipoA.id,
        nombre: 'Con bajado',
        formacionTipo: 'FUTBOL_7',
        jugadores: [{ equipoJugadorId: ejId, posicion: 'DEL' }],
      },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(400)
  })

  it('jugadores INACTIVO o LESIONADO pueden incluirse sin tocar su estado', async () => {
    const ejId = await incorporar(equipoA.id, 'Lesionado', 'Player', '31000444')
    await app.inject({
      method: 'POST',
      url: `/api/equipo-jugadores/${ejId}/estado`,
      payload: { estado: 'LESIONADO' },
      headers: conCookie(tokenDelegadoA),
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: {
        equipoId: equipoA.id,
        nombre: 'Con lesionado',
        formacionTipo: 'FUTBOL_7',
        jugadores: [{ equipoJugadorId: ejId, posicion: 'DEL' }],
      },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    const enBase = await getPrisma().equipoJugador.findUnique({ where: { id: ejId }, select: { estado: true } })
    expect(enBase?.estado).toBe('LESIONADO')
  })

  it('coordenadas fuera de rango se rechazan', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: {
        equipoId: equipoA.id,
        nombre: 'Coord mal',
        formacionTipo: 'FUTBOL_7',
        jugadores: [{ equipoJugadorId: jugadorY.id, posicion: 'DEL', x: 150, y: 10 }],
      },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(400)
  })

  it('se edita una formación reemplazando su plantel', async () => {
    const creada = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: {
        equipoId: equipoA.id,
        nombre: 'Editable',
        formacionTipo: 'FUTBOL_7',
        jugadores: [{ equipoJugadorId: jugadorX.id, posicion: 'ARQ' }],
      },
      headers: conCookie(tokenDelegadoA),
    })
    const id = creada.json().data.id

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/formaciones/${id}`,
      payload: {
        nombre: 'Editable v2',
        esquema: '2-3-1',
        jugadores: [{ equipoJugadorId: jugadorY.id, posicion: 'DEL', esTitular: true, x: 80, y: 90 }],
      },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)

    const detalle = await app.inject({ method: 'GET', url: `/api/formaciones/${id}`, headers: conCookie(tokenDelegadoA) })
    expect(detalle.json().data.nombre).toBe('Editable v2')
    expect(detalle.json().data.esquema).toBe('2-3-1')
    expect(detalle.json().data.jugadores.length).toBe(1)
    expect(detalle.json().data.jugadores[0].nombre).toBe('Jugador Yanez')
  })

  it('se clona una formación sin modificar la original', async () => {
    const creada = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: {
        equipoId: equipoA.id,
        nombre: 'Clonar base',
        formacionTipo: 'FUTBOL_7',
        jugadores: [{ equipoJugadorId: jugadorX.id, posicion: 'ARQ', esTitular: true, x: 50, y: 8 }],
      },
      headers: conCookie(tokenDelegadoA),
    })
    const id = creada.json().data.id

    const clon = await app.inject({
      method: 'POST',
      url: `/api/formaciones/${id}/clonar`,
      headers: conCookie(tokenDelegadoA),
    })
    expect(clon.statusCode).toBe(200)
    expect(clon.json().data.nombre).toBe('Clonar base (copia)')

    const original = await app.inject({ method: 'GET', url: `/api/formaciones/${id}`, headers: conCookie(tokenDelegadoA) })
    expect(original.json().data.nombre).toBe('Clonar base')
    expect(original.json().data.jugadores.length).toBe(1)
  })

  it('asociar a partido crea una instancia snapshot inmutable', async () => {
    const partido = await crearPartido(equipoA.id)
    const creada = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: {
        equipoId: equipoA.id,
        nombre: 'Para el partido',
        formacionTipo: 'FUTBOL_11',
        esquema: '4-3-3',
        jugadores: [{ equipoJugadorId: jugadorX.id, posicion: 'ARQ', esTitular: true, x: 50, y: 8, orden: 1 }],
      },
      headers: conCookie(tokenDelegadoA),
    })
    const id = creada.json().data.id

    const asociar = await app.inject({
      method: 'POST',
      url: `/api/formaciones/${id}/asociar-partido`,
      payload: { partidoId: partido.id },
      headers: conCookie(tokenDelegadoA),
    })
    expect(asociar.statusCode).toBe(200)

    const instancia = await getPrisma().formacionInstancia.findFirst({ where: { formacionId: id } })
    expect(instancia).not.toBeNull()
    const instanciaJugador = await getPrisma().formacionInstanciaJugador.findFirst({ where: { formacionInstanciaId: instancia!.id } })
    expect(instanciaJugador?.nombreSnapshot).toBe('Jugador Xabier')
    expect(instanciaJugador?.dorsalSnapshot).toBe(10)

    const duplicado = await app.inject({
      method: 'POST',
      url: `/api/formaciones/${id}/asociar-partido`,
      payload: { partidoId: partido.id },
      headers: conCookie(tokenDelegadoA),
    })
    expect(duplicado.statusCode).toBe(409)
  })

  it('editar la plantilla no modifica la instancia histórica', async () => {
    const partido = await crearPartido(equipoA.id)
    const creada = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: {
        equipoId: equipoA.id,
        nombre: 'Historica',
        formacionTipo: 'FUTBOL_11',
        esquema: '4-3-3',
        jugadores: [{ equipoJugadorId: jugadorX.id, posicion: 'ARQ', esTitular: true, x: 50, y: 8, orden: 1 }],
      },
      headers: conCookie(tokenDelegadoA),
    })
    const id = creada.json().data.id
    await app.inject({
      method: 'POST',
      url: `/api/formaciones/${id}/asociar-partido`,
      payload: { partidoId: partido.id },
      headers: conCookie(tokenDelegadoA),
    })

    await app.inject({
      method: 'PATCH',
      url: `/api/formaciones/${id}`,
      payload: { esquema: '4-4-2', jugadores: [{ equipoJugadorId: jugadorY.id, posicion: 'DEL', esTitular: false, x: 70, y: 80, orden: 2 }] },
      headers: conCookie(tokenDelegadoA),
    })

    const instancia = await getPrisma().formacionInstancia.findFirst({ where: { formacionId: id } })
    const instanciaJugador = await getPrisma().formacionInstanciaJugador.findFirst({ where: { formacionInstanciaId: instancia!.id } })
    expect(instanciaJugador?.nombreSnapshot).toBe('Jugador Xabier')
    expect(instancia?.esquema).toBe('4-3-3')
    expect(instanciaJugador?.posicion).toBe('ARQ')
  })

  it('no se puede asociar un partido que no involucra al equipo', async () => {
    const partidoB = await crearPartido(equipoB.id)
    const creada = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: { equipoId: equipoA.id, nombre: 'Partido ajeno', formacionTipo: 'FUTBOL_7' },
      headers: conCookie(tokenDelegadoA),
    })
    const res = await app.inject({
      method: 'POST',
      url: `/api/formaciones/${creada.json().data.id}/asociar-partido`,
      payload: { partidoId: partidoB.id },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(400)
  })

  it('solo el DELEGADO puede eliminar formaciones', async () => {
    const creada = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: { equipoId: equipoA.id, nombre: 'Para borrar', formacionTipo: 'FUTBOL_7' },
      headers: conCookie(tokenDelegadoA),
    })
    const id = creada.json().data.id

    const comoTecnico = await app.inject({
      method: 'DELETE',
      url: `/api/formaciones/${id}`,
      headers: conCookie(tokenTecnicoA),
    })
    expect(comoTecnico.statusCode).toBe(403)

    const comoDelegado = await app.inject({
      method: 'DELETE',
      url: `/api/formaciones/${id}`,
      headers: conCookie(tokenDelegadoA),
    })
    expect(comoDelegado.statusCode).toBe(200)
  })

  it('la formación privada no es visible para un no miembro', async () => {
    const creada = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: { equipoId: equipoA.id, nombre: 'Privada', formacionTipo: 'FUTBOL_7' },
      headers: conCookie(tokenDelegadoA),
    })
    const res = await app.inject({
      method: 'GET',
      url: `/api/formaciones/${creada.json().data.id}`,
      headers: conCookie(tokenDelegadoB),
    })
    expect(res.statusCode).toBe(403)
  })

  it('un JUGADOR del equipo puede ver las formaciones de su equipo', async () => {
    const creada = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: {
        equipoId: equipoA.id,
        nombre: 'Visible para jugador',
        formacionTipo: 'FUTBOL_7',
        jugadores: [{ equipoJugadorId: jugadorX.id, posicion: 'ARQ' }],
      },
      headers: conCookie(tokenDelegadoA),
    })
    const res = await app.inject({
      method: 'GET',
      url: `/api/formaciones/${creada.json().data.id}`,
      headers: conCookie(tokenJugador),
    })
    expect(res.statusCode).toBe(200)
  })

  it('publicar expone la formación en el endpoint público', async () => {
    const creada = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: {
        equipoId: equipoA.id,
        nombre: 'Formación pública',
        formacionTipo: 'FUTBOL_11',
        esquema: '4-3-3',
        jugadores: [{ equipoJugadorId: jugadorX.id, posicion: 'ARQ', esTitular: true, x: 50, y: 8 }],
      },
      headers: conCookie(tokenDelegadoA),
    })
    const id = creada.json().data.id

    const privada = await app.inject({ method: 'GET', url: `/api/publico/formaciones/${id}` })
    expect(privada.statusCode).toBe(404)

    await app.inject({ method: 'POST', url: `/api/formaciones/${id}/publicar`, headers: conCookie(tokenDelegadoA) })

    expect((await app.inject({ method: 'GET', url: `/api/publico/formaciones/${id}` })).statusCode).toBe(404)
    await getPrisma().equipo.update({ where: { id: equipoA.id }, data: { privado: false } })

    const publica = await app.inject({ method: 'GET', url: `/api/publico/formaciones/${id}` })
    expect(publica.statusCode).toBe(200)
    expect(publica.json().data.jugadores.length).toBe(1)

    const lista = await app.inject({ method: 'GET', url: '/api/publico/formaciones' })
    expect(lista.json().data.some((f: { id: string }) => f.id === id)).toBe(true)

    await app.inject({ method: 'POST', url: `/api/formaciones/${id}/despublicar`, headers: conCookie(tokenDelegadoA) })
    const otra = await app.inject({ method: 'GET', url: `/api/publico/formaciones/${id}` })
    expect(otra.statusCode).toBe(404)
  })

  it('las acciones sensibles quedan auditadas', async () => {
    const creada = await app.inject({
      method: 'POST',
      url: '/api/formaciones',
      payload: { equipoId: equipoA.id, nombre: 'Auditable', formacionTipo: 'FUTBOL_7' },
      headers: conCookie(tokenDelegadoA),
    })
    const id = creada.json().data.id

    const auditCreate = await getPrisma().auditoriaLog.findFirst({ where: { entidad: 'Formacion', entidadId: id, accion: 'CREATE' } })
    expect(auditCreate).not.toBeNull()

    await app.inject({ method: 'PATCH', url: `/api/formaciones/${id}`, payload: { nombre: 'Auditable v2' }, headers: conCookie(tokenDelegadoA) })
    const auditUpdate = await getPrisma().auditoriaLog.findFirst({ where: { entidad: 'Formacion', entidadId: id, accion: 'UPDATE' } })
    expect(auditUpdate).not.toBeNull()

    const partido = await crearPartido(equipoA.id)
    await app.inject({ method: 'POST', url: `/api/formaciones/${id}/asociar-partido`, payload: { partidoId: partido.id }, headers: conCookie(tokenDelegadoA) })
    const auditAsocia = await getPrisma().auditoriaLog.findFirst({
      where: { entidad: 'Formacion', entidadId: id, accion: 'UPDATE' },
      orderBy: { fecha: 'desc' },
    })
    expect(auditAsocia?.cambios).not.toBeNull()

    await app.inject({ method: 'POST', url: `/api/formaciones/${id}/publicar`, headers: conCookie(tokenDelegadoA) })
    const auditPublica = await getPrisma().auditoriaLog.findFirst({
      where: { entidad: 'Formacion', entidadId: id, accion: 'UPDATE' },
      orderBy: { fecha: 'desc' },
    })
    expect(JSON.stringify(auditPublica?.cambios)).toContain('publicada')
  })
})
