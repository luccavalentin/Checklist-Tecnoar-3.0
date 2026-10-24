import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type TomToast = 'info' | 'ok' | 'atencao' | 'critico'

interface Toast {
  id: number
  tom: TomToast
  titulo: string
  mensagem?: string
}

interface ApiToast {
  ok: (titulo: string, mensagem?: string) => void
  erro: (titulo: string, mensagem?: string) => void
  info: (titulo: string, mensagem?: string) => void
  atencao: (titulo: string, mensagem?: string) => void
}

const Ctx = createContext<ApiToast | null>(null)

const ICONES: Record<TomToast, ReactNode> = {
  info: <Info />,
  ok: <CheckCircle2 />,
  atencao: <AlertTriangle />,
  critico: <XCircle />,
}

const CORES: Record<TomToast, string> = {
  info: 'text-cyan border-l-cyan',
  ok: 'text-ok border-l-ok',
  atencao: 'text-warn border-l-warn',
  critico: 'text-crit border-l-crit',
}

export function ProvedorToast({ children, centralizado = false, marca, icones }: { children: ReactNode; centralizado?: boolean; marca?: ReactNode; icones?: Partial<Record<TomToast, ReactNode>> }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const remover = useCallback((id: number) => {
    setToasts((atual) => atual.filter((t) => t.id !== id))
  }, [])

  const adicionar = useCallback(
    (tom: TomToast, titulo: string, mensagem?: string) => {
      const id = ++seq.current
      setToasts((atual) => [...(centralizado ? [] : atual.slice(-3)), { id, tom, titulo, mensagem }])
      window.setTimeout(() => remover(id), tom === 'critico' ? 8000 : 5000)
    },
    [remover, centralizado],
  )

  const api = useMemo<ApiToast>(
    () => ({
      ok: (t, m) => adicionar('ok', t, m),
      erro: (t, m) => adicionar('critico', t, m),
      info: (t, m) => adicionar('info', t, m),
      atencao: (t, m) => adicionar('atencao', t, m),
    }),
    [adicionar],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      {createPortal(
        <div
          aria-live="polite"
          aria-atomic="false"
          className={centralizado ? 'sos-toast-central pointer-events-none fixed inset-0 z-[110] flex flex-col items-center justify-center gap-2 p-5' : 'pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:inset-x-auto sm:right-0 sm:items-end'}
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              role={t.tom === 'critico' ? 'alert' : 'status'}
              className={cn(
                centralizado ? 'sos-toast-painel pointer-events-auto relative flex w-full max-w-sm flex-col items-center gap-3 rounded-3xl border border-line-strong bg-surface px-6 py-5 text-center shadow-e3' : 'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line-strong border-l-3 bg-surface px-4 py-3 shadow-e3',
                CORES[t.tom],
              )}
              style={{ animation: 'tec-toast .18s ease-out both' }}
            >
              {centralizado && marca && <div className="sos-toast-marca flex w-full justify-center border-b border-line pb-3">{marca}</div>}
              <span aria-hidden className={centralizado ? 'flex size-14 shrink-0 items-center justify-center [&_svg]:size-9' : 'mt-px shrink-0 [&_svg]:size-[17px]'}>
                {icones?.[t.tom] ?? ICONES[t.tom]}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className={cn('font-display font-semibold text-ink', centralizado ? 'text-[19px]' : 'text-[13px]')}>{t.titulo}</p>
                {t.mensagem && <p className="text-[12.5px] leading-relaxed text-ink-2">{t.mensagem}</p>}
              </div>
              <button
                type="button"
                aria-label="Dispensar"
                onClick={() => remover(t.id)}
                className={centralizado ? 'absolute top-3 right-3 flex size-10 items-center justify-center rounded-full text-ink-3 hover:text-ink' : '-mr-1 shrink-0 rounded p-1 text-ink-3 transition-colors hover:text-ink'}
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  )
}

export function useToast(): ApiToast {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast precisa estar dentro de <ProvedorToast>.')
  return ctx
}
