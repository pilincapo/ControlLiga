import type { EstadoPartido } from '../generated/prisma/enums.js'

export const TRANSICIONES: Record<EstadoPartido, readonly EstadoPartido[]> = {
  PROGRAMADO: ['EN_CURSO', 'SUSPENDIDO', 'APLAZADO'],
  EN_CURSO: ['FINALIZADO', 'SUSPENDIDO'],
  APLAZADO: ['PROGRAMADO', 'SUSPENDIDO'],
  SUSPENDIDO: ['PROGRAMADO'],
  FINALIZADO: [],
}

export function transicionValida(actual: EstadoPartido, nuevo: EstadoPartido): boolean {
  return TRANSICIONES[actual].includes(nuevo)
}
