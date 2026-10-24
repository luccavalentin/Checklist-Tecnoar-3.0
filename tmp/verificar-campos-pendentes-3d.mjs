import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { configurar } from '../scripts/testes-sos/mock-sos.mjs'

const out = 'output/playwright/campos-pendentes-3d'
await mkdir(out, { recursive: true })
const browser = await chromium.launch()
const results = []
try {
  for (const [width, theme] of [[320, 'claro'], [390, 'escuro'], [1280, 'claro']]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } })
    await configurar(context, 'cliente', theme)
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    for (const route of ['perfil', 'notificacoes', 'revisoes']) {
      await page.goto(`http://127.0.0.1:5175/${route}`)
      if (route === 'perfil') {
        await page.getByRole('button', { name: 'Editar', exact: true }).click()
        await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Cliente de teste')
        await page.getByRole('textbox', { name: 'Celular com DDD' }).fill('11987654321')
      }
      if (route === 'revisoes') {
        await page.getByRole('button', { name: 'Agendar revisão', exact: true }).click()
        await page.getByLabel('Data que prefere (opcional)', { exact: true }).fill('2026-12-20')
      }
      await page.evaluate(() => document.fonts.ready)
      await page.waitForTimeout(500)
      const target = route === 'perfil' ? page.locator('.conta-dados') : route === 'revisoes' ? page.locator('.agendamento-data-3d') : page.getByText('Receba avisos no celular', { exact: true }).locator('../..')
      const images = await target.locator('img').evaluateAll(imgs => imgs.map(i => ({ src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0 })))
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      const date = route === 'revisoes' ? await page.getByLabel('Data que prefere (opcional)', { exact: true }).inputValue() : null
      await page.screenshot({ path: `${out}/${route}-${width}-${theme}.png`, fullPage: true })
      results.push({ route, width, theme, images, overflow, date, errors: [...errors] })
    }
    await context.close()
  }
} finally {
  await browser.close()
}
await writeFile(`${out}/resultado.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
if (results.some(r => r.overflow || r.errors.length || !r.images.length || r.images.some(i => !i.loaded) || (r.date && r.date !== '2026-12-20'))) process.exitCode = 1
