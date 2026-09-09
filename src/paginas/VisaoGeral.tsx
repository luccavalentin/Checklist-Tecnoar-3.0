/**
 * Tecnoar — Visão Operacional Premium
 * Design: Denso, Sofisticado, Paleta Exclusiva Tecnoar
 */
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Car,
  ChevronRight,
  CircleDollarSign,
  Gauge,
  Monitor,
  RefreshCw,
  Shield,
  Users,
  Wrench,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { BotaoIcone } from '@/componentes/ui/Botao'
import { CLASSE_COR_STATUS } from '@/paginas/cadastros/StatusOS'
import { EstadoCarregando } from '@/componentes/ui/Estados'
import type { IndicadoresGestao } from '@/tipos/db'

/* ═══════════════════════════════════════════════════════════════
   HEADER
   ═══════════════════════════════════════════════════════════════ */
function Header({
  nome,
  periodo,
  onPeriodo,
  onRefresh,
  loading,
}: {
  nome: string
  periodo: '7d' | '30d' | '90d'
  onPeriodo: (p: '7d' | '30d' | '90d') => void
  onRefresh: () => void
  loading: boolean
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-accent" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Dashboard</p>
        </div>
        <h1 className="font-display text-xl font-bold text-ink tracking-tight">Visão Operacional</h1>
        <p className="text-[12px] text-ink-2">
          Olá, <span className="font-semibold text-accent">{nome}</span> — resumo em tempo real
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Link
          to="/operacao/modo-tv"
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-all',
            'border-accent/30 bg-accent/8 text-accent-ink',
            'hover:bg-accent/15 hover:border-accent/50'
          )}
        >
          <Monitor className="size-3.5" />
          <span className="hidden sm:inline">Modo TV</span>
          <ChevronRight className="size-2.5 opacity-60" />
        </Link>

        <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => onPeriodo(p)}
              className={cn(
                'rounded px-3 py-1 text-[10px] font-semibold transition-all',
                periodo === p ? 'bg-ink text-surface shadow-sm' : 'text-ink-2 hover:text-ink'
              )}
            >
              {p === '7d' ? '7D' : p === '30d' ? '30D' : '90D'}
            </button>
          ))}
        </div>

        {/* Botao sem texto precisa de rotulo acessivel: BotaoIcone exige um. */}
        <BotaoIcone rotulo="Atualizar indicadores" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
        </BotaoIcone>
      </div>
    </header>
  )
}

/* ═══════════════════════════════════════════════════════════════
   KPI CARD — Compacto
   ═══════════════════════════════════════════════════════════════ */
function KpiCard({
  valor,
  rotulo,
  subrotulo,
  cor,
  href,
  alerta,
  carregando,
}: {
  valor: string | number
  rotulo: string
  subrotulo?: string
  cor: string
  href: string
  alerta?: boolean
  carregando?: boolean
}) {
  return (
    <Link
      to={href}
      className={cn(
        'group relative flex flex-col justify-between rounded-xl border bg-surface p-3 transition-all duration-200 ',
        'hover:shadow-md hover:-translate-y-0.5',
        alerta ? 'border-crit/40' : 'border-line hover:border-ink/15'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-[10px] font-semibold text-ink-2">{rotulo}</p>
          <div className="mt-1">
            {carregando ? (
              <div className="h-7 w-16 animate-pulse rounded bg-surface-2" />
            ) : (
              <p
                className="font-mono text-[26px] font-bold leading-none tracking-tight"
                style={{ color: alerta ? cor : 'var(--c-ink)' }}
              >
                {valor}
              </p>
            )}
          </div>
          {subrotulo && <p className="mt-1 text-[10px] text-ink-3">{subrotulo}</p>}
        </div>

        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-transform group-hover:scale-105"
          style={{ backgroundColor: `${cor}12`, borderColor: `${cor}25`, color: cor }}
        >
          <Gauge className="size-4" />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <ArrowRight className="size-3.5 text-ink-3 transition-all group-hover:translate-x-1 group-hover:text-ink" />
        <div className="h-0.5 w-8 rounded-full transition-all group-hover:w-full" style={{ backgroundColor: cor }} />
      </div>
    </Link>
  )
}

/* ═══════════════════════════════════════════════════════════════
   PANEL
   ═══════════════════════════════════════════════════════════════ */
function Panel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={cn('rounded-xl border border-line bg-surface overflow-hidden', className)}>{children}</div>
}

function PanelHeader({
  eyebrow,
  title,
  icon,
}: {
  eyebrow: string
  title: string
  icon: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between border-b border-line/80 px-4 py-2.5">
      <div>
        <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-ink-3">{eyebrow}</p>
        <h3 className="font-display text-[13px] font-semibold text-ink">{title}</h3>
      </div>
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2 text-ink-3">
        {icon}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   BAR ITEM
   ═══════════════════════════════════════════════════════════════ */
function BarItem({
  label,
  valor,
  porcentagem,
  cor,
}: {
  label: string
  valor: number
  porcentagem: number
  /** Token de cor do status ('ciano', 'laranja'...), não um valor CSS. */
  cor: string
}) {
  const classeCor = CLASSE_COR_STATUS[cor] ?? 'bg-ink-3'
  return (
    <div className="flex items-center gap-3 py-2">
      <div className={cn('h-2 w-2 shrink-0 rounded-full', classeCor)} />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-ink">{label}</span>
      <span className="font-mono text-[11px] font-semibold text-ink">{valor}</span>
      <div className="w-16">
        <div className="h-1 overflow-hidden rounded-full bg-surface-2">
          <div className={cn('h-full rounded-full transition-all duration-500', classeCor)} style={{ width: `${porcentagem}%` }} />
        </div>
      </div>
      <span className="w-8 text-right font-mono text-[10px] text-ink-3">{porcentagem}%</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   DONUT CHART
   ═══════════════════════════════════════════════════════════════ */
function DonutChart({
  dados,
  total,
  carregando,
}: {
  dados: Array<{ label: string; valor: number; cor: string }>
  carregando: boolean
  total: number
}) {
  if (carregando) return <div className="flex h-24 items-center justify-center"><EstadoCarregando rotulo="" /></div>

  const SIZE = 100
  const STROKE = 12
  const R = (SIZE - STROKE) / 2
  const CIRC = 2 * Math.PI * R

  let offset = 0

  return (
    <div className="flex items-center gap-4 py-3">
      <div className="relative shrink-0">
        <svg width={SIZE} height={SIZE} className="-rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--c-surface-2)" strokeWidth={STROKE} />
          {dados.map((item, i) => {
            const len = (item.valor / total) * CIRC
            const circle = (
              <circle key={i} cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={item.cor} strokeWidth={STROKE}
                strokeDasharray={`${len} ${CIRC - len}`} strokeDashoffset={-offset} strokeLinecap="round"
                className="transition-all duration-700" />
            )
            offset += len
            return circle
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-lg font-bold text-ink">{total}</span>
          <span className="text-[8px] text-ink-3">total</span>
        </div>
      </div>
      <div className="flex-1 space-y-1.5">
        {dados.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.cor }} />
              <span className="text-[10px] text-ink-2">{item.label}</span>
            </div>
            <span className="font-mono text-[11px] font-semibold text-ink">{item.valor}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   STAT ROW
   ═══════════════════════════════════════════════════════════════ */
function StatRow({
  label,
  valor,
  cor,
}: {
  label: string
  valor: string | number
  cor?: string
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[11px] text-ink-2">{label}</span>
      <span className="font-mono text-[11px] font-semibold" style={cor ? { color: cor } : undefined}>
        {valor}
      </span>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   QUICK LINK
   ═══════════════════════════════════════════════════════════════ */
function QuickLink({
  to,
  icon,
  label,
  valor,
  cor,
}: {
  to: string
  icon: React.ReactNode
  label: string
  valor: number | string
  cor: string
}) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between rounded-lg border border-line bg-surface-2/50 px-3 py-2 transition-all hover:border-ink/15 hover:bg-surface "
    >
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md" style={{ color: cor }}>
          {icon}
        </div>
        <span className="text-[11px] font-medium text-ink">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] font-bold text-ink">{valor}</span>
        <ArrowRight className="size-3 text-ink-3 transition-all group-hover:translate-x-0.5" />
      </div>
    </Link>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MINI STAT
   ═══════════════════════════════════════════════════════════════ */
function MiniStat({
  label,
  valor,
  cor,
}: {
  label: string
  valor: string | number
  cor?: string
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/50 p-3">
      <span className="text-[9px] font-semibold text-ink-3">{label}</span>
      <p className="mt-0.5 font-mono text-base font-bold" style={cor ? { color: cor } : undefined}>
        {valor}
      </p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════ */
export function VisaoGeral() {
  const { usuario } = useAuth()
  const { pode } = usePermissoes()
  const [periodo, setPeriodo] = useState<'7d' | '30d' | '90d'>('30d')

  const veOperacao = pode('indicadores', 'visualizar')

  const operacao = useQuery({
    queryKey: ['visao-geral-operacao', periodo],
    enabled: veOperacao,
    queryFn: async (): Promise<IndicadoresGestao | null> => {
      const { data, error } = await supabase.rpc('indicadores_gestao', {})
      if (error) throw error
      return (data ?? [])[0] ?? null
    },
  })

  const osPorStatus = useQuery({
    queryKey: ['os-por-status'],
    enabled: veOperacao,
    queryFn: async () => {
      const { data, error } = await supabase.from('ordens_servico').select('status:status_os ( nome, cor )')
      if (error) throw error
      const contagem: Record<string, { nome: string; cor: string; count: number }> = {}
      data?.forEach((os: any) => {
        const nome = os.status?.nome ?? 'Sem status'
        const cor = os.status?.cor ?? '#6366F1'
        if (!contagem[nome]) contagem[nome] = { nome, cor, count: 0 }
        contagem[nome].count++
      })
      return Object.values(contagem)
    },
  })

  const garantiasStats = useQuery({
    queryKey: ['garantias-stats'],
    enabled: veOperacao,
    queryFn: async () => {
      const [vigentes, expiradas, acionadas] = await Promise.all([
        supabase.from('garantias').select('id', { count: 'exact', head: true }).eq('situacao', 'vigente'),
        supabase.from('garantias').select('id', { count: 'exact', head: true }).eq('situacao', 'expirada'),
        supabase.from('garantias').select('id', { count: 'exact', head: true }).eq('situacao', 'acionada'),
      ])
      return { vigentes: vigentes.count ?? 0, expiradas: expiradas.count ?? 0, acionadas: acionadas.count ?? 0 }
    },
  })

  const financeiroStats = useQuery({
    queryKey: ['financeiro-stats'],
    enabled: veOperacao,
    queryFn: async () => {
      const { data, error } = await supabase.from('ordens_servico').select('valor_total, valor_pago')
      if (error) throw error
      const total = data?.reduce((acc, os) => acc + (os.valor_total ?? 0), 0) ?? 0
      const pago = data?.reduce((acc, os) => acc + (os.valor_pago ?? 0), 0) ?? 0
      return { total, pago, receber: total - pago }
    },
  })

  const contagens = useQuery({
    queryKey: ['visao-geral-contagens'],
    queryFn: async () => {
      const [clientes, veiculos, usuarios] = await Promise.all([
        supabase.from('clientes').select('id', { count: 'exact', head: true }),
        supabase.from('veiculos').select('id', { count: 'exact', head: true }),
        supabase.from('usuarios').select('id', { count: 'exact', head: true }).eq('situacao', 'ativo'),
      ])
      return { clientes: clientes.count ?? 0, veiculos: veiculos.count ?? 0, usuarios: usuarios.count ?? 0 }
    },
  })

  const op = operacao.data
  const pendencias = op ? op.acoes_vencidas + op.follow_ups_atrasados + op.pecas_teste_vencidas : 0

  const dadosOS = useMemo(() => {
    if (!osPorStatus.data) return []
    const total = osPorStatus.data.reduce((acc, s) => acc + s.count, 0) || 1
    return osPorStatus.data.map((s) => ({ ...s, porcentagem: Math.round((s.count / total) * 100) }))
  }, [osPorStatus.data])

  const dadosGarantias = useMemo(() => {
    if (!garantiasStats.data) return []
    return [
      { label: 'Vigentes', valor: garantiasStats.data.vigentes, cor: 'var(--c-ok)' },
      { label: 'Expiradas', valor: garantiasStats.data.expiradas, cor: 'var(--c-ink-3)' },
      { label: 'Acionadas', valor: garantiasStats.data.acionadas, cor: 'var(--c-warn)' },
    ].filter(d => d.valor > 0)
  }, [garantiasStats.data])

  const totalGarantias = dadosGarantias.reduce((a, b) => a + b.valor, 0)

  const atualizar = () => {
    void contagens.refetch()
    void operacao.refetch()
    void osPorStatus.refetch()
    void garantiasStats.refetch()
    void financeiroStats.refetch()
  }

  const primeiroNome = usuario?.nome_completo?.split(' ')[0] ?? 'Usuário'
  const loading = contagens.isFetching || operacao.isFetching

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <Header nome={primeiroNome} periodo={periodo} onPeriodo={setPeriodo} onRefresh={atualizar} loading={loading} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard valor={op?.os_abertas ?? '—'} rotulo="OS Abertas" subrotulo="em aberto" cor="var(--c-accent)" href="/operacao/ordens-de-servico" carregando={operacao.isLoading} />
        <KpiCard valor={op?.veiculos_patio ?? '—'} rotulo="No Pátio" subrotulo="veículos agora" cor="var(--c-cyan)" href="/operacao/modo-tv" carregando={operacao.isLoading} />
        <KpiCard valor={pendencias} rotulo="Pendências" subrotulo="requerem atenção" cor={pendencias > 0 ? 'var(--c-crit)' : 'var(--c-ok)'} href="/gestao/indicadores" alerta={pendencias > 0} carregando={operacao.isLoading} />
        <KpiCard valor={op?.tempo_medio_horas ? `${op.tempo_medio_horas.toFixed(1)}h` : '—'} rotulo="Tempo Médio" subrotulo="por OS" cor="var(--c-ink-2)" href="/gestao/indicadores" carregando={operacao.isLoading} />
      </div>

      {/* Main Grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* OS por Status */}
        <Panel className="lg:col-span-2">
          <PanelHeader eyebrow="Status" title="Ordens de Serviço" icon={<BarChart3 className="size-3.5" />} />
          <div className="p-3">
            {osPorStatus.isLoading ? (
              <EstadoCarregando rotulo="" />
            ) : dadosOS.length === 0 ? (
              <div className="flex h-20 items-center justify-center text-[11px] text-ink-3">Nenhuma OS encontrada</div>
            ) : (
              <div className="divide-y divide-line/50">
                {dadosOS.slice(0, 6).map((item) => (
                  <BarItem key={item.nome} label={item.nome} valor={item.count} porcentagem={item.porcentagem} cor={item.cor} />
                ))}
              </div>
            )}
          </div>
        </Panel>

        {/* Garantias */}
        <Panel>
          <PanelHeader eyebrow="Garantia" title="Garantias" icon={<Shield className="size-3.5" />} />
          <div className="px-4">
            <DonutChart dados={dadosGarantias} total={totalGarantias} carregando={garantiasStats.isLoading} />
          </div>
        </Panel>
      </div>

      {/* Second Row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Financeiro */}
        <Panel>
          <PanelHeader eyebrow="Financeiro" title="Financeiro" icon={<CircleDollarSign className="size-3.5" />} />
          <div className="space-y-2 p-3">
            <div className="rounded-lg border border-line bg-surface-2 p-3">
              <span className="text-[8px] font-bold uppercase tracking-[0.15em] text-ink-3">Total Faturado</span>
              <p className="mt-0.5 font-mono text-lg font-bold text-ink">{moeda(financeiroStats.data?.total ?? 0)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Recebido" valor={moeda(financeiroStats.data?.pago ?? 0)} cor="var(--c-ok)" />
              <MiniStat label="A Receber" valor={moeda(financeiroStats.data?.receber ?? 0)} cor="var(--c-warn)" />
            </div>
          </div>
        </Panel>

        {/* Cadastros */}
        <Panel>
          <PanelHeader eyebrow="Cadastros" title="Cadastros" icon={<Users className="size-3.5" />} />
          <div className="space-y-1.5 p-3">
            <QuickLink to="/cadastros/clientes" icon={<Users className="size-3.5" />} label="Clientes" valor={contagens.data?.clientes ?? 0} cor="var(--c-cyan)" />
            <QuickLink to="/cadastros/veiculos" icon={<Car className="size-3.5" />} label="Veículos" valor={contagens.data?.veiculos ?? 0} cor="var(--c-accent)" />
            <QuickLink to="/cadastros/usuarios" icon={<Wrench className="size-3.5" />} label="Usuários" valor={contagens.data?.usuarios ?? 0} cor="var(--c-ok)" />
          </div>
        </Panel>

        {/* Status Rápido */}
        <Panel>
          <PanelHeader eyebrow="Resumo" title="Status" icon={<Activity className="size-3.5" />} />
          <div className="divide-y divide-line/50 px-4 py-2">
            <StatRow label="Aguardando peça" valor={op?.aguardando_peca ?? '—'} />
            <StatRow label="Aguardando aprovação" valor={op?.aguardando_aprovacao ?? '—'} cor="var(--c-warn)" />
            <StatRow label="Peças em teste" valor={op?.pecas_teste_abertas ?? '—'} />
            <StatRow label="Follow-ups atrasados" valor={op?.follow_ups_atrasados ?? '—'} />
          </div>
        </Panel>
      </div>
    </div>
  )
}
