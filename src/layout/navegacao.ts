import {
  Blocks,
  BookOpen,
  Boxes,
  Brain,
  BriefcaseBusiness,
  Building2,
  CalendarCheck,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Cog,
  FileText,
  FlaskConical,
  Gauge,
  LayoutDashboard,
  Landmark,
  Library,
  ListChecks,
  LogIn,
  LogOut,
  MonitorPlay,
  Package,
  PhoneCall,
  ScrollText,
  Sunrise,
  Sunset,
  Settings2,
  Shield,
  ShieldCheck,
  Store,
  Tag,
  Timer,
  TrendingUp,
  Truck,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react'

export interface ItemMenu {
  rotulo: string
  rota: string
  icone: LucideIcon
  /** Etapa do projeto que entrega este módulo. */
  etapa: number
  /**
   * Recurso protegido correspondente. O item só aparece para quem tem
   * permissão de visualizar. `null` = disponível para qualquer conta ativa.
   */
  recurso: string | null
  subitens?: ItemMenu[]
}

export interface GrupoMenu {
  id: string
  rotulo: string
  itens: ItemMenu[]
}

export const NAVEGACAO: GrupoMenu[] = [
  {
    id: 'inicio',
    rotulo: 'Início',
    itens: [{ rotulo: 'Visão Geral', rota: '/visao-geral', icone: LayoutDashboard, etapa: 1, recurso: null }],
  },
  {
    id: 'cadastros',
    rotulo: 'Cadastros',
    itens: [
      { rotulo: 'Clientes', rota: '/cadastros/clientes', icone: Users, etapa: 3, recurso: 'clientes' },
      { rotulo: 'Fornecedores', rota: '/cadastros/fornecedores', icone: Building2, etapa: 3, recurso: 'fornecedores' },
      { rotulo: 'Vendedores', rota: '/cadastros/vendedores', icone: Store, etapa: 3, recurso: 'vendedores' },
      {
        rotulo: 'Usuários',
        rota: '/cadastros/usuarios',
        icone: UserCog,
        etapa: 2,
        recurso: 'usuarios',
        subitens: [
          {
            rotulo: 'Funções e Cargos',
            rota: '/cadastros/funcoes',
            icone: BriefcaseBusiness,
            etapa: 2,
            recurso: 'funcoes',
          },
        ],
      },
      { rotulo: 'Veículos', rota: '/cadastros/veiculos', icone: Truck, etapa: 4, recurso: 'veiculos' },
      { rotulo: 'Produtos', rota: '/cadastros/produtos', icone: Package, etapa: 4, recurso: 'produtos' },
      { rotulo: 'Serviços', rota: '/cadastros/servicos', icone: Wrench, etapa: 4, recurso: 'servicos' },
      { rotulo: 'Status da OS', rota: '/cadastros/status-os', icone: ListChecks, etapa: 4, recurso: 'status_os' },
      { rotulo: 'Tags', rota: '/cadastros/tags', icone: Tag, etapa: 4, recurso: 'tags' },
    ],
  },
  {
    id: 'operacao',
    rotulo: 'Operação',
    itens: [
      /*
       * A ordem abaixo é a do veículo dentro da oficina: entra, é
       * diagnosticado, tem a entrada conferida, tem a saída conferida e só
       * então é liberado. O menu conta essa história.
       */
      { rotulo: '01 Recepção', rota: '/operacao/recepcao', icone: ClipboardList, etapa: 6, recurso: 'recepcao' },
      { rotulo: '02 Ordem de Serviço', rota: '/operacao/ordens-de-servico', icone: FileText, etapa: 7, recurso: 'ordens_servico' },
      {
        rotulo: 'Checklist',
        rota: '/operacao/checklists',
        icone: ClipboardCheck,
        etapa: 8,
        recurso: 'checklists',
        subitens: [
          { rotulo: '03 Checklist Entrada', rota: '/operacao/checklists/entrada', icone: LogIn, etapa: 8, recurso: 'checklists' },
          { rotulo: '04 Checklist Saída', rota: '/operacao/checklists/saida', icone: LogOut, etapa: 8, recurso: 'checklists' },
        ],
      },
      { rotulo: '05 Saída do Pátio', rota: '/operacao/saida', icone: CircleDollarSign, etapa: 10, recurso: 'ordens_servico' },
      { rotulo: 'Garantias e Retornos', rota: '/operacao/garantias', icone: ShieldCheck, etapa: 11, recurso: 'garantias' },
      { rotulo: 'Peças em Teste', rota: '/operacao/pecas-em-teste', icone: FlaskConical, etapa: 11, recurso: 'pecas_em_teste' },
      {
        rotulo: 'Painel do Pátio',
        rota: '/operacao/patio',
        icone: Blocks,
        etapa: 10,
        recurso: 'patio',
        subitens: [
          { rotulo: 'Modo TV', rota: '/operacao/modo-tv', icone: MonitorPlay, etapa: 10, recurso: 'patio' },
        ],
      },
      { rotulo: 'Minha Operação', rota: '/operacao/minha-operacao', icone: Timer, etapa: 10, recurso: 'minha_operacao' },
    ],
  },
  {
    id: 'relacionamento',
    rotulo: 'Relacionamento',
    itens: [
      { rotulo: 'CRM', rota: '/relacionamento/crm', icone: PhoneCall, etapa: 12, recurso: 'crm' },
      { rotulo: 'Follow-up', rota: '/relacionamento/follow-up', icone: CalendarCheck, etapa: 12, recurso: 'follow_up' },
    ],
  },
  {
    id: 'comercial',
    rotulo: 'Comercial',
    itens: [{ rotulo: 'Estoque', rota: '/comercial/estoque', icone: Boxes, etapa: 12, recurso: 'estoque_vendas' }],
  },
  {
    id: 'gestao',
    rotulo: 'Gestão',
    itens: [
      /* Financeiro ainda não tem recurso próprio na tabela de permissões — a
         migração o cria. Até lá herda o público de Indicadores, que é o mesmo. */
      { rotulo: 'Financeiro', rota: '/gestao/financeiro', icone: Landmark, etapa: 13, recurso: 'indicadores' },
      { rotulo: 'Indicadores', rota: '/gestao/indicadores', icone: Gauge, etapa: 13, recurso: 'indicadores' },
      { rotulo: 'Performance', rota: '/gestao/performance', icone: TrendingUp, etapa: 13, recurso: 'performance' },
      {
        rotulo: 'Checklist de Abertura e Fechamento',
        rota: '/gestao/checklist-5s',
        icone: ScrollText,
        etapa: 9,
        recurso: 'checklist_5s',
        subitens: [
          { rotulo: 'Abertura', rota: '/gestao/checklist-5s/abertura', icone: Sunrise, etapa: 9, recurso: 'checklist_5s' },
          { rotulo: 'Fechamento', rota: '/gestao/checklist-5s/fechamento', icone: Sunset, etapa: 9, recurso: 'checklist_5s' },
        ],
      },
    ],
  },
  {
    id: 'inteligencia',
    rotulo: 'Inteligência',
    itens: [
      { rotulo: 'Tecnoar IA', rota: '/inteligencia/tecnoar-ia', icone: Brain, etapa: 14, recurso: 'tecnoar_ia' },
      { rotulo: 'Base Técnica', rota: '/inteligencia/base-tecnica', icone: Library, etapa: 14, recurso: 'base_tecnica' },
      { rotulo: 'E-books', rota: '/inteligencia/ebooks', icone: BookOpen, etapa: 14, recurso: 'ebooks' },
    ],
  },
  {
    id: 'sistema',
    rotulo: 'Sistema',
    itens: [
      { rotulo: 'Integrações', rota: '/sistema/integracoes', icone: Cog, etapa: 5, recurso: 'integracoes' },
      { rotulo: 'Perfis e Permissões', rota: '/sistema/perfis-e-permissoes', icone: Shield, etapa: 2, recurso: 'perfis_permissoes' },
      { rotulo: 'Dados da Empresa', rota: '/sistema/dados-da-empresa', icone: Building2, etapa: 1, recurso: 'dados_empresa' },
      { rotulo: 'Configurações', rota: '/sistema/configuracoes', icone: Settings2, etapa: 1, recurso: null },
    ],
  },
]

function achatarItens(itens: ItemMenu[]): ItemMenu[] {
  return itens.flatMap((item) => [item, ...(item.subitens ? achatarItens(item.subitens) : [])])
}

export const TODOS_ITENS: ItemMenu[] = NAVEGACAO.flatMap((g) => achatarItens(g.itens))

export function itemPorRota(rota: string): ItemMenu | undefined {
  return TODOS_ITENS.find((i) => i.rota === rota)
}

export function grupoDaRota(rota: string): GrupoMenu | undefined {
  return NAVEGACAO.find((g) => achatarItens(g.itens).some((i) => i.rota === rota))
}
