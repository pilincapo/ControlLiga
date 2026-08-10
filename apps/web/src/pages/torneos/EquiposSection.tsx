import { useState } from 'react'
import type { FormEvent } from 'react'
import { apiFetch } from '../../utils/api'
import type { Participacion, TorneoCategoriaDetalle } from './tipos'

interface Props {
  torneoId: string
  temporadaId: string
  participaciones: Participacion[]
  torneoCategorias: TorneoCategoriaDetalle[]
  onRecargar: () => Promise<void>
}

export default function EquiposSection({ torneoId, temporadaId, participaciones, torneoCategorias, onRecargar }: Props) {
  const [equipoId, setEquipoId] = useState('')
  const [categoriaNueva, setCategoriaNueva] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function invitar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/torneos/${torneoId}/temporadas/${temporadaId}/participaciones/invitar`, {
        method: 'POST',
        body: JSON.stringify({ equipoId, torneoCategoriaId: categoriaNueva || undefined }),
      })
      setEquipoId('')
      setCategoriaNueva('')
      setMensaje('Equipo invitado')
      await onRecargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo invitar al equipo')
    }
  }

  async function accion(url: string, payload: unknown, mensajeExito: string) {
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(url, { method: 'POST', body: JSON.stringify(payload) })
      setMensaje(mensajeExito)
      await onRecargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción')
    }
  }

  async function asignarCategoria(participacionId: string, torneoCategoriaId: string | null) {
    setError(null)
    try {
      await apiFetch(`/participaciones/${participacionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ torneoCategoriaId: torneoCategoriaId ?? null }),
      })
      await onRecargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo asignar la categoría')
    }
  }

  const activas = participaciones.filter((p) => p.estado !== 'BAJA' && p.estado !== 'RECHAZADO')

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}
      <div className="tarjeta">
        <h3>Invitar equipo</h3>
        <form onSubmit={invitar}>
          <div className="campo">
            <label htmlFor="eq-id">ID del equipo</label>
            <input id="eq-id" value={equipoId} onChange={(e) => setEquipoId(e.target.value)} placeholder="uuid del equipo" required />
          </div>
          <div className="campo">
            <label htmlFor="eq-cat">Categoría (opcional)</label>
            <select id="eq-cat" value={categoriaNueva} onChange={(e) => setCategoriaNueva(e.target.value)}>
              <option value="">Sin asignar</option>
              {torneoCategorias.map((tc) => (
                <option key={tc.id} value={tc.id}>
                  {tc.categoria.nombre}
                </option>
              ))}
            </select>
          </div>
          <button className="boton boton-primario" type="submit">
            Invitar
          </button>
        </form>
      </div>
      <div className="tarjeta">
        <h3>Participaciones</h3>
        {activas.length === 0 && <p>Sin participaciones.</p>}
        <ul className="lista">
          {activas.map((p) => (
            <li key={p.id}>
              <strong>{p.equipo.nombre}</strong> · {p.estado} · categoría: {p.torneoCategoria?.categoria.nombre ?? '—'} ·
              zona: {p.zona?.nombre ?? '—'}
              {p.estado === 'INSCRIPTO' && (
                <>
                  {' '}
                  <button className="boton" onClick={() => void accion(`/participaciones/${p.id}/decidir-solicitud`, { aceptar: true }, 'Solicitud aceptada')}>
                    Aceptar
                  </button>{' '}
                  <button className="boton" onClick={() => void accion(`/participaciones/${p.id}/decidir-solicitud`, { aceptar: false }, 'Solicitud rechazada')}>
                    Rechazar
                  </button>
                </>
              )}
              {p.estado === 'PENDIENTE' && <span> — esperando confirmación del equipo</span>}
              <div className="campo">
                <select value={p.torneoCategoriaId ?? ''} onChange={(e) => void asignarCategoria(p.id, e.target.value || null)}>
                  <option value="">Sin categoría</option>
                  {torneoCategorias.map((tc) => (
                    <option key={tc.id} value={tc.id}>
                      {tc.categoria.nombre}
                    </option>
                  ))}
                </select>
              </div>
              {(p.estado === 'CONFIRMADO' || p.estado === 'INSCRIPTO') && (
                <button className="boton" onClick={() => void accion(`/participaciones/${p.id}/baja`, {}, 'Participación dada de baja')}>
                  Dar de baja
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
