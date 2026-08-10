import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { FormEvent } from 'react'
import { PERMISOS } from '@controlliga/shared'
import { apiFetch } from '../../utils/api'
import Layout from '../../components/Layout'
import { useAuth } from '../../auth/useAuth'
import TemporadasSection from './TemporadasSection'
import CategoriasSection from './CategoriasSection'
import ZonasSection from './ZonasSection'
import EquiposSection from './EquiposSection'
import JugadoresSection from './JugadoresSection'
import ConfigPublicaSection from './ConfigPublicaSection'
import { TRANSICIONES_TORNEO } from './tipos'
import type { CategoriaGlobal, TemporadaDetalle, Torneo } from './tipos'

const TABS = ['resumen', 'config', 'temporadas', 'categorias', 'zonas', 'equipos', 'jugadores', 'publico'] as const
type Tab = (typeof TABS)[number]

export default function TorneoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { usuario } = useAuth()
  const [torneo, setTorneo] = useState<Torneo | null>(null)
  const [categorias, setCategorias] = useState<CategoriaGlobal[]>([])
  const [temporadaId, setTemporadaId] = useState<string | null>(null)
  const [temporadaDetalle, setTemporadaDetalle] = useState<TemporadaDetalle | null>(null)
  const [competicionId, setCompeticionId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('resumen')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const esAdmin = usuario ? usuario.permisos.includes(PERMISOS.global) || usuario.permisos.includes(PERMISOS.torneosAdministrar) : false

  const recargar = useCallback(async () => {
    if (!id) return
    const data = await apiFetch<Torneo>(`/torneos/${id}`)
    setTorneo(data)
    const cats = await apiFetch<CategoriaGlobal[]>('/categorias')
    setCategorias(cats)
    if (temporadaId) {
      const detalle = await apiFetch<TemporadaDetalle>(`/temporadas/${temporadaId}`)
      setTemporadaDetalle(detalle)
    }
  }, [id, temporadaId])

  useEffect(() => {
    if (!id) return
    let activo = true
    apiFetch<Torneo>(`/torneos/${id}`)
      .then((data) => {
        if (activo) setTorneo(data)
      })
      .catch((err) => {
        if (activo) setError(err instanceof Error ? err.message : 'No se pudo cargar el torneo')
      })
    apiFetch<CategoriaGlobal[]>('/categorias')
      .then((cats) => {
        if (activo) setCategorias(cats)
      })
      .catch(() => undefined)
    return () => {
      activo = false
    }
  }, [id])

  useEffect(() => {
    if (!temporadaId) return
    let activo = true
    apiFetch<TemporadaDetalle>(`/temporadas/${temporadaId}`)
      .then((detalle) => {
        if (activo) setTemporadaDetalle(detalle)
      })
      .catch(() => undefined)
    return () => {
      activo = false
    }
  }, [temporadaId])

  async function cambiarEstadoTorneo(estado: string) {
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/torneos/${id}/estado`, { method: 'POST', body: JSON.stringify({ estado }) })
      setMensaje('Estado actualizado')
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado')
    }
  }

  async function guardarConfig(e: FormEvent) {
    e.preventDefault()
    if (!torneo) return
    const form = e.currentTarget as HTMLFormElement
    const datos = Object.fromEntries(new FormData(form))
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/torneos/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nombre: datos.nombre as string,
          descripcion: (datos.descripcion as string) || null,
          reglas: (datos.reglas as string) || null,
          logoUrl: (datos.logoUrl as string) || null,
          visiblePublico: false,
        }),
      })
      setMensaje('Torneo actualizado')
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar')
    }
  }

  if (!torneo) {
    return (
      <Layout>
        {error && <p className="error">{error}</p>}
        <p>Cargando torneo…</p>
      </Layout>
    )
  }

  const tabsVisibles: Tab[] = esAdmin ? [...TABS] : (['resumen', 'equipos', 'jugadores'] as Tab[])

  const zonasDeCompeticion = temporadaDetalle?.torneoCategorias.find((tc) => tc.id === competicionId)?.zonas ?? []

  return (
    <Layout>
      <h2>Torneo: {torneo.nombre}</h2>
      <p>
        Organización: <strong>{torneo.organizacion?.nombre ?? torneo.organizacionId}</strong> · Estado:{' '}
        <strong>{torneo.estado}</strong>
      </p>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}

      <nav className="navbar">
        {tabsVisibles.map((t) => (
          <button key={t} className="boton" onClick={() => setTab(t)} style={tab === t ? { borderColor: '#2563eb' } : undefined}>
            {t}
          </button>
        ))}
      </nav>

      {tab === 'resumen' && (
        <div className="tarjeta">
          <h3>Resumen</h3>
          <p>
            {torneo._count?.temporadas ?? 0} temporadas · {torneo._count?.participaciones ?? 0} participaciones ·{' '}
            {torneo._count?.partidos ?? 0} partidos
          </p>
          {esAdmin && TRANSICIONES_TORNEO[torneo.estado]?.length > 0 && (
            <p>
              Cambiar estado:{' '}
              {TRANSICIONES_TORNEO[torneo.estado].map((siguiente) => (
                <button key={siguiente} className="boton" onClick={() => void cambiarEstadoTorneo(siguiente)}>
                  → {siguiente}
                </button>
              ))}
            </p>
          )}
        </div>
      )}

      {tab === 'config' && esAdmin && (
        <div className="tarjeta">
          <h3>Configuración</h3>
          <form onSubmit={guardarConfig}>
            <div className="campo">
              <label htmlFor="t-nombre">Nombre</label>
              <input id="t-nombre" name="nombre" defaultValue={torneo.nombre} required />
            </div>
            <div className="campo">
              <label htmlFor="t-desc">Descripción</label>
              <input id="t-desc" name="descripcion" defaultValue={torneo.descripcion ?? ''} />
            </div>
            <div className="campo">
              <label htmlFor="t-reglas">Reglas</label>
              <input id="t-reglas" name="reglas" defaultValue={torneo.reglas ?? ''} />
            </div>
            <div className="campo">
              <label htmlFor="t-logo">Logo URL</label>
              <input id="t-logo" name="logoUrl" defaultValue={torneo.logoUrl ?? ''} />
            </div>
            <button className="boton boton-primario" type="submit">
              Guardar
            </button>
          </form>
        </div>
      )}

      {tab === 'temporadas' && esAdmin && (
        <TemporadasSection
          torneoId={torneo.id}
          temporadas={torneo.temporadas ?? []}
          temporadaActiva={temporadaId}
          onSeleccionar={(t) => {
            setTemporadaId(t)
            setCompeticionId(null)
          }}
          onRecargar={recargar}
        />
      )}

      {tab === 'categorias' && esAdmin && (
        <CategoriasSection
          torneoId={torneo.id}
          temporadaId={temporadaId ?? ''}
          torneoCategorias={temporadaDetalle?.torneoCategorias ?? []}
          categorias={categorias}
          competicionActiva={competicionId}
          onSeleccionarCompeticion={setCompeticionId}
          onRecargar={recargar}
        />
      )}

      {tab === 'zonas' && esAdmin && (
        <ZonasSection
          competicionId={competicionId}
          zonas={zonasDeCompeticion}
          participaciones={temporadaDetalle?.participaciones ?? []}
          onRecargar={recargar}
        />
      )}

      {tab === 'equipos' && (
        <EquiposSection
          torneoId={torneo.id}
          temporadaId={temporadaId ?? ''}
          participaciones={temporadaDetalle?.participaciones ?? []}
          torneoCategorias={temporadaDetalle?.torneoCategorias ?? []}
          onRecargar={recargar}
        />
      )}

      {tab === 'jugadores' && (
        <JugadoresSection participaciones={temporadaDetalle?.participaciones ?? []} onRecargar={recargar} />
      )}

      {tab === 'publico' && esAdmin && torneo && (
        <ConfigPublicaSection
          torneoId={torneo.id}
          configuracionPublica={torneo.configuracionPublica}
          visiblePublico={torneo.visiblePublico}
          onRecargar={recargar}
        />
      )}
    </Layout>
  )
}
