import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/tipos/db'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error(
    'Configuração ausente: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo .env.',
  )
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'tecnoar.auth',
    flowType: 'pkce',
  },
})

/*
 * Funções do servidor (IA, Omie, placa…) validam a sessão no Auth. Se ela foi
 * encerrada em outro lugar (sair em outra aba, senha trocada), o token local
 * ainda parece válido e a função responde 401 "Sessão inválida". Renova a
 * sessão e tenta uma vez; se não houver como renovar, sai para a tela de entrada.
 */
const invocarOriginal = supabase.functions.invoke.bind(supabase.functions)
supabase.functions.invoke = (async (nome: string, opcoes?: Parameters<typeof invocarOriginal>[1]) => {
  const r = await invocarOriginal(nome, opcoes)
  const status = (r.error as { context?: Response } | null)?.context?.status
  if (status !== 401) return r
  const { data, error } = await supabase.auth.refreshSession()
  if (error || !data.session) {
    await supabase.auth.signOut({ scope: 'local' })
    return r
  }
  return invocarOriginal(nome, opcoes)
}) as typeof supabase.functions.invoke

/**
 * Acesso a uma tabela cujo nome só é conhecido em tempo de execução
 * (componentes genéricos de cadastro). Perde a tipagem por coluna de
 * propósito — use as tabelas tipadas sempre que o nome for fixo.
 */
export function tabelaDinamica(nome: string) {
  return (supabase as unknown as SupabaseClient).from(nome)
}
