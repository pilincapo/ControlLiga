import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import Layout from '../components/Layout'

export default function ProfilePage() {
  const { usuario, vincularJugador } = useAuth()
  const [jugadorId, setJugadorId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

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

  return (
    <Layout>
      <h2>Mi perfil</h2>
      <div className="tarjeta">
        <p>
          <strong>{usuario.nombre} {usuario.apellido}</strong>
        </p>
        <p>{usuario.email}</p>
        <p>Jugador vinculado: {usuario.jugadorId ?? 'No'}</p>
      </div>

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
