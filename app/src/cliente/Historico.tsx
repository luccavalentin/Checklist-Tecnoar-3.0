import { useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, ClipboardList, History, Package, Siren, Star, UserRound, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { sosHistoricoCliente } from '@/sos/api'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { ItemHistorico } from '@/sos/tipos'
import { BotaoApp, CabecalhoTela, Esqueleto, Tela, VazioApp } from '../comum/ui'
import { dataLonga, kmTexto, useMeusVeiculos } from './dados'
import { ErroCarga, PlacaVeiculo, Segmentado } from './pecas'
import { BotaoLaudo, temLaudo } from './chamado/Laudo'
import { ListaSocorros, SeloStatusCliente } from './MeusChamados'

type Aba = 'tudo' | 'os' | 'sos'

/**
 * Histórico do veículo: toda OS feita na Tecnoar (Minhas OS) e todo socorro,
 * do mais novo para o mais antigo. É o "prontuário" do veículo — vem do
 * mesmo banco do Checklist, sem o cliente cadastrar nada.
 */
export function Historico() {
  const navegar = useNavigate()
  const [busca, setBusca] = useSearchParams()
  const veiculoId = busca.get('veiculo')
  const aba = (['tudo', 'os', 'sos'].includes(busca.get('tipo') ?? '') ? busca.get('tipo') : 'tudo') as Aba
  const veiculos = useMeusVeiculos()
  const historico = useQuery({
    queryKey: CHAVES_SOS.historico(veiculoId),
    queryFn: () => sosHistoricoCliente(veiculoId, 80),
    enabled: aba !== 'sos',
  })

  const lista = (historico.data ?? []).filter((i) => aba === 'tudo' || i.tipo === aba)
  const grupos = agruparPorAno(lista)

  function mudar(p: { tipo?: Aba; veiculo?: string | null }) {
    const tipo = p.tipo ?? aba
    const veiculo = p.veiculo === undefined ? veiculoId : p.veiculo
    const novo: Record<string, string> = {}
    if (tipo !== 'tudo') novo.tipo = tipo
    if (veiculo) novo.veiculo = veiculo
    setBusca(novo, { replace: true })
  }

  return (
    <>
      <CabecalhoTela titulo="Histórico" subtitulo="Serviços e socorros do seu veículo" />
      <Tela className="entrada-suave">
        <Segmentado<Aba>
          rotulo="Mostrar"
          valor={aba}
          aoMudar={(v) => mudar({ tipo: v })}
          opcoes={[
            { valor: 'tudo', rotulo: 'Tudo' },
            { valor: 'os', rotulo: 'Minhas OS' },
            { valor: 'sos', rotulo: 'Socorros' },
          ]}
        />

        {aba !== 'sos' && (veiculos.data?.length ?? 0) > 1 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Filtrar por veículo">
            <Filtro ativo={!veiculoId} onClick={() => mudar({ veiculo: null })}>
              Todos
            </Filtro>
            {veiculos.data!.map((v) => (
              <Filtro key={v.id} ativo={veiculoId === v.id} onClick={() => mudar({ veiculo: v.id })}>
                <span className="num tracking-wide">{v.placa}</span>
              </Filtro>
            ))}
          </div>
        )}

        {aba === 'sos' ? (
          <ListaSocorros />
        ) : historico.isLoading ? (
          <div className="flex flex-col gap-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Esqueleto key={i} className="h-24" />
            ))}
          </div>
        ) : historico.isError ? (
          <ErroCarga erro={historico.error} aoTentar={() => void historico.refetch()} />
        ) : lista.length === 0 ? (
          <VazioApp
            icone={aba === 'os' ? ClipboardList : History}
            titulo={aba === 'os' ? 'Nenhuma ordem de serviço' : 'Nada no histórico ainda'}
            descricao="As ordens de serviço feitas na Tecnoar e os socorros aparecem aqui automaticamente."
            acao={
              <BotaoApp variante="neutro" onClick={() => navegar('/revisoes?agendar=1')}>
                Agendar um serviço
              </BotaoApp>
            }
          />
        ) : (
          grupos.map(([ano, itens]) => (
            <section key={ano} className="flex flex-col gap-2.5">
              <h2 className="px-1 font-display text-[15px] font-bold text-ink">{ano}</h2>
              {itens.map((i) => (i.tipo === 'os' ? <ItemOS key={`os-${i.id}`} item={i} /> : <ItemSOS key={`sos-${i.id}`} item={i} />))}
            </section>
          ))
        )}
      </Tela>
    </>
  )
}

function Filtro({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      onClick={onClick}
      className={cn(
        'flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[13.5px] font-semibold transition-colors',
        ativo ? 'border-[#0D1C33] bg-[#0D1C33] text-white dark:border-white dark:bg-white dark:text-[#0D1C33]' : 'border-line-strong bg-surface text-ink-2',
      )}
    >
      {children}
    </button>
  )
}

type HistOS = Extract<ItemHistorico, { tipo: 'os' }>
type HistSOS = Extract<ItemHistorico, { tipo: 'sos' }>

function ItemOS({ item: i }: { item: HistOS }) {
  const navegar = useNavigate()
  const [aberto, setAberto] = useState(false)
  const servicos = i.servicos ?? []
  const produtos = i.produtos ?? []
  const resumo = servicos.map((s) => s.descricao).join(', ') || i.problema || 'Ordem de serviço'
  return (
    <article className="overflow-hidden rounded-[1.25rem] border border-line bg-surface">
      <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} className="flex w-full items-start gap-3 p-4 text-left">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-soft text-cyan-ink">
          <Wrench className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-display text-[15.5px] font-bold text-ink">OS nº {i.numero}</span>
            {!i.encerrada && <span className="rounded-full bg-cyan-soft px-2 py-0.5 text-[11.5px] font-semibold text-cyan-ink">Em andamento</span>}
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            {dataLonga(i.em)}
            {i.km ? ` · ${kmTexto(i.km)}` : ''}
          </p>
          <p className={cn('mt-1.5 text-[14px] leading-snug text-ink-2', !aberto && 'line-clamp-2')}>{resumo}</p>
        </div>
        <ChevronDown className={cn('mt-1 size-5 shrink-0 text-ink-3 transition-transform', aberto && 'rotate-180')} />
      </button>

      {aberto && (
        <div className="entrada-suave flex flex-col gap-3 border-t border-line p-4">
          {i.status && (
            <p className="flex items-center gap-2 text-[13px] text-ink-2">
              <span className="size-2 rounded-full" style={{ background: i.status_cor ?? 'var(--c-ink-3)' }} />
              {i.status}
            </p>
          )}
          {i.placa && (
            <div className="flex flex-wrap items-center gap-2">
              <PlacaVeiculo placa={i.placa} tamanho="sm" />
              {i.veiculo && <span className="text-[13px] text-ink-2">{i.veiculo}</span>}
            </div>
          )}
          {i.problema && <Campo rotulo="O que foi relatado">{i.problema}</Campo>}
          {i.diagnostico && <Campo rotulo="Diagnóstico">{i.diagnostico}</Campo>}
          {servicos.length > 0 && <Itens titulo="Serviços" icone={Wrench} itens={servicos} />}
          {produtos.length > 0 && <Itens titulo="Peças e produtos" icone={Package} itens={produtos} />}
          {i.mecanicos && (
            <p className="flex items-center gap-2 text-[13px] text-ink-2">
              <UserRound className="size-4 text-ink-3" /> {i.mecanicos}
            </p>
          )}
          {i.valor_total != null && (
            <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3.5 py-3">
              <span className="text-[13px] font-medium text-ink-2">Valor total</span>
              <span className="num text-[16px] font-bold text-ink">{moeda(i.valor_total)}</span>
            </div>
          )}
          {i.sos_id && (
            <>
              <button type="button" onClick={() => navegar(`/chamado/${i.sos_id}`)} className="flex min-h-11 items-center gap-2 text-[13.5px] font-semibold text-accent-ink">
                <Siren className="size-4" /> Veio do socorro {i.sos_protocolo} <ChevronRight className="size-4" />
              </button>
              {/* OS encerrada vinda de um socorro: o serviço de campo já foi finalizado. */}
              {i.encerrada && <BotaoLaudo chamadoId={i.sos_id} variante="linha" className="w-full" />}
            </>
          )}
        </div>
      )}
    </article>
  )
}

function ItemSOS({ item: i }: { item: HistSOS }) {
  const navegar = useNavigate()
  const laudo = temLaudo(i.status)
  return (
    <article className="overflow-hidden rounded-[1.25rem] border border-line bg-surface">
      <button type="button" onClick={() => navegar(`/chamado/${i.id}`)} className="flex w-full items-start gap-3 p-4 text-left active:bg-surface-2">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-crit-soft text-crit">
          <Siren className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15.5px] font-bold text-ink">Socorro · {i.ocorrencia_rotulo}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            <span className="num">{i.protocolo}</span> · {dataLonga(i.em)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SeloStatusCliente status={i.status} />
            {i.placa && <PlacaVeiculo placa={i.placa} tamanho="sm" />}
            {i.nota != null && (
              <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink">
                <Star className="size-3.5 fill-[#f5a524] text-[#f5a524]" /> {i.nota}
              </span>
            )}
          </div>
          {(i.servico || i.diagnostico) && <p className="mt-2 line-clamp-2 text-[13.5px] leading-snug text-ink-2">{i.servico || i.diagnostico}</p>}
          {i.mecanico && <p className="mt-1 text-[12.5px] text-ink-3">Mecânico: {i.mecanico}</p>}
        </div>
        <ChevronRight className="mt-1 size-5 shrink-0 text-ink-3" />
      </button>
      {laudo && (
        <div className="border-t border-line px-4 py-3">
          <BotaoLaudo chamadoId={i.id} variante="linha" className="w-full" />
        </div>
      )}
    </article>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[12.5px] font-medium text-ink-3">{rotulo}</p>
      <p className="text-[14px] leading-relaxed whitespace-pre-line text-ink">{children}</p>
    </div>
  )
}

function Itens({
  titulo,
  icone: Icone,
  itens,
}: {
  titulo: string
  icone: typeof Wrench
  itens: Array<{ descricao: string; quantidade: number; valor: number | null }>
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3">
        <Icone className="size-3.5" /> {titulo}
      </p>
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {itens.map((x, n) => (
          <li key={n} className="flex items-start gap-3 px-3.5 py-2.5">
            <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink">{x.descricao}</span>
            <span className="num shrink-0 text-[12.5px] text-ink-3">× {Number(x.quantidade).toLocaleString('pt-BR')}</span>
            {x.valor != null && <span className="num w-20 shrink-0 text-right text-[13px] font-semibold text-ink">{moeda(x.valor)}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function agruparPorAno(lista: ItemHistorico[]): Array<[string, ItemHistorico[]]> {
  const mapa = new Map<string, ItemHistorico[]>()
  for (const i of lista) {
    const ano = i.em ? String(new Date(i.em).getFullYear()) : 'Sem data'
    mapa.set(ano, [...(mapa.get(ano) ?? []), i])
  }
  return [...mapa.entries()]
}
