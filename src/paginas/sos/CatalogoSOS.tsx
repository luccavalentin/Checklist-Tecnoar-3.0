import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, Package, Search, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { Entrada, Segmentado } from '@/componentes/ui/Campo'
import { Esqueleto } from '@/componentes/ui/Estados'
import { GradeMetricas, Metrica } from '@/componentes/ui/Metrica'
import { Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { sosCatalogo, sosRelatorio } from '@/sos/api'
import { textoDisponivel, textoEstoqueEm, tomDisponivel } from '@/sos/estoque'
import type { ItemCatalogo } from '@/sos/tipos'
import { ErroSOS, moedaCurta } from './comum'

type Tipo = 'todos' | 'produto' | 'servico'

/**
 * Peças e serviços do SOS. Não existe um catálogo separado: o socorro usa
 * exatamente os produtos e serviços cadastrados no Checklist (mesmo código,
 * preço e estoque). Aqui a central vê o que o mecânico pode lançar em campo e
 * o que mais saiu nos atendimentos dos últimos 30 dias — e vai direto ao
 * cadastro para corrigir preço ou repor estoque.
 */
export function CatalogoSOS() {
  const { pode } = usePermissoes()
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [tipo, setTipo] = useState<Tipo>('todos')

  useEffect(() => {
    const t = setTimeout(() => setTermo(busca.trim()), 300)
    return () => clearTimeout(t)
  }, [busca])

  const faixa = useMemo(() => {
    const fim = new Date()
    const inicio = new Date()
    inicio.setDate(inicio.getDate() - 29)
    inicio.setHours(0, 0, 0, 0)
    return { inicio: inicio.toISOString(), fim: fim.toISOString() }
  }, [])

  const uso = useQuery({
    queryKey: ['sos', 'relatorio', 'catalogo-30d'],
    queryFn: () => sosRelatorio(faixa.inicio, faixa.fim),
    staleTime: 60_000,
  })
  const catalogo = useQuery({
    queryKey: ['sos', 'catalogo', termo, tipo],
    queryFn: () => sosCatalogo(termo, tipo === 'todos' ? null : tipo),
    staleTime: 30_000,
  })

  const itensUsados = uso.data?.ok ? uso.data.itens : []
  const usoPorCodigo = useMemo(() => {
    const m = new Map<string, { quantidade: number; chamados: number }>()
    for (const i of itensUsados) m.set(`${i.tipo}:${i.descricao}`, { quantidade: Number(i.quantidade), chamados: i.chamados })
    return m
  }, [itensUsados])

  const totalPecas = itensUsados.filter((i) => i.tipo === 'produto').reduce((s, i) => s + Number(i.valor_total), 0)
  const totalServicos = itensUsados.filter((i) => i.tipo === 'servico').reduce((s, i) => s + Number(i.valor_total), 0)
  const lista = catalogo.data ?? []

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <GradeMetricas colunas={4}>
        <Metrica rotulo="Peças lançadas" valor={uso.data ? moedaCurta(totalPecas) : '—'} glosa="em SOS, últimos 30 dias" tom="accent" carregando={uso.isLoading} />
        <Metrica rotulo="Serviços lançados" valor={uso.data ? moedaCurta(totalServicos) : '—'} glosa="em SOS, últimos 30 dias" tom="cyan" carregando={uso.isLoading} />
        <Metrica rotulo="Itens diferentes" valor={uso.data ? itensUsados.length : '—'} glosa="usados em campo" tom="neutro" carregando={uso.isLoading} />
        <Metrica
          rotulo="OS geradas"
          valor={uso.data?.ok ? uso.data.os_geradas : '—'}
          glosa="a partir de chamados SOS"
          tom="ok"
          carregando={uso.isLoading}
        />
      </GradeMetricas>

      <div className="rounded-lg border border-cyan/30 bg-cyan-soft px-4 py-3 text-[13px] text-cyan-ink">
        O SOS usa o <b>mesmo cadastro de produtos e serviços do Checklist</b>. Preço, código e estoque que o mecânico vê no app vêm
        daqui — para mudar, edite no cadastro.
        <span className="mt-1 flex flex-wrap gap-x-4">
          {pode('produtos', 'visualizar') && (
            <Link to="/cadastros/produtos" className="inline-flex min-h-11 items-center gap-1 font-semibold underline-offset-2 hover:underline sm:min-h-8">
              Abrir Produtos <ArrowUpRight className="size-3.5" />
            </Link>
          )}
          {pode('servicos', 'visualizar') && (
            <Link to="/cadastros/servicos" className="inline-flex min-h-11 items-center gap-1 font-semibold underline-offset-2 hover:underline sm:min-h-8">
              Abrir Serviços <ArrowUpRight className="size-3.5" />
            </Link>
          )}
        </span>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Painel semPadding>
          <CabecalhoPainel titulo="Catálogo disponível em campo" descricao="O que o mecânico encontra ao lançar peças e serviços." />
          <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <Entrada
                type="search"
                inputMode="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por descrição ou código"
                aria-label="Buscar no catálogo"
                iconeInicio={<Search />}
              />
            </div>
            <Segmentado<Tipo>
              rotuloGrupo="Tipo de item"
              valor={tipo}
              onChange={setTipo}
              className="[&>button]:min-h-11 lg:[&>button]:min-h-8"
              opcoes={[
                { valor: 'todos', rotulo: 'Todos' },
                { valor: 'produto', rotulo: 'Peças' },
                { valor: 'servico', rotulo: 'Serviços' },
              ]}
            />
          </div>
          {catalogo.isError ? (
            <div className="p-4">
              <ErroSOS erro={catalogo.error} aoTentarNovamente={() => void catalogo.refetch()} />
            </div>
          ) : catalogo.isLoading ? (
            <div className="flex flex-col gap-2 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Esqueleto key={i} className="h-12" />
              ))}
            </div>
          ) : !lista.length ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink-3">
              {termo ? `Nada encontrado para “${termo}”.` : 'Nenhum item ativo no cadastro.'}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {lista.map((i) => (
                <LinhaCatalogo key={`${i.tipo}:${i.id}`} item={i} uso={usoPorCodigo.get(`${i.tipo}:${i.descricao}`)} />
              ))}
            </ul>
          )}
          {lista.length >= 30 && (
            <p className="border-t border-line px-4 py-2.5 text-[12px] text-ink-3">Mostrando os 30 primeiros — refine a busca para achar outros.</p>
          )}
        </Painel>

        <Painel>
          <CabecalhoPainel className="-mx-5 -mt-5 mb-4" titulo="Mais usados no SOS" descricao="Últimos 30 dias." />
          {uso.isLoading ? (
            <Esqueleto className="h-48" />
          ) : !itensUsados.length ? (
            <p className="py-8 text-center text-[13px] text-ink-3">Nenhuma peça ou serviço lançado nos atendimentos ainda.</p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {itensUsados.slice(0, 12).map((i, k) => {
                const max = Math.max(...itensUsados.map((x) => Number(x.valor_total)), 1)
                return (
                  <li key={k} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[13px] text-ink">
                        <span className="num mr-1.5 text-ink-3">{k + 1}.</span>
                        {i.descricao}
                      </span>
                      <span className="num shrink-0 text-[12.5px] font-semibold text-ink">{moeda(i.valor_total)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-2">
                      <div
                        className={cn('h-full rounded-full', i.tipo === 'servico' ? 'bg-cyan' : 'bg-accent')}
                        style={{ width: `${Math.min(100, Math.max(4, (Number(i.valor_total) / max) * 100))}%` }}
                      />
                    </div>
                    <span className="num text-[11px] text-ink-3">
                      {Number(i.quantidade).toLocaleString('pt-BR')} un. · {i.chamados} {i.chamados === 1 ? 'chamado' : 'chamados'}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </Painel>
      </div>
    </div>
  )
}

function LinhaCatalogo({ item, uso }: { item: ItemCatalogo; uso?: { quantidade: number; chamados: number } }) {
  const servico = item.tipo === 'servico'
  // Disponível = saldo (Omie) − reservado (Omie) − comprometido no Tecnoar (OS abertas e SOS sem OS).
  const tom = servico ? 'desconhecido' : tomDisponivel(item.disponivel)
  const estoque = servico ? null : textoDisponivel(item.disponivel, item.unidade)
  const estoqueEm = servico ? null : textoEstoqueEm(item.estoque_em)
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          servico ? 'bg-cyan-soft text-cyan-ink' : 'bg-accent-soft text-accent-ink',
        )}
      >
        {servico ? <Wrench className="size-4" /> : <Package className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] text-ink">{item.descricao}</p>
        <p className="num flex flex-wrap gap-x-2 text-[11.5px] text-ink-3">
          <span>{item.codigo ?? 'sem código'}</span>
          {estoque && (
            <span
              className={cn('font-semibold', tom === 'sem' ? 'text-crit-ink' : tom === 'baixo' ? 'text-warn-ink' : 'text-ok-ink')}
              title={`Saldo Omie ${Number(item.saldo ?? 0).toLocaleString('pt-BR')} · reservado ${Number(item.reservado ?? 0).toLocaleString('pt-BR')} · comprometido ${Number(item.comprometido ?? 0).toLocaleString('pt-BR')}`}
            >
              {estoque.toLowerCase()}
            </span>
          )}
          {estoqueEm && <span>{estoqueEm}</span>}
          {uso && <span className="text-accent-ink">{uso.chamados}× no SOS</span>}
        </p>
      </div>
      <span className="num shrink-0 text-[13px] font-semibold text-ink">{item.preco != null ? moeda(item.preco) : '—'}</span>
    </li>
  )
}
