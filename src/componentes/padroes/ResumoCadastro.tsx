import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ItemResumoCadastro {
  rotulo: string
  valor: ReactNode
  detalhe?: ReactNode
  icone?: ReactNode
  tom?: 'neutro' | 'cyan' | 'accent' | 'ok' | 'warn'
}

const TONS: Record<NonNullable<ItemResumoCadastro['tom']>, string> = {
  neutro: 'border-line bg-surface-2 text-ink-3',
  cyan: 'border-cyan/25 bg-cyan-soft text-cyan-ink',
  accent: 'border-accent/25 bg-accent-soft text-accent-ink',
  ok: 'border-ok/25 bg-ok-soft text-ok-ink',
  warn: 'border-warn/25 bg-warn-soft text-warn-ink',
}

export function ResumoCadastro({
  titulo,
  descricao,
  itens,
}: {
  titulo: string
  descricao: ReactNode
  itens: ItemResumoCadastro[]
}) {
  return (
    <section className="aresta overflow-hidden rounded-lg border border-line bg-surface shadow-e1">
      <div className="grid gap-0 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.6fr)]">
        <div className="border-b border-line px-4 py-3.5 lg:border-r lg:border-b-0">
          <h2 className="font-display text-[15px] font-semibold text-ink">{titulo}</h2>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-ink-3">{descricao}</p>
        </div>

        <div className="grid divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {itens.map((item) => (
            <div key={item.rotulo} className="flex min-h-[74px] items-center gap-3 px-4 py-3">
              {item.icone && (
                <span
                  aria-hidden
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-md border [&_svg]:size-4',
                    TONS[item.tom ?? 'neutro'],
                  )}
                >
                  {item.icone}
                </span>
              )}
              <div className="min-w-0">
                <span className="lbl block">{item.rotulo}</span>
                <span className="mt-1 block truncate text-[15px] font-semibold text-ink">{item.valor}</span>
                {item.detalhe && <span className="mt-0.5 block truncate text-[11.5px] text-ink-3">{item.detalhe}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
