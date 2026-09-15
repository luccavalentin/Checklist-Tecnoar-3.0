import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck2, CalendarClock, CalendarX2, CheckCheck, ClipboardList, RotateCw } from 'lucide-react'
import { cn, mensagemErro } from '@/lib/utils'
import { data as formatarData } from '@/lib/formatos'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada } from '@/componentes/ui/Campo'
import { Esqueleto, EstadoVazio } from '@/componentes/ui/Estados'
import { Selo, type TomSelo } from '@/componentes/ui/Selo'
import { Confirmacao, Modal } from '@/componentes/ui/Sobreposicoes'
import { useToast } from '@/componentes/ui/Toast'
import { sosAgendamentosCentral, sosAtualizarAgendamento } from '@/sos/api'
import { CHAVES_SOS } from '@/sos/tempoReal'
import { dataHoraCurta, haQuanto } from '@/sos/rotulos'
import type { StatusAgendamento, TipoAgendamento } from '@/sos/tipos'
import { ContatoRapido, ErroSOS, Placa } from './comum'

type Agendamento = Awaited<ReturnType<typeof sosAgendamentosCentral>>[number]

const ROTULO_TIPO: Record<TipoAgendamento, string> = {
  revisao: 'Revisão',
  manutencao: 'Manutenção',
  orcamento: 'Orçamento',
  outro: 'Outro',
}

const STATUS: Record<StatusAgendamento, { rotulo: string; tom: TomSelo }> = {
  solicitado: { rotulo: 'Aguardando confirmação', tom: 'destaque' },
  confirmado: { rotulo: 'Confirmado', tom: 'info' },
  realizado: { rotulo: 'Realizado', tom: 'ok' },
  cancelado: { rotulo: 'Cancelado', tom: 'neutro' },
}

const PERIODO: Record<string, string> = { manha: 'manhã', tarde: 'tarde', qualquer: 'qualquer horário' }

type Filtro = StatusAgendamento | 'todos'

/**
 * Pedidos de revisão e manutenção feitos pelo cliente no app. A central
 * confirma a data (o cliente é avisado no app), marca como realizado ou
 * cancela — sempre com a observação que o cliente vai ler.
 */
export function Agendamentos({ podeEditar }: { podeEditar: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [filtro, setFiltro] = useState<Filtro>('solicitado')
  const [confirmando, setConfirmando] = useState<Agendamento | null>(null)
  const [cancelando, setCancelando] = useState<Agendamento | null>(null)
  const [realizando, setRealizando] = useState<Agendamento | null>(null)

  const consulta = useQuery({
    queryKey: CHAVES_SOS.agendamentos,
    staleTime: 20_000,
    queryFn: sosAgendamentosCentral,
  })

  const atualizar = useMutation({
    mutationFn: (p: { id: string; status: StatusAgendamento; dataConfirmada?: string | null; observacoes?: string | null }) =>
      sosAtualizarAgendamento(p.id, p.status, { dataConfirmada: p.dataConfirmada, observacoes: p.observacoes }),
    onSuccess: (_r, p) => {
      setConfirmando(null)
      setCancelando(null)
      setRealizando(null)
      toast.ok(
        p.status === 'confirmado' ? 'Agendamento confirmado' : p.status === 'realizado' ? 'Marcado como realizado' : 'Agendamento cancelado',
        'O cliente foi avisado no app.',
      )
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.agendamentos })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.indicadores })
    },
    onError: (e) => toast.erro('Não foi possível atualizar', mensagemErro(e)),
  })

  const lista = consulta.data ?? []
  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = { todos: lista.length, solicitado: 0, confirmado: 0, realizado: 0, cancelado: 0 }
    for (const a of lista) c[a.status] += 1
    return c
  }, [lista])
  const visiveis = filtro === 'todos' ? lista : lista.filter((a) => a.status === filtro)

  const FILTROS: Array<{ valor: Filtro; rotulo: string }> = [
    { valor: 'solicitado', rotulo: 'Pendentes' },
    { valor: 'confirmado', rotulo: 'Confirmados' },
    { valor: 'realizado', rotulo: 'Realizados' },
    { valor: 'cancelado', rotulo: 'Cancelados' },
    { valor: 'todos', rotulo: 'Todos' },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div role="tablist" aria-label="Situação do agendamento" className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto [scrollbar-width:none]">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              type="button"
              role="tab"
              aria-selected={filtro === f.valor}
              onClick={() => setFiltro(f.valor)}
              className={cn(
                'flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors',
                filtro === f.valor ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink-2 hover:text-ink',
              )}
            >
              {f.rotulo}
              <span className={cn('num rounded-full px-1.5 text-[11px]', filtro === f.valor ? 'bg-surface/20' : 'bg-surface-2')}>{contagem[f.valor]}</span>
            </button>
          ))}
        </div>
        <BotaoIcone rotulo="Atualizar" variante="neutro" onClick={() => void consulta.refetch()} disabled={consulta.isFetching}>
          <RotateCw className={consulta.isFetching ? 'animate-spin' : undefined} />
        </BotaoIcone>
      </div>

      {consulta.isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <Esqueleto key={i} className="h-44 rounded-lg" />
          ))}
        </div>
      ) : consulta.isError ? (
        <ErroSOS erro={consulta.error} aoTentarNovamente={() => void consulta.refetch()} />
      ) : visiveis.length === 0 ? (
        <EstadoVazio
          icone={<CalendarClock />}
          titulo={filtro === 'solicitado' ? 'Nenhum pedido pendente' : 'Nada por aqui'}
          descricao={
            filtro === 'solicitado'
              ? 'Quando um cliente pedir revisão ou manutenção pelo app, o pedido aparece aqui e a central recebe uma notificação.'
              : 'Nenhum agendamento nesta situação.'
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {visiveis.map((a) => (
            <li key={a.id}>
              <CartaoAgendamento
                a={a}
                podeEditar={podeEditar}
                ocupado={atualizar.isPending}
                aoConfirmar={() => setConfirmando(a)}
                aoRealizar={() => setRealizando(a)}
                aoCancelar={() => setCancelando(a)}
              />
            </li>
          ))}
        </ul>
      )}

      <ModalConfirmarData
        agendamento={confirmando}
        aoFechar={() => setConfirmando(null)}
        carregando={atualizar.isPending}
        aoSalvar={(dataConfirmada, observacoes) =>
          confirmando && atualizar.mutate({ id: confirmando.id, status: 'confirmado', dataConfirmada, observacoes })
        }
      />

      <ModalCancelarAgendamento
        agendamento={cancelando}
        aoFechar={() => setCancelando(null)}
        carregando={atualizar.isPending}
        aoSalvar={(observacoes) => cancelando && atualizar.mutate({ id: cancelando.id, status: 'cancelado', observacoes })}
      />

      <Confirmacao
        aberto={!!realizando}
        aoFechar={() => setRealizando(null)}
        aoConfirmar={() => realizando && atualizar.mutate({ id: realizando.id, status: 'realizado' })}
        carregando={atualizar.isPending}
        titulo="Marcar como realizado?"
        rotuloConfirmar="Marcar realizado"
        descricao={`${realizando?.cliente?.nome_razao ?? 'O cliente'} recebe o aviso de que a ${ROTULO_TIPO[realizando?.tipo ?? 'revisao'].toLowerCase()} foi feita.`}
      />
    </div>
  )
}

function CartaoAgendamento({
  a,
  podeEditar,
  ocupado,
  aoConfirmar,
  aoRealizar,
  aoCancelar,
}: {
  a: Agendamento
  podeEditar: boolean
  ocupado: boolean
  aoConfirmar: () => void
  aoRealizar: () => void
  aoCancelar: () => void
}) {
  const aberto = a.status === 'solicitado' || a.status === 'confirmado'
  return (
    <article
      className={cn(
        'aresta relative flex h-full flex-col gap-3 overflow-hidden rounded-lg border bg-surface p-4 shadow-e1',
        a.status === 'solicitado' ? 'border-accent/40' : 'border-line',
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px]', a.status === 'solicitado' ? 'bg-accent' : a.status === 'confirmado' ? 'bg-cyan' : a.status === 'realizado' ? 'bg-ok' : 'bg-line-strong')} />
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="lbl">{ROTULO_TIPO[a.tipo]}</p>
          <p className="mt-1 truncate text-[15px] font-semibold text-ink">{a.cliente?.nome_razao ?? 'Cliente'}</p>
          <p className="mt-0.5 flex min-w-0 items-center gap-2 text-[12.5px] text-ink-2">
            {a.veiculo ? (
              <>
                <Placa placa={a.veiculo.placa} />
                <span className="truncate">{[a.veiculo.marca, a.veiculo.modelo].filter(Boolean).join(' ')}</span>
              </>
            ) : (
              'Veículo não informado'
            )}
          </p>
        </div>
        <Selo tom={STATUS[a.status].tom} ponto>
          {STATUS[a.status].rotulo}
        </Selo>
      </header>

      <dl className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 px-3 py-2.5">
        <div className="min-w-0">
          <dt className="text-[11px] text-ink-3">Preferência do cliente</dt>
          <dd className="text-[13px] font-medium text-ink">
            {a.data_preferida ? formatarData(a.data_preferida) : 'Sem data'}
            {a.periodo ? <span className="font-normal text-ink-2"> · {PERIODO[a.periodo] ?? a.periodo}</span> : null}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] text-ink-3">Data confirmada</dt>
          <dd className={cn('num text-[13px] font-medium', a.data_confirmada ? 'text-cyan-ink' : 'text-ink-3')}>
            {a.data_confirmada ? dataHoraCurta(a.data_confirmada) : '—'}
          </dd>
        </div>
      </dl>

      {a.descricao && <p className="text-[13px] leading-relaxed whitespace-pre-line text-ink-2">{a.descricao}</p>}
      {a.observacoes_equipe && (
        <p className="rounded-md border-l-2 border-cyan bg-cyan-soft/50 px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">
          <span className="font-semibold text-ink">Equipe: </span>
          {a.observacoes_equipe}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-3 border-t border-line pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11.5px] text-ink-3">Pedido {haQuanto(a.created_at)}</span>
          <ContatoRapido telefone={a.cliente?.celular} mensagem={`Olá! Aqui é a Tecnoar, sobre o seu pedido de ${ROTULO_TIPO[a.tipo].toLowerCase()}.`} compacto />
        </div>
        {podeEditar && aberto && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Botao tamanho="sm" variante={a.status === 'solicitado' ? 'primario' : 'neutro'} iconeInicio={<CalendarCheck2 />} disabled={ocupado} onClick={aoConfirmar} className="h-10">
              {a.status === 'solicitado' ? 'Confirmar' : 'Remarcar'}
            </Botao>
            <Botao tamanho="sm" variante="secundario" iconeInicio={<CheckCheck />} disabled={ocupado} onClick={aoRealizar} className="h-10">
              Realizado
            </Botao>
            <Botao tamanho="sm" variante="destrutivo" iconeInicio={<CalendarX2 />} disabled={ocupado} onClick={aoCancelar} className="h-10">
              Cancelar
            </Botao>
          </div>
        )}
      </div>
    </article>
  )
}

/** "2026-09-15T08:00" — o formato do campo datetime-local, no fuso do aparelho. */
function paraCampoDataHora(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function sugestaoInicial(a: Agendamento): string {
  if (a.data_confirmada) return paraCampoDataHora(a.data_confirmada)
  const base = a.data_preferida ? new Date(`${a.data_preferida}T12:00:00`) : new Date(Date.now() + 86_400_000)
  base.setHours(a.periodo === 'tarde' ? 14 : 8, 0, 0, 0)
  return paraCampoDataHora(base.toISOString())
}

function ModalConfirmarData({
  agendamento,
  aoFechar,
  aoSalvar,
  carregando,
}: {
  agendamento: Agendamento | null
  aoFechar: () => void
  aoSalvar: (dataIso: string, observacoes: string | null) => void
  carregando: boolean
}) {
  const [quando, setQuando] = useState('')
  const [obs, setObs] = useState('')

  // Cada abertura parte da preferência do cliente (ou da data já marcada).
  useEffect(() => {
    if (!agendamento) return
    setQuando(sugestaoInicial(agendamento))
    setObs(agendamento.observacoes_equipe ?? '')
  }, [agendamento])

  const valida = !!quando && !Number.isNaN(new Date(quando).getTime())

  return (
    <Modal
      aberto={!!agendamento}
      aoFechar={aoFechar}
      titulo={agendamento?.status === 'confirmado' ? 'Remarcar agendamento' : 'Confirmar agendamento'}
      descricao={agendamento ? `${agendamento.cliente?.nome_razao ?? 'Cliente'} · ${ROTULO_TIPO[agendamento.tipo]}` : undefined}
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar} disabled={carregando}>
            Voltar
          </Botao>
          <Botao variante="primario" iconeInicio={<CalendarCheck2 />} carregando={carregando} disabled={!valida} onClick={() => aoSalvar(new Date(quando).toISOString(), obs.trim() || null)}>
            Confirmar data
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Campo rotulo="Data e hora" obrigatorio>
          {(p) => <Entrada {...p} type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />}
        </Campo>
        <Campo rotulo="Observação para o cliente" dica="Aparece no app junto com a confirmação.">
          {(p) => <AreaTexto {...p} rows={3} value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Ex.: traga o veículo com o tanque de ar cheio" />}
        </Campo>
      </div>
    </Modal>
  )
}

function ModalCancelarAgendamento({
  agendamento,
  aoFechar,
  aoSalvar,
  carregando,
}: {
  agendamento: Agendamento | null
  aoFechar: () => void
  aoSalvar: (observacoes: string) => void
  carregando: boolean
}) {
  const [motivo, setMotivo] = useState('')
  return (
    <Modal
      aberto={!!agendamento}
      aoFechar={() => {
        setMotivo('')
        aoFechar()
      }}
      titulo="Cancelar agendamento"
      descricao="O cliente é avisado no app com o motivo abaixo."
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar} disabled={carregando}>
            Voltar
          </Botao>
          <Botao
            variante="destrutivo"
            iconeInicio={<ClipboardList />}
            carregando={carregando}
            disabled={motivo.trim().length < 3}
            onClick={() => {
              aoSalvar(motivo.trim())
              setMotivo('')
            }}
          >
            Cancelar agendamento
          </Botao>
        </>
      }
    >
      <Campo rotulo="Motivo" obrigatorio>
        {(p) => <AreaTexto {...p} rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: não temos vaga nesta semana, ligaremos para remarcar" />}
      </Campo>
    </Modal>
  )
}
