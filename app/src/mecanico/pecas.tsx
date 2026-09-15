import type { ReactNode } from 'react'
import { MapPinOff, WifiOff, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mensagemErroGPS, type ErroGPS } from '@/sos/geo'
import { OCORRENCIAS, SITUACOES_MECANICO, formatarPlacaExibicao } from '@/sos/rotulos'
import type { OcorrenciaSOS, PrioridadeSOS, SituacaoMecanico } from '@/sos/tipos'

/**
 * Peças visuais só do app do mecânico. O que é comum ao cliente fica em
 * `comum/ui.tsx`; aqui mora o vocabulário de quem está em campo: placa,
 * ícone do problema, situação.
 */

/**
 * Placa no desenho Mercosul (faixa azul em cima, letras escuras). O mecânico
 * procura o caminhão pela placa: ela precisa saltar aos olhos, não se perder
 * no meio do texto.
 */
export function Placa({ placa, tamanho = 'md', className }: { placa: string | null | undefined; tamanho?: 'sm' | 'md' | 'lg'; className?: string }) {
  if (!placa) return null
  const t = tamanho === 'lg' ? 'text-[17px] px-2.5 py-1' : tamanho === 'sm' ? 'text-[11px] px-1.5 py-[1px]' : 'text-[13px] px-2 py-0.5'
  return (
    <span
      className={cn('inline-flex shrink-0 flex-col overflow-hidden rounded-[5px] border-[1.5px] border-[#0b1c33] bg-white leading-none shadow-[0_1px_0_rgb(0_0_0/0.08)]', className)}
      aria-label={`Placa ${formatarPlacaExibicao(placa)}`}
    >
      <span aria-hidden className={cn('bg-[#1f4fa8]', tamanho === 'sm' ? 'h-[3px]' : 'h-1')} />
      <span className={cn('num font-bold tracking-[0.08em] text-[#0b1c33]', t)}>{formatarPlacaExibicao(placa)}</span>
    </span>
  )
}

/** Ícone do problema num quadrado de cor — emergência sai em vermelho. */
export function IconeOcorrencia({
  tipo,
  prioridade,
  tamanho = 'md',
  className,
}: {
  tipo: OcorrenciaSOS | null | undefined
  prioridade?: PrioridadeSOS | null
  tamanho?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const info = OCORRENCIAS[tipo ?? 'outro'] ?? OCORRENCIAS.outro
  const Icone = info.icone
  const caixa = tamanho === 'lg' ? 'size-14 rounded-2xl' : tamanho === 'sm' ? 'size-9 rounded-xl' : 'size-12 rounded-2xl'
  const icone = tamanho === 'lg' ? 'size-7' : tamanho === 'sm' ? 'size-[18px]' : 'size-6'
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center',
        caixa,
        prioridade === 'emergencia' ? 'bg-[#ff6600] text-white' : prioridade === 'alta' ? 'bg-warn-soft text-warn-ink' : 'bg-accent-soft text-accent-ink',
        className,
      )}
    >
      <Icone className={icone} strokeWidth={2.2} />
    </span>
  )
}

/** Bolinha da situação (verde pulsando quando disponível). */
export function PontoSituacao({ situacao, className }: { situacao: SituacaoMecanico; className?: string }) {
  const cor = SITUACOES_MECANICO[situacao].ponto
  return (
    <span className={cn('relative inline-flex size-3 shrink-0', className)} aria-hidden>
      {situacao === 'disponivel' && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', cor)} />}
      <span className={cn('relative inline-flex size-3 rounded-full', cor)} />
    </span>
  )
}

/** Interruptor liga/desliga com alvo de toque grande. */
export function Interruptor({
  ligado,
  aoMudar,
  rotulo,
  descricao,
  icone: Icone,
  desabilitado,
}: {
  ligado: boolean
  aoMudar: (v: boolean) => void
  rotulo: string
  descricao?: ReactNode
  icone?: LucideIcon
  desabilitado?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      disabled={desabilitado}
      onClick={() => aoMudar(!ligado)}
      className="flex w-full items-center gap-3 py-3 text-left disabled:opacity-50"
    >
      {Icone && (
        <span className="sos-chip flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-2">
          <Icone className="size-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{rotulo}</span>
        {descricao && <span className="block text-[12.5px] leading-snug text-ink-3">{descricao}</span>}
      </span>
      <span aria-hidden className={cn('relative h-8 w-[3.25rem] shrink-0 rounded-full transition-colors', ligado ? 'bg-ok' : 'bg-line-strong')}>
        <span className={cn('absolute top-1 size-6 rounded-full bg-white shadow transition-all', ligado ? 'left-[1.5rem]' : 'left-1')} />
      </span>
    </button>
  )
}

/**
 * Avisos de conexão e GPS no topo das telas em campo. Texto curto e de ação:
 * o mecânico lê de relance, com o caminhão ligado.
 */
export function FaixasCampo({
  online,
  semRede,
  erroGps,
  escuro,
  className,
}: {
  online: boolean
  semRede?: boolean
  erroGps?: ErroGPS | null
  escuro?: boolean
  className?: string
}) {
  const semConexao = !online || semRede
  if (!semConexao && !erroGps) return null
  const base = 'flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 text-[13px] leading-snug font-medium shadow-e2'
  return (
    <div className={cn('flex flex-col gap-2', className)} role="status">
      {semConexao && (
        <div className={cn(base, escuro ? 'bg-[#3a2a06] text-[#ffd27a]' : 'bg-[#fdf1dc] text-[#8a5700] dark:bg-[#3a2a06] dark:text-[#ffd27a]')}>
          <WifiOff className="mt-0.5 size-4 shrink-0" />
          <span>Sem conexão — sua posição será enviada quando o sinal voltar.</span>
        </div>
      )}
      {erroGps && (
        <div className={cn(base, escuro ? 'bg-[#3d0f12] text-[#ffb3ae]' : 'bg-[#fdeae8] text-[#a5261d] dark:bg-[#3d0f12] dark:text-[#ffb3ae]')}>
          <MapPinOff className="mt-0.5 size-4 shrink-0" />
          <span>
            {erroGps === 'negado'
              ? 'GPS bloqueado. Libere a localização do app nos Ajustes do aparelho para o cliente ver você chegando.'
              : mensagemErroGPS(erroGps)}
          </span>
        </div>
      )}
    </div>
  )
}
