import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Award, BarChart3, Gauge, Medal, Settings2, Trophy } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, iniciais, mensagemErro } from '@/lib/utils'
import { data as fmtData, numeroBR, paraNumero } from '@/lib/formatos'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { CabecalhoPagina, Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Alternador, Campo, Entrada, Segmentado, Selecao } from '@/componentes/ui/Campo'
import { Grade } from '@/componentes/ui/Secao'
import { Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { Selo } from '@/componentes/ui/Selo'
import { CartaoDestaque } from './componentes/Indicador'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import type {
  CriterioPerformance,
  Especialidade,
  EventoPerformanceListado,
  Funcao,
  LinhaPerformance,
} from '@/tipos/db'

type Preset = 'mes' | '30d' | 'trimestre' | 'ano' | 'livre'

function intervalo(p: Preset): { de: string; ate: string } {
  const hoje = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const ate = iso(hoje)
  switch (p) {
    case '30d':
      return { de: iso(new Date(Date.now() - 29 * 86400_000)), ate }
    case 'trimestre': {
      const t = Math.floor(hoje.getMonth() / 3) * 3
      return { de: iso(new Date(hoje.getFullYear(), t, 1)), ate }
    }
    case 'ano':
      return { de: `${hoje.getFullYear()}-01-01`, ate }
    default:
      return { de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate }
  }
}

type Indicador = 'pontos' | 'os_concluidas' | 'checklists_concluidos' | 'horas_apontadas' | 'conformidade_5s'

const INDICADORES: Array<{ valor: Indicador; rotulo: string }> = [
  { valor: 'pontos', rotulo: 'Pontuação' },
  { valor: 'os_concluidas', rotulo: 'OS concluídas' },
  { valor: 'checklists_concluidos', rotulo: 'Checklists' },
  { valor: 'horas_apontadas', rotulo: 'Horas apontadas' },
  { valor: 'conformidade_5s', rotulo: 'Conformidade 5S' },
]

export function Performance() {
  const { usuario } = useAuth()
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const [preset, setPreset] = useState<Preset>('mes')
  const [periodo, setPeriodo] = useState(() => intervalo('mes'))
  const [funcao, setFuncao] = useState('')
  const [especialidade, setEspecialidade] = useState('')
  const [indicador, setIndicador] = useState<Indicador>('pontos')
  const [configurando, setConfigurando] = useState(false)
  const [lancando, setLancando] = useState<LinhaPerformance | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const podeVer = pode('performance', 'visualizar')
  const podeEditar = pode('performance', 'editar')
  const podeConfigurar = pode('performance', 'configurar')

  const criterios = useQuery({
    queryKey: ['criterios-performance'],
    enabled: podeVer,
    queryFn: async (): Promise<CriterioPerformance[]> => {
      const { data, error } = await supabase.from('criterios_performance').select('*').order('ordem')
      if (error) throw error
      return data ?? []
    },
  })

  const funcoes = useQuery({
    queryKey: ['funcoes-ativas'],
    enabled: podeVer,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Array<Pick<Funcao, 'id' | 'nome'>>> => {
      const { data, error } = await supabase.from('funcoes').select('id, nome').eq('situacao', 'ativo').order('nome')
      if (error) throw error
      return data ?? []
    },
  })

  const especialidades = useQuery({
    queryKey: ['especialidades-ativas'],
    enabled: podeVer,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Array<Pick<Especialidade, 'id' | 'nome'>>> => {
      const { data, error } = await supabase.from('especialidades').select('id, nome').eq('situacao', 'ativo').order('nome')
      if (error) throw error
      return data ?? []
    },
  })

  const equipe = useQuery({
    queryKey: ['performance-equipe', periodo.de, periodo.ate, funcao, especialidade],
    enabled: podeVer,
    queryFn: async (): Promise<LinhaPerformance[]> => {
      const { data, error } = await supabase.rpc('performance_equipe', {
        p_de: periodo.de,
        p_ate: periodo.ate,
        p_funcao: funcao || null,
        p_especialidade: especialidade || null,
      })
      if (error) throw error
      return data ?? []
    },
  })

  const lancamentos = useQuery({
    queryKey: ['eventos-performance', lancando?.usuario_id],
    enabled: lancando !== null,
    queryFn: async (): Promise<EventoPerformanceListado[]> => {
      const { data, error } = await supabase
        .from('eventos_performance')
        .select('*, criterio:criterios_performance ( id, nome, categoria ), registrador:usuarios!eventos_performance_registrado_por_fkey ( id, nome_completo )')
        .eq('usuario_id', lancando!.usuario_id)
        .order('ocorrido_em', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as unknown as EventoPerformanceListado[]
    },
  })

  const salvarCriterio = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Partial<CriterioPerformance> }) => {
      const { error } = await supabase.from('criterios_performance').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['criterios-performance'] })
      void qc.invalidateQueries({ queryKey: ['performance-equipe'] })
    },
    onError: (e) => toast.erro('Não foi possível salvar o critério', mensagemErro(e)),
  })

  const [lanc, setLanc] = useState({ criterio_id: '', pontos: '', motivo: '', ocorrido_em: new Date().toISOString().slice(0, 10) })

  const lancar = useMutation({
    mutationFn: async () => {
      setErro(null)
      if (!lanc.criterio_id) throw new Error('Escolha o critério.')
      const p = paraNumero(lanc.pontos)
      if (p === null) throw new Error('Informe a pontuação (pode ser negativa).')
      if (lanc.motivo.trim().length < 3) throw new Error('Descreva o motivo — este registro fica no histórico.')
      const { error } = await supabase.from('eventos_performance').insert({
        usuario_id: lancando!.usuario_id,
        criterio_id: lanc.criterio_id,
        pontos: p,
        motivo: lanc.motivo.trim(),
        ocorrido_em: lanc.ocorrido_em,
        registrado_por: usuario?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Lançamento registrado')
      setLanc({ criterio_id: '', pontos: '', motivo: '', ocorrido_em: new Date().toISOString().slice(0, 10) })
      void qc.invalidateQueries({ queryKey: ['eventos-performance'] })
      void qc.invalidateQueries({ queryKey: ['performance-equipe'] })
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Gestão" titulo="Performance" />
        <EstadoSemPermissao />
      </div>
    )
  }

  const ativos = (criterios.data ?? []).filter((c) => c.ativo && c.pontos !== 0)
  const pontuacaoLigada = ativos.length > 0
  const manuais = (criterios.data ?? []).filter((c) => c.origem === 'manual')

  function valorIndicador(l: LinhaPerformance): number | null {
    const v = l[indicador]
    return v === null ? null : Number(v)
  }

  const maior = Math.max(1, ...(equipe.data ?? []).map((l) => Math.abs(valorIndicador(l) ?? 0)))
  const ordenada = [...(equipe.data ?? [])].sort((a, b) => (valorIndicador(b) ?? -1) - (valorIndicador(a) ?? -1))
  const rankingPontuacao = [...(equipe.data ?? [])].sort((a, b) => Number(b.pontos) - Number(a.pontos))
  const podio = rankingPontuacao.slice(0, 3)
  const maiorPontuacao = Math.max(1, ...rankingPontuacao.map((l) => Math.max(0, Number(l.pontos))))
  const mediaPontos =
    rankingPontuacao.length > 0
      ? rankingPontuacao.reduce((soma, linha) => soma + Number(linha.pontos), 0) / rankingPontuacao.length
      : 0

  const colunas: Array<Coluna<LinhaPerformance>> = [
    {
      chave: 'pessoa',
      cabecalho: 'Colaborador',
      celula: (l) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-ink">{l.nome_completo}</span>
          <span className="truncate text-[12px] text-ink-3">{l.funcao ?? 'Sem função definida'}</span>
        </div>
      ),
    },
    {
      chave: 'os',
      cabecalho: 'OS concluídas',
      largura: '120px',
      alinhamento: 'direita',
      celula: (l) => <span className="num text-ink">{numeroBR(l.os_concluidas, 0)}</span>,
    },
    {
      chave: 'checklists',
      cabecalho: 'Checklists',
      largura: '110px',
      alinhamento: 'direita',
      classeResponsiva: 'hidden md:table-cell',
      celula: (l) => <span className="num text-ink">{numeroBR(l.checklists_concluidos, 0)}</span>,
    },
    {
      chave: 'horas',
      cabecalho: 'Horas apontadas',
      largura: '130px',
      alinhamento: 'direita',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (l) => <span className="num text-ink">{numeroBR(Number(l.horas_apontadas), 1)}</span>,
    },
    {
      chave: 'retornos',
      cabecalho: 'Retornos',
      largura: '100px',
      alinhamento: 'direita',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (l) => (
        <span className={cn('num', l.retornos > 0 ? 'text-crit' : 'text-ink-3')}>{numeroBR(l.retornos, 0)}</span>
      ),
    },
    {
      chave: 'cinco_s',
      cabecalho: 'Conformidade 5S',
      largura: '160px',
      classeResponsiva: 'hidden xl:table-cell',
      celula: (l) =>
        l.conformidade_5s === null ? (
          <span className="text-[12.5px] text-ink-3">Sem checklist diário</span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="num text-[12.5px] text-ink">{numeroBR(Number(l.conformidade_5s), 1)}%</span>
            <span className="text-[11.5px] text-ink-3">({l.itens_5s_avaliados} itens)</span>
          </div>
        ),
    },
    {
      chave: 'pontos',
      cabecalho: 'Pontos',
      largura: '130px',
      alinhamento: 'direita',
      celula: (l) =>
        pontuacaoLigada || Number(l.pontos_manuais) !== 0 ? (
          <span className={cn('num font-semibold', Number(l.pontos) < 0 ? 'text-crit' : 'text-ink')}>
            {numeroBR(Number(l.pontos), 2)}
          </span>
        ) : (
          <span className="text-[12.5px] text-ink-3">—</span>
        ),
    },
    {
      chave: 'acoes',
      cabecalho: '',
      largura: '110px',
      alinhamento: 'direita',
      celula: (l) =>
        podeEditar ? (
          <Botao tamanho="sm" variante="fantasma" onClick={() => { setErro(null); setLancando(l) }}>Lançar</Botao>
        ) : null,
    },
  ]

  function aplicar(p: Preset) {
    setPreset(p)
    if (p !== 'livre') setPeriodo(intervalo(p))
  }

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Gestão"
        titulo="Performance"
        meta={<span className="num text-[13px] text-ink-3">{fmtData(periodo.de)} a {fmtData(periodo.ate)}</span>}
        acoes={
          podeConfigurar ? (
            <Botao variante="neutro" iconeInicio={<Settings2 />} onClick={() => setConfigurando(true)}>
              Critérios de pontuação
            </Botao>
          ) : undefined
        }
      />

      {!pontuacaoLigada && (
        <Aviso tom="info" titulo="A pontuação está desligada">
          Nenhum critério foi ativado com pontos, então o sistema não atribui nota a ninguém — os números abaixo são
          apenas a atividade real registrada no período. Ative os critérios que fazem sentido para a Tecnoar em
          “Critérios de pontuação”. Nada é descontado automaticamente: uma não conformidade só tira pontos se
          houver uma regra explícita com pontuação negativa.
        </Aviso>
      )}

      <Painel>
        <div className="flex flex-wrap items-end gap-4">
          <Campo rotulo="Período" className="min-w-0 sm:min-w-[320px]">
            {() => (
              <Segmentado
                valor={preset}
                rotuloGrupo="Período da performance"
                onChange={aplicar}
                opcoes={[
                  { valor: 'mes' as Preset, rotulo: 'Mês' },
                  { valor: '30d' as Preset, rotulo: '30 dias' },
                  { valor: 'trimestre' as Preset, rotulo: 'Trimestre' },
                  { valor: 'ano' as Preset, rotulo: 'Ano' },
                  { valor: 'livre' as Preset, rotulo: 'Livre' },
                ]}
              />
            )}
          </Campo>
          {preset === 'livre' && (
            <>
              <Campo rotulo="De">
                {(p) => <Entrada {...p} mono type="date" value={periodo.de} onChange={(e) => setPeriodo({ ...periodo, de: e.target.value })} />}
              </Campo>
              <Campo rotulo="Até">
                {(p) => <Entrada {...p} mono type="date" value={periodo.ate} onChange={(e) => setPeriodo({ ...periodo, ate: e.target.value })} />}
              </Campo>
            </>
          )}
          <Campo rotulo="Função / equipe" className="min-w-[190px]">
            {(p) => (
              <Selecao {...p} value={funcao} onChange={(e) => setFuncao(e.target.value)}>
                <option value="">Todas</option>
                {funcoes.data?.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo="Especialidade" className="min-w-[190px]">
            {(p) => (
              <Selecao {...p} value={especialidade} onChange={(e) => setEspecialidade(e.target.value)}>
                <option value="">Todas</option>
                {especialidades.data?.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </Selecao>
            )}
          </Campo>
          <Campo rotulo="Indicador do gráfico" className="min-w-[190px]">
            {(p) => (
              <Selecao {...p} value={indicador} onChange={(e) => setIndicador(e.target.value as Indicador)}>
                {INDICADORES.map((i) => <option key={i.valor} value={i.valor}>{i.rotulo}</option>)}
              </Selecao>
            )}
          </Campo>
        </div>
      </Painel>

      {equipe.isLoading ? (
        <EstadoCarregando rotulo="Somando os eventos do período…" />
      ) : equipe.isError ? (
        <EstadoErro descricao={mensagemErro(equipe.error)} aoTentarNovamente={() => void equipe.refetch()} />
      ) : (equipe.data?.length ?? 0) === 0 ? (
        <EstadoVazio
          titulo="Nenhum colaborador no filtro"
          descricao="Os colaboradores vêm de Cadastros › Usuários. Ajuste os filtros de função e especialidade."
        />
      ) : (
        <>
          <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Painel semPadding className="overflow-hidden">
              <CabecalhoPainel
                titulo="Pódio por pontuação"
                descricao="Ranking principal do período, considerando critérios automáticos e lançamentos manuais."
                acao={<Selo tom="info" ponto>{rankingPontuacao.length} colaborador(es)</Selo>}
              />
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {podio.map((l, indice) => (
                  <PodioCard key={l.usuario_id} linha={l} posicao={indice + 1} />
                ))}
              </div>
            </Painel>

            <Painel semPadding>
              <CabecalhoPainel
                titulo="Resumo do placar"
                descricao="Leitura rápida para acompanhamento de equipe."
                acao={<Trophy aria-hidden className="size-4 text-accent" />}
              />
              <div className="flex flex-col gap-3 p-4">
                <CartaoDestaque
                  rotulo="Líder do período"
                  tom="accent"
                  icone={<Trophy />}
                  valor={numeroBR(Number(rankingPontuacao[0]?.pontos ?? 0), 1)}
                  detalhe={rankingPontuacao[0]?.nome_completo ?? 'Sem dados no filtro'}
                />
                <CartaoDestaque
                  rotulo="Média da equipe"
                  tom="cyan"
                  icone={<BarChart3 />}
                  valor={numeroBR(mediaPontos, 1)}
                  detalhe="pontos por colaborador no período"
                />
                <CartaoDestaque
                  rotulo="Critérios ativos"
                  tom={pontuacaoLigada ? 'ok' : 'atencao'}
                  icone={<Gauge />}
                  valor={numeroBR(ativos.length, 0)}
                  detalhe={pontuacaoLigada ? 'pontuação configurada' : 'pontuação desligada — nada é somado'}
                  alerta={!pontuacaoLigada}
                />
              </div>
            </Painel>
          </section>

          <Painel semPadding>
            <CabecalhoPainel
              titulo="Ranking de pontuação"
              descricao="Barras animadas mostram a distância até o líder."
              acao={<BarChart3 aria-hidden className="size-4 text-cyan" />}
            />
            <div className="flex flex-col gap-2 p-4">
              {rankingPontuacao.map((l, indice) => {
                const pontos = Number(l.pontos)
                const largura = pontos <= 0 ? 0 : Math.max(5, (pontos / maiorPontuacao) * 100)
                return (
                  <div key={l.usuario_id} className="grid grid-cols-1 gap-2 rounded-lg border border-line bg-surface px-3 py-2.5 shadow-e1 sm:grid-cols-[2.25rem_minmax(0,220px)_minmax(0,1fr)_5.5rem] sm:items-center sm:gap-3">
                    <span className={cn('num text-center text-[12px] font-semibold', indice < 3 ? 'text-accent-ink' : 'text-ink-3')}>
                      #{indice + 1}
                    </span>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line-strong bg-surface-2 font-display text-[11px] font-bold text-ink">
                        {iniciais(l.nome_completo)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold text-ink">{l.nome_completo}</span>
                        <span className="block truncate text-[12px] text-ink-3">{l.funcao ?? 'Sem função definida'}</span>
                      </span>
                    </div>
                    <div className="h-2.5 min-w-0 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width] duration-700',
                          pontos < 0 ? 'bg-crit' : indice === 0 ? 'bg-accent' : 'bg-cyan',
                        )}
                        style={{ width: `${largura}%` }}
                      />
                    </div>
                    <span className={cn('num text-right text-[13px] font-semibold', pontos < 0 ? 'text-crit-ink' : 'text-ink')}>
                      {numeroBR(pontos, 1)}
                    </span>
                  </div>
                )
              })}
            </div>
          </Painel>

          <Painel semPadding>
            <CabecalhoPainel
              titulo={INDICADORES.find((i) => i.valor === indicador)!.rotulo}
              descricao="Comparação entre os colaboradores no período filtrado."
            />
            <div className="p-5">
              <ul className="flex flex-col gap-2">
                {ordenada.map((l) => {
                  const v = valorIndicador(l)
                  return (
                    <li key={l.usuario_id} className="flex items-center gap-3">
                      <span className="w-44 shrink-0 truncate text-[12.5px] text-ink-2">{l.nome_completo}</span>
                      <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                        {v !== null && v !== 0 && (
                          <div
                            className={cn('h-full rounded-full', v < 0 ? 'bg-crit' : 'bg-cyan')}
                            style={{ width: `${Math.max(2, (Math.abs(v) / maior) * 100)}%` }}
                          />
                        )}
                      </div>
                      <span className="num w-24 shrink-0 text-right text-[12.5px] text-ink">
                        {v === null
                          ? 'Sem dados'
                          : indicador === 'conformidade_5s'
                            ? `${numeroBR(v, 1)}%`
                            : numeroBR(v, indicador === 'horas_apontadas' || indicador === 'pontos' ? 1 : 0)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </Painel>

          <Tabela
            colunas={colunas}
            linhas={ordenada}
            chaveDe={(l) => l.usuario_id}
            estado="ok"
          />
        </>
      )}

      {/* ----------------------------------------------------- critérios */}
      <PainelLateral
        aberto={configurando}
        aoFechar={() => setConfigurando(false)}
        largura="lg"
        titulo="Critérios de pontuação"
        descricao="Nada pontua até ser ativado aqui. Pontos negativos são permitidos e precisam ser escolhidos de propósito."
        rodape={<Botao variante="neutro" onClick={() => setConfigurando(false)}>Fechar</Botao>}
      >
        {criterios.isLoading ? (
          <EstadoCarregando />
        ) : criterios.isError ? (
          <EstadoErro descricao={mensagemErro(criterios.error)} aoTentarNovamente={() => void criterios.refetch()} />
        ) : (
          <ul className="flex flex-col gap-3">
            {(criterios.data ?? []).map((c) => (
              <li key={c.id} className="flex flex-col gap-3 rounded-lg border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span className="text-[13px] font-semibold text-ink">{c.nome}</span>
                      <Selo tom="neutro">{c.categoria}</Selo>
                      <Selo tom={c.origem === 'automatico' ? 'info' : 'destaque'}>
                        {c.origem === 'automatico' ? 'Automático' : 'Manual'}
                      </Selo>
                    </div>
                    {c.descricao && <p className="text-[12.5px] text-ink-3">{c.descricao}</p>}
                  </div>
                  <Alternador
                    ativo={c.ativo}
                    rotulo={`Ativar ${c.nome}`}
                    onChange={(v) => salvarCriterio.mutate({ id: c.id, campos: { ativo: v } })}
                    disabled={!podeConfigurar}
                  />
                </div>
                {c.origem === 'automatico' && (
                  <Campo rotulo="Pontos por ocorrência" dica="Use valor negativo para descontar.">
                    {(p) => (
                      <Entrada
                        {...p}
                        mono
                        inputMode="decimal"
                        defaultValue={String(c.pontos)}
                        disabled={!podeConfigurar}
                        onBlur={(e) => {
                          const v = paraNumero(e.target.value)
                          if (v !== null && v !== Number(c.pontos)) salvarCriterio.mutate({ id: c.id, campos: { pontos: v } })
                        }}
                      />
                    )}
                  </Campo>
                )}
              </li>
            ))}
          </ul>
        )}
      </PainelLateral>

      {/* ------------------------------------------------- lançamento manual */}
      <PainelLateral
        aberto={lancando !== null}
        aoFechar={() => setLancando(null)}
        largura="lg"
        titulo="Lançar evento de performance"
        descricao={lancando?.nome_completo}
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setLancando(null)}>Fechar</Botao>
            <Botao variante="primario" carregando={lancar.isPending} onClick={() => lancar.mutate()}>Registrar</Botao>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          {erro && <Aviso tom="critico">{erro}</Aviso>}

          <Grade>
            <Campo className="sm:col-span-8" rotulo="Critério" obrigatorio>
              {(p) => (
                <Selecao {...p} value={lanc.criterio_id} onChange={(e) => setLanc({ ...lanc, criterio_id: e.target.value })}>
                  <option value="">Selecione</option>
                  {manuais.map((c) => <option key={c.id} value={c.id}>{c.nome} · {c.categoria}</option>)}
                </Selecao>
              )}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="Pontos" obrigatorio dica="Negativo desconta.">
              {(p) => (
                <Entrada {...p} mono inputMode="decimal" value={lanc.pontos} onChange={(e) => setLanc({ ...lanc, pontos: e.target.value })} />
              )}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="Data" obrigatorio>
              {(p) => (
                <Entrada {...p} mono type="date" value={lanc.ocorrido_em} onChange={(e) => setLanc({ ...lanc, ocorrido_em: e.target.value })} />
              )}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Motivo" obrigatorio>
              {(p) => (
                <AreaTexto {...p} rows={3} value={lanc.motivo} onChange={(e) => setLanc({ ...lanc, motivo: e.target.value })} placeholder="O que aconteceu, com fatos." />
              )}
            </Campo>
          </Grade>

          <section className="flex flex-col gap-3">
            <h3 className="lbl">Lançamentos anteriores</h3>
            {lancamentos.isLoading ? (
              <EstadoCarregando />
            ) : (lancamentos.data?.length ?? 0) === 0 ? (
              <EstadoVazio compacto titulo="Nenhum lançamento" descricao="Este colaborador ainda não recebeu evento manual." />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {(lancamentos.data ?? []).map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-3 rounded border border-line px-3 py-2 text-[12.5px]">
                    <span className="num shrink-0 text-ink-3">{fmtData(e.ocorrido_em)}</span>
                    <Selo tom="neutro">{e.criterio?.nome ?? 'Critério removido'}</Selo>
                    <span className="min-w-0 flex-1 truncate text-ink-2">{e.motivo}</span>
                    <span className={cn('num shrink-0 font-semibold', Number(e.pontos) < 0 ? 'text-crit' : 'text-ok-ink')}>
                      {Number(e.pontos) > 0 ? '+' : ''}{numeroBR(Number(e.pontos), 2)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {manuais.length === 0 && (
            <Aviso tom="atencao" titulo="Nenhum critério manual disponível">
              Crie ou mantenha ao menos um critério de origem manual em “Critérios de pontuação”.
            </Aviso>
          )}

          {lancando && (
            <div className="flex flex-wrap gap-3 rounded-lg border border-line bg-surface-2 p-4">
              <Award aria-hidden className="size-4 shrink-0 self-center text-cyan" />
              <span className="text-[12.5px] text-ink-2">
                No período filtrado: {lancando.os_concluidas} OS, {lancando.checklists_concluidos} checklist(s),{' '}
                {numeroBR(Number(lancando.horas_apontadas), 1)} h apontadas, {lancando.retornos} retorno(s).
              </span>
            </div>
          )}
        </div>
      </PainelLateral>
    </div>
  )
}

function PodioCard({ linha, posicao }: { linha: LinhaPerformance; posicao: number }) {
  const estilos = {
    1: {
      altura: 'md:min-h-[172px]',
      icone: <Trophy />,
      classe: 'border-accent/35 bg-accent-soft/40 text-accent-ink',
      barra: 'bg-accent',
      rotulo: '1º lugar',
    },
    2: {
      altura: 'md:min-h-[150px] md:mt-5',
      icone: <Medal />,
      classe: 'border-cyan/30 bg-cyan-soft/45 text-cyan-ink',
      barra: 'bg-cyan',
      rotulo: '2º lugar',
    },
    3: {
      altura: 'md:min-h-[136px] md:mt-9',
      icone: <Award />,
      classe: 'border-line bg-surface-2 text-ink-2',
      barra: 'bg-ink-3',
      rotulo: '3º lugar',
    },
  }[posicao]!

  return (
    <article className={cn('entrada-suave relative overflow-hidden rounded-lg border p-4 shadow-e1', estilos.altura, estilos.classe)}>
      <span aria-hidden className={cn('absolute inset-x-0 top-0 h-[3px]', estilos.barra)} />
      <div className="flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-3">
          <span>
            <span className="lbl block">{estilos.rotulo}</span>
            <span className="num block text-[28px] leading-none font-semibold text-ink">{numeroBR(Number(linha.pontos), 1)}</span>
            <span className="block text-[12px] text-ink-3">pontos</span>
          </span>
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-current/20 bg-surface/70 [&_svg]:size-5">
            {estilos.icone}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line-strong bg-surface font-display text-[12px] font-bold text-ink">
            {iniciais(linha.nome_completo)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-ink">{linha.nome_completo}</span>
            <span className="block truncate text-[12px] text-ink-3">{linha.funcao ?? 'Sem função definida'}</span>
          </span>
        </div>
      </div>
    </article>
  )
}

