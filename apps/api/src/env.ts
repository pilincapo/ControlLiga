import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Falta la variable de entorno: ${name}`)
  }
  return value
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  HOST: process.env.HOST ?? '0.0.0.0',
  PORT: Number(process.env.PORT ?? 3000),
  DATABASE_URL: required('DATABASE_URL'),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  COOKIE_SECURE: (process.env.COOKIE_SECURE ?? 'false') === 'true',
  SESSION_COOKIE_NAME: process.env.SESSION_COOKIE_NAME ?? 'cl_session',
  SESSION_TTL_MS: Number(process.env.SESSION_TTL_MS ?? 7 * 24 * 60 * 60 * 1000),
  PASSWORD_RESET_TTL_MINUTES: Number(process.env.PASSWORD_RESET_TTL_MINUTES ?? 60),
  PASSWORD_RESET_URL_BASE: process.env.PASSWORD_RESET_URL_BASE ?? 'http://localhost:5173/reset-password',
  EMAIL_FROM: process.env.EMAIL_FROM ?? 'no-reply@controlliga.local',
  PASSWORD_RATE_LIMIT_MAX: Number(process.env.PASSWORD_RATE_LIMIT_MAX ?? 5),
  PASSWORD_RATE_LIMIT_WINDOW_MS: Number(process.env.PASSWORD_RATE_LIMIT_WINDOW_MS ?? 15 * 60 * 1000),
  INVITACION_TTL_HORAS: Number(process.env.INVITACION_TTL_HORAS ?? 168),
}
