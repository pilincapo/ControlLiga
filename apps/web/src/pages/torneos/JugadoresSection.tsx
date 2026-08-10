import { useState } from 'react'
import type { FormEvent } from 'react'
import { apiFetch } from '../../utils/api'
import type { JugadorPlantilla, Participacion } from './tipos'

interface Props {
  participaciones: Participacion[]
  onRecargar: () => Promise<void>
}

export default function JugadoresSection({ participaciones, onRecargar }: Props) {
  const [participacionId, setParticipacionId] = useState('')
  const [jugadores, setJugadores] = useState<JugadorPlantilla[]>([])
  const [jugadorId, setJugadorId] = useState('')
  const [dorsal, setDorsal] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  async function cargar(pid: string) {
    setParticipacionId(pid)
    setError(null)
    setMensaje(null)
    if (!pid) {
      setJugadores([])
      return
    }
    try {
      const data = await apiFetch<JugadorPlantilla[]>(`/participaciones/${pid}/jugadores`)
      setJugadores(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los jugadores')
      setJugadores([])
    }
  }

  async function agregar(e: FormEvent) {
    e.preventDefault()
    if (!participacionId) return
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/participaciones/${participacionId}/jugadores`, {
        method: 'POST',
        body: JSON.stringify({ jugadorId, dorsal: dorsal ? Number(dorsal) : undefined }),
      })
      setJugadorId('')
      setDorsal('')
      setMensaje('Jugador agregado a la competición')
      await cargar(participacionId)
      await onRecargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo agregar el jugador')
    }
  }

  async function cambiarDorsal(id: string, actual: number | null) {
    const nuevo = window.prompt('Dorsal', String(actual ?? ''))
    if (nuevo === null) return
    try {
      await apiFetch(`/jugador-participaciones/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ dorsal: nuevo === '' ? null : Number(nuevo) }),
      })
      await cargar(participacionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo modificar el dorsal')
    }
  }

  async function darBaja(id: string) {
    try {
      await apiFetch(`/jugador-participaciones/${id}/baja`, { method: 'POST' })
      setMensaje('Jugador dado de baja')
      await cargar(participacionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo dar de baja')
    }
  }

  return (
    <div>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}
      <div className="tarjeta">
        <h3>Participación</h3>
        <div className="campo">
          <label htmlFor="j-participacion">Equipo</label>
          <select id="j-participacion" value={participacionId} onChange={(e) => void cargar(e.target.value)}>
            <option value="">Seleccionar equipo…</option>
            {participaciones
              .filter((p) => p.estado === 'CONFIRMADO' || p.estado === 'INSCRIPTO')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.equipo.nombre}
                </option>
              ))}
          </select>
        </div>
      </div>

      {participacionId && (
        <>
          <div className="tarjeta">
            <h3>Agregar jugador a la competición</h3>
            <form onSubmit={agregar}>
              <div className="campo">
                <label htmlFor="j-jugador">ID de jugador</label>
                <input id="j-jugador" value={jugadorId} onChange={(e) => setJugadorId(e.target.value)} placeholder="uuid del jugador" required />
              </div>
              <div className="campo">
                <label htmlFor="j-dorsal">Dorsal (opcional)</label>
                <input id="j-dorsal" value={dorsal} onChange={(e) => setDorsal(e.target.value)} type="number" />
              </div>
              <button className="boton boton-primario" type="submit">
                Agregar
              </button>
            </form>
          </div>
          <div className="tarjeta">
            <h3>Plantilla en competición</h3>
            {jugadores.length === 0 && <p>Sin jugadores en la plantilla.</p>}
            <ul className="lista">
              {jugadores.map((j) => (
                <li key={j.id}>
                  {j.jugador.persona.nombre} {j.jugador.persona.apellido} · dorsal {j.dorsal ?? '—'} ·{' '}
                  {j.activo ? 'activo' : `baja ${j.fechaBaja ? new Date(j.fechaBaja).toLocaleDateString() : ''}`}
                  {j.activo && (
                    <>
                      {' '}
                      <button className="boton" onClick={() => void cambiarDorsal(j.id, j.dorsal)}>
                        Dorsal
                      </button>{' '}
                      <button className="boton" onClick={() => void darBaja(j.id)}>
                        Baja
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
