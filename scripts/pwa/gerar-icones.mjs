/**
 * Gera os ícones de marca dos dois apps (Checklist e SOS Tecnoar).
 *
 * Um só desenho, duas variações: fundo azul-marinho da marca com as faixas
 * laranja e ciano na diagonal e o brasão da Tecnoar ao centro. O SOS ganha um
 * halo laranja atrás do brasão — na tela do celular os dois ícones ficam lado
 * a lado e precisam se diferenciar à primeira vista.
 *
 * De cada desenho saem:
 * - o ícone normal (todo o quadrado) e o "maskable" do Android, com margem de
 *   segurança para o sistema recortar em círculo sem cortar o brasão;
 * - os tamanhos usados no manifesto, no iPhone e na aba do navegador.
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

function desenho({ halo, margem }) {
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
    <radialGradient id="halo" cx="0.5" cy="0.56" r="0.5">
      <stop offset="0" stop-color="#FF6A00" stop-opacity="0.55" />
      <stop offset="0.55" stop-color="#FF6A00" stop-opacity="0.16" />
      <stop offset="1" stop-color="#FF6A00" stop-opacity="0" />
    </radialGradient>
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
    ${halo ? '<circle cx="50" cy="56" r="46" fill="url(#halo)" />' : ''}
    <svg x="${margem}" y="${margem}" width="${lado}" height="${lado}" viewBox="${viewBox}">${miolo}</svg>
  </g>
</svg></body></html>`
}

/**
 * Marca simplificada da aba do navegador: o brasão inteiro vira um borrão em
 * 16 px. Fica o essencial — "SOS" no laranja da marca, "T" no azul-marinho —
 * com as faixas da Tecnoar.
 */
function favicon(qual) {
  const sos = qual === 'sos'
  return `<!doctype html><html><body style="margin:0">
<svg xmlns="http://www.w3.org/2000/svg" width="${LADO}" height="${LADO}" viewBox="0 0 100 100">
  <defs>
    <linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1">
      ${sos
        ? '<stop offset="0" stop-color="#FF8A1F" /><stop offset="0.55" stop-color="#FF6A00" /><stop offset="1" stop-color="#EE4E00" />'
        : '<stop offset="0" stop-color="#12294D" /><stop offset="0.55" stop-color="#0A172C" /><stop offset="1" stop-color="#060F1E" />'}
    </linearGradient>
  </defs>
  <rect width="100" height="100" fill="url(#fundo)" />
  <g transform="rotate(-22 50 50)">
    <rect x="84" y="-40" width="7" height="180" fill="${sos ? '#FFFFFF' : '#FF6A00'}" opacity="${sos ? '0.28' : '0.95'}" />
    <rect x="93" y="-40" width="3" height="180" fill="${sos ? '#FFFFFF' : '#00AFEF'}" opacity="${sos ? '0.18' : '0.8'}" />
  </g>
  <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
        font-family="Geist, 'Segoe UI', system-ui, sans-serif"
        font-size="${sos ? 38 : 66}" font-weight="800" font-style="italic"
        letter-spacing="${sos ? -1.5 : 0}" fill="#FFFFFF">${sos ? 'SOS' : 'T'}</text>
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

// SOS: halo laranja. Checklist: sem halo. Maskable: margem de segurança maior.
await render(desenho({ halo: true, margem: 13 }), join(RAIZ, 'tmp', 'icones', 'sos.png'))
await render(desenho({ halo: true, margem: 22 }), join(RAIZ, 'tmp', 'icones', 'sos-maskable.png'))
await render(desenho({ halo: false, margem: 13 }), join(RAIZ, 'tmp', 'icones', 'checklist.png'))
await render(desenho({ halo: false, margem: 22 }), join(RAIZ, 'tmp', 'icones', 'checklist-maskable.png'))
await render(favicon('sos'), join(RAIZ, 'tmp', 'icones', 'sos-favicon.png'))
await render(favicon('checklist'), join(RAIZ, 'tmp', 'icones', 'checklist-favicon.png'))

await navegador.close()
console.log('\nProntos em tmp/icones. O recorte nos tamanhos finais é feito por scripts/pwa/icones.py.')
