import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../utils/api'
import { emitirNotificacionesActualizadas } from '../../utils/notificaciones'
import type { InvitacionRecibida } from './tipos'

interface Props {
  limite?: number
}

export default function InvitacionesPendientes({ limite = 5 }: Props) {
  const [invitaciones, setInvitaciones] = useState<InvitacionRecibida[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [ocupadaId, setOcupadaId] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    apiFetch<InvitacionRecibida[]>('/invitaciones/mias')
      .then((data) => {
        if (activo) setInvitaciones(data.filter((i) => i.estado === 'PENDIENTE').slice(0, limite))
      })
      .catch((err) => {
        if (activo) setError(err instanceof Error ? err.message : 'No se pudieron cargar las invitaciones')
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [limite])

  async function responder(inv: InvitacionRecibida, aceptar: boolean) {
    setError(null)
    setMensaje(null)
    setOcupadaId(inv.id)
    try {
      await apiFetch(`/invitaciones/${inv.id}/responder`, {
        method: 'POST',
        body: JSON.stringify({ aceptar }),
      })
      setMensaje(aceptar ? `Aceptaste la invitación de ${inv.equipo.nombre}` : `Rechazaste la invitación de ${inv.equipo.nombre}`)
      setInvitaciones((prev) => prev.filter((x) => x.id !== inv.id))
      emitirNotificacionesActualizadas()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo responder la invitación')
    } finally {
      setOcupadaId(null)
    }
  }

  return (
    <div className="tarjeta">
      <h3>Invitaciones pendientes</h3>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}
      {cargando && <p>Cargando…</p>}
      {!cargando && invitaciones.length === 0 && <p className="mensaje">No tenés invitaciones pendientes.</p>}
      {!cargando && invitaciones.length > 0 && (
        <ul className="lista">
          {invitaciones.map((inv) => (
            <li key={inv.id}>
              <strong>{inv.equipo.nombre}</strong> · {inv.tipo === 'JUGADOR' ? 'jugador' : `cuerpo técnico (${inv.rolEnEquipo ?? '—'})`}
              <div className="acciones">
                <button className="boton boton-primario" onClick={() => void responder(inv, true)} disabled={ocupadaId === inv.id}>
                  Aceptar
                </button>
                <button className="boton" onClick={() => void responder(inv, false)} disabled={ocupadaId === inv.id}>
                  Rechazar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link className="enlace" to="/invitaciones">Ver todas las invitaciones</Link>
      </p>
    </div>
  )
}
