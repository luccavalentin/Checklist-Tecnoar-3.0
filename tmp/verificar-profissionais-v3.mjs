import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { configurar, rpcResposta } from '../scripts/testes-sos/mock-sos.mjs'

const base = 'http://127.0.0.1:5175'
const out = 'output/playwright/profissionais-v3'
await mkdir(out, { recursive: true })
const browser = await chromium.launch()
const results = []
async function capture(page, id, errors, extra = {}) {
  await page.evaluate(() => document.fonts.ready)
  await page.locator('img[src*="/sos/"]').evaluateAll(imgs => Promise.all(imgs.map(i => i.decode().catch(() => {}))))
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${out}/${id}.png`, fullPage: true })
  const data = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    images: [...document.images].filter(i => i.src.includes('/sos/')).map(i => ({ src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0 })),
  }))
  const oldProfile = data.images.some(i => /nav-conta-premium|minha_conta\.webp|tecnoar_icone_conta/.test(i.src))
  results.push({ id, ...data, oldProfile, errors: [...errors], ...extra })
}
try {
  for (const [width, theme] of [[390, 'claro'], [390, 'escuro'], [320, 'claro'], [1280, 'escuro']]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'pt-BR' })
    await configurar(context, 'mecanico', theme)
    await context.route('**/rest/v1/rpc/sos_home_mecanico', route => {
      const data = structuredClone(rpcResposta('sos_home_mecanico', 'mecanico'))
      data.aguardando = []; data.historico = []
      data.hoje = { atendimentos: 0, concluidos: 0, nota_media: null }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })
    const page = await context.newPage()
    page.setDefaultTimeout(15000)
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    const suffix = `${width}-${theme}`
    await page.goto(base + '/')
    await page.locator('.mi-numeros img').first().waitFor()
    await capture(page, `painel-${suffix}`, errors, { statIcons: await page.locator('.mi-numeros img').count(), quickIcons: await page.locator('.mi-acessos img').count() })
    await page.getByRole('button', { name: /Pausa e/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Seu status', exact: true })
    await dialog.waitFor()
    await capture(page, `status-${suffix}`, errors, { statusIcons: await dialog.locator('li img').count(), automaticDisabled: await dialog.getByRole('button', { name: /Em atendimento/ }).isDisabled() })
    await dialog.getByRole('button', { name: 'Fechar', exact: true }).click()
    await page.goto(base + '/perfil')
    await page.getByLabel('Veículo de apoio', { exact: true }).fill('Strada branca ABC1D23')
    await page.getByLabel('Telefone de contato', { exact: true }).fill('11987654321')
    const visibility = page.getByRole('switch', { name: /Mostrar meu telefone/ })
    const before = await visibility.getAttribute('aria-checked')
    await visibility.click()
    const toggled = before !== await visibility.getAttribute('aria-checked')
    await capture(page, `perfil-${suffix}`, errors, { toggled })
    await page.goto(base + '/catalogo/produtos')
    await page.getByRole('searchbox', { name: 'Buscar peça ou código', exact: true }).waitFor()
    await capture(page, `produtos-${suffix}`, errors, { stockIcons: await page.locator('img[src*="produtos-estoque-v3"]').count(), wrongStock: await page.locator('img[src="/sos/kit-3d/cambio.webp"]').count() })
    await page.goto(base + '/chamados')
    await page.getByText('Nenhum atendimento ainda', { exact: true }).waitFor()
    for (const filter of ['Todos', 'Finalizados', 'Avaliados', 'Cancelados']) {
      const tab = page.getByRole('tab', { name: filter, exact: true })
      await tab.click()
      await capture(page, `chamados-${filter}-${suffix}`, errors, { filterSelected: await tab.getAttribute('aria-selected'), filterIcons: await page.getByRole('tablist').locator('img').count() })
    }
    await context.close()
  }
  for (const theme of ['claro', 'escuro']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    await configurar(context, 'cliente', theme)
    const page = await context.newPage()
    await page.goto(base + '/perfil')
    await capture(page, `cliente-${theme}`, [])
    await context.close()
  }
} finally { await browser.close() }
await writeFile(`${out}/resultado.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results.map(({ images, ...r }) => ({ ...r, failedImages: images.filter(i => !i.loaded) })), null, 2))
if (results.some(r => r.overflow || r.oldProfile || r.errors.length || r.images.some(i => !i.loaded) || r.wrongStock || (r.statIcons != null && r.statIcons !== 4) || (r.quickIcons != null && r.quickIcons !== 4) || (r.statusIcons != null && r.statusIcons !== 5) || (r.filterIcons != null && r.filterIcons !== 4) || r.toggled === false || r.automaticDisabled === false)) process.exitCode = 1
