import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

const COST = 16384
const BLOCK_SIZE = 8
const PARALLEL = 1
const KEY_LENGTH = 64
const MAX_MEM = 128 * 1024 * 1024
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export function validarPoliticaPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`
  if (password.length > PASSWORD_MAX_LENGTH) return `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres`
  return null
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url')
  const key = await scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLEL,
    maxmem: MAX_MEM,
  })
  return `scrypt$${COST}$${BLOCK_SIZE}$${PARALLEL}$${salt}$${key.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  const [scheme, nStr, rStr, pStr, salt, keyB64] = parts
  if (scheme !== 'scrypt' || !nStr || !rStr || !pStr || !salt || !keyB64) {
    return false
  }
  const expected = Buffer.from(keyB64, 'base64url')
  const actual = await scrypt(password, salt, expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
    maxmem: MAX_MEM,
  })
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}
