import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BASE, IDS, configurar } from './mock-sos.mjs'

const OUT = path.resolve('output/playwright/rotas-sos')

async function shot(browser, item) {
  const tema = item.tema || 'escuro'
  const context = await browser.newContext({
    viewport: item.viewport || { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
    colorScheme: tema === 'escuro' ? 'dark' : 'light',
  })
  await configurar(context, item.persona, tema)
  const page = await context.newPage()
  page.setDefaultTimeout(9000)
  // Antes de abrir a tela: travamento na abertura também conta como erro.
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource|tile\.openstreetmap/i.test(m.text())) errors.push(m.text())
  })
  await page.goto(`${BASE}${item.path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 7000 }).catch(() => {})
  await page.waitForTimeout(item.delay ?? 900)
  if (item.after) await item.after(page)
  const file = `${item.id}.png`
  await page.screenshot({ path: path.join(OUT, file), fullPage: true, scale: 'css' })
  const finalUrl = page.url().replace(BASE, '')
  const title = await page.title().catch(() => '')
  await context.close()
  return { ...item, tema, file, finalUrl, title, errors }
}

const itens = [
  { id: '01-publico-login', nome: 'Login', persona: 'anonimo', path: '/entrar' },
  { id: '02-publico-cadastro', nome: 'Cadastro', persona: 'anonimo', path: '/cadastro' },
  { id: '03-publico-recuperar-senha', nome: 'Recuperar senha', persona: 'anonimo', path: '/esqueci-senha' },
  { id: '04-publico-termos', nome: 'Termos de uso', persona: 'anonimo', path: '/termos' },
  { id: '05-publico-privacidade', nome: 'Privacidade', persona: 'anonimo', path: '/privacidade' },
  { id: '06-publico-conta-excluida', nome: 'Conta excluída', persona: 'anonimo', path: '/conta-excluida' },
  { id: '07-publico-acompanhamento', nome: 'Acompanhamento público', persona: 'anonimo', path: '/acompanhar/token-demo' },
  { id: '08-equipe-operacao', nome: 'Operação/equipe', persona: 'equipe', path: '/' },
  { id: '09-cliente-home-claro', nome: 'Cliente · Início claro', persona: 'cliente', path: '/', tema: 'claro' },
  { id: '09b-cliente-home-escuro', nome: 'Cliente · Início escuro', persona: 'cliente', path: '/', tema: 'escuro' },
  { id: '10-cliente-sos-localizacao-claro', nome: 'Cliente · SOS claro', persona: 'cliente', path: '/sos', delay: 1800, tema: 'claro' },
  { id: '10b-cliente-sos-localizacao-escuro', nome: 'Cliente · SOS escuro', persona: 'cliente', path: '/sos', delay: 1800, tema: 'escuro' },
  { id: '11-cliente-chamados', nome: 'Cliente · Chamados', persona: 'cliente', path: '/chamados' },
  { id: '12-cliente-chamado-detalhe', nome: 'Cliente · Chamado ao vivo', persona: 'cliente', path: `/chamado/${IDS.chamado}` },
  { id: '13-cliente-veiculos', nome: 'Cliente · Veículos', persona: 'cliente', path: '/veiculos' },
  { id: '14-cliente-historico', nome: 'Cliente · Histórico', persona: 'cliente', path: '/historico' },
  { id: '15-cliente-revisoes', nome: 'Cliente · Revisões', persona: 'cliente', path: '/revisoes' },
  { id: '16-cliente-contato', nome: 'Cliente · Contato', persona: 'cliente', path: '/contato' },
  { id: '17-cliente-tecno-ia', nome: 'Cliente · TECNO IA', persona: 'cliente', path: '/tecno-ia', delay: 1400 },
  { id: '18-cliente-notificacoes', nome: 'Cliente · Notificações', persona: 'cliente', path: '/notificacoes' },
  { id: '19-cliente-perfil', nome: 'Cliente · Perfil', persona: 'cliente', path: '/perfil' },
  { id: '20-mecanico-painel-claro', nome: 'Mecânico · Painel claro', persona: 'mecanico', path: '/', tema: 'claro' },
  { id: '20b-mecanico-painel-escuro', nome: 'Mecânico · Painel escuro', persona: 'mecanico', path: '/', tema: 'escuro' },
  { id: '21-mecanico-chamados', nome: 'Mecânico · Chamados', persona: 'mecanico', path: '/chamados' },
  { id: '22-mecanico-atendimento', nome: 'Mecânico · Atendimento', persona: 'mecanico', path: `/chamado/${IDS.chamado}` },
  { id: '23-mecanico-notificacoes', nome: 'Mecânico · Notificações', persona: 'mecanico', path: '/notificacoes' },
  { id: '24-mecanico-perfil-claro', nome: 'Mecânico · Perfil claro', persona: 'mecanico', path: '/perfil', tema: 'claro' },
  { id: '24b-mecanico-perfil-escuro', nome: 'Mecânico · Perfil escuro', persona: 'mecanico', path: '/perfil', tema: 'escuro' },
  { id: '25-mecanico-os-lista', nome: 'Mecânico · Minhas OS', persona: 'mecanico', path: '/os', tema: 'claro' },
  { id: '26-mecanico-os-detalhe', nome: 'Mecânico · OS', persona: 'mecanico', path: `/os/${IDS.os}`, tema: 'claro' },
  { id: '27-mecanico-os-nova', nome: 'Mecânico · Nova OS', persona: 'mecanico', path: '/os/nova', tema: 'claro' },
  { id: '28-mecanico-novo-chamado', nome: 'Mecânico · Novo chamado', persona: 'mecanico', path: '/novo-chamado', tema: 'claro' },
  { id: '29-mecanico-catalogo', nome: 'Mecânico · Produtos', persona: 'mecanico', path: '/catalogo/produtos', tema: 'claro' },
  { id: '30-mecanico-tecno-ia', nome: 'Mecânico · Tecno IA', persona: 'mecanico', path: '/tecno-ia', tema: 'claro' },
]

await mkdir(OUT, { recursive: true })
const browser = await chromium.launch()
const resultados = []
// SOS_FILTRO=painel,home captura só as telas cujo id contém um dos termos.
const filtro = (process.env.SOS_FILTRO || '').split(',').map((t) => t.trim()).filter(Boolean)
for (const item of itens.filter((i) => !filtro.length || filtro.some((t) => i.id.includes(t)))) {
  console.log(`capturando ${item.id} ${item.path}`)
  resultados.push(await shot(browser, item))
}
await browser.close()

const cards = resultados.map((r) => `
  <article>
    <h2>${r.nome}</h2>
    <p>${r.persona} · ${r.tema} · ${r.path} → ${r.finalUrl}</p>
    <a href="./${r.file}"><img src="./${r.file}" alt="${r.nome}"></a>
  </article>
`).join('\n')

await writeFile(path.join(OUT, 'rotas.json'), JSON.stringify(resultados, null, 2))
await writeFile(path.join(OUT, 'galeria.html'), `<!doctype html>
<html lang="pt-BR">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Galeria SOS Tecnoar</title>
<style>
  body{margin:0;background:#061326;color:#fff;font:14px Inter,system-ui,sans-serif}
  header{position:sticky;top:0;z-index:2;background:rgba(6,19,38,.88);backdrop-filter:blur(20px);padding:24px}
  h1{margin:0;font-size:28px} p{color:rgba(255,255,255,.62)}
  main{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:22px;padding:24px}
  article{border:1px solid rgba(255,255,255,.14);border-radius:24px;background:rgba(255,255,255,.06);padding:14px;box-shadow:0 24px 70px -45px #000}
  h2{font-size:15px;margin:0 0 4px}
  article p{font-size:12px;margin:0 0 12px}
  img{width:100%;display:block;border-radius:18px;background:#020814}
</style>
<header><h1>Galeria de rotas SOS</h1><p>${resultados.length} prints capturados em viewport mobile 390x844.</p></header>
<main>${cards}</main>
</html>`)

console.log(path.join(OUT, 'galeria.html'))
