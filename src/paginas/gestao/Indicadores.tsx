import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, BarChart3, ClipboardList, Gauge, Printer, RefreshCw, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro } from '@/lib/utils'
import { data as fmtData, moeda, numeroBR } from '@/lib/formatos'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { CabecalhoPagina, Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Entrada, Segmentado } from '@/componentes/ui/Campo'
import { Selo } from '@/componentes/ui/Selo'
import type { TomMetrica } from '@/componentes/ui/Metrica'
import { BarraRanque, CartaoDestaque, CartaoIndicador } from './componentes/Indicador'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'
import type { AlertaGestao, IndicadoresGestao } from '@/tipos/db'

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

/**
 * Intervalo imediatamente anterior, com a mesma quantidade de dias.
 *
 * Comparar março inteiro com "os 5 dias de abril que já passaram" produziria
 * uma queda inventada. O tamanho tem que bater.
 */
function periodoAnterior(de: string, ate: string): { de: string; ate: string } {
  const inicio = new Date(`${de}T00:00:00`)
  const fim = new Date(`${ate}T00:00:00`)
  const dias = Math.max(1, Math.round((fim.getTime() - inicio.getTime()) / 86_400_000) + 1)
  const fimAnterior = new Date(inicio.getTime() - 86_400_000)
  const inicioAnterior = new Date(fimAnterior.getTime() - (dias - 1) * 86_400_000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { de: iso(inicioAnterior), ate: iso(fimAnterior) }
}

function descricaoGrupo(titulo: string) {
  const mapa: Record<string, string> = {
    Oficina: 'Fluxo do pátio, aprovação, peça e entrega.',
    Qualidade: 'Retorno, garantia e conformidade diária.',
    Laboratório: 'Fila e SLA de protocolos em teste.',
    'Comercial e relacionamento': 'Vendas, estoque e clientes sem retorno.',
    Pendências: 'Compromissos vencidos que precisam de dono.',
  }
  return mapa[titulo] ?? undefined
}

function LinhaRelatorio({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 rounded-md border border-line bg-surface-2 px-3 py-2">
      <span className="lbl self-center">{rotulo}</span>
      <span className="min-w-0 text-[12.5px] leading-snug text-ink-2">{valor}</span>
    </div>
  )
}

/** Cada cartão responde a uma pergunta operacional — nenhum existe só para preencher tela. */
interface Cartao {
  rotulo: string
  pergunta: string
  valor: string
  tom: TomMetrica
  alerta?: boolean
}

export function Indicadores() {
  const { pode } = usePermissoes()
  const toast = useToast()

  const [preset, setPreset] = useState<Preset>('mes')
  const [periodo, setPeriodo] = useState(() => intervalo('mes'))

  const podeVer = pode('indicadores', 'visualizar')

  const dados = useQuery({
    queryKey: ['indicadores-gestao', periodo.de, periodo.ate],
    enabled: podeVer,
    queryFn: async (): Promise<IndicadoresGestao | null> => {
      const { data, error } = await supabase.rpc('indicadores_gestao', { p_de: periodo.de, p_ate: periodo.ate })
      if (error) throw error
      return (data ?? [])[0] ?? null
    },
  })

  /* Mesmo RPC, período anterior — é o que transforma número solto em leitura. */
  const anterior = useQuery({
    queryKey: ['indicadores-gestao', 'anterior', periodo.de, periodo.ate],
    enabled: podeVer,
    queryFn: async (): Promise<IndicadoresGestao | null> => {
      const p = periodoAnterior(periodo.de, periodo.ate)
      const { data, error } = await supabase.rpc('indicadores_gestao', { p_de: p.de, p_ate: p.ate })
      if (error) throw error
      return (data ?? [])[0] ?? null
    },
  })

  const alertas = useQuery({
    queryKey: ['alertas-gestao'],
    enabled: podeVer,
    queryFn: async (): Promise<AlertaGestao[]> => {
      const { data, error } = await supabase.rpc('alertas_gestao', { p_limite: 50 })
      if (error) throw error
      return data ?? []
    },
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Gestão" titulo="Indicadores" />
        <EstadoSemPermissao />
      </div>
    )
  }

  const d = dados.data
  const a = anterior.data

  const saudeOperacional = d
    ? Math.max(
        0,
        100 -
          d.aguardando_aprovacao * 4 -
          d.aguardando_peca * 4 -
          d.pecas_teste_vencidas * 8 -
          d.acoes_vencidas * 7 -
          d.follow_ups_atrasados * 4 -
          d.retornos_periodo * 6,
      )
    : null
  const gargalos = d
    ? [
        { rotulo: 'Aprovação', valor: d.aguardando_aprovacao, tom: 'atencao' as const },
        { rotulo: 'Peças', valor: d.aguardando_peca, tom: 'accent' as const },
        { rotulo: 'SLA laboratório', valor: d.pecas_teste_vencidas, tom: 'critico' as const },
        { rotulo: 'Follow-ups', valor: d.follow_ups_atrasados, tom: 'atencao' as const },
        { rotulo: 'Ações corretivas', valor: d.acoes_vencidas, tom: 'critico' as const },
      ]
    : []
  const maiorGargalo = Math.max(1, ...gargalos.map((g) => g.valor))
  const alertasCriticos = d
    ? d.retornos_periodo + d.pecas_teste_vencidas + d.acoes_vencidas + d.follow_ups_atrasados + d.estoque_critico
    : 0

  const GRUPOS: Array<{ titulo: string; cartoes: Cartao[] }> = [
    {
      titulo: 'Oficina',
      cartoes: [
        { rotulo: 'Veículos no pátio', pergunta: 'Quantos veículos estão sob nossa responsabilidade agora?', valor: d ? numeroBR(d.veiculos_patio, 0) : '—', tom: 'cyan' },
        { rotulo: 'Aguardando aprovação', pergunta: 'Quantas OS estão paradas esperando o cliente decidir?', valor: d ? numeroBR(d.aguardando_aprovacao, 0) : '—', tom: 'atencao', alerta: (d?.aguardando_aprovacao ?? 0) > 0 },
        { rotulo: 'Aguardando peça', pergunta: 'Quantos veículos estão parados por falta de peça?', valor: d ? numeroBR(d.aguardando_peca, 0) : '—', tom: 'accent', alerta: (d?.aguardando_peca ?? 0) > 0 },
        { rotulo: 'OS concluídas no período', pergunta: 'Quanto a oficina entregou no período?', valor: d ? numeroBR(d.os_concluidas_periodo, 0) : '—', tom: 'ok' },
        {
          rotulo: 'Tempo médio de OS',
          pergunta: 'Quanto tempo, em média, um veículo leva da abertura ao encerramento?',
          valor: d?.tempo_medio_horas === null || d?.tempo_medio_horas === undefined
            ? 'Sem OS encerrada'
            : `${numeroBR(Number(d.tempo_medio_horas), 1)} h`,
          tom: 'neutro',
        },
      ],
    },
    {
      titulo: 'Qualidade',
      cartoes: [
        { rotulo: 'Retornos no período', pergunta: 'Quantos clientes voltaram por causa do mesmo problema?', valor: d ? numeroBR(d.retornos_periodo, 0) : '—', tom: 'critico', alerta: (d?.retornos_periodo ?? 0) > 0 },
        { rotulo: 'Garantias vigentes', pergunta: 'Quantos itens ainda estão cobertos por nós?', valor: d ? numeroBR(d.garantias_vigentes, 0) : '—', tom: 'cyan' },
        { rotulo: 'Garantias acionadas', pergunta: 'Quantas garantias foram acionadas no período?', valor: d ? numeroBR(d.garantias_acionadas_periodo, 0) : '—', tom: 'atencao' },
        {
          rotulo: 'Conformidade 5S',
          pergunta: 'Qual a taxa de itens conformes nos checklists diários?',
          valor: d?.conformidade_5s === null || d?.conformidade_5s === undefined
            ? 'Sem checklist diário'
            : `${numeroBR(Number(d.conformidade_5s), 1)}%`,
          tom: 'ok',
        },
      ],
    },
    {
      titulo: 'Laboratório',
      cartoes: [
        { rotulo: 'Peças em teste', pergunta: 'Quantos protocolos estão abertos no laboratório?', valor: d ? numeroBR(d.pecas_teste_abertas, 0) : '—', tom: 'cyan' },
        { rotulo: 'SLA vencido', pergunta: 'Quantas peças passaram do prazo prometido?', valor: d ? numeroBR(d.pecas_teste_vencidas, 0) : '—', tom: 'critico', alerta: (d?.pecas_teste_vencidas ?? 0) > 0 },
      ],
    },
    {
      titulo: 'Comercial e relacionamento',
      cartoes: [
        { rotulo: 'Vendas no período', pergunta: 'Quantas vendas foram registradas?', valor: d ? numeroBR(d.vendas_periodo, 0) : '—', tom: 'cyan' },
        { rotulo: 'Faturamento no período', pergunta: 'Quanto essas vendas somaram?', valor: d ? moeda(Number(d.faturamento_periodo)) : '—', tom: 'ok' },
        { rotulo: 'Estoque crítico', pergunta: 'Quantos itens estão abaixo do mínimo ou zerados?', valor: d ? numeroBR(d.estoque_critico, 0) : '—', tom: 'atencao', alerta: (d?.estoque_critico ?? 0) > 0 },
        { rotulo: 'Clientes inativos', pergunta: 'Quantos clientes ativos estão há tempo demais sem voltar?', valor: d ? numeroBR(d.clientes_inativos, 0) : '—', tom: 'accent', alerta: (d?.clientes_inativos ?? 0) > 0 },
      ],
    },
    {
      titulo: 'Pendências',
      cartoes: [
        { rotulo: 'Ações corretivas vencidas', pergunta: 'O que foi combinado e não foi feito no prazo?', valor: d ? numeroBR(d.acoes_vencidas, 0) : '—', tom: 'critico', alerta: (d?.acoes_vencidas ?? 0) > 0 },
        { rotulo: 'Follow-ups atrasados', pergunta: 'Quantos contatos com cliente ficaram para trás?', valor: d ? numeroBR(d.follow_ups_atrasados, 0) : '—', tom: 'atencao', alerta: (d?.follow_ups_atrasados ?? 0) > 0 },
      ],
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
        titulo="Indicadores"
        meta={
          d ? (
            <span className="num text-[13px] text-ink-3">
              {fmtData(d.de)} a {fmtData(d.ate)}
            </span>
          ) : undefined
        }
        acoes={
          <Botao
            variante="neutro"
            iconeInicio={<RefreshCw />}
            carregando={dados.isFetching || alertas.isFetching}
            onClick={() => {
              void dados.refetch()
              void alertas.refetch()
              toast.ok('Indicadores atualizados')
            }}
          >
            Atualizar
          </Botao>
        }
      />

      <Painel className="p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Campo rotulo="Período" className="min-w-0 sm:min-w-[320px]">
            {() => (
              <Segmentado
                valor={preset}
                rotuloGrupo="Período dos indicadores"
                onChange={(v) => aplicar(v)}
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
                {(p) => (
                  <Entrada {...p} mono type="date" value={periodo.de} onChange={(e) => setPeriodo({ ...periodo, de: e.target.value })} />
                )}
              </Campo>
              <Campo rotulo="Até">
                {(p) => (
                  <Entrada {...p} mono type="date" value={periodo.ate} onChange={(e) => setPeriodo({ ...periodo, ate: e.target.value })} />
                )}
              </Campo>
            </>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            <Botao variante="neutro" iconeInicio={<Printer />} onClick={() => window.print()}>
              Relatório
            </Botao>
          </div>
        </div>
      </Painel>

      {dados.isError ? (
        <EstadoErro descricao={mensagemErro(dados.error)} aoTentarNovamente={() => void dados.refetch()} />
      ) : dados.isLoading ? (
        <EstadoCarregando rotulo="Somando os números do período…" />
      ) : d ? (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CartaoDestaque
              rotulo="Saúde operacional"
              icone={<Gauge />}
              valor={`${numeroBR(saudeOperacional ?? 0, 0)}%`}
              detalhe="pontuação interna de risco, calculada dos gargalos abaixo"
              tom={(saudeOperacional ?? 0) < 70 ? 'critico' : (saudeOperacional ?? 0) < 86 ? 'atencao' : 'ok'}
              alerta={(saudeOperacional ?? 0) < 70}
            />
            <CartaoDestaque
              rotulo="Entregue no período"
              icone={<ClipboardList />}
              valor={numeroBR(d.os_concluidas_periodo, 0)}
              detalhe="ordens de serviço concluídas"
              tom="cyan"
              variacao={
                a ? { anterior: a.os_concluidas_periodo, atual: d.os_concluidas_periodo, melhorQuando: 'sobe' } : undefined
              }
            />
            <CartaoDestaque
              rotulo="Faturamento"
              icone={<BarChart3 />}
              valor={moeda(Number(d.faturamento_periodo))}
              detalhe={`${numeroBR(d.vendas_periodo, 0)} venda(s) no período`}
              tom="accent"
              variacao={
                a
                  ? { anterior: Number(a.faturamento_periodo), atual: Number(d.faturamento_periodo), melhorQuando: 'sobe' }
                  : undefined
              }
            />
            <CartaoDestaque
              rotulo="Pontos de atenção"
              icone={<ShieldCheck />}
              valor={numeroBR(alertasCriticos, 0)}
              detalhe="itens com impacto direto na entrega"
              tom={alertasCriticos > 0 ? 'atencao' : 'ok'}
              alerta={alertasCriticos > 0}
            />
          </section>

          <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.5fr)]">
            <Painel semPadding>
              <CabecalhoPainel
                titulo="Onde o fluxo trava"
                descricao="Quantidade parada em cada gargalo agora — não é do período, é deste instante."
              />
              <div className="p-4">
                <BarraRanque
                  tom="atencao"
                  itens={gargalos
                    .filter((g) => g.valor > 0)
                    .map((g) => ({ chave: g.rotulo, rotulo: g.rotulo, valor: g.valor }))}
                  formatar={(v) => numeroBR(v, 0)}
                  vazio="Nenhum gargalo aberto. O fluxo está limpo."
                />
              </div>
            </Painel>

            <Painel semPadding>
              <CabecalhoPainel titulo="Relatório executivo" descricao="Leitura compacta para reunião de operação." />
              <div className="flex flex-col gap-3 p-4">
                <LinhaRelatorio rotulo="Fluxo" valor={`${numeroBR(d.veiculos_patio, 0)} no pátio · ${numeroBR(d.os_concluidas_periodo, 0)} entregues`} />
                <LinhaRelatorio rotulo="Financeiro" valor={`${moeda(Number(d.faturamento_periodo))} em vendas · ${numeroBR(d.vendas_periodo, 0)} vendas`} />
                <LinhaRelatorio rotulo="Qualidade" valor={`${numeroBR(d.retornos_periodo, 0)} retornos · ${d.conformidade_5s === null ? '5S sem leitura' : `${numeroBR(Number(d.conformidade_5s), 1)}% 5S`}`} />
                <LinhaRelatorio rotulo="Risco" valor={`${numeroBR(d.estoque_critico, 0)} estoque crítico · ${numeroBR(d.follow_ups_atrasados, 0)} follow-ups atrasados`} />
              </div>
            </Painel>
          </section>

          <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="flex flex-col gap-4">
              {GRUPOS.map((g) => (
                <Painel key={g.titulo} semPadding>
                  <CabecalhoPainel
                    titulo={g.titulo}
                    descricao={descricaoGrupo(g.titulo)}
                    acao={<Selo tom={g.cartoes.some((c) => c.alerta) ? 'atencao' : 'ok'} ponto>{g.cartoes.some((c) => c.alerta) ? 'Atenção' : 'Estável'}</Selo>}
                  />
                  <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-3">
                    {g.cartoes.map((c) => (
                      <CartaoIndicador
                        key={c.rotulo}
                        rotulo={c.rotulo}
                        pergunta={c.pergunta}
                        valor={c.valor}
                        tom={c.tom}
                        alerta={c.alerta}
                      />
                    ))}
                  </div>
                </Painel>
              ))}
            </div>

            <Painel semPadding>
              <CabecalhoPainel
                titulo="Gargalos"
                descricao="Onde a operação está perdendo velocidade agora."
                acao={<BarChart3 aria-hidden className="size-4 text-cyan" />}
              />
              <div className="flex flex-col gap-3 p-4">
                {gargalos.map((g) => (
                  <div key={g.rotulo} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[12.5px] font-medium text-ink-2">{g.rotulo}</span>
                      <span className={cn('num text-[12.5px] font-semibold', g.tom === 'critico' ? 'text-crit-ink' : g.tom === 'atencao' ? 'text-warn-ink' : 'text-accent-ink')}>
                        {numeroBR(g.valor, 0)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={cn(
                          'h-full rounded-full transition-[width] duration-500',
                          g.tom === 'critico' ? 'bg-crit' : g.tom === 'atencao' ? 'bg-warn' : 'bg-accent',
                        )}
                        style={{ width: `${Math.max(g.valor > 0 ? 8 : 0, (g.valor / maiorGargalo) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Painel>
          </section>
        </>
      ) : (
        <EstadoVazio titulo="Sem leitura no período" descricao="Não há dados consolidados para os filtros selecionados." />
      )}

      {d && d.itens_5s_avaliados === 0 && (
        <p className="text-[12.5px] text-ink-3">
          A conformidade 5S aparece assim que houver checklist diário concluído no período. Itens respondidos como
          “não se aplica” ficam fora do cálculo.
        </p>
      )}

      <Painel semPadding>
        <CabecalhoPainel
          titulo="Alertas — prazos vencidos"
          descricao="Ações corretivas, follow-ups, peças em teste e OS que passaram da data prometida."
          acao={
            alertas.data && alertas.data.length > 0 ? (
              <Selo tom="critico" ponto>{alertas.data.length} pendência(s)</Selo>
            ) : undefined
          }
        />
        <div className="p-5">
          {alertas.isLoading ? (
            <EstadoCarregando />
          ) : alertas.isError ? (
            <EstadoErro descricao={mensagemErro(alertas.error)} aoTentarNovamente={() => void alertas.refetch()} />
          ) : (alertas.data?.length ?? 0) === 0 ? (
            <EstadoVazio
              titulo="Nenhum prazo vencido"
              descricao="Tudo o que tem data combinada está dentro do prazo."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {(alertas.data ?? []).map((a) => (
                <li
                  key={`${a.entidade}-${a.entidade_id}`}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-crit/30 bg-crit-soft/40 px-3.5 py-2.5"
                >
                  <AlertTriangle aria-hidden className="size-4 shrink-0 self-center text-crit" />
                  <Selo tom="neutro">{a.tipo}</Selo>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{a.titulo}</span>
                  {a.detalhe && <span className="hidden min-w-0 truncate text-[12.5px] text-ink-3 lg:block">{a.detalhe}</span>}
                  <span className="text-[12px] text-ink-3">{a.responsavel ?? 'Sem responsável'}</span>
                  <span className="num shrink-0 text-[12.5px] font-semibold text-crit">
                    {a.dias_vencido} dia(s) em atraso
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Painel>
    </div>
  )
}
