import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { LogOut, RefreshCw } from 'lucide-react'
import { useAuth } from './AuthProvider'
import { TelaCarregando } from '@/componentes/ui/Estados'
import { Botao } from '@/componentes/ui/Botao'
import { Aviso } from '@/componentes/ui/Aviso'
import { Logo } from '@/componentes/marca/Logo'

function TelaFalhaAcesso({
  titulo,
  children,
  aoTentarNovamente,
  aoSair,
}: {
  titulo: string
  children: ReactNode
  aoTentarNovamente: () => void
  aoSair: () => void
}) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-7 bg-canvas px-5">
      <Logo altura={52} />
      <div className="flex w-full max-w-md flex-col gap-4">
        <Aviso tom="critico" titulo={titulo}>
          {children}
        </Aviso>
        <div className="flex gap-2">
          <Botao variante="primario" iconeInicio={<RefreshCw />} onClick={aoTentarNovamente}>
            Tentar novamente
          </Botao>
          <Botao variante="neutro" iconeInicio={<LogOut />} onClick={aoSair}>
            Sair
          </Botao>
        </div>
      </div>
    </div>
  )
}

/** Barreira do sistema interno: sem sessão válida e conta ativa, não entra. */
export function RotaProtegida() {
  const {
    sessao,
    usuario,
    iniciando,
    carregandoPerfil,
    erroPerfil,
    sessaoIndisponivel,
    recarregarPerfil,
    reiniciarSessao,
    sair,
  } = useAuth()
  const local = useLocation()

  if (iniciando) return <TelaCarregando />

  // Sessão salva no aparelho que o servidor não conseguiu validar (offline):
  // erro honesto com nova tentativa, nunca carregamento indefinido.
  if (!sessao && sessaoIndisponivel) {
    return (
      <TelaFalhaAcesso
        titulo="Não foi possível validar sua sessão"
        aoTentarNovamente={() => void reiniciarSessao()}
        aoSair={() => void sair()}
      >
        {erroPerfil ?? 'O servidor não respondeu.'} Sua sessão continua salva neste aparelho — assim que a conexão
        voltar, toque em Tentar novamente.
      </TelaFalhaAcesso>
    )
  }

  if (!sessao) {
    return <Navigate to="/entrar" replace state={{ de: local.pathname + local.search }} />
  }

  if (carregandoPerfil && !usuario) return <TelaCarregando />

  if (erroPerfil) {
    return (
      <TelaFalhaAcesso
        titulo="Não foi possível carregar sua conta"
        aoTentarNovamente={() => void recarregarPerfil()}
        aoSair={() => void sair()}
      >
        {erroPerfil}
      </TelaFalhaAcesso>
    )
  }

  // Sessão válida, sem cadastro e sem erro declarado é estado inconsistente.
  if (!usuario) {
    return (
      <TelaFalhaAcesso
        titulo="Não foi possível carregar sua conta"
        aoTentarNovamente={() => void recarregarPerfil()}
        aoSair={() => void sair()}
      >
        O cadastro vinculado a esta sessão não pôde ser lido.
      </TelaFalhaAcesso>
    )
  }

  if (usuario.situacao !== 'ativo') return <Navigate to="/acesso-pendente" replace />

  return <Outlet />
}

/**
 * Telas de acesso. Quem já está autenticado e ativo não fica preso no login.
 * A definição de nova senha é exceção: o link de recuperação cria sessão
 * temporária e a tela precisa continuar acessível.
 */
export function RotaPublica() {
  const { sessao, usuario, iniciando } = useAuth()
  const { pathname } = useLocation()

  if (iniciando) return <TelaCarregando />

  const excecoes = ['/nova-senha', '/politica-de-privacidade']
  if (excecoes.includes(pathname)) return <Outlet />

  if (sessao && usuario?.situacao === 'ativo') return <Navigate to="/visao-geral" replace />
  if (sessao && usuario && usuario.situacao !== 'ativo' && pathname !== '/acesso-pendente') {
    return <Navigate to="/acesso-pendente" replace />
  }

  return <Outlet />
}

/** Tela de situação da conta: exige sessão, mas não exige conta liberada. */
export function RotaSituacao() {
  const { sessao, usuario, iniciando } = useAuth()

  if (iniciando) return <TelaCarregando />
  if (!sessao) return <Navigate to="/entrar" replace />
  if (usuario?.situacao === 'ativo') return <Navigate to="/visao-geral" replace />

  return <Outlet />
}
