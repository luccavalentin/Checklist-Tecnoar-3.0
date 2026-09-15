import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type PointerEvent as EventoPonteiro, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Eraser, PenLine, Undo2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BotaoApp, Faixa } from '../../comum/ui'

/**
 * Assinatura com o dedo (ou caneta) — é ela que aprova o orçamento.
 *
 * O traço é guardado como pontos, não como pixels: dá para desfazer o último
 * risco, redesenhar quando a tela gira e exportar um PNG nítido do tamanho da
 * assinatura (recortado, sem o quadro vazio em volta). O "papel" é sempre
 * branco com tinta escura, no claro e no escuro: é assim que ela aparece no
 * laudo em PDF e na galeria do chamado.
 */

interface PontoTraco {
  x: number
  y: number
  /** Espessura no ponto (px da referência). */
  w: number
  t: number
}
type Traco = PontoTraco[]

export type FundoAssinatura = 'branco' | 'transparente'

export interface PadAssinaturaApi {
  limpar: () => void
  desfazer: () => void
  exportar: (fundo?: FundoAssinatura) => Promise<Blob | null>
}

const TINTA = '#0b1c33'
const ESPESSURA_MIN = 1.3
const ESPESSURA_MAX = 3.6
/** Tinta mínima (px) para valer como assinatura — um toque solto não assina nada. */
const TINTA_MINIMA = 44

export const PadAssinatura = forwardRef<
  PadAssinaturaApi,
  { aoMudar?: (estado: { tracos: number; valida: boolean }) => void; className?: string; rotulo?: string }
>(function PadAssinatura({ aoMudar, className, rotulo = 'Área de assinatura' }, ref) {
  const moldura = useRef<HTMLDivElement>(null)
  const tela = useRef<HTMLCanvasElement>(null)
  const tracos = useRef<Traco[]>([])
  // Tamanho da área quando o primeiro traço foi feito: os pontos ficam nessa
  // escala e são reencaixados se a tela mudar (girar o celular).
  const referencia = useRef<{ w: number; h: number } | null>(null)
  const tamanho = useRef({ w: 0, h: 0, dpr: 1 })
  const ativo = useRef<number | null>(null)
  const retangulo = useRef<DOMRect | null>(null)
  const [temTraco, setTemTraco] = useState(false)

  const aoMudarRef = useRef(aoMudar)
  aoMudarRef.current = aoMudar

  /** Referência → pixels da tela atual (encaixa sem distorcer). */
  const escala = useCallback(() => {
    const r = referencia.current
    const { w, h } = tamanho.current
    if (!r || !r.w || !r.h) return 1
    return Math.min(w / r.w, h / r.h)
  }, [])

  const avisar = useCallback(() => {
    const tinta = tracos.current.reduce((s, t) => s + comprimento(t), 0) * escala()
    const n = tracos.current.length
    setTemTraco(n > 0)
    aoMudarRef.current?.({ tracos: n, valida: tinta >= TINTA_MINIMA })
  }, [escala])

  const redesenhar = useCallback(() => {
    const c = tela.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const { dpr } = tamanho.current
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    const s = escala() * dpr
    ctx.setTransform(s, 0, 0, s, 0, 0)
    for (const t of tracos.current) desenharTraco(ctx, t, 1)
  }, [escala])

  // Área com a densidade real da tela (nítida no Retina) e redesenho ao girar.
  useEffect(() => {
    const m = moldura.current
    const c = tela.current
    if (!m || !c) return
    const medir = () => {
      const r = m.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 3)
      if (!r.width || !r.height) return
      tamanho.current = { w: r.width, h: r.height, dpr }
      c.width = Math.round(r.width * dpr)
      c.height = Math.round(r.height * dpr)
      c.style.width = `${r.width}px`
      c.style.height = `${r.height}px`
      if (!referencia.current) referencia.current = { w: r.width, h: r.height }
      redesenhar()
    }
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(m)
    return () => obs.disconnect()
  }, [redesenhar])

  function pontoDe(ev: PointerEvent, anterior: PontoTraco | undefined): PontoTraco {
    const r = retangulo.current ?? tela.current!.getBoundingClientRect()
    const s = escala()
    const x = (ev.clientX - r.left) / s
    const y = (ev.clientY - r.top) / s
    let w: number
    if (ev.pointerType === 'pen' && ev.pressure > 0) {
      w = ESPESSURA_MIN + (ESPESSURA_MAX - ESPESSURA_MIN) * Math.min(1, ev.pressure * 1.25)
    } else if (anterior) {
      // Dedo: rápido afina, devagar engrossa — o jeito de uma caneta de verdade.
      const dt = Math.max(1, ev.timeStamp - anterior.t)
      const v = Math.hypot(x - anterior.x, y - anterior.y) / dt
      const alvo = Math.max(ESPESSURA_MIN, Math.min(ESPESSURA_MAX, ESPESSURA_MAX / (1 + v * 0.9)))
      w = anterior.w * 0.65 + alvo * 0.35
    } else {
      w = (ESPESSURA_MIN + ESPESSURA_MAX) / 2
    }
    return { x, y, w, t: ev.timeStamp }
  }

  function contexto() {
    const ctx = tela.current?.getContext('2d')
    if (!ctx) return null
    const s = escala() * tamanho.current.dpr
    ctx.setTransform(s, 0, 0, s, 0, 0)
    return ctx
  }

  function aoDescer(e: EventoPonteiro<HTMLCanvasElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // Segundo dedo (palma encostando) não vira traço.
    if (ativo.current != null) return
    e.preventDefault()
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ponteiro já solto (toque muito rápido): segue sem captura */
    }
    ativo.current = e.pointerId
    retangulo.current = e.currentTarget.getBoundingClientRect()
    if (!tracos.current.length) referencia.current = { w: tamanho.current.w, h: tamanho.current.h }
    const p = pontoDe(e.nativeEvent, undefined)
    tracos.current.push([p])
    const ctx = contexto()
    if (ctx) desenharPonto(ctx, p, 1)
  }

  function aoMover(e: EventoPonteiro<HTMLCanvasElement>) {
    if (e.pointerId !== ativo.current) return
    e.preventDefault()
    const traco = tracos.current[tracos.current.length - 1]
    const ctx = contexto()
    if (!traco || !ctx) return
    // Eventos agrupados: o navegador junta vários pontos num quadro; sem eles
    // a curva sai em "gomos" quando o dedo é rápido.
    const lista = e.nativeEvent.getCoalescedEvents?.() ?? []
    for (const ev of lista.length ? lista : [e.nativeEvent]) {
      const anterior = traco[traco.length - 1]
      const p = pontoDe(ev, anterior)
      if (Math.hypot(p.x - anterior.x, p.y - anterior.y) < 0.6) continue
      traco.push(p)
      desenharFim(ctx, traco, 1)
    }
  }

  function aoSubir(e: EventoPonteiro<HTMLCanvasElement>) {
    if (e.pointerId !== ativo.current) return
    ativo.current = null
    const traco = tracos.current[tracos.current.length - 1]
    const ctx = contexto()
    if (traco && ctx && traco.length > 1) {
      const n = traco.length
      const a = meio(traco[n - 2], traco[n - 1])
      linha(ctx, a, traco[n - 1], traco[n - 1].w)
    }
    avisar()
  }

  useImperativeHandle(
    ref,
    () => ({
      limpar() {
        tracos.current = []
        referencia.current = { w: tamanho.current.w, h: tamanho.current.h }
        redesenhar()
        avisar()
      },
      desfazer() {
        tracos.current.pop()
        redesenhar()
        avisar()
      },
      async exportar(fundo = 'branco') {
        const lista = tracos.current
        if (!lista.length) return null
        let x0 = Infinity
        let y0 = Infinity
        let x1 = -Infinity
        let y1 = -Infinity
        for (const t of lista)
          for (const p of t) {
            x0 = Math.min(x0, p.x)
            y0 = Math.min(y0, p.y)
            x1 = Math.max(x1, p.x)
            y1 = Math.max(y1, p.y)
          }
        const folga = ESPESSURA_MAX * 4
        const larguraRef = x1 - x0 + folga * 2
        const alturaRef = y1 - y0 + folga * 2
        // ~2,5× a tela, limitado: nítido no PDF e leve para subir na estrada.
        const k = Math.min(2.5, 1400 / larguraRef, 700 / alturaRef)
        const c = document.createElement('canvas')
        c.width = Math.max(1, Math.round(larguraRef * k))
        c.height = Math.max(1, Math.round(alturaRef * k))
        const ctx = c.getContext('2d')
        if (!ctx) return null
        if (fundo === 'branco') {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, c.width, c.height)
        }
        ctx.setTransform(k, 0, 0, k, (folga - x0) * k, (folga - y0) * k)
        for (const t of lista) desenharTraco(ctx, t, 1)
        return new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/png'))
      },
    }),
    [avisar, redesenhar],
  )

  return (
    <div ref={moldura} className={cn('relative size-full overflow-hidden', className)}>
      {/* Linha de assinatura: guia visual, fica fora do PNG. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-6 bottom-[26%] flex items-end gap-2 border-b-2 border-dashed border-[#0b1c33]/25 pb-1">
        <span className="font-display text-[22px] leading-none font-bold text-[#0b1c33]/35">×</span>
        <span className={cn('text-[13px] font-semibold text-[#0b1c33]/40 transition-opacity', temTraco && 'opacity-0')}>Assine aqui com o dedo</span>
      </div>
      <canvas
        ref={tela}
        role="img"
        aria-label={rotulo}
        onPointerDown={aoDescer}
        onPointerMove={aoMover}
        onPointerUp={aoSubir}
        onPointerCancel={aoSubir}
        onContextMenu={(e) => e.preventDefault()}
        className="absolute inset-0 cursor-crosshair touch-none select-none"
      />
    </div>
  )
})

/* ── desenho ────────────────────────────────────────────────────────────── */

function meio(a: PontoTraco, b: PontoTraco): PontoTraco {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: (a.w + b.w) / 2, t: (a.t + b.t) / 2 }
}

function comprimento(t: Traco): number {
  let s = 0
  for (let i = 1; i < t.length; i++) s += Math.hypot(t[i].x - t[i - 1].x, t[i].y - t[i - 1].y)
  return s
}

function preparar(ctx: CanvasRenderingContext2D, largura: number) {
  ctx.strokeStyle = TINTA
  ctx.fillStyle = TINTA
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = largura
}

function desenharPonto(ctx: CanvasRenderingContext2D, p: PontoTraco, k: number) {
  preparar(ctx, p.w * k)
  ctx.beginPath()
  ctx.arc(p.x, p.y, (p.w * k) / 2, 0, Math.PI * 2)
  ctx.fill()
}

function linha(ctx: CanvasRenderingContext2D, a: PontoTraco, b: PontoTraco, w: number) {
  preparar(ctx, w)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
}

/**
 * Curva suave pelos pontos médios: cada trecho vai do meio do segmento
 * anterior ao meio do próximo, com o ponto real como controle. Sem cantos,
 * mesmo com poucos pontos.
 */
function desenharFim(ctx: CanvasRenderingContext2D, t: Traco, k: number, n = t.length) {
  if (n < 2) return
  if (n === 2) {
    linha(ctx, t[0], meio(t[0], t[1]), t[0].w * k)
    return
  }
  const a = meio(t[n - 3], t[n - 2])
  const b = meio(t[n - 2], t[n - 1])
  preparar(ctx, t[n - 2].w * k)
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.quadraticCurveTo(t[n - 2].x, t[n - 2].y, b.x, b.y)
  ctx.stroke()
}

function desenharTraco(ctx: CanvasRenderingContext2D, t: Traco, k: number) {
  if (t.length === 1) return desenharPonto(ctx, t[0], k)
  for (let i = 2; i <= t.length; i++) desenharFim(ctx, t, k, i)
  const n = t.length
  linha(ctx, meio(t[n - 2], t[n - 1]), t[n - 1], t[n - 1].w * k)
}

/* ── tela cheia ─────────────────────────────────────────────────────────── */

/**
 * Tela inteira para assinar: quanto mais largo o quadro, melhor sai a
 * assinatura — no celular deitado ela ocupa quase tudo. Confirmar só acende
 * depois de um traço de verdade.
 */
export function TelaAssinatura({
  aberta,
  titulo = 'Assine para aprovar',
  descricao,
  resumo,
  rotuloConfirmar = 'Confirmar assinatura',
  enviando,
  erro,
  aoAlterar,
  aoConfirmar,
  aoFechar,
}: {
  aberta: boolean
  titulo?: string
  descricao?: ReactNode
  /** Linha de contexto acima do quadro (valor, protocolo). */
  resumo?: ReactNode
  rotuloConfirmar?: string
  enviando?: boolean
  erro?: string | null
  /** O desenho mudou (traço novo, desfazer, limpar). */
  aoAlterar?: () => void
  aoConfirmar: (png: Blob) => void
  aoFechar: () => void
}) {
  const pad = useRef<PadAssinaturaApi>(null)
  const [estado, setEstado] = useState({ tracos: 0, valida: false })
  const [exportando, setExportando] = useState(false)

  useEffect(() => {
    if (!aberta) return
    setEstado({ tracos: 0, valida: false })
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !enviando && aoFechar()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberta])

  async function confirmar() {
    if (!estado.valida || enviando || exportando) return
    setExportando(true)
    try {
      const png = await pad.current?.exportar('branco')
      if (png) aoConfirmar(png)
    } finally {
      setExportando(false)
    }
  }

  if (!aberta) return null
  const ocupado = !!enviando || exportando
  return createPortal(
    <div className="fixed inset-0 z-[92] flex flex-col bg-canvas" role="dialog" aria-modal="true" aria-label={titulo}>
      <header className="flex items-start gap-3 px-4 pt-[calc(0.75rem+env(safe-area-inset-top)+var(--faixa-rede,0px))] pb-3 [@media(max-height:500px)]:pb-2">
        <button
          type="button"
          onClick={aoFechar}
          disabled={ocupado}
          aria-label="Fechar sem assinar"
          className="sos-chip flex size-11 shrink-0 items-center justify-center rounded-full text-ink active:scale-95 disabled:opacity-50"
        >
          <X className="size-5" />
        </button>
        <div className="min-w-0 flex-1 pt-0.5">
          <h2 className="font-display text-[19px] leading-tight font-bold text-ink">{titulo}</h2>
          {descricao && <p className="mt-0.5 text-[13px] leading-snug text-ink-2 [@media(max-height:500px)]:hidden">{descricao}</p>}
        </div>
        <PenLine className="mt-2.5 size-5 shrink-0 text-accent" aria-hidden />
      </header>

      {resumo && <div className="px-4 pb-3 [@media(max-height:500px)]:hidden">{resumo}</div>}

      <div className="flex min-h-0 flex-1 flex-col px-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        <div
          className={cn(
            'relative min-h-[11rem] flex-1 overflow-hidden rounded-[1.5rem] border-2 border-[#0b1c33]/12 bg-white shadow-[0_24px_60px_-36px_rgb(8_24_48/0.6),inset_0_2px_0_rgb(255_255_255)] transition-opacity',
            ocupado && 'pointer-events-none opacity-80',
          )}
        >
          <PadAssinatura
            ref={pad}
            aoMudar={(e) => {
              setEstado(e)
              aoAlterar?.()
            }}
          />
        </div>
      </div>

      <footer className="flex flex-col gap-2 px-4 pt-3 pb-[calc(0.9rem+env(safe-area-inset-bottom))]">
        {erro && <Faixa tom="critico">{erro}</Faixa>}
        <div className="grid grid-cols-2 gap-2 [@media(max-height:500px)]:grid-cols-[1fr_1fr_2fr]">
          <BotaoApp variante="neutro" icone={Undo2} disabled={!estado.tracos || ocupado} onClick={() => pad.current?.desfazer()}>
            Desfazer
          </BotaoApp>
          <BotaoApp variante="neutro" icone={Eraser} disabled={!estado.tracos || ocupado} onClick={() => pad.current?.limpar()}>
            Limpar
          </BotaoApp>
          <BotaoApp
            tamanho="lg"
            largo
            disabled={!estado.valida}
            carregando={ocupado}
            onClick={() => void confirmar()}
            className="col-span-2 [@media(max-height:500px)]:col-span-1 [@media(max-height:500px)]:min-h-12"
          >
            {enviando ? 'Enviando assinatura…' : rotuloConfirmar}
          </BotaoApp>
        </div>
        {!estado.valida && (
          <p className="text-center text-[12px] text-ink-3 [@media(max-height:500px)]:sr-only" aria-live="polite">
            {estado.tracos ? 'Continue: o traço ainda está curto demais para valer como assinatura.' : 'Use o dedo dentro do quadro branco. Dá para desfazer e limpar.'}
          </p>
        )}
      </footer>
    </div>,
    document.body,
  )
}
