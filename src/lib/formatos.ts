/** Máscaras, validações e formatação de documentos brasileiros. */

export const somenteDigitos = (v: string) => (v ?? '').replace(/\D/g, '')

export function mascaraCPF(v: string): string {
  const d = somenteDigitos(v).slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export function mascaraCNPJ(v: string): string {
  const d = somenteDigitos(v).slice(0, 14)
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

export function mascaraDocumento(v: string): string {
  return somenteDigitos(v).length > 11 ? mascaraCNPJ(v) : mascaraCPF(v)
}

/**
 * Inscrição estadual.
 *
 * O formato muda de estado para estado, então agrupamos de três em três, que
 * é como São Paulo e a maioria imprime. Quem tiver letra ou formato próprio
 * passa direto — melhor mostrar como foi digitado do que mascarar errado.
 */
export function mascaraInscricaoEstadual(v: string): string {
  const bruto = (v ?? '').trim()
  if (!bruto) return ''
  const d = somenteDigitos(bruto)
  if (d.length !== bruto.replace(/\D/g, '').length || d.length < 8 || d.length > 14) return bruto
  return d.replace(/(\d{3})(?=\d)/g, '$1.')
}

export function mascaraCEP(v: string): string {
  const d = somenteDigitos(v).slice(0, 8)
  return d.replace(/(\d{5})(\d)/, '$1-$2')
}

export function mascaraTelefone(v: string): string {
  const d = somenteDigitos(v).slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2')
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2')
}

export function mascaraPlaca(v: string): string {
  const s = (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7)
  if (s.length <= 3) return s
  return `${s.slice(0, 3)}-${s.slice(3)}`
}

export function validarCPF(valor: string): boolean {
  const d = somenteDigitos(valor)
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  const digito = (ate: number) => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * (ate + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10])
}

export function validarCNPJ(valor: string): boolean {
  const d = somenteDigitos(valor)
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const calcular = (ate: number) => {
    const pesos = ate === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(d[i]) * pesos[i]!
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return calcular(12) === Number(d[12]) && calcular(13) === Number(d[13])
}

export function validarDocumento(valor: string, tipo: 'fisica' | 'juridica'): boolean {
  return tipo === 'fisica' ? validarCPF(valor) : validarCNPJ(valor)
}

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function moeda(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return MOEDA.format(v)
}

export function numeroBR(v: number | null | undefined, casas = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
}

/** Converte '1.234,56' ou '1234.56' em número. Devolve null quando vazio. */
export function paraNumero(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const limpo = v.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

export const UFS = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI',
  'RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const

const fmtData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function data(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso)
  return Number.isNaN(d.getTime()) ? '—' : fmtData.format(d)
}
