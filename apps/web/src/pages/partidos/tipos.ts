export interface PartidoResumen {
  id: string
  tipo: string
  estado: string
  publicada: boolean
  fechaHora: string
  lugar: string | null
  golesLocal: number | null
  golesVisitante: number | null
  equipoLocal: { nombre: string } | null
  equipoVisitante: { nombre: string } | null
}

export interface PartidoDetalle {
  id: string
  tipo: string
  estado: string
  publicada: boolean
  fechaHora: string
  lugar: string | null
  golesLocal: number | null
  golesVisitante: number | null
  observaciones: string | null
  arbitro: string | null
  equipoLocal: { id: string; nombre: string; escudoUrl: string | null } | null
  equipoVisitante: { id: string; nombre: string; escudoUrl: string | null } | null
  torneo: { id: string; nombre: string } | null
  temporada: { id: string; nombre: string } | null
  formacionInstancias: Array<{ id: string; jugadores: Array<{ jugador: { persona: { nombre: string; apellido: string } }; dorsalSnapshot: number | null; nombreSnapshot: string; esTitular: boolean; posicion: string }> }>
  convocatorias: Array<{ id: string; cancelada: boolean; jugadores: Array<{ estado: string; equipoJugador: { jugador: { persona: { nombre: string; apellido: string } } } }> }>
}
