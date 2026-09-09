import type {
  LinhaArtigoAjuda,
  LinhaAuditoria,
  LinhaDadosEmpresa,
  LinhaEspecialidade,
  LinhaFuncao,
  LinhaMecanico,
  LinhaNotificacao,
  LinhaPerfilAcesso,
  LinhaPerfilPermissao,
  LinhaRecurso,
  LinhaUsuario,
  LinhaUsuarioPermissao,
  LinhaCliente,
  LinhaClienteContato,
  LinhaFornecedor,
  LinhaTag,
  LinhaVendedor,
  LinhaVeiculo,
  LinhaVeiculoProprietario,
  LinhaProduto,
  LinhaServico,
  LinhaStatusOS,
  LinhaSincronizacao,
  LinhaConflitoSincronizacao,
  LinhaVenda,
  LinhaVendaItem,
  LinhaEvidencia,
  LinhaEventoVeiculo,
  LinhaEntradaPatio,
  LinhaOrdemServico,
  LinhaOSMecanico,
  LinhaOSServico,
  LinhaOSProduto,
  LinhaOSEvento,
  LinhaAssinatura,
  LinhaChecklistModelo,
  LinhaChecklistModeloItem,
  LinhaChecklist,
  LinhaChecklistResposta,
  LinhaChecklistDefeito,
  LinhaAcaoCorretiva,
  LinhaAvariaVeiculo,
  LinhaFatura,
  LinhaFaturaParcela,
  LinhaIADominio,
  LinhaIAEquipamento,
  LinhaIAConfig,
  LinhaIAAprendizado,
  LinhaOSApontamento,
  LinhaPatio,
  LinhaMinhaTarefa,
  LinhaGarantia,
  LinhaRetorno,
  LinhaTermoRecusa,
  LinhaPecaTeste,
  LinhaPecaTesteEvento,
  LinhaParametro,
  LinhaInteracao,
  LinhaFollowUp,
  LinhaEstoqueMovimento,
  LinhaEstoque,
  LinhaClienteRelacionamento,
  LinhaCriterioPerformance,
  LinhaEventoPerformance,
  LinhaArtigoTecnico,
  LinhaArtigoVersao,
  LinhaIAConversa,
  LinhaIAMensagem,
  LinhaIAFonte,
  LinhaIAFeedback,
  LinhaEbook,
  LinhaEbookCapitulo,
  LinhaEbookCapituloDetalhe,
} from './supabase'

export type {
  AcaoPermissao,
  Database,
  Enumeracoes,
  Json,
  SituacaoRegistro,
  SituacaoUsuario,
  Tabelas,
  TabelasInsert,
  TabelasUpdate,
  TemaInterface,
  TipoNotificacao,
  TipoPessoa,
  OrigemRegistro,
  MomentoComissao,
  BaseComissao,
  FormaComissao,
  TipoVeiculo,
  CategoriaStatusOS,
  StatusIntegracao,
  TipoSincronizacao,
  ResultadoSincronizacao,
  EstadoIntegracao,
  TipoEvidencia,
  SituacaoEntrada,
  TipoOS,
  FormaPagamento,
  SituacaoAprovacao,
  EstadoProdutoOS,
  SituacaoItem,
  TipoChecklist,
  TipoRespostaChecklist,
  RespostaChecklist,
  SituacaoChecklist,
  Criticidade,
  TipoAvaria,
  SituacaoAprendizado,
  ProvedorIA,
  SituacaoIA,
  ProvedorListado,
  ProgressoSecao,
  StatusAcao,
  PrioridadeAcao,
  SituacaoApontamento,
  IndicadoresPatio,
  TipoItemGarantia,
  SituacaoGarantia,
  DecisaoRetorno,
  SituacaoRetorno,
  StatusPecaTeste,
  SlaPecasTeste,
  TipoInteracao,
  SituacaoFollowUp,
  TipoMovimentoEstoque,
  SituacaoEstoque,
  IndicadoresEstoque,
  IndicadoresVendas,
  ProdutoMaisVendido,
  EvolucaoVenda,
  IndicadoresCRM,
  IndicadoresGestao,
  AlertaGestao,
  LinhaPerformance,
  OrigemCriterio,
  EventoPerformance,
  PapelMensagem,
  SituacaoArtigo,
  SituacaoEbook,
  ArtigoBuscado,
  AnexoIA,
  RespostaEstruturada,
  Visoes,
} from './supabase'

export type PerfilAcesso = LinhaPerfilAcesso
export type Funcao = LinhaFuncao
export type Especialidade = LinhaEspecialidade
export type Usuario = LinhaUsuario
export type Recurso = LinhaRecurso
export type PerfilPermissao = LinhaPerfilPermissao
export type UsuarioPermissao = LinhaUsuarioPermissao
export type Notificacao = LinhaNotificacao
export type ArtigoAjuda = LinhaArtigoAjuda
export type DadosEmpresa = LinhaDadosEmpresa
export type RegistroAuditoria = LinhaAuditoria
export type Mecanico = LinhaMecanico
export type Tag = LinhaTag
export type Cliente = LinhaCliente
export type ClienteContato = LinhaClienteContato
export type Fornecedor = LinhaFornecedor
export type Vendedor = LinhaVendedor

export type Veiculo = LinhaVeiculo
export type VeiculoProprietario = LinhaVeiculoProprietario
export type Produto = LinhaProduto
export type Servico = LinhaServico
export type StatusOS = LinhaStatusOS
export type Sincronizacao = LinhaSincronizacao
export type ConflitoSincronizacao = LinhaConflitoSincronizacao
export type Venda = LinhaVenda
export type VendaItem = LinhaVendaItem
export type EvidenciaRegistro = LinhaEvidencia
export type EventoVeiculo = LinhaEventoVeiculo
export type EntradaPatio = LinhaEntradaPatio

export type OrdemServico = LinhaOrdemServico
export type OSMecanico = LinhaOSMecanico
export type OSServico = LinhaOSServico
export type OSProduto = LinhaOSProduto
export type OSEvento = LinhaOSEvento
export type Assinatura = LinhaAssinatura
export type ChecklistModelo = LinhaChecklistModelo
export type ChecklistModeloItem = LinhaChecklistModeloItem
export type Checklist = LinhaChecklist
export type ChecklistResposta = LinhaChecklistResposta
export type ChecklistDefeito = LinhaChecklistDefeito
export type AcaoCorretivaRegistro = LinhaAcaoCorretiva
export type AvariaVeiculo = LinhaAvariaVeiculo
export type Fatura = LinhaFatura
export type FaturaParcela = LinhaFaturaParcela
export type IADominio = LinhaIADominio
export type IAEquipamento = LinhaIAEquipamento
export type IAConfig = LinhaIAConfig
export type IAAprendizado = LinhaIAAprendizado
export type OSApontamento = LinhaOSApontamento
export type LinhaPatioVeiculo = LinhaPatio
export type MinhaTarefa = LinhaMinhaTarefa
export type Garantia = LinhaGarantia
export type Retorno = LinhaRetorno
export type TermoRecusa = LinhaTermoRecusa
export type PecaTeste = LinhaPecaTeste
export type PecaTesteEvento = LinhaPecaTesteEvento
export type Parametro = LinhaParametro
export type Interacao = LinhaInteracao
export type FollowUp = LinhaFollowUp
export type EstoqueMovimento = LinhaEstoqueMovimento
export type ItemEstoque = LinhaEstoque
export type ClienteRelacionamento = LinhaClienteRelacionamento
export type CriterioPerformance = LinhaCriterioPerformance
export type EventoPerformanceRegistro = LinhaEventoPerformance
export type ArtigoTecnico = LinhaArtigoTecnico
export type ArtigoVersao = LinhaArtigoVersao
export type IAConversa = LinhaIAConversa
export type IAMensagem = LinhaIAMensagem
export type IAFonte = LinhaIAFonte
export type IAFeedback = LinhaIAFeedback
export type Ebook = LinhaEbook
export type EbookCapitulo = LinhaEbookCapitulo
export type EbookCapituloDetalhe = LinhaEbookCapituloDetalhe

export interface ArtigoListado extends ArtigoTecnico {
  autor: Pick<Usuario, 'id' | 'nome_completo'> | null
  revisor: Pick<Usuario, 'id' | 'nome_completo'> | null
}

export interface ConversaListada extends IAConversa {
  ordem: { id: string; numero: number } | null
}

export interface EventoPerformanceListado extends EventoPerformanceRegistro {
  usuario: Pick<Usuario, 'id' | 'nome_completo'> | null
  criterio: Pick<CriterioPerformance, 'id' | 'nome' | 'categoria'> | null
  registrador: Pick<Usuario, 'id' | 'nome_completo'> | null
}

export interface InteracaoListada extends Interacao {
  responsavel: Pick<Usuario, 'id' | 'nome_completo'> | null
  cliente: Pick<Cliente, 'id' | 'nome_razao'> | null
}

export interface FollowUpListado extends FollowUp {
  cliente: Pick<Cliente, 'id' | 'nome_razao' | 'celular' | 'telefone'> | null
  responsavel: Pick<Usuario, 'id' | 'nome_completo'> | null
}

export interface VendaListada extends Venda {
  cliente: Pick<Cliente, 'id' | 'nome_razao'> | null
  vendedor: Pick<Vendedor, 'id' | 'descricao'> | null
}

export interface MovimentoListado extends EstoqueMovimento {
  usuario: Pick<Usuario, 'id' | 'nome_completo'> | null
}

export interface GarantiaListada extends Garantia {
  cliente: Pick<Cliente, 'id' | 'nome_razao'> | null
  veiculo: Pick<Veiculo, 'id' | 'placa'> | null
  ordem: { id: string; numero: number } | null
}

export interface RetornoListado extends Retorno {
  cliente: Pick<Cliente, 'id' | 'nome_razao'> | null
  veiculo: Pick<Veiculo, 'id' | 'placa'> | null
}

export interface PecaTesteListada extends PecaTeste {
  cliente: Pick<Cliente, 'id' | 'nome_razao'> | null
  mecanico: Pick<Usuario, 'id' | 'nome_completo'> | null
  especialidade: Pick<Especialidade, 'id' | 'nome'> | null
}

export interface ChecklistListado extends Checklist {
  veiculo: Pick<Veiculo, 'id' | 'placa' | 'descricao'> | null
  cliente: Pick<Cliente, 'id' | 'nome_razao'> | null
  responsavel: Pick<Usuario, 'id' | 'nome_completo'> | null
  ordem: { id: string; numero: number } | null
}

export interface OSListada extends OrdemServico {
  cliente: Pick<Cliente, 'id' | 'nome_razao'> | null
  veiculo: Pick<Veiculo, 'id' | 'placa' | 'descricao'> | null
  status: Pick<StatusOS, 'id' | 'nome' | 'cor' | 'categoria'> | null
}

export interface EntradaPatioListada extends EntradaPatio {
  cliente: Pick<Cliente, 'id' | 'nome_razao'> | null
  veiculo: Pick<Veiculo, 'id' | 'placa' | 'descricao' | 'alerta_operador'> | null
  recebido: Pick<Usuario, 'id' | 'nome_completo'> | null
}

export interface ClienteListado extends Cliente {
  cliente_tags: Array<{ tag: Pick<Tag, 'id' | 'nome' | 'cor'> | null }>
}

export interface VeiculoListado extends Veiculo {
  cliente: Pick<Cliente, 'id' | 'nome_razao'> | null
}

export interface ProdutoListado extends Produto {
  fornecedor: Pick<Fornecedor, 'id' | 'descricao'> | null
}

export interface ServicoListado extends Servico {
  especialidade: Pick<Especialidade, 'id' | 'nome'> | null
}

/** Opção mínima para seletores de referência. */
export interface OpcaoRef {
  id: string
  rotulo: string
  detalhe?: string
}

export interface UsuarioComPerfil extends Usuario {
  perfil: Pick<PerfilAcesso, 'id' | 'nome'> | null
  funcao: Pick<Funcao, 'id' | 'nome' | 'atua_como_mecanico' | 'atua_no_laboratorio'> | null
}

export interface UsuarioListado extends Usuario {
  perfil: Pick<PerfilAcesso, 'id' | 'nome'> | null
  funcao: Pick<Funcao, 'id' | 'nome'> | null
  usuario_especialidades: Array<{ especialidade: Pick<Especialidade, 'id' | 'nome'> | null }>
}
