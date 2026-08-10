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
  torneosVer: 'torneos:ver',
  torneosAdministrar: 'torneos:administrar',
  organizacionesAdministrar: 'organizaciones:administrar',
  usuariosGestionar: 'usuarios:gestionar',
  equiposInscribir: 'equipos:inscribir',
  partidosVer: 'partidos:ver',
  partidosCargarResultados: 'partidos:cargarResultados',
  sancionesGestionar: 'sanciones:gestionar',
  estadisticasVer: 'estadisticas:ver',
  cajaAdministrar: 'caja:administrar',
  convocatoriasVer: 'convocatorias:ver',
  convocatoriasGestionar: 'convocatorias:gestionar',
  formacionesVer: 'formaciones:ver',
  formacionesGestionar: 'formaciones:gestionar',
  global: '*',
} as const

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS]

export const ROL_PERMISOS: Record<RolCodigo, readonly Permiso[]> = {
  SUPERADMIN: [PERMISOS.global],
  ADMINISTRADOR: [
    PERMISOS.organizacionesAdministrar,
    PERMISOS.torneosVer,
    PERMISOS.torneosAdministrar,
    PERMISOS.usuariosGestionar,
    PERMISOS.equiposVer,
    PERMISOS.equiposInscribir,
    PERMISOS.jugadoresVer,
    PERMISOS.partidosVer,
    PERMISOS.partidosCargarResultados,
    PERMISOS.sancionesGestionar,
    PERMISOS.estadisticasVer,
    PERMISOS.convocatoriasVer,
    PERMISOS.formacionesVer,
  ],
  DELEGADO_TECNICO: [
    PERMISOS.equiposAdministrar,
    PERMISOS.equiposVer,
    PERMISOS.equiposInscribir,
    PERMISOS.jugadoresGestionar,
    PERMISOS.jugadoresVer,
    PERMISOS.torneosVer,
    PERMISOS.partidosVer,
    PERMISOS.partidosCargarResultados,
    PERMISOS.sancionesGestionar,
    PERMISOS.estadisticasVer,
    PERMISOS.cajaAdministrar,
    PERMISOS.convocatoriasGestionar,
    PERMISOS.convocatoriasVer,
    PERMISOS.formacionesGestionar,
    PERMISOS.formacionesVer,
    PERMISOS.perfilVer,
  ],
  JUGADOR: [
    PERMISOS.perfilVer,
    PERMISOS.equiposVer,
    PERMISOS.jugadoresVer,
    PERMISOS.torneosVer,
    PERMISOS.estadisticasVer,
    PERMISOS.convocatoriasVer,
    PERMISOS.partidosVer,
    PERMISOS.formacionesVer,
  ],
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
