import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AuthContext } from '../auth/auth-context'
import type { AuthContextValue } from '../auth/auth-context'
import type { Permiso } from '@controlliga/shared'
import Layout from './Layout'

vi.mock('./NotificacionesBadge', () => ({ default: () => <span>Notificaciones</span> }))

function renderLayout(permisos: Permiso[]) {
  const contexto: AuthContextValue = {
    usuario: {
      id: 'u1',
      email: 'a@a.com',
      nombre: 'Ana',
      apellido: 'Test',
      jugadorId: null,
      roles: [],
      equipos: [],
      permisos,
    },
    cargando: false,
    login: vi.fn(),
    registrar: vi.fn(),
    logout: vi.fn(),
    vincularJugador: vi.fn(),
  }
  return render(
    <AuthContext.Provider value={contexto}>
      <MemoryRouter>
        <Layout>
          <p>Contenido</p>
        </Layout>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

describe('Layout FASE 15', () => {
  it('muestra navegación administrativa cuando usuario tiene permisos', () => {
    renderLayout(['torneos:ver', 'equipos:ver', 'partidos:ver'])
    expect(screen.getByRole('link', { name: 'Torneos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Equipos' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Partidos' })).toHaveAttribute('href', '/partidos')
  })

  it('oculta links administrativos sin permiso', () => {
    renderLayout([])
    expect(screen.queryByRole('link', { name: 'Torneos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Equipos' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Inicio' })).toBeInTheDocument()
  })
})
