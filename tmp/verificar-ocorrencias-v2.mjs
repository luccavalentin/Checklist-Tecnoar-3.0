import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { configurar } from '../scripts/testes-sos/mock-sos.mjs'

const out = 'output/playwright/ocorrencias-v2'
await mkdir(out, { recursive: true })
const browser = await chromium.launch()
const results = []
try {
  for (const [width, theme] of [[320, 'claro'], [390, 'claro'], [390, 'escuro'], [1280, 'claro']]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } })
    await configurar(context, 'cliente', theme)
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto('http://127.0.0.1:5175/sos')
    await page.locator('.pp-tipo-peca').first().waitFor()
    await page.locator('.pp-tipos').scrollIntoViewIfNeeded()
    await page.locator('.pp-tipo-peca').evaluateAll(images => Promise.all(images.map(i => i.decode())))
    await page.evaluate(() => document.fonts.ready)
    const images = await page.locator('.pp-tipo-peca').evaluateAll(imgs => imgs.map(i => ({
      src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0,
      filter: getComputedStyle(i).filter, opacity: getComputedStyle(i).opacity,
      blend: getComputedStyle(i).mixBlendMode,
    })))
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
    await page.screenshot({ path: `${out}/problema-${width}-${theme}.png`, fullPage: true })
    const tire = page.getByRole('button', { name: 'Roda ou pneu', exact: true })
    await tire.click()
    const selected = await tire.getAttribute('aria-pressed')
    await tire.click()
    const deselected = await tire.getAttribute('aria-pressed')
    results.push({ width, theme, images, overflow, selected, deselected, errors })
    await context.close()
  }
} finally { await browser.close() }
await writeFile(`${out}/resultado.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
if (results.some(r => r.errors.length || r.overflow || r.images.length !== 8 || r.selected !== 'true' || r.deselected !== 'false' || r.images.some(i => !i.loaded || i.filter !== 'none' || i.opacity !== '1' || i.blend !== 'normal'))) process.exitCode = 1
