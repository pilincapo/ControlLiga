import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { getPrisma } from '../db.js'
import { conCookie, login } from '../test/helpers.js'
import {
  agregarMiembroEquipo,
  crearCategoria,
  crearEquipo,
  crearOrganizacion,
  crearParticipacion,
  crearTemporada,
  crearTorneo,
  crearTorneoCategoria,
  crearUsuario,
} from '../test/seed.js'
import { limpiarBase } from '../test/limpiar.js'

const sufijo = Date.now().toString(36)

describe('competencia avanzada HTTP (FASE 16A)', () => {
  let app: FastifyInstance
  let tokenAdmin: string
  let tokenDelegado: string
  let tokenOtroTenant: string
  let tokenSuperadmin: string
  let organizacionId: string

  const headers = (token: string) => ({ headers: conCookie(token) })

  async function crearCompetencia(nombre: string, cantidad = 4) {
    const torneo = await crearTorneo(organizacionId, `${nombre} ${sufijo}`)
    const temporada = await crearTemporada(torneo.id, `Temporada ${nombre}`)
    const categoria = await crearCategoria(`Categoría ${nombre} ${sufijo}`)
    const competencia = await crearTorneoCategoria(torneo.id, temporada.id, categoria.id)
    const participaciones: string[] = []
    const equipos: string[] = []
    for (let i = 1; i <= cantidad; i++) {
      const equipo = await crearEquipo(`${nombre} ${i} ${sufijo}`)
      equipos.push(equipo.id)
      participaciones.push(
        (await crearParticipacion(torneo.id, temporada.id, equipo.id, { torneoCategoriaId: competencia.id })).id,
      )
    }
    return { ...competencia, torneoId: torneo.id, participaciones, equipos }
  }

  async function crearEliminacion(nombre: string, cantidad = 4) {
    const competencia = await crearCompetencia(nombre, cantidad)
    const crear = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${competencia.id}/fases/eliminacion`,
      payload: {
        orden: 1,
        nombre: 'Eliminación',
        seeds: competencia.participaciones.map((participacionId, i) => ({ participacionId, seed: i + 1 })),
      },
      ...headers(tokenAdmin),
    })
    expect(crear.statusCode).toBe(200)
    const faseId = crear.json().data.id as string
    expect((await app.inject({ method: 'POST', url: `/api/fases-competencia/${faseId}/generar`, payload: { confirmar: true }, ...headers(tokenAdmin) })).statusCode).toBe(200)
    return { ...competencia, faseId }
  }

  async function finalizar(partidoId: string, golesLocal: number, golesVisitante: number) {
    expect((await app.inject({ method: 'POST', url: `/api/partidos/${partidoId}/estado`, payload: { estado: 'EN_CURSO' }, ...headers(tokenAdmin) })).statusCode).toBe(200)
    const partido = await getPrisma().partido.findUniqueOrThrow({ where: { id: partidoId }, select: { equipoLocalId: true, equipoVisitanteId: true } })
    for (let i = 0; i < golesLocal; i++) await getPrisma().eventoPartido.create({ data: { partidoId, equipoId: partido.equipoLocalId!, tipo: 'GOL', minuto: i + 1 } })
    for (let i = 0; i < golesVisitante; i++) await getPrisma().eventoPartido.create({ data: { partidoId, equipoId: partido.equipoVisitanteId!, tipo: 'GOL', minuto: i + 1 } })
    return app.inject({ method: 'POST', url: `/api/partidos/${partidoId}/resultado`, payload: { golesLocal, golesVisitante }, ...headers(tokenAdmin) })
  }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
    organizacionId = (await crearOrganizacion(`Org avanzada ${sufijo}`)).id
    const otraOrganizacion = (await crearOrganizacion(`Org externa ${sufijo}`)).id
    const admin = await crearUsuario({ email: `avanzada-admin-${sufijo}@test.dev`, roles: [{ codigo: 'ADMINISTRADOR', organizacionId }] })
    const delegado = await crearUsuario({ email: `avanzada-delegado-${sufijo}@test.dev`, roles: [{ codigo: 'DELEGADO_TECNICO' }] })
    const otroTenant = await crearUsuario({ email: `avanzada-otro-${sufijo}@test.dev`, roles: [{ codigo: 'ADMINISTRADOR', organizacionId: otraOrganizacion }] })
    const superadmin = await crearUsuario({ email: `avanzada-super-${sufijo}@test.dev`, roles: [{ codigo: 'SUPERADMIN' }] })
    tokenAdmin = (await login(app, admin.email, 'contraseña123')).token!
    tokenDelegado = (await login(app, delegado.email, 'contraseña123')).token!
    tokenOtroTenant = (await login(app, otroTenant.email, 'contraseña123')).token!
    tokenSuperadmin = (await login(app, superadmin.email, 'contraseña123')).token!
  })

  afterAll(async () => { await app.close(); await limpiarBase() })

  it('crea grupos round-robin únicos, conserva snapshot de tabla y regenera fase virgen', async () => {
    const competencia = await crearCompetencia('Grupos')
    const crear = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${competencia.id}/fases/grupos`,
      payload: { orden: 1, nombre: 'Grupos', ruedas: 1, grupos: [{ nombre: 'A', participacionIds: competencia.participaciones.slice(0, 2) }, { nombre: 'B', participacionIds: competencia.participaciones.slice(2) }] },
      ...headers(tokenAdmin),
    })
    expect(crear.statusCode).toBe(200)
    const faseId = crear.json().data.id as string
    expect((await app.inject({ method: 'POST', url: `/api/fases-competencia/${faseId}/generar`, payload: { confirmar: true }, ...headers(tokenAdmin) })).statusCode).toBe(200)

    const grupos = await getPrisma().grupoCompetencia.findMany({ where: { faseCompetenciaId: faseId }, include: { participaciones: true }, orderBy: { orden: 'asc' } })
    expect(grupos.map((grupo) => grupo.participaciones.map((p) => p.id))).toEqual([competencia.participaciones.slice(0, 2), competencia.participaciones.slice(2)])
    expect(await getPrisma().partido.count({ where: { jornada: { grupoCompetencia: { faseCompetenciaId: faseId } } } })).toBe(2)

    const tabla = await app.inject({ method: 'GET', url: `/api/fases-competencia/${faseId}/grupos/${grupos[0]!.id}/tabla`, ...headers(tokenAdmin) })
    expect(tabla.statusCode).toBe(200)
    expect(tabla.json().data.filas).toMatchObject([{ PJ: 0, PTS: 0, posicion: 1 }, { PJ: 0, PTS: 0, posicion: 2 }])

    const antes = await getPrisma().partido.findMany({ where: { jornada: { grupoCompetencia: { faseCompetenciaId: faseId } } }, select: { id: true } })
    expect((await app.inject({ method: 'POST', url: `/api/fases-competencia/${faseId}/regenerar`, payload: { confirmar: true }, ...headers(tokenAdmin) })).statusCode).toBe(200)
    const despues = await getPrisma().partido.findMany({ where: { jornada: { grupoCompetencia: { faseCompetenciaId: faseId } } }, select: { id: true } })
    expect(despues).toHaveLength(2)
    expect(despues.map((p) => p.id)).not.toEqual(antes.map((p) => p.id))
  })

  it('rechaza participantes duplicados en grupos y seeds manuales duplicados o incompletos', async () => {
    const competencia = await crearCompetencia('Duplicados')
    const grupos = await app.inject({ method: 'POST', url: `/api/torneo-categorias/${competencia.id}/fases/grupos`, payload: { orden: 1, nombre: 'Grupos', ruedas: 1, grupos: [{ nombre: 'A', participacionIds: competencia.participaciones.slice(0, 2) }, { nombre: 'B', participacionIds: [competencia.participaciones[1]!, competencia.participaciones[3]!] }] }, ...headers(tokenAdmin) })
    expect(grupos.statusCode).toBe(400)
    const seeds = await app.inject({ method: 'POST', url: `/api/torneo-categorias/${competencia.id}/fases/eliminacion`, payload: { orden: 1, nombre: 'Llaves', seeds: [{ participacionId: competencia.participaciones[0], seed: 1 }, { participacionId: competencia.participaciones[1], seed: 2 }, { participacionId: competencia.participaciones[2], seed: 2 }, { participacionId: competencia.participaciones[3], seed: 4 }] }, ...headers(tokenAdmin) })
    expect(seeds.statusCode).toBe(400)
  })

  it('calcula tabla con snapshot de puntos de la fase, no configuración posterior', async () => {
    const competencia = await crearCompetencia('Snapshot')
    await getPrisma().configuracionCompetencia.update({ where: { torneoCategoriaId: competencia.id }, data: { sistemaPuntos: { victoria: 2, empate: 1, derrota: 0 } } })
    const crear = await app.inject({ method: 'POST', url: `/api/torneo-categorias/${competencia.id}/fases/grupos`, payload: { orden: 1, nombre: 'Grupos', ruedas: 1, grupos: [{ nombre: 'A', participacionIds: competencia.participaciones.slice(0, 2) }, { nombre: 'B', participacionIds: competencia.participaciones.slice(2) }] }, ...headers(tokenAdmin) })
    const faseId = crear.json().data.id as string
    expect((await app.inject({ method: 'POST', url: `/api/fases-competencia/${faseId}/generar`, payload: { confirmar: true }, ...headers(tokenAdmin) })).statusCode).toBe(200)
    const grupo = await getPrisma().grupoCompetencia.findFirstOrThrow({ where: { faseCompetenciaId: faseId, orden: 1 } })
    const partido = await getPrisma().partido.findFirstOrThrow({ where: { jornada: { grupoCompetenciaId: grupo.id } } })
    expect((await finalizar(partido.id, 1, 0)).statusCode).toBe(200)
    await getPrisma().configuracionCompetencia.update({ where: { torneoCategoriaId: competencia.id }, data: { sistemaPuntos: { victoria: 3, empate: 1, derrota: 0 } } })
    const tabla = await app.inject({ method: 'GET', url: `/api/fases-competencia/${faseId}/grupos/${grupo.id}/tabla`, ...headers(tokenAdmin) })
    expect(tabla.json().data.reglas.sistemaPuntos).toEqual({ victoria: 2, empate: 1, derrota: 0 })
    expect(tabla.json().data.filas[0]).toMatchObject({ PJ: 1, PTS: 2 })
  })

  it('bloquea regeneración cuando fase contiene actividad', async () => {
    const { faseId } = await crearEliminacion('Bloqueada')
    const partido = await getPrisma().partido.findFirstOrThrow({ where: { llaveCompetencia: { rondaEliminatoria: { faseCompetenciaId: faseId } } } })
    await getPrisma().partido.update({ where: { id: partido.id }, data: { publicada: true } })
    const respuesta = await app.inject({ method: 'POST', url: `/api/fases-competencia/${faseId}/regenerar`, payload: { confirmar: true }, ...headers(tokenAdmin) })
    expect(respuesta.statusCode).toBe(409)
    expect(respuesta.json().error.code).toBe('fase_bloqueada')
  })

  it('genera llaves de 4 y 8 con seeds manuales, origen ganador y propagación', async () => {
    const cuatro = await crearEliminacion('Cuatro')
    const llaves = await getPrisma().llaveCompetencia.findMany({ where: { rondaEliminatoria: { faseCompetenciaId: cuatro.faseId } }, include: { partidos: true, rondaEliminatoria: true }, orderBy: [{ rondaEliminatoria: { orden: 'asc' } }, { orden: 'asc' }] })
    expect(llaves).toHaveLength(3)
    expect(llaves.filter((llave) => llave.partidos.length === 1)).toHaveLength(2)
    expect(llaves[0]).toMatchObject({ participacionLocalId: cuatro.participaciones[0], participacionVisitanteId: cuatro.participaciones[3], seedLocal: 1, seedVisitante: 4, origenLocalTipo: 'SEED', origenVisitanteTipo: 'SEED' })
    expect(llaves[2]).toMatchObject({ origenLocalTipo: 'GANADOR_LLAVE', origenLocalLlaveId: llaves[0]!.id, origenVisitanteTipo: 'GANADOR_LLAVE', origenVisitanteLlaveId: llaves[1]!.id })
    expect((await finalizar(llaves[0]!.partidos[0]!.id, 1, 0)).statusCode).toBe(200)
    const finalPendiente = await getPrisma().llaveCompetencia.findUniqueOrThrow({ where: { id: llaves[2]!.id } })
    expect(finalPendiente.participacionLocalId).toBe(cuatro.participaciones[0])
    expect(finalPendiente.estado).toBe('PENDIENTE_PARTICIPANTES')

    const ocho = await crearEliminacion('Ocho', 8)
    expect(await getPrisma().llaveCompetencia.count({ where: { rondaEliminatoria: { faseCompetenciaId: ocho.faseId } } })).toBe(7)
    expect(await getPrisma().partido.count({ where: { llaveCompetencia: { rondaEliminatoria: { faseCompetenciaId: ocho.faseId } } } })).toBe(4)

    const dieciseis = await crearEliminacion('Dieciseis', 16)
    expect(await getPrisma().llaveCompetencia.count({ where: { rondaEliminatoria: { faseCompetenciaId: dieciseis.faseId } } })).toBe(15)
    expect(await getPrisma().partido.count({ where: { llaveCompetencia: { rondaEliminatoria: { faseCompetenciaId: dieciseis.faseId } } } })).toBe(8)
  })

  it('aplica BYE para cinco seeds sin crear partidos ficticios', async () => {
    const { faseId, torneoId, equipos } = await crearEliminacion('Cinco', 5)
    const llaves = await getPrisma().llaveCompetencia.findMany({ where: { rondaEliminatoria: { faseCompetenciaId: faseId } }, include: { partidos: true } })
    const byes = llaves.filter((llave) => llave.estado === 'BYE')
    expect(byes).toHaveLength(3)
    expect(byes.every((llave) => llave.partidos.length === 0 && llave.ganadorParticipacionId !== null)).toBe(true)
    expect(llaves.every((llave) => llave.partidos.every((partido) => partido.equipoLocalId !== null && partido.equipoVisitanteId !== null))).toBe(true)
    await getPrisma().torneo.update({ where: { id: torneoId }, data: { visiblePublico: true, configuracionPublica: { mostrarFixture: true } } })
    await getPrisma().equipo.updateMany({ where: { id: { in: equipos } }, data: { privado: false } })
    const fase = await getPrisma().faseCompetencia.findUniqueOrThrow({ where: { id: faseId } })
    const publico = await app.inject({ method: 'GET', url: `/api/publico/torneo-categorias/${fase.torneoCategoriaId}/fases` })
    expect(publico.statusCode).toBe(200)
    expect(publico.json().data[0].rondas.flatMap((ronda: { llaves: Array<{ estado: string; partidos: unknown[] }> }) => ronda.llaves).filter((llave: { estado: string }) => llave.estado === 'BYE').every((llave: { partidos: unknown[] }) => llave.partidos.length === 0)).toBe(true)
  })

  it('marca empate como pendiente de definición y no propaga ganador', async () => {
    const { faseId } = await crearEliminacion('Empate')
    const inicial = await getPrisma().llaveCompetencia.findFirstOrThrow({ where: { rondaEliminatoria: { faseCompetenciaId: faseId, orden: 1 } }, include: { partidos: true } })
    expect((await finalizar(inicial.partidos[0]!.id, 1, 1)).statusCode).toBe(200)
    const llave = await getPrisma().llaveCompetencia.findUniqueOrThrow({ where: { id: inicial.id } })
    const siguiente = await getPrisma().llaveCompetencia.findUniqueOrThrow({ where: { id: llave.llaveSiguienteId! } })
    expect(llave).toMatchObject({ estado: 'PENDIENTE_DEFINICION', ganadorParticipacionId: null })
    expect(siguiente.participacionLocalId).toBeNull()
  })

  it('proyecta participantes, BYE, origen y empate en respuesta privada', async () => {
    const normal = await crearEliminacion('Proyección normal')
    const partidoNormal = await getPrisma().partido.findFirstOrThrow({ where: { llaveCompetencia: { rondaEliminatoria: { faseCompetenciaId: normal.faseId, orden: 1 } } } })
    expect((await finalizar(partidoNormal.id, 1, 0)).statusCode).toBe(200)
    const bye = await crearEliminacion('Proyección BYE', 5)
    const empate = await crearEliminacion('Proyección empate')
    const partidoEmpate = await getPrisma().partido.findFirstOrThrow({ where: { llaveCompetencia: { rondaEliminatoria: { faseCompetenciaId: empate.faseId, orden: 1 } } } })
    expect((await finalizar(partidoEmpate.id, 1, 1)).statusCode).toBe(200)

    const respuesta = await app.inject({ method: 'GET', url: `/api/torneo-categorias/${normal.id}/competencia-avanzada`, ...headers(tokenAdmin) })
    const llaves = respuesta.json().data[0].rondas.flatMap((ronda: { llaves: unknown[] }) => ronda.llaves) as Array<Record<string, unknown>>
    const primera = llaves.find((llave) => llave.partidos && Array.isArray(llave.partidos) && llave.partidos.some((partido: { id: string }) => partido.id === partidoNormal.id))!
    expect(primera.participacionLocal).toMatchObject({ id: normal.participaciones[0], equipoId: normal.equipos[0], equipo: { nombre: expect.any(String) } })
    expect(primera.participacionVisitante).toMatchObject({ equipo: { nombre: expect.any(String) } })
    expect(primera.ganadorParticipacion).toMatchObject({ equipo: { nombre: expect.any(String) } })

    const respuestaBye = await app.inject({ method: 'GET', url: `/api/torneo-categorias/${bye.id}/competencia-avanzada`, ...headers(tokenAdmin) })
    const llavesBye = respuestaBye.json().data[0].rondas.flatMap((ronda: { llaves: unknown[] }) => ronda.llaves) as Array<Record<string, unknown>>
    const llaveBye = llavesBye.find((llave) => llave.estado === 'BYE')!
    expect(llaveBye).toMatchObject({ ganadorParticipacion: { equipo: { nombre: expect.any(String) } }, partidos: [] })
    expect(Boolean(llaveBye.participacionLocal) !== Boolean(llaveBye.participacionVisitante)).toBe(true)

    const pendiente = llaves.find((llave) => llave.estado === 'PENDIENTE_PARTICIPANTES')!
    expect(pendiente).toMatchObject({ participacionVisitante: null, origenLocalLlaveId: expect.any(String), origenVisitanteLlaveId: expect.any(String) })

    const respuestaEmpate = await app.inject({ method: 'GET', url: `/api/torneo-categorias/${empate.id}/competencia-avanzada`, ...headers(tokenAdmin) })
    const llavesEmpate = respuestaEmpate.json().data[0].rondas.flatMap((ronda: { llaves: unknown[] }) => ronda.llaves) as Array<Record<string, unknown>>
    expect(llavesEmpate.find((llave) => llave.estado === 'PENDIENTE_DEFINICION')).toMatchObject({ participacionLocal: { equipo: { nombre: expect.any(String) } }, participacionVisitante: { equipo: { nombre: expect.any(String) } }, ganadorParticipacion: null })
  })

  it('aplica RBAC: delegado consulta su torneo, otro tenant no administra y superadmin sí', async () => {
    const competencia = await crearCompetencia('Permisos')
    const delegado = await getPrisma().usuario.findUniqueOrThrow({ where: { email: `avanzada-delegado-${sufijo}@test.dev` } })
    await agregarMiembroEquipo(delegado.id, competencia.equipos[0]!, 'DELEGADO')
    expect((await app.inject({ method: 'GET', url: `/api/torneo-categorias/${competencia.id}/competencia-avanzada`, ...headers(tokenDelegado) })).statusCode).toBe(200)
    const fuera = await app.inject({ method: 'POST', url: `/api/torneo-categorias/${competencia.id}/fases/eliminacion`, payload: { orden: 1, nombre: 'No', seeds: competencia.participaciones.map((participacionId, i) => ({ participacionId, seed: i + 1 })) }, ...headers(tokenOtroTenant) })
    expect(fuera.statusCode).toBe(403)
    const superadmin = await app.inject({ method: 'POST', url: `/api/torneo-categorias/${competencia.id}/fases/eliminacion`, payload: { orden: 1, nombre: 'Sí', seeds: competencia.participaciones.map((participacionId, i) => ({ participacionId, seed: i + 1 })) }, ...headers(tokenSuperadmin) })
    expect(superadmin.statusCode).toBe(200)
  })

  it('expone fases públicas solo con fixture visible y oculta equipos privados', async () => {
    const competencia = await crearCompetencia('Público')
    const crear = await app.inject({ method: 'POST', url: `/api/torneo-categorias/${competencia.id}/fases/grupos`, payload: { orden: 1, nombre: 'Grupos', ruedas: 1, grupos: [{ nombre: 'A', participacionIds: competencia.participaciones.slice(0, 2) }, { nombre: 'B', participacionIds: competencia.participaciones.slice(2) }] }, ...headers(tokenAdmin) })
    const faseId = crear.json().data.id as string
    expect((await app.inject({ method: 'POST', url: `/api/fases-competencia/${faseId}/generar`, payload: { confirmar: true }, ...headers(tokenAdmin) })).statusCode).toBe(200)
    await getPrisma().torneo.update({ where: { id: competencia.torneoId }, data: { visiblePublico: true, configuracionPublica: { mostrarFixture: true } } })
    const privados = await app.inject({ method: 'GET', url: `/api/publico/torneo-categorias/${competencia.id}/fases` })
    expect(privados.statusCode).toBe(200)
    expect(privados.json().data[0].grupos.every((grupo: { participaciones: unknown[] }) => grupo.participaciones.length === 0)).toBe(true)
    await getPrisma().equipo.updateMany({ where: { id: { in: competencia.equipos } }, data: { privado: false } })
    const publico = await app.inject({ method: 'GET', url: `/api/publico/torneo-categorias/${competencia.id}/fases` })
    expect(publico.json().data[0].grupos.flatMap((grupo: { participaciones: unknown[] }) => grupo.participaciones)).toHaveLength(4)
    await getPrisma().torneo.update({ where: { id: competencia.torneoId }, data: { configuracionPublica: { mostrarFixture: false } } })
    expect((await app.inject({ method: 'GET', url: `/api/publico/torneo-categorias/${competencia.id}/fases` })).statusCode).toBe(404)
  })
})
