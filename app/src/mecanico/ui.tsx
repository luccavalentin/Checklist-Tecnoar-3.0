import {
  forwardRef,
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Loader2, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Peças de interface do app do mecânico.
 *
 * Ferramenta de campo, não sistema: superfícies lisas, contraste alto, uma
 * ação principal por tela, botões do tamanho do polegar (56 px ou mais nas
 * ações que movem o atendimento) e números grandes em fonte mono. As cores
 * vêm dos tokens da seção "mecânico" do estilo.css (classe `mec`), com azul
 * Tecnoar na ação principal.
 */

/* ── estrutura ──────────────────────────────────────────────────────────── */

/** Miolo da tela: coluna central, respiro para a barra de abas. */
export function TelaM({ children, className, comBarra = true }: { children: ReactNode; className?: string; comBarra?: boolean }) {
  return (
    <main
      className={cn(
        'mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-3',
        comBarra ? 'pb-[calc(6.5rem+env(safe-area-inset-bottom))]' : 'pb-[calc(1.5rem+env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {children}
    </main>
  )
}

/**
 * Cabeçalho fixo. `voltar`: `true` volta no histórico; string vai para a rota;
 * função faz o que ela mandar. Desconta o relógio do iPhone.
 */
export function TopoM({
  titulo,
  sub,
  voltar,
  acao,
  sobretitulo,
  className,
}: {
  titulo: ReactNode
  sub?: ReactNode
  sobretitulo?: ReactNode
  voltar?: boolean | string | (() => void)
  acao?: ReactNode
  className?: string
}) {
  const navegar = useNavigate()
  function aoVoltar() {
    if (typeof voltar === 'function') return voltar()
    if (typeof voltar === 'string') return navegar(voltar)
    if (window.history.length > 1) navegar(-1)
    else navegar('/')
  }
  return (
    <header className={cn('sticky top-0 z-30 border-b border-line bg-canvas/92 pt-[env(safe-area-inset-top)] backdrop-blur-xl', className)}>
      <div className="mx-auto flex min-h-16 max-w-xl items-center gap-2 px-3 py-2">
        {voltar && (
          <button
            type="button"
            aria-label="Voltar"
            onClick={aoVoltar}
            className="flex size-12 shrink-0 items-center justify-center rounded-2xl text-ink active:bg-surface-2"
          >
            <ChevronLeft className="size-7" />
          </button>
        )}
        <div className={cn('min-w-0 flex-1', !voltar && 'pl-1')}>
          {sobretitulo && <p className="truncate font-display text-[11px] font-extrabold tracking-[0.14em] text-accent-ink uppercase">{sobretitulo}</p>}
          <h1 className="truncate font-display text-[20px] leading-tight font-extrabold tracking-tight text-ink">{titulo}</h1>
          {sub && <p className="truncate text-[13px] text-ink-3">{sub}</p>}
        </div>
        {acao && <div className="flex shrink-0 items-center gap-1.5">{acao}</div>}
      </div>
    </header>
  )
}

/** Micro-rótulo em caixa alta. */
export function RotuloM({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('font-display text-[11px] font-extrabold tracking-[0.14em] text-ink-3 uppercase', className)}>{children}</p>
}

/** Título de seção com ação opcional à direita. */
export function SecaoM({ titulo, acao, children, className }: { titulo: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col gap-2.5', className)}>
      <div className="flex min-h-6 items-end justify-between gap-3 px-1">
        <RotuloM>{titulo}</RotuloM>
        {acao}
      </div>
      {children}
    </section>
  )
}

/** Superfície lisa. */
export function CartaoM({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-[1.25rem] border border-line bg-surface p-4 mec-sombra', className)}>{children}</div>
}

/* ── botões ─────────────────────────────────────────────────────────────── */

export type VarianteM = 'laranja' | 'verde' | 'vermelho' | 'escuro' | 'neutro' | 'contorno' | 'fantasma'
export type TamanhoM = 'md' | 'lg' | 'xl' | 'xxl'

const VARIANTE: Record<VarianteM, string> = {
  laranja: 'sos-premium-action text-white active:brightness-95 mec-sombra-laranja',
  verde: 'bg-[#00afef] text-[#0D1C33] active:bg-[#009bd6] mec-sombra-verde',
  vermelho: 'bg-[#ff6600] text-white active:bg-[#cc5200]',
  escuro: 'bg-[#0D1C33] text-white active:bg-[#002061] dark:bg-white dark:text-[#0D1C33] dark:active:bg-white/85',
  neutro: 'border border-line bg-surface-2 text-ink active:bg-line',
  contorno: 'border-2 border-line-strong bg-transparent text-ink active:bg-surface-2',
  fantasma: 'bg-transparent text-ink-2 active:bg-surface-2',
}

const TAMANHO: Record<TamanhoM, string> = {
  md: 'min-h-12 gap-2 rounded-2xl px-4 text-[15px]',
  lg: 'min-h-14 gap-2.5 rounded-2xl px-5 text-[16px]',
  xl: 'min-h-16 gap-2.5 rounded-[1.25rem] px-4 text-[17px] tracking-[0.03em] uppercase max-[400px]:text-[16px]',
  xxl: 'min-h-[4.5rem] gap-3 rounded-[1.35rem] px-4 text-[18px] tracking-[0.03em] uppercase max-[400px]:text-[16.5px]',
}

export interface BotaoMProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteM
  tamanho?: TamanhoM
  carregando?: boolean
  icone?: LucideIcon
  largo?: boolean
}

export const BotaoM = forwardRef<HTMLButtonElement, BotaoMProps>(function BotaoM(
  { variante = 'laranja', tamanho = 'lg', carregando, icone: Icone, largo, className, children, disabled, type = 'button', ...props },
  ref,
) {
  const grande = tamanho === 'xl' || tamanho === 'xxl'
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={cn(
        'inline-flex items-center justify-center text-center font-display leading-tight font-extrabold transition-transform select-none active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
        VARIANTE[variante],
        TAMANHO[tamanho],
        largo && 'w-full',
        className,
      )}
      {...props}
    >
      {carregando ? (
        <Loader2 className={cn('shrink-0 animate-spin', grande ? 'size-6' : 'size-5')} />
      ) : (
        Icone && <Icone className={cn('shrink-0', grande ? 'size-6' : 'size-5')} strokeWidth={grande ? 2.6 : 2.2} />
      )}
      <span className="min-w-0">{children}</span>
    </button>
  )
})

/* ── números e selos ────────────────────────────────────────────────────── */

/** Número grande com rótulo (painel, finalização, histórico). */
export function NumeroM({
  rotulo,
  valor,
  sub,
  tom = 'neutro',
  icone: Icone,
  className,
}: {
  rotulo: ReactNode
  valor: ReactNode
  sub?: ReactNode
  tom?: 'neutro' | 'ok' | 'laranja' | 'ambar' | 'ciano'
  icone?: LucideIcon
  className?: string
}) {
  const cor = tom === 'ok' ? 'text-ok-ink' : tom === 'laranja' ? 'text-accent-ink' : tom === 'ambar' ? 'text-warn-ink' : tom === 'ciano' ? 'text-cyan-ink' : 'text-ink'
  return (
    <div className={cn('flex min-w-0 flex-col rounded-2xl border border-line bg-surface px-3 py-3 mec-sombra', className)}>
      <span className={cn('num flex items-center gap-1 text-[26px] leading-none font-semibold tracking-tight', cor)}>
        {valor}
        {Icone && <Icone className="size-[18px] shrink-0" strokeWidth={2.4} />}
      </span>
      <span className="mt-2 text-[12px] leading-tight font-semibold text-ink-2">{rotulo}</span>
      {sub && <span className="mt-0.5 truncate text-[11px] text-ink-3">{sub}</span>}
    </div>
  )
}

export type TomSelo = 'neutro' | 'ok' | 'laranja' | 'vermelho' | 'ambar' | 'ciano'

export function SeloM({ tom = 'neutro', children, className, ponto }: { tom?: TomSelo; children: ReactNode; className?: string; ponto?: boolean }) {
  const cls: Record<TomSelo, string> = {
    neutro: 'bg-surface-2 text-ink-2',
    ok: 'bg-ok-soft text-ok-ink',
    laranja: 'bg-accent-soft text-accent-ink',
    vermelho: 'bg-crit-soft text-crit-ink',
    ambar: 'bg-warn-soft text-warn-ink',
    ciano: 'bg-cyan-soft text-cyan-ink',
  }
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] leading-none font-extrabold tracking-[0.06em] uppercase', cls[tom], className)}>
      {ponto && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/* ── listas de tarefa ───────────────────────────────────────────────────── */

export type EstadoTarefa = 'feito' | 'pendente' | 'aviso' | 'livre'

/**
 * Linha grande de tarefa do atendimento: ícone, o que é, o estado em uma
 * frase e a seta. Toca e abre a tela daquilo — nada de formulário na lista.
 */
export function LinhaTarefa({
  icone: Icone,
  titulo,
  sub,
  estado = 'livre',
  onClick,
  href,
  direita,
  obrigatoria,
}: {
  icone: LucideIcon
  titulo: ReactNode
  sub?: ReactNode
  estado?: EstadoTarefa
  onClick?: () => void
  href?: string
  direita?: ReactNode
  obrigatoria?: boolean
}) {
  const conteudo = (
    <>
      <span
        className={cn(
          'relative flex size-12 shrink-0 items-center justify-center rounded-2xl',
          estado === 'feito' ? 'bg-ok-soft text-ok-ink' : estado === 'aviso' ? 'bg-warn-soft text-warn-ink' : estado === 'pendente' ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-ink-2',
        )}
      >
        <Icone className="size-[22px]" strokeWidth={2.2} />
        {estado === 'feito' && (
          <span aria-hidden className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full bg-[#00afef] text-[#0D1C33] ring-2 ring-surface">
            <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2.5 6.2 5 8.5l4.5-5" />
            </svg>
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[16px] leading-tight font-bold text-ink">{titulo}</span>
        {(sub || obrigatoria) && (
          <span className="mt-0.5 block truncate text-[13px] leading-snug text-ink-3">
            {obrigatoria && estado !== 'feito' && <span className="font-bold text-accent-ink">Obrigatório · </span>}
            {sub}
          </span>
        )}
      </span>
      {direita}
      <ChevronRight className="size-5 shrink-0 text-ink-3" />
    </>
  )
  const cls = 'flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors active:bg-surface-2 min-h-[4.5rem]'
  if (href)
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {conteudo}
      </a>
    )
  return (
    <button type="button" onClick={onClick} className={cls}>
      {conteudo}
    </button>
  )
}

/** Moldura de lista (linhas separadas por fio). */
export function ListaM({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-surface mec-sombra', className)}>{children}</div>
}

/* ── formulário ─────────────────────────────────────────────────────────── */

export const CampoM = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { rotulo: string; icone?: LucideIcon; dica?: ReactNode; erro?: string | null }
>(function CampoM({ rotulo, icone: Icone, dica, erro, className, id, ...props }, ref) {
  const idCampo = id ?? `campo-m-${rotulo.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={idCampo} className="text-[13px] font-semibold text-ink-2">
        {rotulo}
      </label>
      <div className={cn('flex min-h-14 items-center gap-2.5 rounded-2xl border-2 bg-inset px-3.5 focus-within:border-accent', erro ? 'border-crit' : 'border-line')}>
        {Icone && <Icone className="size-5 shrink-0 text-ink-3" />}
        <input ref={ref} id={idCampo} className="min-w-0 flex-1 bg-transparent py-3 text-[16px] text-ink outline-none placeholder:text-ink-3" {...props} />
      </div>
      {erro ? <p className="text-[12.5px] font-semibold text-crit-ink">{erro}</p> : dica ? <p className="text-[12.5px] text-ink-3">{dica}</p> : null}
    </div>
  )
})

export const AreaM = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { rotulo?: string; dica?: ReactNode; erro?: string | null; acao?: ReactNode }
>(function AreaM({ rotulo, dica, erro, acao, className, id, ...props }, ref) {
  const idCampo = id ?? `area-m-${(rotulo ?? 'texto').replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {(rotulo || acao) && (
        <div className="flex items-end justify-between gap-2">
          {rotulo && (
            <label htmlFor={idCampo} className="text-[13px] font-semibold text-ink-2">
              {rotulo}
            </label>
          )}
          {acao}
        </div>
      )}
      <textarea
        ref={ref}
        id={idCampo}
        rows={5}
        className={cn(
          'min-h-36 w-full resize-y rounded-2xl border-2 bg-inset px-3.5 py-3 text-[16px] leading-relaxed text-ink outline-none placeholder:text-ink-3 focus:border-accent',
          erro ? 'border-crit' : 'border-line',
        )}
        {...props}
      />
      {erro ? <p className="text-[12.5px] font-semibold text-crit-ink">{erro}</p> : dica ? <p className="text-[12.5px] text-ink-3">{dica}</p> : null}
    </div>
  )
})

/* ── folha inferior ─────────────────────────────────────────────────────── */

/** Folha que sobe de baixo — confirmações e escolhas curtas. */
export function FolhaM({
  aberta,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
}: {
  aberta: boolean
  aoFechar: () => void
  titulo?: ReactNode
  descricao?: ReactNode
  children?: ReactNode
  rodape?: ReactNode
}) {
  useEffect(() => {
    if (!aberta) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', onKey)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = antes
    }
  }, [aberta, aoFechar])

  if (!aberta) return null
  return createPortal(
    <div className="mec fixed inset-0 z-[85] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={typeof titulo === 'string' ? titulo : undefined}>
      <div className="absolute inset-0 bg-[#020812]/70" onClick={aoFechar} aria-hidden />
      <div className="sos-sobe relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[1.75rem] border border-line bg-surface text-ink sm:rounded-[1.75rem]">
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <span className="h-1.5 w-10 rounded-full bg-line-strong" />
        </div>
        {(titulo || descricao) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-2 sm:pt-5">
            <div className="min-w-0">
              {titulo && <h2 className="font-display text-[20px] leading-tight font-extrabold text-ink">{titulo}</h2>}
              {descricao && <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{descricao}</p>}
            </div>
            <button type="button" aria-label="Fechar" onClick={aoFechar} className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2">
              <X className="size-5" />
            </button>
          </div>
        )}
        {children && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3">{children}</div>}
        {rodape && (
          <div className="border-t border-line px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex flex-col gap-2">{rodape}</div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ── estados ────────────────────────────────────────────────────────────── */

export function VazioM({ icone: Icone, titulo, texto, acao }: { icone: LucideIcon; titulo: string; texto?: ReactNode; acao?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[1.25rem] border border-dashed border-line-strong px-6 py-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-2 text-ink-2">
        <Icone className="size-7" />
      </span>
      <p className="font-display text-[17px] font-extrabold text-ink">{titulo}</p>
      {texto && <p className="max-w-[19rem] text-[14px] leading-relaxed text-ink-2">{texto}</p>}
      {acao}
    </div>
  )
}

export function EsqueletoM({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-skeleton', className)} />
}

/** Barra de ação fixa no rodapé — o botão da etapa sempre ao alcance do polegar. */
export function RodapeAcao({ children, teclado = 0, className }: { children: ReactNode; teclado?: number; className?: string }) {
  return (
    <div className={cn('fixed inset-x-0 z-40 border-t border-line bg-canvas/95 backdrop-blur-xl transition-[bottom] duration-150', className)} style={{ bottom: teclado }}>
      <div className={cn('mx-auto flex max-w-xl flex-col gap-2 px-4 pt-3', teclado ? 'pb-3' : 'pb-[calc(0.85rem+env(safe-area-inset-bottom))]')}>{children}</div>
    </div>
  )
}

/* ── escolha única ──────────────────────────────────────────────────────── */

/**
 * Opção grande de escolha única (use dentro de um `role="radiogroup"`): o
 * cartão inteiro é o alvo do toque, com a bolinha marcada à direita.
 */
export function OpcaoM({
  marcada,
  aoMarcar,
  icone: Icone,
  titulo,
  sub,
  selo,
  disabled,
}: {
  marcada: boolean
  aoMarcar: () => void
  icone?: LucideIcon
  titulo: ReactNode
  sub?: ReactNode
  selo?: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={marcada}
      disabled={disabled}
      onClick={aoMarcar}
      className={cn(
        'flex min-h-[4.5rem] w-full items-center gap-3 rounded-[1.25rem] border-2 px-3.5 py-3 text-left transition-[transform,border-color,background-color] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45',
        marcada ? 'border-accent bg-accent-soft/60' : 'border-line bg-surface',
      )}
    >
      {Icone && (
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', marcada ? 'bg-accent text-white' : 'bg-surface-2 text-ink-2')}>
          <Icone className="size-[22px]" strokeWidth={2.2} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[16px] leading-tight font-extrabold text-ink">{titulo}</span>
        {sub && <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{sub}</span>}
        {selo && <span className="mt-1.5 flex flex-wrap gap-1.5">{selo}</span>}
      </span>
      <span
        aria-hidden
        className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border-2', marcada ? 'border-accent bg-accent' : 'border-line-strong')}
      >
        {marcada && <span className="size-2.5 rounded-full bg-white" />}
      </span>
    </button>
  )
}
