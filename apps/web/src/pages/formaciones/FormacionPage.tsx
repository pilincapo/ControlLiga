import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { FormEvent } from 'react'
import { TIPOS_FORMACION } from '@controlliga/shared'
import { apiFetch } from '../../utils/api'
import Layout from '../../components/Layout'
import ConfirmDialog from '../../components/ConfirmDialog'
import ToastRegion from '../../components/ToastRegion'
import type { FormacionDetalle, JugadorPlantel } from './tipos'

interface Fila {
  equipoJugadorId: string
  nombre: string
  dorsal: number | null
  titular: boolean
  posicion: string
  x: string
  y: string
}

export default function FormacionPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [formacion, setFormacion] = useState<FormacionDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [esquema, setEsquema] = useState('')
  const [formacionTipo, setFormacionTipo] = useState('FUTBOL_11')
  const [notas, setNotas] = useState('')
  const [plantel, setPlantel] = useState<JugadorPlantel[]>([])
  const [filas, setFilas] = useState<Fila[]>([])
  const [confirmarEliminacion, setConfirmarEliminacion] = useState(false)

  const recargar = async () => {
    const data = await apiFetch<FormacionDetalle>(`/formaciones/${id}`)
    setFormacion(data)
    setNombre(data.nombre)
    setEsquema(data.esquema ?? '')
    setFormacionTipo(data.formacionTipo)
    setNotas(data.notas ?? '')
    setFilas(
      data.jugadores.map((j) => ({
        equipoJugadorId: j.equipoJugadorId,
        nombre: j.nombre,
        dorsal: j.dorsal,
        titular: j.esTitular,
        posicion: j.posicion,
        x: j.x === null ? '' : String(j.x),
        y: j.y === null ? '' : String(j.y),
      })),
    )
  }

  useEffect(() => {
    let activo = true
    if (!id) return
    apiFetch<FormacionDetalle>(`/formaciones/${id}`)
      .then((data) => {
        if (activo) {
          setFormacion(data)
          setNombre(data.nombre)
          setEsquema(data.esquema ?? '')
          setFormacionTipo(data.formacionTipo)
          setNotas(data.notas ?? '')
          setFilas(
            data.jugadores.map((j) => ({
              equipoJugadorId: j.equipoJugadorId,
              nombre: j.nombre,
              dorsal: j.dorsal,
              titular: j.esTitular,
              posicion: j.posicion,
              x: j.x === null ? '' : String(j.x),
              y: j.y === null ? '' : String(j.y),
            })),
          )
        }
      })
      .catch((err) => {
        if (activo) setError(err instanceof Error ? err.message : 'No se pudo cargar la formación')
      })
    return () => {
      activo = false
    }
  }, [id])

  async function iniciarEdicion() {
    setError(null)
    try {
      const plant = await apiFetch<JugadorPlantel[]>(`/equipos/${formacion?.equipo.id}/jugadores`)
      setPlantel(plant.filter((j) => j.estado !== 'BAJA'))
      setEditando(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el plantel')
    }
  }

  async function guardar(e: FormEvent) {
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
      await apiFetch(`/formaciones/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nombre,
          esquema: esquema || undefined,
          formacionTipo,
          notas: notas || undefined,
          jugadores,
        }),
      })
      setEditando(false)
      setMensaje('Formación actualizada')
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar')
    }
  }

  async function accion(url: string, metodo: string, payload?: unknown, exito?: string) {
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(url, {
        method: metodo,
        body: payload !== undefined ? JSON.stringify(payload) : undefined,
      })
      if (exito) setMensaje(exito)
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción')
    }
  }

  function setFila(i: number, datos: Partial<Fila>) {
    setFilas((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...datos } : f)))
  }

  if (!formacion) {
    return (
      <Layout>
        {error && <p className="error">{error}</p>}
        <p>Cargando formación…</p>
      </Layout>
    )
  }

  const titulares = formacion.jugadores.filter((j) => j.esTitular)
  const suplentes = formacion.jugadores.filter((j) => !j.esTitular)

  return (
    <Layout>
      <h2>Formación: {formacion.nombre}</h2>
      <p>
        <Link className="enlace" to={`/equipos/${formacion.equipo.id}`}>
          {formacion.equipo.nombre}
        </Link>{' '}
        · {formacion.esquema ?? formacion.formacionTipo} ·{' '}
        {formacion.publicada ? 'pública' : 'privada'}
      </p>
      {error && <p className="error">{error}</p>}
      <ToastRegion mensaje={mensaje} />

      <p>
        <button
          className="boton"
          onClick={() =>
            void accion(
              `/formaciones/${formacion.id}/clonar`,
              'POST',
              undefined,
              'Formación clonada',
            )
          }
        >
          Clonar
        </button>{' '}
        {formacion.publicada ? (
          <button
            className="boton"
            onClick={() =>
              void accion(
                `/formaciones/${formacion.id}/despublicar`,
                'POST',
                undefined,
                'Formación despublicada',
              )
            }
          >
            Despublicar
          </button>
        ) : (
          <button
            className="boton"
            onClick={() =>
              void accion(
                `/formaciones/${formacion.id}/publicar`,
                'POST',
                undefined,
                'Formación publicada',
              )
            }
          >
            Publicar
          </button>
        )}{' '}
        {!editando && (
          <button className="boton" onClick={() => void iniciarEdicion()}>
            Editar
          </button>
        )}{' '}
        <button className="boton boton-peligro" onClick={() => setConfirmarEliminacion(true)}>
          Eliminar
        </button>
      </p>

      {editando ? (
        <div className="tarjeta">
          <h3>Editar formación</h3>
          <form onSubmit={guardar}>
            <div className="campo">
              <label htmlFor="ef-nombre">Nombre</label>
              <input
                id="ef-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
            </div>
            <div className="campo">
              <label htmlFor="ef-tipo">Tipo de fútbol</label>
              <select
                id="ef-tipo"
                value={formacionTipo}
                onChange={(e) => setFormacionTipo(e.target.value)}
              >
                {TIPOS_FORMACION.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="ef-esquema">Sistema</label>
              <input id="ef-esquema" value={esquema} onChange={(e) => setEsquema(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="ef-notas">Notas</label>
              <input id="ef-notas" value={notas} onChange={(e) => setNotas(e.target.value)} />
            </div>
            <h4>Jugadores</h4>
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
                {plantel.map((j) => {
                  const idx = filas.findIndex((f) => f.equipoJugadorId === j.id)
                  return (
                    <tr key={j.id}>
                      <td>
                        <select
                          value={filas[idx]?.equipoJugadorId ?? ''}
                          onChange={(e) => {
                            if (idx >= 0) {
                              setFila(idx, {
                                equipoJugadorId: e.target.value || '',
                                nombre: j.nombre,
                                dorsal: j.dorsal,
                              })
                            } else {
                              setFilas((fs) => [
                                ...fs,
                                {
                                  equipoJugadorId: j.id,
                                  nombre: j.nombre,
                                  dorsal: j.dorsal,
                                  titular: false,
                                  posicion: '',
                                  x: '',
                                  y: '',
                                },
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
                          checked={filas[idx]?.titular ?? false}
                          onChange={(e) => idx >= 0 && setFila(idx, { titular: e.target.checked })}
                        />
                      </td>
                      <td>
                        <input
                          value={filas[idx]?.posicion ?? ''}
                          onChange={(e) => idx >= 0 && setFila(idx, { posicion: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          style={{ width: 60 }}
                          value={filas[idx]?.x ?? ''}
                          onChange={(e) => idx >= 0 && setFila(idx, { x: e.target.value })}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          style={{ width: 60 }}
                          value={filas[idx]?.y ?? ''}
                          onChange={(e) => idx >= 0 && setFila(idx, { y: e.target.value })}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <button className="boton boton-primario" type="submit">
              Guardar
            </button>{' '}
            <button className="boton" onClick={() => setEditando(false)}>
              Cancelar
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="tarjeta">
            <h3>Titulares</h3>
            <ul className="lista">
              {titulares.map((j) => (
                <li key={j.id}>
                  {j.nombre} · dorsal {j.dorsal ?? '—'} · {j.posicion} · ({j.x ?? '—'}, {j.y ?? '—'}
                  )
                </li>
              ))}
              {titulares.length === 0 && <li>Sin titulares.</li>}
            </ul>
          </div>
          <div className="tarjeta">
            <h3>Suplentes</h3>
            <ul className="lista">
              {suplentes.map((j) => (
                <li key={j.id}>
                  {j.nombre} · dorsal {j.dorsal ?? '—'} · {j.posicion} · ({j.x ?? '—'}, {j.y ?? '—'}
                  )
                </li>
              ))}
              {suplentes.length === 0 && <li>Sin suplentes.</li>}
            </ul>
          </div>
          <div className="tarjeta">
            <h3>Historial de uso</h3>
            <ul className="lista">
              {formacion.instancias.map((i) => (
                <li key={i.id}>
                  Usada en partido {i.partidoId} · {new Date(i.fecha).toLocaleString()}
                </li>
              ))}
              {formacion.instancias.length === 0 && <li>Aún no se usó en ningún partido.</li>}
            </ul>
          </div>
        </>
      )}
      <ConfirmDialog
        abierto={confirmarEliminacion}
        titulo="Eliminar formación"
        detalle={`Eliminarás ${formacion.nombre}. Esta acción no se puede deshacer.`}
        confirmar="Eliminar formación"
        onCancelar={() => setConfirmarEliminacion(false)}
        onConfirmar={() => {
          void accion(
            `/formaciones/${formacion.id}`,
            'DELETE',
            undefined,
            'Formación eliminada',
          ).then(() => navigate('/formaciones'))
        }}
      />
    </Layout>
  )
}
