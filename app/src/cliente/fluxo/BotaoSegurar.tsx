import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Loader2, Siren } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Botão de confirmar o SOS que precisa ser SEGURADO por um instante.
 *
 * É a proteção contra pedido acidental (celular no bolso, toque sem querer):
 * o preenchimento cresce enquanto o dedo segura e o pedido só sai quando
 * completa. Soltou antes, nada acontece. Teclado e leitores de tela ativam
 * direto (o "clique" deles já é intencional).
 */
export function BotaoSegurar({
  rotulo,
  rotuloCarregando = 'Enviando…',
  carregando,
  disabled,
  aoConfirmar,
  ms = 1000,
}: {
  rotulo: string
  rotuloCarregando?: string
  carregando?: boolean
  disabled?: boolean
  aoConfirmar: () => void
  ms?: number
}) {
  const [segurando, setSegurando] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const bloqueado = disabled || carregando

  function iniciar() {
    if (bloqueado) return
    window.clearTimeout(timer.current)
    setSegurando(true)
    navigator.vibrate?.(12)
    timer.current = window.setTimeout(() => {
      setSegurando(false)
      navigator.vibrate?.([30, 40, 60])
      aoConfirmar()
    }, ms)
  }

  function soltar() {
    window.clearTimeout(timer.current)
    setSegurando(false)
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        disabled={bloqueado}
        aria-busy={carregando || undefined}
        aria-label={`${rotulo}. Segure por um segundo para confirmar.`}
        data-segurando={segurando}
        style={{ '--cli-segurar-ms': `${ms}ms` } as CSSProperties}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            /* toque muito rápido: segue sem captura */
          }
          iniciar()
        }}
        onPointerUp={soltar}
        onPointerCancel={soltar}
        onLostPointerCapture={soltar}
        onContextMenu={(e) => e.preventDefault()}
        // Clique sem ponteiro (Enter/Espaço, leitor de tela) confirma direto.
        onClick={(e) => {
          if (e.detail === 0 && !bloqueado) aoConfirmar()
        }}
        className={cn(
          'cli-segurar relative flex min-h-[4.25rem] w-full items-center justify-center overflow-hidden rounded-[1.15rem] bg-[#ff6600] px-5 font-display text-[18px] font-bold text-white transition-transform disabled:opacity-60',
          segurando && 'scale-[0.985]',
          'shadow-[0_1px_2px_rgb(11_28_51/0.12),0_12px_26px_-14px_rgb(255_102_0/0.8)]',
        )}
      >
        <span aria-hidden className="cli-segurar-barra absolute inset-0 bg-[#9e2219]" />
        <span className="relative flex items-center gap-2.5">
          {carregando ? <Loader2 className="size-5 animate-spin" /> : <Siren className="size-5" />}
          {carregando ? rotuloCarregando : segurando ? 'Continue segurando…' : rotulo}
        </span>
      </button>
      {!carregando && <p className="text-center text-[12px] text-ink-3">Segure por 1 segundo — evita pedido por engano.</p>}
    </div>
  )
}
