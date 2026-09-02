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
        (
          await crearParticipacion(torneo.id, temporada.id, equipo.id, {
            torneoCategoriaId: competencia.id,
          })
        ).id,
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
        seeds: competencia.participaciones.map((participacionId, i) => ({
          participacionId,
          seed: i + 1,
        })),
      },
      ...headers(tokenAdmin),
    })
    expect(crear.statusCode).toBe(200)
    const faseId = crear.json().data.id as string
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${faseId}/generar`,
          payload: { confirmar: true },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    return { ...competencia, faseId }
  }

  async function finalizar(partidoId: string, golesLocal: number, golesVisitante: number) {
    const actual = await getPrisma().partido.findUnique({ where: { id: partidoId }, select: { estado: true } })
    if (actual?.estado !== 'EN_CURSO') {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/partidos/${partidoId}/estado`,
            payload: { estado: 'EN_CURSO' },
            ...headers(tokenAdmin),
          })
        ).statusCode,
      ).toBe(200)
    }
    const partido = await getPrisma().partido.findUniqueOrThrow({
      where: { id: partidoId },
      select: { equipoLocalId: true, equipoVisitanteId: true },
    })
    for (let i = 0; i < golesLocal; i++)
      await getPrisma().eventoPartido.create({
        data: { partidoId, equipoId: partido.equipoLocalId!, tipo: 'GOL', minuto: i + 1 },
      })
    for (let i = 0; i < golesVisitante; i++)
      await getPrisma().eventoPartido.create({
        data: { partidoId, equipoId: partido.equipoVisitanteId!, tipo: 'GOL', minuto: i + 1 },
      })
    return app.inject({
      method: 'POST',
      url: `/api/partidos/${partidoId}/resultado`,
      payload: { golesLocal, golesVisitante },
      ...headers(tokenAdmin),
    })
  }

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
    organizacionId = (await crearOrganizacion(`Org avanzada ${sufijo}`)).id
    const otraOrganizacion = (await crearOrganizacion(`Org externa ${sufijo}`)).id
    const admin = await crearUsuario({
      email: `avanzada-admin-${sufijo}@test.dev`,
      roles: [{ codigo: 'ADMINISTRADOR', organizacionId }],
    })
    const delegado = await crearUsuario({
      email: `avanzada-delegado-${sufijo}@test.dev`,
      roles: [{ codigo: 'DELEGADO_TECNICO' }],
    })
    const otroTenant = await crearUsuario({
      email: `avanzada-otro-${sufijo}@test.dev`,
      roles: [{ codigo: 'ADMINISTRADOR', organizacionId: otraOrganizacion }],
    })
    const superadmin = await crearUsuario({
      email: `avanzada-super-${sufijo}@test.dev`,
      roles: [{ codigo: 'SUPERADMIN' }],
    })
    tokenAdmin = (await login(app, admin.email, 'contraseña123')).token!
    tokenDelegado = (await login(app, delegado.email, 'contraseña123')).token!
    tokenOtroTenant = (await login(app, otroTenant.email, 'contraseña123')).token!
    tokenSuperadmin = (await login(app, superadmin.email, 'contraseña123')).token!
  })

  afterAll(async () => {
    await app.close()
    await limpiarBase()
  })

  it('crea grupos round-robin únicos, conserva snapshot de tabla y regenera fase virgen', async () => {
    const competencia = await crearCompetencia('Grupos')
    const crear = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${competencia.id}/fases/grupos`,
      payload: {
        orden: 1,
        nombre: 'Grupos',
        ruedas: 1,
        grupos: [
          { nombre: 'A', participacionIds: competencia.participaciones.slice(0, 2) },
          { nombre: 'B', participacionIds: competencia.participaciones.slice(2) },
        ],
      },
      ...headers(tokenAdmin),
    })
    expect(crear.statusCode).toBe(200)
    const faseId = crear.json().data.id as string
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${faseId}/generar`,
          payload: { confirmar: true },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)

    const grupos = await getPrisma().grupoCompetencia.findMany({
      where: { faseCompetenciaId: faseId },
      include: { participaciones: true },
      orderBy: { orden: 'asc' },
    })
    expect(grupos.map((grupo) => grupo.participaciones.map((p) => p.id))).toEqual([
      competencia.participaciones.slice(0, 2),
      competencia.participaciones.slice(2),
    ])
    expect(
      await getPrisma().partido.count({
        where: { jornada: { grupoCompetencia: { faseCompetenciaId: faseId } } },
      }),
    ).toBe(2)

    const tabla = await app.inject({
      method: 'GET',
      url: `/api/fases-competencia/${faseId}/grupos/${grupos[0]!.id}/tabla`,
      ...headers(tokenAdmin),
    })
    expect(tabla.statusCode).toBe(200)
    expect(tabla.json().data.filas).toMatchObject([
      { PJ: 0, PTS: 0, posicion: 1 },
      { PJ: 0, PTS: 0, posicion: 2 },
    ])

    const antes = await getPrisma().partido.findMany({
      where: { jornada: { grupoCompetencia: { faseCompetenciaId: faseId } } },
      select: { id: true },
    })
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${faseId}/regenerar`,
          payload: { confirmar: true },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    const despues = await getPrisma().partido.findMany({
      where: { jornada: { grupoCompetencia: { faseCompetenciaId: faseId } } },
      select: { id: true },
    })
    expect(despues).toHaveLength(2)
    expect(despues.map((p) => p.id)).not.toEqual(antes.map((p) => p.id))
  })

  it('rechaza participantes duplicados en grupos y seeds manuales duplicados o incompletos', async () => {
    const competencia = await crearCompetencia('Duplicados')
    const grupos = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${competencia.id}/fases/grupos`,
      payload: {
        orden: 1,
        nombre: 'Grupos',
        ruedas: 1,
        grupos: [
          { nombre: 'A', participacionIds: competencia.participaciones.slice(0, 2) },
          {
            nombre: 'B',
            participacionIds: [competencia.participaciones[1]!, competencia.participaciones[3]!],
          },
        ],
      },
      ...headers(tokenAdmin),
    })
    expect(grupos.statusCode).toBe(400)
    const seeds = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${competencia.id}/fases/eliminacion`,
      payload: {
        orden: 1,
        nombre: 'Llaves',
        seeds: [
          { participacionId: competencia.participaciones[0], seed: 1 },
          { participacionId: competencia.participaciones[1], seed: 2 },
          { participacionId: competencia.participaciones[2], seed: 2 },
          { participacionId: competencia.participaciones[3], seed: 4 },
        ],
      },
      ...headers(tokenAdmin),
    })
    expect(seeds.statusCode).toBe(400)
  })

  it('calcula tabla con snapshot de puntos de la fase, no configuración posterior', async () => {
    const competencia = await crearCompetencia('Snapshot')
    await getPrisma().configuracionCompetencia.update({
      where: { torneoCategoriaId: competencia.id },
      data: { sistemaPuntos: { victoria: 2, empate: 1, derrota: 0 } },
    })
    const crear = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${competencia.id}/fases/grupos`,
      payload: {
        orden: 1,
        nombre: 'Grupos',
        ruedas: 1,
        grupos: [
          { nombre: 'A', participacionIds: competencia.participaciones.slice(0, 2) },
          { nombre: 'B', participacionIds: competencia.participaciones.slice(2) },
        ],
      },
      ...headers(tokenAdmin),
    })
    const faseId = crear.json().data.id as string
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${faseId}/generar`,
          payload: { confirmar: true },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    const grupo = await getPrisma().grupoCompetencia.findFirstOrThrow({
      where: { faseCompetenciaId: faseId, orden: 1 },
    })
    const partido = await getPrisma().partido.findFirstOrThrow({
      where: { jornada: { grupoCompetenciaId: grupo.id } },
    })
    expect((await finalizar(partido.id, 1, 0)).statusCode).toBe(200)
    await getPrisma().configuracionCompetencia.update({
      where: { torneoCategoriaId: competencia.id },
      data: { sistemaPuntos: { victoria: 3, empate: 1, derrota: 0 } },
    })
    const tabla = await app.inject({
      method: 'GET',
      url: `/api/fases-competencia/${faseId}/grupos/${grupo.id}/tabla`,
      ...headers(tokenAdmin),
    })
    expect(tabla.json().data.reglas.sistemaPuntos).toEqual({ victoria: 2, empate: 1, derrota: 0 })
    expect(tabla.json().data.filas[0]).toMatchObject({ PJ: 1, PTS: 2 })
  })

  it('bloquea regeneración cuando fase contiene actividad', async () => {
    const { faseId } = await crearEliminacion('Bloqueada')
    const partido = await getPrisma().partido.findFirstOrThrow({
      where: { llaveCompetencia: { rondaEliminatoria: { faseCompetenciaId: faseId } } },
    })
    await getPrisma().partido.update({ where: { id: partido.id }, data: { publicada: true } })
    const respuesta = await app.inject({
      method: 'POST',
      url: `/api/fases-competencia/${faseId}/regenerar`,
      payload: { confirmar: true },
      ...headers(tokenAdmin),
    })
    expect(respuesta.statusCode).toBe(409)
    expect(respuesta.json().error.code).toBe('fase_bloqueada')
  })

  it('genera llaves de 4 y 8 con seeds manuales, origen ganador y propagación', async () => {
    const cuatro = await crearEliminacion('Cuatro')
    const llaves = await getPrisma().llaveCompetencia.findMany({
      where: { rondaEliminatoria: { faseCompetenciaId: cuatro.faseId } },
      include: { partidos: true, rondaEliminatoria: true },
      orderBy: [{ rondaEliminatoria: { orden: 'asc' } }, { orden: 'asc' }],
    })
    expect(llaves).toHaveLength(3)
    expect(llaves.filter((llave) => llave.partidos.length === 1)).toHaveLength(2)
    expect(llaves[0]).toMatchObject({
      participacionLocalId: cuatro.participaciones[0],
      participacionVisitanteId: cuatro.participaciones[3],
      seedLocal: 1,
      seedVisitante: 4,
      origenLocalTipo: 'SEED',
      origenVisitanteTipo: 'SEED',
    })
    expect(llaves[2]).toMatchObject({
      origenLocalTipo: 'GANADOR_LLAVE',
      origenLocalLlaveId: llaves[0]!.id,
      origenVisitanteTipo: 'GANADOR_LLAVE',
      origenVisitanteLlaveId: llaves[1]!.id,
    })
    expect((await finalizar(llaves[0]!.partidos[0]!.id, 1, 0)).statusCode).toBe(200)
    const finalPendiente = await getPrisma().llaveCompetencia.findUniqueOrThrow({
      where: { id: llaves[2]!.id },
    })
    expect(finalPendiente.participacionLocalId).toBe(cuatro.participaciones[0])
    expect(finalPendiente.estado).toBe('PENDIENTE_PARTICIPANTES')

    const ocho = await crearEliminacion('Ocho', 8)
    expect(
      await getPrisma().llaveCompetencia.count({
        where: { rondaEliminatoria: { faseCompetenciaId: ocho.faseId } },
      }),
    ).toBe(7)
    expect(
      await getPrisma().partido.count({
        where: { llaveCompetencia: { rondaEliminatoria: { faseCompetenciaId: ocho.faseId } } },
      }),
    ).toBe(4)

    const dieciseis = await crearEliminacion('Dieciseis', 16)
    expect(
      await getPrisma().llaveCompetencia.count({
        where: { rondaEliminatoria: { faseCompetenciaId: dieciseis.faseId } },
      }),
    ).toBe(15)
    expect(
      await getPrisma().partido.count({
        where: { llaveCompetencia: { rondaEliminatoria: { faseCompetenciaId: dieciseis.faseId } } },
      }),
    ).toBe(8)
  })

  it('aplica BYE para cinco seeds sin crear partidos ficticios', async () => {
    const { faseId, torneoId, equipos } = await crearEliminacion('Cinco', 5)
    const llaves = await getPrisma().llaveCompetencia.findMany({
      where: { rondaEliminatoria: { faseCompetenciaId: faseId } },
      include: { partidos: true },
    })
    const byes = llaves.filter((llave) => llave.estado === 'BYE')
    expect(byes).toHaveLength(3)
    expect(
      byes.every((llave) => llave.partidos.length === 0 && llave.ganadorParticipacionId !== null),
    ).toBe(true)
    expect(
      llaves.every((llave) =>
        llave.partidos.every(
          (partido) => partido.equipoLocalId !== null && partido.equipoVisitanteId !== null,
        ),
      ),
    ).toBe(true)
    await getPrisma().torneo.update({
      where: { id: torneoId },
      data: { visiblePublico: true, configuracionPublica: { mostrarFixture: true } },
    })
    await getPrisma().equipo.updateMany({
      where: { id: { in: equipos } },
      data: { privado: false },
    })
    const fase = await getPrisma().faseCompetencia.findUniqueOrThrow({ where: { id: faseId } })
    const publico = await app.inject({
      method: 'GET',
      url: `/api/publico/torneo-categorias/${fase.torneoCategoriaId}/fases`,
    })
    expect(publico.statusCode).toBe(200)
    expect(
      publico
        .json()
        .data[0].rondas.flatMap(
          (ronda: { llaves: Array<{ estado: string; partidos: unknown[] }> }) => ronda.llaves,
        )
        .filter((llave: { estado: string }) => llave.estado === 'BYE')
        .every((llave: { partidos: unknown[] }) => llave.partidos.length === 0),
    ).toBe(true)
  })

  it('marca empate como pendiente de definición y no propaga ganador', async () => {
    const { faseId } = await crearEliminacion('Empate')
    const inicial = await getPrisma().llaveCompetencia.findFirstOrThrow({
      where: { rondaEliminatoria: { faseCompetenciaId: faseId, orden: 1 } },
      include: { partidos: true },
    })
    expect((await finalizar(inicial.partidos[0]!.id, 1, 1)).statusCode).toBe(200)
    const llave = await getPrisma().llaveCompetencia.findUniqueOrThrow({
      where: { id: inicial.id },
    })
    const siguiente = await getPrisma().llaveCompetencia.findUniqueOrThrow({
      where: { id: llave.llaveSiguienteId! },
    })
    expect(llave).toMatchObject({ estado: 'PENDIENTE_DEFINICION', ganadorParticipacionId: null })
    expect(siguiente.participacionLocalId).toBeNull()
  })

  it('proyecta participantes, BYE, origen y empate en respuesta privada', async () => {
    const normal = await crearEliminacion('Proyección normal')
    const partidoNormal = await getPrisma().partido.findFirstOrThrow({
      where: {
        llaveCompetencia: { rondaEliminatoria: { faseCompetenciaId: normal.faseId, orden: 1 } },
      },
    })
    expect((await finalizar(partidoNormal.id, 1, 0)).statusCode).toBe(200)
    const bye = await crearEliminacion('Proyección BYE', 5)
    const empate = await crearEliminacion('Proyección empate')
    const partidoEmpate = await getPrisma().partido.findFirstOrThrow({
      where: {
        llaveCompetencia: { rondaEliminatoria: { faseCompetenciaId: empate.faseId, orden: 1 } },
      },
    })
    expect((await finalizar(partidoEmpate.id, 1, 1)).statusCode).toBe(200)

    const respuesta = await app.inject({
      method: 'GET',
      url: `/api/torneo-categorias/${normal.id}/competencia-avanzada`,
      ...headers(tokenAdmin),
    })
    const llaves = respuesta
      .json()
      .data[0].rondas.flatMap((ronda: { llaves: unknown[] }) => ronda.llaves) as Array<
      Record<string, unknown>
    >
    const primera = llaves.find(
      (llave) =>
        llave.partidos &&
        Array.isArray(llave.partidos) &&
        llave.partidos.some((partido: { id: string }) => partido.id === partidoNormal.id),
    )!
    expect(primera.participacionLocal).toMatchObject({
      id: normal.participaciones[0],
      equipoId: normal.equipos[0],
      equipo: { nombre: expect.any(String) },
    })
    expect(primera.participacionVisitante).toMatchObject({ equipo: { nombre: expect.any(String) } })
    expect(primera.ganadorParticipacion).toMatchObject({ equipo: { nombre: expect.any(String) } })

    const respuestaBye = await app.inject({
      method: 'GET',
      url: `/api/torneo-categorias/${bye.id}/competencia-avanzada`,
      ...headers(tokenAdmin),
    })
    const llavesBye = respuestaBye
      .json()
      .data[0].rondas.flatMap((ronda: { llaves: unknown[] }) => ronda.llaves) as Array<
      Record<string, unknown>
    >
    const llaveBye = llavesBye.find((llave) => llave.estado === 'BYE')!
    expect(llaveBye).toMatchObject({
      ganadorParticipacion: { equipo: { nombre: expect.any(String) } },
      partidos: [],
    })
    expect(Boolean(llaveBye.participacionLocal) !== Boolean(llaveBye.participacionVisitante)).toBe(
      true,
    )

    const pendiente = llaves.find((llave) => llave.estado === 'PENDIENTE_PARTICIPANTES')!
    expect(pendiente).toMatchObject({
      participacionVisitante: null,
      origenLocalLlaveId: expect.any(String),
      origenVisitanteLlaveId: expect.any(String),
    })

    const respuestaEmpate = await app.inject({
      method: 'GET',
      url: `/api/torneo-categorias/${empate.id}/competencia-avanzada`,
      ...headers(tokenAdmin),
    })
    const llavesEmpate = respuestaEmpate
      .json()
      .data[0].rondas.flatMap((ronda: { llaves: unknown[] }) => ronda.llaves) as Array<
      Record<string, unknown>
    >
    expect(llavesEmpate.find((llave) => llave.estado === 'PENDIENTE_DEFINICION')).toMatchObject({
      participacionLocal: { equipo: { nombre: expect.any(String) } },
      participacionVisitante: { equipo: { nombre: expect.any(String) } },
      ganadorParticipacion: null,
    })
  })

  it('aplica RBAC: delegado consulta su torneo, otro tenant no administra y superadmin sí', async () => {
    const competencia = await crearCompetencia('Permisos')
    const delegado = await getPrisma().usuario.findUniqueOrThrow({
      where: { email: `avanzada-delegado-${sufijo}@test.dev` },
    })
    await agregarMiembroEquipo(delegado.id, competencia.equipos[0]!, 'DELEGADO')
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/torneo-categorias/${competencia.id}/competencia-avanzada`,
          ...headers(tokenDelegado),
        })
      ).statusCode,
    ).toBe(200)
    const fuera = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${competencia.id}/fases/eliminacion`,
      payload: {
        orden: 1,
        nombre: 'No',
        seeds: competencia.participaciones.map((participacionId, i) => ({
          participacionId,
          seed: i + 1,
        })),
      },
      ...headers(tokenOtroTenant),
    })
    expect(fuera.statusCode).toBe(403)
    const superadmin = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${competencia.id}/fases/eliminacion`,
      payload: {
        orden: 1,
        nombre: 'Sí',
        seeds: competencia.participaciones.map((participacionId, i) => ({
          participacionId,
          seed: i + 1,
        })),
      },
      ...headers(tokenSuperadmin),
    })
    expect(superadmin.statusCode).toBe(200)
  })

  it('expone fases públicas solo con fixture visible y oculta equipos privados', async () => {
    const competencia = await crearCompetencia('Público')
    const crear = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${competencia.id}/fases/grupos`,
      payload: {
        orden: 1,
        nombre: 'Grupos',
        ruedas: 1,
        grupos: [
          { nombre: 'A', participacionIds: competencia.participaciones.slice(0, 2) },
          { nombre: 'B', participacionIds: competencia.participaciones.slice(2) },
        ],
      },
      ...headers(tokenAdmin),
    })
    const faseId = crear.json().data.id as string
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${faseId}/generar`,
          payload: { confirmar: true },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    await getPrisma().torneo.update({
      where: { id: competencia.torneoId },
      data: { visiblePublico: true, configuracionPublica: { mostrarFixture: true } },
    })
    const privados = await app.inject({
      method: 'GET',
      url: `/api/publico/torneo-categorias/${competencia.id}/fases`,
    })
    expect(privados.statusCode).toBe(200)
    expect(
      privados
        .json()
        .data[0].grupos.every(
          (grupo: { participaciones: unknown[] }) => grupo.participaciones.length === 0,
        ),
    ).toBe(true)
    await getPrisma().equipo.updateMany({
      where: { id: { in: competencia.equipos } },
      data: { privado: false },
    })
    const publico = await app.inject({
      method: 'GET',
      url: `/api/publico/torneo-categorias/${competencia.id}/fases`,
    })
    expect(
      publico
        .json()
        .data[0].grupos.flatMap((grupo: { participaciones: unknown[] }) => grupo.participaciones),
    ).toHaveLength(4)
    await getPrisma().torneo.update({
      where: { id: competencia.torneoId },
      data: { configuracionPublica: { mostrarFixture: false } },
    })
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/publico/torneo-categorias/${competencia.id}/fases`,
        })
      ).statusCode,
    ).toBe(404)
  })

  it('clasifica grupos aislados, materializa slots y genera eliminación destino atómicamente', async () => {
    const competencia = await crearCompetencia('Clasificación')
    const origen = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${competencia.id}/fases/grupos`,
      payload: {
        orden: 1,
        nombre: 'Grupos',
        ruedas: 1,
        grupos: [
          { nombre: 'A', participacionIds: competencia.participaciones.slice(0, 2) },
          { nombre: 'B', participacionIds: competencia.participaciones.slice(2) },
        ],
      },
      ...headers(tokenAdmin),
    })
    const origenId = origen.json().data.id as string
    const destino = await getPrisma().faseCompetencia.create({
      data: {
        torneoCategoriaId: competencia.id,
        orden: 2,
        nombre: 'Playoffs',
        tipo: 'ELIMINACION_DIRECTA',
        configuracion: {},
      },
    })
    const grupos = await getPrisma().grupoCompetencia.findMany({
      where: { faseCompetenciaId: origenId },
      orderBy: { orden: 'asc' },
    })
    for (const [indice, grupo] of grupos.entries()) {
      const regla = await app.inject({
        method: 'POST',
        url: `/api/fases-competencia/${origenId}/reglas-clasificacion`,
        payload: {
          faseDestinoId: destino.id,
          orden: indice + 1,
          tipo: 'POSICION_GRUPO',
          grupoCompetenciaId: grupo.id,
          posicionDesde: 1,
          posicionHasta: 2,
          seedTipo: 'CRUCE_EXPLICITO',
          seedInicio: 1,
          configuracion: { seeds: indice === 0 ? [1, 4] : [2, 3] },
        },
        ...headers(tokenAdmin),
      })
      expect(regla.statusCode).toBe(200)
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${origenId}/generar`,
          payload: { confirmar: true },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    const partidosOrigen = await getPrisma().partido.findMany({
      where: { jornada: { grupoCompetencia: { faseCompetenciaId: origenId } } },
    })
    for (const partido of partidosOrigen)
      expect((await finalizar(partido.id, 1, 0)).statusCode).toBe(200)
    const clasificar = await app.inject({
      method: 'POST',
      url: `/api/fases-competencia/${origenId}/clasificar`,
      payload: { confirmar: true },
      ...headers(tokenAdmin),
    })
    expect(clasificar.statusCode).toBe(200)
    expect(
      await getPrisma().participanteFase.count({ where: { faseCompetenciaId: destino.id } }),
    ).toBe(4)
    const llaves = await getPrisma().llaveCompetencia.findMany({
      where: { rondaEliminatoria: { faseCompetenciaId: destino.id, orden: 1 } },
      orderBy: { orden: 'asc' },
    })
    expect(llaves).toHaveLength(2)
    expect(
      llaves.every((llave) => llave.participanteFaseLocalId && llave.participanteFaseVisitanteId),
    ).toBe(true)
    expect(llaves.map((llave) => [llave.seedLocal, llave.seedVisitante])).toEqual([
      [1, 4],
      [2, 3],
    ])
    const clasificados = await getPrisma().clasificadoFase.findMany({
      where: { reglaClasificacion: { faseOrigenId: origenId } },
      orderBy: { seed: 'asc' },
    })
    expect(clasificados).toHaveLength(4)
    expect(
      clasificados.every(
        (clasificado) =>
          typeof clasificado.tablaSnapshot === 'object' &&
          typeof clasificado.desempatesSnapshot === 'object',
      ),
    ).toBe(true)

    const idempotente = await app.inject({
      method: 'POST',
      url: `/api/fases-competencia/${origenId}/clasificar`,
      payload: { confirmar: true },
      ...headers(tokenAdmin),
    })
    expect(idempotente.statusCode).toBe(200)
    expect(idempotente.json().data).toMatchObject({ idempotente: true })
    expect(
      await getPrisma().participanteFase.count({ where: { faseCompetenciaId: destino.id } }),
    ).toBe(4)

    await getPrisma().torneo.update({
      where: { id: competencia.torneoId },
      data: { visiblePublico: true, configuracionPublica: { mostrarFixture: true } },
    })
    const privado = await app.inject({
      method: 'GET',
      url: `/api/publico/torneo-categorias/${competencia.id}/fases`,
    })
    expect(privado.statusCode).toBe(200)
    expect(privado.json().data[1]).toMatchObject({ participantesFase: [] })
    expect(
      privado
        .json()
        .data[0].reglasClasificacionOrigen.every(
          (regla: { clasificados: unknown[] }) => regla.clasificados.length === 0,
        ),
    ).toBe(true)

    const invalidar = await app.inject({
      method: 'POST',
      url: `/api/fases-competencia/${origenId}/invalidar-clasificacion`,
      payload: { confirmar: true },
      ...headers(tokenAdmin),
    })
    expect(invalidar.statusCode).toBe(200)
    expect(
      await getPrisma().participanteFase.count({ where: { faseCompetenciaId: destino.id } }),
    ).toBe(0)
    expect(
      await getPrisma().llaveCompetencia.count({
        where: { rondaEliminatoria: { faseCompetenciaId: destino.id } },
      }),
    ).toBe(0)
  })

  it('rechaza clasificación de fase incompleta y aplica RBAC al clasificar', async () => {
    const competencia = await crearCompetencia('Clasificación incompleta')
    const origen = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${competencia.id}/fases/grupos`,
      payload: {
        orden: 1,
        nombre: 'Grupos',
        ruedas: 1,
        grupos: [
          { nombre: 'A', participacionIds: competencia.participaciones.slice(0, 2) },
          { nombre: 'B', participacionIds: competencia.participaciones.slice(2) },
        ],
      },
      ...headers(tokenAdmin),
    })
    const origenId = origen.json().data.id as string
    const destino = await getPrisma().faseCompetencia.create({
      data: {
        torneoCategoriaId: competencia.id,
        orden: 2,
        nombre: 'Destino',
        tipo: 'ELIMINACION_DIRECTA',
        configuracion: {},
      },
    })
    const grupos = await getPrisma().grupoCompetencia.findMany({
      where: { faseCompetenciaId: origenId },
      orderBy: { orden: 'asc' },
    })
    for (const [indice, grupo] of grupos.entries()) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/fases-competencia/${origenId}/reglas-clasificacion`,
            payload: {
              faseDestinoId: destino.id,
              orden: indice + 1,
              tipo: 'POSICION_GRUPO',
              grupoCompetenciaId: grupo.id,
              posicionDesde: 1,
              posicionHasta: 2,
              seedTipo: 'ORDEN_CLASIFICACION',
              seedInicio: indice * 2 + 1,
            },
            ...headers(tokenAdmin),
          })
        ).statusCode,
      ).toBe(200)
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${origenId}/generar`,
          payload: { confirmar: true },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    const incompleta = await app.inject({
      method: 'POST',
      url: `/api/fases-competencia/${origenId}/clasificar`,
      payload: { confirmar: true },
      ...headers(tokenAdmin),
    })
    expect(incompleta.statusCode).toBe(409)
    expect(incompleta.json().error.code).toBe('fase_origen_incompleta')

    const delegado = await getPrisma().usuario.findUniqueOrThrow({
      where: { email: `avanzada-delegado-${sufijo}@test.dev` },
    })
    await agregarMiembroEquipo(delegado.id, competencia.equipos[0]!, 'DELEGADO')
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${origenId}/clasificar`,
          payload: { confirmar: true },
          ...headers(tokenDelegado),
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${origenId}/clasificar`,
          payload: { confirmar: true },
          ...headers(tokenOtroTenant),
        })
      ).statusCode,
    ).toBe(403)

    const partidos = await getPrisma().partido.findMany({
      where: { jornada: { grupoCompetencia: { faseCompetenciaId: origenId } } },
    })
    for (const partido of partidos) expect((await finalizar(partido.id, 1, 0)).statusCode).toBe(200)
    const superadmin = await app.inject({
      method: 'POST',
      url: `/api/fases-competencia/${origenId}/clasificar`,
      payload: { confirmar: true },
      ...headers(tokenSuperadmin),
    })
    expect(superadmin.statusCode).toBe(200)
  })

  it('selecciona mejores terceros y rechaza grupos de distinto tamaño', async () => {
    const competencia = await crearCompetencia('Mejores terceros', 9)
    const crear = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${competencia.id}/fases/grupos`,
      payload: {
        orden: 1,
        nombre: 'Grupos',
        ruedas: 1,
        grupos: ['A', 'B', 'C'].map((nombre, indice) => ({
          nombre,
          participacionIds: competencia.participaciones.slice(indice * 3, indice * 3 + 3),
        })),
      },
      ...headers(tokenAdmin),
    })
    const origenId = crear.json().data.id as string
    const destino = await getPrisma().faseCompetencia.create({
      data: {
        torneoCategoriaId: competencia.id,
        orden: 2,
        nombre: 'Destino',
        tipo: 'ELIMINACION_DIRECTA',
        configuracion: {},
      },
    })
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${origenId}/reglas-clasificacion`,
          payload: {
            faseDestinoId: destino.id,
            orden: 1,
            tipo: 'MEJORES_ENTRE_GRUPOS',
            posicionDesde: 3,
            posicionHasta: 3,
            cantidad: 2,
            seedTipo: 'ORDEN_CLASIFICACION',
            seedInicio: 1,
          },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${origenId}/generar`,
          payload: { confirmar: true },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    const partidos = await getPrisma().partido.findMany({
      where: { jornada: { grupoCompetencia: { faseCompetenciaId: origenId } } },
      orderBy: { jornadaId: 'asc' },
    })
    for (const partido of partidos) expect((await finalizar(partido.id, 1, 0)).statusCode).toBe(200)
    const preview = await app.inject({
      method: 'GET',
      url: `/api/fases-competencia/${origenId}/clasificacion/preview`,
      ...headers(tokenAdmin),
    })
    expect(preview.statusCode).toBe(200)
    expect(preview.json().data.candidatos).toHaveLength(2)

    const desigual = await crearCompetencia('Grupos desiguales', 5)
    const faseDesigual = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${desigual.id}/fases/grupos`,
      payload: {
        orden: 1,
        nombre: 'Grupos',
        ruedas: 1,
        grupos: [
          { nombre: 'A', participacionIds: desigual.participaciones.slice(0, 2) },
          { nombre: 'B', participacionIds: desigual.participaciones.slice(2) },
        ],
      },
      ...headers(tokenAdmin),
    })
    const desigualId = faseDesigual.json().data.id as string
    const destinoDesigual = await getPrisma().faseCompetencia.create({
      data: {
        torneoCategoriaId: desigual.id,
        orden: 2,
        nombre: 'Destino',
        tipo: 'ELIMINACION_DIRECTA',
        configuracion: {},
      },
    })
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${desigualId}/reglas-clasificacion`,
          payload: {
            faseDestinoId: destinoDesigual.id,
            orden: 1,
            tipo: 'MEJORES_ENTRE_GRUPOS',
            posicionDesde: 2,
            posicionHasta: 2,
            cantidad: 1,
            seedTipo: 'ORDEN_CLASIFICACION',
            seedInicio: 1,
          },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${desigualId}/generar`,
          payload: { confirmar: true },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    for (const partido of await getPrisma().partido.findMany({
      where: { jornada: { grupoCompetencia: { faseCompetenciaId: desigualId } } },
    }))
      expect((await finalizar(partido.id, 1, 0)).statusCode).toBe(200)
    const noComparable = await app.inject({
      method: 'GET',
      url: `/api/fases-competencia/${desigualId}/clasificacion/preview`,
      ...headers(tokenAdmin),
    })
    expect(noComparable.statusCode).toBe(409)
    expect(noComparable.json().error.code).toBe('clasificacion_grupos_no_comparables')
  })

  it('clasifica LIGA de 12 al top 8, genera fixture y cruza seed 1 contra 8', async () => {
    const competencia = await crearCompetencia('Liga top 8', 12)
    const configuracion = await getPrisma().configuracionCompetencia.findUniqueOrThrow({
      where: { torneoCategoriaId: competencia.id },
    })
    const liga = await getPrisma().faseCompetencia.create({
      data: {
        torneoCategoriaId: competencia.id,
        orden: 1,
        nombre: 'Liga',
        tipo: 'LIGA',
        configuracion: { ruedas: 1 },
        sistemaPuntos: configuracion.sistemaPuntos,
        desempates: configuracion.desempates,
      },
    })
    await getPrisma().participanteFase.createMany({
      data: competencia.participaciones.map((participacionId, indice) => ({
        faseCompetenciaId: liga.id,
        participacionId,
        seed: indice + 1,
      })),
    })
    const destino = await getPrisma().faseCompetencia.create({
      data: {
        torneoCategoriaId: competencia.id,
        orden: 2,
        nombre: 'Top 8',
        tipo: 'ELIMINACION_DIRECTA',
        configuracion: {},
      },
    })
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${liga.id}/reglas-clasificacion`,
          payload: {
            faseDestinoId: destino.id,
            orden: 1,
            tipo: 'POSICION_GENERAL',
            posicionDesde: 1,
            posicionHasta: 8,
            seedTipo: 'ORDEN_CLASIFICACION',
            seedInicio: 1,
          },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${liga.id}/generar`,
          payload: { confirmar: true },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    expect(
      await getPrisma().partido.count({ where: { jornada: { faseCompetenciaId: liga.id } } }),
    ).toBe(66)
    await getPrisma().partido.updateMany({
      where: { jornada: { faseCompetenciaId: liga.id } },
      data: { estado: 'FINALIZADO', golesLocal: 0, golesVisitante: 0 },
    })
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${liga.id}/clasificar`,
          payload: { confirmar: true },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    const primera = await getPrisma().llaveCompetencia.findFirstOrThrow({
      where: { rondaEliminatoria: { faseCompetenciaId: destino.id, orden: 1 }, orden: 1 },
    })
    expect(primera).toMatchObject({ seedLocal: 1, seedVisitante: 8 })
  })

  it('bloquea invalidación cuando destino materializado tiene actividad', async () => {
    const competencia = await crearCompetencia('Invalidación histórica')
    const origen = await app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${competencia.id}/fases/grupos`,
      payload: {
        orden: 1,
        nombre: 'Grupos',
        ruedas: 1,
        grupos: [
          { nombre: 'A', participacionIds: competencia.participaciones.slice(0, 2) },
          { nombre: 'B', participacionIds: competencia.participaciones.slice(2) },
        ],
      },
      ...headers(tokenAdmin),
    })
    const origenId = origen.json().data.id as string
    const destino = await getPrisma().faseCompetencia.create({
      data: {
        torneoCategoriaId: competencia.id,
        orden: 2,
        nombre: 'Destino',
        tipo: 'ELIMINACION_DIRECTA',
        configuracion: {},
      },
    })
    for (const [indice, grupo] of (
      await getPrisma().grupoCompetencia.findMany({
        where: { faseCompetenciaId: origenId },
        orderBy: { orden: 'asc' },
      })
    ).entries())
      expect(
        (
          await app.inject({
            method: 'POST',
            url: `/api/fases-competencia/${origenId}/reglas-clasificacion`,
            payload: {
              faseDestinoId: destino.id,
              orden: indice + 1,
              tipo: 'POSICION_GRUPO',
              grupoCompetenciaId: grupo.id,
              posicionDesde: 1,
              posicionHasta: 2,
              seedTipo: 'ORDEN_CLASIFICACION',
              seedInicio: indice * 2 + 1,
            },
            ...headers(tokenAdmin),
          })
        ).statusCode,
      ).toBe(200)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${origenId}/generar`,
          payload: { confirmar: true },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    for (const partido of await getPrisma().partido.findMany({
      where: { jornada: { grupoCompetencia: { faseCompetenciaId: origenId } } },
    }))
      expect((await finalizar(partido.id, 1, 0)).statusCode).toBe(200)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/fases-competencia/${origenId}/clasificar`,
          payload: { confirmar: true },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    const partidoDestino = await getPrisma().partido.findFirstOrThrow({
      where: { llaveCompetencia: { rondaEliminatoria: { faseCompetenciaId: destino.id } } },
    })
    await getPrisma().partido.update({
      where: { id: partidoDestino.id },
      data: { publicada: true },
    })
    const invalidar = await app.inject({
      method: 'POST',
      url: `/api/fases-competencia/${origenId}/invalidar-clasificacion`,
      payload: { confirmar: true },
      ...headers(tokenAdmin),
    })
    expect(invalidar.statusCode).toBe(409)
    expect(invalidar.json().error.code).toBe('fase_destino_historica')
  })

  it('FASE 16C crea ida/vuelta, deriva global y resuelve penales sin goles ficticios', async () => {
    const competencia = await crearCompetencia('Serie 16C')
    const crear = await app.inject({ method: 'POST', url: `/api/torneo-categorias/${competencia.id}/fases/eliminacion`, payload: { orden: 1, nombre: 'Playoffs', seeds: competencia.participaciones.map((participacionId, i) => ({ participacionId, seed: i + 1 })), configuracion: { rondas: [{ orden: 1, formatoSerie: 'IDA_VUELTA', permitePenales: true }] } }, ...headers(tokenAdmin) })
    expect(crear.statusCode).toBe(200)
    const faseId = crear.json().data.id as string
    expect((await app.inject({ method: 'POST', url: `/api/fases-competencia/${faseId}/generar`, payload: { confirmar: true }, ...headers(tokenAdmin) })).statusCode).toBe(200)
    const llave = await getPrisma().llaveCompetencia.findFirstOrThrow({ where: { rondaEliminatoria: { faseCompetenciaId: faseId }, partidos: { some: {} } }, include: { partidos: { orderBy: { ordenSerie: 'asc' } } } })
    expect(llave.partidos).toHaveLength(2)
    expect(llave.partidos[0]!.equipoLocalId).toBe(llave.partidos[1]!.equipoVisitanteId)
    expect((await finalizar(llave.partidos[0]!.id, 2, 1)).statusCode).toBe(200)
    expect((await getPrisma().llaveCompetencia.findUniqueOrThrow({ where: { id: llave.id } })).estado).toBe('PROGRAMADA')
    expect((await finalizar(llave.partidos[1]!.id, 1, 0)).statusCode).toBe(200)
    expect((await getPrisma().llaveCompetencia.findUniqueOrThrow({ where: { id: llave.id } })).estado).toBe('PENDIENTE_DEFINICION')
    const penales = await app.inject({ method: 'POST', url: `/api/llaves-competencia/${llave.id}/definicion/penales`, payload: { confirmar: true, penalesLocal: 4, penalesVisitante: 3 }, ...headers(tokenAdmin) })
    expect(penales.statusCode).toBe(200)
    const resuelta = await getPrisma().llaveCompetencia.findUniqueOrThrow({ where: { id: llave.id }, include: { definicion: true } })
    expect(resuelta).toMatchObject({ estado: 'RESUELTA', metodoResolucion: 'PENALES' })
    expect(resuelta.definicion).toMatchObject({ penalesLocal: 4, penalesVisitante: 3 })
  })

  it('FASE 16C rechaza alargue en ida y lo acepta solo en vuelta o partido único', async () => {
    const competencia = await crearCompetencia('Alargue 16C')
    const crear = await app.inject({ method: 'POST', url: `/api/torneo-categorias/${competencia.id}/fases/eliminacion`, payload: { orden: 1, nombre: 'Playoffs', seeds: competencia.participaciones.map((participacionId, i) => ({ participacionId, seed: i + 1 })), configuracion: { rondas: [{ orden: 1, formatoSerie: 'IDA_VUELTA', permiteAlargue: true, permitePenales: true }] } }, ...headers(tokenAdmin) })
    expect(crear.statusCode).toBe(200)
    const faseId = crear.json().data.id as string
    expect((await app.inject({ method: 'POST', url: `/api/fases-competencia/${faseId}/generar`, payload: { confirmar: true }, ...headers(tokenAdmin) })).statusCode).toBe(200)
    const llave = await getPrisma().llaveCompetencia.findFirstOrThrow({ where: { rondaEliminatoria: { faseCompetenciaId: faseId }, partidos: { some: {} } }, include: { partidos: { orderBy: { ordenSerie: 'asc' } } } })
    const [ida, vuelta] = llave.partidos

    const idaConAlargue = await app.inject({ method: 'POST', url: `/api/partidos/${ida!.id}/estado`, payload: { estado: 'EN_CURSO' }, ...headers(tokenAdmin) })
    expect(idaConAlargue.statusCode).toBe(200)
    const rechazo = await app.inject({ method: 'POST', url: `/api/partidos/${ida!.id}/resultado`, payload: { golesLocal: 2, golesVisitante: 1, golesLocalReglamentario: 1, golesVisitanteReglamentario: 1 }, ...headers(tokenAdmin) })
    expect(rechazo.statusCode).toBe(400)
    expect((await finalizar(ida!.id, 2, 1)).statusCode).toBe(200)

    const vueltaConAlargue = await app.inject({ method: 'POST', url: `/api/partidos/${vuelta!.id}/estado`, payload: { estado: 'EN_CURSO' }, ...headers(tokenAdmin) })
    expect(vueltaConAlargue.statusCode).toBe(200)
    const partidoVuelta = await getPrisma().partido.findUniqueOrThrow({ where: { id: vuelta!.id }, select: { equipoLocalId: true, equipoVisitanteId: true } })
    for (let i = 0; i < 2; i++) await getPrisma().eventoPartido.create({ data: { partidoId: vuelta!.id, equipoId: partidoVuelta.equipoLocalId!, tipo: 'GOL', minuto: i + 1, periodo: i < 1 ? undefined : 'ALARGUE_PRIMER_TIEMPO' } })
    for (let i = 0; i < 2; i++) await getPrisma().eventoPartido.create({ data: { partidoId: vuelta!.id, equipoId: partidoVuelta.equipoVisitanteId!, tipo: 'GOL', minuto: i + 1 } })
    const aceptaVuelta = await app.inject({ method: 'POST', url: `/api/partidos/${vuelta!.id}/resultado`, payload: { golesLocal: 2, golesVisitante: 2, golesLocalReglamentario: 2, golesVisitanteReglamentario: 1 }, ...headers(tokenAdmin) })
    expect(aceptaVuelta.statusCode).toBe(200)
    const resuelta = await getPrisma().llaveCompetencia.findUniqueOrThrow({ where: { id: llave.id } })
    expect(resuelta).toMatchObject({ estado: 'RESUELTA', metodoResolucion: 'ALARGUE' })

    const partidoUnico = await crearCompetencia('Alargue único')
    const crearUnico = await app.inject({ method: 'POST', url: `/api/torneo-categorias/${partidoUnico.id}/fases/eliminacion`, payload: { orden: 1, nombre: 'Playoffs', seeds: partidoUnico.participaciones.map((participacionId, i) => ({ participacionId, seed: i + 1 })), configuracion: { rondas: [{ orden: 1, formatoSerie: 'PARTIDO_UNICO', permiteAlargue: true, permitePenales: true }] } }, ...headers(tokenAdmin) })
    expect(crearUnico.statusCode).toBe(200)
    const faseUnica = crearUnico.json().data.id as string
    expect((await app.inject({ method: 'POST', url: `/api/fases-competencia/${faseUnica}/generar`, payload: { confirmar: true }, ...headers(tokenAdmin) })).statusCode).toBe(200)
    const llaveUnica = await getPrisma().llaveCompetencia.findFirstOrThrow({ where: { rondaEliminatoria: { faseCompetenciaId: faseUnica }, partidos: { some: {} } }, include: { partidos: true } })
    const partido = llaveUnica.partidos[0]!
    expect((await app.inject({ method: 'POST', url: `/api/partidos/${partido.id}/estado`, payload: { estado: 'EN_CURSO' }, ...headers(tokenAdmin) })).statusCode).toBe(200)
    const equipos = await getPrisma().partido.findUniqueOrThrow({ where: { id: partido.id }, select: { equipoLocalId: true, equipoVisitanteId: true } })
    await getPrisma().eventoPartido.create({ data: { partidoId: partido.id, equipoId: equipos.equipoLocalId!, tipo: 'GOL', minuto: 1 } })
    await getPrisma().eventoPartido.create({ data: { partidoId: partido.id, equipoId: equipos.equipoLocalId!, tipo: 'GOL', minuto: 3, periodo: 'ALARGUE_PRIMER_TIEMPO' } })
    await getPrisma().eventoPartido.create({ data: { partidoId: partido.id, equipoId: equipos.equipoVisitanteId!, tipo: 'GOL', minuto: 2 } })
    const rechazoNoEmpate = await app.inject({ method: 'POST', url: `/api/partidos/${partido.id}/resultado`, payload: { golesLocal: 1, golesVisitante: 1, golesLocalReglamentario: 0, golesVisitanteReglamentario: 1 }, ...headers(tokenAdmin) })
    expect(rechazoNoEmpate.statusCode).toBe(400)
    const unico = await app.inject({ method: 'POST', url: `/api/partidos/${partido.id}/resultado`, payload: { golesLocal: 2, golesVisitante: 1, golesLocalReglamentario: 1, golesVisitanteReglamentario: 1 }, ...headers(tokenAdmin) })
    expect(unico.statusCode).toBe(200)
    expect((await getPrisma().llaveCompetencia.findUniqueOrThrow({ where: { id: llaveUnica.id } })).metodoResolucion).toBe('ALARGUE')

    const sinSnapshot = await crearCompetencia('Alargue sin permiso')
    const crearSin = await app.inject({ method: 'POST', url: `/api/torneo-categorias/${sinSnapshot.id}/fases/eliminacion`, payload: { orden: 1, nombre: 'Playoffs', seeds: sinSnapshot.participaciones.map((participacionId, i) => ({ participacionId, seed: i + 1 })), configuracion: { rondas: [{ orden: 1, formatoSerie: 'PARTIDO_UNICO', permiteAlargue: false, permitePenales: true }] } }, ...headers(tokenAdmin) })
    const faseSin = crearSin.json().data.id as string
    expect((await app.inject({ method: 'POST', url: `/api/fases-competencia/${faseSin}/generar`, payload: { confirmar: true }, ...headers(tokenAdmin) })).statusCode).toBe(200)
    const llaveSin = await getPrisma().llaveCompetencia.findFirstOrThrow({ where: { rondaEliminatoria: { faseCompetenciaId: faseSin }, partidos: { some: {} } }, include: { partidos: true } })
    expect((await app.inject({ method: 'POST', url: `/api/partidos/${llaveSin.partidos[0]!.id}/estado`, payload: { estado: 'EN_CURSO' }, ...headers(tokenAdmin) })).statusCode).toBe(200)
    const sin = await app.inject({ method: 'POST', url: `/api/partidos/${llaveSin.partidos[0]!.id}/resultado`, payload: { golesLocal: 2, golesVisitante: 1, golesLocalReglamentario: 1, golesVisitanteReglamentario: 1 }, ...headers(tokenAdmin) })
    expect(sin.statusCode).toBe(400)
  })

  it('FASE 16C bloquea corrección de eventos de partido resuelto hasta invalidar resolución', async () => {
    const competencia = await crearCompetencia('Corrección bloqueada')
    const crear = await app.inject({ method: 'POST', url: `/api/torneo-categorias/${competencia.id}/fases/eliminacion`, payload: { orden: 1, nombre: 'Playoffs', seeds: competencia.participaciones.map((participacionId, i) => ({ participacionId, seed: i + 1 })) }, ...headers(tokenAdmin) })
    expect(crear.statusCode).toBe(200)
    const faseId = crear.json().data.id as string
    expect((await app.inject({ method: 'POST', url: `/api/fases-competencia/${faseId}/generar`, payload: { confirmar: true }, ...headers(tokenAdmin) })).statusCode).toBe(200)
    const llave = await getPrisma().llaveCompetencia.findFirstOrThrow({ where: { rondaEliminatoria: { faseCompetenciaId: faseId }, partidos: { some: {} } }, include: { partidos: true } })
    const partido = llave.partidos[0]!
    expect((await finalizar(partido.id, 2, 1)).statusCode).toBe(200)
    const golLocal = await getPrisma().eventoPartido.findFirstOrThrow({ where: { partidoId: partido.id, tipo: 'GOL' }, orderBy: { createdAt: 'asc' } })
    expect((await getPrisma().llaveCompetencia.findUniqueOrThrow({ where: { id: llave.id } })).estado).toBe('RESUELTA')

    const patchBloqueado = await app.inject({ method: 'PATCH', url: `/api/eventos-partido/${golLocal.id}`, payload: { minuto: 90 }, ...headers(tokenAdmin) })
    expect(patchBloqueado.statusCode).toBe(409)
    expect(patchBloqueado.json().error.code).toBe('llave_resuelta')
    const anularBloqueado = await app.inject({ method: 'POST', url: `/api/eventos-partido/${golLocal.id}/anular`, ...headers(tokenAdmin) })
    expect(anularBloqueado.statusCode).toBe(409)
    expect(anularBloqueado.json().error.code).toBe('llave_resuelta')
    const postBloqueado = await app.inject({ method: 'POST', url: `/api/partidos/${partido.id}/eventos`, payload: { tipo: 'TARJETA', equipoId: partido.equipoLocalId!, jugadorId: golLocal.jugadorId!, subtipo: 'AMARILLA', minuto: 10 }, ...headers(tokenAdmin) })
    expect(postBloqueado.statusCode).toBe(409)
    expect(postBloqueado.json().error.code).toBe('llave_resuelta')

    const invalidar = await app.inject({ method: 'POST', url: `/api/llaves-competencia/${llave.id}/invalidar-resolucion`, payload: { confirmar: true }, ...headers(tokenAdmin) })
    expect(invalidar.statusCode).toBe(200)
    const permitido = await app.inject({ method: 'POST', url: `/api/eventos-partido/${golLocal.id}/anular`, ...headers(tokenAdmin) })
    expect(permitido.statusCode).toBe(200)
    expect(permitido.json().data.anulado).toBe(true)
  })

  it(`FASE 16C bloquea invalidar llave de fase que ya alimentó una fase posterior`, async () => {
    const competencia = await crearCompetencia('Fase con posterior')
    const seeds = competencia.participaciones.map((participacionId, i) => ({ participacionId, seed: i + 1 }))
    expect((await app.inject({ method: 'POST', url: `/api/torneo-categorias/${competencia.id}/fases/eliminacion`, payload: { orden: 1, nombre: 'Semis', seeds }, ...headers(tokenAdmin) })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: `/api/torneo-categorias/${competencia.id}/fases/eliminacion`, payload: { orden: 2, nombre: 'Final', seeds }, ...headers(tokenAdmin) })).statusCode).toBe(200)
    const faseA = (await getPrisma().faseCompetencia.findFirstOrThrow({ where: { torneoCategoriaId: competencia.id, orden: 1 } })).id
    const faseB = (await getPrisma().faseCompetencia.findFirstOrThrow({ where: { torneoCategoriaId: competencia.id, orden: 2 } })).id
    await getPrisma().reglaClasificacionFase.create({ data: { faseOrigenId: faseA, faseDestinoId: faseB, orden: 1, tipo: 'POSICION_GENERAL', posicionDesde: 1, posicionHasta: 1, seedTipo: 'ORDEN_CLASIFICACION', seedInicio: 1, configuracion: { seed: 1 }, estado: 'CLASIFICADA' } })
    expect((await app.inject({ method: 'POST', url: `/api/fases-competencia/${faseA}/generar`, payload: { confirmar: true }, ...headers(tokenAdmin) })).statusCode).toBe(200)
    const llave = await getPrisma().llaveCompetencia.findFirstOrThrow({ where: { rondaEliminatoria: { faseCompetenciaId: faseA }, partidos: { some: {} } }, include: { partidos: true } })
    expect((await finalizar(llave.partidos[0]!.id, 2, 1)).statusCode).toBe(200)
    expect((await getPrisma().llaveCompetencia.findUniqueOrThrow({ where: { id: llave.id } })).estado).toBe('RESUELTA')
    const invalida = await app.inject({ method: 'POST', url: `/api/llaves-competencia/${llave.id}/invalidar-resolucion`, payload: { confirmar: true }, ...headers(tokenAdmin) })
    expect(invalida.statusCode).toBe(409)
    expect(invalida.json().error.code).toBe('fase_posterior_historica')
  })
})
