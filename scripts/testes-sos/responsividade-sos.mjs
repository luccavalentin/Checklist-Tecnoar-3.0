/**
 * Varredura de responsividade do app SOS: toda rota × várias larguras.
 *
 * Em cada tela procura o que quebra no celular pequeno e no tablet/desktop:
 *   - rolagem horizontal da página;
 *   - elemento visível saindo da tela (fora de áreas que rolam de propósito);
 *   - texto cortado sem reticências (conteúdo maior que a caixa, overflow hidden);
 *   - erro de JavaScript ou de console.
 *
 * Uso: node scripts/testes-sos/responsividade-sos.mjs  (dev server em :5174)
 *      SOS_FILTRO=mecanico  SOS_LARGURAS=320,390
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BASE, configurar } from './mock-sos.mjs'
import { ROTAS } from './rotas-sos.mjs'

const OUT = path.resolve('output/playwright/responsividade-sos')
const LARGURAS = (process.env.SOS_LARGURAS || '320,360,390,430,768,1280').split(',').map(Number)
const ALTURA = { 320: 568, 360: 740, 390: 844, 430: 932, 768: 1024, 1280: 800 }
const filtro = (process.env.SOS_FILTRO || '').split(',').map((t) => t.trim()).filter(Boolean)

async function inspecionar(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const problemas = []
    const rolagem = document.documentElement.scrollWidth - vw
    if (rolagem > 1) problemas.push({ tipo: 'rolagem-horizontal', px: rolagem })

    const descrever = (el) => {
      const id = el.id ? `#${el.id}` : ''
      const cls = typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : ''
      const txt = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50)
      return `${el.tagName.toLowerCase()}${id}${cls}${txt ? ` "${txt}"` : ''}`
    }
    // Dentro de carrossel, mapa ou tabela com rolagem: sair da tela é esperado.
    const dentroDeRolagem = (el) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p)
        if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && p.clientWidth < vw + 1) return true
        if (p.classList.contains('leaflet-container')) return true
      }
      return false
    }
    const visivel = (el, r) => {
      if (r.width === 0 || r.height === 0) return false
      const s = getComputedStyle(el)
      return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
    }

    const vistos = new Set()
    for (const el of document.body.querySelectorAll('*')) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue
      const r = el.getBoundingClientRect()
      if (!visivel(el, r)) continue
      if ((r.right > vw + 1 || r.left < -1) && !dentroDeRolagem(el)) {
        // Só o mais externo que sai: os filhos saem junto.
        if ([...vistos].some((v) => v.contains(el))) continue
        vistos.add(el)
        problemas.push({ tipo: 'fora-da-tela', px: Math.round(Math.max(r.right - vw, -r.left)), el: descrever(el) })
      }
      // Texto cortado sem reticências.
      const s = getComputedStyle(el)
      if (
        el.children.length === 0 &&
        r.width > 2 &&
        (el.innerText || '').trim().length > 2 &&
        /(hidden|clip)/.test(s.overflowX) &&
        s.textOverflow !== 'ellipsis' &&
        !s.webkitLineClamp?.match(/\d/) &&
        el.scrollWidth > el.clientWidth + 2
      ) {
        problemas.push({ tipo: 'texto-cortado', px: el.scrollWidth - el.clientWidth, el: descrever(el) })
      }
    }
    return problemas.slice(0, 12)
  })
}

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()
const relatorio = []
let comProblema = 0
for (const rota of ROTAS.filter((r) => !filtro.length || filtro.some((t) => r.id.includes(t)))) {
  for (const largura of LARGURAS) {
    const tema = rota.tema || 'escuro'
    const movel = largura < 768
    const context = await browser.newContext({
      viewport: { width: largura, height: ALTURA[largura] ?? 900 },
      deviceScaleFactor: 1,
      isMobile: movel,
      hasTouch: movel,
      locale: 'pt-BR',
      colorScheme: tema === 'escuro' ? 'dark' : 'light',
    })
    await configurar(context, rota.persona, tema)
    const page = await context.newPage()
    page.setDefaultTimeout(9000)
    const erros = []
    page.on('pageerror', (e) => erros.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error' && !/favicon|Failed to load resource|tile\.openstreetmap/i.test(m.text())) erros.push(m.text())
    })
    await page.goto(`${BASE}${rota.path}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {})
    await page.waitForTimeout(rota.delay ?? 900)
    const problemas = await inspecionar(page)
    for (const e of erros) problemas.push({ tipo: 'erro-js', el: e.slice(0, 160) })
    if (process.env.SOS_CAPTURAR) await page.screenshot({ path: path.join(OUT, `todas-${largura}-${rota.id}.png`), fullPage: true, scale: 'css' })
    if (problemas.length) {
      comProblema++
      await page.screenshot({ path: path.join(OUT, `${rota.id}-${largura}.png`), fullPage: true, scale: 'css' })
    }
    relatorio.push({ rota: rota.id, largura, problemas })
    console.log(`${problemas.length ? 'FALHA' : 'ok   '} ${String(largura).padStart(4)}  ${rota.id}`)
    for (const p of problemas) console.log(`        ${p.tipo}${p.px != null ? ` (${p.px}px)` : ''} ${p.el ?? ''}`)
    await context.close()
  }
}
await browser.close()
await writeFile(path.join(OUT, 'relatorio.json'), JSON.stringify(relatorio, null, 2))
console.log(`\n${relatorio.length} telas verificadas, ${comProblema} com problema.`)
process.exitCode = comProblema ? 1 : 0
