export const TIPOS_FORMACION = [
  'FUTBOL_5',
  'FUTBOL_7',
  'FUTBOL_8',
  'FUTBOL_9',
  'FUTBOL_11',
  'PERSONALIZADA',
] as const

export type TipoFormacion = (typeof TIPOS_FORMACION)[number]

export function esTipoFormacion(v: unknown): v is TipoFormacion {
  return typeof v === 'string' && (TIPOS_FORMACION as readonly string[]).includes(v)
}

export const ESTADOS_EN_FORMACION = ['TITULAR', 'SUPLENTE'] as const
export type EstadoEnFormacion = (typeof ESTADOS_EN_FORMACION)[number]

export const COORDENADA_MIN = 0
export const COORDENADA_MAX = 100

export function coordenadasValidas(x: unknown, y: unknown): boolean {
  const cx = typeof x === 'number' ? x : undefined
  const cy = typeof y === 'number' ? y : undefined
  if (cx === undefined && cy === undefined) {
    return true
  }
  if (cx !== undefined && !Number.isInteger(cx)) {
    return false
  }
  if (cy !== undefined && !Number.isInteger(cy)) {
    return false
  }
  const dentro = (n: number): boolean => n >= COORDENADA_MIN && n <= COORDENADA_MAX
  return (cx === undefined || dentro(cx)) && (cy === undefined || dentro(cy))
}
