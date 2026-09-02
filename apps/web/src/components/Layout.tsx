import { Link, NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import NotificacionesBadge from './NotificacionesBadge'
import { PERMISOS } from '@controlliga/shared'

export default function Layout({ children }: { children: ReactNode }) {
  const { usuario, logout } = useAuth()
  const nombre = usuario ? `${usuario.nombre} ${usuario.apellido}` : ''
  const esSuper = usuario?.permisos.includes(PERMISOS.global) ?? false
  const tiene = (permiso: string) =>
    esSuper || (usuario?.permisos.includes(permiso as never) ?? false)
  const enlaces = [
    { to: '/dashboard', texto: 'Inicio', visible: true },
    { to: '/torneos', texto: 'Torneos', visible: tiene(PERMISOS.torneosVer) },
    { to: '/organizaciones', texto: 'Organizaciones', visible: tiene(PERMISOS.organizacionesAdministrar) },
    { to: '/equipos', texto: 'Equipos', visible: tiene(PERMISOS.equiposVer) },
    { to: '/formaciones', texto: 'Formaciones', visible: tiene(PERMISOS.formacionesVer) },
    { to: '/convocatorias', texto: 'Convocatorias', visible: tiene(PERMISOS.convocatoriasVer) },
    { to: '/partidos', texto: 'Partidos', visible: tiene(PERMISOS.partidosVer) },
    { to: '/invitaciones', texto: 'Invitaciones', visible: true },
  ]

  return (
    <>
      <nav className="navbar" aria-label="Navegación principal">
        <Link className="marca" to="/dashboard">
          CONTROL LIGA
        </Link>
        <div className="navbar-enlaces">
          {enlaces
            .filter((enlace) => enlace.visible)
            .map((enlace) => (
              <NavLink
                key={enlace.to}
                to={enlace.to}
                className={({ isActive }) => (isActive ? 'activo' : undefined)}
              >
                {enlace.texto}
              </NavLink>
            ))}
        </div>
        <div className="navbar-cuenta">
          <NotificacionesBadge />
          <NavLink to="/profile">Perfil</NavLink>
          {nombre && <span>{nombre}</span>}
          <button className="boton" onClick={() => void logout()}>
            Salir
          </button>
        </div>
      </nav>
      <main className="pagina">{children}</main>
    </>
  )
}
