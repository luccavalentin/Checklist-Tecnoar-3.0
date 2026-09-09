import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import type { TipoSincronizacao } from '@/tipos/db'

export interface RespostaSync {
  sincronizacao_id?: string
  processados?: number
  novos?: number
  atualizados?: number
  falhas?: number
  conflitos?: number
  proxima_pagina?: number | null
  total_paginas?: number
  concluida?: boolean
  erro?: string
  status?: string
}

/**
 * Chama a função de borda da Omie e traduz a resposta de erro dela — que vem
 * no corpo, não no `error` do supabase-js — para uma mensagem em português.
 */
export async function chamarOmie(corpo: Record<string, unknown>): Promise<RespostaSync> {
  const { data, error } = await supabase.functions.invoke<RespostaSync>('omie', { body: corpo })
  if (error) {
    const ctx = (error as { context?: Response })?.context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const c = (await ctx.json()) as { erro?: string }
        if (c?.erro) throw new Error(c.erro)
      } catch (e) {
        if (e instanceof Error && e.message) throw e
      }
    }
    throw new Error(mensagemErro(error))
  }
  return data ?? {}
}

export interface ResumoSync {
  tipo: TipoSincronizacao
  novos: number
  atualizados: number
  falhas: number
  erro?: string
}

/**
 * Percorre todas as páginas de uma sincronização. O progresso é informado por
 * callback para que a tela possa mostrar onde está — sem inventar percentuais.
 */
export async function sincronizarOmie(
  tipos: TipoSincronizacao[],
  aoProgredir?: (p: { tipo: TipoSincronizacao; pagina: number; total: number }) => void,
): Promise<ResumoSync[]> {
  const resumo: ResumoSync[] = []

  for (const tipo of tipos) {
    let pagina = 1
    let id: string | undefined
    let ultimo: RespostaSync = {}
    aoProgredir?.({ tipo, pagina, total: 0 })

    // Limite de segurança: evita laço infinito se a API mudar de contrato.
    for (let i = 0; i < 500; i++) {
      ultimo = await chamarOmie({ acao: 'sincronizar', tipo, pagina, sincronizacao_id: id })
      id = ultimo.sincronizacao_id
      aoProgredir?.({ tipo, pagina, total: ultimo.total_paginas ?? 0 })
      if (ultimo.erro || ultimo.concluida || !ultimo.proxima_pagina) break
      pagina = ultimo.proxima_pagina
    }

    resumo.push({
      tipo,
      novos: ultimo.novos ?? 0,
      atualizados: ultimo.atualizados ?? 0,
      falhas: ultimo.falhas ?? 0,
      erro: ultimo.erro,
    })
  }

  return resumo
}
