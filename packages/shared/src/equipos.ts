export const POSICIONES_BASE = ['ARQUERO', 'DEFENSOR', 'MEDIOCAMPISTA', 'DELANTERO'] as const
export type PosicionBase = (typeof POSICIONES_BASE)[number]

export const ESTADOS_EQUIPO = ['ACTIVO', 'INACTIVO', 'ARCHIVADO'] as const
export type EstadoEquipo = (typeof ESTADOS_EQUIPO)[number]

export const ESTADOS_EQUIPO_JUGADOR = ['ACTIVO', 'INACTIVO', 'LESIONADO', 'SUSPENDIDO', 'INVITADO', 'BAJA'] as const
export type EstadoEquipoJugador = (typeof ESTADOS_EQUIPO_JUGADOR)[number]

export const CLAVES_CONFIGURACION_PUBLICA_EQUIPO = [
  'mostrarNombre',
  'mostrarEscudo',
  'mostrarPlantel',
  'mostrarContacto',
] as const

export interface ConfiguracionPublicaEquipo {
  mostrarNombre: boolean
  mostrarEscudo: boolean
  mostrarPlantel: boolean
  mostrarContacto: boolean
}

export const CONFIGURACION_PUBLICA_EQUIPO_DEFECTO: ConfiguracionPublicaEquipo = {
  mostrarNombre: true,
  mostrarEscudo: true,
  mostrarPlantel: false,
  mostrarContacto: false,
}

export function validarConfiguracionPublicaEquipo(v: unknown): v is ConfiguracionPublicaEquipo {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return false
  }
  const c = v as Record<string, unknown>
  return (CLAVES_CONFIGURACION_PUBLICA_EQUIPO as readonly string[]).every((k) => typeof c[k] === 'boolean')
}

export const esPosicionBase = (v: unknown): v is PosicionBase =>
  typeof v === 'string' && (POSICIONES_BASE as readonly string[]).includes(v)
