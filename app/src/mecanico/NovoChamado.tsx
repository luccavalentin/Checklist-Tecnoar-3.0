import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Circle, useMapEvents } from 'react-leaflet'
import {
  AlertTriangle,
  CarFront,
  Clock,
  FilePlus2,
  Link2,
  Loader2,
  LocateFixed,
  MapPin,
  Move,
  Navigation,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { mascaraTelefone } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { sosMecanicoAbrirChamado } from '@/sos/api'
import {
  buscarLugar,
  distanciaKm,
  enderecoDoPonto,
  formatarCoordenadas,
  mensagemErroGPS,
  posicaoPrecisa,
  type ErroGPS,
  type LeituraGPS,
  type Ponto,
} from '@/sos/geo'
import { BotaoMapa, CapturaMapa, MapaSOS, centralizarMapa, type MapaLeaflet, type MarcadorMapa } from '@/sos/Mapa'
import { OCORRENCIAS, ORDEM_OCORRENCIAS, PRIORIDADES, formatarDistancia } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { HomeMecanico, NovoChamadoMecanico as PedidoChamado, OcorrenciaSOS } from '@/sos/tipos'
import { temaDoMapa, useAlturaTeclado, useHomeMecanico, useOnline } from './dados'
import { IconeOcorrencia, Placa } from './pecas'
import { PassoCliente, type ClienteEscolhido, type VeiculoEscolhido } from './clienteCampo'
import { useTemaMecanico } from './tema'
import { AreaM, BotaoM, CartaoM, OpcaoM, RodapeAcao, RotuloM, SecaoM, SeloM, TelaM, TopoM } from './ui'

/**
 * NOVO CHAMADO — aberto pelo próprio mecânico (além de aceitar os da fila).
 *
 * O cliente parou na oficina móvel, ligou direto para o mecânico ou foi
 * achado na estrada: em quatro toques o chamado nasce na central da Tecnoar
 * (mesma tabela, mesmo mapa, origem "mecânico") e o mecânico cai direto no
 * atendimento.
 *
 *   1. Quem é o cliente?  um campo só (placa, nome ou telefone); tocar no
 *                         veículo já escolhe cliente + veículo.
 *   2. O que aconteceu?   tipo em ícones + descrição pronta para editar.
 *   3. Onde?              "estou com o cliente" (GPS preciso, ajuste no mapa)
 *                         ou "vou até o cliente" (busca + pino no mapa).
 *   4. Conferir           resumo, OS (lançar na aberta / abrir nova / depois)
 *                         e ABRIR CHAMADO.
 *
 * O GPS começa a refinar já na primeira tela: quando o mecânico chega ao
 * passo do local, a leitura costuma estar em poucos metros. O rascunho fica
 * na sessão (`sos.*`, apagado ao sair da conta).
 */

type Passo = 'cliente' | 'problema' | 'local' | 'conferir'
const PASSOS: Passo[] = ['cliente', 'problema', 'local', 'conferir']
const TITULO_PASSO: Record<Passo, string> = {
  cliente: 'Quem é o cliente?',
  problema: 'O que aconteceu?',
  local: 'Local do veículo',
  conferir: 'Conferir e abrir',
}

type ModoLocal = 'aqui' | 'ir'
type EscolhaOS = 'vincular' | 'nova' | 'depois'

interface LocalEscolhido {
  modo: ModoLocal
  ponto: Ponto
  /** Precisão do GPS; nula quando o ponto foi marcado à mão no mapa. */
  precisao: number | null
  ajustado: boolean
  endereco: string | null
  em: number
}


/** Texto pronto ao tocar no tipo — o mecânico só completa. */
const SUGESTAO: Record<OcorrenciaSOS, string> = {
  freios: 'Problema no sistema de freios.',
  nao_liga: 'Veículo não dá partida.',
  parado: 'Veículo parado, não segue viagem.',
  mecanico: 'Pane mecânica.',
  pane_eletrica: 'Pane elétrica.',
  roda_pneu: 'Problema em roda ou pneu.',
  vazamento: 'Vazamento.',
  acidente: 'Veículo envolvido em acidente.',
  desconhecido: 'Causa ainda não identificada — diagnosticar no local.',
  outro: '',
}

/* ── rascunho da sessão ─────────────────────────────────────────────────── */

const CHAVE_RASCUNHO = 'sos.novo-chamado.v1'
/** Local marcado há mais tempo que isso não vale mais (o mecânico andou). */
const VALIDADE_LOCAL_MS = 10 * 60_000

interface Rascunho {
  passo: Passo
  cliente: ClienteEscolhido | null
  veiculo: VeiculoEscolhido | null
  tipo: OcorrenciaSOS | null
  descricao: string
  local: LocalEscolhido | null
  escolhaOS: EscolhaOS | null
}

function lerRascunho(): Rascunho | null {
  try {
    const r = JSON.parse(sessionStorage.getItem(CHAVE_RASCUNHO) ?? 'null') as Rascunho | null
    if (!r || typeof r !== 'object' || !PASSOS.includes(r.passo)) return null
    if (r.local && (typeof r.local.em !== 'number' || Date.now() - r.local.em > VALIDADE_LOCAL_MS)) r.local = null
    if (r.tipo && !OCORRENCIAS[r.tipo]) r.tipo = null
    return { ...r, descricao: typeof r.descricao === 'string' ? r.descricao : '' }
  } catch {
    return null
  }
}

function salvarRascunho(r: Rascunho) {
  try {
    sessionStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(r))
  } catch {
    /* sem armazenamento: o fluxo segue, só não retoma */
  }
}

function limparRascunho() {
  try {
    sessionStorage.removeItem(CHAVE_RASCUNHO)
  } catch {
    /* nada */
  }
}

/** Retoma no passo guardado, sem pular um passo que ficou incompleto. */
function passoRetomado(r: Rascunho | null): Passo {
  if (!r?.cliente) return 'cliente'
  let maximo = 1
  if (r.tipo && r.descricao.trim().length >= 3) maximo = 2
  if (maximo === 2 && r.local) maximo = 3
  return PASSOS[Math.min(Math.max(PASSOS.indexOf(r.passo), 0), maximo)] ?? 'cliente'
}

/* ── GPS com exatidão ───────────────────────────────────────────────────── */

/**
 * GPS ligado desde a abertura da tela: a primeira leitura (antena/Wi-Fi)
 * aparece na hora e é trocada pelas melhores até ±8 m. `pedir` recomeça
 * (leitura velha, sinal fraco, "tentar de novo").
 */
function useGpsPreciso() {
  const [leitura, setLeitura] = useState<LeituraGPS | null>(null)
  const [refinando, setRefinando] = useState(false)
  const [erro, setErro] = useState<ErroGPS | null>(null)
  const cancelar = useRef<() => void>(() => {})
  const geracao = useRef(0)

  const pedir = useCallback(() => {
    cancelar.current()
    const minha = ++geracao.current
    setRefinando(true)
    setErro(null)
    const r = posicaoPrecisa({
      alvoM: 5,
      aceitavelM: 10,
      bomBastanteMs: 15_000,
      tempoMaxMs: 45_000,
      aoMelhorar: (l) => {
        if (geracao.current === minha) setLeitura(l)
      },
    })
    cancelar.current = r.cancelar
    r.promessa
      .then((l) => {
        if (geracao.current === minha) setLeitura(l)
      })
      .catch((e: unknown) => {
        if (geracao.current === minha) setErro(typeof e === 'string' ? (e as ErroGPS) : 'indisponivel')
      })
      .finally(() => {
        if (geracao.current === minha) setRefinando(false)
      })
  }, [])

  useEffect(() => {
    pedir()
    return () => {
      geracao.current++
      cancelar.current()
    }
  }, [pedir])

  return { leitura, refinando, erro, pedir }
}

type GpsPreciso = ReturnType<typeof useGpsPreciso>

/** Endereço legível do ponto, com espera (o mapa ainda pode estar andando). */
function useEndereco(ponto: Ponto | null, inicial: string | null, atrasoMs = 600) {
  const [endereco, setEndereco] = useState<string | null>(inicial)
  const [buscando, setBuscando] = useState(false)
  const chave = ponto ? `${ponto.lat.toFixed(4)},${ponto.lng.toFixed(4)}` : ''
  const primeira = useRef(true)
  useEffect(() => {
    // O endereço guardado já é deste ponto: não consulta de novo.
    if (primeira.current) {
      primeira.current = false
      if (inicial && ponto) return
    }
    if (!ponto) {
      setEndereco(null)
      setBuscando(false)
      return
    }
    let vivo = true
    setBuscando(true)
    const t = window.setTimeout(async () => {
      const e = await enderecoDoPonto(ponto)
      if (!vivo) return
      setEndereco(e)
      setBuscando(false)
    }, atrasoMs)
    return () => {
      vivo = false
      window.clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])
  return { endereco, buscando }
}


/* ── tela ───────────────────────────────────────────────────────────────── */

export function NovoChamadoMecanico() {
  useTemaMecanico()
  const home = useHomeMecanico()
  // Um atendimento por vez (o banco também recusa): mostra o atual em vez do fluxo.
  const atual = home.data?.chamado_atual ?? null
  if (atual) return <JaEmAtendimento chamado={atual} />
  return <Fluxo />
}

function Fluxo() {
  const navegar = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const online = useOnline()
  const gps = useGpsPreciso()

  const [inicial] = useState(lerRascunho)
  const [passo, setPasso] = useState<Passo>(() => passoRetomado(inicial))
  const [cliente, setCliente] = useState<ClienteEscolhido | null>(inicial?.cliente ?? null)
  const [veiculo, setVeiculo] = useState<VeiculoEscolhido | null>(inicial?.veiculo ?? null)
  const [tipo, setTipo] = useState<OcorrenciaSOS | null>(inicial?.tipo ?? null)
  const [descricao, setDescricao] = useState(inicial?.descricao ?? '')
  const [local, setLocal] = useState<LocalEscolhido | null>(inicial?.local ?? null)
  const [escolhaOS, setEscolhaOS] = useState<EscolhaOS | null>(inicial?.escolhaOS ?? null)
  // "Alterar" no resumo: terminado o passo, volta direto para o resumo.
  const [editando, setEditando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const indice = PASSOS.indexOf(passo)

  useEffect(() => {
    salvarRascunho({ passo, cliente, veiculo, tipo, descricao, local, escolhaOS })
  }, [passo, cliente, veiculo, tipo, descricao, local, escolhaOS])

  useEffect(() => {
    window.scrollTo(0, 0)
    setErro(null)
  }, [passo])

  // Resumo sem os dados de antes (rascunho incompleto): volta ao passo que falta.
  const incompleto = passo === 'conferir' && (!cliente || !tipo || !local)
  useEffect(() => {
    if (incompleto) setPasso(passoRetomado({ passo, cliente, veiculo, tipo, descricao, local, escolhaOS }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incompleto])

  // Chegou ao passo do local com leitura velha (o mecânico andou): GPS de novo.
  useEffect(() => {
    if (passo !== 'local') return
    const l = gps.leitura
    if (!gps.refinando && (!l || Date.now() - l.em > 60_000)) gps.pedir()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passo])

  /**
   * "Estou com o cliente" sem ajuste manual: se o GPS continuou refinando
   * depois da confirmação, vale a leitura melhor (mais exata) na hora de abrir.
   */
  const localFinal = useMemo<LocalEscolhido | null>(() => {
    if (!local) return null
    const l = gps.leitura
    if (
      local.modo === 'aqui' &&
      !local.ajustado &&
      l?.precisao != null &&
      (local.precisao == null || l.precisao < local.precisao) &&
      distanciaKm(local.ponto, l) < 0.2
    ) {
      return { ...local, ponto: { lat: l.lat, lng: l.lng }, precisao: l.precisao }
    }
    return local
  }, [local, gps.leitura])

  const opcoesOS: EscolhaOS[] = veiculo?.osAberta ? ['vincular', 'nova', 'depois'] : veiculo ? ['nova', 'depois'] : []
  const escolha: EscolhaOS = escolhaOS && opcoesOS.includes(escolhaOS) ? escolhaOS : (opcoesOS[0] ?? 'depois')

  function irPara(p: Passo) {
    setPasso(p)
  }

  function avancar() {
    if (editando) {
      setEditando(false)
      return irPara('conferir')
    }
    irPara(PASSOS[Math.min(indice + 1, PASSOS.length - 1)] ?? 'conferir')
  }

  function voltar() {
    setEditando(false)
    if (indice <= 0) return navegar('/')
    irPara(PASSOS[indice - 1] ?? 'cliente')
  }

  function cancelar() {
    limparRascunho()
    navegar('/', { replace: true })
  }

  const abrir = useMutation({
    mutationFn: (p: PedidoChamado) => sosMecanicoAbrirChamado(p),
    onSuccess: (c) => {
      limparRascunho()
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeMecanico })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.papel })
      toast.ok('Chamado aberto', `${c.protocolo} já está na central da Tecnoar.`)
      navegar(`/chamado/${c.id}`, { replace: true })
    },
    onError: (e) => {
      const msg = (e as Error).message
      setErro(msg)
      // "Termine o atendimento atual…": o painel passa a mostrar o atual.
      if (/termine o atendimento/i.test(msg)) void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeMecanico })
    },
  })

  function enviar() {
    if (abrir.isPending || !cliente || !tipo || !localFinal) return
    setErro(null)
    const texto = descricao.trim()
    // Veículo sem placa não entra no cadastro: o modelo vai na descrição.
    const semPlaca = veiculo && !veiculo.id && !veiculo.placa && veiculo.descricao
    const p: PedidoChamado = {
      tipo_ocorrencia: tipo,
      descricao: semPlaca ? `${texto} · Veículo sem placa: ${veiculo.descricao}` : texto,
      ja_no_local: localFinal.modo === 'aqui',
      latitude: localFinal.ponto.lat,
      longitude: localFinal.ponto.lng,
      precisao_m: localFinal.precisao != null ? Math.round(localFinal.precisao) : null,
      endereco: localFinal.endereco,
      // Marcado à mão no mapa: a central vê "ajustado", não leitura de GPS.
      ponto_ajustado: localFinal.ajustado,
    }
    if (cliente.id) p.cliente_id = cliente.id
    else {
      p.cliente_nome = cliente.nome
      p.telefone = cliente.telefone
    }
    if (veiculo?.id) p.veiculo_id = veiculo.id
    else if (veiculo?.placa) {
      p.placa = veiculo.placa
      p.veiculo_descricao = veiculo.descricao
    }
    if (localFinal.modo === 'ir' && gps.leitura) {
      p.mecanico_lat = gps.leitura.lat
      p.mecanico_lng = gps.leitura.lng
    }
    if (escolha === 'vincular' && veiculo?.osAberta) p.os_id = veiculo.osAberta.id
    else if (escolha === 'nova' && veiculo) p.gerar_os = true
    abrir.mutate(p)
  }

  return (
    <div className="mec mec-fundo min-h-dvh">
      <TopoM
        voltar={voltar}
        sobretitulo={`Novo chamado · ${indice + 1} de ${PASSOS.length}`}
        titulo={TITULO_PASSO[passo]}
        acao={
          <button
            type="button"
            aria-label="Cancelar o novo chamado"
            onClick={cancelar}
            className="flex size-12 items-center justify-center rounded-2xl text-ink-2 active:bg-surface-2"
          >
            <X className="size-6" />
          </button>
        }
      />
      <Progresso indice={indice} />

      {passo === 'cliente' && (
        <PassoCliente
          atual={cliente ? { cliente, veiculo } : null}
          aoEscolher={(c, v) => {
            const mudouVeiculo = v?.id !== veiculo?.id || v?.placa !== veiculo?.placa
            setCliente(c)
            setVeiculo(v)
            if (mudouVeiculo) setEscolhaOS(null)
            avancar()
          }}
        />
      )}

      {passo === 'problema' && (
        <PassoProblema tipo={tipo} descricao={descricao} aoTipo={setTipo} aoDescricao={setDescricao} aoContinuar={avancar} />
      )}

      {passo === 'local' && (
        <PassoOnde
          gps={gps}
          inicial={local}
          aoConfirmar={(l) => {
            setLocal(l)
            avancar()
          }}
        />
      )}

      {passo === 'conferir' && cliente && tipo && localFinal && (
        <PassoConferir
          cliente={cliente}
          veiculo={veiculo}
          tipo={tipo}
          descricao={descricao}
          local={localFinal}
          gps={gps}
          opcoesOS={opcoesOS}
          escolha={escolha}
          aoEscolha={setEscolhaOS}
          aoAlterar={(p) => {
            setEditando(true)
            irPara(p)
          }}
          erro={erro}
          enviando={abrir.isPending}
          online={online}
          aoAbrir={enviar}
        />
      )}
    </div>
  )
}

function Progresso({ indice }: { indice: number }) {
  return (
    <div className="mx-auto flex max-w-xl gap-1.5 px-4 pt-3" aria-hidden>
      {PASSOS.map((p, i) => (
        <span key={p} className={cn('h-1.5 flex-1 rounded-full transition-colors duration-300', i <= indice ? 'bg-accent' : 'bg-line')} />
      ))}
    </div>
  )
}

/* ── 2. problema ────────────────────────────────────────────────────────── */

function PassoProblema({
  tipo,
  descricao,
  aoTipo,
  aoDescricao,
  aoContinuar,
}: {
  tipo: OcorrenciaSOS | null
  descricao: string
  aoTipo: (t: OcorrenciaSOS) => void
  aoDescricao: (v: string) => void
  aoContinuar: () => void
}) {
  const teclado = useAlturaTeclado()
  const area = useRef<HTMLTextAreaElement>(null)
  const pronto = !!tipo && descricao.trim().length >= 3
  const prioridade = tipo ? OCORRENCIAS[tipo].prioridade : null

  function escolher(t: OcorrenciaSOS) {
    const anterior = tipo ? SUGESTAO[tipo] : ''
    aoTipo(t)
    // Troca a sugestão enquanto o mecânico não escreveu nada dele.
    const atual = descricao.trim()
    if (!atual || atual === anterior) aoDescricao(SUGESTAO[t])
    if (!SUGESTAO[t] && !atual) window.setTimeout(() => area.current?.focus(), 50)
  }

  return (
    <>
      <TelaM comBarra={false} className="pb-[calc(8rem+env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Tipo de ocorrência">
          {ORDEM_OCORRENCIAS.map((t) => {
            const info = OCORRENCIAS[t]
            const Icone = info.icone
            const marcado = tipo === t
            return (
              <button
                key={t}
                type="button"
                aria-pressed={marcado}
                onClick={() => escolher(t)}
                className={cn(
                  'flex min-h-[4.75rem] min-w-0 items-center gap-2.5 rounded-2xl border-2 px-3 py-2.5 text-left transition-[transform,border-color,background-color] active:scale-[0.98]',
                  marcado ? 'border-accent bg-accent-soft/70' : 'border-line bg-surface',
                )}
              >
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-xl',
                    marcado ? 'bg-accent text-white' : info.prioridade === 'emergencia' ? 'bg-crit-soft text-crit-ink' : 'bg-surface-2 text-ink-2',
                  )}
                >
                  <Icone className="size-[21px]" strokeWidth={2.2} />
                </span>
                <span className="line-clamp-2 min-w-0 font-display text-[14px] leading-tight font-bold text-ink max-[359px]:text-[13px]">{info.rotulo}</span>
              </button>
            )
          })}
        </div>

        {tipo && prioridade && prioridade !== 'normal' && (
          <p className="flex items-center gap-2 px-1 text-[13px] text-ink-2">
            <SeloM tom={prioridade === 'emergencia' ? 'vermelho' : 'ambar'}>{PRIORIDADES[prioridade].rotulo}</SeloM>
            A central vê este chamado com prioridade.
          </p>
        )}

        <AreaM
          ref={area}
          rotulo="Descrição *"
          placeholder="O que o cliente relatou e o que você viu."
          value={descricao}
          onChange={(e) => aoDescricao(e.target.value)}
          rows={3}
          maxLength={1000}
          dica="Curta mesmo: o diagnóstico você completa no atendimento."
        />
      </TelaM>
      <RodapeAcao teclado={teclado}>
        <BotaoM variante="laranja" tamanho={teclado ? 'lg' : 'xl'} largo disabled={!pronto} onClick={aoContinuar}>
          {tipo ? 'Continuar' : 'Escolha o tipo do problema'}
        </BotaoM>
      </RodapeAcao>
    </>
  )
}

/* ── 3. onde ────────────────────────────────────────────────────────────── */

/** O mecânico arrastou o mapa com o dedo (movimento do próprio app não conta). */
function OuvirArraste({ aoArrastar }: { aoArrastar: () => void }) {
  useMapEvents({ dragstart: aoArrastar })
  return null
}

function PassoOnde({ gps, inicial, aoConfirmar }: { gps: GpsPreciso; inicial: LocalEscolhido | null; aoConfirmar: (l: LocalEscolhido) => void }) {
  const online = useOnline()
  const mapa = useRef<MapaLeaflet | null>(null)
  const [modo, setModo] = useState<ModoLocal>(inicial?.modo ?? 'aqui')
  // "Estou com o cliente": ajuste manual sobre o GPS (pino fixo no centro).
  const [ajustando, setAjustando] = useState(inicial?.modo === 'aqui' && inicial.ajustado)
  const [miraAqui, setMiraAqui] = useState<Ponto | null>(inicial?.modo === 'aqui' && inicial.ajustado ? inicial.ponto : null)
  const [ajusteOk, setAjusteOk] = useState(inicial?.modo === 'aqui' && inicial.ajustado)
  // "Vou até o cliente": o pino marca o cliente; só vale depois de mexer/buscar.
  const [destino, setDestino] = useState<Ponto | null>(inicial?.modo === 'ir' ? inicial.ponto : null)
  const [destinoOk, setDestinoOk] = useState(inicial?.modo === 'ir')

  const pontoGps: Ponto | null = gps.leitura ? { lat: gps.leitura.lat, lng: gps.leitura.lng } : null
  const [centro, setCentro] = useState<Ponto | null>(inicial?.ponto ?? pontoGps)

  // Leitura nova do GPS: sem ajuste manual, o mapa acompanha.
  const chaveGps = pontoGps ? `${pontoGps.lat.toFixed(6)},${pontoGps.lng.toFixed(6)}` : ''
  useEffect(() => {
    if (!pontoGps) return
    if (modo === 'aqui' && !ajustando) setCentro(pontoGps)
    else if (modo === 'ir' && !destinoOk && !centro) setCentro(pontoGps)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveGps])

  // Sem GPS nenhum: o jeito é marcar no mapa (ou buscar).
  useEffect(() => {
    if (gps.erro && !pontoGps && modo === 'aqui') setAjustando(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps.erro])

  const ponto: Ponto | null = modo === 'aqui' ? (ajustando ? (ajusteOk ? miraAqui : null) : pontoGps) : destinoOk ? destino : null
  const { endereco, buscando } = useEndereco(ponto, inicial?.endereco ?? null)
  const precisaoGps = gps.leitura?.precisao ?? null

  function mudarModo(m: ModoLocal) {
    if (m === modo) return
    setModo(m)
    if (m === 'aqui') {
      setAjustando(false)
      if (pontoGps) {
        setCentro(pontoGps)
        centralizarMapa(mapa.current, pontoGps, 17)
      }
    } else {
      const alvo = destinoOk ? destino : pontoGps
      if (alvo) {
        setCentro(alvo)
        centralizarMapa(mapa.current, alvo, destinoOk ? 17 : 14)
      }
    }
  }

  function comecarAjuste() {
    const p = ponto ?? pontoGps
    if (!p) return
    setMiraAqui(p)
    setAjusteOk(true)
    setAjustando(true)
    centralizarMapa(mapa.current, p, 18)
  }

  function voltarAoGps() {
    if (!pontoGps) return gps.pedir()
    setAjustando(false)
    setCentro(pontoGps)
    centralizarMapa(mapa.current, pontoGps, 17)
  }

  function escolherLugar(p: Ponto) {
    if (modo === 'ir') {
      setDestino(p)
      setDestinoOk(true)
    } else {
      setMiraAqui(p)
      setAjusteOk(true)
      setAjustando(true)
    }
    setCentro(p)
    centralizarMapa(mapa.current, p, 17)
  }

  function aoArrastar() {
    if (modo === 'ir') setDestinoOk(true)
    else if (ajustando) setAjusteOk(true)
  }

  function confirmar() {
    if (!ponto) return
    const peloGps = modo === 'aqui' && !ajustando
    aoConfirmar({
      modo,
      ponto,
      precisao: peloGps ? precisaoGps : null,
      ajustado: !peloGps,
      endereco,
      em: Date.now(),
    })
  }

  const miraLigada = modo === 'ir' || ajustando
  const marcadores: MarcadorMapa[] = pontoGps
    ? [{ id: 'eu', tipo: 'eu', ponto: pontoGps, pulsar: true, rotulo: 'Você', selecionado: modo === 'aqui' && !ajustando }]
    : []
  const distancia = modo === 'ir' && ponto && pontoGps ? distanciaKm(pontoGps, ponto) : null

  let dicaMapa: string | null = null
  if (modo === 'ir') dicaMapa = destinoOk ? 'Pino no local do cliente' : 'Arraste o mapa até o cliente ou busque o endereço'
  else if (ajustando) dicaMapa = 'Arraste o mapa: o pino marca o veículo'

  const mostrarBusca = online && (modo === 'ir' || ajustando || (!!gps.erro && !pontoGps))

  return (
    <>
      <TelaM comBarra={false} className="pb-[calc(8rem+env(safe-area-inset-bottom))]">
        <div role="radiogroup" aria-label="Onde você está em relação ao cliente" className="grid grid-cols-2 gap-2">
          <BotaoModo ativo={modo === 'aqui'} icone={UserCheck} titulo="Estou com o cliente" sub="Uso o meu GPS" onClick={() => mudarModo('aqui')} />
          <BotaoModo ativo={modo === 'ir'} icone={Navigation} titulo="Vou até o cliente" sub="Marco onde ele está" onClick={() => mudarModo('ir')} />
        </div>

        {/* `isolate`: os avisos sobre o mapa não passam por cima do cabeçalho fixo ao rolar. */}
        <div className="relative isolate h-[40dvh] min-h-[15rem] max-h-[26rem] overflow-hidden rounded-[1.25rem] border border-line mec-sombra">
          <div className="absolute inset-0">
            <MapaSOS
              marcadores={marcadores}
              centro={centro}
              zoom={modo === 'ir' && !destinoOk ? 14 : 17}
              enquadrar={false}
              mira={miraLigada}
              aoMoverMira={modo === 'ir' ? setDestino : setMiraAqui}
              tema={temaDoMapa()}
              className="size-full"
            >
              <CapturaMapa destino={mapa} />
              <OuvirArraste aoArrastar={aoArrastar} />
              {modo === 'aqui' && !ajustando && gps.leitura && precisaoGps != null && precisaoGps > 8 && (
                <Circle
                  center={[gps.leitura.lat, gps.leitura.lng]}
                  radius={Math.min(precisaoGps, 3000)}
                  pathOptions={{ color: '#00A8E8', weight: 1, opacity: 0.55, fillColor: '#00A8E8', fillOpacity: 0.12 }}
                />
              )}
            </MapaSOS>
          </div>

          {dicaMapa && (
            <div className="pointer-events-none absolute inset-x-0 top-0 z-[600] flex justify-center p-2.5">
              <span className="rounded-full bg-[#0D1C33]/88 px-3 py-1.5 text-center text-[12.5px] leading-tight font-bold text-white shadow-lg backdrop-blur">{dicaMapa}</span>
            </div>
          )}

          {modo === 'aqui' && !pontoGps && gps.refinando && (
            <div className="pointer-events-none absolute inset-0 z-[600] flex items-center justify-center">
              <span className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2.5 text-[14px] font-semibold text-ink shadow-lg">
                <Loader2 className="size-4 animate-spin text-accent" /> Buscando sua posição pelo GPS…
              </span>
            </div>
          )}

          {modo === 'aqui' && (
            <div className="absolute right-2.5 bottom-6 z-[600]">
              <BotaoMapa rotulo="Voltar para a minha posição" onClick={voltarAoGps}>
                <LocateFixed />
              </BotaoMapa>
            </div>
          )}
        </div>

        {mostrarBusca && <BuscaLugarM aoEscolher={escolherLugar} />}

        <CartaoM className="flex items-start gap-3 p-3.5">
          <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', miraLigada ? 'bg-accent-soft text-accent-ink' : 'bg-cyan-soft text-cyan-ink')}>
            {miraLigada ? <Move className="size-5" /> : <MapPin className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            {ponto ? (
              <>
                <p className="text-[15px] leading-snug font-semibold text-ink">{endereco ?? (buscando ? 'Buscando o endereço…' : 'Endereço não identificado')}</p>
                <p className="num mt-1 text-[12px] text-ink-2">{formatarCoordenadas(ponto)}</p>
                {modo === 'aqui' && !ajustando && precisaoGps != null && <Precisao metros={precisaoGps} refinando={gps.refinando} />}
                {miraLigada && <p className="mt-1.5 text-[12.5px] text-ink-3">Ponto marcado no mapa.</p>}
                {distancia != null && (
                  <p className="mt-1.5 text-[12.5px] font-semibold text-ink-2">
                    ≈ <span className="num">{formatarDistancia(distancia * 1.3)}</span> de você pela estrada
                  </p>
                )}
              </>
            ) : modo === 'ir' ? (
              <p className="text-[14.5px] leading-snug text-ink-2">Marque onde o cliente está: busque o endereço, a cidade ou a rodovia e arraste o mapa até o ponto exato.</p>
            ) : gps.erro && !pontoGps ? (
              <p className="text-[14.5px] leading-snug text-ink-2">{mensagemErroGPS(gps.erro)}</p>
            ) : ajustando ? (
              <p className="text-[14.5px] leading-snug text-ink-2">Arraste o mapa até o veículo ou busque o lugar.</p>
            ) : (
              <p className="flex items-center gap-2 text-[14.5px] text-ink-2">
                <Loader2 className="size-4 animate-spin text-accent" /> Procurando sua posição…
              </p>
            )}
          </div>
        </CartaoM>

        {modo === 'ir' && (
          <p className="flex items-start gap-2 px-1 text-[13px] leading-snug text-ink-3">
            <Navigation className="mt-0.5 size-4 shrink-0" />
            {pontoGps
              ? `Partida: a sua posição pelo GPS${precisaoGps != null ? ` (±${Math.round(precisaoGps)} m)` : ''}. A central acompanha você no mapa.`
              : gps.refinando
                ? 'Buscando a sua posição para calcular a chegada…'
                : 'Sem a sua posição agora: o chamado sai sem a previsão de chegada.'}
          </p>
        )}

        {modo === 'aqui' && (
          <div className="flex flex-col gap-2">
            {!ajustando && ponto && (
              <BotaoM variante="neutro" tamanho="lg" largo icone={Move} onClick={comecarAjuste}>
                Corrigir no mapa
              </BotaoM>
            )}
            {ajustando && pontoGps && (
              <BotaoM variante="fantasma" tamanho="md" largo icone={LocateFixed} onClick={voltarAoGps}>
                Voltar para o ponto do GPS
              </BotaoM>
            )}
            {!gps.refinando && (gps.erro || (!ajustando && precisaoGps != null && precisaoGps > 25)) && (
              <BotaoM variante="fantasma" tamanho="md" largo icone={RefreshCw} onClick={gps.pedir}>
                {gps.erro && !pontoGps ? 'Tentar o GPS de novo' : 'Refinar o GPS'}
              </BotaoM>
            )}
          </div>
        )}
      </TelaM>

      <RodapeAcao>
        <BotaoM variante="laranja" tamanho="xl" largo disabled={!ponto} onClick={confirmar}>
          {modo === 'ir' ? (destinoOk ? 'Usar este local' : 'Marque o local') : ajustando ? 'Usar este ponto' : ponto ? 'Usar minha posição' : 'Aguardando o GPS…'}
        </BotaoM>
      </RodapeAcao>
    </>
  )
}

function BotaoModo({ ativo, icone: Icone, titulo, sub, onClick }: { ativo: boolean; icone: LucideIcon; titulo: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={ativo}
      onClick={onClick}
      className={cn(
        'flex min-h-[4.75rem] min-w-0 flex-col justify-center gap-1 rounded-2xl border-2 px-3 py-2.5 text-left transition-[transform,border-color,background-color] active:scale-[0.98]',
        ativo ? 'border-accent bg-accent-soft/70' : 'border-line bg-surface',
      )}
    >
      <span className="flex items-center gap-2">
        <Icone className={cn('size-5 shrink-0', ativo ? 'text-accent-ink' : 'text-ink-3')} strokeWidth={2.4} />
        <span className="min-w-0 font-display text-[14.5px] leading-tight font-extrabold text-ink max-[359px]:text-[13.5px]">{titulo}</span>
      </span>
      <span className="text-[12px] leading-tight text-ink-3">{sub}</span>
    </button>
  )
}

function Precisao({ metros, refinando }: { metros: number; refinando: boolean }) {
  const m = Math.round(metros)
  const tom = m <= 15 ? 'bg-ok-soft text-ok-ink' : m <= 60 ? 'bg-warn-soft text-warn-ink' : 'bg-crit-soft text-crit-ink'
  return (
    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
      <span className={cn('rounded-full px-2 py-0.5 font-semibold', tom)}>
        Precisão de ±{m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${m} m`}
      </span>
      {refinando && m > 8 && (
        <span className="inline-flex items-center gap-1 text-ink-3">
          <Loader2 className="size-3 animate-spin" /> Refinando pelo GPS…
        </span>
      )}
      {!refinando && m > 60 && <span className="text-ink-3">Sinal fraco: confira o ponto ou corrija no mapa.</span>}
    </p>
  )
}

/** Busca por texto (endereço, cidade, rodovia, posto) — depois o pino faz o ajuste fino. */
function BuscaLugarM({ aoEscolher }: { aoEscolher: (p: Ponto) => void }) {
  const [texto, setTexto] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<Array<Ponto & { nome: string }> | null>(null)

  async function buscar(e: FormEvent) {
    e.preventDefault()
    if (texto.trim().length < 3 || buscando) return
    setBuscando(true)
    const r = await buscarLugar(texto)
    setResultados(r)
    setBuscando(false)
  }

  return (
    <div className="flex flex-col gap-2">
      <form onSubmit={(e) => void buscar(e)} className="flex min-h-14 items-center gap-2 rounded-2xl border-2 border-line bg-inset pr-1.5 pl-3.5 focus-within:border-accent">
        <Search aria-hidden className="size-5 shrink-0 text-ink-3" />
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Endereço, cidade, rodovia ou posto"
          aria-label="Buscar lugar"
          enterKeyHint="search"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent py-3 text-[16px] text-ink outline-none placeholder:text-ink-3"
        />
        {texto && !buscando && (
          <button
            type="button"
            aria-label="Limpar"
            onClick={() => {
              setTexto('')
              setResultados(null)
            }}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink-3 active:bg-surface-2"
          >
            <X className="size-4" />
          </button>
        )}
        <BotaoM type="submit" variante="escuro" tamanho="md" carregando={buscando} disabled={texto.trim().length < 3} className="min-h-11 shrink-0 px-3.5">
          Buscar
        </BotaoM>
      </form>
      {resultados && (
        <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
          {resultados.length === 0 && (
            <li className="px-4 py-3 text-[13.5px] leading-snug text-ink-3">Nada encontrado. Tente só a cidade ou a rodovia (ex.: BR-116 Registro) e arraste o pino.</li>
          )}
          {resultados.map((r) => (
            <li key={`${r.lat},${r.lng}`} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => {
                  aoEscolher({ lat: r.lat, lng: r.lng })
                  setResultados(null)
                }}
                className="flex min-h-12 w-full items-start gap-2.5 px-3.5 py-3 text-left text-[14px] leading-snug text-ink active:bg-surface-2"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-accent" />
                <span className="line-clamp-2">{r.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ── 4. conferir ────────────────────────────────────────────────────────── */

function PassoConferir({
  cliente,
  veiculo,
  tipo,
  descricao,
  local,
  gps,
  opcoesOS,
  escolha,
  aoEscolha,
  aoAlterar,
  erro,
  enviando,
  online,
  aoAbrir,
}: {
  cliente: ClienteEscolhido
  veiculo: VeiculoEscolhido | null
  tipo: OcorrenciaSOS
  descricao: string
  local: LocalEscolhido
  gps: GpsPreciso
  opcoesOS: EscolhaOS[]
  escolha: EscolhaOS
  aoEscolha: (e: EscolhaOS) => void
  aoAlterar: (p: Passo) => void
  erro: string | null
  enviando: boolean
  online: boolean
  aoAbrir: () => void
}) {
  const info = OCORRENCIAS[tipo]
  const pontoGps = gps.leitura ? { lat: gps.leitura.lat, lng: gps.leitura.lng } : null
  const distancia = local.modo === 'ir' && pontoGps ? distanciaKm(pontoGps, local.ponto) : null
  const refinandoAqui = local.modo === 'aqui' && !local.ajustado && gps.refinando

  return (
    <>
      <TelaM comBarra={false} className="pb-[calc(10.5rem+env(safe-area-inset-bottom))]">
        <div className="flex flex-col divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-surface mec-sombra">
          <LinhaResumo icone={UserRound} rotulo="Cliente" aoAlterar={() => aoAlterar('cliente')}>
            <p className="font-display text-[16.5px] leading-tight font-extrabold break-words text-ink">{cliente.nome}</p>
            {cliente.telefone && <p className="num text-[13px] text-ink-3">{mascaraTelefone(cliente.telefone)}</p>}
            {!cliente.id && <SeloM tom="ciano" className="mt-1.5">Cliente novo</SeloM>}
          </LinhaResumo>

          <LinhaResumo icone={CarFront} rotulo="Veículo" aoAlterar={() => aoAlterar('cliente')}>
            {veiculo ? (
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {veiculo.placa && <Placa placa={veiculo.placa} />}
                <span className="min-w-0 text-[14.5px] font-semibold text-ink">{veiculo.descricao ?? (veiculo.placa ? 'Modelo não informado' : 'Veículo')}</span>
                {!veiculo.placa && <span className="w-full text-[12.5px] text-ink-3">Sem placa: o modelo vai na descrição do chamado.</span>}
              </div>
            ) : (
              <p className="text-[14.5px] text-ink-2">Sem veículo</p>
            )}
          </LinhaResumo>

          <LinhaResumo icone={info.icone} rotulo="Problema" aoAlterar={() => aoAlterar('problema')}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-[15.5px] leading-tight font-bold text-ink">{info.rotulo}</span>
              {info.prioridade !== 'normal' && <SeloM tom={info.prioridade === 'emergencia' ? 'vermelho' : 'ambar'}>{PRIORIDADES[info.prioridade].rotulo}</SeloM>}
            </div>
            <p className="mt-1 line-clamp-3 text-[14px] leading-snug break-words text-ink-2">{descricao.trim()}</p>
          </LinhaResumo>

          <LinhaResumo icone={local.modo === 'aqui' ? UserCheck : Navigation} rotulo={local.modo === 'aqui' ? 'Você está com o cliente' : 'Você vai até o cliente'} aoAlterar={() => aoAlterar('local')}>
            <p className="text-[14.5px] leading-snug font-semibold text-ink">{local.endereco ?? 'Endereço não identificado'}</p>
            <p className="num mt-0.5 text-[12px] text-ink-3">{formatarCoordenadas(local.ponto)}</p>
            {local.precisao != null ? (
              <Precisao metros={local.precisao} refinando={refinandoAqui} />
            ) : (
              <p className="mt-1 text-[12.5px] text-ink-3">Ponto marcado no mapa.</p>
            )}
            {distancia != null && (
              <p className="mt-1 text-[12.5px] font-semibold text-ink-2">
                ≈ <span className="num">{formatarDistancia(distancia * 1.3)}</span> de você
              </p>
            )}
          </LinhaResumo>
        </div>

        <SecaoM titulo="Ordem de serviço">
          {opcoesOS.length ? (
            <div role="radiogroup" aria-label="Ordem de serviço" className="flex flex-col gap-2">
              {opcoesOS.includes('vincular') && veiculo?.osAberta && (
                <OpcaoM
                  marcada={escolha === 'vincular'}
                  aoMarcar={() => aoEscolha('vincular')}
                  icone={Link2}
                  titulo={
                    <>
                      Lançar na OS nº <span className="num">{veiculo.osAberta.numero}</span>
                    </>
                  }
                  sub="Já aberta para este veículo. O atendimento entra nela, sem OS duplicada."
                />
              )}
              {opcoesOS.includes('nova') && (
                <OpcaoM
                  marcada={escolha === 'nova'}
                  aoMarcar={() => aoEscolha('nova')}
                  icone={FilePlus2}
                  titulo={veiculo?.osAberta ? 'Abrir OS nova' : 'Abrir OS agora'}
                  sub={veiculo?.osAberta ? 'Só se for um serviço separado da OS aberta.' : 'A OS nasce com cliente, veículo, placa e o problema.'}
                />
              )}
              <OpcaoM
                marcada={escolha === 'depois'}
                aoMarcar={() => aoEscolha('depois')}
                icone={Clock}
                titulo="Depois"
                sub="Você gera ou lança numa OS aberta dentro do atendimento."
              />
            </div>
          ) : (
            <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[13.5px] leading-snug text-ink-2">
              Sem veículo, a OS fica para depois: no atendimento você gera a OS ou lança numa OS aberta do cliente.
            </p>
          )}
        </SecaoM>
      </TelaM>

      <RodapeAcao>
        {erro && (
          <p role="alert" className="flex items-start gap-2 rounded-2xl bg-crit-soft px-3.5 py-2.5 text-[13.5px] leading-snug font-semibold text-crit-ink">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {erro}
          </p>
        )}
        {!online && <p className="text-center text-[13px] font-medium text-warn-ink">Sem internet: o chamado precisa de conexão para ser aberto.</p>}
        <BotaoM variante="laranja" tamanho="xxl" largo icone={Plus} carregando={enviando} disabled={!online} onClick={aoAbrir}>
          Abrir chamado
        </BotaoM>
        <p className="text-center text-[12.5px] leading-snug text-ink-3">
          {local.modo === 'aqui' ? 'Nasce na central com você no local — você entra direto no atendimento.' : 'Nasce na central com você a caminho — a central acompanha pelo mapa.'}
        </p>
      </RodapeAcao>
    </>
  )
}

function LinhaResumo({ icone: Icone, rotulo, aoAlterar, children }: { icone: LucideIcon; rotulo: string; aoAlterar: () => void; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
        <Icone className="size-5" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <RotuloM className="mb-1">{rotulo}</RotuloM>
        {children}
      </div>
      <button type="button" onClick={aoAlterar} className="-mr-1.5 min-h-11 shrink-0 rounded-xl px-2 text-[13.5px] font-bold text-accent-ink active:bg-surface-2">
        Alterar
      </button>
    </div>
  )
}

/* ── estados ────────────────────────────────────────────────────────────── */

function JaEmAtendimento({ chamado }: { chamado: NonNullable<HomeMecanico['chamado_atual']> }) {
  const navegar = useNavigate()
  return (
    <div className="mec mec-fundo min-h-dvh">
      <TopoM voltar="/" sobretitulo="Novo chamado" titulo="Um atendimento por vez" />
      <TelaM comBarra={false}>
        <CartaoM className="flex flex-col items-center gap-3 px-5 py-7 text-center">
          <IconeOcorrencia tipo={chamado.tipo_ocorrencia} prioridade={chamado.prioridade} tamanho="lg" />
          <p className="font-display text-[19px] leading-tight font-extrabold text-ink">Você já está em um atendimento</p>
          <p className="max-w-[20rem] text-[14.5px] leading-relaxed text-ink-2">
            Termine o <span className="num font-semibold text-ink">{chamado.protocolo}</span> ({chamado.cliente_nome}) antes de abrir outro chamado.
          </p>
          {chamado.placa && <Placa placa={chamado.placa} />}
          <BotaoM variante="laranja" tamanho="xl" largo className="mt-2" onClick={() => navegar(`/chamado/${chamado.id}`, { replace: true })}>
            Continuar atendimento
          </BotaoM>
        </CartaoM>
      </TelaM>
    </div>
  )
}
