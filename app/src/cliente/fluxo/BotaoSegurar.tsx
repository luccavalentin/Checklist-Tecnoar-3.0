import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Loader2, Siren } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Arte } from '../../comum/Arte'
import { ARTE_MOBILE } from '../../comum/kit3d'

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
    <div className="mx-auto flex w-full max-w-[30rem] flex-col items-center gap-2">
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
          'cli-segurar cli-confirmar-3d sos-button-3d sos-button-3d-primario relative flex min-h-[4.25rem] w-full items-center justify-center overflow-hidden rounded-[1.25rem] px-3 py-1.5 font-display text-[16px] font-bold text-white transition-transform disabled:opacity-60',
          segurando && 'scale-[0.985]',
        )}
      >
        <span aria-hidden className="absolute inset-x-4 bottom-1.5 h-1 overflow-hidden rounded-full bg-[#732500]/35">
          <span className="cli-segurar-barra block h-full w-full rounded-full bg-[#bdf4ff]" />
        </span>
        <span className="relative flex min-w-0 items-center justify-center gap-2.5 pb-1">
          {carregando ? <Loader2 className="size-8 shrink-0 animate-spin" /> : <Arte src={ARTE_MOBILE.sirene} alt="" classeImagem="size-10 shrink-0 object-contain" recuo={<Siren className="size-7 shrink-0" />} />}
          <span className="min-w-0 text-center leading-tight">{carregando ? rotuloCarregando : segurando ? 'Continue segurando…' : rotulo}</span>
        </span>
      </button>
      {!carregando && <p className="text-center text-[12px] text-ink-3">Segure por 1 segundo — evita pedido por engano.</p>}
    </div>
  )
}
