import { Bell, BellRing, Brain, CalendarCheck, Camera, Check, CircleCheck, ClipboardList, Clock, FileText, History, House, LogOut, MapPin, Moon, Package, Phone, PhoneCall, RefreshCw, RotateCcw, Save, Send, ShieldCheck, Siren, Star, Sun, Truck, UserRound, Wrench, type LucideIcon } from 'lucide-react'
import { Arte } from '../comum/Arte'
import { ARTE3D, ARTE_MOBILE } from '../comum/kit3d'
import { cn } from '@/lib/utils'

const PECAS = new Map<LucideIcon, string>([
  [House, ARTE3D.casa], [UserRound, ARTE3D.conta], [Truck, ARTE3D.veiculos],
  [Bell, ARTE_MOBILE.sino], [BellRing, ARTE_MOBILE.sirene], [Siren, ARTE_MOBILE.sirene],
  [Brain, ARTE3D.ia], [Camera, ARTE_MOBILE.camera], [Send, ARTE_MOBILE.enviar],
  [History, ARTE3D.historico], [RefreshCw, ARTE3D.historico], [RotateCcw, ARTE3D.historico],
  [ClipboardList, ARTE3D.revisoes], [CalendarCheck, ARTE3D.revisoes], [FileText, ARTE_MOBILE.termos],
  [Phone, ARTE3D.ligar], [PhoneCall, ARTE3D.ligar], [MapPin, ARTE3D.local],
  [Wrench, '/sos/mobile-3d/ferramentas.webp'], [Package, '/sos/kit-3d/cambio.webp'],
  [Clock, ARTE3D.tempo], [Star, ARTE3D.estrela], [ShieldCheck, ARTE3D.seguranca],
  [LogOut, ARTE_MOBILE.sair], [Sun, ARTE_MOBILE.temaClaro], [Moon, ARTE_MOBILE.temaEscuro],
  [Save, ARTE3D.concluido], [Check, ARTE3D.concluido], [CircleCheck, ARTE3D.concluido],
])

/** Ícones funcionais conservam o traço quando a peça não existe ou não carrega. */
export function IconeM3D({ icone: Icone, className, peca }: { icone: LucideIcon; className?: string; peca?: string }) {
  const linha = <Icone className={cn('size-5 shrink-0', className)} aria-hidden />
  const src = peca ?? PECAS.get(Icone)
  return src ? <Arte src={src} alt="" recuo={linha} classeImagem={cn('size-8 shrink-0 object-contain', className)} /> : linha
}
