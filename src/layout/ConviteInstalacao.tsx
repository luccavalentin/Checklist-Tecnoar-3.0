import { useEffect, useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'

/**
 * Convite para instalar o aplicativo.
 *
 * O navegador não instala nada sozinho: ele dispara `beforeinstallprompt` e
 * espera que a página decida o momento de convidar. Sem ninguém escutando esse
 * evento, o convite simplesmente nunca aparece.
 *
 * O evento chega uma vez só, logo depois do carregamento — quando a tela ainda
 * é a de login. Quem escuta precisa existir antes disso, e continuar existindo
 * depois: entrar no sistema é navegação do React Router, não recarga, e o
 * navegador não repete o convite. Por isso a escuta começa aqui, no módulo,
 * assim que o `main.tsx` o importa, e o evento fica guardado até que exista
 * tela para mostrá-lo.
 *
 * Regras de convivência:
 * - Só no celular e no tablet. No desktop a instalação muda pouco, e o convite
 *   do próprio navegador (o ícone na barra de endereço) basta — por isso lá o
 *   evento nem é interceptado.
 * - Some para sempre depois de instalar, e por 30 dias se for dispensado.
 *   Insistir num convite recusado é a forma mais rápida de ensinar a equipe a
 *   ignorar avisos do sistema — inclusive os importantes.
 */

const CHAVE_ADIADO = 'tecnoar.instalacao.adiada'
const DIAS_DE_PAUSA = 30
const LARGURA_DESKTOP = 1024

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/* ── Estado do módulo ──────────────────────────────────────────────────────
   Vive fora do React porque o evento chega antes de qualquer tela montar. */

let eventoGuardado: EventoInstalacao | null = null
const ouvintes = new Set<() => void>()

function avisarOuvintes() {
  for (const ouvinte of ouvintes) ouvinte()
}

function ehDesktop(): boolean {
  return window.innerWidth >= LARGURA_DESKTOP
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // No desktop, deixa o navegador oferecer do jeito dele: interceptar sem
    // ter o que mostrar no lugar seria remover a única forma de instalar.
    if (ehDesktop()) return
    e.preventDefault()
    eventoGuardado = e as EventoInstalacao
    avisarOuvintes()
  })

  window.addEventListener('appinstalled', () => {
    eventoGuardado = null
    avisarOuvintes()
  })
}

/* ── Regras de exibição ────────────────────────────────────────────────── */

function adiadoRecentemente(): boolean {
  try {
    const quando = localStorage.getItem(CHAVE_ADIADO)
    if (!quando) return false
    const dias = (Date.now() - Number(quando)) / 86_400_000
    return dias < DIAS_DE_PAUSA
  } catch {
    /* Armazenamento bloqueado: melhor convidar do que travar. */
    return false
  }
}

function jaInstalado(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/**
 * iOS não tem `beforeinstallprompt`: nenhuma página consegue pedir instalação
 * lá. O caminho é manual, pelo menu de compartilhamento — então em vez de um
 * botão que não existiria, o convite vira instrução.
 */
function ehIOS(): boolean {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPad recente se apresenta como Mac; o toque é o que o denuncia.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

export function ConviteInstalacao() {
  const [evento, setEvento] = useState<EventoInstalacao | null>(eventoGuardado)
  const [instrucaoIOS, setInstrucaoIOS] = useState(false)
  const [dispensado, setDispensado] = useState(false)

  useEffect(() => {
    if (jaInstalado() || adiadoRecentemente()) return

    const ouvinte = () => setEvento(eventoGuardado)
    ouvintes.add(ouvinte)
    ouvinte()

    /* No iOS não há evento para esperar. O atraso evita que a primeira coisa
       vista no sistema seja um pedido de instalação. */
    let relogio: number | undefined
    if (ehIOS() && !ehDesktop()) {
      relogio = window.setTimeout(() => setInstrucaoIOS(true), 4000)
    }

    return () => {
      ouvintes.delete(ouvinte)
      if (relogio) window.clearTimeout(relogio)
    }
  }, [])

  const visivel = !dispensado && (evento !== null || instrucaoIOS)
  if (!visivel) return null

  function dispensar() {
    try {
      localStorage.setItem(CHAVE_ADIADO, String(Date.now()))
    } catch {
      /* Sem armazenamento o convite volta na próxima visita. Aceitável. */
    }
    setDispensado(true)
  }

  async function instalar() {
    if (!evento) return
    await evento.prompt()
    await evento.userChoice
    /* O evento serve uma vez só: depois de usado, não pode ser reaproveitado. */
    eventoGuardado = null
    setEvento(null)
    setDispensado(true)
  }

  return (
    <div
      role="dialog"
      aria-label="Instalar aplicativo"
      className="area-segura fixed inset-x-3 z-[60] flex items-center gap-3 rounded-xl border border-line-strong bg-surface p-3 shadow-e3 lg:hidden"
      /* Se a tela tem barra de ações fixa (a OS no celular), sobe acima dela. */
      style={{ bottom: 'calc(var(--barra-acoes, 0px) + 0.75rem)' }}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
        {evento ? <Download aria-hidden className="size-4" /> : <SquarePlus aria-hidden className="size-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink">Instalar o Tecnoar Checklist</p>
        {evento ? (
          <p className="text-[11.5px] leading-snug text-balance text-ink-3">
            Abre em tela cheia e a câmera das evidências funciona melhor.
          </p>
        ) : (
          <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11.5px] leading-snug text-ink-3">
            <span>Toque em</span>
            <Share aria-hidden className="size-3.5 shrink-0 text-ink-2" />
            <span className="font-medium text-ink-2">Compartilhar</span>
            <span>e depois em</span>
            <span className="font-medium text-ink-2">Adicionar à Tela de Início</span>.
          </p>
        )}
      </div>

      {evento && (
        <Botao tamanho="sm" onClick={() => void instalar()}>
          Instalar
        </Botao>
      )}

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
