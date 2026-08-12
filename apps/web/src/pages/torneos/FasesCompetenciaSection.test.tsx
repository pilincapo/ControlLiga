import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Permiso } from '@controlliga/shared'
import { AuthContext } from '../../auth/auth-context'
import type { AuthContextValue } from '../../auth/auth-context'
import { apiFetch } from '../../utils/api'
import FasesCompetenciaSection from './FasesCompetenciaSection'

vi.mock('../../utils/api', () => ({ apiFetch: vi.fn() }))
const mockApiFetch = vi.mocked(apiFetch)

function renderFases(permisos: Permiso[]) {
  const contexto: AuthContextValue = {
    usuario: { id: 'u', email: 'u@a.com', nombre: 'U', apellido: 'T', jugadorId: null, roles: [], equipos: [], permisos },
    cargando: false, login: vi.fn(), registrar: vi.fn(), logout: vi.fn(), vincularJugador: vi.fn(),
  }
  return render(
    <AuthContext.Provider value={contexto}>
      <FasesCompetenciaSection
        competicionId="c1"
        participaciones={[1, 2, 3, 4].map((numero) => ({ id: `p${numero}`, torneoId: 't', temporadaId: 's', torneoCategoriaId: 'c1', zonaId: null, estado: 'CONFIRMADO', fechaInscripcion: '', equipoId: `e${numero}`, equipo: { id: `e${numero}`, nombre: `Equipo ${numero}`, escudoUrl: null }, torneoCategoria: null, zona: null }))}
      />
    </AuthContext.Provider>,
  )
}

describe('FasesCompetenciaSection FASE 16A', () => {
  beforeEach(() => mockApiFetch.mockReset())

  it('oculta administración sin permiso', async () => {
    mockApiFetch.mockResolvedValueOnce([])
    renderFases([])
    await screen.findByRole('heading', { name: 'No tenés acceso a este contenido' })
    expect(screen.queryByRole('button', { name: 'Generar fase' })).not.toBeInTheDocument()
  })

  it('confirma generación de eliminación con seeds cargados', async () => {
    mockApiFetch.mockResolvedValueOnce([])
    renderFases(['torneos:administrar'])
    await screen.findByRole('heading', { name: 'Fases de competencia' })
    fireEvent.change(screen.getByLabelText('Nueva fase'), { target: { value: 'ELIMINACION_DIRECTA' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generar fase' }))
    expect(screen.getByRole('dialog', { name: 'Generar fase' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(mockApiFetch).not.toHaveBeenCalledWith('/torneo-categorias/c1/fases/generar', expect.anything())
    fireEvent.click(screen.getByRole('button', { name: 'Generar fase' }))
    mockApiFetch.mockResolvedValueOnce({})
    mockApiFetch.mockResolvedValueOnce([])
    fireEvent.click(screen.getByRole('button', { name: 'Generar' }))
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalledWith(
      '/torneo-categorias/c1/fases/generar',
      expect.objectContaining({ method: 'POST', body: expect.stringContaining('ELIMINACION_DIRECTA') }),
    ))
  })

  it('muestra participantes, ganador, BYE, pendiente y solo usa A definir cuando falta participante', async () => {
    mockApiFetch.mockResolvedValueOnce([{
      id: 'f1', orden: 1, nombre: 'Llaves', tipo: 'ELIMINACION_DIRECTA', estado: 'GENERADA', grupos: [], rondas: [{
        id: 'r1', nombre: 'Semifinal', llaves: [
          { id: 'l1', estado: 'RESUELTA', participacionLocal: { id: 'p1', equipo: { nombre: 'Equipo Uno' } }, participacionVisitante: { id: 'p2', equipo: { nombre: 'Equipo Dos' } }, ganadorParticipacion: { id: 'p1', equipo: { nombre: 'Equipo Uno' } } },
          { id: 'l2', estado: 'BYE', participacionLocal: { id: 'p3', equipo: { nombre: 'Equipo Tres' } }, participacionVisitante: null, ganadorParticipacion: { id: 'p3', equipo: { nombre: 'Equipo Tres' } } },
          { id: 'l3', estado: 'PENDIENTE_PARTICIPANTES', participacionLocal: null, participacionVisitante: { id: 'p4', equipo: { nombre: 'Equipo Cuatro' } }, ganadorParticipacion: null },
          { id: 'l4', estado: 'PENDIENTE_DEFINICION', participacionLocal: { id: 'p1', equipo: { nombre: 'Equipo Uno' } }, participacionVisitante: { id: 'p2', equipo: { nombre: 'Equipo Dos' } }, ganadorParticipacion: null },
        ],
      }],
    }])
    renderFases(['torneos:administrar'])
    expect((await screen.findAllByText('Equipo Uno')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Equipo Dos').length).toBeGreaterThan(0)
    expect(screen.getByText('Equipo Tres')).toBeInTheDocument()
    expect(screen.getByText((_, elemento) => elemento?.tagName === 'LI' && elemento.textContent?.includes('Ganador: Equipo Uno') === true)).toBeInTheDocument()
    expect(screen.getAllByText('A definir')).toHaveLength(1)
    expect(screen.getByText((_, elemento) => elemento?.tagName === 'LI' && elemento.textContent?.includes('Equipo Tres — BYE') === true)).toBeInTheDocument()
    expect(screen.getByText('pendiente definicion')).toBeInTheDocument()
  })
})
