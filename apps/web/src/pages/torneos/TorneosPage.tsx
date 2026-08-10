import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FormEvent } from 'react'
import { PERMISOS } from '@controlliga/shared'
import { apiFetch } from '../../utils/api'
import Layout from '../../components/Layout'
import { useAuth } from '../../auth/useAuth'
import type { Torneo } from './tipos'

export default function TorneosPage() {
  const { usuario } = useAuth()
  const [torneos, setTorneos] = useState<Torneo[]>([])
  const [organizacionId, setOrganizacionId] = useState('')
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const esAdmin = usuario ? usuario.permisos.includes(PERMISOS.global) || usuario.permisos.includes(PERMISOS.torneosAdministrar) : false

  const recargar = useCallback(async () => {
    const data = await apiFetch<Torneo[]>('/torneos')
    setTorneos(data)
  }, [])

  useEffect(() => {
    let activo = true
    apiFetch<Torneo[]>('/torneos')
      .then((data) => {
        if (activo) setTorneos(data)
      })
      .catch((err) => {
        if (activo) setError(err instanceof Error ? err.message : 'No se pudieron cargar los torneos')
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
      await apiFetch('/torneos', {
        method: 'POST',
        body: JSON.stringify({ organizacionId, nombre, descripcion: descripcion || undefined }),
      })
      setNombre('')
      setDescripcion('')
      setMensaje('Torneo creado')
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el torneo')
    }
  }

  return (
    <Layout>
      <h2>Torneos</h2>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}

      {esAdmin && (
        <div className="tarjeta">
          <h3>Nuevo torneo</h3>
          <form onSubmit={crear}>
            <div className="campo">
              <label htmlFor="n-org">ID de organización</label>
              <input id="n-org" value={organizacionId} onChange={(e) => setOrganizacionId(e.target.value)} placeholder="uuid de la organización" required />
            </div>
            <div className="campo">
              <label htmlFor="n-nombre">Nombre</label>
              <input id="n-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Liga Santa Fe" required />
            </div>
            <div className="campo">
              <label htmlFor="n-desc">Descripción</label>
              <input id="n-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
            <button className="boton boton-primario" type="submit">
              Crear
            </button>
          </form>
        </div>
      )}

      <div className="grid">
        {torneos.map((t) => (
          <div className="tarjeta" key={t.id}>
            <h3>{t.nombre}</h3>
            <p>
              {t.organizacion?.nombre ?? t.organizacionId} · {t.estado}
            </p>
            <Link className="enlace" to={`/torneos/${t.id}`}>
              Abrir panel
            </Link>
          </div>
        ))}
      </div>
      {torneos.length === 0 && <p>No hay torneos visibles para tu cuenta.</p>}
    </Layout>
  )
}
