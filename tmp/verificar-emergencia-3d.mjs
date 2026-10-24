import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { configurar } from '../scripts/testes-sos/mock-sos.mjs'

const out = 'output/playwright/emergencia-3d'
await mkdir(out, { recursive: true })
const browser = await chromium.launch()
const results = []
try {
  for (const [width, theme] of [[320, 'claro'], [390, 'escuro'], [1280, 'claro']]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } })
    await configurar(context, 'cliente', theme)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto('http://127.0.0.1:5175/contato')
    const buttons = page.locator('a.sos-button-3d-perigo')
    await buttons.first().waitFor()
    await page.evaluate(() => document.fonts.ready)
    await buttons.first().scrollIntoViewIfNeeded()
    const links = await buttons.evaluateAll(els => els.map(el => ({
      href: el.getAttribute('href'),
      height: el.getBoundingClientRect().height,
      background: getComputedStyle(el).backgroundImage,
      clipped: el.scrollWidth > el.clientWidth,
    })))
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    await page.screenshot({ path: `${out}/contato-${width}-${theme}.png`, fullPage: true })
    results.push({ width, theme, links, overflow, errors })
    await context.close()
  }
} finally { await browser.close() }
await writeFile(`${out}/resultado.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
if (results.some(r => r.errors.length || r.overflow || r.links.map(l => l.href).join(',') !== 'tel:193,tel:192,tel:190,tel:191' || r.links.some(l => l.clipped || l.height < 48 || !l.background.includes('gradient')))) process.exitCode = 1
