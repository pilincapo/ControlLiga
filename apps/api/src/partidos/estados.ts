import type { EstadoPartido } from '../generated/prisma/enums.js'

export const TRANSICIONES: Record<EstadoPartido, readonly EstadoPartido[]> = {
  PROGRAMADO: ['EN_CURSO', 'SUSPENDIDO', 'APLAZADO', 'CANCELADO'],
  EN_CURSO: ['FINALIZADO', 'SUSPENDIDO', 'CANCELADO'],
  APLAZADO: ['PROGRAMADO', 'SUSPENDIDO', 'CANCELADO'],
  SUSPENDIDO: ['PROGRAMADO', 'CANCELADO'],
  FINALIZADO: [],
  CANCELADO: [],
}

export function transicionValida(actual: EstadoPartido, nuevo: EstadoPartido): boolean {
  return TRANSICIONES[actual].includes(nuevo)
}
