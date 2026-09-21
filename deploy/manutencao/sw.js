/**
 * Service worker de desligamento do app SOS.
 *
 * Enquanto o app está em manutenção, este arquivo toma o lugar do service
 * worker do PWA. Sem ele, quem instalou o app no celular continuaria abrindo
 * a versão guardada em cache: tirar o site do ar não alcança quem já tem o
 * app na tela inicial.
 *
 * Ele não guarda nada e não intercepta nada. Só apaga os caches, se
 * desregistra e manda as telas abertas recarregarem — que então caem na
 * página de manutenção, vinda da rede.
 */

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      await self.clients.claim()

      const chaves = await caches.keys()
      await Promise.all(chaves.map((chave) => caches.delete(chave)))

      await self.registration.unregister()

      /* Recarrega o que estiver aberto agora; o resto já nasce sem SW. */
      const janelas = await self.clients.matchAll({ type: 'window' })
      for (const janela of janelas) {
        try {
          await janela.navigate(janela.url)
        } catch {
          /* navigate falha em aba de outra origem ou sem permissão: tudo bem,
             a próxima navegação da pessoa já vai para a rede. */
        }
      }
    })(),
  )
})
