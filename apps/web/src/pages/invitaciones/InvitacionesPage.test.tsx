import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import InvitacionesPage from './InvitacionesPage'
import { apiFetch } from '../../utils/api'
import { AuthContext } from '../../auth/auth-context'
import type { AuthContextValue } from '../../auth/auth-context'
import type { InvitacionRecibida } from './tipos'

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
        <InvitacionesPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

function invitacion(over: Partial<InvitacionRecibida> = {}): InvitacionRecibida {
  return {
    id: 'i1',
    tipo: 'JUGADOR',
    estado: 'PENDIENTE',
    rolEnEquipo: null,
    mensaje: 'Sumate al plantel',
    expiraEn: null,
    respondidoEn: null,
    createdAt: '2026-08-11T10:00:00.000Z',
    equipo: { id: 'e1', nombre: 'Club A', escudoUrl: null },
    ...over,
  }
}

describe('InvitacionesPage', () => {
  beforeEach(() => {
    mockApiFetch.mockReset()
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('/no-leidas')) return Promise.resolve({ count: 0 })
      return Promise.resolve([])
    })
  })

  it('lista invitaciones pendientes y su historial', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('/no-leidas')) return Promise.resolve({ count: 0 })
      return Promise.resolve([
        invitacion(),
        invitacion({ id: 'i2', tipo: 'CUERPO_TECNICO', rolEnEquipo: 'TECNICO', estado: 'ACEPTADA', equipo: { id: 'e2', nombre: 'Club B', escudoUrl: null } }),
      ])
    })
    renderPage()
    expect(await screen.findByText('Club A')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aceptar' })).toBeInTheDocument()
    expect(await screen.findByText(/Club B/)).toBeInTheDocument()
    expect(screen.getByText('ACEPTADA')).toBeInTheDocument()
  })

  it('acepta una invitación', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('/no-leidas')) return Promise.resolve({ count: 0 })
      return Promise.resolve([invitacion()])
    })
    renderPage()
    await screen.findByText('Club A')
    await userEvent.click(screen.getByRole('button', { name: 'Aceptar' }))
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/invitaciones/i1/responder', {
        method: 'POST',
        body: JSON.stringify({ aceptar: true }),
      })
    })
    expect(await screen.findByText(/aceptaste la invitación de club a/i)).toBeInTheDocument()
  })

  it('rechaza una invitación', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('/no-leidas')) return Promise.resolve({ count: 0 })
      return Promise.resolve([invitacion()])
    })
    renderPage()
    await screen.findByText('Club A')
    await userEvent.click(screen.getByRole('button', { name: 'Rechazar' }))
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/invitaciones/i1/responder', {
        method: 'POST',
        body: JSON.stringify({ aceptar: false }),
      })
    })
    expect(await screen.findByText(/rechazaste la invitación de club a/i)).toBeInTheDocument()
  })

  it('muestra estado vacío', async () => {
    renderPage()
    expect(await screen.findByText(/no tenés invitaciones/i)).toBeInTheDocument()
  })

  it('muestra error básico de API', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url.includes('/no-leidas')) return Promise.resolve({ count: 0 })
      return Promise.reject(new Error('Error de red'))
    })
    renderPage()
    expect(await screen.findByText('Error de red')).toBeInTheDocument()
  })
})
