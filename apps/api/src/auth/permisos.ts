import { ES_SUPERADMIN } from '@controlliga/shared'
import type { RolEnEquipo } from '@controlliga/shared'
import type { ContextoAuth } from './contexto.js'
import type { PrismaClient } from '../generated/prisma/client.js'
import { EstadoEquipoJugador } from '../generated/prisma/enums.js'
import { prohibido } from '../http.js'

export const ESTADOS_EQUIPOJUGADOR_CONFIRMADOS: EstadoEquipoJugador[] = [
  EstadoEquipoJugador.ACTIVO,
  EstadoEquipoJugador.INACTIVO,
  EstadoEquipoJugador.LESIONADO,
  EstadoEquipoJugador.SUSPENDIDO,
]

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

export async function esAdminDeTorneo(
  prisma: PrismaClient,
  contexto: ContextoAuth,
  torneoId: string,
): Promise<boolean> {
  if (esSuperadmin(contexto)) {
    return true
  }
  const torneo = await prisma.torneo.findUnique({
    where: { id: torneoId },
    select: { id: true, organizacionId: true },
  })
  if (!torneo) {
    return false
  }
  return esAdministradorTorneo(contexto, torneo)
}

export async function puedeVerTorneo(
  prisma: PrismaClient,
  contexto: ContextoAuth,
  torneoId: string,
): Promise<boolean> {
  if (esSuperadmin(contexto)) {
    return true
  }
  const torneo = await prisma.torneo.findUnique({
    where: { id: torneoId },
    select: { id: true, organizacionId: true },
  })
  if (!torneo) {
    return false
  }
  if (esAdministradorTorneo(contexto, torneo)) {
    return true
  }
  if (!contexto.roles.some((r) => r.codigo === 'DELEGADO_TECNICO' || r.codigo === 'JUGADOR')) {
    return false
  }
  const equipos = await prisma.equipoUsuario.findMany({
    where: { usuarioId: contexto.usuarioId, activo: true },
    select: { equipoId: true },
  })
  const equipoIds = new Set(equipos.map((e) => e.equipoId))
  if (contexto.jugadorId) {
    const pertenencias = await prisma.equipoJugador.findMany({
      where: { jugadorId: contexto.jugadorId, estado: { not: EstadoEquipoJugador.BAJA } },
      select: { equipoId: true },
    })
    pertenencias.forEach((p) => equipoIds.add(p.equipoId))
  }
  if (equipoIds.size === 0) {
    return false
  }
  const participacion = await prisma.equipoParticipacion.findFirst({
    where: {
      torneoId,
      equipoId: { in: [...equipoIds] },
      estado: { in: ['PENDIENTE', 'INSCRIPTO', 'CONFIRMADO'] },
    },
    select: { id: true },
  })
  return participacion !== null
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

export async function puedeVerEquipo(
  prisma: PrismaClient,
  contexto: ContextoAuth,
  equipoId: string,
): Promise<boolean> {
  if (esSuperadmin(contexto) || (await esMiembroEquipo(prisma, contexto, equipoId))) {
    return true
  }
  const organzacionEquipo = await prisma.equipoParticipacion.findFirst({
    where: { equipoId, estado: { in: ['PENDIENTE', 'INSCRIPTO', 'CONFIRMADO'] } },
    select: { torneo: { select: { organizacionId: true } } },
  })
  if (organzacionEquipo?.torneo.organizacionId && esAdministradorOrganizacion(contexto, organzacionEquipo.torneo.organizacionId)) {
    return true
  }
  if (!contexto.jugadorId) {
    return false
  }
  return (
    (await prisma.equipoJugador.findFirst({
      where: {
        equipoId,
        jugadorId: contexto.jugadorId,
        estado: { in: ESTADOS_EQUIPOJUGADOR_CONFIRMADOS },
      },
      select: { id: true },
    })) !== null
  )
}

export async function puedeEnEquipo(
  prisma: PrismaClient,
  contexto: ContextoAuth,
  equipoId: string,
  ...roles: RolEnEquipo[]
): Promise<boolean> {
  if (esSuperadmin(contexto)) {
    return true
  }
  const membresia = await prisma.equipoUsuario.findFirst({
    where: { usuarioId: contexto.usuarioId, equipoId, activo: true, rolEnEquipo: { in: roles } },
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
    where: { jugadorId, estado: { not: EstadoEquipoJugador.BAJA } },
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

type AsignacionRol = {
  codigo: 'SUPERADMIN' | 'ADMINISTRADOR' | 'DELEGADO_TECNICO' | 'JUGADOR'
  organizacionId?: string | null
  torneoId?: string | null
  equipoId?: string | null
  jugadorId?: string | null
}

async function organizacionDeScope(prisma: PrismaClient, rol: AsignacionRol): Promise<string | null> {
  if (rol.organizacionId) {
    return rol.organizacionId
  }
  if (rol.torneoId) {
    const torneo = await prisma.torneo.findUnique({
      where: { id: rol.torneoId },
      select: { organizacionId: true },
    })
    return torneo?.organizacionId ?? null
  }
  return null
}

function tieneScopeInvalido(rol: AsignacionRol): boolean {
  const scopes = [rol.organizacionId, rol.torneoId, rol.equipoId, rol.jugadorId].filter(Boolean)
  if (rol.codigo === 'SUPERADMIN') {
    return scopes.length > 0
  }
  if (rol.codigo === 'ADMINISTRADOR') {
    return scopes.length !== 1 || Boolean(rol.equipoId || rol.jugadorId)
  }
  if (rol.codigo === 'JUGADOR') {
    return scopes.length > 0
  }
  return scopes.length > 0
}

export async function puedeAsignarRoles(
  prisma: PrismaClient,
  actor: ContextoAuth,
  usuarioObjetivoId: string,
  rolesActuales: AsignacionRol[],
  rolesObjetivo: AsignacionRol[],
): Promise<void> {
  if (actor.usuarioId === usuarioObjetivoId) {
    throw prohibido('No podés modificar tus propios roles')
  }
  if (rolesObjetivo.some(tieneScopeInvalido)) {
    throw prohibido('El alcance del rol no es válido')
  }
  if (esSuperadmin(actor)) {
    return
  }
  const organizacionesActor = new Set(
    actor.roles
      .filter((rol) => rol.codigo === 'ADMINISTRADOR' && rol.organizacionId)
      .map((rol) => rol.organizacionId!),
  )
  if (organizacionesActor.size === 0) {
    throw prohibido('No tenés permiso para administrar roles')
  }
  const roles = [...rolesActuales, ...rolesObjetivo]
  for (const rol of roles) {
    if (rol.codigo === 'SUPERADMIN' || rol.codigo === 'DELEGADO_TECNICO') {
      throw prohibido('No tenés permiso para administrar ese rol')
    }
    if (rol.codigo === 'JUGADOR') {
      continue
    }
    const organizacionId = await organizacionDeScope(prisma, rol)
    if (!organizacionId || !organizacionesActor.has(organizacionId)) {
      throw prohibido('No podés administrar roles fuera de tu organización')
    }
  }
}
