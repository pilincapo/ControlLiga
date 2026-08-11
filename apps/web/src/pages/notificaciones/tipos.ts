export type TipoNotificacion =
  | 'INVITACION_JUGADOR'
  | 'INVITACION_CUERPO_TECNICO'
  | 'INVITACION_TORNEO'
  | 'SOLICITUD_TORNEO'
  | 'RESPUESTA_INVITACION'
  | 'CONVOCATORIA'
  | 'PARTIDO'
  | 'FIXTURE'
  | 'SANCION'
  | 'EQUIPO'

export interface Notificacion {
  id: string
  usuarioId: string
  tipo: TipoNotificacion
  titulo: string
  mensaje: string
  entidadTipo: string | null
  entidadId: string | null
  leidaAt: string | null
  createdAt: string
}

export function notificacionEnlace(n: Notificacion): string | null {
  if (!n.entidadId) {
    return null
  }
  switch (n.entidadTipo) {
    case 'Convocatoria':
      return `/convocatorias/${n.entidadId}`
    case 'Partido':
      return `/partidos/${n.entidadId}`
    case 'Invitacion':
      return '/invitaciones'
    case 'EquipoParticipacion':
      return '/torneos'
    case 'Fixture':
      return '/torneos'
    default:
      return null
  }
}
