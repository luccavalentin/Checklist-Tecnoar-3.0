import { History } from 'lucide-react'
import { moeda } from '@/lib/formatos'
import { dataCurta } from '@/sos/rotulos'
import { useHistoricoVeiculo } from './dados'
import { linkOS } from './OrdemServico'
import { EsqueletoM, SecaoM } from './ui'

/**
 * Histórico do veículo / últimas OS na Tecnoar. Só aparece quando há o que
 * mostrar (e quando o perfil do mecânico enxerga as OS no Checklist).
 */
export function HistoricoVeiculo({ veiculoId, osAtualId }: { veiculoId: string | null | undefined; osAtualId?: string | null }) {
  const hist = useHistoricoVeiculo(veiculoId, osAtualId)
  if (!veiculoId) return null
  if (hist.isLoading) {
    return (
      <SecaoM titulo="Histórico do veículo">
        <EsqueletoM className="h-20" />
      </SecaoM>
    )
  }
  const lista = hist.data ?? []
  if (!lista.length) return null
  return (
    <SecaoM titulo="Histórico do veículo · últimas OS">
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-surface">
        {lista.map((o) => (
          <li key={o.id}>
            <a href={linkOS(o.id)} target="_blank" rel="noreferrer" className="flex items-start gap-3 px-3.5 py-3 active:bg-surface-2">
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
                <History className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="num text-[14.5px] font-bold text-ink">OS {o.numero}</span>
                  {o.valor_total != null && <span className="num shrink-0 text-[13px] font-semibold text-ink-2">{moeda(o.valor_total)}</span>}
                </span>
                <span className="num block text-[12.5px] text-ink-3">
                  {dataCurta(o.encerrada_em ?? o.aberta_em)}
                  {o.km ? ` · ${o.km.toLocaleString('pt-BR')} km` : ''}
                </span>
                {(o.diagnostico || o.problema_alegado) && (
                  <span className="mt-0.5 line-clamp-2 block text-[13.5px] leading-snug text-ink-2">{o.diagnostico || o.problema_alegado}</span>
                )}
              </span>
            </a>
          </li>
        ))}
      </ul>
      <p className="px-1 text-[12px] text-ink-3">Toque numa OS para abrir no sistema Tecnoar.</p>
    </SecaoM>
  )
}
