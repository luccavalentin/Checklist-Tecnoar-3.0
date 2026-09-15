import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { chamar, type Parte, type Provedor, type Turno } from './provedores.ts'
import { OCORRENCIAS, sistemaAtendimento, sistemaMecanico } from './prompt.ts'

/**
 * IA do SOS Tecnoar.
 *
 * Configurada na Gestão SOS do Checklist (provedor, modelo e chave — própria
 * ou a mesma da Tecnoar IA). Ações:
 * - `atendimento`: conversa de triagem com o cliente no app (TECNO IA), com
 *   foto opcional; pode sugerir abrir o SOS (tipo, prioridade, descrição) ou
 *   agendar uma revisão. Com `perfil: 'tecnico'`, é a Tecno IA técnica do
 *   mecânico (e da central), com o contexto do chamado quando `chamado_id`
 *   vem junto.
 * - `foto`: análise de uma foto do chamado.
 * - `kit`: o que levar para o socorro — peças conferidas no catálogo do
 *   Checklist, com preço e estoque.
 * - `resumo`: registro técnico do atendimento para a OS.
 * - `testar`: confere provedor, modelo e chave (central, com `configurar`).
 *
 * Tudo que o usuário vê passa pela sessão DELE (as RPCs conferem acesso ao
 * chamado); a chave de serviço só lê a credencial e grava o registro de uso.
 * A chave do provedor nunca sai daqui.
 */

const URL_SB = Deno.env.get('SUPABASE_URL')!
const CHAVE_ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const CHAVE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const IMAGENS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_IMAGEM = 6 * 1024 * 1024
const PRIORIDADES = ['normal', 'alta', 'emergencia']
const TIPOS_AGENDA = ['revisao', 'manutencao', 'orcamento', 'outro']

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

/** Primeiro objeto JSON do texto (o modelo às vezes embrulha em ```json). */
function jsonDoTexto(texto: string): Record<string, any> | null {
  const abre = texto.indexOf('{')
  const fecha = texto.lastIndexOf('}')
  if (abre < 0 || fecha <= abre) return null
  try {
    return JSON.parse(texto.slice(abre, fecha + 1))
  } catch {
    return null
  }
}

/** Tira as linhas de sugestão do texto e devolve as sugestões já validadas. */
function extrairSugestoes(bruto: string) {
  let texto = bruto
  let sos: Record<string, string> | null = null
  let agendar: Record<string, string> | null = null
  const linhaSos = texto.match(/^\s*SOS_SUGERIDO:\s*(\{.*\})\s*$/m)
  if (linhaSos) {
    texto = texto.replace(linhaSos[0], '')
    const j = jsonDoTexto(linhaSos[1])
    if (j) {
      sos = {
        tipo_ocorrencia: (OCORRENCIAS as readonly string[]).includes(j.tipo_ocorrencia) ? j.tipo_ocorrencia : 'outro',
        prioridade: PRIORIDADES.includes(j.prioridade) ? j.prioridade : 'alta',
        descricao: so(j.descricao).slice(0, 300),
      }
    }
  }
  const linhaAgenda = texto.match(/^\s*AGENDAR_SUGERIDO:\s*(\{.*\})\s*$/m)
  if (linhaAgenda) {
    texto = texto.replace(linhaAgenda[0], '')
    const j = jsonDoTexto(linhaAgenda[1])
    if (j && !sos) {
      agendar = { tipo: TIPOS_AGENDA.includes(j.tipo) ? j.tipo : 'revisao', descricao: so(j.descricao).slice(0, 300) }
    }
  }
  return { texto: texto.trim(), sos, agendar }
}

function contextoCliente(home: any, historico: any[]): string {
  const l: string[] = ['CONTEXTO DO CLIENTE (dados reais do sistema da Tecnoar; use se ajudar, não repita tudo):']
  if (home?.nome) l.push(`- Nome: ${home.nome}`)
  const v = home?.veiculo
  if (v) l.push(`- Veículo principal: ${[v.placa, v.marca, v.modelo, v.ano, v.tipo].filter(Boolean).join(' · ')}${v.km_atual ? ` · ${v.km_atual} km` : ''}`)
  if (home?.ultimo_servico) {
    const u = home.ultimo_servico
    l.push(`- Último serviço na Tecnoar: OS ${u.numero} em ${String(u.em ?? '').slice(0, 10)}${u.servicos ? ` — ${u.servicos}` : ''}`)
  }
  if (home?.chamado_ativo) l.push(`- Já existe um SOS em andamento (protocolo ${home.chamado_ativo.protocolo}). Não sugira abrir outro.`)
  for (const h of (historico ?? []).slice(0, 5)) {
    if (h.tipo === 'sos') l.push(`- SOS anterior: ${h.ocorrencia_rotulo ?? ''}${h.diagnostico ? ` — ${h.diagnostico}` : ''}`)
    else if (h.problema || h.diagnostico) l.push(`- OS ${h.numero}: ${[h.problema, h.diagnostico].filter(Boolean).join(' — ')}`)
  }
  return l.join('\n')
}

function contextoChamado(det: any): string {
  const c = det?.chamado ?? {}
  const v = det?.veiculo
  const l: string[] = [`CHAMADO ${c.protocolo ?? ''} (dados reais do sistema):`]
  l.push(`- Problema relatado: ${c.ocorrencia_rotulo ?? c.tipo_ocorrencia ?? ''}${c.descricao ? ` — ${c.descricao}` : ''}`)
  l.push(`- Prioridade: ${c.prioridade ?? 'normal'} · etapa: ${c.status_rotulo ?? c.status ?? ''}`)
  if (v) l.push(`- Veículo: ${[v.placa, v.marca, v.modelo, v.ano, v.tipo].filter(Boolean).join(' · ')}${v.km_atual ? ` · ${v.km_atual} km` : ''}`)
  if (c.endereco) l.push(`- Local: ${c.endereco}`)
  if (c.diagnostico) l.push(`- Diagnóstico até agora: ${c.diagnostico}`)
  if (c.servico_realizado) l.push(`- Serviço registrado: ${c.servico_realizado}`)
  const ia = c.contexto_ia
  if (ia && typeof ia === 'object') l.push(`- Pré-diagnóstico do app: ${JSON.stringify(ia).slice(0, 600)}`)
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
  const usuarioId = sessao.user.id

  let corpo: Record<string, any>
  try {
    corpo = await req.json()
  } catch {
    return resposta({ erro: 'Corpo inválido.' }, 400)
  }
  const acao = so(corpo.acao)
  const admin: SupabaseClient = createClient(URL_SB, CHAVE_SERVICO, { auth: { persistSession: false } })

  const { data: cred } = await admin.rpc('sos_ia_credencial')
  if (!cred) return resposta({ erro: 'SOS não configurado.' })
  const provedor = (so(cred.provedor) || 'anthropic') as Provedor
  const modelo = so(cred.modelo)
  const modeloTag = `${provedor}:${modelo}`

  const { data: papelInfo } = await comoUsuario.rpc('sos_meu_papel')
  const papel = so(papelInfo?.papel)
  const ehEquipe = papelInfo?.central === true || papel === 'equipe'
  const ehMecanico = papel === 'mecanico'
  // Conta da equipe com perfil de cliente também usa o app como cliente.
  const ehCliente = papel === 'cliente' || (papelInfo?.cliente != null && typeof papelInfo.cliente === 'object')

  const registrar = (linhas: Array<Record<string, unknown>>) =>
    admin.from('sos_ia_mensagens').insert(linhas.map((l) => ({ usuario_id: usuarioId, modelo: modeloTag, ...l })))

  /* ------------------------------------------------------------ testar */
  if (acao === 'testar') {
    const { data: pode } = await comoUsuario.rpc('tem_permissao', { p_recurso: 'sos', p_acao: 'configurar' })
    if (pode !== true) return resposta({ erro: 'Seu perfil não permite configurar o SOS.' }, 403)
    if (!cred.chave) return resposta({ status: 'sem_chave', erro: 'Nenhuma chave configurada (própria ou da Tecnoar IA).' })
    if (!modelo) return resposta({ status: 'erro', erro: 'Informe o modelo.' })
    // Folga de tokens: modelos que "pensam" (Gemini, Claude com raciocínio)
    // gastam parte do limite antes de escrever o "ok".
    const r = await chamar({
      provedor, modelo, chave: cred.chave, sistema: 'Responda apenas: ok', maxTokens: 512,
      turnos: [{ papel: 'usuario', partes: [{ kind: 'texto', texto: 'Responda apenas: ok' }] }],
    })
    await registrar([{ acao: 'testar', papel: 'assistente', conteudo: r.ok ? r.texto.slice(0, 50) : null, erro: r.ok ? null : r.erro,
      tokens_entrada: r.ok ? r.entrada : null, tokens_saida: r.ok ? r.saida : null }])
    return resposta(r.ok ? { status: 'conectada', provedor, modelo } : { status: 'erro', erro: r.erro, provedor, modelo })
  }

  if (!cred.ativa) return resposta({ status: 'desligada', erro: 'A IA do SOS está desligada. Ative em Gestão SOS → Configurações.' })
  if (!cred.chave || !modelo) return resposta({ status: 'sem_chave', erro: 'A IA do SOS está sem chave ou modelo configurado.' })
  const chave = String(cred.chave)

  /* ------------------------------------------------------- atendimento */
  if (acao === 'atendimento') {
    if (!cred.atendimento) return resposta({ status: 'desligada', erro: 'O atendimento pela IA está desligado.' })
    const tecnico = so(corpo.perfil) === 'tecnico'
    if (tecnico ? !ehMecanico && !ehEquipe : !ehCliente && !ehEquipe) {
      return resposta({ erro: tecnico ? 'A Tecno IA técnica é para o mecânico e a central.' : 'O atendimento pela IA é para clientes do app.' }, 403)
    }

    const historico = (Array.isArray(corpo.mensagens) ? corpo.mensagens : [])
      .filter((m: any) => (m?.papel === 'usuario' || m?.papel === 'assistente') && so(m?.texto))
      .slice(-16)
    const ultima = historico[historico.length - 1]
    const imagem = corpo.imagem && typeof corpo.imagem === 'object' ? corpo.imagem : null
    if ((!ultima || ultima.papel !== 'usuario') && !imagem) return resposta({ erro: 'Escreva sua mensagem.' }, 400)

    if (!tecnico && ehCliente && Number(cred.limite_cliente_dia) > 0) {
      const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      const { count } = await admin
        .from('sos_ia_mensagens')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', usuarioId).eq('acao', 'atendimento').eq('papel', 'usuario').gte('created_at', desde)
      if ((count ?? 0) >= Number(cred.limite_cliente_dia)) {
        return resposta({
          status: 'limite',
          erro: 'Você chegou ao limite de conversas com a TECNO IA nas últimas 24 horas. Para socorro, toque em SOS; para dúvidas, ligue para a Tecnoar.',
        })
      }
    }

    let contexto = ''
    if (tecnico) {
      // O chamado em atendimento, conferido pela sessão de quem pergunta.
      const idChamado = so(corpo.chamado_id)
      if (idChamado) {
        const { data: det } = await comoUsuario.rpc('sos_detalhe_chamado', { p_chamado: idChamado })
        if (det) contexto = contextoChamado(det)
      }
    } else if (ehCliente) {
      const [{ data: home }, { data: hist }] = await Promise.all([
        comoUsuario.rpc('sos_home_cliente'),
        comoUsuario.rpc('sos_historico_cliente', { p_veiculo: null, p_limite: 6 }),
      ])
      contexto = contextoCliente(home, Array.isArray(hist) ? hist : [])
    }

    const turnos: Turno[] = historico.map((m: any) => ({
      papel: m.papel,
      partes: [{ kind: 'texto', texto: String(m.texto).slice(0, 4000) }],
    }))
    if (!turnos.length || turnos[turnos.length - 1].papel !== 'usuario') {
      turnos.push({ papel: 'usuario', partes: [{ kind: 'texto', texto: 'Veja a foto que enviei.' }] })
    }
    const ultimoTurno = turnos[turnos.length - 1]
    if (contexto) ultimoTurno.partes.unshift({ kind: 'texto', texto: contexto })
    if (imagem) {
      const mime = so(imagem.mime).toLowerCase()
      const dados = so(imagem.dados)
      if (!IMAGENS.includes(mime) || !dados) return resposta({ erro: 'Envie a foto em JPG ou PNG.' }, 400)
      if (dados.length * 0.75 > MAX_IMAGEM) return resposta({ erro: 'Foto grande demais. Tente outra.' }, 400)
      ultimoTurno.partes.push({ kind: 'imagem', mime, dados })
    }
    // Provedores exigem que a conversa comece pelo usuário.
    while (turnos.length && turnos[0].papel !== 'usuario') turnos.shift()

    const r = await chamar({
      provedor, modelo, chave, turnos, maxTokens: tecnico ? 1400 : 900,
      sistema: tecnico
        ? sistemaMecanico(so(cred.instrucoes) || null)
        : sistemaAtendimento(so(cred.instrucoes) || null, so(cred.telefone_central) || null),
    })
    const pergunta = so(ultima?.papel === 'usuario' ? ultima.texto : '') || (imagem ? '[foto]' : '')
    if (!r.ok) {
      await registrar([
        { acao: 'atendimento', papel: 'usuario', conteudo: pergunta },
        { acao: 'atendimento', papel: 'assistente', erro: r.erro },
      ])
      return resposta({ status: 'erro', erro: 'A TECNO IA não respondeu agora. Tente de novo em instantes — ou toque em SOS se precisar de socorro.' })
    }
    const { texto, sos, agendar } = extrairSugestoes(r.texto)
    await registrar([
      { acao: 'atendimento', papel: 'usuario', conteudo: pergunta },
      { acao: 'atendimento', papel: 'assistente', conteudo: texto, sugestao: sos ?? agendar, tokens_entrada: r.entrada, tokens_saida: r.saida },
    ])
    return resposta({ texto, sugestao_sos: sos, sugestao_agendamento: agendar })
  }

  /* ---------- ações sobre um chamado: o acesso é conferido pela sessão */
  const chamadoId = so(corpo.chamado_id)
  if (!chamadoId) return resposta({ erro: 'Chamado não informado.' }, 400)
  const { data: det, error: erroDet } = await comoUsuario.rpc('sos_detalhe_chamado', { p_chamado: chamadoId })
  if (erroDet || !det) return resposta({ erro: 'Sem acesso a este chamado.' }, 403)

  /* -------------------------------------------------------------- foto */
  if (acao === 'foto') {
    if (!cred.foto) return resposta({ status: 'desligada', erro: 'A análise de fotos pela IA está desligada.' })
    const caminho = so(corpo.caminho)
    if (!caminho.startsWith(`${chamadoId}/`)) return resposta({ erro: 'Foto fora deste chamado.' }, 400)
    const { data: arquivo } = await admin.storage.from('sos').download(caminho)
    if (!arquivo) return resposta({ erro: 'Não foi possível ler a foto.' })
    const mime = (arquivo.type || 'image/jpeg').toLowerCase()
    if (!IMAGENS.includes(mime)) return resposta({ erro: 'Só fotos são analisadas.' })
    const bytes = new Uint8Array(await arquivo.arrayBuffer())
    if (bytes.length > MAX_IMAGEM) return resposta({ erro: 'Foto grande demais para análise.' })

    const partes: Parte[] = [
      { kind: 'texto', texto: contextoChamado(det) },
      { kind: 'imagem', mime, dados: base64(bytes) },
      { kind: 'texto', texto: 'Analise esta foto do atendimento. Em até 12 linhas: 1) o que se vê; 2) hipóteses prováveis; 3) o que conferir no local; 4) riscos de segurança. Seja cauteloso: é uma triagem por imagem.' },
    ]
    const r = await chamar({
      provedor, modelo, chave, maxTokens: 800,
      // O papel NESTE chamado (quem pediu o socorro recebe a explicação simples).
      sistema: det?.papel === 'cliente' ? sistemaAtendimento(so(cred.instrucoes) || null, null) : sistemaMecanico(so(cred.instrucoes) || null),
      turnos: [{ papel: 'usuario', partes }],
    })
    if (!r.ok) {
      await registrar([{ acao: 'foto', chamado_id: chamadoId, papel: 'assistente', erro: r.erro }])
      return resposta({ status: 'erro', erro: 'A IA não conseguiu analisar a foto agora.' })
    }
    const texto = r.texto.trim()
    await registrar([{ acao: 'foto', chamado_id: chamadoId, papel: 'assistente', conteudo: texto, sugestao: { caminho },
      tokens_entrada: r.entrada, tokens_saida: r.saida }])
    await admin.rpc('sos_registrar_evento', {
      p_chamado: chamadoId, p_tipo: 'ia', p_titulo: 'Análise de foto pela IA', p_descricao: texto.slice(0, 1500),
      p_dados: { caminho }, p_papel: 'sistema',
    })
    return resposta({ texto })
  }

  if (!ehMecanico && !ehEquipe) return resposta({ erro: 'Disponível para o mecânico e a central.' }, 403)

  /* --------------------------------------------------------------- kit */
  if (acao === 'kit') {
    if (!cred.kit) return resposta({ status: 'desligada', erro: 'O kit sugerido pela IA está desligado.' })
    const v = det.veiculo
    let historicoVeiculo = ''
    if (v?.id) {
      const { data: oss } = await admin
        .from('ordens_servico')
        .select('numero, aberta_em, problema_alegado, diagnostico, os_servicos ( descricao ), os_produtos ( descricao )')
        .eq('veiculo_id', v.id).eq('situacao', 'ativo')
        .order('aberta_em', { ascending: false }).limit(5)
      historicoVeiculo = (oss ?? [])
        .map((o: any) => `- OS ${o.numero} (${String(o.aberta_em).slice(0, 10)}): ${[o.problema_alegado, o.diagnostico].filter(Boolean).join(' — ')}` +
          `${o.os_produtos?.length ? ` · peças: ${o.os_produtos.map((p: any) => p.descricao).slice(0, 6).join(', ')}` : ''}`)
        .join('\n')
    }
    const pedido = `${contextoChamado(det)}
${historicoVeiculo ? `\nHISTÓRICO DESTE VEÍCULO NA TECNOAR:\n${historicoVeiculo}` : ''}

O mecânico vai sair (ou está a caminho) para este socorro. Monte o kit do que levar.
Responda SOMENTE com um objeto JSON, sem texto antes ou depois:
{"resumo":"hipótese principal em 1-2 frases","hipoteses":["até 4, da mais provável para a menos"],"ferramentas":["até 8 ferramentas/instrumentos"],"pecas":[{"termo":"1 a 3 palavras para buscar no catálogo","motivo":"por que levar"}],"cuidados":["até 4 cuidados de segurança"]}
No máximo 6 peças. Não invente códigos de peça.`
    const r = await chamar({
      provedor, modelo, chave, maxTokens: 1400, sistema: sistemaMecanico(so(cred.instrucoes) || null),
      turnos: [{ papel: 'usuario', partes: [{ kind: 'texto', texto: pedido }] }],
    })
    if (!r.ok) {
      await registrar([{ acao: 'kit', chamado_id: chamadoId, papel: 'assistente', erro: r.erro }])
      return resposta({ status: 'erro', erro: 'A IA não conseguiu montar o kit agora.' })
    }
    const j = jsonDoTexto(r.texto)
    if (!j) return resposta({ status: 'erro', erro: 'A IA não devolveu um kit utilizável. Tente de novo.' })
    const pecas = []
    for (const p of (Array.isArray(j.pecas) ? j.pecas : []).slice(0, 6)) {
      const termo = so(p?.termo).slice(0, 60)
      if (termo.length < 2) continue
      const { data: itens } = await comoUsuario.rpc('sos_catalogo', { p_termo: termo, p_tipo: 'produto', p_limite: 3 })
      pecas.push({ termo, motivo: so(p?.motivo).slice(0, 200), itens: Array.isArray(itens) ? itens : [] })
    }
    const lista = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => so(x)).filter(Boolean).slice(0, n) : [])
    const kit = {
      resumo: so(j.resumo).slice(0, 400),
      hipoteses: lista(j.hipoteses, 4),
      ferramentas: lista(j.ferramentas, 8),
      cuidados: lista(j.cuidados, 4),
      pecas,
      gerado_em: new Date().toISOString(),
      modelo: modeloTag,
    }
    await admin.from('sos_chamados').update({ ia_kit: kit }).eq('id', chamadoId)
    await registrar([{ acao: 'kit', chamado_id: chamadoId, papel: 'assistente', conteudo: kit.resumo, sugestao: kit,
      tokens_entrada: r.entrada, tokens_saida: r.saida }])
    return resposta({ kit })
  }

  /* ------------------------------------------------------------ resumo */
  if (acao === 'resumo') {
    if (!cred.resumo) return resposta({ status: 'desligada', erro: 'O resumo pela IA está desligado.' })
    const eventos = (det.eventos ?? []).slice(-40).map((e: any) => `- ${e.titulo}${e.descricao ? `: ${String(e.descricao).slice(0, 300)}` : ''}`).join('\n')
    const mensagens = (det.mensagens ?? []).slice(-25).map((m: any) => `- ${m.autor_papel}: ${String(m.texto ?? '').slice(0, 300)}`).join('\n')
    const itens = (det.itens ?? []).map((i: any) => `- ${i.quantidade} × ${i.descricao}`).join('\n')
    const pedido = `${contextoChamado(det)}

LINHA DO TEMPO:
${eventos || '- (vazia)'}

CONVERSA CLIENTE × MECÂNICO:
${mensagens || '- (sem mensagens)'}

PEÇAS E SERVIÇOS LANÇADOS:
${itens || '- (nenhum)'}

Escreva o registro técnico deste atendimento para a ordem de serviço. Use SÓ o que está nos dados acima; onde faltar informação, não invente.
Responda SOMENTE com JSON: {"diagnostico":"causa encontrada, objetiva (até 400 caracteres)","servico_realizado":"o que foi feito (até 400 caracteres)","observacoes":"recomendações ao cliente e pendências (até 300 caracteres)"}`
    const r = await chamar({
      provedor, modelo, chave, maxTokens: 900, sistema: sistemaMecanico(so(cred.instrucoes) || null),
      turnos: [{ papel: 'usuario', partes: [{ kind: 'texto', texto: pedido }] }],
    })
    if (!r.ok) {
      await registrar([{ acao: 'resumo', chamado_id: chamadoId, papel: 'assistente', erro: r.erro }])
      return resposta({ status: 'erro', erro: 'A IA não conseguiu resumir agora.' })
    }
    const j = jsonDoTexto(r.texto)
    if (!j) return resposta({ status: 'erro', erro: 'A IA não devolveu um resumo utilizável. Tente de novo.' })
    const resumo = {
      diagnostico: so(j.diagnostico).slice(0, 600),
      servico_realizado: so(j.servico_realizado).slice(0, 600),
      observacoes: so(j.observacoes).slice(0, 400),
    }
    await admin.from('sos_chamados').update({ ia_resumo: JSON.stringify(resumo) }).eq('id', chamadoId)
    await registrar([{ acao: 'resumo', chamado_id: chamadoId, papel: 'assistente', conteudo: resumo.diagnostico, sugestao: resumo,
      tokens_entrada: r.entrada, tokens_saida: r.saida }])
    return resposta({ resumo })
  }

  return resposta({ erro: 'Ação desconhecida.' }, 400)
})
