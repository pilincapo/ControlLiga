import type { Prisma } from '../generated/prisma/client.js'
import { TipoInvitacion } from '../generated/prisma/enums.js'
import { env } from '../env.js'
import { auditar } from '../auth/auditoria.js'

export type Tx = Prisma.TransactionClient

export interface InvitacionPendiente {
  id: string
  tipo: TipoInvitacion
  estado: string
  jugadorId: string | null
  equipoId: string
  expiraEn: Date | null
}

export function ttlInvitacionMs(): number {
  return env.INVITACION_TTL_HORAS * 60 * 60 * 1000
}

export function expirada(inv: { expiraEn: Date | null }): boolean {
  return inv.expiraEn !== null && inv.expiraEn < new Date()
}

export async function marcarExpiradasLazy(
  tx: Tx,
  pendientes: InvitacionPendiente[],
): Promise<string[]> {
  const ahora = new Date()
  const expiradas = pendientes.filter((p) => p.estado === 'PENDIENTE' && expirada(p))
  for (const inv of expiradas) {
    await tx.invitacion.update({
      where: { id: inv.id },
      data: { estado: 'EXPIRADA' },
    })
    if (inv.tipo === TipoInvitacion.JUGADOR && inv.jugadorId) {
      const ej = await tx.equipoJugador.findFirst({
        where: { equipoId: inv.equipoId, jugadorId: inv.jugadorId, estado: 'INVITADO' },
        select: { id: true },
      })
      if (ej) {
        await tx.equipoJugador.update({
          where: { id: ej.id },
          data: { estado: 'BAJA', fechaSalida: ahora, motivoBaja: 'invitación expirada' },
        })
      }
    }
    await auditar(tx, {
      entidad: 'Invitacion',
      entidadId: inv.id,
      accion: 'UPDATE',
      cambios: { estadoResultante: 'EXPIRADA' },
    })
  }
  return expiradas.map((e) => e.id)
}
