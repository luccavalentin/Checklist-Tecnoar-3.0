/**
 * Gera os ícones das notificações a partir da marca.
 *
 * Duas peças, com papéis diferentes:
 *
 * - badge-96.png: o ícone pequeno da barra de status do Android. O sistema
 *   usa só o canal alfa — todo pixel opaco vira branco. Ícone colorido com
 *   fundo vira um quadrado branco; por isso este é silhueta branca sobre
 *   transparente, desenhada para ser lida a 24dp.
 * - notificacao-192.png: o ícone grande, colorido, dentro da notificação.
 *
 * Uso: node scripts/notificacoes/gerar-icones.mjs
 */

import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PUBLICO = join(RAIZ, 'public')

/* Só a marca oficial: o badge é a própria `tecnoar-mono.svg`, e não um
   desenho feito para caber.

   O Android pinta o badge pelo canal alfa — todo pixel opaco vira branco.
   Transformar a marca inteira em branco apagaria as letras dentro da faixa.
   Por isso o branco da marca (letras, contornos, brilhos) vira recorte
   transparente, e o resto vira silhueta: a marca continua legível na barra de
   status, com as letras vazadas, como nos ícones nativos. */
const MARCA_MONO = readFileSync(join(PUBLICO, 'brand', 'tecnoar-mono.svg')).toString('base64')
const BADGE = `
<svg width="0" height="0" style="position:absolute">
  <filter id="silhueta" color-interpolation-filters="sRGB">
    <feColorMatrix in="SourceGraphic" type="matrix" result="luz"
      values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.2126 -0.7152 -0.0722 0 1"/>
    <feComponentTransfer in="luz" result="corte">
      <feFuncA type="discrete" tableValues="0 1 1 1 1 1 1"/>
    </feComponentTransfer>
    <feComposite in="corte" in2="SourceAlpha" operator="in"/>
  </filter>
</svg>
<div style="width:96px;height:96px;display:flex;align-items:center;justify-content:center">
  <img src="data:image/svg+xml;base64,${MARCA_MONO}"
       style="width:92px;height:92px;object-fit:contain;filter:url(#silhueta)">
</div>`

async function renderizar(pagina, html, destino, lado) {
  await pagina.setViewportSize({ width: lado, height: lado })
  await pagina.setContent(
    `<html><body style="margin:0;background:transparent">${html}</body></html>`,
  )
  await pagina.screenshot({ path: destino, omitBackground: true, clip: { x: 0, y: 0, width: lado, height: lado } })
  console.log(`  ok  ${destino.split(/[\\/]/).pop()}`)
}

const navegador = await chromium.launch()
const pagina = await navegador.newPage({ deviceScaleFactor: 1 })

await renderizar(pagina, BADGE, join(PUBLICO, 'badge-96.png'), 96)

/* Ícone grande: o ícone do app já é a peça certa, com o fundo da marca. */
const icone = readFileSync(join(PUBLICO, 'icon-512.png')).toString('base64')
await renderizar(
  pagina,
  `<img src="data:image/png;base64,${icone}" style="width:192px;height:192px;display:block">`,
  join(PUBLICO, 'notificacao-192.png'),
  192,
)

await navegador.close()
