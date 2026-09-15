import { useEffect, useMemo, useRef, useState, type PointerEvent as EventoPonteiro, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft,
  ChevronDown,
  CircleSlash,
  Clock,
  FileText,
  Loader2,
  LocateFixed,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Phone,
  PhoneCall,
  Route,
  Share2,
  ShieldCheck,
  Star,
  Truck,
  WifiOff,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { sosDetalhe } from '@/sos/api'
import { tocarAlerta, vibrarAlerta } from '@/sos/alerta'
import { Conversa, EnviarMidia, Estrelas, GaleriaAnexos, ItensAtendimento, LinhaDoTempo } from '@/sos/componentes'
import { calcularRota, distanciaKm, pontoDe, type Ponto, type Rota } from '@/sos/geo'
import { BotaoMapa, CapturaMapa, MapaSOS, enquadrarMapa, type MapaLeaflet, type MarcadorMapa } from '@/sos/Mapa'
import {
  MENSAGENS_RAPIDAS_CLIENTE,
  OCORRENCIAS,
  STATUS_SOS,
  chamadoAtivo,
  dataHoraCurta,
  formatarDistancia,
  formatarDuracao,
  formatarEta,
  haQuanto,
  horaCurta,
  linkTelefone,
  linkWhatsApp,
  ordemStatus,
} from '@/sos/rotulos'
import { useRastreioChamado } from '@/sos/useRastreio'
import { CHAVES_SOS, useTempoRealChamado } from '@/sos/tempoReal'
import type { DetalheChamado, StatusSOS } from '@/sos/tipos'
import { useCliente } from '../sessao'
import { Avatar, BotaoApp, BotaoCircular, Esqueleto, Faixa } from '../comum/ui'
import { compartilharAcompanhamento, nomeVeiculo, temaMapa, useInfoPublica } from './dados'
import { ErroCarga, IconeOcorrencia, PlacaVeiculo } from './pecas'
import { TelaAvaliacao } from './chamado/Avaliacao'
import { FolhaCancelar } from './chamado/Cancelar'
import { BotaoLaudo, temLaudo } from './chamado/Laudo'
import { LinhaTempoCliente } from './chamado/LinhaTempo'
import { CartaoOrcamento, FolhaOrcamento } from './chamado/Orcamento'
import { Radar } from './chamado/Radar'

type PosicaoMec = Ponto & { em: number }

/**
 * Acompanhamento do socorro, no estilo dos apps de mobilidade: mapa grande,
 * o mecânico andando ao vivo e uma folha embaixo com o que importa — status,
 * previsão, quem vem, como falar com ele, a linha do tempo.
 *
 * O estado completo vem de `sos_detalhe_chamado`; o tempo real invalida essa
 * consulta a cada mudança. A posição do mecânico é a exceção: chega direto do
 * evento e move o pino sem recarregar nada.
 */
export function ChamadoCliente() {
  const { id = '' } = useParams()
  const { usuarioId } = useCliente()
  const navegar = useNavigate()
  const toast = useToast()
  const info = useInfoPublica()
  const mapa = useRef<MapaLeaflet | null>(null)
  const conteudo = useRef<HTMLDivElement>(null)
  const chat = useRef<HTMLDivElement>(null)
  // Relógio da tela: "posição de 4 min atrás" precisa andar sem evento novo.
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), 30_000)
    return () => window.clearInterval(t)
  }, [])

  const detalhe = useQuery({
    queryKey: CHAVES_SOS.detalhe(id),
    queryFn: () => sosDetalhe(id),
    enabled: !!id,
    // Rede de segurança: se o tempo real cair (túnel, troca de antena), a tela
    // continua se atualizando sozinha enquanto o chamado está vivo.
    refetchInterval: (q) => {
      const s = q.state.data?.chamado.status
      return s && chamadoAtivo(s) ? 30_000 : false
    },
  })

  const [posAoVivo, setPosAoVivo] = useState<PosicaoMec | null>(null)
  useTempoRealChamado(id, {
    aoPosicao: (p) => {
      if (p.papel === 'mecanico') setPosAoVivo({ lat: p.latitude, lng: p.longitude, em: Date.parse(p.registrado_em) || Date.now() })
    },
  })

  const d = detalhe.data
  const c = d?.chamado
  const status = c?.status
  const ativo = !!status && chamadoAtivo(status)
  const rastreio = useRastreioChamado(id, ativo, 'cliente')

  // Toque curto e vibração quando a etapa muda — o celular pode estar no bolso.
  const statusVisto = useRef<StatusSOS | null>(null)
  useEffect(() => {
    if (!status) return
    if (statusVisto.current && statusVisto.current !== status) {
      tocarAlerta({ tipo: 'aviso' })
      vibrarAlerta('aviso')
    }
    statusVisto.current = status
  }, [status])

  /* ── posições ─────────────────────────────────────────────────────────── */

  const destino = pontoDe(c)
  const posMecanico = useMemo<PosicaoMec | null>(() => {
    if (!d?.mecanico) return null
    const candidatos: PosicaoMec[] = []
    if (posAoVivo) candidatos.push(posAoVivo)
    const u = d.ultima_posicao_mecanico
    if (u) candidatos.push({ lat: u.latitude, lng: u.longitude, em: Date.parse(u.registrado_em) || 0 })
    if (d.mecanico.latitude != null && d.mecanico.longitude != null)
      candidatos.push({ lat: d.mecanico.latitude, lng: d.mecanico.longitude, em: d.mecanico.posicao_em ? Date.parse(d.mecanico.posicao_em) : 0 })
    return candidatos.sort((a, b) => b.em - a.em)[0] ?? null
  }, [d, posAoVivo])

  const emRota = status === 'aceito' || status === 'a_caminho'
  const mostrarMecanico = !!posMecanico && !!status && ['aceito', 'a_caminho', 'no_local', 'servico_iniciado'].includes(status)

  // Rota pelas ruas, recalculada só quando o mecânico andou mais de ~150 m.
  const [rota, setRota] = useState<Rota | null>(null)
  const origemRota = useRef<Ponto | null>(null)
  const pedidoRota = useRef(0)
  useEffect(() => {
    if (!emRota || !posMecanico || !destino) {
      origemRota.current = null
      setRota(null)
      return
    }
    if (origemRota.current && distanciaKm(origemRota.current, posMecanico) < 0.15) return
    origemRota.current = { lat: posMecanico.lat, lng: posMecanico.lng }
    const n = ++pedidoRota.current
    void calcularRota(posMecanico, destino).then((r) => {
      if (n === pedidoRota.current) setRota(r)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emRota, posMecanico?.lat, posMecanico?.lng, destino?.lat, destino?.lng])

  const eta = rota?.real ? rota.duracaoMin : (c?.eta_min ?? rota?.duracaoMin ?? null)
  const distancia = rota?.real ? rota.distanciaKm : (c?.distancia_km ?? rota?.distanciaKm ?? null)

  const marcadores: MarcadorMapa[] = []
  if (destino) marcadores.push({ id: 'cliente', tipo: 'cliente', ponto: destino, rotulo: 'Seu veículo' })
  if (mostrarMecanico && posMecanico)
    marcadores.push({
      id: 'mecanico',
      tipo: 'mecanico',
      ponto: posMecanico,
      rotulo: d?.mecanico?.nome ?? 'Mecânico',
      sigla: iniciais(d?.mecanico?.nome),
      pulsar: status === 'a_caminho',
    })
  const eu = rastreio.posicao
  if (eu && destino && distanciaKm(eu, destino) > 0.04) marcadores.push({ id: 'eu', tipo: 'eu', ponto: eu, rotulo: 'Você' })

  /* ── folha inferior ───────────────────────────────────────────────────── */

  const [expandida, setExpandida] = useState(false)
  const toque = useRef<number | null>(null)

  // A conversa rola até a última mensagem e isso arrasta a folha junto. Na
  // primeira carga e com a folha recolhida, a folha volta ao topo: status e
  // previsão vêm primeiro. Aberta, a mensagem nova fica à vista.
  const carregou = !!detalhe.data
  const qtdMensagens = detalhe.data?.mensagens.length ?? 0
  const primeiraCarga = useRef(true)
  const expandidaRef = useRef(expandida)
  expandidaRef.current = expandida
  useEffect(() => {
    if (!carregou) return
    if (!primeiraCarga.current && expandidaRef.current) return
    primeiraCarga.current = false
    const t = window.setTimeout(() => conteudo.current?.scrollTo({ top: 0 }), 60)
    return () => window.clearTimeout(t)
  }, [carregou, qtdMensagens, detalhe.data?.chamado.status])
  const [avaliando, setAvaliando] = useState(false)
  const [adiouAvaliacao, setAdiouAvaliacao] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [compartilhando, setCompartilhando] = useState(false)
  const arrasto = useRef<{ y: number; moveu: boolean } | null>(null)

  const pedirAvaliacao = !!c && (c.status === 'servico_finalizado' || c.status === 'concluido') && !c.avaliado_em
  useEffect(() => {
    if (pedirAvaliacao && c?.status === 'servico_finalizado' && !adiouAvaliacao) setAvaliando(true)
  }, [pedirAvaliacao, c?.status, adiouAvaliacao])

  // Orçamento chegou (a notificação "Orçamento para aprovar" traz a pessoa
  // para cá): a folha com os itens abre sozinha, uma vez por envio.
  const [vendoOrcamento, setVendoOrcamento] = useState(false)
  const orcamentoPendente = c?.orcamento_status === 'pendente' && c.status !== 'cancelado'
  const envioOrcamento = c?.orcamento_enviado_em ?? null
  useEffect(() => {
    if (!orcamentoPendente || !envioOrcamento || avaliando) return
    const chave = `sos.orcamento.visto.${id}`
    try {
      if (sessionStorage.getItem(chave) === envioOrcamento) return
      sessionStorage.setItem(chave, envioOrcamento)
    } catch {
      /* sem armazenamento: abre mesmo assim */
    }
    setVendoOrcamento(true)
  }, [orcamentoPendente, envioOrcamento, avaliando, id])

  function aoTocarAlca(e: EventoPonteiro<HTMLButtonElement>) {
    arrasto.current = { y: e.clientY, moveu: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function aoMoverAlca(e: EventoPonteiro<HTMLButtonElement>) {
    if (!arrasto.current) return
    const dy = e.clientY - arrasto.current.y
    if (Math.abs(dy) < 28) return
    arrasto.current.moveu = true
    setExpandida(dy < 0)
  }
  function aoSoltarAlca() {
    if (arrasto.current && !arrasto.current.moveu) setExpandida((x) => !x)
    arrasto.current = null
  }

  function irParaChat() {
    setExpandida(true)
    window.setTimeout(() => chat.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 280)
  }

  async function compartilhar() {
    if (!c) return
    setCompartilhando(true)
    try {
      const r = await compartilharAcompanhamento(c.id, c.protocolo)
      if (r === 'copiado') toast.ok('Link copiado', 'Cole na conversa com quem vai acompanhar. Vale por 12 horas.')
    } catch (e) {
      toast.erro('Não deu para compartilhar', (e as Error).message)
    } finally {
      setCompartilhando(false)
    }
  }

  function voltar() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navegar(-1)
    else navegar('/', { replace: true })
  }

  /* ── estados de carga ─────────────────────────────────────────────────── */

  if (detalhe.isLoading) {
    return (
      <div className="fixed inset-0 flex flex-col bg-canvas">
        <div className="flex flex-1 items-center justify-center bg-surface-2">
          <Loader2 className="size-8 animate-spin text-ink-3" />
        </div>
        <div className="-mt-6 flex h-[48dvh] flex-col gap-3 rounded-t-[1.75rem] border-t border-line bg-surface p-5">
          <Esqueleto className="mx-auto h-1.5 w-10" />
          <Esqueleto className="h-5 w-32" />
          <Esqueleto className="h-9 w-3/4" />
          <Esqueleto className="h-24" />
          <Esqueleto className="h-20" />
        </div>
      </div>
    )
  }

  if (detalhe.isError || !d || !c || !status) {
    return (
      <div className="flex min-h-dvh flex-col bg-canvas px-4 pt-[calc(0.75rem+env(safe-area-inset-top)+var(--faixa-rede,0px))]">
        <button type="button" onClick={voltar} aria-label="Voltar" className="flex size-11 items-center justify-center rounded-full text-ink">
          <ChevronLeft className="size-6" />
        </button>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4">
          <h1 className="font-display text-[22px] font-bold text-ink">Não conseguimos abrir este chamado</h1>
          <ErroCarga erro={detalhe.error ?? new Error('Chamado não encontrado.')} aoTentar={() => void detalhe.refetch()} />
          {linkTelefone(info.data?.telefone) && (
            <a href={linkTelefone(info.data?.telefone)!} className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#0D1C33] font-display text-[16px] font-bold text-white">
              <PhoneCall className="size-5" /> Ligar para a Tecnoar
            </a>
          )}
        </div>
      </div>
    )
  }

  const aguardando = status === 'recebido' || status === 'procurando_mecanico'
  const limite = info.data?.cancelamento_cliente_ate ?? 'servico_iniciado'
  const podeCancelar = ativo && ordemStatus(status) < ordemStatus(limite)
  const telCentral = linkTelefone(info.data?.telefone)
  const whatsCentral = linkWhatsApp(info.data?.whatsapp ?? info.data?.telefone, `Olá! Sobre o meu socorro ${c.protocolo}.`)
  const telMecanico = linkTelefone(d.mecanico?.telefone)
  const chegadaPrevista = eta != null ? new Date(Date.now() + eta * 60_000) : null
  // Sem posição nova há 3 min: o pino parou, e a tela diz por quê.
  const posAntiga = !!posMecanico && agora - posMecanico.em > 3 * 60_000
  const finalizado = status === 'servico_finalizado' || status === 'concluido'
  const emServico = status === 'no_local' || status === 'servico_iniciado'

  return (
    <div className="fixed inset-0 flex flex-col bg-canvas md:flex-row-reverse">
      {/* ── mapa ── */}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <MapaSOS marcadores={marcadores} rota={rota?.pontos ?? null} rotaEstimada={!!rota && !rota.real} zoom={15} tema={temaMapa()} className="size-full">
            <CapturaMapa destino={mapa} />
          </MapaSOS>
        </div>
        {aguardando && <Radar />}

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-3 pt-[calc(0.5rem+env(safe-area-inset-top)+var(--faixa-rede,0px))]">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={voltar} aria-label="Voltar" className={BOTAO_MAPA}>
              <ChevronLeft className="size-6" />
            </button>
            <span className="num pointer-events-auto rounded-full border border-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink shadow-[0_4px_14px_rgb(8_24_48/0.15)]">
              {c.protocolo}
            </span>
            <button type="button" onClick={() => void compartilhar()} disabled={compartilhando} aria-label="Compartilhar acompanhamento" className={cn(BOTAO_MAPA, 'disabled:opacity-60')}>
              {compartilhando ? <Loader2 className="size-5 animate-spin" /> : <Share2 className="size-5" />}
            </button>
          </div>
        </div>

        <div className={cn('absolute right-3 bottom-9 z-10 flex-col gap-2 md:flex', expandida ? 'hidden' : 'flex')}>
          {marcadores.length > 1 && (
            <BotaoMapa rotulo="Ver os dois no mapa" onClick={() => enquadrarMapa(mapa.current, marcadores.map((m) => m.ponto))}>
              <Route />
            </BotaoMapa>
          )}
          {destino && (
            <BotaoMapa rotulo="Centralizar no veículo" onClick={() => enquadrarMapa(mapa.current, [destino])}>
              <LocateFixed />
            </BotaoMapa>
          )}
        </div>
      </div>

      {/* ── folha ── */}
      <section
        className={cn(
          'relative z-20 -mt-6 flex flex-col rounded-t-[1.75rem] border-t border-line bg-canvas shadow-[0_-12px_32px_-18px_rgb(8_24_48/0.4)] transition-[height] duration-300 ease-out md:mt-0 md:h-full md:w-[26rem] md:shrink-0 md:rounded-none md:border-t-0 md:border-r md:pt-[env(safe-area-inset-top)] md:shadow-none lg:w-[28rem]',
          expandida ? 'h-[86dvh]' : 'h-[52dvh]',
        )}
        aria-label="Detalhes do socorro"
      >
        <button
          type="button"
          aria-label={expandida ? 'Recolher detalhes' : 'Ver todos os detalhes'}
          aria-expanded={expandida}
          onPointerDown={aoTocarAlca}
          onPointerMove={aoMoverAlca}
          onPointerUp={aoSoltarAlca}
          onPointerCancel={() => (arrasto.current = null)}
          className="flex h-7 w-full shrink-0 touch-none items-center justify-center md:hidden"
        >
          <span className="h-1.5 w-11 rounded-full bg-line-strong" />
        </button>

        <div
          ref={conteudo}
          // Deslizar o dedo para cima na folha recolhida abre a folha inteira
          // (gesto dos apps de mobilidade).
          onTouchStart={(e) => (toque.current = e.touches[0]?.clientY ?? null)}
          onTouchMove={(e) => {
            const y = e.touches[0]?.clientY
            if (!expandida && toque.current != null && y != null && toque.current - y > 24) setExpandida(true)
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:pt-5"
        >
          <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
            {/* status */}
            <header className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <PilulaStatus status={status} />
                {c.prioridade === 'emergencia' && ativo && <span className="rounded-full bg-crit-soft px-2.5 py-1 text-[11.5px] font-bold text-crit-ink">Emergência</span>}
              </div>
              <h1 className="font-display text-[24px] leading-[1.15] font-bold text-ink">{titulo(d)}</h1>
              <p className="text-[14.5px] leading-snug text-ink-2">{subtitulo(d, info.data?.mensagem_espera ?? null)}</p>
            </header>

            {/* Orçamento aguardando resposta vem antes de tudo: o mecânico está parado esperando. */}
            {orcamentoPendente && <CartaoOrcamento detalhe={d} aoAbrir={() => setVendoOrcamento(true)} />}

            {/* O vigia do servidor escalou: ninguém aceitou no prazo. */}
            {aguardando && (c.alerta_nivel ?? 0) >= 1 && (
              <div role="status" className="flex flex-col gap-3 rounded-[1.25rem] border border-warn/30 bg-warn-soft p-4">
                <div>
                  <p className="font-display text-[15.5px] font-bold text-ink">Está demorando mais que o normal</p>
                  <p className="mt-1 text-[13.5px] leading-snug text-ink-2">
                    {(c.alerta_nivel ?? 0) >= 2
                      ? 'A central da Tecnoar está cuidando do seu chamado pessoalmente e pode te ligar.'
                      : 'Já avisamos de novo os mecânicos e a central da Tecnoar. Seu pedido não foi esquecido.'}
                  </p>
                </div>
                {telCentral && (
                  <a href={telCentral} className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0D1C33] font-display text-[15px] font-bold text-white active:scale-[0.99]">
                    <PhoneCall className="size-5" /> Ligar para a Tecnoar
                  </a>
                )}
              </div>
            )}

            {/* previsão de chegada */}
            {emRota && (
              <section aria-label="Previsão de chegada" className="grid grid-cols-2 divide-x divide-line rounded-[1.25rem] border border-line bg-surface">
                <div className="p-4">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3">
                    <Clock className="size-4" /> Chega em
                  </p>
                  <p className="mt-1 font-display text-[30px] leading-none font-black text-accent-ink">{eta != null ? formatarEta(eta) : '—'}</p>
                  {chegadaPrevista && <p className="mt-1.5 text-[12.5px] text-ink-3">por volta das {horaCurta(chegadaPrevista.toISOString())}</p>}
                </div>
                <div className="p-4">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3">
                    <Route className="size-4" /> Distância
                  </p>
                  <p className="mt-1 font-display text-[30px] leading-none font-black text-ink">{formatarDistancia(distancia)}</p>
                  <p className={cn('mt-1.5 text-[12.5px]', posAntiga ? 'font-semibold text-warn-ink' : 'text-ink-3')}>
                    {posMecanico ? `posição ${haQuanto(new Date(posMecanico.em).toISOString())}` : 'aguardando posição'}
                  </p>
                </div>
              </section>
            )}
            {emRota && posAntiga && (
              <Faixa tom="atencao" icone={WifiOff}>
                O celular do mecânico está sem sinal agora (comum na estrada). Ele continua a caminho; a previsão volta a se atualizar quando o sinal voltar.
              </Faixa>
            )}

            {/* perfil do mecânico */}
            {d.mecanico && (
              <section className="flex flex-col gap-4 rounded-[1.25rem] border border-line bg-surface p-4" aria-label="Seu mecânico">
                <div className="flex items-center gap-3.5">
                  <Avatar nome={d.mecanico.nome} url={d.mecanico.avatar_url} tamanho="lg" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium text-ink-3">Seu mecânico Tecnoar</p>
                    <p className="truncate font-display text-[19px] leading-tight font-bold text-ink">{d.mecanico.nome}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
                      {d.mecanico.nota != null && (
                        <span className="inline-flex items-center gap-1 font-semibold text-ink">
                          <Star className="size-3.5 fill-[#f5a524] text-[#f5a524]" /> {Number(d.mecanico.nota).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                        </span>
                      )}
                      <span>
                        {d.mecanico.atendimentos} atendimento{d.mecanico.atendimentos === 1 ? '' : 's'}
                      </span>
                    </p>
                    {d.mecanico.veiculo_apoio && (
                      <p className="mt-1 flex items-center gap-1.5 truncate text-[12.5px] text-ink-3">
                        <Truck className="size-3.5 shrink-0" /> {d.mecanico.veiculo_apoio}
                      </p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <BotaoCircular rotulo="Ligar" icone={Phone} href={ativo ? telMecanico : null} variante="ok" />
                  <BotaoCircular rotulo="Mensagem" icone={MessageSquareText} onClick={irParaChat} variante="primario" />
                  <BotaoCircular rotulo="Compartilhar" icone={Share2} onClick={() => void compartilhar()} />
                </div>
                {ativo && !telMecanico && <p className="-mt-1 text-center text-[12px] text-ink-3">O mecânico preferiu não mostrar o telefone. Fale pela mensagem ou com a Tecnoar.</p>}
              </section>
            )}

            {/* procurando */}
            {aguardando && (
              <section className="flex flex-col gap-2.5 rounded-[1.25rem] border border-line bg-surface p-4">
                <p className="flex items-center gap-2 font-display text-[15.5px] font-bold text-ink">
                  <ShieldCheck className="size-5 text-ok" /> Enquanto isso
                </p>
                <ul className="flex flex-col gap-1.5 text-[14px] leading-snug text-ink-2">
                  <li>• Deixe o pisca-alerta ligado e o triângulo na via.</li>
                  <li>• Se puder, fique fora da pista, em local seguro.</li>
                  <li>• Uma foto do problema ajuda o mecânico a trazer a peça certa.</li>
                </ul>
              </section>
            )}

            {/* serviço em andamento */}
            {emServico && (d.itens.length > 0 || status === 'servico_iniciado') && (
              <Bloco titulo="Serviço em andamento" icone={Wrench}>
                <ItensAtendimento chamadoId={c.id} itens={d.itens} podeEditar={false} />
              </Bloco>
            )}

            {/* finalização */}
            {finalizado && <ResumoFinal detalhe={d} />}
            {pedirAvaliacao && !avaliando && (
              <button type="button" onClick={() => setAvaliando(true)} className="flex min-h-16 items-center gap-3 rounded-[1.25rem] border border-accent/30 bg-accent-soft px-4 text-left">
                <Star className="size-6 shrink-0 fill-[#f5a524] text-[#f5a524]" />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-[15.5px] font-bold text-ink">Avaliar o mecânico</span>
                  <span className="block text-[12.5px] text-ink-2">Leva 5 segundos e ajuda a Tecnoar.</span>
                </span>
              </button>
            )}
            {c.avaliado_em && c.avaliacao_nota != null && (
              <div className="flex items-center gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
                <Estrelas valor={c.avaliacao_nota} tamanho="sm" />
                <p className="min-w-0 flex-1 truncate text-[13.5px] text-ink-2">{c.avaliacao_comentario || 'Obrigado pela avaliação!'}</p>
              </div>
            )}
            {temLaudo(status) && <BotaoLaudo chamadoId={c.id} />}
            {c.orcamento_status && !orcamentoPendente && <CartaoOrcamento detalhe={d} aoAbrir={() => setVendoOrcamento(true)} />}

            {status === 'cancelado' && (
              <Faixa tom="info" icone={CircleSlash}>
                Cancelado {c.cancelado_em ? `em ${dataHoraCurta(c.cancelado_em)}` : ''}
                {c.motivo_cancelamento ? ` · ${c.motivo_cancelamento}` : ''}
              </Faixa>
            )}
            {rastreio.erroGps === 'negado' && ativo && (
              <Faixa tom="atencao" icone={MapPin}>
                Sua localização está bloqueada. O mecânico vai até o ponto marcado no pedido.
              </Faixa>
            )}

            {/* linha do tempo */}
            <Bloco titulo="Andamento">
              <LinhaTempoCliente chamado={c} />
            </Bloco>

            <div ref={chat} className="scroll-mt-4">
              <Bloco titulo="Conversa com o mecânico" icone={MessageSquareText}>
                <Conversa chamadoId={c.id} mensagens={d.mensagens} meuId={usuarioId} rapidas={MENSAGENS_RAPIDAS_CLIENTE} encerrado={!ativo} alturaMaxima="max-h-[42dvh]" />
              </Bloco>
            </div>

            <Bloco titulo="Fotos, vídeos e áudios">
              <GaleriaAnexos anexos={d.anexos} meuId={usuarioId} chamadoId={c.id} vazio="Nenhum arquivo ainda. Uma foto ajuda muito." />
              {ativo && <EnviarMidia chamadoId={c.id} />}
            </Bloco>

            {!emServico && d.itens.length > 0 && (
              <Bloco titulo="Serviços e peças">
                <ItensAtendimento chamadoId={c.id} itens={d.itens} podeEditar={false} />
              </Bloco>
            )}

            {!finalizado && (c.diagnostico || c.servico_realizado || c.observacoes_finais) && (
              <Bloco titulo="O que o mecânico encontrou">
                {c.diagnostico && <Texto rotulo="Diagnóstico">{c.diagnostico}</Texto>}
                {c.servico_realizado && <Texto rotulo="Serviço realizado">{c.servico_realizado}</Texto>}
                {c.observacoes_finais && <Texto rotulo="Observações">{c.observacoes_finais}</Texto>}
              </Bloco>
            )}

            <Bloco titulo="Seu pedido">
              <div className="flex items-center gap-3">
                <IconeOcorrencia tipo={c.tipo_ocorrencia} tamanho="sm" />
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">{OCORRENCIAS[c.tipo_ocorrencia]?.rotulo ?? c.ocorrencia_rotulo}</p>
                  <p className="text-[12.5px] text-ink-3">Pedido em {dataHoraCurta(c.recebido_em)}</p>
                </div>
              </div>
              {c.descricao && <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-line text-ink-2">{c.descricao}</p>}
              {d.veiculo && (
                <div className="flex flex-wrap items-center gap-2">
                  <PlacaVeiculo placa={d.veiculo.placa} tamanho="sm" />
                  <span className="text-[14px] text-ink">{nomeVeiculo(d.veiculo)}</span>
                </div>
              )}
              {c.endereco && (
                <p className="flex items-start gap-2 text-[13.5px] leading-snug text-ink-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-accent-ink" /> {c.endereco}
                </p>
              )}
              {d.os && (
                <p className="flex items-center gap-2 text-[13.5px] text-ink-2">
                  <FileText className="size-4 shrink-0 text-cyan" /> Registrado na OS nº <span className="num font-semibold text-ink">{d.os.numero}</span>
                </p>
              )}
            </Bloco>

            {d.eventos.length > 0 && (
              <details className="group rounded-[1.25rem] border border-line bg-surface">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14.5px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  Registro completo
                  <ChevronDown className="size-5 text-ink-3 transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-line p-4">
                  <LinhaDoTempo eventos={[...d.eventos].reverse()} />
                </div>
              </details>
            )}

            {/* ajuda e cancelamento */}
            <div className="flex flex-col gap-2 pt-1">
              {telCentral && (
                <a href={telCentral} className="flex min-h-14 items-center justify-center gap-2.5 rounded-2xl bg-[#0D1C33] font-display text-[16px] font-bold text-white active:scale-[0.99] dark:bg-[#002061]">
                  <PhoneCall className="size-5" /> Ligar para a Tecnoar
                </a>
              )}
              {whatsCentral && (
                <a
                  href={whatsCentral}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-line-strong bg-surface font-display text-[15px] font-bold text-ink"
                >
                  <MessageCircle className="size-5 text-ok" /> WhatsApp da Tecnoar
                </a>
              )}
              {podeCancelar && (
                <BotaoApp variante="fantasma" tamanho="md" largo icone={CircleSlash} onClick={() => setCancelando(true)} className="text-crit-ink">
                  Cancelar o socorro
                </BotaoApp>
              )}
              {ativo && !podeCancelar && <p className="text-center text-[12.5px] text-ink-3">O serviço já começou. Para cancelar, fale com a Tecnoar.</p>}
              {!ativo && (
                <BotaoApp variante="fantasma" tamanho="md" largo icone={Wrench} onClick={() => navegar('/historico')}>
                  Ver histórico do veículo
                </BotaoApp>
              )}
            </div>
          </div>
        </div>
      </section>

      <FolhaCancelar chamadoId={c.id} aberta={cancelando} aoFechar={() => setCancelando(false)} />
      {c.orcamento_status && <FolhaOrcamento detalhe={d} aberta={vendoOrcamento && !avaliando} aoFechar={() => setVendoOrcamento(false)} />}
      {avaliando && (
        <TelaAvaliacao
          detalhe={d}
          aoFechar={() => {
            setAvaliando(false)
            setAdiouAvaliacao(true)
          }}
        />
      )}
    </div>
  )
}

const BOTAO_MAPA =
  'pointer-events-auto flex size-12 items-center justify-center rounded-full border border-line bg-surface text-ink shadow-[0_4px_14px_rgb(8_24_48/0.18)] active:scale-95'

const COR_STATUS: Record<StatusSOS, string> = {
  solicitado: 'bg-ink-3',
  recebido: 'bg-[#ff6600]',
  procurando_mecanico: 'bg-[#ff6600]',
  aceito: 'bg-accent',
  a_caminho: 'bg-accent',
  no_local: 'bg-cyan',
  servico_iniciado: 'bg-cyan',
  servico_finalizado: 'bg-ok',
  concluido: 'bg-ok',
  cancelado: 'bg-ink-3',
}

function PilulaStatus({ status }: { status: StatusSOS }) {
  const vivo = chamadoAtivo(status)
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] font-semibold text-ink">
      <span className={cn('size-2 rounded-full', COR_STATUS[status], vivo && 'sos-piscar')} />
      {STATUS_SOS[status].curto}
    </span>
  )
}

function Bloco({ titulo, icone: Icone, children }: { titulo: string; icone?: typeof Wrench; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
      <h2 className="flex items-center gap-2 font-display text-[15.5px] font-bold text-ink">
        {Icone && <Icone className="size-[18px] text-ink-3" />}
        {titulo}
      </h2>
      {children}
    </section>
  )
}

/** Fechamento do atendimento: o que foi feito, quanto tempo levou, quanto ficou. */
function ResumoFinal({ detalhe: d }: { detalhe: DetalheChamado }) {
  const c = d.chamado
  const total = c.orcamento_valor ?? d.itens.reduce((s, i) => s + Number(i.valor_total ?? 0), 0)
  return (
    <section aria-label="Resumo do atendimento" className="flex flex-col gap-3 rounded-[1.25rem] border border-ok/30 bg-surface p-4">
      <h2 className="flex items-center gap-2 font-display text-[15.5px] font-bold text-ink">
        <ShieldCheck className="size-5 text-ok" /> Resumo do atendimento
      </h2>
      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-[12px] text-ink-3">Tempo total</dt>
          <dd className="mt-0.5 font-display text-[17px] font-bold text-ink">{formatarDuracao(c.tempo_total_seg)}</dd>
        </div>
        <div className="rounded-xl bg-surface-2 p-3">
          <dt className="text-[12px] text-ink-3">Valor</dt>
          <dd className="num mt-0.5 text-[17px] font-bold text-ink">{d.itens.length || c.orcamento_valor != null ? moeda(total) : '—'}</dd>
        </div>
      </dl>
      {c.diagnostico && <Texto rotulo="O que foi encontrado">{c.diagnostico}</Texto>}
      {c.servico_realizado && <Texto rotulo="O que foi feito">{c.servico_realizado}</Texto>}
      {c.observacoes_finais && <Texto rotulo="Recomendações">{c.observacoes_finais}</Texto>}
      {d.os && <p className="text-[12.5px] text-ink-3">Tudo registrado na OS nº {d.os.numero} e no seu histórico.</p>}
    </section>
  )
}

function Texto({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[12.5px] font-medium text-ink-3">{rotulo}</p>
      <p className="text-[14.5px] leading-relaxed whitespace-pre-line text-ink">{children}</p>
    </div>
  )
}

function titulo(d: DetalheChamado): string {
  const c = d.chamado
  switch (c.status) {
    case 'recebido':
    case 'procurando_mecanico':
      return 'Procurando o mecânico mais próximo'
    case 'aceito':
      return 'Mecânico a caminho'
    case 'servico_finalizado':
      return 'Serviço finalizado'
    case 'concluido':
      return 'Atendimento concluído'
    case 'cancelado':
      return 'Pedido cancelado'
    default:
      return STATUS_SOS[c.status].cliente
  }
}

function subtitulo(d: DetalheChamado, espera: string | null): string {
  const c = d.chamado
  const nome = d.mecanico?.nome?.split(' ')[0]
  switch (c.status) {
    case 'solicitado':
    case 'recebido':
    case 'procurando_mecanico':
      return espera || 'Recebemos seu pedido. Você acompanha tudo por aqui.'
    case 'aceito':
    case 'a_caminho':
      return nome ? `${nome} está indo até você. Acompanhe no mapa.` : 'O mecânico está indo até você.'
    case 'no_local':
      return nome ? `${nome} chegou ao local do veículo.` : 'O mecânico chegou ao local.'
    case 'servico_iniciado':
      return 'O mecânico está trabalhando no veículo. O que ele usar aparece abaixo.'
    case 'servico_finalizado':
      return 'Tudo pronto. Confira o resumo e conte como foi.'
    case 'concluido':
      return `Atendimento encerrado${c.concluido_em ? ` em ${dataHoraCurta(c.concluido_em)}` : ''}.`
    case 'cancelado':
      return 'Este pedido foi cancelado.'
  }
}

function iniciais(nome: string | null | undefined): string {
  return (nome ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}
