import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type TomSelo = 'neutro' | 'ok' | 'atencao' | 'critico' | 'info' | 'destaque'

/* O anel de 1px separa o selo do fundo sem precisar escurecer a pastilha. */
const TONS: Record<TomSelo, { fundo: string; texto: string; ponto: string; anel: string }> = {
  neutro: { fundo: 'bg-ink-3/10', texto: 'text-ink-2', ponto: 'bg-ink-3', anel: 'ring-ink-3/20' },
  ok: { fundo: 'bg-ok-soft', texto: 'text-ok-ink', ponto: 'bg-ok', anel: 'ring-ok/25' },
  atencao: { fundo: 'bg-warn-soft', texto: 'text-warn-ink', ponto: 'bg-warn', anel: 'ring-warn/30' },
  critico: { fundo: 'bg-crit-soft', texto: 'text-crit-ink', ponto: 'bg-crit', anel: 'ring-crit/28' },
  info: { fundo: 'bg-cyan-soft', texto: 'text-cyan-ink', ponto: 'bg-cyan', anel: 'ring-cyan/28' },
  destaque: { fundo: 'bg-accent-soft', texto: 'text-accent-ink', ponto: 'bg-accent', anel: 'ring-accent/30' },
}

export function Selo({
  children,
  tom = 'neutro',
  ponto = false,
  className,
}: {
  children: ReactNode
  tom?: TomSelo
  ponto?: boolean
  className?: string
}) {
  const t = TONS[tom]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium whitespace-nowrap',
        'ring-1 ring-inset',
        t.fundo,
        t.texto,
        t.anel,
        className,
      )}
    >
      {ponto && <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', t.ponto)} />}
      {children}
    </span>
  )
}

export function Etiqueta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2',
        className,
      )}
    >
      {children}
    </span>
  )
}
