import { somenteDigitos } from './formatos'

/**
 * Consultas públicas de apoio ao preenchimento.
 *
 * São auxílio, nunca dependência: qualquer falha devolve `null` e o operador
 * segue preenchendo à mão. Nada é inventado quando o serviço não responde.
 */

const TEMPO_LIMITE = 8000

async function buscarJson<T>(url: string): Promise<T | null> {
  const controlador = new AbortController()
  const t = window.setTimeout(() => controlador.abort(), TEMPO_LIMITE)
  try {
    const r = await fetch(url, { signal: controlador.signal })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  } finally {
    window.clearTimeout(t)
  }
}

export interface EnderecoConsultado {
  cep: string
  logradouro: string
  bairro: string
  municipio: string
  uf: string
}

export async function consultarCEP(cep: string): Promise<EnderecoConsultado | null> {
  const d = somenteDigitos(cep)
  if (d.length !== 8) return null
  const r = await buscarJson<{
    cep: string
    street: string
    neighborhood: string
    city: string
    state: string
  }>(`https://brasilapi.com.br/api/cep/v2/${d}`)
  if (!r?.city) return null
  return {
    cep: d,
    logradouro: r.street ?? '',
    bairro: r.neighborhood ?? '',
    municipio: r.city,
    uf: r.state,
  }
}

export interface EmpresaConsultada {
  cnpj: string
  razao_social: string
  nome_fantasia: string
  email: string
  telefone: string
  cep: string
  logradouro: string
  numero: string
  complemento: string
  bairro: string
  municipio: string
  uf: string
  data_inicio: string
  situacao: string
}

export async function consultarCNPJ(cnpj: string): Promise<EmpresaConsultada | null> {
  const d = somenteDigitos(cnpj)
  if (d.length !== 14) return null
  const r = await buscarJson<Record<string, unknown>>(`https://brasilapi.com.br/api/cnpj/v1/${d}`)
  if (!r || !r.razao_social) return null
  const txt = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : '')
  return {
    cnpj: d,
    razao_social: txt('razao_social'),
    nome_fantasia: txt('nome_fantasia'),
    email: txt('email'),
    telefone: txt('ddd_telefone_1'),
    cep: somenteDigitos(txt('cep')),
    logradouro: [txt('descricao_tipo_de_logradouro'), txt('logradouro')].filter(Boolean).join(' ').trim(),
    numero: txt('numero'),
    complemento: txt('complemento'),
    bairro: txt('bairro'),
    municipio: txt('municipio'),
    uf: txt('uf'),
    data_inicio: txt('data_inicio_atividade'),
    situacao: txt('descricao_situacao_cadastral'),
  }
}
