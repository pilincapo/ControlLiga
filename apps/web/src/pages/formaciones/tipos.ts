export interface PlantillaPosicion {
  id: string
  posicion: string
  esTitular: boolean
  x: number | null
  y: number | null
  orden: number
}

export interface PlantillaFormacion {
  id: string
  nombre: string
  formacionTipo: string
  esquema: string
  descripcion: string | null
  posiciones: PlantillaPosicion[]
}

export interface FormacionResumen {
  id: string
  nombre: string
  esquema: string | null
  formacionTipo: string
  publicada: boolean
  fecha: string
  partidoId: string | null
  equipo: { id: string; nombre: string; escudoUrl: string | null }
  _count?: { jugadores: number }
}

export interface JugadorFormacion {
  id: string
  equipoJugadorId: string
  jugadorId: string
  nombre: string
  dorsal: number | null
  posicion: string
  esTitular: boolean
  x: number | null
  y: number | null
  orden: number
}

export interface FormacionDetalle {
  id: string
  nombre: string
  esquema: string | null
  formacionTipo: string
  publicada: boolean
  fecha: string
  partidoId: string | null
  notas: string | null
  equipo: { id: string; nombre: string; escudoUrl: string | null }
  jugadores: JugadorFormacion[]
  instancias: Array<{ id: string; partidoId: string; fecha: string }>
}

export interface JugadorPlantel {
  id: string
  jugadorId: string
  nombre: string
  dorsal: number | null
  estado: string
}

export interface EquipoResumenForm {
  id: string
  nombre: string
}
