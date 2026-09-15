import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ChamadoSOS, MensagemSOS, PosicaoSOS } from './tipos'

/**
 * Tempo real do SOS (Supabase Realtime sobre `postgres_changes`).
 *
 * O Realtime respeita a RLS: cada aparelho só recebe as linhas que poderia
 * ler — o cliente não ouve chamados alheios, o mecânico não ouve o que não é
 * dele. Aqui a regra é simples: evento chegou → a consulta da tela é
 * invalidada e busca o estado completo de novo. Posição é a exceção: vem
 * direto no evento, porque chega de segundos em segundos.
 */

export const CHAVES_SOS = {
  raiz: ['sos'] as const,
  detalhe: (id: string) => ['sos', 'detalhe', id] as const,
  lista: ['sos', 'lista'] as const,
  indicadores: ['sos', 'indicadores'] as const,
  mecanicos: ['sos', 'mecanicos'] as const,
  sugestoes: (id: string) => ['sos', 'sugestoes', id] as const,
  homeCliente: ['sos', 'home-cliente'] as const,
  homeMecanico: ['sos', 'home-mecanico'] as const,
  meusChamados: ['sos', 'meus-chamados'] as const,
  agendamentos: ['sos', 'agendamentos'] as const,
  papel: ['sos', 'papel'] as const,
  config: ['sos', 'config'] as const,
  contas: ['sos', 'contas'] as const,
  veiculos: ['sos', 'veiculos'] as const,
  historico: (veiculo?: string | null) => ['sos', 'historico', veiculo ?? 'todos'] as const,
}

type Canal = ReturnType<typeof supabase.channel>

function useUltimo<T>(fn: T) {
  const ref = useRef(fn)
  ref.current = fn
  return ref
}

/**
 * Tudo de um chamado: estado, posições, mensagens, linha do tempo, itens e
 * anexos. Usado pela tela do chamado no app e pelo painel da central.
 */
export function useTempoRealChamado(
  chamadoId: string | null | undefined,
  callbacks: {
    aoPosicao?: (p: PosicaoSOS) => void
    aoMensagem?: (m: MensagemSOS) => void
    aoChamado?: (c: ChamadoSOS, anterior: Partial<ChamadoSOS> | null) => void
  } = {},
) {
  const qc = useQueryClient()
  const cb = useUltimo(callbacks)

  useEffect(() => {
    if (!chamadoId) return
    const invalidar = () => void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(chamadoId) })
    const filtro = `chamado_id=eq.${chamadoId}`
    const canal: Canal = supabase
      .channel(`sos-chamado-${chamadoId}-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_chamados', filter: `id=eq.${chamadoId}` }, (e) => {
        cb.current.aoChamado?.(e.new as ChamadoSOS, (e.old as Partial<ChamadoSOS>) ?? null)
        invalidar()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_posicoes', filter: filtro }, (e) => {
        cb.current.aoPosicao?.(e.new as PosicaoSOS)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_mensagens', filter: filtro }, (e) => {
        if (e.eventType === 'INSERT') cb.current.aoMensagem?.(e.new as MensagemSOS)
        invalidar()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_eventos', filter: filtro }, invalidar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_itens', filter: filtro }, invalidar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_anexos', filter: filtro }, invalidar)
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [chamadoId, qc, cb])
}

/**
 * Central: qualquer chamado ou mecânico mudou. O callback toca o alerta em
 * dois casos: SOS novo, e SOS que o vigia do servidor escalou (ninguém aceitou
 * no prazo, ou o mecânico escolhido não respondeu e ele voltou para a fila).
 */
export function useTempoRealCentral(aoNovoChamado?: (c: ChamadoSOS, motivo: 'novo' | 'escalado') => void, ativo = true) {
  const qc = useQueryClient()
  const cb = useUltimo(aoNovoChamado)

  useEffect(() => {
    if (!ativo) return
    let espera: number | undefined
    // Rajada de eventos (aceite gera 3 atualizações) vira uma recarga só.
    const recarregar = () => {
      window.clearTimeout(espera)
      espera = window.setTimeout(() => {
        void qc.invalidateQueries({ queryKey: CHAVES_SOS.lista })
        void qc.invalidateQueries({ queryKey: CHAVES_SOS.indicadores })
      }, 350)
    }
    const canal: Canal = supabase
      .channel(`sos-central-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_chamados' }, (e) => {
        if (e.eventType === 'INSERT') cb.current?.(e.new as ChamadoSOS, 'novo')
        else if (e.eventType === 'UPDATE') {
          const novo = e.new as ChamadoSOS
          const antigo = e.old as Partial<ChamadoSOS> | undefined
          const aguardando = novo.status === 'recebido' || novo.status === 'procurando_mecanico'
          const subiu = (novo.alerta_nivel ?? 0) > (antigo?.alerta_nivel ?? 0)
          const devolvido = !novo.mecanico_id && !!antigo?.mecanico_id
          if (aguardando && (subiu || devolvido)) cb.current?.(novo, 'escalado')
        }
        const id = (e.new as { id?: string })?.id ?? (e.old as { id?: string })?.id
        if (id) void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(id) })
        recarregar()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_mecanicos' }, () => {
        void qc.invalidateQueries({ queryKey: CHAVES_SOS.mecanicos })
        void qc.invalidateQueries({ queryKey: ['sos', 'sugestoes'] })
        recarregar()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_agendamentos' }, () => {
        void qc.invalidateQueries({ queryKey: CHAVES_SOS.agendamentos })
        recarregar()
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sos_mensagens' }, recarregar)
      .subscribe()
    return () => {
      window.clearTimeout(espera)
      void supabase.removeChannel(canal)
    }
  }, [qc, cb, ativo])
}

/**
 * Mecânico: chamado novo na fila (ou atribuído a ele) dispara o alerta; o
 * resto só atualiza o painel.
 */
export function useTempoRealMecanico(
  usuarioId: string | null | undefined,
  aoChamadoParaMim?: (c: ChamadoSOS) => void,
) {
  const qc = useQueryClient()
  const cb = useUltimo(aoChamadoParaMim)

  useEffect(() => {
    if (!usuarioId) return
    const canal: Canal = supabase
      .channel(`sos-mecanico-${usuarioId}-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_chamados' }, (e) => {
        const novo = e.new as ChamadoSOS | undefined
        const antigo = e.old as Partial<ChamadoSOS> | undefined
        if (novo?.id) void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(novo.id) })
        void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeMecanico })
        if (!novo) return
        const aguardando = novo.status === 'recebido' || novo.status === 'procurando_mecanico'
        const chegouNaFila = e.eventType === 'INSERT' && aguardando && !novo.mecanico_id
        const atribuidoAMim =
          novo.mecanico_id === usuarioId && antigo?.mecanico_id !== usuarioId && (aguardando || novo.status === 'a_caminho')
        // Vigia do servidor: ninguém aceitou e o alerta subiu de nível, ou o
        // mecânico escolhido pela central não respondeu e o SOS voltou para
        // todos. Toca de novo — menos para quem acabou de largá-lo.
        const subiuAlerta =
          e.eventType === 'UPDATE' && aguardando && !novo.mecanico_id && (novo.alerta_nivel ?? 0) > (antigo?.alerta_nivel ?? 0)
        const voltouParaFila =
          e.eventType === 'UPDATE' && aguardando && !novo.mecanico_id && !!antigo?.mecanico_id && antigo.mecanico_id !== usuarioId
        if (chegouNaFila || atribuidoAMim || subiuAlerta || voltouParaFila) cb.current?.(novo)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_mecanicos', filter: `usuario_id=eq.${usuarioId}` }, () => {
        void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeMecanico })
        void qc.invalidateQueries({ queryKey: CHAVES_SOS.papel })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [usuarioId, qc, cb])
}

/** Cliente: seus chamados e agendamentos. */
export function useTempoRealCliente(clienteId: string | null | undefined, aoMudarChamado?: (c: ChamadoSOS, anterior: Partial<ChamadoSOS> | null) => void) {
  const qc = useQueryClient()
  const cb = useUltimo(aoMudarChamado)

  useEffect(() => {
    if (!clienteId) return
    const canal: Canal = supabase
      .channel(`sos-cliente-${clienteId}-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_chamados', filter: `cliente_id=eq.${clienteId}` }, (e) => {
        const novo = e.new as ChamadoSOS | undefined
        if (novo?.id) {
          void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(novo.id) })
          cb.current?.(novo, (e.old as Partial<ChamadoSOS>) ?? null)
        }
        void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeCliente })
        void qc.invalidateQueries({ queryKey: CHAVES_SOS.meusChamados })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_agendamentos', filter: `cliente_id=eq.${clienteId}` }, () => {
        void qc.invalidateQueries({ queryKey: CHAVES_SOS.agendamentos })
        void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeCliente })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [clienteId, qc, cb])
}
