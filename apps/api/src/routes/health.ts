import type { ApiResponse } from '@controlliga/shared'
import type { FastifyInstance } from 'fastify'
import { getPrisma } from '../db.js'
import { env } from '../env.js'

interface HealthStatus {
  status: string
  uptime: number
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const response: ApiResponse<HealthStatus> = {
      data: { status: 'ok', uptime: process.uptime() },
    }
    return response
  })

  app.get('/health/db', async (request, reply) => {
    if (env.NODE_ENV === 'production' && request.headers['x-health-token'] !== env.HEALTH_DB_TOKEN) {
      return reply.status(404).send()
    }
    try {
      await getPrisma().$queryRaw`SELECT 1`
      return { data: { database: 'connected' } } satisfies ApiResponse<{ database: string }>
    } catch {
      request.log.error({ codigo: 'health_db_unreachable' }, 'database health check failed')
      return reply.status(503).send({ error: 'database unreachable' })
    }
  })
}
