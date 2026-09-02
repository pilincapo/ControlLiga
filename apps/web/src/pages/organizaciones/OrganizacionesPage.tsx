import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { FormEvent } from 'react'
import { PERMISOS } from '@controlliga/shared'
import { apiFetch } from '../../utils/api'
import Layout from '../../components/Layout'
import { useAuth } from '../../auth/useAuth'
import type { OrganizacionResumen } from './tipos'

export default function OrganizacionesPage() {
  const { usuario } = useAuth()
  const [organizaciones, setOrganizaciones] = useState<OrganizacionResumen[]>([])
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [slug, setSlug] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const esSuper = usuario?.permisos.includes(PERMISOS.global) ?? false

  const recargar = async () => {
    const data = await apiFetch<OrganizacionResumen[]>('/organizaciones')
    setOrganizaciones(data)
  }

  useEffect(() => {
    let activo = true
    apiFetch<OrganizacionResumen[]>('/organizaciones')
      .then((data) => {
        if (activo) setOrganizaciones(data)
      })
      .catch((err) => {
        if (activo) setError(err instanceof Error ? err.message : 'No se pudieron cargar las organizaciones')
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
      await apiFetch('/organizaciones', {
        method: 'POST',
        body: JSON.stringify({
          nombre,
          descripcion: descripcion || undefined,
          slug: slug || undefined,
        }),
      })
      setNombre('')
      setDescripcion('')
      setSlug('')
      setMensaje('Organización creada')
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la organización')
    }
  }

  return (
    <Layout>
      <h2>Organizaciones</h2>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}

      {esSuper && (
        <div className="tarjeta">
          <h3>Nueva organización</h3>
          <form onSubmit={crear}>
            <div className="campo">
              <label htmlFor="o-nombre">Nombre</label>
              <input id="o-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Club Atlético Rosario" required />
            </div>
            <div className="campo">
              <label htmlFor="o-desc">Descripción</label>
              <input id="o-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="o-slug">Slug (opcional)</label>
              <input id="o-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="club-atletico-rosario" />
            </div>
            <button className="boton boton-primario" type="submit">
              Crear
            </button>
          </form>
        </div>
      )}

      <div className="grid">
        {organizaciones.map((o) => (
          <div className="tarjeta" key={o.id}>
            <h3>{o.nombre}</h3>
            {o.descripcion && <p>{o.descripcion}</p>}
            <p>
              {o.slug} · {o._count?.torneos ?? 0} torneo(s)
            </p>
            <Link className="enlace" to={`/organizaciones/${o.id}`}>
              Administrar
            </Link>
          </div>
        ))}
      </div>
      {organizaciones.length === 0 && <p>No tenés organizaciones asignadas.</p>}
    </Layout>
  )
}