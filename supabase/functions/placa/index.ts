import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { chamar, type Provedor } from '../ia/provedores.ts'

/**
 * Leitura de placa e do documento do veículo (CRLV) por foto.
 *
 * O navegador manda a imagem e recebe campos. A chave nunca sai do servidor.
 *
 * Provedor padrão: `ia` — a mesma Tecnoar IA já configurada na central
 * (provedor, modelo e chave saem de `ia_config` + `integracoes`). Não há
 * contrato novo para assinar nem chave nova para guardar: se a IA do sistema
 * funciona, a leitura de placa funciona.
 *
 * Ler foto exige um modelo com visão. Se a central estiver num modelo de
 * texto, `PLACA_MODELO` aponta um modelo com visão só para esta função, sem
 * mexer no resto da IA — e, sem isso, a resposta diz exatamente o que trocar.
 *
 * Alternativa: `PLACA_PROVEDOR=plate_recognizer` com `PLACA_API_KEY`, um ALPR
 * dedicado que só lê placa (não lê documento). Vale quando a foto é ruim de
 * verdade — campo, chuva, noite.
 *
 * Regra que não muda: a função nunca chuta. Campo ilegível volta nulo, e a
 * tela sempre pede a confirmação de uma pessoa antes de gravar.
 */

const URL_SB = Deno.env.get('SUPABASE_URL')!
const CHAVE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const CHAVE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const PROVEDOR = (Deno.env.get('PLACA_PROVEDOR') ?? 'ia').trim() || 'ia'
const CHAVE_PROVEDOR = (Deno.env.get('PLACA_API_KEY') ?? '').trim()
/**
 * Modelo só para ler foto, quando o da central não serve.
 *
 * A central pode estar num modelo de texto — ótimo para redigir laudo, cego
 * para foto. Aqui a conta é outra: precisa enxergar, e é uma imagem por vez.
 * Vazio usa o modelo da central, que é o caso normal.
 */
const MODELO_FORCADO = (Deno.env.get('PLACA_MODELO') ?? '').trim()

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_BYTES = 6 * 1024 * 1024
const IMAGENS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const so = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const digitos = (v: unknown) => so(v).replace(/\D/g, '')

/* ----------------------------------------------------------- placa */

/** Placa brasileira, nos dois padrões, sem separador. */
const ANTIGO = /^[A-Z]{3}[0-9]{4}$/
const MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/

function normalizarPlaca(v: unknown): string {
  return so(v).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function placaValida(v: string): boolean {
  return ANTIGO.test(v) || MERCOSUL.test(v)
}

/**
 * Corrige confusão de leitura conforme a posição. Em placa, cada posição só
 * aceita letra ou só dígito: um `0` onde só cabe letra é quase certamente `O`.
 * Espelha `src/dados/placa.ts` — as duas pontas precisam concordar.
 */
const PARA_LETRA: Record<string, string> = {
  '0': 'O', '1': 'I', '2': 'Z', '4': 'A', '5': 'S', '6': 'G', '7': 'T', '8': 'B',
}
const PARA_DIGITO: Record<string, string> = {
  O: '0', Q: '0', D: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6',
}

function corrigirPorPosicao(bruto: string): string {
  const p = normalizarPlaca(bruto)
  if (p.length !== 7) return p
  const letra = (c: string) => PARA_LETRA[c] ?? c
  const digito = (c: string) => PARA_DIGITO[c] ?? c
  const base = [letra(p[0]), letra(p[1]), letra(p[2]), digito(p[3])]
  /* A 5ª posição separa os padrões: dígito no antigo, letra no Mercosul. */
  const antigo = [...base, digito(p[4]), digito(p[5]), digito(p[6])].join('')
  if (ANTIGO.test(antigo)) return antigo
  const mercosul = [...base, letra(p[4]), digito(p[5]), digito(p[6])].join('')
  if (MERCOSUL.test(mercosul)) return mercosul
  return p
}

/* ------------------------------------------------- campos do CRLV */

interface CamposVeiculo {
  placa: string | null
  marca: string | null
  modelo: string | null
  ano: string | null
  cor: string | null
  renavam: string | null
  chassi: string | null
  municipio: string | null
  uf: string | null
}

interface Proprietario {
  nome: string | null
  documento: string | null
}

const UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB',
  'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
])

/** Só passa o que tem a cara do campo. Duvidoso vira nulo — nunca palpite. */
function limpar(bruto: Record<string, unknown>): { campos: CamposVeiculo; proprietario: Proprietario } {
  const placaLida = corrigirPorPosicao(normalizarPlaca(bruto.placa))
  const ano = digitos(bruto.ano).slice(-4)
  const chassi = so(bruto.chassi).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const renavam = digitos(bruto.renavam)
  const uf = so(bruto.uf).toUpperCase().slice(0, 2)
  const doc = digitos((bruto.proprietario as Record<string, unknown> | undefined)?.documento)
  const anoNum = Number(ano)

  return {
    campos: {
      placa: placaValida(placaLida) ? placaLida : null,
      marca: so(bruto.marca).toUpperCase() || null,
      modelo: so(bruto.modelo).toUpperCase() || null,
      /* Ano de fabricação plausível: nada de 1899 nem de daqui a dois anos. */
      ano: ano.length === 4 && anoNum >= 1900 && anoNum <= new Date().getFullYear() + 1 ? ano : null,
      cor: so(bruto.cor).toUpperCase() || null,
      renavam: renavam.length >= 9 && renavam.length <= 11 ? renavam : null,
      chassi: chassi.length === 17 ? chassi : null,
      municipio: so(bruto.municipio).toUpperCase() || null,
      uf: UFS.has(uf) ? uf : null,
    },
    proprietario: {
      nome: so((bruto.proprietario as Record<string, unknown> | undefined)?.nome).toUpperCase() || null,
      documento: doc.length === 11 || doc.length === 14 ? doc : null,
    },
  }
}

/* ------------------------------------------------------- provedores */

const INSTRUCAO = `Você lê fotos de veículos para uma oficina brasileira.

A foto é de UMA destas coisas:
- a placa do veículo (traseira ou dianteira);
- o documento do veículo (CRLV, em papel ou na tela do celular);
- outra coisa qualquer.

Devolva SOMENTE um JSON, sem cercas de código e sem comentários:

{"tipo":"placa"|"crlv"|"nada",
 "placa":"","marca":"","modelo":"","ano":"","cor":"","renavam":"","chassi":"",
 "municipio":"","uf":"","proprietario":{"nome":"","documento":""},
 "confianca":0.0}

Regras, todas obrigatórias:
- Transcreva o que está escrito. NUNCA complete, deduza ou invente um campo.
- Campo ausente, ilegível, cortado ou coberto: use null. É melhor null do que quase certo.
- A placa tem 7 caracteres: ABC1234 (antiga) ou ABC1D23 (Mercosul). Não inclua o hífen nem a
  palavra BRASIL da faixa azul, nem o nome do município estampado.
- No CRLV, "MARCA/MODELO" vem junto (ex.: "VW/GOL 1.0"): marca é o que vem antes da barra,
  modelo é o resto.
- ano: use o ano de FABRICAÇÃO, com 4 dígitos.
- chassi: 17 caracteres. renavam: só dígitos.
- municipio e uf são os do emplacamento.
- proprietario.documento: só os dígitos do CPF ou CNPJ.
- confianca: de 0 a 1, o quanto você confia na leitura desta foto. Foto tremida, escura,
  de longe ou de lado tem confiança baixa — diga isso com honestidade.
- Se não for placa nem CRLV, devolva {"tipo":"nada","confianca":0} e nada mais.`

interface Leitura {
  tipo: 'placa' | 'crlv' | 'nada'
  campos: CamposVeiculo
  proprietario: Proprietario
  confianca: number
  provedor: string
}

/** Extrai o JSON mesmo quando o modelo embrulha em texto ou em cerca de código. */
function extrairJson(texto: string): Record<string, unknown> | null {
  const limpo = texto.replace(/```json/gi, '').replace(/```/g, '').trim()
  const inicio = limpo.indexOf('{')
  const fim = limpo.lastIndexOf('}')
  if (inicio < 0 || fim <= inicio) return null
  try {
    const v = JSON.parse(limpo.slice(inicio, fim + 1))
    return v && typeof v === 'object' ? v as Record<string, unknown> : null
  } catch {
    return null
  }
}

/**
 * O provedor recusou a imagem porque o modelo é de texto?
 *
 * Cada fornecedor recusa com uma frase diferente, e nenhum devolve um código
 * para isso. Vale a pena reconhecer as frases: o recado "troque o modelo na
 * central" resolve em um minuto, e o erro cru do fornecedor não resolve nada.
 */
function semVisao(erro: string): boolean {
  const e = erro.toLowerCase()
  const falaDeImagem = e.includes('image') || e.includes('imagem') || e.includes('vision') || e.includes('inline_data')
  const falaDeRecusa = e.includes('not support') ||
    e.includes('unsupported') ||
    e.includes('invalid content') ||
    e.includes('does not have') ||
    e.includes('input tag')
  return falaDeImagem && falaDeRecusa
}

async function lerComIa(base64: string, mime: string): Promise<Leitura | { erro: string; codigo?: string }> {
  const admin = createClient(URL_SB, CHAVE_SERVICO, { auth: { persistSession: false } })

  const { data: cfg } = await admin.from('ia_config').select('provedor, modelo').eq('id', true).maybeSingle()
  const provedor = (so(cfg?.provedor) || 'anthropic') as Provedor
  const { data: credencial } = await admin.from('integracoes').select('app_key, ambiente').eq('provedor', provedor).maybeSingle()
  const modelo = MODELO_FORCADO || so(cfg?.modelo) || so(credencial?.ambiente)

  if (!credencial?.app_key || !modelo) {
    return {
      erro: 'A Tecnoar IA ainda não está configurada. Ligue a IA na central ou digite a placa.',
      codigo: 'nao_configurado',
    }
  }

  const r = await chamar({
    provedor,
    modelo,
    chave: credencial.app_key as string,
    sistema: INSTRUCAO,
    turnos: [{
      papel: 'usuario',
      partes: [
        { kind: 'imagem', mime, dados: base64 },
        { kind: 'texto', texto: 'Leia esta foto e devolva o JSON.' },
      ],
    }],
    /* Resposta é um JSON curto; teto baixo evita divagação e gasto à toa. */
    maxTokens: 700,
  })
  if (!r.ok) {
    return semVisao(r.erro)
      ? {
          erro: `O modelo "${modelo}" não lê imagens. Escolha um modelo com visão em Configurações › Tecnoar IA ` +
            '(ou defina PLACA_MODELO na função). Enquanto isso, digite a placa normalmente.',
          codigo: 'modelo_sem_visao',
        }
      : { erro: r.erro }
  }

  const bruto = extrairJson(r.texto)
  if (!bruto) return { erro: 'A IA não devolveu uma leitura utilizável. Tente outra foto.' }

  const tipo = so(bruto.tipo)
  const { campos, proprietario } = limpar(bruto)
  const confianca = Number(bruto.confianca)

  return {
    tipo: tipo === 'placa' || tipo === 'crlv' ? tipo : 'nada',
    campos,
    proprietario,
    confianca: Number.isFinite(confianca) ? Math.min(Math.max(confianca, 0), 1) : 0,
    provedor: `${provedor}:${modelo}`,
  }
}

const VAZIO: CamposVeiculo = {
  placa: null, marca: null, modelo: null, ano: null, cor: null,
  renavam: null, chassi: null, municipio: null, uf: null,
}

async function lerComPlateRecognizer(base64: string): Promise<Leitura | { erro: string }> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const form = new FormData()
  form.append('upload', new Blob([bytes]), 'placa.jpg')
  form.append('regions', 'br')

  const r = await fetch('https://api.platerecognizer.com/v1/plate-reader/', {
    method: 'POST',
    headers: { Authorization: `Token ${CHAVE_PROVEDOR}` },
    body: form,
  })
  if (!r.ok) return { erro: `O serviço de leitura respondeu HTTP ${r.status}.` }

  const corpo = await r.json() as { results?: Array<{ plate?: string; score?: number }> }
  const melhor = (corpo.results ?? [])
    .map((x) => ({ placa: corrigirPorPosicao(normalizarPlaca(x.plate)), score: Number(x.score ?? 0) }))
    .filter((x) => placaValida(x.placa))
    .sort((a, b) => b.score - a.score)[0]

  if (!melhor) return { erro: 'Não foi possível identificar a placa nesta foto.' }
  return {
    tipo: 'placa',
    campos: { ...VAZIO, placa: melhor.placa },
    proprietario: { nome: null, documento: null },
    confianca: melhor.score,
    provedor: 'plate_recognizer',
  }
}

/* ------------------------------------------------------------ rota */

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

  if (PROVEDOR === 'plate_recognizer' && !CHAVE_PROVEDOR) {
    return resposta({ erro: 'O serviço de leitura de placa não foi configurado.', codigo: 'nao_configurado' })
  }

  let corpo: { imagem?: string; mime?: string }
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
  const mime = IMAGENS.includes(so(corpo.mime)) ? so(corpo.mime) : 'image/jpeg'

  try {
    const leitura = PROVEDOR === 'plate_recognizer'
      ? await lerComPlateRecognizer(base64)
      : PROVEDOR === 'ia'
        ? await lerComIa(base64, mime)
        : { erro: `Provedor "${PROVEDOR}" não implementado nesta função.` }

    if ('erro' in leitura) return resposta(leitura)
    if (leitura.tipo === 'nada') {
      return resposta({ erro: 'Esta foto não parece ser uma placa nem o documento do veículo.' })
    }
    return resposta(leitura)
  } catch (e) {
    return resposta({ erro: `Falha ao falar com o serviço de leitura: ${String((e as Error)?.message ?? e)}` })
  }
})
