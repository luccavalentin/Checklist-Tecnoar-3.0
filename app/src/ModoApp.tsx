import { ArrowLeftRight, HardHat, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSessao } from './sessao'

/**
 * Troca entre o app do mecânico e o do cliente, para quem é da equipe e
 * também usa a Tecnoar como cliente (a mesma conta, dois apps).
 *
 * Some sozinho para quem não pode trocar (cliente comum). Vai no perfil do
 * mecânico, no perfil do cliente e no cadastro de cliente.
 */
export function CartaoModoApp({ escuro, className }: { escuro?: boolean; className?: string }) {
  const { podeTrocarModo, modo, trocarModo } = useSessao()
  if (!podeTrocarModo) return null
  const paraCliente = modo === 'mecanico'
  const Icone = paraCliente ? UserRound : HardHat
  return (
    <button
      type="button"
      onClick={() => trocarModo(paraCliente ? 'cliente' : 'mecanico')}
      className={cn(
        'flex min-h-16 w-full items-center gap-3.5 rounded-[1.25rem] border px-4 py-3 text-left transition-transform active:scale-[0.99]',
        escuro ? 'border-white/12 bg-white/[0.06] text-white hover:bg-white/10' : 'border-line bg-surface text-ink hover:bg-surface-2',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex size-11 shrink-0 items-center justify-center rounded-2xl',
          paraCliente ? 'bg-[#fff1e6] text-[#b84b00]' : 'bg-[#0D1C33] text-[#ffb27a]',
        )}
      >
        <Icone className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[15.5px] leading-tight font-bold">
          {paraCliente ? 'Usar o app como cliente' : 'Voltar ao app do mecânico'}
        </span>
        <span className={cn('mt-0.5 block text-[12.5px] leading-snug', escuro ? 'text-white/60' : 'text-ink-3')}>
          {paraCliente ? 'Peça socorro e cuide dos seus veículos com a mesma conta.' : 'Receber e atender chamados SOS.'}
        </span>
      </span>
      <ArrowLeftRight aria-hidden className={cn('size-4 shrink-0', escuro ? 'text-white/50' : 'text-ink-3')} />
    </button>
  )
}
