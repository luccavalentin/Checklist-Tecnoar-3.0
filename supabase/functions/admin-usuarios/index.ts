import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Administração de contas — criação, redefinição de senha e convite.
 *
 * Por que isto é uma Edge Function e não código de tela:
 * criar conta exige a chave de serviço do Supabase, que dá acesso total ao
 * banco. Uma chave dessas no navegador estaria visível para qualquer visitante.
 * Aqui ela nunca sai do servidor.
 *
 * Princípios:
 * - Quem chama é verificado sempre: sessão válida E permissão sobre `usuarios`.
 *   Sem isso, qualquer pessoa autenticada criaria contas para si mesma.
 * - `is_admin` nunca vem do corpo da requisição. Se viesse, um usuário comum
 *   poderia se promover a administrador mandando um JSON. Toda conta nasce sem
 *   privilégio; promover é ato deliberado feito na tela de usuários.
 * - Se o registro na tabela `usuarios` falhar, a conta de autenticação criada
 *   antes é desfeita. Sem isso sobraria um login órfão: existe no Auth, não
 *   existe no sistema, e o e-mail fica bloqueado para uma nova tentativa.
 *
 * Senha inicial: é o próprio e-mail da pessoa, por decisão de operação — a
 * oficina entrega a conta pronta sem depender de e-mail chegar. A pessoa troca
 * depois em "Esqueci minha senha" ou no primeiro acesso.
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
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/** Texto limpo ou vazio. Evita gravar "undefined" e espaços soltos. */
function so(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/**
 * O Supabase exige no mínimo 6 caracteres. E-mail curto demais para servir de
 * senha é raro, mas quando acontece a conta simplesmente não seria criada —
 * então completamos até o mínimo em vez de falhar.
 */
function senhaInicial(email: string): string {
  return email.length >= 6 ? email : `${email}@tecnoar`
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

  const acao = so(corpo.acao)

  /* Criar conta é ato de cadastro; redefinir senha e convidar são manutenção
     de conta existente. Permissões diferentes para responsabilidades
     diferentes. */
  const permissao = acao === 'criar' ? 'criar' : 'editar'
  const { data: autorizado } = await comoUsuario.rpc('tem_permissao', {
    p_recurso: 'usuarios',
    p_acao: permissao,
  })
  if (autorizado !== true) return resposta({ erro: 'Seu perfil não permite esta ação.' }, 403)

  const admin = createClient(URL_SB, CHAVE_SERVICO, { auth: { persistSession: false } })

  /* ------------------------------------------------------------- criar */
  if (acao === 'criar') {
    const email = so(corpo.email).toLowerCase()
    const nome = so(corpo.nome_completo)

    if (!email) return resposta({ erro: 'Informe o e-mail.' }, 400)
    if (!email.includes('@')) return resposta({ erro: 'E-mail inválido.' }, 400)
    if (nome.split(/\s+/).filter(Boolean).length < 2) {
      return resposta({ erro: 'Informe nome e sobrenome.' }, 400)
    }

    const senha = senhaInicial(email)

    const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
      email,
      password: senha,
      // Sem confirmação por e-mail: a conta é entregue pronta pela gestão.
      email_confirm: true,
    })

    if (erroAuth || !criado?.user) {
      const detalhe = String(erroAuth?.message ?? '')
      const jaExiste = /already|registered|exists/i.test(detalhe)
      return resposta(
        { erro: jaExiste ? 'Já existe uma conta com este e-mail.' : detalhe || 'Não foi possível criar a conta.' },
        400,
      )
    }

    const id = criado.user.id

    /* Upsert, não insert: o banco tem um gatilho que cria a linha de
       `usuarios` assim que nasce o login (é assim que o "Solicitar acesso"
       funciona, sem a tela inserir nada). Um insert aqui colidiria com essa
       linha. O upsert cobre os dois casos — gatilho existindo ou não — e
       sobrepõe a situação "pendente" que ele define, porque conta criada pela
       gestão já nasce liberada. */
    const { error: erroPerfil } = await admin.from('usuarios').upsert(
      {
        id,
        email,
        nome_completo: nome,
        telefone: so(corpo.telefone) || null,
        funcao_id: so(corpo.funcao_id) || null,
        perfil_id: so(corpo.perfil_id) || null,
        situacao: so(corpo.situacao) || 'ativo',
        is_admin: false,
      },
      { onConflict: 'id' },
    )

    if (erroPerfil) {
      // Desfaz o login recém-criado: conta sem registro no sistema é lixo que
      // ainda por cima bloqueia o e-mail numa segunda tentativa.
      await admin.auth.admin.deleteUser(id)
      return resposta({ erro: `Conta não registrada: ${erroPerfil.message}` }, 400)
    }

    const especialidades = Array.isArray(corpo.especialidades)
      ? (corpo.especialidades as unknown[]).map(so).filter(Boolean)
      : []

    if (especialidades.length) {
      const { error: erroEsp } = await admin
        .from('usuario_especialidades')
        .insert(especialidades.map((especialidade_id) => ({ usuario_id: id, especialidade_id })))
      // Especialidade é complemento: a conta já existe e funciona. Falhar aqui
      // e desfazer tudo puniria a gestão por um detalhe corrigível na tela.
      if (erroEsp) {
        return resposta({ id, senha_temporaria: senha, aviso: `Conta criada, mas as especialidades não foram vinculadas: ${erroEsp.message}` })
      }
    }

    return resposta({ id, senha_temporaria: senha })
  }

  /* ------------------------------------------ nova senha temporária */
  if (acao === 'nova_senha_temporaria') {
    const usuarioId = so(corpo.usuario_id)
    if (!usuarioId) return resposta({ erro: 'Informe o usuário.' }, 400)

    const { data: alvo, error: erroLer } = await admin
      .from('usuarios')
      .select('email')
      .eq('id', usuarioId)
      .maybeSingle()

    if (erroLer) return resposta({ erro: erroLer.message }, 400)
    if (!alvo?.email) return resposta({ erro: 'Usuário não encontrado.' }, 404)

    const senha = senhaInicial(String(alvo.email).toLowerCase())

    const { error } = await admin.auth.admin.updateUserById(usuarioId, { password: senha })
    if (error) return resposta({ erro: error.message }, 400)

    return resposta({ senha_temporaria: senha })
  }

  /* ------------------------------------------------------ enviar convite */
  if (acao === 'enviar_convite') {
    const email = so(corpo.email).toLowerCase()
    const destino = so(corpo.redirecionar_para)
    if (!email) return resposta({ erro: 'Informe o e-mail.' }, 400)

    // Dispara o e-mail de redefinição pelo remetente configurado no projeto.
    const { error } = await comoUsuario.auth.resetPasswordForEmail(email, {
      redirectTo: destino || undefined,
    })
    if (error) return resposta({ erro: error.message }, 400)

    return resposta({ ok: true })
  }

  return resposta({ erro: `Ação desconhecida: ${acao || '(vazia)'}` }, 400)
})
