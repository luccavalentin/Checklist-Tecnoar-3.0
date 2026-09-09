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

export interface LinhaItem {
  codigo: string | null
  descricao: string
  quantidade: number
  unidade?: string | null
  valor_unitario: number
  desconto: number
  valor_total: number
  aprovacao: string | null
}

export interface DadosOS {
  empresa: Empresa
  os: {
    numero: number
    tipo: 'os' | 'orcamento' | 'garantia'
    status: string | null
    aberta_em: string
    encerrada_em: string | null
    previsao_em: string | null
    km: number | null
    problema_alegado: string | null
    diagnostico: string | null
    vendedor: string | null
    mecanicos: string[]
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
  servicos: LinhaItem[]
  produtos: LinhaItem[]
  totais: {
    servicos: number
    produtos: number
    desconto: number
    acrescimo: number
    total: number
    pago: number
  }
  pagamento: {
    forma: string | null
    condicao: string | null
    parcelas: number | null
    observacao: string | null
  }
  defeitos: Array<{ defeito: string; criticidade: string; recomendacao: string | null }>
}

const ROTULO_TIPO = {
  os: 'Ordem de serviço',
  orcamento: 'Orçamento',
  garantia: 'Garantia',
} as const

const moeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const dh = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null

const ROTULO_APROVACAO: Record<string, string> = {
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  pendente: 'Pendente',
}

/**
 * Ordem de serviço em PDF.
 *
 * Documento que vai ao cliente: precisa mostrar o que foi feito, o que custou
 * e o que ficou pendente de aprovação. Itens recusados aparecem — sumir com
 * eles esconderia uma decisão que o cliente tomou.
 */
export async function pdfOS(d: DadosOS) {
  const logo = await carregarLogo()
  const numero = `${d.os.tipo === 'orcamento' ? 'ORÇ' : 'OS'} ${String(d.os.numero).padStart(5, '0')}`

  const conteudo: Content[] = [
    timbre(d.empresa, logo, ROTULO_TIPO[d.os.tipo], numero, d.os.status ?? undefined),
    REGUA,
  ]

  /* ------------------------------------------------------ identificação */
  conteudo.push(tituloSecao('Cliente e veículo'))
  conteudo.push(
    gradeCampos(
      [
        campo('Cliente', d.cliente.nome, true),
        campo('CPF / CNPJ', d.cliente.documento),
        campo('Contato', d.cliente.contato),
        campo('E-mail', d.cliente.email),
        campo('Endereço', d.cliente.endereco),
        campo('Placa', d.veiculo.placa, true),
        campo('Modelo', d.veiculo.modelo),
        campo('Ano / cor', [d.veiculo.ano, d.veiculo.cor].filter(Boolean).join(' · ') || null),
      ],
      4,
    ),
  )
  conteudo.push(
    gradeCampos(
      [
        campo('KM', d.os.km !== null ? d.os.km.toLocaleString('pt-BR') : null),
        campo('Abertura', dh(d.os.aberta_em)),
        campo('Previsão', dh(d.os.previsao_em)),
        campo('Encerramento', dh(d.os.encerrada_em) ?? 'Em aberto'),
        campo('Vendedor / atendente', d.os.vendedor),
        campo('Equipe técnica', d.os.mecanicos.join(', ') || null),
      ],
      4,
    ),
  )

  /* ------------------------------------------------------- diagnóstico */
  if (d.os.problema_alegado || d.os.diagnostico) {
    conteudo.push(tituloSecao('Problema e diagnóstico'))
    conteudo.push({
      columns: [
        {
          width: '*',
          stack: [
            { text: 'Problema relatado pelo cliente', style: 'rotulo' },
            { text: d.os.problema_alegado?.trim() || '—', style: 'valor', margin: [0, 2, 0, 0] },
          ],
        },
        {
          width: '*',
          stack: [
            { text: 'Diagnóstico técnico', style: 'rotulo' },
            { text: d.os.diagnostico?.trim() || '—', style: 'valor', margin: [0, 2, 0, 0] },
          ],
        },
      ],
      columnGap: 20,
      margin: [0, 0, 0, 6],
    })
  }

  /* ----------------------------------------------------------- serviços */
  if (d.servicos.length) {
    conteudo.push(tituloSecao('Serviços'))
    conteudo.push(
      tabela(
        ['Código', 'Descrição', 'Qtd', 'Unitário', 'Desc.', 'Total', 'Aprovação'],
        d.servicos.map((s) => [
          { text: s.codigo ?? '—', style: 'tdFraco' },
          { text: s.descricao, style: 'td' },
          { text: String(s.quantidade), style: 'td', alignment: 'right' },
          { text: moeda(s.valor_unitario), style: 'td', alignment: 'right' },
          { text: s.desconto ? moeda(s.desconto) : '—', style: 'tdFraco', alignment: 'right' },
          { text: moeda(s.valor_total), style: 'td', alignment: 'right', bold: true },
          {
            text: ROTULO_APROVACAO[s.aprovacao ?? 'pendente'] ?? '—',
            style: 'tdFraco',
            color: s.aprovacao === 'recusado' ? COR.critico : s.aprovacao === 'aprovado' ? COR.ok : COR.tinta2,
          },
        ]),
        [52, '*', 26, 58, 46, 58, 52],
      ),
    )
  }

  /* ----------------------------------------------------------- produtos */
  if (d.produtos.length) {
    conteudo.push(tituloSecao('Peças e produtos'))
    conteudo.push(
      tabela(
        ['Código', 'Descrição', 'Un', 'Qtd', 'Unitário', 'Total', 'Aprovação'],
        d.produtos.map((p) => [
          { text: p.codigo ?? '—', style: 'tdFraco' },
          { text: p.descricao, style: 'td' },
          { text: p.unidade ?? '—', style: 'tdFraco' },
          { text: String(p.quantidade), style: 'td', alignment: 'right' },
          { text: moeda(p.valor_unitario), style: 'td', alignment: 'right' },
          { text: moeda(p.valor_total), style: 'td', alignment: 'right', bold: true },
          {
            text: ROTULO_APROVACAO[p.aprovacao ?? 'pendente'] ?? '—',
            style: 'tdFraco',
            color: p.aprovacao === 'recusado' ? COR.critico : p.aprovacao === 'aprovado' ? COR.ok : COR.tinta2,
          },
        ]),
        [52, '*', 26, 26, 58, 58, 52],
      ),
    )
  }

  if (!d.servicos.length && !d.produtos.length) {
    conteudo.push(tituloSecao('Itens'))
    conteudo.push({ text: 'Nenhum serviço ou peça lançado nesta ordem.', style: 'aviso', margin: [0, 0, 0, 8] })
  }

  /* --------------------------------------------- defeitos do checklist */
  if (d.defeitos.length) {
    conteudo.push(tituloSecao('Apontamentos técnicos do checklist'))
    conteudo.push(
      tabela(
        ['Defeito encontrado', 'Criticidade', 'Recomendação'],
        d.defeitos.map((x) => [
          { text: x.defeito, style: 'td' },
          {
            text: x.criticidade,
            style: 'tdFraco',
            color: x.criticidade === 'critica' || x.criticidade === 'alta' ? COR.critico : COR.tinta2,
          },
          { text: x.recomendacao ?? '—', style: 'tdFraco' },
        ]),
        ['*', 62, '*'],
      ),
    )
  }

  /* ------------------------------------------------- totais e pagamento */
  const saldo = d.totais.total - d.totais.pago
  const linhasTotais: Array<[string, string, boolean]> = [
    ['Serviços', moeda(d.totais.servicos), false],
    ['Peças e produtos', moeda(d.totais.produtos), false],
  ]
  if (d.totais.desconto > 0) linhasTotais.push(['Descontos', `− ${moeda(d.totais.desconto)}`, false])
  if (d.totais.acrescimo > 0) linhasTotais.push(['Acréscimos', moeda(d.totais.acrescimo), false])
  linhasTotais.push(['Total geral', moeda(d.totais.total), true])
  if (d.totais.pago > 0) {
    linhasTotais.push(['Recebido', moeda(d.totais.pago), false])
    linhasTotais.push([saldo > 0.005 ? 'Saldo a receber' : 'Saldo', moeda(Math.max(saldo, 0)), true])
  }

  /* Título e conteúdo num bloco só: senão "Fechamento" fica sozinho no pé de
     uma página e os totais aparecem na seguinte, sem cabeçalho. */
  conteudo.push({
    unbreakable: true,
    stack: [
      tituloSecao('Fechamento'),
      {
        columns: [
          {
            width: '*',
            stack: [
              campo('Forma de pagamento', d.pagamento.forma),
              campo(
                'Condição',
                [d.pagamento.condicao, d.pagamento.parcelas ? `${d.pagamento.parcelas}x` : null]
                  .filter(Boolean)
                  .join(' · ') || null,
              ),
              campo('Observação', d.pagamento.observacao),
            ],
          },
          {
            width: 220,
            table: {
              widths: ['*', 'auto'],
              body: linhasTotais.map(([r, v, forte]) => [
                { text: r, style: forte ? 'valorForte' : 'valor', color: forte ? COR.tinta : COR.tinta2 },
                { text: v, style: forte ? 'valorForte' : 'valor', alignment: 'right' },
              ]),
            },
            layout: {
              hLineWidth: (i: number, node) =>
                i === 0 ? 0 : i === node.table.body.length ? 0 : i === node.table.body.length - 1 ? 0.8 : 0.4,
              vLineWidth: () => 0,
              hLineColor: (i: number, node) => (i === node.table.body.length - 1 ? COR.linhaForte : COR.linha),
              paddingLeft: () => 0,
              paddingRight: () => 0,
              paddingTop: () => 3,
              paddingBottom: () => 3,
            },
          },
        ],
        columnGap: 24,
      },
    ],
  })

  conteudo.push(
    assinaturas([
      { papel: 'Cliente', nota: 'Aprovo os serviços e valores acima' },
      { papel: 'Responsável técnico', nota: 'Nome legível e data' },
    ]),
  )

  return documento(conteudo, {
    titulo: `${ROTULO_TIPO[d.os.tipo]} — ${numero}`,
    assunto: `${ROTULO_TIPO[d.os.tipo]} do veículo ${d.veiculo.placa ?? ''}`.trim(),
    rodape: `${d.empresa.nome} · ${ROTULO_TIPO[d.os.tipo]} ${numero}${d.veiculo.placa ? ` · ${d.veiculo.placa}` : ''}`,
  })
}
