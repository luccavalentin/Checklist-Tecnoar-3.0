import type {
  Content,
  ContentTable,
  StyleDictionary,
  TDocumentDefinitions,
} from 'pdfmake/interfaces'

/**
 * Base dos documentos em PDF da Tecnoar.
 *
 * Estes arquivos saem da oficina: vão para o cliente, para a seguradora e para
 * o processo quando algo é contestado. Por isso são gerados como PDF de
 * verdade — texto vetorial, pesquisável e selecionável — e não como imagem de
 * tela. Papel timbrado, numeração de página e data de emissão em todas.
 *
 * A biblioteca é pesada (~1 MB com as fontes), então tudo aqui é carregado sob
 * demanda: nada disso entra no pacote inicial do sistema.
 */

/** Paleta do documento impresso: sóbria, legível em preto e branco. */
export const COR = {
  tinta: '#101828',
  tinta2: '#475467',
  tinta3: '#8a94a6',
  linha: '#d0d5dd',
  linhaForte: '#101828',
  marca: '#E8590C',
  ok: '#067647',
  critico: '#b42318',
} as const

export const ESTILOS: StyleDictionary = {
  tituloDoc: { fontSize: 16, bold: true, color: COR.tinta },
  etiquetaDoc: { fontSize: 8, bold: true, color: COR.tinta2, characterSpacing: 1.4 },
  numeroDoc: { fontSize: 20, bold: true, color: COR.tinta },
  secao: { fontSize: 8, bold: true, color: COR.tinta2, characterSpacing: 1.2, margin: [0, 10, 0, 4] },
  subsecao: { fontSize: 9, bold: true, color: COR.tinta, margin: [0, 6, 0, 2] },
  rotulo: { fontSize: 7.5, color: COR.tinta3 },
  valor: { fontSize: 9, color: COR.tinta },
  valorForte: { fontSize: 9, bold: true, color: COR.tinta },
  th: { fontSize: 7.5, bold: true, color: COR.tinta2, characterSpacing: 0.6 },
  td: { fontSize: 8.5, color: COR.tinta },
  tdFraco: { fontSize: 8, color: COR.tinta2 },
  rodape: { fontSize: 7, color: COR.tinta3 },
  aviso: { fontSize: 7.5, color: COR.tinta2, italics: true },
}

export interface Empresa {
  nome: string
  razaoSocial?: string | null
  cnpj?: string | null
  inscricaoEstadual?: string | null
  inscricaoMunicipal?: string | null
  telefone?: string | null
  endereco?: string | null
  email?: string | null
}

/** Busca o logotipo e devolve como SVG embutido — vetor, não imagem borrada. */
export async function carregarLogo(): Promise<string | null> {
  try {
    const r = await fetch('/brand/tecnoar-positivo.svg')
    if (!r.ok) return null
    return await r.text()
  } catch {
    return null
  }
}

/**
 * Cabeçalho do papel timbrado.
 *
 * Fica no corpo (não no `header` do pdfmake) porque só deve aparecer na
 * primeira página; da segunda em diante quem identifica é o rodapé.
 */
export function timbre(
  empresa: Empresa,
  logoSvg: string | null,
  titulo: string,
  numero: string,
  complemento?: string,
): Content {
  const identificacao: Content[] = [{ text: empresa.nome, style: 'valorForte', fontSize: 11 }]
  /* A razão social precisa constar quando difere do nome fantasia: é ela que
     identifica a empresa em conferência fiscal. */
  if (empresa.razaoSocial && empresa.razaoSocial !== empresa.nome) {
    identificacao.push({ text: empresa.razaoSocial, style: 'rotulo' })
  }
  if (empresa.cnpj) identificacao.push({ text: `CNPJ ${empresa.cnpj}`, style: 'rotulo' })
  /* IE e IM só aparecem quando preenchidas — linha vazia no timbre suja o
     documento e não informa nada. */
  const inscricoes = [
    empresa.inscricaoEstadual ? `IE ${empresa.inscricaoEstadual}` : '',
    empresa.inscricaoMunicipal ? `IM ${empresa.inscricaoMunicipal}` : '',
  ].filter(Boolean).join(' · ')
  if (inscricoes) identificacao.push({ text: inscricoes, style: 'rotulo' })
  if (empresa.endereco) identificacao.push({ text: empresa.endereco, style: 'rotulo' })
  const contato = [empresa.telefone, empresa.email].filter(Boolean).join(' · ')
  if (contato) identificacao.push({ text: contato, style: 'rotulo' })

  return {
    columns: [
      {
        width: 'auto',
        stack: logoSvg
          ? [{ svg: logoSvg, width: 96, margin: [0, 0, 12, 0] as [number, number, number, number] }]
          : [],
      },
      { width: '*', stack: identificacao, margin: [0, 2, 0, 0] },
      {
        width: 'auto',
        alignment: 'right',
        stack: [
          { text: titulo.toUpperCase(), style: 'etiquetaDoc' },
          { text: numero, style: 'numeroDoc', margin: [0, 1, 0, 0] },
          ...(complemento ? [{ text: complemento, style: 'rotulo' }] : []),
          {
            text: `Emitido em ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`,
            style: 'rotulo',
          },
        ],
      },
    ],
    margin: [0, 0, 0, 8],
  }
}

/** Régua grossa que fecha o timbre. */
export const REGUA: Content = {
  canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.2, lineColor: COR.linhaForte }],
  margin: [0, 0, 0, 10],
}

/** Título de seção com filete, o divisor padrão dos documentos. */
export function tituloSecao(texto: string): Content {
  return {
    stack: [
      { text: texto.toUpperCase(), style: 'secao' },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.7, lineColor: COR.linha }],
        margin: [0, 0, 0, 6],
      },
    ],
    unbreakable: true,
  }
}

/** Par rótulo/valor, a unidade de leitura dos blocos de dados. */
export function campo(rotulo: string, valor?: string | null, forte = false): Content {
  return {
    stack: [
      { text: rotulo, style: 'rotulo' },
      { text: valor && valor.trim() ? valor : '—', style: forte ? 'valorForte' : 'valor' },
    ],
    margin: [0, 0, 0, 5],
  }
}

/** Grade de campos em N colunas, com as sobras alinhadas. */
export function gradeCampos(campos: Content[], colunas = 4): Content {
  const linhas: Content[] = []
  for (let i = 0; i < campos.length; i += colunas) {
    const fatia = campos.slice(i, i + colunas)
    while (fatia.length < colunas) fatia.push({ text: '' })
    linhas.push({ columns: fatia, columnGap: 12 })
  }
  return { stack: linhas }
}

/** Tabela no padrão dos documentos: cabeçalho fino, linhas discretas. */
export function tabela(
  cabecalho: string[],
  linhas: Content[][],
  larguras: Array<string | number>,
): ContentTable {
  return {
    table: {
      headerRows: 1,
      widths: larguras,
      body: [cabecalho.map((c) => ({ text: c.toUpperCase(), style: 'th' })), ...linhas],
    },
    layout: {
      hLineWidth: (i: number, node) => (i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.4),
      vLineWidth: () => 0,
      hLineColor: (i: number) => (i === 1 ? COR.linhaForte : COR.linha),
      paddingLeft: () => 0,
      paddingRight: () => 8,
      paddingTop: () => 4,
      paddingBottom: () => 4,
    },
    margin: [0, 0, 0, 8],
  }
}

/** Caixa de marcação desenhada: sobrevive à impressão em preto e branco. */
export function caixa(marcada: boolean, marca = '×'): Content {
  const partes: Content[] = [
    { canvas: [{ type: 'rect', x: 0, y: 0, w: 9, h: 9, lineWidth: 0.8, lineColor: COR.linhaForte }] },
  ]
  if (marcada) {
    partes.push({ text: marca, fontSize: 8, bold: true, margin: [2, -9.5, 0, 0] })
  }
  return { stack: partes }
}

/** Linhas de assinatura no pé do documento. */
export function assinaturas(papeis: Array<{ papel: string; nota?: string }>): Content {
  return {
    unbreakable: true,
    margin: [0, 18, 0, 0],
    columns: papeis.map((p) => ({
      width: '*',
      stack: [
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 220, y2: 0, lineWidth: 0.8, lineColor: COR.linhaForte }],
          margin: [0, 24, 0, 3],
        },
        { text: p.papel, style: 'valorForte', fontSize: 8.5 },
        ...(p.nota ? [{ text: p.nota, style: 'rotulo' }] : []),
      ],
    })),
    columnGap: 24,
  }
}

/**
 * Esqueleto comum: margens A4, rodapé numerado e metadados do arquivo.
 *
 * O rodapé repete a identificação em toda página porque documento de oficina
 * costuma ser separado, grampeado e arquivado por partes.
 */
export function documento(
  conteudo: Content[],
  opcoes: { titulo: string; assunto: string; rodape: string; paisagem?: boolean },
): TDocumentDefinitions {
  return {
    pageSize: 'A4',
    pageOrientation: opcoes.paisagem ? 'landscape' : 'portrait',
    pageMargins: [40, 36, 40, 44],
    info: {
      title: opcoes.titulo,
      subject: opcoes.assunto,
      author: 'Tecnoar Freios',
      creator: 'Sistema Operacional Tecnoar',
    },
    defaultStyle: { font: 'Roboto', fontSize: 9, color: COR.tinta, lineHeight: 1.15 },
    styles: ESTILOS,
    content: conteudo,
    footer: (pagina: number, total: number) => ({
      margin: [40, 10, 40, 0],
      columns: [
        { text: opcoes.rodape, style: 'rodape', width: '*' },
        { text: `Página ${pagina} de ${total}`, style: 'rodape', alignment: 'right', width: 'auto' },
      ],
    }),
  }
}

/**
 * Carrega o motor de PDF e monta o sistema de arquivos virtual das fontes.
 *
 * O formato do pacote de fontes mudou entre as versões do pdfmake: até a 0.2 o
 * mapa vinha em `pdfMake.vfs`, na 0.3 ele é o próprio módulo. Aceitamos as
 * duas formas porque errar aqui só aparece no clique do usuário, com o
 * arquivo não saindo e um erro obscuro de fonte faltando.
 */
async function carregarMotor() {
  const [motor, fontes] = await Promise.all([
    import('pdfmake/build/pdfmake'),
    import('pdfmake/build/vfs_fonts'),
  ])
  const pdfMake = ((motor as unknown as { default?: unknown }).default ?? motor) as MotorPdf

  /* Na 0.3 o módulo de fontes é o próprio mapa de arquivos; em versões
     anteriores ele vinha aninhado. Aceitamos as duas formas. */
  const bruto = fontes as unknown as Record<string, unknown>
  const mapa = (
    (bruto.pdfMake as { vfs?: Record<string, string> } | undefined)?.vfs ??
    (bruto.vfs as Record<string, string> | undefined) ??
    ((bruto.default as Record<string, unknown> | undefined)?.vfs as Record<string, string> | undefined) ??
    (bruto.default as Record<string, string> | undefined) ??
    (bruto as unknown as Record<string, string>)
  )

  const arquivos = Object.keys(mapa ?? {}).filter((k) => k.endsWith('.ttf'))
  if (arquivos.length === 0) {
    throw new Error('O pacote de fontes do gerador de PDF não pôde ser carregado.')
  }

  /* A 0.3 registra o sistema de arquivos por método; a 0.2 aceitava atribuir
     `vfs` direto. Chamamos o método quando existe e caímos na atribuição
     quando não — errar aqui só aparece no clique, com "fonte não encontrada". */
  if (typeof pdfMake.addVirtualFileSystem === 'function') {
    pdfMake.addVirtualFileSystem(mapa)
  } else {
    pdfMake.vfs = mapa
  }

  /* Declara a família explicitamente: sem isso a 0.3 não resolve o peso
     `bold`, que é o que os títulos e totais usam. */
  const familia = {
    Roboto: {
      normal: 'Roboto-Regular.ttf',
      bold: 'Roboto-Medium.ttf',
      italics: 'Roboto-Italic.ttf',
      bolditalics: 'Roboto-MediumItalic.ttf',
    },
  }
  if (typeof pdfMake.addFonts === 'function') pdfMake.addFonts(familia)
  else if (typeof pdfMake.setFonts === 'function') pdfMake.setFonts(familia)
  else pdfMake.fonts = familia

  return pdfMake
}

/**
 * Gera e baixa o arquivo.
 *
 * `pdfmake` e as fontes só são carregados aqui, no clique — manter isso fora
 * do pacote inicial evita cobrar 1 MB de quem nunca imprime nada.
 */
export async function baixarPdf(definicao: TDocumentDefinitions, nomeArquivo: string): Promise<void> {
  const pdfMake = await carregarMotor()
  pdfMake.createPdf(definicao).download(nomeArquivo)
}

/** Abre em nova aba, para conferir antes de imprimir. */
export async function abrirPdf(definicao: TDocumentDefinitions): Promise<void> {
  const pdfMake = await carregarMotor()
  pdfMake.createPdf(definicao).open()
}

interface MotorPdf {
  vfs?: Record<string, string>
  fonts?: Record<string, Record<string, string>>
  addVirtualFileSystem?: (vfs: Record<string, string>) => void
  addFonts?: (f: Record<string, Record<string, string>>) => void
  setFonts?: (f: Record<string, Record<string, string>>) => void
  createPdf: (d: TDocumentDefinitions) => { download: (n: string) => void; open: () => void }
}

/** Nome de arquivo previsível e ordenável: sem acento, sem espaço. */
export function nomeArquivo(partes: Array<string | number | null | undefined>): string {
  return (
    partes
      .filter((p) => p !== null && p !== undefined && String(p).trim() !== '')
      .join('-')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') + '.pdf'
  )
}
