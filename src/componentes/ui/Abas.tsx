import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface Aba<T extends string> {
  valor: T
  rotulo: string
  contador?: number
  icone?: ReactNode
}

export function Abas<T extends string>({
  abas,
  ativa,
  aoMudar,
  className,
}: {
  abas: Array<Aba<T>>
  ativa: T
  aoMudar: (v: T) => void
  className?: string
}) {
  /**
   * Quando as abas não cabem, a borda ganha um esmaecido.
   *
   * Sem essa pista o operador no celular não descobre que há mais abas à
   * direita — o corte reto parece o fim da lista. O esmaecido só aparece do
   * lado em que realmente há conteúdo escondido.
   */
  const trilho = useRef<HTMLDivElement>(null)
  const [borda, setBorda] = useState<'nenhuma' | 'fim' | 'inicio' | 'ambas'>('nenhuma')

  useEffect(() => {
    const el = trilho.current
    if (!el) return
    const medir = () => {
      const sobraEsquerda = el.scrollLeft > 4
      const sobraDireita = el.scrollLeft + el.clientWidth < el.scrollWidth - 4
      setBorda(
        sobraEsquerda && sobraDireita ? 'ambas' : sobraDireita ? 'fim' : sobraEsquerda ? 'inicio' : 'nenhuma',
      )
    }
    medir()
    el.addEventListener('scroll', medir, { passive: true })
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => {
      el.removeEventListener('scroll', medir)
      observador.disconnect()
    }
  }, [abas.length])

  const mascara = {
    nenhuma: undefined,
    fim: 'linear-gradient(to right, #000 85%, transparent)',
    inicio: 'linear-gradient(to left, #000 85%, transparent)',
    ambas: 'linear-gradient(to right, transparent, #000 8%, #000 92%, transparent)',
  }[borda]

  return (
    <div
      ref={trilho}
      role="tablist"
      style={mascara ? { maskImage: mascara, WebkitMaskImage: mascara } : undefined}
      className={cn(
        'flex gap-1 overflow-x-auto rounded-lg border border-line bg-surface p-1 shadow-e1',
        '[-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {abas.map((a) => {
        const sel = a.valor === ativa
        return (
          <button
            key={a.valor}
            role="tab"
            type="button"
            aria-selected={sel}
            onClick={() => aoMudar(a.valor)}
            className={cn(
              'relative flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3',
              'font-display text-[12px] font-semibold transition-colors duration-150 [&_svg]:size-4',
              sel ? 'bg-surface-2 text-ink shadow-e1' : 'text-ink-3 hover:bg-surface-2/70 hover:text-ink-2',
            )}
          >
            {a.icone}
            {a.rotulo}
            {typeof a.contador === 'number' && (
              <span
                className={cn(
                  'num rounded-full px-1.5 py-0.5 text-[10.5px]',
                  sel ? 'bg-cyan-soft text-cyan-ink' : 'bg-inset text-ink-3',
                )}
              >
                {a.contador}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
