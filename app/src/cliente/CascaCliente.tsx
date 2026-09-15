import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { ChevronRight, History, House, Siren, Truck, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { tocarAlerta, vibrarAlerta } from '@/sos/alerta'
import { STATUS_SOS, linkWhatsApp } from '@/sos/rotulos'
import { useTempoRealCliente } from '@/sos/tempoReal'
import type { ChamadoSOS, StatusSOS } from '@/sos/tipos'
import { aplicarTema, lerTema, useCliente } from '../sessao'
import { BarraNavegacao } from '../comum/ui'
import { useNaoLidasApp } from '../comum/Notificacoes'
import { useHomeCliente, useInfoPublica, type CtxCascaCliente } from './dados'
import { useEnvioPendenteSOS } from './filaSOS'

/**
 * Moldura das telas do cliente: conteúdo + barra inferior com o SOS no meio.
 *
 * Aqui mora a escuta de tempo real dos chamados do cliente. As telas de tela
 * cheia (pedir SOS e acompanhar) ficam fora desta casca — então, se um aviso
 * de mudança de status chega aqui, a pessoa está em outra tela e precisa ser
 * avisada com um toque para ir até o chamado.
 *
 * Também é daqui que sai, sozinho, o pedido de socorro guardado sem sinal
 * (modo conexão ruim) assim que a internet volta.
 */
export function CascaCliente() {
  const { conta, usuarioId } = useCliente()
  const navegar = useNavigate()
  const home = useHomeCliente()
  const naoLidas = useNaoLidasApp(usuarioId)
  const ativo = home.data?.chamado_ativo ?? null
  const [aviso, setAviso] = useState<Pick<ChamadoSOS, 'id' | 'protocolo' | 'status'> | null>(null)

  useEnvioPendenteSOS(usuarioId, (c) => navegar(`/chamado/${c.id}`))

  // O Realtime só manda a linha antiga completa com REPLICA IDENTITY FULL.
  // Guardamos o último status visto de cada chamado para saber se mudou.
  const conhecidos = useRef(new Map<string, StatusSOS>())
  useEffect(() => {
    if (ativo) conhecidos.current.set(ativo.id, ativo.status)
  }, [ativo])

  useTempoRealCliente(conta.cliente_id, (c, anterior) => {
    const antes = anterior?.status ?? conhecidos.current.get(c.id)
    conhecidos.current.set(c.id, c.status)
    if (!antes || antes === c.status) return
    setAviso({ id: c.id, protocolo: c.protocolo, status: c.status })
    tocarAlerta({ tipo: 'aviso' })
    vibrarAlerta('aviso')
  })

  useEffect(() => {
    if (!aviso) return
    const t = window.setTimeout(() => setAviso(null), 10_000)
    return () => window.clearTimeout(t)
  }, [aviso])

  // Tema "sistema": acompanha o celular trocando de claro para escuro à noite.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const aoMudar = () => {
      if (lerTema() === 'sistema') aplicarTema('sistema')
    }
    mq.addEventListener?.('change', aoMudar)
    return () => mq.removeEventListener?.('change', aoMudar)
  }, [])

  // Troca de tela começa do topo (como num app nativo). Voltar pelo histórico
  // (POP) mantém onde a pessoa estava na lista.
  const { pathname } = useLocation()
  const tipoNavegacao = useNavigationType()
  useEffect(() => {
    if (tipoNavegacao !== 'POP') window.scrollTo({ top: 0 })
  }, [pathname, tipoNavegacao])

  const contexto: CtxCascaCliente = { naoLidas }

  return (
    <div className="cli-palco">
      <div className="cli-coluna">
        <Outlet context={contexto} />
      </div>
      {aviso && <AvisoChamado aviso={aviso} aoFechar={() => setAviso(null)} />}
      <BotaoWhatsApp />
      <BarraNavegacao
        className="cli-fixo"
        itens={[
          { rota: '/', rotulo: 'Início', icone: House },
          { rota: '/veiculos', rotulo: 'Veículos', icone: Truck },
          { rota: '/historico', rotulo: 'Histórico', icone: History },
          { rota: '/perfil', rotulo: 'Conta', icone: UserRound, contador: naoLidas },
        ]}
        centro={<BotaoCentralSOS chamadoAtivoId={ativo?.id ?? null} />}
      />
    </div>
  )
}

/**
 * O botão do meio da barra. Sem chamado: pede socorro. Com chamado: leva ao
 * acompanhamento — ninguém deve cair num segundo pedido por engano.
 */
function BotaoCentralSOS({ chamadoAtivoId }: { chamadoAtivoId: string | null }) {
  const navegar = useNavigate()
  const ativo = !!chamadoAtivoId
  return (
    <button
      type="button"
      onClick={() => navegar(ativo ? `/chamado/${chamadoAtivoId}` : '/sos')}
      aria-label={ativo ? 'Acompanhar o socorro em andamento' : 'Pedir socorro (SOS)'}
      className="flex h-full w-full flex-col items-center justify-center gap-1 active:scale-95"
    >
      <span className={cn('relative -mt-5 flex size-[3.6rem] items-center justify-center rounded-full bg-[#ff6600] text-white ring-4 ring-surface', 'shadow-[0_10px_22px_-10px_rgb(255_102_0/0.8)]')}>
        <Siren className="size-7" strokeWidth={2.2} />
        {ativo && <span aria-hidden className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-white ring-[3px] ring-[#ff6600] sos-piscar" />}
      </span>
      <span className="text-[11px] font-bold text-crit">{ativo ? 'Ao vivo' : 'SOS'}</span>
    </button>
  )
}

/**
 * WhatsApp da Tecnoar sempre à mão, flutuando acima da barra. O número vem da
 * central (Configurações do SOS); sem número cadastrado, o botão não aparece.
 */
function BotaoWhatsApp() {
  const info = useInfoPublica()
  const link = linkWhatsApp(info.data?.whatsapp ?? info.data?.telefone, 'Olá, Tecnoar! Vim pelo app SOS.')
  if (!link) return null
  return (
    <div className="cli-fixo pointer-events-none fixed z-[45] flex justify-end px-4" style={{ bottom: 'calc(4.25rem + env(safe-area-inset-bottom) + 0.85rem)' }}>
      <a
        href={link}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar com a Tecnoar no WhatsApp"
        className="pointer-events-auto flex size-14 items-center justify-center rounded-full border border-[#00afef]/45 bg-[#0D1C33] text-[#00afef] shadow-[0_10px_24px_-10px_rgb(0_32_97/0.9)] ring-4 ring-surface transition-transform active:scale-95"
      >
        <svg viewBox="0 0 32 32" aria-hidden className="size-8" fill="currentColor">
          <path d="M16.04 3C8.86 3 3.03 8.83 3.03 16c0 2.29.6 4.53 1.74 6.5L3 29l6.68-1.75A12.95 12.95 0 0 0 16.04 29C23.2 29 29 23.17 29 16S23.2 3 16.04 3Zm0 23.63c-1.95 0-3.87-.52-5.54-1.52l-.4-.24-3.96 1.04 1.06-3.86-.26-.4A10.6 10.6 0 0 1 5.4 16c0-5.87 4.77-10.63 10.64-10.63 5.86 0 10.6 4.76 10.6 10.63 0 5.86-4.74 10.63-10.6 10.63Zm5.83-7.96c-.32-.16-1.89-.93-2.18-1.04-.29-.1-.5-.16-.72.16-.21.32-.82 1.04-1 1.25-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.59-.95-.85-1.59-1.9-1.78-2.22-.18-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.18.21-.32.32-.53.1-.21.05-.4-.03-.56-.08-.16-.72-1.73-.98-2.37-.26-.62-.52-.54-.72-.55h-.61c-.21 0-.56.08-.85.4-.29.32-1.11 1.09-1.11 2.66s1.14 3.08 1.3 3.3c.16.2 2.24 3.43 5.43 4.8.76.33 1.35.53 1.81.67.76.24 1.45.21 2 .13.61-.09 1.89-.77 2.15-1.52.27-.74.27-1.38.19-1.52-.08-.13-.29-.21-.61-.37Z" />
        </svg>
      </a>
    </div>
  )
}

const COR_AVISO: Partial<Record<StatusSOS, string>> = {
  a_caminho: 'bg-accent',
  aceito: 'bg-accent',
  no_local: 'bg-cyan',
  servico_iniciado: 'bg-cyan',
  servico_finalizado: 'bg-ok',
  concluido: 'bg-ok',
  cancelado: 'bg-ink-3',
}

/** Aviso flutuante no topo: o que mudou e um toque para ver. */
function AvisoChamado({ aviso, aoFechar }: { aviso: Pick<ChamadoSOS, 'id' | 'protocolo' | 'status'>; aoFechar: () => void }) {
  const navegar = useNavigate()
  const s = STATUS_SOS[aviso.status]
  return (
    <div className="cli-fixo pointer-events-none fixed top-0 z-[70] flex justify-center px-3 pt-[calc(0.5rem+env(safe-area-inset-top)+var(--faixa-rede,0px))]">
      <div role="status" aria-live="polite" className="entrada-suave pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-line bg-surface p-2 pl-3.5 text-ink shadow-e3">
        <span className={cn('size-2.5 shrink-0 rounded-full', COR_AVISO[aviso.status] ?? 'bg-[#ff6600]')} />
        <button
          type="button"
          onClick={() => {
            aoFechar()
            navegar(`/chamado/${aviso.id}`)
          }}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] font-semibold">{s.cliente}</span>
            <span className="num block text-[11.5px] text-ink-3">{aviso.protocolo} · toque para ver</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-ink-3" />
        </button>
        <button type="button" aria-label="Fechar aviso" onClick={aoFechar} className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2">
          <X className="size-4" />
        </button>
      </div>
    </div>
  )
}
