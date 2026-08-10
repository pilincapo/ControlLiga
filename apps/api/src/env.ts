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
}
