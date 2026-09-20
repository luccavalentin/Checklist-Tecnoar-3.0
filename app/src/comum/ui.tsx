import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { NavLink, useNavigate } from 'react-router-dom'
import { ChevronLeft, Loader2, Wrench, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Peças de interface do app SOS (cliente e mecânico).
 *
 * Diferente do Checklist, que é denso para quem passa o dia no computador,
 * aqui tudo é para o polegar: alvos de 48 px ou mais, uma ação principal por
 * tela, texto que se lê ao sol. Visual da marca Tecnoar: fundo claro,
 * superfícies brancas lisas, azul-marinho para confiança e laranja para agir.
 */

export function LogoSOS({ negativo, altura = 30, className }: { negativo?: boolean; altura?: number; className?: string }) {
  return (
    <img
      src={`/brand/tecnoar-${negativo ? 'negativo' : 'positivo'}.svg`}
      alt="Tecnoar"
      height={altura}
      style={{ height: altura }}
      className={cn('w-auto select-none', className)}
      draggable={false}
    />
  )
}

export function MarcaSOSTecnoar({
  negativo,
  grande,
  className,
}: {
  negativo?: boolean
  grande?: boolean
  className?: string
}) {
  return (
    <div aria-label="SOS Tecnoar" className={cn('select-none leading-none', className)}>
      <div aria-hidden className={cn('flex items-center font-display font-black italic tracking-normal', grande ? 'text-[68px]' : 'text-[27px]', negativo ? 'text-white' : 'text-[#0D1C33]')}>
        <span>S</span>
        <span className={cn('mx-0.5 flex items-center justify-center rounded-full bg-[#00afef] text-white shadow-[0_8px_18px_-10px_rgb(0_175_239/0.9)]', grande ? 'size-[0.78em]' : 'size-[0.82em]')}>
          <Wrench className={cn(grande ? 'size-[0.45em]' : 'size-[0.5em]')} strokeWidth={3} />
        </span>
        <span>S</span>
      </div>
      <div
        aria-hidden
        className={cn('-mt-1 font-display font-black italic tracking-normal text-[#ff6600] drop-shadow-[0_2px_0_#0D1C33]', grande ? 'text-[34px]' : 'text-[15px]')}
      >
        TECNOAR
      </div>
    </div>
  )
}

/* ── estrutura de tela ──────────────────────────────────────────────────── */

/**
 * Cabeçalho fixo da tela. `voltar`: `true` = histórico; string = rota.
 * Desconta o relógio do iPhone no app instalado e a faixa de "sem internet".
 */
export function CabecalhoTela({
  titulo,
  subtitulo,
  voltar,
  acao,
  transparente,
  className,
}: {
  titulo?: ReactNode
  subtitulo?: ReactNode
  voltar?: boolean | string
  acao?: ReactNode
  transparente?: boolean
  className?: string
}) {
  const navegar = useNavigate()
  return (
    <header
      className={cn(
        'sticky top-0 z-30 pt-[calc(env(safe-area-inset-top)+var(--faixa-rede,0px))]',
        transparente ? 'bg-transparent' : 'sos-native-header text-ink',
        className,
      )}
    >
      <div className="mx-auto flex min-h-[3.75rem] w-full max-w-xl items-center gap-2 px-3 pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))]">
        {voltar && (
          <button
            type="button"
            aria-label="Voltar"
            onClick={() => (typeof voltar === 'string' ? navegar(voltar) : window.history.length > 1 ? navegar(-1) : navegar('/'))}
            className="sos-icon-button -ml-1 flex size-11 shrink-0 items-center justify-center rounded-full text-ink"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}
        <div className={cn('min-w-0 flex-1', !voltar && 'pl-1')}>
          {titulo && <h1 className="truncate font-display text-[19px] leading-tight font-semibold tracking-tight text-ink">{titulo}</h1>}
          {subtitulo && <p className="truncate text-[12.5px] text-ink-3">{subtitulo}</p>}
        </div>
        {acao && <div className="flex shrink-0 items-center gap-1">{acao}</div>}
      </div>
    </header>
  )
}

/** Miolo da tela, com respiro para a barra de navegação inferior. */
export function Tela({
  children,
  className,
  comBarra = true,
}: {
  children: ReactNode
  className?: string
  /** Deixa espaço para a barra inferior do app (cascas cliente/mecânico). */
  comBarra?: boolean
}) {
  return (
    <main
      className={cn(
        'relative z-[1] mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-4 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]',
        comBarra ? 'pb-[calc(9rem+env(safe-area-inset-bottom))]' : 'pb-[calc(1.5rem+env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {children}
    </main>
  )
}

export function CartaoApp({
  children,
  className,
  onClick,
  as = 'div',
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
  as?: 'div' | 'button' | 'section'
}) {
  const Comp = onClick ? 'button' : as
  return (
    <Comp
      type={Comp === 'button' ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'sos-native-card rounded-[1.55rem] p-4 text-left text-ink',
        onClick && 'w-full transition-transform active:scale-[0.99]',
        className,
      )}
    >
      {children}
    </Comp>
  )
}

export function TituloSecao({ children, acao, className }: { children: ReactNode; acao?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-end justify-between gap-3 px-1 pt-2', className)}>
      <h2 className="font-display text-[15px] font-bold text-ink">{children}</h2>
      {acao}
    </div>
  )
}

/* ── botões ─────────────────────────────────────────────────────────────── */

type VarianteApp = 'primario' | 'sos' | 'escuro' | 'neutro' | 'fantasma' | 'perigo' | 'ok'
type TamanhoApp = 'md' | 'lg' | 'xl'

const VARIANTES: Record<VarianteApp, string> = {
  primario: 'sos-premium-action text-white hover:bg-accent-hover',
  sos: 'sos-siren-action text-white hover:bg-[#cc5200]',
  escuro: 'sos-night-action text-white hover:bg-[#002061] dark:bg-white dark:text-[#0D1C33]',
  neutro: 'sos-soft-action text-ink hover:bg-surface-2',
  fantasma: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  perigo: 'border border-crit/30 bg-crit-soft text-crit-ink hover:border-crit',
  ok: 'sos-operator-action text-[#0D1C33] hover:brightness-105',
}

const TAMANHOS: Record<TamanhoApp, string> = {
  md: 'min-h-12 px-5 text-[15px] gap-2 rounded-[1.05rem]',
  lg: 'min-h-14 px-6 text-[16px] gap-2.5 rounded-[1.25rem]',
  xl: 'min-h-16 px-7 text-[17px] gap-3 rounded-[1.35rem]',
}

export interface BotaoAppProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteApp
  tamanho?: TamanhoApp
  carregando?: boolean
  icone?: LucideIcon
  largo?: boolean
}

export const BotaoApp = forwardRef<HTMLButtonElement, BotaoAppProps>(function BotaoApp(
  { variante = 'primario', tamanho = 'md', carregando, icone: Icone, largo, className, children, disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || carregando}
      aria-busy={carregando || undefined}
      className={cn(
        'inline-flex items-center justify-center font-display font-semibold tracking-tight transition-[transform,background-color,border-color,box-shadow] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:active:scale-100',
        VARIANTES[variante],
        TAMANHOS[tamanho],
        largo && 'w-full',
        className,
      )}
      {...props}
    >
      {carregando ? <Loader2 className="size-5 animate-spin" /> : Icone && <Icone className="size-5 shrink-0" />}
      {children}
    </button>
  )
})

/** Botão redondo de ação rápida (ligar, mensagem, navegar). */
export function BotaoCircular({
  rotulo,
  icone: Icone,
  onClick,
  href,
  variante = 'neutro',
  className,
}: {
  rotulo: string
  icone: LucideIcon
  onClick?: () => void
  href?: string | null
  variante?: 'neutro' | 'primario' | 'ok' | 'escuro'
  className?: string
}) {
  const cls = cn('flex min-w-0 flex-col items-center gap-1.5 text-center', !onClick && !href && 'pointer-events-none opacity-40', className)
  const bolinha = cn(
    'flex size-14 items-center justify-center rounded-2xl transition-transform active:scale-95',
    variante === 'primario' && 'bg-accent text-white shadow-accent',
    variante === 'ok' && 'bg-ok text-white',
    variante === 'escuro' && 'bg-[#0D1C33] text-white dark:bg-[#002061]',
    variante === 'neutro' && 'border border-line-strong bg-surface text-ink',
  )
  const conteudo = (
    <>
      <span className={bolinha}>
        <Icone className="size-6" />
      </span>
      <span className="max-w-full truncate text-[12.5px] font-semibold text-ink-2">{rotulo}</span>
    </>
  )
  if (href)
    return (
      <a href={href} className={cls} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
        {conteudo}
      </a>
    )
  return (
    <button type="button" onClick={onClick} className={cls}>
      {conteudo}
    </button>
  )
}

/* ── folha inferior ─────────────────────────────────────────────────────── */

/**
 * Folha que sobe de baixo — confirmações, escolhas, formulários curtos. No
 * celular é o padrão que o polegar alcança; no tablet vira cartão centrado.
 */
export function Folha({
  aberta,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
  fecharFora = true,
}: {
  aberta: boolean
  aoFechar: () => void
  titulo?: ReactNode
  descricao?: ReactNode
  children?: ReactNode
  rodape?: ReactNode
  fecharFora?: boolean
}) {
  useEffect(() => {
    if (!aberta) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [aberta, aoFechar])

  if (!aberta) return null
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={typeof titulo === 'string' ? titulo : undefined}>
      <div className="absolute inset-0 bg-[#0D1C33]/45" onClick={fecharFora ? aoFechar : undefined} aria-hidden />
      <div className="sos-sheet sos-sobe relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] text-ink sm:rounded-[2rem]">
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <span className="h-1.5 w-10 rounded-full bg-line-strong" />
        </div>
        {(titulo || descricao) && (
          <div className="flex items-start justify-between gap-3 px-5 pt-3 pb-2 sm:pt-5">
            <div className="min-w-0">
              {titulo && <h2 className="font-display text-[19px] leading-tight font-bold text-ink">{titulo}</h2>}
              {descricao && <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{descricao}</p>}
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={aoFechar}
              className="-mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 active:bg-surface-2"
            >
              <X className="size-5" />
            </button>
          </div>
        )}
        {children && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-3">{children}</div>}
        {rodape && (
          <div className="border-t border-line bg-surface px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex flex-col gap-2">{rodape}</div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ── pedaços de conteúdo ────────────────────────────────────────────────── */

export function LinhaInfo({ rotulo, valor, icone: Icone }: { rotulo: string; valor: ReactNode; icone?: LucideIcon }) {
  return (
    <div className="flex items-start gap-3 py-2">
      {Icone && (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
          <Icone className="size-[18px]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] text-ink-3">{rotulo}</p>
        <div className="text-[15px] font-medium text-ink">{valor}</div>
      </div>
    </div>
  )
}

export function VazioApp({
  icone: Icone,
  titulo,
  descricao,
  acao,
}: {
  icone: LucideIcon
  titulo: string
  descricao?: ReactNode
  acao?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[1.25rem] border border-line bg-surface px-6 py-9 text-center">
      <span className="flex size-16 items-center justify-center rounded-[1.4rem] bg-accent-soft text-accent-ink">
        <Icone className="size-7" strokeWidth={1.9} />
      </span>
      <p className="font-display text-[17px] font-bold text-ink">{titulo}</p>
      {descricao && <p className="max-w-[19rem] text-[14px] leading-relaxed text-ink-2">{descricao}</p>}
      {acao && <div className="pt-1">{acao}</div>}
    </div>
  )
}

export function Esqueleto({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-2xl bg-skeleton', className)} />
}

export function Avatar({ nome, url, tamanho = 'md', className }: { nome?: string | null; url?: string | null; tamanho?: 'sm' | 'md' | 'lg'; className?: string }) {
  const t = tamanho === 'lg' ? 'size-16 text-[20px]' : tamanho === 'sm' ? 'size-9 text-[13px]' : 'size-12 text-[16px]'
  const ini = (nome ?? '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
  return url ? (
    <img src={url} alt="" className={cn(t, 'shrink-0 rounded-full object-cover', className)} />
  ) : (
    <span className={cn(t, 'flex shrink-0 items-center justify-center rounded-full bg-[#0D1C33] font-display font-bold text-white dark:bg-[#002061]', className)}>
      {ini || '?'}
    </span>
  )
}

/* ── barra de navegação inferior ────────────────────────────────────────── */

export interface ItemBarra {
  rota: string
  rotulo: string
  icone: LucideIcon
  /** Número no ícone (mensagens, pendências). */
  contador?: number
  fim?: boolean
}

/**
 * Barra inferior com um botão central de destaque (o SOS no cliente, o
 * "disponível" no mecânico). Fica acima do indicador de início do iPhone.
 */
export function BarraNavegacao({ itens, centro, className }: { itens: ItemBarra[]; centro?: ReactNode; className?: string }) {
  const metade = Math.ceil(itens.length / 2)
  const esquerda = centro ? itens.slice(0, metade) : itens
  const direita = centro ? itens.slice(metade) : []
  return (
    <nav aria-label="Navegação" className={cn('sos-bottom-nav fixed z-40', className)}>
      <div className="mx-auto flex h-[var(--sos-nav-height)] max-w-xl items-stretch justify-around px-1.5">
        {esquerda.map((i) => (
          <ItemNavegacao key={i.rota} item={i} />
        ))}
        {centro && <div className="relative flex w-[4.75rem] shrink-0 items-start justify-center max-[360px]:w-[4.15rem]">{centro}</div>}
        {direita.map((i) => (
          <ItemNavegacao key={i.rota} item={i} />
        ))}
      </div>
    </nav>
  )
}

function ItemNavegacao({ item }: { item: ItemBarra }) {
  const Icone = item.icone
  return (
    <NavLink
      to={item.rota}
      end={item.fim ?? item.rota === '/'}
      className={({ isActive }) =>
        cn(
          'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors',
          isActive ? 'text-accent-ink' : 'text-ink-3 hover:text-ink-2',
        )
      }
    >
      <span className="relative flex size-7 items-center justify-center">
        <Icone className="size-6" strokeWidth={1.9} />
        {!!item.contador && (
          <span className="num absolute -top-1.5 -right-2.5 flex min-w-[18px] items-center justify-center rounded-full bg-[#ff6600] px-1 text-[10px] leading-[18px] font-bold text-white ring-2 ring-surface">
            {item.contador > 99 ? '99+' : item.contador}
          </span>
        )}
      </span>
      <span className="max-w-full truncate">{item.rotulo}</span>
    </NavLink>
  )
}

/* ── formulário ─────────────────────────────────────────────────────────── */

/**
 * Campo de texto do app: letra de 16 px (o iPhone não aproxima a tela), 52 px
 * de altura, rótulo sempre visível — placeholder some quando a pessoa começa
 * a digitar e ela esquece o que era.
 */
export const CampoApp = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { rotulo: string; erro?: string | null; dica?: ReactNode; icone?: LucideIcon; direita?: ReactNode }
>(function CampoApp({ rotulo, erro, dica, icone: Icone, direita, className, id, ...props }, ref) {
  const idCampo = id ?? `campo-${rotulo.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={idCampo} className="text-[13.5px] font-semibold text-ink-2">
        {rotulo}
      </label>
      <div
        className={cn(
          'sos-field flex min-h-[3.35rem] items-center gap-2.5 rounded-[1.15rem] px-3.5 transition-[border-color,box-shadow,background-color] focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15',
          erro && '!border-crit',
        )}
      >
        {Icone && <Icone className="size-5 shrink-0 text-ink-3" />}
        <input
          ref={ref}
          id={idCampo}
          aria-invalid={erro ? true : undefined}
          className="min-w-0 flex-1 bg-transparent py-3 text-[16px] text-ink outline-none placeholder:text-ink-3/70"
          {...props}
        />
        {direita}
      </div>
      {erro ? <p className="text-[12.5px] text-crit-ink">{erro}</p> : dica ? <p className="text-[12.5px] text-ink-3">{dica}</p> : null}
    </div>
  )
})

export const AreaApp = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { rotulo: string; erro?: string | null; dica?: ReactNode }
>(function AreaApp({ rotulo, erro, dica, className, id, ...props }, ref) {
  const idCampo = id ?? `area-${rotulo.replace(/\W+/g, '-').toLowerCase()}`
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={idCampo} className="text-[13.5px] font-semibold text-ink-2">
        {rotulo}
      </label>
      <textarea
        ref={ref}
        id={idCampo}
        rows={3}
        className={cn(
          'sos-field min-h-24 w-full resize-y rounded-[1.15rem] px-3.5 py-3 text-[16px] leading-relaxed text-ink outline-none transition-[border-color,box-shadow,background-color] placeholder:text-ink-3/70 focus:border-accent focus:ring-4 focus:ring-accent/15',
          erro && '!border-crit',
        )}
        {...props}
      />
      {erro ? <p className="text-[12.5px] text-crit-ink">{erro}</p> : dica ? <p className="text-[12.5px] text-ink-3">{dica}</p> : null}
    </div>
  )
})

/** Faixa de aviso (sem internet, GPS negado, migração pendente). */
export function Faixa({ tom = 'atencao', children, icone: Icone }: { tom?: 'atencao' | 'critico' | 'info' | 'ok'; children: ReactNode; icone?: LucideIcon }) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2.5 rounded-[1.25rem] border px-3.5 py-3 text-[13.5px] leading-snug shadow-[0_10px_28px_-24px_rgb(8_24_48/0.35)]',
        tom === 'atencao' && 'border-warn/25 bg-warn-soft text-warn-ink',
        tom === 'critico' && 'border-crit/25 bg-crit-soft text-crit-ink',
        tom === 'info' && 'border-cyan/20 bg-cyan-soft text-cyan-ink',
        tom === 'ok' && 'border-ok/25 bg-ok-soft text-ok-ink',
      )}
    >
      {Icone && <Icone className="mt-0.5 size-[18px] shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
