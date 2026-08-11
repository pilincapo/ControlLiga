import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import NotificacionesPage from './NotificacionesPage'
import { apiFetch } from '../../utils/api'
import { AuthContext } from '../../auth/auth-context'
import type { AuthContextValue } from '../../auth/auth-context'
import type { Notificacion } from './tipos'

vi.mock('../../utils/api', () => ({ apiFetch: vi.fn() }))

const mockApiFetch = vi.mocked(apiFetch)

const usuario: AuthContextValue['usuario'] = {
  id: 'u1',
  email: 'jugador@test.dev',
  nombre: 'Ana',
  apellido: 'Gomez',
  jugadorId: 'j1',
  roles: [],
  equipos: [],
  permisos: [],
}

function renderPage() {
  const contexto: AuthContextValue = {
    usuario,
    cargando: false,
    login: vi.fn(),
    registrar: vi.fn(),
    logout: vi.fn(),
    vincularJugador: vi.fn(),
  }
  return render(
    <AuthContext.Provider value={contexto}>
      <MemoryRouter>
        <NotificacionesPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

function notificacion(over: Partial<Notificacion> = {}): Notificacion {
  return {
    id: 'n1',
    usuarioId: 'u1',
    tipo: 'CONVOCATORIA',
    titulo: 'Convocatoria',
    mensaje: 'Partido el sábado',
    entidadTipo: 'Convocatoria',
    entidadId: 'c1',
    leidaAt: null,
    createdAt: '2026-08-11T10:00:00.000Z',
    ...over,
  }
}

describe('NotificacionesPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('/no-leidas')) return Promise.resolve({ count: 0 })
      return Promise.resolve([])
    })
  })

  it('lista las notificaciones y distingue leídas de no leídas', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('/no-leidas')) return Promise.resolve({ count: 1 })
      return Promise.resolve([
        notificacion(),
        notificacion({ id: 'n2', titulo: 'Partido', mensaje: 'Cambió la fecha', entidadTipo: 'Partido', entidadId: 'p1', leidaAt: '2026-08-11T11:00:00.000Z' }),
      ])
    })
    renderPage()
    expect(await screen.findByText('Convocatoria')).toBeInTheDocument()
    expect(screen.getByText(/Partido el sábado/)).toBeInTheDocument()
    expect(screen.getByText(/Cambió la fecha/)).toBeInTheDocument()
    expect(screen.getByText('No leídas (1)')).toBeInTheDocument()
  })

  it('marca una notificación como leída al tocarla', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('/no-leidas')) return Promise.resolve({ count: 1 })
      if (url.endsWith('/leida')) return Promise.resolve({ id: 'n1', leidaAt: '2026-08-11T12:00:00.000Z' })
      return Promise.resolve([notificacion()])
    })
    renderPage()
    await screen.findByText('Convocatoria')
    await userEvent.click(screen.getByText('Convocatoria'))
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/notificaciones/n1/leida', { method: 'POST' })
    })
  })

  it('marca todas como leídas', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('/no-leidas')) return Promise.resolve({ count: 2 })
      if (url.includes('/leer-todas')) return Promise.resolve({ marcadas: 2 })
      return Promise.resolve([
        notificacion(),
        notificacion({ id: 'n2', titulo: 'Partido', mensaje: 'Cambió la fecha', entidadTipo: 'Partido', entidadId: 'p1' }),
      ])
    })
    renderPage()
    await screen.findByText('Convocatoria')
    await userEvent.click(screen.getByRole('button', { name: /marcar todas como leídas/i }))
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/notificaciones/leer-todas', { method: 'POST' })
    })
  })

  it('muestra estado vacío', async () => {
    renderPage()
    expect(await screen.findByText(/no tenés notificaciones/i)).toBeInTheDocument()
  })

  it('muestra error básico de API', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('/no-leidas')) return Promise.resolve({ count: 0 })
      return Promise.reject(new Error('Error de red'))
    })
    renderPage()
    expect(await screen.findByText('Error de red')).toBeInTheDocument()
  })

  it('filtra por no leídas', async () => {
    renderPage()
    await screen.findByText(/no tenés notificaciones/i)
    await userEvent.click(screen.getByRole('button', { name: /no leídas/i }))
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/notificaciones?leidas=false')
    })
  })
})
