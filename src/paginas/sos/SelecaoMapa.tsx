import { useEffect, useRef, useState, type Ref, type RefObject } from 'react'
import { useMap } from 'react-leaflet'
import { ArrowUpToLine, MapPin, MapPinOff, Phone, Send, SquareArrowOutUpRight, UserRoundX, Wrench, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Botao } from '@/componentes/ui/Botao'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { Selo } from '@/componentes/ui/Selo'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { SeloStatus } from '@/sos/componentes'
import { enquadrarMapa, type MarcadorMapa } from '@/sos/Mapa'
import { distanciaKm, pontoDe, type Ponto } from '@/sos/geo'
import { PRIORIDADES, SITUACOES_MECANICO, formatarDistancia, haQuanto, linkTelefone } from '@/sos/rotulos'
import type { ChamadoListado, MecanicoMapa } from '@/sos/tipos'
import { AvisosVigia, RelogioChamado } from './CartaoChamado'
import { Despacho } from './Despacho'
import { IconeOcorrencia, Placa, aguardando, posicaoRecente, useConfigSOS } from './comum'

/**
 * Seleção de chamado no mapa — o que a fila da central e a visão de mapa da
 * lista de chamados compartilham: tocar num chamado leva o mapa até ele e
 * abre um cartão curto por cima do mapa, com o caminho para o painel
 * completo e, se ainda falta mecânico, o atalho de despacho.
 */

/* ── layout ─────────────────────────────────────────────────────────────── */

/** Abaixo de `xl` o mapa e a lista ficam um sobre o outro. */
const CONSULTA_EMPILHADO = '(max-width: 1279.98px)'

export function telaEmpilhada(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(CONSULTA_EMPILHADO).matches
}

function movimentoReduzido(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Base do cabeçalho fixo do sistema (cresce com a faixa do relógio no iPhone). */
function baseDoCabecalho(): number {
  const cab = document.querySelector<HTMLElement>('header.sticky')
  return cab ? Math.max(0, cab.getBoundingClientRect().bottom) : 64
}

/**
 * Rola a página até o elemento, mas só se ele não estiver inteiro à vista:
 * quem já está vendo o mapa não pode ter a tela sacudida a cada toque.
 * O `scroll-margin-top` do elemento desconta o cabeçalho fixo.
 */
export function rolarAteVisivel(el: HTMLElement | null, bloco: ScrollLogicalPosition = 'start') {
  if (!el) return
  const r = el.getBoundingClientRect()
  if (r.top >= baseDoCabecalho() - 1 && r.bottom <= window.innerHeight + 1) return
  el.scrollIntoView({ behavior: movimentoReduzido() ? 'auto' : 'smooth', block: bloco })
}

/**
 * Traz um item para dentro de uma lista com rolagem própria (a fila ao lado
 * do mapa no monitor) sem mexer na rolagem da página. Quando a lista não
 * rola sozinha (celular e tablet), não faz nada — rolar a página tiraria o
 * mapa da frente de quem acabou de tocar num pino.
 */
export function rolarDentroDaLista(lista: HTMLElement | null, item: HTMLElement | null) {
  if (!lista || !item || lista.scrollHeight <= lista.clientHeight + 1) return
  const topoLista = lista.getBoundingClientRect().top
  const r = item.getBoundingClientRect()
  const acima = r.top < topoLista + 8
  const abaixo = r.bottom > topoLista + lista.clientHeight - 8
  if (!acima && !abaixo) return
  const alvo = lista.scrollTop + (r.top - topoLista) - (lista.clientHeight - r.height) / 2
  lista.scrollTo({ top: Math.max(0, alvo), behavior: movimentoReduzido() ? 'auto' : 'smooth' })
}

/* ── foco ───────────────────────────────────────────────────────────────── */

/** Mecânico com posição recente indo até o cliente — a linha tracejada no mapa. */
export function mecanicoEmDeslocamento(c: ChamadoListado, mecanicos: MecanicoMapa[]): MecanicoMapa | null {
  if (!c.mecanico_id || (c.status !== 'aceito' && c.status !== 'a_caminho')) return null
  const m = mecanicos.find((x) => x.usuario_id === c.mecanico_id)
  return m && posicaoRecente(m) ? m : null
}

/** O que enquadrar ao focar o chamado: o cliente e, se está a caminho, o mecânico. */
export function pontosDoFoco(c: ChamadoListado, mecanicos: MecanicoMapa[]): Ponto[] {
  const cliente = pontoDe(c)
  if (!cliente) return []
  const m = mecanicoEmDeslocamento(c, mecanicos)
  return m ? [cliente, { lat: m.latitude!, lng: m.longitude! }] : [cliente]
}

/**
 * Enquadra todos quando entra ou sai alguém do mapa — mas nunca com um
 * chamado em foco: um SOS novo chegando não pode arrancar o mapa de quem
 * está olhando outro. Fechar o foco também não reenquadra (a pessoa fica
 * onde estava; o botão de enquadrar está no canto). Filho de `<MapaSOS>`,
 * que deve receber `enquadrar={false}`.
 */
export function EnquadramentoAutomatico({ marcadores, pausado }: { marcadores: MarcadorMapa[]; pausado: boolean }) {
  const mapa = useMap()
  const pausa = useRef(pausado)
  pausa.current = pausado
  const ultimos = useRef(marcadores)
  ultimos.current = marcadores
  const composicao = marcadores
    .map((m) => m.id)
    .sort()
    .join('|')
  useEffect(() => {
    if (pausa.current || !ultimos.current.length) return
    enquadrarMapa(
      mapa,
      ultimos.current.map((m) => m.ponto),
    )
    // Só entrar ou sair alguém importa: posição nova de quem já está no mapa não reenquadra.
  }, [composicao, mapa])
  return null
}

/** Altura viva de um elemento (o cartão sobre o mapa muda com o conteúdo). */
export function useAltura(ref: RefObject<HTMLElement | null>, ativo: boolean): number {
  const [altura, setAltura] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!ativo || !el) {
      setAltura(0)
      return
    }
    const medir = () => setAltura(el.offsetHeight)
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [ref, ativo])
  return altura
}

/** Fecha o cartão no Esc — a menos que haja um diálogo aberto por cima, que tem a vez. */
export function useEscParaFechar(ativo: boolean, fechar: () => void) {
  useEffect(() => {
    if (!ativo) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return
      fechar()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ativo, fechar])
}

/* ── cartão sobre o mapa ────────────────────────────────────────────────── */

function faixa(c: ChamadoListado): string {
  if (c.prioridade === 'emergencia' && aguardando(c.status)) return 'bg-crit'
  if (aguardando(c.status)) return 'bg-accent'
  if (c.status === 'servico_finalizado' || c.status === 'concluido') return 'bg-ok'
  return 'bg-cyan'
}

/**
 * Cartão compacto do chamado em foco, sobre o mapa. No celular ocupa a
 * largura do mapa e é curto de propósito — o mapa atrás é o assunto; o
 * detalhe completo fica a um toque, em "Abrir chamado".
 */
export function CartaoFocoChamado({
  chamado: c,
  mecanicos,
  tempoAceiteSeg,
  aoAbrir,
  aoDespachar,
  aoFechar,
  refRaiz,
  className,
}: {
  chamado: ChamadoListado
  mecanicos: MecanicoMapa[]
  tempoAceiteSeg: number
  aoAbrir: () => void
  aoDespachar?: () => void
  aoFechar: () => void
  refRaiz?: Ref<HTMLDivElement>
  className?: string
}) {
  const { pode } = usePermissoes()
  const podeDespachar = pode('sos', 'editar') && !!aoDespachar && aguardando(c.status)
  const cliente = pontoDe(c)
  const mecanico = c.mecanico_id ? mecanicos.find((m) => m.usuario_id === c.mecanico_id) : undefined
  const emRota = mecanicoEmDeslocamento(c, mecanicos)
  const distancia = emRota && cliente ? distanciaKm({ lat: emRota.latitude!, lng: emRota.longitude! }, cliente) : c.distancia_km
  const tel = linkTelefone(c.telefone_contato)
  const encerrado = c.status === 'concluido' || c.status === 'cancelado'

  return (
    <div
      ref={refRaiz}
      role="region"
      aria-label={`Chamado ${c.protocolo} em foco no mapa`}
      className={cn('entrada-suave relative overflow-hidden rounded-xl border border-line bg-surface shadow-e3', className)}
    >
      <span aria-hidden className={cn('absolute inset-x-0 top-0 h-[3px]', faixa(c))} />
      <div className="flex flex-col gap-2 p-3 pt-3.5 sm:gap-2.5 sm:p-3.5 sm:pt-4">
        <div className="flex min-w-0 items-start gap-2.5">
          <IconeOcorrencia tipo={c.tipo_ocorrencia} className="max-sm:hidden" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="num truncate text-[11.5px] font-semibold text-ink-3">{c.protocolo}</span>
              {c.prioridade !== 'normal' && !encerrado && (
                <Selo tom={PRIORIDADES[c.prioridade].tom} className="px-2 py-0 text-[10.5px]">
                  {PRIORIDADES[c.prioridade].rotulo}
                </Selo>
              )}
            </p>
            <p className="truncate text-[15px] leading-snug font-semibold text-ink">{c.cliente_nome}</p>
            <p className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-2">
              <Placa placa={c.placa} className="text-[10.5px] leading-[16px]" />
              <span className="truncate">{[c.veiculo, c.ocorrencia_rotulo].filter(Boolean).join(' · ')}</span>
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar o cartão do chamado"
            title="Fechar (Esc)"
            onClick={aoFechar}
            className="-mt-1.5 -mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink lg:size-9"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <SeloStatus status={c.status} />
          <RelogioChamado chamado={c} tempoAceiteSeg={tempoAceiteSeg} />
        </div>

        <AvisosVigia chamado={c} />

        <div className="flex min-w-0 flex-col gap-1 text-[12.5px]">
          {c.mecanico_nome ? (
            <p className="flex min-w-0 items-center gap-1.5 text-ink-2">
              <Wrench aria-hidden className="size-3.5 shrink-0 text-ink-3" />
              <span className="truncate">
                <span className="font-medium text-ink">{c.mecanico_nome.split(' ').slice(0, 2).join(' ')}</span>
                {distancia != null && <span className="num">{` · ${emRota ? 'a ' : ''}${formatarDistancia(Number(distancia))}`}</span>}
                {emRota?.posicao_em && <span className="text-ink-3">{` · posição ${haQuanto(emRota.posicao_em)}`}</span>}
                {!emRota && mecanico && c.status !== 'no_local' && c.status !== 'servico_iniciado' && !encerrado && (
                  <span className="text-ink-3">{` · ${SITUACOES_MECANICO[mecanico.situacao].rotulo.toLowerCase()}`}</span>
                )}
              </span>
            </p>
          ) : (
            !encerrado && (
              <p className="flex min-w-0 items-center gap-1.5 font-medium text-warn-ink">
                <UserRoundX aria-hidden className="size-3.5 shrink-0 text-warn" />
                <span className="truncate">Sem mecânico</span>
              </p>
            )
          )}
          {cliente ? (
            c.endereco && (
              <p className="flex min-w-0 items-center gap-1.5 text-ink-3 max-sm:hidden">
                <MapPin aria-hidden className="size-3.5 shrink-0" />
                <span className="truncate">{c.endereco}</span>
              </p>
            )
          ) : (
            <p className="flex min-w-0 items-start gap-1.5 rounded-md bg-warn-soft px-2 py-1.5 text-warn-ink">
              <MapPinOff aria-hidden className="mt-px size-3.5 shrink-0" />
              <span>
                <strong className="font-semibold">Sem localização.</strong> O cliente não enviou a posição — ligue e peça uma referência.
              </span>
            </p>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-2">
          <Botao
            variante="primario"
            iconeInicio={<SquareArrowOutUpRight />}
            onClick={aoAbrir}
            aria-label="Abrir chamado"
            className="h-11 min-w-0 flex-1 px-3 sm:h-10"
          >
            {/* Com o "Despachar" ao lado, no celular fica só "Abrir": os dois
                rótulos inteiros não cabem em 360 px. */}
            <span>
              Abrir<span className={cn(podeDespachar && 'max-sm:hidden')}> chamado</span>
            </span>
          </Botao>
          {podeDespachar && (
            <Botao variante="secundario" iconeInicio={<Send />} onClick={aoDespachar} className="h-11 min-w-0 flex-1 px-3 sm:h-10">
              Despachar
            </Botao>
          )}
          {tel && (
            <a
              href={tel}
              aria-label="Ligar para o cliente"
              title="Ligar para o cliente"
              className="flex size-11 shrink-0 items-center justify-center rounded-md border border-line-strong text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink sm:size-10"
            >
              <Phone aria-hidden className="size-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Volta para a lista quando ela está empilhada fora da vista (celular e
 * tablet). Flutua no alto do mapa, abaixo da legenda — no cartão, com os
 * botões de ação, não cabia em 360 px.
 */
export function BotaoVerNaLista({ rotulo, onClick, className }: { rotulo: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'entrada-suave flex h-11 items-center gap-1.5 rounded-full border border-black/10 bg-white pr-4 pl-3 font-display text-[11px] font-bold tracking-[0.06em] text-[#081830] uppercase shadow-[0_6px_20px_rgb(8_24_48_/_0.22)] transition-transform active:scale-95 xl:hidden',
        className,
      )}
    >
      <ArrowUpToLine aria-hidden className="size-4" />
      {rotulo}
    </button>
  )
}

/* ── atalho de despacho ─────────────────────────────────────────────────── */

/**
 * O mesmo despacho do painel do chamado, sem abrir o painel: da fila ao
 * mecânico em dois toques. Fecha sozinho quando o despacho dá certo.
 */
export function ModalDespacho({ chamado, aoFechar }: { chamado: ChamadoListado | null; aoFechar: () => void }) {
  const config = useConfigSOS()
  return (
    <Modal
      aberto={!!chamado}
      aoFechar={aoFechar}
      titulo={chamado ? `Despachar ${chamado.protocolo}` : 'Despachar'}
      descricao={chamado ? `${chamado.ocorrencia_rotulo} · ${chamado.cliente_nome}` : undefined}
      largura="lg"
    >
      {chamado && <Despacho chamado={chamado} modo={config.data?.modo_distribuicao} nomeMecanicoAtual={chamado.mecanico_nome} aoDespachar={aoFechar} />}
    </Modal>
  )
}
