import { createHash, randomBytes } from 'node:crypto'

export function generarTokenSesion(): string {
  return randomBytes(32).toString('base64url')
}

export function hashTokenSesion(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
