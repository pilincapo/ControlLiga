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
  crearUsuario,
} from '../test/seed.js'
import { limpiarBase } from '../test/limpiar.js'

const suf = Date.now().toString(36)
const email = (rol: string) => `${rol}-${suf}@test.dev`

describe('módulo de torneos (FASE 3)', () => {
  let app: FastifyInstance

  let orgA: { id: string }
  let orgB: { id: string }
  let equipoA: { id: string }
  let equipoB: { id: string }
  let jugadorX: { id: string }

  let usuarioAdminA: { id: string; email: string }
  let usuarioAdminB: { id: string; email: string }
  let usuarioSuper: { id: string; email: string }
  let usuarioDelegadoA: { id: string; email: string }
  let usuarioDelegadoB: { id: string; email: string }
  let usuarioJugador: { id: string; email: string }

  let tokenAdminA: string
  let tokenAdminB: string
  let tokenSuper: string
  let tokenDelegadoA: string
  let tokenDelegadoB: string
  let tokenJugador: string

  let torneoA: { id: string }
  let torneoB: { id: string }
  let temporada: { id: string }
  let categoriaPrimera: { id: string }
  let torneoCategoria: { id: string }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()

    orgA = await crearOrganizacion('Org A')
    orgB = await crearOrganizacion('Org B')
    equipoA = await crearEquipo('Equipo A')
    equipoB = await crearEquipo('Equipo B')

    const jx = await crearPersonaJugador('Jugador', 'X')
    jugadorX = jx.jugador
    await agregarJugadorAEquipo(jugadorX.id, equipoA.id, 10)

    usuarioAdminA = await crearUsuario({
      email: email('admina'),
      roles: [{ codigo: 'ADMINISTRADOR', organizacionId: orgA.id }],
    })
    usuarioAdminB = await crearUsuario({
      email: email('adminb'),
      roles: [{ codigo: 'ADMINISTRADOR', organizacionId: orgB.id }],
    })
    usuarioSuper = await crearUsuario({ email: email('super'), roles: [{ codigo: 'SUPERADMIN' }] })
    usuarioDelegadoA = await crearUsuario({ email: email('delegadoa'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    await agregarMiembroEquipo(usuarioDelegadoA.id, equipoA.id, 'DELEGADO')
    usuarioDelegadoB = await crearUsuario({ email: email('delegadob'), roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    await agregarMiembroEquipo(usuarioDelegadoB.id, equipoB.id, 'DELEGADO')
    usuarioJugador = await crearUsuario({
      email: email('jugador'),
      jugadorId: jugadorX.id,
      roles: [{ codigo: 'JUGADOR' }],
    })

    tokenAdminA = (await login(app, usuarioAdminA.email, 'contraseña123')).token!
    tokenAdminB = (await login(app, usuarioAdminB.email, 'contraseña123')).token!
    tokenSuper = (await login(app, usuarioSuper.email, 'contraseña123')).token!
    tokenDelegadoA = (await login(app, usuarioDelegadoA.email, 'contraseña123')).token!
    tokenDelegadoB = (await login(app, usuarioDelegadoB.email, 'contraseña123')).token!
    tokenJugador = (await login(app, usuarioJugador.email, 'contraseña123')).token!
  })

  afterAll(async () => {
    await app.close()
    await limpiarBase()
  })

  // ---------- TORNEO ----------

  it('ADMINISTRADOR crea un torneo en su organización (BORRADOR y config pública por defecto)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/torneos',
      payload: { organizacionId: orgA.id, nombre: 'Liga Santa Fe' },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(200)
    torneoA = { id: res.json().data.id }
    expect(res.json().data.estado).toBe('BORRADOR')
    expect(res.json().data.configuracionPublica.mostrarInfo).toBe(true)
    expect(res.json().data.configuracionPublica.mostrarTabla).toBe(false)
  })

  it('ADMINISTRADOR de otra organización no puede crear torneos ajenos', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/torneos',
      payload: { organizacionId: orgA.id, nombre: 'Intrusión' },
      headers: conCookie(tokenAdminB),
    })
    expect(res.statusCode).toBe(403)
  })

  it('DELEGADO_TECNICO no puede crear torneos', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/torneos',
      payload: { organizacionId: orgA.id, nombre: 'No autorizado' },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(403)
  })

  it('ADMINISTRADOR edita un torneo propio y queda auditado', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/torneos/${torneoA.id}`,
      payload: { nombre: 'Liga Santa Fe 2026', reglas: 'Tres puntos por victoria' },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.nombre).toBe('Liga Santa Fe 2026')
    const audit = await getPrisma().auditoriaLog.findFirst({
      where: { entidad: 'Torneo', entidadId: torneoA.id, accion: 'UPDATE' },
      orderBy: { fecha: 'desc' },
    })
    expect(audit).not.toBeNull()
  })

  it('no se puede editar un torneo de otra organización', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/torneos/${torneoA.id}`,
      payload: { nombre: 'Hackeado' },
      headers: conCookie(tokenAdminB),
    })
    expect(res.statusCode).toBe(403)
  })

  it('JUGADOR no puede modificar la configuración del torneo', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/torneos/${torneoA.id}`,
      payload: { nombre: 'Hackeado' },
      headers: conCookie(tokenJugador),
    })
    expect(res.statusCode).toBe(403)
  })

  it('configuración pública inválida se rechaza', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/torneos/${torneoA.id}`,
      payload: { configuracionPublica: { mostrarInfo: 'si' } },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(400)
  })

  it('transiciones de estado válidas: BORRADOR → INSCRIPCIONES → ACTIVO → FINALIZADO → ARCHIVADO', async () => {
    for (const estado of ['INSCRIPCIONES', 'ACTIVO', 'FINALIZADO', 'ARCHIVADO']) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/torneos/${torneoA.id}/estado`,
        payload: { estado },
        headers: conCookie(tokenAdminA),
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().data.estado).toBe(estado)
    }
  })

  it('transición inválida se rechaza', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneoA.id}/estado`,
      payload: { estado: 'ACTIVO' },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(409)
  })

  it('ADMINISTRADOR no accede a un torneo de otra organización', async () => {
    const torneoEnB = await app.inject({
      method: 'POST',
      url: '/api/torneos',
      payload: { organizacionId: orgB.id, nombre: 'Liga Rosario' },
      headers: conCookie(tokenAdminB),
    })
    torneoB = { id: torneoEnB.json().data.id }
    const res = await app.inject({
      method: 'GET',
      url: `/api/torneos/${torneoB.id}`,
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(403)
  })

  it('SUPERADMIN accede a cualquier torneo', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/torneos/${torneoB.id}`,
      headers: conCookie(tokenSuper),
    })
    expect(res.statusCode).toBe(200)
  })

  // ---------- TEMPORADA ----------

  it('ADMINISTRADOR crea una temporada', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneoA.id}/temporadas`,
      payload: { nombre: 'Apertura 2026', fechaInicio: '2026-02-01' },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(200)
    temporada = { id: res.json().data.id }
    expect(res.json().data.estado).toBe('BORRADOR')
  })

  it('no se puede crear temporada en un torneo ajeno', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneoB.id}/temporadas`,
      payload: { nombre: 'Intrusión', fechaInicio: '2026-02-01' },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(403)
  })

  it('transiciones de temporada: publicar y finalizar', async () => {
    const pub = await app.inject({
      method: 'POST',
      url: `/api/temporadas/${temporada.id}/estado`,
      payload: { estado: 'PUBLICADO' },
      headers: conCookie(tokenAdminA),
    })
    expect(pub.statusCode).toBe(200)
    expect(pub.json().data.estado).toBe('PUBLICADO')

    const curso = await app.inject({
      method: 'POST',
      url: `/api/temporadas/${temporada.id}/estado`,
      payload: { estado: 'EN_CURSO' },
      headers: conCookie(tokenAdminA),
    })
    expect(curso.statusCode).toBe(200)

    const fin = await app.inject({
      method: 'POST',
      url: `/api/temporadas/${temporada.id}/estado`,
      payload: { estado: 'FINALIZADO' },
      headers: conCookie(tokenAdminA),
    })
    expect(fin.statusCode).toBe(200)
    expect(fin.json().data.estado).toBe('FINALIZADO')
  })

  it('transición de temporada inválida se rechaza', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/temporadas/${temporada.id}/estado`,
      payload: { estado: 'EN_CURSO' },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(409)
  })

  // ---------- CATEGORÍAS Y CONFIGURACIÓN ----------

  it('se crea una categoría global', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/categorias',
      payload: { nombre: 'Primera' },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(200)
    categoriaPrimera = { id: res.json().data.id }
  })

  it('se asocia la categoría y se crea la configuración por defecto (3/1/0)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneoA.id}/temporadas/${temporada.id}/categorias`,
      payload: { categoriaId: categoriaPrimera.id },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(200)
    torneoCategoria = { id: res.json().data.id }

    const detalle = await app.inject({
      method: 'GET',
      url: `/api/torneo-categorias/${torneoCategoria.id}`,
      headers: conCookie(tokenAdminA),
    })
    expect(detalle.statusCode).toBe(200)
    const config = detalle.json().data.configuracion
    expect(config.formato).toBe('TODOS_CONTRA_TODOS')
    expect(config.sistemaPuntos).toEqual({ victoria: 3, empate: 1, derrota: 0 })
    expect(config.desempates).toEqual(['PUNTOS', 'DIFERENCIA_GOLES', 'GOLES_FAVOR'])
  })

  it('re-asociar la misma categoría se rechaza', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneoA.id}/temporadas/${temporada.id}/categorias`,
      payload: { categoriaId: categoriaPrimera.id },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(409)
  })

  it('se modifican los puntos y el orden de desempates', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/torneo-categorias/${torneoCategoria.id}/configuracion`,
      payload: {
        sistemaPuntos: { victoria: 2, empate: 1, derrota: 0 },
        desempates: ['GOLES_FAVOR', 'PUNTOS'],
        formato: 'DOS_RUEDAS',
      },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.sistemaPuntos).toEqual({ victoria: 2, empate: 1, derrota: 0 })
    expect(res.json().data.desempates).toEqual(['GOLES_FAVOR', 'PUNTOS'])
    expect(res.json().data.formato).toBe('DOS_RUEDAS')
  })

  it('sistema de puntos inválido se rechaza', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/torneo-categorias/${torneoCategoria.id}/configuracion`,
      payload: { sistemaPuntos: { victoria: -1, empate: 1, derrota: 0 } },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(400)
  })

  it('desempates inválidos se rechazan', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/torneo-categorias/${torneoCategoria.id}/configuracion`,
      payload: { desempates: ['PUNTOS', 'MONEDAS'] },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(400)
  })

  it('configuración de formato inválida se rechaza', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/torneo-categorias/${torneoCategoria.id}/configuracion`,
      payload: { configuracionFormato: { fases: [{ tipo: 'ALEATORIO' }] } },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(400)
  })

  // ---------- ZONAS ----------

  it('se crea y modifica una zona', async () => {
    const creada = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${torneoCategoria.id}/zonas`,
      payload: { nombre: 'Zona A' },
      headers: conCookie(tokenAdminA),
    })
    expect(creada.statusCode).toBe(200)
    const zonaId = creada.json().data.id

    const modificada = await app.inject({
      method: 'PATCH',
      url: `/api/zonas/${zonaId}`,
      payload: { nombre: 'Zona Norte' },
      headers: conCookie(tokenAdminA),
    })
    expect(modificada.statusCode).toBe(200)
    expect(modificada.json().data.nombre).toBe('Zona Norte')
  })

  // ---------- PARTICIPACIONES ----------

  it('ADMINISTRADOR invita un equipo (PENDIENTE) y el delegado acepta', async () => {
    const invitacion = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneoA.id}/temporadas/${temporada.id}/participaciones/invitar`,
      payload: { equipoId: equipoA.id },
      headers: conCookie(tokenAdminA),
    })
    expect(invitacion.statusCode).toBe(200)
    expect(invitacion.json().data.estado).toBe('PENDIENTE')

    const respuesta = await app.inject({
      method: 'POST',
      url: `/api/participaciones/${invitacion.json().data.id}/responder-invitacion`,
      payload: { aceptar: true },
      headers: conCookie(tokenDelegadoA),
    })
    expect(respuesta.statusCode).toBe(200)
    expect(respuesta.json().data.estado).toBe('CONFIRMADO')
  })

  it('DELEGADO_TECNICO solicita inscripción de su equipo (INSCRIPTO)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneoA.id}/temporadas/${temporada.id}/participaciones/solicitar`,
      payload: { equipoId: equipoB.id },
      headers: conCookie(tokenDelegadoB),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('INSCRIPTO')
  })

  it('DELEGADO_TECNICO no solicita para un equipo ajeno', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneoA.id}/temporadas/${temporada.id}/participaciones/solicitar`,
      payload: { equipoId: equipoB.id },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(403)
  })

  it('ADMINISTRADOR acepta la solicitud de inscripción', async () => {
    const solicitudes = await app.inject({
      method: 'GET',
      url: `/api/temporadas/${temporada.id}`,
      headers: conCookie(tokenAdminA),
    })
    const participaciones = solicitudes.json().data.participaciones
    const solicitud = participaciones.find(
      (p: { equipoId: string; estado: string }) => p.equipoId === equipoB.id && p.estado === 'INSCRIPTO',
    )
    expect(solicitud).toBeDefined()

    const res = await app.inject({
      method: 'POST',
      url: `/api/participaciones/${solicitud.id}/decidir-solicitud`,
      payload: { aceptar: true },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('CONFIRMADO')
  })

  it('ADMINISTRADOR rechaza una solicitud', async () => {
    const nueva = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneoB.id}/temporadas`,
      payload: { nombre: 'Temporada B', fechaInicio: '2026-03-01' },
      headers: conCookie(tokenAdminB),
    })
    const temporadaB = { id: nueva.json().data.id }
    const solicitud = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneoB.id}/temporadas/${temporadaB.id}/participaciones/solicitar`,
      payload: { equipoId: equipoB.id },
      headers: conCookie(tokenDelegadoB),
    })
    expect(solicitud.statusCode).toBe(200)

    const res = await app.inject({
      method: 'POST',
      url: `/api/participaciones/${solicitud.json().data.id}/decidir-solicitud`,
      payload: { aceptar: false },
      headers: conCookie(tokenAdminB),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('RECHAZADO')
  })

  it('una participación activa duplicada se rechaza (regla de unicidad)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneoA.id}/temporadas/${temporada.id}/participaciones/solicitar`,
      payload: { equipoId: equipoA.id },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.code).toBe('participacion_activa')
  })

  it('se da de baja una participación y se conserva el historial', async () => {
    const detalle = await app.inject({
      method: 'GET',
      url: `/api/temporadas/${temporada.id}`,
      headers: conCookie(tokenAdminA),
    })
    const participaciones = detalle.json().data.participaciones
    const partic = participaciones.find((p: { equipoId: string }) => p.equipoId === equipoA.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/participaciones/${partic.id}/baja`,
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('BAJA')
    expect(res.json().data.fechaBaja).not.toBeNull()
  })

  it('tras una baja se permite una nueva participación (reinscripción)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneoA.id}/temporadas/${temporada.id}/participaciones/solicitar`,
      payload: { equipoId: equipoA.id },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.estado).toBe('INSCRIPTO')

    const historial = await getPrisma().equipoParticipacion.count({
      where: { torneoId: torneoA.id, temporadaId: temporada.id, equipoId: equipoA.id },
    })
    expect(historial).toBeGreaterThanOrEqual(2)
  })

  it('se asigna categoría y zona a una participación', async () => {
    const zonaCreada = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${torneoCategoria.id}/zonas`,
      payload: { nombre: 'Zona Sur' },
      headers: conCookie(tokenAdminA),
    })
    const zonaId = zonaCreada.json().data.id

    const detalle = await app.inject({
      method: 'GET',
      url: `/api/temporadas/${temporada.id}`,
      headers: conCookie(tokenAdminA),
    })
    const participaciones = detalle.json().data.participaciones
    const partic = participaciones.find(
      (p: { equipoId: string; estado: string }) => p.equipoId === equipoA.id && p.estado === 'INSCRIPTO',
    )

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/participaciones/${partic.id}`,
      payload: { torneoCategoriaId: torneoCategoria.id, zonaId },
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.torneoCategoriaId).toBe(torneoCategoria.id)
    expect(res.json().data.zonaId).toBe(zonaId)
  })

  // ---------- JUGADORES EN COMPETICIÓN ----------

  it('DELEGADO agrega un jugador de su equipo a la competición', async () => {
    const detalle = await app.inject({
      method: 'GET',
      url: `/api/temporadas/${temporada.id}`,
      headers: conCookie(tokenAdminA),
    })
    const participaciones = detalle.json().data.participaciones
    const partic = participaciones.find((p: { equipoId: string }) => p.equipoId === equipoA.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/participaciones/${partic.id}/jugadores`,
      payload: { jugadorId: jugadorX.id, dorsal: 10 },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.dorsal).toBe(10)
    expect(res.json().data.activo).toBe(true)
  })

  it('DELEGADO no agrega a la plantilla un jugador que no es de su equipo', async () => {
    const detalle = await app.inject({
      method: 'GET',
      url: `/api/temporadas/${temporada.id}`,
      headers: conCookie(tokenAdminA),
    })
    const participaciones = detalle.json().data.participaciones
    const partic = participaciones.find((p: { equipoId: string }) => p.equipoId === equipoA.id)
    const jy = await crearPersonaJugador('Jugador', 'Y')

    const res = await app.inject({
      method: 'POST',
      url: `/api/participaciones/${partic.id}/jugadores`,
      payload: { jugadorId: jy.jugador.id },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(400)
  })

  it('se modifica el dorsal de un jugador en competición', async () => {
    const detalle = await app.inject({
      method: 'GET',
      url: `/api/temporadas/${temporada.id}`,
      headers: conCookie(tokenAdminA),
    })
    const participaciones = detalle.json().data.participaciones
    const partic = participaciones.find((p: { equipoId: string }) => p.equipoId === equipoA.id)
    const jugadores = await app.inject({
      method: 'GET',
      url: `/api/participaciones/${partic.id}/jugadores`,
      headers: conCookie(tokenDelegadoA),
    })
    const jp = jugadores.json().data.find((j: { jugadorId: string }) => j.jugadorId === jugadorX.id)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/jugador-participaciones/${jp.id}`,
      payload: { dorsal: 11 },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.dorsal).toBe(11)
  })

  it('se da de baja a un jugador y su historial se conserva', async () => {
    const detalle = await app.inject({
      method: 'GET',
      url: `/api/temporadas/${temporada.id}`,
      headers: conCookie(tokenAdminA),
    })
    const participaciones = detalle.json().data.participaciones
    const partic = participaciones.find((p: { equipoId: string }) => p.equipoId === equipoA.id)
    const jugadores = await app.inject({
      method: 'GET',
      url: `/api/participaciones/${partic.id}/jugadores`,
      headers: conCookie(tokenDelegadoA),
    })
    const jp = jugadores.json().data.find((j: { jugadorId: string }) => j.jugadorId === jugadorX.id)

    const res = await app.inject({
      method: 'POST',
      url: `/api/jugador-participaciones/${jp.id}/baja`,
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.activo).toBe(false)
    expect(res.json().data.fechaBaja).not.toBeNull()

    const nuevamente = await app.inject({
      method: 'POST',
      url: `/api/participaciones/${partic.id}/jugadores`,
      payload: { jugadorId: jugadorX.id, dorsal: 9 },
      headers: conCookie(tokenDelegadoA),
    })
    expect(nuevamente.statusCode).toBe(200)
    expect(nuevamente.json().data.activo).toBe(true)
    expect(nuevamente.json().data.dorsal).toBe(9)

    const totalFilas = await getPrisma().jugadorParticipacion.count({
      where: { equipoParticipacionId: partic.id, jugadorId: jugadorX.id },
    })
    expect(totalFilas).toBe(1)
  })

  // ---------- SEGURIDAD ADICIONAL ----------

  it('DELEGADO no responde una invitación de un equipo ajeno', async () => {
    const invitacion = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneoB.id}/temporadas`,
      payload: { nombre: 'Temporada B2', fechaInicio: '2026-04-01' },
      headers: conCookie(tokenAdminB),
    })
    const temporadaB2 = { id: invitacion.json().data.id }
    const inv = await app.inject({
      method: 'POST',
      url: `/api/torneos/${torneoB.id}/temporadas/${temporadaB2.id}/participaciones/invitar`,
      payload: { equipoId: equipoB.id },
      headers: conCookie(tokenAdminB),
    })
    expect(inv.statusCode).toBe(200)

    const res = await app.inject({
      method: 'POST',
      url: `/api/participaciones/${inv.json().data.id}/responder-invitacion`,
      payload: { aceptar: true },
      headers: conCookie(tokenDelegadoA),
    })
    expect(res.statusCode).toBe(403)
  })

  it('ADMINISTRADOR accede a su torneo', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/torneos/${torneoA.id}`,
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.nombre).toBe('Liga Santa Fe 2026')
  })

  it('JUGADOR puede ver el torneo donde participa su equipo', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/torneos/${torneoA.id}`,
      headers: conCookie(tokenJugador),
    })
    expect(res.statusCode).toBe(200)
  })

  it('el listado respeta el alcance del administrador', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/torneos',
      headers: conCookie(tokenAdminA),
    })
    expect(res.statusCode).toBe(200)
    const ids = res.json().data.map((t: { id: string }) => t.id)
    expect(ids).toContain(torneoA.id)
    expect(ids).not.toContain(torneoB.id)
  })
})
