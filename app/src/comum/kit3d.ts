import type { OcorrenciaSOS } from '@/sos/tipos'

/**
 * As peças 3D do SOS.
 *
 * Todas foram renderizadas para a Tecnoar com a mesma montagem: alumínio
 * usinado, verniz laranja #ff6600 e um fio de luz ciano #00afef, com a luz
 * principal vindo do alto à esquerda. Isso é o que faz o conjunto parecer uma
 * família de objetos e não um punhado de ícones avulsos — quem for gerar peça
 * nova precisa repetir material, luz e ângulo.
 *
 * Arte é decorativa: `alt` vazio, sem capturar toque, e a tela tem de
 * funcionar inteira se a imagem não carregar. Nenhuma peça traz texto dentro
 * da imagem; rótulo é sempre HTML por cima.
 */
const RAIZ = '/sos/kit-3d'
const MOBILE = '/sos/mobile-3d'

/** Arquivos fornecidos pelo cliente em 23/10/2026, otimizados para celular. */
export const ARTE_MOBILE = {
  agendar: `${MOBILE}/agendar-revisao.webp`,
  seloSOS: `${MOBILE}/selo-sos.webp`,
  enviar: `${MOBILE}/enviar-3d.webp`,
  temaClaro: `${MOBILE}/tema-claro.webp`,
  temaEscuro: `${MOBILE}/tema-escuro.webp`,
  temaAuto: `${MOBILE}/tema-auto.webp`,
  periodoQualquer: `${MOBILE}/periodo-qualquer.webp`,
  termos: `${MOBILE}/termos-3d.webp`,
  sair: `${MOBILE}/sair-3d.webp`,
  excluir: `${MOBILE}/excluir-3d.webp`,
  sirene: `${MOBILE}/sirene.webp`,
  whatsapp: `${MOBILE}/whatsapp.webp`,
  robo: `${MOBILE}/tecno_ia_3d.webp`,
  camera: `${MOBILE}/camera_3d.webp`,
  microfone: `${MOBILE}/microfone_3d.webp`,
  sol: `${MOBILE}/tecnoar_icone_tema_claro.webp`,
  lua: `${MOBILE}/tecnoar_icone_tema_escuro.webp`,
  sino: `${MOBILE}/tecnoar_icone_notificacoes.webp`,
  conta: `${MOBILE}/minha_conta.webp`,
  telefone: `${MOBILE}/telefone.webp`,
  email: `${MOBILE}/email.webp`,
  notificacoes: `${MOBILE}/notificacoes.webp`,
  veiculos: `${MOBILE}/meus_veiculos.webp`,
  revisoes: `${MOBILE}/revisoes_agendamentos.webp`,
  atendimento: `${MOBILE}/falar_com_tecnoar.webp`,
  caminhao: `${MOBILE}/caminhao.webp`,
  mapaBrasil: `${MOBILE}/pino-brasil.webp`,
  ligarCentral: `${MOBILE}/ligar-central-3d.webp`,
  cancelarSocorro: `${MOBILE}/cancelar-socorro-3d.webp`,
  compartilhar: `${MOBILE}/compartilhar-premium.webp`,
  centralizar: `${MOBILE}/centralizar-premium.webp`,
  cadeado: `${MOBILE}/cadeado-premium.webp`,
} as const

export const VEICULO_MOBILE: Readonly<Record<string, string>> = {
  cavalo: ARTE_MOBILE.caminhao,
  carreta: `${MOBILE}/veiculo-carreta.webp`,
  truck: `${MOBILE}/veiculo-truck.webp`,
  toco: `${MOBILE}/veiculo-toco.webp`,
  bitrem: `${MOBILE}/veiculo-carreta.webp`,
  rodotrem: `${MOBILE}/veiculo-carreta.webp`,
  vanderleia: `${MOBILE}/veiculo-carreta.webp`,
  onibus: `${MOBILE}/veiculo-onibus.webp`,
  van: `${MOBILE}/veiculo-van.webp`,
  utilitario: `${MOBILE}/veiculo-utilitario.webp`,
}

export const PECA_SINTOMA: Readonly<Record<string, string>> = {
  ar: `${MOBILE}/manometro.webp`,
  pedal: `${MOBILE}/ocorrencia-freio-v2.webp`,
  travado: `${MOBILE}/freio-travado.webp`,
  chiado: `${MOBILE}/chiado-ar.webp`,
  quente: `${MOBILE}/roda-quente.webp`,
  partida: `${MOBILE}/ocorrencia-motor-v2.webp`,
  pneu: `${MOBILE}/ocorrencia-pneu-v2.webp`,
  painel: `${MOBILE}/alerta-painel.webp`,
  nao_sei: `${RAIZ}/outro.webp`,
}

export const ARTE3D = {
  /** Botão de socorro do início. O "SOS TECNOAR" entra por cima, em HTML. */
  botaoSOS: `${RAIZ}/botao-sos.webp`,
  /** Caminhão e viatura de socorro, o diorama inteiro: painel do especialista. */
  frota: `${RAIZ}/diorama.webp`,
  /**
   * O mesmo diorama cortado em faixa, com a base de terra desvanecida.
   * O início é uma coluna alta e apertada: na faixa baixa e larga de lá, o
   * diorama quadrado encolheria até não se enxergar o que está acontecendo.
   */
  frotaFaixa: `${RAIZ}/diorama-faixa.webp`,
  /** Cúpula de alcance com um pino dentro e outro fora: área de atendimento. */
  cobertura: `${RAIZ}/cobertura.webp`,
  pinoCliente: `${RAIZ}/pino-cliente.webp`,
  pinoEspecialista: `${RAIZ}/pino-especialista.webp`,
  chat: `${RAIZ}/chat.webp`,
  ligar: `${MOBILE}/ligar.webp`,
  /**
   * Abas e atalhos. Foram geradas com silhueta grossa e pouco detalhe de
   * propósito: elas aparecem a 24 px, e peça detalhada nesse tamanho vira
   * borrão. As outras do kit não servem aqui, nem estas lá.
   */
  casa: `${MOBILE}/nav-inicio-premium.webp`,
  veiculos: `${MOBILE}/nav-veiculos-premium.webp`,
  historico: `${MOBILE}/nav-historico-premium.webp`,
  conta: `${MOBILE}/nav-conta-premium.webp`,
  ia: `${MOBILE}/cerebro-dual-premium.webp`,
  revisoes: `${MOBILE}/revisoes.webp`,
  local: `${RAIZ}/local.webp`,
  estrela: `${RAIZ}/estrela.webp`,
  concluido: `${RAIZ}/concluido.webp`,
  tempo: `${RAIZ}/tempo.webp`,
  estrada: `${RAIZ}/estrada.webp`,
  seguranca: `${RAIZ}/seguranca.webp`,
} as const

/**
 * A peça de cada tipo de pane.
 *
 * Cobre todos os tipos que aparecem na escolha do pedido, para a fila inteira
 * ter o mesmo material — meia dúzia de peças renderizadas ao lado de ícones de
 * traço lê como erro, não como escolha.
 *
 * Acidente fica de fora de propósito: ele não é um quadradinho na grade, é a
 * primeira coisa da tela, com o 193 ao lado. Quem não tem peça cai no ícone de
 * traço sem a tela precisar saber disso.
 */
export const PECA_OCORRENCIA: Partial<Record<OcorrenciaSOS, string>> = {
  freios: `${MOBILE}/ocorrencia-freio-v2.webp`,
  nao_liga: `${MOBILE}/ocorrencia-motor-v2.webp`,
  mecanico: `${MOBILE}/ocorrencia-cambio-v2.webp`,
  pane_eletrica: `${MOBILE}/ocorrencia-bateria-v2.webp`,
  roda_pneu: `${MOBILE}/ocorrencia-pneu-v2.webp`,
  vazamento: `${MOBILE}/ocorrencia-vazamento-v2.webp`,
  parado: `${MOBILE}/ocorrencia-caminhao-v2.webp`,
  outro: `${MOBILE}/ocorrencia-outro-v2.webp`,
  desconhecido: `${MOBILE}/ocorrencia-outro-v2.webp`,
}

/** Esconde a arte que não carregou, em vez de deixar o ícone quebrado na tela. */
export function sumirSeFalhar(e: { currentTarget: HTMLImageElement }) {
  e.currentTarget.style.visibility = 'hidden'
}
