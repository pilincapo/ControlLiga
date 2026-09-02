import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../../utils/api'
import Layout from '../../components/Layout'
import type { OrganizacionDetalle, UsuarioOrganizacion } from './tipos'

export default function OrganizacionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [org, setOrg] = useState<OrganizacionDetalle | null>(null)
  const [usuarios, setUsuarios] = useState<UsuarioOrganizacion[]>([])
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    Promise.all([
      apiFetch<OrganizacionDetalle>(`/organizaciones/${id}`),
      apiFetch<UsuarioOrganizacion[]>(`/organizaciones/${id}/usuarios`),
    ])
      .then(([orgRes, usrRes]) => {
        if (activo) {
          setOrg(orgRes)
          setUsuarios(usrRes)
        }
      })
      .catch((err) => {
        if (activo) setError(err instanceof Error ? err.message : 'No se pudo cargar la organización')
      })
    return () => {
      activo = false
    }
  }, [id])

  async function retirarRol(usuario: UsuarioOrganizacion, codigo: string, torneoId: string | null, equipoId: string | null) {
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/usuarios/${usuario.usuarioId}/roles`, {
        method: 'DELETE',
        body: JSON.stringify({ codigo, organizacionId: id, torneoId, equipoId }),
      })
      setMensaje(`Se retiró el rol ${codigo} a ${usuario.email}`)
      const nuevos = await apiFetch<UsuarioOrganizacion[]>(`/organizaciones/${id}/usuarios`)
      setUsuarios(nuevos)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo retirar el rol')
    }
  }

  if (!org && !error) {
    return (
      <Layout>
        <p>Cargando…</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="titulo-acciones">
        <Link className="enlace" to="/organizaciones">
          ← Organizaciones
        </Link>
      </div>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}
      {org && (
        <>
          <h2>{org.nombre}</h2>
          <p>
            {org.descripcion ?? 'Sin descripción'} · {org.slug} · Zona horaria: {org.zonaHoraria}
          </p>

          <h3>Torneos</h3>
          {org.torneos.length === 0 && <p>Esta organización no tiene torneos.</p>}
          <ul className="lista">
            {org.torneos.map((t) => (
              <li key={t.id}>
                <Link className="enlace" to={`/torneos/${t.id}`}>
                  {t.nombre}
                </Link>{' '}
                · {t.estado}
              </li>
            ))}
          </ul>

          <h3>Usuarios</h3>
          {usuarios.length === 0 && <p>No hay usuarios con roles en esta organización.</p>}
          <ul className="lista">
            {usuarios.map((u) => (
              <li key={u.usuarioId}>
                <strong>{u.email}</strong>
                {u.nombre && (
                  <>
                    {' '}
                    — {u.nombre} {u.apellido}
                  </>
                )}
                <div className="acciones">
                  {u.roles.map((r) => (
                    <span key={`${r.codigo}-${r.torneoId ?? 'org'}-${r.equipoId ?? 'org'}`}>
                      <span className="estado">{r.codigo}</span>{' '}
                      <button
                        className="boton boton-peligro"
                        onClick={() => retirarRol(u, r.codigo, r.torneoId, r.equipoId)}
                      >
                        Retirar
                      </button>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Layout>
  )
}