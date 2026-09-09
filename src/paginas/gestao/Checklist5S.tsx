import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CalendarCheck, CheckCircle2, ClipboardList, Play, Plus, Sunrise, Sunset } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { dataHora, mensagemErro } from '@/lib/utils'
import { data as fmtData } from '@/lib/formatos'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { CabecalhoPagina, Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Abas } from '@/componentes/ui/Abas'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade } from '@/componentes/ui/Secao'
import { Modal, PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { Selo } from '@/componentes/ui/Selo'
import { Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { ExecutarChecklist } from '@/paginas/operacao/checklists/ExecutarChecklist'
import type { Checklist, ChecklistModelo, PrioridadeAcao, StatusAcao, Usuario } from '@/tipos/db'

interface AcaoCorretiva {
  id: string
  numero: number
  setor: string | null
  problema: string
  acao: string | null
  prioridade: PrioridadeAcao
  prazo: string | null
  status: StatusAcao
  conclusao: string | null
  concluida_em: string | null
  responsavel_id: string | null
  responsavel: { nome_completo: string } | null
  created_at: string
}

const TOM_PRIORIDADE: Record<PrioridadeAcao, 'neutro' | 'atencao' | 'destaque' | 'critico'> = {
  baixa: 'neutro',
  media: 'atencao',
  alta: 'destaque',
  critica: 'critico',
}

const ROTULO_STATUS: Record<StatusAcao, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

export function Checklist5S() {
  const { usuario } = useAuth()
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const execucao = params.get('exec')

  /* `/gestao/checklist-5s/abertura` e `/.../fechamento` são a mesma tela,
     focada em só um dos dois — mesmo padrão de Operação › Checklists. */
  const local = useLocation()
  const tipoFoco = local.pathname.endsWith('/abertura')
    ? 'diario_abertura'
    : local.pathname.endsWith('/fechamento')
      ? 'diario_fechamento'
      : null

  const [aba, setAba] = useState<'hoje' | 'acoes' | 'historico'>('hoje')
  const [criandoAcao, setCriandoAcao] = useState(false)
  const [concluindo, setConcluindo] = useState<AcaoCorretiva | null>(null)
  const [setor, setSetor] = useState('')

  const podeVer = pode('checklist_5s', 'visualizar')
  const podeCriar = pode('checklist_5s', 'criar')
  const podeEditar = pode('checklist_5s', 'editar')

  const hoje = new Date().toISOString().slice(0, 10)

  const modelos = useQuery({
    queryKey: ['checklist-modelos', '5s'],
    enabled: podeVer,
    queryFn: async (): Promise<ChecklistModelo[]> => {
      const { data, error } = await supabase
        .from('checklist_modelos')
        .select('*')
        .in('tipo', ['diario_abertura', 'diario_fechamento'])
        .eq('situacao', 'ativo')
        .order('tipo')
      if (error) throw error
      return data ?? []
    },
  })

  const doDia = useQuery({
    queryKey: ['checklists', '5s', hoje],
    enabled: podeVer,
    queryFn: async (): Promise<Checklist[]> => {
      const { data, error } = await supabase
        .from('checklists')
        .select('*')
        .in('tipo', ['diario_abertura', 'diario_fechamento'])
        .eq('data_referencia', hoje)
        .order('iniciado_em', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const historico = useQuery({
    queryKey: ['checklists', '5s', 'historico'],
    enabled: podeVer && aba === 'historico',
    queryFn: async (): Promise<Checklist[]> => {
      const { data, error } = await supabase
        .from('checklists')
        .select('*')
        .in('tipo', ['diario_abertura', 'diario_fechamento'])
        .order('data_referencia', { ascending: false })
        .limit(120)
      if (error) throw error
      return data ?? []
    },
  })

  /** Ações abertas continuam visíveis todos os dias até serem concluídas. */
  const acoes = useQuery({
    queryKey: ['acoes-corretivas'],
    enabled: podeVer,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<AcaoCorretiva[]> => {
      const { data, error } = await supabase
        .from('acoes_corretivas')
        .select('*, responsavel:usuarios!acoes_corretivas_responsavel_id_fkey ( nome_completo )')
        .order('status')
        .order('prazo', { nullsFirst: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as unknown as AcaoCorretiva[]
    },
  })

  const usuarios = useQuery({
    queryKey: ['usuarios', 'ativos-simples'],
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

  const iniciar = useMutation({
    mutationFn: async (modelo: ChecklistModelo) => {
      const { data, error } = await supabase.rpc('iniciar_checklist', {
        p_modelo: modelo.id,
        p_setor: setor.trim() || null,
        p_data: hoje,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (id) => {
      void qc.invalidateQueries({ queryKey: ['checklists', '5s'] })
      setParams({ exec: id })
    },
    onError: (e) => toast.erro('Não foi possível iniciar', mensagemErro(e)),
  })

  /* ------------------------------------------------------ ações corretivas */
  const [novaAcao, setNovaAcao] = useState({
    problema: '',
    acao: '',
    responsavel_id: '',
    prioridade: 'media' as PrioridadeAcao,
    prazo: '',
    setor: '',
  })

  const salvarAcao = useMutation({
    mutationFn: async () => {
      if (novaAcao.problema.trim().length < 3) throw new Error('Descreva o problema.')
      const { error } = await supabase.from('acoes_corretivas').insert({
        problema: novaAcao.problema.trim(),
        acao: novaAcao.acao.trim() || null,
        responsavel_id: novaAcao.responsavel_id || null,
        prioridade: novaAcao.prioridade,
        prazo: novaAcao.prazo || null,
        setor: novaAcao.setor.trim() || null,
        origem: '5s',
        criada_por: usuario?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Não conformidade registrada')
      setCriandoAcao(false)
      setNovaAcao({ problema: '', acao: '', responsavel_id: '', prioridade: 'media', prazo: '', setor: '' })
      void qc.invalidateQueries({ queryKey: ['acoes-corretivas'] })
    },
    onError: (e) => toast.erro('Não foi possível registrar', mensagemErro(e)),
  })

  const mudarStatusAcao = useMutation({
    mutationFn: async ({ id, status, conclusao }: { id: string; status: StatusAcao; conclusao?: string }) => {
      const { error } = await supabase
        .from('acoes_corretivas')
        .update({
          status,
          conclusao: conclusao?.trim() || null,
          concluida_em: status === 'concluida' ? new Date().toISOString() : null,
          concluida_por: status === 'concluida' ? (usuario?.id ?? null) : null,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Ação atualizada')
      setConcluindo(null)
      void qc.invalidateQueries({ queryKey: ['acoes-corretivas'] })
    },
    onError: (e) => toast.erro('Não foi possível atualizar', mensagemErro(e)),
  })

  const pendentes = useMemo(
    () => (acoes.data ?? []).filter((a) => a.status === 'aberta' || a.status === 'em_andamento'),
    [acoes.data],
  )
  const vencidas = useMemo(
    () => pendentes.filter((a) => a.prazo && a.prazo < hoje),
    [pendentes, hoje],
  )

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Gestão" titulo="Checklist Diário / 5S" />
        <EstadoSemPermissao />
      </div>
    )
  }

  if (execucao) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <BotaoIcone rotulo="Voltar" onClick={() => setParams({})}>
            <ArrowLeft />
          </BotaoIcone>
          <CabecalhoPagina sobretitulo="Gestão" titulo="Checklist diário 5S" />
        </div>
        <ExecutarChecklist checklistId={execucao} aoConcluir={() => setParams({})} />
      </div>
    )
  }

  const abertura = doDia.data?.find((c) => c.tipo === 'diario_abertura')
  const fechamento = doDia.data?.find((c) => c.tipo === 'diario_fechamento')

  const colunasAcoes: Array<Coluna<AcaoCorretiva>> = [
    { chave: 'numero', cabecalho: 'Nº', largura: '70px', celula: (a) => <span className="num text-ink-3">{String(a.numero).padStart(4, '0')}</span> },
    {
      chave: 'problema',
      cabecalho: 'Problema',
      celula: (a) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-ink">{a.problema}</span>
          {a.acao && <span className="truncate text-[12px] text-ink-3">Ação: {a.acao}</span>}
        </div>
      ),
    },
    { chave: 'setor', cabecalho: 'Setor', largura: '140px', classeResponsiva: 'hidden lg:table-cell', celula: (a) => a.setor ?? <span className="text-ink-3">—</span> },
    { chave: 'responsavel', cabecalho: 'Responsável', largura: '170px', classeResponsiva: 'hidden xl:table-cell', celula: (a) => a.responsavel?.nome_completo ?? <span className="text-ink-3">—</span> },
    { chave: 'prioridade', cabecalho: 'Prioridade', largura: '110px', celula: (a) => <Selo tom={TOM_PRIORIDADE[a.prioridade]}>{a.prioridade}</Selo> },
    {
      chave: 'prazo',
      cabecalho: 'Prazo',
      largura: '120px',
      celula: (a) => {
        if (!a.prazo) return <span className="text-ink-3">—</span>
        const vencido = a.prazo < hoje && a.status !== 'concluida'
        return <span className={`num text-[12.5px] ${vencido ? 'font-semibold text-crit-ink' : 'text-ink-2'}`}>{fmtData(a.prazo)}</span>
      },
    },
    {
      chave: 'status',
      cabecalho: 'Status',
      largura: '140px',
      celula: (a) => (
        <Selo tom={a.status === 'concluida' ? 'ok' : a.status === 'cancelada' ? 'neutro' : a.status === 'em_andamento' ? 'info' : 'atencao'} ponto>
          {ROTULO_STATUS[a.status]}
        </Selo>
      ),
    },
    {
      chave: 'acoes',
      cabecalho: '',
      largura: '180px',
      alinhamento: 'direita',
      celula: (a) =>
        podeEditar && a.status !== 'concluida' && a.status !== 'cancelada' ? (
          <div className="flex justify-end gap-1">
            {a.status === 'aberta' && (
              <Botao tamanho="sm" variante="fantasma" onClick={() => mudarStatusAcao.mutate({ id: a.id, status: 'em_andamento' })}>
                Iniciar
              </Botao>
            )}
            <Botao tamanho="sm" variante="fantasma" iconeInicio={<CheckCircle2 />} onClick={() => setConcluindo(a)}>
              Concluir
            </Botao>
          </div>
        ) : null,
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Gestão"
        titulo="Checklist Diário / 5S"
        meta={<span className="num text-[13px] text-ink-3">{fmtData(hoje)}</span>}
        acoes={
          podeCriar ? (
            <Botao variante="primario" iconeInicio={<Plus />} onClick={() => setCriandoAcao(true)}>
              Registrar não conformidade
            </Botao>
          ) : undefined
        }
      />

      {vencidas.length > 0 && (
        <Aviso tom="critico" titulo={`${vencidas.length} ação(ões) com prazo vencido`}>
          Ações não concluídas permanecem visíveis todos os dias até serem tratadas.
        </Aviso>
      )}

      <Abas
        ativa={aba}
        aoMudar={setAba}
        abas={[
          { valor: 'hoje', rotulo: 'Hoje' },
          { valor: 'acoes', rotulo: 'Ações', contador: pendentes.length },
          { valor: 'historico', rotulo: 'Histórico' },
        ]}
      />

      {aba === 'hoje' && (
        <div className="flex flex-col gap-4">
          {modelos.isLoading && <EstadoCarregando rotulo="Carregando…" />}
          {modelos.isSuccess && modelos.data.length === 0 && (
            <EstadoVazio
              titulo="Nenhum modelo diário configurado"
              descricao="Cadastre modelos do tipo diário em Operação › Checklists."
            />
          )}

          <div className={tipoFoco ? 'grid gap-4' : 'grid gap-4 lg:grid-cols-2'}>
            {[
              { tipo: 'diario_abertura' as const, rotulo: 'Abertura', icone: Sunrise, exec: abertura },
              { tipo: 'diario_fechamento' as const, rotulo: 'Fechamento', icone: Sunset, exec: fechamento },
            ]
              .filter((c) => !tipoFoco || c.tipo === tipoFoco)
              .map(({ tipo, rotulo, icone: Icone, exec }) => {
              const modelo = modelos.data?.find((m) => m.tipo === tipo)
              return (
                <Painel key={tipo} semPadding>
                  <CabecalhoPainel
                    titulo={rotulo}
                    descricao={modelo?.descricao ?? 'Modelo não configurado'}
                    acao={
                      exec ? (
                        <Selo tom={exec.situacao === 'concluido' ? 'ok' : 'info'} ponto>
                          {exec.situacao === 'concluido' ? 'Concluído' : 'Em andamento'}
                        </Selo>
                      ) : (
                        <Selo tom="atencao" ponto>Pendente</Selo>
                      )
                    }
                  />
                  <div className="flex flex-col gap-3 p-5">
                    <div className="flex items-center gap-3 text-ink-3">
                      <Icone aria-hidden className="size-5" />
                      <span className="text-[13px]">
                        {exec
                          ? exec.situacao === 'concluido'
                            ? `Concluído em ${dataHora(exec.concluido_em)}`
                            : `Iniciado em ${dataHora(exec.iniciado_em)}`
                          : 'Ainda não iniciado hoje.'}
                      </span>
                    </div>

                    {!exec && podeCriar && modelo && (
                      <Campo rotulo="Setor">
                        {(p) => <Entrada {...p} value={setor} onChange={(e) => setSetor(e.target.value)} placeholder="Ex.: Oficina — box 1" />}
                      </Campo>
                    )}

                    {exec ? (
                      <Botao variante="secundario" iconeInicio={<ClipboardList />} onClick={() => setParams({ exec: exec.id })}>
                        {exec.situacao === 'concluido' ? 'Ver checklist' : 'Continuar'}
                      </Botao>
                    ) : modelo && podeCriar ? (
                      <Botao variante="primario" iconeInicio={<Play />} carregando={iniciar.isPending} onClick={() => iniciar.mutate(modelo)}>
                        Iniciar {rotulo.toLowerCase()}
                      </Botao>
                    ) : (
                      <p className="text-[12.5px] text-ink-3">
                        {modelo ? 'Sem permissão para iniciar.' : 'Modelo não configurado.'}
                      </p>
                    )}
                  </div>
                </Painel>
              )
            })}
          </div>
        </div>
      )}

      {aba === 'acoes' && (
        <div className="flex flex-col gap-4">
          {acoes.isLoading && <EstadoCarregando rotulo="Carregando ações…" />}
          {acoes.isError && <EstadoErro descricao={mensagemErro(acoes.error)} aoTentarNovamente={() => void acoes.refetch()} />}
          {acoes.isSuccess && acoes.data.length === 0 && (
            <EstadoVazio
              icone={<CalendarCheck />}
              titulo="Nenhuma não conformidade registrada"
              descricao="As pendências abertas aparecem aqui até serem concluídas."
            />
          )}
          {acoes.isSuccess && acoes.data.length > 0 && (
            <Tabela colunas={colunasAcoes} linhas={acoes.data} chaveDe={(a) => a.id} estado="ok" />
          )}
        </div>
      )}

      {aba === 'historico' && (
        <Painel semPadding>
          <CabecalhoPainel titulo="Histórico diário" descricao="Cada dia guarda a versão do modelo utilizada." />
          <div className="p-5">
            {historico.isLoading && <EstadoCarregando rotulo="Carregando histórico…" />}
            {historico.isSuccess && historico.data.length === 0 && (
              <EstadoVazio titulo="Nenhum checklist diário registrado" compacto />
            )}
            {historico.isSuccess && historico.data.length > 0 && (
              <ul className="flex flex-col divide-y divide-[var(--c-line)]">
                {historico.data.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                    <span className="num w-24 text-[12.5px] text-ink-2">{fmtData(c.data_referencia)}</span>
                    <span className="flex-1 truncate text-[13px] text-ink">{c.modelo_descricao}</span>
                    {c.setor && <span className="text-[12px] text-ink-3">{c.setor}</span>}
                    <Selo tom={c.situacao === 'concluido' ? 'ok' : 'info'} ponto>
                      {c.situacao === 'concluido' ? 'Concluído' : 'Em andamento'}
                    </Selo>
                    <Botao tamanho="sm" variante="fantasma" onClick={() => setParams({ exec: c.id })}>Abrir</Botao>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Painel>
      )}

      <PainelLateral
        aberto={criandoAcao}
        aoFechar={() => setCriandoAcao(false)}
        titulo="Registrar não conformidade"
        descricao="A ação fica aberta até ser concluída."
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setCriandoAcao(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={salvarAcao.isPending} onClick={() => salvarAcao.mutate()}>Registrar</Botao>
          </>
        }
      >
        <Grade>
          <Campo className="sm:col-span-12" rotulo="Problema" obrigatorio>
            {(p) => <AreaTexto {...p} rows={2} value={novaAcao.problema} onChange={(e) => setNovaAcao({ ...novaAcao, problema: e.target.value })} autoFocus />}
          </Campo>
          <Campo className="sm:col-span-12" rotulo="Ação corretiva">
            {(p) => <AreaTexto {...p} rows={2} value={novaAcao.acao} onChange={(e) => setNovaAcao({ ...novaAcao, acao: e.target.value })} />}
          </Campo>
          <Campo className="sm:col-span-6" rotulo="Responsável">
            {(p) => (
              <Selecao {...p} value={novaAcao.responsavel_id} onChange={(e) => setNovaAcao({ ...novaAcao, responsavel_id: e.target.value })}>
                <option value="">Não definido</option>
                {usuarios.data?.map((u) => <option key={u.id} value={u.id}>{u.nome_completo}</option>)}
              </Selecao>
            )}
          </Campo>
          <Campo className="sm:col-span-6" rotulo="Setor">
            {(p) => <Entrada {...p} value={novaAcao.setor} onChange={(e) => setNovaAcao({ ...novaAcao, setor: e.target.value })} />}
          </Campo>
          <Campo className="sm:col-span-6" rotulo="Prioridade">
            {(p) => (
              <Selecao {...p} value={novaAcao.prioridade} onChange={(e) => setNovaAcao({ ...novaAcao, prioridade: e.target.value as PrioridadeAcao })}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica</option>
              </Selecao>
            )}
          </Campo>
          <Campo className="sm:col-span-6" rotulo="Prazo">
            {(p) => <Entrada {...p} type="date" value={novaAcao.prazo} onChange={(e) => setNovaAcao({ ...novaAcao, prazo: e.target.value })} />}
          </Campo>
        </Grade>
      </PainelLateral>

      <ModalConclusao
        acao={concluindo}
        aoFechar={() => setConcluindo(null)}
        aoConcluir={(conclusao) => concluindo && mudarStatusAcao.mutate({ id: concluindo.id, status: 'concluida', conclusao })}
        carregando={mudarStatusAcao.isPending}
      />
    </div>
  )
}

function ModalConclusao({
  acao,
  aoFechar,
  aoConcluir,
  carregando,
}: {
  acao: AcaoCorretiva | null
  aoFechar: () => void
  aoConcluir: (conclusao: string) => void
  carregando: boolean
}) {
  const [conclusao, setConclusao] = useState('')
  return (
    <Modal
      aberto={Boolean(acao)}
      aoFechar={aoFechar}
      titulo="Concluir ação"
      descricao={acao?.problema}
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar}>Cancelar</Botao>
          <Botao variante="primario" carregando={carregando} onClick={() => aoConcluir(conclusao)}>Concluir</Botao>
        </>
      }
    >
      <Campo rotulo="O que foi feito" dica="Fica registrado no histórico da ação.">
        {(p) => <AreaTexto {...p} rows={3} value={conclusao} onChange={(e) => setConclusao(e.target.value)} autoFocus />}
      </Campo>
    </Modal>
  )
}
