import { forwardRef, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CircleCheckBig, CircleX, Hourglass, RefreshCw, Send } from 'lucide-react'
import { cn } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { sosEnviarOrcamento } from '@/sos/api'
import { horaCurta } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { DetalheChamado } from '@/sos/tipos'
import { totaisItens, useOnline } from './dados'
import { AreaM, BotaoM, RotuloM, SeloM } from './ui'

/** Situação do orçamento em uma frase — a linha da lista de tarefas usa isto. */
export function resumoOrcamento(d: DetalheChamado): { texto: string; estado: 'feito' | 'pendente' | 'aviso' | 'livre' } {
  const c = d.chamado
  const total = totaisItens(d.itens).total
  const status = c.orcamento_status ?? null
  const mudou = !!c.orcamento_desatualizado || (status === 'pendente' && c.orcamento_valor != null && Math.abs(Number(c.orcamento_valor) - total) > 0.009)
  if (status && mudou) return { texto: 'Itens mudaram — pedir nova aprovação', estado: 'aviso' }
  if (status === 'aprovado') return { texto: `Aprovado · ${moeda(c.orcamento_valor)}`, estado: 'feito' }
  if (status === 'pendente') return { texto: `Aguardando o cliente · ${moeda(c.orcamento_valor)}`, estado: 'aviso' }
  if (status === 'recusado') return { texto: 'Recusado pelo cliente', estado: 'aviso' }
  return { texto: d.itens.length ? `Pronto para enviar · ${moeda(total)}` : 'Lance produtos e serviços primeiro', estado: 'pendente' }
}

/**
 * Orçamento para o cliente aprovar (assina no app dele). Total dos itens
 * lançados (a taxa de deslocamento entra sozinha na chegada), observação
 * opcional e o estado ao vivo: o tempo real recarrega o chamado quando o
 * cliente responde. Algo novo durante o serviço? Lança o item e reenvia —
 * é a nova solicitação de aprovação.
 *
 * `aviso`: o banco recusou o "iniciar serviço" porque falta a aprovação.
 * `travado`: a chegada ainda está guardada no aparelho (sem sinal); o banco
 * só aceita orçamento com o mecânico no local.
 */
export const CartaoOrcamento = forwardRef<HTMLElement, { d: DetalheChamado; aviso?: string | null; travado?: boolean }>(function CartaoOrcamento(
  { d, aviso, travado },
  ref,
) {
  const qc = useQueryClient()
  const toast = useToast()
  const online = useOnline()
  const c = d.chamado
  const [obs, setObs] = useState('')
  const [reenviar, setReenviar] = useState(false)

  const { produtos, servicos, total } = totaisItens(d.itens)
  const deslocamento = d.itens.filter((i) => i.origem === 'deslocamento').reduce((s, i) => s + Number(i.valor_total ?? 0), 0)
  const status = c.orcamento_status ?? null
  const mudou = !!c.orcamento_desatualizado || (status === 'pendente' && c.orcamento_valor != null && Math.abs(Number(c.orcamento_valor) - total) > 0.009)

  const enviar = useMutation({
    mutationFn: () => sosEnviarOrcamento(c.id, obs.trim() || null),
    onSuccess: (novo) => {
      qc.setQueryData<DetalheChamado>(CHAVES_SOS.detalhe(c.id), (x) => (x ? { ...x, chamado: { ...x.chamado, ...novo } } : x))
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(c.id) })
      setObs('')
      setReenviar(false)
      toast.ok('Enviado para aprovação', 'O cliente recebe um aviso para ver os itens e assinar.')
    },
    onError: (e) => toast.erro('Orçamento não enviado', (e as Error).message),
  })

  const semItens = d.itens.length === 0
  const podeEnviar = online && !travado && !semItens
  const mostrarFormulario = !status || reenviar

  return (
    <section ref={ref} className={cn('flex scroll-mt-24 flex-col gap-4', aviso && 'rounded-[1.25rem] ring-2 ring-crit/50 ring-offset-4 ring-offset-canvas')}>
      {aviso && (
        <div className="flex items-start gap-2.5 rounded-2xl bg-crit-soft px-3.5 py-3 text-[14px] leading-snug font-semibold text-crit-ink" role="alert">
          <AlertTriangle className="mt-0.5 size-[18px] shrink-0" />
          <span>{aviso}</span>
        </div>
      )}

      <div className="rounded-[1.25rem] border border-line bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <RotuloM>Total do orçamento</RotuloM>
          {status && <SeloOrcamento status={status} />}
        </div>
        <p className="num mt-1.5 text-[36px] leading-none font-semibold tracking-tight text-ink">{moeda(total)}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[13.5px]">
          <div className="rounded-xl bg-surface-2 px-3 py-2">
            <dt className="text-ink-3">Produtos</dt>
            <dd className="num font-semibold text-ink">{moeda(produtos)}</dd>
          </div>
          <div className="rounded-xl bg-surface-2 px-3 py-2">
            <dt className="text-ink-3">Serviços</dt>
            <dd className="num font-semibold text-ink">{moeda(servicos)}</dd>
          </div>
        </dl>
        {deslocamento > 0 && (
          <p className="mt-2 text-[12.5px] text-ink-3">
            Inclui deslocamento de <span className="num">{moeda(deslocamento)}</span>
          </p>
        )}
      </div>

      {status === 'pendente' && !reenviar && (
        <Estado tom="espera" icone={Hourglass} titulo="Aguardando o cliente aprovar">
          Enviado às {horaCurta(c.orcamento_enviado_em)} · {moeda(c.orcamento_valor)}. A tela muda sozinha com a resposta.
        </Estado>
      )}
      {status === 'aprovado' && !reenviar && (
        <Estado tom="ok" icone={CircleCheckBig} titulo={`Aprovado às ${horaCurta(c.orcamento_respondido_em)}`}>
          {moeda(c.orcamento_valor)} com a assinatura do cliente{c.orcamento_observacao ? ` · “${c.orcamento_observacao}”` : '.'}
        </Estado>
      )}
      {status === 'recusado' && !reenviar && (
        <Estado tom="erro" icone={CircleX} titulo={`Recusado às ${horaCurta(c.orcamento_respondido_em)}`}>
          {c.orcamento_observacao ? `“${c.orcamento_observacao}”` : 'O cliente não deixou observação.'} Ajuste os itens e envie de novo, ou ligue para o cliente.
        </Estado>
      )}

      {status && mudou && !reenviar && (
        <div className="flex flex-col gap-1.5 rounded-2xl border border-warn/40 bg-warn-soft px-3.5 py-3">
          <p className="flex items-start gap-2 text-[14.5px] leading-snug font-bold text-warn-ink">
            <RefreshCw className="mt-0.5 size-4 shrink-0" /> Itens mudaram — peça nova aprovação
          </p>
          <p className="text-[13.5px] leading-snug text-ink-2">
            O cliente {status === 'pendente' ? 'está vendo' : 'respondeu'} o valor de {moeda(c.orcamento_valor)}. O total agora é {moeda(total)}.
          </p>
        </div>
      )}

      {mostrarFormulario ? (
        <div className="flex flex-col gap-3">
          <AreaM
            rotulo="Observação para o cliente (opcional)"
            placeholder="Ex.: peça original, garantia de 90 dias."
            value={obs}
            onChange={(e) => setObs(e.target.value)}
            maxLength={500}
            rows={2}
            className="[&_textarea]:min-h-20"
          />
          <BotaoM variante="laranja" tamanho="xxl" largo icone={Send} carregando={enviar.isPending} disabled={!podeEnviar} onClick={() => enviar.mutate()}>
            {status ? 'Enviar nova aprovação' : 'Enviar para aprovação'}
          </BotaoM>
          {reenviar && (
            <BotaoM variante="fantasma" tamanho="md" largo onClick={() => setReenviar(false)}>
              Cancelar
            </BotaoM>
          )}
          <Dica semItens={semItens} online={online} travado={travado} />
        </div>
      ) : status === 'aprovado' && !mudou ? null : (
        <BotaoM variante={mudou || status === 'recusado' ? 'laranja' : 'neutro'} tamanho="xl" largo icone={RefreshCw} onClick={() => setReenviar(true)}>
          {mudou ? 'Pedir nova aprovação' : status === 'recusado' ? 'Enviar novo orçamento' : 'Reenviar orçamento'}
        </BotaoM>
      )}
    </section>
  )
})

function Dica({ semItens, online, travado }: { semItens: boolean; online: boolean; travado?: boolean }) {
  const texto = travado
    ? 'Sua chegada ainda está guardada no aparelho. O orçamento libera quando ela for enviada.'
    : !online
      ? 'Sem internet: o orçamento precisa de sinal para chegar ao cliente.'
      : semItens
        ? 'Lance ao menos um serviço ou produto para montar o orçamento.'
        : null
  if (!texto) return null
  return <p className={cn('text-center text-[13px] font-medium', semItens && online && !travado ? 'text-ink-3' : 'text-warn-ink')}>{texto}</p>
}

function SeloOrcamento({ status }: { status: 'pendente' | 'aprovado' | 'recusado' }) {
  if (status === 'aprovado') return <SeloM tom="ok">Aprovado</SeloM>
  if (status === 'recusado') return <SeloM tom="vermelho">Recusado</SeloM>
  return <SeloM tom="ambar">Aguardando</SeloM>
}

function Estado({ tom, icone: Icone, titulo, children }: { tom: 'espera' | 'ok' | 'erro'; icone: typeof Hourglass; titulo: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl px-3.5 py-3',
        tom === 'espera' && 'bg-cyan-soft text-cyan-ink',
        tom === 'ok' && 'bg-ok-soft text-ok-ink',
        tom === 'erro' && 'bg-crit-soft text-crit-ink',
      )}
      role="status"
    >
      <span className="relative mt-0.5 shrink-0">
        {tom === 'espera' && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-current opacity-25" />}
        <Icone className="relative size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[15px] leading-tight font-bold">{titulo}</p>
        <p className="mt-1 text-[13.5px] leading-snug text-ink-2">{children}</p>
      </div>
    </div>
  )
}
