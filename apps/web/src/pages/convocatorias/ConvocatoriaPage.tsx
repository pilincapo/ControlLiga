import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../utils/api'
import Layout from '../../components/Layout'
import { useAuth } from '../../auth/useAuth'
import type { ConvocatoriaDetalle } from './tipos'

export default function ConvocatoriaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { usuario } = useAuth()
  const [conv, setConv] = useState<ConvocatoriaDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const recargar = async () => { const d = await apiFetch<ConvocatoriaDetalle>(`/convocatorias/${id}`); setConv(d) }

  useEffect(() => { if (id) { let a = true; apiFetch<ConvocatoriaDetalle>(`/convocatorias/${id}`).then((d) => { if (a) setConv(d) }).catch((e) => { if (a) setError(e instanceof Error ? e.message : '') }); return () => { a = false } } }, [id])

  async function accion(url: string, metodo: string, payload?: unknown, exito?: string) {
    setError(null); setMensaje(null)
    try { await apiFetch(url, { method: metodo, body: payload !== undefined ? JSON.stringify(payload) : undefined }); if (exito) setMensaje(exito); await recargar() }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo completar') }
  }

  const esPropio = (jugadorId: string) => usuario?.jugadorId === jugadorId
  const esAdmin = conv && usuario ? usuario.equipos.some((e) => e.equipoId === conv.equipo.id && (e.rolEnEquipo === 'DELEGADO' || e.rolEnEquipo === 'TECNICO')) : false

  if (!conv) return <Layout>{error && <p className="error">{error}</p>}<p>Cargando…</p></Layout>

  return (
    <Layout>
      <h2>Convocatoria · {new Date(conv.fecha).toLocaleDateString()}</h2>
      <p>{conv.lugar ?? 'Sin lugar'} {conv.hora ? `· ${conv.hora}` : ''} · {conv.cancelada ? 'Cancelada' : conv.publicada ? 'Pública' : 'Privada'}</p>
      <p><Link className="enlace" to={`/equipos/${conv.equipo.id}`}>{conv.equipo.nombre}</Link></p>
      {conv.fechaLimite && <p>Responder antes del: {new Date(conv.fechaLimite).toLocaleString()}</p>}
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}

      {!conv.cancelada && (
        <p>
          {esAdmin && <><button className="boton" onClick={() => void accion(`/convocatorias/${conv.id}`, 'DELETE', undefined, 'Cancelada').then(() => navigate('/convocatorias'))}>Cancelar</button>{' '}</>}
          {esAdmin && (conv.publicada
            ? <button className="boton" onClick={() => void accion(`/convocatorias/${conv.id}/despublicar`, 'POST', undefined, 'Despublicada')}>Despublicar</button>
            : <button className="boton" onClick={() => void accion(`/convocatorias/${conv.id}/publicar`, 'POST', undefined, 'Publicada')}>Publicar</button>)}
        </p>
      )}

      {conv.notas && <div className="tarjeta"><p>{conv.notas}</p></div>}

      <div className="tarjeta">
        <h3>Jugadores convocados</h3>
        <ul className="lista">
          {conv.jugadores.map((j) => (
            <li key={j.id}>
              {j.nombre} · dorsal {j.dorsal ?? '—'} · <strong>{j.estado}</strong>
              {j.nota ? ` · "${j.nota}"` : ''}
              {!conv.cancelada && esPropio(j.jugadorId) && (j.estado === 'PENDIENTE' || j.estado === 'CONFIRMADO') && (
                <>
                  {' '}<button className="boton" onClick={() => void accion(`/convocatorias-jugador/${j.id}/responder`, 'PATCH', { estado: 'CONFIRMADO' }, 'Respuesta guardada')}>Confirmar</button>
                  {' '}<button className="boton" onClick={() => void accion(`/convocatorias-jugador/${j.id}/responder`, 'PATCH', { estado: 'NO_DISPONIBLE' }, 'Respuesta guardada')}>No disponible</button>
                </>
              )}
              {!conv.cancelada && esAdmin && (
                <select value={j.estado} onChange={(e) => void accion(`/convocatorias-jugador/${j.id}/estado`, 'PATCH', { estado: e.target.value })}>
                  <option value="PENDIENTE">PENDIENTE</option>
                  <option value="CONFIRMADO">CONFIRMADO</option>
                  <option value="NO_DISPONIBLE">NO_DISPONIBLE</option>
                  <option value="AUSENTE">AUSENTE</option>
                </select>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Layout>
  )
}
