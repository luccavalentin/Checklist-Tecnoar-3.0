import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRightCircle,
  Ban,
  Check,
  Copy,
  ExternalLink,
  FilePlus2,
  FileText,
  Maximize,
  MessageCircle,
  Navigation,
  Share2,
  Truck,
  UserRoundCog,
  Wrench,
} from 'lucide-react'
import { cn, mensagemErro } from '@/lib/utils'
import { mascaraTelefone, moeda } from '@/lib/formatos'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada } from '@/componentes/ui/Campo'
import { Aviso } from '@/componentes/ui/Aviso'
import { Esqueleto } from '@/componentes/ui/Estados'
import { Selo } from '@/componentes/ui/Selo'
import { Confirmacao, Modal, PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { useToast } from '@/componentes/ui/Toast'
import { TOM_COR_STATUS } from '@/paginas/cadastros/StatusOS'
import { sosAvancar, sosCancelar, sosCompartilhar, sosDetalhe, sosGerarOS } from '@/sos/api'
import { BotaoMapa, CapturaMapa, MapaSOS, enquadrarMapa, type MapaLeaflet, type MarcadorMapa } from '@/sos/Mapa'
import { Bloco, Conversa, EnviarMidia, Estrelas, GaleriaAnexos, ItensAtendimento, LinhaDoTempo, ProgressoChamado, SeloStatus } from '@/sos/componentes'
import { calcularRota, formatarCoordenadas, linkVerNoMapa, pontoDe, type Ponto, type Rota } from '@/sos/geo'
import { tocarAlerta } from '@/sos/alerta'
import { CHAVES_SOS, useTempoRealChamado } from '@/sos/tempoReal'
import {
  PRIORIDADES,
  ROTULO_TIPO_VEICULO,
  STATUS_SOS,
  dataHoraCurta,
  formatarDistancia,
  formatarDuracao,
  formatarEta,
  haQuanto,
  linkWhatsApp,
} from '@/sos/rotulos'
import type { DetalheChamado as TipoDetalhe, OrigemSOS, PapelSOS, StatusSOS } from '@/sos/tipos'
import { AvisosVigia, RelogioChamado } from './CartaoChamado'
import { AnaliseFotosIA, BlocoKitIA, BlocoOrcamento, BlocoRegistroTecnico, BotaoLaudo, SeloContrato } from './ChamadoPremium'
import { Despacho } from './Despacho'
import {
  Avatar,
  ContatoRapido,
  ErroSOS,
  IconeOcorrencia,
  MENSAGENS_RAPIDAS_CENTRAL,
  Placa,
  TEMPO_ACEITE_PADRAO_SEG,
  aguardando,
  invalidarSOS,
  linkAcompanhamento,
  segundosDesde,
  tomPinoChamado,
  useAgora,
  useConfigSOS,
  useIaPublicoSOS,
} from './comum'

/**
 * Próxima etapa quando a central precisa empurrar o chamado. Normalmente é o
 * mecânico quem registra cada passo pelo app; isto é o plano B (celular sem
 * sinal, bateria acabou) — por isso sempre pede confirmação.
 */
const PROXIMA_CENTRAL: Partial<Record<StatusSOS, { status: StatusSOS; rotulo: string }>> = {
  recebido: { status: 'procurando_mecanico', rotulo: 'Chamar todos os mecânicos' },
  aceito: { status: 'a_caminho', rotulo: 'Marcar “a caminho”' },
  a_caminho: { status: 'no_local', rotulo: 'Marcar chegada' },
  no_local: { status: 'servico_iniciado', rotulo: 'Marcar início do serviço' },
  servico_iniciado: { status: 'servico_finalizado', rotulo: 'Finalizar serviço' },
  servico_finalizado: { status: 'concluido', rotulo: 'Concluir atendimento' },
}

const ROTULO_ORIGEM: Record<OrigemSOS, string> = {
  app: 'Pelo app',
  central: 'Pela central',
  ia: 'Pela IA',
  whatsapp: 'Pelo WhatsApp',
  telefone: 'Por telefone',
  mecanico: 'Aberto pelo mecânico',
}

const QUEM_CANCELOU: Record<PapelSOS, string> = {
  cliente: 'pelo cliente',
  mecanico: 'pelo mecânico',
  central: 'pela central',
  sistema: 'pelo sistema',
}

const MOTIVOS_CANCELAMENTO = [
  'Cliente resolveu o problema',
  'Cliente desistiu do atendimento',
  'Chamado duplicado',
  'Fora da área de atendimento',
  'Sem mecânico disponível',
  'Não conseguimos contato com o cliente',
]

const ENCERRADOS: StatusSOS[] = ['servico_finalizado', 'concluido', 'cancelado']

export function DetalheChamado({ chamadoId, aoFechar }: { chamadoId: string | null; aoFechar: () => void }) {
  const qc = useQueryClient()
  const detalhe = useQuery({
    queryKey: CHAVES_SOS.detalhe(chamadoId ?? '—'),
    enabled: !!chamadoId,
    staleTime: 5_000,
    queryFn: () => sosDetalhe(chamadoId!),
  })
  const c = detalhe.data?.chamado

  return (
    <PainelLateral
      aberto={!!chamadoId}
      aoFechar={aoFechar}
      largura="xl"
      titulo={c ? c.protocolo : 'Chamado SOS'}
      descricao={c ? `${c.ocorrencia_rotulo} · ${detalhe.data?.cliente?.nome ?? 'Cliente'}` : undefined}
    >
      {detalhe.isLoading && <EsqueletoDetalhe />}
      {detalhe.isError && (
        <ErroSOS
          erro={detalhe.error}
          aoTentarNovamente={() => void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(chamadoId ?? '—') })}
        />
      )}
      {detalhe.data && chamadoId && <ConteudoDetalhe d={detalhe.data} />}
    </PainelLateral>
  )
}

function EsqueletoDetalhe() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Carregando chamado">
      <Esqueleto className="h-24 rounded-2xl" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Esqueleto className="h-72 rounded-2xl" />
        <Esqueleto className="h-72 rounded-2xl" />
      </div>
    </div>
  )
}

function ConteudoDetalhe({ d }: { d: TipoDetalhe }) {
  const c = d.chamado
  const qc = useQueryClient()
  const toast = useToast()
  const navegar = useNavigate()
  const { usuario } = useAuth()
  const { pode } = usePermissoes()
  const config = useConfigSOS()
  const ia = useIaPublicoSOS()
  const podeEditar = pode('sos', 'editar')
  const podeCancelar = pode('sos', 'cancelar')
  const podeGerarOS = pode('ordens_servico', 'criar')

  const encerrado = ENCERRADOS.includes(c.status)
  const espera = aguardando(c.status)
  const proxima = PROXIMA_CENTRAL[c.status]
  const tempoAceite = config.data?.tempo_aceite_seg ?? TEMPO_ACEITE_PADRAO_SEG
  const exigirAprovacao = config.data?.exigir_aprovacao_orcamento === true
  // Com a regra ligada, o banco recusa "serviço iniciado" sem orçamento aprovado.
  const travadoPorOrcamento = proxima?.status === 'servico_iniciado' && exigirAprovacao && c.orcamento_status !== 'aprovado'
  const iaAtiva = ia.data?.ativa === true
  const podeGerarKit = podeEditar && c.status !== 'concluido' && c.status !== 'cancelado'

  const [cancelando, setCancelando] = useState(false)
  const [avancando, setAvancando] = useState(false)
  const [gerandoOS, setGerandoOS] = useState(false)
  const [link, setLink] = useState<string | null>(null)
  const [trocarMecanico, setTrocarMecanico] = useState(false)

  /* ── posição do mecânico ao vivo ── */
  const [aoVivo, setAoVivo] = useState<(Ponto & { em: string }) | null>(null)
  useEffect(() => setAoVivo(null), [c.id])

  useTempoRealChamado(c.id, {
    aoPosicao: (p) => {
      if (p.papel === 'mecanico') setAoVivo({ lat: p.latitude, lng: p.longitude, em: p.registrado_em })
    },
    aoMensagem: (m) => {
      // Bipe curto: a central olha várias telas, a mensagem nova precisa chamar.
      if (m.autor_id !== usuario?.id && m.autor_papel !== 'central') tocarAlerta({ tipo: 'aviso' })
    },
  })

  const pontoCliente = pontoDe(c)
  const posMecanicoBanco = d.ultima_posicao_mecanico
    ? { lat: d.ultima_posicao_mecanico.latitude, lng: d.ultima_posicao_mecanico.longitude, em: d.ultima_posicao_mecanico.registrado_em }
    : d.mecanico?.latitude != null && d.mecanico.longitude != null
      ? { lat: d.mecanico.latitude, lng: d.mecanico.longitude, em: d.mecanico.posicao_em ?? '' }
      : null
  const posMecanico = aoVivo ?? posMecanicoBanco
  const emDeslocamento = c.status === 'aceito' || c.status === 'a_caminho'

  /* ── rota até o cliente enquanto o mecânico se desloca ── */
  const [rota, setRota] = useState<Rota | null>(null)
  const chaveRota =
    emDeslocamento && posMecanico && pontoCliente
      ? `${posMecanico.lat.toFixed(4)},${posMecanico.lng.toFixed(4)}>${pontoCliente.lat.toFixed(4)},${pontoCliente.lng.toFixed(4)}`
      : ''
  const velocidade = config.data?.velocidade_media_kmh ?? 40
  useEffect(() => {
    if (!chaveRota || !posMecanico || !pontoCliente) {
      setRota(null)
      return
    }
    let vivo = true
    void calcularRota(posMecanico, pontoCliente, velocidade).then((r) => vivo && setRota(r))
    return () => {
      vivo = false
    }
    // A chave arredondada (~10 m) evita pedir rota nova a cada leitura do GPS.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveRota, velocidade])

  /* ── ações ── */
  const cancelar = useMutation({
    mutationFn: (motivo: string) => sosCancelar(c.id, motivo),
    onSuccess: () => {
      setCancelando(false)
      toast.ok('Chamado cancelado', 'Cliente e mecânico foram avisados.')
      invalidarSOS(qc, c.id)
    },
    onError: (e) => toast.erro('Não foi possível cancelar', mensagemErro(e)),
  })

  const avancar = useMutation({
    mutationFn: (dados: Record<string, unknown>) => sosAvancar(c.id, proxima!.status, { dados }),
    onSuccess: () => {
      setAvancando(false)
      toast.ok('Etapa atualizada', STATUS_SOS[proxima!.status].rotulo)
      invalidarSOS(qc, c.id)
    },
    onError: (e) => toast.erro('Não foi possível avançar', mensagemErro(e)),
  })

  const gerarOS = useMutation({
    mutationFn: () => sosGerarOS(c.id),
    onSuccess: () => {
      setGerandoOS(false)
      toast.ok('OS gerada', 'Cliente, veículo, mecânico e itens do chamado já estão nela.')
      invalidarSOS(qc, c.id)
    },
    onError: (e) => toast.erro('Não foi possível gerar a OS', mensagemErro(e)),
  })

  const compartilhar = useMutation({
    mutationFn: () => sosCompartilhar(c.id, 12),
    onSuccess: (token) => setLink(linkAcompanhamento(token)),
    onError: (e) => toast.erro('Não foi possível gerar o link', mensagemErro(e)),
  })

  const mostrarDespacho = podeEditar && !encerrado && (espera || trocarMecanico)

  /*
   * A conversa rola até a última mensagem (scrollIntoView) ao montar e a cada
   * mensagem nova — e isso arrasta junto o painel inteiro. Guardamos onde a
   * pessoa estava lendo e devolvemos: o chamado abre no topo e uma mensagem
   * nova não tira ninguém do despacho.
   */
  const raiz = useRef<HTMLDivElement>(null)
  const leitura = useRef({ painel: 0, janela: 0 })
  useEffect(() => {
    const painel = raiz.current?.parentElement?.closest<HTMLElement>('.overflow-y-auto')
    if (!painel) return
    const guardar = () => {
      leitura.current = { painel: painel.scrollTop, janela: window.scrollY }
    }
    painel.addEventListener('scroll', guardar, { passive: true })
    return () => painel.removeEventListener('scroll', guardar)
  }, [])
  useEffect(() => {
    leitura.current = { painel: 0, janela: window.scrollY }
  }, [c.id])
  useEffect(() => {
    const painel = raiz.current?.parentElement?.closest<HTMLElement>('.overflow-y-auto')
    if (painel) painel.scrollTop = leitura.current.painel
    if (window.scrollY !== leitura.current.janela) window.scrollTo(0, leitura.current.janela)
  }, [c.id, d.mensagens.length])

  return (
    <div ref={raiz} className="flex flex-col gap-4">
      <Cabecalho d={d} tempoAceite={tempoAceite}>
        <div className="flex flex-wrap gap-2">
          {podeEditar && proxima && (
            <Botao
              variante="neutro"
              iconeInicio={<ArrowRightCircle />}
              onClick={() => setAvancando(true)}
              disabled={travadoPorOrcamento}
              title={travadoPorOrcamento ? 'O serviço só começa com o orçamento aprovado pelo cliente' : undefined}
              className="flex-1 max-sm:h-11 sm:flex-none"
            >
              {proxima.rotulo}
            </Botao>
          )}
          <Botao variante="neutro" iconeInicio={<Share2 />} carregando={compartilhar.isPending} onClick={() => compartilhar.mutate()} className="flex-1 max-sm:h-11 sm:flex-none">
            Link de acompanhamento
          </Botao>
          <BotaoLaudo chamado={c} className="flex-1 max-sm:h-11 sm:flex-none" />
          {d.os ? (
            <Botao variante="secundario" iconeInicio={<FileText />} onClick={() => navegar(`/operacao/ordens-de-servico?os=${d.os!.id}`)} className="flex-1 max-sm:h-11 sm:flex-none">
              Abrir OS {String(d.os.numero).padStart(5, '0')}
            </Botao>
          ) : (
            podeGerarOS &&
            c.status !== 'cancelado' && (
              <Botao
                variante="secundario"
                iconeInicio={<FilePlus2 />}
                disabled={!c.veiculo_id}
                title={!c.veiculo_id ? 'Informe o veículo antes de gerar a OS' : undefined}
                onClick={() => setGerandoOS(true)}
                className="flex-1 max-sm:h-11 sm:flex-none"
              >
                Gerar OS
              </Botao>
            )
          )}
          {podeCancelar && c.status !== 'concluido' && c.status !== 'cancelado' && (
            <Botao variante="destrutivo" iconeInicio={<Ban />} onClick={() => setCancelando(true)} className="flex-1 max-sm:h-11 sm:flex-none">
              Cancelar
            </Botao>
          )}
        </div>
      </Cabecalho>

      {c.status === 'cancelado' && (
        <Aviso tom="critico" titulo={`Cancelado ${c.cancelado_por_papel ? `${QUEM_CANCELOU[c.cancelado_por_papel]} ` : ''}em ${dataHoraCurta(c.cancelado_em)}`}>
          {c.motivo_cancelamento ?? 'Sem motivo informado.'}
        </Aviso>
      )}

      <div className="grid grid-cols-1 min-w-0 gap-4 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {mostrarDespacho && (
            <Bloco
              titulo={trocarMecanico && !espera ? 'Trocar mecânico' : 'Despacho'}
              className="border-accent/35"
              acao={
                trocarMecanico && !espera ? (
                  <button type="button" onClick={() => setTrocarMecanico(false)} className="-my-2 min-h-11 text-[12px] font-medium text-ink-3 hover:text-ink lg:my-0 lg:min-h-0">
                    Fechar
                  </button>
                ) : undefined
              }
            >
              <Despacho chamado={c} modo={config.data?.modo_distribuicao} nomeMecanicoAtual={d.mecanico?.nome} />
            </Bloco>
          )}

          <BlocoMapa d={d} pontoCliente={pontoCliente} posMecanico={posMecanico} rota={rota} emDeslocamento={emDeslocamento} />

          <div className="grid grid-cols-1 min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <Bloco titulo="Cliente">
              <div className="flex flex-col gap-2.5">
                <div>
                  <p className="text-[15px] leading-snug font-semibold text-ink">{d.cliente?.nome ?? '—'}</p>
                  <p className="num text-[12.5px] text-ink-2">{d.cliente?.telefone ? mascaraTelefone(d.cliente.telefone) : 'Sem telefone'}</p>
                </div>
                <ContatoRapido telefone={d.cliente?.telefone} mensagem={`Olá! Aqui é a Central Tecnoar, sobre o seu chamado ${c.protocolo}.`} compacto />
              </div>
            </Bloco>
            <Bloco titulo="Veículo">
              {d.veiculo ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Placa placa={d.veiculo.placa} className="text-[13px] leading-[22px]" />
                    {d.veiculo.tipo && <span className="text-[12px] text-ink-3">{ROTULO_TIPO_VEICULO[d.veiculo.tipo] ?? d.veiculo.tipo}</span>}
                  </div>
                  <p className="text-[13.5px] text-ink">
                    {[d.veiculo.marca, d.veiculo.modelo, d.veiculo.ano].filter(Boolean).join(' ') || d.veiculo.descricao || 'Modelo não informado'}
                  </p>
                  {d.veiculo.km_atual != null && <p className="num text-[12px] text-ink-3">{d.veiculo.km_atual.toLocaleString('pt-BR')} km</p>}
                </div>
              ) : (
                <p className="text-[13px] text-ink-3">
                  <Truck aria-hidden className="mr-1 inline size-4" />
                  Veículo não informado
                </p>
              )}
            </Bloco>
          </div>

          <Bloco titulo="Problema relatado">
            <div className="flex items-start gap-3">
              <IconeOcorrencia tipo={c.tipo_ocorrencia} />
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-ink">{c.ocorrencia_rotulo}</p>
                <p className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">{c.descricao || 'O cliente não descreveu o problema.'}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <span className="lbl">Fotos, áudios e vídeos</span>
              <GaleriaAnexos anexos={d.anexos} chamadoId={c.id} meuId={usuario?.id} podeRemoverTudo={podeEditar} />
              {podeEditar && !encerrado && <EnviarMidia chamadoId={c.id} etapa="outro" compacto />}
              {iaAtiva && ia.data?.foto && podeEditar && <AnaliseFotosIA chamadoId={c.id} anexos={d.anexos} />}
            </div>
          </Bloco>

          {iaAtiva && ia.data?.kit && (c.ia_kit || podeGerarKit) && <BlocoKitIA chamado={c} podeGerar={podeGerarKit} />}

          <Bloco titulo="Serviços e produtos">
            <ItensAtendimento chamadoId={c.id} itens={d.itens} podeEditar={podeEditar && c.status !== 'concluido' && c.status !== 'cancelado'} />
          </Bloco>

          <BlocoOrcamento d={d} podeEditar={podeEditar} exigirAprovacao={exigirAprovacao} />

          <BlocoRegistroTecnico chamado={c} podeEditar={podeEditar} iaResumo={iaAtiva && ia.data?.resumo === true} />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Bloco
            titulo="Mecânico"
            acao={
              podeEditar && !encerrado && !espera && d.mecanico && !trocarMecanico ? (
                <button
                  type="button"
                  onClick={() => setTrocarMecanico(true)}
                  className="-my-2 flex min-h-11 items-center gap-1 text-[12px] font-medium text-cyan-ink hover:underline lg:my-0 lg:min-h-0"
                >
                  <UserRoundCog aria-hidden className="size-3.5" /> Trocar
                </button>
              ) : undefined
            }
          >
            {d.mecanico ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Avatar nome={d.mecanico.nome} url={d.mecanico.avatar_url} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-semibold text-ink">{d.mecanico.nome}</p>
                    <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                      {d.mecanico.nota != null && (
                        <span className="flex items-center gap-1">
                          <Estrelas valor={Math.round(Number(d.mecanico.nota))} tamanho="sm" />
                          <span className="num">{Number(d.mecanico.nota).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</span>
                        </span>
                      )}
                      <span>{d.mecanico.atendimentos} atendimento{d.mecanico.atendimentos === 1 ? '' : 's'}</span>
                    </p>
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                  <Dado rotulo="Distância" valor={rota ? formatarDistancia(rota.distanciaKm) : formatarDistancia(c.distancia_km)} />
                  <Dado
                    rotulo="Previsão de chegada"
                    valor={
                      emDeslocamento
                        ? rota
                          ? `~${formatarEta(rota.duracaoMin)}`
                          : formatarEta(c.eta_min)
                        : c.chegou_em
                          ? `chegou ${new Date(c.chegou_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                          : '—'
                    }
                  />
                  <Dado rotulo="Posição" valor={posMecanico?.em ? haQuanto(posMecanico.em) : 'sem posição'} />
                  <Dado rotulo="Veículo de apoio" valor={d.mecanico.veiculo_apoio ?? '—'} />
                </dl>
                <ContatoRapido telefone={d.mecanico.telefone} mensagem={`Central Tecnoar, sobre o chamado ${c.protocolo}.`} compacto />
              </div>
            ) : (
              <p className="flex items-center gap-2 text-[13px] text-ink-3">
                <Wrench aria-hidden className="size-4" />
                {c.status === 'cancelado' ? 'Nenhum mecânico foi despachado.' : 'Nenhum mecânico atribuído ainda.'}
              </p>
            )}
          </Bloco>

          <BlocoHorarios c={c} />

          <Bloco titulo="Ordem de serviço">
            {d.os ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="num text-[15px] font-semibold text-ink">OS {String(d.os.numero).padStart(5, '0')}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    {d.os.status && <Selo tom={TOM_COR_STATUS[d.os.status_cor ?? ''] ?? 'neutro'}>{d.os.status}</Selo>}
                    {d.os.valor_total != null && <span className="num text-[12.5px] text-ink-2">{moeda(d.os.valor_total)}</span>}
                  </span>
                </div>
                <Botao tamanho="sm" variante="secundario" iconeFim={<ExternalLink />} onClick={() => navegar(`/operacao/ordens-de-servico?os=${d.os!.id}`)}>
                  Abrir no Checklist
                </Botao>
              </div>
            ) : (
              <p className="text-[13px] leading-relaxed text-ink-3">
                Nenhuma OS ligada a este chamado.
                {config.data?.gerar_os_ao_finalizar ? ' Ela é gerada automaticamente quando o mecânico finalizar o serviço.' : ''}
              </p>
            )}
          </Bloco>

          <Bloco
            titulo="Mensagens"
            acao={<span className="text-[11.5px] text-ink-3">Cliente, mecânico e central</span>}
          >
            <Conversa
              chamadoId={c.id}
              mensagens={d.mensagens}
              meuId={usuario?.id}
              rapidas={MENSAGENS_RAPIDAS_CENTRAL}
              encerrado={c.status === 'concluido' || c.status === 'cancelado'}
              alturaMaxima="max-h-80"
            />
          </Bloco>

          <Bloco titulo="Avaliação do cliente">
            {c.avaliacao_nota != null ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Estrelas valor={c.avaliacao_nota} />
                  <span className="num text-[13px] text-ink-2">{c.avaliacao_nota}/5</span>
                </div>
                {c.avaliacao_comentario && <p className="text-[13.5px] leading-relaxed text-ink-2">“{c.avaliacao_comentario}”</p>}
                <p className="text-[11.5px] text-ink-3">{dataHoraCurta(c.avaliado_em)}</p>
              </div>
            ) : (
              <p className="text-[13px] text-ink-3">
                {c.status === 'servico_finalizado'
                  ? 'Aguardando o cliente avaliar pelo app.'
                  : c.status === 'cancelado'
                    ? 'Chamado cancelado — sem avaliação.'
                    : 'O cliente avalia depois que o serviço for finalizado.'}
              </p>
            )}
          </Bloco>

          <Bloco titulo="Linha do tempo">
            <LinhaDoTempo eventos={d.eventos} />
          </Bloco>
        </div>
      </div>

      <ModalCancelar
        aberto={cancelando}
        aoFechar={() => setCancelando(false)}
        carregando={cancelar.isPending}
        aoConfirmar={(motivo) => cancelar.mutate(motivo)}
        protocolo={c.protocolo}
      />

      {proxima && (
        <ModalAvancar
          aberto={avancando}
          aoFechar={() => setAvancando(false)}
          carregando={avancar.isPending}
          destino={proxima.status}
          rotulo={proxima.rotulo}
          chamado={c}
          aoConfirmar={(dados) => avancar.mutate(dados)}
        />
      )}

      <Confirmacao
        aberto={gerandoOS}
        aoFechar={() => setGerandoOS(false)}
        aoConfirmar={() => gerarOS.mutate()}
        carregando={gerarOS.isPending}
        titulo="Gerar OS a partir deste SOS?"
        rotuloConfirmar="Gerar OS"
        descricao="A OS nasce com o cliente, o veículo, o mecânico e os serviços e produtos lançados no chamado. O histórico fica ligado nos dois lados."
      />

      <ModalLink
        link={link}
        aoFechar={() => setLink(null)}
        telefoneCliente={d.cliente?.telefone ?? null}
        protocolo={c.protocolo}
      />
    </div>
  )
}

/* ── cabeçalho ──────────────────────────────────────────────────────────── */

function Cabecalho({ d, tempoAceite, children }: { d: TipoDetalhe; tempoAceite: number; children: ReactNode }) {
  const c = d.chamado
  return (
    <section
      className={cn(
        'relative flex flex-col gap-4 overflow-hidden rounded-2xl border p-4',
        c.prioridade === 'emergencia' && aguardando(c.status) ? 'border-crit/45 bg-crit-soft/40' : 'border-line bg-surface-2/60',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start gap-3">
        <IconeOcorrencia tipo={c.tipo_ocorrencia} tamanho="lg" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <SeloStatus status={c.status} />
            {c.prioridade !== 'normal' && <Selo tom={PRIORIDADES[c.prioridade].tom}>{PRIORIDADES[c.prioridade].rotulo}</Selo>}
            <Selo tom="neutro">{ROTULO_ORIGEM[c.origem] ?? c.origem}</Selo>
          </div>
          <p className="font-display text-[18px] leading-tight font-semibold text-ink sm:text-[20px]">{STATUS_SOS[c.status].rotulo}</p>
          <p className="text-[12.5px] text-ink-3">
            Aberto {haQuanto(c.recebido_em)} · {dataHoraCurta(c.recebido_em)}
          </p>
          <AvisosVigia chamado={c} className="mt-1" />
        </div>
        {/* No celular o relógio desce para a linha de baixo (alinhado ao texto):
            ao lado, espremia o status e o título até se sobreporem. */}
        <div className="shrink-0 max-sm:order-last max-sm:basis-full max-sm:pl-14">
          <RelogioChamado chamado={c} tempoAceiteSeg={tempoAceite} className="text-[13px]" />
        </div>
      </div>
      {/* Linha própria: com o relógio ao lado, a coluna do meio é estreita demais no celular. */}
      <SeloContrato chamado={c} />
      {c.status !== 'cancelado' && (
        <>
          {/* Seis rótulos não cabem lado a lado num celular: lá ficam só os pontos
              — a etapa atual já está escrita logo acima. */}
          <div className="sm:hidden">
            <ProgressoChamado chamado={c} compacto />
          </div>
          <div className="hidden sm:block">
            <ProgressoChamado chamado={c} />
          </div>
        </>
      )}
      {children}
    </section>
  )
}

/* ── mapa ───────────────────────────────────────────────────────────────── */

function BlocoMapa({
  d,
  pontoCliente,
  posMecanico,
  rota,
  emDeslocamento,
}: {
  d: TipoDetalhe
  pontoCliente: Ponto | null
  posMecanico: (Ponto & { em: string }) | null
  rota: Rota | null
  emDeslocamento: boolean
}) {
  const c = d.chamado
  const mapa = useRef<MapaLeaflet | null>(null)
  const agora = useAgora(30_000)
  const [copiado, setCopiado] = useState(false)

  // Mecânico só aparece enquanto está envolvido no atendimento; depois de
  // encerrado, a posição dele não diz mais nada sobre este chamado.
  const mostrarMecanico = !!posMecanico && !!d.mecanico && !ENCERRADOS.includes(c.status)
  const posicaoViva = mostrarMecanico && posMecanico!.em ? segundosDesde(posMecanico!.em, agora) < 120 : false

  const marcadores = useMemo<MarcadorMapa[]>(() => {
    const lista: MarcadorMapa[] = []
    if (pontoCliente)
      lista.push({
        id: 'cliente',
        ponto: pontoCliente,
        tipo: 'cliente',
        // O mesmo pino da Tecnoar da fila, na mesma cor de etapa.
        tom: tomPinoChamado(c.status),
        critico: c.prioridade === 'emergencia' && !ENCERRADOS.includes(c.status),
        rotulo: d.cliente?.nome?.split(' ')[0] ?? 'Cliente',
        pulsar: aguardando(c.status),
      })
    if (mostrarMecanico && posMecanico)
      lista.push({
        id: 'mecanico',
        ponto: { lat: posMecanico.lat, lng: posMecanico.lng },
        tipo: 'mecanico',
        sigla: d.mecanico!.nome.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase(),
        rotulo: d.mecanico!.nome.split(' ')[0],
        pulsar: posicaoViva,
      })
    return lista
  }, [pontoCliente, posMecanico, mostrarMecanico, posicaoViva, c.status, c.prioridade, d.cliente?.nome, d.mecanico])

  async function copiarCoordenadas() {
    if (!pontoCliente) return
    try {
      await navigator.clipboard.writeText(formatarCoordenadas(pontoCliente))
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 1600)
    } catch {
      /* área de transferência bloqueada */
    }
  }

  return (
    <Bloco
      titulo="Localização"
      acao={
        pontoCliente ? (
          <a
            href={linkVerNoMapa(pontoCliente)}
            target="_blank"
            rel="noreferrer"
            className="-my-2 flex min-h-11 items-center gap-1 text-[12px] font-medium text-cyan-ink hover:underline lg:my-0 lg:min-h-0"
          >
            <Navigation aria-hidden className="size-3.5" /> Google Maps
          </a>
        ) : undefined
      }
    >
      {pontoCliente ? (
        <>
          <div className="relative isolate h-60 overflow-hidden rounded-xl border border-line sm:h-72">
            <MapaSOS marcadores={marcadores} rota={rota?.pontos} rotaEstimada={rota ? !rota.real : undefined} tema="claro" className="size-full">
              <CapturaMapa destino={mapa} />
            </MapaSOS>
            <div className="absolute right-2.5 bottom-7 z-[600]">
              <BotaoMapa rotulo="Enquadrar" onClick={() => enquadrarMapa(mapa.current, marcadores.map((m) => m.ponto))} className="size-10">
                <Maximize />
              </BotaoMapa>
            </div>
            {emDeslocamento && rota && (
              <div className="pointer-events-none absolute bottom-2.5 left-2.5 z-[600] rounded-lg bg-[#081830]/90 px-3 py-2 text-white shadow-e2 backdrop-blur">
                <p className="font-display text-[10px] font-semibold tracking-[0.14em] text-white/70 uppercase">{rota.real ? 'Pela estrada' : 'Estimativa'}</p>
                <p className="num text-[14px] font-semibold">
                  {formatarDistancia(rota.distanciaKm)} · ~{formatarEta(rota.duracaoMin)}
                </p>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <p className="text-[13.5px] leading-snug text-ink">{c.endereco ?? 'Endereço não identificado'}</p>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
              <span className="num">{formatarCoordenadas(pontoCliente)}</span>
              <button type="button" onClick={() => void copiarCoordenadas()} className="flex min-h-11 items-center gap-1 rounded px-1 text-cyan-ink hover:underline lg:min-h-0">
                {copiado ? <Check aria-hidden className="size-3" /> : <Copy aria-hidden className="size-3" />}
                {copiado ? 'Copiado' : 'Copiar'}
              </button>
              {c.precisao_m != null && <span>precisão ±{Math.round(c.precisao_m)} m</span>}
              {c.ponto_ajustado && <span>ponto ajustado no mapa</span>}
            </p>
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-ink-3">
          O cliente não enviou a localização. Ligue e peça uma referência — ou peça pelo chat.
        </p>
      )}
    </Bloco>
  )
}

/* ── horários ───────────────────────────────────────────────────────────── */

function BlocoHorarios({ c }: { c: TipoDetalhe['chamado'] }) {
  const agora = useAgora(30_000)
  const ativo = !ENCERRADOS.includes(c.status)
  const marcos: Array<[string, string | null]> = [
    ['Solicitação', c.recebido_em],
    ['Atribuição', c.atribuido_em],
    ['Aceite', c.aceito_em],
    ['Chegada', c.chegou_em],
    ['Início do serviço', c.iniciado_em],
    ['Finalização', c.finalizado_em],
    ['Conclusão', c.concluido_em],
  ]
  if (c.cancelado_em) marcos.push(['Cancelamento', c.cancelado_em])

  const total = c.tempo_total_seg ?? (ativo ? segundosDesde(c.recebido_em, agora) : null)

  return (
    <Bloco titulo="Horários">
      <ol className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {marcos.map(([r, v]) => (
          <li key={r} className="min-w-0">
            <p className="text-[11.5px] text-ink-3">{r}</p>
            <p className={cn('num text-[13px]', v ? 'font-medium text-ink' : 'text-ink-3')}>{v ? dataHoraCurta(v) : '—'}</p>
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-2 gap-2 border-t border-line pt-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
        <Tempo rotulo="Aceite" seg={c.tempo_aceite_seg} />
        <Tempo rotulo="Deslocamento" seg={c.tempo_deslocamento_seg} />
        <Tempo rotulo="Serviço" seg={c.tempo_servico_seg} />
        <Tempo rotulo={c.tempo_total_seg == null && ativo ? 'Total (correndo)' : 'Tempo total'} seg={total} destaque />
      </div>
    </Bloco>
  )
}

function Tempo({ rotulo, seg, destaque }: { rotulo: string; seg: number | null | undefined; destaque?: boolean }) {
  return (
    <div className={cn('rounded-lg px-2.5 py-2', destaque ? 'bg-accent-soft' : 'bg-surface-2')}>
      <p className="truncate text-[11px] text-ink-3">{rotulo}</p>
      <p className={cn('num text-[14px] font-semibold', destaque ? 'text-accent-ink' : 'text-ink')}>{seg != null ? formatarDuracao(seg) : '—'}</p>
    </div>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] text-ink-3">{rotulo}</dt>
      <dd className="num truncate text-[13px] font-medium text-ink">{valor}</dd>
    </div>
  )
}

/* ── modais ─────────────────────────────────────────────────────────────── */

function ModalCancelar({
  aberto,
  aoFechar,
  aoConfirmar,
  carregando,
  protocolo,
}: {
  aberto: boolean
  aoFechar: () => void
  aoConfirmar: (motivo: string) => void
  carregando: boolean
  protocolo: string
}) {
  const [motivo, setMotivo] = useState('')
  useEffect(() => {
    if (aberto) setMotivo('')
  }, [aberto])

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={`Cancelar o chamado ${protocolo}`}
      descricao="O cliente e o mecânico são avisados na hora. O motivo fica registrado na linha do tempo."
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar} disabled={carregando}>
            Voltar
          </Botao>
          <Botao variante="destrutivo" iconeInicio={<Ban />} carregando={carregando} disabled={motivo.trim().length < 3} onClick={() => aoConfirmar(motivo.trim())}>
            Cancelar chamado
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5">
          {MOTIVOS_CANCELAMENTO.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMotivo(m)}
              className={cn(
                'min-h-9 rounded-full border px-3 text-[12.5px] transition-colors',
                motivo === m ? 'border-crit bg-crit-soft text-crit-ink' : 'border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink',
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <Campo rotulo="Motivo" obrigatorio>
          {(p) => <AreaTexto {...p} rows={3} value={motivo} maxLength={500} onChange={(e) => setMotivo(e.target.value)} placeholder="Explique em poucas palavras" />}
        </Campo>
      </div>
    </Modal>
  )
}

function ModalAvancar({
  aberto,
  aoFechar,
  aoConfirmar,
  carregando,
  destino,
  rotulo,
  chamado,
}: {
  aberto: boolean
  aoFechar: () => void
  aoConfirmar: (dados: Record<string, unknown>) => void
  carregando: boolean
  destino: StatusSOS
  rotulo: string
  chamado: TipoDetalhe['chamado']
}) {
  const finalizar = destino === 'servico_finalizado'
  const [diagnostico, setDiagnostico] = useState('')
  const [servico, setServico] = useState('')
  const [observacoes, setObservacoes] = useState('')

  useEffect(() => {
    if (!aberto) return
    setDiagnostico(chamado.diagnostico ?? '')
    setServico(chamado.servico_realizado ?? '')
    setObservacoes(chamado.observacoes_finais ?? '')
  }, [aberto, chamado.diagnostico, chamado.servico_realizado, chamado.observacoes_finais])

  // Finalizar sem diagnóstico e serviço é recusado pelo banco; o botão já avisa antes.
  const faltando = finalizar && (!diagnostico.trim() || !servico.trim())

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={rotulo}
      descricao={`O chamado passa para “${STATUS_SOS[destino].rotulo}”. Normalmente é o mecânico quem registra esta etapa pelo app — use aqui só se ele não conseguir (sem sinal, bateria acabou).`}
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar} disabled={carregando}>
            Voltar
          </Botao>
          <Botao
            variante="primario"
            iconeInicio={<ArrowRightCircle />}
            carregando={carregando}
            disabled={faltando}
            onClick={() =>
              aoConfirmar(finalizar ? { diagnostico: diagnostico.trim(), servico_realizado: servico.trim(), observacoes: observacoes.trim() || undefined } : {})
            }
          >
            Confirmar
          </Botao>
        </>
      }
    >
      {finalizar ? (
        <div className="flex flex-col gap-3">
          <Campo rotulo="Diagnóstico" obrigatorio>
            {(p) => <AreaTexto {...p} rows={3} value={diagnostico} onChange={(e) => setDiagnostico(e.target.value)} placeholder="O que o mecânico encontrou" />}
          </Campo>
          <Campo rotulo="Serviço realizado" obrigatorio>
            {(p) => <AreaTexto {...p} rows={3} value={servico} onChange={(e) => setServico(e.target.value)} placeholder="O que foi feito no local" />}
          </Campo>
          <Campo rotulo="Observações">
            {(p) => <AreaTexto {...p} rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Recomendações ao cliente, pendências" />}
          </Campo>
        </div>
      ) : (
        <p className="text-[13.5px] leading-relaxed text-ink-2">
          Etapa atual: <strong className="text-ink">{STATUS_SOS[chamado.status].rotulo}</strong>. Os horários e tempos do atendimento passam a contar a
          partir de agora.
        </p>
      )}
    </Modal>
  )
}

function ModalLink({
  link,
  aoFechar,
  telefoneCliente,
  protocolo,
}: {
  link: string | null
  aoFechar: () => void
  telefoneCliente: string | null
  protocolo: string
}) {
  const toast = useToast()
  const texto = `Acompanhe o socorro Tecnoar (${protocolo}) em tempo real: ${link ?? ''}`
  const zap = linkWhatsApp(telefoneCliente, texto)
  const podeCompartilhar = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copiar() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast.ok('Link copiado')
    } catch {
      toast.atencao('Copie o link manualmente', 'O navegador bloqueou a área de transferência.')
    }
  }

  return (
    <Modal
      aberto={!!link}
      aoFechar={aoFechar}
      titulo="Link de acompanhamento"
      descricao="Quem abrir vê a etapa, a previsão e a posição aproximada do mecânico — sem precisar de cadastro. Vale por 12 horas."
      rodape={
        <>
          {podeCompartilhar && (
            <Botao variante="neutro" iconeInicio={<Share2 />} onClick={() => void navigator.share({ title: protocolo, text: texto, url: link ?? undefined }).catch(() => {})}>
              Compartilhar
            </Botao>
          )}
          {zap && (
            <a
              href={zap}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-ok/40 bg-ok-soft px-4 font-display text-xs font-bold tracking-[0.06em] text-ok-ink uppercase hover:border-ok"
            >
              <MessageCircle aria-hidden className="size-4" /> Enviar ao cliente
            </a>
          )}
          <Botao variante="primario" iconeInicio={<Copy />} onClick={() => void copiar()}>
            Copiar link
          </Botao>
        </>
      }
    >
      <Entrada readOnly value={link ?? ''} aria-label="Link de acompanhamento" onFocus={(e) => e.currentTarget.select()} mono />
    </Modal>
  )
}
