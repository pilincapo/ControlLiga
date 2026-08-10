import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiFetch } from '../../utils/api'
import Layout from '../../components/Layout'
import { useAuth } from '../../auth/useAuth'
import type { PartidoDetalle } from './tipos'

const TRANSICIONES: Record<string, string[]> = {
  PROGRAMADO: ['EN_CURSO', 'SUSPENDIDO', 'APLAZADO'],
  EN_CURSO: ['FINALIZADO', 'SUSPENDIDO'],
  APLAZADO: ['PROGRAMADO', 'SUSPENDIDO'],
  SUSPENDIDO: ['PROGRAMADO'],
  FINALIZADO: [],
}

export default function PartidoPage() {
  const { id } = useParams<{ id: string }>()
  const { usuario } = useAuth()
  const [partido, setPartido] = useState<PartidoDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [gLocal, setGLocal] = useState('')
  const [gVisitante, setGVisitante] = useState('')

  const recargar = async () => { const d = await apiFetch<PartidoDetalle>(`/partidos/${id}`); setPartido(d) }

  useEffect(() => { if (id) { let a = true; apiFetch<PartidoDetalle>(`/partidos/${id}`).then((d) => { if (a) setPartido(d) }).catch((e) => { if (a) setError(e instanceof Error ? e.message : '') }); return () => { a = false } } }, [id])

  async function accion(url: string, metodo: string, payload?: unknown, exito?: string) {
    setError(null); setMensaje(null)
    try { await apiFetch(url, { method: metodo, body: payload !== undefined ? JSON.stringify(payload) : undefined }); if (exito) setMensaje(exito); await recargar() }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo completar') }
  }

  async function cambiarEstado(estado: string) { await accion(`/partidos/${id}/estado`, 'POST', { estado }, 'Estado actualizado') }

  async function cargarResultado() {
    setError(null); setMensaje(null)
    try { await apiFetch(`/partidos/${id}/resultado`, { method: 'POST', body: JSON.stringify({ golesLocal: Number(gLocal), golesVisitante: Number(gVisitante) }) }); setMensaje('Resultado cargado'); await recargar() }
    catch (err) { setError(err instanceof Error ? err.message : 'No se pudo cargar') }
  }

  const esAdmin = partido ? usuario?.equipos.some((e) => (e.equipoId === partido.equipoLocal?.id || e.equipoId === partido.equipoVisitante?.id) && (e.rolEnEquipo === 'DELEGADO' || e.rolEnEquipo === 'TECNICO')) ?? false : false

  if (!partido) return <Layout>{error && <p className="error">{error}</p>}<p>Cargando…</p></Layout>

  return (
    <Layout>
      <h2>{partido.equipoLocal?.nombre ?? '?'} vs {partido.equipoVisitante?.nombre ?? '?'}</h2>
      <p>{partido.tipo} · <strong>{partido.estado}</strong> · {new Date(partido.fechaHora).toLocaleString()} {partido.lugar ? `· ${partido.lugar}` : ''}</p>
      {partido.arbitro && <p>Árbitro: {partido.arbitro}</p>}
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}

      {partido.golesLocal != null && (
        <div className="tarjeta"><h3>Resultado</h3><p style={{ fontSize: '2em', fontWeight: 'bold' }}>{partido.golesLocal} - {partido.golesVisitante}</p></div>
      )}

      {esAdmin && partido.estado !== 'FINALIZADO' && (
        <div className="tarjeta">
          <h3>Cargar resultado</h3>
          <div className="campo"><input type="number" min="0" value={gLocal} onChange={(e) => setGLocal(e.target.value)} placeholder="Goles local" style={{ width: 70 }} />
            {' - '}
            <input type="number" min="0" value={gVisitante} onChange={(e) => setGVisitante(e.target.value)} placeholder="Goles visitante" style={{ width: 70 }} /></div>
          <button className="boton boton-primario" onClick={() => void cargarResultado()}>Cargar</button>
        </div>
      )}

      {esAdmin && TRANSICIONES[partido.estado]?.length > 0 && (
        <div className="tarjeta">
          <h3>Cambiar estado</h3>
          {TRANSICIONES[partido.estado].map((e) => <button key={e} className="boton" onClick={() => void cambiarEstado(e)}>→ {e}</button>)}
        </div>
      )}

      {esAdmin && (
        <p>
          {partido.publicada
            ? <button className="boton" onClick={() => void accion(`/partidos/${id}/despublicar`, 'POST', undefined, 'Despublicado')}>Despublicar</button>
            : <button className="boton" onClick={() => void accion(`/partidos/${id}/publicar`, 'POST', undefined, 'Publicado')}>Publicar</button>}
        </p>
      )}

      {partido.torneo && <div className="tarjeta"><h3>Torneo</h3><p>{partido.torneo.nombre} · {partido.temporada?.nombre ?? ''}</p></div>}

      {partido.formacionInstancias.length > 0 && (
        <div className="tarjeta"><h3>Formaciones</h3>
          {partido.formacionInstancias.map((fi) => (
            <div key={fi.id}><p>Formación del partido:</p>
              <ul className="lista">{fi.jugadores.map((j) => <li key={j.nombreSnapshot + j.posicion}>{j.nombreSnapshot} · dorsal {j.dorsalSnapshot ?? '—'} · {j.posicion} · {j.esTitular ? 'TITULAR' : 'SUPLENTE'}</li>)}</ul>
            </div>))}
        </div>
      )}

      {partido.convocatorias.length > 0 && (
        <div className="tarjeta"><h3>Convocatorias</h3>
          {partido.convocatorias.map((c) => (
            <div key={c.id}><p>Jugadores convocados ({c.cancelada ? 'cancelada' : 'activa'}):</p>
              <ul className="lista">{c.jugadores.map((j) => <li key={j.equipoJugador.jugador.persona.nombre}>{j.equipoJugador.jugador.persona.nombre} {j.equipoJugador.jugador.persona.apellido} · {j.estado}</li>)}</ul>
            </div>))}
        </div>
      )}
    </Layout>
  )
}
