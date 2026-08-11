const ETIQUETAS: Record<string, string> = {
  DELEGADO_TECNICO: 'Delegado / técnico',
  DELEGADO: 'Delegado',
  TECNICO: 'Técnico',
  AUXILIAR: 'Auxiliar',
  JUGADOR: 'Jugador',
  FUTBOL_5: 'Fútbol 5',
  FUTBOL_7: 'Fútbol 7',
  FUTBOL_8: 'Fútbol 8',
  FUTBOL_9: 'Fútbol 9',
  FUTBOL_11: 'Fútbol 11',
  TODOS_CONTRA_TODOS: 'Todos contra todos',
  UNA_RUEDA: 'Una rueda',
  DOS_RUEDAS: 'Dos ruedas',
}

function etiquetaEstado(valor: string): string {
  return ETIQUETAS[valor] ?? valor.toLowerCase().replaceAll('_', ' ')
}

export default function StatusBadge({ valor }: { valor: string }) {
  return <span className={`estado estado-${valor.toLowerCase()}`}>{etiquetaEstado(valor)}</span>
}
