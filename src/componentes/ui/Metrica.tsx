import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Esqueleto } from './Estados'

export type TomMetrica = 'neutro' | 'cyan' | 'accent' | 'ok' | 'atencao' | 'critico'

const PONTO: Record<TomMetrica, string> = {
  neutro: 'bg-ink-3',
  cyan: 'bg-cyan',
  accent: 'bg-accent',
  ok: 'bg-ok',
  atencao: 'bg-warn',
  critico: 'bg-crit',
}

const NUMERO: Record<TomMetrica, string> = {
  neutro: 'text-ink',
  cyan: 'text-ink',
  accent: 'text-accent-ink',
  ok: 'text-ok-ink',
  atencao: 'text-warn-ink',
  critico: 'text-crit-ink',
}

const FAIXA: Record<TomMetrica, string> = {
  neutro: 'bg-ink-3',
  cyan: 'bg-cyan',
  accent: 'bg-accent',
  ok: 'bg-ok',
  atencao: 'bg-warn',
  critico: 'bg-crit',
}

const FUNDO_ICONE: Record<TomMetrica, string> = {
  neutro: 'bg-surface-2 text-ink-3',
  cyan: 'bg-cyan-soft text-cyan-ink',
  accent: 'bg-accent-soft text-accent-ink',
  ok: 'bg-ok-soft text-ok-ink',
  atencao: 'bg-warn-soft text-warn-ink',
  critico: 'bg-crit-soft text-crit-ink',
}

export interface MetricaProps {
  rotulo: string
  /** Número, valor formatado ou texto honesto quando não há o que medir. */
  valor: ReactNode
  /** Linha de apoio: a unidade, ou a pergunta que o indicador responde. */
  glosa?: ReactNode
  tom?: TomMetrica
  icone?: ReactNode
  /** Pinta o número no tom e reforça a borda — use só quando o número pede ação. */
  alerta?: boolean
  carregando?: boolean
  /** Torna o cartão um filtro clicável. */
  onClick?: () => void
  ativo?: boolean
  /**
   * `destaque` amplia o número para abrir uma faixa executiva no topo da tela.
   * É a mesma peça, só que maior — a hierarquia vem do tamanho, não de um
   * cartão de anatomia diferente.
   */
  tamanho?: 'padrao' | 'destaque'
  className?: string
}

/**
 * Cartão de indicador — a mesma peça em toda a operação.
 *
 * A leitura é de instrumento: um ponto de cor identifica o assunto, o número
 * domina em tabular e a glosa explica o que ele significa. Sem o número, o
 * cartão diz o motivo em vez de mostrar zero — zero medido e zero por falta de
 * dado não são a mesma informação.
 */
/**
 * Um valor é medida quando começa por dígito, sinal ou símbolo de moeda —
 * `1.284`, `R$ 4.200,00`, `-12,4%`, `48 h`. Qualquer outra coisa é uma frase
 * ocupando o lugar do número, e não deve ser tipografada como número.
 */
export function ehMedida(valor: ReactNode): boolean {
  if (typeof valor === 'number') return true
  if (typeof valor !== 'string') return true
  return /^[\s]*[-+]?(R\$\s*)?\d/.test(valor)
}

export function Metrica({
  rotulo,
  valor,
  glosa,
  tom = 'neutro',
  icone,
  alerta,
  carregando,
  onClick,
  ativo,
  tamanho = 'padrao',
  className,
}: MetricaProps) {
  const Elemento = onClick ? 'button' : 'div'
  const grande = tamanho === 'destaque'

  return (
    <Elemento
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      aria-pressed={onClick ? ativo : undefined}
      className={cn(
        'aresta group relative overflow-hidden rounded-lg border bg-surface p-3.5 text-left shadow-e1',
        /* No celular o cartão deita: rótulo à esquerda, número à direita. Cinco
           indicadores empilhados na vertical custariam cinco telas de rolagem
           antes do conteúdo. */
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1',
        grande ? 'min-h-[92px]' : 'min-h-[84px]',
        'transition-[border-color,box-shadow,transform] duration-150',
        ativo
          ? 'border-cyan ring-1 ring-cyan/25'
          : alerta
            ? 'border-crit/35'
            : 'border-line',
        onClick &&
          'cursor-pointer hover:-translate-y-0.5 hover:border-line-strong hover:shadow-e2 active:translate-y-px',
        className,
      )}
    >
      <span aria-hidden className={cn('absolute inset-x-0 top-0 h-[3px]', FAIXA[tom])} />

      <span className="col-start-1 flex min-w-0 items-center gap-2">
        <span aria-hidden className={cn('size-[5px] shrink-0 rounded-[1px]', PONTO[tom])} />
        <span className="lbl line-clamp-2 leading-[1.4]">{rotulo}</span>
        {icone && (
          <span
            aria-hidden
            className={cn(
              'ml-auto hidden shrink-0 items-center justify-center rounded-md sm:flex',
              grande ? 'size-8 [&_svg]:size-4' : 'size-7 [&_svg]:size-3.5',
              FUNDO_ICONE[tom],
            )}
          >
            {icone}
          </span>
        )}
      </span>

      {carregando ? (
        <Esqueleto className="col-start-2 h-8" largura="3.5rem" />
      ) : ehMedida(valor) ? (
        <span
          className={cn(
            'num col-start-2 row-span-2 row-start-1 self-center text-right leading-none font-semibold',
            grande ? 'text-[27px] sm:text-[32px]' : 'text-[23px] sm:text-[26px]',
            alerta ? NUMERO[tom] : 'text-ink',
          )}
        >
          {valor}
        </span>
      ) : (
        /* Quando não há o que medir, o cartão explica o motivo — e explicação
           é texto, não número: sai da face tabular e do corpo de destaque. */
        <span
          className={cn(
            'col-start-2 row-span-2 row-start-1 max-w-[16ch] self-center text-right text-[13px] leading-snug font-medium text-balance text-ink-2',
            'sm:max-w-[22ch] sm:text-[14px]',
          )}
        >
          {valor}
        </span>
      )}

      {glosa && (
        <span className="col-start-1 text-[11.5px] leading-snug text-balance text-ink-3">{glosa}</span>
      )}

      {onClick && (
        <span
          aria-hidden
          className="absolute right-2.5 bottom-2.5 flex size-6 items-center justify-center rounded-md text-ink-3 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <ChevronRight className="size-4" />
        </span>
      )}
    </Elemento>
  )
}

/** Faixa de indicadores — mesma grade e mesmo respiro em todas as telas. */
export function GradeMetricas({
  children,
  colunas = 4,
  className,
}: {
  children: ReactNode
  colunas?: 2 | 3 | 4 | 5
  className?: string
}) {
  const grades = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  } as const

  return <div className={cn('grid grid-cols-1 gap-3', grades[colunas], className)}>{children}</div>
}
