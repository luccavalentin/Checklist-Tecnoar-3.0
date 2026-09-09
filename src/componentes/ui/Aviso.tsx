import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TomAviso = 'info' | 'ok' | 'atencao' | 'critico'

const TONS: Record<TomAviso, { borda: string; fundo: string; icone: ReactNode; cor: string }> = {
  info: { borda: 'border-cyan/35', fundo: 'bg-cyan-soft', icone: <Info />, cor: 'text-cyan' },
  ok: { borda: 'border-ok/35', fundo: 'bg-ok-soft', icone: <CheckCircle2 />, cor: 'text-ok' },
  atencao: { borda: 'border-warn/35', fundo: 'bg-warn-soft', icone: <AlertTriangle />, cor: 'text-warn' },
  critico: { borda: 'border-crit/35', fundo: 'bg-crit-soft', icone: <XCircle />, cor: 'text-crit' },
}

export function Aviso({
  tom = 'info',
  titulo,
  children,
  acao,
  className,
}: {
  tom?: TomAviso
  titulo?: string
  children?: ReactNode
  acao?: ReactNode
  className?: string
}) {
  const t = TONS[tom]
  return (
    <div
      role={tom === 'critico' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-lg border px-4 py-3', t.borda, t.fundo, className)}
    >
      <span aria-hidden className={cn('mt-px shrink-0 [&_svg]:size-[17px]', t.cor)}>
        {t.icone}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {titulo && <p className="font-display text-[13px] font-semibold text-ink">{titulo}</p>}
        {children && <div className="text-[13px] leading-relaxed text-ink-2">{children}</div>}
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  )
}
