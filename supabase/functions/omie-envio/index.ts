import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { digitos, num, produtoParaOmie, so } from '../_compartilhado/mapa.ts'

/**
 * Envio de cadastros do Tecnoar para a Omie.
 *
 * A função `omie` traz dados de lá para cá. Esta faz o contrário: o cliente
 * que a recepção cadastrou às sete da manhã precisa existir no financeiro
 * antes de virar nota.
 *
 * Decisões que sustentam o resto:
 *
 * - **Upsert com código de integração.** Mandamos o UUID do Tecnoar como
 *   `codigo_*_integracao`. A Omie usa isso como chave: reenviar o mesmo
 *   registro atualiza em vez de duplicar. Sem isso, um clique duplo no botão
 *   criaria dois cadastros do mesmo CNPJ no ERP.
 * - **A Omie é dona do número.** Depois do envio guardamos o
 *   `codigo_cliente_omie` devolvido e passamos a origem para `omie`. O
 *   registro deixa de ser "só da oficina".
 * - **Erro fica gravado.** Recusa da Omie (documento inválido, campo
 *   obrigatório) volta para a tela e fica em `omie_erro`, para ninguém achar
 *   que subiu.
 * - **Cliente e fornecedor moram na mesma lista da Omie**, separados por tag.
 *   É por isso que os dois caem no mesmo endpoint com tags diferentes.
 * - **Reenvio deliberado.** Um registro já vinculado (`omie_id` preenchido) só
 *   sobe de novo quando vier na lista explícita de `ids`. O lote automático
 *   pega apenas o que nunca subiu, para o botão nunca reescrever o ERP inteiro
 *   sem alguém ter pedido.
 */

const URL_SB = Deno.env.get('SUPABASE_URL')!
const CHAVE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const CHAVE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_LOTE = 25

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

interface RespostaOmie { ok: boolean; dados?: Record<string, unknown>; erro?: string }

async function chamarOmie(
  caminho: string,
  call: string,
  param: Record<string, unknown>,
  appKey: string,
  appSecret: string,
): Promise<RespostaOmie> {
  const controlador = new AbortController()
  const t = setTimeout(() => controlador.abort(), 30000)
  try {
    const r = await fetch(`https://app.omie.com.br/api/v1/${caminho}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ call, app_key: appKey, app_secret: appSecret, param: [param] }),
      signal: controlador.signal,
    })
    const texto = await r.text()
    let corpo: Record<string, unknown>
    try {
      corpo = JSON.parse(texto) as Record<string, unknown>
    } catch {
      return { ok: false, erro: `Resposta inválida da Omie (HTTP ${r.status}).` }
    }
    if (typeof corpo.faultstring === 'string') return { ok: false, erro: corpo.faultstring }
    if (!r.ok) return { ok: false, erro: `Omie respondeu HTTP ${r.status}.` }
    return { ok: true, dados: corpo }
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    if (msg.includes('abort')) return { ok: false, erro: 'A Omie não respondeu dentro do tempo limite.' }
    return { ok: false, erro: `Não foi possível falar com a Omie: ${msg}` }
  } finally {
    clearTimeout(t)
  }
}

/* ---------------------------------------------------- validação local */

/**
 * Confere o que a Omie exige antes de gastar uma chamada.
 *
 * Recusar aqui dá uma mensagem que o atendente entende; deixar a Omie recusar
 * devolve um código de erro que ninguém na oficina sabe ler.
 */
function faltando(entidade: string, r: Record<string, unknown>): string[] {
  const faltas: string[] = []
  if (entidade === 'clientes' || entidade === 'fornecedores') {
    const nome = so(entidade === 'clientes' ? r.nome_razao : r.descricao)
    if (!nome) faltas.push('nome / razão social')
    const doc = digitos(r.documento)
    if (!doc) faltas.push('CPF ou CNPJ')
    else if (doc.length !== 11 && doc.length !== 14) faltas.push('CPF ou CNPJ com tamanho válido')
  }
  if (entidade === 'produtos') {
    if (!so(r.codigo)) faltas.push('código')
    if (!so(r.descricao)) faltas.push('descrição')
    if (!so(r.unidade)) faltas.push('unidade')
    // A Omie exige NCM na inclusão de produto. Sem ele o cadastro é recusado
    // com uma mensagem que não diz qual campo faltou.
    if (!digitos(r.ncm)) faltas.push('NCM')
  }
  if (entidade === 'servicos') {
    if (!so(r.codigo)) faltas.push('código')
    if (!so(r.descricao)) faltas.push('descrição')
  }
  return faltas
}

/* ------------------------------------------------------------- envios */

interface Envio { ok: boolean; omieId?: string; erro?: string }

async function enviarCadastro(
  entidade: 'clientes' | 'fornecedores',
  r: Record<string, unknown>,
  chave: string,
  segredo: string,
): Promise<Envio> {
  const doc = digitos(r.documento)
  const pj = doc.length === 14
  const nome = so(entidade === 'clientes' ? r.nome_razao : r.descricao)
  const tel = so(r.telefone ?? r.telefone1)
  const somenteDigitosTel = digitos(tel)
  const ddd = somenteDigitosTel.length >= 10 ? somenteDigitosTel.slice(0, 2) : ''
  const numeroTel = somenteDigitosTel.length >= 10 ? somenteDigitosTel.slice(2) : somenteDigitosTel

  /* A tag define o papel: a Omie guarda cliente e fornecedor na mesma lista. */
  const tags = [{ tag: entidade === 'clientes' ? 'Cliente' : 'Fornecedor' }]

  const param: Record<string, unknown> = {
    codigo_cliente_integracao: String(r.id),
    razao_social: nome,
    nome_fantasia: so(r.nome_fantasia) || nome,
    cnpj_cpf: doc,
    pessoa_fisica: pj ? 'N' : 'S',
    email: so(r.email) || '',
    tags,
  }
  if (so(r.inscricao_estadual)) param.inscricao_estadual = so(r.inscricao_estadual)
  if (ddd) { param.telefone1_ddd = ddd; param.telefone1_numero = numeroTel }
  if (digitos(r.cep)) param.cep = digitos(r.cep)
  if (so(r.logradouro)) param.endereco = so(r.logradouro)
  if (so(r.numero)) param.endereco_numero = so(r.numero)
  if (so(r.bairro)) param.bairro = so(r.bairro)
  if (so(r.complemento)) param.complemento = so(r.complemento)
  if (so(r.municipio)) param.cidade = so(r.municipio)
  if (so(r.uf)) param.estado = so(r.uf).toUpperCase().slice(0, 2)

  const res = await chamarOmie('geral/clientes/', 'UpsertCliente', param, chave, segredo)
  if (!res.ok) return { ok: false, erro: res.erro }

  const omieId = res.dados?.codigo_cliente_omie
  if (!omieId) return { ok: false, erro: 'A Omie aceitou o envio mas não devolveu o código do cadastro.' }
  return { ok: true, omieId: String(omieId) }
}

async function enviarProduto(r: Record<string, unknown>, chave: string, segredo: string): Promise<Envio> {
  const res = await chamarOmie('geral/produtos/', 'UpsertProduto', produtoParaOmie(r), chave, segredo)
  if (!res.ok) return { ok: false, erro: res.erro }

  const omieId = res.dados?.codigo_produto
  if (!omieId) return { ok: false, erro: 'A Omie aceitou o envio mas não devolveu o código do produto.' }
  return { ok: true, omieId: String(omieId) }
}

async function enviarServico(r: Record<string, unknown>, chave: string, segredo: string): Promise<Envio> {
  const param = {
    intListar: { cCodIntServ: String(r.id) },
    cabecalho: {
      cCodIntServ: String(r.id),
      cCodigo: so(r.codigo),
      cDescricao: so(r.descricao),
      nPrecoUnit: num(r.valor_padrao) ?? 0,
    },
  }

  const res = await chamarOmie('servicos/servico/', 'IncluirCadastroServico', param, chave, segredo)
  if (!res.ok) return { ok: false, erro: res.erro }

  const cab = (res.dados?.cabecalho ?? res.dados?.intListar ?? {}) as Record<string, unknown>
  const omieId = cab.nCodServ ?? res.dados?.nCodServ
  if (!omieId) return { ok: false, erro: 'A Omie aceitou o envio mas não devolveu o código do serviço.' }
  return { ok: true, omieId: String(omieId) }
}

/* ------------------------------------------------------------------ rota */

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
    p_recurso: 'integracoes',
    p_acao: 'sincronizar',
  })
  if (autorizado !== true) return resposta({ erro: 'Seu perfil não permite enviar cadastros para a Omie.' }, 403)

  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return resposta({ erro: 'Corpo inválido.' }, 400)
  }

  const entidade = String(corpo.entidade ?? '')
  const VALIDAS = ['clientes', 'fornecedores', 'produtos', 'servicos']
  if (!VALIDAS.includes(entidade)) return resposta({ erro: 'Entidade desconhecida.' }, 400)

  const admin = createClient(URL_SB, CHAVE_SERVICO, { auth: { persistSession: false } })

  const { data: cfg } = await admin.from('integracoes').select('*').eq('provedor', 'omie').maybeSingle()
  if (!cfg?.app_key || !cfg?.app_secret) {
    return resposta({ erro: 'A integração Omie ainda não foi configurada.', status: 'nao_configurada' }, 400)
  }

  /* Um id específico (reenvio deliberado, mesmo se já vinculado), ou o lote de
     tudo que ainda não subiu. */
  const ids = Array.isArray(corpo.ids) ? (corpo.ids as string[]).slice(0, MAX_LOTE) : []
  let consulta = admin.from(entidade).select('*').eq('situacao', 'ativo')
  consulta = ids.length
    ? consulta.in('id', ids)
    : consulta.is('omie_id', null).eq('origem', 'manual').limit(MAX_LOTE)

  const { data: registros, error: erroLeitura } = await consulta
  if (erroLeitura) return resposta({ erro: erroLeitura.message }, 500)
  if (!registros?.length) {
    return resposta({ enviados: 0, recusados: 0, detalhes: [], mensagem: 'Nada pendente de envio.' })
  }

  const detalhes: Array<{ id: string; nome: string; ok: boolean; erro?: string; omie_id?: string }> = []
  let enviados = 0
  let recusados = 0

  for (const r of registros as Array<Record<string, unknown>>) {
    const nome = so(r.nome_razao ?? r.descricao) || String(r.id)

    const faltas = faltando(entidade, r)
    if (faltas.length) {
      const erro = `Faltam dados obrigatórios para a Omie: ${faltas.join(', ')}.`
      await admin.from(entidade).update({ omie_erro: erro }).eq('id', r.id)
      detalhes.push({ id: String(r.id), nome, ok: false, erro })
      recusados++
      continue
    }

    const envio =
      entidade === 'produtos' ? await enviarProduto(r, cfg.app_key, cfg.app_secret)
      : entidade === 'servicos' ? await enviarServico(r, cfg.app_key, cfg.app_secret)
      : await enviarCadastro(entidade as 'clientes' | 'fornecedores', r, cfg.app_key, cfg.app_secret)

    if (!envio.ok) {
      await admin.from(entidade).update({ omie_erro: envio.erro ?? 'Recusado pela Omie.' }).eq('id', r.id)
      detalhes.push({ id: String(r.id), nome, ok: false, erro: envio.erro })
      recusados++
      continue
    }

    /* Passou a existir no ERP: guarda o número e muda a origem. */
    const agora = new Date().toISOString()
    const { error } = await admin
      .from(entidade)
      .update({
        omie_id: envio.omieId,
        origem: 'omie',
        omie_enviado_em: agora,
        omie_sincronizado_em: agora,
        omie_erro: null,
      })
      .eq('id', r.id)

    if (error) {
      /* Subiu na Omie mas não gravou aqui: precisa aparecer, senão o próximo
         envio tentaria de novo e o operador nunca saberia do descompasso. */
      detalhes.push({
        id: String(r.id),
        nome,
        ok: false,
        erro: `Enviado à Omie (código ${envio.omieId}), mas o vínculo não foi gravado aqui: ${error.message}`,
        omie_id: envio.omieId,
      })
      recusados++
      continue
    }

    detalhes.push({ id: String(r.id), nome, ok: true, omie_id: envio.omieId })
    enviados++
  }

  await admin.from('integracoes')
    .update({ ultima_conexao_em: new Date().toISOString(), status: 'conectada', ultimo_erro: null })
    .eq('provedor', 'omie')

  return resposta({ enviados, recusados, detalhes })
})
