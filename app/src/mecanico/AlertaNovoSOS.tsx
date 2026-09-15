import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Ban, Check, Clock, Loader2, Siren, Volume2, VolumeX, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sosAceitar, sosConfigAtual, sosDetalhe, sosRecusar } from '@/sos/api'
import { destravarAudio, pararAlerta, pararTitulo, piscarTitulo, tocarAlerta, vibrarAlerta } from '@/sos/alerta'
import { calcularRota, distanciaKm, pontoDe, posicaoAtual, type LeituraGPS, type Ponto } from '@/sos/geo'
import {
  OCORRENCIAS,
  ROTULO_TIPO_VEICULO,
  STATUS_EM_CAMPO,
  formatarDistancia,
  formatarEta,
  haQuanto,
  horaCurta,
} from '@/sos/rotulos'
import { CHAVES_SOS, useTempoRealMecanico } from '@/sos/tempoReal'
import type { ChamadoSOS, HomeMecanico } from '@/sos/tipos'
import { useMecanico } from '../sessao'
import { useAgora, useHomeMecanico } from './dados'
import { Placa } from './pecas'
import { BotaoM, RotuloM, SeloM } from './ui'

/**
 * NOVO SOS TECNOAR — a tela que para tudo.
 *
 * Chega um chamado: sirene, vibração e esta tela por cima de qualquer outra.
 * Pouca informação, de propósito: cliente, veículo e placa, o problema, a
 * distância e a estimativa — e dois botões do tamanho de um polegar, ACEITAR
 * e RECUSAR (com motivo). A barra de tempo é só visual: ninguém é recusado
 * sozinho.
 */

export type InicialAlerta = Partial<ChamadoSOS> & {
  cliente_nome?: string | null
  placa?: string | null
  veiculo?: string | null
  ocorrencia_rotulo?: string
  para_mim?: boolean
  recusei?: boolean
}

const MOTIVOS = ['Longe demais', 'Sem ferramenta/peça', 'Em outro atendimento', 'Outro'] as const
type Motivo = (typeof MOTIVOS)[number]
type Fase = 'decidir' | 'recusar' | 'aceitando' | 'recusando' | 'erro'

export function AlertaNovoSOS({
  chamadoId,
  inicial,
  tocarSom = false,
  posicao,
  emOutroAtendimento,
  aoFechar,
  aoAceitar,
}: {
  chamadoId: string
  inicial?: InicialAlerta
  /** Sirene e vibração: chamado que acabou de chegar. Tocar num cartão da fila abre calado. */
  tocarSom?: boolean
  posicao?: LeituraGPS | null
  /** Já tem um atendimento aberto — o banco não deixa aceitar outro. */
  emOutroAtendimento?: boolean
  aoFechar: () => void
  aoAceitar: () => void
}) {
  const { usuarioId } = useMecanico()
  const qc = useQueryClient()
  const agora = useAgora(1000)
  const [abertoEm] = useState(() => Date.now())
  const [fase, setFase] = useState<Fase>('decidir')
  const [erro, setErro] = useState<string | null>(null)
  const [motivo, setMotivo] = useState<Motivo | null>(null)
  const [outro, setOutro] = useState('')
  const [som, setSom] = useState<'tocando' | 'bloqueado' | 'mudo'>(tocarSom ? 'tocando' : 'mudo')
  const mudo = useRef(!tocarSom)
  // Quem abre passa funções novas a cada render; o relógio da contagem
  // re-renderiza a cada segundo e não pode reiniciar o fechamento automático.
  const aoFecharRef = useRef(aoFechar)
  aoFecharRef.current = aoFechar

  const detalhe = useQuery({
    queryKey: CHAVES_SOS.detalhe(chamadoId),
    queryFn: () => sosDetalhe(chamadoId),
    retry: false,
    refetchInterval: 15_000,
  })
  // A configuração só é lida por quem também é da central; para o mecânico
  // vem nula e valem os padrões do banco (120 s, 40 km/h).
  const config = useQuery({ queryKey: CHAVES_SOS.config, queryFn: sosConfigAtual, staleTime: 10 * 60_000, retry: false })

  /* ── dados do chamado (o que chegou no aviso + o detalhe completo) ── */
  const d = detalhe.data
  const c: InicialAlerta = { ...inicial, ...(d?.chamado ?? {}) }
  const info = OCORRENCIAS[c.tipo_ocorrencia ?? 'outro'] ?? OCORRENCIAS.outro
  const IconeProblema = info.icone
  const clienteNome = d?.cliente?.nome ?? inicial?.cliente_nome ?? null
  const placa = d?.veiculo?.placa ?? inicial?.placa ?? null
  // Só marca e modelo ("Scania R450"): o tipo do veículo não decide o aceite.
  const veiculo = d?.veiculo
    ? [d.veiculo.marca, d.veiculo.modelo].filter(Boolean).join(' ') || d.veiculo.descricao || (d.veiculo.tipo ? ROTULO_TIPO_VEICULO[d.veiculo.tipo] ?? null : null)
    : inicial?.veiculo || null
  const destino = pontoDe(c)
  const paraMim = !!usuarioId && c.mecanico_id === usuarioId
  const emergencia = c.prioridade === 'emergencia'

  const status = c.status
  const aguardando = !status || status === 'recebido' || status === 'procurando_mecanico'
  const escalado = paraMim && !!status && STATUS_EM_CAMPO.includes(status)
  const msgErroDetalhe = detalhe.error ? (detalhe.error as Error).message : null
  // Sem acesso depois de ter visto = outro mecânico assumiu (a RLS esconde).
  const semAcesso = !!msgErroDetalhe && /sem acesso/i.test(msgErroDetalhe)
  const perdido = semAcesso || (!!d && !escalado && (!aguardando || (!!c.mecanico_id && !paraMim)))
  const motivoPerdido = status === 'cancelado' ? 'O chamado foi cancelado.' : 'Outro mecânico já assumiu este chamado.'
  const semDados = !d && !inicial && detalhe.isError && !semAcesso

  /* ── som, vibração e título piscando ── */
  const silenciar = useCallback(() => {
    mudo.current = true
    setSom('mudo')
    pararAlerta()
    pararTitulo()
  }, [])

  useEffect(() => {
    if (!tocarSom) return
    let vezes = 0
    let vibracoes = 0
    const tocar = () => {
      if (mudo.current) return
      vezes++
      const ok = tocarAlerta({ duracaoMs: 18_000, volume: 0.28 })
      setSom(ok ? 'tocando' : 'bloqueado')
    }
    tocar()
    vibrarAlerta('sos')
    piscarTitulo('🚨 NOVO SOS')
    // Repete a sirene algumas vezes (≈ 2 min) — quem está debaixo do caminhão
    // pode não ouvir a primeira.
    const sirene = window.setInterval(() => vezes < 4 && tocar(), 30_000)
    const vibra = window.setInterval(() => {
      if (mudo.current || ++vibracoes > 10) return
      vibrarAlerta('sos')
    }, 6000)
    return () => {
      window.clearInterval(sirene)
      window.clearInterval(vibra)
      pararAlerta()
      pararTitulo()
    }
  }, [tocarSom])

  // Rolagem da página de trás fica presa enquanto o alerta está aberto.
  useEffect(() => {
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = antes
    }
  }, [])

  /* ── chamado assumido por outro / cancelado: avisa e fecha sozinho ── */
  useEffect(() => {
    if (!perdido) return
    silenciar()
    const t = window.setTimeout(() => aoFecharRef.current(), 4500)
    return () => window.clearTimeout(t)
  }, [perdido, silenciar])

  /* ── minha posição → distância e previsão de chegada ── */
  const [eu, setEu] = useState<Ponto | null>(posicao ? { lat: posicao.lat, lng: posicao.lng } : null)
  useEffect(() => {
    if (posicao) setEu({ lat: posicao.lat, lng: posicao.lng })
  }, [posicao?.lat, posicao?.lng]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!eu) {
      const reserva = pontoDe(qc.getQueryData<HomeMecanico>(CHAVES_SOS.homeMecanico)?.ficha)
      if (reserva) setEu(reserva)
    }
    // Leitura fresca: a posição guardada pode ser de horas atrás.
    posicaoAtual({ timeoutMs: 8000, maxIdadeMs: 60_000 })
      .then((l) => setEu({ lat: l.lat, lng: l.lng }))
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const velocidade = config.data?.velocidade_media_kmh ?? 40
  const rota = useQuery({
    queryKey: ['sos', 'rota-alerta', chamadoId, eu && `${eu.lat.toFixed(3)},${eu.lng.toFixed(3)}`, destino && `${destino.lat.toFixed(4)},${destino.lng.toFixed(4)}`],
    enabled: !!eu && !!destino,
    staleTime: 60_000,
    retry: false,
    queryFn: () => calcularRota(eu as Ponto, destino as Ponto, velocidade),
  })
  const distancia = rota.data?.distanciaKm ?? (eu && destino ? distanciaKm(eu, destino) * 1.3 : inicial?.distancia_km ?? null)
  const eta = rota.data?.duracaoMin ?? (distancia != null ? Math.max(1, Math.ceil((distancia / velocidade) * 60)) : null)
  const chegada = eta != null ? horaCurta(new Date(agora + eta * 60_000).toISOString()) : null


  /* ── contagem regressiva (visual) ── */
  const limite = config.data?.tempo_aceite_seg ?? 120
  const base = Date.parse((paraMim && c.atribuido_em) || c.recebido_em || '') || abertoEm
  const decorrido = Math.max(0, (agora - base) / 1000)
  const restante = Math.max(0, limite - decorrido)

  /* ── ações ── */
  async function aceitar() {
    silenciar()
    setErro(null)
    setFase('aceitando')
    let p: Ponto | null = eu
    try {
      const l = await posicaoAtual({ timeoutMs: 6000, maxIdadeMs: 20_000 })
      p = { lat: l.lat, lng: l.lng }
    } catch {
      /* segue com a última posição conhecida */
    }
    try {
      await sosAceitar(chamadoId, p?.lat, p?.lng)
      vibrarAlerta('aviso')
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(chamadoId) })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeMecanico })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.papel })
      aoAceitar()
    } catch (e) {
      // "Este chamado não está mais disponível…", "…atribuído a outro
      // mecânico", "Termine o atendimento atual…": o banco já explica.
      setErro((e as Error).message)
      setFase('erro')
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeMecanico })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(chamadoId) })
    }
  }

  async function recusar() {
    setErro(null)
    setFase('recusando')
    const texto = motivo === 'Outro' ? (outro.trim() ? `Outro: ${outro.trim()}` : 'Outro') : motivo
    try {
      await sosRecusar(chamadoId, texto)
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeMecanico })
      aoFechar()
    } catch (e) {
      setErro((e as Error).message)
      setFase('recusar')
    }
  }

  function fechar() {
    silenciar()
    aoFechar()
  }

  const cabecalho = escalado ? 'A central escalou você' : paraMim ? 'SOS para você' : 'Novo SOS Tecnoar'
  const fracao = escalado || perdido ? 0 : restante > 0 ? restante / limite : 0

  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="alerta-sos-titulo"
      aria-describedby="alerta-sos-cliente"
      className="mec fixed inset-0 z-[95] flex flex-col overflow-hidden bg-canvas text-ink"
    >
      {/* Faixa vermelha do SOS, por baixo do relógio do iPhone. */}
      <div className="relative shrink-0 bg-[#ff6600] text-white">
        <div className="mx-auto flex w-full max-w-md items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3">
          <Siren className="sos-piscar size-6 shrink-0" strokeWidth={2.4} />
          <h2 id="alerta-sos-titulo" className="min-w-0 flex-1 truncate font-display text-[19px] leading-tight font-black tracking-[0.02em] uppercase max-[400px]:text-[16.5px] max-[359px]:text-[15px]">
            {cabecalho}
          </h2>
          {fase === 'decidir' && !perdido && (
            <button
              type="button"
              onClick={fechar}
              aria-label="Fechar e decidir depois"
              className="flex h-11 shrink-0 items-center gap-1 rounded-full bg-white/15 px-3 text-[13px] font-bold active:bg-white/25"
            >
              <span className="max-[400px]:sr-only">Depois</span> <X className="size-5 min-[401px]:size-4" />
            </button>
          )}
        </div>
        {/* Tempo para responder: a barra esvazia; só visual, ninguém é recusado sozinho. */}
        <div className="h-1.5 w-full bg-black/25" aria-hidden>
          <div className="h-full bg-white transition-[width] duration-1000 ease-linear" style={{ width: `${fracao * 100}%` }} />
        </div>
      </div>

      {/* O que decide: quem, o quê, onde e quanto falta. Nada além disso. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            {emergencia && <SeloM tom="vermelho">Emergência</SeloM>}
            {c.prioridade === 'alta' && <SeloM tom="ambar">Prioridade alta</SeloM>}
            {escalado ? (
              <SeloM tom="ciano">Você já está neste chamado</SeloM>
            ) : restante > 0 && !perdido ? (
              <span className="num text-[13px] font-semibold text-ink-2">{formatarRelogio(restante)} para responder</span>
            ) : (
              <span className="flex items-center gap-1 text-[13px] font-semibold text-ink-2">
                <Clock className="size-3.5" />
                {haQuanto(c.recebido_em, agora) === 'agora' ? 'Chegou agora' : `Aguardando ${haQuanto(c.recebido_em, agora)}`}
              </span>
            )}
            {c.protocolo && <span className="num ml-auto text-[12.5px] text-ink-3">{c.protocolo}</span>}
          </div>

          <div>
            <RotuloM>Cliente</RotuloM>
            <p id="alerta-sos-cliente" className="mt-1 line-clamp-2 font-display text-[26px] leading-[1.1] font-extrabold text-ink max-[359px]:text-[22px]">
              {clienteNome ?? (detalhe.isLoading ? 'Carregando…' : 'Cliente não identificado')}
            </p>
          </div>

          {(placa || veiculo) && (
            <div>
              <RotuloM>Veículo</RotuloM>
              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                {veiculo && <span className="min-w-0 font-display text-[20px] leading-tight font-bold text-ink">{veiculo}</span>}
                <Placa placa={placa} tamanho="lg" />
              </div>
            </div>
          )}

          <div>
            <RotuloM>Problema informado</RotuloM>
            <p className="mt-1.5 flex items-center gap-2.5 font-display text-[20px] leading-tight font-bold text-ink">
              <IconeProblema className={cn('size-6 shrink-0', emergencia ? 'text-crit' : 'text-accent')} strokeWidth={2.3} />
              {c.ocorrencia_rotulo ?? info.rotulo}
            </p>
            {c.descricao && <p className="mt-1.5 line-clamp-2 text-[15px] leading-snug text-ink-2">“{c.descricao}”</p>}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <NumeroAlerta rotulo="Distância" valor={formatarDistancia(distancia)} sub={rota.data?.real ? 'pela estrada' : eu ? 'estimada' : 'sem GPS'} />
            <NumeroAlerta rotulo="Estimativa" valor={eta != null ? formatarEta(eta) : '—'} sub={chegada ? `chegada ≈ ${chegada}` : 'sem previsão'} />
          </div>

          {inicial?.recusei && <p className="text-[13px] font-semibold text-warn-ink">Você já recusou este chamado — ainda pode aceitar.</p>}
        </div>
      </div>

      {/* ações */}
      <div className="relative shrink-0 border-t border-line bg-surface">
        <div className="mx-auto flex w-full max-w-md flex-col gap-2.5 px-4 pt-3 pb-[calc(0.9rem+env(safe-area-inset-bottom))]">
          {tocarSom && som === 'bloqueado' && (
            <button
              type="button"
              onClick={() => void destravarAudio().then((ok) => ok && setSom('mudo'))}
              className="mx-auto flex min-h-10 w-fit items-center justify-center gap-2 rounded-full border border-line bg-accent-soft px-3.5 text-[12.5px] font-bold text-accent-ink"
            >
              <Volume2 className="size-4" /> Ativar som
            </button>
          )}
          {tocarSom && som === 'tocando' && fase === 'decidir' && !perdido && (
            <button type="button" onClick={silenciar} className="flex min-h-10 items-center justify-center gap-2 self-center rounded-full px-4 text-[13.5px] font-semibold text-ink-2 active:bg-surface-2">
              <VolumeX className="size-4" /> Silenciar
            </button>
          )}

          {perdido ? (
            <AvisoAlerta icone={Ban} texto={motivoPerdido} detalhe="Fechando…" acao="Entendi" aoAgir={fechar} />
          ) : semDados ? (
            <AvisoAlerta icone={AlertTriangle} texto={msgErroDetalhe ?? 'Não foi possível abrir o chamado.'} acao="Fechar" aoAgir={fechar} />
          ) : fase === 'erro' ? (
            <>
              <AvisoAlerta icone={AlertTriangle} texto={erro ?? 'Não foi possível aceitar.'} acao="Entendi" aoAgir={fechar} />
              {/* Falha de rede vale tentar de novo; recusa de regra do banco, não. */}
              {!/dispon[ií]vel|outro mec[aâ]nico|termine/i.test(erro ?? '') && (
                <BotaoM variante="contorno" tamanho="lg" largo onClick={() => void aceitar()}>
                  Tentar aceitar de novo
                </BotaoM>
              )}
            </>
          ) : escalado ? (
            <BotaoAceitar
              onClick={() => {
                silenciar()
                aoAceitar()
              }}
              rotulo="Abrir atendimento"
            />
          ) : fase === 'recusar' || fase === 'recusando' ? (
            <>
              <p className="font-display text-[17px] font-bold text-ink">Por que recusar?</p>
              <div className="grid grid-cols-2 gap-2">
                {MOTIVOS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={motivo === m}
                    onClick={() => setMotivo(motivo === m ? null : m)}
                    className={cn(
                      'min-h-14 rounded-2xl border-2 px-3 text-[14.5px] leading-tight font-bold transition-colors active:scale-[0.98]',
                      motivo === m ? 'border-[#ff6600] bg-crit-soft text-crit-ink' : 'border-line bg-surface-2 text-ink',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {motivo === 'Outro' && (
                <input
                  value={outro}
                  onChange={(e) => setOutro(e.target.value)}
                  maxLength={140}
                  placeholder="Conte em poucas palavras"
                  aria-label="Outro motivo"
                  className="min-h-14 rounded-2xl border-2 border-line bg-inset px-3.5 text-[16px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
                />
              )}
              {erro && <p className="text-[13px] font-semibold text-crit-ink">{erro}</p>}
              <div className="grid grid-cols-[1fr_1.9fr] gap-2">
                <BotaoM variante="contorno" tamanho="xl" onClick={() => setFase('decidir')} disabled={fase === 'recusando'} className="px-2">
                  Voltar
                </BotaoM>
                <BotaoM
                  variante="vermelho"
                  tamanho="xl"
                  onClick={() => void recusar()}
                  carregando={fase === 'recusando'}
                  disabled={!motivo || (motivo === 'Outro' && !outro.trim())}
                  className="px-2"
                >
                  Confirmar recusa
                </BotaoM>
              </div>
            </>
          ) : (
            <>
              {emOutroAtendimento && (
                <p className="rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[13.5px] leading-snug text-ink-2">
                  Você está em outro atendimento. Termine-o antes de aceitar este.
                </p>
              )}
              <div className="grid grid-cols-[1fr_1.55fr] gap-2.5">
                <button
                  type="button"
                  disabled={fase === 'aceitando'}
                  onClick={() => {
                    silenciar()
                    setFase('recusar')
                  }}
                  className="flex min-h-[4.5rem] items-center justify-center rounded-[1.35rem] bg-[#ff6600] px-2 font-display text-[17px] font-extrabold tracking-[0.05em] text-white uppercase transition-transform active:scale-[0.98] active:bg-[#cc5200] disabled:opacity-40 max-[359px]:text-[15px]"
                >
                  Recusar
                </button>
                <BotaoAceitar onClick={() => void aceitar()} carregando={fase === 'aceitando'} desabilitado={emOutroAtendimento} rotulo="Aceitar" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function formatarRelogio(seg: number): string {
  const s = Math.ceil(seg)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function NumeroAlerta({ rotulo, valor, sub }: { rotulo: string; valor: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-[1.25rem] border border-line bg-surface px-3.5 py-3">
      <RotuloM>{rotulo}</RotuloM>
      <p className="num mt-1.5 truncate text-[32px] leading-none font-semibold tracking-tight text-ink max-[359px]:text-[26px]">{valor}</p>
      <p className="mt-1.5 truncate text-[12.5px] text-ink-3">{sub}</p>
    </div>
  )
}

function BotaoAceitar({ onClick, carregando, desabilitado, rotulo }: { onClick: () => void; carregando?: boolean; desabilitado?: boolean; rotulo: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={carregando || desabilitado}
      className="flex min-h-[4.5rem] w-full items-center justify-center gap-2.5 rounded-[1.35rem] bg-[#00afef] px-3 font-display text-[19px] font-extrabold tracking-[0.05em] text-white uppercase transition-transform mec-sombra-verde active:scale-[0.98] active:bg-[#009bd6] disabled:opacity-45 max-[359px]:text-[17px]"
    >
      {carregando ? <Loader2 className="size-7 animate-spin" /> : <Check className="size-7 shrink-0" strokeWidth={3} />}
      {carregando ? 'Aceitando…' : rotulo}
    </button>
  )
}

function AvisoAlerta({ icone: Icone, texto, detalhe, acao, aoAgir }: { icone: typeof Ban; texto: string; detalhe?: string; acao: string; aoAgir: () => void }) {
  return (
    <>
      <div className="flex items-start gap-3 rounded-2xl bg-surface-2 px-3.5 py-3" role="status">
        <Icone className="mt-0.5 size-5 shrink-0 text-warn-ink" />
        <div className="min-w-0">
          <p className="text-[15px] leading-snug font-semibold text-ink">{texto}</p>
          {detalhe && <p className="text-[13px] text-ink-3">{detalhe}</p>}
        </div>
      </div>
      <BotaoM variante="escuro" tamanho="xl" largo onClick={aoAgir}>
        {acao}
      </BotaoM>
    </>
  )
}

/* ── provedor: o alerta em qualquer tela ────────────────────────────────── */

interface PedidoAlerta {
  id: string
  inicial?: InicialAlerta
  tocar: boolean
}

const CtxAlerta = createContext<{ abrir: (id: string, inicial?: InicialAlerta) => void }>({ abrir: () => {} })

/** Abre o alerta a partir de um cartão da fila (sem sirene). */
export function useAlertaSOS() {
  return useContext(CtxAlerta)
}

/**
 * Ouve o tempo real do mecânico e mostra o alerta por cima do app.
 *
 * Quem toca a sirene segue a mesma regra do banco para o push:
 * - chamado na fila automática (`procurando_mecanico`) → só quem está
 *   disponível, aceita SOS e não está em outro atendimento;
 * - chamado atribuído a mim pela central → sempre;
 * - chamado recebido no modo manual (`recebido`) → só um bipe curto: a
 *   central é quem despacha, mas o cartão aparece na fila.
 */
export function ProvedorAlertaSOS({ children, posicao }: { children: ReactNode; posicao?: LeituraGPS | null }) {
  const { perfil, usuarioId } = useMecanico()
  const home = useHomeMecanico()
  const navegar = useNavigate()
  const [fila, setFila] = useState<PedidoAlerta[]>([])
  const homeRef = useRef(home.data)
  homeRef.current = home.data

  const enfileirar = useCallback((p: PedidoAlerta) => {
    setFila((f) => (f.some((x) => x.id === p.id) ? f : [...f, p]))
  }, [])

  useTempoRealMecanico(usuarioId, (c) => {
    const h = homeRef.current
    const ficha = h?.ficha ?? perfil.mecanico
    const paraMim = c.mecanico_id === usuarioId
    if (!paraMim) {
      if (ficha?.situacao !== 'disponivel' || ficha.aceita_sos === false) return
      if (h?.chamado_atual) return
      // Recusei este: o vigia pode reavisar os outros, mas eu não sou chamado de novo.
      if (h?.aguardando?.some((x) => x.id === c.id && x.recusei)) return
      if (c.status === 'recebido') {
        tocarAlerta({ tipo: 'aviso' })
        vibrarAlerta('aviso')
        return
      }
    }
    enfileirar({ id: c.id, inicial: c, tocar: true })
  })

  const valor = useMemo(() => ({ abrir: (id: string, inicial?: InicialAlerta) => enfileirar({ id, inicial, tocar: false }) }), [enfileirar])
  const atual = fila[0]
  const idAtual = home.data?.chamado_atual?.id ?? null
  const fechar = useCallback(() => setFila((f) => f.slice(1)), [])

  return (
    <CtxAlerta.Provider value={valor}>
      {children}
      {atual && (
        <AlertaNovoSOS
          key={atual.id}
          chamadoId={atual.id}
          inicial={atual.inicial}
          tocarSom={atual.tocar}
          posicao={posicao}
          emOutroAtendimento={!!idAtual && idAtual !== atual.id}
          aoFechar={fechar}
          aoAceitar={() => {
            setFila([])
            navegar(`/chamado/${atual.id}`)
          }}
        />
      )}
    </CtxAlerta.Provider>
  )
}
