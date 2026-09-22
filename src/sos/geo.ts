/**
 * Localização para o SOS: GPS do aparelho, endereço a partir do ponto e rota
 * entre mecânico e cliente.
 *
 * Serviços externos gratuitos e sem chave:
 * - Endereço: Nominatim (OpenStreetMap). Política de uso: no máximo 1
 *   requisição por segundo — por isso há cache e a chamada só acontece quando
 *   o ponto muda de verdade.
 * - Rota: OSRM público. Se falhar (limite, rede), o mapa cai para a linha reta
 *   e a previsão usa a velocidade média configurada na central. Nunca trava.
 */

import { ehAppNativo, observarNativo, permissaoNativa, type AvisoSegundoPlano } from './geoNativo'

export interface Ponto {
  lat: number
  lng: number
}

export interface LeituraGPS extends Ponto {
  precisao: number | null
  velocidade: number | null
  rumo: number | null
  em: number
}

export type ErroGPS = 'negado' | 'indisponivel' | 'tempo' | 'sem_suporte'

export function mensagemErroGPS(e: ErroGPS): string {
  switch (e) {
    case 'negado':
      return 'A localização está bloqueada para este app. Libere nas configurações do aparelho ou marque o ponto no mapa.'
    case 'indisponivel':
      return 'Não foi possível achar sua posição agora. Vá para um lugar aberto ou marque o ponto no mapa.'
    case 'tempo':
      return 'O GPS demorou para responder. Tente de novo ou marque o ponto no mapa.'
    default:
      return 'Este aparelho não informa localização. Marque o ponto no mapa.'
  }
}

function converterErro(e: GeolocationPositionError): ErroGPS {
  if (e.code === e.PERMISSION_DENIED) return 'negado'
  if (e.code === e.TIMEOUT) return 'tempo'
  return 'indisponivel'
}

function leitura(p: GeolocationPosition): LeituraGPS {
  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    precisao: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
    velocidade: p.coords.speed ?? null,
    rumo: p.coords.heading ?? null,
    em: p.timestamp,
  }
}

/**
 * Liga o GPS e repassa cada leitura. No navegador, `navigator.geolocation`;
 * no app nativo, o serviço de localização do sistema (ver `geoNativo.ts`).
 */
function observar(
  aoLer: (l: LeituraGPS) => void,
  aoErro: (e: ErroGPS) => void,
  opcoes: { timeoutMs: number; segundoPlano?: AvisoSegundoPlano },
): () => void {
  if (ehAppNativo()) return observarNativo(aoLer, aoErro, opcoes)
  const id = navigator.geolocation.watchPosition(
    (p) => aoLer(leitura(p)),
    (e) => aoErro(converterErro(e)),
    { enableHighAccuracy: true, maximumAge: 0, timeout: opcoes.timeoutMs },
  )
  return () => navigator.geolocation.clearWatch(id)
}

function temGPS(): boolean {
  return ehAppNativo() || 'geolocation' in navigator
}

/**
 * Última leitura BOA (±50 m ou melhor) vinda de qualquer uso do GPS no app —
 * o rastreio, o mapa do SOS, o "cheguei". Um pedido rápido de posição usa
 * esta se for recente, em vez de aceitar a primeira leitura de antena.
 */
let ultimaBoa: LeituraGPS | null = null

function guardarSeBoa(l: LeituraGPS) {
  if (l.precisao != null && l.precisao <= 25) ultimaBoa = { ...l, em: Date.now() }
}

/** Leitura em cache, de antes do pedido. Relógio do GPS muito fora do aparelho não conta. */
function leituraAntiga(l: LeituraGPS, inicio: number): boolean {
  return Math.abs(Date.now() - l.em) < 86_400_000 && l.em < inicio - 1500
}

/**
 * Posição para uma ação rápida (ficar disponível, aceitar, "cheguei").
 * Antes aceitava a primeira resposta do celular — quase sempre de antena ou
 * Wi-Fi, errando centenas de metros. Agora: leitura boa recente se houver;
 * senão o GPS fica ligado até `timeoutMs` e devolve a MELHOR leitura
 * (sai antes ao chegar a ±20 m, ou com ±50 m depois de alguns segundos).
 */
export function posicaoAtual(opcoes: { timeoutMs?: number; maxIdadeMs?: number } = {}): Promise<LeituraGPS> {
  const tempoMax = opcoes.timeoutMs ?? 15000
  const maxIdade = opcoes.maxIdadeMs ?? 0
  if (ultimaBoa && maxIdade > 0 && Date.now() - ultimaBoa.em <= maxIdade && (ultimaBoa.precisao ?? Infinity) <= 20) {
    return Promise.resolve(ultimaBoa)
  }
  return posicaoPrecisa({
    alvoM: 10,
    aceitavelM: 25,
    bomBastanteMs: Math.min(4500, tempoMax / 2),
    tempoMaxMs: tempoMax,
  }).promessa
}

/**
 * Posição com EXATIDÃO: a primeira leitura do celular costuma vir de antena
 * ou Wi-Fi (±100 m a ±3 km) e leitura "guardada" pode ser de outro lugar.
 * Aqui só vale leitura nova (maximumAge 0, nada anterior ao pedido), o GPS
 * fica ligado e a melhor leitura vai sendo repassada (`aoMelhorar`) até:
 * - chegar a `alvoM` (padrão 10 m) — resolve na hora;
 * - passar `bomBastanteMs` com uma leitura de até `aceitavelM` (padrão 25 m);
 * - ou estourar `tempoMaxMs` — resolve com a melhor que houver.
 * Rejeita só se não vier nenhuma leitura. `cancelar` encerra o GPS.
 */
export function posicaoPrecisa(
  opcoes: {
    alvoM?: number
    aceitavelM?: number
    bomBastanteMs?: number
    tempoMaxMs?: number
    aoMelhorar?: (l: LeituraGPS) => void
  } = {},
): { promessa: Promise<LeituraGPS>; cancelar: () => void } {
  const alvo = opcoes.alvoM ?? 6
  const aceitavel = opcoes.aceitavelM ?? 15
  const bomBastante = opcoes.bomBastanteMs ?? 10000
  const tempoMax = opcoes.tempoMaxMs ?? 30000
  let cancelar = () => {}
  const promessa = new Promise<LeituraGPS>((resolve, reject) => {
    if (!temGPS()) return reject('sem_suporte' satisfies ErroGPS)
    const inicio = Date.now()
    let melhor: LeituraGPS | null = null
    let ultimoErro: ErroGPS = 'tempo'
    let fim = false
    const encerrar = () => {
      if (fim) return
      fim = true
      parar()
      window.clearTimeout(limite)
      window.clearInterval(checagem)
    }
    const concluir = () => {
      encerrar()
      if (melhor) resolve(melhor)
      else reject(ultimoErro)
    }
    const parar = observar(
      (l) => {
        // Leitura em cache de antes do pedido: pode ser de outro lugar.
        if (leituraAntiga(l, inicio)) return
        guardarSeBoa(l)
        if (melhor && (l.precisao ?? Infinity) >= (melhor.precisao ?? Infinity)) return
        melhor = l
        opcoes.aoMelhorar?.(l)
        if (l.precisao != null && l.precisao <= alvo) concluir()
      },
      (e) => {
        ultimoErro = e
        // Permissão negada não melhora esperando.
        if (ultimoErro === 'negado') concluir()
      },
      { timeoutMs: tempoMax },
    )
    const checagem = window.setInterval(() => {
      if (Date.now() - inicio >= bomBastante && melhor?.precisao != null && melhor.precisao <= aceitavel) concluir()
    }, 500)
    const limite = window.setTimeout(concluir, tempoMax)
    cancelar = encerrar
  })
  return { promessa, cancelar: () => cancelar() }
}

/**
 * Acompanha a posição e só repassa quando vale a pena: andou mais que
 * `minMetros` ou passou `maxIntervaloMs` desde o último envio. O GPS do
 * celular dispara várias vezes por segundo; mandar tudo ao servidor gastaria
 * bateria e dados do motorista parado na estrada.
 *
 * `segundoPlano`: no app nativo, continua com a tela desligada ou o app
 * minimizado, com uma notificação fixa (título e texto) avisando.
 */
export function acompanharPosicao(
  aoMudar: (l: LeituraGPS) => void,
  aoErro?: (e: ErroGPS) => void,
  opcoes: { minMetros?: number; maxIntervaloMs?: number; minIntervaloMs?: number; segundoPlano?: AvisoSegundoPlano } = {},
): () => void {
  if (!temGPS()) {
    aoErro?.('sem_suporte')
    return () => {}
  }
  const minMetros = opcoes.minMetros ?? 25
  const maxIntervalo = opcoes.maxIntervaloMs ?? 20000
  const minIntervalo = opcoes.minIntervaloMs ?? 4000
  let ultima: LeituraGPS | null = null
  return observar(
    (l) => {
      const agora = Date.now()
      guardarSeBoa(l)
      if (ultima) {
        const tempo = agora - ultima.em
        const metros = distanciaKm(ultima, l) * 1000
        const pUltima = ultima.precisao ?? Infinity
        const pNova = l.precisao ?? Infinity
        // Leitura de antena depois de uma de GPS: o ponto "pula" centenas de
        // metros sem o carro sair do lugar. Só aceita se a boa já envelheceu.
        const pior = pNova > 35 && pNova > pUltima * 1.5
        if (pior && tempo < 120_000) return
        // O GPS "firmou" (a primeira foi de antena): manda já, sem esperar.
        const firmou = pUltima > 30 && pNova <= pUltima / 2
        if (!firmou) {
          if (tempo < minIntervalo) return
          // Deslocamento menor que o erro da leitura é ruído, não movimento.
          if (metros < Math.max(minMetros, Math.min(pNova, 100)) && tempo < maxIntervalo) return
        }
      }
      ultima = { ...l, em: agora }
      aoMudar(l)
    },
    (e) => aoErro?.(e),
    { timeoutMs: 30000, segundoPlano: opcoes.segundoPlano },
  )
}

/** Estado da permissão sem disparar o pedido (Safari antigo não informa). */
export async function permissaoLocalizacao(): Promise<'granted' | 'denied' | 'prompt' | 'desconhecida'> {
  if (ehAppNativo()) return permissaoNativa()
  try {
    const r = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
    return (r?.state as 'granted' | 'denied' | 'prompt') ?? 'desconhecida'
  } catch {
    return 'desconhecida'
  }
}

/* ── distância ──────────────────────────────────────────────────────────── */

export function distanciaKm(a: Ponto, b: Ponto): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

export function pontoValido(p: { lat?: number | null; lng?: number | null } | null | undefined): p is Ponto {
  return !!p && typeof p.lat === 'number' && typeof p.lng === 'number' && Number.isFinite(p.lat) && Number.isFinite(p.lng)
}

export function pontoDe(o: { latitude?: number | null; longitude?: number | null } | null | undefined): Ponto | null {
  if (!o || o.latitude == null || o.longitude == null) return null
  return { lat: o.latitude, lng: o.longitude }
}

/* ── endereço ───────────────────────────────────────────────────────────── */

const cacheEndereco = new Map<string, string>()
let ultimaConsultaEndereco = 0

/**
 * Endereço legível de um ponto ("BR-116, km 245 — Guarulhos/SP"). Devolve
 * `null` sem lançar: endereço é conforto, a coordenada é o que vale.
 */
export async function enderecoDoPonto(p: Ponto): Promise<string | null> {
  const chave = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`
  const guardado = cacheEndereco.get(chave)
  if (guardado) return guardado
  const espera = 1100 - (Date.now() - ultimaConsultaEndereco)
  if (espera > 0) await new Promise((r) => setTimeout(r, espera))
  ultimaConsultaEndereco = Date.now()
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${p.lat}&lon=${p.lng}&zoom=17&addressdetails=1&accept-language=pt-BR`
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!r.ok) return null
    const j = (await r.json()) as {
      display_name?: string
      address?: Record<string, string>
    }
    const a = j.address ?? {}
    const via = a.road ?? a.highway ?? a.pedestrian ?? a.path ?? null
    const numero = a.house_number ? `, ${a.house_number}` : ''
    const bairro = a.suburb ?? a.neighbourhood ?? a.village ?? null
    const cidade = a.city ?? a.town ?? a.municipality ?? a.county ?? null
    const uf = (a['ISO3166-2-lvl4'] ?? '').replace('BR-', '') || a.state || null
    const partes = [via ? via + numero : null, bairro, [cidade, uf].filter(Boolean).join('/')].filter(Boolean)
    const texto = partes.length ? partes.join(' — ') : j.display_name ?? null
    if (texto) cacheEndereco.set(chave, texto)
    return texto
  } catch {
    return null
  }
}

/** Busca de lugar por texto (a pessoa digita a cidade ou a rodovia). */
export async function buscarLugar(texto: string): Promise<Array<Ponto & { nome: string }>> {
  if (texto.trim().length < 3) return []
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(texto)}`
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!r.ok) return []
    const j = (await r.json()) as Array<{ lat: string; lon: string; display_name: string }>
    return j.map((x) => ({ lat: Number(x.lat), lng: Number(x.lon), nome: x.display_name }))
  } catch {
    return []
  }
}

/* ── rota ───────────────────────────────────────────────────────────────── */

export interface Rota {
  pontos: Ponto[]
  distanciaKm: number
  duracaoMin: number
  /** `true` quando veio do OSRM; `false` = linha reta estimada. */
  real: boolean
}

const cacheRota = new Map<string, { rota: Rota; em: number }>()

/**
 * Rota pelas ruas. Cache de 60 s por par de pontos arredondado (≈ 100 m): o
 * mecânico andando não pede rota nova a cada leitura do GPS.
 */
export async function calcularRota(origem: Ponto, destino: Ponto, velocidadeMediaKmh = 40): Promise<Rota> {
  const chave = `${origem.lat.toFixed(3)},${origem.lng.toFixed(3)}>${destino.lat.toFixed(3)},${destino.lng.toFixed(3)}`
  const guardada = cacheRota.get(chave)
  if (guardada && Date.now() - guardada.em < 60000) return guardada.rota
  const reta = distanciaKm(origem, destino)
  const estimada: Rota = {
    pontos: [origem, destino],
    // Estrada raramente é reta: 1,3× a distância em linha reta é a média usual.
    distanciaKm: reta * 1.3,
    duracaoMin: Math.max(1, Math.ceil(((reta * 1.3) / velocidadeMediaKmh) * 60)),
    real: false,
  }
  try {
    const controle = new AbortController()
    const t = setTimeout(() => controle.abort(), 6000)
    const url = `https://router.project-osrm.org/route/v1/driving/${origem.lng},${origem.lat};${destino.lng},${destino.lat}?overview=full&geometries=geojson`
    const r = await fetch(url, { signal: controle.signal })
    clearTimeout(t)
    if (!r.ok) return estimada
    const j = (await r.json()) as {
      routes?: Array<{ distance: number; duration: number; geometry: { coordinates: Array<[number, number]> } }>
    }
    const melhor = j.routes?.[0]
    if (!melhor) return estimada
    const rota: Rota = {
      pontos: melhor.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
      distanciaKm: melhor.distance / 1000,
      // Caminhão anda mais devagar que carro de passeio: +15% sobre a estimativa do OSRM.
      duracaoMin: Math.max(1, Math.ceil((melhor.duration / 60) * 1.15)),
      real: true,
    }
    cacheRota.set(chave, { rota, em: Date.now() })
    return rota
  } catch {
    return estimada
  }
}

/* ── navegação no app de mapas do aparelho ──────────────────────────────── */

export function linkGoogleMaps(destino: Ponto, origem?: Ponto | null): string {
  const o = origem ? `&origin=${origem.lat},${origem.lng}` : ''
  return `https://www.google.com/maps/dir/?api=1${o}&destination=${destino.lat},${destino.lng}&travelmode=driving`
}

export function linkWaze(destino: Ponto): string {
  return `https://waze.com/ul?ll=${destino.lat},${destino.lng}&navigate=yes`
}

export function linkAppleMaps(destino: Ponto): string {
  return `https://maps.apple.com/?daddr=${destino.lat},${destino.lng}&dirflg=d`
}

export function linkVerNoMapa(p: Ponto): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`
}

export function ehApple(): boolean {
  const ua = navigator.userAgent
  return /iPad|iPhone|iPod|Macintosh/.test(ua) && 'ontouchend' in document
}

export function formatarCoordenadas(p: Ponto): string {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`
}
