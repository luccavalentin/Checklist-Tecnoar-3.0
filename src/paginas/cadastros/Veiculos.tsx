import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { History, Plus, Shield, TrendingUp, Truck, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, dataHora, mensagemErro } from '@/lib/utils'
import { mascaraPlaca, UFS } from '@/lib/formatos'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useExclusao, DialogoExclusao } from '@/dados/exclusao'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { BarraFiltros } from '@/componentes/ui/BarraFiltros'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade, Secao } from '@/componentes/ui/Secao'
import { Paginacao, Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { Confirmacao, PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { SeletorRef, REF_CLIENTE } from '@/componentes/ui/SeletorRef'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { FormularioCliente } from './FormularioCliente'
import type { SituacaoRegistro, TipoVeiculo, VeiculoListado } from '@/tipos/db'

export const TIPOS_VEICULO: Array<{ valor: TipoVeiculo; rotulo: string }> = [
  { valor: 'cavalo', rotulo: 'Cavalo mecânico' },
  { valor: 'carreta', rotulo: 'Carreta / semirreboque' },
  { valor: 'truck', rotulo: 'Truck' },
  { valor: 'toco', rotulo: 'Toco' },
  { valor: 'bitrem', rotulo: 'Bitrem' },
  { valor: 'rodotrem', rotulo: 'Rodotrem' },
  { valor: 'vanderleia', rotulo: 'Vanderleia' },
  { valor: 'onibus', rotulo: 'Ônibus' },
  { valor: 'van', rotulo: 'Van' },
  { valor: 'utilitario', rotulo: 'Utilitário' },
  { valor: 'outro', rotulo: 'Outro' },
]

export const ROTULO_TIPO_VEICULO = Object.fromEntries(TIPOS_VEICULO.map((t) => [t.valor, t.rotulo])) as Record<
  TipoVeiculo,
  string
>

interface FormVeiculo {
  placa: string
  descricao: string
  cliente_id: string
  tipo: TipoVeiculo | ''
  marca: string
  modelo: string
  ano: string
  cor: string
  renavam: string
  chassi: string
  numero_frota: string
  municipio: string
  uf: string
  observacoes: string
  alerta_operador: string
  situacao: SituacaoRegistro
}

const VAZIO: FormVeiculo = {
  placa: '',
  descricao: '',
  cliente_id: '',
  tipo: '',
  marca: '',
  modelo: '',
  ano: '',
  cor: '',
  renavam: '',
  chassi: '',
  numero_frota: '',
  municipio: '',
  uf: '',
  observacoes: '',
  alerta_operador: '',
  situacao: 'ativo',
}

const SELECT_LISTA =
  'id, codigo, placa, descricao, tipo, marca, modelo, ano, municipio, uf, km_atual, alerta_operador, situacao, cliente_id, ' +
  'cliente:clientes ( id, nome_razao )'

export function Veiculos() {
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const ctrl = useControleListagem(25)
  const [fTipo, setFTipo] = useState<'' | TipoVeiculo>('')
  const [fUF, setFUF] = useState('')
  const [fMunicipio, setFMunicipio] = useState('')
  const [fCliente, setFCliente] = useState<string | null>(null)
  const [fSituacao, setFSituacao] = useState<'todas' | SituacaoRegistro>('ativo')

  const [editando, setEditando] = useState<VeiculoListado | null>(null)
  const [criando, setCriando] = useState(false)
  const [alvo, setAlvo] = useState<VeiculoListado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [criandoCliente, setCriandoCliente] = useState(false)
  const [verHistorico, setVerHistorico] = useState<VeiculoListado | null>(null)

  const podeVer = pode('veiculos', 'visualizar')
  const podeCriar = pode('veiculos', 'criar')
  const podeEditar = pode('veiculos', 'editar')
  const podeInativar = pode('veiculos', 'inativar')

  const exclusao = useExclusao({ tabela: 'veiculos', invalidar: [['veiculos']] })

  // Estatísticas
  const stats = useQuery({
    queryKey: ['veiculos', 'stats'],
    enabled: podeVer,
    queryFn: async () => {
      const [total, ativos, porCliente] = await Promise.all([
        supabase.from('veiculos').select('*', { count: 'exact', head: true }),
        supabase.from('veiculos').select('*', { count: 'exact', head: true }).eq('situacao', 'ativo'),
        supabase.from('veiculos').select('*', { count: 'exact', head: true }).not('cliente_id', 'is', null),
      ])
      return {
        total: total.count ?? 0,
        ativos: ativos.count ?? 0,
        comClientes: porCliente.count ?? 0,
      }
    },
  })

  const filtrar = useMemo(
    () => (q: Consulta) => {
      const t = termoBusca(ctrl.busca)
      let r = q
      if (t.length >= 2) {
        const placa = t.toUpperCase().replace(/[^A-Z0-9]/g, '')
        const partes = [`descricao.ilike.%${t}%`, `numero_frota.ilike.%${t}%`, `chassi.ilike.%${t}%`]
        if (placa) partes.push(`placa_normalizada.ilike.%${placa}%`)
        r = r.or(partes.join(','))
      }
      if (fTipo) r = r.eq('tipo', fTipo)
      if (fUF) r = r.eq('uf', fUF)
      if (fMunicipio.trim()) r = r.ilike('municipio', `%${fMunicipio.trim()}%`)
      if (fCliente) r = r.eq('cliente_id', fCliente)
      if (fSituacao !== 'todas') r = r.eq('situacao', fSituacao)
      return r
    },
    [ctrl.busca, fTipo, fUF, fMunicipio, fCliente, fSituacao],
  )

  const lista = useListagem<VeiculoListado>({
    chave: ['veiculos', 'lista', ctrl.busca, fTipo, fUF, fMunicipio, fCliente, fSituacao, ctrl.pagina, ctrl.porPagina],
    tabela: 'veiculos',
    select: SELECT_LISTA,
    filtrar,
    ordenacao: { coluna: 'placa', ascendente: true },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
    habilitado: podeVer,
  })

  const historico = useQuery({
    queryKey: ['veiculo_proprietarios', verHistorico?.id],
    enabled: Boolean(verHistorico),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('veiculo_proprietarios')
        .select('id, inicio_em, fim_em, cliente:clientes ( nome_razao )')
        .eq('veiculo_id', verHistorico!.id)
        .order('inicio_em', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as Array<{
        id: string
        inicio_em: string
        fim_em: string | null
        cliente: { nome_razao: string } | null
      }>
    },
  })

  const form = useForm<FormVeiculo>({ defaultValues: VAZIO })

  useEffect(() => {
    if (editando) {
      form.reset({
        placa: editando.placa,
        descricao: editando.descricao,
        cliente_id: editando.cliente_id ?? '',
        tipo: editando.tipo ?? '',
        marca: editando.marca ?? '',
        modelo: editando.modelo ?? '',
        ano: editando.ano !== null ? String(editando.ano) : '',
        cor: editando.cor ?? '',
        renavam: editando.renavam ?? '',
        chassi: editando.chassi ?? '',
        numero_frota: editando.numero_frota ?? '',
        municipio: editando.municipio ?? '',
        uf: editando.uf ?? '',
        observacoes: editando.observacoes ?? '',
        alerta_operador: editando.alerta_operador ?? '',
        situacao: editando.situacao,
      })
    } else if (criando) form.reset(VAZIO)
    setErro(null)
  }, [editando, criando, form])

  const salvar = useMutation({
    mutationFn: async (d: FormVeiculo) => {
      const placa = d.placa.trim().toUpperCase()
      if (placa.replace(/[^A-Z0-9]/g, '').length < 7) throw new Error('Informe a placa completa.')
      if (d.descricao.trim().length < 2) throw new Error('Informe a descrição do veículo.')
      const ano = d.ano ? Number(d.ano) : null
      if (ano !== null && (ano < 1950 || ano > new Date().getFullYear() + 1)) throw new Error('Ano inválido.')

      const payload = {
        placa,
        descricao: d.descricao.trim(),
        cliente_id: d.cliente_id || null,
        tipo: d.tipo || null,
        marca: d.marca.trim() || null,
        modelo: d.modelo.trim() || null,
        ano,
        cor: d.cor.trim() || null,
        renavam: d.renavam.trim() || null,
        chassi: d.chassi.trim().toUpperCase() || null,
        numero_frota: d.numero_frota.trim() || null,
        municipio: d.municipio.trim() || null,
        uf: d.uf || null,
        observacoes: d.observacoes.trim() || null,
        alerta_operador: d.alerta_operador.trim() || null,
        situacao: d.situacao,
      }
      const r = editando
        ? await supabase.from('veiculos').update(payload).eq('id', editando.id)
        : await supabase.from('veiculos').insert(payload)
      if (r.error) throw r.error
    },
    onSuccess: () => {
      toast.ok(editando ? 'Veículo atualizado' : 'Veículo cadastrado')
      setEditando(null)
      setCriando(false)
      void qc.invalidateQueries({ queryKey: ['veiculos'] })
    },
    onError: (e) => {
      const m = mensagemErro(e)
      setErro(m.includes('duplicate key') ? 'Já existe um veículo com esta placa.' : m)
    },
  })

  const mudarSituacao = useMutation({
    mutationFn: async (v: VeiculoListado) => {
      const nova: SituacaoRegistro = v.situacao === 'ativo' ? 'inativo' : 'ativo'
      const { error } = await supabase.from('veiculos').update({ situacao: nova }).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Situação alterada')
      setAlvo(null)
      void qc.invalidateQueries({ queryKey: ['veiculos'] })
    },
    onError: (e) => toast.erro('Não foi possível alterar', mensagemErro(e)),
  })

  /* ═══════════════════════════════════════════════════════════════
     KPI CARD — Premium Design Compacto Clicável
     ═══════════════════════════════════════════════════════════════ */
  function KpiCard({ valor, rotulo, subrotulo, cor, icone, indice, onClick }: {
    valor: string | number; rotulo: string; subrotulo?: string; cor: string; icone: React.ReactNode; indice: number; onClick?: () => void
  }) {
    return (
      <div onClick={onClick}
        className={cn('group relative overflow-hidden rounded-xl border border-line/50 bg-gradient-to-br from-surface to-surface-2 p-3 transition-all duration-300',
          onClick ? 'cursor-pointer hover:shadow-lg hover:shadow-accent/5 hover:-translate-y-0.5' : '')}
        style={{ animationDelay: `${indice * 80}ms` }}>
        <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-15 blur-xl" style={{ backgroundColor: cor }} />
        </div>
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-3 truncate">{rotulo}</span>
            <span className="font-mono text-[22px] font-bold tracking-tight text-ink transition-transform duration-300 group-hover:scale-105">{valor}</span>
            {subrotulo && <span className="text-[9px] text-ink-3 truncate">{subrotulo}</span>}
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line/50 transition-all duration-300 group-hover:scale-110"
            style={{ backgroundColor: `${cor}10`, boxShadow: `0 0 12px ${cor}20` }}>
            <div style={{ color: cor }} className="scale-90">{icone}</div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 h-[2px] w-0 rounded-b-xl transition-all duration-500 group-hover:w-full" style={{ background: `linear-gradient(90deg, ${cor}, transparent)` }} />
        {onClick && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="text-[9px] font-medium text-ink-3 bg-surface/80 px-2 py-1 rounded-full backdrop-blur-sm">Ver lista →</span>
          </div>
        )}
      </div>
    )
  }

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-accent" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Cadastros</p>
        </div>
        <h1 className="font-display text-xl font-bold text-ink">Veículos</h1>
        <EstadoSemPermissao />
      </div>
    )
  }

  const chips = [
    fSituacao !== 'ativo' && { id: 's', rotulo: `Situação: ${fSituacao === 'todas' ? 'Todas' : 'Inativo'}`, aoRemover: () => setFSituacao('ativo') },
    fTipo && { id: 't', rotulo: `Tipo: ${ROTULO_TIPO_VEICULO[fTipo]}`, aoRemover: () => setFTipo('') },
    fUF && { id: 'u', rotulo: `UF: ${fUF}`, aoRemover: () => setFUF('') },
    fMunicipio && { id: 'm', rotulo: `Município: ${fMunicipio}`, aoRemover: () => setFMunicipio('') },
    fCliente && { id: 'c', rotulo: 'Cliente filtrado', aoRemover: () => setFCliente(null) },
  ].filter(Boolean) as Array<{ id: string; rotulo: string; aoRemover: () => void }>

  const colunas: Array<Coluna<VeiculoListado>> = [
    { chave: 'codigo', cabecalho: 'ID', largura: '80px', classeResponsiva: 'hidden sm:table-cell', celula: (v) => <span className="num text-ink-3">{String(v.codigo).padStart(5, '0')}</span> },
    { chave: 'placa', cabecalho: 'Placa', largura: '120px', celula: (v) => <span className="num text-[15px] font-semibold tracking-wide text-ink">{v.placa}</span> },
    { chave: 'descricao', cabecalho: 'Descrição', celula: (v) => <div className="flex min-w-0 flex-col"><span className="truncate text-ink">{v.descricao}</span><span className="truncate text-[12px] text-ink-3">{[v.tipo ? ROTULO_TIPO_VEICULO[v.tipo] : null, v.marca, v.modelo, v.ano].filter(Boolean).join(' · ') || '—'}</span></div> },
    { chave: 'cliente', cabecalho: 'Cliente', largura: '220px', classeResponsiva: 'hidden lg:table-cell', celula: (v) => v.cliente ? <span className="truncate">{v.cliente.nome_razao}</span> : <span className="text-ink-3">Sem proprietário</span> },
    { chave: 'municipio', cabecalho: 'Município', largura: '150px', classeResponsiva: 'hidden xl:table-cell', celula: (v) => v.municipio ?? <span className="text-ink-3">—</span> },
    { chave: 'uf', cabecalho: 'UF', largura: '60px', classeResponsiva: 'hidden xl:table-cell', celula: (v) => <span className="num">{v.uf ?? '—'}</span> },
    { chave: 'situacao', cabecalho: 'Situação', largura: '190px', celula: (v) => <div className="flex flex-wrap items-center gap-1.5"><Selo tom={v.situacao === 'ativo' ? 'ok' : 'neutro'} ponto>{v.situacao === 'ativo' ? 'Ativo' : 'Inativo'}</Selo>{v.alerta_operador && <Selo tom="atencao">Alerta</Selo>}</div> },
    { chave: 'acoes', cabecalho: '', largura: '280px', alinhamento: 'direita', celula: (v) => <div className="flex justify-end gap-1"><Botao tamanho="sm" variante="fantasma" iconeInicio={<History />} onClick={() => setVerHistorico(v)}>Histórico</Botao>{podeEditar && <Botao tamanho="sm" variante="fantasma" onClick={() => setEditando(v)}>Editar</Botao>}{podeInativar && <Botao tamanho="sm" variante="fantasma" onClick={() => setAlvo(v)}>{v.situacao === 'ativo' ? 'Inativar' : 'Reativar'}</Botao>}{podeInativar && <Botao tamanho="sm" variante="fantasma" onClick={() => exclusao.pedir(v.id)}>Excluir</Botao>}</div> },
  ]

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 rounded-full bg-accent" />
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Cadastros</p>
          </div>
          <h1 className="font-display text-xl font-bold text-ink">Veículos</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lista.total !== null && (
            <span className="rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12px] text-ink-2">
              {lista.total.toLocaleString('pt-BR')} registros
            </span>
          )}
          {podeCriar && (
            <Botao variante="primario" iconeInicio={<Plus className="size-4" />} onClick={() => setCriando(true)}>
              Novo Veículo
            </Botao>
          )}
        </div>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard indice={0} valor={stats.data?.total.toLocaleString('pt-BR') ?? '—'} rotulo="Total" subrotulo="veículos" cor="var(--c-accent)" icone={<Truck className="size-4" />} onClick={() => { setFSituacao('todas'); setFTipo(''); ctrl.setBusca(''); ctrl.reiniciar() }} />
        <KpiCard indice={1} valor={stats.data?.ativos.toLocaleString('pt-BR') ?? '—'} rotulo="Ativos" subrotulo="no sistema" cor="var(--c-ok)" icone={<Shield className="size-4" />} onClick={() => { setFSituacao('ativo'); setFTipo(''); ctrl.setBusca(''); ctrl.reiniciar() }} />
        <KpiCard indice={2} valor={stats.data?.comClientes.toLocaleString('pt-BR') ?? '—'} rotulo="Com Cliente" subrotulo="vinculados" cor="var(--c-cyan)" icone={<User className="size-4" />} onClick={() => { setFSituacao('ativo'); ctrl.setBusca(''); ctrl.reiniciar() }} />
        <KpiCard indice={3} valor={lista.total?.toLocaleString('pt-BR') ?? '—'} rotulo="Exibidos" subrotulo="nesta busca" cor="var(--c-warn)" icone={<TrendingUp className="size-4" />} />
      </div>

      {/* Tabela */}
      <div className="flex flex-col">
        <BarraFiltros
          busca={ctrl.busca}
          aoBuscar={ctrl.setBusca}
          placeholder="Buscar por placa, descrição, frota ou chassi"
          chips={chips}
          aoLimpar={chips.length ? () => { setFTipo(''); setFUF(''); setFMunicipio(''); setFCliente(null); setFSituacao('ativo'); ctrl.reiniciar() } : undefined}
          aoAtualizar={lista.recarregar}
          atualizando={lista.buscando}
          filtros={
            <>
              <Campo rotulo="Tipo">
                {(p) => (
                  <Selecao {...p} value={fTipo} onChange={(e) => { setFTipo(e.target.value as TipoVeiculo | ''); ctrl.reiniciar() }}>
                    <option value="">Todos</option>
                    {TIPOS_VEICULO.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Cliente">
                {(p) => (
                  <SeletorRef
                    {...p}
                    config={REF_CLIENTE}
                    valor={fCliente}
                    aoSelecionar={(o) => { setFCliente(o?.id ?? null); ctrl.reiniciar() }}
                    placeholder="Todos"
                  />
                )}
              </Campo>
              <Campo rotulo="Município">
                {(p) => <Entrada {...p} value={fMunicipio} onChange={(e) => { setFMunicipio(e.target.value); ctrl.reiniciar() }} placeholder="Todos" />}
              </Campo>
              <Campo rotulo="UF">
                {(p) => (
                  <Selecao {...p} value={fUF} onChange={(e) => { setFUF(e.target.value); ctrl.reiniciar() }}>
                    <option value="">Todas</option>
                    {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Situação">
                {(p) => (
                  <Selecao {...p} value={fSituacao} onChange={(e) => { setFSituacao(e.target.value as typeof fSituacao); ctrl.reiniciar() }}>
                    <option value="ativo">Ativos</option>
                    <option value="inativo">Inativos</option>
                    <option value="todas">Todos</option>
                  </Selecao>
                )}
              </Campo>
            </>
          }
        />

        <Tabela
          aoDuploClique={podeEditar ? (linha) => setEditando(linha) : undefined}
          className="rounded-none"
          colunas={colunas}
          linhas={lista.linhas}
          chaveDe={(v) => v.id}
          estado={lista.estado}
          mensagemVazio={{
            titulo: ctrl.busca || chips.length ? 'Nenhum resultado' : 'Nenhum veículo cadastrado',
            descricao: ctrl.busca || chips.length ? 'Ajuste a busca ou os filtros.' : 'A base de veículos alimenta Recepção, OS, checklists e garantias.',
            acao: podeCriar && !ctrl.busca && !chips.length ? <Botao tamanho="sm" variante="neutro" iconeInicio={<Truck />} onClick={() => setCriando(true)}>Cadastrar o primeiro</Botao> : undefined,
          }}
          mensagemErro={{ descricao: mensagemErro(lista.erro), aoTentarNovamente: lista.recarregar }}
        />

        {lista.estado === 'ok' && (
          <Paginacao className="rounded-t-none border-t-0" pagina={ctrl.pagina} porPagina={ctrl.porPagina} total={lista.total} aoMudarPagina={ctrl.setPagina} />
        )}
      </div>

      <PainelLateral
        aberto={criando || Boolean(editando)}
        aoFechar={() => { setCriando(false); setEditando(null) }}
        largura="xl"
        titulo={editando ? `Veículo ${editando.placa}` : 'Novo veículo'}
        rodape={
          <>
            <Botao variante="neutro" onClick={() => { setCriando(false); setEditando(null) }}>Cancelar</Botao>
            <Botao variante="primario" carregando={salvar.isPending} onClick={form.handleSubmit((d) => salvar.mutate(d))}>Salvar</Botao>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((d) => salvar.mutate(d))}>
          {erro && <Aviso tom="critico">{erro}</Aviso>}

          <Secao numero="01" titulo="Identificação">
            <Grade>
              <Campo className="sm:col-span-3" rotulo="Placa" obrigatorio>
                {(p) => (
                  <Entrada
                    {...p}
                    mono
                    className="text-[15px] font-semibold tracking-wide uppercase"
                    value={form.watch('placa')}
                    onChange={(e) => form.setValue('placa', mascaraPlaca(e.target.value), { shouldDirty: true })}
                    placeholder="AAA-0A00"
                  />
                )}
              </Campo>
              <Campo className="sm:col-span-6" rotulo="Descrição" obrigatorio dica="Como a oficina identifica o veículo.">
                {(p) => <Entrada {...p} {...form.register('descricao', { required: true })} placeholder="Ex.: Cavalo Scania R450 branco" />}
              </Campo>
              <Campo className="sm:col-span-3" rotulo="Situação">
                {(p) => (
                  <Selecao {...p} {...form.register('situacao')}>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </Selecao>
                )}
              </Campo>

              <Campo className="sm:col-span-6" rotulo="Cliente proprietário" dica="Selecione da base central. A troca de proprietário fica registrada no histórico.">
                {(p) => (
                  <SeletorRef
                    {...p}
                    config={REF_CLIENTE}
                    valor={form.watch('cliente_id') || null}
                    aoSelecionar={(o) => form.setValue('cliente_id', o?.id ?? '', { shouldDirty: true })}
                    placeholder="Buscar cliente"
                    aoCriar={() => setCriandoCliente(true)}
                    rotuloCriar="Cadastrar cliente"
                  />
                )}
              </Campo>
              <Campo className="sm:col-span-3" rotulo="Tipo de veículo">
                {(p) => (
                  <Selecao {...p} {...form.register('tipo')}>
                    <option value="">Não informado</option>
                    {TIPOS_VEICULO.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
                  </Selecao>
                )}
              </Campo>
              <Campo className="sm:col-span-3" rotulo="Número de frota">
                {(p) => <Entrada {...p} mono {...form.register('numero_frota')} />}
              </Campo>
            </Grade>
          </Secao>

          <Secao numero="02" titulo="Dados técnicos">
            <Grade>
              <Campo className="sm:col-span-3" rotulo="Marca">{(p) => <Entrada {...p} {...form.register('marca')} />}</Campo>
              <Campo className="sm:col-span-3" rotulo="Modelo">{(p) => <Entrada {...p} {...form.register('modelo')} />}</Campo>
              <Campo className="sm:col-span-2" rotulo="Ano">{(p) => <Entrada {...p} mono type="number" {...form.register('ano')} placeholder="0000" />}</Campo>
              <Campo className="sm:col-span-2" rotulo="Cor">{(p) => <Entrada {...p} {...form.register('cor')} />}</Campo>
              <Campo className="sm:col-span-2" rotulo="Renavam">{(p) => <Entrada {...p} mono {...form.register('renavam')} />}</Campo>
              <Campo className="sm:col-span-6" rotulo="Chassi">{(p) => <Entrada {...p} mono className="uppercase" {...form.register('chassi')} />}</Campo>
              <Campo className="sm:col-span-4" rotulo="Município">{(p) => <Entrada {...p} {...form.register('municipio')} />}</Campo>
              <Campo className="sm:col-span-2" rotulo="UF">
                {(p) => (
                  <Selecao {...p} {...form.register('uf')}>
                    <option value="">—</option>
                    {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </Selecao>
                )}
              </Campo>
            </Grade>
          </Secao>

          <Secao numero="03" titulo="Observações e alertas">
            <Grade>
              <Campo
                className="sm:col-span-12"
                rotulo="Alerta ao operador"
                dica="Aparece em destaque na Recepção e na OS sempre que este veículo entrar."
              >
                {(p) => <Entrada {...p} {...form.register('alerta_operador')} placeholder="Ex.: Cliente exige aprovação por escrito antes de qualquer serviço" />}
              </Campo>
              <Campo className="sm:col-span-12" rotulo="Observações">
                {(p) => <AreaTexto {...p} {...form.register('observacoes')} rows={3} />}
              </Campo>
            </Grade>
          </Secao>
        </form>
      </PainelLateral>

      <PainelLateral
        aberto={Boolean(verHistorico)}
        aoFechar={() => setVerHistorico(null)}
        titulo={`Histórico — ${verHistorico?.placa ?? ''}`}
        descricao="Troca de proprietário registrada automaticamente."
      >
        {historico.isLoading && <p className="text-[13px] text-ink-3">Carregando…</p>}
        {historico.isSuccess && historico.data.length === 0 && (
          <p className="text-[13px] text-ink-3">Nenhuma troca de proprietário registrada.</p>
        )}
        {historico.isSuccess && historico.data.length > 0 && (
          <ul className="flex flex-col gap-3">
            {historico.data.map((h) => (
              <li key={h.id} className="flex flex-col gap-1 rounded-lg border border-line p-3.5">
                <span className="text-[13.5px] font-medium text-ink">{h.cliente?.nome_razao ?? 'Sem proprietário'}</span>
                <span className="num text-[12px] text-ink-3">
                  {dataHora(h.inicio_em)} → {h.fim_em ? dataHora(h.fim_em) : 'atual'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PainelLateral>

      <FormularioCliente
        aberto={criandoCliente}
        clienteId={null}
        aoFechar={() => setCriandoCliente(false)}
        aoSalvar={(id) => form.setValue('cliente_id', id, { shouldDirty: true })}
      />

      <Confirmacao
        aberto={Boolean(alvo)}
        aoFechar={() => setAlvo(null)}
        aoConfirmar={() => alvo && mudarSituacao.mutate(alvo)}
        carregando={mudarSituacao.isPending}
        destrutivo={alvo?.situacao === 'ativo'}
        titulo={alvo?.situacao === 'ativo' ? 'Inativar veículo?' : 'Reativar veículo?'}
        rotuloConfirmar={alvo?.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
        descricao={<><strong className="font-semibold text-ink">{alvo?.placa}</strong> {alvo?.situacao === 'ativo' ? 'deixa de aparecer na Recepção e na abertura de OS. O prontuário é preservado.' : 'volta a ficar disponível para atendimento.'}</>}
      />

      <DialogoExclusao ctrl={exclusao} />
    </div>
  )
}
