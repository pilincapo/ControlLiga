export class HttpError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, 'solicitud_invalida', message)
}

export function noAutenticado(): HttpError {
  return new HttpError(401, 'no_autenticado', 'No estás autenticado o tu sesión expiró')
}

export function prohibido(message: string): HttpError {
  return new HttpError(403, 'sin_permiso', message)
}

export function noEncontrado(entidad: string): HttpError {
  return new HttpError(404, 'no_encontrado', `${entidad} no encontrado`)
}

export function conflicto(code: string, message: string): HttpError {
  return new HttpError(409, code, message)
}
