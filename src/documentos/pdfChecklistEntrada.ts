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

export interface DadosChecklistEntrada {
  empresa: Empresa
  os: {
    numero: number
    tipo: string
    aberta_em: string
    encerrada_em: string | null
    km: number | null
    problema_alegado: string | null
    vendedor: string | null
  }
  cliente: {
    nome: string | null
    documento: string | null
    contato: string | null
    email: string | null
    endereco: string | null
  }
  veiculo: {
    placa: string | null
    modelo: string | null
    cor: string | null
    ano: number | null
    tipo: string | null
  }
  motorista: { nome: string | null; telefone: string | null }
  checklist: { nome: string; versao: number; concluido_em: string | null }
  /** Itens já agrupados por seção, na ordem do modelo. */
  secoes: Array<{
    secao: string
    itens: Array<{ texto: string; resposta: string | null; observacao: string | null }>
  }>
  avarias: Array<{ sigla: string; tipo: string; posicao: string; observacao: string | null }>
  legenda: Array<{ sigla: string; rotulo: string }>
  objetosPessoais: string | null
}

const dh = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null

/**
 * Caixa de marcação da resposta, desenhada em vetor.
 *
 * A marca é traçada, não escrita: a fonte embutida do gerador não tem ✓ nem ✗
 * e eles saíam como quadrados vazios no PDF. Traço também imprime melhor em
 * preto e branco, que é como este documento costuma sair.
 */
function marcaResposta(r: string | null): Content {
  const linhas: Array<{ type: 'line'; x1: number; y1: number; x2: number; y2: number; lineWidth: number; lineColor: string }> = []
  const traco = (x1: number, y1: number, x2: number, y2: number, cor: string) =>
    linhas.push({ type: 'line', x1, y1, x2, y2, lineWidth: 1.1, lineColor: cor })

  if (r === 'ok' || r === 'conforme') {
    traco(2, 5.4, 3.7, 7.3, COR.ok)
    traco(3.7, 7.3, 7.3, 2.8, COR.ok)
  } else if (r === 'nao_ok' || r === 'nao_conforme') {
    traco(2.4, 3, 7, 7.6, COR.critico)
    traco(7, 3, 2.4, 7.6, COR.critico)
  } else if (r === 'nao_se_aplica') {
    traco(2.4, 5.3, 7, 5.3, COR.tinta3)
  }

  return {
    canvas: [
      { type: 'rect', x: 0, y: 1, w: 9, h: 9, lineWidth: 0.7, lineColor: COR.linhaForte },
      ...linhas.map((l) => ({ ...l, y1: l.y1 + 1, y2: l.y2 + 1 })),
    ],
  }
}

/**
 * Checklist de Entrada em PDF.
 *
 * É o documento que o cliente assina dizendo em que estado entregou o veículo.
 * Sai em duas colunas para caber na folha sem perder legibilidade, e cada item
 * carrega a caixa marcada — quem confere no papel precisa ver a marcação, não
 * deduzir pela cor.
 */
export async function pdfChecklistEntrada(d: DadosChecklistEntrada) {
  const logo = await carregarLogo()
  const numero = `OS ${String(d.os.numero).padStart(5, '0')}`

  const conteudo: Content[] = [
    timbre(d.empresa, logo, 'Checklist de Entrada', numero, d.os.tipo),
    REGUA,
  ]

  /* ------------------------------------------------------ cliente e OS */
  conteudo.push(tituloSecao('Cliente e atendimento'))
  conteudo.push(
    gradeCampos(
      [
        campo('Cliente', d.cliente.nome, true),
        campo('CPF / CNPJ', d.cliente.documento),
        campo('Contato', d.cliente.contato),
        campo('E-mail', d.cliente.email),
        campo('Endereço', d.cliente.endereco),
        campo('Vendedor / atendente', d.os.vendedor),
        campo('Abertura', dh(d.os.aberta_em)),
        campo('Encerramento', dh(d.os.encerrada_em) ?? 'Em aberto'),
      ],
      4,
    ),
  )

  /* ---------------------------------------------------------- veículo */
  conteudo.push(tituloSecao('Veículo'))
  conteudo.push(
    gradeCampos(
      [
        campo('Placa', d.veiculo.placa, true),
        campo('Modelo', d.veiculo.modelo),
        campo('Cor', d.veiculo.cor),
        campo('Ano', d.veiculo.ano ? String(d.veiculo.ano) : null),
        campo('Tipo', d.veiculo.tipo),
        campo('KM de entrada', d.os.km !== null ? d.os.km.toLocaleString('pt-BR') : null),
        campo('Motorista', d.motorista.nome),
        campo('Telefone', d.motorista.telefone),
      ],
      4,
    ),
  )

  /* ---------------------------------------------------------- avarias */
  conteudo.push(tituloSecao('Avarias na entrada'))
  conteudo.push({
    columns: d.legenda.map((l) => ({
      width: 'auto',
      columns: [
        {
          width: 12,
          canvas: [{ type: 'rect', x: 0, y: 1, w: 9, h: 9, lineWidth: 0.7, lineColor: COR.linhaForte }],
        },
        { width: 8, text: l.sigla, fontSize: 6.5, bold: true, margin: [-10.5, 2.5, 0, 0] },
        { width: 'auto', text: l.rotulo, fontSize: 7.5, color: COR.tinta2, margin: [2, 2, 10, 0] },
      ],
    })),
    margin: [0, 0, 0, 8],
  })

  if (d.avarias.length === 0) {
    conteudo.push({
      text: 'Nenhuma avaria foi apontada na entrada deste veículo.',
      style: 'aviso',
      margin: [0, 0, 0, 8],
    })
  } else {
    conteudo.push(
      tabela(
        ['', 'Tipo', 'Posição no veículo', 'Observação'],
        d.avarias.map((a) => [
          { text: a.sigla, style: 'td', bold: true },
          { text: a.tipo, style: 'td' },
          { text: a.posicao, style: 'td' },
          { text: a.observacao ?? '—', style: 'tdFraco' },
        ]),
        [16, 70, 150, '*'],
      ),
    )
  }

  /* ------------------------------------------------- itens do checklist */
  conteudo.push(tituloSecao(d.checklist.nome))
  if (d.checklist.concluido_em) {
    conteudo.push({
      text: `Concluído em ${dh(d.checklist.concluido_em)} · versão ${d.checklist.versao} do modelo.`,
      style: 'aviso',
      margin: [0, 0, 0, 6],
    })
  }

  for (const s of d.secoes) {
    const linhas: Content[][] = []
    /* Duas colunas por linha: dobra o aproveitamento da folha. */
    for (let i = 0; i < s.itens.length; i += 2) {
      const par = [s.itens[i], s.itens[i + 1]]
      linhas.push(
        par.map((item): Content => {
          if (!item) return { text: '' }
          return {
            columns: [
              { width: 13, stack: [marcaResposta(item.resposta)] },
              {
                width: '*',
                stack: [
                  { text: item.texto, fontSize: 8.5 },
                  ...(item.observacao
                    ? [{ text: item.observacao, fontSize: 7.5, italics: true, color: COR.tinta2 }]
                    : []),
                ],
              },
            ],
            margin: [0, 1.5, 0, 1.5] as [number, number, number, number],
          }
        }),
      )
    }

    conteudo.push({
      unbreakable: s.itens.length <= 8,
      stack: [
        { text: s.secao, style: 'subsecao' },
        {
          table: { widths: ['*', '*'], body: linhas },
          layout: {
            hLineWidth: () => 0.35,
            vLineWidth: () => 0,
            hLineColor: () => COR.linha,
            paddingLeft: () => 0,
            paddingRight: () => 10,
            paddingTop: () => 2,
            paddingBottom: () => 2,
          },
          margin: [0, 0, 0, 6],
        },
      ],
    })
  }

  /* -------------------------------------------- conferência de cabine */
  conteudo.push(tituloSecao('Conferência de cabine'))
  conteudo.push({
    columns: ['Painel', 'Som', 'Ar-condicionado', 'Vidros'].map((x) => ({
      width: '*',
      columns: [
        {
          width: 13,
          canvas: [{ type: 'rect', x: 0, y: 1, w: 9, h: 9, lineWidth: 0.7, lineColor: COR.linhaForte }],
        },
        { width: '*', text: x, fontSize: 8.5, margin: [0, 1, 0, 0] },
      ],
    })),
    margin: [0, 0, 0, 8],
  })

  /* ------------------------------------------------------- relatos */
  conteudo.push(tituloSecao('Relatos e pertences'))
  conteudo.push({
    columns: [
      {
        width: '*',
        stack: [
          { text: 'Problema relatado pelo cliente', style: 'rotulo' },
          {
            text: d.os.problema_alegado?.trim() || '—',
            style: 'valor',
            margin: [0, 2, 0, 0] as [number, number, number, number],
          },
        ],
      },
      {
        width: '*',
        stack: [
          { text: 'Objetos pessoais visíveis no veículo', style: 'rotulo' },
          {
            text: d.objetosPessoais?.trim() || '—',
            style: 'valor',
            margin: [0, 2, 0, 0] as [number, number, number, number],
          },
        ],
      },
    ],
    columnGap: 20,
    margin: [0, 0, 0, 4],
  })

  conteudo.push({
    text:
      'Declaro que conferi o veículo nas condições descritas neste documento e que os apontamentos de avaria ' +
      'registrados correspondem ao estado em que o veículo foi entregue à oficina.',
    style: 'aviso',
    margin: [0, 10, 0, 0],
  })

  conteudo.push(
    assinaturas([
      { papel: 'Cliente / motorista', nota: 'Nome legível, documento e data' },
      { papel: 'Responsável técnico', nota: 'Nome legível e data' },
    ]),
  )

  return documento(conteudo, {
    titulo: `Checklist de Entrada — ${numero}`,
    assunto: `Vistoria de entrada do veículo ${d.veiculo.placa ?? ''}`.trim(),
    rodape: `${d.empresa.nome} · Checklist de Entrada · ${numero}${d.veiculo.placa ? ` · ${d.veiculo.placa}` : ''}`,
  })
}
