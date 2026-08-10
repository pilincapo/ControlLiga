import type { ContextoAuth } from '../auth/contexto.js'

declare module 'fastify' {
  interface FastifyRequest {
    auth?: ContextoAuth | null
  }
}
