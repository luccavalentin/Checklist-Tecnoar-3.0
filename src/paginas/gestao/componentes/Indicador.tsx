import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TomMetrica } from '@/componentes/ui/Metrica'

/**
 * Vocabulário visual dos painéis de gestão.
 *
 * O que faz uma tela de indicadores parecer profissional não é enfeite: é
 * hierarquia, números alinhados e contexto. Cada peça aqui existe para uma
 * dessas três coisas.
 *
 * - **Trilho de tom** de 3px na borda esquerda em vez de cartão colorido
 *   inteiro — a cor informa sem gritar, e cinco cartões lado a lado continuam
 *   legíveis.
 * - **Numerais tabulares** (`num`) para os valores se alinharem na vertical
 *   entre cartões, que é o que permite comparar de relance.
 * - **Variação sempre contra um período de mesmo tamanho**, nunca contra um
 *   número inventado. Sem período anterior, não aparece variação nenhuma.
 */

export const TRILHO: Record<TomMetrica, string> = {
  neutro: 'bg-ink-3',
  cyan: 'bg-cyan',
  accent: 'bg-accent',
  ok: 'bg-ok',
  atencao: 'bg-warn',
  critico: 'bg-crit',
}

export const CAIXA_ICONE: Record<TomMetrica, string> = {
  neutro: 'border-line bg-surface-2 text-ink-3',
  cyan: 'border-cyan/25 bg-cyan-soft text-cyan-ink',
  accent: 'border-accent/25 bg-accent-soft text-accent-ink',
  ok: 'border-ok/25 bg-ok-soft text-ok-ink',
  atencao: 'border-warn/25 bg-warn-soft text-warn-ink',
  critico: 'border-crit/25 bg-crit-soft text-crit-ink',
}

export interface Variacao {
  /** Valor do período anterior, de mesmo tamanho. */
  anterior: number
  atual: number
  /**
   * Para onde é bom o número ir. Tempo médio caindo é bom; faturamento
   * caindo não é — sem isto a seta verde mentiria metade das vezes.
   */
  melhorQuando?: 'sobe' | 'desce'
}

/**
 * Variação percentual entre dois períodos.
 *
 * Sai `null` quando não há base de comparação: mostrar "+100%" porque o
 * período anterior foi zero é ruído, não informação.
 */
export function Delta({ variacao }: { variacao: Variacao }) {
  const { anterior, atual, melhorQuando = 'sobe' } = variacao

  if (anterior === 0) {
    return (
      <span className="text-[11px] text-ink-3" title="Não houve movimento no período anterior">
        sem base
      </span>
    )
  }

  const pct = ((atual - anterior) / Math.abs(anterior)) * 100
  const subiu = pct > 0.5
  const desceu = pct < -0.5
  const bom = melhorQuando === 'sobe' ? subiu : desceu
  const ruim = melhorQuando === 'sobe' ? desceu : subiu

  const Icone = subiu ? ArrowUpRight : desceu ? ArrowDownRight : ArrowRight

  return (
    <span
      title={`Período anterior: ${anterior.toLocaleString('pt-BR')}`}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        bom ? 'bg-ok-soft text-ok-ink' : ruim ? 'bg-crit-soft text-crit-ink' : 'bg-surface-2 text-ink-3',
      )}
    >
      <Icone aria-hidden className="size-3" />
      {Math.abs(pct) < 0.5 ? 'estável' : `${Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%`}
    </span>
  )
}

/**
 * Minigráfico de tendência.
 *
 * SVG inline, sem biblioteca: é uma polilinha em `currentColor`, então herda
 * o tom do cartão e funciona nos dois temas sem configuração.
 */
export function Sparkline({
  serie,
  className,
  altura = 28,
}: {
  serie: number[]
  className?: string
  altura?: number
}) {
  if (serie.length < 2) return null

  const largura = 100
  const min = Math.min(...serie)
  const max = Math.max(...serie)
  const amplitude = max - min || 1
  const passo = largura / (serie.length - 1)

  const pontos = serie.map((v, i) => {
    const x = i * passo
    const y = altura - ((v - min) / amplitude) * (altura - 4) - 2
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  const ultimo = pontos[pontos.length - 1].split(',')

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${largura} ${altura}`}
      preserveAspectRatio="none"
      className={cn('h-7 w-full', className)}
    >
      {/* A área sob a linha dá peso ao gráfico sem precisar de grade. */}
      <polygon
        points={`0,${altura} ${pontos.join(' ')} ${largura},${altura}`}
        fill="currentColor"
        opacity="0.1"
      />
      <polyline
        points={pontos.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={ultimo[0]} cy={ultimo[1]} r="2" fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * Cartão de destaque — os poucos números que abrem a tela.
 *
 * Alto, com ícone e tendência. Reservado para o topo: se tudo é destaque,
 * nada é.
 */
export function CartaoDestaque({
  rotulo,
  valor,
  detalhe,
  tom = 'neutro',
  icone,
  variacao,
  serie,
  alerta,
  carregando,
}: {
  rotulo: string
  valor: ReactNode
  detalhe?: ReactNode
  tom?: TomMetrica
  icone?: ReactNode
  variacao?: Variacao
  serie?: number[]
  alerta?: boolean
  carregando?: boolean
}) {
  return (
    <article
      className={cn(
        'aresta relative flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border bg-surface p-4',
        alerta ? 'border-crit/35' : 'border-line',
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px]', TRILHO[tom])} />

      <header className="flex min-w-0 items-start justify-between gap-3 pl-1">
        <span className="lbl min-w-0 leading-snug">{rotulo}</span>
        {alerta ? (
          <TriangleAlert aria-hidden className="size-4 shrink-0 text-crit" />
        ) : icone ? (
          <span aria-hidden className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg border [&_svg]:size-4', CAIXA_ICONE[tom])}>
            {icone}
          </span>
        ) : null}
      </header>

      <div className="flex min-w-0 items-end justify-between gap-3 pl-1">
        <span className="num min-w-0 truncate text-[26px] leading-none font-bold tracking-tight text-ink sm:text-[30px]">
          {carregando ? '—' : valor}
        </span>
        {variacao && !carregando && <Delta variacao={variacao} />}
      </div>

      {serie && serie.length > 1 && !carregando && (
        <div className={cn('-mb-1 pl-1', tom === 'neutro' ? 'text-ink-3' : `text-${tom}`)}>
          <Sparkline serie={serie} />
        </div>
      )}

      {detalhe && <p className="pl-1 text-[11.5px] leading-snug text-ink-3">{detalhe}</p>}
    </article>
  )
}

/**
 * Cartão de apoio — a maioria dos indicadores.
 *
 * Baixo e denso, para caber muitos por linha sem virar parede de números. A
 * pergunta que o indicador responde fica junto: um número sem pergunta não é
 * indicador, é enfeite.
 */
export function CartaoIndicador({
  rotulo,
  pergunta,
  valor,
  tom = 'neutro',
  alerta,
  variacao,
}: {
  rotulo: string
  pergunta: string
  valor: ReactNode
  tom?: TomMetrica
  alerta?: boolean
  variacao?: Variacao
}) {
  return (
    <article
      className={cn(
        'aresta relative flex min-h-[88px] min-w-0 flex-col justify-between gap-2.5 overflow-hidden rounded-lg border bg-surface p-3.5 transition-colors',
        alerta ? 'border-crit/30' : 'border-line hover:border-line-strong',
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-2.5 left-0 w-[3px] rounded-r-sm', TRILHO[tom])} />

      <div className="flex min-w-0 items-start justify-between gap-2 pl-1.5">
        <span className="lbl min-w-0 leading-snug">{rotulo}</span>
        {alerta && <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-crit" />}
      </div>

      <div className="flex items-end justify-between gap-3 pl-1.5">
        <span className="line-clamp-2 min-w-0 flex-1 text-[11.5px] leading-snug text-ink-3">{pergunta}</span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className="num text-right text-[23px] leading-none font-semibold text-ink">{valor}</span>
          {variacao && <Delta variacao={variacao} />}
        </span>
      </div>
    </article>
  )
}

/**
 * Barra comparativa de uma lista ordenada.
 *
 * Substitui o gráfico de barras completo onde o que importa é a ordem e a
 * proporção — e sem pedir uma biblioteca de gráficos ao projeto.
 */
export function BarraRanque({
  itens,
  formatar,
  tom = 'accent',
  vazio = 'Nenhum dado no período.',
}: {
  itens: Array<{ chave: string; rotulo: string; valor: number; detalhe?: string }>
  formatar: (v: number) => string
  tom?: TomMetrica
  vazio?: string
}) {
  if (itens.length === 0) {
    return <p className="py-6 text-center text-[12.5px] text-ink-3">{vazio}</p>
  }
  const maior = Math.max(1, ...itens.map((i) => i.valor))

  return (
    <ol className="flex flex-col gap-2.5">
      {itens.map((i, idx) => (
        <li key={i.chave} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="num w-4 shrink-0 text-[11px] text-ink-3">{idx + 1}</span>
              <span className="min-w-0 truncate text-[13px] text-ink">{i.rotulo}</span>
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              {i.detalhe && <span className="text-[11px] text-ink-3">{i.detalhe}</span>}
              <span className="num text-[13px] font-semibold text-ink">{formatar(i.valor)}</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className={cn('h-full rounded-full', TRILHO[tom])}
              style={{ width: `${Math.max(2, (i.valor / maior) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}
