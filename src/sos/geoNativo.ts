/**
 * Localização no app nativo (Android e iOS, via Capacitor).
 *
 * No navegador o GPS vem do `navigator.geolocation`. Dentro do app instalado
 * pela loja, a posição vem do serviço de localização do próprio sistema — no
 * Android, o Fused Location do Google, que combina GPS, Wi-Fi, antenas da
 * operadora e Bluetooth; no iOS, o Core Location. Acha a pessoa mais rápido e
 * funciona onde o GPS sozinho demora (dentro de galpão, entre prédios).
 *
 * O rastreio de chamado continua com a tela desligada ou o app minimizado
 * (`segundoPlano`), com a notificação fixa que o Android exige para isso.
 *
 * Os plugins só são carregados dentro do app nativo: o site não baixa nada
 * disso.
 */

export interface LeituraNativa {
  lat: number
  lng: number
  precisao: number | null
  velocidade: number | null
  rumo: number | null
  em: number
}

export type ErroNativo = 'negado' | 'indisponivel' | 'tempo'

export interface AvisoSegundoPlano {
  titulo: string
  mensagem: string
}

/** Está rodando dentro do app instalado (Android/iOS), não no navegador. */
export function ehAppNativo(): boolean {
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!cap?.isNativePlatform?.()
}

function numero(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function converterErro(e: unknown): ErroNativo {
  const texto = `${(e as { code?: string })?.code ?? ''} ${(e as Error)?.message ?? e ?? ''}`
  if (/NOT_AUTHORIZED|denied|permission|negad/i.test(texto)) return 'negado'
  if (/time.?out/i.test(texto)) return 'tempo'
  return 'indisponivel'
}

/**
 * Acompanha a posição pelo serviço do sistema. Devolve a função que para.
 * Com `segundoPlano`, segue enviando com a tela desligada.
 */
export function observarNativo(
  aoLer: (l: LeituraNativa) => void,
  aoErro: (e: ErroNativo) => void,
  opcoes: { segundoPlano?: AvisoSegundoPlano; distanciaMinM?: number; timeoutMs?: number } = {},
): () => void {
  let parado = false
  let parar: () => void = () => {}

  if (opcoes.segundoPlano) {
    const aviso = opcoes.segundoPlano
    void (async () => {
      try {
        const { BackgroundGeolocation } = await import('./plugins/segundoPlano')
        if (parado) return
        const id = await BackgroundGeolocation.addWatcher(
          {
            backgroundTitle: aviso.titulo,
            backgroundMessage: aviso.mensagem,
            requestPermissions: true,
            stale: false,
            distanceFilter: opcoes.distanciaMinM ?? 0,
          },
          (local, erro) => {
            if (erro) return aoErro(converterErro(erro))
            if (!local) return
            aoLer({
              lat: local.latitude,
              lng: local.longitude,
              precisao: numero(local.accuracy),
              velocidade: numero(local.speed),
              rumo: numero(local.bearing),
              em: numero(local.time) ?? Date.now(),
            })
          },
        )
        if (parado) void BackgroundGeolocation.removeWatcher({ id })
        else parar = () => void BackgroundGeolocation.removeWatcher({ id })
      } catch (e) {
        if (!parado) aoErro(converterErro(e))
      }
    })()
  } else {
    void (async () => {
      try {
        const { Geolocation } = await import('@capacitor/geolocation')
        if (parado) return
        const id = await Geolocation.watchPosition(
          { enableHighAccuracy: true, maximumAge: 0, timeout: opcoes.timeoutMs ?? 30000, minimumUpdateInterval: 1000 },
          (p, erro) => {
            if (erro) return aoErro(converterErro(erro))
            if (!p) return
            aoLer({
              lat: p.coords.latitude,
              lng: p.coords.longitude,
              precisao: numero(p.coords.accuracy),
              velocidade: numero(p.coords.speed),
              rumo: numero(p.coords.heading),
              em: p.timestamp,
            })
          },
        )
        if (parado) void Geolocation.clearWatch({ id })
        else parar = () => void Geolocation.clearWatch({ id })
      } catch (e) {
        if (!parado) aoErro(converterErro(e))
      }
    })()
  }

  return () => {
    parado = true
    parar()
  }
}

/** Permissão de localização no app nativo, sem disparar o pedido. */
export async function permissaoNativa(): Promise<'granted' | 'denied' | 'prompt' | 'desconhecida'> {
  try {
    const { Geolocation } = await import('@capacitor/geolocation')
    const r = await Geolocation.checkPermissions()
    if (r.location === 'granted') return 'granted'
    if (r.location === 'denied') return 'denied'
    return 'prompt'
  } catch {
    return 'desconhecida'
  }
}
