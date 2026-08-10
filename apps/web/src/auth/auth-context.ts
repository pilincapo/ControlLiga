import { createContext } from 'react'
import type { UsuarioSesion } from '@controlliga/shared'

export interface RegistroDatos {
  email: string
  password: string
  nombre: string
  apellido: string
  jugadorId?: string
}

export interface AuthContextValue {
  usuario: UsuarioSesion | null
  cargando: boolean
  login: (email: string, password: string) => Promise<void>
  registrar: (datos: RegistroDatos) => Promise<void>
  logout: () => Promise<void>
  vincularJugador: (jugadorId: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
