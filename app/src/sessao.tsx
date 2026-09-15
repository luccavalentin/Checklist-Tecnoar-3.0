import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { sosMeuPapel } from '@/sos/api'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { MeuPapelSOS } from '@/sos/tipos'

/**
 * Sessão do app SOS.
 *
 * O login é o mesmo Supabase Auth do Checklist (mesmo domínio, mesma sessão):
 * o mecânico entra com o usuário que já tem; o cliente, com a conta criada
 * aqui. Quem é quem vem de `sos_meu_papel` — o app nunca decide sozinho.
 *
 * Quem é da equipe também pode usar o app como CLIENTE (modo cliente): o
 * `papel` exposto passa a ser a conta de cliente da mesma pessoa — ou "novo",
 * para ela completar o cadastro de cliente —, e todas as telas do cliente
 * funcionam sem saber disso. O modo fica guardado no aparelho.
 */

export type ModoApp = 'mecanico' | 'cliente'

interface CtxSessao {
  sessao: Session | null
  usuarioId: string | null
  email: string | null
  /** O papel em uso (já considerando o modo). */
  papel: MeuPapelSOS | undefined
  /** O papel da conta, sem o modo (equipe continua equipe no modo cliente). */
  papelConta: MeuPapelSOS | undefined
  carregando: boolean
  erroPapel: Error | null
  recarregarPapel: () => Promise<unknown>
  sair: () => Promise<void>
  /** Conta da equipe: pode alternar entre o app do mecânico e o do cliente. */
  podeTrocarModo: boolean
  modo: ModoApp
  trocarModo: (m: ModoApp) => void
}

const CHAVE_MODO = 'sos.modo'

function lerModo(): ModoApp {
  try {
    return localStorage.getItem(CHAVE_MODO) === 'cliente' ? 'cliente' : 'mecanico'
  } catch {
    return 'mecanico'
  }
}

function gravarModo(m: ModoApp) {
  try {
    if (m === 'cliente') localStorage.setItem(CHAVE_MODO, m)
    else localStorage.removeItem(CHAVE_MODO)
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

/** O papel que as telas enxergam, dado o modo escolhido. */
function papelNoModo(conta: MeuPapelSOS | undefined, modo: ModoApp, email: string | null): MeuPapelSOS | undefined {
  if (!conta || modo !== 'cliente' || (conta.papel !== 'mecanico' && conta.papel !== 'equipe')) return conta
  if (conta.cliente) return { papel: 'cliente', ...conta.cliente }
  // Ainda sem conta de cliente: cai no cadastro de cliente (o mesmo do app).
  return { papel: 'novo', nome: conta.nome, email: conta.email ?? email }
}

/**
 * Último papel conhecido, guardado no aparelho. Sem ele, abrir o app sem
 * sinal (na estrada, justo quando mais precisa) deixava a consulta parada e
 * mandava a pessoa para a tela de login. Com ele, o app abre no que ela já é
 * e confere com o banco assim que houver rede.
 */
const PREFIXO_PAPEL = 'sos.papel.'

function lerPapelGuardado(usuarioId: string | null): MeuPapelSOS | undefined {
  if (!usuarioId) return undefined
  try {
    const v = JSON.parse(localStorage.getItem(PREFIXO_PAPEL + usuarioId) ?? 'null') as MeuPapelSOS | null
    return v && typeof v === 'object' && 'papel' in v ? v : undefined
  } catch {
    return undefined
  }
}

function guardarPapel(usuarioId: string, papel: MeuPapelSOS) {
  try {
    localStorage.setItem(PREFIXO_PAPEL + usuarioId, JSON.stringify(papel))
  } catch {
    /* armazenamento cheio ou bloqueado */
  }
}

/**
 * Porta de entrada do aparelho: o cliente entra por `/entrar`, o mecânico por
 * `/mecanico/entrar` — telas e experiências diferentes. O aparelho lembra a
 * última porta usada para, ao sair, voltar para a mesma.
 */
const CHAVE_ENTRADA = 'sos.entrada'

export function rotaDeEntrada(): '/entrar' | '/mecanico/entrar' {
  try {
    return localStorage.getItem(CHAVE_ENTRADA) === 'mecanico' ? '/mecanico/entrar' : '/entrar'
  } catch {
    return '/entrar'
  }
}

export function lembrarEntrada(m: ModoApp) {
  try {
    localStorage.setItem(CHAVE_ENTRADA, m)
  } catch {
    /* sem armazenamento */
  }
}

/**
 * Aviso para a porta do mecânico: alguém entrou por ela com conta de cliente,
 * a sessão foi encerrada e a tela de login explica o motivo (uma vez).
 */
let avisoContaNaoEquipe = false
export function avisarContaNaoEquipe() {
  avisoContaNaoEquipe = true
}
export function consumirAvisoContaNaoEquipe(): boolean {
  const havia = avisoContaNaoEquipe
  avisoContaNaoEquipe = false
  return havia
}

/** Preferências do aparelho, não da pessoa: ficam mesmo depois de sair. */
const PREFERENCIAS_DO_APARELHO = ['sos.tema', 'sos.instalacao', 'sos.navegador', CHAVE_ENTRADA]

/**
 * Apaga do aparelho o que o app guardou da pessoa: papel (nome, telefone,
 * e-mail), rascunhos, pedido de SOS pendente (com GPS), conversas da IA,
 * modo cliente/mecânico. Ao sair, a fila do mecânico fica — são ações de
 * trabalho que ainda vão para o banco quando ele entrar de novo; ao excluir
 * a conta (LGPD), vai tudo.
 */
export function limparDadosLocais({ manterFilaDoMecanico }: { manterFilaDoMecanico: boolean }) {
  const apagar = (armazem: Storage) => {
    for (let i = armazem.length - 1; i >= 0; i--) {
      const k = armazem.key(i)
      if (!k?.startsWith('sos.')) continue
      if (PREFERENCIAS_DO_APARELHO.some((p) => k.startsWith(p))) continue
      if (manterFilaDoMecanico && k.startsWith('sos.fila.')) continue
      armazem.removeItem(k)
    }
  }
  try {
    apagar(localStorage)
    apagar(sessionStorage)
  } catch {
    /* sem armazenamento */
  }
}

const Ctx = createContext<CtxSessao | null>(null)

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [sessao, setSessao] = useState<Session | null>(null)
  const [iniciando, setIniciando] = useState(true)

  useEffect(() => {
    let vivo = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return
      setSessao(data.session)
      setIniciando(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_evento, s) => {
      setSessao(s)
      setIniciando(false)
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.papel })
    })
    return () => {
      vivo = false
      data.subscription.unsubscribe()
    }
  }, [qc])

  const usuarioId = sessao?.user.id ?? null
  const consulta = useQuery({
    queryKey: [...CHAVES_SOS.papel, usuarioId],
    enabled: Boolean(usuarioId),
    staleTime: 5 * 60_000,
    retry: 1,
    // Sem rede, tenta uma vez e segue com o papel guardado (não fica parada).
    networkMode: 'offlineFirst',
    initialData: () => lerPapelGuardado(usuarioId),
    // O guardado vale para abrir, mas é conferido com o banco logo em seguida.
    initialDataUpdatedAt: 0,
    queryFn: async () => {
      const p = await sosMeuPapel()
      if (usuarioId) guardarPapel(usuarioId, p)
      return p
    },
  })

  const [modo, setModo] = useState<ModoApp>(lerModo)

  const trocarModo = useCallback((m: ModoApp) => {
    gravarModo(m)
    lembrarEntrada(m)
    setModo(m)
    window.scrollTo(0, 0)
  }, [])

  const sair = useCallback(async () => {
    await supabase.auth.signOut()
    limparDadosLocais({ manterFilaDoMecanico: true })
    setModo('mecanico')
    qc.clear()
  }, [qc])

  const valor = useMemo<CtxSessao>(() => {
    const email = sessao?.user.email ?? null
    const papelConta: MeuPapelSOS | undefined = usuarioId ? consulta.data : { papel: 'anonimo' }
    const podeTrocarModo = papelConta?.papel === 'mecanico' || papelConta?.papel === 'equipe'
    const modoValido: ModoApp = podeTrocarModo ? modo : 'mecanico'
    return {
      sessao,
      usuarioId,
      email,
      papel: papelNoModo(papelConta, modoValido, email),
      papelConta,
      carregando: iniciando || (Boolean(usuarioId) && consulta.isLoading),
      // Com o papel guardado em mãos, falha de rede não trava o app.
      erroPapel: consulta.data ? null : ((consulta.error as Error) ?? null),
      recarregarPapel: () => consulta.refetch(),
      sair,
      podeTrocarModo,
      modo: modoValido,
      trocarModo,
    }
  }, [sessao, usuarioId, consulta, iniciando, sair, modo, trocarModo])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useSessao(): CtxSessao {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSessao precisa estar dentro de <ProvedorSessao>.')
  return ctx
}

/** Atalho para telas do cliente: garante o formato do papel. */
export function useCliente() {
  const { papel, ...resto } = useSessao()
  if (papel?.papel !== 'cliente') throw new Error('Tela de cliente aberta sem conta de cliente.')
  return { conta: papel, ...resto }
}

/** Atalho para telas do mecânico. */
export function useMecanico() {
  const { papel, ...resto } = useSessao()
  if (papel?.papel !== 'mecanico') throw new Error('Tela de mecânico aberta sem perfil de mecânico.')
  return { perfil: papel, ...resto }
}

/* ── tema do app ────────────────────────────────────────────────────────── */

type Tema = 'claro' | 'escuro' | 'sistema'
const CHAVE_TEMA = 'sos.tema'

export function lerTema(): Tema {
  try {
    const v = localStorage.getItem(CHAVE_TEMA)
    if (v === 'claro' || v === 'escuro' || v === 'sistema') return v
  } catch {
    /* sem armazenamento */
  }
  return 'claro'
}

export function aplicarTema(t: Tema) {
  try {
    localStorage.setItem(CHAVE_TEMA, t)
  } catch {
    /* sem armazenamento */
  }
  const escuro = t === 'escuro' || (t === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', escuro)
}
