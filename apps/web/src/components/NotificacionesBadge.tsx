import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cargarNoLeidas, EVENTO_NOTIFICACIONES_ACTUALIZADAS } from '../utils/notificaciones'

export default function NotificacionesBadge() {
  const [count, setCount] = useState(0)

  const refrescar = useCallback(() => {
    cargarNoLeidas()
      .then(setCount)
      .catch(() => setCount(0))
  }, [])

  useEffect(() => {
    refrescar()
    window.addEventListener(EVENTO_NOTIFICACIONES_ACTUALIZADAS, refrescar)
    return () => window.removeEventListener(EVENTO_NOTIFICACIONES_ACTUALIZADAS, refrescar)
  }, [refrescar])

  return (
    <Link to="/notificaciones" className="notificaciones-link" aria-label="Notificaciones">
      Notificaciones
      {count > 0 && <span className="badge" data-testid="badge-no-leidas">{count > 99 ? '99+' : count}</span>}
    </Link>
  )
}
