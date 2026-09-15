import { AlertTriangle, CloudOff, Loader2, RotateCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { horaCurta } from '@/sos/rotulos'
import { useOnline } from './dados'
import { descartarAcao, processarFila, rotuloAcao, tentarDeNovo, useFila } from './filaOffline'

/**
 * O que está guardado no aparelho esperando sinal — dito com todas as
 * letras, para o mecânico não refazer (nem achar que perdeu) o que já fez.
 * Ação recusada pelo servidor aparece à parte, em vermelho, com o motivo.
 *
 * Sem `chamadoId`, mostra a fila inteira (painel).
 */
export function FaixaFila({ chamadoId, escuro, className }: { chamadoId?: string; escuro?: boolean; className?: string }) {
  const { acoes: todas, emVoo } = useFila()
  const online = useOnline()
  const acoes = chamadoId ? todas.filter((a) => a.chamadoId === chamadoId) : todas
  const aguardando = acoes.filter((a) => !a.erro)
  const paradas = acoes.filter((a) => a.erro)

  // Só o envio do toque em andamento: quem mostra é o próprio botão.
  const soOToque = aguardando.length === 1 && aguardando[0].id === emVoo
  if (!paradas.length && (!aguardando.length || soOToque)) return null

  const n = aguardando.length
  const enviando = !!emVoo && online
  const base = 'rounded-2xl px-3.5 py-3 text-[13.5px] leading-snug shadow-e2'

  return (
    <div className={cn('flex flex-col gap-2', className)} role="status" aria-live="polite">
      {paradas.map((a) => (
        <div key={a.id} className={cn(base, escuro ? 'bg-[#3d0f12]/95 text-[#ffb3ae]' : 'bg-crit-soft text-crit-ink')}>
          <p className="flex items-start gap-2 font-bold">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>Não enviado: {rotuloAcao(a)}</span>
          </p>
          <p className={cn('mt-1 pl-6 text-[13px] font-medium', escuro ? 'text-[#ffd6d3]' : 'text-ink-2')}>{a.erro}</p>
          <div className="mt-2 flex flex-wrap gap-2 pl-6">
            <button
              type="button"
              onClick={() => tentarDeNovo(a.id)}
              disabled={!online}
              className={cn(
                'flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-[13.5px] font-bold disabled:opacity-50',
                escuro ? 'bg-white/12 text-white' : 'bg-surface text-ink shadow-e1',
              )}
            >
              <RotateCw className="size-4" /> Tentar de novo
            </button>
            <button
              type="button"
              onClick={() => descartarAcao(a.id)}
              className={cn('flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-[13.5px] font-semibold', escuro ? 'text-white/75' : 'text-ink-2')}
            >
              <Trash2 className="size-4" /> Descartar
            </button>
          </div>
        </div>
      ))}

      {n > 0 && !soOToque && (
        <div className={cn(base, escuro ? 'bg-[#3a2a06]/95 text-[#ffd27a]' : 'bg-warn-soft text-warn-ink')}>
          <div className="flex items-start gap-2.5">
            {enviando ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" /> : <CloudOff className="mt-0.5 size-4 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="font-bold">
                {enviando
                  ? `Enviando ${n === 1 ? '1 ação guardada' : `${n} ações guardadas`}…`
                  : `${n} ${n === 1 ? 'ação aguardando' : 'ações aguardando'} sinal — ${n === 1 ? 'envia sozinha' : 'enviam sozinhas'} quando voltar a internet.`}
              </p>
              <ul className={cn('mt-1 flex flex-col gap-0.5 text-[12.5px] font-medium', escuro ? 'text-[#ffe7b3]' : 'text-ink-2')}>
                {aguardando.slice(0, 3).map((a) => (
                  <li key={a.id} className="truncate">
                    <span className="num">{horaCurta(a.criadaEm)}</span> · {rotuloAcao(a)}
                  </li>
                ))}
                {n > 3 && <li>e mais {n - 3}</li>}
              </ul>
            </div>
          </div>
          {online && !emVoo && (
            <button
              type="button"
              onClick={() => void processarFila()}
              className={cn(
                'mt-2 ml-6 flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-[13.5px] font-bold',
                escuro ? 'bg-white/12 text-white' : 'bg-surface text-ink shadow-e1',
              )}
            >
              <RotateCw className="size-4" /> Enviar agora
            </button>
          )}
        </div>
      )}
    </div>
  )
}
