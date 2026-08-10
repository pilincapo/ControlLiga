export const FORMATOS_COMPETENCIA = [
  'TODOS_CONTRA_TODOS',
  'UNA_RUEDA',
  'DOS_RUEDAS',
  'FASE_DE_GRUPOS',
  'GRUPOS_PLAYOFFS',
  'ELIMINACION_DIRECTA',
  'LIGA_FASE_FINAL',
  'FASE_REGULAR_PLAYOFFS',
] as const

export type FormatoCompetencia = (typeof FORMATOS_COMPETENCIA)[number]

export function esFormatoCompetencia(v: unknown): v is FormatoCompetencia {
  return typeof v === 'string' && (FORMATOS_COMPETENCIA as readonly string[]).includes(v)
}

export const ESTADOS_TORNEO = ['BORRADOR', 'INSCRIPCIONES', 'ACTIVO', 'FINALIZADO', 'ARCHIVADO'] as const
export type EstadoTorneo = (typeof ESTADOS_TORNEO)[number]

export const ESTADOS_TEMPORADA = ['BORRADOR', 'PUBLICADO', 'EN_CURSO', 'FINALIZADO', 'CANCELADO'] as const
export type EstadoTemporada = (typeof ESTADOS_TEMPORADA)[number]

export interface SistemaPuntos {
  victoria: number
  empate: number
  derrota: number
}

export const SISTEMA_PUNTOS_DEFECTO: SistemaPuntos = { victoria: 3, empate: 1, derrota: 0 }

export const CRITERIOS_DESEMPATE = [
  'PUNTOS',
  'DIFERENCIA_GOLES',
  'GOLES_FAVOR',
  'RESULTADO_ENFRENTAMIENTO',
  'MENOS_TARJETAS',
  'PARTIDO_DESEMPATE',
] as const

export type CriterioDesempate = (typeof CRITERIOS_DESEMPATE)[number]

export const DESEMPATES_DEFECTO: CriterioDesempate[] = ['PUNTOS', 'DIFERENCIA_GOLES', 'GOLES_FAVOR']

export type TipoFase = 'LIGA' | 'GRUPOS' | 'PLAYOFFS'

export interface FaseFormato {
  tipo: TipoFase
  ruedas?: number
  cantidadGrupos?: number
  clasificanPorGrupo?: number
  llaves?: string[]
  definenTercerPuesto?: boolean
}

export interface ConfiguracionFormato {
  fases: FaseFormato[]
  eliminacionDirectaIdaYVuelta?: boolean
}

export const CLAVES_CONFIGURACION_PUBLICA = [
  'mostrarInfo',
  'mostrarCategorias',
  'mostrarZonas',
  'mostrarEquipos',
  'mostrarTabla',
  'mostrarFixture',
  'mostrarResultados',
  'mostrarEstadisticas',
  'mostrarGoleadores',
  'mostrarTarjetas',
] as const

export interface ConfiguracionPublica {
  mostrarInfo: boolean
  mostrarCategorias: boolean
  mostrarZonas: boolean
  mostrarEquipos: boolean
  mostrarTabla: boolean
  mostrarFixture: boolean
  mostrarResultados: boolean
  mostrarEstadisticas: boolean
  mostrarGoleadores: boolean
  mostrarTarjetas: boolean
}

export const CONFIGURACION_PUBLICA_DEFECTO: ConfiguracionPublica = {
  mostrarInfo: true,
  mostrarCategorias: true,
  mostrarZonas: true,
  mostrarEquipos: true,
  mostrarTabla: false,
  mostrarFixture: false,
  mostrarResultados: false,
  mostrarEstadisticas: false,
  mostrarGoleadores: false,
  mostrarTarjetas: false,
}

export function validarSistemaPuntos(v: unknown): v is SistemaPuntos {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return false
  }
  const c = v as Record<string, unknown>
  for (const k of ['victoria', 'empate', 'derrota']) {
    const n = c[k]
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) {
      return false
    }
  }
  return true
}

export function validarDesempates(v: unknown): v is CriterioDesempate[] {
  if (!Array.isArray(v) || v.length === 0) {
    return false
  }
  return v.every((c) => typeof c === 'string' && (CRITERIOS_DESEMPATE as readonly string[]).includes(c))
}

export function validarConfiguracionFormato(v: unknown): v is ConfiguracionFormato {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return false
  }
  const c = v as Record<string, unknown>
  if (!Array.isArray(c.fases) || c.fases.length === 0) {
    return false
  }
  return c.fases.every((f) => {
    if (typeof f !== 'object' || f === null) {
      return false
    }
    const fase = f as Record<string, unknown>
    return fase.tipo === 'LIGA' || fase.tipo === 'GRUPOS' || fase.tipo === 'PLAYOFFS'
  })
}

export function validarConfiguracionPublica(v: unknown): v is ConfiguracionPublica {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return false
  }
  const c = v as Record<string, unknown>
  return (CLAVES_CONFIGURACION_PUBLICA as readonly string[]).every((k) => typeof c[k] === 'boolean')
}

export const configuracionPublicaValida = validarConfiguracionPublica
