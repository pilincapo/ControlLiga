export interface InvitacionRecibida {
  id: string
  tipo: 'JUGADOR' | 'CUERPO_TECNICO'
  estado: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | 'EXPIRADA' | 'REVOCADA'
  rolEnEquipo: string | null
  mensaje: string | null
  expiraEn: string | null
  respondidoEn: string | null
  createdAt: string
  equipo: {
    id: string
    nombre: string
    escudoUrl: string | null
  }
}
