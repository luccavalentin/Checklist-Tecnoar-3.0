import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  Assinatura,
  Cliente,
  EstadoProdutoOS,
  OSEvento,
  OSProduto,
  OSServico,
  OrdemServico,
  SituacaoAprovacao,
  StatusOS,
  Veiculo,
} from '@/tipos/db'

export const SELECT_OS_LISTA =
  'id, numero, tipo, aberta_em, encerrada_em, valor_total, situacao, prioridade, status_id, cliente_id, veiculo_id, ' +
  'cliente:clientes ( id, nome_razao ), veiculo:veiculos ( id, placa, descricao ), ' +
  'status:status_os ( id, nome, cor, categoria )'

export interface OSCompleta extends OrdemServico {
  cliente: Cliente | null
  veiculo: Veiculo | null
  status: StatusOS | null
}

export function useOrdem(osId: string | null) {
  return useQuery({
    queryKey: ['os', osId],
    enabled: Boolean(osId),
    queryFn: async (): Promise<OSCompleta | null> => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select('*, cliente:clientes ( * ), veiculo:veiculos ( * ), status:status_os ( * )')
        .eq('id', osId!)
        .maybeSingle()
      if (error) throw error
      return data as unknown as OSCompleta | null
    },
  })
}

export function useItensOS(osId: string | null) {
  const servicos = useQuery({
    queryKey: ['os-servicos', osId],
    enabled: Boolean(osId),
    queryFn: async (): Promise<OSServico[]> => {
      const { data, error } = await supabase.from('os_servicos').select('*').eq('os_id', osId!).order('ordem')
      if (error) throw error
      return data ?? []
    },
  })

  const produtos = useQuery({
    queryKey: ['os-produtos', osId],
    enabled: Boolean(osId),
    queryFn: async (): Promise<OSProduto[]> => {
      const { data, error } = await supabase.from('os_produtos').select('*').eq('os_id', osId!).order('ordem')
      if (error) throw error
      return data ?? []
    },
  })

  return { servicos, produtos }
}

export function useEventosOS(osId: string | null) {
  return useQuery({
    queryKey: ['os-eventos', osId],
    enabled: Boolean(osId),
    queryFn: async (): Promise<Array<OSEvento & { usuario: { nome_completo: string } | null }>> => {
      const { data, error } = await supabase
        .from('os_eventos')
        .select('*, usuario:usuarios ( nome_completo )')
        .eq('os_id', osId!)
        .order('ocorrido_em', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Array<OSEvento & { usuario: { nome_completo: string } | null }>
    },
  })
}

export function useAssinaturas(entidade: string, entidadeId: string | null) {
  return useQuery({
    queryKey: ['assinaturas', entidade, entidadeId],
    enabled: Boolean(entidadeId),
    queryFn: async (): Promise<Assinatura[]> => {
      const { data, error } = await supabase
        .from('assinaturas')
        .select('*')
        .eq('entidade', entidade)
        .eq('entidade_id', entidadeId!)
        .order('assinado_em', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })
}

export function useStatusOS() {
  return useQuery({
    queryKey: ['status_os', 'ativos'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<StatusOS[]> => {
      const { data, error } = await supabase.from('status_os').select('*').eq('situacao', 'ativo').order('ordem')
      if (error) throw error
      return data ?? []
    },
  })
}

/** Invalida tudo que depende de uma OS depois de qualquer alteração. */
export function useInvalidarOS() {
  const qc = useQueryClient()
  return (osId: string | null) => {
    void qc.invalidateQueries({ queryKey: ['os', osId] })
    void qc.invalidateQueries({ queryKey: ['os-servicos', osId] })
    void qc.invalidateQueries({ queryKey: ['os-produtos', osId] })
    void qc.invalidateQueries({ queryKey: ['os-eventos', osId] })
    void qc.invalidateQueries({ queryKey: ['ordens_servico'] })
    void qc.invalidateQueries({ queryKey: ['patio'] })
  }
}

export interface AlteracaoAprovacao {
  tabela: 'os_servicos' | 'os_produtos'
  id: string
  aprovacao: SituacaoAprovacao
  usuarioId: string | null
}

export function useAprovarItem(osId: string | null) {
  const invalidar = useInvalidarOS()
  return useMutation({
    mutationFn: async ({ tabela, id, aprovacao, usuarioId }: AlteracaoAprovacao) => {
      const alteracao = {
        aprovacao,
        aprovado_em: aprovacao === 'pendente' ? null : new Date().toISOString(),
        aprovado_por: aprovacao === 'pendente' ? null : usuarioId,
      }
      const r =
        tabela === 'os_servicos'
          ? await supabase.from('os_servicos').update(alteracao).eq('id', id)
          : await supabase.from('os_produtos').update(alteracao).eq('id', id)
      if (r.error) throw r.error
    },
    onSuccess: () => invalidar(osId),
  })
}

export function useEstadoProduto(osId: string | null) {
  const invalidar = useInvalidarOS()
  return useMutation({
    mutationFn: async ({ id, estado }: { id: string; estado: EstadoProdutoOS }) => {
      const { error } = await supabase.from('os_produtos').update({ estado }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidar(osId),
  })
}

export const ROTULO_APROVACAO: Record<SituacaoAprovacao, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
}

export const TOM_APROVACAO: Record<SituacaoAprovacao, 'atencao' | 'ok' | 'critico'> = {
  pendente: 'atencao',
  aprovado: 'ok',
  recusado: 'critico',
}

export const ESTADOS_PRODUTO: Array<{ valor: EstadoProdutoOS; rotulo: string }> = [
  { valor: 'necessario', rotulo: 'Necessário' },
  { valor: 'reservado', rotulo: 'Reservado' },
  { valor: 'utilizado', rotulo: 'Utilizado' },
  { valor: 'nao_utilizado', rotulo: 'Não utilizado' },
  { valor: 'devolvido', rotulo: 'Devolvido' },
]

export const ROTULO_ESTADO_PRODUTO = Object.fromEntries(
  ESTADOS_PRODUTO.map((e) => [e.valor, e.rotulo]),
) as Record<EstadoProdutoOS, string>
