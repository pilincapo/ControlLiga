import type { ApiResponse } from '@controlliga/shared'
import type { FastifyInstance } from 'fastify'
import { getPrisma } from '../db.js'

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
    try {
      await getPrisma().$queryRaw`SELECT 1`
      return { data: { database: 'connected' } } satisfies ApiResponse<{ database: string }>
    } catch (error) {
      request.log.error(error)
      return reply.status(503).send({ error: 'database unreachable' })
    }
  })
}
