import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { UsuarioSesion } from '@controlliga/shared'
import { ApiError } from '@controlliga/shared'
import { apiFetch } from '../utils/api'
import { AuthContext } from './auth-context'
import type { AuthContextValue, RegistroDatos } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let activo = true
    apiFetch<UsuarioSesion>('/auth/me')
      .then((u) => {
        if (activo) {
          setUsuario(u)
        }
      })
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401) {
          return
        }
        throw error
      })
      .finally(() => {
        if (activo) {
          setCargando(false)
        }
      })
    return () => {
      activo = false
    }
  }, [])

  useEffect(() => {
    const onExpirada = () => setUsuario(null)
    window.addEventListener('auth:sesion-expirada', onExpirada)
    return () => window.removeEventListener('auth:sesion-expirada', onExpirada)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<{ usuario: UsuarioSesion }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setUsuario(data.usuario)
  }, [])

  const registrar = useCallback(async (datos: RegistroDatos) => {
    const data = await apiFetch<{ usuario: UsuarioSesion }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(datos),
    })
    setUsuario(data.usuario)
  }, [])

  const logout = useCallback(async () => {
    await apiFetch<unknown>('/auth/logout', { method: 'POST', skipRefresh: true })
    setUsuario(null)
  }, [])

  const vincularJugador = useCallback(async (jugadorId: string) => {
    const data = await apiFetch<{ usuario: UsuarioSesion }>('/auth/me/vincular-jugador', {
      method: 'POST',
      body: JSON.stringify({ jugadorId }),
    })
    setUsuario(data.usuario)
  }, [])

  const value: AuthContextValue = {
    usuario,
    cargando,
    login,
    registrar,
    logout,
    vincularJugador,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
