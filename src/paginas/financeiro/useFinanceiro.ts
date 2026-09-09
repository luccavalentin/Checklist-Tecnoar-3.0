import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { FormaPagamento } from '@/tipos/db'

/**
 * Dados do módulo financeiro.
 *
 * A base é a que o sistema já produz: quando uma OS é liberada com saldo a
 * faturar, `registrar_saida_patio` grava uma `fatura` e as suas
 * `fatura_parcelas`. Cada parcela é uma conta a receber — com vencimento,
 * valor e a data em que foi paga.
 *
 * Nada aqui é estimado. Onde não há dado, o número é zero de verdade e a tela
 * diz que não há.
 *
 * **Somas no cliente, e por quê.** O PostgREST não faz `sum()` sem uma view ou
 * função, e este projeto não tem uma para isso. As parcelas EM ABERTO são um
 * conjunto naturalmente pequeno (o que a oficina ainda tem a receber), então
 * são trazidas inteiras e somadas aqui. O mesmo vale para o recebido de um
 * mês. `LIMITE` existe para que um volume inesperado apareça como aviso na
 * tela em vez de virar um total silenciosamente errado.
 */

const LIMITE = 2000

export interface Parcela {
  id: string
  numero: number
  vencimento: string
  valor: number
  pago_em: string | null
  forma_pagamento: FormaPagamento | null
  observacao: string | null
  fatura: {
    id: string
    numero: number
    condicao: string
    emitida_em: string
    valor_total: number
    cliente: { id: string; nome_razao: string } | null
    os: { id: string; numero: number } | null
  } | null
}

const SELECT_PARCELA =
  'id, numero, vencimento, valor, pago_em, forma_pagamento, observacao, ' +
  'fatura:faturas ( id, numero, condicao, emitida_em, valor_total, ' +
  'cliente:clientes ( id, nome_razao ), os:ordens_servico ( id, numero ) )'

/** Hoje em ISO curto, no fuso local — `toISOString` viraria o dia à noite. */
export function hojeISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function inicioDoMes(offsetMeses = 0): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offsetMeses)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** Dias entre o vencimento e hoje. Negativo = ainda vai vencer. */
export function diasDeAtraso(vencimento: string): number {
  const v = new Date(`${vencimento}T00:00:00`)
  const h = new Date(`${hojeISO()}T00:00:00`)
  return Math.round((h.getTime() - v.getTime()) / 86_400_000)
}

export type FaixaAtraso = 'a_vencer' | 'hoje' | 'ate_30' | 'ate_60' | 'ate_90' | 'acima_90'

export const ROTULO_FAIXA: Record<FaixaAtraso, string> = {
  a_vencer: 'A vencer',
  hoje: 'Vence hoje',
  ate_30: 'Até 30 dias',
  ate_60: '31 a 60 dias',
  ate_90: '61 a 90 dias',
  acima_90: 'Mais de 90 dias',
}

export function faixaDeAtraso(vencimento: string): FaixaAtraso {
  const d = diasDeAtraso(vencimento)
  if (d < 0) return 'a_vencer'
  if (d === 0) return 'hoje'
  if (d <= 30) return 'ate_30'
  if (d <= 60) return 'ate_60'
  if (d <= 90) return 'ate_90'
  return 'acima_90'
}

export const ROTULO_FORMA: Record<FormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  debito: 'Débito',
  credito: 'Crédito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  faturado: 'Faturado',
  outro: 'Outro',
}

export const FORMAS_PAGAMENTO = Object.keys(ROTULO_FORMA) as FormaPagamento[]

/** Parcelas ainda não pagas — a carteira a receber inteira. */
export function useAReceber(habilitado: boolean) {
  return useQuery({
    queryKey: ['financeiro', 'a-receber'],
    enabled: habilitado,
    queryFn: async (): Promise<Parcela[]> => {
      const { data, error } = await supabase
        .from('fatura_parcelas')
        .select(SELECT_PARCELA)
        .is('pago_em', null)
        .order('vencimento', { ascending: true })
        .limit(LIMITE)
      if (error) throw error
      return (data ?? []) as unknown as Parcela[]
    },
  })
}

/** Parcelas pagas dentro de um intervalo. */
export function useRecebido(de: string, ate: string, habilitado: boolean) {
  return useQuery({
    queryKey: ['financeiro', 'recebido', de, ate],
    enabled: habilitado,
    queryFn: async (): Promise<Parcela[]> => {
      const { data, error } = await supabase
        .from('fatura_parcelas')
        .select(SELECT_PARCELA)
        .not('pago_em', 'is', null)
        .gte('pago_em', `${de}T00:00:00`)
        .lte('pago_em', `${ate}T23:59:59`)
        .order('pago_em', { ascending: false })
        .limit(LIMITE)
      if (error) throw error
      return (data ?? []) as unknown as Parcela[]
    },
  })
}

export interface FaturaResumo {
  id: string
  numero: number
  valor_total: number
  emitida_em: string
  condicao: string
  cliente: { nome_razao: string } | null
  os: { numero: number } | null
}

/** Faturas emitidas no intervalo — o faturamento do período. */
export function useFaturamento(de: string, ate: string, habilitado: boolean) {
  return useQuery({
    queryKey: ['financeiro', 'faturamento', de, ate],
    enabled: habilitado,
    queryFn: async (): Promise<FaturaResumo[]> => {
      const { data, error } = await supabase
        .from('faturas')
        .select('id, numero, valor_total, emitida_em, condicao, cliente:clientes ( nome_razao ), os:ordens_servico ( numero )')
        .gte('emitida_em', `${de}T00:00:00`)
        .lte('emitida_em', `${ate}T23:59:59`)
        .order('emitida_em', { ascending: false })
        .limit(LIMITE)
      if (error) throw error
      return (data ?? []) as unknown as FaturaResumo[]
    },
  })
}

/**
 * Recebimento à vista, registrado direto na OS.
 *
 * Nem tudo vira fatura: o que é pago no balcão fica em `ordens_servico`. Sem
 * isto, "recebido no mês" só mostraria o que foi parcelado — e o caixa da
 * oficina pareceria menor do que é.
 */
export function useRecebidoNaOS(de: string, ate: string, habilitado: boolean) {
  return useQuery({
    queryKey: ['financeiro', 'recebido-os', de, ate],
    enabled: habilitado,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('id, numero, valor_pago, pago_em, forma_pagamento, cliente:clientes ( nome_razao )')
        .not('pago_em', 'is', null)
        .gt('valor_pago', 0)
        .gte('pago_em', `${de}T00:00:00`)
        .lte('pago_em', `${ate}T23:59:59`)
        .order('pago_em', { ascending: false })
        .limit(LIMITE)
      if (error) throw error
      return (data ?? []) as unknown as Array<{
        id: string
        numero: number
        valor_pago: number
        pago_em: string
        forma_pagamento: FormaPagamento | null
        cliente: { nome_razao: string } | null
      }>
    },
  })
}

/** Baixa de parcela: marca como paga, com data e forma. */
export function useBaixarParcela() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      pagoEm,
      forma,
      observacao,
    }: {
      id: string
      pagoEm: string
      forma: FormaPagamento
      observacao: string
    }) => {
      const { error } = await supabase
        .from('fatura_parcelas')
        .update({
          pago_em: pagoEm,
          forma_pagamento: forma,
          observacao: observacao.trim() || null,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['financeiro'] }),
  })
}

/** Desfaz a baixa — errar a parcela na pressa do balcão é comum. */
export function useEstornarParcela() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('fatura_parcelas')
        .update({ pago_em: null, forma_pagamento: null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['financeiro'] }),
  })
}

export const soma = (ns: number[]) => ns.reduce((a, b) => a + Number(b || 0), 0)

/** `true` quando a consulta bateu no teto e o total exibido seria parcial. */
export const truncou = (n: number) => n >= LIMITE
