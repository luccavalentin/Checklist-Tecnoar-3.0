import type { CapacitorConfig } from '@capacitor/cli'

/**
 * App nativo (Android e iOS) do SOS Tecnoar: o mesmo app do subdomínio do SOS,
 * empacotado com o build de `vite.app.config.ts` (dist/app). A diferença está
 * na localização, que usa o serviço do próprio sistema (GPS + Wi-Fi + antenas
 * da operadora) e continua com a tela desligada — ver `src/sos/geoNativo.ts`.
 */
const config: CapacitorConfig = {
  appId: 'br.com.tecnoarsistemas.sos',
  appName: 'SOS Tecnoar',
  webDir: 'dist/app',
  backgroundColor: '#081830',
  android: {
    // Sem isto o Android corta a localização depois de 5 min em segundo plano.
    useLegacyBridge: true,
  },
  ios: {
    contentInset: 'never',
  },
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
}

export default config
