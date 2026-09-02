import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { apiFetch } from '../../utils/api'
import Layout from '../../components/Layout'
import { useAuth } from '../../auth/useAuth'
import { PERMISOS } from '@controlliga/shared'
import StatusBadge from '../../components/StatusBadge'
import ToastRegion from '../../components/ToastRegion'
import ConfirmDialog from '../../components/ConfirmDialog'
import PageState from '../../components/PageState'
import PermissionGate from '../../components/PermissionGate'
import type { EstadisticasPartido, EventoPartido, PartidoDetalle } from './tipos'

const TRANSICIONES: Record<string, string[]> = {
  PROGRAMADO: ['EN_CURSO', 'SUSPENDIDO', 'APLAZADO'],
  EN_CURSO: ['FINALIZADO', 'SUSPENDIDO'],
  APLAZADO: ['PROGRAMADO', 'SUSPENDIDO'],
  SUSPENDIDO: ['PROGRAMADO'],
  FINALIZADO: [],
}

export default function PartidoPage() {
  const { id } = useParams<{ id: string }>()
  const { usuario } = useAuth()
  const [partido, setPartido] = useState<PartidoDetalle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [gLocal, setGLocal] = useState('')
  const [gVisitante, setGVisitante] = useState('')
  const [eventos, setEventos] = useState<EventoPartido[]>([])
  const [estadisticas, setEstadisticas] = useState<EstadisticasPartido | null>(null)
  const [tipoEvento, setTipoEvento] = useState('GOL')
  const [equipoEventoId, setEquipoEventoId] = useState('')
  const [jugadorEventoId, setJugadorEventoId] = useState('')
  const [minutoEvento, setMinutoEvento] = useState('')
  const [jugadorRelacionadoId, setJugadorRelacionadoId] = useState('')
  const [subtipoEvento, setSubtipoEvento] = useState('AMARILLA')
  const [periodoEvento, setPeriodoEvento] = useState('PRIMER_TIEMPO')
  const [editandoEvento, setEditandoEvento] = useState<EventoPartido | null>(null)
  const [anulandoEvento, setAnulandoEvento] = useState<EventoPartido | null>(null)

  const recargar = async () => {
    const d = await apiFetch<PartidoDetalle>(`/partidos/${id}`)
    setPartido(d)
    const [e, s] = await Promise.all([
      apiFetch<EventoPartido[]>(`/partidos/${id}/eventos`),
      apiFetch<EstadisticasPartido>(`/partidos/${id}/estadisticas`),
    ])
    setEventos(e)
    setEstadisticas(s)
  }

  useEffect(() => {
    if (id) {
      let a = true
      Promise.all([
        apiFetch<PartidoDetalle>(`/partidos/${id}`),
        apiFetch<EventoPartido[]>(`/partidos/${id}/eventos`),
        apiFetch<EstadisticasPartido>(`/partidos/${id}/estadisticas`),
      ])
        .then(([p, e, s]) => {
          if (a) {
            setPartido(p)
            setEventos(e)
            setEstadisticas(s)
          }
        })
        .catch((e) => {
          if (a) setError(e instanceof Error ? e.message : '')
        })
      return () => {
        a = false
      }
    }
  }, [id])

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
      setError(err instanceof Error ? err.message : 'No se pudo completar')
    }
  }

  async function cambiarEstado(estado: string) {
    await accion(`/partidos/${id}/estado`, 'POST', { estado }, 'Estado actualizado')
  }

  async function cargarResultado() {
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/partidos/${id}/resultado`, {
        method: 'POST',
        body: JSON.stringify({ golesLocal: Number(gLocal), golesVisitante: Number(gVisitante) }),
      })
      setMensaje('Resultado cargado')
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar')
    }
  }

  const esAdmin = partido
    ? usuario?.permisos.includes(PERMISOS.global) ||
      usuario?.equipos.some(
        (e) =>
          (e.equipoId === partido.equipoLocal?.id || e.equipoId === partido.equipoVisitante?.id) &&
          (e.rolEnEquipo === 'DELEGADO' || e.rolEnEquipo === 'TECNICO'),
      ) ||
      false
    : false
  const jugadoresEvento =
    partido?.formacionInstancias.flatMap((instancia) => instancia.jugadores) ?? []

  async function crearEvento() {
    const requiereJugador = ['GOL', 'TARJETA', 'ASISTENCIA', 'SUSTITUCION'].includes(tipoEvento)
    const requiereRelacionado = ['ASISTENCIA', 'SUSTITUCION'].includes(tipoEvento)
    if (
      !equipoEventoId ||
      (requiereJugador && !jugadorEventoId) ||
      (requiereRelacionado && !jugadorRelacionadoId)
    ) {
      setError('Seleccioná equipo y jugador para el evento')
      return
    }
    if (tipoEvento === 'SUSTITUCION' && !minutoEvento) {
      setError('La sustitución requiere minuto')
      return
    }
    await accion(
      `/partidos/${id}/eventos`,
      'POST',
      {
        equipoId: equipoEventoId,
        jugadorId: jugadorEventoId,
        tipo: tipoEvento,
        ...(minutoEvento ? { minuto: Number(minutoEvento) } : {}),
        ...(requiereRelacionado ? { jugadorRelacionadoId } : {}),
        ...(tipoEvento === 'TARJETA' ? { subtipo: subtipoEvento } : {}),
        ...(tipoEvento === 'SUSTITUCION' ? { periodo: periodoEvento } : {}),
      },
      'Evento cargado',
    )
    setMinutoEvento('')
    setJugadorRelacionadoId('')
  }

  function iniciarEdicion(evento: EventoPartido) {
    setEditandoEvento(evento)
    setTipoEvento(evento.tipo)
    setEquipoEventoId(evento.equipoId)
    setJugadorEventoId(evento.jugadorId ?? '')
    setJugadorRelacionadoId(evento.jugadorRelacionadoId ?? '')
    setMinutoEvento(evento.minuto?.toString() ?? '')
    setSubtipoEvento(evento.subtipo ?? 'AMARILLA')
    setPeriodoEvento(evento.periodo ?? 'PRIMER_TIEMPO')
  }

  async function guardarEvento() {
    if (!editandoEvento) return
    await accion(
      `/eventos-partido/${editandoEvento.id}`,
      'PATCH',
      {
        tipo: tipoEvento,
        equipoId: equipoEventoId,
        jugadorId: jugadorEventoId || undefined,
        jugadorRelacionadoId: jugadorRelacionadoId || undefined,
        minuto: minutoEvento ? Number(minutoEvento) : undefined,
        subtipo: tipoEvento === 'TARJETA' ? subtipoEvento : undefined,
        periodo: tipoEvento === 'SUSTITUCION' ? periodoEvento : undefined,
      },
      'Evento corregido',
    )
    setEditandoEvento(null)
  }

  if (!partido)
    return (
    <Layout>
        {error ? (
          <PageState tipo="error" detalle={error} onReintentar={() => void recargar()} />
        ) : (
          <PageState tipo="cargando" />
        )}
      </Layout>
    )

  return (
      <Layout>
        {partido?.llaveCompetencia && <section className="tarjeta"><strong>{partido.llaveCompetencia.rondaEliminatoria.nombre}</strong> · {partido.llaveCompetencia.rondaEliminatoria.formatoSerie === 'IDA_VUELTA' ? 'Serie ida/vuelta' : 'Partido único'} <StatusBadge valor={partido.llaveCompetencia.estado} />{partido.llaveCompetencia.partidos.map((serie) => <span key={serie.id}> · {serie.ordenSerie === 1 ? 'Ida' : 'Vuelta'} {serie.golesLocal ?? '-'}-{serie.golesVisitante ?? '-'}</span>)}{partido.llaveCompetencia.definicion?.tipo === 'PENALES' && ` · Penales ${partido.llaveCompetencia.definicion.penalesLocal}-${partido.llaveCompetencia.definicion.penalesVisitante}`}{partido.llaveCompetencia.definicion?.tipo === 'ADMINISTRATIVA' && ' · Definición administrativa'}</section>}
      <h2>
        {partido.equipoLocal?.nombre ?? '?'} vs {partido.equipoVisitante?.nombre ?? '?'}
      </h2>
      <p>
        {partido.tipo} · <StatusBadge valor={partido.estado} /> ·{' '}
        {new Date(partido.fechaHora).toLocaleString()} {partido.lugar ? `· ${partido.lugar}` : ''}
      </p>
      {partido.arbitro && <p>Árbitro: {partido.arbitro}</p>}
      {error && <p className="error">{error}</p>}
      <ToastRegion mensaje={mensaje} />

      {partido.golesLocal != null && (
        <div className="tarjeta">
          <h3>Resultado</h3>
          <p style={{ fontSize: '2em', fontWeight: 'bold' }}>
            {partido.golesLocal} - {partido.golesVisitante}
          </p>
        </div>
      )}

      <PermissionGate permitido={esAdmin && partido.estado !== 'FINALIZADO'}>
        <div className="tarjeta">
          <h3>Cargar resultado</h3>
          <div className="campo">
            <input
              type="number"
              min="0"
              value={gLocal}
              onChange={(e) => setGLocal(e.target.value)}
              placeholder="Goles local"
              style={{ width: 70 }}
            />
            {' - '}
            <input
              type="number"
              min="0"
              value={gVisitante}
              onChange={(e) => setGVisitante(e.target.value)}
              placeholder="Goles visitante"
              style={{ width: 70 }}
            />
          </div>
          <button className="boton boton-primario" onClick={() => void cargarResultado()}>
            Cargar
          </button>
        </div>
      </PermissionGate>

      <PermissionGate permitido={esAdmin && TRANSICIONES[partido.estado]?.length > 0}>
        <div className="tarjeta">
          <h3>Cambiar estado</h3>
          {TRANSICIONES[partido.estado].map((e) => (
            <button key={e} className="boton" onClick={() => void cambiarEstado(e)}>
              → {e}
            </button>
          ))}
        </div>
      </PermissionGate>

      <PermissionGate permitido={esAdmin}>
        <p>
          {partido.publicada ? (
            <button
              className="boton"
              onClick={() =>
                void accion(`/partidos/${id}/despublicar`, 'POST', undefined, 'Despublicado')
              }
            >
              Despublicar
            </button>
          ) : (
            <button
              className="boton"
              onClick={() =>
                void accion(`/partidos/${id}/publicar`, 'POST', undefined, 'Publicado')
              }
            >
              Publicar
            </button>
          )}
        </p>
      </PermissionGate>

      {partido.torneo && (
        <div className="tarjeta">
          <h3>Torneo</h3>
          <p>
            {partido.torneo.nombre} · {partido.temporada?.nombre ?? ''}
          </p>
        </div>
      )}

      <div className="tarjeta">
        <h3>Eventos</h3>
        <PermissionGate
          permitido={esAdmin && partido.estado !== 'FINALIZADO' && jugadoresEvento.length > 0}
        >
          <div className="eventos-formulario">
            <select
              aria-label="Tipo de evento"
              value={tipoEvento}
              onChange={(e) => setTipoEvento(e.target.value)}
            >
              <option value="GOL">Gol</option>
              <option value="ASISTENCIA">Asistencia</option>
              <option value="TARJETA">Tarjeta</option>
              <option value="SUSTITUCION">Sustitución</option>
            </select>
            {['ASISTENCIA', 'SUSTITUCION'].includes(tipoEvento) && (
              <select
                aria-label="Jugador relacionado"
                value={jugadorRelacionadoId}
                onChange={(e) => setJugadorRelacionadoId(e.target.value)}
              >
                <option value="">
                  {tipoEvento === 'ASISTENCIA' ? 'Asistente' : 'Jugador que entra'}
                </option>
                {jugadoresEvento.map((jugador) => (
                  <option key={jugador.jugadorId} value={jugador.jugadorId}>
                    {jugador.nombreSnapshot}
                  </option>
                ))}
              </select>
            )}
            {tipoEvento === 'TARJETA' && (
              <select
                aria-label="Tipo de tarjeta"
                value={subtipoEvento}
                onChange={(e) => setSubtipoEvento(e.target.value)}
              >
                <option value="AMARILLA">Amarilla</option>
                <option value="ROJA">Roja</option>
              </select>
            )}
            {tipoEvento === 'SUSTITUCION' && (
              <select
                aria-label="Período"
                value={periodoEvento}
                onChange={(e) => setPeriodoEvento(e.target.value)}
              >
                <option value="PRIMER_TIEMPO">Primer tiempo</option>
                <option value="SEGUNDO_TIEMPO">Segundo tiempo</option>
              </select>
            )}
            <select
              aria-label="Equipo del evento"
              value={equipoEventoId}
              onChange={(e) => {
                setEquipoEventoId(e.target.value)
                setJugadorEventoId('')
              }}
            >
              <option value="">Equipo</option>
              {partido.equipoLocal && (
                <option value={partido.equipoLocal.id}>{partido.equipoLocal.nombre}</option>
              )}
              {partido.equipoVisitante && (
                <option value={partido.equipoVisitante.id}>{partido.equipoVisitante.nombre}</option>
              )}
            </select>
            <select
              aria-label="Jugador del evento"
              value={jugadorEventoId}
              onChange={(e) => setJugadorEventoId(e.target.value)}
            >
              <option value="">Jugador</option>
              {jugadoresEvento.map((jugador) => (
                <option key={jugador.jugadorId} value={jugador.jugadorId}>
                  {jugador.nombreSnapshot}
                </option>
              ))}
            </select>
            <input
              aria-label="Minuto del evento"
              type="number"
              min="0"
              placeholder="Minuto opcional"
              value={minutoEvento}
              onChange={(e) => setMinutoEvento(e.target.value)}
            />
            <button
              className="boton boton-primario"
              onClick={() => void (editandoEvento ? guardarEvento() : crearEvento())}
            >
              {editandoEvento ? 'Guardar corrección' : 'Agregar evento'}
            </button>
            {editandoEvento && (
              <button className="boton" onClick={() => setEditandoEvento(null)}>
                Cancelar edición
              </button>
            )}
          </div>
        </PermissionGate>
        {eventos.length === 0 ? (
          <p>Sin eventos cargados.</p>
        ) : (
          <ul className="lista">
            {eventos.map((e) => (
              <li key={e.id}>
                {e.anulado ? 'ANULADO · ' : ''}
                {e.minuto != null ? `${e.minuto}' ` : ''}
                {e.tipo} {e.subtipo ?? ''}
                <PermissionGate permitido={esAdmin && !e.anulado}>
                  <span className="acciones">
                    <button className="boton" onClick={() => iniciarEdicion(e)}>
                      Corregir
                    </button>
                    <button className="boton boton-peligro" onClick={() => setAnulandoEvento(e)}>
                      Anular
                    </button>
                  </span>
                </PermissionGate>
              </li>
            ))}
          </ul>
        )}
      </div>
      <ConfirmDialog
        abierto={anulandoEvento !== null}
        titulo="Anular evento"
        detalle="El evento quedará anulado y conservará su historial."
        confirmar="Anular evento"
        onCancelar={() => setAnulandoEvento(null)}
        onConfirmar={() => {
          if (anulandoEvento) {
            void accion(
              `/eventos-partido/${anulandoEvento.id}/anular`,
              'POST',
              undefined,
              'Evento anulado',
            )
            setAnulandoEvento(null)
          }
        }}
      />
      <div className="tarjeta">
        <h3>Estadísticas</h3>
        {estadisticas?.jugadores.length ? (
          <ul className="lista">
            {estadisticas.jugadores.map((e) => (
              <li key={e.jugadorId}>
                {e.jugadorId} · {e.goles} goles · {e.asistencias} asistencias · {e.amarillas}{' '}
                amarillas · {e.rojas} rojas ·{' '}
                {e.minutosNoDeterminados ? 'minutos no determinados' : `${e.minutos} minutos`}
              </li>
            ))}
          </ul>
        ) : (
          <p>Sin estadísticas.</p>
        )}
      </div>

      {partido.formacionInstancias.length > 0 && (
        <div className="tarjeta">
          <h3>Formaciones</h3>
          {partido.formacionInstancias.map((fi) => (
            <div key={fi.id}>
              <p>Formación del partido:</p>
              <ul className="lista">
                {fi.jugadores.map((j) => (
                  <li key={j.nombreSnapshot + j.posicion}>
                    {j.nombreSnapshot} · dorsal {j.dorsalSnapshot ?? '—'} · {j.posicion} ·{' '}
                    {j.esTitular ? 'TITULAR' : 'SUPLENTE'}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {partido.convocatorias.length > 0 && (
        <div className="tarjeta">
          <h3>Convocatorias</h3>
          {partido.convocatorias.map((c) => (
            <div key={c.id}>
              <p>Jugadores convocados ({c.cancelada ? 'cancelada' : 'activa'}):</p>
              <ul className="lista">
                {c.jugadores.map((j) => (
                  <li key={j.equipoJugador.jugador.persona.nombre}>
                    {j.equipoJugador.jugador.persona.nombre}{' '}
                    {j.equipoJugador.jugador.persona.apellido} · {j.estado}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Layout>
  )
}
