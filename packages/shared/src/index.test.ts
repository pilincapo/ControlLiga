import { describe, expect, it } from 'vitest'
import { ApiError, sleep } from './index.js'

describe('shared', () => {
  it('ApiError guarda status y mensaje', () => {
    const err = new ApiError(404, 'no encontrado')
    expect(err.status).toBe(404)
    expect(err.message).toBe('no encontrado')
  })

  it('sleep resuelve tras el tiempo pedido', async () => {
    await expect(sleep(1)).resolves.toBeUndefined()
  })
})
