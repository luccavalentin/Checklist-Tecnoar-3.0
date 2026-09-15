import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CloudOff,
  Loader2,
  MapPin,
  Phone,
  PhoneCall,
  Siren,
  Truck,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { mascaraPlaca, mascaraTelefone } from '@/lib/formatos'
import { sosAbrirChamado, sosEnviarAnexo } from '@/sos/api'
import { vibrarAlerta } from '@/sos/alerta'
import { formatarCoordenadas, posicaoAtual } from '@/sos/geo'
import { MapaSOS } from '@/sos/Mapa'
import { OCORRENCIAS, ORDEM_OCORRENCIAS, linkTelefone } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { ChamadoSOS, NovoChamado, OcorrenciaSOS } from '@/sos/tipos'
import { useCliente } from '../sessao'
import { AreaApp, BotaoApp, CampoApp, Faixa, Folha } from '../comum/ui'
import { useOnline } from '../comum/Pwa'
import {
  nomeVeiculo,
  temaMapa,
  useAlturaTeclado,
  useHomeCliente,
  useInfoPublica,
  useMeusVeiculos,
  type EstadoFluxoSOS,
  type VeiculoCliente,
} from './dados'
import { guardarPendente, useEnvioPendenteSOS } from './filaSOS'
import { IconeOcorrencia, PlacaVeiculo } from './pecas'
import { PassoLocal, type LocalSOS } from './fluxo/PassoLocal'
import { AnexosPendentes, type AnexoPendente } from './fluxo/AnexosPendentes'
import { BotaoSegurar } from './fluxo/BotaoSegurar'

type Passo = 'problema' | 'local' | 'confirmar' | 'enviado' | 'guardado'

/** `'outro'` = a pessoa vai digitar a placa de um veículo que não está na lista. */
type EscolhaVeiculo = string | 'outro' | null

interface Resultado {
  chamado: ChamadoSOS
  total: number
  enviados: number
  falhas: number
}

/**
 * Pedido de socorro, em tela cheia — três passos curtos:
 *
 * 1. veículo (só aparece a escolha quando há mais de um) e o problema;
 * 2. localização: o GPS já vem ligado; corrigir no mapa é opcional;
 * 3. confirmar: veículo, problema e local na tela, e o botão de SEGURAR
 *    (evita pedido acidental no bolso). Foto, áudio e descrição são opcionais.
 *
 * Sem internet, o pedido fica guardado no aparelho com as coordenadas do GPS
 * e sai sozinho quando o sinal voltar (modo conexão ruim).
 */
export function FluxoSOS() {
  const { conta, usuarioId } = useCliente()
  const navegar = useNavigate()
  const qc = useQueryClient()
  // O que veio da TECNO IA é lido uma vez, na abertura: o fluxo não pode
  // perder o diagnóstico se o histórico do navegador mudar no meio do caminho.
  const local0 = useLocation()
  const [estado] = useState<EstadoFluxoSOS>(() => (local0.state ?? {}) as EstadoFluxoSOS)
  const home = useHomeCliente()
  const info = useInfoPublica()
  const veiculos = useMeusVeiculos()
  const online = useOnline()

  const [passo, setPasso] = useState<Passo>(estado.ocorrencia ? 'local' : 'problema')
  const [local, setLocal] = useState<LocalSOS | null>(null)
  const [ocorrencia, setOcorrencia] = useState<OcorrenciaSOS | null>(estado.ocorrencia ?? null)
  const [descricao, setDescricao] = useState(estado.descricao ?? '')
  const [anexos, setAnexos] = useState<AnexoPendente[]>([])
  const [telefone, setTelefone] = useState(mascaraTelefone(conta.telefone ?? ''))
  const [escolhaVeiculo, setEscolhaVeiculo] = useState<EscolhaVeiculo>(null)
  const [placa, setPlaca] = useState('')
  const [trocandoVeiculo, setTrocandoVeiculo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const travado = useRef(false)

  // O GPS começa a procurar já no primeiro passo: quando a pessoa chega ao
  // mapa, a posição (ou boa parte dela) já está pronta.
  useEffect(() => {
    void posicaoAtual({ timeoutMs: 15000, maxIdadeMs: 30000 }).catch(() => {})
  }, [])

  // Pedido guardado sem sinal saiu sozinho enquanto esta tela estava aberta.
  useEnvioPendenteSOS(usuarioId, (chamado) => {
    setResultado({ chamado, total: 0, enviados: 0, falhas: 0 })
    setPasso('enviado')
  })

  // Libera as pré-visualizações dos anexos quando o fluxo termina.
  const anexosVivos = useRef(anexos)
  anexosVivos.current = anexos
  useEffect(() => () => anexosVivos.current.forEach((a) => URL.revokeObjectURL(a.url)), [])

  const lista = veiculos.data ?? []
  const veiculo: VeiculoCliente | null =
    escolhaVeiculo === 'outro' ? null : (lista.find((v) => v.id === (escolhaVeiculo ?? conta.veiculo_principal_id)) ?? lista[0] ?? null)
  const digitarPlaca = escolhaVeiculo === 'outro' || (!veiculos.isLoading && lista.length === 0)
  const telCentral = linkTelefone(info.data?.telefone)
  const ativo = home.data?.chamado_ativo ?? null

  function montarPedido(): NovoChamado | null {
    if (!local) return null
    const placaLimpa = placa.replace(/[^A-Za-z0-9]/g, '')
    return {
      veiculo_id: digitarPlaca ? null : (veiculo?.id ?? null),
      placa: digitarPlaca && placaLimpa ? placaLimpa : null,
      tipo_ocorrencia: ocorrencia ?? 'desconhecido',
      descricao: descricao.trim() || null,
      // Sem prioridade explícita o banco decide pela ocorrência (freios/acidente = emergência).
      prioridade: estado.prioridade,
      latitude: local.ponto.lat,
      longitude: local.ponto.lng,
      precisao_m: local.precisao != null ? Math.round(local.precisao) : null,
      endereco: local.endereco,
      ponto_ajustado: local.ajustado,
      telefone_contato: telefone.trim() || null,
      contexto_ia: estado.contextoIA ?? null,
    }
  }

  function guardarSemSinal(pedido: NovoChamado) {
    guardarPendente(usuarioId, {
      pedido,
      guardadoEm: new Date().toISOString(),
      resumo: {
        veiculo: veiculo && !digitarPlaca ? nomeVeiculo(veiculo) : null,
        placa: veiculo && !digitarPlaca ? veiculo.placa : pedido.placa ?? null,
        problema: OCORRENCIAS[pedido.tipo_ocorrencia]?.rotulo ?? 'Socorro',
        endereco: pedido.endereco ?? null,
      },
    })
    vibrarAlerta('aviso')
    setPasso('guardado')
  }

  async function confirmar() {
    if (travado.current || !local) return
    const placaLimpa = placa.replace(/[^A-Za-z0-9]/g, '')
    if (digitarPlaca && placaLimpa && placaLimpa.length !== 7) {
      setErro('A placa tem 7 caracteres (ex.: ABC1D23). Corrija ou apague para enviar sem placa.')
      return
    }
    const pedido = montarPedido()
    if (!pedido) return
    if (!navigator.onLine) return guardarSemSinal(pedido)

    travado.current = true
    setEnviando(true)
    setErro(null)
    try {
      // Sinal fraco: o aparelho diz "online", mas a resposta não vem. Depois
      // de 20 s o pedido vai para a fila do aparelho — reenviar é seguro, o
      // banco devolve o mesmo chamado se o primeiro tiver chegado.
      const chamado = await Promise.race([
        sosAbrirChamado(pedido),
        new Promise<never>((_, falhar) => window.setTimeout(() => falhar(new Error('Sem conexão: o servidor não respondeu a tempo.')), 20_000)),
      ])
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeCliente })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.meusChamados })
      vibrarAlerta('aviso')
      setResultado({ chamado, total: anexos.length, enviados: 0, falhas: 0 })
      setPasso('enviado')

      // Anexos sobem um por vez: rede de estrada não aguenta três fotos ao mesmo tempo.
      for (const a of anexos) {
        try {
          await sosEnviarAnexo(chamado.id, a.blob, { etapa: 'abertura' })
          setResultado((r) => (r ? { ...r, enviados: r.enviados + 1 } : r))
        } catch {
          setResultado((r) => (r ? { ...r, falhas: r.falhas + 1 } : r))
        }
      }
      if (anexos.length) void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(chamado.id) })
    } catch (e) {
      const msg = (e as Error).message || 'Não foi possível enviar o pedido.'
      // Conexão caiu no meio do envio: o pedido não se perde, fica guardado.
      if (!navigator.onLine || /sem conex|load failed|failed to fetch/i.test(msg)) {
        travado.current = false
        guardarSemSinal(pedido)
        return
      }
      setErro(msg)
      travado.current = false
    } finally {
      setEnviando(false)
    }
  }

  // Terminou de enviar tudo: segue sozinho para o acompanhamento.
  useEffect(() => {
    if (passo !== 'enviado' || !resultado) return
    const terminou = resultado.enviados + resultado.falhas >= resultado.total
    if (!terminou || resultado.falhas > 0) return
    const t = window.setTimeout(() => navegar(`/chamado/${resultado.chamado.id}`, { replace: true }), resultado.chamado.ja_existia ? 2600 : 2000)
    return () => window.clearTimeout(t)
  }, [passo, resultado, navegar])

  function fechar() {
    if (window.history.length > 1) navegar(-1)
    else navegar('/', { replace: true })
  }

  /* ── telas ────────────────────────────────────────────────────────────── */

  if (passo === 'enviado' && resultado) {
    return <TelaEnviado resultado={resultado} aoSeguir={() => navegar(`/chamado/${resultado.chamado.id}`, { replace: true })} />
  }

  if (passo === 'guardado' && local) {
    return <TelaGuardado local={local} telCentral={telCentral} aoInicio={() => navegar('/', { replace: true })} />
  }

  const folhaVeiculo = (
    <Folha aberta={trocandoVeiculo} aoFechar={() => setTrocandoVeiculo(false)} titulo="Qual veículo precisa de socorro?">
      <ul className="flex flex-col gap-2 pb-2">
        {lista.map((v) => (
          <li key={v.id}>
            <OpcaoVeiculo
              ativo={veiculo?.id === v.id && !digitarPlaca}
              onClick={() => {
                setEscolhaVeiculo(v.id)
                setTrocandoVeiculo(false)
              }}
            >
              <PlacaVeiculo placa={v.placa} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{nomeVeiculo(v)}</span>
            </OpcaoVeiculo>
          </li>
        ))}
        <li>
          <OpcaoVeiculo
            ativo={digitarPlaca}
            tracejado
            onClick={() => {
              setEscolhaVeiculo('outro')
              setTrocandoVeiculo(false)
            }}
          >
            <Truck className="size-5 text-ink-3" />
            <span className="min-w-0 flex-1 text-[15px] font-semibold text-ink">Outro veículo (digitar a placa)</span>
          </OpcaoVeiculo>
        </li>
      </ul>
    </Folha>
  )

  /* passo 1 — veículo e problema */
  if (passo === 'problema') {
    return (
      <PaginaFluxo passo={1} titulo="O que aconteceu?" subtitulo="Toque na opção mais parecida. O mecânico confirma no local." aoVoltar={fechar} aoFechar={fechar} telCentral={telCentral}>
        {ativo && <AvisoJaTemSocorro protocolo={ativo.protocolo} aoAcompanhar={() => navegar(`/chamado/${ativo.id}`, { replace: true })} />}

        {lista.length > 1 ? (
          <section aria-label="Qual veículo" className="flex flex-col gap-2">
            <h2 className="text-[13.5px] font-semibold text-ink-2">Qual veículo?</h2>
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Veículo">
              {lista.map((v) => {
                const sel = veiculo?.id === v.id && !digitarPlaca
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={sel}
                    onClick={() => setEscolhaVeiculo(v.id)}
                    className={cn(
                      'flex min-h-14 shrink-0 items-center gap-2.5 rounded-2xl border-2 bg-surface px-3 py-2 text-left transition-colors',
                      sel ? 'border-accent' : 'border-line',
                    )}
                  >
                    <PlacaVeiculo placa={v.placa} tamanho="sm" />
                    <span className="max-w-[9rem] truncate text-[14px] font-semibold text-ink">{nomeVeiculo(v)}</span>
                    {sel && <Check className="size-4 shrink-0 text-accent-ink" />}
                  </button>
                )
              })}
              <button
                type="button"
                role="radio"
                aria-checked={digitarPlaca}
                onClick={() => setEscolhaVeiculo('outro')}
                className={cn('flex min-h-14 shrink-0 items-center gap-2 rounded-2xl border-2 border-dashed bg-surface px-3.5 text-[14px] font-semibold text-ink-2', digitarPlaca ? 'border-accent' : 'border-line-strong')}
              >
                <Truck className="size-4" /> Outro
              </button>
            </div>
          </section>
        ) : veiculo ? (
          <div className="flex min-h-14 items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5">
            <PlacaVeiculo placa={veiculo.placa} tamanho="sm" />
            <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-ink">{nomeVeiculo(veiculo)}</span>
            <button type="button" onClick={() => setTrocandoVeiculo(true)} className="min-h-10 shrink-0 px-1 text-[13.5px] font-semibold text-accent-ink">
              Trocar
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5">
          {ORDEM_OCORRENCIAS.map((o) => {
            const dados = OCORRENCIAS[o]
            const Icone = dados.icone
            const escolhido = ocorrencia === o
            const grave = dados.prioridade === 'emergencia'
            return (
              <button
                key={o}
                type="button"
                onClick={() => {
                  setOcorrencia(o)
                  setPasso(local ? 'confirmar' : 'local')
                }}
                aria-pressed={escolhido}
                className={cn(
                  'flex min-h-[6.25rem] flex-col items-start justify-between gap-2 rounded-[1.25rem] border-2 bg-surface p-3.5 text-left transition-[transform,border-color] active:scale-[0.97]',
                  escolhido ? 'border-accent' : 'border-line',
                )}
              >
                <span className={cn('flex size-10 items-center justify-center rounded-xl', grave ? 'bg-crit-soft text-crit' : 'bg-surface-2 text-ink-2')}>
                  <Icone className="size-5" />
                </span>
                <span className="font-display text-[15px] leading-tight font-bold text-ink">{dados.rotulo}</span>
              </button>
            )
          })}
        </div>
        {folhaVeiculo}
      </PaginaFluxo>
    )
  }

  /* passo 2 — localização */
  if (passo === 'local') {
    return (
      <>
        <PassoLocal
          inicial={local}
          etapa="Passo 2 de 3 · Localização"
          aoConfirmar={(l) => {
            setLocal(l)
            setPasso(ocorrencia ? 'confirmar' : 'problema')
          }}
          cabecalho={<CabecalhoMapa aoVoltar={() => (estado.ocorrencia && !local ? fechar() : setPasso(ocorrencia ? 'confirmar' : 'problema'))} telCentral={telCentral} />}
          topoPainel={ativo ? <AvisoJaTemSocorro protocolo={ativo.protocolo} aoAcompanhar={() => navegar(`/chamado/${ativo.id}`, { replace: true })} /> : null}
        />
        {folhaVeiculo}
      </>
    )
  }

  /* passo 3 — confirmar */
  const infoOcorrencia = ocorrencia ? OCORRENCIAS[ocorrencia] : null
  return (
    <>
      <PaginaFluxo
        passo={3}
        titulo="Confirme o pedido"
        subtitulo="Confira antes de enviar. O mecânico recebe tudo isso."
        aoVoltar={() => setPasso('local')}
        aoFechar={fechar}
        telCentral={telCentral}
        rodape={
          <div className="flex flex-col gap-2">
            {erro && (
              <Faixa tom="critico" icone={CircleAlert}>
                <p>{erro}</p>
                {telCentral && (
                  <a href={telCentral} className="mt-1 inline-flex min-h-10 items-center gap-1.5 font-bold underline underline-offset-2">
                    <PhoneCall className="size-4" /> Ligar agora
                  </a>
                )}
              </Faixa>
            )}
            {!online && (
              <p className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-2">
                <CloudOff className="mt-0.5 size-4 shrink-0 text-warn" />
                Sem internet: o pedido fica guardado com a sua localização e sai sozinho quando o sinal voltar.
              </p>
            )}
            <BotaoSegurar
              rotulo={!online ? 'Segure para guardar o SOS' : 'Segure para pedir SOS'}
              carregando={enviando}
              rotuloCarregando="Enviando…"
              disabled={!local}
              aoConfirmar={() => void confirmar()}
            />
          </div>
        }
      >
        {ocorrencia === 'acidente' && <AvisoAcidente />}
        {ocorrencia === 'freios' && (
          <Faixa tom="atencao" icone={AlertTriangle}>
            Com problema no freio, <strong>não siga viagem</strong>. Deixe o veículo parado, com freio de estacionamento e pisca-alerta.
          </Faixa>
        )}

        <section aria-label="Resumo do pedido" className="flex flex-col divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-surface">
          <Linha icone={Truck} rotulo="Veículo" acao={lista.length > 0 ? { rotulo: 'Trocar', aoClicar: () => setTrocandoVeiculo(true) } : undefined}>
            {digitarPlaca ? (
              <CampoApp
                rotulo="Placa (opcional, ajuda o mecânico)"
                autoCapitalize="characters"
                value={placa}
                onChange={(e) => setPlaca(mascaraPlaca(e.target.value))}
                placeholder="ABC1D23"
                className="mt-1"
              />
            ) : veiculo ? (
              <div className="flex flex-wrap items-center gap-2">
                <PlacaVeiculo placa={veiculo.placa} tamanho="sm" />
                <span className="min-w-0 truncate text-[15px] font-semibold text-ink">{nomeVeiculo(veiculo)}</span>
              </div>
            ) : (
              <p className="text-[14px] text-ink-3">Carregando…</p>
            )}
          </Linha>

          <Linha icone={Siren} rotulo="Problema" acao={{ rotulo: 'Trocar', aoClicar: () => setPasso('problema') }}>
            {ocorrencia && infoOcorrencia ? (
              <div className="flex items-center gap-2.5">
                <IconeOcorrencia tipo={ocorrencia} tamanho="sm" />
                <span className="text-[15px] font-semibold text-ink">{infoOcorrencia.rotulo}</span>
              </div>
            ) : (
              <p className="text-[14px] text-ink-3">Não informado</p>
            )}
          </Linha>

          <Linha
            icone={MapPin}
            rotulo="Onde você está"
            acao={{ rotulo: 'Ajustar', aoClicar: () => setPasso('local') }}
            abaixo={
              local && (
                <div className="flex flex-col gap-2">
                  <div className="relative h-36 overflow-hidden rounded-2xl border border-line">
                    <MapaSOS
                      marcadores={[{ id: 'cliente', tipo: 'cliente', ponto: local.ponto }]}
                      centro={local.ponto}
                      zoom={15}
                      interativo={false}
                      tema={temaMapa()}
                      className="size-full"
                    />
                  </div>
                  <p className="text-[12.5px] text-ink-3">
                    {local.ajustado ? 'Ponto corrigido por você no mapa' : local.precisao != null ? `GPS com precisão de ±${Math.round(local.precisao)} m` : 'Ponto do GPS'}
                  </p>
                </div>
              )
            }
          >
            {local && (
              <>
                <p className="text-[14.5px] leading-snug font-medium text-ink">{local.endereco ?? 'Endereço aproximado indisponível'}</p>
                <p className="num mt-1 text-[12.5px] text-ink-2">{formatarCoordenadas(local.ponto)}</p>
              </>
            )}
          </Linha>

          <div className="p-4">
            <CampoApp
              rotulo="Telefone para o mecânico falar com você"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              icone={Phone}
              value={telefone}
              onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
            />
          </div>
        </section>

        <Detalhes aberto={!!estado.descricao} temConteudo={!!descricao.trim() || anexos.length > 0}>
          <AreaApp
            rotulo="O que está acontecendo (opcional)"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={600}
            rows={3}
            placeholder={ocorrencia === 'outro' ? 'Descreva em poucas palavras' : 'Ex.: acendeu a luz do ar e o pedal ficou duro'}
          />
          {online ? (
            <AnexosPendentes anexos={anexos} aoMudar={setAnexos} />
          ) : (
            <p className="text-[12.5px] text-ink-3">Sem internet, fotos e áudios não vão agora. Mande depois, pela tela do chamado.</p>
          )}
        </Detalhes>

        {telCentral && (
          <a href={telCentral} className="flex min-h-12 items-center justify-center gap-2 text-[14px] font-semibold text-ink-2">
            <PhoneCall className="size-4" /> Prefere falar? Ligar para a Tecnoar
          </a>
        )}
      </PaginaFluxo>
      {folhaVeiculo}
    </>
  )
}

/* ── peças do fluxo ─────────────────────────────────────────────────────── */

function OpcaoVeiculo({ ativo, tracejado, onClick, children }: { ativo: boolean; tracejado?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 bg-surface px-3.5 py-2.5 text-left active:scale-[0.99]',
        tracejado && 'border-dashed',
        ativo ? 'border-accent' : 'border-line',
      )}
    >
      {children}
      {ativo && <Check className="size-5 shrink-0 text-accent-ink" />}
    </button>
  )
}

function AvisoJaTemSocorro({ protocolo, aoAcompanhar }: { protocolo: string; aoAcompanhar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoAcompanhar}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-crit/25 bg-crit-soft px-3.5 py-2.5 text-left text-crit-ink"
    >
      <Siren className="size-5 shrink-0" />
      <span className="min-w-0 flex-1 text-[13.5px] leading-snug">
        Você já tem um socorro em andamento (<span className="num">{protocolo}</span>).
      </span>
      <span className="shrink-0 text-[13.5px] font-bold">Acompanhar</span>
    </button>
  )
}

/** Foto, áudio e descrição: opcionais, fechados por padrão para não virar formulário. */
function Detalhes({ aberto: inicial, temConteudo, children }: { aberto: boolean; temConteudo: boolean; children: ReactNode }) {
  const [aberto, setAberto] = useState(inicial)
  return (
    <section className="overflow-hidden rounded-[1.25rem] border border-line bg-surface">
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((a) => !a)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
          <Camera className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">Foto, áudio ou detalhes</span>
          <span className="block text-[12.5px] text-ink-3">{temConteudo ? 'Adicionado ao pedido' : 'Opcional · ajuda o mecânico a levar a peça certa'}</span>
        </span>
        <ChevronDown className={cn('size-5 shrink-0 text-ink-3 transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && <div className="entrada-suave flex flex-col gap-3 border-t border-line p-4">{children}</div>}
    </section>
  )
}

function CabecalhoMapa({ aoVoltar, telCentral }: { aoVoltar: () => void; telCentral: string | null }) {
  const redondo = 'pointer-events-auto flex size-12 items-center justify-center rounded-full border border-line bg-surface shadow-[0_4px_14px_rgb(8_24_48/0.18)] active:scale-95'
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={aoVoltar} aria-label="Voltar" className={cn(redondo, 'text-ink')}>
        <ChevronLeft className="size-6" />
      </button>
      <span className="flex items-center gap-2 rounded-full bg-[#ff6600] px-4 py-2 font-display text-[13.5px] font-bold text-white shadow-[0_6px_16px_-6px_rgb(255_102_0/0.7)]">
        <Siren className="size-4" /> Pedido de socorro
      </span>
      {telCentral ? (
        <a href={telCentral} aria-label="Ligar para a Tecnoar" className={cn(redondo, 'text-ok')}>
          <PhoneCall className="size-5" />
        </a>
      ) : (
        <span className="size-12" />
      )}
    </div>
  )
}

function PaginaFluxo({
  passo,
  titulo,
  subtitulo,
  aoVoltar,
  aoFechar,
  telCentral,
  children,
  rodape,
}: {
  passo: 1 | 2 | 3
  titulo: string
  subtitulo: string
  aoVoltar: () => void
  aoFechar: () => void
  telCentral: string | null
  children: ReactNode
  rodape?: ReactNode
}) {
  const teclado = useAlturaTeclado()
  return (
    <div className="cli-palco">
      <div className="cli-coluna">
        <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/95 pt-[calc(env(safe-area-inset-top)+var(--faixa-rede,0px))] backdrop-blur-md">
          <div className="mx-auto flex h-14 max-w-xl items-center justify-between gap-2 px-2 pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))]">
            <button type="button" onClick={aoVoltar} aria-label="Voltar" className="flex size-11 items-center justify-center rounded-full text-ink hover:bg-surface-2">
              <ChevronLeft className="size-6" />
            </button>
            <ol className="flex flex-1 items-center justify-center gap-1.5" aria-label={`Passo ${passo} de 3`}>
              {[1, 2, 3].map((n) => (
                <li key={n} className={cn('h-1.5 w-8 rounded-full transition-colors', n <= passo ? 'bg-[#ff6600]' : 'bg-line-strong')} />
              ))}
            </ol>
            <div className="flex items-center">
              {telCentral && (
                <a href={telCentral} aria-label="Ligar para a Tecnoar" className="flex size-11 items-center justify-center rounded-full text-ok hover:bg-surface-2">
                  <PhoneCall className="size-5" />
                </a>
              )}
              <button type="button" onClick={aoFechar} aria-label="Fechar pedido de socorro" className="flex size-11 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2">
                <X className="size-5" />
              </button>
            </div>
          </div>
        </header>
        <main
          className={cn(
            'entrada-suave mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pt-5 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]',
            rodape ? 'pb-[calc(10rem+env(safe-area-inset-bottom))]' : 'pb-[calc(2rem+env(safe-area-inset-bottom))]',
          )}
        >
          <div>
            <p className="text-[12.5px] font-semibold text-crit">Passo {passo} de 3</p>
            <h1 className="mt-1 font-display text-[26px] leading-tight font-bold text-ink">{titulo}</h1>
            <p className="mt-1 text-[14.5px] leading-snug text-ink-2">{subtitulo}</p>
          </div>
          {children}
        </main>
        {rodape && (
          <div
            style={teclado ? { bottom: teclado } : undefined}
            className={cn(
              'cli-fixo fixed bottom-0 z-40 border-t border-line bg-surface/98 px-4 pt-3 shadow-[0_-10px_30px_-22px_rgb(8_24_48/0.5)]',
              teclado ? 'pb-3' : 'pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
            )}
          >
            <div className="mx-auto max-w-xl">{rodape}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function Linha({
  icone: Icone,
  rotulo,
  acao,
  children,
  abaixo,
}: {
  icone: typeof Truck
  rotulo: string
  acao?: { rotulo: string; aoClicar: () => void }
  children: ReactNode
  /** Conteúdo de largura total logo abaixo da linha (o mapa do local). */
  abaixo?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
          <Icone className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[12.5px] font-medium text-ink-3">{rotulo}</p>
          {children}
        </div>
        {acao && (
          <button type="button" onClick={acao.aoClicar} className="-mt-1.5 flex min-h-11 shrink-0 items-center px-1 text-[13.5px] font-semibold text-accent-ink">
            {acao.rotulo}
          </button>
        )}
      </div>
      {abaixo}
    </div>
  )
}

/** Acidente: antes do socorro mecânico, a vida. */
function AvisoAcidente() {
  const botao = 'flex min-h-14 flex-1 flex-col items-center justify-center rounded-xl border border-crit/20 bg-surface px-1 text-center text-crit-ink active:scale-[0.97]'
  return (
    <section className="flex flex-col gap-3 rounded-[1.25rem] border border-crit/25 bg-crit-soft p-4 text-crit-ink" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 size-6 shrink-0" />
        <div>
          <p className="font-display text-[17px] font-bold">Primeiro, a segurança</p>
          <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-4 text-[13.5px] leading-snug">
            <li>Ligue o pisca-alerta e coloque o triângulo a pelo menos 30 m.</li>
            <li>Saia do veículo pelo lado de fora da pista e fique longe do asfalto.</li>
            <li>Não mexa em quem estiver ferido. Chame o resgate.</li>
          </ul>
        </div>
      </div>
      <div className="flex gap-2">
        {[
          ['193', 'Bombeiros'],
          ['192', 'SAMU'],
          ['190', 'Polícia'],
          ['191', 'PRF'],
        ].map(([n, r]) => (
          <a key={n} href={`tel:${n}`} className={botao}>
            <span className="font-display text-[18px] font-black">{n}</span>
            <span className="text-[11px] font-semibold">{r}</span>
          </a>
        ))}
      </div>
    </section>
  )
}

/* ── pedido enviado ─────────────────────────────────────────────────────── */

function TelaEnviado({ resultado, aoSeguir }: { resultado: Resultado; aoSeguir: () => void }) {
  const { chamado, total, enviados, falhas } = resultado
  const jaExistia = !!chamado.ja_existia
  const subindo = enviados + falhas < total
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 overflow-y-auto bg-canvas px-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center">
      <div className="relative flex size-32 items-center justify-center">
        <span aria-hidden className={cn('cli-onda absolute inset-0 rounded-full', jaExistia ? 'bg-warn/25' : 'bg-ok/25')} />
        <span className={cn('relative flex size-24 items-center justify-center rounded-full text-white', jaExistia ? 'bg-warn' : 'bg-ok')}>
          {jaExistia ? <Siren className="size-11" /> : <Check className="size-12" strokeWidth={3} />}
        </span>
      </div>
      <div className="flex max-w-sm flex-col items-center gap-3">
        <h1 className="font-display text-[28px] leading-tight font-bold text-ink">{jaExistia ? 'Você já tem um socorro em andamento' : 'SOS enviado'}</h1>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[12.5px] font-medium text-ink-3">Protocolo</span>
          <span className="num rounded-full border border-line bg-surface px-4 py-1.5 text-[19px] font-semibold tracking-wider text-ink">{chamado.protocolo}</span>
        </div>
        <p className="flex items-center gap-2 text-[15px] leading-relaxed font-semibold text-ink">
          {!jaExistia && <Loader2 className="size-4 animate-spin text-accent" />}
          {jaExistia ? 'Não abrimos outro pedido para não confundir a equipe.' : 'Procurando o mecânico mais próximo…'}
        </p>
        <p className="text-[14px] leading-relaxed text-ink-2">Fique em local seguro, com o pisca-alerta ligado.</p>
      </div>

      {total > 0 && (
        <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4 text-left">
          <div className="flex items-center justify-between gap-3 text-[13.5px] text-ink">
            <span className="flex items-center gap-2">
              {subindo ? <Loader2 className="size-4 animate-spin text-accent" /> : falhas ? <CircleAlert className="size-4 text-warn" /> : <Check className="size-4 text-ok" />}
              {subindo ? 'Enviando fotos e áudios' : falhas ? 'Alguns arquivos não foram' : 'Arquivos enviados'}
            </span>
            <span className="num text-ink-3">
              {enviados} de {total}
            </span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${((enviados + falhas) / total) * 100}%` }} />
          </div>
          {falhas > 0 && !subindo && <p className="mt-2 text-[12.5px] text-ink-3">Você pode mandar de novo pela tela do chamado.</p>}
        </div>
      )}

      <BotaoApp tamanho="lg" onClick={aoSeguir} className="w-full max-w-sm">
        Acompanhar agora <ChevronRight className="size-5" />
      </BotaoApp>
    </div>
  )
}

/* ── pedido guardado (sem sinal) ────────────────────────────────────────── */

function TelaGuardado({ local, telCentral, aoInicio }: { local: LocalSOS; telCentral: string | null; aoInicio: () => void }) {
  const online = useOnline()
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 overflow-y-auto bg-canvas px-6 pt-[calc(1.5rem+env(safe-area-inset-top)+var(--faixa-rede,0px))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center">
      <span className="flex size-24 items-center justify-center rounded-full bg-warn-soft text-warn-ink">
        {online ? <Loader2 className="size-11 animate-spin" /> : <CloudOff className="size-11" />}
      </span>
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="font-display text-[27px] leading-tight font-bold text-ink">{online ? 'Sinal de volta. Enviando…' : 'Pedido guardado'}</h1>
        <p className="text-[15px] leading-relaxed text-ink-2">
          {online ? (
            'A conexão voltou. Enviando o seu pedido agora.'
          ) : (
            <>
              Sem internet agora. Seu pedido de socorro ficou salvo neste celular e <strong className="text-ink">sai sozinho</strong> assim que o sinal voltar.
            </>
          )}
        </p>
      </div>

      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-4 text-left">
        <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink-3">
          <MapPin className="size-4 text-accent-ink" /> Sua localização pelo GPS
        </p>
        <p className="num mt-1.5 text-[20px] font-semibold tracking-wide text-ink">{formatarCoordenadas(local.ponto)}</p>
        {local.endereco && <p className="mt-1 text-[13px] leading-snug text-ink-2">{local.endereco}</p>}
        <p className="mt-2 text-[12.5px] leading-snug text-ink-3">Se ligar para a Tecnoar, leia estes números: com eles o mecânico encontra você.</p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2">
        {telCentral && (
          <a href={telCentral} className="flex min-h-14 items-center justify-center gap-2.5 rounded-2xl bg-[#0D1C33] font-display text-[16px] font-bold text-white">
            <PhoneCall className="size-5" /> Ligar para a Tecnoar
          </a>
        )}
        <BotaoApp variante="neutro" tamanho="lg" largo onClick={aoInicio}>
          Voltar ao início
        </BotaoApp>
      </div>
    </div>
  )
}
