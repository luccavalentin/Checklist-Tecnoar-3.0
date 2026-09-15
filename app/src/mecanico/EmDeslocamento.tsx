import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { Check, ChevronDown, ChevronLeft, ChevronUp, Headset, LocateFixed, MapPinned, Maximize2, Share2, Timer } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/componentes/ui/Toast'
import { tocarAlerta, vibrarAlerta } from '@/sos/alerta'
import { LinhaDoTempo } from '@/sos/componentes'
import { calcularRota, distanciaKm, pontoDe, type ErroGPS, type LeituraGPS, type Ponto, type Rota } from '@/sos/geo'
import { BotaoMapa, MapaSOS, type MapaLeaflet, type MarcadorMapa } from '@/sos/Mapa'
import { STATUS_SOS, formatarDistancia, formatarEta, formatarPlacaExibicao, horaCurta, linkTelefone } from '@/sos/rotulos'
import type { DetalheChamado } from '@/sos/tipos'
import { compartilharAcompanhamento, temaDoMapa, useAgora, useInfoCentral, useMidia, useOnline } from './dados'
import { BotaoIrAteCliente } from './EscolherNavegador'
import { FaixaFila } from './FilaPendente'
import { KitIa } from './Ia'
import { FaixasCampo, Placa } from './pecas'
import { AtalhosContato, FolhaConversa, LocalCliente, ProblemaRelatado, modeloVeiculo, useAvancar } from './PecasAtendimento'
import { BotaoM, CartaoM, FolhaM, RotuloM, SeloM } from './ui'

/** Abaixo disto o GPS diz "chegou" — o botão se destaca, mas nunca avança sozinho. */
const RAIO_CHEGADA_KM = 0.15
/** Acima disto, "cheguei" pede confirmação: o pino ou o GPS podem estar errados. */
const LONGE_KM = 0.5

type Camera = 'ambos' | 'eu' | 'livre'

/**
 * A CAMINHO DO CLIENTE — mapa grande com os dois pontos e a rota; embaixo,
 * só o que importa dirigindo: quanto falta, para quem, contato e os dois
 * botões: ABRIR NO GOOGLE MAPS e CHEGUEI AO LOCAL.
 *
 * O aceite já avisou o cliente e a central e ligou o compartilhamento da
 * posição (o rastreio roda na tela do chamado). Abrir a rota marca "a
 * caminho"; "cheguei" com o chamado ainda em "aceito" manda as duas etapas,
 * na ordem (o banco não deixa pular).
 */
export function EmDeslocamento({
  d,
  rastreio,
}: {
  d: DetalheChamado
  rastreio: { posicao: LeituraGPS | null; erroGps: ErroGPS | null; semRede: boolean }
}) {
  const navegar = useNavigate()
  const toast = useToast()
  const online = useOnline()
  const agora = useAgora(30_000)
  const central = useInfoCentral()
  const c = d.chamado
  const avancar = useAvancar(c.id)

  const [camera, setCamera] = useState<Camera>('ambos')
  const [detalhes, setDetalhes] = useState(false)
  const [conversa, setConversa] = useState(false)
  const [longe, setLonge] = useState<number | null>(null)
  const [compartilhando, setCompartilhando] = useState(false)
  const folha = useRef<HTMLDivElement>(null)
  const [alturaFolha, setAlturaFolha] = useState(360)
  const topo = useRef<HTMLDivElement>(null)
  const [alturaTopo, setAlturaTopo] = useState(64)
  // Tablet (ou celular deitado largo): painel ao lado do mapa, não por cima.
  const lateral = useMidia('(min-width: 768px)')
  const margem = lateral ? 0 : alturaFolha

  const cliente = pontoDe(c)
  // Sem GPS agora, vale a última posição que o banco tem de mim.
  const eu: Ponto | null = rastreio.posicao ? { lat: rastreio.posicao.lat, lng: rastreio.posicao.lng } : pontoDe(d.mecanico)

  // O mapa desconta o painel: enquadra os pinos na parte que sobra visível.
  const detalhesRef = useRef(detalhes)
  detalhesRef.current = detalhes
  useEffect(() => {
    const el = folha.current
    if (!el) return
    const obs = new ResizeObserver(() => {
      if (!detalhesRef.current) setAlturaFolha(el.offsetHeight)
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  useEffect(() => {
    const el = topo.current
    if (!el) return
    const obs = new ResizeObserver(() => setAlturaTopo(el.offsetHeight))
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  /* ── rota: recalcula quando andou mais de ~150 m ou o cliente mudou ── */
  const [rota, setRota] = useState<Rota | null>(null)
  const origemRota = useRef<Ponto | null>(null)
  const destinoRota = useRef('')
  const pedido = useRef(0)
  useEffect(() => {
    if (!eu || !cliente) return
    const chaveDestino = `${cliente.lat.toFixed(4)},${cliente.lng.toFixed(4)}`
    const andou = !origemRota.current || distanciaKm(origemRota.current, eu) > 0.15
    if (!andou && chaveDestino === destinoRota.current) return
    origemRota.current = eu
    destinoRota.current = chaveDestino
    const n = ++pedido.current
    void calcularRota(eu, cliente).then((r) => {
      if (n === pedido.current) setRota(r)
    })
  }, [eu?.lat, eu?.lng, cliente?.lat, cliente?.lng]) // eslint-disable-line react-hooks/exhaustive-deps

  const retaKm = eu && cliente ? distanciaKm(eu, cliente) : null
  const perto = retaKm != null && retaKm < RAIO_CHEGADA_KM
  const distancia = perto ? retaKm : rota?.distanciaKm ?? (retaKm != null ? retaKm * 1.3 : c.distancia_km)
  const eta = perto ? 1 : rota?.duracaoMin ?? c.eta_min ?? (distancia != null ? Math.max(1, Math.ceil((distancia / 40) * 60)) : null)
  const chegada = eta != null ? horaCurta(new Date(agora + eta * 60_000).toISOString()) : null

  // Entrou no raio do cliente: um bipe e vibração, uma vez.
  const avisouPerto = useRef(false)
  useEffect(() => {
    if (perto && !avisouPerto.current) {
      avisouPerto.current = true
      tocarAlerta({ tipo: 'aviso' })
      vibrarAlerta('aviso')
    }
    if (!perto && retaKm != null && retaKm > RAIO_CHEGADA_KM * 2) avisouPerto.current = false
  }, [perto, retaKm])

  const marcadores = useMemo<MarcadorMapa[]>(() => {
    const m: MarcadorMapa[] = []
    if (cliente)
      m.push({
        id: 'cliente',
        tipo: 'cliente',
        ponto: cliente,
        rotulo: d.veiculo?.placa ? formatarPlacaExibicao(d.veiculo.placa) : d.cliente?.nome ?? 'Cliente',
        pulsar: true,
      })
    if (eu) m.push({ id: 'eu', tipo: 'eu', ponto: eu, pulsar: true, precisao: rastreio.posicao?.precisao ?? null })
    return m
  }, [cliente?.lat, cliente?.lng, eu?.lat, eu?.lng, d.veiculo?.placa, d.cliente?.nome]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Abriu a rota: o cliente passa a ver "a caminho". */
  function saiu() {
    if (c.status === 'aceito' && !avancar.isPending) avancar.mutate({ status: 'a_caminho', reserva: rastreio.posicao })
  }

  function chegar() {
    // Ainda em "aceito" (não abriu a rota pelo app): manda "a caminho" e "no local", na ordem.
    if (c.status === 'aceito') {
      avancar.mutate({ status: 'a_caminho', reserva: rastreio.posicao }, { onSuccess: () => avancar.mutate({ status: 'no_local', reserva: rastreio.posicao }) })
      return
    }
    avancar.mutate({ status: 'no_local', reserva: rastreio.posicao })
  }

  function cheguei() {
    if (retaKm != null && retaKm > LONGE_KM) return setLonge(retaKm)
    chegar()
  }

  async function compartilhar() {
    setCompartilhando(true)
    try {
      const r = await compartilharAcompanhamento(c.id, c.protocolo)
      if (r === 'copiado') toast.ok('Link copiado', 'Cole na conversa com quem vai acompanhar.')
    } catch (e) {
      toast.erro('Não foi possível compartilhar', (e as Error).message)
    } finally {
      setCompartilhando(false)
    }
  }

  const veiculo = modeloVeiculo(d)

  return (
    <div className="mec fixed inset-0 overflow-hidden bg-canvas text-ink">
      {/* Mapa: tela inteira no celular; no tablet, à esquerda do painel. */}
      <div className="absolute inset-0 md:right-[400px] lg:right-[440px]">
        <MapaSOS
          marcadores={marcadores}
          rota={rota?.pontos ?? (eu && cliente ? [eu, cliente] : null)}
          rotaEstimada={!rota?.real}
          enquadrar={false}
          tema={temaDoMapa()}
          margemInferior={margem}
          className="size-full"
        >
          <CameraAtendimento camera={camera} eu={eu} cliente={cliente} margemInferior={margem} margemSuperior={alturaTopo} aoArrastar={() => setCamera('livre')} />
        </MapaSOS>

        {/* topo: voltar, etapa e avisos de sinal */}
        <div ref={topo} className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-2 px-3 pt-[calc(env(safe-area-inset-top)+0.6rem)]">
          <div className="pointer-events-auto flex items-center gap-2">
            <BotaoMapa rotulo="Voltar ao início" onClick={() => navegar('/')}>
              <ChevronLeft />
            </BotaoMapa>
            <div className="flex min-w-0 items-center gap-2 rounded-full bg-[#0D1C33] py-2.5 pr-4 pl-3.5 text-white shadow-[0_6px_20px_rgb(8_24_48/0.35)]">
              <span className="relative flex size-2.5 shrink-0" aria-hidden>
                <span className="mec-pulso absolute inset-0 rounded-full bg-accent" />
                <span className="relative size-2.5 rounded-full bg-accent" />
              </span>
              <span className="truncate font-display text-[13.5px] font-extrabold tracking-[0.08em] uppercase">A caminho do cliente</span>
            </div>
          </div>
          <FaixasCampo online={online} semRede={rastreio.semRede} erroGps={rastreio.erroGps} className="pointer-events-auto max-w-md" />
        </div>

        {/* câmera */}
        <div className="absolute right-3 z-10 flex flex-col gap-2 transition-[bottom] duration-200" style={{ bottom: margem + 12 }}>
          <BotaoMapa rotulo="Ver eu e o cliente" onClick={() => setCamera('ambos')} className={camera === 'ambos' ? 'bg-[#0D1C33]! text-white!' : ''}>
            <Maximize2 />
          </BotaoMapa>
          <BotaoMapa rotulo="Seguir minha posição" onClick={() => setCamera('eu')} className={camera === 'eu' ? 'bg-accent! text-white!' : ''}>
            <LocateFixed />
          </BotaoMapa>
        </div>
      </div>

      {/* Painel: sobe de baixo no celular; coluna fixa à direita no tablet. */}
      <div
        ref={folha}
        className="absolute inset-x-0 bottom-0 z-20 mx-auto flex max-h-[88dvh] max-w-xl flex-col rounded-t-[1.75rem] border-t border-line bg-surface shadow-[0_-12px_36px_-18px_rgb(2_8_18/0.7)] sm:bottom-3 sm:rounded-[1.75rem] sm:border md:inset-y-0 md:right-0 md:left-auto md:mx-0 md:max-h-none md:w-[400px] md:max-w-none md:rounded-none md:border-y-0 md:border-r-0 md:border-l md:pt-[env(safe-area-inset-top)] lg:w-[440px]"
      >
        <div className="flex w-full shrink-0 justify-center pt-2.5 pb-1 md:hidden" aria-hidden>
          <span className="h-1.5 w-11 rounded-full bg-line-strong" />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-5 md:pt-4">
          {/* quanto falta */}
          <div className="flex items-center justify-between gap-2">
            <SeloM tom={c.status === 'aceito' ? 'ambar' : 'laranja'} ponto>
              {STATUS_SOS[c.status].curto}
            </SeloM>
            <p className="min-w-0 truncate text-right text-[13px] text-ink-3">
              {perto ? 'Você está no ponto do cliente' : chegada ? `Chegada ≈ ${chegada}` : 'Sem previsão agora'}
              {!perto && rota && !rota.real ? ' · estimado' : ''}
            </p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <RotuloM>Distância</RotuloM>
              <p className="num mt-1 text-[32px] leading-none font-semibold tracking-tight whitespace-nowrap text-ink max-[359px]:text-[27px]">{perto ? 'Chegou' : formatarDistancia(distancia)}</p>
            </div>
            <div className="min-w-0">
              <RotuloM>Tempo</RotuloM>
              <p className="num mt-1 text-[32px] leading-none font-semibold tracking-tight whitespace-nowrap text-accent-ink max-[359px]:text-[27px]">{perto ? '0 min' : formatarEta(eta)}</p>
            </div>
          </div>

          {c.sla_chegada_min ? <PrazoContrato recebidoEm={c.recebido_em} prazoMin={c.sla_chegada_min} etaMin={perto ? 0 : eta} /> : null}

          {/* cliente e veículo */}
          <div className="mt-3 flex flex-col gap-1 rounded-2xl border border-line bg-surface-2 px-3.5 py-2.5">
            <p className="truncate text-[15.5px] leading-snug font-bold text-ink">
              <span className="sr-only">Cliente: </span>
              {d.cliente?.nome ?? 'Cliente'}
            </p>
            <div className="flex min-w-0 items-center gap-2">
              <span className="sr-only">Veículo: </span>
              {veiculo && <span className="truncate text-[14.5px] font-semibold text-ink-2">{veiculo}</span>}
              <Placa placa={d.veiculo?.placa} tamanho="sm" />
            </div>
          </div>

          <FaixaFila chamadoId={c.id} className="mt-3" />

          <div className="mt-3">
            <AtalhosContato d={d} aoConversa={() => setConversa(true)} />
          </div>

          {perto && (
            <div className="entrada-suave mt-3 flex items-center gap-2.5 rounded-2xl bg-ok-soft px-3.5 py-3 text-[14px] font-semibold text-ok-ink" role="status">
              <MapPinned className="size-5 shrink-0" /> Você chegou? Toque em Cheguei ao local.
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2">
            <BotaoIrAteCliente destino={cliente} origem={eu} aoAbrir={saiu} />
            <BotaoM
              variante="verde"
              tamanho="xxl"
              largo
              icone={Check}
              carregando={avancar.isPending}
              onClick={cheguei}
              className={cn(perto && 'ring-4 ring-ok/40')}
            >
              Cheguei ao local
            </BotaoM>
            {!online && <p className="text-center text-[13px] font-medium text-warn-ink">Sem sinal: pode tocar — fica guardado e envia sozinho quando a internet voltar.</p>}
          </div>

          {!lateral && (
            <button
              type="button"
              onClick={() => setDetalhes((v) => !v)}
              aria-expanded={detalhes}
              className="mt-2 flex min-h-12 w-full items-center justify-center gap-1.5 text-[14px] font-semibold text-ink-2"
            >
              {detalhes ? (
                <>
                  Recolher <ChevronDown className="size-4" />
                </>
              ) : (
                <>
                  Problema, local e mais <ChevronUp className="size-4" />
                </>
              )}
            </button>
          )}

          {(lateral || detalhes) && (
            <div className="entrada-suave flex flex-col gap-3 pt-1 md:pt-4">
              <CartaoM>
                <RotuloM className="mb-2">Problema informado</RotuloM>
                <ProblemaRelatado d={d} />
              </CartaoM>
              <KitIa d={d} podeLancar={false} compacto />
              <CartaoM>
                <RotuloM className="mb-2">Local do cliente</RotuloM>
                <LocalCliente d={d} />
              </CartaoM>
              <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                <BotaoM variante="neutro" tamanho="lg" icone={Share2} carregando={compartilhando} disabled={!online} onClick={() => void compartilhar()}>
                  Compartilhar localização
                </BotaoM>
                {central.data?.telefone && (
                  <a
                    href={linkTelefone(central.data.telefone) ?? undefined}
                    className="flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 px-4 font-display text-[15px] font-extrabold text-ink"
                  >
                    <Headset className="size-5" /> Falar com a central
                  </a>
                )}
              </div>
              <details className="rounded-[1.25rem] border border-line bg-surface p-4">
                <summary className="cursor-pointer font-display text-[12px] font-extrabold tracking-[0.14em] text-ink-3 uppercase">Linha do tempo</summary>
                <div className="mt-3">
                  <LinhaDoTempo eventos={d.eventos} />
                </div>
              </details>
            </div>
          )}
        </div>
      </div>

      <FolhaConversa aberta={conversa} aoFechar={() => setConversa(false)} d={d} />

      <FolhaM
        aberta={longe != null}
        aoFechar={() => setLonge(null)}
        titulo="Confirmar chegada?"
        descricao={`Seu GPS indica ${formatarDistancia(longe)} do ponto marcado pelo cliente. Se você já está com ele, confirme — a central verá a distância registrada.`}
        rodape={
          <>
            <BotaoM
              variante="verde"
              tamanho="xl"
              largo
              icone={Check}
              carregando={avancar.isPending}
              onClick={() => {
                setLonge(null)
                chegar()
              }}
            >
              Cheguei ao local
            </BotaoM>
            <BotaoM variante="fantasma" tamanho="lg" largo onClick={() => setLonge(null)}>
              Ainda não cheguei
            </BotaoM>
          </>
        }
      />
    </div>
  )
}

/**
 * Prazo de chegada do contrato do frotista, contado desde que o SOS chegou à
 * Tecnoar. Verde com folga; âmbar nos últimos 10 min ou quando a rota já não
 * chega a tempo; vermelho cheio depois de vencido — lê-se de relance, ao sol.
 */
function PrazoContrato({ recebidoEm, prazoMin, etaMin }: { recebidoEm: string; prazoMin: number; etaMin: number | null }) {
  const agora = useAgora(15_000)
  const limite = Date.parse(recebidoEm) + prazoMin * 60_000
  const resta = (limite - agora) / 60_000
  const vencido = resta < 0
  const naoDa = !vencido && etaMin != null && etaMin > resta + 1
  const apertado = !vencido && (resta <= 10 || naoDa)
  const hora = horaCurta(new Date(limite).toISOString())

  return (
    <div
      role="status"
      className={cn('mt-3 flex items-center gap-3 rounded-2xl px-3.5 py-2.5', vencido ? 'bg-[#ff6600] text-white' : apertado ? 'bg-warn-soft text-warn-ink' : 'bg-ok-soft text-ok-ink')}
    >
      <Timer className={cn('size-6 shrink-0', vencido && 'sos-piscar')} strokeWidth={2.4} />
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] leading-tight font-bold">Contrato: chegar até {hora}</p>
        <p className={cn('mt-0.5 text-[12.5px] leading-snug font-medium', vencido ? 'text-white/85' : 'text-ink-2')}>
          {vencido ? 'Prazo vencido — avise o cliente.' : naoDa ? 'Pela rota, a chegada passa do prazo.' : `Prazo de ${formatarEta(prazoMin)} desde o pedido.`}
        </p>
      </div>
      <span className="num shrink-0 text-right text-[20px] leading-none font-semibold">
        {vencido ? `+${formatarEta(Math.max(1, Math.floor(-resta)))}` : formatarEta(Math.max(1, Math.ceil(resta)))}
        <span className={cn('block pt-0.5 text-[10.5px] font-bold tracking-[0.08em] uppercase', vencido ? 'text-white/80' : 'opacity-80')}>{vencido ? 'atrasado' : 'restam'}</span>
      </span>
    </div>
  )
}

/**
 * Câmera do mapa. "Ambos" mantém eu e o cliente na tela (vai aproximando
 * sozinho conforme chego); "eu" segue minha posição; arrastar o mapa solta a
 * câmera até tocar num dos botões. O centro desconta o painel de baixo.
 */
function CameraAtendimento({
  camera,
  eu,
  cliente,
  margemInferior,
  margemSuperior,
  aoArrastar,
}: {
  camera: Camera
  eu: Ponto | null
  cliente: Ponto | null
  margemInferior: number
  margemSuperior: number
  aoArrastar: () => void
}) {
  const mapa = useMap() as MapaLeaflet
  useMapEvents({ dragstart: aoArrastar })
  const chave = [camera, eu?.lat.toFixed(5), eu?.lng.toFixed(5), cliente?.lat.toFixed(5), cliente?.lng.toFixed(5), Math.round(margemInferior / 20), Math.round(margemSuperior / 20)].join('|')

  useEffect(() => {
    if (camera === 'livre') return
    const aplicar = () => {
      if (camera === 'ambos') {
        const pontos = [eu, cliente].filter((p): p is Ponto => !!p)
        if (!pontos.length) return
        if (pontos.length === 1) return void mapa.setView([pontos[0].lat, pontos[0].lng], 15, { animate: true })
        mapa.fitBounds(L.latLngBounds(pontos.map((p) => [p.lat, p.lng] as [number, number])), {
          paddingTopLeft: [44, margemSuperior + 28],
          paddingBottomRight: [64, margemInferior + 28],
          maxZoom: 16,
          animate: true,
        })
        return
      }
      const alvo = eu ?? cliente
      if (!alvo) return
      const z = Math.max(mapa.getZoom(), 16)
      const p = mapa.project([alvo.lat, alvo.lng], z).add([0, (margemInferior - margemSuperior) / 2])
      mapa.setView(mapa.unproject(p, z), z, { animate: true })
    }
    // O Leaflet ignora um novo zoom enquanto anima o anterior (o painel mede
    // a altura logo depois de abrir): espera a animação terminar.
    const animando = (mapa as unknown as { _animatingZoom?: boolean })._animatingZoom
    if (animando) {
      mapa.once('zoomend', aplicar)
      return () => void mapa.off('zoomend', aplicar)
    }
    aplicar()
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
