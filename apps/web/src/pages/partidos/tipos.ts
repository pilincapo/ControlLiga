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
  llaveCompetencia?: {
    estado: string
    metodoResolucion: string | null
    definicion: { tipo: string; penalesLocal: number | null; penalesVisitante: number | null } | null
    partidos: Array<{ id: string; ordenSerie: number | null; golesLocal: number | null; golesVisitante: number | null; estado: string }>
    rondaEliminatoria: { nombre: string; formatoSerie: string; permiteAlargue: boolean; permitePenales: boolean }
  } | null
  formacionInstancias: Array<{
    id: string
    jugadores: Array<{
      jugadorId: string
      jugador: { persona: { nombre: string; apellido: string } }
      dorsalSnapshot: number | null
      nombreSnapshot: string
      esTitular: boolean
      posicion: string
    }>
  }>
  convocatorias: Array<{
    id: string
    cancelada: boolean
    jugadores: Array<{
      estado: string
      equipoJugador: { jugador: { persona: { nombre: string; apellido: string } } }
    }>
  }>
}

export interface EventoPartido {
  id: string
  tipo: string
  equipoId: string
  jugadorId: string | null
  jugadorRelacionadoId: string | null
  minuto: number | null
  periodo: string | null
  subtipo: string | null
  anulado: boolean
}

export interface EstadisticasPartido {
  jugadores: Array<{
    jugadorId: string
    goles: number
    asistencias: number
    amarillas: number
    rojas: number
    minutos: number | null
    minutosNoDeterminados: boolean
  }>
}
