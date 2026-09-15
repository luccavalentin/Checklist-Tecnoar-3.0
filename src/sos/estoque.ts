import type { ResultadoEstoque } from './tipos'

/**
 * Como o estoque aparece no SOS (app do mecânico e central).
 *
 * O número que vale é o DISPONÍVEL — saldo da Omie menos o reservado da Omie
 * menos o que o Tecnoar já comprometeu (peças em OS aberta e em chamado SOS
 * ainda sem OS). O saldo cru engana: duas OS podem contar com a mesma peça.
 */

/** Até aqui o disponível é "pouco" (âmbar). */
export const ESTOQUE_BAIXO = 3

export type TomEstoque = 'ok' | 'baixo' | 'sem' | 'desconhecido'

export function tomDisponivel(disponivel: number | null | undefined): TomEstoque {
  if (disponivel == null || Number.isNaN(Number(disponivel))) return 'desconhecido'
  const n = Number(disponivel)
  if (n <= 0) return 'sem'
  if (n <= ESTOQUE_BAIXO) return 'baixo'
  return 'ok'
}

/** 2 → "2"; 1.5 → "1,5" (quantidade de peça, sem casas à toa). */
export function quantidadeBR(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return '—'
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

/** "Disponível 4 un" · "Sem estoque" · null quando o item não controla estoque. */
export function textoDisponivel(disponivel: number | null | undefined, unidade?: string | null): string | null {
  const tom = tomDisponivel(disponivel)
  if (tom === 'desconhecido') return null
  if (tom === 'sem') return 'Sem estoque'
  return `Disponível ${quantidadeBR(disponivel)}${unidade ? ` ${unidade.toLowerCase()}` : ''}`
}

/** "estoque de 14:32" (hoje) ou "estoque de 12/09 14:32" — última sincronização com a Omie. */
export function textoEstoqueEm(iso: string | null | undefined, agora = new Date()): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const mesmoDia = d.toDateString() === agora.toDateString()
  return mesmoDia ? `estoque de ${hora}` : `estoque de ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`
}

/** O banco devolve `estoque.faltou` quando a peça entrou sem estoque (e já avisou a central). */
export function faltouEstoque(r: { estoque?: ResultadoEstoque | null } | null | undefined): boolean {
  return !!r?.estoque?.faltou
}

/** Mesmo aviso em todo lugar onde se lança peça. */
export const AVISO_SEM_ESTOQUE = {
  titulo: 'Sem estoque: lançada como necessária.',
  texto: 'A central foi avisada.',
} as const
