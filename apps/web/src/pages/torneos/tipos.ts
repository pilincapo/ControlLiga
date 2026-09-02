import type { ConfiguracionPublica, FormatoCompetencia, CriterioDesempate, SistemaPuntos } from '@controlliga/shared'

export interface OrganizacionResumen {
  id: string
  nombre: string
  slug: string | null
  zonaHoraria: string
}

export interface Torneo {
  id: string
  organizacionId: string
  nombre: string
  slug: string | null
  descripcion: string | null
  logoUrl: string | null
  reglas: string | null
  estado: string
  visiblePublico: boolean
  configuracionPublica: ConfiguracionPublica | null
  organizacion?: OrganizacionResumen
  temporadas?: TemporadaResumen[]
  _count?: { temporadas: number; participaciones: number; partidos: number }
}

export interface TemporadaResumen {
  id: string
  nombre: string
  estado: string
  fechaInicio: string
  fechaFin: string | null
  _count: { torneoCategorias: number; participaciones: number; partidos: number }
}

export interface ConfiguracionCompetencia {
  torneoCategoriaId: string
  formato: FormatoCompetencia
  configuracionFormato: unknown | null
  sistemaPuntos: SistemaPuntos
  desempates: CriterioDesempate[]
}

export interface TorneoCategoriaDetalle {
  id: string
  estado: string
  categoria: { id: string; nombre: string }
  configuracion: ConfiguracionCompetencia | null
  zonas: Zona[]
  participaciones: Array<{
    id: string
    estado: string
    equipo: { id: string; nombre: string; escudoUrl: string | null }
  }>
}

export interface Zona {
  id: string
  nombre: string
  _count?: { participaciones: number }
}

export interface Participacion {
  id: string
  torneoId: string
  temporadaId: string
  torneoCategoriaId: string | null
  zonaId: string | null
  equipoId: string
  estado: string
  fechaInscripcion: string
  equipo: { id: string; nombre: string; escudoUrl: string | null }
  torneoCategoria: { categoria: { id: string; nombre: string } } | null
  zona: { id: string; nombre: string } | null
}

export interface FaseCompetencia {
  id: string
  orden: number
  nombre: string
  tipo: 'GRUPOS' | 'ELIMINACION_DIRECTA'
  estado: string
  participantesFase: Array<{
    id: string
    seed: number | null
    participacion: { equipo: { nombre: string } }
    clasificadoOrigen: { etiquetaOrigen: string } | null
  }>
  reglasClasificacionOrigen: Array<{
    id: string
    faseDestinoId: string
    orden: number
    tipo: 'POSICION_GRUPO' | 'MEJORES_ENTRE_GRUPOS' | 'POSICION_GENERAL'
    posicionDesde: number
    posicionHasta: number
    cantidad: number | null
    grupoCompetenciaId: string | null
    seedTipo: 'ORDEN_CLASIFICACION' | 'CRUCE_EXPLICITO'
    seedInicio: number
    estado: string
    clasificados: Array<{ id: string; participacionId: string; posicion: number; seed: number; etiquetaOrigen: string }>
  }>
  grupos: Array<{
    id: string
    nombre: string
    participaciones: Array<{ id: string; equipo: { id: string; nombre: string } }>
  }>
  rondas: Array<{
    id: string
    nombre: string
    tipo?: string
    formatoSerie?: string
    permiteAlargue?: boolean
    permitePenales?: boolean
    llaves: Array<{
      id: string
      orden: number
      estado: string
      participacionLocal: { equipo: { nombre: string } } | null
      participacionVisitante: { equipo: { nombre: string } } | null
      ganadorParticipacion: { equipo: { nombre: string } } | null
      definicion?: { tipo: string; penalesLocal: number | null; penalesVisitante: number | null } | null
      partidos?: Array<{ id: string; ordenSerie: number | null; estado: string; golesLocal: number | null; golesVisitante: number | null }>
    }>
  }>
}

export interface TemporadaDetalle {
  id: string
  nombre: string
  estado: string
  torneoCategorias: TorneoCategoriaDetalle[]
  participaciones: Participacion[]
}

export interface CategoriaGlobal {
  id: string
  nombre: string
  descripcion: string | null
}

export interface JugadorPlantilla {
  id: string
  jugadorId: string
  dorsal: number | null
  activo: boolean
  fechaAlta: string
  fechaBaja: string | null
  jugador: { persona: { nombre: string; apellido: string } }
}

export const TRANSICIONES_TORNEO: Record<string, string[]> = {
  BORRADOR: ['INSCRIPCIONES'],
  INSCRIPCIONES: ['BORRADOR', 'ACTIVO'],
  ACTIVO: ['INSCRIPCIONES', 'FINALIZADO'],
  FINALIZADO: ['ARCHIVADO'],
  ARCHIVADO: [],
}

export const TRANSICIONES_TEMPORADA: Record<string, string[]> = {
  BORRADOR: ['PUBLICADO'],
  PUBLICADO: ['EN_CURSO', 'CANCELADO'],
  EN_CURSO: ['FINALIZADO', 'CANCELADO'],
  FINALIZADO: [],
  CANCELADO: [],
}
