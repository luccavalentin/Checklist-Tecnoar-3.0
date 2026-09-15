import { useState } from 'react'
import { ArrowLeftRight, Check, Navigation } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ehApple, linkAppleMaps, linkGoogleMaps, linkWaze, type Ponto } from '@/sos/geo'
import { FolhaM } from './ui'

/**
 * "Ir até o cliente": abre o app de mapas do próprio aparelho. A navegação
 * curva a curva é trabalho do Google Maps/Waze — o mapa do SOS mostra onde
 * cada um está; o GPS de verdade fica com quem faz isso bem.
 *
 * A última escolha fica guardada: da segunda vez em diante é um toque só.
 */

export type AppMapas = 'google' | 'waze' | 'apple'
const CHAVE = 'sos.navegador'

const APPS: Record<AppMapas, { nome: string; detalhe: string; cor: string; letra: string }> = {
  google: { nome: 'Google Maps', detalhe: 'Rotas para carro e caminhão', cor: 'bg-[#1a73e8]', letra: 'G' },
  waze: { nome: 'Waze', detalhe: 'Trânsito e alertas da via', cor: 'bg-[#33ccff]', letra: 'W' },
  apple: { nome: 'Apple Maps', detalhe: 'Mapas do iPhone', cor: 'bg-[#111827]', letra: '' },
}

export function lerNavegador(): AppMapas | null {
  try {
    const v = localStorage.getItem(CHAVE)
    return v === 'google' || v === 'waze' || v === 'apple' ? v : null
  } catch {
    return null
  }
}

function gravarNavegador(app: AppMapas) {
  try {
    localStorage.setItem(CHAVE, app)
  } catch {
    /* sem armazenamento: pergunta de novo da próxima vez */
  }
}

function linkPara(app: AppMapas, destino: Ponto, origem?: Ponto | null): string {
  if (app === 'waze') return linkWaze(destino)
  if (app === 'apple') return linkAppleMaps(destino)
  return linkGoogleMaps(destino, origem)
}

export function abrirNavegador(app: AppMapas, destino: Ponto, origem?: Ponto | null) {
  // Nova aba: no app instalado vira o app de mapas; a tela do chamado fica
  // intacta por baixo, com o rastreio rodando.
  window.open(linkPara(app, destino, origem), '_blank', 'noopener')
}

/**
 * "ABRIR NO GOOGLE MAPS" + troca de app. Sem escolha salva, vai no Google
 * Maps; o botão ao lado troca para Waze ou Apple Maps (e fica guardado).
 * `aoAbrir` roda no mesmo toque (ex.: avisar que saiu para o atendimento).
 */
export function BotaoIrAteCliente({
  destino,
  origem,
  aoAbrir,
  className,
}: {
  destino: Ponto | null
  origem?: Ponto | null
  aoAbrir?: () => void
  className?: string
}) {
  const [app, setApp] = useState<AppMapas | null>(() => lerNavegador())
  const [aberta, setAberta] = useState(false)
  const atual: AppMapas = app ?? 'google'

  function ir() {
    if (!destino) return
    abrirNavegador(atual, destino, origem)
    aoAbrir?.()
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <button
        type="button"
        onClick={ir}
        disabled={!destino}
        className="flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-[1.25rem] bg-[#0D1C33] px-3 font-display text-[16px] font-extrabold tracking-[0.02em] text-white uppercase transition-transform active:scale-[0.98] disabled:opacity-45 dark:bg-white dark:text-[#0D1C33] max-[400px]:text-[15px]"
      >
        <Navigation className="size-5 shrink-0 fill-current" />
        <span className="truncate">
          <span className="max-[359px]:hidden">Abrir no </span>
          {APPS[atual].nome}
        </span>
      </button>
      <button
        type="button"
        onClick={() => setAberta(true)}
        disabled={!destino}
        aria-label="Escolher o app de mapas"
        className="flex min-h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] border-2 border-line-strong bg-surface text-ink-2 active:scale-95 disabled:opacity-45"
      >
        <ArrowLeftRight className="size-5" />
      </button>

      {destino && (
        <FolhaNavegador
          aberta={aberta}
          aoFechar={() => setAberta(false)}
          atual={app}
          aoEscolher={(a) => {
            gravarNavegador(a)
            setApp(a)
            setAberta(false)
            abrirNavegador(a, destino, origem)
            aoAbrir?.()
          }}
        />
      )}
    </div>
  )
}

export function FolhaNavegador({
  aberta,
  aoFechar,
  atual,
  aoEscolher,
}: {
  aberta: boolean
  aoFechar: () => void
  atual: AppMapas | null
  aoEscolher: (a: AppMapas) => void
}) {
  // No iPhone o Apple Maps vem primeiro; no Android ele nem abre direito.
  const ordem: AppMapas[] = ehApple() ? ['apple', 'google', 'waze'] : ['google', 'waze', 'apple']
  return (
    <FolhaM aberta={aberta} aoFechar={aoFechar} titulo="Abrir a rota em…" descricao="O app escolhido fica guardado para os próximos chamados.">
      <ul className="flex flex-col gap-2 pb-2">
        {ordem.map((a) => {
          const info = APPS[a]
          return (
            <li key={a}>
              <button
                type="button"
                onClick={() => aoEscolher(a)}
                className={cn(
                  'flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-3.5 text-left transition-colors active:scale-[0.99]',
                  atual === a ? 'border-accent bg-accent-soft' : 'border-line bg-surface-2',
                )}
              >
                <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl font-display text-[19px] font-extrabold text-white', info.cor)}>
                  {info.letra || <Navigation className="size-5 fill-current" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[16px] font-bold text-ink">{info.nome}</span>
                  <span className="block text-[12.5px] text-ink-3">{atual === a ? 'Último usado' : info.detalhe}</span>
                </span>
                {atual === a && <Check className="size-5 text-accent-ink" strokeWidth={3} />}
              </button>
            </li>
          )
        })}
      </ul>
    </FolhaM>
  )
}
