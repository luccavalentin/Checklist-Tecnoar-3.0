import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { instrucoes, type Dominio, type Equipamento } from './prompt.ts'
import { chamar, type Parte, type Provedor, type Turno } from './provedores.ts'

/**
 * Tecnoar IA — perita em freio a ar de veículos pesados.
 *
 * Canal de atendimento aos colaboradores: perguntam por texto, áudio, foto ou
 * vídeo e recebem orientação técnica. Funciona com Anthropic, OpenAI ou
 * Gemini — a escolha é do administrador, em `ia_config.provedor`.
 *
 * Princípios que não se negociam:
 * - Sem chave configurada não existe resposta: devolve `nao_configurada`.
 * - Fonte citada é fonte entregue ao modelo nesta conversa. Título inventado é
 *   descartado antes de chegar na tela.
 * - Áudio só vira texto com serviço de transcrição configurado. Sem ele a
 *   função diz que não ouviu, em vez de adivinhar.
 * - A IA não escreve na base técnica sozinha: gera RASCUNHO para revisão.
 */

const URL_SB = Deno.env.get('SUPABASE_URL')!
const CHAVE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const CHAVE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_ANEXO_BYTES = 8 * 1024 * 1024
const MAX_AUDIO_BYTES = 24 * 1024 * 1024
const IMAGENS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const PROVEDORES: Provedor[] = ['anthropic', 'openai', 'gemini']

function resposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const so = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

function base64(bytes: Uint8Array): string {
  let bin = ''
  const passo = 0x8000
  for (let i = 0; i < bytes.length; i += passo) bin += String.fromCharCode(...bytes.subarray(i, i + passo))
  return btoa(bin)
}

async function contextoDaOS(admin: SupabaseClient, osId: string): Promise<string> {
  const { data: os } = await admin
    .from('ordens_servico')
    .select('numero, km, problema_alegado, diagnostico, cliente:clientes ( nome_razao ), veiculo:veiculos ( placa, marca, modelo, ano, tipo ), status:status_os ( nome )')
    .eq('id', osId)
    .maybeSingle()
  if (!os) return ''

  const o = os as Record<string, any>
  const l: string[] = ['CONTEXTO DA ORDEM DE SERVIÇO (dados reais do sistema):']
  l.push(`- OS ${String(o.numero).padStart(5, '0')} · status ${o.status?.nome ?? 'não informado'}`)
  if (o.cliente?.nome_razao) l.push(`- Cliente: ${o.cliente.nome_razao}`)
  if (o.veiculo) {
    l.push(`- Veículo: ${[o.veiculo.placa, o.veiculo.marca, o.veiculo.modelo, o.veiculo.ano].filter(Boolean).join(' · ')}`)
    if (o.veiculo.tipo) l.push(`- Tipo: ${o.veiculo.tipo}`)
  }
  if (o.km) l.push(`- KM: ${o.km}`)
  if (o.problema_alegado) l.push(`- Problema alegado: ${o.problema_alegado}`)
  if (o.diagnostico) l.push(`- Diagnóstico registrado: ${o.diagnostico}`)

  const { data: checklists } = await admin.from('checklists').select('id').eq('os_id', osId).limit(10)
  if (checklists?.length) {
    const { data: defeitos } = await admin
      .from('checklist_defeitos')
      .select('defeito, criticidade, recomendacao')
      .in('checklist_id', checklists.map((c: any) => c.id))
      .limit(30)
    if (defeitos?.length) {
      l.push('- Defeitos apontados no checklist:')
      for (const d of defeitos as any[]) {
        l.push(`  • ${d.defeito}${d.criticidade ? ` [${d.criticidade}]` : ''}${d.recomendacao ? ` — recomendação: ${d.recomendacao}` : ''}`)
      }
    }
  }
  return l.join('\n')
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

  let corpo: Record<string, unknown>
  try {
    corpo = await req.json()
  } catch {
    return resposta({ erro: 'Corpo inválido.' }, 400)
  }

  const acao = String(corpo.acao ?? '')
  const acoesDeUso = ['perguntar', 'transcrever', 'avaliar', 'gerar_artigo']
  const { data: autorizado } = await comoUsuario.rpc('tem_permissao', {
    p_recurso: 'tecnoar_ia',
    p_acao: acoesDeUso.includes(acao) ? 'criar' : 'configurar',
  })
  if (autorizado !== true) return resposta({ erro: 'Seu perfil não permite esta ação.' }, 403)

  const admin = createClient(URL_SB, CHAVE_SERVICO, { auth: { persistSession: false } })

  /* ----------------------------------------------------- credenciais */
  if (acao === 'salvar_credenciais') {
    const provedor = so(corpo.provedor) || 'anthropic'
    if (![...PROVEDORES, 'transcricao'].includes(provedor)) {
      return resposta({ erro: `Provedor "${provedor}" não é aceito.` }, 400)
    }
    const chave = so(corpo.api_key)
    const modelo = so(corpo.modelo)
    if (!chave) return resposta({ erro: 'Informe a chave da API.' }, 400)

    const campos: Record<string, unknown> = {
      app_key: chave,
      status: 'configurada',
      ultimo_erro: null,
      configurado_por: sessao.user.id,
    }
    if (modelo) campos.ambiente = modelo

    const { error } = await admin.from('integracoes').update(campos).eq('provedor', provedor)
    if (error) return resposta({ erro: error.message }, 500)
    return resposta({ status: 'configurada', provedor })
  }

  if (acao === 'remover_credenciais') {
    const provedor = so(corpo.provedor) || 'anthropic'
    const { error } = await admin
      .from('integracoes')
      .update({ app_key: null, ativa: false, status: 'nao_configurada', ultimo_erro: null, ultima_conexao_em: null })
      .eq('provedor', provedor)
    if (error) return resposta({ erro: error.message }, 500)
    return resposta({ status: 'nao_configurada', provedor })
  }

  /* ------------------------------------------------------ configuração */
  const { data: cfg } = await admin.from('ia_config').select('*').eq('id', true).maybeSingle()
  const provedor = (so(cfg?.provedor) || 'anthropic') as Provedor
  const { data: credencial } = await admin.from('integracoes').select('*').eq('provedor', provedor).maybeSingle()
  const modelo = so(cfg?.modelo) || so(credencial?.ambiente)
  const maxTokens = Number(cfg?.max_tokens ?? 4000)

  if (!credencial?.app_key) {
    return resposta({
      erro: `A Tecnoar IA está configurada para usar ${provedor}, mas nenhuma chave desse provedor foi informada.`,
      status: 'nao_configurada',
      provedor,
    }, 400)
  }
  if (!modelo) {
    return resposta({ erro: 'Nenhum modelo foi informado na configuração da IA.', status: 'nao_configurada' }, 400)
  }

  const { data: dominios } = await admin
    .from('ia_dominios').select('nome, descricao, termos').eq('ativo', true).order('ordem')
  const { data: equipamentos } = await admin
    .from('ia_equipamentos').select('nome, fabricante, descricao, cobertura').eq('ativo', true).order('ordem')

  const SISTEMA = instrucoes(
    (dominios ?? []) as Dominio[],
    (equipamentos ?? []) as Equipamento[],
    so(cfg?.instrucoes_extra) || null,
  )

  const chamarModelo = (turnos: Turno[], tokens = maxTokens, sistema = SISTEMA) =>
    chamar({ provedor, modelo, chave: credencial.app_key as string, sistema, turnos, maxTokens: tokens })

  /* --------------------------------------------------- testar conexão */
  if (acao === 'testar') {
    const r = await chamarModelo(
      [{ papel: 'usuario', partes: [{ kind: 'texto', texto: 'Responda apenas: ok' }] }],
      32,
      'Responda apenas: ok',
    )
    if (!r.ok) {
      await admin.from('integracoes').update({ status: 'erro', ultimo_erro: r.erro, ativa: false }).eq('provedor', provedor)
      return resposta({ status: 'erro', erro: r.erro, provedor })
    }
    const agora = new Date().toISOString()
    await admin.from('integracoes')
      .update({ status: 'conectada', ultimo_erro: null, ultima_conexao_em: agora, ativa: true })
      .eq('provedor', provedor)
    return resposta({ status: 'conectada', ultima_conexao_em: agora, modelo, provedor })
  }

  /* -------------------------------------------------------- transcrever */
  if (acao === 'transcrever') {
    const caminho = so(corpo.caminho)
    if (!caminho) return resposta({ erro: 'Arquivo não informado.' }, 400)

    const { data: t } = await admin.from('integracoes').select('*').eq('provedor', 'transcricao').maybeSingle()
    if (!t?.app_key) {
      return resposta({
        status: 'sem_transcricao',
        erro: 'Nenhum serviço de transcrição está configurado. O áudio fica anexado, mas não será ouvido pela IA.',
      })
    }

    const { data: arquivo, error: erroArquivo } = await admin.storage.from('evidencias').download(caminho)
    if (erroArquivo || !arquivo) return resposta({ erro: 'Não foi possível ler o áudio enviado.' }, 400)
    if (arquivo.size > MAX_AUDIO_BYTES) {
      return resposta({ erro: 'Áudio maior que 24 MB. Grave um trecho mais curto.' }, 400)
    }

    const form = new FormData()
    form.append('file', arquivo, so(corpo.nome) || 'audio.webm')
    form.append('model', so(t.ambiente) || 'whisper-1')
    form.append('language', 'pt')

    try {
      const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${t.app_key}` },
        body: form,
      })
      const json = await r.json().catch(() => null)
      if (!r.ok) {
        const erro = so(json?.error?.message) || `O serviço de transcrição respondeu HTTP ${r.status}.`
        await admin.from('integracoes').update({ status: 'erro', ultimo_erro: erro }).eq('provedor', 'transcricao')
        return resposta({ status: 'erro', erro })
      }
      await admin.from('integracoes')
        .update({ status: 'conectada', ultimo_erro: null, ultima_conexao_em: new Date().toISOString(), ativa: true })
        .eq('provedor', 'transcricao')
      return resposta({ status: 'ok', texto: so(json?.text) })
    } catch (e) {
      return resposta({ erro: `Falha ao transcrever: ${String((e as Error)?.message ?? e)}` })
    }
  }

  /* -------------------------------------------------------- perguntar */
  if (acao === 'perguntar') {
    const conversaId = so(corpo.conversa_id)
    const pergunta = so(corpo.pergunta)
    const transcricao = so(corpo.transcricao)
    const anexos = Array.isArray(corpo.anexos) ? (corpo.anexos as Array<Record<string, unknown>>) : []
    if (!conversaId) return resposta({ erro: 'Conversa não informada.' }, 400)
    if (!pergunta && !transcricao && anexos.length === 0) {
      return resposta({ erro: 'Escreva, grave ou anexe alguma coisa.' }, 400)
    }

    const { data: conversa } = await admin.from('ia_conversas').select('*').eq('id', conversaId).maybeSingle()
    if (!conversa) return resposta({ erro: 'Conversa não encontrada.' }, 404)
    if (conversa.usuario_id !== sessao.user.id) return resposta({ erro: 'Esta conversa pertence a outro usuário.' }, 403)

    const { data: anteriores } = await admin
      .from('ia_mensagens')
      .select('papel, conteudo, transcricao')
      .eq('conversa_id', conversaId)
      .order('created_at')
      .limit(24)

    const termoBusca = [pergunta, transcricao].filter(Boolean).join(' ').slice(0, 400)
    let artigos: Array<Record<string, any>> = []
    const limiteArtigos = Number(cfg?.artigos_contexto ?? 5)
    if (termoBusca && limiteArtigos > 0) {
      const { data } = await admin
        .from('artigos_tecnicos')
        .select('id, titulo, resumo, conteudo, versao')
        .eq('situacao', 'publicado')
        .textSearch('busca', termoBusca, { type: 'websearch', config: 'portuguese' })
        .limit(limiteArtigos)
      artigos = data ?? []
    }

    const partes: Parte[] = []
    const recusados: string[] = []

    if (conversa.os_id) {
      const ctx = await contextoDaOS(admin, conversa.os_id as string)
      if (ctx) partes.push({ kind: 'texto', texto: ctx })
    }

    if (artigos.length) {
      const base = artigos
        .map((a) => `### ${a.titulo} (v${a.versao})\n${a.resumo ? a.resumo + '\n' : ''}${String(a.conteudo).slice(0, 6000)}`)
        .join('\n\n---\n\n')
      partes.push({ kind: 'texto', texto: `BASE TÉCNICA TECNOAR (artigos publicados desta oficina):\n\n${base}` })
    } else {
      partes.push({ kind: 'texto', texto: 'BASE TÉCNICA TECNOAR: nenhum artigo publicado corresponde a esta pergunta. Responda pelo seu conhecimento e encerre com "FONTES: nenhuma".' })
    }

    for (const a of anexos) {
      const caminho = so(a.caminho)
      const mime = so(a.mime).toLowerCase()
      const nome = so(a.nome) || caminho
      if (so(a.tipo) === 'audio' || !caminho) continue

      const ehImagem = IMAGENS.includes(mime)
      const ehPdf = mime === 'application/pdf'
      if (!ehImagem && !ehPdf) {
        recusados.push(`${nome}: formato ${mime || 'desconhecido'} não é analisado. Descreva por escrito ou envie uma foto.`)
        continue
      }
      if (ehPdf && provedor === 'openai') {
        recusados.push(`${nome}: PDF não é lido pelo provedor OpenAI nesta integração. Envie as páginas como imagem.`)
        continue
      }

      const { data: arquivo, error: erroArquivo } = await admin.storage.from('evidencias').download(caminho)
      if (erroArquivo || !arquivo) {
        recusados.push(`${nome}: não foi possível ler o arquivo.`)
        continue
      }
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      if (bytes.length > MAX_ANEXO_BYTES) {
        recusados.push(`${nome}: maior que 8 MB, não enviado.`)
        continue
      }
      partes.push({ kind: ehPdf ? 'pdf' : 'imagem', mime, dados: base64(bytes) })
    }

    const fala = [
      transcricao ? `[Transcrição do áudio enviado pelo colaborador]\n${transcricao}` : '',
      pergunta,
    ].filter(Boolean).join('\n\n') || 'Analise o que foi enviado.'
    partes.push({ kind: 'texto', texto: fala })

    const turnos: Turno[] = [
      ...(anteriores ?? []).map((m: any) => ({
        papel: (m.papel === 'assistente' ? 'assistente' : 'usuario') as 'assistente' | 'usuario',
        partes: [{ kind: 'texto' as const, texto: String([m.transcricao, m.conteudo].filter(Boolean).join('\n')).slice(0, 8000) }],
      })).filter((t) => t.partes[0].texto.length > 0),
      { papel: 'usuario', partes },
    ]

    const { data: msgUsuario } = await admin
      .from('ia_mensagens')
      .insert({
        conversa_id: conversaId,
        papel: 'usuario',
        conteudo: pergunta,
        transcricao: transcricao || null,
        anexos: anexos.length ? anexos : null,
      })
      .select('*')
      .single()

    const r = await chamarModelo(turnos)

    if (!r.ok) {
      await admin.from('integracoes').update({ status: 'erro', ultimo_erro: r.erro }).eq('provedor', provedor)
      const { data: msgErro } = await admin
        .from('ia_mensagens')
        .insert({ conversa_id: conversaId, papel: 'assistente', conteudo: '', modelo, erro: r.erro })
        .select('*')
        .single()
      return resposta({ erro: r.erro, mensagem: msgErro, pergunta: msgUsuario }, 200)
    }

    let texto = r.texto.trim()

    const citadas: Array<Record<string, any>> = []
    const enviados = new Map(artigos.map((a) => [String(a.titulo).toLowerCase().trim(), a]))
    const linhaFontes = texto.match(/^FONTES:\s*(.+)$/im)
    if (linhaFontes) {
      texto = texto.replace(linhaFontes[0], '').trimEnd()
      const bruto = linhaFontes[1].trim()
      if (!/^nenhuma$/i.test(bruto)) {
        for (const t of bruto.split(';')) {
          const achado = enviados.get(t.toLowerCase().trim())
          if (achado && !citadas.some((c) => c.id === achado.id)) citadas.push(achado)
        }
      }
    }

    const { data: msg } = await admin
      .from('ia_mensagens')
      .insert({
        conversa_id: conversaId,
        papel: 'assistente',
        conteudo: texto,
        modelo: `${provedor}:${modelo}`,
        tokens_entrada: r.entrada,
        tokens_saida: r.saida,
        sem_fonte: citadas.length === 0,
        fora_do_escopo: /fora do meu escopo|fora do escopo/i.test(texto.slice(0, 400)),
        erro: recusados.length ? `Anexos não analisados — ${recusados.join(' | ')}` : null,
      })
      .select('*')
      .single()

    if (msg && citadas.length) {
      await admin.from('ia_fontes').insert(
        citadas.map((a) => ({ mensagem_id: msg.id, artigo_id: a.id, titulo: a.titulo, versao: a.versao })),
      )
    }

    const primeira = pergunta || transcricao
    if ((conversa.titulo === 'Nova análise' || conversa.titulo === 'Nova conversa') && primeira) {
      await admin.from('ia_conversas').update({ titulo: primeira.slice(0, 80) }).eq('id', conversaId)
    } else {
      await admin.from('ia_conversas').update({ updated_at: new Date().toISOString() }).eq('id', conversaId)
    }

    await admin.from('integracoes')
      .update({ status: 'conectada', ultimo_erro: null, ultima_conexao_em: new Date().toISOString(), ativa: true })
      .eq('provedor', provedor)

    return resposta({
      pergunta: msgUsuario,
      mensagem: msg,
      fontes: citadas.map((a) => ({ artigo_id: a.id, titulo: a.titulo, versao: a.versao })),
      anexos_recusados: recusados,
      artigos_consultados: artigos.length,
    })
  }

  /* ---------------------------------------------------------- avaliar */
  if (acao === 'avaliar') {
    const mensagemId = so(corpo.mensagem_id)
    const util = corpo.util === true
    if (!mensagemId) return resposta({ erro: 'Mensagem não informada.' }, 400)

    const { error } = await admin
      .from('ia_mensagens')
      .update({ util, avaliado_por: sessao.user.id, avaliado_em: new Date().toISOString() })
      .eq('id', mensagemId)
    if (error) return resposta({ erro: error.message }, 500)

    if (util && cfg?.aprendizado_ativo) {
      await admin.from('ia_aprendizados')
        .upsert({ mensagem_id: mensagemId, situacao: 'pendente', criado_por: sessao.user.id }, { onConflict: 'mensagem_id' })
    }
    if (!util) {
      await admin.from('ia_aprendizados').delete().eq('mensagem_id', mensagemId).eq('situacao', 'pendente')
    }
    return resposta({ status: 'ok', util })
  }

  /* ----------------------------------------------------- gerar artigo */
  if (acao === 'gerar_artigo') {
    const mensagemId = so(corpo.mensagem_id)
    if (!mensagemId) return resposta({ erro: 'Mensagem não informada.' }, 400)

    const { data: msg } = await admin
      .from('ia_mensagens')
      .select('id, conteudo, conversa_id')
      .eq('id', mensagemId)
      .maybeSingle()
    if (!msg) return resposta({ erro: 'Mensagem não encontrada.' }, 404)
    if (!so(msg.conteudo)) return resposta({ erro: 'Esta mensagem não tem conteúdo para virar artigo.' }, 400)

    const { data: contexto } = await admin
      .from('ia_mensagens')
      .select('papel, conteudo, transcricao')
      .eq('conversa_id', msg.conversa_id)
      .order('created_at')
      .limit(20)

    const conversa = (contexto ?? [])
      .map((m: any) => `${m.papel === 'assistente' ? 'IA' : 'Mecânico'}: ${[m.transcricao, m.conteudo].filter(Boolean).join(' ')}`)
      .join('\n\n')
      .slice(0, 20000)

    const r = await chamarModelo(
      [{
        papel: 'usuario',
        partes: [{
          kind: 'texto',
          texto: `A conversa abaixo aconteceu entre um mecânico e a IA técnica da oficina. Transforme o conhecimento dela em um artigo de base técnica reutilizável.

Devolva APENAS um objeto JSON, sem texto antes ou depois:
{
  "titulo": "título específico e pesquisável, no máximo 90 caracteres",
  "resumo": "duas ou três frases dizendo o que o artigo resolve",
  "conteudo": "o artigo em markdown: sintoma, causas prováveis, procedimento de teste na ordem, critério de decisão e cuidados de segurança",
  "categoria": "uma entre: diagnostico, procedimento, componente, seguranca, equipamento",
  "componente": "componente principal ou null",
  "fabricante": "fabricante citado ou null",
  "equipamento": "aparelho de diagnóstico citado ou null",
  "sintomas": ["sintoma como o mecânico descreveria"],
  "tags": ["palavra-chave"]
}

Regras: não invente valores de pressão, torque ou número de peça que não estejam na conversa. Onde a conversa disse "confirmar no manual", mantenha a ressalva.

CONVERSA:
${conversa}`,
        }],
      }],
      6000,
      'Você redige documentação técnica de oficina de freios. Responde apenas com o JSON pedido.',
    )

    if (!r.ok) return resposta({ erro: r.erro }, 200)

    const bruto = r.texto
    const abre = bruto.indexOf('{')
    const fecha = bruto.lastIndexOf('}')
    let art: Record<string, any> | null = null
    try {
      art = abre >= 0 && fecha > abre ? JSON.parse(bruto.slice(abre, fecha + 1)) : null
    } catch {
      art = null
    }
    if (!art?.titulo || !art?.conteudo) {
      return resposta({ erro: 'O modelo não devolveu um artigo utilizável. Tente novamente.' }, 200)
    }

    const { data: artigo, error } = await admin
      .from('artigos_tecnicos')
      .insert({
        titulo: String(art.titulo).slice(0, 200),
        resumo: art.resumo ? String(art.resumo) : null,
        conteudo: String(art.conteudo),
        categoria: so(art.categoria) || 'diagnostico',
        componente: so(art.componente) || null,
        fabricante: so(art.fabricante) || null,
        equipamento: so(art.equipamento) || null,
        sintomas: Array.isArray(art.sintomas) ? art.sintomas.map(String).slice(0, 12) : [],
        tags: Array.isArray(art.tags) ? art.tags.map(String).slice(0, 12) : [],
        situacao: 'rascunho',
        autor_id: sessao.user.id,
      })
      .select('id, numero, titulo')
      .single()
    if (error) return resposta({ erro: error.message }, 500)

    await admin.from('ia_aprendizados')
      .upsert(
        { mensagem_id: mensagemId, artigo_id: artigo.id, situacao: 'rascunho_gerado', criado_por: sessao.user.id },
        { onConflict: 'mensagem_id' },
      )

    return resposta({ status: 'ok', artigo })
  }

  return resposta({ erro: 'Ação desconhecida.' }, 400)
})
