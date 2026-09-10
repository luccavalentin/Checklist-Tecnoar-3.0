import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import { Confirmacao } from '@/componentes/ui/Sobreposicoes'
import { useToast } from '@/componentes/ui/Toast'

/**
 * Exclusão de registros — um caminho só para todas as telas.
 *
 * A decisão de poder ou não excluir mora no banco (`previa_exclusao` e
 * `excluir_registro`), não aqui. Este arquivo cuida apenas de perguntar,
 * mostrar a resposta e avisar do resultado. É de propósito: regra escrita na
 * tela protege o botão, não a tabela — quem chamasse a API direto passaria por
 * cima dela.
 *
 * O fluxo tem duas etapas porque exclusão sem contexto é aposta:
 *   1. A prévia diz se pode, e o que será destruído junto.
 *   2. Só então a confirmação aparece, já com esses números na tela.
 */

/** Nomes de tabela em linguagem de oficina. */
const NOME_TABELA: Record<string, string> = {
  os_servicos: 'serviços da OS',
  os_produtos: 'produtos da OS',
  os_mecanicos: 'mecânicos vinculados',
  os_apontamentos: 'apontamentos de tempo',
  os_eventos: 'eventos da OS',
  os_tags: 'etiquetas',
  faturas: 'faturas',
  fatura_parcelas: 'parcelas',
  checklist_respostas: 'respostas do checklist',
  checklist_defeitos: 'defeitos registrados',
  avarias_veiculo: 'avarias registradas',
  cliente_contatos: 'contatos',
  cliente_tags: 'etiquetas',
  follow_ups: 'follow-ups',
  interacoes: 'interações',
  eventos_veiculo: 'eventos do veículo',
  veiculo_proprietarios: 'histórico de proprietários',
  pecas_teste_eventos: 'eventos da peça',
  venda_itens: 'itens da venda',
  estoque_movimentos: 'movimentos de estoque',
  entradas_patio: 'entradas de pátio',
  ordens_servico: 'ordens de serviço',
  pecas_teste: 'peças em teste',
  garantias: 'garantias',
  retornos: 'retornos',
  termos_recusa: 'termos de recusa',
}

function humano(tabela: string): string {
  return NOME_TABELA[tabela] ?? tabela.replace(/_/g, ' ')
}

interface Previa {
  pode: boolean
  motivo?: string
  rotulo?: string
  tipo?: string
  arrasta?: Array<{ tabela: string; qtd: number }>
}

export interface ControleExclusao {
  /** Abre a confirmação para este registro, consultando a prévia antes. */
  pedir: (id: string) => void
  fechar: () => void
  alvo: string | null
  previa: Previa | null
  consultando: boolean
  excluindo: boolean
  confirmar: () => void
}

export function useExclusao(opcoes: {
  tabela: string
  /** Chaves de cache a revalidar depois de excluir. */
  invalidar?: string[][]
  aoConcluir?: () => void
}): ControleExclusao {
  const qc = useQueryClient()
  const toast = useToast()
  const [alvo, setAlvo] = useState<string | null>(null)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [consultando, setConsultando] = useState(false)

  function fechar() {
    setAlvo(null)
    setPrevia(null)
  }

  async function pedir(id: string) {
    setAlvo(id)
    setPrevia(null)
    setConsultando(true)
    try {
      const { data, error } = await supabase.rpc('previa_exclusao', {
        p_tabela: opcoes.tabela,
        p_id: id,
      })
      if (error) throw error
      setPrevia(data as unknown as Previa)
    } catch (e) {
      /* Falhar a prévia não pode virar exclusão às cegas: fecha e avisa. */
      setAlvo(null)
      toast.erro('Não foi possível verificar o registro', mensagemErro(e))
    } finally {
      setConsultando(false)
    }
  }

  const excluir = useMutation({
    mutationFn: async () => {
      if (!alvo) throw new Error('Nenhum registro selecionado.')
      const { data, error } = await supabase.rpc('excluir_registro', {
        p_tabela: opcoes.tabela,
        p_id: alvo,
      })
      if (error) throw error
      const r = data as unknown as { ok: boolean; erro?: string }
      if (!r?.ok) throw new Error(r?.erro ?? 'Não foi possível excluir.')
    },
    onSuccess: () => {
      toast.ok('Registro excluído')
      for (const chave of opcoes.invalidar ?? []) void qc.invalidateQueries({ queryKey: chave })
      opcoes.aoConcluir?.()
      fechar()
    },
    onError: (e) => toast.erro('Não foi possível excluir', mensagemErro(e)),
  })

  return {
    pedir,
    fechar,
    alvo,
    previa,
    consultando,
    excluindo: excluir.isPending,
    confirmar: () => excluir.mutate(),
  }
}

/**
 * A confirmação. Mostra o nome do registro e, quando houver, a lista do que
 * será destruído junto — com número. "Isto também apagará itens vinculados"
 * não ajuda ninguém a decidir; "também apagará 2 faturas" ajuda.
 */
export function DialogoExclusao({ ctrl }: { ctrl: ControleExclusao }) {
  const { alvo, previa, consultando, excluindo } = ctrl

  if (!alvo) return null

  if (consultando || !previa) {
    return (
      <Confirmacao
        aberto
        aoFechar={ctrl.fechar}
        aoConfirmar={() => {}}
        titulo="Verificando…"
        descricao="Conferindo se este registro pode ser excluído."
        rotuloConfirmar="Aguarde"
        carregando
        destrutivo
      />
    )
  }

  if (!previa.pode) {
    return (
      <Confirmacao
        aberto
        aoFechar={ctrl.fechar}
        aoConfirmar={ctrl.fechar}
        titulo="Não é possível excluir"
        descricao={previa.motivo ?? 'Este registro não pode ser excluído.'}
        rotuloConfirmar="Entendi"
        rotuloCancelar="Fechar"
      />
    )
  }

  const arrasta = previa.arrasta ?? []

  const descricao: ReactNode = (
    <div className="flex flex-col gap-3">
      <p>
        Excluir {previa.tipo ?? 'o registro'} <strong className="text-ink">{previa.rotulo}</strong>?
      </p>

      {arrasta.length > 0 && (
        <div className="rounded-lg border border-warn/35 bg-warn-soft p-3">
          <p className="text-[12.5px] font-semibold text-warn-ink">
            Isto também apagará, em definitivo:
          </p>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {arrasta.map((a) => (
              <li key={a.tabela} className="text-[12.5px] text-ink-2">
                • {a.qtd} {humano(a.tabela)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[12.5px] text-ink-3">Esta ação não pode ser desfeita.</p>
    </div>
  )

  return (
    <Confirmacao
      aberto
      aoFechar={ctrl.fechar}
      aoConfirmar={ctrl.confirmar}
      titulo="Excluir registro"
      descricao={descricao}
      rotuloConfirmar="Excluir"
      destrutivo
      carregando={excluindo}
    />
  )
}
