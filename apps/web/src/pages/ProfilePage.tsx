import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { apiFetch } from '../utils/api'
import { useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import InvitacionesPendientes from './invitaciones/InvitacionesPendientes'

export default function ProfilePage() {
  const { usuario, vincularJugador } = useAuth()
  const navigate = useNavigate()
  const [jugadorId, setJugadorId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [passwordActual, setPasswordActual] = useState('')
  const [passwordNueva, setPasswordNueva] = useState('')

  if (!usuario) {
    return null
  }

  async function onVincular(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    setEnviando(true)
    try {
      await vincularJugador(jugadorId.trim())
      setMensaje('Cuenta vinculada correctamente')
      setJugadorId('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo vincular')
    } finally {
      setEnviando(false)
    }
  }

  async function onCambiarPassword(e: FormEvent) {
    e.preventDefault()
    setError(null); setMensaje(null); setEnviando(true)
    try {
      await apiFetch('/auth/password/change', { method: 'POST', body: JSON.stringify({ passwordActual, passwordNueva }) })
      navigate('/login', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña')
    } finally { setEnviando(false) }
  }

  return (
    <Layout>
      <h2>Mi perfil</h2>
      <div className="tarjeta">
        <h3>Cambiar contraseña</h3>
        {error && <p className="error">{error}</p>}
        <form onSubmit={onCambiarPassword}>
          <div className="campo"><label htmlFor="passwordActual">Contraseña actual</label><input id="passwordActual" type="password" value={passwordActual} onChange={(e) => setPasswordActual(e.target.value)} required /></div>
          <div className="campo"><label htmlFor="passwordNueva">Nueva contraseña</label><input id="passwordNueva" type="password" value={passwordNueva} onChange={(e) => setPasswordNueva(e.target.value)} required /></div>
          <button className="boton boton-primario" type="submit" disabled={enviando}>Cambiar contraseña</button>
        </form>
      </div>

      <div className="tarjeta">
        <p>
          <strong>{usuario.nombre} {usuario.apellido}</strong>
        </p>
        <p>{usuario.email}</p>
        <p>Jugador vinculado: {usuario.jugadorId ?? 'No'}</p>
      </div>

      <InvitacionesPendientes />

      <div className="tarjeta">
        <h3>Roles</h3>
        <ul className="lista">
          {usuario.roles.map((r, i) => (
            <li key={i}>
              {r.codigo}
              {r.organizacionId ? ` (organización ${r.organizacionId})` : ''}
              {r.torneoId ? ` (torneo ${r.torneoId})` : ''}
            </li>
          ))}
        </ul>
      </div>

      <div className="tarjeta">
        <h3>Permisos</h3>
        <ul className="lista">
          {usuario.permisos.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>

      {!usuario.jugadorId && (
        <div className="tarjeta">
          <h3>Vincular cuenta de jugador</h3>
          {error && <p className="error">{error}</p>}
          {mensaje && <p className="mensaje">{mensaje}</p>}
          <form onSubmit={onVincular}>
            <div className="campo">
              <label htmlFor="jugadorId">ID de jugador</label>
              <input id="jugadorId" value={jugadorId} onChange={(e) => setJugadorId(e.target.value)} required />
            </div>
            <button className="boton boton-primario" type="submit" disabled={enviando}>
              {enviando ? 'Vinculando…' : 'Vincular'}
            </button>
          </form>
        </div>
      )}
    </Layout>
  )
}
