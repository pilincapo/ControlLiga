import { describe, expect, it } from 'vitest'
import { resolveApiUrl } from './api'

describe('resolveApiUrl', () => {
  it('devuelve /api por defecto', () => {
    expect(resolveApiUrl(undefined)).toBe('/api')
  })

  it('devuelve la URL configurada', () => {
    expect(resolveApiUrl('http://localhost:3000')).toBe('http://localhost:3000')
  })
})
