import { supabase } from '@/lib/supabase'

/**
 * Notificações do sistema operacional — as do aparelho, não as da página.
 *
 * Toda notificação sai pelo service worker (`registration.showNotification`),
 * nunca por `new Notification()`: é isso que faz o celular e o computador a
 * tratarem como notificação do aplicativo Tecnoar, com o ícone e o nome dele,
 * e não como aviso de uma aba do Chrome.
 *
 * Duas camadas:
 * - Local: com o app aberto em segundo plano, a própria página mostra.
 *   Funciona assim que a permissão é dada.
 * - Push: com o app fechado, o servidor envia pela inscrição salva em
 *   `push_inscricoes`. Depende da função de borda `push` publicada.
 */

export const ICONE = '/notificacao-192.png'
export const BADGE = '/badge-96.png'

/* A chave pública VAPID vem da função `push`, que gera o par no servidor na
   primeira vez. Buscada uma vez por sessão: é a mesma para todo aparelho. */
let chavePublica: Promise<string | null> | null = null
function obterChavePublica(): Promise<string | null> {
  chavePublica ??= supabase.functions
    .invoke<{ chave_publica?: string }>('push', { body: { acao: 'chave' } })
    .then(({ data }) => data?.chave_publica ?? null)
    .catch(() => null)
  return chavePublica
}

export function suportado(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
}

function pushSuportado(): boolean {
  return suportado() && 'PushManager' in window
}

export function permissaoAtual(): NotificationPermission | 'indisponivel' {
  return suportado() ? Notification.permission : 'indisponivel'
}

/** A chave VAPID chega em base64url; o PushManager quer os bytes. */
function paraBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const preenchido = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const bruto = atob(preenchido)
  const bytes = new Uint8Array(new ArrayBuffer(bruto.length))
  for (let i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i)
  return bytes
}

/**
 * Registra este aparelho para receber push.
 *
 * Chamado a cada entrada com a permissão já concedida, e não só na primeira:
 * o navegador troca a inscrição quando quer (limpeza de dados, reinstalação),
 * e uma inscrição velha no banco é notificação que nunca chega.
 */
export async function inscreverAparelho(usuarioId: string): Promise<void> {
  if (!pushSuportado() || Notification.permission !== 'granted') return
  const chave = await obterChavePublica()
  if (!chave) return
  const registro = await navigator.serviceWorker.ready
  let inscricao = await registro.pushManager.getSubscription()
  if (!inscricao) {
    inscricao = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: paraBytes(chave),
    })
  }
  const json = inscricao.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return

  const { error } = await supabase.from('push_inscricoes').upsert(
    {
      usuario_id: usuarioId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      agente: navigator.userAgent.slice(0, 200),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

/**
 * Pede a permissão. Precisa vir de um toque: navegador nenhum aceita pedir
 * permissão de notificação sem gesto do usuário, e pedir sem contexto é o jeito
 * mais rápido de levar um "bloquear" para sempre.
 */
export async function ativarNotificacoes(
  usuarioId: string,
): Promise<'ativadas' | 'negada' | 'indisponivel'> {
  if (!suportado()) return 'indisponivel'
  const resposta = await Notification.requestPermission()
  if (resposta !== 'granted') return 'negada'
  /* O push é a segunda camada: se a inscrição falhar, a notificação local já
     funciona e a permissão não pode ser dada como perdida por isso. */
  await inscreverAparelho(usuarioId).catch(() => {})
  return 'ativadas'
}

export interface NotificacaoParaMostrar {
  id: string
  titulo: string
  mensagem: string | null
  link: string | null
  created_at: string
}

/** Mostra a notificação pelo service worker do app — com logo e badge. */
export async function mostrarNotificacao(n: NotificacaoParaMostrar): Promise<void> {
  if (!suportado() || Notification.permission !== 'granted') return
  const registro = await navigator.serviceWorker.getRegistration()
  if (!registro) return
  const opcoes: NotificationOptions & { timestamp?: number } = {
    body: n.mensagem ?? '',
    icon: ICONE,
    badge: BADGE,
    lang: 'pt-BR',
    tag: n.id,
    timestamp: Date.parse(n.created_at),
    data: { link: n.link ?? '/', id: n.id },
  }
  await registro.showNotification(n.titulo, opcoes)
}

/**
 * O número no ícone do app, como nos aplicativos nativos.
 *
 * Badging API: só tem efeito no app instalado, e não existe em todo navegador.
 * Onde falta, a falta é silenciosa — o sino dentro do app continua contando.
 */
export function atualizarContadorDoIcone(quantidade: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>
    clearAppBadge?: () => Promise<void>
  }
  if (quantidade > 0) void nav.setAppBadge?.(quantidade).catch(() => {})
  else void nav.clearAppBadge?.().catch(() => {})
}
