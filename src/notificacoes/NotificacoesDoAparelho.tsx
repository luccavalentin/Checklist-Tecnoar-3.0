import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BellRing, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Botao } from '@/componentes/ui/Botao'
import { useToast } from '@/componentes/ui/Toast'
import {
  ativarNotificacoes,
  atualizarContadorDoIcone,
  inscreverAparelho,
  mostrarNotificacao,
  permissaoAtual,
  suportado,
  type NotificacaoParaMostrar,
} from './sistema'

const INTERVALO_MS = 30_000
const CHAVE_ADIADO = 'tecnoar.notificacoes.adiado'
const DIAS_DE_PAUSA = 30

function appInstalado(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function adiadoRecentemente(): boolean {
  try {
    const quando = localStorage.getItem(CHAVE_ADIADO)
    return Boolean(quando) && (Date.now() - Number(quando)) / 86_400_000 < DIAS_DE_PAUSA
  } catch {
    return false
  }
}

/**
 * Entrega as notificações do banco ao aparelho, como um app nativo.
 *
 * - App em segundo plano: notificação do sistema, com o logo da Tecnoar.
 * - App aberto e em foco: aviso dentro do app. Notificação do sistema por
 *   cima da tela que a pessoa está olhando só duplica o aviso.
 * - O número de não lidas vai para o ícone do app instalado.
 *
 * Com a função `push` publicada, o aviso chega também com o app fechado; o
 * service worker manda para cá o que chegar enquanto o app está em foco, e o
 * conjunto `vistas` impede que o mesmo aviso apareça duas vezes.
 */
export function useNotificacoesDoAparelho(usuarioId: string | undefined, naoLidas: number | undefined) {
  const qc = useQueryClient()
  const toast = useToast()
  const toastAtual = useRef(toast)
  toastAtual.current = toast

  useEffect(() => {
    if (typeof naoLidas === 'number') atualizarContadorDoIcone(naoLidas)
  }, [naoLidas])

  useEffect(() => {
    if (!usuarioId) return
    void inscreverAparelho(usuarioId).catch(() => {})

    /* Só o que nasce depois desta entrada: abrir o app não pode despejar no
       aparelho todas as notificações antigas de uma vez. */
    const marco = new Date().toISOString()
    const vistas = new Set<string>()
    let ativo = true

    function entregar(n: NotificacaoParaMostrar) {
      if (vistas.has(n.id)) return
      vistas.add(n.id)
      if (document.visibilityState === 'hidden') void mostrarNotificacao(n)
      else toastAtual.current.info(n.titulo, n.mensagem ?? undefined)
      void qc.invalidateQueries({ queryKey: ['notificacoes-nao-lidas', usuarioId] })
      void qc.invalidateQueries({ queryKey: ['notificacoes', usuarioId] })
    }

    async function verificar() {
      const { data, error } = await supabase
        .from('notificacoes')
        .select('id, titulo, mensagem, link, created_at')
        .eq('usuario_id', usuarioId!)
        .is('lida_em', null)
        .is('dispensada_em', null)
        .gt('created_at', marco)
        .order('created_at', { ascending: true })
        .limit(20)
      if (!ativo || error || !data) return
      for (const n of data) entregar(n)
    }

    function doServiceWorker(evento: MessageEvent) {
      const msg = evento.data as { tipo?: string; dados?: Record<string, string | null> } | null
      if (msg?.tipo !== 'tecnoar:notificacao' || !msg.dados?.id) return
      entregar({
        id: msg.dados.id,
        titulo: msg.dados.titulo ?? 'Tecnoar',
        mensagem: msg.dados.mensagem ?? null,
        link: msg.dados.link ?? null,
        created_at: msg.dados.criada_em ?? new Date().toISOString(),
      })
    }

    function aoVoltar() {
      if (document.visibilityState === 'visible') void verificar()
    }

    const relogio = window.setInterval(() => void verificar(), INTERVALO_MS)
    document.addEventListener('visibilitychange', aoVoltar)
    navigator.serviceWorker?.addEventListener('message', doServiceWorker)
    return () => {
      ativo = false
      window.clearInterval(relogio)
      document.removeEventListener('visibilitychange', aoVoltar)
      navigator.serviceWorker?.removeEventListener('message', doServiceWorker)
    }
  }, [usuarioId, qc])
}

/**
 * Convite para ativar as notificações.
 *
 * Só aparece no app instalado. No navegador comum a notificação sai com o
 * nome do Chrome; no app instalado, com o nome e o logo da Tecnoar — e é essa
 * a que vale. Quem ainda não instalou recebe primeiro o convite de instalar.
 *
 * A permissão é pedida no toque em "Ativar", nunca sozinha: pedido sem
 * contexto é o jeito mais rápido de levar um "bloquear" para sempre.
 */
export function ConviteNotificacoes({ usuarioId }: { usuarioId: string }) {
  const toast = useToast()
  const [visivel, setVisivel] = useState(false)
  const [ativando, setAtivando] = useState(false)

  useEffect(() => {
    if (!suportado() || permissaoAtual() !== 'default' || adiadoRecentemente() || !appInstalado()) return
    const relogio = window.setTimeout(() => setVisivel(true), 2500)
    return () => window.clearTimeout(relogio)
  }, [])

  if (!visivel) return null

  function dispensar() {
    try {
      localStorage.setItem(CHAVE_ADIADO, String(Date.now()))
    } catch {
      /* Sem armazenamento o convite volta na próxima visita. Aceitável. */
    }
    setVisivel(false)
  }

  async function ativar() {
    setAtivando(true)
    const resultado = await ativarNotificacoes(usuarioId)
    setAtivando(false)
    setVisivel(false)
    if (resultado === 'ativadas') {
      toast.ok('Notificações ativadas', 'Os avisos do Tecnoar passam a chegar neste aparelho.')
    } else if (resultado === 'negada') {
      toast.atencao(
        'Notificações bloqueadas',
        'Para ativar depois, libere as notificações do Tecnoar nas configurações do aparelho.',
      )
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Ativar notificações"
      className="fixed inset-x-3 z-[60] flex items-center gap-3 rounded-xl border border-line-strong bg-surface p-3 shadow-e3 sm:inset-x-auto sm:right-4 sm:w-[390px]"
      /* Acima da barra de ações fixa (a OS no celular) ou do indicador de início
         do iPhone — a barra já inclui essa faixa, então vale o maior dos dois. */
      style={{ bottom: 'calc(max(var(--barra-acoes, 0px), env(safe-area-inset-bottom)) + 0.75rem)' }}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
        <BellRing aria-hidden className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink">Receber avisos no aparelho</p>
        <p className="text-[11.5px] leading-snug text-balance text-ink-3">
          Os avisos do sistema chegam como notificação do Tecnoar, mesmo com o app fechado.
        </p>
      </div>
      <Botao tamanho="sm" carregando={ativando} onClick={() => void ativar()}>
        Ativar
      </Botao>
      <button
        type="button"
        onClick={dispensar}
        aria-label="Agora não"
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  )
}
