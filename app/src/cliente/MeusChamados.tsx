import { useQuery } from '@tanstack/react-query'
import { Navigate, useNavigate } from 'react-router-dom'
import { ChevronRight, Siren, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sosMeusChamados } from '@/sos/api'
import { OCORRENCIAS, STATUS_SOS, chamadoAtivo, dataHoraCurta, formatarEta } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { ChamadoResumoCliente, StatusSOS } from '@/sos/tipos'
import { BotaoApp, Esqueleto, VazioApp } from '../comum/ui'
import { ErroCarga, IconeOcorrencia, PlacaVeiculo } from './pecas'

/** A lista de socorros agora mora no Histórico (aba "Socorros"). */
export function MeusChamados() {
  return <Navigate to="/historico?tipo=sos" replace />
}

/**
 * Todos os pedidos de socorro do cliente. O que está em andamento vem
 * primeiro; o resto é histórico, em ordem de data.
 */
export function ListaSocorros() {
  const navegar = useNavigate()
  const consulta = useQuery({ queryKey: CHAVES_SOS.meusChamados, queryFn: () => sosMeusChamados(100) })
  const lista = consulta.data ?? []
  const ativos = lista.filter((c) => chamadoAtivo(c.status))
  const anteriores = lista.filter((c) => !chamadoAtivo(c.status))

  if (consulta.isLoading)
    return (
      <div className="flex flex-col gap-2.5">
        {[0, 1, 2].map((i) => (
          <Esqueleto key={i} className="h-24" />
        ))}
      </div>
    )
  if (consulta.isError) return <ErroCarga erro={consulta.error} aoTentar={() => void consulta.refetch()} />
  if (lista.length === 0)
    return (
      <VazioApp
        icone={Siren}
        titulo="Nenhum socorro pedido"
        descricao="Quando precisar, o botão SOS chama a Tecnoar e você acompanha o mecânico chegando pelo mapa."
        acao={
          <BotaoApp variante="sos" icone={Siren} onClick={() => navegar('/sos')}>
            Pedir socorro
          </BotaoApp>
        }
      />
    )

  return (
    <>
      {ativos.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="px-1 font-display text-[15px] font-bold text-crit-ink">Em andamento</h2>
          {ativos.map((c) => (
            <CartaoChamado key={c.id} chamado={c} destaque />
          ))}
        </section>
      )}
      {anteriores.length > 0 && (
        <section className="flex flex-col gap-2.5">
          {ativos.length > 0 && <h2 className="px-1 pt-1 font-display text-[15px] font-bold text-ink">Anteriores</h2>}
          {anteriores.map((c) => (
            <CartaoChamado key={c.id} chamado={c} />
          ))}
        </section>
      )}
    </>
  )
}

const TOM_STATUS: Partial<Record<StatusSOS, string>> = {
  recebido: 'bg-crit-soft text-crit-ink',
  procurando_mecanico: 'bg-crit-soft text-crit-ink',
  aceito: 'bg-accent-soft text-accent-ink',
  a_caminho: 'bg-accent-soft text-accent-ink',
  no_local: 'bg-cyan-soft text-cyan-ink',
  servico_iniciado: 'bg-cyan-soft text-cyan-ink',
  servico_finalizado: 'bg-ok-soft text-ok-ink',
  concluido: 'bg-ok-soft text-ok-ink',
}

export function SeloStatusCliente({ status }: { status: StatusSOS }) {
  return <span className={cn('rounded-full px-2.5 py-1 text-[12px] font-semibold', TOM_STATUS[status] ?? 'bg-surface-2 text-ink-2')}>{STATUS_SOS[status].curto}</span>
}

function CartaoChamado({ chamado: c, destaque }: { chamado: ChamadoResumoCliente; destaque?: boolean }) {
  const navegar = useNavigate()
  const pendenteAvaliar = c.status === 'servico_finalizado' && !c.avaliado_em
  return (
    <button
      type="button"
      onClick={() => navegar(`/chamado/${c.id}`)}
      className={cn(
        'flex w-full flex-col gap-3 rounded-[1.25rem] border bg-surface p-4 text-left transition-transform active:scale-[0.99]',
        destaque ? 'border-crit/35' : 'border-line',
      )}
    >
      <div className="flex items-start gap-3">
        <IconeOcorrencia tipo={c.tipo_ocorrencia} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[16px] leading-tight font-bold text-ink">{OCORRENCIAS[c.tipo_ocorrencia]?.rotulo ?? c.ocorrencia_rotulo}</p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            <span className="num">{c.protocolo}</span> · {dataHoraCurta(c.recebido_em)}
          </p>
        </div>
        <ChevronRight className="mt-1 size-5 shrink-0 text-ink-3" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SeloStatusCliente status={c.status} />
        {c.placa && <PlacaVeiculo placa={c.placa} tamanho="sm" />}
        {c.mecanico_nome && <span className="truncate text-[12.5px] text-ink-2">{c.mecanico_nome.split(' ')[0]}</span>}
        {c.avaliacao_nota != null && (
          <span className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink">
            <Star className="size-3.5 fill-[#f5a524] text-[#f5a524]" /> {c.avaliacao_nota}
          </span>
        )}
      </div>
      {destaque && (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-[13.5px] font-medium text-ink">
          {STATUS_SOS[c.status].cliente}
          {c.status === 'a_caminho' && c.eta_min != null ? ` Chega em ~${formatarEta(c.eta_min)}.` : ''}
        </p>
      )}
      {pendenteAvaliar && <p className="text-[13px] font-semibold text-accent-ink">Toque para avaliar o atendimento</p>}
    </button>
  )
}
