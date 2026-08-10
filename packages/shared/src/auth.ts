export const ROLES = ['SUPERADMIN', 'ADMINISTRADOR', 'DELEGADO_TECNICO', 'JUGADOR'] as const

export type RolCodigo = (typeof ROLES)[number]

export const ROL_PUBLICO = 'PUBLICO' as const

export const ROLES_POR_EQUIPO = ['DELEGADO', 'TECNICO', 'AUXILIAR'] as const

export type RolEnEquipo = (typeof ROLES_POR_EQUIPO)[number]

export const PERMISOS = {
  perfilVer: 'perfil:ver',
  equiposVer: 'equipos:ver',
  equiposAdministrar: 'equipos:administrar',
  jugadoresVer: 'jugadores:ver',
  jugadoresGestionar: 'jugadores:gestionar',
  torneosAdministrar: 'torneos:administrar',
  organizacionesAdministrar: 'organizaciones:administrar',
  usuariosGestionar: 'usuarios:gestionar',
  cajaAdministrar: 'caja:administrar',
  convocatoriasVer: 'convocatorias:ver',
  convocatoriasGestionar: 'convocatorias:gestionar',
  formacionesGestionar: 'formaciones:gestionar',
  partidosVer: 'partidos:ver',
  global: '*',
} as const

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS]

export const ROL_PERMISOS: Record<RolCodigo, readonly Permiso[]> = {
  SUPERADMIN: [PERMISOS.global],
  ADMINISTRADOR: [
    PERMISOS.organizacionesAdministrar,
    PERMISOS.torneosAdministrar,
    PERMISOS.usuariosGestionar,
    PERMISOS.equiposVer,
    PERMISOS.jugadoresVer,
    PERMISOS.convocatoriasVer,
    PERMISOS.partidosVer,
  ],
  DELEGADO_TECNICO: [
    PERMISOS.equiposAdministrar,
    PERMISOS.equiposVer,
    PERMISOS.jugadoresGestionar,
    PERMISOS.jugadoresVer,
    PERMISOS.cajaAdministrar,
    PERMISOS.convocatoriasGestionar,
    PERMISOS.convocatoriasVer,
    PERMISOS.formacionesGestionar,
    PERMISOS.partidosVer,
    PERMISOS.perfilVer,
  ],
  JUGADOR: [PERMISOS.perfilVer, PERMISOS.equiposVer, PERMISOS.jugadoresVer, PERMISOS.convocatoriasVer, PERMISOS.partidosVer],
}

export interface RolUsuarioSesion {
  codigo: RolCodigo
  organizacionId: string | null
  torneoId: string | null
  equipoId: string | null
}

export interface EquipoUsuarioSesion {
  equipoId: string
  nombre: string
  rolEnEquipo: RolEnEquipo
}

export interface UsuarioSesion {
  id: string
  email: string
  nombre: string
  apellido: string
  jugadorId: string | null
  roles: RolUsuarioSesion[]
  equipos: EquipoUsuarioSesion[]
  permisos: Permiso[]
}

export const ES_SUPERADMIN = (roles: RolUsuarioSesion[]): boolean => roles.some((r) => r.codigo === 'SUPERADMIN')
