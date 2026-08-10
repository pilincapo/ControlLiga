import type { Prisma } from '../generated/prisma/client.js'

type TipoFormacion = 'FUTBOL_5' | 'FUTBOL_7' | 'FUTBOL_8' | 'FUTBOL_9' | 'FUTBOL_11'

interface PlantillaSeed {
  nombre: string
  formacionTipo: TipoFormacion
  esquema: string
}

const CATALOGO: PlantillaSeed[] = [
  { nombre: '1-2-1', formacionTipo: 'FUTBOL_5', esquema: '1-2-1' },
  { nombre: '2-1-1', formacionTipo: 'FUTBOL_5', esquema: '2-1-1' },
  { nombre: '3-2-1', formacionTipo: 'FUTBOL_7', esquema: '3-2-1' },
  { nombre: '2-3-1', formacionTipo: 'FUTBOL_7', esquema: '2-3-1' },
  { nombre: '2-2-2', formacionTipo: 'FUTBOL_7', esquema: '2-2-2' },
  { nombre: '3-3-1', formacionTipo: 'FUTBOL_8', esquema: '3-3-1' },
  { nombre: '2-3-2', formacionTipo: 'FUTBOL_8', esquema: '2-3-2' },
  { nombre: '3-3-2', formacionTipo: 'FUTBOL_9', esquema: '3-3-2' },
  { nombre: '3-2-3', formacionTipo: 'FUTBOL_9', esquema: '3-2-3' },
  { nombre: '4-4-2', formacionTipo: 'FUTBOL_11', esquema: '4-4-2' },
  { nombre: '4-3-3', formacionTipo: 'FUTBOL_11', esquema: '4-3-3' },
  { nombre: '4-2-3-1', formacionTipo: 'FUTBOL_11', esquema: '4-2-3-1' },
  { nombre: '3-5-2', formacionTipo: 'FUTBOL_11', esquema: '3-5-2' },
  { nombre: '5-3-2', formacionTipo: 'FUTBOL_11', esquema: '5-3-2' },
]

function posicionesDe(esquema: string): Array<{ posicion: string; x: number; y: number; orden: number }> {
  const filas = esquema.split('-').map(Number)
  const posiciones: Array<{ posicion: string; x: number; y: number; orden: number }> = [
    { posicion: 'ARQ', x: 50, y: 8, orden: 0 },
  ]
  let orden = 1
  filas.forEach((n, k) => {
    const y = 20 + (k / Math.max(1, filas.length - 1)) * 55
    const etiqueta = k === 0 ? 'DEF' : k === filas.length - 1 ? 'DEL' : 'MED'
    for (let i = 0; i < n; i++) {
      const x = 15 + (i / Math.max(1, n - 1)) * 70
      posiciones.push({
        posicion: `${etiqueta}${i + 1}`,
        x: Math.round(x),
        y: Math.round(y),
        orden: orden++,
      })
    }
  })
  return posiciones
}

export async function sembrarPlantillas(
  prisma: Pick<Prisma.TransactionClient, 'plantillaFormacion' | 'plantillaFormacionPosicion'>,
): Promise<number> {
  await prisma.plantillaFormacionPosicion.deleteMany()
  await prisma.plantillaFormacion.deleteMany()
  for (const [idx, p] of CATALOGO.entries()) {
    await prisma.plantillaFormacion.create({
      data: {
        nombre: p.nombre,
        formacionTipo: p.formacionTipo,
        esquema: p.esquema,
        orden: idx,
        posiciones: { create: posicionesDe(p.esquema) },
      },
    })
  }
  return CATALOGO.length
}

async function main(): Promise<void> {
  const { getPrisma } = await import('../db.js')
  const prisma = getPrisma()
  const total = await sembrarPlantillas(prisma)
  console.log(`Plantillas sembradas: ${total}`)
  await prisma.$disconnect()
}

void main()
