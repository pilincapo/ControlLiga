import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AuthContext } from '../../auth/auth-context'
import type { AuthContextValue } from '../../auth/auth-context'
import type { Permiso } from '@controlliga/shared'
import { apiFetch } from '../../utils/api'
import FixtureTablaSection from './FixtureTablaSection'

vi.mock('../../utils/api', () => ({ apiFetch: vi.fn() }))
const mockApiFetch = vi.mocked(apiFetch)

function renderFixture(permisos: Permiso[]) {
  const contexto: AuthContextValue = {
    usuario: {
      id: 'u',
      email: 'u@a.com',
      nombre: 'U',
      apellido: 'T',
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
      <FixtureTablaSection competenciaId="c1" />
    </AuthContext.Provider>,
  )
}

describe('FixtureTablaSection FASE 15', () => {
  beforeEach(() => mockApiFetch.mockReset())
  it('oculta generación sin permiso', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ jornadas: [] })
      .mockResolvedValueOnce({ filas: [], criteriosNoDisponibles: [] })
    renderFixture([])
    await screen.findByRole('heading', { name: 'Fixture y tabla' })
    expect(screen.queryByRole('button', { name: /generar fixture/i })).not.toBeInTheDocument()
  })

  it('confirma generación y cancelar no llama API mutante', async () => {
    mockApiFetch
      .mockResolvedValueOnce({ jornadas: [] })
      .mockResolvedValueOnce({ filas: [], criteriosNoDisponibles: [] })
    renderFixture(['torneos:administrar'])
    const boton = await screen.findByRole('button', { name: 'Generar fixture' })
    fireEvent.click(boton)
    expect(screen.getByRole('dialog', { name: 'Generar fixture' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(mockApiFetch).not.toHaveBeenCalledWith(
      '/torneo-categorias/c1/fixture/generar',
      expect.anything(),
    )
    fireEvent.click(boton)
    mockApiFetch
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ jornadas: [] })
      .mockResolvedValueOnce({ filas: [], criteriosNoDisponibles: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }))
    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/torneo-categorias/c1/fixture/generar',
        expect.objectContaining({ method: 'POST' }),
      ),
    )
  })
})
