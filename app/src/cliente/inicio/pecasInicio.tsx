import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Bus, CalendarCheck, CarFront, ChevronRight, Moon, Siren, Sun, Truck, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HomeCliente as DadosHome } from '@/sos/tipos'
import { aplicarTema } from '../../sessao'
import { venceu } from '../dados'

/**
 * Peças do Início: o botão de tema, o botão SOS, o ícone do veículo e os
 * avisos do veículo (revisão vencida, veículo na oficina).
 */

/* ── botão SOS ──────────────────────────────────────────────────────────── */

/**
 * Botão SOS com anéis. Só navega: quem abre o pedido é a tela do SOS — dois
 * toques seguidos não criam dois pedidos.
 */
export function OrbeSOS({
  aoTocar,
  ativo,
  tema,
  className,
  style,
}: {
  /** Sem `aoTocar`, é só o desenho (dentro de um cartão que já é o botão). */
  aoTocar?: () => void
  ativo: boolean
  tema: 'claro' | 'escuro'
  className?: string
  style?: CSSProperties
}) {
  const miolo = (
    <>
      <span aria-hidden className="ini-orbe-anel-fora" />
      <span aria-hidden className="ini-orbe-anel" />
      <span className="ini-orbe-nucleo">
        <Siren className="ini-orbe-icone" strokeWidth={1.9} />
        <span className="ini-orbe-texto">{ativo ? 'AO VIVO' : 'SOS'}</span>
      </span>
    </>
  )
  const classe = cn('ini-orbe', tema === 'claro' ? 'ini-orbe-claro' : 'ini-orbe-escuro', className)
  if (!aoTocar) {
    return (
      <span aria-hidden className={classe} style={style}>
        {miolo}
      </span>
    )
  }
  return (
    <button type="button" onClick={aoTocar} aria-label={ativo ? 'Acompanhar o socorro em andamento' : 'Pedir socorro (SOS)'} className={classe} style={style}>
      {miolo}
    </button>
  )
}

/* ── tema ───────────────────────────────────────────────────────────────── */

/**
 * Troca claro/escuro na hora. Cada tema tem o seu botão (no claro, a lua; no
 * escuro, o sol), então não precisa guardar estado aqui.
 */
export function BotaoTema({ para, className }: { para: 'claro' | 'escuro'; className?: string }) {
  const Icone = para === 'escuro' ? Moon : Sun
  return (
    <button type="button" onClick={() => aplicarTema(para)} aria-label={para === 'escuro' ? 'Usar o modo escuro' : 'Usar o modo claro'} title={para === 'escuro' ? 'Modo escuro' : 'Modo claro'} className={className}>
      <Icone className="size-[20px]" strokeWidth={1.8} />
    </button>
  )
}

/* ── veículo ────────────────────────────────────────────────────────────── */

/** Ícone pelo tipo do veículo cadastrado — nunca uma foto de outro veículo. */
export function IconeVeiculo({ tipo, className }: { tipo?: string | null; className?: string }) {
  const Icone = tipo === 'onibus' ? Bus : tipo === 'van' || tipo === 'utilitario' ? CarFront : Truck
  return <Icone className={className} strokeWidth={1.6} />
}

/**
 * Só o que pede atenção: revisão VENCIDA ou veículo na oficina. Revisão
 * apenas chegando fica no número do atalho de revisões.
 */
export function AlertasVeiculo({ d, className }: { d: DadosHome | undefined; className?: string }) {
  const vencida = venceu(d?.proxima_revisao?.vence_em)
  const r = vencida ? (d?.proxima_revisao ?? null) : null
  const naOficina = !!d?.veiculo_na_oficina
  if (!d?.veiculo || (!r && !naOficina)) return null
  return (
    <div className={cn('ini-alertas', className)}>
      {naOficina && (
        <Link to="/historico?tipo=os" className="ini-alerta">
          <Wrench className="size-[18px] shrink-0 text-[#00afef]" />
          <span className="min-w-0 flex-1 truncate">Seu veículo está na oficina</span>
          <ChevronRight className="size-4 shrink-0 opacity-60" />
        </Link>
      )}
      {r && (
        <Link to="/revisoes" className="ini-alerta">
          <CalendarCheck className={cn('size-[18px] shrink-0', vencida ? 'text-[#e5484d]' : 'text-[#FF7A00]')} />
          <span className="min-w-0 flex-1 truncate">{vencida ? 'Revisão vencida' : r.titulo || 'Revisão chegando'}</span>
          <span className="shrink-0 font-semibold text-[#FF510F]">Agendar</span>
        </Link>
      )}
    </div>
  )
}
