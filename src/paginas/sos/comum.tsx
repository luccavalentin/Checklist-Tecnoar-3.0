import { useCallback, useEffect, useState, type AnchorHTMLAttributes, type ReactNode } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { MessageCircle, Phone, RefreshCw, Siren } from 'lucide-react'
import { cn, iniciais, mensagemErro } from '@/lib/utils'
import { Botao } from '@/componentes/ui/Botao'
import { Alternador } from '@/componentes/ui/Campo'
import { EstadoErro } from '@/componentes/ui/Estados'
import { sosConfigAtual, sosIaPublico, sosIndicadores, sosListarChamados, sosMecanicosMapa, sosVigiaStatus } from '@/sos/api'
import { CHAVES_SOS } from '@/sos/tempoReal'
import { linkAppSOS } from '@/sos/endereco'
import { audioLiberado, destravarAudio } from '@/sos/alerta'
import { OCORRENCIAS, STATUS_AGUARDANDO, STATUS_EM_CAMPO, linkTelefone, linkWhatsApp } from '@/sos/rotulos'
import type { MarcadorMapa, TomPinoSOS } from '@/sos/Mapa'
import type { ChamadoListado, MecanicoMapa, OcorrenciaSOS, SituacaoMecanico, StatusSOS, VigiaStatus } from '@/sos/tipos'

/**
 * Peças comuns da Central SOS: consultas compartilhadas, estados de erro,
 * relógio e os construtores de pino do mapa. Tudo o que duas abas usam mora
 * aqui para a fila, os cartões e o mapa contarem a mesma história.
 */

/* ── erro ───────────────────────────────────────────────────────────────── */

/** A migração do SOS ainda não foi aplicada: não é falha, é etapa pendente. */
export function ehErroNaoAtivado(erro: unknown): boolean {
  return /ainda não foi ativado/i.test(mensagemErro(erro))
}

export function ErroSOS({
  erro,
  aoTentarNovamente,
  compacto,
  className,
}: {
  erro: unknown
  aoTentarNovamente?: () => void
  compacto?: boolean
  className?: string
}) {
  if (ehErroNaoAtivado(erro)) return <EstadoSOSInativo aoTentarNovamente={aoTentarNovamente} compacto={compacto} className={className} />
  return <EstadoErro descricao={mensagemErro(erro)} aoTentarNovamente={aoTentarNovamente} compacto={compacto} className={className} />
}

export function EstadoSOSInativo({
  aoTentarNovamente,
  compacto,
  className,
}: {
  aoTentarNovamente?: () => void
  compacto?: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-lg border border-line bg-surface px-6 text-center shadow-e1',
        compacto ? 'min-h-44 py-8' : 'min-h-80 py-12',
        className,
      )}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-accent" />
      <span aria-hidden className="relative flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
        <span className="absolute inset-0 rounded-2xl ring-1 ring-accent/30" />
        <Siren className="size-6" />
      </span>
      <div className="flex max-w-md flex-col gap-1.5">
        <p className="font-display text-[16px] font-semibold text-ink">A Central SOS ainda não está ativa</p>
        <p className="text-[13px] leading-relaxed text-ink-2">
          O SOS Tecnoar ainda não foi ativado no banco de dados. Assim que a migração do SOS for aplicada, esta tela passa a
          receber os chamados em tempo real — sem precisar atualizar o sistema.
        </p>
      </div>
      {aoTentarNovamente && (
        <Botao tamanho="sm" variante="neutro" iconeInicio={<RefreshCw />} onClick={aoTentarNovamente}>
          Verificar de novo
        </Botao>
      )}
    </div>
  )
}

/* ── consultas compartilhadas ───────────────────────────────────────────── */

/** Meia-noite no fuso do aparelho: "hoje" é o dia da oficina, não o do servidor (UTC). */
export function inicioDoDia(): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export const CHAVE_INDICADORES_HOJE = [...CHAVES_SOS.indicadores, 'hoje'] as const
export const CHAVE_CHAMADOS_ATIVOS = [...CHAVES_SOS.lista, 'ativos'] as const

/* Sem a migração, repetir a consulta a cada minuto só gera ruído na rede. */
const semRepetirSeInativo = (tentativas: number, erro: unknown) => !ehErroNaoAtivado(erro) && tentativas < 2

/**
 * Indicadores de hoje. A mesma chave serve a página e o alerta global: um
 * cache só, uma requisição só, e o contador do alerta bate com o painel.
 */
export function useIndicadoresSOS(ativo = true) {
  return useQuery({
    queryKey: CHAVE_INDICADORES_HOJE,
    enabled: ativo,
    staleTime: 15_000,
    retry: semRepetirSeInativo,
    // Tempo real invalida na hora; o intervalo é só a rede de segurança.
    refetchInterval: (q) => (q.state.error && ehErroNaoAtivado(q.state.error) ? false : 60_000),
    queryFn: () => sosIndicadores(inicioDoDia()),
  })
}

export function useChamadosAtivos(ativo = true) {
  return useQuery({
    queryKey: CHAVE_CHAMADOS_ATIVOS,
    enabled: ativo,
    staleTime: 10_000,
    retry: semRepetirSeInativo,
    refetchInterval: (q) => (q.state.error ? false : 45_000),
    queryFn: () => sosListarChamados({ ativos: true, limite: 200 }),
  })
}

export function useMecanicosSOS(ativo = true) {
  return useQuery({
    queryKey: CHAVES_SOS.mecanicos,
    enabled: ativo,
    staleTime: 20_000,
    retry: semRepetirSeInativo,
    refetchInterval: (q) => (q.state.error ? false : 60_000),
    queryFn: sosMecanicosMapa,
  })
}

export function useConfigSOS(ativo = true) {
  return useQuery({
    queryKey: CHAVES_SOS.config,
    enabled: ativo,
    staleTime: 5 * 60_000,
    retry: semRepetirSeInativo,
    queryFn: sosConfigAtual,
  })
}

export const CHAVE_VIGIA = ['sos', 'vigia'] as const
export const CHAVE_IA_PUBLICO = ['sos', 'ia-publico'] as const
export const CHAVE_CONTRATOS = ['sos', 'contratos'] as const

/**
 * Saúde do vigia (pg_cron). O cabeçalho e a tela de configurações leem a
 * mesma chave: uma consulta a cada 30 s, não importa quantas telas mostram.
 */
export function useVigiaSOS(ativo = true) {
  return useQuery({
    queryKey: CHAVE_VIGIA,
    enabled: ativo,
    staleTime: 20_000,
    retry: semRepetirSeInativo,
    refetchInterval: (q) => (q.state.error && ehErroNaoAtivado(q.state.error) ? false : 30_000),
    queryFn: sosVigiaStatus,
  })
}

/** O que a IA do SOS está ligada para fazer — decide quais cartões aparecem. */
export function useIaPublicoSOS(ativo = true) {
  return useQuery({
    queryKey: CHAVE_IA_PUBLICO,
    enabled: ativo,
    staleTime: 5 * 60_000,
    retry: semRepetirSeInativo,
    queryFn: sosIaPublico,
  })
}

/** O vigia roda a cada 30 s: sem execução bem-sucedida há 2 min, algo parou. */
const VIGIA_LIMITE_SEG = 120

export type SaudeVigia = 'ativo' | 'parado' | 'desconhecido'

export function saudeVigia(v: VigiaStatus | undefined, agora = Date.now()): { saude: SaudeVigia; segundos: number | null } {
  if (!v?.ok) return { saude: 'desconhecido', segundos: null }
  const u = v.ultima
  if (v.agendado === false || !u) return { saude: 'parado', segundos: null }
  const segundos = segundosDesde(u.fim ?? u.inicio, agora)
  // Execução em andamento conta como viva enquanto começou há pouco.
  const rodou = u.status === 'succeeded' || ((u.status === 'running' || u.status === 'starting') && segundos < VIGIA_LIMITE_SEG)
  return { saude: rodou && segundos < VIGIA_LIMITE_SEG ? 'ativo' : 'parado', segundos }
}

/** "há 12 s", "há 3 min" — com segundos, porque o vigia roda a cada 30 s. */
export function haQuantoSegundos(seg: number | null): string {
  if (seg == null) return '—'
  if (seg < 90) return `há ${seg} s`
  if (seg < 3600) return `há ${Math.round(seg / 60)} min`
  if (seg < 86400) return `há ${Math.round(seg / 3600)} h`
  return `há ${Math.round(seg / 86400)} d`
}

/**
 * Pastilha de saúde do vigia no cabeçalho da central. Verde quando rodou há
 * menos de 2 min; vermelha quando parou — sem vigia, SOS sem aceite não
 * escala e ninguém é avisado. Com `aoClicar`, leva à tela de configurações.
 */
export function SeloVigia({ aoClicar, className }: { aoClicar?: () => void; className?: string }) {
  const vigia = useVigiaSOS()
  const agora = useAgora(15_000)
  if (vigia.isLoading || (vigia.isError && ehErroNaoAtivado(vigia.error))) return null
  const { saude, segundos } = saudeVigia(vigia.data, agora)
  if (saude === 'desconhecido' && !vigia.isError) return null
  const ativo = saude === 'ativo'
  const rotulo = ativo ? 'Vigia ativo' : vigia.isError ? 'Vigia sem status' : 'Vigia parado'
  const detalhe = vigia.isError
    ? 'Não foi possível consultar o vigia agora.'
    : segundos != null
      ? `Última execução ${haQuantoSegundos(segundos)}${(vigia.data?.falhas_1h ?? 0) > 0 ? ` · ${vigia.data?.falhas_1h} falha(s) na última hora` : ''}`
      : 'O vigia não está agendado no servidor.'
  const Elemento = aoClicar ? 'button' : 'span'
  return (
    <Elemento
      {...(aoClicar ? { type: 'button' as const, onClick: aoClicar } : {})}
      title={detalhe}
      aria-label={`${rotulo}. ${detalhe}`}
      className={cn(
        'flex items-center gap-2 rounded-full border px-3 py-1 transition-colors',
        ativo ? 'border-ok/35 bg-ok-soft' : vigia.isError ? 'border-warn/40 bg-warn-soft' : 'border-crit/40 bg-crit-soft',
        aoClicar && 'hover:border-ink-3',
        className,
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', ativo ? 'bg-ok' : vigia.isError ? 'bg-warn' : 'sos-piscar bg-crit')} />
      <span className={cn('lbl', ativo ? 'text-ok-ink' : vigia.isError ? 'text-warn-ink' : 'text-crit-ink')}>{rotulo}</span>
    </Elemento>
  )
}

/**
 * Depois de uma ação da central, tudo o que a mostra precisa refletir já:
 * o tempo real também avisaria, mas quem clicou não pode ficar olhando o
 * estado antigo nem por um segundo.
 */
export function invalidarSOS(qc: QueryClient, chamadoId?: string | null) {
  if (chamadoId) {
    void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(chamadoId) })
    void qc.invalidateQueries({ queryKey: CHAVES_SOS.sugestoes(chamadoId) })
  }
  void qc.invalidateQueries({ queryKey: CHAVES_SOS.lista })
  void qc.invalidateQueries({ queryKey: CHAVES_SOS.indicadores })
  void qc.invalidateQueries({ queryKey: CHAVES_SOS.mecanicos })
}

/** Padrão do banco quando a configuração ainda não carregou. */
export const TEMPO_ACEITE_PADRAO_SEG = 120

/* ── relógio ────────────────────────────────────────────────────────────── */

/**
 * "Agora" que avança sozinho. Cada cartão tem o seu relógio: um tique no topo
 * da página redesenharia o mapa inteiro a cada segundo.
 */
export function useAgora(intervaloMs = 15_000): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), intervaloMs)
    return () => window.clearInterval(t)
  }, [intervaloMs])
  return agora
}

export function segundosDesde(iso: string | null | undefined, agora = Date.now()): number {
  if (!iso) return 0
  return Math.max(0, Math.round((agora - Date.parse(iso)) / 1000))
}

/** 04:37 até uma hora; depois 1h12. Cronômetro de espera, lido de relance. */
export function cronometro(seg: number): string {
  if (seg < 3600) {
    const m = Math.floor(seg / 60)
    const s = seg % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  const h = Math.floor(seg / 3600)
  const m = Math.floor((seg % 3600) / 60)
  return `${h}h${String(m).padStart(2, '0')}`
}

export function aguardando(status: StatusSOS): boolean {
  return STATUS_AGUARDANDO.includes(status)
}

/**
 * O navegador só libera som depois de um toque na página. Este gancho diz se
 * já foi liberado e oferece o gesto para liberar — a sirene de um SOS novo
 * não pode depender de alguém ter clicado por acaso.
 */
export function useSomLiberado(): [boolean, () => Promise<boolean>] {
  const [liberado, setLiberado] = useState(audioLiberado)
  useEffect(() => {
    const conferir = () => window.setTimeout(() => setLiberado(audioLiberado()), 250)
    const t = window.setInterval(() => setLiberado(audioLiberado()), 3000)
    window.addEventListener('pointerdown', conferir)
    window.addEventListener('keydown', conferir)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('pointerdown', conferir)
      window.removeEventListener('keydown', conferir)
    }
  }, [])
  const liberar = useCallback(async () => {
    const ok = await destravarAudio()
    setLiberado(ok)
    return ok
  }, [])
  return [liberado, liberar]
}

/* ── mapa ───────────────────────────────────────────────────────────────── */

/** Posição com mais de 2 h não conta — é a mesma regra do despacho no banco. */
const VALIDADE_POSICAO_MS = 2 * 60 * 60 * 1000

export function posicaoRecente(m: Pick<MecanicoMapa, 'latitude' | 'longitude' | 'posicao_em'>, agora = Date.now()): boolean {
  if (m.latitude == null || m.longitude == null) return false
  if (!m.posicao_em) return false
  return agora - Date.parse(m.posicao_em) < VALIDADE_POSICAO_MS
}

export function tipoPinoMecanico(s: SituacaoMecanico): MarcadorMapa['tipo'] {
  if (s === 'disponivel') return 'mecanico_livre'
  if (s === 'em_atendimento') return 'mecanico_ocupado'
  return 'mecanico_off'
}

/** Cor do anel do pino da Tecnoar: a mesma leitura da legenda do mapa. */
export function tomPinoChamado(status: StatusSOS): TomPinoSOS {
  if (status === 'cancelado') return 'encerrado'
  if (status === 'servico_finalizado' || status === 'concluido') return 'fim'
  if (STATUS_EM_CAMPO.includes(status)) return 'campo'
  return 'espera'
}

export function marcadorChamado(
  c: ChamadoListado,
  opcoes: { selecionado?: boolean; aoClicar?: () => void } = {},
): MarcadorMapa | null {
  if (c.latitude == null || c.longitude == null) return null
  return {
    id: `c-${c.id}`,
    ponto: { lat: c.latitude, lng: c.longitude },
    tipo: 'chamado',
    tom: tomPinoChamado(c.status),
    // Emergência ganha o selo "!" só enquanto o socorro está em aberto.
    critico: c.prioridade === 'emergencia' && c.status !== 'concluido' && c.status !== 'cancelado',
    pulsar: aguardando(c.status),
    rotulo: [c.protocolo, c.placa ?? c.cliente_nome].filter(Boolean).join(' · '),
    selecionado: opcoes.selecionado,
    aoClicar: opcoes.aoClicar,
  }
}

export function marcadorMecanico(
  m: MecanicoMapa,
  opcoes: { selecionado?: boolean; aoClicar?: () => void } = {},
): MarcadorMapa | null {
  if (m.latitude == null || m.longitude == null) return null
  return {
    id: `m-${m.usuario_id}`,
    ponto: { lat: m.latitude, lng: m.longitude },
    tipo: tipoPinoMecanico(m.situacao),
    sigla: iniciais(m.nome),
    rotulo: m.nome.split(' ').slice(0, 2).join(' '),
    selecionado: opcoes.selecionado,
    aoClicar: opcoes.aoClicar,
  }
}

/* ── pequenas peças ─────────────────────────────────────────────────────── */

export function IconeOcorrencia({ tipo, tamanho = 'md', className }: { tipo: OcorrenciaSOS; tamanho?: 'sm' | 'md' | 'lg'; className?: string }) {
  const info = OCORRENCIAS[tipo] ?? OCORRENCIAS.outro
  const Icone = info.icone
  const dim = tamanho === 'lg' ? 'size-11 [&>svg]:size-5' : tamanho === 'sm' ? 'size-7 [&>svg]:size-3.5' : 'size-9 [&>svg]:size-4'
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-lg bg-surface-2 ring-1 ring-line', dim, info.cor, className)}>
      <Icone />
    </span>
  )
}

export function Avatar({ nome, url, tamanho = 'md', className }: { nome: string; url?: string | null; tamanho?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dim = tamanho === 'lg' ? 'size-12 text-[14px]' : tamanho === 'sm' ? 'size-8 text-[11px]' : 'size-10 text-[12.5px]'
  return url ? (
    <img src={url} alt="" className={cn('shrink-0 rounded-full object-cover ring-1 ring-line', dim, className)} />
  ) : (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full bg-[#081830] font-display font-bold text-white', dim, className)}>
      {iniciais(nome)}
    </span>
  )
}

const CLASSE_BOTAO_LINK = {
  neutro: 'border border-line-strong bg-transparent text-ink-2 hover:bg-surface-2 hover:text-ink',
  ok: 'border border-ok/40 bg-ok-soft text-ok-ink hover:border-ok',
  primario: 'border border-transparent bg-accent text-on-accent shadow-accent hover:bg-accent-hover',
} as const

/** Link com cara de botão (tel:, wa.me, abrir OS): o gesto nativo do aparelho continua funcionando. */
export function BotaoLink({
  variante = 'neutro',
  icone,
  children,
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variante?: keyof typeof CLASSE_BOTAO_LINK; icone?: ReactNode }) {
  return (
    <a
      {...props}
      className={cn(
        'inline-flex h-10 items-center justify-center gap-2 rounded-md px-3.5 font-display text-[11px] font-bold tracking-[0.06em] whitespace-nowrap uppercase transition-colors',
        CLASSE_BOTAO_LINK[variante],
        className,
      )}
    >
      {icone && <span aria-hidden className="inline-flex [&_svg]:size-4">{icone}</span>}
      {children}
    </a>
  )
}

/** Ligar e WhatsApp lado a lado — o atendimento por telefone é metade da central. */
export function ContatoRapido({ telefone, mensagem, compacto }: { telefone: string | null | undefined; mensagem?: string; compacto?: boolean }) {
  const tel = linkTelefone(telefone)
  const zap = linkWhatsApp(telefone, mensagem)
  if (!tel && !zap) return <span className="text-[12.5px] text-ink-3">Sem telefone</span>
  return (
    <div className="flex flex-wrap gap-2">
      {tel && (
        <BotaoLink href={tel} icone={<Phone />} aria-label="Ligar" className={compacto ? 'h-11 px-3 lg:h-9' : 'max-lg:h-11'}>
          Ligar
        </BotaoLink>
      )}
      {zap && (
        <BotaoLink href={zap} target="_blank" rel="noreferrer" variante="ok" icone={<MessageCircle />} aria-label="Abrir WhatsApp" className={compacto ? 'h-11 px-3 lg:h-9' : 'max-lg:h-11'}>
          WhatsApp
        </BotaoLink>
      )}
    </div>
  )
}

export function Placa({ placa, className }: { placa: string | null | undefined; className?: string }) {
  if (!placa) return null
  const p = placa.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return (
    <span className={cn('num inline-flex shrink-0 items-center rounded-[4px] border border-ink/70 bg-surface px-1.5 text-[11.5px] leading-[18px] font-semibold tracking-wider whitespace-nowrap text-ink', className)}>
      {p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p}
    </span>
  )
}

/** Mensagens da central no chat — o tom de quem está coordenando, não dirigindo. */
export const MENSAGENS_RAPIDAS_CENTRAL = [
  'Recebemos seu chamado. Já estamos acionando um mecânico.',
  'O mecânico está a caminho.',
  'Pode enviar uma foto do problema?',
  'Pode confirmar sua localização?',
  'Vamos te ligar agora.',
]

/** Link público de acompanhamento (servido pelo app do SOS, no subdomínio dele). */
export function linkAcompanhamento(token: string): string {
  return linkAppSOS(`/acompanhar/${token}`)
}

/**
 * Número digitado pela central: "3,50", "3.50" e "1.200,00" valem o que
 * parecem. Vazio ou inválido devolve null — quem chama decide se é erro.
 */
export function lerNumero(v: string): number | null {
  const t = v.trim().replace(/\s|R\$/g, '')
  if (!t) return null
  const n = t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Área de toque do interruptor: o `Alternador` do sistema desenha 38×22 px;
 * uma camada invisível leva o alvo a ~54×46 px sem mudar o desenho. Vai no
 * elemento que envolve o interruptor.
 */
export const ALVO_ALTERNADOR =
  "[&_[role=switch]]:before:absolute [&_[role=switch]]:before:-inset-x-2 [&_[role=switch]]:before:-inset-y-3 [&_[role=switch]]:before:content-['']"

/** Linha de liga/desliga com explicação — o padrão das telas de regra do SOS. */
export function LinhaAlternador({
  rotulo,
  texto,
  ativo,
  onChange,
  icone,
  disabled,
  className,
}: {
  rotulo: string
  texto: ReactNode
  ativo: boolean
  onChange: (v: boolean) => void
  icone: ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border border-line bg-surface-2/60 px-3.5 py-3', className)}>
      <span aria-hidden className={cn('mt-0.5 [&_svg]:size-4', ativo ? 'text-accent' : 'text-ink-3')}>
        {icone}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-ink">{rotulo}</p>
        <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-3">{texto}</div>
      </div>
      <div className={cn('flex min-h-10 items-center', ALVO_ALTERNADOR)}>
        <Alternador ativo={ativo} onChange={onChange} rotulo={rotulo} disabled={disabled} />
      </div>
    </div>
  )
}

/**
 * Valor em reais curto para cartões de indicador ("R$ 12,6 mil"): o valor
 * completo com centavos não cabe ao lado do rótulo em quatro colunas.
 */
export function moedaCurta(v: number | null | undefined): string {
  const n = Number(v ?? 0)
  const fmt = (x: number, casas: number) => x.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: casas })
  if (Math.abs(n) >= 1_000_000) return `R$ ${fmt(n / 1_000_000, 1)} mi`
  if (Math.abs(n) >= 10_000) return `R$ ${fmt(n / 1_000, 1)} mil`
  return `R$ ${fmt(Math.round(n), 0)}`
}
