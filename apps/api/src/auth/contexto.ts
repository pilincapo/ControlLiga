import { ES_SUPERADMIN, PERMISOS, ROL_PERMISOS } from '@controlliga/shared'
import type { Permiso, RolCodigo, RolUsuarioSesion, UsuarioSesion } from '@controlliga/shared'
import type { Prisma } from '../generated/prisma/client.js'

export const INCLUDE_USUARIO_SESION = {
  roles: {
    include: { rol: true },
    where: { activo: true },
  },
  equipos: {
    include: { equipo: { select: { id: true, nombre: true } } },
    where: { activo: true },
  },
} satisfies Prisma.UsuarioInclude

export type UsuarioSesionPayload = Prisma.UsuarioGetPayload<{ include: typeof INCLUDE_USUARIO_SESION }>

export interface ContextoAuth {
  usuarioId: string
  email: string
  nombre: string
  apellido: string
  jugadorId: string | null
  roles: RolUsuarioSesion[]
  permisos: Permiso[]
}

export function calcularPermisos(roles: RolUsuarioSesion[]): Permiso[] {
  const permisos = new Set<Permiso>()
  for (const { codigo } of roles) {
    for (const permiso of ROL_PERMISOS[codigo]) {
      permisos.add(permiso)
    }
  }
  if (ES_SUPERADMIN(roles)) {
    permisos.add(PERMISOS.global)
  }
  return [...permisos]
}

export function aContextoAuth(usuario: UsuarioSesionPayload): ContextoAuth {
  const roles: RolUsuarioSesion[] = usuario.roles.map((ru) => ({
    codigo: ru.rol.codigo as RolCodigo,
    organizacionId: ru.organizacionId,
    torneoId: ru.torneoId,
    equipoId: ru.equipoId,
  }))
  return {
    usuarioId: usuario.id,
    email: usuario.email,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    jugadorId: usuario.jugadorId,
    roles,
    permisos: calcularPermisos(roles),
  }
}

export function aUsuarioSesion(usuario: UsuarioSesionPayload): UsuarioSesion {
  const contexto = aContextoAuth(usuario)
  return {
    ...contexto,
    id: contexto.usuarioId,
    equipos: usuario.equipos.map((eu) => ({
      equipoId: eu.equipo.id,
      nombre: eu.equipo.nombre,
      rolEnEquipo: eu.rolEnEquipo,
    })),
  }
}
