import { CalendarPlus } from 'lucide-react'
import { Arte } from './Arte'
import { ARTE_MOBILE } from './kit3d'

/** Aparência compartilhada; o botão ou link ao redor mantém a ação original. */
export function AcaoAgendar3D() {
  return (
    <>
      <span className="sr-only">Agendar revisão</span>
      <Arte
        src={ARTE_MOBILE.agendar}
        alt=""
        classeImagem="acao-agendar-imagem"
        recuo={<span aria-hidden className="inline-flex items-center justify-center gap-2"><CalendarPlus className="size-5" />Agendar revisão</span>}
      />
    </>
  )
}
