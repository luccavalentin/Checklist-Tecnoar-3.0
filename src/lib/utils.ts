import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...entradas: ClassValue[]) {
  return twMerge(clsx(entradas))
}

/** Iniciais para avatar. Retorna '—' quando não há nome real. */
export function iniciais(nome?: string | null): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '—'
  if (partes.length === 1) return partes[0]!.slice(0, 2).toUpperCase()
  return (partes[0]![0]! + partes[partes.length - 1]![0]!).toUpperCase()
}

export function primeiroNome(nome?: string | null): string {
  const p = (nome ?? '').trim().split(/\s+/).filter(Boolean)
  return p[0] ?? ''
}

const fmtDataHora = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function dataHora(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : fmtDataHora.format(d)
}

export function tempoRelativo(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return '—'
  const seg = Math.round((d - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
  const escalas: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.35],
    ['month', 12],
    ['year', Number.POSITIVE_INFINITY],
  ]
  let valor = seg
  for (const [unidade, limite] of escalas) {
    if (Math.abs(valor) < limite) return rtf.format(Math.round(valor), unidade)
    valor = valor / limite
  }
  return rtf.format(Math.round(valor), 'year')
}

/**
 * Traduz erros do Supabase Auth para mensagens claras em português.
 * Nunca inventa causa: o que não for reconhecido volta com a mensagem original.
 */
export function mensagemErroAuth(erro: unknown): string {
  const bruto =
    erro && typeof erro === 'object' && 'message' in erro ? String((erro as Error).message) : String(erro ?? '')
  const m = bruto.toLowerCase()

  if (m.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar. Verifique a caixa de entrada.'
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'Já existe uma conta com este e-mail.'
  if (m.includes('password should be at least')) return 'A senha é curta demais. Use ao menos 8 caracteres.'
  if (m.includes('same password') || m.includes('should be different'))
    return 'A nova senha precisa ser diferente da anterior.'
  if (m.includes('is invalid') && m.includes('email')) return 'E-mail inválido ou de domínio não aceito pelo servidor.'
  if (m.includes('signups not allowed') || m.includes('signup is disabled'))
    return 'A criação de contas está desativada no servidor. Fale com o administrador.'
  if (m.includes('error sending') && m.includes('email'))
    return 'Não foi possível enviar o e-mail. Verifique a configuração de envio com o administrador.'
  if (m.includes('email rate limit') || m.includes('rate limit') || m.includes('too many'))
    return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.'
  if (m.includes('token has expired') || m.includes('invalid') && m.includes('token'))
    return 'Este link expirou ou já foi usado. Solicite a recuperação novamente.'
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed'))
    return 'Sem conexão com o servidor. Verifique a internet e tente novamente.'

  return bruto || 'Não foi possível concluir a operação.'
}

export function mensagemErro(erro: unknown): string {
  if (erro && typeof erro === 'object' && 'message' in erro) {
    const m = String((erro as Error).message)
    if (m.toLowerCase().includes('failed to fetch')) return 'Sem conexão com o servidor.'
    return m
  }
  return 'Ocorreu um erro inesperado.'
}

/**
 * Dispara uma consulta do Supabase que não bloqueia a interface.
 *
 * O construtor de consultas do supabase-js é preguiçoso: só executa quando
 * alguém chama `.then()`. Escrever `void supabase.from(...).update(...)`
 * descarta a expressão sem nunca disparar a requisição — a escrita
 * simplesmente não acontece. Este helper garante a execução e registra a
 * falha em vez de deixá-la invisível.
 */
export function emSegundoPlano(
  consulta: PromiseLike<{ error: { message: string } | null }>,
  contexto: string,
): void {
  Promise.resolve(consulta).then(
    (r) => {
      if (r?.error) console.warn(`[Tecnoar] ${contexto}: ${r.error.message}`)
    },
    (e: unknown) => console.warn(`[Tecnoar] ${contexto}:`, e),
  )
}
