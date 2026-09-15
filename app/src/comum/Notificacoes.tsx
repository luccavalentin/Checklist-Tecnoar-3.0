import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellOff, BellRing, CheckCheck } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { ativarNotificacoes, atualizarContadorDoIcone, inscreverAparelho, permissaoAtual } from '@/notificacoes/sistema'
import { useToast } from '@/componentes/ui/Toast'
import { haQuanto } from '@/sos/rotulos'
import { useSessao } from '../sessao'
import { BotaoApp, CabecalhoTela, CartaoApp, Esqueleto, Faixa, Tela, VazioApp } from './ui'

const db = supabase as unknown as SupabaseClient

interface Notificacao {
  id: string
  titulo: string
  mensagem: string | null
  link: string | null
  lida_em: string | null
  created_at: string
}

export const CHAVE_NOTIFICACOES = ['sos', 'notificacoes'] as const

/** Contador de não lidas — para a barra de navegação e o ícone do app. */
export function useNaoLidasApp(usuarioId: string | null) {
  const qc = useQueryClient()
  const consulta = useQuery({
    queryKey: [...CHAVE_NOTIFICACOES, 'nao-lidas', usuarioId],
    enabled: Boolean(usuarioId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await db
        .from('notificacoes')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', usuarioId)
        .is('lida_em', null)
      if (error) throw error
      return count ?? 0
    },
  })

  useEffect(() => {
    if (!usuarioId) return
    const canal = supabase
      .channel(`sos-notif-${usuarioId}-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notificacoes', filter: `usuario_id=eq.${usuarioId}` }, () => {
        void qc.invalidateQueries({ queryKey: CHAVE_NOTIFICACOES })
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(canal)
    }
  }, [usuarioId, qc])

  useEffect(() => {
    if (consulta.data != null) atualizarContadorDoIcone(consulta.data)
  }, [consulta.data])

  // Aparelho com permissão já dada: renova a inscrição de push a cada entrada.
  useEffect(() => {
    if (usuarioId && permissaoAtual() === 'granted') void inscreverAparelho(usuarioId).catch(() => {})
  }, [usuarioId])

  return consulta.data ?? 0
}

/**
 * Links das notificações vêm do banco como `/app/...` (de quando o app morava
 * nessa pasta do Checklist); no subdomínio do SOS, o app está na raiz.
 */
export function rotaInterna(link: string | null): string | null {
  if (!link) return null
  if (link.startsWith('/app/')) return link.slice(4)
  if (link === '/app') return '/'
  return null
}

export function Notificacoes() {
  const { usuarioId, papel } = useSessao()
  const qc = useQueryClient()
  const toast = useToast()
  const navegar = useNavigate()
  const permissao = permissaoAtual()

  const lista = useQuery({
    queryKey: [...CHAVE_NOTIFICACOES, 'lista', usuarioId],
    enabled: Boolean(usuarioId),
    queryFn: async (): Promise<Notificacao[]> => {
      const { data, error } = await db
        .from('notificacoes')
        .select('id, titulo, mensagem, link, lida_em, created_at')
        .eq('usuario_id', usuarioId)
        .order('created_at', { ascending: false })
        .limit(80)
      if (error) throw error
      return (data ?? []) as Notificacao[]
    },
  })

  const marcarTodas = useMutation({
    mutationFn: async () => {
      const { error } = await db.from('notificacoes').update({ lida_em: new Date().toISOString() }).eq('usuario_id', usuarioId).is('lida_em', null)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHAVE_NOTIFICACOES }),
  })

  async function abrir(n: Notificacao) {
    if (!n.lida_em) {
      await db.from('notificacoes').update({ lida_em: new Date().toISOString() }).eq('id', n.id)
      void qc.invalidateQueries({ queryKey: CHAVE_NOTIFICACOES })
    }
    const rota = rotaInterna(n.link)
    if (rota) navegar(rota)
  }

  async function ativar() {
    if (!usuarioId) return
    const r = await ativarNotificacoes(usuarioId)
    if (r === 'ativadas') toast.ok('Notificações ativadas', 'Você será avisado mesmo com o app fechado.')
    else if (r === 'negada') toast.atencao('Notificações bloqueadas', 'Libere as notificações do SOS Tecnoar nas configurações do aparelho.')
    else toast.atencao('Indisponível', 'Instale o app na tela de início para receber avisos.')
  }

  const naoLidas = (lista.data ?? []).filter((n) => !n.lida_em).length

  return (
    <>
      <CabecalhoTela
        titulo="Notificações"
        voltar={papel?.papel === 'cliente'}
        acao={
          naoLidas > 0 ? (
            <button type="button" onClick={() => marcarTodas.mutate()} className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-semibold text-accent-ink hover:bg-accent-soft">
              <CheckCheck className="size-4" /> Ler todas
            </button>
          ) : undefined
        }
      />
      <Tela>
        {permissao !== 'granted' && (
          <CartaoApp className="flex flex-wrap items-center gap-3 border-accent/30">
            <BellRing className="size-7 shrink-0 text-accent-ink" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-[15px] font-bold text-ink">Receba avisos no celular</p>
              <p className="text-[13px] text-ink-2">Mecânico a caminho, chegada e mensagens — mesmo com o app fechado.</p>
            </div>
            <BotaoApp tamanho="md" onClick={() => void ativar()} disabled={permissao === 'indisponivel'}>
              Ativar
            </BotaoApp>
          </CartaoApp>
        )}
        {permissao === 'denied' && (
          <Faixa icone={BellOff}>As notificações estão bloqueadas neste aparelho. Libere nas configurações do celular.</Faixa>
        )}

        {lista.isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Esqueleto key={i} className="h-20" />
            ))}
          </div>
        ) : (lista.data ?? []).length === 0 ? (
          <VazioApp icone={Bell} titulo="Nada por aqui" descricao="Os avisos dos seus chamados e revisões aparecem aqui." />
        ) : (
          <ul className="flex flex-col gap-2">
            {(lista.data ?? []).map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void abrir(n)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-[1.25rem] border bg-surface px-4 py-3.5 text-left transition-colors active:bg-surface-2',
                    n.lida_em ? 'border-line' : 'border-accent/40',
                  )}
                >
                  <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', n.lida_em ? 'bg-transparent' : 'bg-accent')} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold text-ink">{n.titulo}</span>
                    {n.mensagem && <span className="block text-[13.5px] leading-snug text-ink-2">{n.mensagem}</span>}
                    <span className="mt-1 block text-[11.5px] text-ink-3">{haQuanto(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Tela>
    </>
  )
}
