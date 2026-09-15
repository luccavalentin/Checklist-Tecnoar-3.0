import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Polyline } from 'react-leaflet'
import { Download, Filter, LayoutGrid, List, Map as IconeMapa, MapPinOff, Maximize, RotateCw, Search, SearchX, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Esqueleto, EstadoVazio } from '@/componentes/ui/Estados'
import { Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { useToast } from '@/componentes/ui/Toast'
import { sosListarChamados } from '@/sos/api'
import { BotaoMapa, CapturaMapa, MapaSOS, enquadrarMapa, focarMapa, type MapaLeaflet, type MarcadorMapa } from '@/sos/Mapa'
import { SeloStatus } from '@/sos/componentes'
import { CHAVES_SOS } from '@/sos/tempoReal'
import { OCORRENCIAS, ORDEM_OCORRENCIAS, STATUS_SOS, dataHoraCurta, formatarDuracao } from '@/sos/rotulos'
import type { ChamadoListado, OcorrenciaSOS, StatusSOS } from '@/sos/tipos'
import { AvisosVigia, CartaoChamado, RelogioChamado } from './CartaoChamado'
import { ErroSOS, IconeOcorrencia, Placa, marcadorChamado, marcadorMecanico, useMecanicosSOS } from './comum'
import {
  BotaoVerNaLista,
  CartaoFocoChamado,
  EnquadramentoAutomatico,
  ModalDespacho,
  mecanicoEmDeslocamento,
  pontosDoFoco,
  rolarAteVisivel,
  rolarDentroDaLista,
  telaEmpilhada,
  useAltura,
  useEscParaFechar,
} from './SelecaoMapa'

export interface FiltroChamadosTela {
  busca: string
  /** Status separados por vírgula; vazio = todos. */
  status: string
  de: string
  ate: string
  mecanico: string
  ocorrencia: string
}

export const FILTRO_VAZIO: FiltroChamadosTela = { busca: '', status: '', de: '', ate: '', mecanico: '', ocorrencia: '' }

const OPCOES_STATUS: Array<{ valor: string; rotulo: string }> = [
  { valor: '', rotulo: 'Todos os status' },
  { valor: 'recebido,procurando_mecanico', rotulo: 'Aguardando mecânico' },
  { valor: 'aceito,a_caminho', rotulo: 'A caminho' },
  { valor: 'no_local', rotulo: 'No local' },
  { valor: 'servico_iniciado', rotulo: 'Em serviço' },
  { valor: 'aceito,a_caminho,no_local,servico_iniciado', rotulo: 'Em campo (todas as etapas)' },
  { valor: 'servico_finalizado', rotulo: 'Finalizado — aguardando avaliação' },
  { valor: 'servico_finalizado,concluido', rotulo: 'Finalizados e concluídos' },
  { valor: 'concluido', rotulo: 'Concluído' },
  { valor: 'cancelado', rotulo: 'Cancelado' },
]

type Visao = 'cartoes' | 'lista' | 'mapa'
const CHAVE_VISAO = 'tecnoar.sos.visao'

function lerVisao(): Visao {
  try {
    const v = localStorage.getItem(CHAVE_VISAO)
    if (v === 'cartoes' || v === 'lista' || v === 'mapa') return v
  } catch {
    /* sem armazenamento */
  }
  return 'cartoes'
}

function diaISO(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function diasAtras(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return diaISO(d)
}

export function ListaChamados({
  filtro,
  aoMudarFiltro,
  tempoAceiteSeg,
  podeExportar,
  aoAbrirChamado,
}: {
  filtro: FiltroChamadosTela
  aoMudarFiltro: (f: FiltroChamadosTela) => void
  tempoAceiteSeg: number
  podeExportar: boolean
  aoAbrirChamado: (id: string) => void
}) {
  const toast = useToast()
  const [visao, setVisao] = useState<Visao>(lerVisao)
  const [painelAberto, setPainelAberto] = useState(false)
  const [busca, setBusca] = useState(filtro.busca)
  const mecanicos = useMecanicosSOS()

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_VISAO, visao)
    } catch {
      /* sem armazenamento */
    }
  }, [visao])

  // A busca digita local e só consulta o banco quando a pessoa para.
  const enviada = useRef(filtro.busca)
  useEffect(() => {
    if (busca === filtro.busca) return
    const t = window.setTimeout(() => {
      enviada.current = busca
      aoMudarFiltro({ ...filtro, busca })
    }, 350)
    return () => window.clearTimeout(t)
  }, [busca, filtro, aoMudarFiltro])

  // Só puxa de fora quando outra ação mudou a busca ("Limpar filtros");
  // puxar o eco da própria digitação apagaria as letras tecladas no meio-tempo.
  useEffect(() => {
    if (filtro.busca === enviada.current) return
    enviada.current = filtro.busca
    setBusca(filtro.busca)
  }, [filtro.busca])

  const consulta = useQuery({
    queryKey: [...CHAVES_SOS.lista, 'filtro', filtro],
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    queryFn: () =>
      sosListarChamados({
        busca: filtro.busca.trim() || null,
        status: filtro.status ? (filtro.status.split(',') as StatusSOS[]) : undefined,
        de: filtro.de || null,
        ate: filtro.ate || null,
        mecanico_id: filtro.mecanico || null,
        ocorrencia: filtro.ocorrencia || null,
        limite: 300,
      }),
  })

  const lista = consulta.data ?? []

  const opcoesStatus = useMemo(() => {
    if (!filtro.status || OPCOES_STATUS.some((o) => o.valor === filtro.status)) return OPCOES_STATUS
    const rotulo = filtro.status
      .split(',')
      .map((s) => STATUS_SOS[s as StatusSOS]?.curto ?? s)
      .join(' + ')
    return [...OPCOES_STATUS, { valor: filtro.status, rotulo }]
  }, [filtro.status])

  const chips: Array<{ id: string; rotulo: string; limpar: () => void }> = []
  if (filtro.status)
    chips.push({ id: 'status', rotulo: opcoesStatus.find((o) => o.valor === filtro.status)?.rotulo ?? 'Status', limpar: () => aoMudarFiltro({ ...filtro, status: '' }) })
  if (filtro.ocorrencia)
    chips.push({ id: 'oc', rotulo: OCORRENCIAS[filtro.ocorrencia as OcorrenciaSOS]?.rotulo ?? 'Problema', limpar: () => aoMudarFiltro({ ...filtro, ocorrencia: '' }) })
  if (filtro.mecanico)
    chips.push({
      id: 'mec',
      rotulo: mecanicos.data?.find((m) => m.usuario_id === filtro.mecanico)?.nome ?? 'Mecânico',
      limpar: () => aoMudarFiltro({ ...filtro, mecanico: '' }),
    })
  if (filtro.de || filtro.ate)
    chips.push({
      id: 'data',
      rotulo: filtro.de && filtro.ate ? `${formatarDia(filtro.de)} a ${formatarDia(filtro.ate)}` : filtro.de ? `Desde ${formatarDia(filtro.de)}` : `Até ${formatarDia(filtro.ate)}`,
      limpar: () => aoMudarFiltro({ ...filtro, de: '', ate: '' }),
    })
  const qtdFiltros = chips.length

  function exportar() {
    if (!lista.length) return
    const cab = ['Protocolo', 'Recebido em', 'Status', 'Prioridade', 'Cliente', 'Placa', 'Veículo', 'Problema', 'Endereço', 'Mecânico', 'Aceite', 'Deslocamento', 'Serviço', 'Total', 'Nota', 'OS']
    const linhas = lista.map((c) => [
      c.protocolo,
      dataHoraCurta(c.recebido_em),
      c.status_rotulo,
      c.prioridade,
      c.cliente_nome,
      c.placa ?? '',
      c.veiculo ?? '',
      c.ocorrencia_rotulo,
      c.endereco ?? '',
      c.mecanico_nome ?? '',
      c.tempo_aceite_seg != null ? formatarDuracao(c.tempo_aceite_seg) : '',
      c.tempo_deslocamento_seg != null ? formatarDuracao(c.tempo_deslocamento_seg) : '',
      c.tempo_servico_seg != null ? formatarDuracao(c.tempo_servico_seg) : '',
      c.tempo_total_seg != null ? formatarDuracao(c.tempo_total_seg) : '',
      c.avaliacao_nota ?? '',
      c.os_numero ?? '',
    ])
    // Ponto e vírgula e BOM: é o formato que o Excel em português abre sem assistente.
    const csv = [cab, ...linhas].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `sos-tecnoar-${diaISO(new Date())}.csv`
    a.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    toast.ok('Planilha gerada', `${lista.length} chamado${lista.length > 1 ? 's' : ''} exportado${lista.length > 1 ? 's' : ''}.`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="aresta flex flex-col rounded-lg border border-line bg-surface shadow-e1">
        <div className="flex flex-wrap items-center gap-2 p-2.5">
          <div className="min-w-0 flex-[1_1_16rem]">
            <Entrada
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Protocolo, cliente, placa ou modelo"
              aria-label="Buscar chamados"
              iconeInicio={<Search />}
              acaoFim={
                busca ? (
                  <BotaoIcone rotulo="Limpar busca" tamanho="sm" onClick={() => setBusca('')}>
                    <X />
                  </BotaoIcone>
                ) : undefined
              }
            />
          </div>
          <div className="flex flex-1 items-center gap-2 sm:flex-none">
            <Botao
              variante={painelAberto || qtdFiltros ? 'secundario' : 'neutro'}
              iconeInicio={<Filter />}
              onClick={() => setPainelAberto((v) => !v)}
              aria-expanded={painelAberto}
              aria-label={qtdFiltros ? `Filtros (${qtdFiltros} ativos)` : 'Filtros'}
              className="flex-1 sm:flex-none"
            >
              {/* Em 320px o rótulo não cabe ao lado das visões: fica o ícone e a contagem. */}
              <span className="hidden min-[380px]:inline">Filtros</span>
              {qtdFiltros > 0 && <span className="num">{qtdFiltros}</span>}
            </Botao>
            <div role="radiogroup" aria-label="Forma de exibição" className="flex shrink-0 rounded-md border border-line-strong bg-inset p-[3px]">
              {(
                [
                  ['cartoes', 'Cartões', <LayoutGrid key="c" />],
                  ['lista', 'Lista', <List key="l" />],
                  ['mapa', 'Mapa', <IconeMapa key="m" />],
                ] as const
              ).map(([v, r, icone]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={visao === v}
                  aria-label={r}
                  title={r}
                  onClick={() => setVisao(v)}
                  className={cn(
                    'flex h-[38px] min-w-11 items-center justify-center gap-1.5 rounded-[5px] px-2.5 font-display lg:h-[32px] lg:min-w-0 text-[11.5px] font-semibold transition-colors [&_svg]:size-4',
                    visao === v ? 'bg-surface-2 text-ink shadow-e1' : 'text-ink-3 hover:text-ink-2',
                  )}
                >
                  {icone}
                  <span className="hidden md:inline">{r}</span>
                </button>
              ))}
            </div>
            <BotaoIcone rotulo="Atualizar lista" variante="neutro" onClick={() => void consulta.refetch()} disabled={consulta.isFetching} className="hidden sm:inline-flex">
              <RotateCw className={consulta.isFetching ? 'animate-spin' : undefined} />
            </BotaoIcone>
            {podeExportar && (
              <BotaoIcone rotulo="Exportar planilha (CSV)" variante="neutro" onClick={exportar} disabled={!lista.length}>
                <Download />
              </BotaoIcone>
            )}
          </div>
        </div>

        {chips.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto border-t border-line px-2.5 py-2 [scrollbar-width:none]">
            {chips.map((c) => (
              <span key={c.id} className="flex h-10 shrink-0 items-center gap-1 rounded-full border border-cyan/40 bg-cyan-soft pr-1 pl-3 text-[12px] whitespace-nowrap text-ink lg:h-8">
                {c.rotulo}
                <button
                  type="button"
                  aria-label={`Remover filtro ${c.rotulo}`}
                  onClick={c.limpar}
                  className="flex size-8 items-center justify-center rounded-full text-ink-3 hover:bg-surface hover:text-ink lg:size-6"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </span>
            ))}
            <button type="button" onClick={() => aoMudarFiltro({ ...FILTRO_VAZIO, busca: filtro.busca })} className="min-h-10 shrink-0 px-2 text-[12px] text-ink-3 hover:text-ink lg:min-h-8">
              Limpar tudo
            </button>
          </div>
        )}

        {painelAberto && (
          <div className="grid grid-cols-1 gap-3 border-t border-line bg-surface-2/45 p-3 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Status">
              {(p) => (
                <Selecao {...p} value={filtro.status} onChange={(e) => aoMudarFiltro({ ...filtro, status: e.target.value })}>
                  {opcoesStatus.map((o) => (
                    <option key={o.valor || 'todos'} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Problema">
              {(p) => (
                <Selecao {...p} value={filtro.ocorrencia} onChange={(e) => aoMudarFiltro({ ...filtro, ocorrencia: e.target.value })}>
                  <option value="">Todos os problemas</option>
                  {ORDEM_OCORRENCIAS.map((o) => (
                    <option key={o} value={o}>
                      {OCORRENCIAS[o].rotulo}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
            <Campo rotulo="Mecânico">
              {(p) => (
                <Selecao {...p} value={filtro.mecanico} onChange={(e) => aoMudarFiltro({ ...filtro, mecanico: e.target.value })}>
                  <option value="">Todos os mecânicos</option>
                  {(mecanicos.data ?? []).map((m) => (
                    <option key={m.usuario_id} value={m.usuario_id}>
                      {m.nome}
                    </option>
                  ))}
                </Selecao>
              )}
            </Campo>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="lbl">Período</span>
              <div className="grid grid-cols-2 gap-2">
                <Entrada type="date" aria-label="De" value={filtro.de} max={filtro.ate || undefined} onChange={(e) => aoMudarFiltro({ ...filtro, de: e.target.value })} />
                <Entrada type="date" aria-label="Até" value={filtro.ate} min={filtro.de || undefined} onChange={(e) => aoMudarFiltro({ ...filtro, ate: e.target.value })} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['Hoje', 0],
                    ['7 dias', 6],
                    ['30 dias', 29],
                  ] as const
                ).map(([r, n]) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => aoMudarFiltro({ ...filtro, de: diasAtras(n), ate: diaISO(new Date()) })}
                    className="h-10 rounded-full border border-line-strong px-3.5 text-[12px] text-ink-2 hover:border-cyan hover:text-ink lg:h-8 lg:px-3"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 px-0.5">
        <span className="text-[12.5px] text-ink-3" aria-live="polite">
          {consulta.isLoading ? 'Carregando…' : `${lista.length} chamado${lista.length === 1 ? '' : 's'}${lista.length >= 300 ? ' (mostrando os 300 mais recentes)' : ''}`}
        </span>
      </div>

      {consulta.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Esqueleto key={i} className="h-[150px] rounded-lg" />
          ))}
        </div>
      ) : consulta.isError ? (
        <ErroSOS erro={consulta.error} aoTentarNovamente={() => void consulta.refetch()} />
      ) : lista.length === 0 ? (
        <EstadoVazio
          icone={<SearchX />}
          titulo={qtdFiltros || filtro.busca ? 'Nenhum chamado com esses filtros' : 'Nenhum chamado ainda'}
          descricao={
            qtdFiltros || filtro.busca
              ? 'Tente outro termo ou remova algum filtro.'
              : 'Os pedidos de socorro feitos pelo app ou abertos pela central aparecem aqui.'
          }
          acao={
            qtdFiltros || filtro.busca ? (
              <Botao tamanho="sm" variante="neutro" onClick={() => aoMudarFiltro(FILTRO_VAZIO)}>
                Limpar filtros
              </Botao>
            ) : undefined
          }
        />
      ) : visao === 'cartoes' ? (
        <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4', consulta.isPlaceholderData && 'opacity-60')}>
          {lista.map((c) => (
            <CartaoChamado key={c.id} chamado={c} tempoAceiteSeg={tempoAceiteSeg} aoAbrir={() => aoAbrirChamado(c.id)} />
          ))}
        </div>
      ) : visao === 'lista' ? (
        <TabelaChamados lista={lista} tempoAceiteSeg={tempoAceiteSeg} aoAbrirChamado={aoAbrirChamado} />
      ) : (
        <MapaChamados lista={lista} tempoAceiteSeg={tempoAceiteSeg} aoAbrirChamado={aoAbrirChamado} />
      )}
    </div>
  )
}

function formatarDia(iso: string): string {
  const [a, m, d] = iso.split('-')
  return a && m && d ? `${d}/${m}` : iso
}

function TabelaChamados({ lista, tempoAceiteSeg, aoAbrirChamado }: { lista: ChamadoListado[]; tempoAceiteSeg: number; aoAbrirChamado: (id: string) => void }) {
  const colunas: Array<Coluna<ChamadoListado>> = [
    {
      chave: 'protocolo',
      cabecalho: 'Protocolo',
      largura: '150px',
      celula: (c) => (
        <span className="flex flex-col">
          <span className="num text-[12.5px] font-semibold text-ink">{c.protocolo}</span>
          <span className="num text-[11px] text-ink-3">{dataHoraCurta(c.recebido_em)}</span>
        </span>
      ),
    },
    {
      chave: 'cliente',
      cabecalho: 'Cliente',
      largura: '220px',
      celula: (c) => (
        <span className="flex min-w-0 items-center gap-2">
          <IconeOcorrencia tipo={c.tipo_ocorrencia} tamanho="sm" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-ink">{c.cliente_nome}</span>
            <span className="truncate text-[11.5px] text-ink-3">{c.ocorrencia_rotulo}</span>
          </span>
        </span>
      ),
    },
    {
      chave: 'veiculo',
      cabecalho: 'Veículo',
      largura: '190px',
      celula: (c) => (
        <span className="flex min-w-0 items-center gap-2">
          <Placa placa={c.placa} />
          <span className="truncate text-[12.5px] text-ink-2">{c.veiculo ?? '—'}</span>
        </span>
      ),
    },
    {
      chave: 'status',
      cabecalho: 'Status',
      largura: '170px',
      celula: (c) => (
        <span className="flex min-w-0 flex-col items-start gap-1">
          <SeloStatus status={c.status} />
          <AvisosVigia chamado={c} />
        </span>
      ),
    },
    {
      chave: 'mecanico',
      cabecalho: 'Mecânico',
      largura: '170px',
      celula: (c) => <span className="truncate text-[12.5px] text-ink-2">{c.mecanico_nome ?? <span className="text-warn-ink">Sem mecânico</span>}</span>,
    },
    { chave: 'tempo', cabecalho: 'Tempo', largura: '150px', celula: (c) => <RelogioChamado chamado={c} tempoAceiteSeg={tempoAceiteSeg} /> },
    {
      chave: 'os',
      cabecalho: 'OS',
      largura: '90px',
      celula: (c) => <span className="num text-[12px] text-ink-2">{c.os_numero != null ? String(c.os_numero).padStart(5, '0') : '—'}</span>,
    },
  ]
  return (
    <>
      {/* Abaixo do desktop a tabela viraria uma ficha longa por chamado; aqui
          cada chamado é uma linha densa, que se lê de relance e cabe no dedo. */}
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface shadow-e1 lg:hidden">
        {lista.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => aoAbrirChamado(c.id)}
              className="flex min-h-16 w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-cyan-soft/30 active:bg-cyan-soft/50"
            >
              <IconeOcorrencia tipo={c.tipo_ocorrencia} tamanho="sm" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-[13.5px] font-semibold text-ink">{c.cliente_nome}</span>
                  <RelogioChamado chamado={c} tempoAceiteSeg={tempoAceiteSeg} className="shrink-0" />
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="num min-w-0 truncate text-[11px] text-ink-3">{c.protocolo}</span>
                  {c.placa && <Placa placa={c.placa} className="text-[10.5px] leading-[16px]" />}
                  <span className="ml-auto shrink-0">
                    <SeloStatus status={c.status} />
                  </span>
                </span>
                <AvisosVigia chamado={c} className="mt-0.5" />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="hidden lg:block">
        <Tabela colunas={colunas} linhas={lista} chaveDe={(c) => c.id} aoClicarLinha={(c) => aoAbrirChamado(c.id)} densidade="compacta" />
      </div>
    </>
  )
}

/** Margem do cabeçalho fixo ao rolar até o mapa ou até um item da lista. */
const MARGEM_ROLAGEM = 'scroll-mt-[calc(4.75rem+env(safe-area-inset-top))]'

/**
 * Visão de mapa da lista: o mapa e, ao lado (monitor) ou abaixo (celular e
 * tablet), os mesmos chamados numa lista curta. Tocar num chamado — na lista
 * ou no pino — leva o mapa até ele e mostra o cartão; o painel completo abre
 * no "Abrir chamado" ou num segundo toque na lista.
 */
function MapaChamados({
  lista,
  tempoAceiteSeg,
  aoAbrirChamado,
}: {
  lista: ChamadoListado[]
  tempoAceiteSeg: number
  aoAbrirChamado: (id: string) => void
}) {
  const mecanicos = useMecanicosSOS()
  const mapa = useRef<MapaLeaflet | null>(null)
  const areaMapa = useRef<HTMLDivElement>(null)
  const areaLista = useRef<HTMLDivElement>(null)
  const rolagemLista = useRef<HTMLUListElement>(null)
  const topo = useRef<HTMLDivElement>(null)
  const cartao = useRef<HTMLDivElement>(null)
  const [selecao, setSelecao] = useState<{ id: string; origem: 'lista' | 'mapa'; vez: number } | null>(null)
  const [despachando, setDespachando] = useState<string | null>(null)
  const mecs = useMemo(() => mecanicos.data ?? [], [mecanicos.data])

  const selecionado = selecao ? (lista.find((c) => c.id === selecao.id) ?? null) : null
  const idSel = selecionado?.id ?? null

  // Filtro mudou e o chamado saiu da lista: o cartão fecha junto.
  useEffect(() => {
    if (selecao && !lista.some((c) => c.id === selecao.id)) setSelecao(null)
  }, [selecao, lista])

  const selecionarNoMapa = useCallback((id: string) => {
    setSelecao((s) => (s?.id === id ? s : { id, origem: 'mapa', vez: (s?.vez ?? 0) + 1 }))
  }, [])

  const marcadores = useMemo(
    () =>
      lista
        .map((c) => marcadorChamado(c, { selecionado: c.id === idSel, aoClicar: () => selecionarNoMapa(c.id) }))
        .filter((m): m is MarcadorMapa => m !== null),
    [lista, idSel, selecionarNoMapa],
  )
  const semLocal = lista.length - marcadores.length

  // Chamado em foco com mecânico a caminho: o mecânico e a linha até o
  // cliente entram no mapa só enquanto dura o foco.
  const emRota = selecionado ? mecanicoEmDeslocamento(selecionado, mecs) : null
  const noMapa = useMemo(() => {
    if (!emRota) return marcadores
    const mk = marcadorMecanico(emRota, { selecionado: true })
    return mk ? [...marcadores, mk] : marcadores
  }, [marcadores, emRota])

  function selecionarNaLista(id: string) {
    if (selecao?.id === id) {
      aoAbrirChamado(id)
      return
    }
    setSelecao((s) => ({ id, origem: 'lista', vez: (s?.vez ?? 0) + 1 }))
    if (telaEmpilhada()) rolarAteVisivel(areaMapa.current, 'start')
  }

  // Voo até o chamado a cada toque (e a lista acompanha quando o toque foi no pino).
  useEffect(() => {
    if (!selecao || !selecionado) return
    if (selecao.origem === 'mapa') {
      rolarDentroDaLista(rolagemLista.current, rolagemLista.current?.querySelector<HTMLElement>(`[data-chamado="${selecao.id}"]`) ?? null)
    }
    const alvo = pontosDoFoco(selecionado, mecs)
    if (!alvo.length) return
    const quadro = requestAnimationFrame(() =>
      focarMapa(mapa.current, alvo, {
        zoom: 15,
        margemTopo: (topo.current?.offsetHeight ?? 0) + 12,
        margemInferior: (cartao.current?.offsetHeight ?? 0) + 12,
      }),
    )
    return () => cancelAnimationFrame(quadro)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecao?.vez])

  const fechar = useCallback(() => setSelecao(null), [])
  useEscParaFechar(!!selecionado, fechar)

  function verNaLista() {
    const item = selecao ? areaLista.current?.querySelector<HTMLElement>(`[data-chamado="${selecao.id}"]`) : null
    rolarAteVisivel(item ?? areaLista.current, 'center')
  }

  const chamadoDespacho = despachando ? (lista.find((c) => c.id === despachando) ?? null) : null
  const alturaCartao = useAltura(cartao, !!selecionado)

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
      <div
        ref={areaMapa}
        className={cn(
          'relative isolate h-[clamp(360px,64dvh,640px)] min-w-0 overflow-hidden rounded-lg border border-line bg-[#0b1526] shadow-e2 xl:h-[calc(100dvh-19rem)] xl:min-h-[480px]',
          MARGEM_ROLAGEM,
        )}
      >
        <MapaSOS marcadores={noMapa} enquadrar={false} tema="escuro" className="size-full [&_.leaflet-container]:!bg-[#0b1526]">
          <CapturaMapa destino={mapa} />
          <EnquadramentoAutomatico marcadores={marcadores} pausado={!!idSel} />
          {emRota && selecionado && (
            <Polyline
              positions={[
                [emRota.latitude!, emRota.longitude!],
                [selecionado.latitude!, selecionado.longitude!],
              ]}
              pathOptions={{ color: '#00a8e8', weight: 3.5, opacity: 1, dashArray: '6 9', lineCap: 'round' }}
            />
          )}
        </MapaSOS>

        <div ref={topo} className="pointer-events-none absolute inset-x-3 top-3 z-[600] flex flex-col items-start gap-2">
          {semLocal > 0 && (
            <span className="rounded-full border border-white/10 bg-[#081830]/85 px-3 py-1.5 text-[11.5px] text-white/85 backdrop-blur-md">
              {semLocal} chamado{semLocal > 1 ? 's' : ''} sem localização — {semLocal > 1 ? 'estão' : 'está'} só na lista
            </span>
          )}
          {selecionado && <BotaoVerNaLista rotulo="Ver na lista" onClick={verNaLista} className="pointer-events-auto" />}
        </div>

        <div
          className="absolute right-3 bottom-8 z-[600] transition-[bottom] duration-200 max-sm:bottom-[calc(var(--sobe,0px)+0.75rem)]"
          style={{ '--sobe': alturaCartao ? `${alturaCartao + 12}px` : '1.25rem' } as CSSProperties}
        >
          <BotaoMapa rotulo="Enquadrar todos" onClick={() => enquadrarMapa(mapa.current, marcadores.map((m) => m.ponto))}>
            <Maximize />
          </BotaoMapa>
        </div>

        {selecionado && (
          <div ref={cartao} className="absolute inset-x-2.5 bottom-2.5 z-[650] sm:inset-x-3 sm:right-auto sm:bottom-3 sm:w-[380px]">
            <CartaoFocoChamado
              key={selecionado.id}
              chamado={selecionado}
              mecanicos={mecs}
              tempoAceiteSeg={tempoAceiteSeg}
              aoAbrir={() => aoAbrirChamado(selecionado.id)}
              aoDespachar={() => setDespachando(selecionado.id)}
              aoFechar={fechar}
            />
          </div>
        )}
      </div>

      <div
        ref={areaLista}
        className={cn(
          'flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-e1 xl:h-[calc(100dvh-19rem)] xl:min-h-[480px]',
          MARGEM_ROLAGEM,
        )}
      >
        <p className="shrink-0 border-b border-line bg-surface-2/50 px-3.5 py-2 text-[11.5px] text-ink-3">
          Toque para ver no mapa · toque de novo para abrir o chamado
        </p>
        <ul ref={rolagemLista} className="min-h-0 flex-1 divide-y divide-line overflow-y-auto overscroll-contain">
          {lista.map((c) => {
            const sel = c.id === idSel
            return (
              <li key={c.id} data-chamado={c.id} className={MARGEM_ROLAGEM}>
                <button
                  type="button"
                  onClick={() => selecionarNaLista(c.id)}
                  aria-pressed={sel}
                  className={cn(
                    'relative flex min-h-16 w-full min-w-0 items-center gap-3 px-3.5 py-2.5 text-left transition-colors',
                    sel ? 'bg-cyan-soft/50' : 'hover:bg-surface-2/70 active:bg-cyan-soft/40',
                  )}
                >
                  {sel && <span aria-hidden className="absolute inset-y-0 left-0 w-[3px] bg-cyan" />}
                  <IconeOcorrencia tipo={c.tipo_ocorrencia} tamanho="sm" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-center justify-between gap-2">
                      <span className="truncate text-[13.5px] font-semibold text-ink">{c.cliente_nome}</span>
                      <RelogioChamado chamado={c} tempoAceiteSeg={tempoAceiteSeg} className="shrink-0" />
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cn('num min-w-0 truncate text-[11px]', sel ? 'text-cyan-ink' : 'text-ink-3')}>{c.protocolo}</span>
                      {c.latitude == null && (
                        <span className="flex shrink-0 items-center gap-1 text-[11px] text-warn-ink">
                          <MapPinOff aria-hidden className="size-3" /> sem localização
                        </span>
                      )}
                      <span className="ml-auto shrink-0">
                        <SeloStatus status={c.status} />
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <ModalDespacho chamado={chamadoDespacho} aoFechar={() => setDespachando(null)} />
    </div>
  )
}
