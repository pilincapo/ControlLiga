import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Permiso, RolCodigo, RolEnEquipo } from '@controlliga/shared'
import { PERMISOS } from '@controlliga/shared'
import type { ContextoAuth } from '../auth/contexto.js'
import { esMiembroEquipo, puedeEnEquipo } from '../auth/permisos.js'
import { validarSesion } from '../auth/servicio.js'
import { getPrisma } from '../db.js'
import { noAutenticado, prohibido } from '../http.js'

export async function authPlugin(app: FastifyInstance): Promise<void> {
  app.decorateRequest('auth', null)
}

type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>

export async function autenticar(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const contexto = await validarSesion(request)
  if (!contexto) {
    throw noAutenticado()
  }
  request.auth = contexto
}

export function getAuth(request: FastifyRequest): ContextoAuth {
  const auth = request.auth
  if (!auth) {
    throw noAutenticado()
  }
  return auth
}

export function requiereRol(...permitidos: RolCodigo[]): PreHandler {
  return async (request, reply) => {
    await autenticar(request, reply)
    const auth = getAuth(request)
    const tiene = auth.roles.some((r) => permitidos.includes(r.codigo))
    if (!tiene) {
      throw prohibido('No tenés el rol requerido para esta acción')
    }
  }
}

export function requierePermiso(...permitidos: Permiso[]): PreHandler {
  return async (request, reply) => {
    await autenticar(request, reply)
    const auth = getAuth(request)
    const global = auth.permisos.includes(PERMISOS.global)
    const tiene = auth.permisos.some((p) => permitidos.includes(p))
    if (!global && !tiene) {
      throw prohibido('No tenés permiso para esta acción')
    }
  }
}

function equipoIdDe(request: FastifyRequest): string {
  const params = request.params as { equipoId?: string; id?: string }
  const equipoId = params.equipoId ?? params.id
  if (!equipoId) {
    throw prohibido('Falta el identificador del equipo')
  }
  return equipoId
}

export async function requiereAccesoEquipo(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  await autenticar(request, reply)
  const auth = getAuth(request)
  const equipoId = equipoIdDe(request)
  if (!(await esMiembroEquipo(getPrisma(), auth, equipoId))) {
    throw prohibido('No tenés acceso a ese equipo')
  }
}

export function requiereRolEnEquipo(...roles: RolEnEquipo[]): PreHandler {
  return async (request, reply) => {
    await autenticar(request, reply)
    const auth = getAuth(request)
    const equipoId = equipoIdDe(request)
    if (!(await puedeEnEquipo(getPrisma(), auth, equipoId, ...roles))) {
      throw prohibido('No tenés el rol requerido en ese equipo')
    }
  }
}
