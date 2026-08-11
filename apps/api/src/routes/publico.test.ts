import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'

const inexistente = '00000000-0000-0000-0000-000000000000'

describe('portal público HTTP (FASE 11)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it.each([
    ['/api/publico/torneos', 200],
    ['/api/publico/equipos', 200],
    ['/api/publico/partidos', 200],
    ['/api/publico/formaciones', 200],
    ['/api/publico/convocatorias', 200],
    [`/api/publico/torneos/${inexistente}`, 404],
    [`/api/publico/torneos/${inexistente}/temporadas`, 404],
    [`/api/publico/temporadas/${inexistente}/categorias`, 404],
    [`/api/publico/torneo-categorias/${inexistente}/zonas`, 404],
    [`/api/publico/torneo-categorias/${inexistente}/fixture`, 404],
    [`/api/publico/torneo-categorias/${inexistente}/fixture?zonaId=${inexistente}`, 404],
    [`/api/publico/torneo-categorias/${inexistente}/tabla`, 404],
    [`/api/publico/torneo-categorias/${inexistente}/tabla?zonaId=${inexistente}`, 404],
    [`/api/publico/zonas/${inexistente}/fixture`, 404],
    [`/api/publico/zonas/${inexistente}/tabla`, 404],
    [`/api/publico/torneo-categorias/${inexistente}/estadisticas`, 404],
    [`/api/publico/torneo-categorias/${inexistente}/goleadores`, 404],
    [`/api/publico/torneo-categorias/${inexistente}/tarjetas`, 404],
    [`/api/publico/partidos/${inexistente}`, 404],
    [`/api/publico/partidos/${inexistente}/estadisticas`, 404],
    [`/api/publico/equipos/${inexistente}`, 404],
    [`/api/publico/formaciones/${inexistente}`, 404],
    [`/api/publico/convocatorias/${inexistente}`, 404],
    [`/api/publico/caja/${inexistente}`, 404],
    ['/api/publico/caja', 404],
  ])('escenario %s respeta publicación y privacidad', async (url, esperado) => {
    const response = await app.inject({ method: 'GET', url })
    expect(response.statusCode).toBe(esperado)
    expect(response.body).not.toContain('dni')
    expect(response.body).not.toContain('passwordHash')
  })
})
