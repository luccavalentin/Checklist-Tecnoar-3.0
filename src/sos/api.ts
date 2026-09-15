import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type {
  AcompanhamentoPublico,
  AgendamentoSOS,
  ChamadoListado,
  ChamadoResumoCliente,
  ChamadoSOS,
  ClienteBusca,
  ClienteCampo,
  DetalheOSApp,
  MinhasOSApp,
  NovoChamadoMecanico,
  OSParaVincular,
  ResultadoEstoque,
  VeiculoParaOS,
  ConfigSOS,
  ContaApp,
  ContratoListado,
  ContratoSOS,
  IaKit,
  IaPublico,
  IaResumo,
  MensagemIa,
  RespostaIaAtendimento,
  VigiaStatus,
  DetalheChamado,
  EtapaAnexo,
  FichaMecanico,
  HomeCliente,
  HomeMecanico,
  IndicadoresSOS,
  InfoPublicaSOS,
  ItemCatalogo,
  ProdutoAoVivo,
  ProdutoDetalhe,
  ItemHistorico,
  ItemSOS,
  LembreteSOS,
  MecanicoMapa,
  MeuPapelSOS,
  NovoChamado,
  RelatorioSOS,
  SituacaoMecanico,
  StatusAgendamento,
  StatusSOS,
  SugestaoMecanico,
  TipoAgendamento,
  TipoAnexo,
  NovaOSApp,
  OSAbertaApp,
} from './tipos'

/**
 * Acesso ao SOS Tecnoar.
 *
 * Toda regra de estado mora no banco (RPCs `security definer`); aqui só há o
 * transporte e os tipos. As funções `sos_*` ainda não estão no tipo gerado
 * `Database`, então o cliente é usado sem tipagem de esquema neste arquivo —
 * e só neste arquivo: o resto do código recebe os tipos de `./tipos`.
 */
const db = supabase as unknown as SupabaseClient

export const BUCKET_SOS = 'sos'

async function rpc<T>(nome: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(nome, args ?? {})
  if (error) throw traduzirErro(error)
  return data as T
}

/**
 * A RPC ainda não existe no banco quando a migração não foi aplicada; a
 * mensagem crua do PostgREST ("Could not find the function…") não ajuda
 * ninguém na oficina.
 */
function traduzirErro(error: { message?: string; code?: string; details?: string }): Error {
  const msg = error.message ?? 'Erro desconhecido'
  if (error.code === 'PGRST202' || /could not find the function/i.test(msg)) {
    return new Error('O SOS Tecnoar ainda não foi ativado no banco de dados. Aplique a migração do SOS.')
  }
  if (/row-level security|permission denied/i.test(msg)) return new Error('Sem permissão para esta ação.')
  if (/jwt|wrong key type|invalid token|refresh token/i.test(msg)) return new Error('Sua sessão expirou. Entre de novo na sua conta.')
  // Chrome diz "Failed to fetch"; o Safari do iPhone, "Load failed".
  if (/failed to fetch|load failed|network|tempo esgotado|timed? ?out|aborted/i.test(msg)) {
    return new Error('Sem conexão. Verifique a internet e tente de novo.')
  }
  return new Error(msg)
}

/* ── identidade ─────────────────────────────────────────────────────────── */

export const sosMeuPapel = () => rpc<MeuPapelSOS>('sos_meu_papel')

export const sosRegistrarConta = (p: {
  nome: string
  telefone: string
  documento?: string | null
  email?: string | null
  aceiteTermos?: boolean
}) =>
  rpc<MeuPapelSOS>('sos_registrar_conta', {
    p_nome: p.nome,
    p_telefone: p.telefone,
    p_documento: p.documento ?? null,
    p_email: p.email ?? null,
    p_aceite_termos: p.aceiteTermos ?? true,
  })

export const sosAtualizarConta = (p: {
  nome?: string | null
  telefone?: string | null
  veiculoPrincipal?: string | null
  aceiteLocalizacao?: boolean | null
}) =>
  rpc<MeuPapelSOS>('sos_atualizar_conta', {
    p_nome: p.nome ?? null,
    p_telefone: p.telefone ?? null,
    p_veiculo_principal: p.veiculoPrincipal ?? null,
    p_aceite_localizacao: p.aceiteLocalizacao ?? null,
  })

export const sosCadastrarVeiculo = (placa: string, descricao?: string | null, tipo?: string | null) =>
  rpc<string>('sos_cadastrar_veiculo', { p_placa: placa, p_descricao: descricao ?? null, p_tipo: tipo ?? null })

export const sosInfoPublica = () => rpc<InfoPublicaSOS>('sos_info_publica')

/* ── chamado ────────────────────────────────────────────────────────────── */

export const sosAbrirChamado = (p: NovoChamado) => rpc<ChamadoSOS>('sos_abrir_chamado', { p })

export const sosDetalhe = (chamadoId: string) => rpc<DetalheChamado>('sos_detalhe_chamado', { p_chamado: chamadoId })

export const sosAceitar = (chamadoId: string, lat?: number | null, lng?: number | null) =>
  rpc<ChamadoSOS>('sos_aceitar', { p_chamado: chamadoId, p_lat: lat ?? null, p_lng: lng ?? null })

export const sosRecusar = (chamadoId: string, motivo?: string | null) =>
  rpc<void>('sos_recusar', { p_chamado: chamadoId, p_motivo: motivo ?? null })

export const sosAtribuir = (chamadoId: string, mecanicoId: string, confirmar = false) =>
  rpc<ChamadoSOS>('sos_atribuir', { p_chamado: chamadoId, p_mecanico: mecanicoId, p_confirmar: confirmar })

export const sosAvancar = (
  chamadoId: string,
  status: StatusSOS,
  opcoes?: { lat?: number | null; lng?: number | null; dados?: Record<string, unknown> },
) =>
  rpc<ChamadoSOS>('sos_avancar', {
    p_chamado: chamadoId,
    p_status: status,
    p_lat: opcoes?.lat ?? null,
    p_lng: opcoes?.lng ?? null,
    p_dados: opcoes?.dados ?? {},
  })

export const sosSalvarAtendimento = (
  chamadoId: string,
  dados: { diagnostico?: string | null; servico_realizado?: string | null; observacoes?: string | null },
) => rpc<ChamadoSOS>('sos_salvar_atendimento', { p_chamado: chamadoId, p_dados: dados })

export const sosCancelar = (chamadoId: string, motivo: string) =>
  rpc<ChamadoSOS>('sos_cancelar', { p_chamado: chamadoId, p_motivo: motivo })

export const sosRegistrarPosicao = (
  chamadoId: string,
  p: { lat: number; lng: number; precisao?: number | null; velocidade?: number | null; rumo?: number | null },
) =>
  rpc<{ ok: boolean; distancia_km: number | null; eta_min: number | null; motivo?: string }>('sos_registrar_posicao', {
    p_chamado: chamadoId,
    p_lat: p.lat,
    p_lng: p.lng,
    p_precisao: p.precisao ?? null,
    p_velocidade: p.velocidade ?? null,
    p_rumo: p.rumo ?? null,
  })

export const sosGerarOS = (chamadoId: string) => rpc<string>('sos_gerar_os', { p_chamado: chamadoId })

/** Quilometragem lida no painel, em campo: vai para o veículo e para a OS do chamado. */
export const sosRegistrarKm = (chamadoId: string, km: number) => rpc<number>('sos_registrar_km', { p_chamado: chamadoId, p_km: km })

/** Liga o chamado a uma OS aberta do mesmo cliente; os itens do chamado vão junto. */
export const sosVincularOS = (chamadoId: string, osId: string) =>
  rpc<void>('sos_vincular_os', { p_chamado: chamadoId, p_os: osId })

/** OS abertas do cliente/veículo do chamado — para ligar em vez de abrir outra. */
export const sosOSParaVincular = (chamadoId: string) =>
  rpc<OSParaVincular[]>('sos_os_para_vincular', { p_chamado: chamadoId })

/* ── mecânico em campo: abre o próprio chamado ─────────────────────────── */

export const sosBuscarClienteCampo = (termo: string) => rpc<ClienteCampo[]>('sos_buscar_cliente_campo', { p_termo: termo })

export const sosMecanicoAbrirChamado = (p: NovoChamadoMecanico) => rpc<ChamadoSOS>('sos_mecanico_abrir_chamado', { p })

/* ── OS do sistema Tecnoar no app do mecânico ──────────────────────────── */

export const sosMinhasOS = (situacao: 'abertas' | 'encerradas' = 'abertas') =>
  rpc<MinhasOSApp>('sos_minhas_os', { p_situacao: situacao, p_limite: 40 })

export const sosOSDetalhe = (osId: string) => rpc<DetalheOSApp>('sos_os_detalhe', { p_os: osId })

/** OS ligada a socorro aberto: o item entra pelo chamado (os dois lados iguais). */
export const sosOSAdicionarItem = (osId: string, tipo: 'produto' | 'servico', refId: string, quantidade = 1) =>
  rpc<{ id: string; estoque?: ResultadoEstoque }>('sos_os_adicionar_item', {
    p_os: osId,
    p_tipo: tipo,
    p_ref: refId,
    p_quantidade: quantidade,
  })

/** Quantidade 0 remove o item. */
export const sosOSAlterarItem = (osId: string, itemId: string, quantidade: number) =>
  rpc<void>('sos_os_alterar_item', { p_os: osId, p_item: itemId, p_quantidade: quantidade })

export const sosOSAtualizar = (
  osId: string,
  dados: { km?: number | null; diagnostico?: string | null; observacoes?: string | null },
) =>
  rpc<DetalheOSApp>('sos_os_atualizar', {
    p_os: osId,
    p_km: dados.km ?? null,
    p_diagnostico: dados.diagnostico ?? null,
    p_observacoes: dados.observacoes ?? null,
  })

/** Só para quem tem permissão de abrir OS (`pode_criar` em `sosMinhasOS`). */
export const sosOSBuscarVeiculo = (placa: string) => rpc<VeiculoParaOS[]>('sos_os_buscar_veiculo', { p_placa: placa })

export const sosOSCriar = (veiculoId: string, problema: string) =>
  rpc<string>('sos_os_criar', { p_veiculo: veiculoId, p_problema: problema })

/**
 * Abre OS com cliente escolhido da busca ou cadastrado na hora (na tabela
 * `clientes` do Checklist) e veículo escolhido ou informado pela placa.
 */
export const sosOSAbrir = (p: NovaOSApp) => rpc<OSAbertaApp>('sos_os_abrir', { p })

export const sosAvaliar = (chamadoId: string, nota: number, comentario?: string | null) =>
  rpc<ChamadoSOS>('sos_avaliar', { p_chamado: chamadoId, p_nota: nota, p_comentario: comentario ?? null })

export const sosCompartilhar = (chamadoId: string, horas = 12) =>
  rpc<string>('sos_compartilhar', { p_chamado: chamadoId, p_horas: horas })

export const sosAcompanhar = (token: string) => rpc<AcompanhamentoPublico>('sos_acompanhar', { p_token: token })

export const sosEnviarMensagem = (
  chamadoId: string,
  texto: string,
  opcoes?: { midiaCaminho?: string | null; midiaTipo?: string | null; rapida?: boolean },
) =>
  rpc<string>('sos_enviar_mensagem', {
    p_chamado: chamadoId,
    p_texto: texto,
    p_midia_caminho: opcoes?.midiaCaminho ?? null,
    p_midia_tipo: opcoes?.midiaTipo ?? null,
    p_rapida: opcoes?.rapida ?? false,
  })

export const sosMarcarMensagensLidas = (chamadoId: string) =>
  rpc<void>('sos_marcar_mensagens_lidas', { p_chamado: chamadoId })

/* ── atendimento: catálogo do Checklist e mídia ─────────────────────────── */

/**
 * Cadastro de produtos e serviços do sistema Tecnoar. Termo vazio lista o
 * catálogo inteiro, em páginas (`pagina` começa em 0).
 */
export const sosCatalogo = (termo: string, tipo?: 'produto' | 'servico' | null, pagina = 0, porPagina = 30) =>
  rpc<ItemCatalogo[]>('sos_catalogo', { p_termo: termo, p_tipo: tipo ?? null, p_limite: porPagina, p_offset: pagina * porPagina })

/** Ficha do produto com o que está no cadastro agora. */
export const sosProdutoDetalhe = (id: string) => rpc<ProdutoDetalhe>('sos_produto_detalhe', { p_id: id })

/** Confere o produto na Omie na hora e atualiza o cadastro (fotos voltam só aqui). */
export async function sosProdutoAoVivo(id: string): Promise<ProdutoAoVivo> {
  const { data, error } = await supabase.functions.invoke('omie-produto', { body: { produto_id: id } })
  if (error) return { ok: false, omie: false, aviso: 'Não foi possível conferir na Omie agora.' }
  return data as ProdutoAoVivo
}

/** Lança no chamado. Produto: devolve também o estoque (se faltou, a central é avisada). */
export const sosAdicionarItem = (chamadoId: string, tipo: 'produto' | 'servico', refId: string, quantidade = 1) =>
  rpc<ItemSOS & { estoque?: ResultadoEstoque }>('sos_adicionar_item', {
    p_chamado: chamadoId,
    p_tipo: tipo,
    p_ref: refId,
    p_quantidade: quantidade,
  })

export const sosAlterarItem = (itemId: string, quantidade: number) =>
  rpc<void>('sos_alterar_item', { p_item: itemId, p_quantidade: quantidade })

export const sosRemoverItem = (itemId: string) => rpc<void>('sos_remover_item', { p_item: itemId })

/**
 * Envia um arquivo do chamado (foto, áudio, vídeo, assinatura) e registra o
 * anexo. O caminho sempre começa pelo id do chamado — é isso que a política do
 * bucket confere.
 */
export async function sosEnviarAnexo(
  chamadoId: string,
  arquivo: Blob,
  opcoes: { tipo?: TipoAnexo; etapa?: EtapaAnexo; legenda?: string | null; nome?: string } = {},
): Promise<{ id: string; caminho: string }> {
  const tipo = opcoes.tipo ?? tipoPorMime(arquivo.type)
  const ext = extensaoPorMime(arquivo.type) ?? (opcoes.nome?.split('.').pop() || 'bin')
  const caminho = `${chamadoId}/${tipo}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage.from(BUCKET_SOS).upload(caminho, arquivo, {
    contentType: arquivo.type || undefined,
    upsert: false,
  })
  if (error) throw traduzirErro(error)
  const id = await rpc<string>('sos_registrar_anexo', {
    p_chamado: chamadoId,
    p_caminho: caminho,
    p_tipo: tipo,
    p_etapa: opcoes.etapa ?? null,
    p_legenda: opcoes.legenda ?? null,
    p_tamanho: arquivo.size,
  })
  return { id, caminho }
}

/**
 * Remove um anexo: primeiro o arquivo, pela API do Storage (o Supabase não
 * deixa apagar arquivo por SQL — ficaria órfão no armazenamento), depois o
 * registro. A política do bucket confere que é o autor ou a central.
 */
export async function sosRemoverAnexo(anexoId: string, caminho: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET_SOS).remove([caminho])
  if (error) throw traduzirErro(error)
  await rpc<void>('sos_remover_anexo', { p_anexo: anexoId })
}

/** URL assinada (1 h) para exibir um arquivo privado do bucket `sos`. */
export async function sosUrlArquivo(caminho: string, segundos = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET_SOS).createSignedUrl(caminho, segundos)
  if (error) throw traduzirErro(error)
  return data.signedUrl
}

export async function sosUrlsArquivos(caminhos: string[], segundos = 3600): Promise<Record<string, string>> {
  if (!caminhos.length) return {}
  const { data, error } = await supabase.storage.from(BUCKET_SOS).createSignedUrls(caminhos, segundos)
  if (error) throw traduzirErro(error)
  const mapa: Record<string, string> = {}
  for (const d of data ?? []) if (d.path && d.signedUrl) mapa[d.path] = d.signedUrl
  return mapa
}

export function tipoPorMime(mime: string): TipoAnexo {
  if (mime.startsWith('image/')) return 'foto'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return 'documento'
}

function extensaoPorMime(mime: string): string | null {
  const mapa: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'audio/webm': 'webm',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'application/pdf': 'pdf',
  }
  return mapa[mime.split(';')[0]] ?? null
}

/* ── cliente ────────────────────────────────────────────────────────────── */

export const sosHomeCliente = () => rpc<HomeCliente>('sos_home_cliente')

export const sosHistoricoCliente = (veiculoId?: string | null, limite = 50) =>
  rpc<ItemHistorico[]>('sos_historico_cliente', { p_veiculo: veiculoId ?? null, p_limite: limite })

export const sosMeusChamados = (limite = 50) => rpc<ChamadoResumoCliente[]>('sos_meus_chamados', { p_limite: limite })

export const sosSolicitarAgendamento = (p: {
  tipo: TipoAgendamento
  veiculo_id?: string | null
  descricao?: string | null
  data_preferida?: string | null
  periodo?: 'manha' | 'tarde' | 'qualquer'
  cliente_id?: string | null
}) => rpc<string>('sos_solicitar_agendamento', { p })

export const sosAtualizarAgendamento = (
  id: string,
  status: StatusAgendamento,
  opcoes?: { dataConfirmada?: string | null; observacoes?: string | null; osId?: string | null },
) =>
  rpc<void>('sos_atualizar_agendamento', {
    p_id: id,
    p_status: status,
    p_data_confirmada: opcoes?.dataConfirmada ?? null,
    p_observacoes: opcoes?.observacoes ?? null,
    p_os: opcoes?.osId ?? null,
  })

export const sosMarcarLembrete = (id: string, dispensar = false) =>
  rpc<void>('sos_marcar_lembrete', { p_id: id, p_dispensar: dispensar })

/** Tabelas que o cliente lê direto (RLS garante que só vê o que é dele). */
export async function sosMeusVeiculos(): Promise<
  Array<{
    id: string
    placa: string
    marca: string | null
    modelo: string | null
    ano: number | null
    km_atual: number | null
    descricao: string | null
    tipo: string | null
    cor: string | null
  }>
> {
  const { data, error } = await db
    .from('veiculos')
    .select('id, placa, marca, modelo, ano, km_atual, descricao, tipo, cor')
    .eq('situacao', 'ativo')
    .order('updated_at', { ascending: false })
  if (error) throw traduzirErro(error)
  return data ?? []
}

export async function sosAtualizarKm(veiculoId: string, km: number) {
  const { error } = await db.from('veiculos').update({ km_atual: km }).eq('id', veiculoId)
  if (error) throw traduzirErro(error)
}

export async function sosMeusAgendamentos(): Promise<AgendamentoSOS[]> {
  const { data, error } = await db.from('sos_agendamentos').select('*').order('created_at', { ascending: false })
  if (error) throw traduzirErro(error)
  return (data ?? []) as AgendamentoSOS[]
}

export async function sosMeusLembretes(): Promise<LembreteSOS[]> {
  const { data, error } = await db
    .from('sos_lembretes')
    .select('*')
    .is('dispensado_em', null)
    .order('created_at', { ascending: false })
  if (error) throw traduzirErro(error)
  return (data ?? []) as LembreteSOS[]
}

/* ── mecânico ───────────────────────────────────────────────────────────── */

export const sosHomeMecanico = () => rpc<HomeMecanico>('sos_home_mecanico')

export const sosDefinirSituacao = (
  situacao: SituacaoMecanico,
  opcoes?: {
    lat?: number | null
    lng?: number | null
    veiculoApoio?: string | null
    telefone?: string | null
    mostrarTelefone?: boolean | null
    aceitaSos?: boolean | null
  },
) =>
  rpc<FichaMecanico>('sos_definir_situacao', {
    p_situacao: situacao,
    p_lat: opcoes?.lat ?? null,
    p_lng: opcoes?.lng ?? null,
    p_veiculo_apoio: opcoes?.veiculoApoio ?? null,
    p_telefone: opcoes?.telefone ?? null,
    p_mostrar_telefone: opcoes?.mostrarTelefone ?? null,
    p_aceita_sos: opcoes?.aceitaSos ?? null,
  })

export const sosAtualizarPosicaoMecanico = (lat: number, lng: number, precisao?: number | null) =>
  rpc<void>('sos_atualizar_posicao_mecanico', { p_lat: lat, p_lng: lng, p_precisao: precisao ?? null })

/** "App aberto": o vigia do servidor não põe offline quem está com o app na mão. */
export const sosPulso = () => rpc<void>('sos_pulso')

/* ── central ────────────────────────────────────────────────────────────── */

export const sosIndicadores = (inicio?: string, fim?: string) =>
  rpc<IndicadoresSOS>('sos_indicadores', {
    ...(inicio ? { p_inicio: inicio } : {}),
    ...(fim ? { p_fim: fim } : {}),
  })

export interface FiltroChamados {
  status?: StatusSOS[]
  mecanico_id?: string | null
  ocorrencia?: string | null
  de?: string | null
  ate?: string | null
  busca?: string | null
  ativos?: boolean
  limite?: number
}

export const sosListarChamados = (f: FiltroChamados = {}) =>
  rpc<ChamadoListado[]>('sos_listar_chamados', {
    p_filtro: {
      status: f.status?.length ? f.status.join(',') : null,
      mecanico_id: f.mecanico_id ?? null,
      ocorrencia: f.ocorrencia ?? null,
      de: f.de ?? null,
      ate: f.ate ?? null,
      busca: f.busca ?? null,
      ativos: f.ativos ?? false,
      limite: f.limite ?? 200,
    },
  })

export const sosMecanicosMapa = () => rpc<MecanicoMapa[]>('sos_mecanicos_mapa')

export const sosSugerirMecanicos = (chamadoId: string) =>
  rpc<SugestaoMecanico[]>('sos_sugerir_mecanicos', { p_chamado: chamadoId })

export const sosConfigAtual = () => rpc<ConfigSOS | null>('sos_config_atual')

/**
 * Salva as regras do SOS. Chaves (`whatsapp_apikey`, `ia_apikey`) só entram:
 * nunca voltam do banco. `ia_remover_chave` apaga a chave própria da IA.
 */
export const sosSalvarConfig = (
  p: Partial<ConfigSOS> & { whatsapp_apikey?: string; ia_apikey?: string; ia_remover_chave?: boolean },
) => rpc<ConfigSOS>('sos_salvar_config', { p })

/* ── atendimento premium ────────────────────────────────────────────────── */

/** Mecânico (ou central) envia o orçamento com os itens lançados. */
export const sosEnviarOrcamento = (chamadoId: string, observacao?: string | null) =>
  rpc<ChamadoSOS>('sos_enviar_orcamento', { p_chamado: chamadoId, p_observacao: observacao ?? null })

/**
 * Cliente aprova (com o caminho da assinatura já enviada ao bucket) ou recusa.
 * A central também responde — obrigatoriamente com a observação de como foi.
 */
export const sosResponderOrcamento = (
  chamadoId: string,
  aprovado: boolean,
  opcoes: { assinatura?: string | null; observacao?: string | null } = {},
) =>
  rpc<ChamadoSOS>('sos_responder_orcamento', {
    p_chamado: chamadoId,
    p_aprovado: aprovado,
    p_assinatura: opcoes.assinatura ?? null,
    p_observacao: opcoes.observacao ?? null,
  })

export const sosListarContratos = () => rpc<ContratoListado[]>('sos_listar_contratos')

export const sosSalvarContrato = (p: Partial<ContratoSOS>) => rpc<ContratoSOS>('sos_salvar_contrato', { p })

/** Saúde do vigia (última execução no pg_cron). */
export const sosVigiaStatus = () => rpc<VigiaStatus>('sos_vigia_status')

/** LGPD: o cliente apaga a própria conta. Pede a palavra EXCLUIR. */
export const sosExcluirMinhaConta = (confirmacao: string) =>
  rpc<void>('sos_excluir_minha_conta', { p_confirmacao: confirmacao })

/* ── IA do SOS (função `sos-ia`) ────────────────────────────────────────── */

export const sosIaPublico = () => rpc<IaPublico>('sos_ia_publico')

/** Erro de negócio da IA (desligada, sem chave, limite do dia…). */
export class ErroIa extends Error {
  constructor(
    mensagem: string,
    readonly status: string | null = null,
  ) {
    super(mensagem)
  }
}

async function sosIa<T>(acao: string, corpo: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('sos-ia', { body: { acao, ...corpo } })
  if (error) {
    // Erro HTTP da função (401/403): a mensagem útil está no corpo.
    let mensagem = 'A IA não respondeu agora. Tente de novo em instantes.'
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      const j = await ctx.json().catch(() => null)
      if (j?.erro) mensagem = ctx.status === 401 ? 'Sua sessão expirou. Entre de novo para usar a IA.' : String(j.erro)
    } else if (!navigator.onLine) {
      mensagem = 'Sem internet. A IA precisa de conexão.'
    }
    throw new ErroIa(mensagem)
  }
  const r = data as { erro?: string; status?: string } | null
  if (r?.erro) throw new ErroIa(r.erro, r.status ?? null)
  return data as T
}

/** Conversa de triagem do cliente (TECNO IA). `imagem` em base64, sem o prefixo `data:`. */
export const sosIaAtendimento = (mensagens: MensagemIa[], imagem?: { mime: string; dados: string } | null) =>
  sosIa<RespostaIaAtendimento>('atendimento', { mensagens, imagem: imagem ?? null })

/**
 * Tecno IA técnica (mecânico e central): mais técnica que a do cliente e,
 * com `chamadoId`, já sabe o veículo, o problema e o que foi registrado.
 */
export const sosIaTecnica = (mensagens: MensagemIa[], opcoes: { chamadoId?: string | null; imagem?: { mime: string; dados: string } | null } = {}) =>
  sosIa<RespostaIaAtendimento>('atendimento', { mensagens, perfil: 'tecnico', chamado_id: opcoes.chamadoId ?? null, imagem: opcoes.imagem ?? null })

export const sosIaFoto = (chamadoId: string, caminho: string) =>
  sosIa<{ texto: string }>('foto', { chamado_id: chamadoId, caminho })

export const sosIaKit = (chamadoId: string) => sosIa<{ kit: IaKit }>('kit', { chamado_id: chamadoId })

export const sosIaResumo = (chamadoId: string) => sosIa<{ resumo: IaResumo }>('resumo', { chamado_id: chamadoId })

export const sosIaTestar = () => sosIa<{ status: string; provedor: string; modelo: string }>('testar')

/** Blob de imagem → base64 puro (sem `data:`), para mandar à IA. */
export async function blobParaBase64(blob: Blob): Promise<string> {
  const url = await new Promise<string>((ok, falha) => {
    const leitor = new FileReader()
    leitor.onload = () => ok(String(leitor.result))
    leitor.onerror = () => falha(leitor.error)
    leitor.readAsDataURL(blob)
  })
  return url.slice(url.indexOf(',') + 1)
}

export const sosBuscarCliente = (termo: string) => rpc<ClienteBusca[]>('sos_buscar_cliente', { p_termo: termo })

export const sosContasApp = (termo?: string | null) => rpc<ContaApp[]>('sos_contas_app', { p_termo: termo ?? null })

export const sosVincularCliente = (usuarioId: string, clienteId: string) =>
  rpc<void>('sos_vincular_cliente', { p_usuario: usuarioId, p_cliente: clienteId })

export const sosGerarLembretes = () => rpc<number>('sos_gerar_lembretes')

export async function sosAgendamentosCentral(): Promise<
  Array<AgendamentoSOS & { cliente: { nome_razao: string; celular: string | null } | null; veiculo: { placa: string; marca: string | null; modelo: string | null } | null }>
> {
  const { data, error } = await db
    .from('sos_agendamentos')
    .select('*, cliente:clientes ( nome_razao, celular ), veiculo:veiculos ( placa, marca, modelo )')
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) throw traduzirErro(error)
  return (data ?? []) as never
}

/** Posições de um chamado (rastro), da mais antiga para a mais nova. */
export async function sosPosicoes(chamadoId: string, limite = 500) {
  const { data, error } = await db
    .from('sos_posicoes')
    .select('*')
    .eq('chamado_id', chamadoId)
    .order('registrado_em', { ascending: false })
    .limit(limite)
  if (error) throw traduzirErro(error)
  return ((data ?? []) as Array<{ papel: string; latitude: number; longitude: number; registrado_em: string }>).reverse()
}

export { db as dbSOS }

export const sosRelatorio = (inicio: string, fim: string) =>
  rpc<RelatorioSOS>('sos_relatorio', { p_inicio: inicio, p_fim: fim })

/** Central altera a ficha SOS de um mecânico (situação, aceite, viatura, telefone). */
export const sosCentralMecanico = (
  usuarioId: string,
  p: {
    situacao?: SituacaoMecanico
    aceita_sos?: boolean
    veiculo_apoio?: string | null
    telefone?: string | null
    mostrar_telefone?: boolean
  },
) => rpc<FichaMecanico>('sos_central_mecanico', { p_usuario: usuarioId, p })
