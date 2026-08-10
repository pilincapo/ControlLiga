import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import Fastify from 'fastify'
import type { FastifyError } from 'fastify'
import { authPlugin } from './plugins/auth.js'
import { env } from './env.js'
import { HttpError } from './http.js'
import { healthRoutes } from './routes/health.js'
import { authRoutes } from './routes/auth.js'
import { usuariosRoutes } from './routes/usuarios.js'
import { equiposRoutes } from './routes/equipos.js'
import { jugadoresRoutes } from './routes/jugadores.js'
import { organizacionesRoutes } from './routes/organizaciones.js'

export function buildApp() {
  const app = Fastify({ logger: true })

  const origins = env.CORS_ORIGIN.split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0)

  app.register(cors, {
    origin: origins,
    credentials: true,
  })
  app.register(cookie)

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.status).send({
        error: { code: error.code, message: error.message },
      })
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({
        error: { code: 'solicitud_invalida', message: error.message },
      })
    }
    request.log.error(error)
    return reply.status(500).send({
      error: { code: 'error_interno', message: 'Ocurrió un error interno' },
    })
  })

  app.register(authPlugin)
  app.register(healthRoutes, { prefix: '/api' })
  app.register(authRoutes, { prefix: '/api' })
  app.register(usuariosRoutes, { prefix: '/api' })
  app.register(equiposRoutes, { prefix: '/api' })
  app.register(jugadoresRoutes, { prefix: '/api' })
  app.register(organizacionesRoutes, { prefix: '/api' })

  return app
}
