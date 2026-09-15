import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Leitura de placa (ALPR/OCR).
 *
 * O navegador manda a imagem e recebe texto. A chave do provedor fica aqui,
 * em variável de ambiente da função — nunca no frontend, nunca no banco lido
 * pelo cliente.
 *
 * Provedor atual: Plate Recognizer (`PLACA_PROVEDOR=plate_recognizer`).
 * Para trocar, implemente outra função `lerCom*` e aponte a variável:
 * - Plate Recognizer .... https://api.platerecognizer.com/v1/plate-reader/
 * - OpenALPR / Rekor .... https://api.openalpr.com/v3/recognize
 * - Google Vision ....... https://vision.googleapis.com/v1/images:annotate
 * - AWS Rekognition ..... DetectText
 * - Azure AI Vision ..... /imageanalysis:analyze?features=read
 *
 * Sem chave configurada a função devolve `nao_configurado` e a tela cai na
 * digitação manual. Ela nunca chuta uma placa.
 */

const URL_SB = Deno.env.get('SUPABASE_URL')!
const CHAVE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const PROVEDOR = (Deno.env.get('PLACA_PROVEDOR') ?? '').trim()
const CHAVE_PROVEDOR = (Deno.env.get('PLACA_API_KEY') ?? '').trim()

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_BYTES = 6 * 1024 * 1024

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

/** Placa brasileira, nos dois padrões, sem separador. */
const ANTIGO = /^[A-Z]{3}[0-9]{4}$/
const MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/

function normalizar(v: string): string {
  return (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function valida(v: string): boolean {
  return ANTIGO.test(v) || MERCOSUL.test(v)
}

interface Leitura {
  placa: string
  confianca: number
  provedor: string
}

async function lerComPlateRecognizer(base64: string): Promise<Leitura | null> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const form = new FormData()
  form.append('upload', new Blob([bytes]), 'placa.jpg')
  form.append('regions', 'br')

  const r = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
    method: 'POST',
    headers: { Authorization: `Token ${CHAVE_PROVEDOR}` },
    body: form,
  })
  if (!r.ok) return null

  const corpo = await r.json() as { results?: Array<{ plate?: string; score?: number }> }
  const melhor = (corpo.results ?? [])
    .map((x) => ({ placa: normalizar(String(x.plate ?? '')), score: Number(x.score ?? 0) }))
    .filter((x) => x.placa.length === 7)
    .sort((a, b) => b.score - a.score)[0]

  if (!melhor) return null
  return { placa: melhor.placa, confianca: melhor.score, provedor: 'plate_recognizer' }
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

  /* Quem abre OS pode ler placa. */
  const { data: autorizado } = await comoUsuario.rpc('tem_permissao', {
    p_recurso: 'recepcao',
    p_acao: 'criar',
  })
  if (autorizado !== true) return resposta({ erro: 'Seu perfil não permite esta ação.' }, 403)

  if (!PROVEDOR || !CHAVE_PROVEDOR) {
    return resposta({
      erro: 'Nenhum serviço de leitura de placa foi configurado neste ambiente.',
      codigo: 'nao_configurado',
    })
  }

  let corpo: { imagem?: string }
  try {
    corpo = await req.json()
  } catch {
    return resposta({ erro: 'Corpo inválido.' }, 400)
  }

  const base64 = (corpo.imagem ?? '').replace(/^data:[^,]+,/, '')
  if (!base64) return resposta({ erro: 'Nenhuma imagem recebida.' }, 400)
  if (base64.length * 0.75 > MAX_BYTES) {
    return resposta({ erro: 'Imagem maior que 6 MB. Tire a foto mais de perto.' }, 400)
  }

  try {
    let leitura: Leitura | null = null
    if (PROVEDOR === 'plate_recognizer') leitura = await lerComPlateRecognizer(base64)
    else return resposta({ erro: `Provedor "${PROVEDOR}" não implementado nesta função.` })

    if (!leitura) {
      return resposta({ erro: 'Não foi possível identificar a placa nesta foto.' })
    }
    if (!valida(leitura.placa)) {
      /* Devolve mesmo assim: a tela corrige por posição e o operador confirma. */
      return resposta({ ...leitura, aviso: 'A leitura não bateu com os padrões brasileiros.' })
    }
    return resposta(leitura)
  } catch (e) {
    return resposta({ erro: `Falha ao falar com o serviço de leitura: ${String((e as Error)?.message ?? e)}` })
  }
})
