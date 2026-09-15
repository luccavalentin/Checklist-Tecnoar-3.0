import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

/**
 * App SOS Tecnoar (cliente e mecânico) — build próprio, servido na raiz do
 * subdomínio `sos.tecnoarsistemas.com.br`.
 *
 * Mesmo repositório e mesmos componentes do Checklist, mas outro aplicativo:
 * outro endereço, outro manifesto (instala como "SOS Tecnoar"), outro service
 * worker e nenhuma tela da equipe dentro do pacote do cliente.
 *
 * Roda depois do build do Checklist e escreve em dist/app — o mesmo
 * container serve as duas pastas, cada uma no seu domínio (deploy/nginx-app.conf).
 */
const raiz = fileURLToPath(new URL('.', import.meta.url))

/**
 * Push e clique em notificação: o mesmo tratador do Checklist
 * (public/sw-notificacoes.js), avisado de que aqui é o app do SOS — os links
 * `/app/...` gravados pelo banco viram caminhos da raiz, e o ícone é o do SOS.
 */
function notificacoesDoSOS(): Plugin {
  return {
    name: 'sos-sw-notificacoes',
    apply: 'build',
    generateBundle() {
      const tratador = readFileSync(fileURLToPath(new URL('./public/sw-notificacoes.js', import.meta.url)), 'utf8')
      this.emitFile({
        type: 'asset',
        fileName: 'sw-notificacoes.js',
        source: `self.TECNOAR_APP = 'sos'\n${tratador}`,
      })
    },
  }
}

export default defineConfig({
  root: fileURLToPath(new URL('./app', import.meta.url)),
  base: '/',
  envDir: raiz,
  publicDir: fileURLToPath(new URL('./app/public', import.meta.url)),
  // Cache de dependências próprio. Sem isto os dois servidores de
  // desenvolvimento (Checklist na 5173, app na 5174) dividiam o mesmo
  // `node_modules/.vite`: como a configuração de cada um é diferente, quem
  // subia depois apagava e refazia o cache do outro, e a tela já aberta passava
  // a pedir arquivos que não existiam mais (504 "Outdated Optimize Dep") — o
  // mapa, carregado sob demanda, era o primeiro a quebrar.
  cacheDir: fileURLToPath(new URL('./node_modules/.vite-app', import.meta.url)),
  // O mapa entra no cache já na partida: descoberto só ao abrir a tela, o
  // Vite recarregava a página no meio do uso.
  optimizeDeps: { include: ['leaflet', 'react-leaflet'] },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@app': fileURLToPath(new URL('./app/src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    notificacoesDoSOS(),
    VitePWA({
      // 'prompt': quem decide a hora de trocar de versão é o app (nunca no meio de um SOS).
      registerType: 'prompt',
      injectRegister: false,
      filename: 'sw.js',
      scope: '/',
      includeAssets: ['icone-64.png', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'SOS Tecnoar',
        short_name: 'SOS Tecnoar',
        description: 'Socorro mecânico, histórico do seu veículo e revisões com a Tecnoar Freios.',
        lang: 'pt-BR',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        // Tocar no ícone ou numa notificação traz a janela que já está aberta
        // (com o chamado em andamento), como um app nativo — não abre outra.
        launch_handler: { client_mode: ['focus-existing', 'auto'] },
        prefer_related_applications: false,
        orientation: 'portrait',
        background_color: '#081830',
        theme_color: '#081830',
        categories: ['auto', 'utilities', 'navigation'],
        icons: [
          { src: '/icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icone-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Pedir socorro', short_name: 'SOS', url: '/sos', icons: [{ src: '/icone-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        // Push e clique em notificação (ver `notificacoesDoSOS` acima).
        importScripts: ['/sw-notificacoes.js'],
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Gerador de PDF (~1,8 MB): baixa no primeiro laudo/relatório, não na instalação.
        globIgnores: ['**/*.map', '**/pdfmake-*.js', '**/vfs_fonts-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Depois do primeiro uso, o gerador de PDF fica guardado (funciona sem sinal).
            urlPattern: ({ url }) => /\/assets\/(pdfmake|vfs_fonts)-/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'gerador-pdf', expiration: { maxEntries: 4 } },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'sos-fontes-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'sos-fontes',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Base do mapa: quem já viu a região continua vendo sem sinal.
            urlPattern: ({ url }) => url.hostname === 'tile.openstreetmap.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'sos-mapa',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    outDir: fileURLToPath(new URL('./dist/app', import.meta.url)),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          mapa: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
  server: { port: 5174 },
})
