import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { emSegundoPlano } from '@/lib/utils'
import type { UsuarioComPerfil } from '@/tipos/db'

interface CtxAuth {
  sessao: Session | null
  usuario: UsuarioComPerfil | null
  /** true enquanto a sessão inicial ainda não foi resolvida. */
  iniciando: boolean
  /** true enquanto o cadastro do usuário está sendo buscado. */
  carregandoPerfil: boolean
  /** Falha ao carregar sessão ou cadastro (rede/servidor). */
  erroPerfil: string | null
  /** Há sessão salva no aparelho, mas o servidor não respondeu para validá-la. */
  sessaoIndisponivel: boolean
  recarregarPerfil: () => Promise<void>
  reiniciarSessao: () => Promise<void>
  sair: () => Promise<void>
}

const Ctx = createContext<CtxAuth | null>(null)

const SELECT_USUARIO =
  '*, perfil:perfis_acesso ( id, nome ), funcao:funcoes ( id, nome, atua_como_mecanico, atua_no_laboratorio )'
const LIMITE_SESSAO_MS = 6000

/** Existe sessão persistida neste aparelho, mesmo que ainda não validada. */
function existeSessaoArmazenada(): boolean {
  try {
    const bruto = localStorage.getItem('tecnoar.auth')
    if (!bruto) return false
    const v = JSON.parse(bruto)
    return Boolean(v?.access_token || v?.refresh_token)
  } catch {
    return false
  }
}

/** Sem rede o aparelho já sabe que a requisição não vai concluir: falha rápido. */
function limiteAtual(): number {
  return typeof navigator !== 'undefined' && !navigator.onLine ? 1200 : LIMITE_SESSAO_MS
}

function comLimiteDeTempo<T>(p: PromiseLike<T>, ms: number): Promise<T | 'tempo-esgotado'> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<'tempo-esgotado'>((r) => window.setTimeout(() => r('tempo-esgotado'), ms)),
  ])
}

export function ProvedorAuth({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [usuario, setUsuario] = useState<UsuarioComPerfil | null>(null)
  const [iniciando, setIniciando] = useState(true)
  const [carregandoPerfil, setCarregandoPerfil] = useState(false)
  const [erroPerfil, setErroPerfil] = useState<string | null>(null)
  const [sessaoIndisponivel, setSessaoIndisponivel] = useState(false)
  const acessoRegistrado = useRef<string | null>(null)
  const vivo = useRef(true)

  const carregarPerfil = useCallback(async (idUsuario: string) => {
    setErroPerfil(null)
    setCarregandoPerfil(true)

    let data: unknown = null
    try {
      const resposta = await comLimiteDeTempo(
        supabase.from('usuarios').select(SELECT_USUARIO).eq('id', idUsuario).maybeSingle(),
        limiteAtual(),
      )
      if (resposta === 'tempo-esgotado') throw new Error('failed to fetch')
      if (resposta.error) throw resposta.error
      data = resposta.data
    } catch (e) {
      // Falha de rede rejeita a promessa; falha do Postgres volta em `error`.
      // Nos dois casos o estado precisa terminar em erro visível, nunca em
      // carregamento indefinido.
      if (!vivo.current) return
      setUsuario(null)
      setErroPerfil(
        String((e as Error)?.message ?? '')
          .toLowerCase()
          .includes('failed to fetch')
          ? 'Sem conexão com o servidor.'
          : 'Não foi possível carregar seu cadastro.',
      )
      setCarregandoPerfil(false)
      return
    }

    if (!vivo.current) return
    setCarregandoPerfil(false)

    if (!data) {
      setUsuario(null)
      setErroPerfil('Sua conta autenticou, mas não há cadastro correspondente no sistema.')
      return
    }

    setUsuario(data as UsuarioComPerfil)

    // Carimba o último acesso uma vez por sessão. Falha aqui não bloqueia o login.
    if (acessoRegistrado.current !== idUsuario) {
      acessoRegistrado.current = idUsuario
      emSegundoPlano(
        supabase.from('usuarios').update({ ultimo_acesso_em: new Date().toISOString() }).eq('id', idUsuario),
        'registro de último acesso',
      )
    }
  }, [])

  /**
   * Resolve a sessão inicial com limite de tempo.
   *
   * Sem rede, `getSession()` pode ficar preso tentando renovar o token. Sem
   * este limite a aplicação abriria em carregamento infinito — exatamente o
   * que o sistema não pode fazer.
   */
  const iniciarSessao = useCallback(async () => {
    setIniciando(true)
    setSessaoIndisponivel(false)
    setErroPerfil(null)

    const r = await comLimiteDeTempo(supabase.auth.getSession(), limiteAtual())
    if (!vivo.current) return

    if (r === 'tempo-esgotado') {
      if (existeSessaoArmazenada()) {
        setSessaoIndisponivel(true)
        setErroPerfil('Sem conexão com o servidor.')
      }
      setIniciando(false)
      return
    }

    setSessao(r.data.session)
    if (r.data.session?.user) await carregarPerfil(r.data.session.user.id)
    if (vivo.current) setIniciando(false)
  }, [carregarPerfil])

  useEffect(() => {
    vivo.current = true
    void iniciarSessao()

    const { data: sub } = supabase.auth.onAuthStateChange((evento, novaSessao) => {
      if (!vivo.current) return
      setSessao(novaSessao)

      if (evento === 'SIGNED_OUT' || !novaSessao?.user) {
        setUsuario(null)
        setErroPerfil(null)
        setCarregandoPerfil(false)
        setSessaoIndisponivel(false)
        acessoRegistrado.current = null
        setIniciando(false)
        return
      }

      if (evento === 'SIGNED_IN' || evento === 'USER_UPDATED' || evento === 'INITIAL_SESSION') {
        setSessaoIndisponivel(false)
        setIniciando(false)
        void carregarPerfil(novaSessao.user.id)
      }
    })

    return () => {
      vivo.current = false
      sub.subscription.unsubscribe()
    }
  }, [iniciarSessao, carregarPerfil])

  const recarregarPerfil = useCallback(async () => {
    if (sessao?.user) await carregarPerfil(sessao.user.id)
    else await iniciarSessao()
  }, [sessao, carregarPerfil, iniciarSessao])

  const reiniciarSessao = useCallback(async () => {
    await iniciarSessao()
  }, [iniciarSessao])

  const sair = useCallback(async () => {
    await supabase.auth.signOut().catch(() => undefined)
    setSessao(null)
    setUsuario(null)
    setErroPerfil(null)
    setSessaoIndisponivel(false)
    acessoRegistrado.current = null
  }, [])

  const valor = useMemo<CtxAuth>(
    () => ({
      sessao,
      usuario,
      iniciando,
      carregandoPerfil,
      erroPerfil,
      sessaoIndisponivel,
      recarregarPerfil,
      reiniciarSessao,
      sair,
    }),
    [
      sessao,
      usuario,
      iniciando,
      carregandoPerfil,
      erroPerfil,
      sessaoIndisponivel,
      recarregarPerfil,
      reiniciarSessao,
      sair,
    ],
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useAuth(): CtxAuth {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <ProvedorAuth>.')
  return ctx
}
