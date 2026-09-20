import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from 'react'
import { Circle, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './mapa.css'
import type { Ponto } from './geo'

/**
 * Mapa do SOS Tecnoar — o mesmo no app do cliente, no do mecânico e na central.
 *
 * Base: OpenStreetMap, gratuito e sem chave. Os pinos são HTML
 * (DivIcon) com as cores da marca — nada de pino azul genérico: quem olha
 * precisa distinguir num relance "eu", "o mecânico" e "o chamado". Todo
 * ponto de SOS (o chamado na central, o veículo no app) é o pino com o logo
 * oficial da Tecnoar; a cor do anel diz a etapa.
 */

export type TipoMarcador = 'cliente' | 'mecanico' | 'eu' | 'chamado' | 'mecanico_livre' | 'mecanico_ocupado' | 'mecanico_off'

/**
 * Etapa do SOS, na cor do anel do pino (a mesma da legenda da central):
 * vermelho esperando mecânico, laranja em campo, verde finalizado, cinza
 * encerrado. Sem etapa, o anel fica no laranja da marca.
 */
export type TomPinoSOS = 'espera' | 'campo' | 'fim' | 'encerrado'

export interface MarcadorMapa {
  id: string
  ponto: Ponto
  tipo: TipoMarcador
  /** Texto curto no balão (nome, placa, protocolo). */
  rotulo?: string
  /** Emergência: selo "!" vermelho no pino (e anel vermelho, se não houver etapa). */
  critico?: boolean
  /** Etapa do SOS (só nos pinos de chamado/veículo). */
  tom?: TomPinoSOS
  /** Anel pulsando — posição ao vivo ou chamado aguardando. */
  pulsar?: boolean
  /** Precisão do GPS em metros (desenha o círculo de incerteza para "eu"). */
  precisao?: number | null
  /** Letra/ícone dentro do pino do mecânico (iniciais). */
  sigla?: string
  selecionado?: boolean
  aoClicar?: () => void
}

export interface MapaSOSProps {
  marcadores?: MarcadorMapa[]
  rota?: Ponto[] | null
  /** Rota estimada (linha reta) desenhada tracejada. */
  rotaEstimada?: boolean
  centro?: Ponto | null
  zoom?: number
  /** Enquadra todos os marcadores sempre que a lista mudar de composição. */
  enquadrar?: boolean
  /** Mantém este ponto no centro (mecânico dirigindo). */
  seguir?: Ponto | null
  tema?: 'claro' | 'escuro'
  /** Modo mira: pino fixo no centro; devolve o centro quando o mapa para. */
  mira?: boolean
  aoMoverMira?: (p: Ponto) => void
  aoClicarMapa?: (p: Ponto) => void
  className?: string
  /** Margem (px) do enquadramento — sobe o conteúdo acima de um painel inferior. */
  margemInferior?: number
  interativo?: boolean
  children?: ReactNode
}

const BRASIL: Ponto = { lat: -15.78, lng: -47.93 }

/* Base: OpenStreetMap, sem chave. (A CARTO passou a exigir chave e estampa
   "API KEY REQUIRED" no mapa.) O tema escuro é o mesmo mapa com filtro de
   cor no painel de tiles — ver `mapa.css`. Se o volume crescer, trocar por um
   provedor com chave (MapTiler, Stadia) só muda esta URL. */
const URL_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATRIBUICAO = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

export function MapaSOS({
  marcadores = [],
  rota,
  rotaEstimada,
  centro,
  zoom = 13,
  enquadrar = true,
  seguir,
  tema = 'claro',
  mira,
  aoMoverMira,
  aoClicarMapa,
  className,
  margemInferior = 0,
  interativo = true,
  children,
}: MapaSOSProps) {
  const inicial = centro ?? marcadores[0]?.ponto ?? BRASIL
  const zoomInicial = centro || marcadores.length ? zoom : 4

  return (
    <div className={['mapa-sos relative isolate overflow-hidden', tema === 'escuro' && 'mapa-sos-escuro', className].filter(Boolean).join(' ')}>
      <MapContainer
        center={[inicial.lat, inicial.lng]}
        zoom={zoomInicial}
        zoomControl={false}
        attributionControl
        scrollWheelZoom={interativo}
        dragging={interativo}
        touchZoom={interativo}
        doubleClickZoom={interativo}
        className="size-full"
        preferCanvas
      >
        <TileLayer url={URL_TILES} attribution={ATRIBUICAO} maxZoom={19} />
        {rota && rota.length > 1 && (
          <>
            <Polyline positions={rota.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#081830', weight: 8, opacity: 0.18 }} />
            <Polyline
              positions={rota.map((p) => [p.lat, p.lng])}
              pathOptions={{ color: '#ff6a00', weight: 5, opacity: 0.95, dashArray: rotaEstimada ? '2 10' : undefined, lineCap: 'round' }}
            />
          </>
        )}
        {marcadores.map((m) => (
          <Marcador key={m.id} m={m} />
        ))}
        <Controlador
          marcadores={marcadores}
          centro={centro}
          zoom={zoom}
          enquadrar={enquadrar}
          seguir={seguir}
          margemInferior={margemInferior}
          mira={mira}
          aoMoverMira={aoMoverMira}
          aoClicarMapa={aoClicarMapa}
        />
        {children}
      </MapContainer>

      {/* Mira do "arraste o mapa até o ponto": o mesmo pino da Tecnoar dos
          chamados, com a ponta exatamente no centro do mapa. */}
      {mira && (
        <div aria-hidden className="mapa-mira pointer-events-none absolute inset-0 z-[500] flex items-center justify-center">
          <div className="mapa-mira-pino">
            <div className="pino-marca">
              <span className="pino-marca-ponta" />
              <span className="pino-marca-cabeca">
                <img className="pino-marca-logo" src={LOGO_TECNOAR} alt="" draggable={false} />
              </span>
            </div>
          </div>
          <span className="mapa-mira-sombra" />
        </div>
      )}
    </div>
  )
}

/* ── pinos ──────────────────────────────────────────────────────────────── */

/**
 * Logo oficial (versão positiva, para fundo branco), servido pelos dois
 * aplicativos: `public/brand` no Checklist e `app/public/brand` no app SOS.
 * Um `<img>` só por pino: o navegador baixa e decodifica o arquivo uma vez.
 */
const LOGO_TECNOAR = '/brand/tecnoar-positivo.svg'

function htmlPinoMarca(m: MarcadorMapa, pulso: string, sel: string): string {
  const tom = m.tom ? ` tom-${m.tom}` : m.critico ? ' tom-espera' : ''
  const alerta = m.critico ? '<span class="pino-marca-alerta">!</span>' : ''
  return (
    `<div class="pino-marca${tom}${sel}">${pulso}<span class="pino-marca-ponta"></span>` +
    `<span class="pino-marca-cabeca"><img class="pino-marca-logo" src="${LOGO_TECNOAR}" alt="" draggable="false"></span>${alerta}</div>`
  )
}

function htmlPino(m: MarcadorMapa): string {
  const pulso = m.pulsar ? '<span class="pino-pulso"></span>' : ''
  const sel = m.selecionado ? ' pino-selecionado' : ''
  switch (m.tipo) {
    case 'eu':
      return `<div class="pino-eu${sel}">${pulso}<span class="pino-eu-ponto"></span></div>`
    case 'cliente':
    case 'chamado':
      return htmlPinoMarca(m, pulso, sel)
    case 'mecanico':
    case 'mecanico_livre':
    case 'mecanico_ocupado':
    case 'mecanico_off': {
      const classe =
        m.tipo === 'mecanico_livre' ? ' mec-livre' : m.tipo === 'mecanico_ocupado' ? ' mec-ocupado' : m.tipo === 'mecanico_off' ? ' mec-off' : ''
      const conteudo = m.sigla
        ? `<span class="pino-mec-sigla">${escaparHtml(m.sigla)}</span>`
        : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      return `<div class="pino-mec${classe}${sel}">${pulso}${conteudo}</div>`
    }
  }
}

function escaparHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

/* Pino da marca: cabeça 44×36 com o logo e a ponta embaixo (ver `mapa.css`).
   A âncora é a ponta — é ela que marca o lugar do veículo. */
const TAMANHO: Record<TipoMarcador, [number, number]> = {
  eu: [22, 22],
  cliente: [44, 46],
  chamado: [44, 46],
  mecanico: [42, 42],
  mecanico_livre: [38, 38],
  mecanico_ocupado: [38, 38],
  mecanico_off: [34, 34],
}

function Marcador({ m }: { m: MarcadorMapa }) {
  const icone = useMemo(() => {
    const [w, h] = TAMANHO[m.tipo]
    const ancoraBase = m.tipo === 'cliente' || m.tipo === 'chamado'
    return L.divIcon({
      html: htmlPino(m),
      className: 'pino-sos',
      iconSize: [w, h],
      iconAnchor: ancoraBase ? [w / 2, h - 2] : [w / 2, h / 2],
      // Acima da cabeça mesmo com o pino ampliado (em foco ele cresce 15%).
      tooltipAnchor: ancoraBase ? [0, -h - 4] : [0, -h / 2],
    })
  }, [m])

  return (
    <>
      {m.tipo === 'eu' && m.precisao != null && m.precisao > 8 && (
        <Circle
          center={[m.ponto.lat, m.ponto.lng]}
          radius={Math.min(m.precisao, 3000)}
          interactive={false}
          pathOptions={{ color: '#1a73e8', weight: 1, opacity: 0.45, fillColor: '#1a73e8', fillOpacity: 0.1 }}
        />
      )}
      <Marker
        position={[m.ponto.lat, m.ponto.lng]}
        icon={icone}
        zIndexOffset={m.tipo === 'eu' ? 900 : m.tipo === 'mecanico' ? 800 : m.selecionado ? 1000 : 0}
        eventHandlers={m.aoClicar ? { click: m.aoClicar } : undefined}
        keyboard={!!m.aoClicar}
      >
        {/* O react-leaflet só lê `permanent` ao criar o balão: a chave recria o
            balão quando o pino entra ou sai de foco — sem ela, o chamado
            escolhido na fila nunca mostrava o protocolo fixo no mapa. */}
        {m.rotulo && (
          <Tooltip
            key={m.selecionado ? 'fixo' : 'passar'}
            direction="top"
            offset={[0, 0]}
            opacity={1}
            permanent={!!m.selecionado}
            className="tooltip-sos"
          >
            {m.rotulo}
          </Tooltip>
        )}
      </Marker>
    </>
  )
}

/* ── câmera ─────────────────────────────────────────────────────────────── */

function Controlador({
  marcadores,
  centro,
  zoom,
  enquadrar,
  seguir,
  margemInferior,
  mira,
  aoMoverMira,
  aoClicarMapa,
}: {
  marcadores: MarcadorMapa[]
  centro?: Ponto | null
  zoom: number
  enquadrar: boolean
  seguir?: Ponto | null
  margemInferior: number
  mira?: boolean
  aoMoverMira?: (p: Ponto) => void
  aoClicarMapa?: (p: Ponto) => void
}) {
  const mapa = useMap()
  const tocouNoMapa = useRef(false)

  useMapEvents({
    dragstart: () => {
      tocouNoMapa.current = true
    },
    moveend: () => {
      if (mira && aoMoverMira) {
        const c = mapa.getCenter()
        aoMoverMira({ lat: c.lat, lng: c.lng })
      }
    },
    click: (e) => aoClicarMapa?.({ lat: e.latlng.lat, lng: e.latlng.lng }),
  })

  // O container muda de tamanho (painel abrindo, rotação do celular): o
  // Leaflet precisa recalcular, senão sobram faixas cinzas.
  useEffect(() => {
    const el = mapa.getContainer()
    const obs = new ResizeObserver(() => mapa.invalidateSize())
    obs.observe(el)
    return () => obs.disconnect()
  }, [mapa])

  // Centro explícito (ex.: posição do GPS chegou).
  const chaveCentro = centro ? `${centro.lat.toFixed(5)},${centro.lng.toFixed(5)}` : ''
  useEffect(() => {
    if (!centro) return
    return quandoParado(mapa, () => mapa.setView([centro.lat, centro.lng], Math.max(Math.round(mapa.getZoom()), zoom), { animate: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveCentro])

  // Enquadrar: só quando a COMPOSIÇÃO muda (entra/sai marcador) ou antes de
  // a pessoa mexer no mapa — enquadrar a cada posição nova tiraria o mapa da
  // mão de quem está olhando.
  const composicao = marcadores.map((m) => m.id).sort().join('|')
  useEffect(() => {
    if (!enquadrar || centro || mira) return
    const pontos = marcadores.map((m) => m.ponto)
    if (!pontos.length) return
    if (pontos.length === 1) {
      return quandoParado(mapa, () => mapa.setView([pontos[0].lat, pontos[0].lng], Math.max(zoom, 14), { animate: true }))
    }
    const limites = L.latLngBounds(pontos.map((p) => [p.lat, p.lng] as [number, number]))
    return quandoParado(mapa, () =>
      mapa.fitBounds(limites, {
        paddingTopLeft: [48, 48],
        paddingBottomRight: [48, 48 + margemInferior],
        maxZoom: 16,
        animate: true,
      }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composicao, enquadrar, margemInferior])

  // Seguir: mecânico em movimento continua no centro, a menos que a pessoa
  // tenha arrastado o mapa para olhar outra coisa.
  const chaveSeguir = seguir ? `${seguir.lat.toFixed(5)},${seguir.lng.toFixed(5)}` : ''
  useEffect(() => {
    if (!seguir || tocouNoMapa.current) return
    mapa.panTo([seguir.lat, seguir.lng], { animate: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveSeguir])

  return null
}

/** Botão flutuante padrão sobre o mapa (recentralizar, camadas…). */
export function BotaoMapa({
  rotulo,
  onClick,
  children,
  className,
}: {
  rotulo: string
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      onClick={onClick}
      className={[
        'mapa-botao-premium flex size-11 items-center justify-center rounded-full text-[#081830] transition-transform active:scale-95 [&>svg]:size-5',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  )
}

/**
 * Dá acesso à instância do Leaflet para botões que ficam fora do mapa
 * (recentralizar, enquadrar). Coloque `<CapturaMapa destino={ref} />` como
 * filho de `<MapaSOS>` e use `centralizarMapa`/`enquadrarMapa` com o ref.
 */
export function CapturaMapa({ destino }: { destino: MutableRefObject<L.Map | null> }) {
  destino.current = useMap()
  return null
}

/**
 * O Leaflet descarta em silêncio um `setView`/`fitBounds` animado pedido
 * enquanto ainda anima o zoom anterior (enquadramento automático, pinça,
 * roda do mouse), e um voo começado nessa hora é puxado de volta quando a
 * animação antiga termina — o toque no chamado parecia não levar a lugar
 * nenhum. Espera o zoom em curso acabar e só então move a câmera. Devolve o
 * cancelamento, para efeitos que desmontam antes disso.
 */
function quandoParado(mapa: L.Map, mover: () => void): () => void {
  if (!(mapa as unknown as { _animatingZoom?: boolean })._animatingZoom) {
    mover()
    return () => {}
  }
  mapa.once('zoomend', mover)
  return () => void mapa.off('zoomend', mover)
}

/** Mapa sem tamanho (escondido, ainda montando): o voo do Leaflet divide por zero e deixa o centro em NaN. */
function temTamanho(mapa: L.Map): boolean {
  const t = mapa.getSize()
  return t.x > 0 && t.y > 0
}

export function centralizarMapa(mapa: L.Map | null, p: Ponto, zoom?: number) {
  if (!mapa) return
  quandoParado(mapa, () => mapa.setView([p.lat, p.lng], zoom ?? Math.max(Math.round(mapa.getZoom()), 15), { animate: true }))
}

export function enquadrarMapa(mapa: L.Map | null, pontos: Ponto[], margemInferior = 0) {
  if (!mapa || !pontos.length) return
  quandoParado(mapa, () => {
    if (pontos.length === 1) {
      mapa.setView([pontos[0].lat, pontos[0].lng], 15, { animate: true })
      return
    }
    mapa.fitBounds(L.latLngBounds(pontos.map((p) => [p.lat, p.lng] as [number, number])), {
      paddingTopLeft: [48, 48],
      paddingBottomRight: [48, 48 + margemInferior],
      maxZoom: 16,
      animate: true,
    })
  })
}

export interface OpcoesFoco {
  /** Zoom mínimo ao focar um ponto só (quem já está mais perto não é afastado). */
  zoom?: number
  /** Faixa coberta por peças sobre o mapa (legenda em cima, cartão embaixo), em px. */
  margemTopo?: number
  margemInferior?: number
}

/**
 * Leva a câmera até um ou mais pontos com voo animado — o olho acompanha o
 * trajeto e entende para onde o mapa foi. Um ponto fica no meio da área
 * livre (entre a legenda e o cartão de baixo), não escondido atrás deles;
 * vários são enquadrados juntos. Com "reduzir movimento" ligado, corta direto.
 *
 * Não chama `mapa.stop()` antes: com o zoom fracionado de um voo interrompido
 * (dois toques seguidos na fila), o `stop()` dispara uma animação de zoom que
 * brigava com o voo novo. O próprio voo já cancela o anterior.
 */
export function focarMapa(mapa: L.Map | null, pontos: Ponto[], opcoes: OpcoesFoco = {}) {
  if (!mapa || !pontos.length) return
  quandoParado(mapa, () => voar(mapa, pontos, opcoes))
}

function voar(mapa: L.Map, pontos: Ponto[], { zoom = 15, margemTopo = 0, margemInferior = 0 }: OpcoesFoco) {
  const visivel = temTamanho(mapa)
  const animar = visivel && !(typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  // Zoom inteiro: depois de um voo interrompido o mapa pode estar em 12,77, e
  // os ladrilhos ficariam borrados no zoom quebrado.
  const zoomAtual = Math.round(mapa.getZoom())

  if (pontos.length === 1) {
    const z = Math.max(zoomAtual, zoom)
    // Escondido não há área livre para descontar: centraliza no ponto.
    const deslocamento = visivel ? (margemInferior - margemTopo) / 2 : 0
    const centro = mapa.unproject(mapa.project([pontos[0].lat, pontos[0].lng], z).add([0, deslocamento]), z)
    if (animar) mapa.flyTo(centro, z, { duration: 0.75 })
    else mapa.setView(centro, z, { animate: false })
    return
  }

  const limites = L.latLngBounds(pontos.map((p) => [p.lat, p.lng] as [number, number]))
  if (!visivel) {
    mapa.setView(limites.getCenter(), Math.max(zoomAtual, 12), { animate: false })
    return
  }
  const folga = {
    paddingTopLeft: L.point(40, 28 + margemTopo),
    paddingBottomRight: L.point(40, 28 + margemInferior),
    maxZoom: 16,
  }
  if (animar) mapa.flyToBounds(limites, { ...folga, duration: 0.75 })
  else mapa.fitBounds(limites, { ...folga, animate: false })
}

export type { Map as MapaLeaflet } from 'leaflet'
