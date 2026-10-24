// Confere a paleta: contraste WCAG dos pares texto/fundo e se os estados
// semânticos são distinguíveis entre si.
//
//   node scripts/design/conferir-cores.mjs
//
// Por que isto existe: num app usado na beira da estrada, "serviço concluído",
// "atenção" e "falha" precisam ser reconhecíveis antes de serem lidos. Quando
// os três caem no mesmo matiz, a cor deixa de informar e o usuário depende só
// do texto — que é exatamente o que ele não vai ler com pressa.
//
// A ferramenta lê os blocos de token dos CSS do projeto e mede:
//   · contraste de cada par `--c-X-ink` sobre `--c-X-soft` (WCAG 2.2: 4.5:1)
//   · contraste do texto normal sobre as superfícies
//   · distância de matiz entre ok / warn / crit — a separação semântica
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJETO = fileURLToPath(new URL('../..', import.meta.url))

/* ── cor ─────────────────────────────────────────────────────────────────── */

function hexParaRgb(h) {
  const s = h.replace('#', '').trim()
  const n = s.length === 3 ? s.split('').map((c) => c + c).join('') : s
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)]
}

/** `rgb(255 102 0 / 0.16)` → {rgb, alfa}. Aceita hex também. */
function cor(valor) {
  const v = valor.trim()
  if (v.startsWith('#')) return { rgb: hexParaRgb(v), alfa: 1 }
  const m = v.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+))?\s*\)/i)
  if (!m) return null
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], alfa: m[4] === undefined ? 1 : Number(m[4]) }
}

/** Compõe uma cor com alfa sobre um fundo opaco. */
function sobre(frente, fundo) {
  if (frente.alfa >= 1) return frente.rgb
  return frente.rgb.map((c, i) => Math.round(c * frente.alfa + fundo[i] * (1 - frente.alfa)))
}

function luminancia([r, g, b]) {
  const f = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]
}

function contraste(a, b) {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** Matiz em graus (0–360). Usado só para medir separação entre estados. */
function matiz([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255]
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  if (max === min) return null
  const d = max - min
  let h
  if (max === R) h = ((G - B) / d) % 6
  else if (max === G) h = (B - R) / d + 2
  else h = (R - G) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

function distanciaMatiz(a, b) {
  if (a == null || b == null) return null
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/* ── leitura dos blocos de token ─────────────────────────────────────────── */

/**
 * Remove um bloco de at-rule inteiro (`@media print { … }`), contando chaves
 * para achar o fechamento certo — um `indexOf('}')` pararia na primeira regra
 * de dentro.
 */
function semBloco(css, abertura) {
  let i = css.indexOf(abertura)
  while (i >= 0) {
    const inicio = css.indexOf('{', i)
    if (inicio < 0) break
    let nivel = 0
    let j = inicio
    for (; j < css.length; j++) {
      if (css[j] === '{') nivel++
      else if (css[j] === '}' && --nivel === 0) break
    }
    css = css.slice(0, i) + css.slice(j + 1)
    i = css.indexOf(abertura)
  }
  return css
}

/** Todos os blocos `seletor { --token: valor; }` de um arquivo CSS. */
function blocos(arquivo) {
  // Comentários fora antes de tudo: um comentário com chaves dentro
  // confundiria a varredura, e um comentário colado no seletor viraria parte
  // dele.
  let css = fs.readFileSync(path.join(PROJETO, arquivo), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

  // `@media print` redefine `:root, .dark` com valores claros para a folha
  // impressa. Lido junto com a tela, ele aparece DEPOIS do tema escuro e
  // vence — e aí o medidor reprovava o tema escuro por tinta clara sobre
  // fundo escuro que, na tela, nunca acontece. A folha impressa é outra
  // superfície; fica fora desta medição.
  css = semBloco(css, '@media print')
  const saida = []
  const re = /([^{}]+)\{([^{}]*?--[^{}]*?)\}/g
  let m
  while ((m = re.exec(css))) {
    // Só a última linha antes da chave é o seletor: o que vem antes são as
    // regras anteriores do arquivo, que o `[^{}]+` arrasta junto.
    const seletor = m[1].trim().split('\n').pop().trim().replace(/\s+/g, ' ')
    const tokens = {}
    for (const t of m[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) tokens[t[1]] = t[2].trim()
    if (Object.keys(tokens).length) saida.push({ arquivo, seletor, tokens, linha: css.slice(0, m.index).split('\n').length })
  }
  return saida
}

/** Resolve um token subindo a cadeia de blocos (o último vence, como no CSS). */
function resolver(cadeia, nome) {
  for (let i = cadeia.length - 1; i >= 0; i--) {
    const v = cadeia[i].tokens[nome]
    if (v && !v.includes('var(')) return v
  }
  return null
}

const ESTADOS = ['ok', 'warn', 'crit', 'cyan', 'accent']
const MINIMO = 4.5

/**
 * Superfícies a conferir. Cada uma é uma cadeia de blocos: o tema
 * compartilhado primeiro, depois o que o app sobrescreve — a ordem do CSS.
 */
const todos = [...blocos('src/styles/theme.css'), ...blocos('app/src/estilo.css')]
const achar = (seletor) => todos.filter((b) => b.seletor === seletor)

const SUPERFICIES = [
  { nome: 'Checklist · claro', cadeia: [...achar(':root')] },
  { nome: 'Checklist · escuro', cadeia: [...achar(':root'), ...achar('.dark')] },
  { nome: 'App cliente · claro', cadeia: [...achar(':root'), ...achar('#raiz')] },
  { nome: 'App cliente · escuro', cadeia: [...achar(':root'), ...achar('.dark'), ...achar('#raiz'), ...achar('.dark #raiz')] },
  { nome: 'App mecânico · claro', cadeia: [...achar(':root'), ...achar('#raiz'), ...achar('.mec')] },
  {
    nome: 'App mecânico · escuro',
    cadeia: [...achar(':root'), ...achar('.dark'), ...achar('#raiz'), ...achar('.dark #raiz'), ...achar('.mec'), ...achar('.dark .mec')],
  },
]

let problemas = 0

for (const s of SUPERFICIES) {
  if (!s.cadeia.length) {
    console.log(`\n== ${s.nome}: blocos não encontrados`)
    continue
  }
  console.log(`\n== ${s.nome}`)

  const surface = cor(resolver(s.cadeia, '--c-surface') ?? '#ffffff').rgb
  const ink = resolver(s.cadeia, '--c-ink')
  const ink2 = resolver(s.cadeia, '--c-ink-2')
  const ink3 = resolver(s.cadeia, '--c-ink-3')

  for (const [rotulo, valor] of [['texto', ink], ['texto 2', ink2], ['texto 3', ink3]]) {
    if (!valor) continue
    const c = contraste(sobre(cor(valor), surface), surface)
    const ok = c >= MINIMO
    if (!ok) problemas++
    console.log(`   ${ok ? '✔' : '✘'} ${rotulo.padEnd(8)} sobre superfície: ${c.toFixed(2)}:1`)
  }

  const matizes = {}
  for (const e of ESTADOS) {
    const base = resolver(s.cadeia, `--c-${e}`)
    const tinta = resolver(s.cadeia, `--c-${e}-ink`)
    const suave = resolver(s.cadeia, `--c-${e}-soft`)
    if (!base) continue
    matizes[e] = matiz(sobre(cor(base), surface))

    if (tinta && suave) {
      const fundo = sobre(cor(suave), surface)
      const c = contraste(sobre(cor(tinta), fundo), fundo)
      const ok = c >= MINIMO
      if (!ok) problemas++
      console.log(`   ${ok ? '✔' : '✘'} ${e.padEnd(8)} tinta sobre o próprio fundo: ${c.toFixed(2)}:1`)
    }
  }

  // Separação semântica entre ESTADOS que aparecem no mesmo contexto.
  //
  // O piso é 25°: abaixo disso dois estados passam por "a mesma cor" num
  // relance, que é como alguém com pressa olha a tela. Não é um requisito de
  // WCAG — o critério 1.4.1 já é atendido porque cada tom vem com ícone e
  // texto próprios; é craft. O que a medição pega de verdade é o caso
  // degenerado: 0°, dois estados pintados com o mesmo matiz.
  //
  // `crit × accent` entra como informativo, não como falha: um é status e o
  // outro é a ação primária, papéis diferentes na tela, e o laranja da ação é
  // a marca — não é um valor a escolher.
  const pares = [
    ['ok', 'warn', 25],
    ['ok', 'crit', 25],
    ['warn', 'crit', 25],
    ['crit', 'accent', null],
  ]
  for (const [a, b, piso] of pares) {
    const d = distanciaMatiz(matizes[a], matizes[b])
    if (d == null) continue
    if (piso == null) {
      console.log(`   · ${a} × ${b}: ${d.toFixed(0)}° (informativo: status × ação, não dois estados)`)
      continue
    }
    const ok = d >= piso
    if (!ok) problemas++
    console.log(`   ${ok ? '✔' : '✘'} ${a} × ${b}: ${d.toFixed(0)}° de separação de matiz (piso ${piso}°)`)
  }
}

console.log(`\n${problemas ? `✘ ${problemas} problema(s)` : '✔ sem problemas'}`)
process.exit(problemas ? 1 : 0)
