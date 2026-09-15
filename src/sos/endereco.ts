/**
 * Onde mora o app SOS Tecnoar (cliente e mecânico).
 *
 * É outro aplicativo, num subdomínio próprio — `sos.tecnoarsistemas.com.br` —,
 * com service worker, manifesto e sessão separados do Checklist. Em
 * desenvolvimento, o servidor do app (`npm run dev:app`, porta 5174).
 * `VITE_SOS_URL` troca o endereço sem mexer no código.
 *
 * Os links que o banco grava para o app (notificações) começam com `/app/`,
 * de quando o app morava em uma pasta do Checklist. Eles continuam valendo:
 * `linkAppSOS` os converte para o endereço do subdomínio.
 */
export const URL_APP_SOS: string = (
  (import.meta.env.VITE_SOS_URL as string | undefined) ||
  (import.meta.env.DEV ? 'http://localhost:5174' : 'https://sos.tecnoarsistemas.com.br')
).replace(/\/+$/, '')

/** O Checklist (central do SOS), visto de dentro do app. `VITE_CHECKLIST_URL` troca o endereço. */
export const URL_CHECKLIST: string = (
  (import.meta.env.VITE_CHECKLIST_URL as string | undefined) ||
  (import.meta.env.DEV ? 'http://localhost:5173' : 'https://checklist.tecnoarsistemas.com.br')
).replace(/\/+$/, '')

/** `/app/chamado/1` → `https://sos…/chamado/1`. Sem caminho, a página inicial do app. */
export function linkAppSOS(caminho = '/'): string {
  const c = caminho.replace(/^\/app(?=\/|$)/, '') || '/'
  return URL_APP_SOS + (c.startsWith('/') ? c : `/${c}`)
}
