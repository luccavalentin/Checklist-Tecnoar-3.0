import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ---------------------------------------------------------------- Rótulo */

export function Rotulo({
  children,
  htmlFor,
  obrigatorio,
  className,
}: {
  children: ReactNode
  htmlFor?: string
  obrigatorio?: boolean
  className?: string
}) {
  return (
    <label htmlFor={htmlFor} className={cn('lbl flex items-center gap-1', className)}>
      {children}
      {obrigatorio && (
        <span className="text-accent" aria-hidden>
          *
        </span>
      )}
    </label>
  )
}

/* ----------------------------------------------------------------- Campo */

export interface CampoProps {
  rotulo?: string
  obrigatorio?: boolean
  erro?: string
  dica?: string
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode
  className?: string
}

export function Campo({ rotulo, obrigatorio, erro, dica, children, className }: CampoProps) {
  const id = useId()
  const idAux = erro ? `${id}-erro` : dica ? `${id}-dica` : undefined

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {rotulo && (
        <Rotulo htmlFor={id} obrigatorio={obrigatorio}>
          {rotulo}
        </Rotulo>
      )}
      {children({ id, 'aria-invalid': Boolean(erro), 'aria-describedby': idAux })}
      {erro ? (
        <p id={idAux} role="alert" className="flex items-center gap-1.5 text-[11.5px] font-medium text-crit-ink">
          <AlertCircle aria-hidden className="size-3.5 shrink-0" />
          {erro}
        </p>
      ) : dica ? (
        <p id={idAux} className="text-[11.5px] text-ink-3">
          {dica}
        </p>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------- Entrada */

/*
 * Campo desabilitado continua legível.
 *
 * Com `opacity-50` o valor de um campo travado — o tipo de um modelo já usado,
 * o e-mail em Minha Conta — ficava fraco a ponto de parecer placeholder vazio.
 * Trocar por fundo apagado e tinta secundária mantém a leitura e ainda deixa
 * claro que o campo não aceita edição.
 */
const BASE_CONTROLE =
  'w-full min-w-0 rounded-md border bg-inset text-[13.5px] text-ink transition-colors duration-150 ' +
  'placeholder:text-ink-3 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-2 ' +
  'focus:outline-none focus-visible:outline-none'

const ESTADO_CONTROLE =
  'border-line-strong focus:border-cyan focus:ring-3 focus:ring-cyan/20 ' +
  'aria-[invalid=true]:border-crit aria-[invalid=true]:focus:ring-crit/20'

export interface EntradaProps extends InputHTMLAttributes<HTMLInputElement> {
  iconeInicio?: ReactNode
  acaoFim?: ReactNode
  mono?: boolean
}

export const Entrada = forwardRef<HTMLInputElement, EntradaProps>(function Entrada(
  { iconeInicio, acaoFim, mono, className, ...props },
  ref,
) {
  const campo = (
    <input
      ref={ref}
      className={cn(
        BASE_CONTROLE,
        ESTADO_CONTROLE,
        'h-10 px-3',
        mono && 'num',
        iconeInicio && 'pl-9',
        acaoFim && 'pr-2',
        className,
      )}
      {...props}
    />
  )

  if (!iconeInicio && !acaoFim) return campo

  return (
    <div className="relative flex min-w-0 items-center">
      {iconeInicio && (
        <span aria-hidden className="pointer-events-none absolute left-3 text-ink-3 [&_svg]:size-4">
          {iconeInicio}
        </span>
      )}
      {campo}
      {acaoFim && <span className="absolute right-1.5 flex items-center">{acaoFim}</span>}
    </div>
  )
})

/* -------------------------------------------------------------- AreaTexto */

export const AreaTexto = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function AreaTexto({ className, rows = 4, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(BASE_CONTROLE, ESTADO_CONTROLE, 'resize-y px-3 py-2.5 leading-relaxed', className)}
        {...props}
      />
    )
  },
)

/* --------------------------------------------------------------- Selecao */

export const Selecao = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Selecao(
  { className, children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        BASE_CONTROLE,
        ESTADO_CONTROLE,
        'h-10 cursor-pointer appearance-none bg-no-repeat px-3 pr-9',
        "bg-[url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2371829b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")]",
        'bg-[position:right_0.75rem_center]',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
})

/* ------------------------------------------------------------- Segmentado */

export function Segmentado<T extends string>({
  valor,
  opcoes,
  onChange,
  rotuloGrupo,
  className,
}: {
  valor: T
  opcoes: Array<{ valor: T; rotulo: string; icone?: ReactNode }>
  onChange: (v: T) => void
  rotuloGrupo: string
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={rotuloGrupo}
      className={cn('flex min-w-0 flex-wrap gap-0.5 rounded-md border border-line-strong bg-inset p-[3px]', className)}
    >
      {opcoes.map((o) => {
        const ativo = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onChange(o.valor)}
            className={cn(
              'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[5px] px-3 py-1.5',
              'font-display text-[11.5px] font-semibold transition-colors duration-150 whitespace-nowrap',
              '[&_svg]:size-3.5',
              ativo ? 'bg-surface-2 text-ink shadow-e1' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            {o.icone}
            {o.rotulo}
          </button>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------- Alternador */

export function Alternador({
  ativo,
  onChange,
  rotulo,
  disabled,
}: {
  ativo: boolean
  onChange: (v: boolean) => void
  rotulo: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ativo}
      aria-label={rotulo}
      disabled={disabled}
      onClick={() => onChange(!ativo)}
      className={cn(
        'relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border p-[2px] transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-50',
        ativo ? 'border-transparent bg-accent' : 'border-line-strong bg-surface-2',
      )}
    >
      <span
        className={cn(
          'size-4 rounded-full transition-transform duration-150',
          ativo ? 'translate-x-4 bg-on-accent' : 'translate-x-0 bg-ink-3',
        )}
      />
    </button>
  )
}
