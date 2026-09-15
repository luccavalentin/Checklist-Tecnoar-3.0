import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ChevronRight, ClipboardList, RefreshCw, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Estrelas } from '@/sos/componentes'
import { STATUS_SOS, dataHoraCurta } from '@/sos/rotulos'
import type { HomeMecanico } from '@/sos/tipos'
import { useHomeMecanico } from './dados'
import { Placa } from './pecas'
import { BotaoM, EsqueletoM, NumeroM, SeloM, TelaM, TopoM, VazioM } from './ui'

type Filtro = 'todos' | 'finalizados' | 'cancelados' | 'avaliados'

const FILTROS: Array<{ id: Filtro; rotulo: string }> = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'finalizados', rotulo: 'Finalizados' },
  { id: 'avaliados', rotulo: 'Avaliados' },
  { id: 'cancelados', rotulo: 'Cancelados' },
]

/**
 * Histórico de atendimentos e avaliações recebidas. Vem da mesma consulta do
 * início (os 20 mais recentes); relatório completo fica no Checklist.
 */
export function HistoricoMecanico() {
  const home = useHomeMecanico()
  const navegar = useNavigate()
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const h = home.data
  const historico = h?.historico ?? []
  const lista = historico.filter((c) =>
    filtro === 'finalizados'
      ? c.status === 'servico_finalizado' || c.status === 'concluido'
      : filtro === 'cancelados'
        ? c.status === 'cancelado'
        : filtro === 'avaliados'
          ? c.nota != null
          : true,
  )
  const nota = h?.hoje.nota_media
  const avaliados = historico.filter((c) => c.nota != null).length

  return (
    <>
      <TopoM titulo="Chamados" sub="Seus atendimentos e as avaliações recebidas" />
      <TelaM>
        {home.isError && !h ? (
          <div className="flex flex-col items-center gap-3 rounded-[1.25rem] border border-line bg-surface px-5 py-8 text-center">
            <AlertTriangle className="size-8 text-crit" />
            <p className="max-w-xs text-[14px] leading-relaxed text-ink-2">{(home.error as Error).message}</p>
            <BotaoM variante="escuro" icone={RefreshCw} carregando={home.isFetching} onClick={() => void home.refetch()}>
              Tentar de novo
            </BotaoM>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <NumeroM
                rotulo="Avaliação média"
                valor={nota != null ? Number(nota).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–'}
                icone={nota != null ? Star : undefined}
                tom="ambar"
              />
              <NumeroM rotulo="Chamados hoje" valor={h ? h.hoje.atendimentos : '–'} />
              <NumeroM rotulo="Finalizados hoje" valor={h ? h.hoje.concluidos : '–'} tom="ok" />
            </div>

            {h?.chamado_atual && (
              <button
                type="button"
                onClick={() => navegar(`/chamado/${h.chamado_atual?.id}`)}
                className="flex min-h-16 w-full items-center gap-3 rounded-[1.25rem] border-2 border-accent/60 bg-surface px-4 py-3 text-left active:scale-[0.99]"
              >
                <span className="relative flex size-3 shrink-0" aria-hidden>
                  <span className="mec-pulso absolute inset-0 rounded-full bg-accent" />
                  <span className="relative size-3 rounded-full bg-accent" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[11px] font-extrabold tracking-[0.12em] text-accent-ink uppercase">
                    Em andamento · {STATUS_SOS[h.chamado_atual.status].curto}
                  </span>
                  <span className="block truncate text-[15.5px] font-bold text-ink">{h.chamado_atual.cliente_nome}</span>
                </span>
                <ChevronRight className="size-5 text-ink-3" />
              </button>
            )}

            <div className="grid grid-cols-4 gap-1 rounded-2xl border border-line bg-surface p-1 max-[359px]:grid-cols-2" role="tablist" aria-label="Filtrar atendimentos">
              {FILTROS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="tab"
                  aria-selected={filtro === f.id}
                  onClick={() => setFiltro(f.id)}
                  className={cn(
                    'min-h-11 min-w-0 truncate rounded-xl px-1 text-[13px] font-bold whitespace-nowrap transition-colors',
                    filtro === f.id ? 'bg-accent text-white' : 'text-ink-2 active:bg-surface-2',
                  )}
                >
                  {f.rotulo}
                  {f.id === 'avaliados' && avaliados > 0 ? <span className="num ml-1 opacity-80">{avaliados}</span> : null}
                </button>
              ))}
            </div>

            {home.isLoading && !h ? (
              <div className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <EsqueletoM key={i} className="h-24" />
                ))}
              </div>
            ) : lista.length === 0 ? (
              <VazioM
                icone={filtro === 'avaliados' ? Star : ClipboardList}
                titulo={filtro === 'todos' ? 'Nenhum atendimento ainda' : filtro === 'avaliados' ? 'Nenhuma avaliação ainda' : 'Nada neste filtro'}
                texto={filtro === 'todos' ? 'Os chamados que você finalizar aparecem aqui, com a nota do cliente.' : undefined}
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {lista.map((c) => (
                  <li key={c.id}>
                    <LinhaHistorico item={c} aoAbrir={() => navegar(`/chamado/${c.id}`)} />
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </TelaM>
    </>
  )
}

function LinhaHistorico({ item: c, aoAbrir }: { item: HomeMecanico['historico'][number]; aoAbrir: () => void }) {
  const cancelado = c.status === 'cancelado'
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className={cn('flex w-full flex-col gap-2 rounded-[1.25rem] border border-line bg-surface p-3.5 text-left mec-sombra active:scale-[0.99]', cancelado && 'opacity-75')}
    >
      <div className="flex items-center gap-2">
        <span className="num text-[12.5px] font-semibold text-ink-3">{c.protocolo}</span>
        <span className="flex-1" />
        <SeloM tom={cancelado ? 'neutro' : 'ok'}>{STATUS_SOS[c.status].curto}</SeloM>
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[16.5px] font-bold text-ink">{c.cliente_nome}</p>
          <p className="truncate text-[14px] text-ink-2">{c.ocorrencia_rotulo}</p>
        </div>
        <Placa placa={c.placa} tamanho="sm" />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line pt-2 text-[13px] text-ink-3">
        <span className="num">{dataHoraCurta(c.finalizado_em ?? c.recebido_em)}</span>
        {c.nota != null ? <Estrelas valor={c.nota} tamanho="sm" /> : cancelado ? <span>—</span> : <span>Sem avaliação</span>}
      </div>
    </button>
  )
}
