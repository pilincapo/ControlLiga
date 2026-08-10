import type { EstadoTemporada, EstadoTorneo } from '../generated/prisma/enums.js'

// BORRADOR <-> INSCRIPCIONES <-> ACTIVO -> FINALIZADO -> ARCHIVADO
export const TRANSICIONES_TORNEO: Record<EstadoTorneo, readonly EstadoTorneo[]> = {
  BORRADOR: ['INSCRIPCIONES'],
  INSCRIPCIONES: ['BORRADOR', 'ACTIVO'],
  ACTIVO: ['INSCRIPCIONES', 'FINALIZADO'],
  FINALIZADO: ['ARCHIVADO'],
  ARCHIVADO: [],
}

export const TRANSICIONES_TEMPORADA: Record<EstadoTemporada, readonly EstadoTemporada[]> = {
  BORRADOR: ['PUBLICADO'],
  PUBLICADO: ['EN_CURSO', 'CANCELADO'],
  EN_CURSO: ['FINALIZADO', 'CANCELADO'],
  FINALIZADO: [],
  CANCELADO: [],
}

export function transicionValidaTorneo(actual: EstadoTorneo, nuevo: EstadoTorneo): boolean {
  return TRANSICIONES_TORNEO[actual].includes(nuevo)
}

export function transicionValidaTemporada(actual: EstadoTemporada, nuevo: EstadoTemporada): boolean {
  return TRANSICIONES_TEMPORADA[actual].includes(nuevo)
}
