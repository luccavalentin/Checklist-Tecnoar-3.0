import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { IndicadoresPatio, LinhaPatioVeiculo, StatusOS } from '@/tipos/db'

/** Atualização do pátio: dado operacional precisa refletir rápido. */
export const INTERVALO_PATIO_MS = 20_000

/** Mesmo intervalo em segundos, para o rótulo "a cada Ns" não divergir do real. */
export const INTERVALO_PATIO_SEGUNDOS = INTERVALO_PATIO_MS / 1000

export function usePatio(ativo = true) {
  return useQuery({
    queryKey: ['patio', 'veiculos'],
    enabled: ativo,
    refetchInterval: ativo ? INTERVALO_PATIO_MS : false,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<LinhaPatioVeiculo[]> => {
      const { data, error } = await supabase
        .from('vw_patio')
        .select('*')
        .order('status_ordem')
        .order('segundos_no_estagio', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as LinhaPatioVeiculo[]
    },
  })
}

export function useIndicadoresPatio(ativo = true) {
  return useQuery({
    queryKey: ['patio', 'indicadores'],
    enabled: ativo,
    refetchInterval: ativo ? INTERVALO_PATIO_MS : false,
    queryFn: async (): Promise<IndicadoresPatio | null> => {
      const { data, error } = await supabase.rpc('indicadores_patio')
      if (error) throw error
      return (data ?? [])[0] ?? null
    },
  })
}

export function useEstagiosPatio() {
  return useQuery({
    queryKey: ['status_os', 'patio'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StatusOS[]> => {
      const { data, error } = await supabase
        .from('status_os')
        .select('*')
        .eq('situacao', 'ativo')
        .eq('conta_no_patio', true)
        .eq('is_final', false)
        .order('ordem')
      if (error) throw error
      return data ?? []
    },
  })
}

/** Formata segundos como 04:35 ou 2d 06h — legível à distância. */
export function duracao(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined || !Number.isFinite(segundos)) return '—'
  const s = Math.max(0, Math.floor(segundos))
  const dias = Math.floor(s / 86400)
  const horas = Math.floor((s % 86400) / 3600)
  const minutos = Math.floor((s % 3600) / 60)
  if (dias > 0) return `${dias}d ${String(horas).padStart(2, '0')}h`
  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`
}

/**
 * Motivo de alerta de um veículo no pátio — regra única do sistema.
 *
 * O filtro do painel, a faixa de alertas, o cartão e o Modo TV mantinham cada
 * um a sua lista do que conta como alerta, e elas divergiram: um veículo sem
 * mecânico aparecia no aviso mas sumia ao filtrar por "somente com alerta", e o
 * Modo TV nunca mostrava checklist pendente nem item aguardando aprovação —
 * justamente o que trava a entrega. A ordem abaixo é a de urgência
 * operacional; quem chama exibe só o primeiro motivo, que é o que precisa de
 * ação agora.
 */
export function motivoAlerta(v: LinhaPatioVeiculo): { texto: string; critico: boolean } | null {
  if (v.sla_vencido) return { texto: 'SLA de entrega vencido', critico: true }
  if (v.mecanicos.length === 0) return { texto: 'Sem mecânico atribuído', critico: false }
  if (v.checklists_abertos > 0) return { texto: 'Checklist pendente', critico: false }
  if (v.itens_pendentes > 0) {
    return { texto: `${v.itens_pendentes} item(ns) aguardando aprovação`, critico: false }
  }
  if (v.segundos_no_estagio > 86400) {
    return {
      texto: `Parado há ${duracao(v.segundos_no_estagio)}`,
      critico: v.segundos_no_estagio > 172800,
    }
  }
  return null
}

/** Cor do tempo: verde até 4h, atenção até 24h, crítico acima. */
export function tomDoTempo(segundos: number): 'neutro' | 'atencao' | 'critico' {
  if (segundos > 86400) return 'critico'
  if (segundos > 14400) return 'atencao'
  return 'neutro'
}
