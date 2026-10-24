import type { ComponentProps } from 'react'
import { Camera, Film, Mic, Play } from 'lucide-react'
import { EnviarMidia } from '@/sos/componentes'
import { Arte } from './Arte'
import { ARTE_MOBILE } from './kit3d'

/** Mesmos controles de captura e envio, com as peças 3D do app móvel. */
export function Midia3D(props: Omit<ComponentProps<typeof EnviarMidia>, 'icones'>) {
  return <EnviarMidia {...props} icones={{
    foto: <Arte src={ARTE_MOBILE.camera} alt="" classeImagem="size-9 shrink-0 object-contain" recuo={<Camera className="size-6" />} />,
    audio: <Arte src={ARTE_MOBILE.microfone} alt="" classeImagem="size-9 shrink-0 object-contain" recuo={<Mic className="size-6" />} />,
    video: <span aria-hidden className="relative size-9 shrink-0">
      <Arte src={ARTE_MOBILE.camera} alt="" classeImagem="size-9 object-contain" recuo={<Film className="size-6" />} />
      <span className="absolute -right-1 -bottom-0.5 flex size-4 items-center justify-center rounded-full border border-[#a9e8ff] bg-[#002061] shadow-[0_2px_3px_#0008]"><Play className="size-2.5 fill-white text-white" /></span>
    </span>,
  }} />
}
