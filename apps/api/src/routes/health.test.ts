import { describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'

describe('health route', () => {
  it('responde ok con status y uptime', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.status).toBe('ok')
    expect(typeof res.json().data.uptime).toBe('number')
    await app.close()
  })
})
