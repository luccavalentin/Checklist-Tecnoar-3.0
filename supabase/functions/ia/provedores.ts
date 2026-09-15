/**
 * Camada de provedores de modelo.
 *
 * A função principal fala em "turnos" e "partes"; aqui isso vira o formato de
 * cada fornecedor. Trocar de Anthropic para OpenAI ou Gemini não muda uma
 * linha do fluxo de negócio — só o tradutor abaixo.
 *
 * O nome do modelo é texto livre de propósito: versão nova sai toda semana e
 * não pode depender de deploy para ser usada.
 */

export type Provedor = 'anthropic' | 'openai' | 'gemini'

export type Parte =
  | { kind: 'texto'; texto: string }
  | { kind: 'imagem'; mime: string; dados: string }
  | { kind: 'pdf'; mime: string; dados: string }

export interface Turno {
  papel: 'usuario' | 'assistente'
  partes: Parte[]
}

export interface Pedido {
  provedor: Provedor
  modelo: string
  chave: string
  sistema: string
  turnos: Turno[]
  maxTokens: number
}

export type Resultado =
  | { ok: true; texto: string; entrada: number | null; saida: number | null }
  | { ok: false; erro: string }

const TEMPO_LIMITE = 180000

async function pedir(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; json: any } | { erro: string }> {
  const controlador = new AbortController()
  const t = setTimeout(() => controlador.abort(), TEMPO_LIMITE)
  try {
    const r = await fetch(url, { ...init, signal: controlador.signal })
    const texto = await r.text()
    let json: any
    try {
      json = JSON.parse(texto)
    } catch {
      return { erro: `Resposta inválida do provedor (HTTP ${r.status}).` }
    }
    return { ok: r.ok, status: r.status, json }
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    if (msg.includes('abort')) return { erro: 'O provedor não respondeu dentro do tempo limite.' }
    return { erro: `Não foi possível falar com o provedor: ${msg}` }
  } finally {
    clearTimeout(t)
  }
}

/* --------------------------------------------------------- Anthropic */

async function anthropic(p: Pedido): Promise<Resultado> {
  const messages = p.turnos.map((t) => ({
    role: t.papel === 'assistente' ? 'assistant' : 'user',
    content: t.partes.map((parte) => {
      if (parte.kind === 'texto') return { type: 'text', text: parte.texto }
      if (parte.kind === 'pdf') {
        return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: parte.dados } }
      }
      return { type: 'image', source: { type: 'base64', media_type: parte.mime, data: parte.dados } }
    }),
  }))

  const r = await pedir('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': p.chave,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: p.modelo, max_tokens: p.maxTokens, system: p.sistema, messages }),
  })
  if ('erro' in r) return { ok: false, erro: r.erro }
  if (!r.ok) return { ok: false, erro: String(r.json?.error?.message ?? `O provedor respondeu HTTP ${r.status}.`) }

  const texto = (r.json.content ?? [])
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('\n')
  return { ok: true, texto, entrada: r.json.usage?.input_tokens ?? null, saida: r.json.usage?.output_tokens ?? null }
}

/* ------------------------------------------------------------ OpenAI */

async function openai(p: Pedido): Promise<Resultado> {
  const messages: unknown[] = [{ role: 'system', content: p.sistema }]
  for (const t of p.turnos) {
    messages.push({
      role: t.papel === 'assistente' ? 'assistant' : 'user',
      content: t.partes.map((parte) => {
        if (parte.kind === 'texto') return { type: 'text', text: parte.texto }
        /* PDF é barrado antes de chegar aqui; só imagem passa. */
        return { type: 'image_url', image_url: { url: `data:${parte.mime};base64,${parte.dados}` } }
      }),
    })
  }

  const r = await pedir('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${p.chave}` },
    body: JSON.stringify({ model: p.modelo, max_completion_tokens: p.maxTokens, messages }),
  })
  if ('erro' in r) return { ok: false, erro: r.erro }
  if (!r.ok) return { ok: false, erro: String(r.json?.error?.message ?? `O provedor respondeu HTTP ${r.status}.`) }

  const texto = String(r.json.choices?.[0]?.message?.content ?? '')
  return {
    ok: true,
    texto,
    entrada: r.json.usage?.prompt_tokens ?? null,
    saida: r.json.usage?.completion_tokens ?? null,
  }
}

/* ------------------------------------------------------------ Gemini */

async function gemini(p: Pedido): Promise<Resultado> {
  const contents = p.turnos.map((t) => ({
    role: t.papel === 'assistente' ? 'model' : 'user',
    parts: t.partes.map((parte) =>
      parte.kind === 'texto'
        ? { text: parte.texto }
        : { inline_data: { mime_type: parte.kind === 'pdf' ? 'application/pdf' : parte.mime, data: parte.dados } },
    ),
  }))

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(p.modelo)}:generateContent`
  const r = await pedir(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': p.chave },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: p.sistema }] },
      generationConfig: { maxOutputTokens: p.maxTokens },
    }),
  })
  if ('erro' in r) return { ok: false, erro: r.erro }
  if (!r.ok) return { ok: false, erro: String(r.json?.error?.message ?? `O provedor respondeu HTTP ${r.status}.`) }

  const candidato = r.json.candidates?.[0]
  const texto = (candidato?.content?.parts ?? []).map((x: any) => x?.text ?? '').join('\n')
  if (!texto && candidato?.finishReason && candidato.finishReason !== 'STOP') {
    return { ok: false, erro: `O provedor interrompeu a resposta (${candidato.finishReason}).` }
  }
  return {
    ok: true,
    texto,
    entrada: r.json.usageMetadata?.promptTokenCount ?? null,
    saida: r.json.usageMetadata?.candidatesTokenCount ?? null,
  }
}

export function chamar(p: Pedido): Promise<Resultado> {
  if (p.provedor === 'openai') return openai(p)
  if (p.provedor === 'gemini') return gemini(p)
  return anthropic(p)
}
