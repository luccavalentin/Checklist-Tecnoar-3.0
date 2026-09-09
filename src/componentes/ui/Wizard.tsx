import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'

export interface Etapa {
  id: string
  titulo: string
  descricao?: string
}

interface WizardEtapasProps {
  etapas: Etapa[]
  etapaAtual: number
  onIrPara?: (index: number) => void
  permiteNavegar?: boolean
}

export function WizardEtapas({ etapas, etapaAtual, onIrPara, permiteNavegar = false }: WizardEtapasProps) {
  return (
    <div className="flex items-center justify-center">
      {etapas.map((etapa, index) => {
        const estaConcluida = index < etapaAtual
        const estaAtiva = index === etapaAtual
        const podeClicar = permiteNavegar && (estaConcluida || estaAtiva) && onIrPara

        return (
          <div key={etapa.id} className="contents">
            {/* Etapa */}
            <button
              type="button"
              disabled={!podeClicar}
              onClick={() => podeClicar && onIrPara?.(index)}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-lg px-4 py-2 transition-all',
                estaAtiva && 'bg-accent/10 ring-1 ring-accent/30',
                estaConcluida && podeClicar && 'cursor-pointer hover:bg-accent/5',
                !podeClicar && 'cursor-default',
              )}
            >
              {/* Indicador numerico */}
              <div
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-[12px] font-semibold',
                  estaConcluida && 'bg-ok text-white',
                  estaAtiva && 'bg-accent text-white',
                  !estaConcluida && !estaAtiva && 'bg-surface-2 text-ink-3',
                )}
              >
                {estaConcluida ? <Check className="size-4" strokeWidth={2.5} /> : index + 1}
              </div>
              {/* Texto */}
              <div className="flex flex-col items-center gap-0.5">
                <span
                  className={cn(
                    'text-[12px] font-medium',
                    estaAtiva && 'text-accent-ink',
                    estaConcluida && 'text-ok-ink',
                    !estaAtiva && !estaConcluida && 'text-ink-3',
                  )}
                >
                  {etapa.titulo}
                </span>
                {etapa.descricao && (
                  <span className="text-[11px] text-ink-3">{etapa.descricao}</span>
                )}
              </div>
            </button>

            {/* Linha conectora */}
            {index < etapas.length - 1 && (
              <div
                className={cn(
                  'mx-1 h-0.5 w-8 rounded-full',
                  index < etapaAtual ? 'bg-ok' : 'bg-surface-2',
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

interface WizardCorpoProps {
  children: ReactNode
  className?: string
}

export function WizardCorpo({ children, className }: WizardCorpoProps) {
  return <div className={cn('flex flex-col gap-5', className)}>{children}</div>
}

interface WizardNavegacaoProps {
  children: ReactNode
  className?: string
}

export function WizardNavegacao({ children, className }: WizardNavegacaoProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4', className)}>
      {children}
    </div>
  )
}
