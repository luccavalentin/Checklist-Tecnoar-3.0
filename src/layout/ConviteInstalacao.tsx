import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'

/**
 * Convite para instalar o aplicativo.
 *
 * O navegador não instala nada sozinho: ele dispara `beforeinstallprompt` e
 * espera que a página decida o momento de convidar. Sem ninguém escutando esse
 * evento, o convite simplesmente nunca aparece — era o que acontecia aqui.
 *
 * Regras de convivência:
 * - Só no celular e no tablet. No desktop a instalação não muda quase nada e o
 *   aviso viraria ruído.
 * - Some para sempre depois de instalar, e por 30 dias se for dispensado.
 *   Insistir num convite recusado é a forma mais rápida de ensinar a equipe a
 *   ignorar avisos do sistema — inclusive os importantes.
 */

const CHAVE_ADIADO = 'tecnoar.instalacao.adiada'
const DIAS_DE_PAUSA = 30

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

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

export function ConviteInstalacao() {
  const [evento, setEvento] = useState<EventoInstalacao | null>(null)
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    // Já instalado: o app roda em janela própria, não há o que convidar.
    const instalado =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    if (instalado) return

    function aoPoderInstalar(e: Event) {
      // Sem isto o navegador mostra a própria barra, fora do nosso controle e
      // fora da identidade do sistema.
      e.preventDefault()
      if (adiadoRecentemente()) return
      if (window.innerWidth >= 1024) return
      setEvento(e as EventoInstalacao)
      setVisivel(true)
    }

    function aoInstalar() {
      setVisivel(false)
      setEvento(null)
    }

    window.addEventListener('beforeinstallprompt', aoPoderInstalar)
    window.addEventListener('appinstalled', aoInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', aoPoderInstalar)
      window.removeEventListener('appinstalled', aoInstalar)
    }
  }, [])

  if (!visivel || !evento) return null

  function dispensar() {
    try {
      localStorage.setItem(CHAVE_ADIADO, String(Date.now()))
    } catch {
      /* Sem armazenamento o convite volta na próxima visita. Aceitável. */
    }
    setVisivel(false)
  }

  async function instalar() {
    if (!evento) return
    await evento.prompt()
    await evento.userChoice
    /* O evento serve uma vez só: depois de usado, não pode ser reaproveitado. */
    setEvento(null)
    setVisivel(false)
  }

  return (
    <div
      role="dialog"
      aria-label="Instalar aplicativo"
      className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-xl border border-line-strong bg-surface p-3 shadow-e3 lg:hidden"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
        <Download aria-hidden className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink">Instalar o Tecnoar</p>
        <p className="text-[11.5px] leading-snug text-ink-3">
          Abre em tela cheia e a câmera das evidências funciona melhor.
        </p>
      </div>

      <Botao tamanho="sm" onClick={() => void instalar()}>
        Instalar
      </Botao>

      <button
        type="button"
        onClick={dispensar}
        aria-label="Agora não"
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  )
}
