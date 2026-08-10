import { ES_SUPERADMIN } from '@controlliga/shared'
import type { ContextoAuth } from './contexto.js'
import type { PrismaClient } from '../generated/prisma/client.js'

export function esSuperadmin(contexto: ContextoAuth): boolean {
  return ES_SUPERADMIN(contexto.roles)
}

export function esAdministradorOrganizacion(contexto: ContextoAuth, organizacionId: string): boolean {
  return (
    esSuperadmin(contexto) ||
    contexto.roles.some(
      (r) =>
        r.codigo === 'ADMINISTRADOR' &&
        (r.organizacionId === null || r.organizacionId === organizacionId),
    )
  )
}

export function esAdministradorTorneo(
  contexto: ContextoAuth,
  torneo: { id: string; organizacionId: string | null },
): boolean {
  return (
    esSuperadmin(contexto) ||
    contexto.roles.some(
      (r) =>
        r.codigo === 'ADMINISTRADOR' &&
        (r.torneoId === torneo.id || (torneo.organizacionId !== null && r.organizacionId === torneo.organizacionId)),
    )
  )
}

export async function esMiembroEquipo(
  prisma: PrismaClient,
  contexto: ContextoAuth,
  equipoId: string,
): Promise<boolean> {
  if (esSuperadmin(contexto)) {
    return true
  }
  const membresia = await prisma.equipoUsuario.findFirst({
    where: { usuarioId: contexto.usuarioId, equipoId, activo: true },
    select: { id: true },
  })
  return membresia !== null
}

export function esElJugador(contexto: ContextoAuth, jugadorId: string): boolean {
  return contexto.jugadorId === jugadorId
}

export async function equiposDelJugador(
  prisma: PrismaClient,
  jugadorId: string,
): Promise<Array<{ equipoId: string }>> {
  const filas = await prisma.equipoJugador.findMany({
    where: { jugadorId, activo: true },
    select: { equipoId: true },
  })
  return filas
}

export async function esDelegadoDelJugador(
  prisma: PrismaClient,
  contexto: ContextoAuth,
  jugadorId: string,
): Promise<boolean> {
  const equipos = await equiposDelJugador(prisma, jugadorId)
  if (equipos.length === 0) {
    return false
  }
  const count = await prisma.equipoUsuario.count({
    where: {
      usuarioId: contexto.usuarioId,
      activo: true,
      equipoId: { in: equipos.map((e) => e.equipoId) },
    },
  })
  return count > 0
}
