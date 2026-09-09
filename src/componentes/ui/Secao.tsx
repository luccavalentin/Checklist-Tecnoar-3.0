import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Seção numerada de formulário longo — o padrão dos cadastros do sistema. */
export function Secao({
  numero,
  titulo,
  descricao,
  children,
  className,
}: {
  numero?: string
  titulo: string
  descricao?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-4 rounded-lg border border-line bg-surface p-4 sm:p-5', className)}>
      <div className="flex min-w-0 items-baseline gap-3">
        {numero && <span className="num text-[11px] text-cyan">{numero}</span>}
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-display text-[15px] font-semibold text-ink">{titulo}</h3>
          {descricao && <p className="text-[12.5px] text-ink-3">{descricao}</p>}
        </div>
        <div className="h-px flex-1 bg-line" />
      </div>
      {children}
    </section>
  )
}

/** Grade de 12 colunas usada dentro das seções. */
export function Grade({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid min-w-0 grid-cols-1 gap-3.5 sm:grid-cols-12 sm:gap-4', className)}>{children}</div>
}
