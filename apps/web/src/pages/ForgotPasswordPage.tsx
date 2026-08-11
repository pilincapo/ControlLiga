import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch } from '../utils/api'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null)
    try { await apiFetch('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }); setEnviado(true) }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo procesar la solicitud') }
  }
  return <main className="pagina"><form className="formulario" onSubmit={submit}><h1>Recuperar contraseña</h1>{error && <p className="error">{error}</p>}{enviado ? <p className="mensaje">Si existe una cuenta, recibirás instrucciones por email.</p> : <><div className="campo"><label htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div><button className="boton boton-primario">Enviar instrucciones</button></>}<p><Link to="/login">Volver a iniciar sesión</Link></p></form></main>
}
