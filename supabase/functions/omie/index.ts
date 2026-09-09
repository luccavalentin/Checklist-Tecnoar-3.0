import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { digitos, estoqueDaOmie, num, produtoDaOmie, so } from '../_compartilhado/mapa.ts'

/**
 * Integração Omie — entrada de dados (Omie → Tecnoar).
 *
 * Princípios:
 * - As credenciais nunca saem do servidor.
 * - Status só vira "conectada" depois de uma chamada real bem-sucedida.
 * - Nenhum número de sincronização é estimado: tudo vem da contagem real.
 * - A sincronização processa por lotes e devolve a próxima página, para que
 *   volumes grandes não estourem o tempo da função nem travem a interface.
 * - A tradução de campos mora em `mapa.ts`, não espalhada aqui. Ver também
 *   `supabase/functions/_dicionario-omie.md`.
 *
 * Classificação de cadastros:
 * A Omie mantém clientes e fornecedores na MESMA lista (`ListarClientes`) e os
 * distingue pelas tags do cadastro ("Cliente" e/ou "Fornecedor"). Um mesmo
 * CNPJ pode ser os dois. Por isso cada registro é roteado pelas tags, e um
 * cadastro que deixou de ser cliente sai da tabela de clientes.
 */

const URL_SB = Deno.env.get('SUPABASE_URL')!
const CHAVE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const CHAVE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PAGINAS_POR_CHAMADA = 4
const REGISTROS_POR_PAGINA = 50

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

interface RespostaOmie {
  ok: boolean
  dados?: Record<string, unknown>
  erro?: string
}

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

    if (typeof corpo.faultstring === 'string') {
      return { ok: false, erro: corpo.faultstring }
    }
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

/* ------------------------------------------------------------ importadores */

interface Lote {
  processados: number
  novos: number
  atualizados: number
  falhas: number
  totalPaginas: number
  conflitos: Array<{ identificador: string; motivo: string; dados: unknown; entidade: string }>
}

const LOTE_VAZIO = (): Lote => ({ processados: 0, novos: 0, atualizados: 0, falhas: 0, totalPaginas: 0, conflitos: [] })

/** Lê as tags do cadastro Omie e decide onde ele pertence. */
function classificar(c: Record<string, unknown>): { cliente: boolean; fornecedor: boolean; semTag: boolean } {
  const tags = ((c.tags ?? []) as Array<Record<string, unknown>>)
    .map((t) => so(t?.tag).toLowerCase())
    .filter(Boolean)
  const cliente = tags.includes('cliente')
  const fornecedor = tags.includes('fornecedor')
  // Sem nenhuma das duas tags a Omie não diz o que é. Tratamos como cliente,
  // que é o cadastro padrão, e informamos a contagem no resultado.
  if (!cliente && !fornecedor) return { cliente: true, fornecedor: false, semTag: true }
  return { cliente, fornecedor, semTag: false }
}

async function importarClientes(
  admin: SupabaseClient,
  chave: string,
  segredo: string,
  pagina: number,
): Promise<Lote & { erro?: string; semTag?: number; fornecedores?: number }> {
  const lote = LOTE_VAZIO()
  let semTag = 0
  let comoFornecedor = 0

  const r = await chamarOmie('geral/clientes/', 'ListarClientes', {
    pagina,
    registros_por_pagina: REGISTROS_POR_PAGINA,
    apenas_importado_api: 'N',
  }, chave, segredo)
  if (!r.ok) return { ...lote, erro: r.erro }

  lote.totalPaginas = Number(r.dados?.total_de_paginas ?? 0)
  const registros = (r.dados?.clientes_cadastro ?? []) as Array<Record<string, unknown>>

  for (const c of registros) {
    lote.processados++
    const omieId = String(c.codigo_cliente_omie ?? '')
    if (!omieId) { lote.falhas++; continue }

    const papel = classificar(c)
    if (papel.semTag) semTag++

    const doc = digitos(c.cnpj_cpf)
    const pj = doc.length === 14
    const nome = so(c.razao_social) || so(c.nome_fantasia) || `Cadastro Omie ${omieId}`
    const inativo = so(c.inativo).toUpperCase() === 'S'
    const telefone = [so(c.telefone1_ddd), so(c.telefone1_numero)].filter(Boolean).join(' ') || null
    const telefone2 = [so(c.telefone2_ddd), so(c.telefone2_numero)].filter(Boolean).join(' ') || null
    const agora = new Date().toISOString()

    const comum = {
      documento: doc || null,
      inscricao_estadual: so(c.inscricao_estadual) || null,
      email: so(c.email) || null,
      cep: digitos(c.cep) || null,
      logradouro: so(c.endereco) || null,
      numero: so(c.endereco_numero) || null,
      bairro: so(c.bairro) || null,
      complemento: so(c.complemento) || null,
      municipio: so(c.cidade) || null,
      uf: so(c.estado).toUpperCase().slice(0, 2) || null,
      situacao: inativo ? 'inativo' : 'ativo',
      origem: 'omie',
      omie_id: omieId,
      omie_sincronizado_em: agora,
    }

    let houveNovo = false
    let houveAtualizacao = false
    let houveFalha = false

    /* ------------------------------------------------------------ cliente */
    if (papel.cliente) {
      const registro = {
        ...comum,
        tipo_pessoa: pj ? 'juridica' : 'fisica',
        nome_razao: nome,
        nome_fantasia: so(c.nome_fantasia) || null,
        telefone,
        celular: telefone2,
      }

      const { data: porOmie } = await admin.from('clientes').select('id').eq('omie_id', omieId).maybeSingle()
      if (porOmie) {
        const { error } = await admin.from('clientes').update(registro).eq('id', porOmie.id)
        if (error) houveFalha = true
        else houveAtualizacao = true
      } else if (doc) {
        const { data: porDoc } = await admin
          .from('clientes').select('id, origem, omie_id').eq('documento_digitos', doc).maybeSingle()
        if (porDoc && porDoc.omie_id && porDoc.omie_id !== omieId) {
          lote.conflitos.push({
            entidade: 'clientes',
            identificador: omieId,
            motivo: 'Documento já vinculado a outro registro da Omie. Revisão necessária.',
            dados: { documento: doc, omie_id_existente: porDoc.omie_id },
          })
        } else if (porDoc) {
          const { error } = await admin.from('clientes').update({ ...registro, origem: porDoc.origem }).eq('id', porDoc.id)
          if (error) houveFalha = true
          else houveAtualizacao = true
        } else {
          const { error } = await admin.from('clientes').insert(registro)
          if (error) houveFalha = true
          else houveNovo = true
        }
      } else {
        const { data: porNome } = await admin.from('clientes').select('id').ilike('nome_razao', nome).limit(1)
        if (porNome && porNome.length > 0) {
          lote.conflitos.push({
            entidade: 'clientes',
            identificador: omieId,
            motivo: 'Cliente sem documento e com nome igual a um cadastro existente. Não foi unido automaticamente.',
            dados: { nome },
          })
        } else {
          const { error } = await admin.from('clientes').insert(registro)
          if (error) houveFalha = true
          else houveNovo = true
        }
      }
    } else {
      /* Deixou de ser cliente na Omie: sai da tabela de clientes, desde que
         nada dependa dele. Se depender, vira conflito para revisão humana. */
      const { data: existente } = await admin.from('clientes').select('id').eq('omie_id', omieId).maybeSingle()
      if (existente) {
        const { error } = await admin.from('clientes').delete().eq('id', existente.id)
        if (error) {
          lote.conflitos.push({
            entidade: 'clientes',
            identificador: omieId,
            motivo: 'Cadastro é apenas fornecedor na Omie, mas já tem movimentação como cliente no Tecnoar. Ajuste manual necessário.',
            dados: { nome, motivo_banco: error.message },
          })
        }
      }
    }

    /* --------------------------------------------------------- fornecedor */
    if (papel.fornecedor) {
      comoFornecedor++
      const registro = {
        ...comum,
        tipo_pessoa: pj ? 'juridica' : 'fisica',
        descricao: nome,
        nome_fantasia: so(c.nome_fantasia) || null,
        telefone1: telefone,
        telefone2,
      }

      const { data: porOmie } = await admin.from('fornecedores').select('id').eq('omie_id', omieId).maybeSingle()
      if (porOmie) {
        const { error } = await admin.from('fornecedores').update(registro).eq('id', porOmie.id)
        if (error) houveFalha = true
        else houveAtualizacao = true
      } else if (doc) {
        const { data: porDoc } = await admin
          .from('fornecedores').select('id, origem, omie_id').eq('documento_digitos', doc).maybeSingle()
        if (porDoc && porDoc.omie_id && porDoc.omie_id !== omieId) {
          lote.conflitos.push({
            entidade: 'fornecedores',
            identificador: omieId,
            motivo: 'Documento já vinculado a outro fornecedor da Omie. Revisão necessária.',
            dados: { documento: doc, omie_id_existente: porDoc.omie_id },
          })
        } else if (porDoc) {
          const { error } = await admin.from('fornecedores').update({ ...registro, origem: porDoc.origem }).eq('id', porDoc.id)
          if (error) houveFalha = true
          else houveAtualizacao = true
        } else {
          const { error } = await admin.from('fornecedores').insert(registro)
          if (error) houveFalha = true
          else houveNovo = true
        }
      } else {
        const { error } = await admin.from('fornecedores').insert(registro)
        if (error) houveFalha = true
        else houveNovo = true
      }
    }

    if (houveFalha) lote.falhas++
    else if (houveNovo) lote.novos++
    else if (houveAtualizacao) lote.atualizados++
  }

  return { ...lote, semTag, fornecedores: comoFornecedor }
}

async function importarProdutos(admin: SupabaseClient, chave: string, segredo: string, pagina: number): Promise<Lote & { erro?: string }> {
  const lote = LOTE_VAZIO()
  const r = await chamarOmie('geral/produtos/', 'ListarProdutos', {
    pagina,
    registros_por_pagina: REGISTROS_POR_PAGINA,
    apenas_importado_api: 'N',
    filtrar_apenas_omiepdv: 'N',
  }, chave, segredo)
  if (!r.ok) return { ...lote, erro: r.erro }

  lote.totalPaginas = Number(r.dados?.total_de_paginas ?? 0)
  const registros = (r.dados?.produto_servico_cadastro ?? []) as Array<Record<string, unknown>>

  for (const p of registros) {
    lote.processados++
    const omieId = String(p.codigo_produto ?? '')
    const codigo = so(p.codigo) || omieId
    if (!omieId || !codigo) { lote.falhas++; continue }

    const registro = produtoDaOmie(p, omieId, codigo)

    const { data: porOmie } = await admin.from('produtos').select('id').eq('omie_id', omieId).maybeSingle()
    if (porOmie) {
      const { error } = await admin.from('produtos').update(registro).eq('id', porOmie.id)
      if (error) lote.falhas++
      else lote.atualizados++
      continue
    }

    const { data: porCodigo } = await admin.from('produtos').select('id, omie_id').ilike('codigo', codigo).maybeSingle()
    if (porCodigo) {
      if (porCodigo.omie_id && porCodigo.omie_id !== omieId) {
        lote.conflitos.push({
          entidade: 'produtos',
          identificador: omieId,
          motivo: 'Código já vinculado a outro produto da Omie. Revisão necessária.',
          dados: { codigo, omie_id_existente: porCodigo.omie_id },
        })
        continue
      }
      const { error } = await admin.from('produtos').update(registro).eq('id', porCodigo.id)
      if (error) lote.falhas++
      else lote.atualizados++
      continue
    }

    const { error } = await admin.from('produtos').insert(registro)
    if (error) lote.falhas++
    else lote.novos++
  }

  return lote
}

async function importarServicos(admin: SupabaseClient, chave: string, segredo: string, pagina: number): Promise<Lote & { erro?: string }> {
  const lote = LOTE_VAZIO()
  const r = await chamarOmie('servicos/servico/', 'ListarCadastroServico', {
    nPagina: pagina,
    nRegPorPagina: REGISTROS_POR_PAGINA,
  }, chave, segredo)
  if (!r.ok) return { ...lote, erro: r.erro }

  lote.totalPaginas = Number(r.dados?.nTotPaginas ?? 0)
  const registros = (r.dados?.cadastros ?? []) as Array<Record<string, unknown>>

  for (const s of registros) {
    lote.processados++
    const cabecalho = (s.intListar ?? s.cabecalho ?? {}) as Record<string, unknown>
    const dados = (s.cabecalho ?? s) as Record<string, unknown>
    const omieId = String(cabecalho.nCodServ ?? dados.nCodServ ?? '')
    const codigo = so(dados.cCodigo ?? cabecalho.cCodIntServ) || omieId
    if (!omieId || !codigo) { lote.falhas++; continue }

    const registro = {
      codigo,
      descricao: so(dados.cDescricao) || `Serviço Omie ${omieId}`,
      valor_padrao: num(dados.nValorUnit ?? dados.nValor) ?? 0,
      origem: 'omie',
      omie_id: omieId,
      omie_erro: null,
      omie_sincronizado_em: new Date().toISOString(),
    }

    const { data: porOmie } = await admin.from('servicos').select('id').eq('omie_id', omieId).maybeSingle()
    if (porOmie) {
      const { error } = await admin.from('servicos').update(registro).eq('id', porOmie.id)
      if (error) lote.falhas++
      else lote.atualizados++
      continue
    }

    const { data: porCodigo } = await admin.from('servicos').select('id, omie_id').ilike('codigo', codigo).maybeSingle()
    if (porCodigo) {
      if (porCodigo.omie_id && porCodigo.omie_id !== omieId) {
        lote.conflitos.push({
          entidade: 'servicos', identificador: omieId,
          motivo: 'Código já vinculado a outro serviço da Omie. Revisão necessária.',
          dados: { codigo },
        })
        continue
      }
      const { error } = await admin.from('servicos').update(registro).eq('id', porCodigo.id)
      if (error) lote.falhas++
      else lote.atualizados++
      continue
    }

    const { error } = await admin.from('servicos').insert(registro)
    if (error) lote.falhas++
    else lote.novos++
  }

  return lote
}

async function importarEstoque(admin: SupabaseClient, chave: string, segredo: string, pagina: number): Promise<Lote & { erro?: string }> {
  const lote = LOTE_VAZIO()
  const hoje = new Date()
  const dia = String(hoje.getDate()).padStart(2, '0')
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const r = await chamarOmie('estoque/consulta/', 'ListarPosEstoque', {
    nPagina: pagina,
    nRegPorPagina: REGISTROS_POR_PAGINA,
    dDataPosicao: `${dia}/${mes}/${hoje.getFullYear()}`,
  }, chave, segredo)
  if (!r.ok) return { ...lote, erro: r.erro }

  lote.totalPaginas = Number(r.dados?.nTotPaginas ?? 0)
  const registros = (r.dados?.produtos ?? []) as Array<Record<string, unknown>>

  for (const e of registros) {
    lote.processados++
    const omieId = String(e.nCodProd ?? '')
    if (!omieId) { lote.falhas++; continue }

    let prodId = (await admin.from('produtos').select('id').eq('omie_id', omieId).maybeSingle()).data?.id ?? null

    /* A posição de estoque referencia produtos que a listagem padrão de
       catálogo não trouxe (ex.: itens inativos/arquivados na Omie, que ainda
       carregam saldo histórico). Em vez de só registrar o conflito, busca o
       cadastro individual do item na Omie e cria localmente — o mesmo dado
       que `ListarProdutos` traria, só que um item de cada vez. */
    if (!prodId) {
      const codigo = so(e.cCodigo)
      if (codigo) {
        prodId = (await admin.from('produtos').select('id').ilike('codigo', codigo).maybeSingle()).data?.id ?? null
      }
    }

    if (!prodId) {
      const consulta = await chamarOmie('geral/produtos/', 'ConsultarProduto', { codigo_produto: Number(omieId) }, chave, segredo)
      const codigoResgatado = so(consulta.dados?.codigo)
      if (consulta.ok && codigoResgatado) {
        const registro = produtoDaOmie(consulta.dados!, omieId, codigoResgatado)
        const { data: criado, error: erroCriar } = await admin.from('produtos').insert(registro).select('id').single()
        if (!erroCriar && criado) {
          prodId = criado.id
        }
      }
    }

    if (!prodId) {
      lote.conflitos.push({
        entidade: 'produtos', identificador: omieId,
        motivo: 'Posição de estoque de um produto que ainda não existe no Tecnoar. Sincronize os produtos primeiro.',
        dados: { saldo: num(e.nSaldo), codigo: so(e.cCodigo), descricao: so(e.cDescricao) },
      })
      continue
    }

    const { error } = await admin.from('produtos').update(estoqueDaOmie(e)).eq('id', prodId)
    if (error) lote.falhas++
    else lote.atualizados++
  }

  return lote
}

async function importarVendas(admin: SupabaseClient, chave: string, segredo: string, pagina: number): Promise<Lote & { erro?: string }> {
  const lote = LOTE_VAZIO()
  const r = await chamarOmie('produtos/pedido/', 'ListarPedidos', {
    pagina,
    registros_por_pagina: REGISTROS_POR_PAGINA,
    apenas_importado_api: 'N',
  }, chave, segredo)
  if (!r.ok) return { ...lote, erro: r.erro }

  lote.totalPaginas = Number(r.dados?.total_de_paginas ?? 0)
  const registros = (r.dados?.pedido_venda_produto ?? []) as Array<Record<string, unknown>>

  for (const v of registros) {
    lote.processados++
    const cab = (v.cabecalho ?? {}) as Record<string, unknown>
    const total = (v.total_pedido ?? {}) as Record<string, unknown>
    const infoCadastro = (v.infoCadastro ?? {}) as Record<string, unknown>
    const omieId = String(cab.codigo_pedido ?? '')
    if (!omieId) { lote.falhas++; continue }

    const omieCliente = cab.codigo_cliente ? String(cab.codigo_cliente) : null
    let clienteId: string | null = null
    if (omieCliente) {
      const { data: cli } = await admin.from('clientes').select('id').eq('omie_id', omieCliente).maybeSingle()
      clienteId = cli?.id ?? null
    }

    const registro = {
      omie_id: omieId,
      numero: so(cab.numero_pedido) || omieId,
      cliente_id: clienteId,
      data_venda: converterData(so(cab.data_previsao)) ?? new Date().toISOString().slice(0, 10),
      valor_total: num(total.valor_total_pedido) ?? 0,
      etapa: so(cab.etapa) || null,
      origem: 'omie',
      omie_cliente_id: omieCliente,
      sincronizado_em: new Date().toISOString(),
    }

    let vendaId: string | null = null
    const { data: existente } = await admin.from('vendas').select('id').eq('omie_id', omieId).maybeSingle()
    if (existente) {
      vendaId = existente.id
      const { error } = await admin.from('vendas').update(registro).eq('id', existente.id)
      if (error) { lote.falhas++; continue }
      lote.atualizados++
    } else {
      const { data: nova, error } = await admin.from('vendas').insert(registro).select('id').single()
      if (error || !nova) { lote.falhas++; continue }
      vendaId = nova.id
      lote.novos++
    }

    /* Itens do pedido: sem eles não existe "peças mais vendidas" de verdade. */
    const itens = (v.det ?? []) as Array<Record<string, unknown>>
    if (vendaId && Array.isArray(itens)) {
      await admin.from('venda_itens').delete().eq('venda_id', vendaId)
      const linhas: Array<Record<string, unknown>> = []

      for (const d of itens) {
        const prod = (d.produto ?? {}) as Record<string, unknown>
        const inf = (d.inf_adic ?? {}) as Record<string, unknown>
        const omieProduto = prod.codigo_produto ? String(prod.codigo_produto) : null
        let produtoId: string | null = null
        if (omieProduto) {
          const { data: p } = await admin.from('produtos').select('id').eq('omie_id', omieProduto).maybeSingle()
          produtoId = p?.id ?? null
        }
        const quantidade = num(prod.quantidade) ?? 0
        const unitario = num(prod.valor_unitario) ?? 0
        const totalItem = num(prod.valor_total_item ?? prod.valor_mercadoria ?? inf.valor_total) ?? quantidade * unitario

        linhas.push({
          venda_id: vendaId,
          produto_id: produtoId,
          descricao: so(prod.descricao) || `Item Omie ${omieProduto ?? ''}`.trim(),
          quantidade,
          valor_unitario: unitario,
          valor_total: totalItem,
          omie_produto_id: omieProduto,
        })
      }

      if (linhas.length > 0) {
        const { error } = await admin.from('venda_itens').insert(linhas)
        if (error) {
          lote.conflitos.push({
            entidade: 'venda_itens',
            identificador: omieId,
            motivo: 'Não foi possível gravar os itens deste pedido.',
            dados: { motivo_banco: error.message },
          })
        }
      }
    }

    if (so(infoCadastro.cancelado).toUpperCase() === 'S') {
      await admin.from('vendas').update({ etapa: 'Cancelado' }).eq('id', vendaId)
    }
  }

  return lote
}

function converterData(v: string): string | null {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
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

  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return resposta({ erro: 'Corpo inválido.' }, 400)
  }

  const acao = String(corpo.acao ?? '')
  const permissao = acao === 'sincronizar' ? 'sincronizar' : 'configurar'
  const { data: autorizado } = await comoUsuario.rpc('tem_permissao', {
    p_recurso: 'integracoes',
    p_acao: permissao,
  })
  if (autorizado !== true) return resposta({ erro: 'Seu perfil não permite esta ação.' }, 403)

  const admin = createClient(URL_SB, CHAVE_SERVICO, { auth: { persistSession: false } })

  /* ---------------------------------------------------- salvar credenciais */
  if (acao === 'salvar_credenciais') {
    const appKey = so(corpo.app_key)
    const appSecret = so(corpo.app_secret)
    const ambiente = so(corpo.ambiente) || 'producao'
    if (!appKey || !appSecret) return resposta({ erro: 'Informe app key e app secret.' }, 400)

    const { error } = await admin
      .from('integracoes')
      .update({
        app_key: appKey,
        app_secret: appSecret,
        ambiente,
        status: 'configurada',
        ultimo_erro: null,
        configurado_por: sessao.user.id,
      })
      .eq('provedor', 'omie')
    if (error) return resposta({ erro: error.message }, 500)
    return resposta({ status: 'configurada' })
  }

  /* ------------------------------------------------------ remover credenciais */
  if (acao === 'remover_credenciais') {
    const { error } = await admin
      .from('integracoes')
      .update({ app_key: null, app_secret: null, ativa: false, status: 'nao_configurada', ultimo_erro: null, ultima_conexao_em: null })
      .eq('provedor', 'omie')
    if (error) return resposta({ erro: error.message }, 500)
    return resposta({ status: 'nao_configurada' })
  }

  // A partir daqui todas as ações precisam das credenciais.
  const { data: cfg } = await admin.from('integracoes').select('*').eq('provedor', 'omie').single()
  if (!cfg?.app_key || !cfg?.app_secret) {
    return resposta({ erro: 'A integração ainda não foi configurada.', status: 'nao_configurada' }, 400)
  }

  /* --------------------------------------------------------- testar conexão */
  if (acao === 'testar') {
    const r = await chamarOmie('geral/clientes/', 'ListarClientes', {
      pagina: 1, registros_por_pagina: 1, apenas_importado_api: 'N',
    }, cfg.app_key, cfg.app_secret)

    if (!r.ok) {
      await admin.from('integracoes').update({ status: 'erro', ultimo_erro: r.erro, ativa: false }).eq('provedor', 'omie')
      return resposta({ status: 'erro', erro: r.erro })
    }

    const agora = new Date().toISOString()
    await admin.from('integracoes')
      .update({ status: 'conectada', ultimo_erro: null, ultima_conexao_em: agora, ativa: true })
      .eq('provedor', 'omie')
    return resposta({ status: 'conectada', ultima_conexao_em: agora, registros_disponiveis: Number(r.dados?.total_de_registros ?? 0) })
  }

  /* ------------------------------------------------------------ sincronizar */
  if (acao === 'sincronizar') {
    const tipo = String(corpo.tipo ?? '')
    const validos = ['clientes', 'produtos', 'servicos', 'estoque', 'vendas']
    if (!validos.includes(tipo)) return resposta({ erro: 'Tipo de sincronização desconhecido.' }, 400)

    const paginaInicial = Math.max(1, Number(corpo.pagina ?? 1))
    let sincronizacaoId = corpo.sincronizacao_id ? String(corpo.sincronizacao_id) : null

    if (!sincronizacaoId) {
      const { data, error } = await admin.from('sincronizacoes').insert({
        tipo, executada_por: sessao.user.id,
      }).select('id').single()
      if (error) return resposta({ erro: error.message }, 500)
      sincronizacaoId = data.id
    }

    const acumulado = LOTE_VAZIO()
    let semTag = 0
    let fornecedores = 0
    let pagina = paginaInicial
    let totalPaginas = 0
    let erro: string | undefined

    for (let i = 0; i < PAGINAS_POR_CHAMADA; i++) {
      const fn =
        tipo === 'clientes' ? importarClientes
        : tipo === 'produtos' ? importarProdutos
        : tipo === 'servicos' ? importarServicos
        : tipo === 'estoque' ? importarEstoque
        : importarVendas

      const lote = await fn(admin, cfg.app_key, cfg.app_secret, pagina)
      if (lote.erro) { erro = lote.erro; break }

      acumulado.processados += lote.processados
      acumulado.novos += lote.novos
      acumulado.atualizados += lote.atualizados
      acumulado.falhas += lote.falhas
      acumulado.conflitos.push(...lote.conflitos)
      semTag += (lote as { semTag?: number }).semTag ?? 0
      fornecedores += (lote as { fornecedores?: number }).fornecedores ?? 0
      totalPaginas = lote.totalPaginas

      if (lote.conflitos.length > 0) {
        await admin.from('conflitos_sincronizacao').insert(
          lote.conflitos.map((c) => ({
            sincronizacao_id: sincronizacaoId,
            tipo,
            entidade_local: c.entidade,
            identificador: c.identificador,
            motivo: c.motivo,
            dados_externos: c.dados,
          })),
        )
      }

      if (pagina >= totalPaginas || lote.processados === 0) break
      pagina++
    }

    const concluiu = Boolean(erro) || pagina >= totalPaginas || totalPaginas === 0
    const proximaPagina = concluiu ? null : pagina + 1

    // acumula os números reais no registro da sincronização
    const { data: atual } = await admin.from('sincronizacoes').select('*').eq('id', sincronizacaoId).single()
    const totais = {
      processados: (atual?.processados ?? 0) + acumulado.processados,
      novos: (atual?.novos ?? 0) + acumulado.novos,
      atualizados: (atual?.atualizados ?? 0) + acumulado.atualizados,
      falhas: (atual?.falhas ?? 0) + acumulado.falhas,
    }

    const avisos: string[] = []
    if (semTag > 0) {
      avisos.push(`${semTag} cadastro(s) sem a tag Cliente ou Fornecedor na Omie foram tratados como cliente.`)
    }
    if (acumulado.conflitos.length > 0) avisos.push('Há registros aguardando revisão manual.')

    await admin.from('sincronizacoes').update({
      ...totais,
      resultado: !concluiu
        ? 'em_andamento'
        : erro
          ? 'falhou'
          : totais.falhas > 0 || acumulado.conflitos.length > 0
            ? 'concluida_com_falhas'
            : 'concluida',
      finalizada_em: concluiu ? new Date().toISOString() : null,
      mensagem: erro ?? (avisos.length ? avisos.join(' ') : null),
    }).eq('id', sincronizacaoId)

    if (erro) {
      await admin.from('integracoes').update({ status: 'erro', ultimo_erro: erro }).eq('provedor', 'omie')
      return resposta({ erro, sincronizacao_id: sincronizacaoId, ...totais, concluida: true }, 200)
    }

    await admin.from('integracoes')
      .update({ status: 'conectada', ultimo_erro: null, ultima_conexao_em: new Date().toISOString() })
      .eq('provedor', 'omie')

    return resposta({
      sincronizacao_id: sincronizacaoId,
      ...totais,
      conflitos: acumulado.conflitos.length,
      fornecedores,
      sem_tag: semTag,
      pagina_atual: pagina,
      total_paginas: totalPaginas,
      proxima_pagina: proximaPagina,
      concluida: concluiu,
    })
  }

  return resposta({ erro: 'Ação desconhecida.' }, 400)
})
