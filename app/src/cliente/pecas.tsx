import type { ComponentType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ChevronRight, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Arte } from '../comum/Arte'
import { PECA_OCORRENCIA } from '../comum/kit3d'
import { OCORRENCIAS, formatarPlacaExibicao } from '@/sos/rotulos'
import type { OcorrenciaSOS } from '@/sos/tipos'

/**
 * Peças visuais só do app do cliente. As genéricas (botão, folha, campo)
 * continuam em `comum/ui.tsx`; aqui fica o que tem cara de "meu veículo".
 */

/**
 * A placa.
 *
 * Era um desenho da placa Mercosul inteira, com a tarja azul e a palavra
 * BRASIL. Parecia simpático e fazia um estrago: decoração se passando por
 * dado. Num cartão já cheio de informação, aquela tarja azul roubava o olho
 * de tudo — e o que importa ali é a SEQUÊNCIA, não a bandeira. Pior: dois
 * centímetros de azul-bandeira dentro de uma marca navy-e-laranja brigavam
 * com a identidade em toda tela onde a placa aparecia, que é quase todas.
 *
 * Agora a placa é o que ela é: um identificador. Fica na mesma pastilha de
 * aço do resto do app, com o número em tipo monoespaçado de largura fixa —
 * que é o que deixa 0 e O, 1 e I distinguíveis à primeira olhada. A forma e
 * o espaçamento das letras já dizem "placa" sem precisar desenhar o país.
 */
export function PlacaVeiculo({ placa, tamanho = 'md', className }: { placa: string | null | undefined; tamanho?: 'sm' | 'md' | 'lg'; className?: string }) {
  const t =
    tamanho === 'lg'
      ? 'text-[18px] px-2.5 py-1 tracking-[0.14em]'
      : tamanho === 'sm'
        ? 'text-[11.5px] px-1.5 py-0.5 tracking-[0.1em]'
        : 'text-[14px] px-2 py-0.5 tracking-[0.12em]'
  return (
    <span
      className={cn('sos-placa num inline-flex shrink-0 items-center font-bold leading-none', t, className)}
      aria-label={`Placa ${formatarPlacaExibicao(placa)}`}
    >
      <span className="sos-placa-texto">{formatarPlacaExibicao(placa)}</span>
    </span>
  )
}

/**
 * O que quebrou no caminhão.
 *
 * Tenta a peça 3D (`/sos/ocorrencias/freios.png` e irmãs) e cai no ícone de
 * linha enquanto ela não existe. Quando a arte está lá, a pastilha de fundo
 * sai junto: o render já tem volume e sombra próprios, e empilhar os dois
 * daria duas fontes de luz no mesmo objeto — que é exatamente o que faz uma
 * composição parecer colada.
 */
export function IconeOcorrencia({ tipo, tamanho = 'md', className }: { tipo: OcorrenciaSOS; tamanho?: 'sm' | 'md' | 'lg'; className?: string }) {
  const info = OCORRENCIAS[tipo] ?? OCORRENCIAS.outro
  const Icone = info.icone
  const t = tamanho === 'lg' ? 'size-14 rounded-2xl [&>svg]:size-7' : tamanho === 'sm' ? 'size-9 rounded-xl [&>svg]:size-[18px]' : 'size-11 rounded-2xl [&>svg]:size-[22px]'
  const grave = info.prioridade === 'emergencia'
  const pastilha = (
    <span className={cn('flex shrink-0 items-center justify-center shadow-[0_10px_24px_-20px_rgb(8_24_48/0.5)]', grave ? 'bg-crit-soft text-crit' : 'bg-surface-2 text-ink-2', t, className)}>
      <Icone />
    </span>
  )
  const medida = tamanho === 'lg' ? 'size-14' : tamanho === 'sm' ? 'size-9' : 'size-11'
  return (
    <Arte
      src={PECA_OCORRENCIA[tipo] ?? `/sos/ocorrencias/${tipo}.png`}
      alt=""
      recuo={pastilha}
      classeImagem={cn('shrink-0', medida, className)}
    />
  )
}

/** Erro de carga com "tentar de novo" — nunca uma tela branca. */
export function ErroCarga({ erro, aoTentar, className }: { erro: unknown; aoTentar?: () => void; className?: string }) {
  const msg = (erro as Error)?.message || 'Não foi possível carregar agora.'
  return (
    <div role="alert" className={cn('flex flex-col gap-3 rounded-[1.35rem] border border-crit/25 bg-crit-soft px-4 py-3.5 text-crit-ink shadow-[0_14px_34px_-28px_rgb(255_102_0/0.45)]', className)}>
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 size-[18px] shrink-0" />
        <p className="min-w-0 flex-1 text-[14px] leading-snug">{msg}</p>
      </div>
      {aoTentar && (
        <button
          type="button"
          onClick={aoTentar}
          className="sos-soft-action flex min-h-11 items-center justify-center gap-2 self-start rounded-[1rem] px-4 text-[14px] font-semibold text-ink active:scale-[0.98]"
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
  opcoes: Array<{ valor: T; rotulo: string; icone?: ComponentType<{ className?: string }>; peca?: string }>
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
                'flex min-h-12 items-center justify-center gap-2 rounded-[1rem] border px-2 text-[14px] font-semibold transition-[transform,border-color,background-color,box-shadow] active:scale-[0.98]',
                o.peca && 'min-h-[4.5rem] flex-col gap-1 py-2',
                ativo ? 'border-accent bg-accent-soft text-accent-ink shadow-[0_10px_24px_-20px_rgb(255_102_0/0.55)]' : 'border-line-strong bg-surface text-ink-2',
              )}
            >
              {o.peca ? <Arte src={o.peca} alt="" recuo={Icone ? <Icone className="size-4 shrink-0" /> : null} classeImagem="size-9 shrink-0 object-contain" /> : Icone && <Icone className="size-4 shrink-0" />}
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
    <div role="tablist" aria-label={rotulo} className={cn('sos-soft-action flex gap-1 rounded-[1.35rem] p-1', className)}>
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
              'flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[1rem] px-2 text-[13.5px] font-semibold transition-colors',
              ativo ? 'bg-surface text-ink shadow-[0_10px_24px_-22px_rgb(8_24_48/0.32)]' : 'text-ink-3 hover:text-ink-2',
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
  peca,
}: {
  icone?: ComponentType<{ className?: string }>
  peca?: string
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
            'flex size-10 shrink-0 items-center justify-center rounded-[1rem] shadow-[0_10px_24px_-20px_rgb(8_24_48/0.42)]',
            tomIcone === 'neutro' && 'bg-surface-2 text-ink-2',
            tomIcone === 'marca' && 'bg-accent-soft text-accent-ink',
            tomIcone === 'sos' && 'bg-crit-soft text-crit',
            tomIcone === 'ok' && 'bg-ok-soft text-ok-ink',
            tomIcone === 'info' && 'bg-cyan-soft text-cyan-ink',
            tomIcone === 'atencao' && 'bg-warn-soft text-warn-ink',
          )}
        >
          {peca ? <Arte src={peca} alt="" recuo={<Icone className="size-5" />} classeImagem="conta-lista-peca" /> : <Icone className="size-5" />}
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
    <div role={rotulo ? 'group' : undefined} aria-label={rotulo} className={cn('sos-native-card flex flex-col divide-y divide-line overflow-hidden rounded-[1.55rem]', className)}>
      {children}
    </div>
  )
}
