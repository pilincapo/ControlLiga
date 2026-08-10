import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FormEvent } from 'react'
import { TIPOS_FORMACION } from '@controlliga/shared'
import { apiFetch } from '../../utils/api'
import Layout from '../../components/Layout'
import type { EquipoResumenForm, JugadorPlantel, PlantillaFormacion, FormacionResumen } from './tipos'

interface Fila {
  equipoJugadorId: string
  nombre: string
  dorsal: number | null
  titular: boolean
  posicion: string
  x: string
  y: string
}

export default function FormacionesPage() {
  const [formaciones, setFormaciones] = useState<FormacionResumen[]>([])
  const [equipos, setEquipos] = useState<EquipoResumenForm[]>([])
  const [plantillas, setPlantillas] = useState<PlantillaFormacion[]>([])
  const [equipoId, setEquipoId] = useState('')
  const [nombre, setNombre] = useState('')
  const [esquema, setEsquema] = useState('')
  const [formacionTipo, setFormacionTipo] = useState('FUTBOL_11')
  const [plantillaId, setPlantillaId] = useState('')
  const [plantel, setPlantel] = useState<JugadorPlantel[]>([])
  const [filas, setFilas] = useState<Fila[]>([])
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    Promise.all([
      apiFetch<FormacionResumen[]>('/formaciones'),
      apiFetch<EquipoResumenForm[]>('/equipos'),
      apiFetch<PlantillaFormacion[]>('/plantillas'),
    ])
      .then(([f, e, p]) => {
        if (activo) {
          setFormaciones(f)
          setEquipos(e)
          setPlantillas(p)
        }
      })
      .catch((err) => {
        if (activo) setError(err instanceof Error ? err.message : 'No se pudieron cargar las formaciones')
      })
    return () => {
      activo = false
    }
  }, [])

  async function cargarPlantel(eqId: string) {
    setEquipoId(eqId)
    setFilas([])
    if (!eqId) return
    try {
      const plant = await apiFetch<JugadorPlantel[]>(`/equipos/${eqId}/jugadores`)
      setPlantel(plant.filter((j) => j.estado !== 'BAJA'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el plantel')
    }
  }

  function aplicarPlantilla(pid: string) {
    setPlantillaId(pid)
    const p = plantillas.find((x) => x.id === pid)
    if (p) {
      setFormacionTipo(p.formacionTipo)
      setEsquema(p.esquema)
      setFilas(
        p.posiciones.map((pos) => ({
          equipoJugadorId: '',
          nombre: `${pos.posicion} (sin jugador)`,
          dorsal: null,
          titular: pos.esTitular,
          posicion: pos.posicion,
          x: String(pos.x ?? ''),
          y: String(pos.y ?? ''),
        })),
      )
    }
  }

  async function crear(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    const jugadores = filas
      .filter((f) => f.equipoJugadorId)
      .map((f, i) => ({
        equipoJugadorId: f.equipoJugadorId,
        posicion: f.posicion || 'Sin posición',
        esTitular: f.titular,
        x: f.x === '' ? undefined : Number(f.x),
        y: f.y === '' ? undefined : Number(f.y),
        orden: i + 1,
      }))
    try {
      await apiFetch('/formaciones', {
        method: 'POST',
        body: JSON.stringify({
          equipoId,
          nombre,
          formacionTipo,
          esquema: esquema || undefined,
          plantillaId: plantillaId || undefined,
          jugadores,
        }),
      })
      setNombre('')
      setFilas([])
      setMensaje('Formación creada')
      const f = await apiFetch<FormacionResumen[]>('/formaciones')
      setFormaciones(f)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la formación')
    }
  }

  function setFila(i: number, datos: Partial<Fila>) {
    setFilas((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...datos } : f)))
  }

  return (
    <Layout>
      <h2>Formaciones</h2>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}

      <div className="tarjeta">
        <h3>Nueva formación</h3>
        <form onSubmit={crear}>
          <div className="campo">
            <label htmlFor="fo-equipo">Equipo</label>
            <select id="fo-equipo" value={equipoId} onChange={(e) => void cargarPlantel(e.target.value)} required>
              <option value="">Seleccionar…</option>
              {equipos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="fo-nombre">Nombre</label>
            <input id="fo-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="11 ideal" required />
          </div>
          <div className="campo">
            <label htmlFor="fo-plantilla">Sistema predefinido (opcional)</label>
            <select id="fo-plantilla" value={plantillaId} onChange={(e) => aplicarPlantilla(e.target.value)}>
              <option value="">Sin plantilla</option>
              {plantillas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.esquema} ({p.formacionTipo})
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="fo-tipo">Tipo de fútbol</label>
            <select id="fo-tipo" value={formacionTipo} onChange={(e) => setFormacionTipo(e.target.value)}>
              {TIPOS_FORMACION.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="fo-esquema">Sistema (ej. 4-3-3)</label>
            <input id="fo-esquema" value={esquema} onChange={(e) => setEsquema(e.target.value)} />
          </div>

          {plantel.length > 0 && (
            <div>
              <p>Armá la formación: elegí los jugadores del plantel (titulares y suplentes).</p>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th>Jugador</th>
                    <th>Titular</th>
                    <th>Posición</th>
                    <th>x</th>
                    <th>y</th>
                  </tr>
                </thead>
                <tbody>
                  {plantel.map((j) => (
                    <tr key={j.id}>
                      <td>
                        <select
                          value={filas.find((f) => f.equipoJugadorId === j.id)?.equipoJugadorId ?? ''}
                          onChange={(e) => {
                            const idx = filas.findIndex((f) => f.equipoJugadorId === j.id)
                            if (idx >= 0) {
                              setFila(idx, { equipoJugadorId: e.target.value || '', nombre: j.nombre, dorsal: j.dorsal })
                            } else {
                              setFilas((fs) => [
                                ...fs,
                                { equipoJugadorId: j.id, nombre: j.nombre, dorsal: j.dorsal, titular: false, posicion: '', x: '', y: '' },
                              ])
                            }
                          }}
                        >
                          <option value="">—</option>
                          {plantel.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre} ({p.dorsal ?? 'sin dorsal'})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={filas.find((f) => f.equipoJugadorId === j.id)?.titular ?? false}
                          onChange={(e) => {
                            const idx = filas.findIndex((f) => f.equipoJugadorId === j.id)
                            if (idx >= 0) setFila(idx, { titular: e.target.checked })
                          }}
                        />
                      </td>
                      <td>
                        <input
                          value={filas.find((f) => f.equipoJugadorId === j.id)?.posicion ?? ''}
                          onChange={(e) => {
                            const idx = filas.findIndex((f) => f.equipoJugadorId === j.id)
                            if (idx >= 0) setFila(idx, { posicion: e.target.value })
                          }}
                          placeholder="ARQ / DEL / EXT"
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          style={{ width: 60 }}
                          value={filas.find((f) => f.equipoJugadorId === j.id)?.x ?? ''}
                          onChange={(e) => {
                            const idx = filas.findIndex((f) => f.equipoJugadorId === j.id)
                            if (idx >= 0) setFila(idx, { x: e.target.value })
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          style={{ width: 60 }}
                          value={filas.find((f) => f.equipoJugadorId === j.id)?.y ?? ''}
                          onChange={(e) => {
                            const idx = filas.findIndex((f) => f.equipoJugadorId === j.id)
                            if (idx >= 0) setFila(idx, { y: e.target.value })
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button className="boton boton-primario" type="submit">
            Crear formación
          </button>
        </form>
      </div>

      <div className="grid">
        {formaciones.map((f) => (
          <div className="tarjeta" key={f.id}>
            <h3>{f.nombre}</h3>
            <p>
              {f.equipo.nombre} · {f.esquema ?? f.formacionTipo} · {f.publicada ? 'pública' : 'privada'}
            </p>
            <Link className="enlace" to={`/formaciones/${f.id}`}>
              Ver formación
            </Link>
          </div>
        ))}
      </div>
      {formaciones.length === 0 && <p>No hay formaciones para tu cuenta.</p>}
    </Layout>
  )
}
