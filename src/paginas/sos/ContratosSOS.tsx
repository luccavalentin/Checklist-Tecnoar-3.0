import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Handshake, Loader2, Plus, Power, Search, Timer, UserRound, X } from 'lucide-react'
import { cn, mensagemErro } from '@/lib/utils'
import { data as dataBR, mascaraDocumento, mascaraTelefone, moeda } from '@/lib/formatos'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Segmentado } from '@/componentes/ui/Campo'
import { EstadoCarregando, EstadoVazio } from '@/componentes/ui/Estados'
import { GradeMetricas, Metrica } from '@/componentes/ui/Metrica'
import { Selo, type TomSelo } from '@/componentes/ui/Selo'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { useToast } from '@/componentes/ui/Toast'
import { sosBuscarCliente, sosListarContratos, sosSalvarContrato } from '@/sos/api'
import { PRIORIDADES } from '@/sos/rotulos'
import type { ContratoListado, PrioridadeSOS } from '@/sos/tipos'
import { CHAVE_CONTRATOS, ErroSOS, LinhaAlternador, lerNumero, useConfigSOS } from './comum'

type Filtro = 'ativos' | 'todos' | 'encerrados'

/** Data local de hoje (AAAA-MM-DD) — a vigência é dia do calendário, não UTC. */
function hojeLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function diasAte(dia: string, hoje: string): number {
  return Math.round((Date.parse(`${dia}T12:00:00`) - Date.parse(`${hoje}T12:00:00`)) / 86_400_000)
}

/**
 * Situação para o SOS de hoje. Só o contrato ativo e dentro da vigência vale
 * na abertura do chamado (`sos_contrato_vigente`) — o resto é informação.
 */
function situacao(c: ContratoListado, hoje: string): { rotulo: string; tom: TomSelo } {
  if (!c.ativo) return { rotulo: 'Encerrado', tom: 'neutro' }
  if (c.vigencia_inicio && c.vigencia_inicio > hoje) return { rotulo: `Começa ${dataBR(c.vigencia_inicio).slice(0, 5)}`, tom: 'info' }
  if (c.vigencia_fim && c.vigencia_fim < hoje) return { rotulo: 'Vencido', tom: 'critico' }
  if (c.vigencia_fim) {
    const d = diasAte(c.vigencia_fim, hoje)
    if (d <= 15) return { rotulo: d === 0 ? 'Vence hoje' : `Vence em ${d} d`, tom: 'atencao' }
  }
  return { rotulo: 'Vigente', tom: 'ok' }
}

function textoVigencia(c: Pick<ContratoListado, 'vigencia_inicio' | 'vigencia_fim'>): string {
  if (!c.vigencia_inicio && !c.vigencia_fim) return 'Sem prazo definido'
  if (!c.vigencia_fim) return `Desde ${dataBR(c.vigencia_inicio)}`
  if (!c.vigencia_inicio) return `Até ${dataBR(c.vigencia_fim)}`
  return `${dataBR(c.vigencia_inicio)} a ${dataBR(c.vigencia_fim)}`
}

function textoDeslocamento(c: Pick<ContratoListado, 'valor_km' | 'taxa_minima'>): string {
  const partes = [c.valor_km != null ? `${moeda(c.valor_km)}/km` : null, c.taxa_minima != null ? `mín. ${moeda(c.taxa_minima)}` : null].filter(Boolean)
  return partes.length ? partes.join(' · ') : 'Padrão da central'
}

/**
 * Contratos de frotistas — prazo de chegada (SLA), prioridade mínima e preço
 * de deslocamento próprios. O contrato vale no nascimento do SOS: o chamado
 * herda o prazo e a prioridade, e o vigia avisa a central quando o prazo
 * estoura. Aqui a central vê, por contrato, quantas chegadas dos últimos 30
 * dias ficaram dentro do combinado — o número que o frotista vai cobrar.
 */
export function ContratosSOS({ podeConfigurar }: { podeConfigurar: boolean }) {
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('ativos')
  const [editando, setEditando] = useState<ContratoListado | 'novo' | null>(null)

  const consulta = useQuery({
    queryKey: CHAVE_CONTRATOS,
    staleTime: 30_000,
    queryFn: sosListarContratos,
  })
  const todos = useMemo(() => consulta.data ?? [], [consulta.data])
  const hoje = hojeLocal()

  const lista = useMemo(() => {
    const t = busca.trim().toLocaleLowerCase('pt-BR')
    return todos.filter(
      (c) =>
        (filtro === 'todos' || (filtro === 'ativos' ? c.ativo : !c.ativo)) &&
        (!t || c.cliente_nome.toLocaleLowerCase('pt-BR').includes(t) || c.nome.toLocaleLowerCase('pt-BR').includes(t)),
    )
  }, [todos, busca, filtro])

  const resumo = useMemo(() => {
    const ativos = todos.filter((c) => c.ativo)
    const chamados = ativos.reduce((s, c) => s + Number(c.chamados_30d ?? 0), 0)
    const comChegada = ativos.reduce((s, c) => s + Number(c.com_chegada_30d ?? 0), 0)
    const noPrazo = ativos.reduce((s, c) => s + Number(c.no_prazo_30d ?? 0), 0)
    return { ativos: ativos.length, chamados, comChegada, noPrazo }
  }, [todos])
  const pctPrazo = resumo.comChegada ? Math.round((resumo.noPrazo / resumo.comChegada) * 100) : null

  const abrir = podeConfigurar ? (c: ContratoListado) => setEditando(c) : undefined

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <GradeMetricas colunas={3}>
        <Metrica
          rotulo="Contratos ativos"
          valor={consulta.data ? resumo.ativos : '—'}
          glosa={consulta.data ? `${todos.length} cadastrado${todos.length === 1 ? '' : 's'} no total` : undefined}
          tom="accent"
          icone={<Handshake />}
          carregando={consulta.isLoading}
        />
        <Metrica
          rotulo="SOS de contrato"
          valor={consulta.data ? resumo.chamados : '—'}
          glosa="abertos nos últimos 30 dias"
          tom="cyan"
          carregando={consulta.isLoading}
        />
        <Metrica
          rotulo="Chegada no prazo"
          // Sem chegada ainda, o traço — frase no lugar do número espreme o cartão em três colunas.
          valor={pctPrazo != null ? `${pctPrazo}%` : '—'}
          glosa={resumo.comChegada ? `${resumo.noPrazo} de ${resumo.comChegada} chegadas em 30 dias` : 'nenhuma chegada de contrato em 30 dias'}
          tom={pctPrazo == null ? 'neutro' : pctPrazo >= 90 ? 'ok' : pctPrazo >= 70 ? 'atencao' : 'critico'}
          alerta={pctPrazo != null && pctPrazo < 70}
          icone={<Timer />}
          carregando={consulta.isLoading}
        />
      </GradeMetricas>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1 sm:max-w-sm">
          <Entrada
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Cliente ou nome do contrato"
            aria-label="Buscar contrato"
            iconeInicio={<Search />}
            acaoFim={
              busca ? (
                <BotaoIcone rotulo="Limpar busca" tamanho="sm" onClick={() => setBusca('')}>
                  <X />
                </BotaoIcone>
              ) : undefined
            }
          />
        </div>
        <div className="flex items-center gap-2 sm:flex-1">
          <Segmentado<Filtro>
            rotuloGrupo="Situação do contrato"
            valor={filtro}
            onChange={setFiltro}
            className="min-w-0 flex-1 sm:flex-none [&>button]:min-h-11 lg:[&>button]:min-h-8"
            opcoes={[
              { valor: 'ativos', rotulo: 'Ativos' },
              { valor: 'encerrados', rotulo: 'Encerrados' },
              { valor: 'todos', rotulo: 'Todos' },
            ]}
          />
          {podeConfigurar && (
            <Botao variante="primario" iconeInicio={<Plus />} onClick={() => setEditando('novo')} className="shrink-0 max-lg:h-11 sm:ml-auto">
              <span className="hidden min-[400px]:inline">Novo contrato</span>
              <span className="min-[400px]:hidden">Novo</span>
            </Botao>
          )}
        </div>
      </div>

      {consulta.isLoading ? (
        <EstadoCarregando rotulo="Carregando contratos…" />
      ) : consulta.isError ? (
        <ErroSOS erro={consulta.error} aoTentarNovamente={() => void consulta.refetch()} />
      ) : lista.length === 0 ? (
        <EstadoVazio
          icone={<Handshake />}
          titulo={todos.length === 0 ? 'Nenhum contrato cadastrado' : 'Nenhum contrato neste filtro'}
          descricao={
            todos.length === 0
              ? 'Cadastre os frotistas com prazo de chegada combinado: o SOS deles já nasce com o prazo e a prioridade do contrato, e o vigia avisa a central quando o prazo estoura.'
              : 'Troque o filtro ou a busca para ver os demais.'
          }
          acao={
            todos.length === 0 && podeConfigurar ? (
              <Botao variante="primario" iconeInicio={<Plus />} onClick={() => setEditando('novo')}>
                Novo contrato
              </Botao>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Celular e tablet: cartões. A tabela só a partir de `lg`. */}
          <ul className="flex flex-col gap-3 lg:hidden">
            {lista.map((c) => (
              <li key={c.id}>
                <CartaoContrato c={c} hoje={hoje} aoAbrir={abrir} />
              </li>
            ))}
          </ul>
          <div className="aresta hidden max-w-full overflow-x-auto rounded-lg border border-line bg-surface shadow-e1 lg:block">
            {/* Larguras fixas: a tabela cabe ao lado do menu a partir de `lg` e o nome longo trunca. */}
            <table className="w-full min-w-[760px] table-fixed border-collapse text-[13px]">
              <colgroup>
                <col className="w-[25%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[15%]" />
                <col className="w-[16%]" />
                <col className="w-10" />
              </colgroup>
              <thead>
                <tr className="text-left">
                  {['Cliente e contrato', 'Prazo', 'Deslocamento', 'Vigência', 'Situação', 'No prazo · 30 d', ''].map((h, i) => (
                    <th key={i} scope="col" className="lbl h-9 overflow-hidden border-b border-line-strong bg-surface-2 px-3.5 text-ellipsis whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((c) => {
                  const s = situacao(c, hoje)
                  return (
                    <tr
                      key={c.id}
                      onClick={abrir ? () => abrir(c) : undefined}
                      className={cn('border-b border-line transition-colors last:border-b-0', abrir && 'cursor-pointer hover:bg-cyan-soft/35', !c.ativo && 'text-ink-3')}
                    >
                      <td className="px-3.5 py-3">
                        <p className={cn('truncate font-semibold', c.ativo ? 'text-ink' : 'text-ink-2')}>{c.cliente_nome}</p>
                        <p className="truncate text-[12px] text-ink-3">{c.nome}</p>
                      </td>
                      <td className="px-3.5 py-3">
                        <span className="flex flex-col items-start gap-1">
                          <span className="num whitespace-nowrap text-ink">{c.prazo_chegada_min ? `até ${c.prazo_chegada_min} min` : <span className="text-ink-3">Sem prazo</span>}</span>
                          <Selo tom={PRIORIDADES[c.prioridade].tom}>{PRIORIDADES[c.prioridade].rotulo}</Selo>
                        </span>
                      </td>
                      <td className="px-3.5 text-[12.5px] leading-snug text-ink-2 tabular-nums">
                        {c.valor_km == null && c.taxa_minima == null ? (
                          <span className="text-ink-3">Padrão da central</span>
                        ) : (
                          <>
                            {c.valor_km != null && <span className="block whitespace-nowrap">{moeda(c.valor_km)}/km</span>}
                            {c.taxa_minima != null && <span className="block whitespace-nowrap text-ink-3">mín. {moeda(c.taxa_minima)}</span>}
                          </>
                        )}
                      </td>
                      <td className="px-3.5 text-[12.5px] leading-snug text-ink-2 tabular-nums">{textoVigencia(c)}</td>
                      <td className="px-3.5">
                        <Selo tom={s.tom} ponto>
                          {s.rotulo}
                        </Selo>
                      </td>
                      <td className="px-3.5">
                        <IndicadorPrazo c={c} compacto />
                      </td>
                      <td className="px-2 text-right">
                        {abrir && (
                          <span aria-hidden className="inline-flex size-8 items-center justify-center rounded-md text-ink-3">
                            <ChevronRight className="size-4" />
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {podeConfigurar && (
        <ModalContrato
          contrato={editando === 'novo' ? null : editando}
          aberto={editando !== null}
          aoFechar={() => setEditando(null)}
          contratos={todos}
        />
      )}
    </div>
  )
}

/* ── peças da lista ─────────────────────────────────────────────────────── */

function CartaoContrato({ c, hoje, aoAbrir }: { c: ContratoListado; hoje: string; aoAbrir?: (c: ContratoListado) => void }) {
  const s = situacao(c, hoje)
  const Elemento = aoAbrir ? 'button' : 'div'
  return (
    <Elemento
      {...(aoAbrir ? { type: 'button' as const, onClick: () => aoAbrir(c) } : {})}
      className={cn(
        'aresta relative flex w-full flex-col gap-3 overflow-hidden rounded-lg border border-line bg-surface p-4 text-left shadow-e1',
        aoAbrir && 'transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-e2 active:translate-y-px',
      )}
    >
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px]', c.ativo ? 'bg-accent' : 'bg-line-strong')} />
      <div className="flex min-w-0 items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn('line-clamp-2 text-[14.5px] leading-snug font-semibold', c.ativo ? 'text-ink' : 'text-ink-2')}>{c.cliente_nome}</p>
          <p className="truncate text-[12.5px] text-ink-3">{c.nome}</p>
        </div>
        <Selo tom={s.tom} ponto className="shrink-0">
          {s.rotulo}
        </Selo>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <div className="min-w-0">
          <dt className="text-[11.5px] text-ink-3">Prazo de chegada</dt>
          <dd className="num text-[13.5px] font-semibold text-ink">{c.prazo_chegada_min ? `até ${c.prazo_chegada_min} min` : 'Sem prazo'}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11.5px] text-ink-3">Prioridade mínima</dt>
          <dd className="mt-0.5">
            <Selo tom={PRIORIDADES[c.prioridade].tom}>{PRIORIDADES[c.prioridade].rotulo}</Selo>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11.5px] text-ink-3">Deslocamento</dt>
          <dd className="text-[12.5px] leading-snug text-ink-2 tabular-nums">{textoDeslocamento(c)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11.5px] text-ink-3">Vigência</dt>
          <dd className="text-[12.5px] leading-snug text-ink-2 tabular-nums">{textoVigencia(c)}</dd>
        </div>
      </dl>
      <div className="border-t border-line pt-3">
        <IndicadorPrazo c={c} />
      </div>
    </Elemento>
  )
}

/** "No prazo (30 dias) X de Y" com a barra — verde ≥ 90%, âmbar ≥ 70%, vermelho abaixo. */
function IndicadorPrazo({ c, compacto }: { c: ContratoListado; compacto?: boolean }) {
  const de = Number(c.com_chegada_30d ?? 0)
  const no = Number(c.no_prazo_30d ?? 0)
  const chamados = Number(c.chamados_30d ?? 0)
  if (!c.prazo_chegada_min) {
    return <p className="text-[12px] text-ink-3">{chamados ? `${chamados} SOS em 30 dias · sem prazo a cumprir` : 'Sem prazo a cumprir'}</p>
  }
  if (!de) {
    return <p className="text-[12px] text-ink-3">{chamados ? `${chamados} SOS em 30 dias, nenhuma chegada ainda` : 'Nenhum SOS nos últimos 30 dias'}</p>
  }
  const pct = Math.round((no / de) * 100)
  const cor = pct >= 90 ? 'bg-ok' : pct >= 70 ? 'bg-warn' : 'bg-crit'
  const tinta = pct >= 90 ? 'text-ok-ink' : pct >= 70 ? 'text-warn-ink' : 'text-crit-ink'
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="min-w-0 truncate text-ink-2">
          {compacto ? '' : 'No prazo (30 dias): '}
          <b className="num text-ink">{no}</b> de <b className="num text-ink">{de}</b>
        </span>
        <span className={cn('num shrink-0 font-semibold', tinta)}>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${pct}% das chegadas no prazo`}>
        <div className={cn('h-full rounded-full', cor)} style={{ width: `${Math.max(pct, 3)}%` }} />
      </div>
    </div>
  )
}

/* ── cadastro ───────────────────────────────────────────────────────────── */

interface FormContrato {
  cliente: { id: string; nome: string } | null
  nome: string
  prazo_chegada_min: string
  prioridade: PrioridadeSOS
  valor_km: string
  taxa_minima: string
  vigencia_inicio: string
  vigencia_fim: string
  ativo: boolean
  observacoes: string
}

const VAZIO: FormContrato = {
  cliente: null,
  nome: '',
  prazo_chegada_min: '',
  prioridade: 'alta',
  valor_km: '',
  taxa_minima: '',
  vigencia_inicio: '',
  vigencia_fim: '',
  ativo: true,
  observacoes: '',
}

function valorCampo(n: number | null): string {
  return n == null ? '' : n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function ModalContrato({
  contrato,
  aberto,
  aoFechar,
  contratos,
}: {
  contrato: ContratoListado | null
  aberto: boolean
  aoFechar: () => void
  contratos: ContratoListado[]
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const config = useConfigSOS()
  const [f, setF] = useState<FormContrato>(VAZIO)
  const [tentou, setTentou] = useState(false)

  useEffect(() => {
    if (!aberto) return
    setTentou(false)
    setF(
      contrato
        ? {
            cliente: { id: contrato.cliente_id, nome: contrato.cliente_nome },
            nome: contrato.nome,
            prazo_chegada_min: contrato.prazo_chegada_min ? String(contrato.prazo_chegada_min) : '',
            prioridade: contrato.prioridade,
            valor_km: valorCampo(contrato.valor_km),
            taxa_minima: valorCampo(contrato.taxa_minima),
            vigencia_inicio: contrato.vigencia_inicio ?? '',
            vigencia_fim: contrato.vigencia_fim ?? '',
            ativo: contrato.ativo,
            observacoes: contrato.observacoes ?? '',
          }
        : VAZIO,
    )
  }, [aberto, contrato])

  const mudar = <K extends keyof FormContrato>(k: K, v: FormContrato[K]) => setF((x) => ({ ...x, [k]: v }))

  // Um contrato ativo por cliente: a regra é do banco, o aviso vem antes.
  const conflito = f.cliente && f.ativo ? contratos.find((c) => c.cliente_id === f.cliente!.id && c.ativo && c.id !== contrato?.id) : undefined

  const erros = useMemo(() => {
    const e: Partial<Record<keyof FormContrato, string>> = {}
    if (!f.cliente) e.cliente = 'Escolha o cliente.'
    else if (conflito) e.cliente = `Este cliente já tem o contrato ativo “${conflito.nome}”. Encerre-o antes.`
    if (!f.nome.trim()) e.nome = 'Dê um nome ao contrato.'
    if (f.prazo_chegada_min.trim()) {
      const p = Number(f.prazo_chegada_min)
      if (!Number.isInteger(p) || p < 5 || p > 1440) e.prazo_chegada_min = 'Minutos inteiros, de 5 a 1440.'
    }
    const km = lerNumero(f.valor_km)
    if (f.valor_km.trim() && (km == null || km < 0 || km > 1000)) e.valor_km = 'Valor inválido.'
    const min = lerNumero(f.taxa_minima)
    if (f.taxa_minima.trim() && (min == null || min < 0 || min > 100_000)) e.taxa_minima = 'Valor inválido.'
    if (f.vigencia_inicio && f.vigencia_fim && f.vigencia_fim < f.vigencia_inicio) e.vigencia_fim = 'O fim vem depois do início.'
    return e
  }, [f, conflito])
  const valido = Object.keys(erros).length === 0
  const mostrar = (k: keyof FormContrato) => (tentou || (k === 'cliente' && !!conflito) ? erros[k] : undefined)

  const salvar = useMutation({
    mutationFn: () =>
      sosSalvarContrato({
        ...(contrato ? { id: contrato.id } : {}),
        cliente_id: f.cliente!.id,
        nome: f.nome.trim(),
        prazo_chegada_min: f.prazo_chegada_min.trim() ? Number(f.prazo_chegada_min) : null,
        prioridade: f.prioridade,
        valor_km: lerNumero(f.valor_km),
        taxa_minima: lerNumero(f.taxa_minima),
        vigencia_inicio: f.vigencia_inicio || null,
        vigencia_fim: f.vigencia_fim || null,
        ativo: f.ativo,
        observacoes: f.observacoes.trim() || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CHAVE_CONTRATOS })
      toast.ok(contrato ? 'Contrato atualizado' : 'Contrato cadastrado', 'Vale para os próximos SOS deste cliente.')
      aoFechar()
    },
    onError: (e) => toast.erro('Não foi possível salvar o contrato', mensagemErro(e)),
  })

  const padraoKm = config.data?.deslocamento_valor_km
  const padraoMin = config.data?.deslocamento_taxa_minima

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      largura="lg"
      titulo={contrato ? 'Editar contrato' : 'Novo contrato'}
      descricao="Prazo de chegada, prioridade e preço de deslocamento próprios do cliente. Vale para os SOS abertos daqui em diante."
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar} disabled={salvar.isPending}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            carregando={salvar.isPending}
            onClick={() => {
              setTentou(true)
              if (valido) salvar.mutate()
            }}
          >
            {contrato ? 'Salvar' : 'Cadastrar contrato'}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SeletorCliente valor={f.cliente} aoMudar={(c) => mudar('cliente', c)} erro={mostrar('cliente')} />

        <Campo rotulo="Nome do contrato" obrigatorio erro={mostrar('nome')} dica="Como a central reconhece o acordo. Ex.: Frota Sul — plantão 24 h.">
          {(p) => <Entrada {...p} value={f.nome} maxLength={120} onChange={(e) => mudar('nome', e.target.value)} placeholder="Ex.: Transportes Andrade — 2026" />}
        </Campo>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Prazo de chegada (min)" erro={mostrar('prazo_chegada_min')} dica="Do pedido até o mecânico no local. Vazio = sem prazo.">
            {(p) => (
              <Entrada
                {...p}
                inputMode="numeric"
                value={f.prazo_chegada_min}
                onChange={(e) => mudar('prazo_chegada_min', e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="60"
                iconeInicio={<Timer />}
                mono
              />
            )}
          </Campo>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="lbl">Prioridade mínima</span>
            <Segmentado<PrioridadeSOS>
              rotuloGrupo="Prioridade mínima"
              valor={f.prioridade}
              onChange={(v) => mudar('prioridade', v)}
              className="[&>button]:min-h-11 lg:[&>button]:min-h-9"
              opcoes={(['normal', 'alta', 'emergencia'] as const).map((v) => ({ valor: v, rotulo: PRIORIDADES[v].rotulo }))}
            />
            <p className="text-[11.5px] text-ink-3">O SOS deste cliente nasce pelo menos com esta prioridade.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo
            rotulo="Valor por km (R$)"
            erro={mostrar('valor_km')}
            dica={padraoKm != null ? `Vazio = padrão da central (${moeda(padraoKm)}/km).` : 'Vazio = padrão da central.'}
          >
            {(p) => <Entrada {...p} inputMode="decimal" value={f.valor_km} onChange={(e) => mudar('valor_km', e.target.value)} placeholder="0,00" mono />}
          </Campo>
          <Campo
            rotulo="Taxa mínima (R$)"
            erro={mostrar('taxa_minima')}
            dica={padraoMin != null ? `Vazio = padrão da central (${moeda(padraoMin)}).` : 'Vazio = padrão da central.'}
          >
            {(p) => <Entrada {...p} inputMode="decimal" value={f.taxa_minima} onChange={(e) => mudar('taxa_minima', e.target.value)} placeholder="0,00" mono />}
          </Campo>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Campo rotulo="Início da vigência" dica="Vazio = já vale.">
            {(p) => <Entrada {...p} type="date" value={f.vigencia_inicio} onChange={(e) => mudar('vigencia_inicio', e.target.value)} mono />}
          </Campo>
          <Campo rotulo="Fim da vigência" erro={mostrar('vigencia_fim')} dica="Vazio = sem data para acabar.">
            {(p) => <Entrada {...p} type="date" value={f.vigencia_fim} min={f.vigencia_inicio || undefined} onChange={(e) => mudar('vigencia_fim', e.target.value)} mono />}
          </Campo>
        </div>

        <LinhaAlternador
          rotulo="Contrato ativo"
          texto="Desligado, o contrato fica no histórico e os próximos SOS do cliente seguem as regras gerais."
          ativo={f.ativo}
          onChange={(v) => mudar('ativo', v)}
          icone={<Power />}
        />

        <Campo rotulo="Observações" dica="Combinados que a central precisa lembrar (contato do gestor da frota, horários, exceções).">
          {(p) => <AreaTexto {...p} rows={3} maxLength={1000} value={f.observacoes} onChange={(e) => mudar('observacoes', e.target.value)} />}
        </Campo>
      </div>
    </Modal>
  )
}

/** Cliente do cadastro do Checklist — busca por nome, documento ou placa. */
function SeletorCliente({
  valor,
  aoMudar,
  erro,
}: {
  valor: { id: string; nome: string } | null
  aoMudar: (c: { id: string; nome: string } | null) => void
  erro?: string
}) {
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')

  useEffect(() => {
    const t = window.setTimeout(() => setTermo(busca.trim()), 300)
    return () => window.clearTimeout(t)
  }, [busca])

  const clientes = useQuery({
    queryKey: ['sos', 'busca-cliente', termo],
    enabled: !valor && termo.length >= 2,
    staleTime: 30_000,
    queryFn: () => sosBuscarCliente(termo),
  })

  if (valor) {
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="lbl flex items-center gap-1">
          Cliente <span className="text-accent" aria-hidden>*</span>
        </span>
        <div className={cn('flex min-h-12 items-center gap-3 rounded-lg border bg-surface-2/60 px-3.5 py-2', erro ? 'border-crit' : 'border-line')}>
          <UserRound aria-hidden className="size-4 shrink-0 text-ink-3" />
          <span className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-snug font-semibold text-ink">{valor.nome}</span>
          <Botao
            tamanho="sm"
            variante="fantasma"
            onClick={() => {
              setBusca('')
              aoMudar(null)
            }}
            className="shrink-0 max-lg:h-11"
          >
            Trocar
          </Botao>
        </div>
        {erro && <p className="text-[11.5px] font-medium text-crit-ink" role="alert">{erro}</p>}
      </div>
    )
  }

  return (
    <Campo rotulo="Cliente" obrigatorio erro={erro} dica="Busque por nome, CPF/CNPJ ou placa.">
      {(p) => (
        <div className="flex flex-col gap-2">
          <Entrada {...p} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, CPF/CNPJ ou placa" iconeInicio={<Search />} autoComplete="off" />
          {termo.length >= 2 && (
            <ul className="max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface">
              {clientes.isFetching && !clientes.data && (
                <li className="flex items-center gap-2 px-3.5 py-3 text-[13px] text-ink-3">
                  <Loader2 className="size-4 animate-spin" /> Buscando…
                </li>
              )}
              {clientes.isError && <li className="px-3.5 py-3 text-[13px] text-crit-ink">{mensagemErro(clientes.error)}</li>}
              {clientes.isSuccess && clientes.data.length === 0 && <li className="px-3.5 py-3 text-[13px] text-ink-3">Nenhum cliente para “{termo}”.</li>}
              {(clientes.data ?? []).map((c) => (
                <li key={c.cliente_id} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    onClick={() => aoMudar({ id: c.cliente_id, nome: c.nome })}
                    className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-2"
                  >
                    <UserRound aria-hidden className="size-4 shrink-0 text-ink-3" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{c.nome}</span>
                      <span className="num block truncate text-[11.5px] text-ink-3">
                        {[c.documento ? mascaraDocumento(c.documento) : null, c.celular ? mascaraTelefone(c.celular) : null, c.veiculos?.length ? `${c.veiculos.length} veículo${c.veiculos.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || 'Sem documento'}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Campo>
  )
}
