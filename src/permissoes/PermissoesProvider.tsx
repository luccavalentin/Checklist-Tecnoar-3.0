import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/AuthProvider'
import type { AcaoPermissao } from '@/tipos/db'

interface CtxPermissoes {
  /** Conjunto efetivo, no formato `recurso:acao`. */
  concedidas: Set<string>
  carregando: boolean
  erro: boolean
  pode: (recurso: string, acao: AcaoPermissao) => boolean
  /** Atalho: alguma ação concedida sobre o recurso. */
  podeVer: (recurso: string) => boolean
  recarregar: () => void
}

const Ctx = createContext<CtxPermissoes | null>(null)

export function ProvedorPermissoes({ children }: { children: ReactNode }) {
  const { usuario } = useAuth()

  const consulta = useQuery({
    queryKey: ['minhas-permissoes', usuario?.id, usuario?.perfil_id, usuario?.is_admin],
    enabled: Boolean(usuario?.id),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.rpc('minhas_permissoes')
      if (error) throw error
      return new Set((data ?? []).map((p) => `${p.recurso}:${p.acao}`))
    },
  })

  const concedidas = consulta.data ?? new Set<string>()
  const admin = Boolean(usuario?.is_admin && usuario.situacao === 'ativo')

  /* Administrador tem acesso total — inclusive a módulo novo cujo recurso
     ainda não chegou ao banco (o SOS antes da migração): ele precisa ver o
     item no menu para abrir a tela e saber o que falta ativar. No banco a
     RLS continua decidindo tudo. */
  const pode = useCallback(
    (recurso: string, acao: AcaoPermissao) => admin || concedidas.has(`${recurso}:${acao}`),
    [concedidas, admin],
  )

  const podeVer = useCallback((recurso: string) => pode(recurso, 'visualizar'), [pode])

  const valor = useMemo<CtxPermissoes>(
    () => ({
      concedidas,
      carregando: consulta.isLoading,
      erro: consulta.isError,
      pode,
      podeVer,
      recarregar: () => void consulta.refetch(),
    }),
    [concedidas, consulta, pode, podeVer],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function usePermissoes(): CtxPermissoes {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('usePermissoes precisa estar dentro de <ProvedorPermissoes>.')
  return ctx
}

/** Atalho para condicionar um trecho da interface a uma permissão. */
export function SePode({
  recurso,
  acao,
  children,
  alternativa = null,
}: {
  recurso: string
  acao: AcaoPermissao
  children: ReactNode
  alternativa?: ReactNode
}) {
  const { pode } = usePermissoes()
  return <>{pode(recurso, acao) ? children : alternativa}</>
}
