import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { FormEvent } from 'react'
import { apiFetch } from '../../utils/api'
import Layout from '../../components/Layout'
import { useAuth } from '../../auth/useAuth'
import ConfirmDialog from '../../components/ConfirmDialog'
import PermissionGate from '../../components/PermissionGate'
import ToastRegion from '../../components/ToastRegion'
import type {
  AdministradorEquipo,
  EquipoDetalle,
  InvitacionEquipo,
  JugadorPlantelEquipo,
} from './tipos'

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
    ...(esSuper || rolEnEquipo ? [{ clave: 'invitaciones', titulo: 'Invitaciones' }] : []),
  ]

  return (
    <Layout>
      <h2>
        {equipo.escudoUrl && (
          <img
            src={equipo.escudoUrl}
            alt=""
            style={{ height: 40, verticalAlign: 'middle', marginRight: 8 }}
          />
        )}
        {equipo.nombre}
      </h2>
      <p>
        Estado: <strong>{equipo.estado}</strong> · {equipo.privado ? 'privado' : 'público'}
        {rolEnEquipo ? ` · tu rol: ${rolEnEquipo}` : ''}
      </p>
      <p>
        Jugadores: <strong>{equipo.cantidades.jugadores}</strong> · Bajas: {equipo.cantidades.bajas}{' '}
        · Delegados: {equipo.cantidades.delegados}
      </p>
      {error && <p className="error">{error}</p>}
      <ToastRegion mensaje={mensaje} />

      <nav className="navbar">
        {secciones.map((s) => (
          <button
            key={s.clave}
            className="boton"
            onClick={() => setSeccion(s.clave)}
            style={seccion === s.clave ? { borderColor: '#2563eb' } : undefined}
          >
            {s.titulo}
          </button>
        ))}
      </nav>

      {['Formaciones', 'Convocatorias', 'Partidos'].map((f) => (
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

      {seccion === 'administradores' && (
        <PermissionGate
          permitido={esDelegado}
          alternativo={<p className="tarjeta">No tenés permiso para administrar este equipo.</p>}
        >
          <AdministradoresSection
            administradores={equipo.administradores}
            equipoId={equipo.id}
            onAccion={accion}
          />
        </PermissionGate>
      )}

      {seccion === 'config' && esDelegado && (
        <ConfigSection
          equipo={equipo}
          onRecargar={recargar}
          setError={setError}
          setMensaje={setMensaje}
        />
      )}

      {seccion === 'invitaciones' && (
        <InvitacionesSection
          equipoId={equipo.id}
          puedeInvitarJugador={esDelegado || rolEnEquipo === 'TECNICO'}
          puedeInvitarCuerpo={esDelegado}
        />
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
  const [jugadorEditando, setJugadorEditando] = useState<JugadorPlantelEquipo | null>(null)
  const [dorsalEdicion, setDorsalEdicion] = useState('')
  const [estadoEdicion, setEstadoEdicion] = useState('ACTIVO')
  const [bajaPendiente, setBajaPendiente] = useState<JugadorPlantelEquipo | null>(null)

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
              <label htmlFor="pl-jugadorId">
                Jugador existente (ID) o dejá vacío para crear nuevo
              </label>
              <input
                id="pl-jugadorId"
                value={jugadorId}
                onChange={(e) => setJugadorId(e.target.value)}
                placeholder="uuid del jugador"
              />
            </div>
            <div className="campo">
              <label htmlFor="pl-nombre">Nombre</label>
              <input
                id="pl-nombre"
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="pl-apellido">Apellido</label>
              <input
                id="pl-apellido"
                value={apellidoNuevo}
                onChange={(e) => setApellidoNuevo(e.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="pl-dni">DNI (opcional)</label>
              <input id="pl-dni" value={dniNuevo} onChange={(e) => setDniNuevo(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="pl-dorsal">Dorsal (opcional)</label>
              <input
                id="pl-dorsal"
                value={dorsalNuevo}
                onChange={(e) => setDorsalNuevo(e.target.value)}
                type="number"
              />
            </div>
            <button className="boton boton-primario" type="submit">
              Incorporar
            </button>
          </form>
        </div>
      )}

      <div className="tarjeta">
        <h3>Plantel actual</h3>
        {jugadorEditando && (
          <form
            className="tarjeta"
            onSubmit={(e) => {
              e.preventDefault()
              void onAccion(
                `/equipo-jugadores/${jugadorEditando.id}`,
                'PATCH',
                { dorsal: dorsalEdicion === '' ? null : Number(dorsalEdicion) },
                'Dorsal actualizado',
              ).then(() => setJugadorEditando(null))
            }}
          >
            <h4>Editar {jugadorEditando.nombre}</h4>
            <div className="campo">
              <label htmlFor="plantel-dorsal-edicion">Dorsal</label>
              <input
                id="plantel-dorsal-edicion"
                type="number"
                value={dorsalEdicion}
                onChange={(e) => setDorsalEdicion(e.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="plantel-estado-edicion">Estado</label>
              <select
                id="plantel-estado-edicion"
                value={estadoEdicion}
                onChange={(e) => setEstadoEdicion(e.target.value)}
              >
                {ESTADOS_JUGADOR.map((estado) => (
                  <option key={estado} value={estado}>
                    {estado}
                  </option>
                ))}
              </select>
            </div>
            <div className="acciones">
              <button className="boton boton-primario" type="submit">
                Guardar dorsal
              </button>
              <button
                className="boton"
                type="button"
                onClick={() =>
                  void onAccion(
                    `/equipo-jugadores/${jugadorEditando.id}/estado`,
                    'POST',
                    { estado: estadoEdicion },
                    'Estado actualizado',
                  ).then(() => setJugadorEditando(null))
                }
              >
                Guardar estado
              </button>
              <button className="boton" type="button" onClick={() => setJugadorEditando(null)}>
                Cancelar
              </button>
            </div>
          </form>
        )}
        <ul className="lista">
          {plantel.map((j) => (
            <li key={j.id}>
              <Link className="enlace" to={`/jugadores/${j.jugadorId}`}>
                {j.nombre}
              </Link>{' '}
              · dorsal {j.dorsal ?? '—'} · {j.posiciones ?? '—'} · <strong>{j.estado}</strong>
              {j.estado === 'BAJA' &&
                ` · baja ${j.fechaSalida ? new Date(j.fechaSalida).toLocaleDateString() : ''}`}
              <PermissionGate permitido={gestiona && j.estado !== 'BAJA'}>
                {' '}
                <button
                  className="boton"
                  onClick={() => {
                    setJugadorEditando(j)
                    setDorsalEdicion(j.dorsal?.toString() ?? '')
                    setEstadoEdicion(j.estado)
                  }}
                >
                  Dorsal
                </button>{' '}
                <button
                  className="boton"
                  onClick={() => {
                    setJugadorEditando(j)
                    setDorsalEdicion(j.dorsal?.toString() ?? '')
                    setEstadoEdicion(j.estado)
                  }}
                >
                  Estado
                </button>{' '}
                <button className="boton" onClick={() => setBajaPendiente(j)}>
                  Baja
                </button>
              </PermissionGate>
            </li>
          ))}
          {plantel.length === 0 && <li>Sin jugadores.</li>}
        </ul>
      </div>
      <ConfirmDialog
        abierto={bajaPendiente !== null}
        titulo="Dar de baja jugador"
        detalle={`La baja de ${bajaPendiente?.nombre ?? 'este jugador'} conserva su historial.`}
        confirmar="Dar de baja"
        onCancelar={() => setBajaPendiente(null)}
        onConfirmar={() => {
          if (bajaPendiente) {
            void onAccion(
              `/equipo-jugadores/${bajaPendiente.id}/baja`,
              'POST',
              undefined,
              'Baja registrada',
            )
            setBajaPendiente(null)
          }
        }}
      />
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
  const [administradorEditando, setAdministradorEditando] = useState<AdministradorEquipo | null>(
    null,
  )
  const [rolEdicion, setRolEdicion] = useState('DELEGADO')
  const [bajaAdministrador, setBajaAdministrador] = useState<AdministradorEquipo | null>(null)

  async function agregar(e: FormEvent) {
    e.preventDefault()
    await onAccion(
      `/equipos/${equipoId}/administradores`,
      'POST',
      { usuarioId, rolEnEquipo: rol },
      'Administrador agregado',
    )
    setUsuarioId('')
  }

  return (
    <>
      <div className="tarjeta">
        <h3>Agregar administrador</h3>
        <form onSubmit={agregar}>
          <div className="campo">
            <label htmlFor="ad-usuario">ID de usuario</label>
            <input
              id="ad-usuario"
              value={usuarioId}
              onChange={(e) => setUsuarioId(e.target.value)}
              required
            />
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
        {administradorEditando && (
          <form
            className="acciones"
            onSubmit={(e) => {
              e.preventDefault()
              void onAccion(
                `/equipos/${equipoId}/administradores/${administradorEditando.id}`,
                'PATCH',
                { rolEnEquipo: rolEdicion },
                'Rol actualizado',
              ).then(() => setAdministradorEditando(null))
            }}
          >
            <label htmlFor="admin-rol-edicion">Rol de {administradorEditando.usuario.nombre}</label>
            <select
              id="admin-rol-edicion"
              value={rolEdicion}
              onChange={(e) => setRolEdicion(e.target.value)}
            >
              <option value="DELEGADO">DELEGADO</option>
              <option value="TECNICO">TECNICO</option>
              <option value="AUXILIAR">AUXILIAR</option>
            </select>
            <button className="boton boton-primario">Guardar rol</button>
            <button className="boton" type="button" onClick={() => setAdministradorEditando(null)}>
              Cancelar
            </button>
          </form>
        )}
        <ul className="lista">
          {administradores.map((a) => (
            <li key={a.id}>
              {a.usuario.nombre} {a.usuario.apellido} · {a.rolEnEquipo}
              <button
                className="boton"
                onClick={() => {
                  setAdministradorEditando(a)
                  setRolEdicion(a.rolEnEquipo)
                }}
              >
                Cambiar rol
              </button>{' '}
              <button className="boton" onClick={() => setBajaAdministrador(a)}>
                Dar de baja
              </button>
            </li>
          ))}
          {administradores.length === 0 && <li>Sin administradores.</li>}
        </ul>
      </div>
      <ConfirmDialog
        abierto={bajaAdministrador !== null}
        titulo="Dar de baja administrador"
        detalle={`Se revocará acceso de ${bajaAdministrador?.usuario.nombre ?? 'este administrador'} al equipo.`}
        confirmar="Dar de baja"
        onCancelar={() => setBajaAdministrador(null)}
        onConfirmar={() => {
          if (bajaAdministrador) {
            void onAccion(
              `/equipos/${equipoId}/administradores/${bajaAdministrador.id}/baja`,
              'POST',
              undefined,
              'Administrador dado de baja',
            )
            setBajaAdministrador(null)
          }
        }}
      />
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
      <p className="mensaje">
        La información de contacto es privada y solo la ven los miembros del equipo.
      </p>
      <form onSubmit={guardar}>
        <div className="campo">
          <label htmlFor="cf-nombre">Nombre</label>
          <input
            id="cf-nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
          />
        </div>
        <div className="campo">
          <label htmlFor="cf-desc">Descripción</label>
          <input
            id="cf-desc"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
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
            <input
              type="checkbox"
              checked={privado}
              onChange={(e) => setPrivado(e.target.checked)}
            />{' '}
            Equipo privado
          </label>
        </div>
        <button className="boton boton-primario" type="submit">
          Guardar
        </button>
      </form>
    </div>
  )
}

function InvitacionesSection({
  equipoId,
  puedeInvitarJugador,
  puedeInvitarCuerpo,
}: {
  equipoId: string
  puedeInvitarJugador: boolean
  puedeInvitarCuerpo: boolean
}) {
  const [invitaciones, setInvitaciones] = useState<InvitacionEquipo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<string | null>(null)

  const [jugadorId, setJugadorId] = useState('')
  const [personaNombre, setPersonaNombre] = useState('')
  const [personaApellido, setPersonaApellido] = useState('')
  const [personaDni, setPersonaDni] = useState('')
  const [mensajeInv, setMensajeInv] = useState('')

  const [emailCuerpo, setEmailCuerpo] = useState('')
  const [rolCuerpo, setRolCuerpo] = useState('TECNICO')
  const [mensajeCuerpo, setMensajeCuerpo] = useState('')

  const recargar = useCallback(async () => {
    const data = await apiFetch<InvitacionEquipo[]>(`/equipos/${equipoId}/invitaciones`)
    setInvitaciones(data)
  }, [equipoId])

  useEffect(() => {
    let activo = true
    apiFetch<InvitacionEquipo[]>(`/equipos/${equipoId}/invitaciones`)
      .then((data) => {
        if (activo) setInvitaciones(data)
      })
      .catch((err) => {
        if (activo)
          setError(err instanceof Error ? err.message : 'No se pudieron cargar las invitaciones')
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [equipoId])

  async function invitarJugador(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/equipos/${equipoId}/invitaciones-jugador`, {
        method: 'POST',
        body: JSON.stringify(
          jugadorId
            ? { jugadorId, mensaje: mensajeInv || undefined }
            : {
                persona: {
                  nombre: personaNombre,
                  apellido: personaApellido,
                  dni: personaDni || undefined,
                },
                mensaje: mensajeInv || undefined,
              },
        ),
      })
      setMensaje('Invitación enviada')
      setJugadorId('')
      setPersonaNombre('')
      setPersonaApellido('')
      setPersonaDni('')
      setMensajeInv('')
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la invitación')
    }
  }

  async function invitarCuerpo(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setMensaje(null)
    try {
      const res = await apiFetch<{ existe: boolean }>(`/equipos/${equipoId}/invitaciones-cuerpo`, {
        method: 'POST',
        body: JSON.stringify({
          email: emailCuerpo,
          rolEnEquipo: rolCuerpo,
          mensaje: mensajeCuerpo || undefined,
        }),
      })
      setMensaje(res.existe ? 'Invitación enviada' : 'No existe una cuenta con ese email')
      setEmailCuerpo('')
      setMensajeCuerpo('')
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la invitación')
    }
  }

  async function revocar(id: string) {
    setError(null)
    setMensaje(null)
    try {
      await apiFetch(`/invitaciones/${id}/revocar`, { method: 'POST' })
      setMensaje('Invitación revocada')
      await recargar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo revocar la invitación')
    }
  }

  return (
    <>
      {(puedeInvitarJugador || puedeInvitarCuerpo) && (
        <div className="grid">
          {puedeInvitarJugador && (
            <div className="tarjeta">
              <h3>Invitar jugador</h3>
              <form onSubmit={invitarJugador}>
                <div className="campo">
                  <label htmlFor="ij-id">
                    Jugador existente (ID) o vacío para crear persona nueva
                  </label>
                  <input
                    id="ij-id"
                    value={jugadorId}
                    onChange={(e) => setJugadorId(e.target.value)}
                    placeholder="uuid del jugador"
                  />
                </div>
                <div className="campo">
                  <label htmlFor="ij-nombre">Nombre (persona nueva)</label>
                  <input
                    id="ij-nombre"
                    value={personaNombre}
                    onChange={(e) => setPersonaNombre(e.target.value)}
                  />
                </div>
                <div className="campo">
                  <label htmlFor="ij-apellido">Apellido (persona nueva)</label>
                  <input
                    id="ij-apellido"
                    value={personaApellido}
                    onChange={(e) => setPersonaApellido(e.target.value)}
                  />
                </div>
                <div className="campo">
                  <label htmlFor="ij-dni">DNI (opcional)</label>
                  <input
                    id="ij-dni"
                    value={personaDni}
                    onChange={(e) => setPersonaDni(e.target.value)}
                  />
                </div>
                <div className="campo">
                  <label htmlFor="ij-mensaje">Mensaje (opcional)</label>
                  <input
                    id="ij-mensaje"
                    value={mensajeInv}
                    onChange={(e) => setMensajeInv(e.target.value)}
                  />
                </div>
                <button className="boton boton-primario" type="submit">
                  Invitar jugador
                </button>
              </form>
            </div>
          )}
          {puedeInvitarCuerpo && (
            <div className="tarjeta">
              <h3>Invitar al cuerpo técnico</h3>
              <form onSubmit={invitarCuerpo}>
                <div className="campo">
                  <label htmlFor="ic-email">Email</label>
                  <input
                    id="ic-email"
                    type="email"
                    value={emailCuerpo}
                    onChange={(e) => setEmailCuerpo(e.target.value)}
                    required
                  />
                </div>
                <div className="campo">
                  <label htmlFor="ic-rol">Rol</label>
                  <select
                    id="ic-rol"
                    value={rolCuerpo}
                    onChange={(e) => setRolCuerpo(e.target.value)}
                  >
                    <option value="DELEGADO">DELEGADO</option>
                    <option value="TECNICO">TECNICO</option>
                    <option value="AUXILIAR">AUXILIAR</option>
                  </select>
                </div>
                <div className="campo">
                  <label htmlFor="ic-mensaje">Mensaje (opcional)</label>
                  <input
                    id="ic-mensaje"
                    value={mensajeCuerpo}
                    onChange={(e) => setMensajeCuerpo(e.target.value)}
                  />
                </div>
                <button className="boton boton-primario" type="submit">
                  Invitar
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      <div className="tarjeta">
        <h3>Historial de invitaciones</h3>
        {error && <p className="error">{error}</p>}
        {mensaje && <p className="mensaje">{mensaje}</p>}
        {cargando && <p>Cargando…</p>}
        {!cargando && invitaciones.length === 0 && <p className="mensaje">Sin invitaciones.</p>}
        {!cargando && invitaciones.length > 0 && (
          <ul className="lista">
            {invitaciones.map((inv) => (
              <li key={inv.id}>
                {inv.destinatario
                  ? `${inv.destinatario.nombre ?? ''} ${inv.destinatario.apellido ?? ''}`.trim()
                  : '—'}{' '}
                ·{' '}
                {inv.tipo === 'JUGADOR' ? 'jugador' : `cuerpo técnico (${inv.rolEnEquipo ?? '—'})`}{' '}
                · <span className="estado">{inv.estado}</span> ·{' '}
                {new Date(inv.createdAt).toLocaleDateString()}
                {inv.estado === 'PENDIENTE' && (
                  <>
                    {' '}
                    <button className="boton" onClick={() => void revocar(inv.id)}>
                      Revocar
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
