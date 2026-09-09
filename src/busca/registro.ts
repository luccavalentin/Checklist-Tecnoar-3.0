import type { LucideIcon } from 'lucide-react'

export interface ResultadoBusca {
  id: string
  titulo: string
  subtitulo?: string
  detalhe?: string
  rota: string
  icone: LucideIcon
}

export interface FonteBusca {
  id: string
  rotulo: string
  /** Ordem de exibição do grupo no resultado. */
  ordem: number
  buscar: (termo: string, sinal: AbortSignal) => Promise<ResultadoBusca[]>
}

const fontes = new Map<string, FonteBusca>()

/**
 * Registro de fontes da Busca Global.
 *
 * Cada módulo registra a sua fonte quando é implantado. A busca só devolve
 * o que existe de verdade — nunca resultado simulado.
 */
export function registrarFonteBusca(fonte: FonteBusca) {
  fontes.set(fonte.id, fonte)
}

export function fontesRegistradas(): FonteBusca[] {
  return [...fontes.values()].sort((a, b) => a.ordem - b.ordem)
}

/** Entidades que a Busca Global vai cobrir conforme os módulos entram no ar. */
export const ENTIDADES_PREVISTAS = [
  'Cliente',
  'CPF/CNPJ',
  'Veículo',
  'Placa',
  'OS',
  'Produto',
  'Protocolo',
  'Artigo técnico',
] as const
