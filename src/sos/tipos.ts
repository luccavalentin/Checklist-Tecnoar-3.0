/**
 * Tipos do SOS Tecnoar — espelham `supabase/migrations/20260912_sos_tecnoar.sql`.
 *
 * Escritos à mão porque as tabelas `sos_*` ainda não estão em
 * `src/tipos/supabase.ts` (que é gerado a partir do banco). Quando a migração
 * for aplicada e os tipos regerados, estes continuam valendo: descrevem o
 * formato que as RPCs devolvem, não a tabela crua.
 */

export type StatusSOS =
  | 'solicitado'
  | 'recebido'
  | 'procurando_mecanico'
  | 'aceito'
  | 'a_caminho'
  | 'no_local'
  | 'servico_iniciado'
  | 'servico_finalizado'
  | 'concluido'
  | 'cancelado'

export type OcorrenciaSOS =
  | 'freios'
  | 'nao_liga'
  | 'mecanico'
  | 'pane_eletrica'
  | 'roda_pneu'
  | 'vazamento'
  | 'parado'
  | 'acidente'
  | 'desconhecido'
  | 'outro'

export type PrioridadeSOS = 'normal' | 'alta' | 'emergencia'
export type PapelSOS = 'cliente' | 'mecanico' | 'central' | 'sistema'
/** `mecanico`: aberto pelo próprio mecânico em campo, no app. */
export type OrigemSOS = 'app' | 'central' | 'ia' | 'whatsapp' | 'telefone' | 'mecanico'
export type SituacaoMecanico = 'disponivel' | 'em_atendimento' | 'indisponivel' | 'pausa' | 'offline'
export type TipoAnexo = 'foto' | 'audio' | 'video' | 'documento' | 'assinatura'
export type EtapaAnexo = 'abertura' | 'diagnostico' | 'antes' | 'depois' | 'conclusao' | 'outro'
export type TipoAgendamento = 'revisao' | 'manutencao' | 'orcamento' | 'outro'
export type StatusAgendamento = 'solicitado' | 'confirmado' | 'realizado' | 'cancelado'

export interface ChamadoSOS {
  id: string
  numero: number
  protocolo: string
  cliente_id: string
  veiculo_id: string | null
  conta_usuario_id: string | null
  aberto_por_equipe: string | null
  origem: OrigemSOS
  tipo_ocorrencia: OcorrenciaSOS
  descricao: string | null
  prioridade: PrioridadeSOS
  status: StatusSOS
  latitude: number | null
  longitude: number | null
  precisao_m: number | null
  endereco: string | null
  ponto_ajustado: boolean
  telefone_contato: string | null
  mecanico_id: string | null
  atribuido_em: string | null
  atribuido_por: string | null
  os_id: string | null
  diagnostico: string | null
  servico_realizado: string | null
  observacoes_finais: string | null
  pecas_utilizadas: string | null
  distancia_km: number | null
  eta_min: number | null
  recebido_em: string
  aceito_em: string | null
  a_caminho_em: string | null
  chegou_em: string | null
  iniciado_em: string | null
  finalizado_em: string | null
  concluido_em: string | null
  cancelado_em: string | null
  cancelado_por: string | null
  cancelado_por_papel: PapelSOS | null
  motivo_cancelamento: string | null
  tempo_aceite_seg: number | null
  tempo_deslocamento_seg: number | null
  tempo_servico_seg: number | null
  tempo_total_seg: number | null
  avaliacao_nota: number | null
  avaliacao_comentario: string | null
  avaliado_em: string | null
  contexto_ia: Record<string, unknown> | null
  /* Vigia do SOS (`sos_vigiar`, a cada 30 s no servidor). */
  /** Início da espera atual por um mecânico (zera ao atribuir ou voltar para a fila). */
  espera_desde?: string | null
  /** 0 = no prazo; 1 = aceite venceu; 2 = central acionada (3× o prazo); 3 = alerta máximo. */
  alerta_nivel?: number
  alerta_em?: string | null
  eta_inicial_min?: number | null
  /** Deslocamento passou muito da previsão (a central foi avisada). */
  atraso_avisado_em?: string | null
  /** Sem posição do mecânico há vários minutos (app provavelmente fechado). */
  sinal_avisado_em?: string | null
  /** Distância no aceite — base da taxa de deslocamento. */
  distancia_inicial_km?: number | null
  /* Orçamento enviado ao cliente pelo app. */
  orcamento_status?: StatusOrcamento | null
  orcamento_valor?: number | null
  orcamento_enviado_em?: string | null
  orcamento_respondido_em?: string | null
  /** Caminho da assinatura no bucket `sos` (aprovação pelo cliente). */
  orcamento_assinatura?: string | null
  orcamento_observacao?: string | null
  /** Itens mudaram depois da resposta: vale reenviar. */
  orcamento_desatualizado?: boolean
  /* Contrato de frotista: prazo de chegada combinado. */
  contrato_id?: string | null
  sla_chegada_min?: number | null
  sla_avisado_em?: string | null
  /* IA: kit sugerido ao mecânico e resumo técnico (JSON em texto). */
  ia_kit?: IaKit | null
  ia_resumo?: string | null
  created_at: string
  updated_at: string
  /** Presente quando `sos_abrir_chamado` devolveu um SOS que já estava aberto. */
  ja_existia?: boolean
}

/** Linha da lista da central (`sos_listar_chamados`). */
export interface ChamadoListado extends ChamadoSOS {
  cliente_nome: string
  placa: string | null
  veiculo: string | null
  mecanico_nome: string | null
  status_rotulo: string
  ocorrencia_rotulo: string
  os_numero: number | null
  mensagens_nao_lidas: number
}

export interface EventoSOS {
  id: string
  chamado_id: string
  tipo: string
  titulo: string
  descricao: string | null
  dados: Record<string, unknown> | null
  latitude: number | null
  longitude: number | null
  autor_id: string | null
  autor_papel: PapelSOS
  autor_nome: string | null
  ocorrido_em: string
}

export interface PosicaoSOS {
  id: number
  chamado_id: string
  autor_id: string
  papel: PapelSOS
  latitude: number
  longitude: number
  precisao_m: number | null
  velocidade_ms: number | null
  rumo: number | null
  registrado_em: string
}

export interface MensagemSOS {
  id: string
  chamado_id: string
  autor_id: string | null
  autor_papel: PapelSOS
  autor_nome: string | null
  texto: string | null
  midia_caminho: string | null
  midia_tipo: string | null
  rapida: boolean
  lida_em: string | null
  created_at: string
}

export interface ItemSOS {
  id: string
  chamado_id: string
  tipo: 'produto' | 'servico'
  produto_id: string | null
  servico_id: string | null
  codigo: string | null
  descricao: string
  unidade: string | null
  quantidade: number
  valor_unitario: number
  desconto: number
  valor_total: number
  os_item_id: string | null
  adicionado_por: string | null
  /** 'deslocamento' = lançado sozinho na chegada (taxa por km). */
  origem?: 'manual' | 'deslocamento' | 'ia'
  created_at: string
}

export type StatusOrcamento = 'pendente' | 'aprovado' | 'recusado'

/** `sos_contratos` — frotista com prazo de chegada e preço de km próprios. */
export interface ContratoSOS {
  id: string
  cliente_id: string
  nome: string
  prazo_chegada_min: number | null
  prioridade: PrioridadeSOS
  valor_km: number | null
  taxa_minima: number | null
  vigencia_inicio: string | null
  vigencia_fim: string | null
  ativo: boolean
  observacoes: string | null
  created_at: string
  updated_at: string
}

/** `sos_listar_contratos` — com os números dos últimos 30 dias. */
export interface ContratoListado extends ContratoSOS {
  cliente_nome: string
  chamados_30d: number
  no_prazo_30d: number
  com_chegada_30d: number
}

/** `sos_vigia_status` — saúde do vigia (pg_cron). */
export interface VigiaStatus {
  ok: boolean
  agendado?: boolean
  agenda?: string | null
  ultima?: { inicio: string; fim: string | null; status: string; mensagem: string | null } | null
  falhas_1h?: number
}

/* ── IA do SOS (função `sos-ia`) ─────────────────────────────────────────── */

/** `sos_ia_publico` — o que o app pode saber: se a IA está ligada e para quê. */
export interface IaPublico {
  ativa: boolean
  atendimento: boolean
  foto: boolean
  kit: boolean
  resumo: boolean
}

export type ProvedorIa = 'anthropic' | 'openai' | 'gemini'

export interface MensagemIa {
  papel: 'usuario' | 'assistente'
  texto: string
}

export interface SugestaoSosIa {
  tipo_ocorrencia: OcorrenciaSOS
  prioridade: PrioridadeSOS
  descricao: string
}

export interface SugestaoAgendamentoIa {
  tipo: TipoAgendamento
  descricao: string
}

export interface RespostaIaAtendimento {
  texto: string
  sugestao_sos: SugestaoSosIa | null
  sugestao_agendamento: SugestaoAgendamentoIa | null
}

/** Kit que a IA sugere levar: peças já conferidas no catálogo do Checklist. */
export interface IaKit {
  resumo: string
  hipoteses: string[]
  ferramentas: string[]
  cuidados: string[]
  pecas: Array<{ termo: string; motivo: string; itens: ItemCatalogo[] }>
  gerado_em: string
  modelo: string
}

export interface IaResumo {
  diagnostico: string
  servico_realizado: string
  observacoes: string
}

export interface AnexoSOS {
  id: string
  chamado_id: string
  caminho: string
  tipo: TipoAnexo
  etapa: EtapaAnexo
  legenda: string | null
  tamanho_bytes: number | null
  autor_id: string | null
  autor_papel: PapelSOS
  created_at: string
}

/**
 * Item do cadastro de produtos e serviços do sistema Tecnoar (o mesmo do
 * Checklist, sincronizado com a Omie). Estoque de produto:
 * `disponivel = saldo (Omie) − reservado (Omie) − comprometido (Tecnoar)`,
 * onde comprometido = peças em OS aberta + peças lançadas em chamado SOS que
 * ainda não entraram em OS. Serviço não tem estoque (campos nulos).
 */
export interface ItemCatalogo {
  tipo: 'produto' | 'servico'
  id: string
  codigo: string | null
  descricao: string
  unidade: string | null
  preco: number | null
  saldo: number | null
  reservado: number | null
  comprometido: number | null
  disponivel: number | null
  /** Última sincronização do estoque com a Omie. */
  estoque_em: string | null
}

/** Ficha completa do produto (cadastro do sistema, espelho da Omie). */
export interface ProdutoDetalhe {
  id: string
  codigo: string | null
  descricao: string
  descricao_detalhada: string | null
  referencia: string | null
  ean: string | null
  ncm: string | null
  marca: string | null
  modelo: string | null
  familia: string | null
  unidade: string | null
  tipo_item: string | null
  localizacao: string | null
  local_estoque_omie: string | null
  fornecedor: string | null
  observacoes: string | null
  peso_liquido: number | null
  peso_bruto: number | null
  preco_venda: number | null
  /** Só para quem pode editar produtos. */
  custo_medio: number | null
  preco_custo: number | null
  saldo: number | null
  fisico: number | null
  reservado: number | null
  pendente: number | null
  estoque_minimo: number | null
  comprometido: number | null
  disponivel: number | null
  situacao: string
  bloqueado: boolean
  origem: string | null
  omie_id: string | null
  sincronizado_em: string | null
}

/** Conferência do produto na Omie feita na hora (função `omie-produto`). */
export interface ProdutoAoVivo {
  ok: boolean
  omie: boolean
  atualizado?: boolean
  imagens?: string[]
  garantia_dias?: number | null
  aviso?: string | null
}

/** Retorno de lançar peça: o disponível antes e se faltou estoque. */
export interface ResultadoEstoque {
  disponivel_antes: number
  faltou: boolean
}

/* ── OS do sistema Tecnoar vista pelo app do mecânico ─────────────────────── */

/** Estado da peça na OS: reservada (havia estoque), necessária (faltou) ou já usada. */
export type EstadoPecaOS = 'reservado' | 'necessario' | 'utilizado' | 'solicitado' | string

export interface OSResumoApp {
  id: string
  numero: number
  aberta_em: string
  encerrada_em: string | null
  status: string | null
  status_cor: string | null
  cliente: string
  placa: string
  veiculo: string | null
  valor_total: number | null
  problema: string | null
  itens: number
  /** Peças lançadas sem estoque. */
  faltando: number
  chamado_id: string | null
  protocolo: string | null
}

export interface MinhasOSApp {
  pode_criar: boolean
  lista: OSResumoApp[]
}

export interface ProdutoOSApp {
  id: string
  produto_id: string | null
  codigo: string | null
  descricao: string
  unidade: string | null
  quantidade: number
  valor_unitario: number
  valor_total: number | null
  estado: EstadoPecaOS
  aprovacao: string | null
  disponivel: number | null
  /** Veio de um chamado SOS (alterar/remover passa pelo chamado). */
  do_socorro: boolean
}

export interface ServicoOSApp {
  id: string
  servico_id: string | null
  codigo: string | null
  descricao: string
  quantidade: number
  valor_unitario: number
  valor_total: number | null
  aprovacao: string | null
  do_socorro: boolean
}

export interface DetalheOSApp {
  os: {
    id: string
    numero: number
    aberta_em: string
    encerrada_em: string | null
    km: number | null
    problema: string | null
    diagnostico: string | null
    observacoes: string | null
    valor_produtos: number | null
    valor_servicos: number | null
    desconto: number | null
    acrescimo: number | null
    valor_total: number | null
    status: { nome: string; cor: string | null } | null
  }
  cliente: { id: string; nome: string; telefone: string | null } | null
  veiculo: { id: string; placa: string; marca: string | null; modelo: string | null; ano: number | null; km_atual: number | null } | null
  produtos: ProdutoOSApp[]
  servicos: ServicoOSApp[]
  chamado: { id: string; protocolo: string; status: StatusSOS } | null
  pode_editar: boolean
}

export interface VeiculoParaOS {
  id: string
  placa: string
  veiculo: string | null
  cliente_id: string
  cliente: string
  /** Número da OS já aberta para o veículo (evita duplicar). */
  os_aberta: number | null
}

/**
 * Pedido de OS aberta no app do mecânico. Cliente: `cliente_id` OU
 * nome + celular (+ CPF/CNPJ) para cadastrar na hora. Veículo: `veiculo_id`
 * OU placa (+ descrição).
 */
export interface NovaOSApp {
  cliente_id?: string
  cliente_nome?: string
  telefone?: string | null
  documento?: string | null
  veiculo_id?: string
  placa?: string
  veiculo_descricao?: string | null
  km?: string | null
  problema: string
}

export interface OSAbertaApp {
  id: string
  numero: number
  cliente_id: string
  veiculo_id: string
  cliente_novo: boolean
}

/** OS aberta do mesmo cliente/veículo, para ligar ao chamado em vez de abrir outra. */
export interface OSParaVincular {
  id: string
  numero: number
  aberta_em: string
  problema: string | null
  placa: string
  status: string | null
  status_cor: string | null
  valor_total: number | null
}

/** Cliente achado pelo mecânico em campo (nome, telefone, documento ou placa). */
export interface ClienteCampo {
  id: string
  nome: string
  telefone: string | null
  veiculos: Array<{
    id: string
    placa: string
    veiculo: string | null
    km_atual: number | null
    os_aberta: { id: string; numero: number } | null
  }>
}

/** Chamado aberto pelo próprio mecânico (cliente parou, ligou direto, achou na estrada). */
export interface NovoChamadoMecanico {
  cliente_id?: string | null
  cliente_nome?: string | null
  telefone?: string | null
  veiculo_id?: string | null
  placa?: string | null
  veiculo_descricao?: string | null
  tipo_ocorrencia: OcorrenciaSOS
  descricao: string
  latitude?: number | null
  longitude?: number | null
  precisao_m?: number | null
  endereco?: string | null
  /** Ponto marcado à mão no mapa (sem a precisão do GPS). */
  ponto_ajustado?: boolean
  /** true: já está com o cliente; false: vai até ele (informe a posição do mecânico). */
  ja_no_local: boolean
  mecanico_lat?: number | null
  mecanico_lng?: number | null
  /** Abre uma OS nova junto (precisa de veículo). */
  gerar_os?: boolean
  /** Liga a uma OS já aberta do cliente em vez de abrir outra. */
  os_id?: string | null
}

export interface FichaMecanico {
  usuario_id: string
  aceita_sos: boolean
  situacao: SituacaoMecanico
  disponivel: boolean
  latitude: number | null
  longitude: number | null
  precisao_m: number | null
  posicao_em: string | null
  veiculo_apoio: string | null
  telefone_contato: string | null
  mostrar_telefone: boolean
  chamado_atual_id: string | null
  situacao_em: string
  updated_at: string
}

/** `sos_mecanicos_mapa` — para o mapa e a lista da central. */
export interface MecanicoMapa {
  usuario_id: string
  nome: string
  avatar_url: string | null
  situacao: SituacaoMecanico
  aceita_sos: boolean
  latitude: number | null
  longitude: number | null
  posicao_em: string | null
  chamado_atual_id: string | null
  veiculo_apoio: string | null
  telefone: string | null
  especialidades: string | null
  /** Último pulso do app do mecânico (o app aberto avisa a cada minuto). */
  visto_em?: string | null
}

/** `sos_sugerir_mecanicos` — despacho inteligente. */
export interface SugestaoMecanico {
  usuario_id: string
  nome: string
  avatar_url: string | null
  funcao: string | null
  especialidades: string | null
  situacao: SituacaoMecanico
  disponivel: boolean
  aceita_sos: boolean
  em_atendimento: boolean
  chamado_atual_id: string | null
  distancia_km: number | null
  eta_min: number | null
  posicao_em: string | null
  telefone: string | null
  afinidade: boolean
  atendimentos_hoje: number
  nota_media: number | null
  recusou: boolean
  pontuacao: number
}

/** Conta de cliente do app (a própria, ou a de alguém da equipe no modo cliente). */
export interface ContaClienteSOS {
  usuario_id: string
  nome: string
  telefone: string | null
  email: string | null
  cliente_id: string | null
  veiculo_principal_id: string | null
  aceite_termos_em: string | null
  aceite_localizacao_em: string | null
}

/** `sos_meu_papel` — quem está usando o app. */
export type MeuPapelSOS =
  | { papel: 'anonimo' }
  | { papel: 'novo'; nome: string | null; email: string | null }
  | { papel: 'equipe_pendente'; nome: string | null }
  | ({ papel: 'cliente' } & ContaClienteSOS)
  | {
      papel: 'mecanico' | 'equipe'
      central: boolean
      usuario_id: string
      nome: string
      avatar_url: string | null
      telefone: string | null
      email?: string | null
      mecanico: FichaMecanico | null
      /** A mesma pessoa também tem conta de cliente (modo cliente do app). */
      cliente?: ContaClienteSOS | null
    }

export interface VeiculoResumo {
  id: string
  placa: string
  marca: string | null
  modelo: string | null
  ano: number | null
  km_atual: number | null
  descricao: string | null
  tipo: string | null
}

export interface HomeCliente {
  ok: boolean
  nome: string
  veiculo: VeiculoResumo | null
  total_veiculos: number
  ultimo_servico: {
    os_id: string
    numero: number
    em: string
    km: number | null
    servicos: string | null
    status: string | null
    encerrada: boolean
  } | null
  veiculo_na_oficina: boolean
  proxima_revisao: { id: string; titulo: string; mensagem: string | null; vence_em: string | null; vence_km: number | null } | null
  chamado_ativo: ChamadoSOS | null
  pendente_avaliacao: ChamadoSOS | null
  agendamentos_abertos: number
  lembretes: number
}

export type ItemHistorico =
  | {
      tipo: 'os'
      id: string
      numero: number
      em: string
      veiculo_id: string | null
      placa: string | null
      veiculo: string | null
      km: number | null
      problema: string | null
      diagnostico: string | null
      status: string | null
      status_cor: string | null
      encerrada: boolean
      valor_total: number | null
      servicos: Array<{ descricao: string; quantidade: number; valor: number | null }> | null
      produtos: Array<{ descricao: string; quantidade: number; valor: number | null }> | null
      mecanicos: string | null
      sos_protocolo: string | null
      sos_id: string | null
    }
  | {
      tipo: 'sos'
      id: string
      protocolo: string
      em: string
      status: StatusSOS
      status_rotulo: string
      veiculo_id: string | null
      placa: string | null
      veiculo: string | null
      ocorrencia: OcorrenciaSOS
      ocorrencia_rotulo: string
      diagnostico: string | null
      servico: string | null
      mecanico: string | null
      os_id: string | null
      nota: number | null
    }

export interface ChamadoResumoCliente extends ChamadoSOS {
  placa: string | null
  veiculo: string | null
  status_rotulo: string
  ocorrencia_rotulo: string
  mecanico_nome: string | null
}

/** `sos_detalhe_chamado` — a tela de um chamado numa ida só. */
export interface DetalheChamado {
  chamado: ChamadoSOS & { status_rotulo: string; ocorrencia_rotulo: string }
  papel: 'cliente' | 'mecanico' | 'central' | 'mecanico_candidato'
  cliente: { id: string; nome: string; telefone: string | null } | null
  veiculo: {
    id: string
    placa: string
    marca: string | null
    modelo: string | null
    ano: number | null
    descricao: string | null
    tipo: string | null
    km_atual: number | null
  } | null
  mecanico: {
    id: string
    nome: string
    avatar_url: string | null
    telefone: string | null
    veiculo_apoio: string | null
    latitude: number | null
    longitude: number | null
    posicao_em: string | null
    nota: number | null
    atendimentos: number
  } | null
  os: { id: string; numero: number; status: string | null; status_cor: string | null; valor_total: number | null; encerrada_em: string | null } | null
  eventos: EventoSOS[]
  itens: ItemSOS[]
  anexos: AnexoSOS[]
  mensagens: MensagemSOS[]
  ultima_posicao_mecanico: PosicaoSOS | null
  ultima_posicao_cliente: PosicaoSOS | null
}

export interface HomeMecanico {
  ok: boolean
  nome: string
  ficha: FichaMecanico | null
  chamado_atual: (ChamadoSOS & { status_rotulo: string; ocorrencia_rotulo: string; cliente_nome: string; placa: string | null }) | null
  aguardando: Array<
    ChamadoSOS & {
      ocorrencia_rotulo: string
      cliente_nome: string
      placa: string | null
      veiculo: string | null
      distancia_km: number | null
      para_mim: boolean
      recusei: boolean
    }
  >
  hoje: { atendimentos: number; concluidos: number; nota_media: number | null }
  historico: Array<{
    id: string
    protocolo: string
    status: StatusSOS
    status_rotulo: string
    ocorrencia_rotulo: string
    cliente_nome: string
    placa: string | null
    recebido_em: string
    finalizado_em: string | null
    nota: number | null
  }>
}

export interface IndicadoresSOS {
  ok: boolean
  aguardando: number
  aguardando_mecanico: number
  aceitos: number
  a_caminho: number
  no_local: number
  em_servico: number
  finalizados_periodo: number
  cancelados_periodo: number
  abertos_periodo: number
  aguardando_mais_antigo: string | null
  tempo_medio_aceite_seg: number | null
  tempo_medio_deslocamento_seg: number | null
  tempo_medio_servico_seg: number | null
  tempo_medio_total_seg: number | null
  nota_media: number | null
  avaliacoes: number
  mecanicos: Record<SituacaoMecanico, number>
  mecanicos_disponiveis: number
  mecanicos_em_atendimento: number
  agendamentos_pendentes: number
  por_ocorrencia: Partial<Record<OcorrenciaSOS, number>>
  por_mecanico: Array<{ mecanico_id: string; nome: string; atendimentos: number; nota_media: number | null }>
}

export interface ConfigSOS {
  modo_distribuicao: 'manual' | 'inteligente'
  raio_busca_km: number
  velocidade_media_kmh: number
  tempo_aceite_seg: number
  telefone_central: string | null
  whatsapp_ativo: boolean
  whatsapp_url: string | null
  whatsapp_instancia: string | null
  whatsapp_destinos: string[]
  whatsapp_apikey_definida: boolean
  mensagem_espera: string
  lembrete_meses: number
  lembrete_km: number
  cancelamento_cliente_ate: StatusSOS
  gerar_os_ao_finalizar: boolean
  /** "Disponível" sem sinal do app por este tempo vira offline (0 = nunca). */
  offline_apos_min?: number
  /** Serviço finalizado sem avaliação é concluído depois destas horas. */
  concluir_apos_horas?: number
  /* Atendimento premium. */
  exigir_aprovacao_orcamento?: boolean
  deslocamento_ativo?: boolean
  deslocamento_valor_km?: number
  deslocamento_taxa_minima?: number
  deslocamento_ida_volta?: boolean
  deslocamento_servico_id?: string | null
  /* IA do SOS — a chave nunca volta; só `ia_apikey_definida`. */
  ia_ativa?: boolean
  ia_provedor?: ProvedorIa
  ia_modelo?: string
  ia_usar_chave_tecnoar_ia?: boolean
  ia_instrucoes?: string | null
  ia_atendimento?: boolean
  ia_foto?: boolean
  ia_kit?: boolean
  ia_resumo?: boolean
  ia_limite_cliente_dia?: number
  ia_apikey_definida?: boolean
  /** Chaves da Tecnoar IA (colaboradores) que o SOS pode reaproveitar. */
  tecnoar_ia_provedores?: Array<{ provedor: ProvedorIa; modelo: string | null; conectada: boolean }>
  ia_uso_30d?: { respostas: number; erros: number; tokens_entrada: number; tokens_saida: number }
  updated_at: string
}

export interface AgendamentoSOS {
  id: string
  cliente_id: string
  veiculo_id: string | null
  conta_usuario_id: string | null
  tipo: TipoAgendamento
  descricao: string | null
  data_preferida: string | null
  periodo: 'manha' | 'tarde' | 'qualquer' | null
  status: StatusAgendamento
  data_confirmada: string | null
  observacoes_equipe: string | null
  os_id: string | null
  atendido_por: string | null
  created_at: string
  updated_at: string
}

export interface LembreteSOS {
  id: string
  cliente_id: string
  veiculo_id: string | null
  chave: string
  tipo: 'tempo' | 'km' | 'item'
  titulo: string
  mensagem: string | null
  vence_em: string | null
  vence_km: number | null
  origem_os_id: string | null
  lido_em: string | null
  dispensado_em: string | null
  created_at: string
}

export interface InfoPublicaSOS {
  empresa: string
  telefone: string | null
  whatsapp: string | null
  politica_privacidade_url: string | null
  mensagem_espera: string | null
  cancelamento_cliente_ate: StatusSOS | null
}

export interface ClienteBusca {
  cliente_id: string
  nome: string
  documento: string | null
  celular: string | null
  veiculos: Array<{ id: string; placa: string; descricao: string }> | null
}

export interface ContaApp {
  usuario_id: string
  nome: string
  telefone: string | null
  email: string | null
  cliente_id: string | null
  cliente_nome: string | null
  created_at: string
  ultimo_acesso: string | null
  chamados: number
  veiculos: number
}

export interface AcompanhamentoPublico {
  ok: boolean
  motivo?: string
  protocolo: string
  status: StatusSOS
  status_rotulo: string
  eta_min: number | null
  distancia_km: number | null
  mecanico: string
  veiculo: string | null
  cliente_lat: number | null
  cliente_lng: number | null
  mecanico_lat: number | null
  mecanico_lng: number | null
  posicao_em: string | null
  recebido_em: string
  aceito_em: string | null
  chegou_em: string | null
  finalizado_em: string | null
  concluido_em: string | null
  cancelado_em: string | null
  expira_em: string
}

/** Dados do pedido de SOS montados no aparelho antes de enviar. */
export interface NovoChamado {
  veiculo_id?: string | null
  placa?: string | null
  veiculo_descricao?: string | null
  cliente_id?: string | null
  tipo_ocorrencia: OcorrenciaSOS
  descricao?: string | null
  prioridade?: PrioridadeSOS
  latitude?: number | null
  longitude?: number | null
  precisao_m?: number | null
  endereco?: string | null
  ponto_ajustado?: boolean
  telefone_contato?: string | null
  origem?: OrigemSOS
  contexto_ia?: Record<string, unknown> | null
}

/** `sos_relatorio` — visão gerencial de um período. */
export interface RelatorioSOS {
  ok: boolean
  inicio: string
  fim: string
  total: number
  concluidos: number
  cancelados: number
  em_aberto: number
  emergencias: number
  os_geradas: number
  valor_itens: number
  aceite_no_prazo_pct: number | null
  tempo_medio_aceite_seg: number | null
  tempo_medio_deslocamento_seg: number | null
  tempo_medio_servico_seg: number | null
  tempo_medio_total_seg: number | null
  nota_media: number | null
  avaliacoes: number
  por_dia: Array<{ dia: string; total: number; concluidos: number }>
  por_hora: Record<string, number>
  por_ocorrencia: Partial<Record<OcorrenciaSOS, number>>
  por_origem: Partial<Record<OrigemSOS, number>>
  por_mecanico: Array<{
    mecanico_id: string
    nome: string
    atendimentos: number
    concluidos: number
    cancelados: number
    tempo_medio_aceite_seg: number | null
    tempo_medio_deslocamento_seg: number | null
    tempo_medio_servico_seg: number | null
    nota_media: number | null
    recusas: number
    valor_itens: number
  }>
  por_cliente: Array<{ cliente_id: string; nome: string; chamados: number; valor_itens: number }>
  itens: Array<{
    tipo: 'produto' | 'servico'
    produto_id: string | null
    servico_id: string | null
    codigo: string | null
    descricao: string
    quantidade: number
    valor_total: number
    chamados: number
  }>
  motivos_cancelamento: Array<{ motivo: string; papel: PapelSOS | null; n: number }>
  /** Total cobrado como taxa de deslocamento no período. */
  valor_deslocamento?: number
  orcamentos?: { enviados: number; aprovados: number; recusados: number }
  /** Chamados de contrato com chegada registrada, e quantos no prazo. */
  sla?: { com_prazo: number; no_prazo: number }
  /** Mapa de calor: pontos agregados (~1 km) com a contagem de SOS. */
  pontos?: Array<{ lat: number; lng: number; n: number; emergencias: number }>
}
