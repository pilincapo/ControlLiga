import type { FastifyInstance } from 'fastify'
import { getPrisma } from '../db.js'
import { noEncontrado } from '../http.js'
import { autenticar, getAuth } from '../plugins/auth.js'

export async function notificacionesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/notificaciones', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const query = request.query as { leidas?: string; limite?: string; desdeId?: string }
    const prisma = getPrisma()
    const soloNoLeidas = query.leidas === 'false'
    const soloLeidas = query.leidas === 'true'
    const limite = Math.min(Math.max(Number(query.limite ?? 30), 1), 100)
    const where: { usuarioId: string; leidaAt?: { not: null } | null; createdAt?: { lt: Date } } = {
      usuarioId: auth.usuarioId,
      ...(soloNoLeidas ? { leidaAt: null } : soloLeidas ? { leidaAt: { not: null } } : {}),
    }
    if (query.desdeId) {
      const cursor = await prisma.notificacion.findFirst({
        where: { id: query.desdeId, usuarioId: auth.usuarioId },
        select: { createdAt: true },
      })
      if (cursor) where.createdAt = { lt: cursor.createdAt }
    }
    const filas = await prisma.notificacion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limite + 1,
    })
    const data = filas.slice(0, limite)
    return { data, hasMore: filas.length > limite }
  })

  app.get('/notificaciones/no-leidas', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const count = await getPrisma().notificacion.count({ where: { usuarioId: auth.usuarioId, leidaAt: null } })
    return { data: { count } }
  })

  app.post('/notificaciones/leer-todas', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const res = await getPrisma().notificacion.updateMany({
      where: { usuarioId: auth.usuarioId, leidaAt: null },
      data: { leidaAt: new Date() },
    })
    return { data: { marcadas: res.count } }
  })

  app.post('/notificaciones/:id/leida', { preHandler: autenticar }, async (request) => {
    const auth = getAuth(request)
    const { id } = request.params as { id: string }
    const prisma = getPrisma()
    const notif = await prisma.notificacion.findFirst({ where: { id, usuarioId: auth.usuarioId }, select: { id: true, leidaAt: true } })
    if (!notif) throw noEncontrado('Notificación')
    const actualizada =
      notif.leidaAt === null
        ? await prisma.notificacion.update({ where: { id }, data: { leidaAt: new Date() }, select: { id: true, leidaAt: true } })
        : notif
    return { data: actualizada }
  })
}
