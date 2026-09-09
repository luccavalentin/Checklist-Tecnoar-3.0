import { useMemo, useState, useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Gauge,
  Hand,
  Pause,
  Play,
  RefreshCw,
  Truck,
  Wrench,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { CabecalhoPagina } from '@/componentes/ui/Painel'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { AreaTexto, Campo } from '@/componentes/ui/Campo'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { Metrica } from '@/componentes/ui/Metrica'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'
import { TOM_COR_STATUS } from '@/paginas/cadastros/StatusOS'
import type { MinhaTarefa } from '@/tipos/db'

/* ═══════════════════════════════════════════════════════════════
   COLUNAS DO QUADRO — cores semânticas do sistema, não decorativas:
   cyan = ao vivo/em execução, âmbar = exige atenção (pausado),
   verde = concluído, neutro = estrutura (pendente/fila).
   ═══════════════════════════════════════════════════════════════ */
type ColunaId = 'pendente' | 'executando' | 'pausado' | 'concluido'

const COLUNAS: Array<{
  id: ColunaId
  rotulo: string
  barra: string
  texto: string
  icone: React.ReactNode
}> = [
  { id: 'pendente', rotulo: 'Pendente', barra: 'bg-ink-3', texto: 'text-ink-2', icone: <Clock className="size-3.5" /> },
  { id: 'executando', rotulo: 'Em execução', barra: 'bg-cyan', texto: 'text-cyan-ink', icone: <Play className="size-3.5" /> },
  { id: 'pausado', rotulo: 'Pausado', barra: 'bg-warn', texto: 'text-warn-ink', icone: <Pause className="size-3.5" /> },
  { id: 'concluido', rotulo: 'Concluído', barra: 'bg-ok', texto: 'text-ok-ink', icone: <CheckCircle2 className="size-3.5" /> },
]

function formatarTempo(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function ColunaQuadro({
  coluna,
  tarefas,
  onAction,
  carregando,
  podeAgir,
}: {
  coluna: (typeof COLUNAS)[number]
  tarefas: MinhaTarefa[]
  onAction: (tipo: 'play' | 'pause' | 'resume' | 'finish' | 'open' | 'checklist', tarefa: MinhaTarefa) => void
  carregando: boolean
  podeAgir: boolean
}) {
  return (
    <section className="flex max-h-[calc(100vh-260px)] flex-col rounded-lg border border-line bg-surface">
      <header className="flex items-center gap-2 border-b border-line px-3.5 py-3">
        <span aria-hidden className={cn('inline-flex', coluna.texto)}>
          {coluna.icone}
        </span>
        <h3 className="lbl flex-1 text-ink-2">{coluna.rotulo}</h3>
        <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2">
          {tarefas.length}
        </span>
      </header>
      <span aria-hidden className={cn('h-0.5 w-full', coluna.barra)} />

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <div className="flex flex-col gap-2.5">
          {tarefas.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-8 text-center">
              <CheckCircle2 aria-hidden className="size-5 text-ink-3" />
              <p className="text-[11.5px] text-ink-3">Nenhuma tarefa</p>
            </div>
          ) : (
            tarefas.map((t) => (
              <CardTarefa key={t.os_id} tarefa={t} onAction={onAction} carregando={carregando} podeAgir={podeAgir} />
            ))
          )}
        </div>
      </div>
    </section>
  )
}

function CardTarefa({
  tarefa,
  onAction,
  carregando,
  podeAgir,
}: {
  tarefa: MinhaTarefa
  onAction: (tipo: 'play' | 'pause' | 'resume' | 'finish' | 'open' | 'checklist', tarefa: MinhaTarefa) => void
  /** Uma ação em andamento: os botões travam para não disparar duas vezes. */
  carregando: boolean
  /** Sem permissão de editar, os botões de execução não aparecem. */
  podeAgir: boolean
}) {
  const [tempo, setTempo] = useState(0)
  const [expandido, setExpandido] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()

  const executando = tarefa.apontamento_situacao === 'em_execucao'
  const pausado = tarefa.apontamento_situacao === 'pausado'

  useEffect(() => {
    if (executando && tarefa.apontamento_iniciado_em) {
      setTempo(Date.now() - new Date(tarefa.apontamento_iniciado_em).getTime())
      intervalRef.current = setInterval(() => setTempo((t) => t + 1000), 1000)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [executando, tarefa.apontamento_iniciado_em])

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-line-strong">
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 w-[3px]',
          executando ? 'bg-cyan' : pausado ? 'bg-warn' : tarefa.prioridade > 0 ? 'bg-accent' : 'bg-ink-3',
        )}
      />

      <div className="flex flex-col gap-2.5 p-3 pl-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-md border',
                executando ? 'border-cyan/35 bg-cyan-soft text-cyan-ink' : 'border-line text-ink-3',
              )}
            >
              <Truck aria-hidden className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="num truncate text-[14px] font-semibold text-ink">{tarefa.placa}</p>
              <p className="truncate text-[11.5px] text-ink-3">{tarefa.cliente_nome}</p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-1">
            {tarefa.status_nome && (
              <Selo tom={TOM_COR_STATUS[tarefa.status_cor ?? 'neutro'] ?? 'neutro'} className="text-[10px]">
                {tarefa.status_nome}
              </Selo>
            )}
            {executando && (
              <span className="flex items-center gap-1.5 rounded-full bg-cyan-soft px-2 py-0.5">
                <span aria-hidden className="pulso-ativo size-1.5 rounded-full bg-cyan" />
                <span className="num text-[11px] font-semibold text-cyan-ink">{formatarTempo(tempo)}</span>
              </span>
            )}
            {tarefa.prioridade > 0 && (
              <Selo tom="destaque" className="text-[10px]">
                <AlertCircle className="size-2.5" />
                Urgente
              </Selo>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
          <span className="num rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-ink-2">
            OS {String(tarefa.os_numero).padStart(5, '0')}
          </span>
          <span className="truncate">{tarefa.veiculo_descricao}</span>
        </div>

        {tarefa.problema_alegado && (
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            className="rounded-md border border-line bg-surface-2 px-2.5 py-2 text-left transition-colors hover:border-line-strong"
          >
            <p className={cn('text-[12px] leading-relaxed text-ink-2', !expandido && 'line-clamp-2')}>
              {tarefa.problema_alegado}
            </p>
            {tarefa.problema_alegado.length > 80 && (
              <span className="mt-1 inline-block text-[11px] font-medium text-cyan-ink">
                {expandido ? 'Ver menos' : 'Ver mais'}
              </span>
            )}
          </button>
        )}

        {tarefa.checklists_abertos > 0 && (
          <div className="flex items-center gap-1.5 rounded-md border border-warn/30 bg-warn-soft px-2.5 py-1.5">
            <ClipboardCheck aria-hidden className="size-3.5 text-warn-ink" />
            <span className="text-[11.5px] font-medium text-warn-ink">
              {tarefa.checklists_abertos} checklist(s) em aberto
            </span>
          </div>
        )}

        {podeAgir && (
          <div className="flex items-center gap-1.5">
            {!executando && !pausado && (
              <Botao variante="primario" tamanho="sm" className="flex-1" disabled={carregando} onClick={() => onAction('play', tarefa)}>
                <Play className="size-3" />
                Iniciar
              </Botao>
            )}
            {executando && (
              <>
                <Botao variante="neutro" tamanho="sm" className="flex-1" disabled={carregando} onClick={() => onAction('pause', tarefa)}>
                  <Pause className="size-3" />
                  Pausar
                </Botao>
                <Botao variante="secundario" tamanho="sm" disabled={carregando} onClick={() => onAction('finish', tarefa)}>
                  <CheckCircle2 className="size-3" />
                </Botao>
              </>
            )}
            {pausado && (
              <>
                <Botao variante="secundario" tamanho="sm" className="flex-1" disabled={carregando} onClick={() => onAction('resume', tarefa)}>
                  <Play className="size-3" />
                  Retomar
                </Botao>
                <Botao variante="neutro" tamanho="sm" disabled={carregando} onClick={() => onAction('finish', tarefa)}>
                  <CheckCircle2 className="size-3" />
                </Botao>
              </>
            )}
          </div>
        )}

        <div className="flex gap-1.5 border-t border-line pt-2">
          <Botao variante="fantasma" tamanho="sm" className="flex-1" onClick={() => onAction('open', tarefa)}>
            <Wrench className="size-3" />
            Abrir OS
          </Botao>
          <Botao variante="fantasma" tamanho="sm" className="flex-1" onClick={() => onAction('checklist', tarefa)}>
            <ClipboardCheck className="size-3" />
            Checklist
            {tarefa.checklists_abertos > 0 && (
              <span className="num rounded-full bg-warn-soft px-1.5 text-[10px] font-bold text-warn-ink">
                {tarefa.checklists_abertos}
              </span>
            )}
          </Botao>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════ */
export function MinhaOperacao() {
  const { usuario } = useAuth()
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()
  const navegar = useNavigate()

  const [pausando, setPausando] = useState<MinhaTarefa | null>(null)
  const [concluindo, setConcluindo] = useState<MinhaTarefa | null>(null)

  const podeVer = pode('minha_operacao', 'visualizar')
  const podeEditar = pode('minha_operacao', 'editar')
  const ehMecanico = usuario?.funcao?.atua_como_mecanico ?? false

  const minhas = useQuery({
    queryKey: ['minha-operacao', usuario?.id],
    enabled: podeVer && Boolean(usuario?.id),
    refetchInterval: 30_000,
    queryFn: async (): Promise<MinhaTarefa[]> => {
      const { data, error } = await supabase
        .from('vw_minhas_tarefas')
        .select('*')
        .eq('usuario_id', usuario!.id)
        .order('prioridade', { ascending: false })
        .order('previsao_em', { nullsFirst: false })
      if (error) throw error
      return (data ?? []) as unknown as MinhaTarefa[]
    },
  })

  function invalidar() {
    void qc.invalidateQueries({ queryKey: ['minha-operacao'] })
    void qc.invalidateQueries({ queryKey: ['patio'] })
  }

  const iniciar = useMutation({
    mutationFn: async (t: MinhaTarefa) => {
      const { error } = await supabase.from('os_apontamentos').insert({
        os_id: t.os_id, usuario_id: usuario!.id, situacao: 'em_execucao',
      })
      if (error) throw error
      await supabase.from('os_eventos').insert({
        os_id: t.os_id, tipo: 'apontamento', titulo: 'Serviço iniciado', usuario_id: usuario!.id,
      })
    },
    onSuccess: () => { toast.ok('Serviço iniciado'); invalidar() },
    onError: (e) => toast.erro('Não foi possível iniciar', mensagemErro(e)),
  })

  const pausar = useMutation({
    mutationFn: async ({ t, motivo }: { t: MinhaTarefa; motivo: string }) => {
      if (!t.apontamento_id) throw new Error('Nenhum apontamento em andamento.')
      const { error } = await supabase
        .from('os_apontamentos')
        .update({ situacao: 'pausado', pausado_em: new Date().toISOString(), motivo_pausa: motivo.trim() || null })
        .eq('id', t.apontamento_id)
      if (error) throw error
      await supabase.from('os_eventos').insert({
        os_id: t.os_id, tipo: 'apontamento', titulo: 'Serviço pausado',
        descricao: motivo.trim() || null, usuario_id: usuario!.id,
      })
    },
    onSuccess: () => { toast.ok('Serviço pausado'); setPausando(null); invalidar() },
    onError: (e) => toast.erro('Não foi possível pausar', mensagemErro(e)),
  })

  const retomar = useMutation({
    mutationFn: async (t: MinhaTarefa) => {
      if (!t.apontamento_id) throw new Error('Nenhum apontamento pausado.')
      const { error } = await supabase
        .from('os_apontamentos')
        .update({ situacao: 'em_execucao', pausado_em: null, motivo_pausa: null })
        .eq('id', t.apontamento_id)
      if (error) throw error
      await supabase.from('os_eventos').insert({
        os_id: t.os_id, tipo: 'apontamento', titulo: 'Serviço retomado', usuario_id: usuario!.id,
      })
    },
    onSuccess: () => { toast.ok('Serviço retomado'); invalidar() },
    onError: (e) => toast.erro('Não foi possível retomar', mensagemErro(e)),
  })

  const concluir = useMutation({
    mutationFn: async ({ t, observacao }: { t: MinhaTarefa; observacao: string }) => {
      if (t.apontamento_id) {
        const { error } = await supabase
          .from('os_apontamentos')
          .update({ situacao: 'concluido', concluido_em: new Date().toISOString(), observacao: observacao.trim() || null })
          .eq('id', t.apontamento_id)
        if (error) throw error
      }
      await supabase.from('os_eventos').insert({
        os_id: t.os_id, tipo: 'apontamento', titulo: 'Serviço concluído pelo mecânico',
        descricao: observacao.trim() || null, usuario_id: usuario!.id,
      })
    },
    onSuccess: () => { toast.ok('Serviço concluído'); setConcluindo(null); invalidar() },
    onError: (e) => toast.erro('Não foi possível concluir', mensagemErro(e)),
  })

  const tarefasPorStatus = useMemo(() => {
    const tarefas = minhas.data ?? []
    return {
      pendente: tarefas.filter((t) => !t.apontamento_id || t.apontamento_situacao === 'concluido'),
      executando: tarefas.filter((t) => t.apontamento_situacao === 'em_execucao'),
      pausado: tarefas.filter((t) => t.apontamento_situacao === 'pausado'),
      concluido: tarefas.filter((t) => t.apontamento_situacao === 'concluido'),
    }
  }, [minhas.data])

  function handleAction(
    tipo: 'play' | 'pause' | 'resume' | 'finish' | 'open' | 'checklist',
    tarefa: MinhaTarefa,
  ) {
    switch (tipo) {
      case 'play': iniciar.mutate(tarefa); break
      case 'pause': setPausando(tarefa); break
      case 'resume': retomar.mutate(tarefa); break
      case 'finish': setConcluindo(tarefa); break
      case 'open': navegar(`/operacao/ordens-de-servico?os=${tarefa.os_id}`); break
      /* Antes este botão abria a mesma tela do vizinho: dois caminhos com o
         mesmo destino e rótulos diferentes. */
      case 'checklist': navegar(`/operacao/checklists?os=${tarefa.os_id}`); break
    }
  }

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Operação" titulo="Minha Operação" />
        <EstadoSemPermissao />
      </div>
    )
  }

  const emExecucao = tarefasPorStatus.executando.length
  const pausado = tarefasPorStatus.pausado.length
  const total = (minhas.data ?? []).length

  return (
    <div className="flex h-full flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Operação"
        titulo="Minha Operação"
        meta={
          <span className="flex items-center gap-2 rounded-full border border-ok/35 bg-ok-soft px-3 py-1">
            <span aria-hidden className="pulso-ativo size-1.5 rounded-full bg-ok" />
            <span className="lbl text-ok-ink">Ao vivo</span>
          </span>
        }
        acoes={
          <>
            <Metrica rotulo="Total" valor={total} glosa="tarefas" tom="neutro" className="min-h-0 min-w-[104px] p-2.5" />
            <Metrica rotulo="Execução" valor={emExecucao} glosa="agora" tom="cyan" className="min-h-0 min-w-[104px] p-2.5" />
            <Metrica rotulo="Pausado" valor={pausado} glosa="OS" tom="atencao" className="min-h-0 min-w-[104px] p-2.5" />
            <BotaoIcone
              rotulo="Atualizar"
              onClick={() => void minhas.refetch()}
              className={cn(minhas.isFetching && 'animate-spin')}
            >
              <RefreshCw className="size-4" />
            </BotaoIcone>
          </>
        }
      />

      {/* Quadro */}
      <div className="relative flex-1">
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-4">
          {COLUNAS.map((coluna) => (
            <ColunaQuadro
              key={coluna.id}
              coluna={coluna}
              tarefas={tarefasPorStatus[coluna.id]}
              onAction={handleAction}
              podeAgir={podeEditar}
              carregando={iniciar.isPending || retomar.isPending}
            />
          ))}
        </div>

        {minhas.isSuccess && total === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-line bg-surface px-10 py-12">
              <span className="flex size-14 items-center justify-center rounded-lg border border-dashed border-line text-ink-3">
                <Gauge className="size-6" />
              </span>
              <div className="text-center">
                <p className="text-[14px] font-medium text-ink">Nenhuma tarefa atribuída</p>
                <p className="mt-1 text-[12.5px] text-ink-3">Quando uma OS for atribuída a você, aparece aqui.</p>
              </div>
              {ehMecanico && (
                <Botao variante="primario" iconeInicio={<Hand />} onClick={() => navegar('/operacao/patio')}>
                  Ver pátio
                </Botao>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <ModalTexto
        aberto={Boolean(pausando)}
        titulo="Pausar serviço"
        descricao="Registre o motivo — ele entra no histórico da OS."
        rotulo="Motivo da pausa"
        confirmar="Pausar"
        carregando={pausar.isPending}
        aoFechar={() => setPausando(null)}
        aoConfirmar={(texto) => pausando && pausar.mutate({ t: pausando, motivo: texto })}
      />

      <ModalTexto
        aberto={Boolean(concluindo)}
        titulo="Concluir serviço"
        descricao={
          concluindo && concluindo.checklists_abertos > 0
            ? `Atenção: esta OS ainda tem ${concluindo.checklists_abertos} checklist(s) em aberto. O que foi executado fica registrado na linha do tempo da OS.`
            : 'O que foi executado fica registrado na linha do tempo da OS.'
        }
        rotulo="Observação"
        confirmar="Concluir"
        carregando={concluir.isPending}
        aoFechar={() => setConcluindo(null)}
        aoConfirmar={(texto) => concluindo && concluir.mutate({ t: concluindo, observacao: texto })}
      />
    </div>
  )
}

function ModalTexto({
  aberto,
  titulo,
  descricao,
  rotulo,
  confirmar,
  carregando,
  aoFechar,
  aoConfirmar,
}: {
  aberto: boolean
  titulo: string
  descricao: string
  rotulo: string
  confirmar: string
  carregando: boolean
  aoFechar: () => void
  aoConfirmar: (texto: string) => void
}) {
  const [texto, setTexto] = useState('')
  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={titulo}
      descricao={descricao}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" carregando={carregando} onClick={() => aoConfirmar(texto)}>{confirmar}</Botao>
        </>
      }
    >
      <Campo rotulo={rotulo}>
        {(p) => <AreaTexto {...p} rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus />}
      </Campo>
    </Modal>
  )
}
