import {
  AlertTriangle,
  BatteryWarning,
  CarFront,
  CircleDot,
  CircleHelp,
  Cog,
  Disc3,
  Droplets,
  HelpCircle,
  PowerOff,
  Truck,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import type { OcorrenciaSOS, PrioridadeSOS, SituacaoMecanico, StatusSOS } from './tipos'

/**
 * Vocabulário do SOS, o mesmo no app do cliente, no do mecânico e na central.
 * Uma palavra por estado: quem liga para a Tecnoar e quem atende precisam
 * estar falando da mesma coisa.
 */

export type TomSOS = 'neutro' | 'info' | 'atencao' | 'critico' | 'ok' | 'destaque'

export const STATUS_SOS: Record<StatusSOS, { rotulo: string; curto: string; tom: TomSOS; cliente: string }> = {
  solicitado: { rotulo: 'SOS solicitado', curto: 'Solicitado', tom: 'neutro', cliente: 'Enviando seu pedido…' },
  recebido: { rotulo: 'SOS recebido', curto: 'Recebido', tom: 'critico', cliente: 'A Tecnoar recebeu seu pedido.' },
  procurando_mecanico: {
    rotulo: 'Procurando mecânico',
    curto: 'Aguardando',
    tom: 'critico',
    cliente: 'Estamos acionando o mecânico mais próximo.',
  },
  aceito: { rotulo: 'Mecânico aceitou', curto: 'Aceito', tom: 'atencao', cliente: 'Um mecânico aceitou seu chamado.' },
  a_caminho: { rotulo: 'Mecânico a caminho', curto: 'A caminho', tom: 'atencao', cliente: 'O mecânico está a caminho.' },
  no_local: { rotulo: 'Mecânico no local', curto: 'No local', tom: 'info', cliente: 'O mecânico chegou.' },
  servico_iniciado: { rotulo: 'Serviço iniciado', curto: 'Em serviço', tom: 'info', cliente: 'O serviço está em andamento.' },
  servico_finalizado: {
    rotulo: 'Serviço finalizado',
    curto: 'Finalizado',
    tom: 'ok',
    cliente: 'Serviço finalizado. Conte como foi.',
  },
  concluido: { rotulo: 'Atendimento concluído', curto: 'Concluído', tom: 'ok', cliente: 'Atendimento concluído.' },
  cancelado: { rotulo: 'Cancelado', curto: 'Cancelado', tom: 'neutro', cliente: 'Chamado cancelado.' },
}

/** Etapas visíveis na linha de progresso (o cliente não precisa ver "solicitado"). */
export const ETAPAS_SOS: StatusSOS[] = [
  'recebido',
  'a_caminho',
  'no_local',
  'servico_iniciado',
  'servico_finalizado',
  'concluido',
]

const ORDEM: StatusSOS[] = [
  'solicitado',
  'recebido',
  'procurando_mecanico',
  'aceito',
  'a_caminho',
  'no_local',
  'servico_iniciado',
  'servico_finalizado',
  'concluido',
]

/** Posição do status na sequência (cancelado = -1). */
export function ordemStatus(s: StatusSOS): number {
  return ORDEM.indexOf(s)
}

export const STATUS_ATIVOS: StatusSOS[] = [
  'recebido',
  'procurando_mecanico',
  'aceito',
  'a_caminho',
  'no_local',
  'servico_iniciado',
]
export const STATUS_AGUARDANDO: StatusSOS[] = ['recebido', 'procurando_mecanico']
export const STATUS_EM_CAMPO: StatusSOS[] = ['aceito', 'a_caminho', 'no_local', 'servico_iniciado']
export const STATUS_ENCERRADOS: StatusSOS[] = ['servico_finalizado', 'concluido', 'cancelado']

export function chamadoAtivo(s: StatusSOS): boolean {
  return STATUS_ATIVOS.includes(s)
}

/** Próxima etapa que o mecânico dispara, com o texto do botão. */
export const PROXIMA_ETAPA: Partial<Record<StatusSOS, { status: StatusSOS; botao: string }>> = {
  aceito: { status: 'a_caminho', botao: 'Estou a caminho' },
  a_caminho: { status: 'no_local', botao: 'Cheguei ao local' },
  no_local: { status: 'servico_iniciado', botao: 'Iniciar serviço' },
  servico_iniciado: { status: 'servico_finalizado', botao: 'Finalizar serviço' },
}

export interface InfoOcorrencia {
  rotulo: string
  descricao: string
  icone: LucideIcon
  /** Cor de destaque do cartão (classes Tailwind do tema). */
  cor: string
  prioridade: PrioridadeSOS
}

export const OCORRENCIAS: Record<OcorrenciaSOS, InfoOcorrencia> = {
  freios: {
    rotulo: 'Problema nos freios',
    descricao: 'Pedal, ar, luz de alerta, freio travado',
    icone: Disc3,
    cor: 'text-crit',
    prioridade: 'emergencia',
  },
  nao_liga: {
    rotulo: 'Veículo não liga',
    descricao: 'Não dá partida ou morreu e não volta',
    icone: PowerOff,
    cor: 'text-warn',
    prioridade: 'alta',
  },
  mecanico: {
    rotulo: 'Pane mecânica',
    descricao: 'Barulho, fumaça, perda de força',
    icone: Cog,
    cor: 'text-accent',
    prioridade: 'normal',
  },
  pane_eletrica: {
    rotulo: 'Pane elétrica',
    descricao: 'Bateria, luzes, painel, chicote',
    icone: Zap,
    cor: 'text-warn',
    prioridade: 'normal',
  },
  roda_pneu: {
    rotulo: 'Roda ou pneu',
    descricao: 'Pneu furado, roda solta, cubo',
    icone: CircleDot,
    cor: 'text-cyan',
    prioridade: 'normal',
  },
  vazamento: {
    rotulo: 'Vazamento',
    descricao: 'Óleo, água, ar ou combustível',
    icone: Droplets,
    cor: 'text-cyan',
    prioridade: 'normal',
  },
  parado: {
    rotulo: 'Caminhão parado',
    descricao: 'Parou na via e não segue viagem',
    icone: Truck,
    cor: 'text-warn',
    prioridade: 'alta',
  },
  acidente: {
    rotulo: 'Acidente',
    descricao: 'Colisão ou saída de pista',
    icone: AlertTriangle,
    cor: 'text-crit',
    prioridade: 'emergencia',
  },
  desconhecido: {
    rotulo: 'Não sei o que é',
    descricao: 'O mecânico descobre para você',
    icone: CircleHelp,
    cor: 'text-ink-2',
    prioridade: 'normal',
  },
  outro: {
    rotulo: 'Outro problema',
    descricao: 'Descreva em poucas palavras',
    icone: HelpCircle,
    cor: 'text-ink-2',
    prioridade: 'normal',
  },
}

/** Ordem em que as opções aparecem para quem está pedindo socorro. */
export const ORDEM_OCORRENCIAS: OcorrenciaSOS[] = [
  'freios',
  'nao_liga',
  'parado',
  'mecanico',
  'pane_eletrica',
  'roda_pneu',
  'vazamento',
  'acidente',
  'desconhecido',
  'outro',
]

export const PRIORIDADES: Record<PrioridadeSOS, { rotulo: string; tom: TomSOS }> = {
  emergencia: { rotulo: 'Emergência', tom: 'critico' },
  alta: { rotulo: 'Alta', tom: 'atencao' },
  normal: { rotulo: 'Normal', tom: 'neutro' },
}

export const SITUACOES_MECANICO: Record<
  SituacaoMecanico,
  { rotulo: string; descricao: string; tom: TomSOS; ponto: string }
> = {
  disponivel: { rotulo: 'Disponível', descricao: 'Recebe novos chamados', tom: 'ok', ponto: 'bg-ok' },
  em_atendimento: { rotulo: 'Em atendimento', descricao: 'Atendendo um chamado', tom: 'info', ponto: 'bg-cyan' },
  pausa: { rotulo: 'Pausa', descricao: 'Volta em instantes', tom: 'atencao', ponto: 'bg-warn' },
  indisponivel: { rotulo: 'Indisponível', descricao: 'Não recebe chamados', tom: 'neutro', ponto: 'bg-ink-3' },
  offline: { rotulo: 'Offline', descricao: 'Fora do app', tom: 'neutro', ponto: 'bg-line-strong' },
}

export const ICONE_VEICULO: LucideIcon = CarFront
export const ICONE_BATERIA: LucideIcon = BatteryWarning

export const ROTULO_TIPO_VEICULO: Record<string, string> = {
  cavalo: 'Cavalo mecânico',
  carreta: 'Carreta',
  truck: 'Truck',
  toco: 'Toco',
  bitrem: 'Bitrem',
  rodotrem: 'Rodotrem',
  vanderleia: 'Vanderleia',
  onibus: 'Ônibus',
  van: 'Van',
  utilitario: 'Utilitário',
  outro: 'Outro',
}

export const MENSAGENS_RAPIDAS_MECANICO = [
  'Estou a caminho.',
  'Chego em aproximadamente 10 minutos.',
  'Já estou próximo.',
  'Não estou encontrando sua localização. Pode me enviar uma referência?',
  'Cheguei. Estou ao lado do veículo.',
]

export const MENSAGENS_RAPIDAS_CLIENTE = [
  'Estou dentro do veículo.',
  'Estou no acostamento.',
  'Estou em um posto de combustível.',
  'Pode me ligar, por favor.',
  'O veículo está com o pisca-alerta ligado.',
]

/* ── formatação ─────────────────────────────────────────────────────────── */

export function formatarDistancia(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return '—'
  if (km < 1) return `${Math.max(10, Math.round(km * 100) * 10)} m`
  return `${km.toLocaleString('pt-BR', { maximumFractionDigits: km < 10 ? 1 : 0 })} km`
}

export function formatarEta(min: number | null | undefined): string {
  if (min == null) return '—'
  if (min <= 1) return '1 min'
  if (min < 60) return `${Math.round(min)} min`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h} h ${m} min` : `${h} h`
}

export function formatarDuracao(seg: number | null | undefined): string {
  if (seg == null) return '—'
  if (seg < 60) return `${Math.round(seg)} s`
  const min = Math.round(seg / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

/** "há 3 min", "há 2 h" — para o cartão de chamado aguardando. */
export function haQuanto(iso: string | null | undefined, agora = Date.now()): string {
  if (!iso) return '—'
  const seg = Math.max(0, (agora - Date.parse(iso)) / 1000)
  if (seg < 45) return 'agora'
  if (seg < 3600) return `há ${Math.round(seg / 60)} min`
  if (seg < 86400) return `há ${Math.round(seg / 3600)} h`
  return `há ${Math.round(seg / 86400)} d`
}

export function horaCurta(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export function dataHoraCurta(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function descreverVeiculo(v: { placa?: string | null; marca?: string | null; modelo?: string | null; descricao?: string | null } | null | undefined): string {
  if (!v) return 'Veículo não informado'
  const nome = [v.marca, v.modelo].filter(Boolean).join(' ') || v.descricao || ''
  return [nome, v.placa].filter(Boolean).join(' · ') || 'Veículo'
}

export function formatarPlacaExibicao(placa: string | null | undefined): string {
  if (!placa) return '—'
  const p = placa.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return p.length === 7 ? `${p.slice(0, 3)}-${p.slice(3)}` : p
}

/** Link de ligação com só dígitos (o discador do celular aceita +55). */
export function linkTelefone(tel: string | null | undefined): string | null {
  const d = (tel ?? '').replace(/\D/g, '')
  if (d.length < 8) return null
  return `tel:${d.length >= 12 ? '+' + d : d}`
}

export function linkWhatsApp(tel: string | null | undefined, texto?: string): string | null {
  let d = (tel ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  if (d.length <= 11) d = '55' + d
  return `https://wa.me/${d}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
}
