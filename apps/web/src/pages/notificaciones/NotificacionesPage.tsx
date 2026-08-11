import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiFetch } from '../../utils/api'
import { emitirNotificacionesActualizadas, marcarLeida, marcarTodasLeidas } from '../../utils/notificaciones'
import Layout from '../../components/Layout'
import type { Notificacion } from './tipos'
import { notificacionEnlace } from './tipos'

type Filtro = 'todas' | 'no-leidas'

export default function NotificacionesPage() {
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [marcando, setMarcando] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let activo = true
    const query = filtro === 'no-leidas' ? '?leidas=false' : ''
    apiFetch<Notificacion[]>(`/notificaciones${query}`)
      .then((data) => {
        if (activo) setNotificaciones(data)
      })
      .catch((err) => {
        if (activo) setError(err instanceof Error ? err.message : 'No se pudieron cargar las notificaciones')
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [filtro])

  const noLeidas = notificaciones.filter((n) => n.leidaAt === null)
  const conEnlace = notificaciones.some((n) => notificacionEnlace(n) !== null)

  async function onMarcarLeida(n: Notificacion) {
    if (n.leidaAt) {
      abrir(n)
      return
    }
    try {
      await marcarLeida(n.id)
      setNotificaciones((prev) => prev.map((x) => (x.id === n.id ? { ...x, leidaAt: new Date().toISOString() } : x)))
      emitirNotificacionesActualizadas()
      abrir(n)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo marcar la notificación como leída')
    }
  }

  function abrir(n: Notificacion) {
    const enlace = notificacionEnlace(n)
    if (enlace) {
      navigate(enlace)
    }
  }

  async function onLeerTodas() {
    setMarcando(true)
    setError(null)
    try {
      await marcarTodasLeidas()
      setNotificaciones((prev) => prev.map((x) => ({ ...x, leidaAt: x.leidaAt ?? new Date().toISOString() })))
      emitirNotificacionesActualizadas()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron marcar las notificaciones')
    } finally {
      setMarcando(false)
    }
  }

  return (
    <Layout>
      <h2>Notificaciones</h2>
      {error && <p className="error">{error}</p>}

      <nav className="tabs">
        <button
          className={filtro === 'todas' ? 'activo' : ''}
          onClick={() => {
            setError(null)
            setFiltro('todas')
          }}
        >
          Todas
        </button>
        <button
          className={filtro === 'no-leidas' ? 'activo' : ''}
          onClick={() => {
            setError(null)
            setFiltro('no-leidas')
          }}
        >
          No leídas{noLeidas.length > 0 ? ` (${noLeidas.length})` : ''}
        </button>
      </nav>

      {noLeidas.length > 0 && (
        <p>
          <button className="boton" onClick={() => void onLeerTodas()} disabled={marcando}>
            {marcando ? 'Marcando…' : 'Marcar todas como leídas'}
          </button>
        </p>
      )}

      {cargando && <p className="centro">Cargando notificaciones…</p>}

      {!cargando && notificaciones.length === 0 && (
        <p className="mensaje">No tenés notificaciones{filtro === 'no-leidas' ? ' sin leer' : ''}.</p>
      )}

      {!cargando && notificaciones.length > 0 && (
        <ul className="lista notificaciones-lista">
          {notificaciones.map((n) => {
            const enlace = notificacionEnlace(n)
            return (
              <li key={n.id} className="tarjeta">
                <button className="notificacion-item" onClick={() => void onMarcarLeida(n)}>
                  <span className={`notificacion-dot ${n.leidaAt ? 'leida' : 'noleida'}`} aria-label={n.leidaAt ? 'Leída' : 'No leída'} />
                  <span className="notificacion-cuerpo">
                    <strong>{n.titulo}</strong> · <span className="estado">{n.tipo}</span>
                    <br />
                    {n.mensaje}
                    <br />
                    <small>{new Date(n.createdAt).toLocaleString()}</small>
                    {enlace && <span className="enlace"> · Ver</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {!cargando && notificaciones.length > 0 && conEnlace && (
        <p className="mensaje">Tocá una notificación para abrir su detalle.</p>
      )}
      <p>
        <Link className="enlace" to="/invitaciones">Ver mis invitaciones</Link>
      </p>
    </Layout>
  )
}
