import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PageState from '../components/PageState'
import StatusBadge from '../components/StatusBadge'
import { apiFetch } from '../utils/api'

type Zona = { id: string; nombre: string }
type Partido = {
  id: string
  fechaHora: string | null
  estado: string
  golesLocal: number | null
  golesVisitante: number | null
  equipoLocal: { nombre: string }
  equipoVisitante: { nombre: string }
}
type Fixture = { jornadas: Array<{ id: string; numero: number; nombre: string | null; fechaInicio: string | null; partidos: Partido[] }> }
type Tabla = {
  filas: Array<{ posicion: number; equipo: { nombre: string }; PJ: number; PG: number; PE: number; PP: number; GF: number; GC: number; DG: number; PTS: number }>
  criteriosNoDisponibles: string[]
}

const fecha = (valor: string | null) =>
  valor ? new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor)) : 'Fecha a confirmar'

function Marcador({ partido }: { partido: Partido }) {
  const jugado = partido.golesLocal !== null && partido.golesVisitante !== null
  return (
    <Link className="marcador" to={`/publico/partidos/${partido.id}`}>
      <span className="marcador-equipo marcador-local">{partido.equipoLocal.nombre}</span>
      <strong className="marcador-goles">{jugado ? `${partido.golesLocal}—${partido.golesVisitante}` : 'vs'}</strong>
      <span className="marcador-equipo">{partido.equipoVisitante.nombre}</span>
      <span className="marcador-meta">{fecha(partido.fechaHora)} <StatusBadge valor={partido.estado} /></span>
    </Link>
  )
}

export default function PublicCompetitionPage() {
  const { id } = useParams<{ id: string }>()
  const [zonas, setZonas] = useState<Zona[] | null>(null)
  const [zonaId, setZonaId] = useState<string | null>(null)
  const [fixture, setFixture] = useState<Fixture | null>(null)
  const [tabla, setTabla] = useState<Tabla | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let activo = true
    apiFetch<Zona[]>(`/publico/torneo-categorias/${id}/zonas`)
      .then((respuesta) => {
        if (!activo) return
        setZonas(respuesta)
        setZonaId(respuesta[0]?.id ?? null)
        setError(null)
      })
      .catch((e: unknown) => {
        if (activo) {
          setError(e instanceof Error ? e.message : 'No se pudo cargar la competencia')
          setZonas([])
        }
      })
    return () => { activo = false }
  }, [id])

  useEffect(() => {
    if (!id || zonas === null || (zonas.length > 0 && !zonaId)) return
    let activo = true
    const query = zonaId ? `?zonaId=${zonaId}` : ''
    Promise.all([
      apiFetch<Fixture>(`/publico/torneo-categorias/${id}/fixture${query}`),
      apiFetch<Tabla>(`/publico/torneo-categorias/${id}/tabla${query}`),
    ])
      .then(([nuevoFixture, nuevaTabla]) => {
        if (!activo) return
        setFixture(nuevoFixture)
        setTabla(nuevaTabla)
        setError(null)
      })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : 'No se pudo cargar fixture y tabla')
      })
    return () => { activo = false }
  }, [id, zonaId, zonas])

  return (
    <main className="cancha-publica">
      <header className="cancha-cabecera">
        <Link to="/publico/torneos" className="cancha-volver">Control Liga / Torneos</Link>
        <p>Centro de partidos</p>
        <h1>Fixture<br /><i>y resultados</i></h1>
        <span className="cancha-linea" aria-hidden="true" />
      </header>

      {error ? <PageState tipo="error" detalle={error} /> : !fixture || !tabla ? <PageState tipo="cargando" /> : (
        <>
          {zonas && zonas.length > 1 && <nav className="zonas" aria-label="Zonas de competencia">
            {zonas.map((zona) => <button className={zona.id === zonaId ? 'zona-activa' : ''} key={zona.id} onClick={() => setZonaId(zona.id)}>{zona.nombre}</button>)}
          </nav>}
          <div className="cancha-contenido">
            <section className="fixture-publico" aria-labelledby="fixture-titulo">
              <div className="cancha-titulo"><p>Calendario oficial</p><h2 id="fixture-titulo">Próximos partidos</h2></div>
              {fixture.jornadas.length === 0 ? <PageState tipo="vacio" detalle="Todavía no hay jornadas publicadas." /> : fixture.jornadas.map((jornada) => (
                <section className="jornada-publica" key={jornada.id}>
                  <header><span>J{String(jornada.numero).padStart(2, '0')}</span><h3>{jornada.nombre ?? 'Jornada'} <small>{fecha(jornada.fechaInicio)}</small></h3></header>
                  {jornada.partidos.map((partido) => <Marcador key={partido.id} partido={partido} />)}
                </section>
              ))}
            </section>
            <aside className="tabla-publica" aria-labelledby="tabla-titulo">
              <div className="cancha-titulo"><p>Clasificación</p><h2 id="tabla-titulo">La tabla</h2></div>
              <ol>
                {tabla.filas.map((fila) => <li key={fila.equipo.nombre}><span>{fila.posicion}</span><strong>{fila.equipo.nombre}</strong><b>{fila.PTS}</b><small>{fila.PJ} PJ</small></li>)}
              </ol>
              {tabla.criteriosNoDisponibles.length > 0 && <p className="tabla-nota">Pendiente: {tabla.criteriosNoDisponibles.join(', ')}.</p>}
            </aside>
          </div>
        </>
      )}
    </main>
  )
}
