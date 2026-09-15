/**
 * Notificações do Tecnoar dentro do service worker.
 *
 * Importado pelo service worker que o vite-plugin-pwa gera (workbox
 * `importScripts`). É aqui que a notificação vira notificação do aplicativo —
 * com o ícone e o nome da Tecnoar — e não um aviso de página do navegador:
 * quem mostra é o service worker do app instalado.
 *
 * Duas portas de entrada chegam ao mesmo lugar:
 * - `push`: o servidor avisou, mesmo com o app fechado.
 * - a própria página, quando está aberta em segundo plano, via
 *   `registration.showNotification` com o mesmo `tag`.
 * O `tag` é o id da notificação no banco: se as duas portas mostrarem a mesma
 * notificação, a segunda substitui a primeira em silêncio, em vez de tocar
 * duas vezes.
 *
 * O mesmo arquivo serve o Checklist e o app SOS Tecnoar, que mora num
 * subdomínio próprio. O build do SOS acrescenta `self.TECNOAR_APP = 'sos'` no
 * topo. Os links que o banco grava para o app começam com `/app/`: no SOS
 * viram caminhos da raiz; no Checklist, abrem o app do SOS.
 */

const NO_SOS = self.TECNOAR_APP === 'sos'
// Mesmo endereço de src/sos/endereco.ts.
const URL_APP_SOS = 'https://sos.tecnoarsistemas.com.br'
const ICONE = NO_SOS ? '/icone-192.png' : '/notificacao-192.png'
const BADGE = '/badge-96.png'

/** Endereço completo da tela que a notificação abre. */
function destinoDe(link) {
  const caminho = link || '/'
  if (/^\/app(\/|$)/.test(caminho)) {
    const resto = caminho.slice(4) || '/'
    return NO_SOS ? new URL(resto, self.location.origin).href : URL_APP_SOS + resto
  }
  return new URL(caminho, self.location.origin).href
}

self.addEventListener('push', (evento) => {
  let dados = {}
  try {
    dados = evento.data ? evento.data.json() : {}
  } catch {
    dados = { mensagem: evento.data ? evento.data.text() : '' }
  }

  evento.waitUntil(
    (async () => {
      /* App aberto e em foco: a pessoa já está olhando a tela, e uma
         notificação do sistema por cima só duplica o aviso. Como nos apps
         nativos, vira aviso dentro do app. */
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const emFoco = janelas.filter((j) => j.visibilityState === 'visible' && j.focused)
      if (emFoco.length) {
        for (const janela of emFoco) janela.postMessage({ tipo: 'tecnoar:notificacao', dados })
        return
      }

      const opcoes = {
        body: dados.mensagem || '',
        icon: ICONE,
        badge: BADGE,
        lang: 'pt-BR',
        timestamp: dados.criada_em ? Date.parse(dados.criada_em) : Date.now(),
        data: { link: dados.link || '/', id: dados.id || null },
      }
      if (dados.id) opcoes.tag = dados.id
      /* Aviso de SOS (novo, escalado, sem sinal): não pode sumir sozinho da
         tela nem passar despercebido no bolso. Fica até ser tocado e vibra
         forte — onde o aparelho suporta (Android e computador). */
      if (/^(🚨|🔴|⏱|⚠️|📡|📍|⏰)/u.test(dados.titulo || '')) {
        opcoes.requireInteraction = true
        opcoes.vibrate = [500, 180, 500, 180, 900]
        opcoes.silent = false
        if (opcoes.tag) opcoes.renotify = true
      }
      await self.registration.showNotification(dados.titulo || 'Tecnoar', opcoes)
    })(),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const destino = destinoDe(evento.notification.data?.link)

  evento.waitUntil(
    (async () => {
      /* Se o app já está aberto, traz a janela para frente e leva à tela da
         notificação. Abrir uma segunda janela deixaria o usuário com duas
         cópias do sistema e sem saber qual é a atual. Aviso do SOS chegado
         ao Checklist (funcionário que também é mecânico) abre o app do SOS,
         em outro endereço: aí não há janela deste service worker a reaproveitar. */
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const janela of janelas) {
        if (new URL(janela.url).origin !== new URL(destino).origin) continue
        await janela.focus()
        if ('navigate' in janela) await janela.navigate(destino).catch(() => {})
        return
      }
      await self.clients.openWindow(destino)
    })(),
  )
})
