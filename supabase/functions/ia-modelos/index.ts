import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Lista os modelos que a chave configurada realmente enxerga.
 *
 * Existe para o seletor de modelo não ser uma lista fixa no código: fornecedor
 * lança e aposenta versão toda semana, e uma lista escrita à mão envelhece
 * antes de chegar na oficina — foi exatamente assim que a Tecnoar ficou
 * apontando para um `gemini-2.5-pro` que a conta não pode mais usar.
 *
 * A chave nunca sai do servidor: o navegador recebe só os nomes.
 */

const URL_SB = Deno.env.get('SUPABASE_URL')!
const CHAVE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const CHAVE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const so = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export interface Modelo {
  id: string
  rotulo: string
  /** Marca o que o fornecedor sinaliza como pré-lançamento. */
  previa: boolean
}

async function buscar(url: string, headers: HeadersInit): Promise<{ ok: boolean; json?: any; erro?: string }> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), 25000)
  try {
    const r = await fetch(url, { headers, signal: c.signal })
    const texto = await r.text()
    let json: any
    try {
      json = JSON.parse(texto)
    } catch {
      return { ok: false, erro: `Resposta inválida do provedor (HTTP ${r.status}).` }
    }
    if (!r.ok) {
      return { ok: false, erro: so(json?.error?.message) || `O provedor respondeu HTTP ${r.status}.` }
    }
    return { ok: true, json }
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    if (msg.includes('abort')) return { ok: false, erro: 'O provedor não respondeu dentro do tempo limite.' }
    return { ok: false, erro: `Não foi possível falar com o provedor: ${msg}` }
  } finally {
    clearTimeout(t)
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resposta({ erro: 'Método não suportado.' }, 405)

  const autorizacao = req.headers.get('Authorization') ?? ''
  if (!autorizacao) return resposta({ erro: 'Requisição sem autenticação.' }, 401)

  const comoUsuario = createClient(URL_SB, CHAVE_ANON, {
    global: { headers: { Authorization: autorizacao } },
    auth: { persistSession: false },
  })
  const { data: sessao } = await comoUsuario.auth.getUser()
  if (!sessao?.user) return resposta({ erro: 'Sessão inválida.' }, 401)

  const { data: autorizado } = await comoUsuario.rpc('tem_permissao', {
    p_recurso: 'tecnoar_ia',
    p_acao: 'configurar',
  })
  if (autorizado !== true) return resposta({ erro: 'Seu perfil não permite esta ação.' }, 403)

  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return resposta({ erro: 'Corpo inválido.' }, 400)
  }

  const provedor = so(corpo.provedor)
  if (!['anthropic', 'openai', 'gemini'].includes(provedor)) {
    return resposta({ erro: 'Provedor desconhecido.' }, 400)
  }

  const admin = createClient(URL_SB, CHAVE_SERVICO, { auth: { persistSession: false } })
  const { data: cfg } = await admin.from('integracoes').select('app_key').eq('provedor', provedor).maybeSingle()
  if (!cfg?.app_key) {
    return resposta({
      status: 'sem_chave',
      erro: 'Guarde a chave deste provedor primeiro — a lista de modelos vem da própria conta.',
      modelos: [],
    })
  }

  const chave = cfg.app_key as string
  let modelos: Modelo[] = []

  if (provedor === 'gemini') {
    const r = await buscar('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
      'x-goog-api-key': chave,
    })
    if (!r.ok) return resposta({ status: 'erro', erro: r.erro, modelos: [] })
    modelos = ((r.json?.models ?? []) as Array<Record<string, unknown>>)
      /* Só os que geram texto: embedding e imagem não servem ao canal. */
      .filter((m) => ((m.supportedGenerationMethods ?? []) as string[]).includes('generateContent'))
      .map((m) => {
        const id = so(m.name).replace(/^models\//, '')
        return { id, rotulo: so(m.displayName) || id, previa: /preview|exp/i.test(id) }
      })
  } else if (provedor === 'openai') {
    const r = await buscar('https://api.openai.com/v1/models', { Authorization: `Bearer ${chave}` })
    if (!r.ok) return resposta({ status: 'erro', erro: r.erro, modelos: [] })
    modelos = ((r.json?.data ?? []) as Array<Record<string, unknown>>)
      .map((m) => so(m.id))
      /* A conta lista dezenas de modelos de áudio, imagem e embedding. */
      .filter((id) => /^(gpt|o\d|chatgpt)/i.test(id) && !/(audio|realtime|image|tts|whisper|embedding|moderation)/i.test(id))
      .map((id) => ({ id, rotulo: id, previa: /preview/i.test(id) }))
  } else {
    const r = await buscar('https://api.anthropic.com/v1/models?limit=100', {
      'x-api-key': chave,
      'anthropic-version': '2023-06-01',
    })
    if (!r.ok) return resposta({ status: 'erro', erro: r.erro, modelos: [] })
    modelos = ((r.json?.data ?? []) as Array<Record<string, unknown>>).map((m) => {
      const id = so(m.id)
      return { id, rotulo: so(m.display_name) || id, previa: /preview/i.test(id) }
    })
  }

  /* Versão estável antes de prévia, e mais nova primeiro dentro de cada grupo. */
  modelos.sort((a, b) => {
    if (a.previa !== b.previa) return a.previa ? 1 : -1
    return b.id.localeCompare(a.id, 'en', { numeric: true })
  })

  return resposta({ status: 'ok', provedor, modelos })
})
