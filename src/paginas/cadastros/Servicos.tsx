import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { DollarSign, Plus, Shield, TrendingUp, Wrench } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro } from '@/lib/utils'
import { moeda, paraNumero } from '@/lib/formatos'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useExclusao, DialogoExclusao } from '@/dados/exclusao'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { BarraFiltros } from '@/componentes/ui/BarraFiltros'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade, Secao } from '@/componentes/ui/Secao'
import { Paginacao, Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { Confirmacao, PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { REF_ESPECIALIDADE, SeletorRef } from '@/componentes/ui/SeletorRef'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import type { ServicoListado, SituacaoRegistro } from '@/tipos/db'

interface FormServico {
  codigo: string
  descricao: string
  valor_padrao: string
  tempo_estimado_min: string
  especialidade_id: string
  observacoes: string
  situacao: SituacaoRegistro
}

const VAZIO: FormServico = {
  codigo: '',
  descricao: '',
  valor_padrao: '',
  tempo_estimado_min: '',
  especialidade_id: '',
  observacoes: '',
  situacao: 'ativo',
}

const SELECT_LISTA =
  'id, codigo, descricao, valor_padrao, tempo_estimado_min, situacao, origem, especialidade_id, ' +
  'especialidade:especialidades ( id, nome )'

export function Servicos() {
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const ctrl = useControleListagem(25)
  const [fSituacao, setFSituacao] = useState<'todas' | SituacaoRegistro>('ativo')
  const [fEspecialidade, setFEspecialidade] = useState<string | null>(null)
  const [editando, setEditando] = useState<ServicoListado | null>(null)
  const [criando, setCriando] = useState(false)
  const [alvo, setAlvo] = useState<ServicoListado | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const podeVer = pode('servicos', 'visualizar')
  const podeCriar = pode('servicos', 'criar')
  const podeEditar = pode('servicos', 'editar')
  const podeInativar = pode('servicos', 'inativar')

  const exclusao = useExclusao({ tabela: 'servicos', invalidar: [['servicos']] })

  // Estatísticas
  const stats = useQuery({
    queryKey: ['servicos', 'stats'],
    enabled: podeVer,
    queryFn: async () => {
      const [total, ativos] = await Promise.all([
        supabase.from('servicos').select('*', { count: 'exact', head: true }),
        supabase.from('servicos').select('*', { count: 'exact', head: true }).eq('situacao', 'ativo'),
      ])
      return { total: total.count ?? 0, ativos: ativos.count ?? 0 }
    },
  })

  const filtrar = useMemo(
    () => (q: Consulta) => {
      const t = termoBusca(ctrl.busca)
      let r = q
      if (t.length >= 2) r = r.or(`codigo.ilike.%${t}%,descricao.ilike.%${t}%`)
      if (fSituacao !== 'todas') r = r.eq('situacao', fSituacao)
      if (fEspecialidade) r = r.eq('especialidade_id', fEspecialidade)
      return r
    },
    [ctrl.busca, fSituacao, fEspecialidade],
  )

  const lista = useListagem<ServicoListado>({
    chave: ['servicos', 'lista', ctrl.busca, fSituacao, fEspecialidade, ctrl.pagina, ctrl.porPagina],
    tabela: 'servicos',
    select: SELECT_LISTA,
    filtrar,
    ordenacao: { coluna: 'descricao', ascendente: true },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
    habilitado: podeVer,
  })

  const form = useForm<FormServico>({ defaultValues: VAZIO })

  useEffect(() => {
    if (editando) {
      form.reset({
        codigo: editando.codigo,
        descricao: editando.descricao,
        valor_padrao: String(editando.valor_padrao).replace('.', ','),
        tempo_estimado_min: editando.tempo_estimado_min !== null ? String(editando.tempo_estimado_min) : '',
        especialidade_id: editando.especialidade_id ?? '',
        observacoes: editando.observacoes ?? '',
        situacao: editando.situacao,
      })
    } else if (criando) form.reset(VAZIO)
    setErro(null)
  }, [editando, criando, form])

  const salvar = useMutation({
    mutationFn: async (d: FormServico) => {
      if (!d.codigo.trim()) throw new Error('Informe o código do serviço.')
      if (d.descricao.trim().length < 2) throw new Error('Informe a descrição.')
      const payload = {
        codigo: d.codigo.trim(),
        descricao: d.descricao.trim(),
        valor_padrao: paraNumero(d.valor_padrao) ?? 0,
        tempo_estimado_min: d.tempo_estimado_min ? Number(d.tempo_estimado_min) : null,
        especialidade_id: d.especialidade_id || null,
        observacoes: d.observacoes.trim() || null,
        situacao: d.situacao,
      }
      const r = editando
        ? await supabase.from('servicos').update(payload).eq('id', editando.id)
        : await supabase.from('servicos').insert(payload)
      if (r.error) throw r.error
    },
    onSuccess: () => {
      toast.ok(editando ? 'Serviço atualizado' : 'Serviço cadastrado')
      setEditando(null)
      setCriando(false)
      void qc.invalidateQueries({ queryKey: ['servicos'] })
    },
    onError: (e) => {
      const m = mensagemErro(e)
      setErro(m.includes('duplicate key') ? 'Já existe um serviço com este código.' : m)
    },
  })

  const mudarSituacao = useMutation({
    mutationFn: async (s: ServicoListado) => {
      const nova: SituacaoRegistro = s.situacao === 'ativo' ? 'inativo' : 'ativo'
      const { error } = await supabase.from('servicos').update({ situacao: nova }).eq('id', s.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Situação alterada')
      setAlvo(null)
      void qc.invalidateQueries({ queryKey: ['servicos'] })
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
        <h1 className="font-display text-xl font-bold text-ink">Serviços</h1>
        <EstadoSemPermissao />
      </div>
    )
  }

  const chips = [
    fSituacao !== 'ativo' && { id: 's', rotulo: `Situação: ${fSituacao === 'todas' ? 'Todas' : 'Inativo'}`, aoRemover: () => setFSituacao('ativo') },
    fEspecialidade && { id: 'e', rotulo: 'Especialidade filtrada', aoRemover: () => setFEspecialidade(null) },
  ].filter(Boolean) as Array<{ id: string; rotulo: string; aoRemover: () => void }>

  const colunas: Array<Coluna<ServicoListado>> = [
    { chave: 'codigo', cabecalho: 'Código', largura: '120px', celula: (s) => <span className="num text-ink-2">{s.codigo}</span> },
    { chave: 'descricao', cabecalho: 'Descrição', celula: (s) => <span className="truncate text-ink">{s.descricao}</span> },
    { chave: 'especialidade', cabecalho: 'Especialidade', largura: '190px', classeResponsiva: 'hidden lg:table-cell', celula: (s) => s.especialidade ? <Selo tom="info">{s.especialidade.nome}</Selo> : <span className="text-ink-3">—</span> },
    { chave: 'tempo', cabecalho: 'Tempo', largura: '100px', alinhamento: 'direita', classeResponsiva: 'hidden xl:table-cell', celula: (s) => s.tempo_estimado_min ? <span className="num text-[12.5px] text-ink-2">{s.tempo_estimado_min} min</span> : <span className="text-ink-3">—</span> },
    { chave: 'valor', cabecalho: 'Valor padrão', largura: '115px', alinhamento: 'direita', celula: (s) => <span className="num whitespace-nowrap text-[13px] text-ink">{moeda(s.valor_padrao)}</span> },
    { chave: 'situacao', cabecalho: 'Situação', largura: '190px', celula: (s) => <div className="flex flex-wrap items-center gap-1.5"><Selo tom={s.situacao === 'ativo' ? 'ok' : 'neutro'} ponto>{s.situacao === 'ativo' ? 'Ativo' : 'Inativo'}</Selo>{s.origem === 'omie' && <Selo tom="info">Omie</Selo>}</div> },
    { chave: 'acoes', cabecalho: '', largura: '246px', alinhamento: 'direita', celula: (s) => <div className="flex justify-end gap-1.5">{podeEditar && <Botao tamanho="sm" variante="fantasma" onClick={() => setEditando(s)}>Editar</Botao>}{podeInativar && <Botao tamanho="sm" variante="fantasma" onClick={() => setAlvo(s)}>{s.situacao === 'ativo' ? 'Inativar' : 'Reativar'}</Botao>}{podeInativar && <Botao tamanho="sm" variante="fantasma" onClick={() => exclusao.pedir(s.id)}>Excluir</Botao>}</div> },
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
          <h1 className="font-display text-xl font-bold text-ink">Serviços</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lista.total !== null && (
            <span className="rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12px] text-ink-2">
              {lista.total.toLocaleString('pt-BR')} registros
            </span>
          )}
          {podeCriar && (
            <Botao variante="primario" iconeInicio={<Plus className="size-4" />} onClick={() => setCriando(true)}>
              Novo Serviço
            </Botao>
          )}
        </div>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard indice={0} valor={stats.data?.total.toLocaleString('pt-BR') ?? '—'} rotulo="Total" subrotulo="serviços" cor="var(--c-accent)" icone={<Wrench className="size-4" />} onClick={() => { setFSituacao('todas'); setFEspecialidade(null); ctrl.setBusca(''); ctrl.reiniciar() }} />
        <KpiCard indice={1} valor={stats.data?.ativos.toLocaleString('pt-BR') ?? '—'} rotulo="Ativos" subrotulo="no sistema" cor="var(--c-ok)" icone={<Shield className="size-4" />} onClick={() => { setFSituacao('ativo'); ctrl.setBusca(''); ctrl.reiniciar() }} />
        <KpiCard indice={2} valor={lista.total?.toLocaleString('pt-BR') ?? '—'} rotulo="Exibidos" subrotulo="nesta busca" cor="var(--c-warn)" icone={<TrendingUp className="size-4" />} />
        <KpiCard indice={3} valor={stats.data?.ativos.toLocaleString('pt-BR') ?? '—'} rotulo="Disponíveis" subrotulo="para OS" cor="var(--c-cyan)" icone={<DollarSign className="size-4" />} />
      </div>

      {/* Tabela */}
      <div className="flex flex-col">
        <BarraFiltros
          busca={ctrl.busca}
          aoBuscar={ctrl.setBusca}
          placeholder="Buscar por código ou descrição"
          chips={chips}
          aoLimpar={chips.length ? () => { setFSituacao('ativo'); setFEspecialidade(null); ctrl.reiniciar() } : undefined}
          aoAtualizar={lista.recarregar}
          atualizando={lista.buscando}
          filtros={
            <>
              <Campo rotulo="Situação">
                {(p) => (
                  <Selecao {...p} value={fSituacao} onChange={(e) => { setFSituacao(e.target.value as typeof fSituacao); ctrl.reiniciar() }}>
                    <option value="ativo">Ativos</option>
                    <option value="inativo">Inativos</option>
                    <option value="todas">Todos</option>
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Especialidade">
                {(p) => (
                  <SeletorRef {...p} config={REF_ESPECIALIDADE} valor={fEspecialidade} aoSelecionar={(o) => { setFEspecialidade(o?.id ?? null); ctrl.reiniciar() }} placeholder="Todas" />
                )}
              </Campo>
            </>
          }
        />

        <Tabela
          aoDuploClique={podeEditar ? (linha) => setEditando(linha) : undefined}
          densidade="compacta"
          className="rounded-none"
          colunas={colunas}
          linhas={lista.linhas}
          chaveDe={(s) => s.id}
          estado={lista.estado}
          mensagemVazio={{
            titulo: ctrl.busca || chips.length ? 'Nenhum resultado' : 'Nenhum serviço cadastrado',
            descricao: ctrl.busca || chips.length ? 'Ajuste a busca ou os filtros.' : 'O catálogo de serviços é usado na OS, nas garantias e no histórico do veículo.',
            acao: podeCriar && !ctrl.busca && !chips.length ? <Botao tamanho="sm" variante="neutro" iconeInicio={<Wrench />} onClick={() => setCriando(true)}>Cadastrar o primeiro</Botao> : undefined,
          }}
          mensagemErro={{ descricao: mensagemErro(lista.erro), aoTentarNovamente: lista.recarregar }}
        />

        {lista.estado === 'ok' && (
          <Paginacao className="rounded-t-none border-t-0 py-2" pagina={ctrl.pagina} porPagina={ctrl.porPagina} total={lista.total} aoMudarPagina={ctrl.setPagina} />
        )}
      </div>

      <PainelLateral
        aberto={criando || Boolean(editando)}
        aoFechar={() => { setCriando(false); setEditando(null) }}
        largura="lg"
        titulo={editando ? 'Editar serviço' : 'Novo serviço'}
        rodape={
          <>
            <Botao variante="neutro" onClick={() => { setCriando(false); setEditando(null) }}>Cancelar</Botao>
            <Botao variante="primario" carregando={salvar.isPending} onClick={form.handleSubmit((d) => salvar.mutate(d))}>Salvar</Botao>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((d) => salvar.mutate(d))}>
          {erro && <Aviso tom="critico">{erro}</Aviso>}

          <Secao numero="01" titulo="Serviço">
            <Grade>
              <Campo className="sm:col-span-4" rotulo="Código" obrigatorio>
                {(p) => <Entrada {...p} mono {...form.register('codigo', { required: true })} />}
              </Campo>
              <Campo className="sm:col-span-8" rotulo="Descrição" obrigatorio>
                {(p) => <Entrada {...p} {...form.register('descricao', { required: true })} />}
              </Campo>
              <Campo className="sm:col-span-4" rotulo="Valor padrão">
                {(p) => <Entrada {...p} mono {...form.register('valor_padrao')} placeholder="0,00" />}
              </Campo>
              <Campo className="sm:col-span-4" rotulo="Tempo estimado (min)">
                {(p) => <Entrada {...p} mono type="number" {...form.register('tempo_estimado_min')} placeholder="0" />}
              </Campo>
              <Campo className="sm:col-span-4" rotulo="Situação">
                {(p) => (
                  <Selecao {...p} {...form.register('situacao')}>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </Selecao>
                )}
              </Campo>
              <Campo className="sm:col-span-12" rotulo="Especialidade" dica="Direciona o serviço para mecânicos com essa competência.">
                {(p) => (
                  <SeletorRef
                    {...p}
                    config={REF_ESPECIALIDADE}
                    valor={form.watch('especialidade_id') || null}
                    aoSelecionar={(o) => form.setValue('especialidade_id', o?.id ?? '', { shouldDirty: true })}
                    placeholder="Sem especialidade definida"
                  />
                )}
              </Campo>
              <Campo className="sm:col-span-12" rotulo="Observações">
                {(p) => <AreaTexto {...p} {...form.register('observacoes')} rows={3} />}
              </Campo>
            </Grade>
          </Secao>
        </form>
      </PainelLateral>

      <Confirmacao
        aberto={Boolean(alvo)}
        aoFechar={() => setAlvo(null)}
        aoConfirmar={() => alvo && mudarSituacao.mutate(alvo)}
        carregando={mudarSituacao.isPending}
        destrutivo={alvo?.situacao === 'ativo'}
        titulo={alvo?.situacao === 'ativo' ? 'Inativar serviço?' : 'Reativar serviço?'}
        rotuloConfirmar={alvo?.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
        descricao={<><strong className="font-semibold text-ink">{alvo?.descricao}</strong> {alvo?.situacao === 'ativo' ? 'deixa de aparecer na OS. O histórico é preservado.' : 'volta a ficar disponível.'}</>}
      />

      <DialogoExclusao ctrl={exclusao} />
    </div>
  )
}
