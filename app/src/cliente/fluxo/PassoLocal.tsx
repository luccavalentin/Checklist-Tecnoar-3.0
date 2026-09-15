import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Circle } from 'react-leaflet'
import { Crosshair, Loader2, LocateFixed, MapPin, Move, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buscarLugar, enderecoDoPonto, formatarCoordenadas, mensagemErroGPS, posicaoPrecisa, type ErroGPS, type LeituraGPS, type Ponto } from '@/sos/geo'
import { BotaoMapa, CapturaMapa, MapaSOS, centralizarMapa, type MapaLeaflet, type MarcadorMapa } from '@/sos/Mapa'
import { BotaoApp, Faixa } from '../../comum/ui'
import { useOnline } from '../../comum/Pwa'
import { temaMapa } from '../dados'

export interface LocalSOS {
  ponto: Ponto
  precisao: number | null
  ajustado: boolean
  endereco: string | null
}

/**
 * Passo "onde você está". O GPS é pedido na hora, sem perguntar nada — quem
 * abriu o SOS já disse que precisa de ajuda. Se o GPS falhar ou errar, a
 * pessoa arrasta o mapa sob um pino fixo (como nos apps de corrida) ou busca
 * a cidade/rodovia por texto.
 */
export function PassoLocal({
  inicial,
  aoConfirmar,
  cabecalho,
  topoPainel,
  etapa = 'Localização',
}: {
  /** Ao voltar do resumo para ajustar: começa no ponto já escolhido. */
  inicial: LocalSOS | null
  aoConfirmar: (l: LocalSOS) => void
  /** Botões sobre o mapa (fechar, ligar). */
  cabecalho: ReactNode
  /** Veículo e avisos no alto do painel. */
  topoPainel?: ReactNode
  /** Rótulo da etapa acima do título ("Passo 2 de 3 · Localização"). */
  etapa?: string
}) {
  const mapa = useRef<MapaLeaflet | null>(null)
  const online = useOnline()
  const [gps, setGps] = useState<LeituraGPS | null>(null)
  const [erroGps, setErroGps] = useState<ErroGPS | null>(null)
  const [buscandoGps, setBuscandoGps] = useState(!inicial)
  const [ajustando, setAjustando] = useState(!!inicial)
  const [centro, setCentro] = useState<Ponto | null>(inicial?.ponto ?? null)
  const [mira, setMira] = useState<Ponto | null>(inicial?.ponto ?? null)
  const [endereco, setEndereco] = useState<string | null>(inicial?.endereco ?? null)
  const [buscandoEndereco, setBuscandoEndereco] = useState(false)
  // Depois que a pessoa mexeu no pino, o GPS não arrasta mais o mapa.
  const manterCentro = useRef(!!inicial)
  // GPS ainda refinando (a leitura vai melhorando na tela até ±10 m).
  const [refinando, setRefinando] = useState(false)
  const cancelarGps = useRef<() => void>(() => {})

  const pedirGps = useCallback(async () => {
    cancelarGps.current()
    setBuscandoGps(true)
    setRefinando(true)
    setErroGps(null)
    // Só leitura nova, com o GPS de verdade: a primeira (antena) aparece na
    // hora e é trocada pelas melhores até chegar a ±10 m.
    const { promessa, cancelar } = posicaoPrecisa({
      alvoM: 10,
      aceitavelM: 15,
      bomBastanteMs: 12000,
      tempoMaxMs: 45000,
      aoMelhorar: (l) => {
        setGps(l)
        setBuscandoGps(false)
        if (!manterCentro.current) {
          setCentro({ lat: l.lat, lng: l.lng })
          setAjustando(false)
        }
      },
    })
    cancelarGps.current = cancelar
    try {
      await promessa
    } catch (e) {
      setErroGps(typeof e === 'string' ? (e as ErroGPS) : 'indisponivel')
      // Sem GPS, o pino no mapa é o caminho: já abre no modo de ajuste.
      setAjustando(true)
    } finally {
      setBuscandoGps(false)
      setRefinando(false)
    }
  }, [])

  useEffect(() => {
    void pedirGps()
    return () => cancelarGps.current()
  }, [pedirGps])

  const pontoGps: Ponto | null = gps ? { lat: gps.lat, lng: gps.lng } : null
  const ponto: Ponto | null = ajustando ? (mira ?? centro ?? pontoGps) : pontoGps

  // Endereço aproximado do ponto (com espera no ajuste: o mapa ainda está andando).
  const chave = ponto ? `${ponto.lat.toFixed(4)},${ponto.lng.toFixed(4)}` : ''
  useEffect(() => {
    if (!ponto) return
    let vivo = true
    setBuscandoEndereco(true)
    const t = window.setTimeout(
      async () => {
        const e = await enderecoDoPonto(ponto)
        if (!vivo) return
        setEndereco(e)
        setBuscandoEndereco(false)
      },
      ajustando ? 650 : 0,
    )
    return () => {
      vivo = false
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  function comecarAjuste() {
    manterCentro.current = true
    setMira(ponto)
    setAjustando(true)
  }

  function voltarAoGps() {
    if (!gps) return void pedirGps()
    manterCentro.current = false
    setAjustando(false)
    setMira(null)
    centralizarMapa(mapa.current, pontoGps!, 17)
  }

  function confirmar() {
    if (!ponto) return
    aoConfirmar({
      ponto,
      // Ponto arrastado à mão não tem a precisão do GPS: a central vê "ajustado".
      precisao: ajustando ? null : (gps?.precisao ?? null),
      ajustado: ajustando,
      endereco,
    })
  }

  const marcadores: MarcadorMapa[] = []
  if (pontoGps) marcadores.push({ id: 'eu', tipo: 'eu', ponto: pontoGps, pulsar: true, rotulo: 'Você está aqui', selecionado: !ajustando })

  const titulo = buscandoGps && !gps
    ? 'Procurando você…'
    : ajustando
      ? erroGps && !gps
        ? 'Marque onde você está'
        : 'Arraste o mapa até o ponto certo'
      : 'Você está aqui?'

  return (
    <div className="fixed inset-0 flex flex-col bg-canvas md:flex-row-reverse">
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <MapaSOS marcadores={marcadores} centro={centro} zoom={17} enquadrar={false} mira={ajustando} aoMoverMira={setMira} tema={temaMapa()} className="size-full">
            <CapturaMapa destino={mapa} />
            {gps?.precisao != null && gps.precisao > 8 && !ajustando && (
              <Circle
                center={[gps.lat, gps.lng]}
                radius={Math.min(gps.precisao, 3000)}
                pathOptions={{ color: '#0086c4', weight: 1, opacity: 0.5, fillColor: '#0086c4', fillOpacity: 0.1 }}
              />
            )}
          </MapaSOS>
        </div>

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pt-[calc(0.5rem+env(safe-area-inset-top)+var(--faixa-rede,0px))]">{cabecalho}</div>

        {buscandoGps && !gps && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="flex items-center gap-2.5 rounded-full border border-line bg-surface px-4 py-2.5 text-[14px] font-semibold text-ink shadow-e3">
              <Loader2 className="size-4 animate-spin text-accent" /> Buscando sua localização…
            </div>
          </div>
        )}

        <div className="absolute right-3 bottom-9 z-10 flex flex-col gap-2">
          <BotaoMapa rotulo="Voltar para minha localização" onClick={voltarAoGps}>
            <LocateFixed />
          </BotaoMapa>
        </div>
      </div>

      <section className="relative z-20 -mt-6 flex max-h-[64dvh] flex-col overflow-y-auto overscroll-contain rounded-t-[1.75rem] border-t border-line bg-surface px-4 pt-2.5 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-12px_32px_-18px_rgb(8_24_48/0.35)] md:mt-0 md:h-full md:max-h-none md:w-[25rem] md:shrink-0 md:rounded-none md:border-t-0 md:border-r md:px-6 md:pt-[calc(1.5rem+env(safe-area-inset-top))] md:shadow-none lg:w-[28rem]">
        <span aria-hidden className="mx-auto mb-3 h-1.5 w-10 shrink-0 rounded-full bg-line-strong md:hidden" />
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
          {topoPainel}

          <div>
            <p className="text-[12.5px] font-semibold text-crit">{etapa}</p>
            <h1 className="mt-1 font-display text-[24px] leading-tight font-bold text-ink">{titulo}</h1>
          </div>

          {ponto && (
            <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-3.5">
              <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', ajustando ? 'bg-accent-soft text-accent-ink' : 'bg-cyan-soft text-cyan')}>
                {ajustando ? <Move className="size-5" /> : <MapPin className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] leading-snug font-semibold text-ink">
                  {endereco ?? (buscandoEndereco ? 'Buscando o endereço…' : 'Endereço não identificado')}
                </p>
                <p className="num mt-1 text-[12px] text-ink-2">{formatarCoordenadas(ponto)}</p>
                {!ajustando && gps?.precisao != null && <Precisao metros={gps.precisao} refinando={refinando} />}
              </div>
            </div>
          )}

          {!online && ponto && (
            <Faixa tom="info" icone={MapPin}>
              Sem internet, o GPS continua funcionando. Estas coordenadas vão no pedido — ou passe por telefone.
            </Faixa>
          )}

          {erroGps && !gps && (
            <Faixa tom="atencao" icone={Crosshair}>
              <p>{mensagemErroGPS(erroGps)}</p>
              <button type="button" onClick={() => void pedirGps()} className="mt-1.5 min-h-10 font-semibold underline underline-offset-2">
                Tentar o GPS de novo
              </button>
            </Faixa>
          )}

          {(ajustando || (erroGps && !gps)) && online && (
            <BuscaLugar
              aoEscolher={(p) => {
                manterCentro.current = true
                setAjustando(true)
                setMira(p)
                setCentro(p)
                centralizarMapa(mapa.current, p, 16)
              }}
            />
          )}

          <div className="flex flex-col gap-2 pt-1">
            <BotaoApp variante="escuro" tamanho="xl" largo disabled={!ponto} onClick={confirmar}>
              {ajustando ? 'Usar este ponto' : 'Sim, estou aqui'}
            </BotaoApp>
            {!ajustando && ponto && (
              <BotaoApp variante="neutro" tamanho="lg" largo icone={Move} onClick={comecarAjuste}>
                Corrigir no mapa
              </BotaoApp>
            )}
            {ajustando && gps && (
              <BotaoApp variante="fantasma" tamanho="md" largo icone={LocateFixed} onClick={voltarAoGps}>
                Voltar para o ponto do GPS
              </BotaoApp>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function Precisao({ metros, refinando }: { metros: number; refinando: boolean }) {
  const m = Math.round(metros)
  const tom = m <= 15 ? 'text-ok-ink bg-ok-soft' : m <= 60 ? 'text-warn-ink bg-warn-soft' : 'text-crit-ink bg-crit-soft'
  return (
    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
      <span className={cn('rounded-full px-2 py-0.5 font-semibold', tom)}>Precisão de ±{m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${m} m`}</span>
      {refinando && m > 10 && (
        <span className="inline-flex items-center gap-1 text-ink-3">
          <Loader2 className="size-3 animate-spin" /> Refinando pelo GPS…
        </span>
      )}
      {!refinando && m > 60 && <span className="text-ink-3">Sinal fraco: confira o ponto ou ajuste no mapa.</span>}
    </p>
  )
}

/** Busca por texto: cidade, bairro, rodovia, posto. Última saída quando o GPS não ajuda. */
function BuscaLugar({ aoEscolher }: { aoEscolher: (p: Ponto) => void }) {
  const [texto, setTexto] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<Array<Ponto & { nome: string }> | null>(null)

  async function buscar(e: FormEvent) {
    e.preventDefault()
    if (texto.trim().length < 3) return
    setBuscando(true)
    const r = await buscarLugar(texto)
    setResultados(r)
    setBuscando(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={(e) => void buscar(e)} className="flex items-center gap-2 rounded-xl border border-line-strong bg-inset pr-1.5 pl-3.5 focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15">
        <Search className="size-5 shrink-0 text-ink-3" />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar cidade, rodovia ou posto"
          aria-label="Buscar lugar"
          enterKeyHint="search"
          className="min-h-[3.25rem] min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-3/70"
        />
        {texto && (
          <button type="button" aria-label="Limpar" onClick={() => { setTexto(''); setResultados(null) }} className="flex size-9 items-center justify-center rounded-full text-ink-3">
            <X className="size-4" />
          </button>
        )}
        <button type="submit" disabled={buscando || texto.trim().length < 3} className="flex h-10 items-center rounded-lg bg-accent px-3.5 text-[14px] font-bold text-on-accent disabled:opacity-40">
          {buscando ? <Loader2 className="size-4 animate-spin" /> : 'Buscar'}
        </button>
      </form>
      {resultados && (
        <ul className="overflow-hidden rounded-xl border border-line bg-surface">
          {resultados.length === 0 && <li className="px-4 py-3 text-[13.5px] text-ink-3">Nada encontrado. Tente o nome da cidade ou da rodovia (ex.: BR-116 Registro).</li>}
          {resultados.map((r) => (
            <li key={`${r.lat},${r.lng}`} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => {
                  aoEscolher({ lat: r.lat, lng: r.lng })
                  setResultados(null)
                }}
                className="flex min-h-12 w-full items-start gap-2.5 px-3.5 py-2.5 text-left text-[13.5px] leading-snug text-ink active:bg-surface-2"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                <span className="line-clamp-2">{r.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[12px] text-ink-3">Depois de achar a região, arraste o mapa para colocar o pino exatamente onde está o veículo.</p>
    </div>
  )
}
