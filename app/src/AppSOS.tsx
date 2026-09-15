import { Suspense, lazy, useEffect, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { avisarContaNaoEquipe, rotaDeEntrada, useSessao } from './sessao'
import { TelaCarregandoApp } from './comum/Carregando'

/**
 * Rotas do app SOS Tecnoar (base /app).
 *
 * Um app, dois mundos: o que o cliente vê e o que o mecânico vê são árvores
 * de rotas separadas, escolhidas pelo papel que o banco devolve. O caminho
 * `/chamado/:id` existe nas duas — é para onde apontam as notificações.
 */

const Entrar = lazy(() => import('./auth/Entrar').then((m) => ({ default: m.Entrar })))
const Cadastro = lazy(() => import('./auth/Cadastro').then((m) => ({ default: m.Cadastro })))
const EsqueciSenha = lazy(() => import('./auth/EsqueciSenha').then((m) => ({ default: m.EsqueciSenha })))
const NovaSenha = lazy(() => import('./auth/NovaSenha').then((m) => ({ default: m.NovaSenha })))
const CompletarCadastro = lazy(() => import('./auth/CompletarCadastro').then((m) => ({ default: m.CompletarCadastro })))
const TelaEquipe = lazy(() => import('./comum/TelaEquipe').then((m) => ({ default: m.TelaEquipe })))
const Acompanhar = lazy(() => import('./comum/Acompanhar').then((m) => ({ default: m.Acompanhar })))
const Notificacoes = lazy(() => import('./comum/Notificacoes').then((m) => ({ default: m.Notificacoes })))
const PaginaLegal = lazy(() => import('./cliente/legal/DocumentoLegal').then((m) => ({ default: m.PaginaLegal })))
const ContaExcluida = lazy(() => import('./cliente/ContaExcluida').then((m) => ({ default: m.ContaExcluida })))

// Cliente
const CascaCliente = lazy(() => import('./cliente/CascaCliente').then((m) => ({ default: m.CascaCliente })))
const HomeCliente = lazy(() => import('./cliente/HomeCliente').then((m) => ({ default: m.HomeCliente })))
const FluxoSOS = lazy(() => import('./cliente/FluxoSOS').then((m) => ({ default: m.FluxoSOS })))
const ChamadoCliente = lazy(() => import('./cliente/ChamadoCliente').then((m) => ({ default: m.ChamadoCliente })))
const MeusChamados = lazy(() => import('./cliente/MeusChamados').then((m) => ({ default: m.MeusChamados })))
const MeusVeiculos = lazy(() => import('./cliente/MeusVeiculos').then((m) => ({ default: m.MeusVeiculos })))
const Historico = lazy(() => import('./cliente/Historico').then((m) => ({ default: m.Historico })))
const Revisoes = lazy(() => import('./cliente/Revisoes').then((m) => ({ default: m.Revisoes })))
const Contato = lazy(() => import('./cliente/Contato').then((m) => ({ default: m.Contato })))
const PerfilCliente = lazy(() => import('./cliente/PerfilCliente').then((m) => ({ default: m.PerfilCliente })))
const TecnoIA = lazy(() => import('./cliente/TecnoIA').then((m) => ({ default: m.TecnoIA })))

// Mecânico
const CascaMecanico = lazy(() => import('./mecanico/CascaMecanico').then((m) => ({ default: m.CascaMecanico })))
const PainelMecanico = lazy(() => import('./mecanico/PainelMecanico').then((m) => ({ default: m.PainelMecanico })))
const AtendimentoMecanico = lazy(() => import('./mecanico/AtendimentoMecanico').then((m) => ({ default: m.AtendimentoMecanico })))
const HistoricoMecanico = lazy(() => import('./mecanico/HistoricoMecanico').then((m) => ({ default: m.HistoricoMecanico })))
const PerfilMecanico = lazy(() => import('./mecanico/PerfilMecanico').then((m) => ({ default: m.PerfilMecanico })))
const CatalogoMecanico = lazy(() => import('./mecanico/Consultas').then((m) => ({ default: m.CatalogoMecanico })))
const ListaOS = lazy(() => import('./mecanico/os/ListaOS').then((m) => ({ default: m.ListaOS })))
const DetalheOS = lazy(() => import('./mecanico/os/DetalheOS').then((m) => ({ default: m.DetalheOS })))
const NovoChamadoMecanico = lazy(() => import('./mecanico/NovoChamado').then((m) => ({ default: m.NovoChamadoMecanico })))
const NovaOSMecanico = lazy(() => import('./mecanico/os/NovaOS').then((m) => ({ default: m.NovaOSMecanico })))
const TecnoIAMecanico = lazy(() => import('./mecanico/TecnoIA').then((m) => ({ default: m.TelaTecnoIA })))

export function AppSOS() {
  return (
    <Suspense fallback={<TelaCarregandoApp />}>
      <Routes>
        {/* Públicas — valem com ou sem login. */}
        <Route path="/acompanhar/:token" element={<Acompanhar />} />
        <Route path="/nova-senha" element={<NovaSenha />} />
        {/* LGPD: termos e política abrem antes do cadastro; a despedida, depois da conta apagada. */}
        <Route path="/termos" element={<PaginaLegal tipo="termos" />} />
        <Route path="/privacidade" element={<PaginaLegal tipo="privacidade" />} />
        <Route path="/conta-excluida" element={<ContaExcluida />} />

        {/* Duas portas: cliente e mecânico têm telas de entrada diferentes. */}
        <Route path="/entrar" element={<SoVisitante><Entrar perfil="cliente" /></SoVisitante>} />
        <Route path="/mecanico/entrar" element={<SoVisitante equipe><Entrar perfil="mecanico" /></SoVisitante>} />
        <Route path="/mecanico" element={<Navigate to="/mecanico/entrar" replace />} />
        <Route path="/cadastro" element={<SoVisitante><Cadastro /></SoVisitante>} />
        <Route path="/esqueci-senha" element={<SoVisitante><EsqueciSenha /></SoVisitante>} />

        <Route path="/*" element={<PorPapel />} />
      </Routes>
    </Suspense>
  )
}

const EH_EQUIPE = new Set(['mecanico', 'equipe', 'equipe_pendente'])

/**
 * Tela de entrada/cadastro: quem já está logado segue para o app. Na porta do
 * mecânico, conta de cliente não passa: a sessão é encerrada e a tela explica.
 */
function SoVisitante({ children, equipe = false }: { children: ReactNode; equipe?: boolean }) {
  const { papel, papelConta, carregando, sair, podeTrocarModo, modo, trocarModo } = useSessao()
  const local = useLocation()
  const contaDeCliente = equipe && !!papelConta && papelConta.papel !== 'anonimo' && !EH_EQUIPE.has(papelConta.papel)
  // Já logado e é da equipe: a porta escolhida decide a experiência.
  const modoDaPorta = equipe ? 'mecanico' : 'cliente'
  const trocar = podeTrocarModo && modo !== modoDaPorta && local.pathname.endsWith('/entrar')

  useEffect(() => {
    if (!contaDeCliente) return
    avisarContaNaoEquipe()
    void sair()
  }, [contaDeCliente, sair])

  useEffect(() => {
    if (trocar) trocarModo(modoDaPorta)
  }, [trocar, modoDaPorta, trocarModo])

  if (carregando || contaDeCliente || trocar) return <TelaCarregandoApp />
  if (papel && papel.papel !== 'anonimo') {
    const volta = (local.state as { de?: string } | null)?.de
    return <Navigate to={volta && !volta.endsWith('/entrar') ? volta : '/'} replace />
  }
  return <>{children}</>
}

function PorPapel() {
  const { papel, carregando, erroPapel, recarregarPapel, sair } = useSessao()
  const local = useLocation()

  if (carregando) return <TelaCarregandoApp />
  if (erroPapel) return <TelaCarregandoApp erro={erroPapel.message} aoTentar={() => void recarregarPapel()} aoSair={() => void sair()} />
  if (!papel || papel.papel === 'anonimo') return <Navigate to={rotaDeEntrada()} replace state={{ de: local.pathname + local.search }} />

  switch (papel.papel) {
    case 'novo':
      return <CompletarCadastro />
    case 'equipe_pendente':
    case 'equipe':
      return <TelaEquipe />
    case 'cliente':
      return (
        <Routes>
          <Route element={<CascaCliente />}>
            <Route index element={<HomeCliente />} />
            <Route path="chamados" element={<MeusChamados />} />
            <Route path="veiculos" element={<MeusVeiculos />} />
            <Route path="historico" element={<Historico />} />
            <Route path="revisoes" element={<Revisoes />} />
            <Route path="contato" element={<Contato />} />
            <Route path="perfil" element={<PerfilCliente />} />
            <Route path="notificacoes" element={<Notificacoes />} />
          </Route>
          {/* Tela cheia, sem a barra de navegação: pedir socorro, acompanhar e a
              conversa da TECNO IA (o campo de mensagem ocupa o rodapé; o SOS fica no topo). */}
          <Route path="sos" element={<FluxoSOS />} />
          <Route path="chamado/:id" element={<ChamadoCliente />} />
          <Route path="tecno-ia" element={<TecnoIA />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )
    case 'mecanico':
      return (
        <Routes>
          <Route element={<CascaMecanico />}>
            <Route index element={<PainelMecanico />} />
            <Route path="chamados" element={<HistoricoMecanico />} />
            <Route path="perfil" element={<PerfilMecanico />} />
            <Route path="notificacoes" element={<Notificacoes />} />
            {/* Atalhos do início: consulta do cadastro, OS e a Tecno IA técnica. */}
            <Route path="catalogo/:tipo" element={<CatalogoMecanico />} />
            {/* OS do sistema Tecnoar: as do mecânico, abertas e encerradas. */}
            <Route path="os" element={<ListaOS />} />
            <Route path="os/:id" element={<DetalheOS />} />
            <Route path="tecno-ia" element={<TecnoIAMecanico />} />
          </Route>
          <Route path="chamado/:id" element={<AtendimentoMecanico />} />
          {/* Chamado aberto pelo próprio mecânico (além de aceitar os da fila). */}
          <Route path="novo-chamado" element={<NovoChamadoMecanico />} />
          {/* OS aberta no app: cliente buscado ou cadastrado na hora, em tela cheia. */}
          <Route path="os/nova" element={<NovaOSMecanico />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )
  }
}
