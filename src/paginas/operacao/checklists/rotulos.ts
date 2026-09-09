import type { TipoChecklist } from '@/tipos/db'

/**
 * Nomes dos tipos de checklist.
 *
 * Fica fora da tela de Checklists porque o editor de modelo também precisa
 * deles — importar de volta da tela criaria um ciclo entre os dois módulos.
 */
export const ROTULO_TIPO_CHECKLIST: Record<TipoChecklist, string> = {
  tecnico_inicial: 'Checklist Entrada',
  final_os: 'Checklist Saída',
  diario_abertura: 'Checklist diário — abertura',
  diario_fechamento: 'Checklist diário — fechamento',
}
