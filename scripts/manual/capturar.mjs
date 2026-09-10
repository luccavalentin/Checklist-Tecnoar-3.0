/**
 * Captura as telas do sistema para o manual do usuário.
 *
 * A sessão é sua: na primeira execução o navegador abre visível e espera você
 * entrar. O estado fica em `scripts/manual/.sessao.json`, que o .gitignore
 * ignora — a senha nunca passa por aqui, nem por script nem por arquivo.
 *
 * Dado sensível é tarjado antes do clique da foto: nome de cliente, documento,
 * telefone, e-mail e valor viram blocos. O manual precisa mostrar o layout e
 * os botões, não a carteira de clientes da oficina.
 *
 * Uso:
 *   node scripts/manual/capturar.mjs            # usa a sessão salva
 *   node scripts/manual/capturar.mjs --login    # força novo login
 */

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, rmSync } from 'node:fs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')
const SESSAO = join(AQUI, '.sessao.json')
const SAIDA = join(RAIZ, 'docs', 'manual')
const SITE = 'https://checklist.tecnoarsistemas.com.br'

/** Telas do manual, na ordem em que o manual as apresenta. */
const TELAS = [
  { arquivo: '01-login', rota: '/entrar', publica: true, esperar: 'Entrar' },
  { arquivo: '02-visao-geral', rota: '/visao-geral' },
  { arquivo: '03-recepcao', rota: '/operacao/recepcao' },
  { arquivo: '04-ordens-servico', rota: '/operacao/ordens-de-servico' },
  { arquivo: '05-checklist-entrada', rota: '/operacao/checklists/entrada' },
  { arquivo: '06-checklist-saida', rota: '/operacao/checklists/saida' },
  { arquivo: '07-patio', rota: '/operacao/patio' },
  { arquivo: '08-saida-patio', rota: '/operacao/saida' },
  { arquivo: '09-pecas-em-teste', rota: '/operacao/pecas-em-teste' },
  { arquivo: '10-garantias', rota: '/operacao/garantias' },
  { arquivo: '11-clientes', rota: '/cadastros/clientes', tarjar: true },
  { arquivo: '12-veiculos', rota: '/cadastros/veiculos' },
  { arquivo: '13-produtos', rota: '/cadastros/produtos', tarjar: true },
  { arquivo: '14-servicos', rota: '/cadastros/servicos' },
  { arquivo: '15-status-os', rota: '/cadastros/status-os' },
  { arquivo: '16-usuarios', rota: '/cadastros/usuarios', tarjar: true },
  { arquivo: '17-indicadores', rota: '/gestao/indicadores' },
  { arquivo: '18-financeiro', rota: '/gestao/financeiro' },
  { arquivo: '19-tecnoar-ia', rota: '/inteligencia/tecnoar-ia' },
  { arquivo: '20-perfis-permissoes', rota: '/sistema/perfis-e-permissoes' },
]

/* Celular: as mesmas telas que o pessoal de pátio usa na mão. */
const TELAS_CELULAR = ['03-recepcao', '05-checklist-entrada', '04-ordens-servico', '07-patio']

/**
 * Tarja o dado sensível, direto na página, antes do clique da foto.
 *
 * É uma função de verdade — não um texto com código dentro. Serializada pelo
 * Playwright, ela não passa por nenhuma camada de escape, que foi onde as
 * expressões regulares se perderam quando isto era uma string.
 *
 * Trocar o texto por blocos, em vez de borrar a imagem, mantém a largura da
 * coluna: a página continua parecendo a página real. Borrão mancha o layout e
 * o leitor deixa de reconhecer a tela que tem à frente.
 */
function tarjarSensiveis() {
  const bloco = (n) => '\u2588'.repeat(Math.max(4, Math.min(n, 24)))

  /* 1. O que se reconhece sozinho, onde quer que esteja. */
  const PADROES = [
    /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
    /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g,
    /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g,
    /\(?\b\d{2}\)?[\s-]?9?\d{4}[\s-]?\d{4}\b/g,
  ]
  const caminhar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const nos = []
  while (caminhar.nextNode()) nos.push(caminhar.currentNode)
  for (const no of nos) {
    const pai = no.parentElement
    if (!pai || pai.tagName === 'SCRIPT' || pai.tagName === 'STYLE') continue
    let t = no.nodeValue
    for (const p of PADROES) t = t.replace(p, (m) => bloco(m.length))
    if (t !== no.nodeValue) no.nodeValue = t
  }

  /* 2. Nome próprio não tem padrão: nenhuma expressão o reconhece sem errar.
        O que o identifica é a coluna onde está — e a coluna é descoberta pelo
        cabeçalho, não por posição adivinhada na marcação. */
  const SENSIVEL = /cliente|nome|raz[ãa]o|documento|contato|e-?mail|telefone|fornecedor|respons[áa]vel|motorista/i
  for (const tabela of document.querySelectorAll('table')) {
    const alvos = [...tabela.querySelectorAll('thead th')]
      .map((th, i) => (SENSIVEL.test(th.textContent || '') ? i : -1))
      .filter((i) => i >= 0)
    if (!alvos.length) continue
    for (const linha of tabela.querySelectorAll('tbody tr')) {
      const celulas = [...linha.children]
      for (const i of alvos) {
        const celula = celulas[i]
        if (!celula) continue
        const w = document.createTreeWalker(celula, NodeFilter.SHOW_TEXT)
        const textos = []
        while (w.nextNode()) textos.push(w.currentNode)
        for (const t of textos) {
          const v = (t.nodeValue || '').trim()
          /* Traço de vazio e selo curto ficam: tarjar "—" não protege nada e
             tira do leitor a noção de campo sem preenchimento. */
          if (v.length > 2 && /[A-Za-zÀ-ÿ0-9]/.test(v)) t.nodeValue = bloco(v.length)
        }
      }
    }
  }
}

async function esperarPagina(pagina) {
  await pagina.waitForLoadState('networkidle').catch(() => {})
  /* O sistema mostra estado de carregando antes do dado; sem esta pausa a
     foto sai com esqueleto cinza no lugar da tela. */
  await pagina.waitForTimeout(1800)
}

async function capturar(contexto, tela, largura, altura, sufixo) {
  const pagina = await contexto.newPage()
  await pagina.setViewportSize({ width: largura, height: altura })
  try {
    await pagina.goto(SITE + tela.rota, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await esperarPagina(pagina)
    if (tela.tarjar) await pagina.evaluate(tarjarSensiveis)
    const destino = join(SAIDA, `${tela.arquivo}${sufixo}.png`)
    await pagina.screenshot({ path: destino, fullPage: false })
    console.log(`  ok  ${tela.arquivo}${sufixo}.png`)
  } catch (e) {
    console.log(`  FALHOU  ${tela.arquivo}${sufixo}: ${e.message.split('\n')[0]}`)
  } finally {
    await pagina.close()
  }
}

async function principal() {
  const forcarLogin = process.argv.includes('--login')
  if (forcarLogin && existsSync(SESSAO)) rmSync(SESSAO)
  mkdirSync(SAIDA, { recursive: true })

  const temSessao = existsSync(SESSAO)
  const navegador = await chromium.launch({ headless: temSessao })
  let contexto = await navegador.newContext({
    storageState: temSessao ? SESSAO : undefined,
    locale: 'pt-BR',
    deviceScaleFactor: 2,
  })

  if (!temSessao) {
    console.log('\nPrimeira execução: entre no sistema na janela que abriu.')
    console.log('Assim que a Visão Geral aparecer, o script segue sozinho.\n')
    const pagina = await contexto.newPage()
    await pagina.goto(SITE)
    await pagina.waitForURL(/visao-geral/, { timeout: 300000 })
    await contexto.storageState({ path: SESSAO })
    await pagina.close()
    await contexto.close()
    await navegador.close()
    console.log('Sessão salva. Rode o comando de novo para capturar as telas.')
    return
  }

  console.log('\nDesktop 1440x900')
  for (const tela of TELAS) await capturar(contexto, tela, 1440, 900, '')

  console.log('\nCelular 390x844')
  await contexto.close()
  contexto = await navegador.newContext({
    storageState: SESSAO,
    locale: 'pt-BR',
    deviceScaleFactor: 2,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  for (const nome of TELAS_CELULAR) {
    const tela = TELAS.find((t) => t.arquivo === nome)
    if (tela) await capturar(contexto, tela, 390, 844, '-celular')
  }

  await contexto.close()
  await navegador.close()
  console.log(`\nTelas em ${SAIDA}`)
}

principal().catch((e) => {
  console.error(e)
  process.exit(1)
})
