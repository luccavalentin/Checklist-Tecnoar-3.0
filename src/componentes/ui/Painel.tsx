import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Painel({
  children,
  className,
  semPadding,
}: {
  children: ReactNode
  className?: string
  semPadding?: boolean
}) {
  return (
    <section
      className={cn(
        'aresta rounded-lg border border-line bg-surface shadow-e1',
        !semPadding && 'p-5',
        className,
      )}
    >
      {children}
    </section>
  )
}

export function CabecalhoPainel({
  titulo,
  descricao,
  acao,
  className,
}: {
  titulo: string
  descricao?: string
  acao?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-3.5', className)}>
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="font-display text-sm font-semibold text-ink">{titulo}</h2>
        {descricao && <p className="text-[12.5px] text-ink-3">{descricao}</p>}
      </div>
      {/* pode encolher e quebrar: em telas estreitas os botões descem de linha */}
      {acao && <div className="min-w-0">{acao}</div>}
    </div>
  )
}

export function CabecalhoPagina({
  sobretitulo,
  titulo,
  meta,
  acoes,
  className,
}: {
  sobretitulo?: string
  titulo: string
  meta?: ReactNode
  acoes?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="flex min-w-0 flex-col gap-1.5">
        {sobretitulo && (
          <span className="flex items-center gap-2">
            {/* Traço curto no tom da marca: identifica a seção sem virar enfeite. */}
            <span aria-hidden className="h-[3px] w-3.5 rounded-full bg-accent" />
            <span className="lbl">{sobretitulo}</span>
          </span>
        )}
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-2xl leading-[1.15] font-semibold tracking-[-0.02em] text-ink sm:text-[27px]">
            {titulo}
          </h1>
          {meta}
        </div>
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  )
}
