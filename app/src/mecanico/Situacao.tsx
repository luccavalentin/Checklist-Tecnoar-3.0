import { Check, Coffee, Loader2, MoonStar, Power, Wrench, type LucideIcon } from 'lucide-react'
import { ARTE_MOBILE } from '../comum/kit3d'
import { cn } from '@/lib/utils'
import { destravarAudio } from '@/sos/alerta'
import type { LeituraGPS } from '@/sos/geo'
import { SITUACOES_MECANICO } from '@/sos/rotulos'
import type { SituacaoMecanico } from '@/sos/tipos'
import { IconeM3D } from './ArteMecanico'
import { useDefinirSituacao } from './dados'
import { FolhaM } from './ui'

const ICONES: Record<SituacaoMecanico, LucideIcon> = {
  disponivel: Power,
  em_atendimento: Wrench,
  pausa: Coffee,
  indisponivel: MoonStar,
  offline: Power,
}

/**
 * Disponível e offline partilham o ícone de traço, então a peça vai por
 * situação, não pelo ícone: o kit não distingue os dois pelo desenho.
 */
const PECAS: Record<SituacaoMecanico, string> = {
  disponivel: ARTE_MOBILE.energia,
  em_atendimento: '/sos/mobile-3d/ferramentas.webp',
  pausa: ARTE_MOBILE.pausa,
  indisponivel: ARTE_MOBILE.temaEscuro,
  offline: ARTE_MOBILE.energia,
}

const ORDEM: SituacaoMecanico[] = ['disponivel', 'pausa', 'indisponivel', 'offline', 'em_atendimento']

/**
 * Troca rápida de situação (pausa, indisponível, offline). "Em atendimento"
 * aparece só para leitura: quem liga e desliga é o próprio chamado (aceitar e
 * finalizar), nunca a mão.
 */
export function FolhaSituacao({
  aberta,
  aoFechar,
  situacao,
  aceitaSos,
  emChamado,
  reserva,
}: {
  aberta: boolean
  aoFechar: () => void
  situacao: SituacaoMecanico
  aceitaSos: boolean
  emChamado: boolean
  reserva?: LeituraGPS | null
}) {
  const definir = useDefinirSituacao()

  function escolher(s: SituacaoMecanico) {
    if (s === situacao) return aoFechar()
    // O toque é o gesto que libera o som dos alertas no navegador.
    if (s === 'disponivel') void destravarAudio()
    definir.mutate({ situacao: s, aceitaSos: s === 'disponivel' && !aceitaSos ? true : undefined, reserva }, { onSuccess: aoFechar })
  }

  return (
    <FolhaM aberta={aberta} aoFechar={aoFechar} titulo="Seu status" descricao="Só quem está disponível recebe os chamados automáticos de SOS.">
      <ul className="flex flex-col gap-2 pb-2">
        {ORDEM.map((s) => {
          const info = SITUACOES_MECANICO[s]
          const Icone = ICONES[s]
          const atual = s === situacao
          const automatico = s === 'em_atendimento'
          // Com chamado aberto, o banco só aceita "em atendimento" ou "pausa".
          const bloqueado = automatico ? !atual : emChamado && s !== 'pausa'
          const carregando = definir.isPending && definir.variables?.situacao === s
          return (
            <li key={s}>
              <button
                type="button"
                disabled={bloqueado || definir.isPending}
                onClick={() => escolher(s)}
                aria-pressed={atual}
                className={cn(
                  'flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-3.5 py-3 text-left transition-colors active:scale-[0.99] disabled:cursor-not-allowed',
                  atual ? 'border-accent bg-accent-soft' : 'border-line bg-surface',
                  bloqueado && 'opacity-45',
                )}
              >
                <span className="sos-subtle-chip flex size-11 shrink-0 items-center justify-center rounded-xl text-ink-2">
                  <IconeM3D icone={Icone} peca={PECAS[s]} className="size-8" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[16px] font-bold text-ink">{info.rotulo}</span>
                  <span className="block text-[13px] leading-snug text-ink-3">
                    {automatico ? 'Automático: liga ao aceitar um chamado' : emChamado && bloqueado ? 'Finalize o atendimento em andamento' : info.descricao}
                  </span>
                </span>
                {carregando ? <Loader2 className="size-5 animate-spin text-ink-3" /> : atual ? <Check className="size-5 text-accent-ink" strokeWidth={3} /> : null}
              </button>
            </li>
          )
        })}
      </ul>
    </FolhaM>
  )
}
