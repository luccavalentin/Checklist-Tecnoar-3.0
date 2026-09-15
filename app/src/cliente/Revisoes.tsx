import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BellRing,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  Check,
  Clock,
  EllipsisVertical,
  FileText,
  Gauge,
  MessageSquareText,
  MoreHorizontal,
  Sun,
  Sunrise,
  Wrench,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/componentes/ui/Toast'
import { sosAtualizarAgendamento, sosMarcarLembrete, sosMeusAgendamentos, sosMeusLembretes, sosSolicitarAgendamento } from '@/sos/api'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { AgendamentoSOS, LembreteSOS, StatusAgendamento, TipoAgendamento } from '@/sos/tipos'
import { useCliente } from '../sessao'
import { AreaApp, BotaoApp, CabecalhoTela, CampoApp, Esqueleto, Faixa, Folha, Tela, VazioApp } from '../comum/ui'
import { CHAVE_LEMBRETES, dataLonga, kmTexto, nomeVeiculo, useMeusVeiculos, type EstadoAgendar } from './dados'
import { ErroCarga, Escolha, PlacaVeiculo } from './pecas'

const TIPOS: Record<TipoAgendamento, { rotulo: string; icone: typeof Wrench }> = {
  revisao: { rotulo: 'Revisão', icone: CalendarCheck },
  manutencao: { rotulo: 'Manutenção', icone: Wrench },
  orcamento: { rotulo: 'Orçamento', icone: FileText },
  outro: { rotulo: 'Outro', icone: MoreHorizontal },
}

const STATUS: Record<StatusAgendamento, { rotulo: string; classe: string }> = {
  solicitado: { rotulo: 'Aguardando confirmação', classe: 'bg-warn-soft text-warn-ink' },
  confirmado: { rotulo: 'Confirmado', classe: 'bg-ok-soft text-ok-ink' },
  realizado: { rotulo: 'Realizado', classe: 'bg-cyan-soft text-cyan-ink' },
  cancelado: { rotulo: 'Cancelado', classe: 'bg-surface-2 text-ink-3' },
}

const PERIODO: Record<'manha' | 'tarde' | 'qualquer', string> = { manha: 'Manhã', tarde: 'Tarde', qualquer: 'Qualquer horário' }

/**
 * Revisões e agendamentos — o lado "dia a dia" do app. Lembretes vêm do
 * Checklist (tempo e km desde a última OS); o agendamento é um pedido curto
 * que a Tecnoar confirma com dia e hora.
 */
export function Revisoes() {
  const qc = useQueryClient()
  const toast = useToast()
  const [busca, setBusca] = useSearchParams()
  const estadoRota = (useLocation().state ?? null) as EstadoAgendar | null
  const [formulario, setFormulario] = useState<EstadoAgendar | null>(busca.get('agendar') ? (estadoRota ?? {}) : null)
  const [cancelando, setCancelando] = useState<AgendamentoSOS | null>(null)
  const veiculos = useMeusVeiculos()

  // O pedido de abrir o formulário vem pela URL (?agendar=1); limpa para o voltar não reabrir.
  useEffect(() => {
    if (busca.get('agendar')) setBusca({}, { replace: true })
  }, [busca, setBusca])

  const lembretes = useQuery({ queryKey: CHAVE_LEMBRETES, queryFn: sosMeusLembretes })
  const agendamentos = useQuery({ queryKey: CHAVES_SOS.agendamentos, queryFn: sosMeusAgendamentos })

  const marcar = useMutation({
    mutationFn: (p: { id: string; dispensar: boolean }) => sosMarcarLembrete(p.id, p.dispensar),
    onSuccess: (_r, p) => {
      void qc.invalidateQueries({ queryKey: CHAVE_LEMBRETES })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeCliente })
      if (p.dispensar) toast.info('Lembrete dispensado')
    },
    onError: (e) => toast.erro('Não foi possível atualizar', (e as Error).message),
  })

  const lista = agendamentos.data ?? []
  const abertos = lista.filter((a) => a.status === 'solicitado' || a.status === 'confirmado')
  const anteriores = lista.filter((a) => a.status === 'realizado' || a.status === 'cancelado')
  const placaDe = (id: string | null) => veiculos.data?.find((v) => v.id === id) ?? null

  return (
    <>
      <CabecalhoTela titulo="Revisões" subtitulo="Manutenção preventiva e agendamentos" voltar />
      <Tela className="entrada-suave">
        <section className="flex flex-col gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
              <CalendarPlus className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-[17px] leading-tight font-bold text-ink">Cuide antes de quebrar</p>
              <p className="mt-1 text-[14px] leading-snug text-ink-2">Escolha o dia que prefere. A Tecnoar confirma o horário e avisa você.</p>
            </div>
          </div>
          <BotaoApp tamanho="lg" largo icone={CalendarPlus} onClick={() => setFormulario({})}>
            Agendar revisão
          </BotaoApp>
        </section>

        {/* lembretes */}
        <section className="flex flex-col gap-2.5">
          <h2 className="px-1 pt-1 font-display text-[15px] font-bold text-ink">Próximas revisões</h2>
          {lembretes.isLoading ? (
            <Esqueleto className="h-24" />
          ) : lembretes.isError ? (
            <ErroCarga erro={lembretes.error} aoTentar={() => void lembretes.refetch()} />
          ) : (lembretes.data ?? []).length === 0 ? (
            <div className="flex items-center gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-ok-soft text-ok">
                <Check className="size-5" />
              </span>
              <p className="text-[14px] leading-snug text-ink-2">Tudo em dia. Avisamos quando chegar a hora, por tempo ou quilometragem.</p>
            </div>
          ) : (
            (lembretes.data ?? []).map((l) => (
              <CartaoLembrete
                key={l.id}
                lembrete={l}
                veiculo={placaDe(l.veiculo_id)}
                ocupado={marcar.isPending}
                aoAgendar={() => {
                  if (!l.lido_em) marcar.mutate({ id: l.id, dispensar: false })
                  setFormulario({ tipo: 'revisao', veiculoId: l.veiculo_id ?? undefined, descricao: l.titulo })
                }}
                aoLer={() => marcar.mutate({ id: l.id, dispensar: false })}
                aoDispensar={() => marcar.mutate({ id: l.id, dispensar: true })}
              />
            ))
          )}
        </section>

        {/* agendamentos */}
        <section className="flex flex-col gap-2.5">
          <h2 className="px-1 pt-1 font-display text-[15px] font-bold text-ink">Meus agendamentos</h2>
          {agendamentos.isLoading ? (
            <Esqueleto className="h-28" />
          ) : agendamentos.isError ? (
            <ErroCarga erro={agendamentos.error} aoTentar={() => void agendamentos.refetch()} />
          ) : lista.length === 0 ? (
            <VazioApp icone={CalendarClock} titulo="Nenhum agendamento" descricao="Peça uma revisão, manutenção ou orçamento em poucos toques." />
          ) : (
            <>
              {abertos.map((a) => (
                <CartaoAgendamento key={a.id} agendamento={a} veiculo={placaDe(a.veiculo_id)} aoCancelar={() => setCancelando(a)} />
              ))}
              {anteriores.length > 0 && <h3 className="px-1 pt-2 text-[13.5px] font-semibold text-ink-3">Anteriores</h3>}
              {anteriores.map((a) => (
                <CartaoAgendamento key={a.id} agendamento={a} veiculo={placaDe(a.veiculo_id)} />
              ))}
            </>
          )}
        </section>
      </Tela>

      <FolhaAgendar inicial={formulario} aoFechar={() => setFormulario(null)} />
      <FolhaCancelarAgendamento agendamento={cancelando} aoFechar={() => setCancelando(null)} />
    </>
  )
}

type VeiculoMin = { id: string; placa: string; marca: string | null; modelo: string | null; descricao: string | null } | null

function CartaoLembrete({
  lembrete: l,
  veiculo,
  ocupado,
  aoAgendar,
  aoLer,
  aoDispensar,
}: {
  lembrete: LembreteSOS
  veiculo: VeiculoMin
  ocupado: boolean
  aoAgendar: () => void
  aoLer: () => void
  aoDispensar: () => void
}) {
  const [menu, setMenu] = useState(false)
  const vencida = l.vence_em ? new Date(l.vence_em).getTime() < Date.now() : false
  return (
    <article className={cn('flex flex-col gap-3 rounded-[1.25rem] border bg-surface p-4', l.lido_em ? 'border-line' : 'border-warn/45')}>
      <div className="flex items-start gap-3">
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', l.tipo === 'km' ? 'bg-cyan-soft text-cyan-ink' : 'bg-warn-soft text-warn-ink')}>
          {l.tipo === 'km' ? <Gauge className="size-5" /> : <BellRing className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15.5px] leading-snug font-bold text-ink">{l.titulo}</p>
          {l.mensagem && <p className="mt-0.5 text-[13.5px] leading-snug text-ink-2">{l.mensagem}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
            {veiculo && <PlacaVeiculo placa={veiculo.placa} tamanho="sm" />}
            {l.vence_em && (
              <span className={cn('rounded-full px-2 py-0.5 font-semibold', vencida ? 'bg-crit-soft text-crit-ink' : 'bg-surface-2 text-ink-2')}>
                {vencida ? 'Venceu em ' : 'Vence em '}
                {dataLonga(l.vence_em)}
              </span>
            )}
            {l.vence_km != null && <span className="sos-chip rounded-full px-2 py-0.5 font-semibold text-ink-2">aos {kmTexto(l.vence_km)}</span>}
            {!l.lido_em && <span className="rounded-full bg-accent px-2 py-0.5 font-bold text-white">Novo</span>}
          </div>
        </div>
        <div className="relative">
          <button type="button" aria-label="Mais opções" aria-expanded={menu} onClick={() => setMenu((m) => !m)} className="-mt-1 -mr-2 flex size-10 items-center justify-center rounded-full text-ink-3">
            <EllipsisVertical className="size-5" />
          </button>
          {menu && (
            <div className="sos-card entrada-suave absolute top-10 right-0 z-10 flex w-48 flex-col overflow-hidden rounded-xl shadow-e3">
              {!l.lido_em && (
                <button type="button" disabled={ocupado} onClick={() => { setMenu(false); aoLer() }} className="flex min-h-12 items-center gap-2 px-4 text-left text-[14px] text-ink active:bg-surface-2">
                  <Check className="size-4" /> Marcar como lido
                </button>
              )}
              <button type="button" disabled={ocupado} onClick={() => { setMenu(false); aoDispensar() }} className="flex min-h-12 items-center gap-2 px-4 text-left text-[14px] text-ink active:bg-surface-2">
                <X className="size-4" /> Dispensar
              </button>
            </div>
          )}
        </div>
      </div>
      <BotaoApp variante="neutro" tamanho="md" largo icone={CalendarPlus} onClick={aoAgendar}>
        Agendar esta revisão
      </BotaoApp>
    </article>
  )
}

function CartaoAgendamento({ agendamento: a, veiculo, aoCancelar }: { agendamento: AgendamentoSOS; veiculo: VeiculoMin; aoCancelar?: () => void }) {
  const t = TIPOS[a.tipo] ?? TIPOS.outro
  const s = STATUS[a.status]
  const Icone = t.icone
  return (
    <article className={cn('flex flex-col gap-3 rounded-[1.25rem] border border-line bg-surface p-4', a.status === 'cancelado' && 'opacity-70')}>
      <div className="flex items-start gap-3">
        <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', a.status === 'confirmado' ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-ink-2')}>
          <Icone className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-display text-[15.5px] font-bold text-ink">{t.rotulo}</p>
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold', s.classe)}>{s.rotulo}</span>
          </div>
          {a.status === 'confirmado' && a.data_confirmada ? (
            <p className="mt-1 text-[14.5px] font-semibold text-ok-ink">
              {new Date(a.data_confirmada).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-2">
              <Clock className="size-3.5 text-ink-3" />
              {a.data_preferida ? `Prefere ${dataLonga(a.data_preferida)}` : 'Sem data preferida'}
              {a.periodo ? ` · ${PERIODO[a.periodo]}` : ''}
            </p>
          )}
          {veiculo && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PlacaVeiculo placa={veiculo.placa} tamanho="sm" />
              <span className="text-[12.5px] text-ink-3">{nomeVeiculo(veiculo)}</span>
            </div>
          )}
        </div>
      </div>
      {a.descricao && <p className="sos-chip rounded-xl px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink-2">{a.descricao}</p>}
      {a.observacoes_equipe && (
        <p className="flex items-start gap-2 text-[13.5px] leading-snug text-ink">
          <MessageSquareText className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>
            <strong className="font-semibold">Tecnoar:</strong> {a.observacoes_equipe}
          </span>
        </p>
      )}
      {aoCancelar && (
        <button type="button" onClick={aoCancelar} className="flex min-h-11 items-center justify-center rounded-xl text-[13.5px] font-semibold text-crit-ink active:bg-crit-soft">
          Cancelar agendamento
        </button>
      )}
    </article>
  )
}

/* ── formulário de agendamento ──────────────────────────────────────────── */

function hojeISO(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

function FolhaAgendar({ inicial, aoFechar }: { inicial: EstadoAgendar | null; aoFechar: () => void }) {
  const { conta } = useCliente()
  const qc = useQueryClient()
  const toast = useToast()
  const veiculos = useMeusVeiculos()
  const [tipo, setTipo] = useState<TipoAgendamento>('revisao')
  const [veiculoId, setVeiculoId] = useState<string | null>(null)
  const [data, setData] = useState('')
  const [periodo, setPeriodo] = useState<'manha' | 'tarde' | 'qualquer'>('qualquer')
  const [descricao, setDescricao] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  // Cada abertura começa do pré-preenchimento recebido (lembrete, TECNO IA, veículo).
  useEffect(() => {
    if (!inicial) return
    setTipo(inicial.tipo ?? 'revisao')
    setVeiculoId(inicial.veiculoId ?? conta.veiculo_principal_id ?? null)
    setDescricao(inicial.descricao ?? '')
    setData('')
    setPeriodo('qualquer')
    setErro(null)
  }, [inicial, conta.veiculo_principal_id])

  const lista = veiculos.data ?? []
  const escolhido = veiculoId ?? lista[0]?.id ?? null

  const salvar = useMutation({
    mutationFn: () =>
      sosSolicitarAgendamento({
        tipo,
        veiculo_id: escolhido,
        descricao: descricao.trim() || null,
        data_preferida: data || null,
        periodo,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.agendamentos })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeCliente })
      toast.ok('Pedido enviado', 'A Tecnoar vai confirmar o dia e o horário. Você recebe um aviso.')
      aoFechar()
    },
    onError: (e) => setErro((e as Error).message),
  })

  function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (data && data < hojeISO()) return setErro('Escolha uma data a partir de hoje.')
    salvar.mutate()
  }

  return (
    <Folha
      aberta={!!inicial}
      aoFechar={aoFechar}
      titulo="Agendar serviço"
      descricao="Leva menos de um minuto."
      rodape={
        <>
          {erro && <Faixa tom="critico">{erro}</Faixa>}
          <BotaoApp type="submit" form="form-agendar" tamanho="lg" largo carregando={salvar.isPending}>
            Enviar pedido
          </BotaoApp>
        </>
      }
    >
      <form id="form-agendar" onSubmit={enviar} className="flex flex-col gap-5 pb-2">
        <Escolha
          rotulo="O que você precisa?"
          colunas={2}
          valor={tipo}
          aoMudar={setTipo}
          opcoes={(Object.keys(TIPOS) as TipoAgendamento[]).map((t) => ({ valor: t, rotulo: TIPOS[t].rotulo, icone: TIPOS[t].icone }))}
        />

        {lista.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink-2">Veículo</span>
            <div className="flex flex-col gap-2">
              {lista.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={escolhido === v.id}
                  onClick={() => setVeiculoId(v.id)}
                  className={cn(
                    'flex min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left',
                    escolhido === v.id ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface text-ink-2',
                  )}
                >
                  <PlacaVeiculo placa={v.placa} tamanho="sm" />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{nomeVeiculo(v)}</span>
                  {escolhido === v.id && <Check className="size-4 text-accent" />}
                </button>
              ))}
            </div>
          </div>
        )}

        <CampoApp rotulo="Data que prefere (opcional)" type="date" min={hojeISO()} value={data} onChange={(e) => setData(e.target.value)} />

        <Escolha
          rotulo="Período"
          valor={periodo}
          aoMudar={setPeriodo}
          opcoes={[
            { valor: 'manha', rotulo: 'Manhã', icone: Sunrise },
            { valor: 'tarde', rotulo: 'Tarde', icone: Sun },
            { valor: 'qualquer', rotulo: 'Tanto faz', icone: Clock },
          ]}
        />

        <AreaApp
          rotulo="Conte o que precisa (opcional)"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          maxLength={600}
          rows={3}
          placeholder="Ex.: revisão dos freios, barulho na roda traseira"
        />
      </form>
    </Folha>
  )
}

function FolhaCancelarAgendamento({ agendamento, aoFechar }: { agendamento: AgendamentoSOS | null; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const cancelar = useMutation({
    mutationFn: (id: string) => sosAtualizarAgendamento(id, 'cancelado'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.agendamentos })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeCliente })
      toast.ok('Agendamento cancelado')
      aoFechar()
    },
  })
  return (
    <Folha
      aberta={!!agendamento}
      aoFechar={aoFechar}
      titulo="Cancelar este agendamento?"
      descricao="A Tecnoar é avisada. Você pode pedir outro quando quiser."
      rodape={
        <>
          {cancelar.isError && <Faixa tom="critico">{(cancelar.error as Error).message}</Faixa>}
          <BotaoApp variante="perigo" tamanho="lg" largo carregando={cancelar.isPending} onClick={() => agendamento && cancelar.mutate(agendamento.id)}>
            Cancelar agendamento
          </BotaoApp>
          <BotaoApp variante="fantasma" tamanho="md" largo onClick={aoFechar}>
            Manter
          </BotaoApp>
        </>
      }
    />
  )
}
