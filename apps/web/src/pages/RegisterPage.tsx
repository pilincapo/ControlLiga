import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

export default function RegisterPage() {
  const { registrar } = useAuth()
  const navigate = useNavigate()
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [jugadorId, setJugadorId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setEnviando(true)
    try {
      await registrar({
        nombre,
        apellido,
        email,
        password,
        jugadorId: jugadorId.trim() || undefined,
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <main className="pagina">
      <h1 className="centro">CONTROL LIGA</h1>
      <form className="formulario" onSubmit={onSubmit}>
        <h2>Crear cuenta</h2>
        {error && <p className="error">{error}</p>}
        <div className="campo">
          <label htmlFor="nombre">Nombre</label>
          <input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </div>
        <div className="campo">
          <label htmlFor="apellido">Apellido</label>
          <input id="apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} required />
        </div>
        <div className="campo">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="campo">
          <label htmlFor="password">Contraseña (mínimo 8 caracteres)</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="campo">
          <label htmlFor="jugadorId">ID de jugador (opcional, para vincular tu cuenta)</label>
          <input id="jugadorId" value={jugadorId} onChange={(e) => setJugadorId(e.target.value)} />
        </div>
        <button className="boton boton-primario" type="submit" disabled={enviando}>
          {enviando ? 'Creando…' : 'Registrarme'}
        </button>
        <p>
          <Link className="enlace" to="/login">
            ¿Ya tenés cuenta? Ingresá
          </Link>
        </p>
      </form>
    </main>
  )
}
