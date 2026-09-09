import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Car, CheckCircle2, Clock, DollarSign } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { Botao } from '@/componentes/ui/Botao'
import { Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { FluxoSaidaVeiculo } from '@/componentes/saida/FluxoSaidaVeiculo'
import type { OSListada } from '@/tipos/db'

/* ═══════════════════════════════════════════════════════════════
   KPI CARD ENTERPRISE — Design Compacto
   ═══════════════════════════════════════════════════════════════ */
function KpiSaida({ valor, rotulo, cor, icone, indice }: {
  valor: string | number; rotulo: string; cor: string; icone: React.ReactNode; indice: number
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl border border-white/5',
        'bg-gradient-to-br from-[var(--surface)] via-[var(--surface-2)] to-[var(--surface)]',
        'p-3 transition-all duration-300 ease-out',
        'hover:border-white/10 hover:shadow-xl hover:shadow-black/10',
        'hover:-translate-y-0.5',
        'before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/5 before:to-transparent before:opacity-0 before:transition-opacity before:duration-300',
        'hover:before:opacity-100'
      )}
      style={{
        animationDelay: `${indice * 80}ms`,
        animation: 'fadeInUp 0.5s ease-out forwards',
        opacity: 0,
      }}
    >
      {/* Glow effect */}
      <div
        className="absolute -right-4 -top-4 h-16 w-16 rounded-full blur-2xl transition-all duration-500 group-hover:scale-125 group-hover:opacity-50"
        style={{ background: cor, opacity: 0.12 }}
      />

      {/* Content */}
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--ink-3)]">{rotulo}</span>
          <span className="font-mono text-xl font-bold tracking-tight text-[var(--ink)] transition-transform duration-200 group-hover:scale-105">
            {valor}
          </span>
        </div>

        {/* Icon container */}
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-all duration-300 group-hover:scale-105"
          style={{
            background: `linear-gradient(135deg, ${cor}20, ${cor}8)`,
            boxShadow: `0 0 16px ${cor}25`,
          }}
        >
          <div style={{ color: cor }} className="scale-110">
            {icone}
          </div>
        </div>
      </div>

      {/* Bottom progress bar */}
      <div className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-[var(--line)]/20">
        <div
          className="h-full rounded-full transition-all duration-500 group-hover:w-full"
          style={{
            width: '35%',
            background: `linear-gradient(90deg, ${cor}, ${cor}60, transparent)`,
          }}
        />
      </div>
    </div>
  )
}

/**
 * Saída do Pátio.
 *
 * É o último ato do atendimento: conferir se o que precisava ser feito foi
 * feito, acertar o dinheiro e liberar o veículo.
 */
export function SaidaPatio() {
  const { pode } = usePermissoes()
  const [osSelecionada, setOsSelecionada] = useState<string | null>(null)
  const [fluxoAberto, setFluxoAberto] = useState(false)

  const podeVer = pode('ordens_servico', 'visualizar')

  /* OSs prontas para sair: encerradas ou não, mas ainda no pátio. */
  const fila = useQuery({
    queryKey: ['os-para-saida'],
    enabled: podeVer,
    queryFn: async (): Promise<OSListada[]> => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select(
          'id, numero, tipo, km, valor_total, valor_pago, aberta_em, encerrada_em, saida_em, situacao, ' +
            'cliente:clientes ( id, nome_razao ), veiculo:veiculos ( id, placa, descricao ), ' +
            'status:status_os ( id, nome, cor, categoria )',
        )
        .is('saida_em', null)
        .eq('situacao', 'ativo')
        .order('aberta_em')
      if (error) throw error
      return (data ?? []) as unknown as OSListada[]
    },
  })

  const colunas: Array<Coluna<OSListada>> = [
    {
      chave: 'numero',
      cabecalho: 'OS',
      largura: '90px',
      celula: (o) => <span className="num text-ink">{String(o.numero).padStart(5, '0')}</span>,
    },
    {
      chave: 'veiculo',
      cabecalho: 'Placa',
      largura: '120px',
      celula: (o) => <span className="num font-medium text-ink">{o.veiculo?.placa ?? '—'}</span>,
    },
    { chave: 'cliente', cabecalho: 'Cliente', celula: (o) => o.cliente?.nome_razao ?? '—' },
    {
      chave: 'status',
      cabecalho: 'Situação',
      largura: '150px',
      celula: (o) =>
        o.encerrada_em ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft/50 px-2 py-0.5 text-[11px] font-medium text-ok-ink">
            <span className="size-1.5 rounded-full bg-ok" />
            Encerrada
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft/50 px-2 py-0.5 text-[11px] font-medium text-warn-ink">
            <span className="size-1.5 rounded-full bg-warn" />
            {o.status?.nome ?? 'Em aberto'}
          </span>
        ),
    },
    {
      chave: 'valor',
      cabecalho: 'Total',
      largura: '120px',
      alinhamento: 'direita',
      celula: (o) => <span className="num text-ink">{moeda(Number(o.valor_total))}</span>,
    },
    {
      chave: 'saldo',
      cabecalho: 'Saldo',
      largura: '120px',
      alinhamento: 'direita',
      celula: (o) => {
        const s = Number(o.valor_total) - Number(o.valor_pago ?? 0)
        return (
          <span className={cn('num', s > 0.005 ? 'font-medium text-accent-ink' : 'text-ink-3')}>
            {moeda(Math.max(s, 0))}
          </span>
        )
      },
    },
    {
      chave: 'acao',
      cabecalho: '',
      largura: '100px',
      celula: (o) => (
        <Botao
          variante="secundario"
          tamanho="sm"
          onClick={(e) => {
            e.stopPropagation()
            setOsSelecionada(o.id)
            setFluxoAberto(true)
          }}
        >
          Liberar
        </Botao>
      ),
    },
  ]

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-accent" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Operação</p>
        </div>
        <h1 className="font-display text-xl font-bold text-ink">Saída do Pátio</h1>
        <EstadoSemPermissao />
      </div>
    )
  }

  const stats = fila.data ? {
    total: fila.data.length,
    encerradas: fila.data.filter(o => o.encerrada_em).length,
    emAberto: fila.data.filter(o => !o.encerrada_em).length,
    valorTotal: fila.data.reduce((acc, o) => acc + Number(o.valor_total || 0), 0),
  } : null

  return (
    <div className="flex flex-col gap-5">
      {/* Header Premium */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 rounded-full bg-accent" />
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Operação</p>
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink">Saída do Pátio</h1>
          <p className="text-[13px] text-ink-2">Fechamento da OS, recibo do cliente e liberação do veículo</p>
        </div>
      </div>

      {/* Cards de Estatísticas Operacionais */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <KpiSaida
            indice={0} valor={stats.total} rotulo="Na Fila" cor="#F97316" icone={<Car className="size-4" />}
          />
          <KpiSaida
            indice={1} valor={stats.encerradas} rotulo="Encerradas" cor="#22C55E" icone={<CheckCircle2 className="size-4" />}
          />
          <KpiSaida
            indice={2} valor={stats.emAberto} rotulo="Em Aberto" cor="#EAB308" icone={<Clock className="size-4" />}
          />
          <KpiSaida
            indice={3} valor={moeda(stats.valorTotal)} rotulo="Valor Total" cor="#06B6D4" icone={<DollarSign className="size-4" />}
          />
        </div>
      )}

      <Painel semPadding>
        <CabecalhoPainel
          titulo="Veículos no pátio"
          descricao="Ordens ainda sem saída registrada. Selecione uma para iniciar o fluxo de liberação."
          acao={
            fila.isSuccess ? (
              <span className="num text-[12px] text-ink-3">{fila.data.length} na fila</span>
            ) : undefined
          }
        />
        <Tabela
          className="rounded-none"
          colunas={colunas}
          linhas={fila.data ?? []}
          chaveDe={(o) => o.id}
          estado={fila.isLoading ? 'carregando' : fila.isError ? 'erro' : 'ok'}
          aoClicarLinha={(o) => {
            setOsSelecionada(o.id)
            setFluxoAberto(true)
          }}
          mensagemVazio={{
            titulo: 'Nenhum veículo aguardando saída',
            descricao: 'Toda ordem ativa já teve a saída registrada.',
          }}
          mensagemErro={{
            descricao: mensagemErro(fila.error),
            aoTentarNovamente: () => void fila.refetch(),
          }}
        />
      </Painel>

      {/* Modal do fluxo sequencial */}
      <Modal
        aberto={fluxoAberto}
        aoFechar={() => {
          setFluxoAberto(false)
          setOsSelecionada(null)
        }}
        titulo="Liberar Saída"
        largura="lg"
      >
        {osSelecionada && (
          <FluxoSaidaVeiculo
            osId={osSelecionada}
            aoFechar={() => {
              setFluxoAberto(false)
              setOsSelecionada(null)
            }}
            aoConcluir={() => {
              setFluxoAberto(false)
              setOsSelecionada(null)
              void fila.refetch()
            }}
          />
        )}
      </Modal>
    </div>
  )
}
