import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

/**
 * Push — a notificação do aparelho que chega com o app fechado.
 *
 * Duas ações:
 * - `chave`: devolve a chave pública VAPID, que o app usa para inscrever o
 *   aparelho. É pública por definição e não exige segredo.
 * - envio (padrão): chamado pelo gatilho `notificacoes_push` a cada
 *   notificação inserida no banco. A notificação nasce em regra de banco, então
 *   é o banco que avisa. Protegido pelo segredo que só o banco e esta função
 *   conhecem (`push_segredo()`, executável apenas pela chave de serviço) — por
 *   isso a função é publicada sem verificação de JWT.
 *
 * As chaves VAPID nascem aqui, na primeira chamada, e ficam em
 * `privado.config`, fora da API. A chave privada não passa por arquivo,
 * repositório nem painel.
 *
 * Inscrição que o serviço de push devolve como expirada (404/410) é apagada:
 * mantê-la seria tentar para sempre um aparelho que já não existe.
 */

const URL_SB = Deno.env.get('SUPABASE_URL')!
const CHAVE_SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ASSUNTO = 'mailto:sistemas@tecnoarfreios.com.br'

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

interface Vapid {
  vapid_publica: string
  vapid_privada: string
}

async function chavesVapid(admin: SupabaseClient): Promise<Vapid | null> {
  const { data } = await admin.rpc('push_vapid')
  if (data?.vapid_publica && data?.vapid_privada) return data as Vapid

  const novas = webpush.generateVAPIDKeys()
  await admin.rpc('push_vapid_salvar', { p_publica: novas.publicKey, p_privada: novas.privateKey })
  /* Relê em vez de usar as recém-geradas: se duas chamadas chegarem juntas,
     vale o par que o banco gravou primeiro, e todo aparelho usa o mesmo. */
  const { data: salvas } = await admin.rpc('push_vapid')
  return salvas?.vapid_publica && salvas?.vapid_privada ? (salvas as Vapid) : null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resposta({ erro: 'Método não suportado.' }, 405)

  let corpo: { acao?: string; notificacao_id?: string }
  try {
    corpo = await req.json()
  } catch {
    return resposta({ erro: 'Corpo inválido.' }, 400)
  }

  const admin = createClient(URL_SB, CHAVE_SERVICO, { auth: { persistSession: false } })
  const vapid = await chavesVapid(admin)
  if (!vapid) return resposta({ erro: 'Não foi possível preparar as chaves de push.' }, 500)

  if (corpo.acao === 'chave') return resposta({ chave_publica: vapid.vapid_publica })

  const { data: segredo } = await admin.rpc('push_segredo')
  if (!segredo || req.headers.get('x-push-segredo') !== segredo) {
    return resposta({ erro: 'Não autorizado.' }, 401)
  }
  if (!corpo.notificacao_id) return resposta({ erro: 'Notificação não informada.' }, 400)

  const { data: n } = await admin
    .from('notificacoes')
    .select('id, usuario_id, titulo, mensagem, link, created_at')
    .eq('id', corpo.notificacao_id)
    .maybeSingle()
  if (!n) return resposta({ erro: 'Notificação não encontrada.' }, 404)

  const { data: inscricoes } = await admin
    .from('push_inscricoes')
    .select('id, endpoint, p256dh, auth')
    .eq('usuario_id', n.usuario_id)

  webpush.setVapidDetails(ASSUNTO, vapid.vapid_publica, vapid.vapid_privada)
  const carga = JSON.stringify({
    id: n.id,
    titulo: n.titulo,
    mensagem: n.mensagem,
    link: n.link,
    criada_em: n.created_at,
  })

  let enviadas = 0
  let removidas = 0
  const falhas: string[] = []

  await Promise.all(
    (inscricoes ?? []).map(async (i) => {
      try {
        await webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          carga,
          { TTL: 60 * 60 * 24, urgency: 'high' },
        )
        enviadas++
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) {
          await admin.from('push_inscricoes').delete().eq('id', i.id)
          removidas++
        } else {
          falhas.push(String(status ?? (e as Error)?.message ?? e))
        }
      }
    }),
  )

  return resposta({ enviadas, removidas, falhas })
})
