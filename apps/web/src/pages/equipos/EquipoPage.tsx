import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { FormEvent } from 'react'
import { apiFetch } from '../../utils/api'
import Layout from '../../components/Layout'
import { useAuth } from '../../auth/useAuth'
import type { AdministradorEquipo, EquipoDetalle, JugadorPlantelEquipo } from './tipos'

const ESTADOS_JUGADOR = ['ACTIVO', 'INACTIVO', 'LESIONADO', 'SUSPENDIDO', 'INVITADO']

export default function EquipoPage() {
  const { id } = useParams<{ id: string }>()
  const { usuario } = useAuth()
  const [equipo, setEquipo] = useState<EquipoDetalle | null>(null)
  const [plantel, setPlantel] = useState<JugadorPlantelEquipo[]>([])
  const [seccion, setSeccion] = useState('plantel')
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const rolEnEquipo = usuario?.equipos.find((e) => e.equipoId === id)?.rolEnEquipo
  const esSuper = usuario?.permisos.includes('*') ?? false
  const esDelegado = esSuper || rolEnEquipo === 'DELEGADO'
  const gestionaPlantel = esDelegado || rolEnEquipo === 'TECNICO'

  const recargar = useCallback(async () => {
    if (!id) return
    const [eq, plant] = await Promise.all([
      apiFetch<EquipoDetalle>(`/equipos/${id}`),
      apiFetch<JugadorPlantelEquipo[]>(`/equipos/${id}/jugadores`),
    ])
    setEquipo(eq)
    setPlantel(plant)
  }, [id])

  useEffect(() => {
    let activo = true
    if (!id) return
    Promise.all([
      apiFetch<EquipoDetalle>(`/equipos/${id}`),
      apiFetch<JugadorPlantelEquipo[]>(`/equipos/${id}/jugadores`),
    ])
      .then(([eq, plant]) => {
        if (activo) {
          setEquipo(eq)
          setPlantel(plant)
        }
      })
      .catch((err) => {
        if (activo) setError(err instanceof Error ? err.message : 'No se pudo cargar el equipo')
      })
    return () => {
      activo = false
    }
  }, [id])

  async function accion(url: string, metodo: string, payload?: unknown, exito?: string) {
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(url, { method: metodo, body: payload !== undefined ? JSON.stringify(payload) : undefined })
      if (exito) setMensaje(exito)
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo completar la acción')
    }
  }

  if (!equipo) {
    return (
      <Layout>
        {error && <p className="error">{error}</p>}
        <p>Cargando equipo…</p>
      </Layout>
    )
  }

  const secciones = [
    { clave: 'plantel', titulo: 'Plantel' },
    { clave: 'jugadores', titulo: 'Jugadores' },
    { clave: 'administradores', titulo: 'Administradores' },
    { clave: 'config', titulo: 'Configuración' },
  ]

  return (
    <Layout>
      <h2>
        {equipo.escudoUrl && <img src={equipo.escudoUrl} alt="" style={{ height: 40, verticalAlign: 'middle', marginRight: 8 }} />}
        {equipo.nombre}
      </h2>
      <p>
        Estado: <strong>{equipo.estado}</strong> · {equipo.privado ? 'privado' : 'público'}
        {rolEnEquipo ? ` · tu rol: ${rolEnEquipo}` : ''}
      </p>
      <p>
        Jugadores: <strong>{equipo.cantidades.jugadores}</strong> · Bajas: {equipo.cantidades.bajas} · Delegados:{' '}
        {equipo.cantidades.delegados}
      </p>
      {error && <p className="error">{error}</p>}
      {mensaje && <p className="mensaje">{mensaje}</p>}

      <nav className="navbar">
        {secciones.map((s) => (
          <button key={s.clave} className="boton" onClick={() => setSeccion(s.clave)} style={seccion === s.clave ? { borderColor: '#2563eb' } : undefined}>
            {s.titulo}
          </button>
        ))}
      </nav>

      {['Formaciones', 'Convocatorias', 'Partidos', 'Caja'].map((f) => (
        <span key={f} className="enlace" style={{ marginRight: 12, opacity: 0.5 }}>
          {f} (próximamente)
        </span>
      ))}

      {seccion === 'plantel' && (
        <PlantelSection
          plantel={plantel}
          gestiona={gestionaPlantel}
          equipoId={equipo.id}
          onAccion={accion}
        />
      )}

      {seccion === 'jugadores' && (
        <div className="tarjeta">
          <h3>Jugadores</h3>
          <ul className="lista">
            {plantel.map((j) => (
              <li key={j.id}>
                <Link className="enlace" to={`/jugadores/${j.jugadorId}`}>
                  {j.nombre}
                </Link>{' '}
                · dorsal {j.dorsal ?? '—'} · {j.posiciones ?? 'sin posición'} · {j.estado}
              </li>
            ))}
            {plantel.length === 0 && <li>Sin jugadores.</li>}
          </ul>
        </div>
      )}

      {seccion === 'administradores' && esDelegado && (
        <AdministradoresSection
          administradores={equipo.administradores}
          equipoId={equipo.id}
          onAccion={accion}
        />
      )}

      {seccion === 'config' && esDelegado && (
        <ConfigSection equipo={equipo} onRecargar={recargar} setError={setError} setMensaje={setMensaje} />
      )}
    </Layout>
  )
}

function PlantelSection({
  plantel,
  gestiona,
  equipoId,
  onAccion,
}: {
  plantel: JugadorPlantelEquipo[]
  gestiona: boolean
  equipoId: string
  onAccion: (url: string, metodo: string, payload?: unknown, exito?: string) => Promise<void>
}) {
  const [jugadorId, setJugadorId] = useState('')
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [apellidoNuevo, setApellidoNuevo] = useState('')
  const [dniNuevo, setDniNuevo] = useState('')
  const [dorsalNuevo, setDorsalNuevo] = useState('')

  async function incorporar(e: FormEvent) {
    e.preventDefault()
    const payload = jugadorId
      ? { jugadorId, dorsal: dorsalNuevo ? Number(dorsalNuevo) : undefined }
      : {
          persona: { nombre: nombreNuevo, apellido: apellidoNuevo, dni: dniNuevo || undefined },
          dorsal: dorsalNuevo ? Number(dorsalNuevo) : undefined,
        }
    await onAccion(`/equipos/${equipoId}/jugadores`, 'POST', payload, 'Jugador incorporado')
    setJugadorId('')
    setNombreNuevo('')
    setApellidoNuevo('')
    setDniNuevo('')
    setDorsalNuevo('')
  }

  return (
    <>
      {gestiona && (
        <div className="tarjeta">
          <h3>Incorporar jugador</h3>
          <form onSubmit={incorporar}>
            <div className="campo">
              <label htmlFor="pl-jugadorId">Jugador existente (ID) o dejá vacío para crear nuevo</label>
              <input id="pl-jugadorId" value={jugadorId} onChange={(e) => setJugadorId(e.target.value)} placeholder="uuid del jugador" />
            </div>
            <div className="campo">
              <label htmlFor="pl-nombre">Nombre</label>
              <input id="pl-nombre" value={nombreNuevo} onChange={(e) => setNombreNuevo(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="pl-apellido">Apellido</label>
              <input id="pl-apellido" value={apellidoNuevo} onChange={(e) => setApellidoNuevo(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="pl-dni">DNI (opcional)</label>
              <input id="pl-dni" value={dniNuevo} onChange={(e) => setDniNuevo(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="pl-dorsal">Dorsal (opcional)</label>
              <input id="pl-dorsal" value={dorsalNuevo} onChange={(e) => setDorsalNuevo(e.target.value)} type="number" />
            </div>
            <button className="boton boton-primario" type="submit">
              Incorporar
            </button>
          </form>
        </div>
      )}

      <div className="tarjeta">
        <h3>Plantel actual</h3>
        <ul className="lista">
          {plantel.map((j) => (
            <li key={j.id}>
              <Link className="enlace" to={`/jugadores/${j.jugadorId}`}>
                {j.nombre}
              </Link>{' '}
              · dorsal {j.dorsal ?? '—'} · {j.posiciones ?? '—'} · <strong>{j.estado}</strong>
              {j.estado === 'BAJA' && ` · baja ${j.fechaSalida ? new Date(j.fechaSalida).toLocaleDateString() : ''}`}
              {gestiona && j.estado !== 'BAJA' && (
                <>
                  {' '}
                  <button
                    className="boton"
                    onClick={() => {
                      const dorsal = window.prompt('Dorsal', String(j.dorsal ?? ''))
                      if (dorsal !== null) void onAccion(`/equipo-jugadores/${j.id}`, 'PATCH', { dorsal: dorsal === '' ? null : Number(dorsal) })
                    }}
                  >
                    Dorsal
                  </button>{' '}
                  <button
                    className="boton"
                    onClick={() => {
                      const estado = window.prompt(`Estado (${ESTADOS_JUGADOR.join('/')})`, j.estado)
                      if (estado) void onAccion(`/equipo-jugadores/${j.id}/estado`, 'POST', { estado })
                    }}
                  >
                    Estado
                  </button>{' '}
                  <button
                    className="boton"
                    onClick={() => {
                      const motivo = window.prompt('Motivo de baja', '')
                      if (motivo !== null) void onAccion(`/equipo-jugadores/${j.id}/baja`, 'POST', { motivo: motivo || undefined }, 'Baja registrada')
                    }}
                  >
                    Baja
                  </button>
                </>
              )}
            </li>
          ))}
          {plantel.length === 0 && <li>Sin jugadores.</li>}
        </ul>
      </div>
    </>
  )
}

function AdministradoresSection({
  administradores,
  equipoId,
  onAccion,
}: {
  administradores: AdministradorEquipo[]
  equipoId: string
  onAccion: (url: string, metodo: string, payload?: unknown, exito?: string) => Promise<void>
}) {
  const [usuarioId, setUsuarioId] = useState('')
  const [rol, setRol] = useState('DELEGADO')

  async function agregar(e: FormEvent) {
    e.preventDefault()
    await onAccion(`/equipos/${equipoId}/administradores`, 'POST', { usuarioId, rolEnEquipo: rol }, 'Administrador agregado')
    setUsuarioId('')
  }

  return (
    <>
      <div className="tarjeta">
        <h3>Agregar administrador</h3>
        <form onSubmit={agregar}>
          <div className="campo">
            <label htmlFor="ad-usuario">ID de usuario</label>
            <input id="ad-usuario" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} required />
          </div>
          <div className="campo">
            <label htmlFor="ad-rol">Rol</label>
            <select id="ad-rol" value={rol} onChange={(e) => setRol(e.target.value)}>
              <option value="DELEGADO">DELEGADO</option>
              <option value="TECNICO">TECNICO</option>
              <option value="AUXILIAR">AUXILIAR</option>
            </select>
          </div>
          <button className="boton boton-primario" type="submit">
            Agregar
          </button>
        </form>
      </div>
      <div className="tarjeta">
        <h3>Administradores</h3>
        <ul className="lista">
          {administradores.map((a) => (
            <li key={a.id}>
              {a.usuario.nombre} {a.usuario.apellido} · {a.rolEnEquipo}
              <button
                className="boton"
                onClick={() => {
                  const nuevo = window.prompt('Nuevo rol (DELEGADO/TECNICO/AUXILIAR)', a.rolEnEquipo)
                  if (nuevo) void onAccion(`/equipos/${equipoId}/administradores/${a.id}`, 'PATCH', { rolEnEquipo: nuevo })
                }}
              >
                Cambiar rol
              </button>{' '}
              <button className="boton" onClick={() => void onAccion(`/equipos/${equipoId}/administradores/${a.id}/baja`, 'POST', undefined, 'Administrador dado de baja')}>
                Dar de baja
              </button>
            </li>
          ))}
          {administradores.length === 0 && <li>Sin administradores.</li>}
        </ul>
      </div>
    </>
  )
}

function ConfigSection({
  equipo,
  onRecargar,
  setError,
  setMensaje,
}: {
  equipo: EquipoDetalle
  onRecargar: () => Promise<void>
  setError: (v: string | null) => void
  setMensaje: (v: string | null) => void
}) {
  const [nombre, setNombre] = useState(equipo.nombre)
  const [descripcion, setDescripcion] = useState(equipo.descripcion ?? '')
  const [escudo, setEscudo] = useState(equipo.escudoUrl ?? '')
  const [categoria, setCategoria] = useState(equipo.categoriaHabitual ?? '')
  const [telefono, setTelefono] = useState(equipo.telefono ?? '')
  const [email, setEmail] = useState(equipo.email ?? '')
  const [privado, setPrivado] = useState(equipo.privado)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/equipos/${equipo.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          nombre,
          descripcion: descripcion || null,
          escudoUrl: escudo || null,
          categoriaHabitual: categoria || null,
          telefono: telefono || null,
          email: email || null,
          privado,
        }),
      })
      setMensaje('Equipo actualizado')
      await onRecargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar')
    }
  }

  return (
    <div className="tarjeta">
      <h3>Configuración del equipo</h3>
      <p className="mensaje">La información de contacto es privada y solo la ven los miembros del equipo.</p>
      <form onSubmit={guardar}>
        <div className="campo">
          <label htmlFor="cf-nombre">Nombre</label>
          <input id="cf-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </div>
        <div className="campo">
          <label htmlFor="cf-desc">Descripción</label>
          <input id="cf-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="cf-escudo">Escudo URL</label>
          <input id="cf-escudo" value={escudo} onChange={(e) => setEscudo(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="cf-cat">Categoría habitual</label>
          <input id="cf-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="cf-tel">Teléfono (privado)</label>
          <input id="cf-tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="cf-email">Email (privado)</label>
          <input id="cf-email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="campo">
          <label>
            <input type="checkbox" checked={privado} onChange={(e) => setPrivado(e.target.checked)} /> Equipo privado
          </label>
        </div>
        <button className="boton boton-primario" type="submit">
          Guardar
        </button>
      </form>
    </div>
  )
}
