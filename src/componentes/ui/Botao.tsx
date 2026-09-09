import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type VarianteBotao = 'primario' | 'secundario' | 'neutro' | 'destrutivo' | 'fantasma'
export type TamanhoBotao = 'sm' | 'md' | 'lg'

const VARIANTES: Record<VarianteBotao, string> = {
  primario:
    'bg-accent text-on-accent border border-transparent shadow-accent hover:bg-accent-hover active:translate-y-px',
  secundario:
    'bg-cyan-soft text-cyan-ink border border-cyan/45 hover:border-cyan hover:bg-cyan-soft active:translate-y-px',
  neutro:
    'bg-transparent text-ink-2 border border-line-strong hover:text-ink hover:bg-surface-2 active:translate-y-px',
  destrutivo:
    'bg-transparent text-crit-ink border border-crit/45 hover:bg-crit-soft hover:border-crit active:translate-y-px',
  fantasma: 'bg-transparent text-ink-2 border border-transparent hover:bg-surface-2 hover:text-ink',
}

const TAMANHOS: Record<TamanhoBotao, string> = {
  sm: 'h-8 px-3 text-[11px] gap-1.5',
  md: 'h-10 px-4 text-xs gap-2',
  lg: 'h-12 px-6 text-[13px] gap-2.5',
}

export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
  carregando?: boolean
  iconeInicio?: ReactNode
  iconeFim?: ReactNode
  larguraTotal?: boolean
}

export const Botao = forwardRef<HTMLButtonElement, BotaoProps>(function Botao(
  {
    variante = 'neutro',
    tamanho = 'md',
    carregando = false,
    iconeInicio,
    iconeFim,
    larguraTotal,
    className,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-display font-bold uppercase tracking-[0.06em]',
        'transition-colors duration-150 select-none whitespace-nowrap',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:active:translate-y-0',
        VARIANTES[variante],
        TAMANHOS[tamanho],
        larguraTotal && 'w-full',
        className,
      )}
      {...props}
    >
      {carregando ? (
        <Loader2 aria-hidden className="size-4 animate-spin" />
      ) : (
        iconeInicio && <span aria-hidden className="[&_svg]:size-4 inline-flex">{iconeInicio}</span>
      )}
      {children}
      {!carregando && iconeFim && <span aria-hidden className="[&_svg]:size-4 inline-flex">{iconeFim}</span>}
    </button>
  )
})

export interface BotaoIconeProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  rotulo: string
  tamanho?: TamanhoBotao
  variante?: VarianteBotao
  children: ReactNode
}

export const BotaoIcone = forwardRef<HTMLButtonElement, BotaoIconeProps>(function BotaoIcone(
  { rotulo, tamanho = 'md', variante = 'fantasma', className, children, type = 'button', ...props },
  ref,
) {
  const dim = tamanho === 'sm' ? 'size-8' : tamanho === 'lg' ? 'size-12' : 'size-10'
  return (
    <button
      ref={ref}
      type={type}
      title={rotulo}
      aria-label={rotulo}
      className={cn(
        'inline-flex items-center justify-center rounded-md transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-45',
        variante === 'fantasma'
          ? 'text-ink-2 hover:bg-surface-2 hover:text-ink border border-transparent'
          : VARIANTES[variante],
        dim,
        '[&_svg]:size-[1.05rem]',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
})
