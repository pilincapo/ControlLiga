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
import { invitacionesRoutes } from './routes/invitaciones.js'
import { notificacionesRoutes } from './routes/notificaciones.js'
import { jugadoresRoutes } from './routes/jugadores.js'
import { equipoJugadoresRoutes } from './routes/equipo-jugadores.js'
import { organizacionesRoutes } from './routes/organizaciones.js'
import { torneosRoutes } from './routes/torneos.js'
import { temporadasRoutes } from './routes/temporadas.js'
import { torneoCategoriasRoutes } from './routes/torneo-categorias.js'
import { zonasRoutes } from './routes/zonas.js'
import { participacionesRoutes } from './routes/participaciones.js'
import { jugadorParticipacionesRoutes } from './routes/jugador-participaciones.js'
import { formacionesRoutes } from './routes/formaciones.js'
import { convocatoriasRoutes } from './routes/convocatorias.js'
import { partidosRoutes } from './routes/partidos.js'
import { fixtureRoutes } from './routes/fixture.js'
import { eventosPartidoRoutes } from './routes/eventos-partido.js'
import { cajaRoutes } from './routes/caja.js'
import { publicoRoutes } from './routes/publico.js'

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
  app.register(invitacionesRoutes, { prefix: '/api' })
  app.register(notificacionesRoutes, { prefix: '/api' })
  app.register(jugadoresRoutes, { prefix: '/api' })
  app.register(equipoJugadoresRoutes, { prefix: '/api' })
  app.register(organizacionesRoutes, { prefix: '/api' })
  app.register(torneosRoutes, { prefix: '/api' })
  app.register(temporadasRoutes, { prefix: '/api' })
  app.register(torneoCategoriasRoutes, { prefix: '/api' })
  app.register(zonasRoutes, { prefix: '/api' })
  app.register(participacionesRoutes, { prefix: '/api' })
  app.register(jugadorParticipacionesRoutes, { prefix: '/api' })
  app.register(formacionesRoutes, { prefix: '/api' })
  app.register(convocatoriasRoutes, { prefix: '/api' })
  app.register(partidosRoutes, { prefix: '/api' })
  app.register(fixtureRoutes, { prefix: '/api' })
  app.register(eventosPartidoRoutes, { prefix: '/api' })
  app.register(cajaRoutes, { prefix: '/api' })
  app.register(publicoRoutes, { prefix: '/api' })

  return app
}
