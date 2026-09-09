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

/**
 * Acesso a uma tabela cujo nome só é conhecido em tempo de execução
 * (componentes genéricos de cadastro). Perde a tipagem por coluna de
 * propósito — use as tabelas tipadas sempre que o nome for fixo.
 */
export function tabelaDinamica(nome: string) {
  return (supabase as unknown as SupabaseClient).from(nome)
}
