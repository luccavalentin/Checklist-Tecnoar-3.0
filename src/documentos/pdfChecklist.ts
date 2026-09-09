import type { Content } from 'pdfmake/interfaces'
import {
  COR,
  REGUA,
  assinaturas,
  campo,
  carregarLogo,
  documento,
  gradeCampos,
  tabela,
  timbre,
  tituloSecao,
  type Empresa,
} from './pdf'

export interface ItemChecklistPdf {
  texto: string
  resposta: string | null
  observacao: string | null
  medicao: number | null
  unidade: string | null
  obrigatorio: boolean
  exigeEvidencia: boolean
}

export interface DefeitoChecklistPdf {
  defeito: string
  descricao: string | null
  sistema: string | null
  componente: string | null
  criticidade: string
  recomendacao: string | null
}

export interface DadosChecklistPdf {
  empresa: Empresa
  checklist: {
    numero: number
    modelo: string
    tipo: string
    versao: number
    situacao: string
    iniciado_em: string
    concluido_em: string | null
    observacoes: string | null
    setor: string | null
    data_referencia: string | null
    km: number | null
  }
  responsavel: string | null
  cliente: string | null
  veiculo: { placa: string | null; descricao: string | null } | null
  os: number | null
  secoes: Array<{ secao: string; itens: ItemChecklistPdf[] }>
  defeitos: DefeitoChecklistPdf[]
  /** Rótulo legível de cada resposta, vindo da tela. */
  rotuloResposta: Record<string, string>
}

const dh = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null

/** Respostas que contam como problema — usadas no resumo e no destaque. */
const NEGATIVAS = new Set(['nao_ok', 'nao_conforme'])
const POSITIVAS = new Set(['ok', 'conforme'])

/**
 * Marca da resposta, desenhada em vetor.
 *
 * A fonte embutida não tem ✓ nem ✗ — eles sairiam como quadrados vazios. O
 * traço também sobrevive melhor à impressão em preto e branco, que é como
 * este documento costuma ser arquivado.
 */
function marca(r: string | null): Content {
  const linhas: Array<{
    type: 'line'
    x1: number
    y1: number
    x2: number
    y2: number
    lineWidth: number
    lineColor: string
  }> = []
  const traco = (x1: number, y1: number, x2: number, y2: number, cor: string) =>
    linhas.push({ type: 'line', x1, y1, x2, y2, lineWidth: 1.1, lineColor: cor })

  if (r && POSITIVAS.has(r)) {
    traco(2, 6.4, 3.7, 8.3, COR.ok)
    traco(3.7, 8.3, 7.3, 3.8, COR.ok)
  } else if (r && NEGATIVAS.has(r)) {
    traco(2.4, 4, 7, 8.6, COR.critico)
    traco(7, 4, 2.4, 8.6, COR.critico)
  } else if (r === 'nao_se_aplica') {
    traco(2.4, 6.3, 7, 6.3, COR.tinta3)
  }

  return {
    canvas: [
      { type: 'rect', x: 0, y: 1, w: 9, h: 9, lineWidth: 0.7, lineColor: COR.linhaForte },
      ...linhas,
    ],
  }
}

/**
 * Checklist executado, em PDF.
 *
 * Serve a qualquer tipo — técnico, final da OS e diário 5S. Sai completo de
 * propósito: item a item com a marcação, observação e medição, mais as não
 * conformidades abertas. É o documento que fica arquivado como prova do que
 * foi verificado, então nada é resumido fora do bloco de resumo.
 */
export async function pdfChecklist(d: DadosChecklistPdf) {
  const logo = await carregarLogo()
  const numero = `Nº ${String(d.checklist.numero).padStart(5, '0')}`

  const todos = d.secoes.flatMap((s) => s.itens)
  const conta = {
    total: todos.length,
    respondidos: todos.filter((i) => i.resposta).length,
    positivos: todos.filter((i) => i.resposta && POSITIVAS.has(i.resposta)).length,
    negativos: todos.filter((i) => i.resposta && NEGATIVAS.has(i.resposta)).length,
    naoAplica: todos.filter((i) => i.resposta === 'nao_se_aplica').length,
  }
  const pendentes = conta.total - conta.respondidos

  const conteudo: Content[] = [
    timbre(d.empresa, logo, 'Checklist', numero, d.checklist.tipo),
    REGUA,
  ]

  /* --------------------------------------------------- identificação */
  conteudo.push(tituloSecao('Identificação'))
  conteudo.push(
    gradeCampos(
      [
        campo('Modelo', d.checklist.modelo, true),
        campo('Tipo', d.checklist.tipo),
        campo('Versão do modelo', String(d.checklist.versao)),
        campo('Situação', d.checklist.situacao),
        campo('Responsável', d.responsavel),
        campo('Início', dh(d.checklist.iniciado_em)),
        campo('Conclusão', dh(d.checklist.concluido_em) ?? 'Em andamento'),
        campo('Emitido em', dh(new Date().toISOString())),
      ],
      4,
    ),
  )

  /* Contexto varia: o diário é do setor, o técnico é do veículo. */
  const contexto: Content[] = []
  if (d.checklist.setor) contexto.push(campo('Setor', d.checklist.setor))
  if (d.checklist.data_referencia) {
    contexto.push(campo('Data de referência', new Date(`${d.checklist.data_referencia}T12:00:00`).toLocaleDateString('pt-BR')))
  }
  if (d.veiculo?.placa) contexto.push(campo('Placa', d.veiculo.placa, true))
  if (d.veiculo?.descricao) contexto.push(campo('Veículo', d.veiculo.descricao))
  if (d.cliente) contexto.push(campo('Cliente', d.cliente))
  if (d.os !== null) contexto.push(campo('Ordem de serviço', String(d.os).padStart(5, '0')))
  if (d.checklist.km !== null) contexto.push(campo('KM', d.checklist.km.toLocaleString('pt-BR')))
  if (contexto.length > 0) {
    conteudo.push(tituloSecao('Contexto'))
    conteudo.push(gradeCampos(contexto, 4))
  }

  /* --------------------------------------------------------- resumo */
  conteudo.push(tituloSecao('Resumo da verificação'))
  conteudo.push({
    columns: [
      { width: '*', ...resumo('Itens', String(conta.total), COR.tinta) },
      { width: '*', ...resumo('Conformes', String(conta.positivos), COR.ok) },
      { width: '*', ...resumo('Não conformes', String(conta.negativos), COR.critico) },
      { width: '*', ...resumo('Não se aplica', String(conta.naoAplica), COR.tinta2) },
      { width: '*', ...resumo('Sem resposta', String(pendentes), pendentes > 0 ? COR.critico : COR.tinta2) },
    ],
    columnGap: 10,
    margin: [0, 0, 0, 6],
  })

  /* ---------------------------------------------------------- itens */
  for (const s of d.secoes) {
    const linhas: Content[][] = s.itens.map((i) => {
      const detalhes: Content[] = [{ text: i.texto, fontSize: 8.5 }]
      if (i.medicao !== null) {
        detalhes.push({
          text: `Medição: ${i.medicao.toLocaleString('pt-BR')}${i.unidade ? ` ${i.unidade}` : ''}`,
          fontSize: 7.5,
          color: COR.tinta2,
        })
      }
      if (i.observacao) {
        detalhes.push({ text: i.observacao, fontSize: 7.5, italics: true, color: COR.tinta2 })
      }
      const negativo = Boolean(i.resposta && NEGATIVAS.has(i.resposta))
      return [
        marca(i.resposta),
        { stack: detalhes },
        {
          text: i.resposta ? (d.rotuloResposta[i.resposta] ?? i.resposta) : '—',
          fontSize: 8,
          bold: negativo,
          color: negativo ? COR.critico : i.resposta ? COR.tinta2 : COR.tinta3,
          alignment: 'right',
        },
      ]
    })

    conteudo.push({
      unbreakable: s.itens.length <= 10,
      stack: [
        { text: s.secao, style: 'subsecao' },
        {
          table: { widths: [14, '*', 78], body: linhas },
          layout: {
            hLineWidth: () => 0.35,
            vLineWidth: () => 0,
            hLineColor: () => COR.linha,
            paddingLeft: () => 0,
            paddingRight: () => 4,
            paddingTop: () => 3,
            paddingBottom: () => 3,
          },
          margin: [0, 0, 0, 6],
        },
      ],
    })
  }

  /* -------------------------------------------- não conformidades */
  conteudo.push(tituloSecao('Não conformidades registradas'))
  if (d.defeitos.length === 0) {
    conteudo.push({
      text: 'Nenhuma não conformidade foi registrada neste checklist.',
      style: 'aviso',
      margin: [0, 0, 0, 6],
    })
  } else {
    conteudo.push(
      tabela(
        ['Criticidade', 'Defeito', 'Sistema / componente', 'Recomendação'],
        d.defeitos.map((f) => [
          { text: f.criticidade, style: 'td', bold: true },
          {
            stack: [
              { text: f.defeito, style: 'td' },
              ...(f.descricao ? [{ text: f.descricao, style: 'tdFraco' }] : []),
            ],
          },
          { text: [f.sistema, f.componente].filter(Boolean).join(' · ') || '—', style: 'tdFraco' },
          { text: f.recomendacao ?? '—', style: 'tdFraco' },
        ]),
        [64, '*', 110, 130],
      ),
    )
  }

  if (d.checklist.observacoes?.trim()) {
    conteudo.push(tituloSecao('Observações'))
    conteudo.push({ text: d.checklist.observacoes.trim(), style: 'valor', margin: [0, 0, 0, 4] })
  }

  conteudo.push(
    assinaturas([
      { papel: 'Responsável pela execução', nota: d.responsavel ?? 'Nome legível e data' },
      { papel: 'Conferência / liderança', nota: 'Nome legível e data' },
    ]),
  )

  return documento(conteudo, {
    titulo: `Checklist ${numero} — ${d.checklist.modelo}`,
    assunto: `${d.checklist.tipo} · ${d.checklist.modelo}`,
    rodape: `${d.empresa.nome} · ${d.checklist.modelo} · ${numero}`,
  })
}

/** Bloco compacto do resumo: número grande sobre o rótulo. */
function resumo(rotulo: string, valor: string, cor: string) {
  return {
    stack: [
      { text: valor, fontSize: 15, bold: true, color: cor },
      { text: rotulo, style: 'rotulo' },
    ],
  }
}
