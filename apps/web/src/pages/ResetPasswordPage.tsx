import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../utils/api'

export default function ResetPasswordPage() {
  const [params] = useSearchParams(); const navigate = useNavigate()
  const [password, setPassword] = useState(''); const [confirmacion, setConfirmacion] = useState(''); const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) { e.preventDefault(); setError(null); if (password !== confirmacion) { setError('Las contraseñas no coinciden'); return } try { await apiFetch('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token: params.get('token') ?? '', password }) }); navigate('/login', { replace: true }) } catch (err) { setError(err instanceof Error ? err.message : 'Enlace inválido o expirado') } }
  return <main className="pagina"><form className="formulario" onSubmit={submit}><h1>Nueva contraseña</h1>{error && <p className="error">{error}</p>}<div className="campo"><label htmlFor="password">Nueva contraseña</label><input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></div><div className="campo"><label htmlFor="confirmacion">Repetir contraseña</label><input id="confirmacion" type="password" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} required /></div><button className="boton boton-primario">Actualizar contraseña</button><p><Link to="/login">Volver a iniciar sesión</Link></p></form></main>
}
