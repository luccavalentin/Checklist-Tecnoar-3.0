/**
 * Gera as imagens de aplicativo instalável do SOS Tecnoar.
 *
 * - Telas de abertura do iPhone e iPad (`apple-touch-startup-image`): sem
 *   elas, o app instalado abre numa tela branca até o React montar. O iOS só
 *   usa a imagem se o tamanho bater exatamente com o aparelho — por isso uma
 *   por modelo, com a media query de cada um (em app/index.html).
 * - Capturas do manifesto (`screenshots`): o Android e o Chrome do computador
 *   mostram a janela de instalação "de loja", com fotos do app, em vez do
 *   aviso simples.
 *
 * Sem dependência: usa o Chrome instalado, pelo protocolo de depuração — ele
 * emula o aparelho de verdade (largura, densidade, toque), o que a linha de
 * comando não faz abaixo de ~500px. As capturas precisam do app rodando
 * (npm run dev:app, porta 5174). Saem em JPEG: a abertura em PNG pesava 1 MB
 * cada e não ganha nada com isso.
 *
 * Uso:
 *   node scripts/pwa/gerar-telas.mjs            # aberturas + capturas
 *   node scripts/pwa/gerar-telas.mjs --aberturas
 *   node scripts/pwa/gerar-telas.mjs --capturas
 */

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const PUBLICO = join(RAIZ, 'app', 'public')
const INDEX = join(RAIZ, 'app', 'index.html')
const APP = process.env.APP_URL ?? 'http://localhost:5174'

const CHROME =
  process.env.CHROME ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((c) => existsSync(c))
if (!CHROME) throw new Error('Chrome não encontrado. Informe o caminho em CHROME=...')

/** Aparelhos em pé (o app é `orientation: portrait`): pontos CSS e densidade. */
const APARELHOS = [
  { nome: 'iPhone 16/17 Pro Max', w: 440, h: 956, dpr: 3 },
  { nome: 'iPhone Air', w: 420, h: 912, dpr: 3 },
  { nome: 'iPhone 16/17 Pro', w: 402, h: 874, dpr: 3 },
  { nome: 'iPhone 14/15/16 Plus, 15 Pro Max', w: 430, h: 932, dpr: 3 },
  { nome: 'iPhone 14 Pro, 15, 15 Pro, 16', w: 393, h: 852, dpr: 3 },
  { nome: 'iPhone 12/13 Pro Max, 14 Plus', w: 428, h: 926, dpr: 3 },
  { nome: 'iPhone 12/13/14, 16e', w: 390, h: 844, dpr: 3 },
  { nome: 'iPhone X/XS/11 Pro, 12/13 mini', w: 375, h: 812, dpr: 3 },
  { nome: 'iPhone XS Max, 11 Pro Max', w: 414, h: 896, dpr: 3 },
  { nome: 'iPhone XR, 11', w: 414, h: 896, dpr: 2 },
  { nome: 'iPhone 8 Plus', w: 414, h: 736, dpr: 3 },
  { nome: 'iPhone 8, SE', w: 375, h: 667, dpr: 2 },
  { nome: 'iPad Pro 13"', w: 1032, h: 1376, dpr: 2 },
  { nome: 'iPad Pro 12.9"', w: 1024, h: 1366, dpr: 2 },
  { nome: 'iPad Pro 11", Air 11"', w: 834, h: 1194, dpr: 2 },
  { nome: 'iPad Air 10.9", iPad 10', w: 820, h: 1180, dpr: 2 },
  { nome: 'iPad 10.2"', w: 810, h: 1080, dpr: 2 },
  { nome: 'iPad mini', w: 744, h: 1133, dpr: 2 },
]

const arquivoAbertura = (a) => `splash/abertura-${a.w * a.dpr}x${a.h * a.dpr}.jpg`

const CAPTURAS = [
  { arquivo: 'capturas/celular-entrar.jpg', rota: '/entrar', w: 360, h: 780, dpr: 3 },
  { arquivo: 'capturas/celular-mecanico.jpg', rota: '/mecanico/entrar', w: 360, h: 780, dpr: 3 },
  { arquivo: 'capturas/celular-privacidade.jpg', rota: '/privacidade', w: 360, h: 780, dpr: 3 },
  { arquivo: 'capturas/computador-entrar.jpg', rota: '/entrar', w: 1280, h: 800, dpr: 1.5 },
]

const espera = (ms) => new Promise((r) => setTimeout(r, ms))

/* ── Chrome pelo protocolo de depuração ─────────────────────────────────── */

async function abrirChrome() {
  const porta = 9333
  const perfil = join(tmpdir(), `sos-pwa-cdp-${process.pid}`)
  const processo = spawn(
    CHROME,
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--mute-audio', `--user-data-dir=${perfil}`, `--remote-debugging-port=${porta}`, 'about:blank'],
    { stdio: 'ignore' },
  )
  let alvo = null
  for (let i = 0; i < 50 && !alvo; i++) {
    await espera(200)
    alvo = await fetch(`http://127.0.0.1:${porta}/json/list`)
      .then((r) => r.json())
      .then((l) => l.find((t) => t.type === 'page'))
      .catch(() => null)
  }
  if (!alvo) {
    processo.kill()
    throw new Error('Chrome não respondeu.')
  }

  const ws = new WebSocket(alvo.webSocketDebuggerUrl)
  await new Promise((ok, erro) => ((ws.onopen = ok), (ws.onerror = erro)))
  let seq = 0
  const pendentes = new Map()
  const ouvintes = new Set()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && pendentes.has(msg.id)) {
      pendentes.get(msg.id)(msg)
      pendentes.delete(msg.id)
    } else for (const o of ouvintes) o(msg)
  }
  const cdp = (method, params = {}) =>
    new Promise((ok, erro) => {
      const id = ++seq
      pendentes.set(id, (r) => (r.error ? erro(new Error(`${method}: ${r.error.message}`)) : ok(r.result)))
      ws.send(JSON.stringify({ id, method, params }))
    })
  await cdp('Page.enable')

  return {
    /** Abre `url` emulando o aparelho e grava a foto em JPEG. */
    async fotografar({ url, arquivo, w, h, dpr, esperaMs }) {
      const celular = w < 768
      await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: celular })
      await cdp('Emulation.setTouchEmulationEnabled', { enabled: celular })
      const carregou = new Promise((ok) => {
        const o = (m) => m.method === 'Page.loadEventFired' && (ouvintes.delete(o), ok())
        ouvintes.add(o)
      })
      await cdp('Page.navigate', { url })
      await carregou
      await espera(esperaMs)
      const { data } = await cdp('Page.captureScreenshot', { format: 'jpeg', quality: 88 })
      writeFileSync(join(PUBLICO, arquivo), Buffer.from(data, 'base64'))
    },
    fechar() {
      ws.close()
      processo.kill()
    },
  }
}

/* ── telas de abertura ──────────────────────────────────────────────────── */

function htmlAbertura() {
  // O ícone entra embutido: a página é um arquivo temporário, longe do public/.
  const icone = readFileSync(join(PUBLICO, 'icone-512.png')).toString('base64')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;height:100%;overflow:hidden}
    body{background:radial-gradient(120% 70% at 50% 42%,#0f2c55 0%,#081830 58%,#050f20 100%);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      font-family:"Segoe UI",system-ui,-apple-system,sans-serif;color:#fff}
    .marca{width:min(62vw,52vh);aspect-ratio:1;background:url(data:image/png;base64,${icone}) center/contain no-repeat;
      -webkit-mask:radial-gradient(closest-side,#000 78%,transparent 100%);mask:radial-gradient(closest-side,#000 78%,transparent 100%)}
    h1{margin:min(2vh,18px) 0 0;font-size:min(7.2vw,4.4vh);font-weight:800;letter-spacing:-.02em}
    p{margin:.5em 0 0;font-size:min(3.8vw,2.3vh);color:rgba(255,255,255,.62);font-weight:500}
    .rodape{position:fixed;bottom:max(5vh,34px);left:0;right:0;text-align:center;font-size:min(3.2vw,1.9vh);
      color:rgba(255,255,255,.4);letter-spacing:.14em;text-transform:uppercase;font-weight:600}
  </style></head><body>
    <div class="marca"></div>
    <h1>SOS Tecnoar</h1>
    <p>Socorro mecânico 24 horas</p>
    <div class="rodape">Tecnoar Freios</div>
  </body></html>`
}

/** Reescreve o bloco de aberturas do index.html entre os marcadores. */
function atualizarIndex() {
  const tags = APARELHOS.map(
    (a) =>
      `    <link rel="apple-touch-startup-image" media="(device-width: ${a.w}px) and (device-height: ${a.h}px) and (-webkit-device-pixel-ratio: ${a.dpr}) and (orientation: portrait)" href="/${arquivoAbertura(a)}" />`,
  ).join('\n')
  const html = readFileSync(INDEX, 'utf8')
  const inicio = '<!-- aberturas:inicio -->'
  const fim = '<!-- aberturas:fim -->'
  if (!html.includes(inicio) || !html.includes(fim)) throw new Error(`Marcadores ${inicio} / ${fim} não encontrados em app/index.html.`)
  writeFileSync(INDEX, html.replace(new RegExp(`${inicio}[\\s\\S]*?${fim}`), `${inicio}\n${tags}\n    ${fim}`))
}

async function gerarAberturas(chrome) {
  rmSync(join(PUBLICO, 'splash'), { recursive: true, force: true })
  mkdirSync(join(PUBLICO, 'splash'), { recursive: true })
  const pagina = join(tmpdir(), 'sos-abertura.html')
  writeFileSync(pagina, htmlAbertura())
  for (const a of APARELHOS) {
    await chrome.fotografar({ url: pathToFileURL(pagina).href, arquivo: arquivoAbertura(a), w: a.w, h: a.h, dpr: a.dpr, esperaMs: 250 })
    console.log('✔', arquivoAbertura(a), '—', a.nome)
  }
  rmSync(pagina, { force: true })
  atualizarIndex()
  console.log('✔ app/index.html atualizado')
}

/* ── capturas do manifesto ──────────────────────────────────────────────── */

async function gerarCapturas(chrome) {
  const vivo = await fetch(APP).then((r) => r.ok).catch(() => false)
  if (!vivo) throw new Error(`App fora do ar em ${APP}. Rode npm run dev:app antes.`)
  rmSync(join(PUBLICO, 'capturas'), { recursive: true, force: true })
  mkdirSync(join(PUBLICO, 'capturas'), { recursive: true })
  for (const c of CAPTURAS) {
    // Fontes, imagem de fundo e animação de entrada.
    await chrome.fotografar({ url: APP + c.rota, arquivo: c.arquivo, w: c.w, h: c.h, dpr: c.dpr, esperaMs: 4500 })
    console.log('✔', c.arquivo, `${Math.round(c.w * c.dpr)}x${Math.round(c.h * c.dpr)}`)
  }
}

const so = process.argv[2]
const chrome = await abrirChrome()
try {
  if (so !== '--capturas') await gerarAberturas(chrome)
  if (so !== '--aberturas') await gerarCapturas(chrome)
} finally {
  chrome.fechar()
}
