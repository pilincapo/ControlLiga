import type { AccionAuditoria, Prisma } from '../generated/prisma/client.js'
import type { PrismaClient } from '../generated/prisma/client.js'

interface AuditoriaEntrada {
  entidad: string
  entidadId: string
  accion: AccionAuditoria
  usuarioId?: string | null
  cambios?: Prisma.InputJsonValue
}

export async function auditar(prisma: PrismaClient, entrada: AuditoriaEntrada): Promise<void> {
  await prisma.auditoriaLog.create({
    data: {
      entidad: entrada.entidad,
      entidadId: entrada.entidadId,
      accion: entrada.accion,
      usuarioId: entrada.usuarioId ?? null,
      cambios: entrada.cambios,
    },
  })
}
