import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { getPrisma } from '../db.js'
import { conCookie, login } from '../test/helpers.js'
import {
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
const email = (rol: string) => `${rol}-${sufijo}@test.dev`

describe('fixture HTTP (FASE 8)', () => {
  let app: FastifyInstance
  let tokenAdmin: string
  let tokenSinPermiso: string
  let tokenOtroAlcance: string
  let competenciaId: string

  async function crearCompetencia(
    nombre: string,
  ): Promise<{ id: string; torneoId: string; equipos: string[] }> {
    const torneo = await crearTorneo(orgA, nombre, { estado: 'INSCRIPCIONES' })
    const temporada = await crearTemporada(torneo.id, `Temporada ${nombre}`)
    const categoria = await crearCategoria(`Categoría ${nombre}`)
    const competencia = await crearTorneoCategoria(torneo.id, temporada.id, categoria.id)
    const locales = [await crearEquipo(`${nombre} A`), await crearEquipo(`${nombre} B`)]
    for (const equipo of locales)
      await crearParticipacion(torneo.id, temporada.id, equipo.id, {
        torneoCategoriaId: competencia.id,
      })
    return { id: competencia.id, torneoId: torneo.id, equipos: locales.map((e) => e.id) }
  }

  let orgA: string

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
    const organizacion = await crearOrganizacion('Org Fixture')
    orgA = organizacion.id
    const orgB = (await crearOrganizacion('Org Externa')).id
    const admin = await crearUsuario({
      email: email('admin'),
      roles: [{ codigo: 'ADMINISTRADOR', organizacionId: orgA }],
    })
    const sinPermiso = await crearUsuario({
      email: email('jugador'),
      roles: [{ codigo: 'JUGADOR' }],
    })
    const otroAlcance = await crearUsuario({
      email: email('otro'),
      roles: [{ codigo: 'ADMINISTRADOR', organizacionId: orgB }],
    })
    tokenAdmin = (await login(app, admin.email, 'contraseña123')).token!
    tokenSinPermiso = (await login(app, sinPermiso.email, 'contraseña123')).token!
    tokenOtroAlcance = (await login(app, otroAlcance.email, 'contraseña123')).token!
    const competencia = await crearCompetencia('Base')
    competenciaId = competencia.id
  })

  afterAll(async () => {
    await app.close()
    await limpiarBase()
  })

  const headers = (token: string) => ({ headers: conCookie(token) })
  const generar = (id: string, token = tokenAdmin, confirmar = true) =>
    app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${id}/fixture/generar`,
      payload: { confirmar },
      ...headers(token),
    })
  const regenerar = (id: string, token = tokenAdmin, confirmar = true) =>
    app.inject({
      method: 'POST',
      url: `/api/torneo-categorias/${id}/fixture/regenerar`,
      payload: { confirmar },
      ...headers(token),
    })

  it('rechaza generación sin permisos y fuera del alcance; autoriza administrador del torneo', async () => {
    expect((await generar(competenciaId, tokenSinPermiso)).statusCode).toBe(403)
    expect((await generar(competenciaId, tokenOtroAlcance)).statusCode).toBe(403)
    const res = await generar(competenciaId)
    expect(res.statusCode).toBe(200)
    expect(res.json().data.cantidadPartidos).toBe(1)
  })

  it('exige confirmación explícita para generar y regenerar', async () => {
    const competencia = await crearCompetencia('Confirmacion')
    expect((await generar(competencia.id, tokenAdmin, false)).statusCode).toBe(400)
    expect((await regenerar(competencia.id, tokenAdmin, false)).statusCode).toBe(400)
    expect((await generar(competencia.id)).statusCode).toBe(200)
  })

  it('regenera fixture virgen y conserva auditoría de ambas operaciones', async () => {
    const competencia = await crearCompetencia('Regenerable')
    expect((await generar(competencia.id)).statusCode).toBe(200)
    const res = await regenerar(competencia.id)
    expect(res.statusCode).toBe(200)
    const auditorias = await getPrisma().auditoriaLog.findMany({
      where: { entidad: 'Fixture', entidadId: competencia.id },
      orderBy: { fecha: 'asc' },
    })
    expect(auditorias.map((a) => a.accion)).toEqual(['CREATE', 'DELETE', 'CREATE'])
  })

  it.each(['APLAZADO', 'SUSPENDIDO', 'EN_CURSO', 'FINALIZADO'] as const)(
    'rechaza regeneración con partido %s',
    async (estado) => {
      const competencia = await crearCompetencia(`Estado${estado}`)
      expect((await generar(competencia.id)).statusCode).toBe(200)
      const partido = await getPrisma().partido.findFirstOrThrow({
        where: { torneoCategoriaId: competencia.id },
      })
      await getPrisma().partido.update({ where: { id: partido.id }, data: { estado } })
      const res = await regenerar(competencia.id)
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('fixture_bloqueado')
    },
  )

  it.each(['goles', 'FormacionInstancia', 'Convocatoria'] as const)(
    'rechaza regeneración con %s asociado',
    async (tipo) => {
      const competencia = await crearCompetencia(`Dependencia${tipo}`)
      expect((await generar(competencia.id)).statusCode).toBe(200)
      const partido = await getPrisma().partido.findFirstOrThrow({
        where: { torneoCategoriaId: competencia.id },
      })
      if (tipo === 'goles')
        await getPrisma().partido.update({
          where: { id: partido.id },
          data: { golesLocal: 1, golesVisitante: 0 },
        })
      if (tipo === 'FormacionInstancia')
        await getPrisma().formacionInstancia.create({
          data: { partidoId: partido.id, nombre: 'Snapshot', formacionTipo: 'FUTBOL_11' },
        })
      if (tipo === 'Convocatoria')
        await getPrisma().convocatoria.create({
          data: { equipoId: partido.equipoLocalId!, partidoId: partido.id, fecha: new Date() },
        })
      const res = await regenerar(competencia.id)
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('fixture_bloqueado')
    },
  )

  it('audita generación, rechazo de regeneración y edición de jornada sin datos sensibles', async () => {
    const competencia = await crearCompetencia('Auditoria')
    expect((await generar(competencia.id)).statusCode).toBe(200)
    const bloqueado = await getPrisma().partido.findFirstOrThrow({
      where: { torneoCategoriaId: competencia.id },
    })
    await getPrisma().partido.update({
      where: { id: bloqueado.id },
      data: { golesLocal: 0, golesVisitante: 0 },
    })
    expect((await regenerar(competencia.id)).statusCode).toBe(409)
    const fixture = await app.inject({
      method: 'GET',
      url: `/api/torneo-categorias/${competencia.id}/fixture`,
      ...headers(tokenAdmin),
    })
    const jornadaId = fixture.json().data.jornadas[0].id as string
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/jornadas/${jornadaId}`,
          payload: { nombre: 'Fecha editada' },
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    const auditorias = await getPrisma().auditoriaLog.findMany({
      where: { entidadId: competencia.id },
      select: { cambios: true },
    })
    expect(JSON.stringify(auditorias)).not.toMatch(/passwordHash|contraseñ|@test\.dev/)
    const jornadaAudit = await getPrisma().auditoriaLog.findFirst({
      where: { entidad: 'Jornada', entidadId: jornadaId },
    })
    expect(jornadaAudit).not.toBeNull()
  })

  it('publica fixture solo con configuración pública y Partido.publicada', async () => {
    const competencia = await crearCompetencia('Publico')
    const config = await app.inject({
      method: 'PATCH',
      url: `/api/torneos/${competencia.torneoId}`,
      payload: {
        visiblePublico: true,
        configuracionPublica: {
          mostrarInfo: true,
          mostrarCategorias: true,
          mostrarZonas: true,
          mostrarEquipos: true,
          mostrarTabla: true,
          mostrarFixture: true,
          mostrarResultados: true,
          mostrarEstadisticas: false,
          mostrarGoleadores: false,
          mostrarTarjetas: false,
        },
      },
      ...headers(tokenAdmin),
    })
    expect(config.statusCode).toBe(200)
    expect((await generar(competencia.id)).statusCode).toBe(200)
    const privado = await app.inject({
      method: 'GET',
      url: `/api/publico/torneo-categorias/${competencia.id}/fixture`,
    })
    expect(privado.statusCode).toBe(200)
    expect(privado.json().data.jornadas[0].partidos).toHaveLength(0)
    const partido = await getPrisma().partido.findFirstOrThrow({
      where: { torneoCategoriaId: competencia.id },
    })
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/partidos/${partido.id}/publicar`,
          ...headers(tokenAdmin),
        })
      ).statusCode,
    ).toBe(200)
    const publico = await app.inject({
      method: 'GET',
      url: `/api/publico/torneo-categorias/${competencia.id}/fixture`,
    })
    expect(publico.json().data.jornadas[0].partidos).toHaveLength(1)
    await getPrisma().torneo.update({
      where: { id: competencia.torneoId },
      data: { configuracionPublica: { mostrarFixture: false } },
    })
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/publico/torneo-categorias/${competencia.id}/fixture`,
        })
      ).statusCode,
    ).toBe(404)
  })
})
