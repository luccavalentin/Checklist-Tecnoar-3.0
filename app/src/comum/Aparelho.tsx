import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { BellOff, BellRing, CheckCircle2, ChevronRight, Download, Send, Smartphone, X, type LucideIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { useToast } from '@/componentes/ui/Toast'
import { useInstalacao } from '@/layout/ConviteInstalacao'
import { ativarNotificacoes, BADGE, mostrarNotificacao, permissaoAtual, suportado } from '@/notificacoes/sistema'
import { useSessao } from '../sessao'
import { BotaoApp, Folha } from './ui'
import { CHAVE_NOTIFICACOES, rotaInterna } from './Notificacoes'

/**
 * O SOS Tecnoar como aplicativo do aparelho: instalado, com notificação que
 * chega com o app fechado e aviso dentro do app quando ele está aberto — o
 * que se espera de um app nativo.
 *
 * - `AvisosDoApp`: com o app aberto, a notificação desce no topo da tela (e
 *   leva à tela certa ao tocar); com o app em segundo plano, vira notificação
 *   do sistema. Nada chega em dobro: o `id` da notificação é a chave.
 * - `ConviteNotificacoesApp`: depois de instalado, pede a permissão no momento
 *   certo, explicando para quê.
 * - `CartaoAparelho`: no perfil — instalar, ativar e testar as notificações.
 */

const CHAVE_ADIADO = 'sos.notificacoes.adiado'
const DIAS_DE_PAUSA = 7

/* ── estado do aparelho ─────────────────────────────────────────────────── */

function standalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function ehIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Instalado agora? Acompanha a instalação feita com a tela aberta. */
export function useInstalado(): boolean {
  const [instalado, setInstalado] = useState(standalone)
  useEffect(() => {
    const consulta = window.matchMedia('(display-mode: standalone)')
    const atualizar = () => setInstalado(standalone())
    consulta.addEventListener('change', atualizar)
    window.addEventListener('appinstalled', atualizar)
    return () => {
      consulta.removeEventListener('change', atualizar)
      window.removeEventListener('appinstalled', atualizar)
    }
  }, [])
  return instalado
}

/**
 * Permissão de notificação, relida quando a pessoa volta ao app — ela pode ter
 * liberado nas configurações do aparelho enquanto estava fora.
 */
export function usePermissaoNotificacao() {
  const [permissao, setPermissao] = useState(permissaoAtual)
  useEffect(() => {
    const reler = () => setPermissao(permissaoAtual())
    document.addEventListener('visibilitychange', reler)
    window.addEventListener('focus', reler)
    return () => {
      document.removeEventListener('visibilitychange', reler)
      window.removeEventListener('focus', reler)
    }
  }, [])
  return [permissao, setPermissao] as const
}

/** Ativa as notificações com o retorno certo para cada resultado. */
function useAtivarNotificacoes(aoMudar: () => void) {
  const { usuarioId } = useSessao()
  const toast = useToast()
  const [ativando, setAtivando] = useState(false)

  const ativar = useCallback(async (): Promise<boolean> => {
    if (!usuarioId) return false
    setAtivando(true)
    try {
      const r = await ativarNotificacoes(usuarioId)
      aoMudar()
      if (r === 'ativadas') {
        toast.ok('Notificações ativadas', 'Você recebe os avisos da Tecnoar mesmo com o app fechado.')
        return true
      }
      if (r === 'negada') toast.atencao('Notificações bloqueadas', 'Libere as notificações do SOS Tecnoar nas configurações do celular.')
      else
        toast.atencao(
          'Instale o app primeiro',
          ehIOS() ? 'No iPhone, as notificações só funcionam com o app na Tela de Início.' : 'Este navegador não recebe notificações.',
        )
      return false
    } finally {
      setAtivando(false)
    }
  }, [usuarioId, toast, aoMudar])

  return { ativar, ativando }
}

/** Notificação de teste, local: prova permissão, ícone e som do aparelho. */
async function notificacaoDeTeste(): Promise<boolean> {
  if (!suportado() || Notification.permission !== 'granted') return false
  const registro = await navigator.serviceWorker.getRegistration()
  if (!registro) return false
  await registro.showNotification('SOS Tecnoar', {
    body: 'Tudo certo! Os avisos do seu atendimento chegam assim neste aparelho.',
    icon: '/icone-192.png',
    badge: BADGE,
    lang: 'pt-BR',
    tag: 'sos-teste',
    data: { link: '/notificacoes' },
    vibrate: [120, 60, 120],
  } as NotificationOptions)
  return true
}

/* ── aviso no topo, com o app aberto ────────────────────────────────────── */

interface Aviso {
  id: string
  titulo: string
  mensagem: string | null
  link: string | null
  criada_em: string
}

/** Títulos de aviso urgente do SOS (mesma regra do service worker). */
const URGENTE = /^(🚨|🔴|⏱|⚠️|📡|📍|⏰)/u

export function AvisosDoApp() {
  const { usuarioId } = useSessao()
  const qc = useQueryClient()
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const [aviso, setAviso] = useState<Aviso | null>(null)
  const caminho = useRef(pathname)
  caminho.current = pathname

  useEffect(() => {
    if (!usuarioId) return
    const vistas = new Set<string>()
    const marco = Date.now()

    function entregar(a: Aviso) {
      if (!a.id || vistas.has(a.id)) return
      // Só o que nasce com o app aberto — nunca a fila antiga de uma vez.
      if (Date.parse(a.criada_em) < marco - 60_000) return
      vistas.add(a.id)
      void qc.invalidateQueries({ queryKey: CHAVE_NOTIFICACOES })

      if (document.visibilityState === 'hidden') {
        // Em segundo plano: notificação do sistema. Se o push também chegar,
        // o mesmo `tag` substitui em silêncio em vez de tocar duas vezes.
        void mostrarNotificacao({ id: a.id, titulo: a.titulo, mensagem: a.mensagem, link: a.link, created_at: a.criada_em })
        return
      }
      // Já está na tela de que o aviso fala: ela mesma se atualiza.
      const rota = rotaInterna(a.link)
      if (rota && rota === caminho.current) return
      if (URGENTE.test(a.titulo)) navigator.vibrate?.([200, 80, 200])
      setAviso(a)
    }

    const canal = supabase
      .channel(`sos-avisos-${usuarioId}-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificacoes', filter: `usuario_id=eq.${usuarioId}` }, (p) => {
        const n = p.new as { id: string; titulo: string; mensagem: string | null; link: string | null; created_at: string }
        entregar({ id: n.id, titulo: n.titulo, mensagem: n.mensagem, link: n.link, criada_em: n.created_at })
      })
      .subscribe()

    // Push que chegou com o app em foco: o service worker entrega para cá.
    function doServiceWorker(evento: MessageEvent) {
      const msg = evento.data as { tipo?: string; dados?: Partial<Aviso> } | null
      if (msg?.tipo !== 'tecnoar:notificacao' || !msg.dados?.id) return
      const d = msg.dados
      entregar({
        id: d.id!,
        titulo: d.titulo ?? 'SOS Tecnoar',
        mensagem: d.mensagem ?? null,
        link: d.link ?? null,
        criada_em: d.criada_em ?? new Date().toISOString(),
      })
    }
    navigator.serviceWorker?.addEventListener('message', doServiceWorker)

    return () => {
      void supabase.removeChannel(canal)
      navigator.serviceWorker?.removeEventListener('message', doServiceWorker)
    }
  }, [usuarioId, qc])

  useEffect(() => {
    if (!aviso) return
    const relogio = window.setTimeout(() => setAviso(null), URGENTE.test(aviso.titulo) ? 12_000 : 6_000)
    return () => window.clearTimeout(relogio)
  }, [aviso])

  if (!aviso) return null
  const urgente = URGENTE.test(aviso.titulo)

  function abrir() {
    if (!aviso) return
    const rota = rotaInterna(aviso.link)
    const id = aviso.id
    setAviso(null)
    void supabase
      .from('notificacoes')
      .update({ lida_em: new Date().toISOString() })
      .eq('id', id)
      .then(() => void qc.invalidateQueries({ queryKey: CHAVE_NOTIFICACOES }))
    navegar(rota ?? '/notificacoes')
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[96] flex justify-center px-3"
      style={{ top: 'calc(var(--faixa-rede, 0px) + env(safe-area-inset-top) + 0.5rem)' }}
    >
      <div
        key={aviso.id}
        role="alert"
        aria-live="assertive"
        className={cn(
          'sos-aviso-desce pointer-events-auto flex w-full max-w-md items-start gap-1 rounded-[1.25rem] border p-3 pr-1.5 shadow-[0_18px_40px_-18px_rgb(8_24_48/0.55)] backdrop-blur',
          urgente ? 'border-[#ff6600]/50 bg-[#0D1C33]/95 text-white' : 'border-line bg-surface/95 text-ink',
        )}
      >
        <button type="button" onClick={abrir} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <img src="/icone-192.png" alt="" className="mt-0.5 size-10 shrink-0 rounded-[0.7rem]" />
          <span className="min-w-0 flex-1">
            <span className={cn('flex items-center gap-1.5 text-[11.5px] font-semibold', urgente ? 'text-white/60' : 'text-ink-3')}>
              SOS Tecnoar <span aria-hidden>·</span> agora
            </span>
            <span className="block truncate text-[14.5px] font-bold">{aviso.titulo}</span>
            {aviso.mensagem && (
              <span className={cn('line-clamp-2 block text-[13.5px] leading-snug', urgente ? 'text-white/80' : 'text-ink-2')}>{aviso.mensagem}</span>
            )}
          </span>
        </button>
        <button
          type="button"
          aria-label="Dispensar aviso"
          onClick={() => setAviso(null)}
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-full',
            urgente ? 'text-white/60 active:bg-white/10' : 'text-ink-3 active:bg-surface-2',
          )}
        >
          <X className="size-5" />
        </button>
      </div>
    </div>
  )
}

/* ── convite para ativar, depois de instalado ───────────────────────────── */

function adiadoRecentemente(): boolean {
  try {
    const quando = localStorage.getItem(CHAVE_ADIADO)
    return Boolean(quando) && (Date.now() - Number(quando)) / 86_400_000 < DIAS_DE_PAUSA
  } catch {
    return false
  }
}

/**
 * Pede a notificação quando ela faz sentido: app instalado (no iPhone é o
 * único jeito de receber), conta logada, fora de tela de emergência. Primeiro
 * explica, depois o sistema pergunta — pedido sem contexto vira "bloquear".
 */
export function ConviteNotificacoesApp({ bloqueado }: { bloqueado: boolean }) {
  const { usuarioId, papel } = useSessao()
  const instalado = useInstalado()
  const [permissao, setPermissao] = usePermissaoNotificacao()
  const { ativar, ativando } = useAtivarNotificacoes(() => setPermissao(permissaoAtual()))
  const [aberto, setAberto] = useState(false)
  const logado = !!usuarioId && !!papel && papel.papel !== 'anonimo' && papel.papel !== 'novo'
  const mecanico = papel?.papel === 'mecanico'

  useEffect(() => {
    if (!logado || bloqueado || !instalado || permissao !== 'default' || adiadoRecentemente()) return
    const relogio = window.setTimeout(() => setAberto(true), 1800)
    return () => window.clearTimeout(relogio)
  }, [logado, bloqueado, instalado, permissao])

  useEffect(() => {
    if (bloqueado || permissao !== 'default') setAberto(false)
  }, [bloqueado, permissao])

  function depois() {
    try {
      localStorage.setItem(CHAVE_ADIADO, String(Date.now()))
    } catch {
      /* Sem armazenamento, o convite volta na próxima abertura. */
    }
    setAberto(false)
  }

  const itens = mecanico
    ? ['Chamado novo perto de você, com sirene', 'Mensagens do cliente e da central', 'Mudanças no atendimento em andamento']
    : ['Mecânico a caminho e chegada no local', 'Orçamento para aprovar e mensagens', 'Lembrete de revisão do seu veículo']

  return (
    <Folha
      aberta={aberto}
      aoFechar={depois}
      fecharFora={false}
      rodape={
        <>
          <BotaoApp tamanho="lg" largo icone={BellRing} carregando={ativando} onClick={() => void ativar().then(() => setAberto(false))}>
            Ativar notificações
          </BotaoApp>
          <BotaoApp variante="fantasma" largo onClick={depois}>
            Agora não
          </BotaoApp>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 pt-1 pb-2 text-center">
        <span className="relative">
          <img src="/icone-192.png" alt="" className="size-20 rounded-[1.4rem] shadow-e2" />
          <span className="absolute -top-1.5 -right-1.5 flex size-7 items-center justify-center rounded-full bg-[#ff6600] text-white ring-4 ring-surface">
            <BellRing className="size-4" />
          </span>
        </span>
        <div>
          <h2 className="font-display text-[21px] leading-tight font-bold text-ink">Não perca nenhum aviso</h2>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">
            Ative as notificações e o SOS Tecnoar avisa você na hora, mesmo com o app fechado.
          </p>
        </div>
        <ul className="flex w-full flex-col gap-2 text-left">
          {itens.map((t) => (
            <li key={t} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3.5 py-3 text-[14px] font-medium text-ink">
              <CheckCircle2 className="size-5 shrink-0 text-ok" /> {t}
            </li>
          ))}
        </ul>
      </div>
    </Folha>
  )
}

/* ── cartão do perfil ───────────────────────────────────────────────────── */

function Linha({
  icone: Icone,
  tom,
  titulo,
  detalhe,
  acao,
  onClick,
}: {
  icone: LucideIcon
  tom: 'ok' | 'marca' | 'atencao' | 'neutro'
  titulo: string
  detalhe: string
  acao?: ReactNode
  onClick?: () => void
}) {
  const conteudo = (
    <>
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl',
          tom === 'ok' && 'bg-ok-soft text-ok-ink',
          tom === 'marca' && 'bg-accent-soft text-accent-ink',
          tom === 'atencao' && 'bg-warn-soft text-warn-ink',
          tom === 'neutro' && 'bg-surface-2 text-ink-2',
        )}
      >
        <Icone className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{titulo}</span>
        <span className={cn('block text-[13px] leading-snug', tom === 'ok' ? 'text-ok-ink' : tom === 'atencao' ? 'text-warn-ink' : 'text-ink-3')}>
          {detalhe}
        </span>
      </span>
      {acao}
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className="flex min-h-16 w-full items-center gap-3 py-3 text-left">
      {conteudo}
    </button>
  ) : (
    <div className="flex min-h-16 w-full items-center gap-3 py-3">{conteudo}</div>
  )
}

function Pilula({ children }: { children: ReactNode }) {
  return <span className="shrink-0 rounded-full bg-accent px-3.5 py-2 font-display text-[13px] font-bold text-white">{children}</span>
}

/** Instalar, ativar e testar as notificações — tudo num lugar só. */
export function CartaoAparelho({ className }: { className?: string }) {
  const instalado = useInstalado()
  const instalacao = useInstalacao()
  const [permissao, setPermissao] = usePermissaoNotificacao()
  const { ativar, ativando } = useAtivarNotificacoes(() => setPermissao(permissaoAtual()))
  const toast = useToast()

  async function testar() {
    const ok = await notificacaoDeTeste()
    if (ok) toast.ok('Notificação enviada', 'Confira na barra de notificações do celular.')
    else toast.atencao('Não foi possível testar', 'Abra pelo app instalado e tente de novo.')
  }

  return (
    <div className={cn('flex flex-col divide-y divide-line rounded-[1.25rem] border border-line bg-surface px-4', className)}>
      {instalado ? (
        <Linha icone={Smartphone} tom="ok" titulo="App instalado" detalhe="Abre pela tela de início, em tela cheia." />
      ) : instalacao.disponivel ? (
        <Linha
          icone={Download}
          tom="marca"
          titulo="Instalar o app"
          detalhe="Ícone na tela de início e avisos como app."
          onClick={instalacao.instalar}
          acao={<Pilula>Instalar</Pilula>}
        />
      ) : (
        <Linha icone={Smartphone} tom="neutro" titulo="Instalar o app" detalhe="No menu do navegador, toque em Instalar app ou Adicionar à tela inicial." />
      )}

      {permissao === 'granted' ? (
        <>
          <Linha icone={BellRing} tom="ok" titulo="Notificações" detalhe="Ativadas neste aparelho" />
          <Linha
            icone={Send}
            tom="neutro"
            titulo="Enviar notificação de teste"
            detalhe="Confere se o aviso aparece e toca."
            onClick={() => void testar()}
            acao={<ChevronRight className="size-5 text-ink-3" />}
          />
        </>
      ) : permissao === 'denied' ? (
        <Linha icone={BellOff} tom="atencao" titulo="Notificações bloqueadas" detalhe="Libere em Configurações do celular › Notificações › SOS Tecnoar." />
      ) : permissao === 'indisponivel' || (ehIOS() && !instalado) ? (
        <Linha
          icone={BellOff}
          tom="neutro"
          titulo="Notificações"
          detalhe={ehIOS() ? 'No iPhone, instale o app para receber avisos.' : 'Este navegador não recebe notificações.'}
        />
      ) : (
        <Linha
          icone={BellRing}
          tom="atencao"
          titulo="Notificações desativadas"
          detalhe="Toque para receber os avisos com o app fechado."
          onClick={() => void ativar()}
          acao={<Pilula>{ativando ? 'Ativando…' : 'Ativar'}</Pilula>}
        />
      )}
    </div>
  )
}
