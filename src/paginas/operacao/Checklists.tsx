import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { ArrowLeft, CheckCircle2, ClipboardCheck, Clock, Play, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { dataHora, mensagemErro } from '@/lib/utils'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { Abas } from '@/componentes/ui/Abas'
import { BarraFiltros } from '@/componentes/ui/BarraFiltros'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade } from '@/componentes/ui/Secao'
import { Paginacao, Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { CabecalhoPainel, Painel } from '@/componentes/ui/Painel'
import { Modal, PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { REF_CLIENTE, REF_VEICULO, SeletorRef } from '@/componentes/ui/SeletorRef'
import { normalizarPlaca, placaValida } from '@/dados/placa'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { EditorModelo } from './checklists/EditorModelo'
import { ExecutarChecklist } from './checklists/ExecutarChecklist'
import { ROTULO_TIPO_CHECKLIST } from './checklists/rotulos'
import type { ChecklistListado, ChecklistModelo, SituacaoChecklist, TipoChecklist } from '@/tipos/db'

export { ROTULO_TIPO_CHECKLIST } from './checklists/rotulos'

/* ═══════════════════════════════════════════════════════════════
   KPI CARD ENTERPRISE — Design Compacto
   ═══════════════════════════════════════════════════════════════ */
function KpiChecklist({ valor, rotulo, cor, icone, indice }: {
  valor: string | number; rotulo: string; cor: string; icone: React.ReactNode; indice: number
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-white/5',
        'bg-gradient-to-br from-[var(--surface)] via-[var(--surface-2)] to-[var(--surface)]',
        'p-3 transition-all duration-300 ease-out',
        'hover:border-white/10 hover:shadow-xl hover:shadow-black/10',
        'hover:-translate-y-0.5',
        'before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/5 before:to-transparent before:opacity-0 before:transition-opacity before:duration-300',
        'hover:before:opacity-100'
      )}
      style={{
        animationDelay: `${indice * 80}ms`,
        animation: 'fadeInUp 0.5s ease-out forwards',
        opacity: 0,
      }}
    >
      {/* Glow effect */}
      <div
        className="absolute -right-4 -top-4 h-16 w-16 rounded-full blur-2xl transition-all duration-500 group-hover:scale-125 group-hover:opacity-50"
        style={{ background: cor, opacity: 0.12 }}
      />

      {/* Content */}
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">{rotulo}</span>
          <span className="font-mono text-xl font-bold tracking-tight text-[var(--ink)] transition-transform duration-200 group-hover:scale-105">
            {valor}
          </span>
        </div>

        {/* Icon container */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-300 group-hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${cor}20, ${cor}8)`,
            boxShadow: `0 0 16px ${cor}25`,
          }}
        >
          <div style={{ color: cor }} className="scale-110">
            {icone}
          </div>
        </div>
      </div>

      {/* Bottom progress bar */}
      <div className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-[var(--line)]/20">
        <div
          className="h-full rounded-full transition-all duration-500 group-hover:w-full"
          style={{
            width: '35%',
            background: `linear-gradient(90deg, ${cor}, ${cor}60, transparent)`,
          }}
        />
      </div>
    </div>
  )
}

const TIPOS_CHECKLIST_OPERACAO: TipoChecklist[] = ['tecnico_inicial', 'final_os']
const DESCRICAO_RECORTE: Record<'todos' | 'tecnico_inicial' | 'final_os', string> = {
  todos: 'Entrada e saída do veículo dentro da OS, sem checklists diários de abertura/fechamento.',
  tecnico_inicial: 'Conferência do diagnóstico de entrada.',
  final_os: 'Conferência da resolução para saída.',
}

const SELECT_HISTORICO =
  'id, numero, modelo_descricao, versao, tipo, situacao, iniciado_em, concluido_em, km, setor, data_referencia, ' +
  'veiculo:veiculos ( id, placa, descricao ), cliente:clientes ( id, nome_razao ), ' +
  'responsavel:usuarios!checklists_responsavel_id_fkey ( id, nome_completo ), ' +
  'ordem:ordens_servico ( id, numero )'

export function Checklists() {
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  const execucaoAberta = params.get('exec')
  /* A Minha Operação manda `?os=…` para mostrar os checklists daquela OS.
     Sem atender o parâmetro, o mecânico caía na lista geral e tinha que
     procurar a própria OS no meio de todas. */
  const osDoLink = params.get('os')
  /**
   * A rota decide o recorte da tela.
   *
   * `/checklists/entrada` e `/checklists/saida` são a mesma tela filtrada:
   * o operador que clica em "Checklist de Saída" no menu quer ver só os de
   * saída, e não uma lista misturada que ele precisa filtrar de novo.
   */
  const local = useLocation()
  const recorte: 'todos' | 'tecnico_inicial' | 'final_os' =
    local.pathname.endsWith('/entrada') ? 'tecnico_inicial'
    : local.pathname.endsWith('/saida') ? 'final_os'
    : 'todos'

  const [aba, setAba] = useState<'modelos' | 'historico'>(
    recorte === 'todos' && !params.get('os') ? 'modelos' : 'historico',
  )
  const [modeloAberto, setModeloAberto] = useState<ChecklistModelo | null>(null)
  const [criandoModelo, setCriandoModelo] = useState(false)
  const [executando, setExecutando] = useState<ChecklistModelo | null>(null)

  function limparFiltroOS() {
    const p = new URLSearchParams(params)
    p.delete('os')
    setParams(p, { replace: true })
    ctrl.reiniciar()
  }

  const podeVer = pode('checklists', 'visualizar')
  const podeConfigurar = pode('checklists', 'configurar')
  const podeCriar = pode('checklists', 'criar')
  const podeEditar = pode('checklists', 'editar')
  const podeCancelar = pode('checklists', 'cancelar')

  const modelos = useQuery({
    queryKey: ['checklist-modelos'],
    enabled: podeVer,
    queryFn: async (): Promise<ChecklistModelo[]> => {
      const { data, error } = await supabase.from('checklist_modelos').select('*').order('tipo').order('descricao')
      if (error) throw error
      return data ?? []
    },
  })

  /* ---------------------------------------------------------- histórico */
  const ctrl = useControleListagem(25)
  const [fTipo, setFTipo] = useState<'' | TipoChecklist>('')
  const [fSituacao, setFSituacao] = useState<'' | SituacaoChecklist>('')
  const [fVeiculo, setFVeiculo] = useState<string | null>(null)
  const [fDe, setFDe] = useState('')
  const [fAte, setFAte] = useState('')

  const filtrar = useMemo(
    () => (q: Consulta) => {
      const t = termoBusca(ctrl.busca)
      let r = q
      if (t.length >= 2) r = r.ilike('modelo_descricao', `%${t}%`)
      /* O recorte da rota manda; o filtro da tela só refina dentro dele. */
      if (recorte !== 'todos') r = r.eq('tipo', recorte)
      else r = r.in('tipo', TIPOS_CHECKLIST_OPERACAO)
      if (fTipo) r = r.eq('tipo', fTipo)
      if (fSituacao) r = r.eq('situacao', fSituacao)
      if (fVeiculo) r = r.eq('veiculo_id', fVeiculo)
      if (osDoLink) r = r.eq('os_id', osDoLink)
      if (fDe) r = r.gte('iniciado_em', `${fDe}T00:00:00`)
      if (fAte) r = r.lte('iniciado_em', `${fAte}T23:59:59`)
      return r
    },
    [ctrl.busca, recorte, fTipo, fSituacao, fVeiculo, fDe, fAte, osDoLink],
  )

  const historico = useListagem<ChecklistListado>({
    chave: ['checklists', 'hist', ctrl.busca, fTipo, fSituacao, fVeiculo, fDe, fAte, osDoLink, ctrl.pagina, ctrl.porPagina],
    tabela: 'checklists',
    select: SELECT_HISTORICO,
    filtrar,
    ordenacao: { coluna: 'iniciado_em', ascendente: false },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
    habilitado: podeVer && aba === 'historico' && !execucaoAberta,
  })

  /**
   * Contagens do topo sobre a base inteira.
   *
   * Somar o que está na página daria um número que muda ao virar a página —
   * um indicador que mede a paginação, não a operação.
   */
  const indicadores = useQuery({
    queryKey: ['checklists', 'indicadores'],
    enabled: podeVer,
    queryFn: async () => {
      const base = () => supabase.from('checklists').select('*', { count: 'exact', head: true })
      const [total, emAndamento, concluidos, cancelados] = await Promise.all([
        base(),
        base().eq('situacao', 'em_andamento'),
        base().eq('situacao', 'concluido'),
        base().eq('situacao', 'cancelado'),
      ])
      const falha = [total, emAndamento, concluidos, cancelados].find((r) => r.error)
      if (falha?.error) throw falha.error
      return {
        total: total.count ?? 0,
        emAndamento: emAndamento.count ?? 0,
        concluidos: concluidos.count ?? 0,
        cancelados: cancelados.count ?? 0,
      }
    },
  })

  /* Situação do checklist aberto — decide se o título fala em executar ou
     consultar. Chave própria para não colidir com a consulta completa que o
     ExecutarChecklist mantém em cache. */
  const situacaoAberta = useQuery({
    queryKey: ['checklist-situacao', execucaoAberta],
    enabled: Boolean(execucaoAberta),
    queryFn: async (): Promise<SituacaoChecklist | null> => {
      const { data, error } = await supabase
        .from('checklists')
        .select('situacao')
        .eq('id', execucaoAberta!)
        .maybeSingle()
      if (error) throw error
      return data?.situacao ?? null
    },
  })

  /* ------------------------------------------------------- criar modelo */
  const [novoNome, setNovoNome] = useState('')
  const [novoTipo, setNovoTipo] = useState<TipoChecklist>('tecnico_inicial')

  const criarModelo = useMutation({
    mutationFn: async () => {
      if (novoNome.trim().length < 3) throw new Error('Informe a descrição do modelo.')
      const { data, error } = await supabase
        .from('checklist_modelos')
        .insert({ descricao: novoNome.trim(), tipo: novoTipo })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (m) => {
      toast.ok('Modelo criado', 'Adicione os itens do checklist.')
      setCriandoModelo(false)
      setNovoNome('')
      void qc.invalidateQueries({ queryKey: ['checklist-modelos'] })
      setModeloAberto(m)
    },
    onError: (e) => toast.erro('Não foi possível criar', mensagemErro(e)),
  })

  /* ------------------------------------------------------- iniciar exec */
  const [execVeiculo, setExecVeiculo] = useState<string | null>(null)
  const [execCliente, setExecCliente] = useState<string | null>(null)
  /* Identificação digitada quando o cadastro ainda não existe. */
  const [execPlaca, setExecPlaca] = useState('')
  const [execClienteNome, setExecClienteNome] = useState('')
  const [execClienteDoc, setExecClienteDoc] = useState('')
  const [reabrindo, setReabrindo] = useState<ChecklistListado | null>(null)
  const [motivoReabrir, setMotivoReabrir] = useState('')
  const [removendo, setRemovendo] = useState<ChecklistListado | null>(null)
  const [motivoRemover, setMotivoRemover] = useState('')
  const [execKm, setExecKm] = useState('')
  const [execSetor, setExecSetor] = useState('')

  const iniciar = useMutation({
    mutationFn: async (modelo: ChecklistModelo) => {
      const diario = modelo.tipo.startsWith('diario')

      let veiculoId = execVeiculo
      let clienteId = execCliente
      let criados = { cliente: false, veiculo: false }

      /*
       * Checklist de veículo precisa de dono e de placa.
       *
       * Quando o atendente digitou em vez de escolher, o cadastro nasce agora.
       * Obrigar a sair da tela, abrir Cadastros, criar e voltar é o tipo de
       * atrito que faz o checklist simplesmente não ser preenchido.
       */
      if (!diario) {
        const placa = normalizarPlaca(execPlaca)
        const nome = execClienteNome.trim()

        if (!veiculoId && !placa) throw new Error('Escolha o veiculo ou digite a placa.')
        if (!veiculoId && !placaValida(placa)) {
          throw new Error('Placa fora dos padroes ABC-1234 ou ABC1D23.')
        }
        if (!clienteId && !nome) throw new Error('Escolha o cliente ou digite o nome.')

        if (!veiculoId || !clienteId) {
          const { data, error } = await supabase.rpc('garantir_cliente_e_veiculo', {
            p_cliente_id: clienteId,
            p_cliente_nome: nome || null,
            p_cliente_documento: execClienteDoc.replace(/\D/g, '') || null,
            p_veiculo_id: veiculoId,
            p_placa: placa || null,
          })
          if (error) throw error
          const r = (data as unknown as Array<{
            cliente_id: string | null
            veiculo_id: string | null
            cliente_criado: boolean
            veiculo_criado: boolean
          }>)?.[0]
          clienteId = r?.cliente_id ?? clienteId
          veiculoId = r?.veiculo_id ?? veiculoId
          criados = { cliente: Boolean(r?.cliente_criado), veiculo: Boolean(r?.veiculo_criado) }
        }
      }

      const { data, error } = await supabase.rpc('iniciar_checklist', {
        p_modelo: modelo.id,
        p_veiculo: diario ? null : veiculoId,
        p_cliente: diario ? null : clienteId,
        p_km: !diario && execKm ? Number(execKm.replace(/\D/g, '')) : null,
        p_setor: diario ? execSetor.trim() || null : null,
      })
      if (error) throw error
      return { id: data as string, criados }
    },
    onSuccess: ({ id, criados }) => {
      if (criados.cliente || criados.veiculo) {
        const quais = [criados.cliente ? 'cliente' : '', criados.veiculo ? 'veiculo' : '']
          .filter(Boolean)
          .join(' e ')
        toast.ok(
          `Cadastro de ${quais} criado`,
          'Entrou na fila de envio para a Omie, em Sistema > Integracoes.',
        )
      }
      setExecutando(null)
      setExecVeiculo(null)
      setExecCliente(null)
      setExecPlaca('')
      setExecClienteNome('')
      setExecClienteDoc('')
      setExecKm('')
      setParams({ exec: id })
    },
    onError: (e) => toast.erro('Não foi possível iniciar', mensagemErro(e)),
  })

  /**
   * Reabre um checklist concluído para corrigir marcação.
   *
   * O motivo é obrigatório porque este documento é assinado pelo cliente:
   * alterar depois da conclusão precisa deixar rastro.
   */
  const reabrir = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('reabrir_checklist', {
        p_checklist: reabrindo!.id,
        p_motivo: motivoReabrir,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Checklist reaberto')
      setReabrindo(null)
      setMotivoReabrir('')
      void qc.invalidateQueries({ queryKey: ['checklists'] })
    },
    onError: (e) => toast.erro('Não foi possível reabrir', mensagemErro(e)),
  })

  /**
   * Remove ou cancela.
   *
   * Em andamento sai de vez; concluído é cancelado com motivo e fica no
   * lugar — apagar a prova do estado de entrada tira a defesa da oficina.
   */
  const remover = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('excluir_checklist', {
        p_checklist: removendo!.id,
        p_motivo: motivoRemover.trim() || null,
      })
      if (error) throw error
      return data as unknown as string
    },
    onSuccess: (r) => {
      toast.ok(r === 'cancelado' ? 'Checklist cancelado' : 'Checklist removido')
      setRemovendo(null)
      setMotivoRemover('')
      void qc.invalidateQueries({ queryKey: ['checklists'] })
    },
    onError: (e) => toast.erro('Não foi possível remover', mensagemErro(e)),
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-accent" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Operação</p>
        </div>
        <h1 className="font-display text-xl font-bold text-ink">Checklists</h1>
        <EstadoSemPermissao />
      </div>
    )
  }

  const stats = indicadores.data ?? null

  if (execucaoAberta) {
    const consultando = situacaoAberta.data != null && situacaoAberta.data !== 'em_andamento'

    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <BotaoIcone rotulo="Voltar" onClick={() => setParams({})}>
            <ArrowLeft />
          </BotaoIcone>
          <div>
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-6 rounded-full bg-accent" />
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Operação</p>
            </div>
            <h1 className="font-display text-xl font-bold text-ink">{consultando ? 'Checklist' : 'Executar Checklist'}</h1>
          </div>
        </div>
        <ExecutarChecklist checklistId={execucaoAberta} aoConcluir={() => setParams({})} />
      </div>
    )
  }

  if (modeloAberto) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <BotaoIcone rotulo="Voltar" onClick={() => setModeloAberto(null)}>
            <ArrowLeft />
          </BotaoIcone>
          <div>
            <div className="flex items-center gap-2">
              <span className="h-0.5 w-6 rounded-full bg-accent" />
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">{ROTULO_TIPO_CHECKLIST[modeloAberto.tipo]}</p>
            </div>
            <h1 className="font-display text-xl font-bold text-ink">{modeloAberto.descricao}</h1>
          </div>
        </div>
        <EditorModelo modelo={modelos.data?.find((m) => m.id === modeloAberto.id) ?? modeloAberto} />
      </div>
    )
  }

  const colunasHistorico: Array<Coluna<ChecklistListado>> = [
    { chave: 'numero', cabecalho: 'Nº', largura: '80px', celula: (c) => <span className="num text-ink-2">{String(c.numero).padStart(5, '0')}</span> },
    {
      chave: 'modelo',
      cabecalho: 'Checklist',
      celula: (c) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-ink">{c.modelo_descricao}</span>
          <span className="num truncate text-[11.5px] text-ink-3">
            {ROTULO_TIPO_CHECKLIST[c.tipo]} · v{c.versao}
          </span>
        </div>
      ),
    },
    {
      chave: 'contexto',
      cabecalho: 'Contexto',
      largura: '200px',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (c) =>
        c.veiculo ? (
          <div className="flex flex-col">
            <span className="num font-medium">{c.veiculo.placa}</span>
            {c.ordem && <span className="num text-[11.5px] text-ink-3">OS {String(c.ordem.numero).padStart(5, '0')}</span>}
          </div>
        ) : c.setor ? (
          <span>{c.setor}</span>
        ) : (
          <span className="text-ink-3">—</span>
        ),
    },
    {
      chave: 'responsavel',
      cabecalho: 'Responsável',
      largura: '180px',
      classeResponsiva: 'hidden xl:table-cell',
      celula: (c) => c.responsavel?.nome_completo ?? <span className="text-ink-3">—</span>,
    },
    { chave: 'inicio', cabecalho: 'Início', largura: '150px', classeResponsiva: 'hidden md:table-cell', celula: (c) => <span className="num text-[12.5px]">{dataHora(c.iniciado_em)}</span> },
    {
      chave: 'situacao',
      cabecalho: 'Situação',
      largura: '140px',
      celula: (c) => (
        <Selo tom={c.situacao === 'concluido' ? 'ok' : c.situacao === 'cancelado' ? 'critico' : 'info'} ponto>
          {c.situacao === 'concluido' ? 'Concluído' : c.situacao === 'cancelado' ? 'Cancelado' : 'Em andamento'}
        </Selo>
      ),
    },
    {
      chave: 'acoes',
      cabecalho: '',
      largura: '210px',
      alinhamento: 'direita',
      celula: (c) => (
        /* A linha inteira abre a execução. Sem conter o clique aqui, apertar
           "Remover" abriria o checklist e desmontaria o diálogo na mesma hora. */
        <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
          <Botao tamanho="sm" variante="fantasma" onClick={() => setParams({ exec: c.id })}>
            {c.situacao === 'em_andamento' ? 'Continuar' : 'Abrir'}
          </Botao>
          {podeEditar && c.situacao === 'concluido' && (
            <Botao tamanho="sm" variante="fantasma" onClick={() => setReabrindo(c)}>
              Reabrir
            </Botao>
          )}
          {podeCancelar && c.situacao !== 'cancelado' && (
            <BotaoIcone
              rotulo={`Remover checklist ${String(c.numero).padStart(4, '0')}`}
              tamanho="sm"
              variante="fantasma"
              onClick={() => setRemovendo(c)}
            >
              <Trash2 />
            </BotaoIcone>
          )}
        </div>
      ),
    },
  ]

  /*
   * Os modelos seguem o mesmo recorte da rota que o histórico já seguia.
   *
   * Sem isto, quem clicava em "Checklist de Entrada" no menu via o histórico
   * filtrado mas os modelos de entrada E de saída lado a lado — e podia
   * começar um checklist de saída dentro da tela de entrada. Uma tela que
   * filtra pela metade é pior do que uma que não filtra: ela promete um
   * recorte e entrega outro.
   */
  const modelosDoRecorte = (modelos.data ?? []).filter(
    (modelo) =>
      TIPOS_CHECKLIST_OPERACAO.includes(modelo.tipo) &&
      (recorte === 'todos' || modelo.tipo === recorte),
  )

  const porTipo = new Map<TipoChecklist, ChecklistModelo[]>()
  for (const m of modelosDoRecorte) {
    const lista = porTipo.get(m.tipo) ?? []
    lista.push(m)
    porTipo.set(m.tipo, lista)
  }

  const contadorModelos = modelosDoRecorte.length

  return (
    <div className="flex flex-col gap-5">
      {/* Header Premium */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 rounded-full bg-accent" />
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Operação</p>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Checklists</h1>
          <p className="text-[13px] text-ink-2">{DESCRICAO_RECORTE[recorte]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {podeConfigurar && aba === 'modelos' && (
            <Botao variante="primario" iconeInicio={<Plus className="size-4" />} onClick={() => setCriandoModelo(true)}>
              Novo modelo
            </Botao>
          )}
        </div>
      </div>

      {/* Cards de Estatísticas */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <KpiChecklist
            indice={0} valor={stats.total} rotulo="Total" cor="#F97316" icone={<ClipboardCheck className="size-4" />}
          />
          <KpiChecklist
            indice={1} valor={stats.emAndamento} rotulo="Em Andamento" cor="#EAB308" icone={<Clock className="size-4" />}
          />
          <KpiChecklist
            indice={2} valor={stats.concluidos} rotulo="Concluídos" cor="#22C55E" icone={<CheckCircle2 className="size-4" />}
          />
          <KpiChecklist
            indice={3} valor={stats.cancelados} rotulo="Cancelados" cor="#DC2626" icone={<Trash2 className="size-4" />}
          />
        </div>
      )}

      <Abas
        ativa={aba}
        aoMudar={setAba}
        abas={[
          {
            valor: 'modelos',
            rotulo: 'Modelos',
            /* O que a aba mostra, nao o que existe no banco: o total cru
               somava os modelos 5S, que esta tela nunca exibe, e ignorava o
               recorte da rota. Contador que nao conta o que esta na tela e
               so ruido. */
            contador: contadorModelos,
          },
          { valor: 'historico', rotulo: 'Histórico' },
        ]}
      />

      {aba === 'modelos' && (
        <div className="flex flex-col gap-4">
          {modelos.isLoading && <EstadoCarregando rotulo="Carregando modelos…" />}
          {modelos.isError && (
            <EstadoErro descricao={mensagemErro(modelos.error)} aoTentarNovamente={() => void modelos.refetch()} />
          )}
          {modelos.isSuccess && (contadorModelos ?? 0) === 0 && (
            <EstadoVazio
              icone={<ClipboardCheck />}
              titulo="Nenhum modelo cadastrado"
              descricao="Crie modelos de Checklist Entrada e Checklist Saída para amarrar a conferência ao fluxo da OS."
              acao={
                podeConfigurar ? (
                  <Botao tamanho="sm" variante="neutro" onClick={() => setCriandoModelo(true)}>Criar o primeiro</Botao>
                ) : undefined
              }
            />
          )}

          {[...porTipo.entries()].map(([tipo, lista]) => (
            <Painel key={tipo} semPadding>
              <CabecalhoPainel titulo={ROTULO_TIPO_CHECKLIST[tipo]} />
              <ul className="flex flex-col divide-y divide-[var(--c-line)]">
                {lista.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[13.5px] font-medium text-ink">{m.descricao}</span>
                      <span className="num text-[11.5px] text-ink-3">versão {m.versao_atual}</span>
                    </div>
                    {m.situacao === 'inativo' && <Selo tom="neutro">Inativo</Selo>}
                    {podeCriar && m.situacao === 'ativo' && (
                      <Botao tamanho="sm" variante="secundario" iconeInicio={<Play />} onClick={() => setExecutando(m)}>
                        Executar
                      </Botao>
                    )}
                    <Botao tamanho="sm" variante="neutro" onClick={() => setModeloAberto(m)}>
                      {podeConfigurar ? 'Editar itens' : 'Ver itens'}
                    </Botao>
                  </li>
                ))}
              </ul>
            </Painel>
          ))}
        </div>
      )}

      {aba === 'historico' && (
        <div className="flex flex-col">
          <BarraFiltros
            busca={ctrl.busca}
            aoBuscar={ctrl.setBusca}
            placeholder="Buscar pelo nome do checklist"
            chips={
              osDoLink
                ? [{ id: 'os', rotulo: 'Somente desta OS', aoRemover: limparFiltroOS }]
                : undefined
            }
            aoLimpar={osDoLink ? limparFiltroOS : undefined}
            aoAtualizar={historico.recarregar}
            atualizando={historico.buscando}
            filtros={
              <>
                {/* Em /entrada e /saida a rota ja e o filtro de tipo. Oferecer
                    o seletor ali deixava escolher "Saida" dentro da Entrada, o
                    que somava duas condicoes contraditorias e devolvia lista
                    vazia sem dizer por que. */}
                {recorte === 'todos' && (
                  <Campo rotulo="Tipo">
                    {(p) => (
                      <Selecao {...p} value={fTipo} onChange={(e) => { setFTipo(e.target.value as TipoChecklist | ''); ctrl.reiniciar() }}>
                        <option value="">Todos</option>
                        {TIPOS_CHECKLIST_OPERACAO.map((v) => <option key={v} value={v}>{ROTULO_TIPO_CHECKLIST[v]}</option>)}
                      </Selecao>
                    )}
                  </Campo>
                )}
                <Campo rotulo="Situação">
                  {(p) => (
                    <Selecao {...p} value={fSituacao} onChange={(e) => { setFSituacao(e.target.value as SituacaoChecklist | ''); ctrl.reiniciar() }}>
                      <option value="">Todas</option>
                      <option value="em_andamento">Em andamento</option>
                      <option value="concluido">Concluído</option>
                      <option value="cancelado">Cancelado</option>
                    </Selecao>
                  )}
                </Campo>
                <Campo rotulo="Veículo">
                  {(p) => <SeletorRef {...p} config={REF_VEICULO} valor={fVeiculo} aoSelecionar={(o) => { setFVeiculo(o?.id ?? null); ctrl.reiniciar() }} placeholder="Todos" />}
                </Campo>
                <Campo rotulo="Período de">
                  {(p) => <Entrada {...p} type="date" value={fDe} onChange={(e) => { setFDe(e.target.value); ctrl.reiniciar() }} />}
                </Campo>
                <Campo rotulo="Período até">
                  {(p) => <Entrada {...p} type="date" value={fAte} onChange={(e) => { setFAte(e.target.value); ctrl.reiniciar() }} />}
                </Campo>
              </>
            }
          />

          <Tabela
            className="rounded-none"
            colunas={colunasHistorico}
            linhas={historico.linhas}
            chaveDe={(c) => c.id}
            estado={historico.estado}
            aoClicarLinha={(c) => setParams({ exec: c.id })}
            mensagemVazio={{
              titulo: 'Nenhum checklist executado',
              descricao: 'O histórico guarda a versão do modelo usada em cada execução.',
            }}
            mensagemErro={{ descricao: mensagemErro(historico.erro), aoTentarNovamente: historico.recarregar }}
          />

          {historico.estado === 'ok' && (
            <Paginacao className="rounded-t-none border-t-0" pagina={ctrl.pagina} porPagina={ctrl.porPagina} total={historico.total} aoMudarPagina={ctrl.setPagina} />
          )}
        </div>
      )}

      {/* novo modelo */}
      <PainelLateral
        aberto={criandoModelo}
        aoFechar={() => setCriandoModelo(false)}
        titulo="Novo modelo de checklist"
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setCriandoModelo(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={criarModelo.isPending} onClick={() => criarModelo.mutate()}>Criar</Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Campo rotulo="Descrição" obrigatorio>
            {(p) => <Entrada {...p} value={novoNome} onChange={(e) => setNovoNome(e.target.value)} autoFocus placeholder="Ex.: Checklist técnico — cavalo e carreta" />}
          </Campo>
          <Campo rotulo="Tipo" dica="Define onde o checklist aparece e como é usado.">
            {(p) => (
              <Selecao {...p} value={novoTipo} onChange={(e) => setNovoTipo(e.target.value as TipoChecklist)}>
                {TIPOS_CHECKLIST_OPERACAO.map((v) => <option key={v} value={v}>{ROTULO_TIPO_CHECKLIST[v]}</option>)}
              </Selecao>
            )}
          </Campo>
          <Aviso tom="info">
            O modelo nasce na versão 1. Depois da primeira execução, qualquer alteração publica uma nova versão
            automaticamente.
          </Aviso>
        </div>
      </PainelLateral>

      {/* iniciar execução */}
      <PainelLateral
        aberto={Boolean(executando)}
        aoFechar={() => setExecutando(null)}
        titulo={`Executar — ${executando?.descricao ?? ''}`}
        descricao={executando ? `Versão ${executando.versao_atual}` : undefined}
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setExecutando(null)}>Cancelar</Botao>
            <Botao variante="primario" carregando={iniciar.isPending} onClick={() => executando && iniciar.mutate(executando)}>
              Iniciar
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {executando?.tipo.startsWith('diario') ? (
            <Campo rotulo="Setor" dica="Checklists diários não pertencem a uma OS.">
              {(p) => <Entrada {...p} value={execSetor} onChange={(e) => setExecSetor(e.target.value)} placeholder="Ex.: Oficina — box 1" />}
            </Campo>
          ) : (
            <Grade>
              <Campo className="sm:col-span-12" rotulo="Veículo" obrigatorio>
                {(p) => <SeletorRef {...p} config={REF_VEICULO} valor={execVeiculo} aoSelecionar={(o) => setExecVeiculo(o?.id ?? null)} placeholder="Buscar pela placa" />}
              </Campo>

              {!execVeiculo && (
                <Campo
                  className="sm:col-span-12"
                  rotulo="…ou digite a placa"
                  dica="Placa que ainda não existe é cadastrada automaticamente."
                  erro={execPlaca && !placaValida(execPlaca) ? 'Formato inválido.' : undefined}
                >
                  {(p) => (
                    <Entrada
                      {...p}
                      mono
                      autoCapitalize="characters"
                      maxLength={8}
                      value={execPlaca}
                      onChange={(e) => setExecPlaca(e.target.value.toUpperCase())}
                      placeholder="ABC-1234"
                    />
                  )}
                </Campo>
              )}

              <Campo className="sm:col-span-8" rotulo="Cliente" obrigatorio>
                {(p) => <SeletorRef {...p} config={REF_CLIENTE} valor={execCliente} aoSelecionar={(o) => setExecCliente(o?.id ?? null)} placeholder="Buscar cliente" />}
              </Campo>
              <Campo className="sm:col-span-4" rotulo="KM">
                {(p) => <Entrada {...p} mono inputMode="numeric" value={execKm} onChange={(e) => setExecKm(e.target.value.replace(/\D/g, ''))} />}
              </Campo>

              {!execCliente && (
                <>
                  <Campo
                    className="sm:col-span-8"
                    rotulo="…ou digite o nome do cliente"
                    dica="Cliente novo é cadastrado na hora e entra na fila da Omie."
                  >
                    {(p) => (
                      <Entrada
                        {...p}
                        value={execClienteNome}
                        onChange={(e) => setExecClienteNome(e.target.value)}
                        placeholder="Nome ou razão social"
                      />
                    )}
                  </Campo>
                  <Campo className="sm:col-span-4" rotulo="CPF / CNPJ" dica="Opcional, evita cliente duplicado.">
                    {(p) => (
                      <Entrada
                        {...p}
                        mono
                        inputMode="numeric"
                        value={execClienteDoc}
                        onChange={(e) => setExecClienteDoc(e.target.value)}
                        placeholder="Somente números"
                      />
                    )}
                  </Campo>
                </>
              )}
            </Grade>
          )}
        </div>
      </PainelLateral>

      <Modal
        aberto={reabrindo !== null}
        aoFechar={() => { setReabrindo(null); setMotivoReabrir('') }}
        titulo="Reabrir checklist"
        descricao={
          reabrindo
            ? `CHK ${String(reabrindo.numero).padStart(4, '0')} · ${reabrindo.modelo_descricao}`
            : undefined
        }
        rodape={
          <>
            <Botao variante="neutro" onClick={() => { setReabrindo(null); setMotivoReabrir('') }}>
              Cancelar
            </Botao>
            <Botao variante="primario" carregando={reabrir.isPending} onClick={() => reabrir.mutate()}>
              Reabrir
            </Botao>
          </>
        }
      >
        <Campo
          rotulo="Motivo da reabertura"
          obrigatorio
          dica="Fica registrado na linha do tempo da OS."
        >
          {(p) => (
            <AreaTexto
              {...p}
              rows={3}
              value={motivoReabrir}
              onChange={(e) => setMotivoReabrir(e.target.value)}
              placeholder="Ex.: item marcado por engano na conferência."
            />
          )}
        </Campo>
      </Modal>

      <Modal
        aberto={removendo !== null}
        aoFechar={() => { setRemovendo(null); setMotivoRemover('') }}
        titulo={removendo?.situacao === 'concluido' ? 'Cancelar checklist' : 'Remover checklist'}
        descricao={
          removendo
            ? `CHK ${String(removendo.numero).padStart(4, '0')} · ${removendo.modelo_descricao}`
            : undefined
        }
        rodape={
          <>
            <Botao variante="neutro" onClick={() => { setRemovendo(null); setMotivoRemover('') }}>
              Voltar
            </Botao>
            <Botao variante="destrutivo" carregando={remover.isPending} onClick={() => remover.mutate()}>
              {removendo?.situacao === 'concluido' ? 'Cancelar checklist' : 'Remover'}
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {removendo?.situacao === 'concluido' ? (
            <>
              <Aviso tom="atencao" titulo="Checklist concluído não é apagado">
                Ele é a prova do estado em que o veículo chegou. Fica no histórico marcado como cancelado, com o
                motivo.
              </Aviso>
              <Campo rotulo="Motivo do cancelamento" obrigatorio>
                {(p) => (
                  <AreaTexto
                    {...p}
                    rows={3}
                    value={motivoRemover}
                    onChange={(e) => setMotivoRemover(e.target.value)}
                    placeholder="Ex.: aberto no veículo errado."
                  />
                )}
              </Campo>
            </>
          ) : (
            <Aviso tom="critico" titulo="Esta ação não tem volta">
              O checklist ainda está em andamento e será apagado com todas as respostas já marcadas.
            </Aviso>
          )}
        </div>
      </Modal>
    </div>
  )
}
