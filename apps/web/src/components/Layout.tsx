import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'

export default function Layout({ children }: { children: ReactNode }) {
  const { usuario, logout } = useAuth()
  const nombre = usuario ? `${usuario.nombre} ${usuario.apellido}` : ''

  return (
    <>
      <nav className="navbar">
        <span className="marca">CONTROL LIGA</span>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/profile">Perfil</Link>
        {nombre && <span>{nombre}</span>}
        <button className="boton" onClick={() => void logout()}>
          Salir
        </button>
      </nav>
      <main className="pagina">{children}</main>
    </>
  )
}
