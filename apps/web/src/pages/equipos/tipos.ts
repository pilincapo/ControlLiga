export interface AdministradorEquipo {
  id: string
  equipoId: string
  usuarioId: string
  rolEnEquipo: string
  activo: boolean
  fechaBaja: string | null
  usuario: { id: string; nombre: string; apellido: string; email: string }
}

export interface EquipoDetalle {
  id: string
  nombre: string
  escudoUrl: string | null
  descripcion: string | null
  colorPrincipal: string | null
  colorSecundario: string | null
  categoriaHabitual: string | null
  estado: string
  privado: boolean
  configuracionPublica: unknown | null
  telefono: string | null
  email: string | null
  administradores: AdministradorEquipo[]
  cantidades: { jugadores: number; bajas: number; administradores: number; delegados: number }
}

export interface JugadorPlantelEquipo {
  id: string
  jugadorId: string
  nombre: string
  dni: string | null
  fotoUrl: string | null
  dorsal: number | null
  posiciones: string | null
  estado: string
  fechaIngreso: string
  fechaSalida: string | null
  motivoBaja: string | null
  observaciones: string | null
}

export interface FichaJugador {
  id: string
  persona: {
    id: string
    nombre: string
    apellido: string
    dni: string | null
    fechaNacimiento: string | null
    email: string | null
    telefono: string | null
    fotoUrl: string | null
    sexo: string | null
  }
  pieDominante: string | null
  posicionFavorita: string | null
  alturaCm: number | null
  pesoKg: number | null
  vinculado: boolean
  historialEquipos: Array<{
    id: string
    equipoId: string
    equipo: string
    escudoUrl: string | null
    dorsal: number | null
    posiciones: string | null
    estado: string
    fechaIngreso: string
    fechaSalida: string | null
    motivoBaja: string | null
  }>
  historialCompeticiones: Array<{
    id: string
    torneo: string
    temporada: string
    categoria: string | null
    equipo: string
    dorsal: number | null
    activo: boolean
  }>
}
