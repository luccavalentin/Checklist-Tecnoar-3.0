import { Link } from 'react-router-dom'
import { Bus, CalendarCheck, CarFront, ChevronRight, Moon, Sun, Truck, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Arte } from '../../comum/Arte'
import { ARTE3D, ARTE_MOBILE, VEICULO_MOBILE } from '../../comum/kit3d'
import type { HomeCliente as DadosHome } from '@/sos/tipos'
import { aplicarTema } from '../../sessao'
import { venceu } from '../dados'

/**
 * Peças do Início: o botão de tema, o ícone do veículo e os avisos do veículo
 * (revisão vencida, veículo na oficina). O botão de socorro é peça própria,
 * em BotaoSOS.tsx.
 */

/* ── tema ───────────────────────────────────────────────────────────────── */

/**
 * Troca claro/escuro na hora. Cada tema tem o seu botão (no claro, a lua; no
 * escuro, o sol), então não precisa guardar estado aqui.
 */
export function BotaoTema({ para, className }: { para: 'claro' | 'escuro'; className?: string }) {
  const Icone = para === 'escuro' ? Moon : Sun
  return (
    <button type="button" onClick={() => aplicarTema(para)} aria-label={para === 'escuro' ? 'Usar o modo escuro' : 'Usar o modo claro'} title={para === 'escuro' ? 'Modo escuro' : 'Modo claro'} className={className}>
      <Arte src={para === 'escuro' ? ARTE_MOBILE.lua : ARTE_MOBILE.sol} alt="" recuo={<Icone className="size-[20px]" strokeWidth={1.8} />} classeImagem="ini-topo-peca" />
    </button>
  )
}

/* ── veículo ────────────────────────────────────────────────────────────── */

/**
 * O veículo do cliente — nunca a foto de outro veículo.
 *
 * Tenta a arte 3D do tipo cadastrado (`/sos/veiculos/cavalo.png` e irmãos,
 * gerados pelos prompts em `design/prompts-3d-app.md`) e cai no ícone de
 * linha enquanto o arquivo não existe. É o que permite as artes chegarem uma
 * a uma sem nenhuma tela quebrar no meio do caminho.
 */
export function IconeVeiculo({ tipo, className }: { tipo?: string | null; className?: string }) {
  const Icone = tipo === 'onibus' ? Bus : tipo === 'van' || tipo === 'utilitario' ? CarFront : Truck
  const linha = <Icone className={className} strokeWidth={1.6} />
  /* Sem tipo cadastrado, a peça do kit já é melhor que o traço: o cartão
     convida a cadastrar, e um caminhão de verdade convida mais. */
  if (!tipo) return <Arte src={ARTE3D.veiculos} alt="" recuo={linha} classeImagem={className} />
  return <Arte src={VEICULO_MOBILE[tipo] ?? `/sos/veiculos/${tipo}.png`} alt="" recuo={linha} classeImagem={className} />
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
