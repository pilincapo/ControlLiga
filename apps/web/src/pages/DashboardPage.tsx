import { useAuth } from '../auth/useAuth'
import { PERMISOS, ROL_PUBLICO } from '@controlliga/shared'
import type { Permiso } from '@controlliga/shared'
import Layout from '../components/Layout'
import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { cargarNoLeidas, EVENTO_NOTIFICACIONES_ACTUALIZADAS } from '../utils/notificaciones'
import InvitacionesPendientes from './invitaciones/InvitacionesPendientes'

interface Seccion {
  titulo: string
  permiso: Permiso | null
  detalle: string
  enlace?: string
}

const SECCIONES: Seccion[] = [
  { titulo: 'Administración global', permiso: null, detalle: 'SUPERADMIN: control total del sistema' },
  { titulo: 'Torneos', permiso: PERMISOS.torneosVer, detalle: 'Crear y administrar torneos', enlace: '/torneos' },
  { titulo: 'Organizaciones', permiso: PERMISOS.organizacionesAdministrar, detalle: 'Administrar organizaciones' },
  { titulo: 'Mis equipos', permiso: PERMISOS.equiposVer, detalle: 'Equipos donde participás', enlace: '/equipos' },
  { titulo: 'Plantel', permiso: PERMISOS.jugadoresGestionar, detalle: 'Jugadores de tus equipos' },
  { titulo: 'Convocatorias', permiso: PERMISOS.convocatoriasGestionar, detalle: 'Crear y gestionar convocatorias' },
  { titulo: 'Formaciones', permiso: PERMISOS.formacionesVer, detalle: 'Armar y gestionar formaciones', enlace: '/formaciones' },
  { titulo: 'Convocatorias', permiso: PERMISOS.convocatoriasVer, detalle: 'Crear y responder convocatorias', enlace: '/convocatorias' },
  { titulo: 'Mis convocatorias', permiso: PERMISOS.convocatoriasVer, detalle: 'Tus convocatorias pendientes' },
  { titulo: 'Mis partidos', permiso: PERMISOS.partidosVer, detalle: 'Calendario de tus partidos', enlace: '/partidos' },
  { titulo: 'Mi perfil', permiso: PERMISOS.perfilVer, detalle: 'Tus datos personales' },
]

export default function DashboardPage() {
  const { usuario } = useAuth()
  const [noLeidas, setNoLeidas] = useState(0)

  useEffect(() => {
    const refrescar = () => {
      cargarNoLeidas().then(setNoLeidas).catch(() => setNoLeidas(0))
    }
    refrescar()
    window.addEventListener(EVENTO_NOTIFICACIONES_ACTUALIZADAS, refrescar)
    return () => window.removeEventListener(EVENTO_NOTIFICACIONES_ACTUALIZADAS, refrescar)
  }, [])

  if (!usuario) {
    return null
  }

  const esSuper = usuario.permisos.includes(PERMISOS.global)
  const tiene = (permiso: Permiso) => esSuper || usuario.permisos.includes(permiso)
  const secciones = SECCIONES.filter((s) => esSuper || (s.permiso !== null && tiene(s.permiso)))

  return (
    <Layout>
      <h2>
        Hola, {usuario.nombre} {usuario.apellido}
      </h2>
      <p>
        Roles: <strong>{usuario.roles.length > 0 ? usuario.roles.map((r) => r.codigo).join(', ') : ROL_PUBLICO}</strong>
      </p>
      <div className="grid">
        {secciones.map((s) => (
          <div className="tarjeta" key={s.titulo}>
            <h3>{s.titulo}</h3>
            <p>{s.detalle}</p>
            {s.enlace ? (
              <Link className="enlace" to={s.enlace}>
                Abrir
              </Link>
            ) : (
              <span className="enlace">Próximamente</span>
            )}
          </div>
        ))}
      </div>
      {usuario.equipos.length > 0 && (
        <div className="tarjeta">
          <h3>Mis equipos</h3>
          <ul className="lista">
            {usuario.equipos.map((e) => (
              <li key={e.equipoId}>
                {e.nombre} <span className="enlace">({e.rolEnEquipo})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="tarjeta">
        <h3>Notificaciones</h3>
        <p>
          {noLeidas > 0 ? (
            <Link className="enlace" to="/notificaciones">
              Tenés {noLeidas} notificación{noLeidas !== 1 ? 'es' : ''} sin leer
            </Link>
          ) : (
            <span>No tenés notificaciones sin leer.</span>
          )}
        </p>
      </div>
      <InvitacionesPendientes />
    </Layout>
  )
}
