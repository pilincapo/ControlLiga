import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FormEvent } from 'react'
import { PERMISOS } from '@controlliga/shared'
import { apiFetch } from '../../utils/api'
import Layout from '../../components/Layout'
import { useAuth } from '../../auth/useAuth'
import type { EquipoDetalle } from './tipos'

interface EquipoResumen {
  id: string
  nombre: string
  escudoUrl: string | null
  estado: string
  privado: boolean
}

export default function EquiposPage() {
  const { usuario } = useAuth()
  const [equipos, setEquipos] = useState<EquipoResumen[]>([])
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const esAdmin = usuario ? usuario.permisos.includes(PERMISOS.global) || usuario.permisos.includes(PERMISOS.equiposAdministrar) : false

  const recargar = useCallback(async () => {
    const data = await apiFetch<EquipoResumen[]>('/equipos')
    setEquipos(data)
  }, [])

  useEffect(() => {
    let activo = true
    apiFetch<EquipoResumen[]>('/equipos')
      .then((data) => {
        if (activo) setEquipos(data)
      })
      .catch((err) => {
        if (activo) setError(err instanceof Error ? err.message : 'No se pudieron cargar los equipos')
      })
    return () => {
      activo = false
    }
  }, [])

  async function crear(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    try {
      await apiFetch<EquipoDetalle>('/equipos', {
        method: 'POST',
        body: JSON.stringify({ nombre, descripcion: descripcion || undefined }),
      })
      setNombre('')
      setDescripcion('')
      setMensaje('Equipo creado')
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el equipo')
    }
  }

  return (
    <Layout>
      <h2>Equipos</h2>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}

      {esAdmin && (
        <div className="tarjeta">
          <h3>Nuevo equipo</h3>
          <form onSubmit={crear}>
            <div className="campo">
              <label htmlFor="eq-nombre">Nombre</label>
              <input id="eq-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Club Atlético" required />
            </div>
            <div className="campo">
              <label htmlFor="eq-desc">Descripción</label>
              <input id="eq-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
            <button className="boton boton-primario" type="submit">
              Crear
            </button>
          </form>
          <p className="mensaje">El creador queda automáticamente como DELEGADO del equipo.</p>
        </div>
      )}

      <div className="grid">
        {equipos.map((e) => (
          <div className="tarjeta" key={e.id}>
            <h3>{e.nombre}</h3>
            <p>
              {e.estado} · {e.privado ? 'privado' : 'público'}
            </p>
            <Link className="enlace" to={`/equipos/${e.id}`}>
              Mi equipo
            </Link>
          </div>
        ))}
      </div>
      {equipos.length === 0 && <p>No hay equipos para tu cuenta.</p>}
    </Layout>
  )
}
