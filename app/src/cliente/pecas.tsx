import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { OCORRENCIAS, formatarPlacaExibicao } from '@/sos/rotulos'
import type { OcorrenciaSOS } from '@/sos/tipos'

/**
 * Peças visuais só do app do cliente. As genéricas (botão, folha, campo)
 * continuam em `comum/ui.tsx`; aqui fica o que tem cara de "meu veículo".
 */

/**
 * Placa no padrão Mercosul — a pessoa reconhece o próprio veículo pela placa
 * antes de ler o modelo.
 */
export function PlacaVeiculo({ placa, tamanho = 'md', className }: { placa: string | null | undefined; tamanho?: 'sm' | 'md' | 'lg'; className?: string }) {
  const texto = tamanho === 'lg' ? 'text-[19px] px-3 py-0.5' : tamanho === 'sm' ? 'text-[12px] px-1.5 py-px' : 'text-[15px] px-2 py-px'
  const faixa = tamanho === 'lg' ? 'h-3 text-[7px]' : tamanho === 'sm' ? 'h-2 text-[5px]' : 'h-2.5 text-[6px]'
  return (
    <span
      className={cn('inline-flex shrink-0 flex-col overflow-hidden rounded-[6px] border-[1.5px] border-[#0b1c33] bg-white leading-none text-[#0b1c33]', className)}
      aria-label={`Placa ${formatarPlacaExibicao(placa)}`}
    >
      <span aria-hidden className={cn('flex items-center justify-center bg-[#1446a0] font-sans font-bold tracking-[0.25em] text-white', faixa)}>
        BRASIL
      </span>
      <span aria-hidden className={cn('num placa-num text-center font-bold', texto)}>
        {formatarPlacaExibicao(placa)}
      </span>
    </span>
  )
}

/** Quadradinho com o ícone do tipo de problema. */
export function IconeOcorrencia({ tipo, tamanho = 'md', className }: { tipo: OcorrenciaSOS; tamanho?: 'sm' | 'md' | 'lg'; className?: string }) {
  const info = OCORRENCIAS[tipo] ?? OCORRENCIAS.outro
  const Icone = info.icone
  const t = tamanho === 'lg' ? 'size-14 rounded-2xl [&>svg]:size-7' : tamanho === 'sm' ? 'size-9 rounded-xl [&>svg]:size-[18px]' : 'size-11 rounded-2xl [&>svg]:size-[22px]'
  const grave = info.prioridade === 'emergencia'
  return (
    <span className={cn('flex shrink-0 items-center justify-center', grave ? 'bg-crit-soft text-crit' : 'bg-surface-2 text-ink-2', t, className)}>
      <Icone />
    </span>
  )
}

/** Erro de carga com "tentar de novo" — nunca uma tela branca. */
export function ErroCarga({ erro, aoTentar, className }: { erro: unknown; aoTentar?: () => void; className?: string }) {
  const msg = (erro as Error)?.message || 'Não foi possível carregar agora.'
  return (
    <div role="alert" className={cn('flex flex-col gap-3 rounded-[1.25rem] border border-crit/25 bg-crit-soft px-4 py-3.5 text-crit-ink', className)}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-[18px] shrink-0" />
        <p className="min-w-0 flex-1 text-[14px] leading-snug">{msg}</p>
      </div>
      {aoTentar && (
        <button
          type="button"
          onClick={aoTentar}
          className="flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-line-strong bg-surface px-4 text-[14px] font-semibold text-ink active:scale-[0.98]"
        >
          <RefreshCw className="size-4" /> Tentar de novo
        </button>
      )}
    </div>
  )
}

/** Grupo de opções em pílula (tema, período, tipo) — alvos grandes, um toque. */
export function Escolha<T extends string>({
  opcoes,
  valor,
  aoMudar,
  rotulo,
  colunas,
}: {
  opcoes: Array<{ valor: T; rotulo: string; icone?: ComponentType<{ className?: string }> }>
  valor: T | null
  aoMudar: (v: T) => void
  rotulo?: string
  colunas?: 2 | 3 | 4
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {rotulo && <span className="text-[13.5px] font-semibold text-ink-2">{rotulo}</span>}
      <div
        role="radiogroup"
        aria-label={rotulo}
        className={cn('grid gap-2', colunas === 2 ? 'grid-cols-2' : colunas === 4 ? 'grid-cols-2 min-[400px]:grid-cols-4' : 'grid-cols-3')}
      >
        {opcoes.map((o) => {
          const Icone = o.icone
          const ativo = valor === o.valor
          return (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => aoMudar(o.valor)}
              className={cn(
                'flex min-h-12 items-center justify-center gap-2 rounded-xl border px-2 text-[14px] font-semibold transition-colors active:scale-[0.98]',
                ativo ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong bg-surface text-ink-2',
              )}
            >
              {Icone && <Icone className="size-4 shrink-0" />}
              <span className="truncate">{o.rotulo}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Controle segmentado (abas curtas no topo de uma lista). */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  aoMudar,
  rotulo,
  className,
}: {
  opcoes: Array<{ valor: T; rotulo: string; contador?: number }>
  valor: T
  aoMudar: (v: T) => void
  rotulo: string
  className?: string
}) {
  return (
    <div role="tablist" aria-label={rotulo} className={cn('flex gap-1 rounded-2xl border border-line bg-surface-2 p-1', className)}>
      {opcoes.map((o) => {
        const ativo = o.valor === valor
        return (
          <button
            key={o.valor}
            type="button"
            role="tab"
            aria-selected={ativo}
            onClick={() => aoMudar(o.valor)}
            className={cn(
              'flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 text-[13.5px] font-semibold transition-colors',
              ativo ? 'bg-surface text-ink shadow-[0_1px_3px_rgb(11_28_51/0.12)]' : 'text-ink-3 hover:text-ink-2',
            )}
          >
            <span className="truncate">{o.rotulo}</span>
            {o.contador != null && o.contador > 0 && <span className="num text-[11.5px] text-ink-3">{o.contador}</span>}
          </button>
        )
      })}
    </div>
  )
}

/** Rótulo pequeno acima de um valor (cartões de veículo, resumos). */
export function Rotulo({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-[12px] font-medium text-ink-3', className)}>{children}</p>
}

/**
 * Linha de lista tocável: ícone, título, detalhe e seta. É a peça de quase
 * todas as listas do cliente — nada de tabela.
 */
export function LinhaLista({
  icone: Icone,
  tomIcone = 'neutro',
  titulo,
  detalhe,
  direita,
  para,
  onClick,
  href,
  className,
}: {
  icone?: ComponentType<{ className?: string }>
  tomIcone?: 'neutro' | 'marca' | 'sos' | 'ok' | 'info' | 'atencao'
  titulo: ReactNode
  detalhe?: ReactNode
  direita?: ReactNode
  para?: string
  onClick?: () => void
  href?: string | null
  className?: string
}) {
  const conteudo = (
    <>
      {Icone && (
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            tomIcone === 'neutro' && 'bg-surface-2 text-ink-2',
            tomIcone === 'marca' && 'bg-accent-soft text-accent-ink',
            tomIcone === 'sos' && 'bg-crit-soft text-crit',
            tomIcone === 'ok' && 'bg-ok-soft text-ok-ink',
            tomIcone === 'info' && 'bg-cyan-soft text-cyan-ink',
            tomIcone === 'atencao' && 'bg-warn-soft text-warn-ink',
          )}
        >
          <Icone className="size-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug font-semibold text-ink">{titulo}</span>
        {detalhe && <span className="mt-0.5 block text-[13px] leading-snug text-ink-3">{detalhe}</span>}
      </span>
      {direita}
      {(para || onClick || href) && <ChevronRight className="size-5 shrink-0 text-ink-3" />}
    </>
  )
  const cls = cn('flex min-h-[3.75rem] w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-surface-2', className)
  if (para)
    return (
      <Link to={para} className={cls}>
        {conteudo}
      </Link>
    )
  if (href)
    return (
      <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={cls}>
        {conteudo}
      </a>
    )
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {conteudo}
      </button>
    )
  return <div className={cls}>{conteudo}</div>
}

/** Grupo de linhas num cartão branco, com divisórias finas. */
export function GrupoLista({ children, className, rotulo }: { children: ReactNode; className?: string; rotulo?: string }) {
  return (
    <div role={rotulo ? 'group' : undefined} aria-label={rotulo} className={cn('flex flex-col divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-surface', className)}>
      {children}
    </div>
  )
}
