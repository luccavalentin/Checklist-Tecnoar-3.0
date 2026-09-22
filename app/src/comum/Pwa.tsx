import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { WifiOff } from 'lucide-react'
import { registerSW } from 'virtual:pwa-register'
import { ConviteInstalacao, configurarInstalacao } from '@/layout/ConviteInstalacao'
import { ehAppNativo } from '@/sos/geoNativo'
import { useSessao } from '../sessao'
import { ConviteNotificacoesApp } from './Aparelho'

/**
 * Comportamento de aplicativo instalado do SOS Tecnoar: convite de
 * instalação, atualização sem atrapalhar um socorro e aviso de falta de rede.
 */

// O convite é o mesmo do Checklist, com a cara do SOS. Configurado no
// carregamento do módulo: o `beforeinstallprompt` chega logo no início.
configurarInstalacao({
  nome: 'SOS Tecnoar',
  icone: '/apple-touch-icon.png',
  chaveAdiado: 'sos.instalacao.adiada',
  endereco: () => `${window.location.origin}/`,
  // No computador o SOS também instala (central, mecânico no notebook):
  // o "Instalar o app" do perfil usa o convite nativo do navegador.
  guardarNoDesktop: true,
})

/** Telas de emergência: nada de convite, nada de recarregar a página. */
function telaCritica(caminho: string): boolean {
  return /^\/app\/(sos|chamado\/)/.test(caminho) || /^\/(sos|chamado\/)/.test(caminho)
}

/* ── atualização ────────────────────────────────────────────────────────── */

let aplicar: ((recarregar?: boolean) => Promise<void>) | null = null
let versaoNovaPronta = false

function tentarAtualizar() {
  if (!versaoNovaPronta || !aplicar) return
  // Recarregar no meio do pedido de socorro perderia o que a pessoa já
  // preencheu; no acompanhamento, piscaria o mapa de quem espera o mecânico.
  if (telaCritica(window.location.pathname) && document.visibilityState === 'visible') return
  versaoNovaPronta = false
  void aplicar(true)
}

/** Registra o service worker do app. Chamado uma vez, no main. */
export function registrarServiceWorker() {
  // No app da loja os arquivos vêm dentro do app e a versão nova chega pela loja.
  if (!import.meta.env.PROD || !('serviceWorker' in navigator) || ehAppNativo()) return
  aplicar = registerSW({
    immediate: true,
    onNeedRefresh() {
      versaoNovaPronta = true
      tentarAtualizar()
    },
    onRegisteredSW(_url, registro) {
      // Quem deixa o app aberto o dia inteiro (mecânico) também recebe a versão nova.
      if (registro) window.setInterval(() => void registro.update().catch(() => {}), 60 * 60_000)
    },
  })
  // App foi para o fundo: momento seguro para trocar de versão.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') tentarAtualizar()
  })
}

/** Tenta aplicar a atualização pendente a cada troca de tela. */
export function AtualizadorApp() {
  const { pathname } = useLocation()
  useEffect(() => {
    tentarAtualizar()
  }, [pathname])
  return null
}

/* ── convite de instalação ──────────────────────────────────────────────── */

export function ConviteApp() {
  const { pathname } = useLocation()
  const { papel } = useSessao()
  const logado = !!papel && papel.papel !== 'anonimo'

  // Com a barra de navegação inferior do app, o convite sobe acima dela.
  useEffect(() => {
    const comBarra = logado && !telaCritica(pathname) && !/^\/(acompanhar|tecno-ia)/.test(pathname)
    document.documentElement.style.setProperty('--barra-acoes', comBarra ? 'calc(4.25rem + env(safe-area-inset-bottom))' : '0px')
  }, [logado, pathname])

  // Telas cheias sem a barra inferior: o convite cobriria o campo de
  // mensagem da TECNO IA; na despedida, a conta acabou de ser apagada.
  const semConvite = telaCritica(pathname) || pathname.startsWith('/acompanhar') || /^\/(tecno-ia|conta-excluida)(\/|$)/.test(pathname)
  // Instalado pela loja: não há o que instalar, e o aviso do navegador não existe lá.
  if (ehAppNativo()) return null
  return (
    <>
      {!semConvite && <ConviteInstalacao />}
      {/* Instalado e logado: a vez de pedir as notificações (nunca no meio de um SOS). */}
      <ConviteNotificacoesApp bloqueado={semConvite} />
    </>
  )
}

/* ── rede ───────────────────────────────────────────────────────────────── */

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/**
 * Faixa fixa no topo quando o aparelho perde a rede. Honesta: diz o que não
 * funciona e o que fazer — na estrada, sem sinal, ligar ainda funciona.
 */
export function StatusRede() {
  const online = useOnline()
  // Cabeçalhos fixos descem a altura da faixa (var --faixa-rede) para não
  // ficarem por baixo dela.
  useEffect(() => {
    document.documentElement.style.setProperty('--faixa-rede', online ? '0px' : '2.1rem')
  }, [online])
  if (online) return null
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[95] flex min-h-[calc(2.1rem+env(safe-area-inset-top))] items-center justify-center gap-2 bg-[#0D1C33] px-4 pt-[env(safe-area-inset-top)] text-center text-[12.5px] font-semibold text-white"
    >
      <WifiOff className="size-4 shrink-0 text-[#ffb27a]" />
      Sem internet agora. Em emergência, ligue para a Tecnoar.
    </div>
  )
}
