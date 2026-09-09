import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, WifiOff } from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'

/** Sinaliza perda de conexão. O sistema não finge que salvou o que não salvou. */
export function IndicadorOffline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))

  useEffect(() => {
    const sobe = () => setOnline(true)
    const cai = () => setOnline(false)
    window.addEventListener('online', sobe)
    window.addEventListener('offline', cai)
    return () => {
      window.removeEventListener('online', sobe)
      window.removeEventListener('offline', cai)
    }
  }, [])

  if (online) return null

  return (
    <span
      role="status"
      className="flex items-center gap-2 rounded-md border border-warn/40 bg-warn-soft px-2.5 py-1.5 text-[11.5px] font-medium text-warn-ink"
    >
      <WifiOff aria-hidden className="size-3.5" />
      <span className="hidden sm:inline">Sem conexão</span>
    </span>
  )
}

/** Aviso de nova versão do aplicativo instalado (PWA). */
export function AvisoAtualizacao() {
  const {
    needRefresh: [precisaAtualizar, setPrecisaAtualizar],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  if (!precisaAtualizar) return null

  return (
    <div
      className="area-segura fixed inset-x-0 z-[65] flex justify-center p-4 sm:inset-x-auto sm:right-4"
      /* Se a tela tem barra de ações fixa (a OS no celular), sobe acima dela. */
      style={{ bottom: 'var(--barra-acoes, 0px)' }}
    >
      <div className="flex w-full max-w-sm items-start gap-3 rounded-lg border border-cyan/40 bg-surface p-4 shadow-e3">
        <RefreshCw aria-hidden className="mt-0.5 size-[17px] shrink-0 text-cyan" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-col gap-0.5">
            <p className="font-display text-[13px] font-semibold text-ink">Nova versão disponível</p>
            <p className="text-[12.5px] leading-relaxed text-ink-2">
              Atualizar recarrega a página. Salve o que estiver preenchendo antes de seguir — fotos na fila
              de envio são preservadas.
            </p>
          </div>
          <div className="flex gap-2">
            <Botao variante="secundario" tamanho="sm" onClick={() => void updateServiceWorker(true)}>
              Atualizar
            </Botao>
            <Botao variante="fantasma" tamanho="sm" onClick={() => setPrecisaAtualizar(false)}>
              Agora não
            </Botao>
          </div>
        </div>
      </div>
    </div>
  )
}
