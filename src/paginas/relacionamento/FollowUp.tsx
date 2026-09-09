import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro } from '@/lib/utils'
import { data as fmtData } from '@/lib/formatos'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { CabecalhoPagina } from '@/componentes/ui/Painel'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade } from '@/componentes/ui/Secao'
import { BarraFiltros } from '@/componentes/ui/BarraFiltros'
import { PainelLateral, Confirmacao } from '@/componentes/ui/Sobreposicoes'
import { REF_CLIENTE, SeletorRef } from '@/componentes/ui/SeletorRef'
import { Selo, type TomSelo } from '@/componentes/ui/Selo'
import { Metrica, GradeMetricas } from '@/componentes/ui/Metrica'
import { Tabela, Paginacao } from '@/componentes/ui/Tabela'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'
import { Aviso } from '@/componentes/ui/Aviso'
import type { FollowUpListado, PrioridadeAcao, SituacaoFollowUp, Usuario } from '@/tipos/db'

const SELECT_LISTA =
  '*, cliente:clientes ( id, nome_razao, celular, telefone ), ' +
  'responsavel:usuarios!follow_ups_responsavel_id_fkey ( id, nome_completo )'

const TOM_PRIORIDADE: Record<PrioridadeAcao, TomSelo> = {
  baixa: 'neutro',
  media: 'info',
  alta: 'atencao',
  critica: 'critico',
}

const ROTULO_PRIORIDADE: Record<PrioridadeAcao, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
}

const ROTULO_SITUACAO: Record<SituacaoFollowUp, string> = {
  aberto: 'Aberto',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

const TOM_SITUACAO: Record<SituacaoFollowUp, TomSelo> = {
  aberto: 'atencao',
  concluido: 'ok',
  cancelado: 'neutro',
}

const VAZIO = {
  cliente_id: null as string | null,
  proxima_acao: '',
  data: '',
  responsavel_id: '',
  prioridade: 'media' as PrioridadeAcao,
  observacao: '',
}

/**
 * Follow-up é agenda de contato com o cliente, não um funil de vendas — por
 * isso a lista é uma tabela por prazo (a peça central: quando é a próxima
 * ação, para quem, com que prioridade), não cartões de CRM genérico.
 */
export function FollowUp() {
  const { usuario } = useAuth()
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const ctrl = useControleListagem(25)
  const [fSituacao, setFSituacao] = useState<'' | SituacaoFollowUp>('aberto')
  const [fQuando, setFQuando] = useState<'' | 'atrasados' | 'hoje' | 'semana'>('')
  const [editando, setEditando] = useState<FollowUpListado | null>(null)
  const [criando, setCriando] = useState(false)
  const [concluindo, setConcluindo] = useState<FollowUpListado | null>(null)
  const [excluindo, setExcluindo] = useState<FollowUpListado | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const podeVer = pode('follow_up', 'visualizar')
  const podeCriar = pode('follow_up', 'criar')
  const podeEditar = pode('follow_up', 'editar')
  /* Não existe permissão distinta de "excluir" no sistema — quem edita, exclui;
     o registro é um lembrete de agenda, não um documento fiscal com histórico. */
  const podeExcluir = podeEditar

  const responsaveis = useQuery({
    queryKey: ['usuarios-ativos-followup'],
    enabled: podeVer,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Array<Pick<Usuario, 'id' | 'nome_completo'>>> => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nome_completo')
        .eq('situacao', 'ativo')
        .order('nome_completo')
      if (error) throw error
      return data ?? []
    },
  })

  const hoje = new Date().toISOString().slice(0, 10)

  const filtrar = useMemo(
    () => (q: Consulta) => {
      const t = termoBusca(ctrl.busca)
      let r = q
      if (t.length >= 2) r = r.or(`proxima_acao.ilike.%${t}%,observacao.ilike.%${t}%`)
      if (fSituacao) r = r.eq('situacao', fSituacao)
      if (fQuando === 'atrasados') r = r.eq('situacao', 'aberto').lt('data', hoje)
      if (fQuando === 'hoje') r = r.eq('data', hoje)
      if (fQuando === 'semana') {
        const fim = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)
        r = r.gte('data', hoje).lte('data', fim)
      }
      return r
    },
    [ctrl.busca, fSituacao, fQuando, hoje],
  )

  const lista = useListagem<FollowUpListado>({
    chave: ['follow-ups', 'lista', ctrl.busca, fSituacao, fQuando, ctrl.pagina, ctrl.porPagina],
    tabela: 'follow_ups',
    select: SELECT_LISTA,
    filtrar,
    ordenacao: { coluna: 'data', ascendente: true },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
    habilitado: podeVer,
  })

  const resumo = useQuery({
    queryKey: ['follow-ups', 'resumo'],
    enabled: podeVer,
    queryFn: async () => {
      const semana = new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10)
      const [abertos, atrasados, deHoje, proximos] = await Promise.all([
        supabase.from('follow_ups').select('id', { count: 'exact', head: true }).eq('situacao', 'aberto'),
        supabase.from('follow_ups').select('id', { count: 'exact', head: true }).eq('situacao', 'aberto').lt('data', hoje),
        supabase.from('follow_ups').select('id', { count: 'exact', head: true }).eq('situacao', 'aberto').eq('data', hoje),
        supabase.from('follow_ups').select('id', { count: 'exact', head: true }).eq('situacao', 'aberto').gt('data', hoje).lte('data', semana),
      ])
      for (const r of [abertos, atrasados, deHoje, proximos]) if (r.error) throw r.error
      return {
        abertos: abertos.count ?? 0,
        atrasados: atrasados.count ?? 0,
        hoje: deHoje.count ?? 0,
        semana: proximos.count ?? 0,
      }
    },
  })

  const [form, setForm] = useState(VAZIO)

  function abrirNovo() {
    setForm({ ...VAZIO, data: hoje })
    setErro(null)
    setCriando(true)
  }

  function abrirEdicao(f: FollowUpListado) {
    setForm({
      cliente_id: f.cliente?.id ?? null,
      proxima_acao: f.proxima_acao,
      data: f.data,
      responsavel_id: f.responsavel?.id ?? '',
      prioridade: f.prioridade,
      observacao: f.observacao ?? '',
    })
    setErro(null)
    setEditando(f)
  }

  function invalidar() {
    void qc.invalidateQueries({ queryKey: ['follow-ups'] })
    void qc.invalidateQueries({ queryKey: ['crm-indicadores'] })
  }

  const salvar = useMutation({
    mutationFn: async () => {
      setErro(null)
      if (!form.cliente_id) throw new Error('Selecione o cliente.')
      if (form.proxima_acao.trim().length < 3) throw new Error('Descreva a próxima ação.')
      const registro = {
        cliente_id: form.cliente_id,
        proxima_acao: form.proxima_acao.trim(),
        data: form.data,
        responsavel_id: form.responsavel_id || usuario?.id || null,
        prioridade: form.prioridade,
        observacao: form.observacao.trim() || null,
      }
      if (editando) {
        const { error } = await supabase.from('follow_ups').update(registro).eq('id', editando.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('follow_ups').insert({ ...registro, criado_por: usuario?.id ?? null })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.ok(editando ? 'Follow-up atualizado' : 'Follow-up agendado')
      setCriando(false)
      setEditando(null)
      setForm(VAZIO)
      invalidar()
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const [resultado, setResultado] = useState('')

  const encerrar = useMutation({
    mutationFn: async ({ id, situacao }: { id: string; situacao: SituacaoFollowUp }) => {
      const { error } = await supabase
        .from('follow_ups')
        .update({ situacao, resultado: resultado.trim() || null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Follow-up atualizado')
      setConcluindo(null)
      setResultado('')
      invalidar()
    },
    onError: (e) => toast.erro('Não foi possível atualizar', mensagemErro(e)),
  })

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('follow_ups').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Follow-up excluído')
      setExcluindo(null)
      invalidar()
    },
    onError: (e) => toast.erro('Não foi possível excluir', mensagemErro(e)),
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Relacionamento" titulo="Follow-up" />
        <EstadoSemPermissao />
      </div>
    )
  }

  const chips = [
    fSituacao !== 'aberto' && {
      id: 's',
      rotulo: `Situação: ${fSituacao ? ROTULO_SITUACAO[fSituacao] : 'Todas'}`,
      aoRemover: () => setFSituacao('aberto'),
    },
    fQuando && {
      id: 'q',
      rotulo: `Prazo: ${fQuando === 'atrasados' ? 'Atrasados' : fQuando === 'hoje' ? 'Hoje' : 'Próximos 7 dias'}`,
      aoRemover: () => setFQuando(''),
    },
  ].filter(Boolean) as Array<{ id: string; rotulo: string; aoRemover: () => void }>

  const formAberto = criando || editando !== null
  const hojeStr = hoje

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Relacionamento"
        titulo="Follow-up"
        acoes={
          podeCriar && (
            <Botao variante="primario" iconeInicio={<Plus />} onClick={abrirNovo}>
              Novo follow-up
            </Botao>
          )
        }
      />

      <GradeMetricas colunas={4}>
        <Metrica
          rotulo="Em aberto"
          valor={resumo.data?.abertos ?? 0}
          glosa="aguardando ação"
          tom="cyan"
          carregando={resumo.isLoading}
          onClick={() => { setFSituacao('aberto'); setFQuando(''); ctrl.reiniciar() }}
          ativo={fSituacao === 'aberto' && !fQuando}
        />
        <Metrica
          rotulo="Atrasados"
          valor={resumo.data?.atrasados ?? 0}
          glosa="passaram do prazo"
          tom="critico"
          alerta={(resumo.data?.atrasados ?? 0) > 0}
          carregando={resumo.isLoading}
          onClick={() => { setFSituacao('aberto'); setFQuando('atrasados'); ctrl.reiniciar() }}
          ativo={fQuando === 'atrasados'}
        />
        <Metrica
          rotulo="Para hoje"
          valor={resumo.data?.hoje ?? 0}
          glosa="vencem hoje"
          tom="accent"
          carregando={resumo.isLoading}
          onClick={() => { setFSituacao('aberto'); setFQuando('hoje'); ctrl.reiniciar() }}
          ativo={fQuando === 'hoje'}
        />
        <Metrica
          rotulo="Próximos 7 dias"
          valor={resumo.data?.semana ?? 0}
          glosa="a caminho do prazo"
          tom="ok"
          carregando={resumo.isLoading}
          onClick={() => { setFSituacao('aberto'); setFQuando('semana'); ctrl.reiniciar() }}
          ativo={fQuando === 'semana'}
        />
      </GradeMetricas>

      <div className="flex flex-col">
        <BarraFiltros
          busca={ctrl.busca}
          aoBuscar={ctrl.setBusca}
          placeholder="Buscar pela ação ou observação"
          chips={chips}
          aoLimpar={chips.length ? () => { setFSituacao('aberto'); setFQuando(''); ctrl.reiniciar() } : undefined}
          aoAtualizar={lista.recarregar}
          atualizando={lista.buscando}
          filtros={
            <>
              <Selecao
                aria-label="Situação"
                value={fSituacao}
                onChange={(e) => { setFSituacao(e.target.value as typeof fSituacao); ctrl.reiniciar() }}
                className="h-[34px] min-w-[130px] text-[12px]"
              >
                <option value="">Todas as situações</option>
                <option value="aberto">Aberto</option>
                <option value="concluido">Concluído</option>
                <option value="cancelado">Cancelado</option>
              </Selecao>
              <Selecao
                aria-label="Prazo"
                value={fQuando}
                onChange={(e) => { setFQuando(e.target.value as typeof fQuando); ctrl.reiniciar() }}
                className="h-[34px] min-w-[140px] text-[12px]"
              >
                <option value="">Qualquer prazo</option>
                <option value="atrasados">Atrasados</option>
                <option value="hoje">Hoje</option>
                <option value="semana">Próximos 7 dias</option>
              </Selecao>
            </>
          }
        />

        <Tabela<FollowUpListado>
          className="rounded-t-none"
          colunas={[
            {
              chave: 'data',
              cabecalho: 'Data',
              largura: '104px',
              celula: (f) => {
                const atrasado = f.situacao === 'aberto' && f.data < hojeStr
                return (
                  <span className={cn('num text-[13px]', atrasado ? 'font-semibold text-crit' : 'text-ink')}>
                    {fmtData(f.data)}
                  </span>
                )
              },
            },
            {
              chave: 'acao',
              cabecalho: 'Cliente / próxima ação',
              celula: (f) => (
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-ink">{f.cliente?.nome_razao ?? '—'}</span>
                  <span className="truncate text-[12px] text-ink-3">{f.proxima_acao}</span>
                </div>
              ),
            },
            {
              chave: 'prioridade',
              cabecalho: 'Prioridade',
              largura: '110px',
              classeResponsiva: 'hidden md:table-cell',
              celula: (f) => <Selo tom={TOM_PRIORIDADE[f.prioridade]}>{ROTULO_PRIORIDADE[f.prioridade]}</Selo>,
            },
            {
              chave: 'responsavel',
              cabecalho: 'Responsável',
              largura: '150px',
              classeResponsiva: 'hidden lg:table-cell',
              celula: (f) => <span className="truncate text-ink-2">{f.responsavel?.nome_completo ?? '—'}</span>,
            },
            {
              chave: 'situacao',
              cabecalho: 'Status',
              largura: '120px',
              celula: (f) => (
                <Selo tom={TOM_SITUACAO[f.situacao]} ponto>
                  {ROTULO_SITUACAO[f.situacao]}
                </Selo>
              ),
            },
            {
              chave: 'acoes',
              cabecalho: '',
              largura: '190px',
              alinhamento: 'direita',
              celula: (f) => (
                <div className="flex justify-end gap-1">
                  {podeEditar && f.situacao === 'aberto' && (
                    <Botao
                      tamanho="sm"
                      variante="fantasma"
                      onClick={(e) => { e.stopPropagation(); setResultado(''); setConcluindo(f) }}
                      iconeInicio={<Check />}
                    >
                      Concluir
                    </Botao>
                  )}
                  {podeEditar && (
                    <Botao
                      tamanho="sm"
                      variante="fantasma"
                      onClick={(e) => { e.stopPropagation(); abrirEdicao(f) }}
                    >
                      <Pencil className="size-3.5" />
                    </Botao>
                  )}
                  {podeExcluir && (
                    <Botao
                      tamanho="sm"
                      variante="fantasma"
                      onClick={(e) => { e.stopPropagation(); setExcluindo(f) }}
                    >
                      <Trash2 className="size-3.5" />
                    </Botao>
                  )}
                </div>
              ),
            },
          ]}
          linhas={lista.linhas}
          chaveDe={(f) => f.id}
          estado={lista.estado}
          aoDuploClique={podeEditar ? abrirEdicao : undefined}
          mensagemVazio={{
            titulo: ctrl.busca || chips.length ? 'Nenhum resultado' : 'Nenhum follow-up em aberto',
            descricao: ctrl.busca || chips.length
              ? 'Ajuste a busca ou os filtros.'
              : 'Quando agendar uma próxima ação com um cliente, ela aparece aqui.',
            acao: podeCriar && !ctrl.busca && !chips.length ? (
              <Botao tamanho="sm" variante="neutro" iconeInicio={<Plus />} onClick={abrirNovo}>
                Agendar follow-up
              </Botao>
            ) : undefined,
          }}
        />
      </div>

      {lista.total !== null && lista.total > ctrl.porPagina && (
        <Paginacao pagina={ctrl.pagina} porPagina={ctrl.porPagina} total={lista.total} aoMudarPagina={ctrl.setPagina} />
      )}

      {/* Criar / editar */}
      <PainelLateral
        aberto={formAberto}
        aoFechar={() => { setCriando(false); setEditando(null) }}
        largura="md"
        titulo={editando ? 'Editar follow-up' : 'Novo follow-up'}
        descricao={editando ? undefined : 'Agende uma próxima ação com o cliente.'}
        rodape={
          <>
            <Botao variante="neutro" onClick={() => { setCriando(false); setEditando(null) }}>Cancelar</Botao>
            <Botao variante="primario" carregando={salvar.isPending} onClick={() => salvar.mutate()}>
              {editando ? 'Salvar' : 'Agendar'}
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <Aviso tom="critico">{erro}</Aviso>}
          <Grade>
            <Campo className="sm:col-span-12" rotulo="Cliente" obrigatorio>
              {(p) => (
                <SeletorRef {...p} config={REF_CLIENTE} valor={form.cliente_id} aoSelecionar={(o) => setForm({ ...form, cliente_id: o?.id ?? null })} placeholder="Buscar cliente" />
              )}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Próxima ação" obrigatorio>
              {(p) => <Entrada {...p} value={form.proxima_acao} onChange={(e) => setForm({ ...form, proxima_acao: e.target.value })} placeholder="Ex.: Ligar para confirmar a revisão" />}
            </Campo>
            <Campo className="sm:col-span-6" rotulo="Data" obrigatorio>
              {(p) => <Entrada {...p} type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-6" rotulo="Prioridade">
              {(p) => (
                <Selecao {...p} value={form.prioridade} onChange={(e) => setForm({ ...form, prioridade: e.target.value as PrioridadeAcao })}>
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </Selecao>
              )}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Responsável">
              {(p) => (
                <Selecao {...p} value={form.responsavel_id} onChange={(e) => setForm({ ...form, responsavel_id: e.target.value })}>
                  <option value="">Eu mesmo</option>
                  {responsaveis.data?.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome_completo}</option>
                  ))}
                </Selecao>
              )}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Observação">
              {(p) => <AreaTexto {...p} rows={2} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />}
            </Campo>
          </Grade>
        </div>
      </PainelLateral>

      {/* Concluir */}
      <PainelLateral
        aberto={concluindo !== null}
        aoFechar={() => setConcluindo(null)}
        largura="sm"
        titulo="Concluir follow-up"
        descricao={concluindo?.proxima_acao}
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setConcluindo(null)}>Cancelar</Botao>
            <Botao variante="primario" carregando={encerrar.isPending} onClick={() => concluindo && encerrar.mutate({ id: concluindo.id, situacao: 'concluido' })}>
              Concluir
            </Botao>
          </>
        }
      >
        <Campo rotulo="O que aconteceu">
          {(p) => <AreaTexto {...p} rows={3} value={resultado} onChange={(e) => setResultado(e.target.value)} placeholder="Registro do contato (opcional)" />}
        </Campo>
      </PainelLateral>

      <Confirmacao
        aberto={excluindo !== null}
        aoFechar={() => setExcluindo(null)}
        titulo="Excluir follow-up?"
        descricao={<>A ação <strong className="font-semibold text-ink">{excluindo?.proxima_acao}</strong> some do histórico do cliente. Se só terminou, use "Concluir" em vez de excluir.</>}
        rotuloConfirmar="Excluir"
        destrutivo
        carregando={excluir.isPending}
        aoConfirmar={() => excluindo && excluir.mutate(excluindo.id)}
      />
    </div>
  )
}
