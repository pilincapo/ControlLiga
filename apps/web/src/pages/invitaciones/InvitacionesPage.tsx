import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../../utils/api'
import { emitirNotificacionesActualizadas } from '../../utils/notificaciones'
import Layout from '../../components/Layout'
import type { InvitacionRecibida } from './tipos'

export default function InvitacionesPage() {
  const [invitaciones, setInvitaciones] = useState<InvitacionRecibida[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [ocupadaId, setOcupadaId] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    apiFetch<InvitacionRecibida[]>('/invitaciones/mias')
      .then((data) => {
        if (activo) setInvitaciones(data)
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
  }, [])

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
      setInvitaciones((prev) =>
        prev.map((x) =>
          x.id === inv.id ? { ...x, estado: aceptar ? 'ACEPTADA' : 'RECHAZADA', respondidoEn: new Date().toISOString() } : x,
        ),
      )
      emitirNotificacionesActualizadas()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo responder la invitación')
    } finally {
      setOcupadaId(null)
    }
  }

  const pendientes = invitaciones.filter((i) => i.estado === 'PENDIENTE')
  const historial = invitaciones.filter((i) => i.estado !== 'PENDIENTE')

  return (
    <Layout>
      <h2>Invitaciones</h2>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}

      {cargando && <p className="centro">Cargando invitaciones…</p>}

      {!cargando && invitaciones.length === 0 && <p className="mensaje">No tenés invitaciones.</p>}

      {!cargando && pendientes.length > 0 && (
        <div className="tarjeta">
          <h3>Pendientes</h3>
          <ul className="lista">
            {pendientes.map((inv) => (
              <li key={inv.id}>
                <strong>{inv.equipo.nombre}</strong> · {inv.tipo === 'JUGADOR' ? 'jugador' : `cuerpo técnico (${inv.rolEnEquipo ?? '—'})`}
                {inv.mensaje && <p>{inv.mensaje}</p>}
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
        </div>
      )}

      {!cargando && historial.length > 0 && (
        <div className="tarjeta">
          <h3>Historial</h3>
          <ul className="lista">
            {historial.map((inv) => (
              <li key={inv.id}>
                {inv.equipo.nombre} · {inv.tipo === 'JUGADOR' ? 'jugador' : `cuerpo técnico (${inv.rolEnEquipo ?? '—'})`} ·{' '}
                <span className="estado">{inv.estado}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p>
        <Link className="enlace" to="/notificaciones">Ver notificaciones</Link>
      </p>
    </Layout>
  )
}
