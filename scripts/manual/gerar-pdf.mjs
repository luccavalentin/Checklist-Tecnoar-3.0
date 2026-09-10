/**
 * Monta o Manual do Usuário em PDF.
 *
 * O texto vem de `conteudo.mjs`; as telas, de `docs/manual/`, produzidas por
 * `capturar.mjs`. Tela que faltar é simplesmente omitida — manual com moldura
 * vazia é pior do que manual sem a figura.
 *
 * Uso:  node scripts/manual/gerar-pdf.mjs
 */

import pdfmake from 'pdfmake'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { CAPA, SECOES } from './conteudo.mjs'

const AQUI = dirname(fileURLToPath(import.meta.url))
const RAIZ = join(AQUI, '..', '..')
const TELAS = join(RAIZ, 'docs', 'manual')
const DESTINO = join(RAIZ, 'Manual do Usuario - Tecnoar.pdf')

/* Paleta do sistema: o manual e a tela precisam parecer a mesma casa. */
const COR = {
  laranja: '#fc6400',
  tinta: '#0b1c33',
  tinta2: '#4a5d77',
  tinta3: '#71829b',
  linha: '#dde4ee',
  fundo: '#f1f4f9',
  aviso: '#fff7ed',
  avisoBorda: '#fdba74',
}

const fontes = {
  Roboto: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
}

const LARGURA_UTIL = 595.28 - 56 - 56 // A4 menos as margens laterais

/** `**negrito**` vira negrito de verdade, em vez de asterisco impresso. */
function comNegrito(texto, base = {}) {
  const partes = String(texto).split(/\*\*(.+?)\*\*/g)
  return {
    text: partes.map((p, i) => (i % 2 ? { text: p, bold: true } : { text: p })),
    ...base,
  }
}

/**
 * Insere a tela, quando ela existe.
 *
 * A altura é limitada para a figura nunca empurrar sozinha uma página inteira;
 * a legenda fica colada nela, porque legenda órfã no alto da página seguinte
 * não legenda coisa nenhuma.
 */
function figura(nome, legenda) {
  if (!nome) return []
  const caminho = join(TELAS, `${nome}.png`)
  if (!existsSync(caminho) || statSync(caminho).size < 1000) return []
  const bloco = [
    {
      image: caminho,
      fit: [LARGURA_UTIL, 300],
      alignment: 'center',
      margin: [0, 10, 0, legenda ? 4 : 14],
    },
  ]
  if (legenda) {
    bloco.push({
      text: legenda,
      fontSize: 8,
      italics: true,
      color: COR.tinta3,
      alignment: 'center',
      margin: [0, 0, 0, 14],
    })
  }
  return [{ stack: bloco, unbreakable: true }]
}

function blocoTexto(b) {
  const saida = []
  if (b.titulo) {
    saida.push({ text: b.titulo, fontSize: 12, bold: true, color: COR.tinta, margin: [0, 10, 0, 5] })
  }
  for (const p of b.paragrafos ?? []) {
    saida.push(comNegrito(p, { fontSize: 10, color: COR.tinta2, lineHeight: 1.4, margin: [0, 0, 0, 7] }))
  }
  saida.push(...figura(b.tela, b.legenda))
  return saida
}

function blocoPassos(b) {
  const saida = []
  if (b.titulo) {
    saida.push({ text: b.titulo, fontSize: 12, bold: true, color: COR.tinta, margin: [0, 12, 0, 5] })
  }
  for (const p of b.paragrafos ?? []) {
    saida.push(comNegrito(p, { fontSize: 10, color: COR.tinta2, lineHeight: 1.4, margin: [0, 0, 0, 7] }))
  }
  saida.push({
    /* Número em coluna própria, e não `ol` do pdfmake: assim o passo de duas
       linhas alinha pelo texto, não pelo número. */
    table: {
      widths: [16, '*'],
      body: b.passos.map((passo, i) => [
        { text: `${i + 1}`, fontSize: 10, bold: true, color: COR.laranja, margin: [0, 3, 0, 0] },
        comNegrito(passo, { fontSize: 10, color: COR.tinta2, lineHeight: 1.35, margin: [0, 3, 0, 3] }),
      ]),
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 10],
  })
  saida.push(...figura(b.tela, b.legenda))
  return saida
}

function blocoAviso(b) {
  return [
    {
      table: {
        widths: ['*'],
        body: [[comNegrito(b.texto, { fontSize: 9.5, color: COR.tinta2, lineHeight: 1.4, margin: [10, 9, 10, 9] })]],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i) => (i === 0 ? 3 : 0),
        vLineColor: () => COR.avisoBorda,
        fillColor: () => COR.aviso,
        paddingLeft: () => 0,
        paddingRight: () => 0,
        paddingTop: () => 0,
        paddingBottom: () => 0,
      },
      margin: [0, 6, 0, 14],
    },
  ]
}

function blocoFluxo(b) {
  return [
    {
      table: {
        widths: b.etapas.map(() => '*'),
        body: [
          b.etapas.map((e) => ({
            text: e,
            fontSize: 7.5,
            bold: true,
            color: COR.tinta,
            alignment: 'center',
            margin: [2, 8, 2, 8],
          })),
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i, node) => (i === 0 || i === node.table.widths.length ? 0 : 1),
        vLineColor: () => COR.linha,
        fillColor: () => COR.fundo,
        paddingLeft: () => 2,
        paddingRight: () => 2,
      },
      margin: [0, 4, 0, 16],
    },
  ]
}

function blocoPerguntas(b) {
  const saida = []
  for (const item of b.itens) {
    saida.push({ text: item.p, fontSize: 10.5, bold: true, color: COR.tinta, margin: [0, 10, 0, 3] })
    saida.push(comNegrito(item.r, { fontSize: 10, color: COR.tinta2, lineHeight: 1.4 }))
  }
  return saida
}

function montarSecao(secao, numero) {
  const corpo = [
    {
      text: `${String(numero).padStart(2, '0')}`,
      fontSize: 30,
      bold: true,
      color: COR.laranja,
      margin: [0, 0, 0, -4],
    },
    { text: secao.titulo, fontSize: 20, bold: true, color: COR.tinta, margin: [0, 0, 0, 3] },
  ]
  if (secao.resumo) {
    corpo.push({ text: secao.resumo, fontSize: 10.5, color: COR.tinta3, margin: [0, 0, 0, 4] })
  }
  corpo.push({
    canvas: [{ type: 'line', x1: 0, y1: 0, x2: LARGURA_UTIL, y2: 0, lineWidth: 1, lineColor: COR.linha }],
    margin: [0, 6, 0, 12],
  })

  for (const b of secao.blocos) {
    if (b.tipo === 'texto') corpo.push(...blocoTexto(b))
    else if (b.tipo === 'passos') corpo.push(...blocoPassos(b))
    else if (b.tipo === 'aviso') corpo.push(...blocoAviso(b))
    else if (b.tipo === 'fluxo') corpo.push(...blocoFluxo(b))
    else if (b.tipo === 'perguntas') corpo.push(...blocoPerguntas(b))
  }
  return corpo
}

function capa() {
  const logo = join(RAIZ, 'public', 'icon-512.png')
  const conteudo = []
  if (existsSync(logo)) {
    conteudo.push({ image: logo, fit: [110, 110], alignment: 'center', margin: [0, 150, 0, 26] })
  } else {
    conteudo.push({ text: '', margin: [0, 210, 0, 0] })
  }
  conteudo.push(
    { text: CAPA.subtitulo.toUpperCase(), fontSize: 9, bold: true, color: COR.laranja, alignment: 'center', characterSpacing: 2 },
    { text: CAPA.titulo, fontSize: 32, bold: true, color: COR.tinta, alignment: 'center', margin: [0, 8, 0, 10] },
    {
      canvas: [{ type: 'line', x1: LARGURA_UTIL / 2 - 40, y1: 0, x2: LARGURA_UTIL / 2 + 40, y2: 0, lineWidth: 2, lineColor: COR.laranja }],
      margin: [0, 0, 0, 14],
    },
    { text: CAPA.linha, fontSize: 10, color: COR.tinta3, alignment: 'center' },
    { text: CAPA.endereco, fontSize: 10, bold: true, color: COR.tinta2, alignment: 'center', margin: [0, 26, 0, 0] },
    { text: '', pageBreak: 'after' },
  )
  return conteudo
}

function sumario() {
  return [
    { text: 'Neste manual', fontSize: 18, bold: true, color: COR.tinta, margin: [0, 0, 0, 14] },
    {
      table: {
        widths: [22, '*'],
        body: SECOES.map((s, i) => [
          { text: String(i + 1).padStart(2, '0'), fontSize: 11, bold: true, color: COR.laranja, margin: [0, 5, 0, 5] },
          {
            stack: [
              { text: s.titulo, fontSize: 11.5, bold: true, color: COR.tinta },
              ...(s.resumo ? [{ text: s.resumo, fontSize: 9, color: COR.tinta3, margin: [0, 1, 0, 0] }] : []),
            ],
            margin: [0, 5, 0, 5],
          },
        ]),
      },
      layout: {
        hLineWidth: (i, node) => (i === 0 || i === node.table.body.length ? 0 : 1),
        vLineWidth: () => 0,
        hLineColor: () => COR.linha,
        paddingLeft: () => 0,
      },
    },
    { text: '', pageBreak: 'after' },
  ]
}

async function principal() {
  const conteudo = [...capa(), ...sumario()]
  SECOES.forEach((s, i) => {
    conteudo.push(...montarSecao(s, i + 1))
    if (i < SECOES.length - 1) conteudo.push({ text: '', pageBreak: 'after' })
  })

  const doc = {
    pageSize: 'A4',
    pageMargins: [56, 48, 56, 54],
    info: { title: 'Manual do Usuário — Sistema Operacional Tecnoar', author: 'Tecnoar Freios' },
    defaultStyle: { font: 'Roboto', color: COR.tinta2 },
    footer: (pagina, total) =>
      pagina === 1
        ? null
        : {
            columns: [
              { text: 'Manual do Usuário · Sistema Operacional Tecnoar', fontSize: 8, color: COR.tinta3 },
              { text: `${pagina} de ${total}`, fontSize: 8, color: COR.tinta3, alignment: 'right' },
            ],
            margin: [56, 18, 56, 0],
          },
    content: conteudo,
  }

  mkdirSync(TELAS, { recursive: true })
  pdfmake.addFonts(fontes)
  /* As telas são lidas do disco e nada vem da rede: o manual não deve puxar
     recurso externo em tempo de geração.
     As fontes padrão do PDF passam pela mesma checagem, mas não são arquivo —
     chegam aqui como "Helvetica-Bold". Barrá-las derrubava a geração inteira. */
  const PADRAO = /^(Helvetica|Courier|Times|Symbol|ZapfDingbats)(-\w+)?$/
  pdfmake.setLocalAccessPolicy((caminho) => PADRAO.test(caminho) || caminho.startsWith(RAIZ))
  pdfmake.setUrlAccessPolicy(() => false)

  const buffer = await pdfmake.createPdf(doc).getBuffer()
  writeFileSync(DESTINO, buffer)
  const kb = (statSync(DESTINO).size / 1024).toFixed(0)
  console.log(`Manual gerado: ${DESTINO} (${kb} KB)`)
}

await principal()
