import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Clock,
  Eye,
  FlaskConical,
  Plus,
  Printer,
  Timer,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { data as fmtData } from '@/lib/formatos'
import { dataHora, mensagemErro } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade } from '@/componentes/ui/Secao'
import { Paginacao, Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { BarraFiltros } from '@/componentes/ui/BarraFiltros'
import { PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { REF_CLIENTE, SeletorRef } from '@/componentes/ui/SeletorRef'
import { Selo } from '@/componentes/ui/Selo'
import { Evidencias } from '@/componentes/ui/Evidencias'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { DocumentoProtocolo } from './pecas/DocumentoProtocolo'
import { duracao } from './patio/usePatio'
import type { Mecanico, PecaTesteListada, SlaPecasTeste, StatusPecaTeste } from '@/tipos/db'

/* ═══════════════════════════════════════════════════════════════
   STATUS CONFIG
   ═══════════════════════════════════════════════════════════════ */
const STATUS_PECA = [
  { valor: 'recebida', rotulo: 'Recebida', tom: 'neutro' as const },
  { valor: 'aguardando_teste', rotulo: 'Aguardando', tom: 'atencao' as const },
  { valor: 'em_teste', rotulo: 'Em teste', tom: 'info' as const },
  { valor: 'aguardando_peca', rotulo: 'Aguard. peça', tom: 'destaque' as const },
  { valor: 'reparada', rotulo: 'Reparada', tom: 'ok' as const },
  { valor: 'reprovada', rotulo: 'Reprovada', tom: 'critico' as const },
  { valor: 'aguardando_cliente', rotulo: 'Aguard. cliente', tom: 'atencao' as const },
  { valor: 'entregue', rotulo: 'Entregue', tom: 'ok' as const },
] as const

const MAPA_STATUS = Object.fromEntries(STATUS_PECA.map((s) => [s.valor, s]))

/**
 * Indicador do topo. Mesmo formato usado em Produtos: número grande, rótulo
 * pequeno e um ícone tonal. Sem número ainda mostra travessão, nunca zero.
 */
function Kpi({
  rotulo,
  valor,
  subrotulo,
  cor,
  icone,
}: {
  rotulo: string
  valor: number | undefined
  subrotulo?: string
  cor: string
  icone: React.ReactNode
}) {
  return (
    <div className="aresta flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[9px] font-semibold uppercase tracking-wider text-ink-3">{rotulo}</span>
        <span className="num text-[22px] font-bold tracking-tight text-ink">
          {valor === undefined ? '—' : valor.toLocaleString('pt-BR')}
        </span>
        {subrotulo && <span className="truncate text-[9px] text-ink-3">{subrotulo}</span>}
      </div>
      <div
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line/60"
        style={{ backgroundColor: `${cor}14`, color: cor }}
      >
        {icone}
      </div>
    </div>
  )
}

/**
 * Situação do prazo de uma peça.
 *
 * "No prazo" e "vencido" são a informação que o laboratório olha primeiro —
 * por isso vira selo com tom do tema, não texto colorido à mão.
 */
function situacaoSla(peca: PecaTesteListada): { rotulo: string; tom: 'ok' | 'atencao' | 'critico' | 'neutro' } {
  if (peca.status === 'entregue') return { rotulo: 'Entregue', tom: 'ok' }
  if (!peca.prazo_em) return { rotulo: '—', tom: 'neutro' }
  const restante = (new Date(peca.prazo_em).getTime() - Date.now()) / 1000
  if (restante <= 0) return { rotulo: 'Vencido', tom: 'critico' }
  if (restante <= 8 * 3600) return { rotulo: duracao(restante), tom: 'atencao' }
  return { rotulo: 'No prazo', tom: 'ok' }
}

/* ═══════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════ */
const SELECT_LISTA =
  'id, protocolo, peca, descricao, fabricante, numero_serie, quantidade, entrada_em, prazo_em, sla_horas, status, ' +
  'laudo, observacao, entregue_em, cliente_id, os_id, veiculo_id, mecanico_id, especialidade_id, ' +
  'cliente:clientes ( id, nome_razao ), mecanico:usuarios!pecas_teste_mecanico_id_fkey ( id, nome_completo ), ' +
  'especialidade:especialidades ( id, nome )'

export function PecasEmTeste() {
  const { usuario } = useAuth()
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const ctrl = useControleListagem(25)
  const [fStatus, setFStatus] = useState<'' | StatusPecaTeste>('')
  const [fMecanico, setFMecanico] = useState('')
  const [fSla, setFSla] = useState<'' | 'vencido' | 'atencao'>('')
  const [criando, setCriando] = useState(false)
  const [aberta, setAberta] = useState<PecaTesteListada | null>(null)
  const [imprimindo, setImprimindo] = useState<PecaTesteListada | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const podeVer = pode('pecas_em_teste', 'visualizar')
  const podeCriar = pode('pecas_em_teste', 'criar')
  const podeEditar = pode('pecas_em_teste', 'editar')
  const podeConfigurar = pode('pecas_em_teste', 'configurar')

  const mecanicosLab = useQuery({
    queryKey: ['mecanicos-laboratorio'],
    enabled: podeVer,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Mecanico[]> => {
      const { data, error } = await supabase.from('vw_mecanicos_laboratorio').select('*').order('nome_completo')
      if (error) throw error
      return (data ?? []) as Mecanico[]
    },
  })

  const sla = useQuery({
    queryKey: ['pecas-sla'],
    enabled: podeVer,
    refetchInterval: 2 * 60_000,
    queryFn: async (): Promise<SlaPecasTeste | null> => {
      const { data, error } = await supabase.rpc('sla_pecas_teste')
      if (error) throw error
      return (data ?? [])[0] ?? null
    },
  })

  const filtrar = useMemo(
    () => (q: Consulta) => {
      const t = termoBusca(ctrl.busca)
      let r = q
      if (t.length >= 2) r = r.or(`protocolo.ilike.%${t}%,peca.ilike.%${t}%,fabricante.ilike.%${t}%,numero_serie.ilike.%${t}%`)
      if (fStatus) r = r.eq('status', fStatus)
      if (fMecanico) r = r.eq('mecanico_id', fMecanico)
      if (fSla === 'vencido') r = r.neq('status', 'entregue').lte('prazo_em', new Date().toISOString())
      if (fSla === 'atencao') {
        const limite = new Date(Date.now() + 8 * 3600_000).toISOString()
        r = r.neq('status', 'entregue').gt('prazo_em', new Date().toISOString()).lte('prazo_em', limite)
      }
      return r
    },
    [ctrl.busca, fStatus, fMecanico, fSla],
  )

  const lista = useListagem<PecaTesteListada>({
    chave: ['pecas_teste', 'lista', ctrl.busca, fStatus, fMecanico, fSla, ctrl.pagina, ctrl.porPagina],
    tabela: 'pecas_teste',
    select: SELECT_LISTA,
    filtrar,
    ordenacao: { coluna: 'entrada_em', ascendente: false },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
    habilitado: podeVer,
  })

  const [nova, setNova] = useState({
    cliente_id: null as string | null,
    veiculo_id: null as string | null,
    peca: '',
    descricao: '',
    fabricante: '',
    numero_serie: '',
    quantidade: '1',
    especialidade_id: null as string | null,
    mecanico_id: '',
    sla_horas: '48',
    observacao: '',
  })

  const registrar = useMutation({
    mutationFn: async () => {
      setErro(null)
      if (!nova.cliente_id) throw new Error('Selecione o cliente.')
      if (nova.peca.trim().length < 2) throw new Error('Informe a peça recebida.')
      const { data, error } = await supabase
        .from('pecas_teste')
        .insert({
          cliente_id: nova.cliente_id,
          veiculo_id: nova.veiculo_id,
          peca: nova.peca.trim(),
          descricao: nova.descricao.trim() || null,
          fabricante: nova.fabricante.trim() || null,
          numero_serie: nova.numero_serie.trim() || null,
          quantidade: Number(nova.quantidade) || 1,
          especialidade_id: nova.especialidade_id,
          mecanico_id: nova.mecanico_id || null,
          sla_horas: Number(nova.sla_horas) || 48,
          observacao: nova.observacao.trim() || null,
          recebido_por: usuario?.id ?? null,
        })
        .select(SELECT_LISTA)
        .single()
      if (error) throw error
      return data as unknown as PecaTesteListada
    },
    onSuccess: (p) => {
      toast.ok(`Protocolo ${p.protocolo} gerado`)
      setCriando(false)
      setNova({
        cliente_id: null, veiculo_id: null, peca: '', descricao: '', fabricante: '', numero_serie: '',
        quantidade: '1', especialidade_id: null, mecanico_id: '', sla_horas: '48', observacao: '',
      })
      void qc.invalidateQueries({ queryKey: ['pecas_teste'] })
      void qc.invalidateQueries({ queryKey: ['pecas-sla'] })
      setAberta(p)
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const atualizar = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Record<string, unknown> }) => {
      const { error } = await supabase.from('pecas_teste').update(campos as never).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Peça atualizada')
      void qc.invalidateQueries({ queryKey: ['pecas_teste'] })
      void qc.invalidateQueries({ queryKey: ['pecas-sla'] })
    },
    onError: (e) => toast.erro('Não foi possível atualizar', mensagemErro(e)),
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-accent" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Operação</p>
        </div>
        <h1 className="font-display text-xl font-bold text-ink">Peças em Teste</h1>
        <EstadoSemPermissao />
      </div>
    )
  }


  /**
   * Os números do topo contam a base inteira, não a página aberta.
   *
   * Contar `lista.linhas` daria "3 em teste" quando existem 300: o cartão
   * mediria a paginação, não a oficina. Cada número aqui é um `count` do
   * Postgres.
   */
  const indicadores = useQuery({
    queryKey: ['pecas_teste', 'indicadores'],
    enabled: podeVer,
    queryFn: async () => {
      const base = () => supabase.from('pecas_teste').select('*', { count: 'exact', head: true })
      const [total, emTeste, aguardando, concluidas, vencidas] = await Promise.all([
        base(),
        base().in('status', ['em_teste', 'aguardando_teste']),
        base().in('status', ['aguardando_peca', 'aguardando_cliente']),
        base().in('status', ['entregue', 'reparada']),
        base().not('prazo_em', 'is', null).lt('prazo_em', new Date().toISOString()).not('status', 'eq', 'entregue'),
      ])
      const falha = [total, emTeste, aguardando, concluidas, vencidas].find((r) => r.error)
      if (falha?.error) throw falha.error
      return {
        total: total.count ?? 0,
        emTeste: emTeste.count ?? 0,
        aguardando: aguardando.count ?? 0,
        concluidas: concluidas.count ?? 0,
        vencidas: vencidas.count ?? 0,
      }
    },
  })

  const stats = indicadores.data ?? null

  const chips = [
    fStatus && {
      id: 'st',
      rotulo: `Status: ${MAPA_STATUS[fStatus]?.rotulo ?? fStatus}`,
      aoRemover: () => setFStatus(''),
    },
    fMecanico && {
      id: 'me',
      rotulo: `Mecânico: ${mecanicosLab.data?.find((m) => m.id === fMecanico)?.nome_completo ?? '—'}`,
      aoRemover: () => setFMecanico(''),
    },
    fSla && { id: 'sla', rotulo: fSla === 'vencido' ? 'SLA vencido' : 'SLA em atenção', aoRemover: () => setFSla('') },
  ].filter(Boolean) as Array<{ id: string; rotulo: string; aoRemover: () => void }>

  const limparTudo = () => {
    setFStatus('')
    setFMecanico('')
    setFSla('')
    ctrl.reiniciar()
  }

  const colunas: Array<Coluna<PecaTesteListada>> = [
    {
      chave: 'protocolo',
      cabecalho: 'Protocolo',
      largura: '120px',
      celula: (p) => (
        <div className="flex min-w-0 flex-col">
          <span className="num font-semibold text-ink">{p.protocolo}</span>
          <span className="num text-[11px] text-ink-3">{fmtData(p.entrada_em)}</span>
        </div>
      ),
    },
    {
      chave: 'peca',
      cabecalho: 'Peça',
      celula: (p) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-ink">{p.peca}</span>
          <span className="truncate text-[12px] text-ink-3">
            {[p.fabricante, p.numero_serie].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
      ),
    },
    {
      chave: 'cliente',
      cabecalho: 'Cliente',
      largura: '180px',
      classeResponsiva: 'hidden xl:table-cell',
      celula: (p) =>
        p.cliente ? <span className="truncate">{p.cliente.nome_razao}</span> : <span className="text-ink-3">—</span>,
    },
    {
      chave: 'mecanico',
      cabecalho: 'Mecânico',
      largura: '140px',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (p) =>
        p.mecanico ? (
          <span className="truncate">{p.mecanico.nome_completo}</span>
        ) : (
          <Selo tom="atencao">Sem mecânico</Selo>
        ),
    },
    {
      chave: 'status',
      cabecalho: 'Status',
      largura: '150px',
      celula: (p) => {
        const info = MAPA_STATUS[p.status]
        /* Trocar o status é a ação mais repetida do laboratório: fica na
           própria linha, sem abrir o painel. Sem permissão vira só o selo. */
        return podeEditar ? (
          <Selecao
            aria-label={`Status da peça ${p.protocolo}`}
            value={p.status}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => atualizar.mutate({ id: p.id, campos: { status: e.target.value } })}
            className="h-8 text-[12px]"
          >
            {STATUS_PECA.map((st) => (
              <option key={st.valor} value={st.valor}>{st.rotulo}</option>
            ))}
          </Selecao>
        ) : (
          <Selo tom={info.tom} ponto>{info.rotulo}</Selo>
        )
      },
    },
    {
      chave: 'sla',
      cabecalho: 'Prazo',
      largura: '110px',
      celula: (p) => {
        const s = situacaoSla(p)
        return <Selo tom={s.tom} ponto={s.tom !== 'neutro'}>{s.rotulo}</Selo>
      },
    },
    {
      chave: 'acoes',
      cabecalho: '',
      largura: '56px',
      alinhamento: 'direita',
      celula: (p) => (
        <BotaoIcone rotulo={`Detalhes do protocolo ${p.protocolo}`} tamanho="sm" onClick={() => setAberta(p)}>
          <Eye />
        </BotaoIcone>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 rounded-full bg-accent" />
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Operação</p>
          </div>
          <h1 className="font-display text-xl font-bold text-ink">Peças em Teste</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lista.total !== null && (
            <span className="rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12px] text-ink-2">
              {lista.total.toLocaleString('pt-BR')} registros
            </span>
          )}
          {podeCriar && (
            <Botao variante="primario" iconeInicio={<Plus />} onClick={() => setCriando(true)}>
              Receber peça
            </Botao>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi rotulo="Em teste" valor={stats?.emTeste} subrotulo="no laboratório" cor="var(--c-cyan)" icone={<FlaskConical className="size-4" />} />
        <Kpi rotulo="Aguardando" valor={stats?.aguardando} subrotulo="peça ou cliente" cor="var(--c-warn)" icone={<Clock className="size-4" />} />
        <Kpi rotulo="Concluídas" valor={stats?.concluidas} subrotulo="reparadas ou entregues" cor="var(--c-ok)" icone={<CheckCircle2 className="size-4" />} />
        <Kpi rotulo="Prazo vencido" valor={stats?.vencidas} subrotulo="fora do SLA" cor="var(--c-crit)" icone={<Timer className="size-4" />} />
      </div>

      {sla.data && (sla.data.atencao > 0 || sla.data.vencido > 0) && (
        <Aviso tom={sla.data.vencido > 0 ? 'critico' : 'atencao'} titulo="Prazos do laboratório">
          {sla.data.vencido > 0 && `${sla.data.vencido} peça(s) com SLA vencido`}
          {sla.data.vencido > 0 && sla.data.atencao > 0 && ' · '}
          {sla.data.atencao > 0 && `${sla.data.atencao} vencendo nas próximas 8 horas`}
        </Aviso>
      )}

      <div className="flex flex-col">
        <BarraFiltros
          busca={ctrl.busca}
          aoBuscar={ctrl.setBusca}
          placeholder="Buscar por protocolo, peça, fabricante ou número de série"
          chips={chips}
          aoLimpar={chips.length ? limparTudo : undefined}
          aoAtualizar={lista.recarregar}
          atualizando={lista.buscando}
          filtros={
            <>
              <Campo rotulo="Status">
                {(p) => (
                  <Selecao
                    {...p}
                    value={fStatus}
                    onChange={(e) => { setFStatus(e.target.value as '' | StatusPecaTeste); ctrl.reiniciar() }}
                  >
                    <option value="">Todos</option>
                    {STATUS_PECA.map((st) => <option key={st.valor} value={st.valor}>{st.rotulo}</option>)}
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Mecânico">
                {(p) => (
                  <Selecao
                    {...p}
                    value={fMecanico}
                    onChange={(e) => { setFMecanico(e.target.value); ctrl.reiniciar() }}
                  >
                    <option value="">Todos</option>
                    {(mecanicosLab.data ?? []).map((m) => (
                      <option key={m.id} value={m.id}>{m.nome_completo}</option>
                    ))}
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Prazo">
                {(p) => (
                  <Selecao
                    {...p}
                    value={fSla}
                    onChange={(e) => { setFSla(e.target.value as '' | 'vencido' | 'atencao'); ctrl.reiniciar() }}
                  >
                    <option value="">Todos</option>
                    <option value="vencido">Vencido</option>
                    <option value="atencao">Vence em 8h</option>
                  </Selecao>
                )}
              </Campo>
            </>
          }
        />

        <Tabela
          aoDuploClique={(p) => setAberta(p)}
          densidade="compacta"
          className="rounded-none"
          colunas={colunas}
          linhas={lista.linhas}
          chaveDe={(p) => p.id}
          estado={lista.estado}
          mensagemVazio={{
            titulo: ctrl.busca || chips.length ? 'Nenhum resultado' : 'Nenhuma peça no laboratório',
            descricao:
              ctrl.busca || chips.length
                ? 'Ajuste a busca ou os filtros.'
                : 'As peças recebidas para teste aparecem aqui com protocolo e prazo.',
            acao:
              podeCriar && !ctrl.busca && !chips.length ? (
                <Botao tamanho="sm" variante="neutro" iconeInicio={<FlaskConical />} onClick={() => setCriando(true)}>
                  Receber a primeira
                </Botao>
              ) : undefined,
          }}
          mensagemErro={{ descricao: mensagemErro(lista.erro), aoTentarNovamente: lista.recarregar }}
        />

        {lista.estado === 'ok' && (
          <Paginacao
            className="rounded-t-none border-t-0 py-2"
            pagina={ctrl.pagina}
            porPagina={ctrl.porPagina}
            total={lista.total}
            aoMudarPagina={ctrl.setPagina}
          />
        )}
      </div>

      {/* Modal Receber */}
      <PainelLateral
        aberto={criando}
        aoFechar={() => setCriando(false)}
        largura="md"
        titulo="Receber peça"
        descricao="O protocolo é gerado automaticamente."
        rodape={
          <>
            <Botao variante="fantasma" onClick={() => setCriando(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={registrar.isPending} onClick={() => registrar.mutate()}>
              Gerar protocolo
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <Aviso tom="critico">{erro}</Aviso>}
          <Grade>
            <Campo className="sm:col-span-12" rotulo="Cliente" obrigatorio>
              {(p) => <SeletorRef {...p} config={REF_CLIENTE} valor={nova.cliente_id} aoSelecionar={(o) => setNova({ ...nova, cliente_id: o?.id ?? null })} placeholder="Buscar cliente" />}
            </Campo>
            <Campo className="sm:col-span-8" rotulo="Peça" obrigatorio>
              {(p) => <Entrada {...p} value={nova.peca} onChange={(e) => setNova({ ...nova, peca: e.target.value })} placeholder="Ex.: Válvula relé" />}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="Quantidade">
              {(p) => <Entrada {...p} mono type="number" min="1" value={nova.quantidade} onChange={(e) => setNova({ ...nova, quantidade: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-6" rotulo="Fabricante">
              {(p) => <Entrada {...p} value={nova.fabricante} onChange={(e) => setNova({ ...nova, fabricante: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-6" rotulo="Nº série">
              {(p) => <Entrada {...p} mono value={nova.numero_serie} onChange={(e) => setNova({ ...nova, numero_serie: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Problema">
              {(p) => <AreaTexto {...p} rows={2} value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-6" rotulo="Mecânico">
              {(p) => (
                <Selecao {...p} value={nova.mecanico_id} onChange={(e) => setNova({ ...nova, mecanico_id: e.target.value })}>
                  <option value="">Não atribuído</option>
                  {mecanicosLab.data?.map((m) => <option key={m.id} value={m.id}>{m.nome_completo}</option>)}
                </Selecao>
              )}
            </Campo>
            <Campo className="sm:col-span-6" rotulo="SLA (h)">
              {(p) => (
                <Entrada
                  {...p}
                  mono
                  type="number"
                  min="1"
                  disabled={!podeConfigurar}
                  value={nova.sla_horas}
                  onChange={(e) => setNova({ ...nova, sla_horas: e.target.value })}
                />
              )}
            </Campo>
          </Grade>
        </div>
      </PainelLateral>

      {/* Modal Detalhe */}
      <PainelLateral
        aberto={Boolean(aberta)}
        aoFechar={() => setAberta(null)}
        largura="md"
        titulo={aberta?.protocolo ?? ''}
        descricao={aberta?.peca}
        rodape={
          aberta ? (
            <Botao variante="secundario" iconeInicio={<Printer />} onClick={() => setImprimindo(aberta)}>
              Documentos
            </Botao>
          ) : undefined
        }
      >
        {aberta && (
          <div className="flex flex-col gap-4">
            <Grade>
              <Campo className="sm:col-span-6" rotulo="Status">
                {(p) => (
                  <Selecao
                    {...p}
                    value={aberta.status}
                    disabled={!podeEditar}
                    onChange={(e) => {
                      atualizar.mutate({ id: aberta.id, campos: { status: e.target.value } })
                      setAberta({ ...aberta, status: e.target.value as StatusPecaTeste })
                    }}
                  >
                    {STATUS_PECA.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
                  </Selecao>
                )}
              </Campo>
              <Campo className="sm:col-span-6" rotulo="Mecânico">
                {(p) => (
                  <Selecao
                    {...p}
                    value={aberta.mecanico_id ?? ''}
                    disabled={!podeEditar}
                    onChange={(e) => {
                      atualizar.mutate({ id: aberta.id, campos: { mecanico_id: e.target.value || null } })
                      setAberta({ ...aberta, mecanico_id: e.target.value || null })
                    }}
                  >
                    <option value="">Não atribuído</option>
                    {mecanicosLab.data?.map((m) => <option key={m.id} value={m.id}>{m.nome_completo}</option>)}
                  </Selecao>
                )}
              </Campo>
              <Campo className="sm:col-span-12" rotulo="Laudo técnico">
                {(p) => (
                  <AreaTexto
                    {...p}
                    rows={3}
                    disabled={!podeEditar}
                    defaultValue={aberta.laudo ?? ''}
                    onBlur={(e) => atualizar.mutate({ id: aberta.id, campos: { laudo: e.target.value.trim() || null } })}
                  />
                )}
              </Campo>
            </Grade>

            <div className="flex flex-wrap gap-4 rounded-lg border border-line bg-surface-2 p-3">
              <div className="flex items-center gap-1.5 text-[12px] text-ink-2">
                <Clock className="size-4 text-ink-3" />
                Entrada {dataHora(aberta.entrada_em)}
              </div>
              {aberta.prazo_em && (
                <div className="flex items-center gap-1.5 text-[12px] text-ink-2">
                  <Timer className="size-4 text-ink-3" />
                  Prazo {dataHora(aberta.prazo_em)}
                </div>
              )}
              {aberta.entregue_em && (
                <div className="flex items-center gap-1.5 text-[12px] text-ok-ink">
                  <CheckCircle2 className="size-4" />
                  Entregue {dataHora(aberta.entregue_em)}
                </div>
              )}
            </div>

            <Evidencias
              entidade="pecas_teste"
              entidadeId={aberta.id}
              categorias={['Recebimento', 'Teste', 'Reparo', 'Entrega']}
              titulo="Evidências"
              contexto={{ protocolo: aberta.protocolo, peca: aberta.peca, cliente: aberta.cliente?.nome_razao }}
            />
          </div>
        )}
      </PainelLateral>

      {imprimindo && <DocumentoProtocolo peca={imprimindo} aoFechar={() => setImprimindo(null)} />}
    </div>
  )
}
