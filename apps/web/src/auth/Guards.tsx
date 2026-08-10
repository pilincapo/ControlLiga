import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from './useAuth'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuth()
  const location = useLocation()
  if (cargando) {
    return <p className="centro">Cargando…</p>
  }
  if (!usuario) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}

export function PublicOnly({ children }: { children: ReactNode }) {
  const { usuario, cargando } = useAuth()
  if (cargando) {
    return <p className="centro">Cargando…</p>
  }
  if (usuario) {
    return <Navigate to="/dashboard" replace />
  }
  return children
}
