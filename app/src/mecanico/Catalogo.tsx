import { useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Brain, Headset, Info, Loader2, Minus, Package, Plus, RefreshCw, Search, Trash2, Wrench, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { sosAdicionarItem, sosAlterarItem, sosCatalogo, sosRemoverItem } from '@/sos/api'
import { AVISO_SEM_ESTOQUE, faltouEstoque, quantidadeBR, textoDisponivel, textoEstoqueEm, tomDisponivel } from '@/sos/estoque'
import { linkTelefone } from '@/sos/rotulos'
import type { DetalheChamado, ItemCatalogo, ItemSOS } from '@/sos/tipos'
import { useInfoCentral, useOnline } from './dados'
import { CHAVES_OS, invalidarDepoisDeLancar } from './os/dados'
import { BotaoM, EsqueletoM, RotuloM, SeloM } from './ui'

export type TipoCatalogo = 'produto' | 'servico'

const POR_PAGINA = 30

const TEXTO: Record<TipoCatalogo, { busca: string; nome: string; plural: string }> = {
  produto: { busca: 'Buscar peça ou código', nome: 'produto', plural: 'Produtos' },
  servico: { busca: 'Buscar serviço ou código', nome: 'serviço', plural: 'Serviços' },
}

/** O mesmo texto de ajuda onde a peça é lançada no chamado. */
export const AJUDA_RESERVA = 'No chamado a peça fica reservada até a OS ser efetivada.'

/**
 * Produtos e serviços do cadastro do sistema Tecnoar (o mesmo do Checklist,
 * com o estoque sincronizado com a Omie). O mecânico não cadastra nada: abre
 * a lista, filtra se quiser e lança. O número de estoque é o DISPONÍVEL —
 * o que ainda não está comprometido em OS aberta ou em chamado.
 *
 * Três jeitos de usar:
 * - `chamado` + `podeAdicionar`: dentro do atendimento, "+ ADICIONAR" lança
 *   direto no chamado (e na OS dele, quando já existe);
 * - `aoEscolher`: o toque no item abre a folha "Lançar", que decide o destino
 *   (chamado em atendimento ou uma OS aberta);
 * - sem nenhum dos dois: consulta de preço e estoque.
 */
export function Catalogo({
  tipo,
  chamado,
  podeAdicionar,
  aoEscolher,
  lancados,
  avisoConsulta = 'Consulta de preço e estoque. Para lançar, abra o atendimento quando estiver no local.',
}: {
  tipo: TipoCatalogo
  chamado?: DetalheChamado | null
  podeAdicionar: boolean
  aoEscolher?: (item: ItemCatalogo) => void
  /** Quantidade já lançada no destino, por id do cadastro (selo "Na OS · 2"). */
  lancados?: Map<string, number>
  /** Texto do modo consulta (sem destino para lançar); vazio esconde. */
  avisoConsulta?: string
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const online = useOnline()
  const central = useInfoCentral()
  const t = TEXTO[tipo]
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [emVoo, setEmVoo] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = window.setTimeout(() => setTermo(busca.trim()), 300)
    return () => window.clearTimeout(id)
  }, [busca])

  // Sem termo, lista o cadastro inteiro em páginas ("carregar mais").
  const catalogo = useInfiniteQuery({
    queryKey: [...CHAVES_OS.catalogo, 'paginas', tipo, termo],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => sosCatalogo(termo, tipo, pageParam, POR_PAGINA),
    getNextPageParam: (ultima, todas) => (ultima.length < POR_PAGINA ? undefined : todas.length),
    staleTime: 30_000,
  })

  const resultados = useMemo(() => {
    const vistos = new Set<string>()
    const lista: ItemCatalogo[] = []
    for (const pagina of catalogo.data?.pages ?? []) {
      for (const i of pagina) {
        const chave = `${i.tipo}-${i.id}`
        if (vistos.has(chave)) continue
        vistos.add(chave)
        lista.push(i)
      }
    }
    return lista
  }, [catalogo.data])

  const itens = useMemo(() => (chamado?.itens ?? []).filter((i) => i.tipo === tipo), [chamado?.itens, tipo])
  const porRef = useMemo(() => {
    const m = new Map<string, ItemSOS>()
    for (const i of itens) {
      const ref = i.produto_id ?? i.servico_id
      if (ref && i.origem !== 'deslocamento') m.set(ref, i)
    }
    return m
  }, [itens])
  const subtotal = itens.reduce((s, i) => s + Number(i.valor_total ?? 0), 0)

  const invalidar = () => chamado && invalidarDepoisDeLancar(qc, { chamadoId: chamado.chamado.id, osId: chamado.os?.id ?? null })
  const adicionar = useMutation({
    mutationFn: (i: ItemCatalogo) => sosAdicionarItem(chamado?.chamado.id ?? '', i.tipo, i.id, 1),
    onMutate: (i) => setEmVoo(i.id),
    onSuccess: (r, i) => {
      if (faltouEstoque(r)) toast.atencao(AVISO_SEM_ESTOQUE.titulo, `${AVISO_SEM_ESTOQUE.texto} ${i.descricao}`)
      else toast.ok('Adicionado', i.descricao)
      invalidar()
    },
    onError: (e) => toast.erro('Não foi possível adicionar', (e as Error).message),
    onSettled: () => setEmVoo(null),
  })
  const alterar = useMutation({
    mutationFn: (p: { id: string; quantidade: number }) => sosAlterarItem(p.id, p.quantidade),
    onMutate: (p) => setEmVoo(p.id),
    onSuccess: invalidar,
    onError: (e) => toast.erro('Não foi possível alterar', (e as Error).message),
    onSettled: () => setEmVoo(null),
  })
  const remover = useMutation({
    mutationFn: (id: string) => sosRemoverItem(id),
    onMutate: (id) => setEmVoo(id),
    onSuccess: invalidar,
    onError: (e) => toast.erro('Não foi possível remover', (e as Error).message),
    onSettled: () => setEmVoo(null),
  })
  const ocupado = adicionar.isPending || alterar.isPending || remover.isPending
  const editavel = !aoEscolher && podeAdicionar && !!chamado && online

  // Sugestões da Tecno IA (kit do chamado) viram atalhos de busca.
  const sugestoes = tipo === 'produto' ? (chamado?.chamado.ia_kit?.pecas ?? []).map((p) => p.termo).filter(Boolean).slice(0, 6) : []
  const carregandoPrimeira = catalogo.isPending && catalogo.fetchStatus === 'fetching'
  const buscando = catalogo.isFetching && !catalogo.isFetchingNextPage

  return (
    <div className="flex flex-col gap-4">
      {/* busca */}
      <label className="flex min-h-14 items-center gap-2.5 rounded-2xl border-2 border-line bg-inset px-3.5 focus-within:border-accent">
        <Search className="size-5 shrink-0 text-ink-3" />
        <input
          ref={campo}
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={t.busca}
          aria-label={t.busca}
          enterKeyHint="search"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-3 text-[16px] text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden"
        />
        {buscando ? (
          <Loader2 className="size-5 shrink-0 animate-spin text-ink-3" />
        ) : busca ? (
          <button
            type="button"
            aria-label="Limpar busca"
            onClick={() => {
              setBusca('')
              campo.current?.focus()
            }}
            className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3 active:bg-surface-2"
          >
            <X className="size-5" />
          </button>
        ) : null}
      </label>

      {!online && <p className="rounded-2xl bg-warn-soft px-3.5 py-2.5 text-[13.5px] font-medium text-warn-ink">Sem internet: o cadastro precisa de sinal.</p>}
      {editavel && tipo === 'produto' && (
        <p className="flex items-start gap-2 px-1 text-[13px] leading-snug text-ink-3">
          <Info className="mt-0.5 size-4 shrink-0" /> {AJUDA_RESERVA}
        </p>
      )}
      {!aoEscolher && !podeAdicionar && !!avisoConsulta && (
        <p className="rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[13.5px] leading-snug text-ink-2">
          {avisoConsulta}
        </p>
      )}

      {!termo && sugestoes.length > 0 && (
        <div className="flex flex-col gap-2">
          <RotuloM className="flex items-center gap-1.5 px-1">
            <Brain className="size-3.5 text-cyan-ink" /> Sugestões da Tecno IA para este chamado
          </RotuloM>
          <div className="flex flex-wrap gap-2">
            {sugestoes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setBusca(s)}
                className="min-h-11 rounded-full border border-line bg-surface px-4 text-[14px] font-semibold text-ink first-letter:uppercase active:bg-surface-2"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* resultados */}
      <section className="flex flex-col gap-2" aria-live="polite" aria-busy={buscando || undefined}>
        {catalogo.isError && !resultados.length ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.25rem] border border-line bg-surface px-4 py-6 text-center">
            <AlertTriangle className="size-7 text-crit" />
            <p className="max-w-xs text-[14px] leading-snug text-ink-2">{(catalogo.error as Error).message}</p>
            <BotaoM variante="escuro" tamanho="md" icone={RefreshCw} carregando={catalogo.isFetching} onClick={() => void catalogo.refetch()}>
              Tentar de novo
            </BotaoM>
          </div>
        ) : carregandoPrimeira ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((n) => (
              <EsqueletoM key={n} className="h-[5.5rem] rounded-[1.25rem]" />
            ))}
          </div>
        ) : catalogo.isPending ? null : resultados.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-[1.25rem] border border-dashed border-line-strong px-4 py-5 text-center">
            <p className="text-[15px] font-semibold text-ink">{termo ? `Nada encontrado para “${termo}”.` : `Nenhum ${t.nome} ativo no cadastro.`}</p>
            <p className="text-[13.5px] leading-snug text-ink-2">
              O app só usa o que está no cadastro da Tecnoar. Se o {t.nome} não existe lá, peça à central para cadastrar.
            </p>
            {central.data?.telefone && (
              <a
                href={linkTelefone(central.data.telefone) ?? undefined}
                className="mx-auto flex min-h-12 items-center gap-2 rounded-2xl border border-line bg-surface-2 px-4 text-[14px] font-bold text-ink"
              >
                <Headset className="size-4" /> Falar com a central
              </a>
            )}
          </div>
        ) : (
          <>
            <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-surface">
              {resultados.map((i) => (
                <LinhaCatalogo
                  key={`${i.tipo}-${i.id}`}
                  item={i}
                  noAtendimento={porRef.get(i.id) ?? null}
                  jaLancado={lancados?.get(i.id) ?? null}
                  editavel={editavel}
                  carregando={emVoo === i.id || emVoo === porRef.get(i.id)?.id}
                  ocupado={ocupado}
                  aoEscolher={aoEscolher && online ? () => aoEscolher(i) : undefined}
                  aoAdicionar={() => adicionar.mutate(i)}
                  aoAlterar={(item, q) => (q <= 0 ? remover.mutate(item.id) : alterar.mutate({ id: item.id, quantidade: q }))}
                />
              ))}
            </ul>
            {catalogo.hasNextPage && (
              <BotaoM variante="neutro" largo carregando={catalogo.isFetchingNextPage} onClick={() => void catalogo.fetchNextPage()}>
                Carregar mais
              </BotaoM>
            )}
            {catalogo.isError && <p className="px-1 text-[13px] font-semibold text-crit-ink">{(catalogo.error as Error).message}</p>}
          </>
        )}
      </section>

      {/* o que já está no atendimento */}
      {chamado && !aoEscolher && itens.length > 0 && (
        <section className="flex flex-col gap-2">
          <div className="flex items-end justify-between px-1">
            <RotuloM>{t.plural} neste atendimento</RotuloM>
            <span className="num text-[15px] font-bold text-ink">{moeda(subtotal)}</span>
          </div>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-surface">
            {itens.map((i) => (
              <LinhaLancada
                key={i.id}
                item={i}
                editavel={editavel && i.origem !== 'deslocamento'}
                carregando={emVoo === i.id}
                ocupado={ocupado}
                aoAlterar={(q) => alterar.mutate({ id: i.id, quantidade: q })}
                aoRemover={() => remover.mutate(i.id)}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/** Cor do "Disponível N": verde, âmbar (pouco) ou vermelho (sem). */
export function classeDisponivel(disponivel: number | null | undefined): string {
  const tom = tomDisponivel(disponivel)
  return tom === 'sem' ? 'text-crit-ink' : tom === 'baixo' ? 'text-warn-ink' : tom === 'ok' ? 'text-ok-ink' : 'text-ink-3'
}

/** Resultado da lista: nome, código, preço, disponível e a ação. */
function LinhaCatalogo({
  item: i,
  noAtendimento,
  jaLancado,
  editavel,
  carregando,
  ocupado,
  aoEscolher,
  aoAdicionar,
  aoAlterar,
}: {
  item: ItemCatalogo
  noAtendimento: ItemSOS | null
  jaLancado: number | null
  editavel: boolean
  carregando: boolean
  ocupado: boolean
  aoEscolher?: () => void
  aoAdicionar: () => void
  aoAlterar: (item: ItemSOS, quantidade: number) => void
}) {
  const produto = i.tipo === 'produto'
  const disponivel = i.disponivel != null ? Number(i.disponivel) : null
  const estoque = produto ? textoDisponivel(disponivel, i.unidade) : null
  const estoqueEm = produto ? textoEstoqueEm(i.estoque_em) : null

  const corpo = (
    <>
      <div className="flex items-start gap-3">
        <span className={cn('mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl', produto ? 'bg-accent-soft text-accent-ink' : 'bg-cyan-soft text-cyan-ink')}>
          {produto ? <Package className="size-5" /> : <Wrench className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[16px] leading-snug font-bold text-ink">{i.descricao}</p>
          <p className="num mt-0.5 truncate text-[12.5px] text-ink-3">Código: {i.codigo ?? '—'}</p>
          {jaLancado != null && (
            <SeloM tom="ciano" className="mt-1.5">
              Na OS · {quantidadeBR(jaLancado)}
            </SeloM>
          )}
        </div>
      </div>
      <div className="flex items-end justify-between gap-3 pl-[3.25rem]">
        <div className="min-w-0">
          <p className="num text-[19px] leading-none font-semibold text-ink">{i.preco != null ? moeda(Number(i.preco)) : 'sem preço'}</p>
          {estoque && <p className={cn('num mt-1.5 text-[13.5px] font-bold', classeDisponivel(disponivel))}>{estoque}</p>}
          {estoqueEm && <p className="num mt-0.5 text-[11.5px] whitespace-nowrap text-ink-3">{estoqueEm}</p>}
        </div>
        {aoEscolher ? (
          <span aria-hidden className="flex min-h-11 shrink-0 items-center gap-1 rounded-2xl bg-accent px-3.5 font-display text-[14px] font-extrabold tracking-[0.02em] text-white uppercase">
            <Plus className="size-4" strokeWidth={3} />
            Lançar
          </span>
        ) : (
          editavel &&
          (noAtendimento ? (
            <Contador quantidade={Number(noAtendimento.quantidade)} carregando={carregando} ocupado={ocupado} aoMudar={(q) => aoAlterar(noAtendimento, q)} />
          ) : (
            <button
              type="button"
              onClick={aoAdicionar}
              disabled={ocupado}
              className="flex min-h-12 shrink-0 items-center gap-1 rounded-2xl bg-accent px-3.5 font-display text-[14px] font-extrabold tracking-[0.02em] text-white uppercase active:bg-accent-hover disabled:opacity-50"
            >
              {carregando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" strokeWidth={3} />}
              Adicionar
            </button>
          ))
        )}
      </div>
    </>
  )

  if (aoEscolher)
    return (
      <li>
        <button
          type="button"
          onClick={aoEscolher}
          aria-label={`Lançar ${i.descricao}`}
          className="flex w-full flex-col gap-2.5 px-3.5 py-3.5 text-left transition-colors active:bg-surface-2"
        >
          {corpo}
        </button>
      </li>
    )
  return <li className="flex flex-col gap-2.5 px-3.5 py-3.5">{corpo}</li>
}

/** Item já lançado: quantidade e remover, com o valor da linha. */
function LinhaLancada({
  item: i,
  editavel,
  carregando,
  ocupado,
  aoAlterar,
  aoRemover,
}: {
  item: ItemSOS
  editavel: boolean
  carregando: boolean
  ocupado: boolean
  aoAlterar: (q: number) => void
  aoRemover: () => void
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
      <div className="min-w-[9rem] flex-1">
        <p className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold text-ink">{i.descricao}</span>
          {i.origem === 'deslocamento' && <span className="shrink-0 rounded-md bg-cyan-soft px-1.5 py-px text-[10.5px] font-bold text-cyan-ink">Deslocamento</span>}
        </p>
        <p className="num text-[12px] text-ink-3">
          {moeda(i.valor_unitario)}
          {i.unidade ? `/${i.unidade}` : ''}
          {i.os_item_id ? ' · na OS' : ''}
        </p>
      </div>
      {editavel ? (
        <div className="ml-auto flex items-center gap-1">
          <Contador quantidade={Number(i.quantidade)} carregando={carregando} ocupado={ocupado} aoMudar={(q) => (q <= 0 ? aoRemover() : aoAlterar(q))} />
          <button
            type="button"
            aria-label={`Remover ${i.descricao}`}
            disabled={ocupado}
            onClick={aoRemover}
            className="flex size-12 items-center justify-center rounded-xl text-ink-3 active:bg-crit-soft active:text-crit-ink disabled:opacity-40"
          >
            <Trash2 className="size-5" />
          </button>
        </div>
      ) : (
        <span className="num ml-auto text-[13.5px] text-ink-2">× {Number(i.quantidade).toLocaleString('pt-BR')}</span>
      )}
      <span className="num w-24 shrink-0 text-right text-[15px] font-bold text-ink">{moeda(i.valor_total)}</span>
    </li>
  )
}

/** − quantidade + (toque de 44 px). */
export function Contador({ quantidade, carregando, ocupado, aoMudar }: { quantidade: number; carregando: boolean; ocupado: boolean; aoMudar: (q: number) => void }) {
  return (
    <div className="flex items-center rounded-2xl border-2 border-line bg-surface-2">
      <button type="button" aria-label="Diminuir" disabled={ocupado} onClick={() => aoMudar(quantidade - 1)} className="flex size-11 items-center justify-center text-ink-2 disabled:opacity-40">
        <Minus className="size-5" />
      </button>
      <span className="num flex min-w-9 justify-center px-0.5 text-[16px] font-bold text-ink">
        {carregando ? <Loader2 className="size-4 animate-spin" /> : quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
      </span>
      <button type="button" aria-label="Aumentar" disabled={ocupado} onClick={() => aoMudar(quantidade + 1)} className="flex size-11 items-center justify-center text-ink-2 disabled:opacity-40">
        <Plus className="size-5" />
      </button>
    </div>
  )
}
