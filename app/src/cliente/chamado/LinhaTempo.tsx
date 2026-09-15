import { Check, CircleSlash } from 'lucide-react'
import { cn } from '@/lib/utils'
import { horaCurta, ordemStatus } from '@/sos/rotulos'
import type { ChamadoSOS, StatusSOS } from '@/sos/tipos'

type Chamado = Pick<
  ChamadoSOS,
  'status' | 'created_at' | 'recebido_em' | 'aceito_em' | 'a_caminho_em' | 'chegou_em' | 'iniciado_em' | 'finalizado_em' | 'cancelado_em'
>

const ETAPAS: Array<{ status: StatusSOS; rotulo: string; andamento: string; hora: (c: Chamado) => string | null }> = [
  { status: 'solicitado', rotulo: 'Pedido enviado', andamento: 'Enviando o pedido…', hora: (c) => c.created_at },
  { status: 'recebido', rotulo: 'Recebido pela Tecnoar', andamento: 'Chegando à Tecnoar…', hora: (c) => c.recebido_em },
  { status: 'aceito', rotulo: 'Mecânico encontrado', andamento: 'Procurando o mecânico mais próximo…', hora: (c) => c.aceito_em },
  { status: 'a_caminho', rotulo: 'A caminho', andamento: 'Mecânico se preparando para sair…', hora: (c) => c.a_caminho_em },
  { status: 'no_local', rotulo: 'Chegou ao local', andamento: 'Chegando ao local…', hora: (c) => c.chegou_em },
  { status: 'servico_iniciado', rotulo: 'Serviço iniciado', andamento: 'Mecânico avaliando o veículo…', hora: (c) => c.iniciado_em },
  { status: 'servico_finalizado', rotulo: 'Serviço finalizado', andamento: 'Serviço em andamento…', hora: (c) => c.finalizado_em },
]

/**
 * Linha do tempo do socorro, na linguagem do cliente: pedido enviado,
 * recebido, mecânico encontrado, a caminho, chegou, serviço iniciado,
 * finalizado. A próxima etapa aparece "em andamento" — a pessoa sabe o que
 * está acontecendo agora, não só o que já passou.
 */
export function LinhaTempoCliente({ chamado: c }: { chamado: Chamado }) {
  const cancelado = c.status === 'cancelado'
  // "procurando_mecanico" fica entre recebido e aceito.
  const atual = ordemStatus(c.status === 'concluido' ? 'servico_finalizado' : c.status)
  const feito = (s: StatusSOS) => !cancelado && ordemStatus(s) <= atual
  const proxima = cancelado ? null : (ETAPAS.find((e) => !feito(e.status)) ?? null)
  // Cancelado: só o que chegou a acontecer, e o cancelamento no fim.
  const visiveis = cancelado ? ETAPAS.filter((e) => !!e.hora(c)) : ETAPAS

  return (
    <ol className="flex flex-col" aria-label="Andamento do socorro">
      {visiveis.map((e, i) => {
        const ok = cancelado ? true : feito(e.status)
        const agora = !cancelado && proxima?.status === e.status
        const ultimo = i === visiveis.length - 1 && !cancelado
        return (
          <li key={e.status} className="relative flex gap-3 pb-4 last:pb-0" aria-current={agora ? 'step' : undefined}>
            {!ultimo && (
              <span aria-hidden className={cn('absolute top-6 bottom-0 left-[11px] w-0.5 rounded-full', ok ? 'bg-ok' : 'bg-line')} />
            )}
            <span
              className={cn(
                'relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                ok ? 'border-ok bg-ok text-white' : agora ? 'border-accent bg-surface' : 'border-line-strong bg-surface',
              )}
            >
              {ok ? <Check className="size-3.5" strokeWidth={3} /> : agora ? <span className="sos-piscar size-2 rounded-full bg-accent" /> : null}
            </span>
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 pt-0.5">
              <p className={cn('text-[14.5px] leading-snug', ok ? 'font-semibold text-ink' : agora ? 'font-semibold text-accent-ink' : 'text-ink-3')}>
                {agora ? e.andamento : e.rotulo}
              </p>
              {ok && <time className="num shrink-0 text-[12px] text-ink-3">{horaCurta(e.hora(c))}</time>}
            </div>
          </li>
        )
      })}
      {cancelado && (
        <li className="relative flex gap-3">
          <span className="relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-full bg-ink-3 text-white">
            <CircleSlash className="size-3.5" />
          </span>
          <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3 pt-0.5">
            <p className="text-[14.5px] font-semibold text-ink">Cancelado</p>
            <time className="num shrink-0 text-[12px] text-ink-3">{horaCurta(c.cancelado_em)}</time>
          </div>
        </li>
      )}
    </ol>
  )
}
