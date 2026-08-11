import { env } from '../env.js'

export interface RateLimiter {
  permitir(clave: string): boolean
}

export class RateLimiterMemoria implements RateLimiter {
  private readonly intentos = new Map<string, number[]>()

  constructor(
    private readonly maximo = env.PASSWORD_RATE_LIMIT_MAX,
    private readonly ventanaMs = env.PASSWORD_RATE_LIMIT_WINDOW_MS,
    private readonly maximoClaves = 10_000,
  ) {}

  limpiar(): void {
    this.intentos.clear()
  }

  permitir(clave: string): boolean {
    const ahora = Date.now()
    const inicio = ahora - this.ventanaMs
    const vigentes = (this.intentos.get(clave) ?? []).filter((fecha) => fecha > inicio)
    if (vigentes.length >= this.maximo) {
      this.intentos.set(clave, vigentes)
      return false
    }
    if (!this.intentos.has(clave) && this.intentos.size >= this.maximoClaves) {
      const primera = this.intentos.keys().next().value
      if (primera) this.intentos.delete(primera)
    }
    vigentes.push(ahora)
    this.intentos.set(clave, vigentes)
    return true
  }
}

export const passwordRateLimiter = new RateLimiterMemoria()
export const loginRateLimiter = new RateLimiterMemoria(
  env.LOGIN_RATE_LIMIT_MAX,
  env.LOGIN_RATE_LIMIT_WINDOW_MS,
)
export const loginIpRateLimiter = new RateLimiterMemoria(
  env.LOGIN_IP_RATE_LIMIT_MAX,
  env.LOGIN_RATE_LIMIT_WINDOW_MS,
)
