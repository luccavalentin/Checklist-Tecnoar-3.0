import { useEffect, useRef } from 'react'
import { ChevronRight, FileDown, Loader2, Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/componentes/ui/Toast'
import { useLaudoSOS } from '@/sos/useLaudo'
import type { StatusSOS } from '@/sos/tipos'
import { useOnline } from '../../comum/Pwa'

/** O laudo só existe depois que o mecânico finaliza o serviço. */
export function temLaudo(status: StatusSOS | null | undefined): boolean {
  return status === 'servico_finalizado' || status === 'concluido'
}

/**
 * Laudo em PDF (horários, fotos, peças, valores, assinatura) em dois toques:
 * o primeiro monta o arquivo; o segundo abre a folha de compartilhar do
 * celular (WhatsApp, e-mail, Arquivos). O Safari do iPhone só compartilha se
 * a chamada sair direto do toque — por isso `entregar` vai no `onClick`, sem
 * nada esperando antes. No computador, o arquivo já baixa ao ficar pronto.
 *
 * `cartao`: destaque com explicação (tela do chamado); `linha`: discreto,
 * dentro de um item do histórico.
 */
export function BotaoLaudo({ chamadoId, variante = 'cartao', className }: { chamadoId: string; variante?: 'cartao' | 'linha'; className?: string }) {
  const toast = useToast()
  const online = useOnline()
  const laudo = useLaudoSOS(chamadoId)
  const anterior = useRef(laudo.estado)

  useEffect(() => {
    if (laudo.estado === 'erro' && laudo.erro) {
      toast.erro('Não foi possível gerar o laudo', !navigator.onLine ? 'Sem conexão. O laudo precisa de internet para buscar fotos e itens.' : laudo.erro)
    }
    // Sem folha de compartilhar (computador): o PDF baixou direto ao ficar pronto.
    if (anterior.current === 'preparando' && laudo.estado === 'ocioso') toast.ok('Laudo baixado', 'O PDF foi salvo no aparelho (Arquivos ou Downloads).')
    anterior.current = laudo.estado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laudo.estado, laudo.erro])

  const preparando = laudo.estado === 'preparando'
  const pronto = laudo.estado === 'pronto'
  const semRede = !online && !pronto
  const aoTocar = pronto ? laudo.entregar : () => void laudo.preparar()
  const titulo = preparando ? 'Montando o laudo…' : pronto ? 'Compartilhar laudo' : 'Baixar laudo (PDF)'

  if (variante === 'linha') {
    return (
      <button
        type="button"
        onClick={aoTocar}
        disabled={preparando || semRede}
        aria-busy={preparando || undefined}
        className={cn(
          'flex min-h-11 items-center justify-center gap-2 rounded-xl px-3.5 text-[13.5px] font-semibold transition-transform active:scale-[0.98] disabled:opacity-60',
          pronto ? 'sos-operator-action text-white' : 'sos-chip text-ink',
          className,
        )}
      >
        {preparando ? <Loader2 className="size-4 animate-spin text-accent" /> : pronto ? <Share2 className="size-4" /> : <FileDown className="size-4 text-accent" />}
        {semRede ? 'Laudo precisa de internet' : titulo}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={aoTocar}
      disabled={preparando || semRede}
      aria-busy={preparando || undefined}
      className={cn(
        'flex min-h-[4.5rem] w-full items-center gap-3.5 rounded-[1.25rem] border border-line bg-surface p-4 text-left transition-transform active:scale-[0.99] disabled:opacity-80',
        pronto && 'border-ok/40 bg-ok-soft',
        className,
      )}
    >
      <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl', pronto ? 'bg-ok text-white' : 'bg-[#0D1C33] text-white dark:bg-[#002061]')}>
        {preparando ? <Loader2 className="size-6 animate-spin" /> : pronto ? <Share2 className="size-6" /> : <FileDown className="size-6" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[15.5px] leading-tight font-bold text-ink">{titulo}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">
          {semRede
            ? 'Sem internet: o laudo precisa buscar as fotos e os itens.'
            : preparando
              ? 'Juntando fotos, itens e horários. Leva alguns segundos.'
              : pronto
                ? 'Pronto. Toque para enviar pelo WhatsApp, e-mail ou salvar.'
                : 'Horários, fotos, peças, valores e assinatura, em PDF.'}
        </span>
      </span>
      {!preparando && <ChevronRight className="size-5 shrink-0 text-ink-3" />}
    </button>
  )
}
