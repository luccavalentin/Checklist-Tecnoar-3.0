import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from './Estados'
import { BotaoIcone } from './Botao'

export type EstadoLista = 'carregando' | 'ok' | 'vazio' | 'erro' | 'sem-permissao'

export interface Coluna<T> {
  chave: string
  cabecalho: string
  largura?: string
  alinhamento?: 'esquerda' | 'centro' | 'direita'
  /** Classe utilitária para esconder a coluna em telas menores. Ex.: 'hidden md:table-cell'. */
  classeResponsiva?: string
  celula: (linha: T) => ReactNode
}

export interface TabelaProps<T> {
  colunas: Array<Coluna<T>>
  linhas: T[]
  chaveDe: (linha: T) => string
  estado?: EstadoLista
  densidade?: 'confortavel' | 'compacta'
  aoClicarLinha?: (linha: T) => void
  /**
   * Duplo clique na linha.
   *
   * Atalho de quem passa o dia na tabela: abre a edição sem mirar no botão.
   * O botão "Editar" continua existindo — o duplo clique é adicional, não
   * substituto, porque ninguém descobre um gesto invisível sozinho.
   */
  aoDuploClique?: (linha: T) => void
  selecionadas?: Set<string>
  aoSelecionar?: (chaves: Set<string>) => void
  mensagemVazio?: { titulo?: string; descricao?: ReactNode; acao?: ReactNode }
  mensagemErro?: { descricao?: ReactNode; aoTentarNovamente?: () => void }
  className?: string
}

const ALINHAMENTO = {
  esquerda: 'text-left',
  centro: 'text-center',
  direita: 'text-right',
} as const

export function Tabela<T>({
  colunas,
  linhas,
  chaveDe,
  estado = 'ok',
  densidade = 'confortavel',
  aoClicarLinha,
  aoDuploClique,
  selecionadas,
  aoSelecionar,
  mensagemVazio,
  mensagemErro,
  className,
}: TabelaProps<T>) {
  const selecionavel = Boolean(selecionadas && aoSelecionar)
  const alturaLinha = densidade === 'compacta' ? 'h-9' : 'h-12'

  if (estado !== 'ok') {
    return (
      <div className={cn('rounded-lg border border-line bg-surface p-6', className)}>
        {estado === 'carregando' && <EstadoCarregando />}
        {estado === 'vazio' && (
          <EstadoVazio
            titulo={mensagemVazio?.titulo}
            descricao={mensagemVazio?.descricao}
            acao={mensagemVazio?.acao}
            className="border-0"
          />
        )}
        {estado === 'erro' && (
          <EstadoErro
            descricao={mensagemErro?.descricao}
            aoTentarNovamente={mensagemErro?.aoTentarNovamente}
            className="border-0"
          />
        )}
        {estado === 'sem-permissao' && <EstadoSemPermissao className="border-0" />}
      </div>
    )
  }

  const todasSelecionadas = selecionavel && linhas.length > 0 && linhas.every((l) => selecionadas!.has(chaveDe(l)))

  function alternarTodas() {
    if (!aoSelecionar) return
    aoSelecionar(todasSelecionadas ? new Set() : new Set(linhas.map(chaveDe)))
  }

  function alternarUma(chave: string) {
    if (!aoSelecionar || !selecionadas) return
    const proxima = new Set(selecionadas)
    if (proxima.has(chave)) proxima.delete(chave)
    else proxima.add(chave)
    aoSelecionar(proxima)
  }

  return (
    <div className={cn('aresta relative max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg border border-line bg-surface shadow-e1', className)}>
      <div className="flex flex-col divide-y divide-line lg:hidden">
        {linhas.map((linha) => {
          const chave = chaveDe(linha)
          const marcada = selecionadas?.has(chave) ?? false
          const visiveisMobile = colunas.filter((c) => c.cabecalho || c.chave === 'acoes')
          const principal =
            visiveisMobile.find((c) => ['nome', 'descricao', 'cliente', 'veiculo'].includes(c.chave)) ??
            visiveisMobile[0]
          const demais = visiveisMobile.filter((c) => c !== principal)
          return (
            <article
              key={chave}
              onClick={aoClicarLinha ? () => aoClicarLinha(linha) : undefined}
              onDoubleClick={
                aoDuploClique
                  ? () => {
                      window.getSelection?.()?.removeAllRanges()
                      aoDuploClique(linha)
                    }
                  : undefined
              }
              className={cn(
                'flex flex-col gap-3 p-3.5',
                (aoClicarLinha || aoDuploClique) && 'cursor-pointer',
                marcada ? 'bg-accent-soft/60' : 'hover:bg-cyan-soft/30',
              )}
            >
              <div className="flex min-w-0 items-start gap-3">
                {selecionavel && (
                  <input
                    type="checkbox"
                    aria-label={`Selecionar registro ${chave}`}
                    checked={marcada}
                    onChange={() => alternarUma(chave)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1 size-[15px] cursor-pointer accent-[var(--c-accent)]"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <span className="lbl">{principal?.cabecalho}</span>
                  <div className="mt-1 min-w-0 text-[13.5px] text-ink">{principal?.celula(linha)}</div>
                </div>
              </div>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {demais
                  .filter((c) => c.chave !== 'acoes')
                  .map((c) => (
                    <div key={c.chave} className="min-w-0">
                      <dt className="lbl">{c.cabecalho}</dt>
                      <dd className="mt-1 min-w-0 text-[13px] text-ink-2">{c.celula(linha)}</dd>
                    </div>
                  ))}
              </dl>
              {demais.some((c) => c.chave === 'acoes') && (
                <div className="flex flex-wrap justify-end gap-1.5">
                  {demais.find((c) => c.chave === 'acoes')?.celula(linha)}
                </div>
              )}
            </article>
          )
        })}
      </div>

      <table className="hidden w-full min-w-max table-fixed border-collapse lg:table">
        <thead>
          <tr>
            {selecionavel && (
              <th scope="col" className="sticky top-0 z-10 w-11 border-b border-line-strong bg-surface-2 px-3">
                <input
                  type="checkbox"
                  aria-label="Selecionar todos os registros desta página"
                  checked={todasSelecionadas}
                  onChange={alternarTodas}
                  className="size-[15px] cursor-pointer accent-[var(--c-accent)]"
                />
              </th>
            )}
            {colunas.map((c) => (
              <th
                key={c.chave}
                scope="col"
                style={c.largura ? { width: c.largura } : undefined}
                className={cn(
                  'lbl sticky top-0 z-10 h-9 border-b border-line-strong bg-surface px-3.5 whitespace-nowrap',
                  c.chave === 'acoes' ? 'overflow-visible px-2' : 'overflow-hidden text-ellipsis',
                  // Sombra fina: ao rolar, o cabeçalho se descola das linhas.
                  'shadow-[0_1px_0_var(--c-line-strong)]',
                  c.chave === 'acoes' && 'right-0 bg-surface shadow-[-1px_0_0_var(--c-line)]',
                  ALINHAMENTO[c.alinhamento ?? 'esquerda'],
                  c.classeResponsiva,
                )}
              >
                {c.cabecalho}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const chave = chaveDe(linha)
            const marcada = selecionadas?.has(chave) ?? false
            return (
              <tr
                key={chave}
                onClick={aoClicarLinha ? () => aoClicarLinha(linha) : undefined}
                onDoubleClick={
                  aoDuploClique
                    ? () => {
                        /* Some com a seleção que o duplo clique deixa na célula. */
                        window.getSelection?.()?.removeAllRanges()
                        aoDuploClique(linha)
                      }
                    : undefined
                }
                className={cn(
                  'border-b border-line transition-colors last:border-b-0',
                  (aoClicarLinha || aoDuploClique) && 'cursor-pointer',
                  marcada ? 'bg-accent-soft/60' : 'hover:bg-cyan-soft/35',
                )}
              >
                {selecionavel && (
                  <td className={cn('px-3', alturaLinha)} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Selecionar registro ${chave}`}
                      checked={marcada}
                      onChange={() => alternarUma(chave)}
                      className="size-[15px] cursor-pointer accent-[var(--c-accent)]"
                    />
                  </td>
                )}
                {colunas.map((c) => (
                  <td
                    key={c.chave}
                    className={cn(
                      c.chave === 'acoes'
                        ? 'overflow-visible px-2 whitespace-nowrap'
                        : 'overflow-hidden px-3.5 text-ellipsis',
                      'text-[13.5px] text-ink-2',
                      alturaLinha,
                      c.chave === 'acoes' && 'sticky right-0 z-[1] bg-surface shadow-[-1px_0_0_var(--c-line)]',
                      ALINHAMENTO[c.alinhamento ?? 'esquerda'],
                      c.classeResponsiva,
                    )}
                  >
                    {c.celula(linha)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------ Paginação */

export function Paginacao({
  pagina,
  porPagina,
  total,
  selecionadas = 0,
  aoMudarPagina,
  className,
}: {
  pagina: number
  porPagina: number
  total: number | null
  selecionadas?: number
  aoMudarPagina: (p: number) => void
  className?: string
}) {
  const inicio = total === 0 ? 0 : (pagina - 1) * porPagina + 1
  const fim = total === null ? pagina * porPagina : Math.min(pagina * porPagina, total)
  const ultimaPagina = total === null ? pagina + 1 : Math.max(1, Math.ceil(total / porPagina))

  const paginas: Array<number | '…'> = []
  if (total !== null) {
    const set = new Set<number>([1, ultimaPagina, pagina - 1, pagina, pagina + 1])
    const ordenadas = [...set].filter((p) => p >= 1 && p <= ultimaPagina).sort((a, b) => a - b)
    ordenadas.forEach((p, i) => {
      if (i > 0 && p - (ordenadas[i - 1] as number) > 1) paginas.push('…')
      paginas.push(p)
    })
  }

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3.5 py-2.5',
        className,
      )}
    >
      <div className="flex items-center gap-3.5">
        <span className="num text-xs text-ink-3">
          {total === null
            ? `Página ${pagina}`
            : total === 0
              ? 'Nenhum registro'
              : `${inicio}–${fim} de ${total.toLocaleString('pt-BR')}`}
        </span>
        {selecionadas > 0 && (
          <>
            <span aria-hidden className="h-4 w-px bg-line" />
            <span className="text-xs text-ink-3">
              {selecionadas.toLocaleString('pt-BR')} selecionado{selecionadas > 1 ? 's' : ''}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
        <BotaoIcone
          rotulo="Página anterior"
          tamanho="sm"
          variante="neutro"
          disabled={pagina <= 1}
          onClick={() => aoMudarPagina(pagina - 1)}
        >
          <ChevronLeft />
        </BotaoIcone>

        {paginas.map((p, i) =>
          p === '…' ? (
            <span key={`sep-${i}`} className="num px-1 text-xs text-ink-3">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-current={p === pagina ? 'page' : undefined}
              onClick={() => aoMudarPagina(p)}
              className={cn(
                /* 36px de altura: continua denso no desktop e alcançável de luva no celular. */
                'num min-h-9 min-w-9 rounded-md px-2 text-xs transition-colors',
                p === pagina ? 'bg-surface-2 font-medium text-ink' : 'text-ink-3 hover:text-ink',
              )}
            >
              {p}
            </button>
          ),
        )}

        <BotaoIcone
          rotulo="Próxima página"
          tamanho="sm"
          variante="neutro"
          disabled={total !== null && pagina >= ultimaPagina}
          onClick={() => aoMudarPagina(pagina + 1)}
        >
          <ChevronRight />
        </BotaoIcone>
      </div>
    </div>
  )
}
