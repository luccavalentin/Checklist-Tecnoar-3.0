import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import {
  Bell,
  ChevronRight,
  Settings2,
  Users,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import { data as fmtData, mascaraDocumento, moeda, numeroBR } from '@/lib/formatos'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade } from '@/componentes/ui/Secao'
import { PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'
import { Metrica, GradeMetricas } from '@/componentes/ui/Metrica'
import { Cliente360 } from './crm/Cliente360'
import type { ClienteRelacionamento, IndicadoresCRM } from '@/tipos/db'

const SELECT_LISTA =
  'id, codigo, nome_razao, nome_fantasia, documento, celular, telefone, email, municipio, uf, situacao, ' +
  'ultimo_atendimento, dias_sem_atendimento, total_os, valor_os, total_vendas, valor_vendas, ' +
  'total_interacoes, ultima_interacao, proximo_follow_up, follow_ups_abertos'

type Faixa = '' | 'f1' | 'f2' | 'f3' | 'sem'

/* ═══════════════════════════════════════════════════════════════
   LINHA DE CLIENTE
   ═══════════════════════════════════════════════════════════════ */
function ClienteRow({
  cliente,
  f1, f2, f3,
  onClick,
}: {
  cliente: ClienteRelacionamento
  f1: number
  f2: number
  f3: number
  onClick: () => void
}) {
  const d = cliente.dias_sem_atendimento ?? 0
  const tomInat = cliente.ultimo_atendimento === null
    ? 'neutro'
    : d >= f3 ? 'critico' : d >= f2 ? 'atencao' : d >= f1 ? 'destaque' : 'ok'

  const badgeClasse = tomInat === 'critico' ? 'bg-red-500'
    : tomInat === 'atencao' ? 'bg-amber-500'
    : tomInat === 'destaque' ? 'bg-accent'
    : tomInat === 'ok' ? 'bg-emerald-500'
    : 'bg-ink-3'

  return (
    <button
      onClick={onClick}
      className="entrada-suave group flex w-full flex-col gap-3 border-b border-line/50 p-4 text-left transition-colors hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4 sm:p-3.5 sm:py-3.5"
    >
      {/* Indicador de status */}
      <div className={cn(
        'h-2.5 w-2.5 shrink-0 rounded-full',
        badgeClasse,
        tomInat !== 'neutro' && tomInat !== 'ok' && 'shadow-lg',
        tomInat === 'critico' && 'shadow-red-500/30',
        tomInat === 'atencao' && 'shadow-amber-500/30',
        tomInat === 'destaque' && 'shadow-accent/30',
      )} />

      {/* Cliente */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-[14px] font-medium text-ink sm:text-[13.5px]">{cliente.nome_razao}</p>
        <p className="truncate text-[12px] text-ink-3 sm:text-[11.5px]">
          {[cliente.documento ? mascaraDocumento(cliente.documento) : null, [cliente.municipio, cliente.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>

      {/* Mobile: Informações compactas */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 sm:hidden">
        <span className="num text-[12px] text-ink-2">{cliente.celular || cliente.telefone || '—'}</span>
        <span className="text-[11px] text-ink-3">{numeroBR(cliente.total_os, 0)} OS · {moeda(Number(cliente.valor_os) + Number(cliente.valor_vendas))}</span>
        {cliente.ultimo_atendimento === null ? (
          <Selo tom="neutro">Nunca</Selo>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-ink">{fmtData(cliente.ultimo_atendimento)}</span>
            <Selo tom={tomInat} ponto>{d}d</Selo>
          </div>
        )}
      </div>

      {/* Contato - Tablet+ */}
      <div className="hidden w-32 flex-shrink-0 flex-col gap-0.5 lg:flex xl:w-36">
        <span className="num truncate text-[12.5px] text-ink-2">{cliente.celular || cliente.telefone || '—'}</span>
        <span className="truncate text-[11px] text-ink-3">{cliente.email || ''}</span>
      </div>

      {/* Histórico - Tablet+ */}
      <div className="hidden w-24 flex-shrink-0 flex-col gap-0.5 md:flex lg:w-28">
        <span className="num text-[12px] text-ink-2 lg:text-[12.5px]">{numeroBR(cliente.total_os, 0)} OS · {numeroBR(cliente.total_vendas, 0)} vendas</span>
        <span className="text-[11px] text-ink-3">{moeda(Number(cliente.valor_os) + Number(cliente.valor_vendas))}</span>
      </div>

      {/* Atendimento - Tablet+ */}
      <div className="hidden w-36 flex-shrink-0 md:block">
        {cliente.ultimo_atendimento === null ? (
          <Selo tom="neutro">Nunca</Selo>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-[12.5px] text-ink">{fmtData(cliente.ultimo_atendimento)}</span>
            <Selo tom={tomInat} ponto>{d}d</Selo>
          </div>
        )}
      </div>

      {/* Follow-ups */}
      {cliente.follow_ups_abertos > 0 && (
        <div className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5">
          <Bell className="size-3 text-amber-500" />
          <span className="text-[10px] font-medium text-amber-500">{cliente.follow_ups_abertos}</span>
        </div>
      )}

      {/* Seta */}
      <ChevronRight className="hidden size-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-accent sm:block" />
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════ */
export function CRM() {
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const ctrl = useControleListagem(25)
  const [faixa, setFaixa] = useState<Faixa>('')
  const [uf, setUf] = useState('')
  const [aberto, setAberto] = useState<ClienteRelacionamento | null>(null)
  const [configurando, setConfigurando] = useState(false)

  const podeVer = pode('crm', 'visualizar')
  const podeConfigurar = pode('crm', 'editar')

  const indicadores = useQuery({
    queryKey: ['crm-indicadores'],
    enabled: podeVer,
    queryFn: async (): Promise<IndicadoresCRM | null> => {
      const { data, error } = await supabase.rpc('indicadores_crm')
      if (error) throw error
      return (data ?? [])[0] ?? null
    },
  })

  const ind = indicadores.data
  const f1 = ind?.faixa1_dias ?? 90
  const f2 = ind?.faixa2_dias ?? 180
  const f3 = ind?.faixa3_dias ?? 365

  const filtrar = useMemo(
    () => (q: Consulta) => {
      const t = termoBusca(ctrl.busca)
      let r = q
      if (t.length >= 2) {
        r = r.or(`nome_razao.ilike.%${t}%,nome_fantasia.ilike.%${t}%,documento.ilike.%${t}%,email.ilike.%${t}%`)
      }
      if (uf) r = r.eq('uf', uf)
      if (faixa === 'sem') r = r.is('ultimo_atendimento', null)
      if (faixa === 'f1') r = r.gte('dias_sem_atendimento', f1).lt('dias_sem_atendimento', f2)
      if (faixa === 'f2') r = r.gte('dias_sem_atendimento', f2).lt('dias_sem_atendimento', f3)
      if (faixa === 'f3') r = r.gte('dias_sem_atendimento', f3)
      return r
    },
    [ctrl.busca, uf, faixa, f1, f2, f3],
  )

  const lista = useListagem<ClienteRelacionamento>({
    chave: ['crm', 'lista', ctrl.busca, uf, faixa, f1, f2, f3, ctrl.pagina, ctrl.porPagina],
    tabela: 'vw_clientes_relacionamento',
    select: SELECT_LISTA,
    filtrar,
    ordenacao: { coluna: 'nome_razao', ascendente: true },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
    habilitado: podeVer,
  })

  const [faixas, setFaixas] = useState<[string, string, string]>(['90', '180', '365'])

  const salvarFaixas = useMutation({
    mutationFn: async () => {
      const nums = faixas.map((v) => Number(v))
      if (nums.some((n) => !Number.isFinite(n) || n < 1)) {
        throw new Error('Informe três períodos em dias.')
      }
      if (!(nums[0] < nums[1] && nums[1] < nums[2])) {
        throw new Error('Os períodos precisam ser crescentes.')
      }
      const { error } = await supabase
        .from('parametros')
        .update({ valor: nums, updated_at: new Date().toISOString() })
        .eq('chave', 'crm_faixas_inatividade')
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Períodos atualizados')
      setConfigurando(false)
      void qc.invalidateQueries({ queryKey: ['crm-indicadores'] })
      void qc.invalidateQueries({ queryKey: ['crm'] })
    },
    onError: (e) => toast.erro('Não foi possível salvar', mensagemErro(e)),
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-accent" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Relacionamento</p>
        </div>
        <h1 className="font-display text-xl font-bold text-ink">CRM</h1>
        <EstadoSemPermissao />
      </div>
    )
  }

  const rotuloFaixa: Record<Exclude<Faixa, ''>, string> = {
    sem: 'Nunca atendidos',
    f1: `${f1} a ${f2 - 1} dias`,
    f2: `${f2} a ${f3 - 1} dias`,
    f3: `${f3} dias ou mais`,
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 sm:h-11 sm:w-11">
            <Users className="size-5 text-accent" />
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Relacionamento</p>
            <h1 className="font-display text-lg font-bold text-ink sm:text-xl">CRM</h1>
          </div>
        </div>
        {podeConfigurar && (
          <Botao variante="neutro" tamanho="sm" className="gap-1.5 self-start sm:self-auto" onClick={() => setConfigurando(true)}>
            <Settings2 className="size-3.5" />
            Períodos
          </Botao>
        )}
      </div>

      {/* Métricas */}
      <GradeMetricas colunas={5}>
        <Metrica
          rotulo="Ativos"
          valor={numeroBR(ind?.clientes_ativos, 0)}
          tom="cyan"
          ativo={faixa === ''}
          onClick={() => { setFaixa(''); ctrl.reiniciar() }}
        />
        <Metrica
          rotulo="Nunca at."
          valor={numeroBR(ind?.sem_historico, 0)}
          tom="neutro"
          ativo={faixa === 'sem'}
          onClick={() => { setFaixa('sem'); ctrl.reiniciar() }}
        />
        <Metrica
          rotulo={`${f1}+d`}
          valor={numeroBR(ind?.faixa1, 0)}
          tom="accent"
          ativo={faixa === 'f1'}
          onClick={() => { setFaixa('f1'); ctrl.reiniciar() }}
        />
        <Metrica
          rotulo={`${f2}+d`}
          valor={numeroBR(ind?.faixa2, 0)}
          tom="atencao"
          ativo={faixa === 'f2'}
          onClick={() => { setFaixa('f2'); ctrl.reiniciar() }}
        />
        <Metrica
          rotulo={`${f3}+d`}
          valor={numeroBR(ind?.faixa3, 0)}
          tom="critico"
          ativo={faixa === 'f3'}
          onClick={() => { setFaixa('f3'); ctrl.reiniciar() }}
        />
      </GradeMetricas>

      {/* Follow-ups warning */}
      {ind && (ind.follow_ups_atrasados > 0 || ind.follow_ups_abertos > 0) && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10">
            <Bell className="size-4 text-amber-500" />
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-medium text-amber-400">{ind.follow_ups_abertos} follow-up(s) em aberto</p>
            {ind.follow_ups_atrasados > 0 && <p className="text-[11px] text-amber-500/80">{ind.follow_ups_atrasados} vencido(s)</p>}
          </div>
        </div>
      )}

      {/* Busca e Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1">
          <input
            type="text"
            value={ctrl.busca}
            onChange={(e) => ctrl.setBusca(e.target.value)}
            placeholder="Buscar cliente..."
            className="h-10 w-full rounded-lg border border-line-strong bg-surface pl-10 pr-4 text-[13.5px] text-ink placeholder:text-ink-3 transition-colors focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/20"
          />
          <svg className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Selecao
            value={faixa}
            onChange={(e) => { setFaixa(e.target.value as Faixa); ctrl.reiniciar() }}
            className="h-10 min-w-[140px] flex-1 text-[12px] sm:flex-none"
          >
            <option value="">Todas inatividade</option>
            <option value="sem">Nunca atendidos</option>
            <option value="f1">{rotuloFaixa.f1}</option>
            <option value="f2">{rotuloFaixa.f2}</option>
            <option value="f3">{rotuloFaixa.f3}</option>
          </Selecao>
          <Entrada
            value={uf}
            maxLength={2}
            onChange={(e) => { setUf(e.target.value.toUpperCase()); ctrl.reiniciar() }}
            placeholder="UF"
            className="h-10 w-14 text-[12px] flex-none"
          />
          {(faixa || uf) && (
            <Botao variante="fantasma" tamanho="sm" onClick={() => { setFaixa(''); setUf(''); ctrl.reiniciar() }}>
              Limpar
            </Botao>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="overflow-hidden rounded-xl border border-line shadow-sm">
        {/* Header da tabela - desktop only */}
        <div className="hidden items-center gap-4 border-b border-line bg-surface-2 px-4 py-3 sm:flex">
          <div className="h-2.5 w-2.5" /> {/* Espaçador do indicador */}
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">Cliente</span>
          </div>
          <div className="hidden w-32 lg:block xl:w-36">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">Contato</span>
          </div>
          <div className="hidden w-24 lg:w-28 md:block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">Histórico</span>
          </div>
          <div className="hidden w-36 md:block">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">Último atendimento</span>
          </div>
        </div>

        {/* Loading */}
        {lista.estado === 'carregando' && (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent/30 border-t-accent" />
          </div>
        )}

        {/* Vazia */}
        {lista.estado === 'ok' && lista.linhas.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16">
            <Users className="size-10 text-ink-3" />
            <p className="text-[13px] text-ink-3">{ctrl.busca ? 'Nenhum resultado encontrado' : 'Nenhum cliente'}</p>
          </div>
        )}

        {/* Linhas */}
        {lista.estado === 'ok' && lista.linhas.map((c) => (
          <ClienteRow
            key={c.id}
            cliente={c}
            f1={f1}
            f2={f2}
            f3={f3}
            onClick={() => setAberto(c)}
          />
        ))}
      </div>

      {/* Paginação */}
      {lista.total !== null && lista.total > ctrl.porPagina && (
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-ink-3">{lista.total.toLocaleString('pt-BR')} clientes</p>
          <div className="flex items-center gap-1">
            <Botao variante="fantasma" tamanho="sm" disabled={ctrl.pagina === 1} onClick={() => ctrl.setPagina(ctrl.pagina - 1)}>Anterior</Botao>
            <span className="px-3 text-[12px] text-ink-2">Página {ctrl.pagina}</span>
            <Botao variante="fantasma" tamanho="sm" disabled={ctrl.pagina >= Math.ceil(lista.total / ctrl.porPagina)} onClick={() => ctrl.setPagina(ctrl.pagina + 1)}>Próxima</Botao>
          </div>
        </div>
      )}

      {/* Painel Cliente */}
      {aberto && (
        <Cliente360 clienteId={aberto.id} nome={aberto.nome_razao} aoFechar={() => setAberto(null)} />
      )}

      {/* Configuração */}
      <PainelLateral
        aberto={configurando}
        aoFechar={() => setConfigurando(false)}
        largura="sm"
        titulo="Períodos de inatividade"
        descricao="Define em quantos dias sem atendimento um cliente entra em cada faixa."
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setConfigurando(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={salvarFaixas.isPending} onClick={() => salvarFaixas.mutate()}>Salvar</Botao>
          </>
        }
      >
        <Grade>
          {(['1ª faixa', '2ª faixa', '3ª faixa'] as const).map((rotulo, i) => (
            <Campo key={rotulo} className="sm:col-span-4" rotulo={`${rotulo} (dias)`}>
              {(p) => (
                <Entrada {...p} type="number" min="1" value={faixas[i]} onChange={(e) => {
                  const v = [...faixas] as [string, string, string]
                  v[i] = e.target.value
                  setFaixas(v)
                }} />
              )}
            </Campo>
          ))}
        </Grade>
      </PainelLateral>
    </div>
  )
}
