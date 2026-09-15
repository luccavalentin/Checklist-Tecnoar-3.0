import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { num, produtoDaOmie, so } from '../_compartilhado/mapa.ts'

/**
 * Ficha do produto "ao vivo": confere UM produto na Omie na hora em que o
 * mecânico abre a ficha no app e atualiza o cadastro local.
 *
 * - Cadastro: `geral/produtos/` ConsultarProduto (descrição, preço de venda,
 *   NCM, marca, situação…) — traduzido pelo mesmo `produtoDaOmie` da
 *   sincronização geral, para as duas nunca divergirem.
 * - Estoque: `estoque/consulta/` PosicaoEstoque do dia (saldo, físico,
 *   reservado, pendente, mínimo, custo médio).
 * - Fotos: as URLs da Omie são assinadas e expiram; voltam só na resposta,
 *   nunca são gravadas.
 *
 * Quem pode: qualquer usuário ativo da equipe (o mesmo critério do catálogo
 * do app). A credencial da Omie não sai do servidor. Se a Omie falhar ou
 * limitar as chamadas, a resposta traz `aviso` e o app mostra o que já está
 * no cadastro, com a data da última sincronização.
 */

const URL_SB = Deno.env.get('SUPABASE_URL')!
const CHAVE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Conferido há menos que isto: não chama a Omie de novo (limite de consumo da API). */
const RECENTE_MS = 45_000

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function chamarOmie(caminho: string, call: string, param: Record<string, unknown>, appKey: string, appSecret: string) {
  const controlador = new AbortController()
  const t = setTimeout(() => controlador.abort(), 12_000)
  try {
    const r = await fetch(`https://app.omie.com.br/api/v1/${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call, app_key: appKey, app_secret: appSecret, param: [param] }),
      signal: controlador.signal,
    })
    const corpo = (await r.json().catch(() => null)) as Record<string, unknown> | null
    if (!corpo) return { ok: false as const, erro: `Resposta inválida da Omie (HTTP ${r.status}).` }
    if (typeof corpo.faultstring === 'string') return { ok: false as const, erro: corpo.faultstring }
    if (!r.ok) return { ok: false as const, erro: `Omie respondeu HTTP ${r.status}.` }
    return { ok: true as const, dados: corpo }
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    return { ok: false as const, erro: msg.includes('abort') ? 'A Omie não respondeu a tempo.' : 'Não foi possível falar com a Omie.' }
  } finally {
    clearTimeout(t)
  }
}

const hojeOmie = () => {
  const d = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' })
  return d.format(new Date())
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resposta({ erro: 'Método não suportado.' }, 405)

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!jwt) return resposta({ erro: 'Requisição sem autenticação.' }, 401)

  const admin = createClient(URL_SB, CHAVE_SERVICO, { auth: { persistSession: false } })
  const { data: sessao } = await admin.auth.getUser(jwt)
  if (!sessao?.user) return resposta({ erro: 'Sessão inválida.' }, 401)

  const { data: usuario } = await admin.from('usuarios').select('id').eq('id', sessao.user.id).eq('situacao', 'ativo').maybeSingle()
  if (!usuario) return resposta({ erro: 'Sem permissão.' }, 403)

  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return resposta({ erro: 'Corpo inválido.' }, 400)
  }
  const produtoId = so(corpo.produto_id)
  if (!/^[0-9a-f-]{36}$/i.test(produtoId)) return resposta({ erro: 'Produto inválido.' }, 400)

  const { data: prod } = await admin.from('produtos').select('id, codigo, omie_id, omie_sincronizado_em').eq('id', produtoId).maybeSingle()
  if (!prod) return resposta({ erro: 'Produto não encontrado.' }, 404)
  if (!prod.omie_id) return resposta({ ok: true, omie: false, aviso: 'Produto cadastrado só no Tecnoar (sem vínculo com a Omie).' })

  const { data: cfg } = await admin.from('integracoes').select('app_key, app_secret, ativa').eq('provedor', 'omie').maybeSingle()
  if (!cfg?.app_key || !cfg?.app_secret) {
    return resposta({ ok: true, omie: false, aviso: 'Integração com a Omie não configurada. Mostrando o cadastro do sistema.' })
  }

  const recente = prod.omie_sincronizado_em && Date.now() - new Date(prod.omie_sincronizado_em).getTime() < RECENTE_MS

  const idOmie = Number(prod.omie_id)
  const [cad, est] = await Promise.all([
    chamarOmie('geral/produtos/', 'ConsultarProduto', { codigo_produto: idOmie }, cfg.app_key, cfg.app_secret),
    recente
      ? Promise.resolve(null)
      : chamarOmie('estoque/consulta/', 'PosicaoEstoque', { id_prod: idOmie, data: hojeOmie() }, cfg.app_key, cfg.app_secret),
  ])

  const imagens: string[] = []
  let garantiaDias: number | null = null
  const avisos: string[] = []
  const atualizar: Record<string, unknown> = {}

  if (cad.ok) {
    const d = cad.dados
    for (const i of (d.imagens ?? []) as Array<Record<string, unknown>>) {
      const url = so(i?.url_imagem)
      if (url.startsWith('https://')) imagens.push(url)
    }
    garantiaDias = num(d.dias_garantia) || null
    if (!recente) {
      const registro: Record<string, unknown> = produtoDaOmie(d, String(prod.omie_id), so(d.codigo) || prod.codigo)
      // ConsultarProduto traz a família em outro campo que a listagem.
      if (!registro.familia && so(d.descricao_familia)) registro.familia = so(d.descricao_familia)
      if (registro.omie_familia_id === '0') delete registro.omie_familia_id
      // Consulta individual não apaga o que o cadastro já tem: vazio não sobrescreve.
      for (const [c, v] of Object.entries(registro)) if (v === null && c !== 'omie_erro') delete registro[c]
      Object.assign(atualizar, registro)
    }
  } else {
    avisos.push(`Cadastro: ${cad.erro}`)
  }

  if (est && est.ok) {
    const e = est.dados
    const registro: Record<string, unknown> = { saldo: num(e.saldo) ?? 0, omie_sincronizado_em: new Date().toISOString() }
    const campos: Array<[string, unknown]> = [
      ['fisico', num(e.fisico)],
      ['reservado', num(e.reservado)],
      ['pendente', num(e.pendente)],
      ['estoque_minimo', num(e.estoque_minimo)],
      ['custo_medio', num(e.cmc)],
    ]
    for (const [c, v] of campos) if (v !== null) registro[c] = v
    if (e.codigo_local_estoque != null) registro.omie_local_estoque = String(e.codigo_local_estoque)
    Object.assign(atualizar, registro)
  } else if (est && !est.ok) {
    avisos.push(`Estoque: ${est.erro}`)
  }

  if (Object.keys(atualizar).length) {
    const { error } = await admin.from('produtos').update(atualizar).eq('id', prod.id)
    if (error) avisos.push('Não foi possível gravar a atualização no cadastro.')
  }

  return resposta({
    ok: true,
    omie: cad.ok || !!(est && est.ok),
    atualizado: Object.keys(atualizar).length > 0,
    imagens,
    garantia_dias: garantiaDias,
    aviso: avisos.length ? avisos.join(' ') : null,
  })
})
