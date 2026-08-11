import { env } from '../env.js'

export interface RateLimiter {
  permitir(clave: string): boolean
}

export class RateLimiterMemoria implements RateLimiter {
  private readonly intentos = new Map<string, number[]>()

  limpiar(): void {
    this.intentos.clear()
  }

  permitir(clave: string): boolean {
    const ahora = Date.now()
    const inicio = ahora - env.PASSWORD_RATE_LIMIT_WINDOW_MS
    const vigentes = (this.intentos.get(clave) ?? []).filter((fecha) => fecha > inicio)
    if (vigentes.length >= env.PASSWORD_RATE_LIMIT_MAX) {
      this.intentos.set(clave, vigentes)
      return false
    }
    vigentes.push(ahora)
    this.intentos.set(clave, vigentes)
    return true
  }
}

export const passwordRateLimiter = new RateLimiterMemoria()
