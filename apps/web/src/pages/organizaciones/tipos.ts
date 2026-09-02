export interface OrganizacionResumen {
  id: string
  nombre: string
  descripcion: string | null
  slug: string | null
  zonaHoraria: string
  _count?: { torneos: number }
}

export interface OrganizacionDetalle extends OrganizacionResumen {
  torneos: Array<{ id: string; nombre: string; estado: string }>
}

export interface UsuarioOrganizacion {
  usuarioId: string
  email: string
  nombre: string | null
  apellido: string | null
  activo: boolean
  roles: Array<{ codigo: string; torneoId: string | null; equipoId: string | null }>
}