import { Suspense, lazy, type ComponentType, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { RotaProtegida, RotaPublica, RotaSituacao } from '@/auth/RotaProtegida'
import { AppShell } from '@/layout/AppShell'
import { TODOS_ITENS, itemPorRota } from '@/layout/navegacao'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { EstadoCarregando, EstadoSemPermissao, TelaCarregando } from '@/componentes/ui/Estados'
import { CabecalhoPagina } from '@/componentes/ui/Painel'

/* Carregamento sob demanda: cada tela entra no pacote só quando é aberta. */
const Login = lazy(() => import('@/paginas/auth/Login').then((m) => ({ default: m.Login })))
const SolicitarAcesso = lazy(() =>
  import('@/paginas/auth/SolicitarAcesso').then((m) => ({ default: m.SolicitarAcesso })),
)
const EsqueciSenha = lazy(() => import('@/paginas/auth/EsqueciSenha').then((m) => ({ default: m.EsqueciSenha })))
const NovaSenha = lazy(() => import('@/paginas/auth/NovaSenha').then((m) => ({ default: m.NovaSenha })))
const AcessoPendente = lazy(() =>
  import('@/paginas/auth/AcessoPendente').then((m) => ({ default: m.AcessoPendente })),
)
const PoliticaPrivacidade = lazy(() =>
  import('@/paginas/auth/PoliticaPrivacidade').then((m) => ({ default: m.PoliticaPrivacidade })),
)

const VisaoGeral = lazy(() => import('@/paginas/VisaoGeral').then((m) => ({ default: m.VisaoGeral })))
const ModuloPendente = lazy(() => import('@/paginas/ModuloPendente').then((m) => ({ default: m.ModuloPendente })))
const NaoEncontrado = lazy(() => import('@/paginas/NaoEncontrado').then((m) => ({ default: m.NaoEncontrado })))
const Configuracoes = lazy(() =>
  import('@/paginas/sistema/Configuracoes').then((m) => ({ default: m.Configuracoes })),
)
const DadosEmpresa = lazy(() =>
  import('@/paginas/sistema/DadosEmpresa').then((m) => ({ default: m.DadosEmpresa })),
)
const PerfisPermissoes = lazy(() =>
  import('@/paginas/sistema/PerfisPermissoes').then((m) => ({ default: m.PerfisPermissoes })),
)
const Usuarios = lazy(() => import('@/paginas/cadastros/Usuarios').then((m) => ({ default: m.Usuarios })))
const Funcoes = lazy(() => import('@/paginas/cadastros/Funcoes').then((m) => ({ default: m.Funcoes })))
const Especialidades = lazy(() =>
  import('@/paginas/cadastros/Especialidades').then((m) => ({ default: m.Especialidades })),
)
const Clientes = lazy(() => import('@/paginas/cadastros/Clientes').then((m) => ({ default: m.Clientes })))
const Fornecedores = lazy(() =>
  import('@/paginas/cadastros/Fornecedores').then((m) => ({ default: m.Fornecedores })),
)
const Vendedores = lazy(() => import('@/paginas/cadastros/Vendedores').then((m) => ({ default: m.Vendedores })))
const Veiculos = lazy(() => import('@/paginas/cadastros/Veiculos').then((m) => ({ default: m.Veiculos })))
const Produtos = lazy(() => import('@/paginas/cadastros/Produtos').then((m) => ({ default: m.Produtos })))
const Servicos = lazy(() => import('@/paginas/cadastros/Servicos').then((m) => ({ default: m.Servicos })))
const Tags = lazy(() => import('@/paginas/cadastros/Tags').then((m) => ({ default: m.Tags })))
const StatusOS = lazy(() => import('@/paginas/cadastros/StatusOS').then((m) => ({ default: m.StatusOS })))
const Integracoes = lazy(() => import('@/paginas/sistema/Integracoes').then((m) => ({ default: m.Integracoes })))
const Recepcao = lazy(() => import('@/paginas/operacao/Recepcao').then((m) => ({ default: m.Recepcao })))
const OrdensServico = lazy(() =>
  import('@/paginas/operacao/OrdensServico').then((m) => ({ default: m.OrdensServico })),
)
const Checklists = lazy(() => import('@/paginas/operacao/Checklists').then((m) => ({ default: m.Checklists })))
const Checklist5S = lazy(() => import('@/paginas/gestao/Checklist5S').then((m) => ({ default: m.Checklist5S })))
const SaidaPatio = lazy(() => import('@/paginas/operacao/SaidaPatio').then((m) => ({ default: m.SaidaPatio })))
const PainelPatio = lazy(() => import('@/paginas/operacao/PainelPatio').then((m) => ({ default: m.PainelPatio })))
const MinhaOperacao = lazy(() =>
  import('@/paginas/operacao/MinhaOperacao').then((m) => ({ default: m.MinhaOperacao })),
)
const PecasEmTeste = lazy(() => import('@/paginas/operacao/PecasEmTeste').then((m) => ({ default: m.PecasEmTeste })))
const TecnoarIA = lazy(() => import('@/paginas/inteligencia/TecnoarIA').then((m) => ({ default: m.TecnoarIA })))
const BaseTecnica = lazy(() => import('@/paginas/inteligencia/BaseTecnica').then((m) => ({ default: m.BaseTecnica })))
const Ebooks = lazy(() => import('@/paginas/inteligencia/Ebooks').then((m) => ({ default: m.Ebooks })))
const Indicadores = lazy(() => import('@/paginas/gestao/Indicadores').then((m) => ({ default: m.Indicadores })))
const Performance = lazy(() => import('@/paginas/gestao/Performance').then((m) => ({ default: m.Performance })))
const CRM = lazy(() => import('@/paginas/relacionamento/CRM').then((m) => ({ default: m.CRM })))
const FollowUp = lazy(() => import('@/paginas/relacionamento/FollowUp').then((m) => ({ default: m.FollowUp })))
const Estoque = lazy(() => import('@/paginas/comercial/Estoque').then((m) => ({ default: m.Estoque })))
const Financeiro = lazy(() => import('@/paginas/financeiro/Financeiro').then((m) => ({ default: m.Financeiro })))
const Garantias = lazy(() => import('@/paginas/operacao/Garantias').then((m) => ({ default: m.Garantias })))

/** Telas já implantadas. O restante do menu resolve para ModuloPendente. */
const TELAS: Record<string, ComponentType> = {
  '/visao-geral': VisaoGeral,
  '/cadastros/clientes': Clientes,
  '/cadastros/fornecedores': Fornecedores,
  '/cadastros/vendedores': Vendedores,
  '/cadastros/usuarios': Usuarios,
  '/cadastros/funcoes': Funcoes,
  '/cadastros/especialidades': Especialidades,
  '/cadastros/veiculos': Veiculos,
  '/cadastros/produtos': Produtos,
  '/cadastros/servicos': Servicos,
  '/cadastros/tags': Tags,
  '/cadastros/status-os': StatusOS,
  '/sistema/configuracoes': Configuracoes,
  '/sistema/dados-da-empresa': DadosEmpresa,
  '/sistema/perfis-e-permissoes': PerfisPermissoes,
  '/sistema/integracoes': Integracoes,
  '/operacao/recepcao': Recepcao,
  '/operacao/ordens-de-servico': OrdensServico,
  '/operacao/checklists': Checklists,
  '/operacao/checklists/entrada': Checklists,
  '/operacao/checklists/saida': Checklists,
  '/gestao/checklist-5s': Checklist5S,
  '/gestao/checklist-5s/abertura': Checklist5S,
  '/gestao/checklist-5s/fechamento': Checklist5S,
  '/operacao/patio': PainelPatio,
  '/operacao/modo-tv': PainelPatio,
  '/operacao/saida': SaidaPatio,
  '/operacao/minha-operacao': MinhaOperacao,
  '/operacao/pecas-em-teste': PecasEmTeste,
  '/operacao/garantias': Garantias,
  '/relacionamento/crm': CRM,
  '/relacionamento/follow-up': FollowUp,
  '/comercial/estoque': Estoque,
  '/gestao/financeiro': Financeiro,
  '/gestao/indicadores': Indicadores,
  '/gestao/performance': Performance,
  '/inteligencia/tecnoar-ia': TecnoarIA,
  '/inteligencia/base-tecnica': BaseTecnica,
  '/inteligencia/ebooks': Ebooks,
}

const ROTAS_OCULTAS: Record<string, { Tela: ComponentType; recurso: string | null; rotulo: string }> = {
  '/cadastros/especialidades': {
    Tela: Especialidades,
    recurso: 'especialidades',
    rotulo: 'Especialidades do mecânico',
  },
}

/**
 * Barreira por recurso: quem não tem permissão de visualizar não abre a tela,
 * mesmo digitando o endereço direto.
 */
function TelaProtegida({ rota, children }: { rota: string; children: ReactNode }) {
  const { pode, carregando } = usePermissoes()
  const item = itemPorRota(rota)
  const oculta = ROTAS_OCULTAS[rota]
  const recurso = item?.recurso ?? oculta?.recurso
  const rotulo = item?.rotulo ?? oculta?.rotulo ?? 'Módulo'

  if (!recurso) return <>{children}</>
  if (carregando) return <EstadoCarregando />
  if (!pode(recurso, 'visualizar')) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Acesso" titulo={rotulo} />
        <EstadoSemPermissao />
      </div>
    )
  }
  return <>{children}</>
}

export function App() {
  return (
    <Routes>
      {/* Acesso */}
      <Route
        element={
          <Suspense fallback={<TelaCarregando />}>
            <RotaPublica />
          </Suspense>
        }
      >
        <Route path="/entrar" element={<Login />} />
        <Route path="/solicitar-acesso" element={<SolicitarAcesso />} />
        <Route path="/esqueci-a-senha" element={<EsqueciSenha />} />
        <Route path="/nova-senha" element={<NovaSenha />} />
        <Route path="/politica-de-privacidade" element={<PoliticaPrivacidade />} />
      </Route>

      <Route
        element={
          <Suspense fallback={<TelaCarregando />}>
            <RotaSituacao />
          </Suspense>
        }
      >
        <Route path="/acesso-pendente" element={<AcessoPendente />} />
      </Route>

      {/* Sistema interno */}
      <Route element={<RotaProtegida />}>
        <Route element={<AppShell />}>
          {/* Após entrar, a Visão Geral é sempre o destino — nunca Modo TV,
              Pátio ou Configurações. */}
          <Route index element={<Navigate to="/visao-geral" replace />} />

          {/* A tela deixou de ser "Estoque e Vendas": o painel de Vendas foi
              para o Financeiro. Quem tem a rota antiga salva não cai em 404. */}
          <Route path="/comercial/estoque-e-vendas" element={<Navigate to="/comercial/estoque" replace />} />
          {TODOS_ITENS.map((item) => {
            const Tela = TELAS[item.rota] ?? ModuloPendente
            return (
              <Route
                key={item.rota}
                path={item.rota}
                element={
                  <Suspense fallback={<EstadoCarregando />}>
                    <TelaProtegida rota={item.rota}>
                      <Tela />
                    </TelaProtegida>
                  </Suspense>
                }
              />
            )
          })}
          {Object.entries(ROTAS_OCULTAS).map(([rota, { Tela }]) => (
            <Route
              key={rota}
              path={rota}
              element={
                <Suspense fallback={<EstadoCarregando />}>
                  <TelaProtegida rota={rota}>
                    <Tela />
                  </TelaProtegida>
                </Suspense>
              }
            />
          ))}
          <Route
            path="*"
            element={
              <Suspense fallback={<EstadoCarregando />}>
                <NaoEncontrado />
              </Suspense>
            }
          />
        </Route>
      </Route>
    </Routes>
  )
}
