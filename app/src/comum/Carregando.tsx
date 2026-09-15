import { AlertTriangle, RefreshCw } from 'lucide-react'
import { BotaoApp, LogoSOS } from './ui'

/** Tela de abertura do app — também o estado de erro ao descobrir quem é o usuário. */
export function TelaCarregandoApp({ erro, aoTentar, aoSair }: { erro?: string; aoTentar?: () => void; aoSair?: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-7 bg-canvas px-8 text-center text-ink">
      <LogoSOS altura={42} className="dark:hidden" />
      <LogoSOS negativo altura={42} className="hidden dark:block" />
      {erro ? (
        <div className="flex max-w-sm flex-col items-center gap-4">
          <AlertTriangle className="size-9 text-warn" />
          <p className="text-[15px] leading-relaxed text-ink-2">{erro}</p>
          <div className="flex w-full flex-col gap-2">
            {aoTentar && (
              <BotaoApp variante="primario" icone={RefreshCw} largo onClick={aoTentar}>
                Tentar de novo
              </BotaoApp>
            )}
            {aoSair && (
              <button type="button" onClick={aoSair} className="min-h-12 text-[14px] font-semibold text-ink-3">
                Sair da conta
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2" aria-label="Carregando">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2.5 animate-bounce rounded-full bg-accent" style={{ animationDelay: `${i * 140}ms` }} />
          ))}
        </div>
      )}
    </div>
  )
}
