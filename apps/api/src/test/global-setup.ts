import { execSync } from 'node:child_process'
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client.js'
import { TEST_DB, TEST_URL, limpiarBase } from './limpiar.js'

async function ensureDatabase(): Promise<void> {
  const baseUrl = TEST_URL.replace(`/${TEST_DB}?`, '/controlliga?')
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: baseUrl }) })
  try {
    const filas = await prisma.$queryRaw<Array<{ existe: boolean }>>`SELECT EXISTS(
      SELECT 1 FROM pg_database WHERE datname = ${TEST_DB}
    ) AS existe`
    const existe = filas[0]?.existe
    if (!existe) {
      await prisma.$executeRawUnsafe(`CREATE DATABASE "${TEST_DB}"`)
    }
  } finally {
    await prisma.$disconnect()
  }
}

export default async function globalSetup(): Promise<void> {
  await ensureDatabase()
  execSync('pnpm --filter @controlliga/api exec prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: 'inherit',
    shell: process.platform === 'win32' ? 'pwsh' : '/bin/sh',
  })
  await limpiarBase()
}
