import { ImagePlus, MapPin, Mic, Send } from 'lucide-react'
import { Arte } from './Arte'
import { ARTE_MOBILE } from './kit3d'

/** Peças decorativas: os controles mantêm rótulos e comportamento nativos. */
export function iconesConversa3D() {
  return {
    foto: <Arte src={ARTE_MOBILE.camera} alt="" classeImagem="size-8 shrink-0 object-contain" recuo={<ImagePlus className="size-5" />} />,
    local: <Arte src={ARTE_MOBILE.mapaBrasil} alt="" classeImagem="size-8 shrink-0 object-contain" recuo={<MapPin className="size-5" />} />,
    audio: <Arte src={ARTE_MOBILE.microfone} alt="" classeImagem="size-8 shrink-0 object-contain" recuo={<Mic className="size-5" />} />,
    enviar: <Arte src={ARTE_MOBILE.enviar} alt="" classeImagem="size-8 shrink-0 object-contain" recuo={<Send className="size-5" />} />,
    perfil: <Arte src={ARTE_MOBILE.atendimento} alt="" classeImagem="size-9 object-contain" recuo={null} />,
  }
}
