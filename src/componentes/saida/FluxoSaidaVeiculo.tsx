import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  Download,
  FileText,
  Hash,
  Landmark,
  Printer,
  ReceiptText,
  SplitSquareHorizontal,
  Wallet,
  Wrench,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro } from '@/lib/utils'
import { moeda, paraNumero } from '@/lib/formatos'
import { Confirmacao } from '@/componentes/ui/Sobreposicoes'
import { EstadoCarregando, EstadoVazio } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'
import type { FormaPagamento } from '@/tipos/db'

const FORMAS: Array<{ valor: FormaPagamento; rotulo: string; icone: React.ReactNode }> = [
  { valor: 'dinheiro', rotulo: 'Dinheiro', icone: <Wallet className="size-4" /> },
  { valor: 'pix', rotulo: 'PIX', icone: <SplitSquareHorizontal className="size-4" /> },
  { valor: 'debito', rotulo: 'Debito', icone: <CreditCard className="size-4" /> },
  { valor: 'credito', rotulo: 'Credito', icone: <CreditCard className="size-4" /> },
  { valor: 'transferencia', rotulo: 'Transferencia', icone: <Landmark className="size-4" /> },
  { valor: 'boleto', rotulo: 'Boleto', icone: <FileText className="size-4" /> },
  { valor: 'faturado', rotulo: 'Faturado', icone: <ReceiptText className="size-4" /> },
  { valor: 'outro', rotulo: 'Outro', icone: <Hash className="size-4" /> },
]

interface SituacaoSaida {
  os_id: string
  numero: number
  valor_total: number
  valor_pago: number
  saldo: number
  checklist_entrada_id: string | null
  checklist_entrada_ok: boolean
  checklist_saida_id: string | null
  checklist_saida_ok: boolean
  itens_pendentes: number
  ja_saiu: boolean
}

interface FluxoSaidaVeiculoProps {
  osId: string
  aoFechar: () => void
  aoConcluir: () => void
}

/** Formato da OS nesta tela — as relações embutidas não vêm dos tipos gerados. */
interface OSParaSaida {
  id: string
  numero: number
  tipo: string
  km: number | null
  valor_total: number
  valor_pago: number
  aberta_em: string
  encerrada_em: string | null
  cliente: { id: string; nome_razao: string; telefone: string | null; documento: string | null } | null
  veiculo: { id: string; placa: string; descricao: string | null; marca: string | null; modelo: string | null; ano: number | null } | null
  status: { id: string; nome: string; cor: string | null; categoria: string } | null
}

export function FluxoSaidaVeiculo({ osId, aoFechar, aoConcluir }: FluxoSaidaVeiculoProps) {
  const toast = useToast()
  const [etapa, setEtapa] = useState(0)
  const [confirmando, setConfirmando] = useState(false)
  const [recibo, setRecibo] = useState<{ osId: string; numero: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const [f, setF] = useState({
    forma: 'dinheiro' as FormaPagamento,
    valor_pago: '',
    faturar: false,
    parcelas: '1',
    primeiro_vencimento: '',
    intervalo: '30',
    condicao: '',
    observacao: '',
  })

  const { data: os } = useQuery({
    queryKey: ['os-detalhes-saida', osId],
    queryFn: async (): Promise<OSParaSaida> => {
      const { data, error } = await supabase
        .from('ordens_servico')
        .select(`
          id, numero, tipo, km, valor_total, valor_pago, aberta_em, encerrada_em,
          cliente:clientes ( id, nome_razao, telefone, documento ),
          veiculo:veiculos ( id, placa, descricao, marca, modelo, ano ),
          status:status_os ( id, nome, cor, categoria )
        `)
        .eq('id', osId)
        .single()
      if (error) throw error
      return data as unknown as OSParaSaida
    },
  })

  const situacao = useQuery({
    queryKey: ['situacao-saida', osId],
    queryFn: async (): Promise<SituacaoSaida | null> => {
      const { data, error } = await supabase.rpc('situacao_para_saida', { p_os: osId })
      if (error) throw error
      return (data as unknown as SituacaoSaida[])?.[0] ?? null
    },
  })

  const s = situacao.data
  const total = Number(s?.valor_total ?? 0)
  const pagoDigitado = f.valor_pago.trim() === '' ? Number(s?.valor_pago ?? 0) : (paraNumero(f.valor_pago) ?? 0)
  const saldo = total - pagoDigitado

  useEffect(() => {
    if (!s) return
    setF((atual) => ({
      ...atual,
      valor_pago: s.valor_pago ? String(s.valor_pago).replace('.', ',') : '',
      faturar: false,
    }))
    setErro(null)
  }, [s])

  const pendencias = useMemo(() => {
    if (!s) return []
    const lista: string[] = []
    if (s.itens_pendentes > 0) lista.push(`${s.itens_pendentes} item(ns) aguardando aprovacao`)
    if (!s.checklist_entrada_ok) lista.push('Checklist entrada nao concluido')
    if (!s.checklist_saida_ok) lista.push('Checklist saida nao concluido')
    if (saldo > 0.005 && !f.faturar) lista.push(`Saldo de ${moeda(saldo)} em aberto`)
    return lista
  }, [s, saldo, f.faturar])

  const impedimentos = useMemo(() => {
    if (!s) return []
    const lista: string[] = []
    if (s.itens_pendentes > 0) lista.push('itens pendentes')
    if (saldo > 0.005 && !f.faturar) lista.push('saldo em aberto')
    return lista
  }, [s, saldo, f.faturar])

  const podeAvancar = useMemo(() => {
    return impedimentos.length === 0 || saldo <= 0.005 || f.faturar
  }, [impedimentos, saldo, f.faturar])

  const liberar = useMutation({
    mutationFn: async () => {
      setErro(null)
      const { data, error } = await supabase.rpc('registrar_saida_patio', {
        p_os: osId,
        p_forma: f.forma,
        p_valor_pago: pagoDigitado,
        p_faturar: f.faturar && saldo > 0.005,
        p_parcelas: f.faturar ? Number(f.parcelas) : null,
        p_primeiro_vencimento: f.primeiro_vencimento || null,
        p_intervalo_dias: Number(f.intervalo) || 30,
        p_condicao: f.condicao.trim() || null,
        p_observacao: f.observacao.trim() || null,
      })
      if (error) throw error
      return (data as unknown as Array<{ recibo: number; fatura_id: string | null; garantias_criadas: number }>)?.[0]
    },
    onSuccess: (r) => {
      setConfirmando(false)
      toast.ok(`Veiculo liberado - recibo ${String(r?.recibo ?? 0).padStart(5, '0')}`)
      setRecibo({ osId, numero: r?.recibo ?? 0 })
      setEtapa(2)
    },
    onError: (e) => {
      setConfirmando(false)
      setErro(mensagemErro(e))
    },
  })

  if (situacao.isLoading) return <EstadoCarregando rotulo="Carregando..." />
  if (!s) return <EstadoVazio titulo="Ordem nao encontrada" />

  const ETAPAS = ['Conferir', 'Pagamento', 'Finalizar']

  return (
    <div className="space-y-4">
      {/* Barra de progresso */}
      <div className="flex items-center justify-center gap-2 border-b border-line pb-3">
        {ETAPAS.map((label, i) => (
          <div key={label} className="flex items-center">
            <button
              onClick={() => i < etapa && setEtapa(i)}
              disabled={i >= etapa}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-medium transition-all',
                i === etapa && 'bg-accent text-white',
                i < etapa && 'bg-ok/20 text-ok-ink hover:bg-ok/30',
                i > etapa && 'text-ink-3',
              )}
            >
              <span className={cn(
                'flex size-5 items-center justify-center rounded-full text-[10px] font-bold',
                i === etapa && 'bg-white/20 text-white',
                i < etapa && 'bg-ok text-white',
                i > etapa && 'bg-surface-2 text-ink-3',
              )}>
                {i < etapa ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              {label}
            </button>
            {i < 2 && <ChevronRight className="mx-1 size-4 text-ink-3" />}
          </div>
        ))}
      </div>

      {/* Info da OS */}
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 p-3">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-accent/10">
            <ReceiptText className="size-4 text-accent" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-display text-[14px] font-semibold text-ink">
                OS {String(os?.numero ?? '').padStart(5, '0')}
              </span>
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium',
                os?.encerrada_em ? 'bg-ok-soft/50 text-ok-ink' : 'bg-warn-soft/50 text-warn-ink',
              )}>
                {os?.encerrada_em ? 'Encerrada' : os?.status?.nome ?? 'Em aberto'}
              </span>
            </div>
            <span className="text-[10px] text-ink-3">
              {os?.veiculo?.placa} - {os?.cliente?.nome_razao}
            </span>
          </div>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-ink-3">Total</span>
          <p className="num text-[16px] font-bold text-ink">{moeda(total)}</p>
        </div>
      </div>

      {/* Erro */}
      {erro && (
        <div className="flex items-center gap-2 rounded-lg border border-crit/30 bg-crit-soft/20 p-2 text-[12px] text-crit-ink">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{erro}</span>
        </div>
      )}

      {/* ETAPA 0: CONFERIR */}
      {etapa === 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <div className={cn('rounded-lg border p-2 text-center', s.checklist_entrada_ok ? 'border-ok/30 bg-ok-soft/10' : 'border-warn/30 bg-warn-soft/10')}>
              <ClipboardCheck className={cn('mx-auto mb-1', s.checklist_entrada_ok ? 'text-ok' : 'text-warn')} />
              <p className="text-[9px] font-medium text-ink-3">Entrada</p>
              <p className={cn('text-[10px] font-medium', s.checklist_entrada_ok ? 'text-ok-ink' : 'text-warn-ink')}>
                {s.checklist_entrada_ok ? 'OK' : 'Pendente'}
              </p>
            </div>
            <div className={cn('rounded-lg border p-2 text-center', s.checklist_saida_ok ? 'border-ok/30 bg-ok-soft/10' : 'border-warn/30 bg-warn-soft/10')}>
              <ClipboardCheck className={cn('mx-auto mb-1', s.checklist_saida_ok ? 'text-ok' : 'text-warn')} />
              <p className="text-[9px] font-medium text-ink-3">Saida</p>
              <p className={cn('text-[10px] font-medium', s.checklist_saida_ok ? 'text-ok-ink' : 'text-warn-ink')}>
                {s.checklist_saida_ok ? 'OK' : 'Pendente'}
              </p>
            </div>
            <div className={cn('rounded-lg border p-2 text-center', s.itens_pendentes === 0 ? 'border-ok/30 bg-ok-soft/10' : 'border-warn/30 bg-warn-soft/10')}>
              <Wrench className={cn('mx-auto mb-1', s.itens_pendentes === 0 ? 'text-ok' : 'text-warn')} />
              <p className="text-[9px] font-medium text-ink-3">Itens</p>
              <p className={cn('text-[10px] font-medium', s.itens_pendentes === 0 ? 'text-ok-ink' : 'text-warn-ink')}>
                {s.itens_pendentes === 0 ? 'OK' : s.itens_pendentes}
              </p>
            </div>
            <div className={cn('rounded-lg border p-2 text-center', saldo <= 0.005 || f.faturar ? 'border-ok/30 bg-ok-soft/10' : 'border-warn/30 bg-warn-soft/10')}>
              <CircleDollarSign className={cn('mx-auto mb-1', saldo <= 0.005 || f.faturar ? 'text-ok' : 'text-warn')} />
              <p className="text-[9px] font-medium text-ink-3">Pagamento</p>
              <p className={cn('text-[10px] font-medium', saldo <= 0.005 || f.faturar ? 'text-ok-ink' : 'text-warn-ink')}>
                {saldo <= 0.005 ? 'OK' : moeda(saldo)}
              </p>
            </div>
          </div>

          {pendencias.length > 0 && (
            <div className={cn('rounded-lg border p-3', impedimentos.length > 0 ? 'border-crit/30 bg-crit-soft/20' : 'border-warn/30 bg-warn-soft/20')}>
              <p className={cn('mb-2 text-[11px] font-medium', impedimentos.length > 0 ? 'text-crit-ink' : 'text-warn-ink')}>
                {impedimentos.length > 0 ? 'Saida bloqueada' : 'Pendencias'}
              </p>
              <ul className="space-y-1 text-[11px] text-ink-3">
                {pendencias.map((p) => <li key={p}>- {p}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ETAPA 1: PAGAMENTO */}
      {etapa === 1 && (
        <div className="space-y-3">
          {/* Forma de pagamento */}
          <div>
            <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-ink-3">Forma de pagamento</label>
            <div className="grid grid-cols-3 gap-1.5">
              {FORMAS.map((forma) => (
                <button
                  key={forma.valor}
                  onClick={() => setF({ ...f, forma: forma.valor })}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border p-2 text-[11px] transition-all',
                    f.forma === forma.valor ? 'border-accent bg-accent-soft/20 text-accent-ink' : 'border-line bg-surface text-ink-3 hover:border-ink-3',
                  )}
                >
                  {forma.icone}
                  <span className="truncate">{forma.rotulo}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Parcelamento */}
          {f.forma === 'credito' && (
            <div>
              <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-ink-3">Parcelas</label>
              <div className="flex gap-1">
                {[2, 3, 4, 6, 9, 12].map((n) => (
                  <button
                    key={n}
                    onClick={() => setF({ ...f, parcelas: String(n) })}
                    className={cn(
                      'flex-1 rounded-lg border py-1.5 text-[11px] font-medium transition-all',
                      f.parcelas === String(n) ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-ink-3 hover:border-ink-3',
                    )}
                  >
                    {n}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Valor */}
          <div>
            <label className="mb-2 block text-[10px] font-medium uppercase tracking-wide text-ink-3">Valor recebido</label>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                value={f.valor_pago}
                onChange={(e) => setF({ ...f, valor_pago: e.target.value })}
                placeholder="0,00"
                className="num flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-[14px] font-semibold text-ink focus:border-accent focus:outline-none"
              />
              <button
                onClick={() => setF({ ...f, valor_pago: String(total).replace('.', ','), faturar: false })}
                className="rounded-lg border border-line bg-surface-2 px-3 text-[11px] text-accent hover:bg-surface"
              >
                Total
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ETAPA 2: FINALIZAR */}
      {etapa === 2 && (
        <div className="space-y-3">
          {recibo ? (
            <>
              <div className="flex flex-col items-center rounded-lg border border-ok/30 bg-ok-soft/20 p-6 text-center">
                <CheckCircle2 className="size-10 text-ok" />
                <h3 className="mt-2 font-display text-[16px] font-semibold text-ok-ink">Saida Liberada</h3>
                <p className="text-[12px] text-ink-3">Recibo #{String(recibo.numero).padStart(5, '0')}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="flex-1 rounded-lg bg-accent py-2 text-[12px] font-medium text-white hover:bg-accent/90">
                  <Printer className="mr-1 inline size-3" /> Imprimir
                </button>
                <button onClick={() => toast.ok('Download disponivel em breve')} className="flex-1 rounded-lg border border-line bg-surface py-2 text-[12px] font-medium text-ink hover:bg-surface-2">
                  <Download className="mr-1 inline size-3" /> PDF
                </button>
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-line bg-surface-2 p-3">
              <h4 className="mb-2 text-[10px] font-medium uppercase tracking-wide text-ink-3">Resumo da liberacao</h4>
              <dl className="space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <dt className="text-ink-3">Forma</dt>
                  <dd className="font-medium text-ink">{FORMAS.find((x) => x.valor === f.forma)?.rotulo}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink-3">Valor</dt>
                  <dd className="font-medium text-ink">{moeda(pagoDigitado)}</dd>
                </div>
                {saldo > 0.005 && f.faturar && (
                  <div className="flex justify-between">
                    <dt className="text-ink-3">Faturado</dt>
                    <dd className="font-medium text-accent-ink">{moeda(saldo)} ({f.parcelas}x)</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      )}

      {/* Navegacao */}
      <div className="flex items-center justify-between border-t border-line pt-3">
        <button
          type="button"
          onClick={() => (etapa > 0 ? setEtapa(etapa - 1) : aoFechar())}
          className="flex items-center gap-1 rounded-lg px-4 py-2 text-[12px] font-medium text-ink hover:bg-surface-2"
        >
          <ChevronLeft className="size-4" /> {etapa === 0 ? 'Cancelar' : 'Voltar'}
        </button>

        {etapa < 2 && (
          <button
            onClick={() => setEtapa(etapa + 1)}
            disabled={etapa === 0 && !podeAvancar}
            className={cn(
              'flex items-center gap-1 rounded-lg px-4 py-2 text-[12px] font-medium',
              etapa === 0 && !podeAvancar ? 'bg-surface-2 text-ink-3' : 'bg-accent text-white hover:bg-accent/90',
            )}
          >
            Avancar <ChevronRight className="size-4" />
          </button>
        )}

        {etapa === 2 && !recibo && (
          <button
            onClick={() => setConfirmando(true)}
            disabled={impedimentos.length > 0}
            className={cn(
              'flex items-center gap-1 rounded-lg px-4 py-2 text-[12px] font-medium',
              impedimentos.length === 0 ? 'bg-ok text-white hover:bg-ok/90' : 'bg-surface-2 text-ink-3',
            )}
          >
            <BadgeCheck className="size-4" /> Liberar
          </button>
        )}

        {etapa === 2 && recibo && (
          <button onClick={aoConcluir} className="flex items-center gap-1 rounded-lg bg-ok px-4 py-2 text-[12px] font-medium text-white">
            <Check className="size-4" /> Concluir
          </button>
        )}
      </div>

      {/* Confirmacao */}
      <Confirmacao
        aberto={confirmando}
        aoFechar={() => setConfirmando(false)}
        aoConfirmar={() => liberar.mutate()}
        carregando={liberar.isPending}
        titulo="Liberar veiculo"
        rotuloConfirmar="Liberar"
        descricao="A OS sera encerrada e o veiculo sai do patio."
      />
    </div>
  )
}
