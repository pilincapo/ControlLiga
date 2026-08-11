import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Falta la variable de entorno: ${name}`)
  }
  return value
}

function numeroPositivo(name: string, valor: string | undefined, defecto: number): number {
  const numero = Number(valor ?? defecto)
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error(`La variable ${name} debe ser un número positivo`)
  }
  return numero
}

function trustProxy(valor: string | undefined): string[] | number | false {
  const limpio = valor?.trim()
  if (!limpio) return false
  if (/^\d+$/.test(limpio)) return Number(limpio)
  return limpio.split(',').map((ip) => ip.trim()).filter(Boolean)
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  HOST: process.env.HOST ?? '0.0.0.0',
  PORT: numeroPositivo('PORT', process.env.PORT, 3000),
  DATABASE_URL: required('DATABASE_URL'),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  COOKIE_SECURE: (process.env.COOKIE_SECURE ?? 'false') === 'true',
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME ?? 'cl_session',
  SESSION_TTL_MS: numeroPositivo('SESSION_TTL_MS', process.env.SESSION_TTL_MS, 7 * 24 * 60 * 60 * 1000),
  PASSWORD_RESET_TTL_MINUTES: numeroPositivo('PASSWORD_RESET_TTL_MINUTES', process.env.PASSWORD_RESET_TTL_MINUTES, 60),
  PASSWORD_RESET_URL_BASE: process.env.PASSWORD_RESET_URL_BASE ?? 'http://localhost:5173/reset-password',
  EMAIL_FROM: process.env.EMAIL_FROM ?? 'no-reply@controlliga.local',
  HEALTH_DB_TOKEN: process.env.HEALTH_DB_TOKEN ?? '',
  PASSWORD_RATE_LIMIT_MAX: numeroPositivo('PASSWORD_RATE_LIMIT_MAX', process.env.PASSWORD_RATE_LIMIT_MAX, 5),
  PASSWORD_RATE_LIMIT_WINDOW_MS: numeroPositivo('PASSWORD_RATE_LIMIT_WINDOW_MS', process.env.PASSWORD_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  LOGIN_RATE_LIMIT_MAX: numeroPositivo('LOGIN_RATE_LIMIT_MAX', process.env.LOGIN_RATE_LIMIT_MAX, 10),
  LOGIN_RATE_LIMIT_WINDOW_MS: numeroPositivo('LOGIN_RATE_LIMIT_WINDOW_MS', process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  LOGIN_IP_RATE_LIMIT_MAX: numeroPositivo('LOGIN_IP_RATE_LIMIT_MAX', process.env.LOGIN_IP_RATE_LIMIT_MAX, 100),
  INVITACION_TTL_HORAS: numeroPositivo('INVITACION_TTL_HORAS', process.env.INVITACION_TTL_HORAS, 168),
  TRUST_PROXY: trustProxy(process.env.TRUST_PROXY),
}

if (env.NODE_ENV === 'production') {
  const origenes = env.CORS_ORIGIN.split(',').map((origen) => origen.trim())
  if (!env.COOKIE_SECURE) throw new Error('COOKIE_SECURE debe ser true en producción')
  if (!origenes.length || origenes.some((origen) => !origen.startsWith('https://') || origen.includes('*'))) {
    throw new Error('CORS_ORIGIN debe contener orígenes HTTPS exactos en producción')
  }
  if (!env.PASSWORD_RESET_URL_BASE.startsWith('https://')) {
    throw new Error('PASSWORD_RESET_URL_BASE debe usar HTTPS en producción')
  }
  if (env.EMAIL_FROM.endsWith('.local')) {
    throw new Error('EMAIL_FROM debe ser un remitente real en producción')
  }
  if (env.HEALTH_DB_TOKEN.length < 24) {
    throw new Error('HEALTH_DB_TOKEN debe tener al menos 24 caracteres en producción')
  }
}
