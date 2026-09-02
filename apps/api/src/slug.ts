export function slugDesdeNombre(valor: string): string {
  return (
    valor
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'torneo'
  )
}

export function esSlugValido(valor: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(valor)
}
