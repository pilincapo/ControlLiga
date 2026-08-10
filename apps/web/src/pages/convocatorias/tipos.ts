export interface ConvocatoriaResumen {
  id: string
  fecha: string
  lugar: string | null
  hora: string | null
  cancelada: boolean
  publicada: boolean
  partidoId: string | null
  _count: { jugadores: number }
}

export interface JugadorConvocado {
  id: string
  equipoJugadorId: string
  jugadorId: string
  nombre: string
  dorsal: number | null
  estado: string
  orden: number
  nota: string | null
  respondioEn: string | null
}

export interface ConvocatoriaDetalle {
  id: string
  fecha: string
  fechaLimite: string | null
  lugar: string | null
  hora: string | null
  notas: string | null
  cancelada: boolean
  publicada: boolean
  partidoId: string | null
  equipo: { id: string; nombre: string; escudoUrl: string | null }
  partido: { id: string; tipo: string; fechaHora: string; lugar: string | null } | null
  jugadores: JugadorConvocado[]
}

export interface JugadorPlantel {
  id: string
  jugadorId: string
  nombre: string
  dorsal: number | null
  estado: string
}

export interface EquipoResumen {
  id: string
  nombre: string
}
