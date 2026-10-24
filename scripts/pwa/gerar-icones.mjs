/**
 * Gera os desenhos do ícone do Checklist Tecnoar.
 *
 * Fundo azul-marinho da marca com as faixas laranja e ciano na diagonal e o
 * brasão da Tecnoar ao centro. O SOS tem emblema próprio
 * (design/sos-emblema.png) e não passa por aqui — só pelo icones.py.
 *
 * Saem:
 * - o ícone normal (todo o quadrado) e o "maskable" do Android, com margem de
 *   segurança para o sistema recortar em círculo sem cortar o brasão;
 * - a marca simplificada da aba do navegador.
 *
 * Uso: node scripts/pwa/gerar-icones.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const LADO = 1024

/** O brasão, já sem o cabeçalho do arquivo: entra dentro do SVG do ícone. */
function brasao() {
  const svg = readFileSync(join(RAIZ, 'public', 'brand', 'tecnoar-negativo.svg'), 'utf8')
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 100 100'
  const miolo = svg.slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'))
  return { viewBox, miolo }
}

function desenho({ margem }) {
  const { viewBox, miolo } = brasao()
  const lado = 100 - margem * 2
  return `<!doctype html><html><body style="margin:0">
<svg xmlns="http://www.w3.org/2000/svg" width="${LADO}" height="${LADO}" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0E2242" />
      <stop offset="0.55" stop-color="#0A172C" />
      <stop offset="1" stop-color="#060F1E" />
    </linearGradient>
    <clipPath id="quadro"><rect width="100" height="100" /></clipPath>
  </defs>
  <rect width="100" height="100" fill="url(#fundo)" />
  <g clip-path="url(#quadro)">
    <!-- faixas da marca, na diagonal do canto superior direito -->
    <g transform="rotate(-22 50 50)">
      <rect x="86" y="-40" width="6" height="180" fill="#FF6A00" opacity="0.95" />
      <rect x="94" y="-40" width="2.6" height="180" fill="#FF6A00" opacity="0.5" />
      <rect x="99" y="-40" width="4.5" height="180" fill="#00AFEF" opacity="0.8" />
      <rect x="-18" y="-40" width="3.5" height="180" fill="#00AFEF" opacity="0.3" />
    </g>
    <svg x="${margem}" y="${margem}" width="${lado}" height="${lado}" viewBox="${viewBox}">${miolo}</svg>
  </g>
</svg></body></html>`
}

/**
 * Marca simplificada da aba do navegador: o brasão inteiro vira um borrão em
 * 16 px. Fica o essencial — o "T" no azul-marinho, com as faixas da Tecnoar.
 */
function favicon() {
  return `<!doctype html><html><body style="margin:0">
<svg xmlns="http://www.w3.org/2000/svg" width="${LADO}" height="${LADO}" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#12294D" /><stop offset="0.55" stop-color="#0A172C" /><stop offset="1" stop-color="#060F1E" />
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#fundo)" />
  <g transform="rotate(-22 50 50)">
    <rect x="84" y="-40" width="7" height="180" fill="#FF6A00" opacity="0.95" />
    <rect x="93" y="-40" width="3" height="180" fill="#00AFEF" opacity="0.8" />
  </g>
  <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
        font-family="Geist, 'Segoe UI', system-ui, sans-serif"
        font-size="66" font-weight="800" font-style="italic" fill="#FFFFFF">T</text>
</svg></body></html>`
}

const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: LADO, height: LADO }, deviceScaleFactor: 1 })

async function render(html, destino) {
  await pagina.setContent(html)
  await pagina.waitForTimeout(120)
  const png = await pagina.locator('svg').first().screenshot({ omitBackground: true })
  mkdirSync(dirname(destino), { recursive: true })
  writeFileSync(destino, png)
  console.log('gerado', destino.replace(RAIZ, '.'))
}

// Maskable: margem de segurança maior.
await render(desenho({ margem: 13 }), join(RAIZ, 'tmp', 'icones', 'checklist.png'))
await render(desenho({ margem: 22 }), join(RAIZ, 'tmp', 'icones', 'checklist-maskable.png'))
await render(favicon(), join(RAIZ, 'tmp', 'icones', 'checklist-favicon.png'))

await navegador.close()
console.log('\nProntos em tmp/icones. O recorte nos tamanhos finais é feito por scripts/pwa/icones.py.')
