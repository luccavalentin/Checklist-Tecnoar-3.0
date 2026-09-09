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

export interface DadosRecibo {
  empresa: Empresa
  recibo: number
  os: {
    numero: number
    aberta_em: string
    saida_em: string | null
    km: number | null
    diagnostico: string | null
  }
  cliente: { nome: string | null; documento: string | null; contato: string | null; endereco: string | null }
  veiculo: { placa: string | null; modelo: string | null; ano: number | null }
  itens: Array<{ descricao: string; quantidade: number; valor_unitario: number; valor_total: number; tipo: string }>
  totais: { servicos: number; produtos: number; desconto: number; acrescimo: number; total: number; pago: number }
  pagamento: { forma: string | null; condicao: string | null; observacao: string | null }
  /** Parcelas quando o saldo foi faturado. Vazio em pagamento à vista. */
  parcelas: Array<{ numero: number; vencimento: string; valor: number }>
  garantias: Array<{ descricao: string; ate: string; km_limite: number | null }>
}

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dh = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null
const data = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR')

/**
 * Recibo de saída do veículo.
 *
 * Sai em duas vias na mesma folha — cliente e financeiro — porque é assim que
 * o balcão trabalha: uma vai com o motorista, a outra fica grampeada na OS.
 *
 * Quando está quitado, uma tarja PAGO atravessa cada via. Isso não é enfeite:
 * é o que evita o veículo sair com o recibo servindo de promessa de cobrança
 * que ninguém sabe se foi honrada.
 */
export async function pdfRecibo(d: DadosRecibo) {
  const logo = await carregarLogo()
  const numero = `RECIBO ${String(d.recibo).padStart(5, '0')}`
  const saldo = d.totais.total - d.totais.pago
  const quitado = saldo <= 0.005

  /** Uma via completa. `via` identifica quem fica com ela. */
  /*
   * Cada via viaja inteira: `unbreakable` impede que o corpo do recibo fique
   * numa página e a assinatura na seguinte. Quando as duas não cabem na
   * mesma folha, a segunda vai para a próxima — melhor duas folhas limpas do
   * que uma via partida no meio.
   */
  const via = (rotulo: string): Content => ({
    unbreakable: true,
    stack: ([
      {
        columns: [
          { width: '*', text: '' },
          {
            width: 'auto',
            text: rotulo.toUpperCase(),
            style: 'etiquetaDoc',
            color: COR.marca,
          },
        ],
        margin: [0, 0, 0, 2],
      },
      timbre(d.empresa, logo, 'Recibo de serviço', numero, `OS ${String(d.os.numero).padStart(5, '0')}`),
      REGUA,

      gradeCampos(
        [
          campo('Cliente', d.cliente.nome, true),
          campo('CPF / CNPJ', d.cliente.documento),
          campo('Contato', d.cliente.contato),
          campo('Placa', d.veiculo.placa, true),
          campo('Veículo', d.veiculo.modelo),
          campo('KM', d.os.km !== null ? d.os.km.toLocaleString('pt-BR') : null),
          campo('Entrada', dh(d.os.aberta_em)),
          campo('Saída', dh(d.os.saida_em)),
        ],
        4,
      ),

      tituloSecao('Serviços e peças'),
      tabela(
        ['Descrição', 'Qtd', 'Unitário', 'Total'],
        d.itens.map((i) => [
          { text: i.descricao, style: 'td' },
          { text: String(i.quantidade), style: 'td', alignment: 'right' },
          { text: moeda(i.valor_unitario), style: 'td', alignment: 'right' },
          { text: moeda(i.valor_total), style: 'td', alignment: 'right', bold: true },
        ]),
        ['*', 32, 66, 70],
      ),

      {
        columns: [
          {
            width: '*',
            stack: [
              campo('Forma de pagamento', d.pagamento.forma),
              ...(d.pagamento.condicao ? [campo('Condição', d.pagamento.condicao)] : []),
              ...(d.pagamento.observacao ? [campo('Observação', d.pagamento.observacao)] : []),
            ],
          },
          {
            width: 210,
            table: {
              widths: ['*', 'auto'],
              body: ([
                [
                  { text: 'Serviços', style: 'valor', color: COR.tinta2 },
                  { text: moeda(d.totais.servicos), style: 'valor', alignment: 'right' },
                ],
                [
                  { text: 'Peças e produtos', style: 'valor', color: COR.tinta2 },
                  { text: moeda(d.totais.produtos), style: 'valor', alignment: 'right' },
                ],
                ...(d.totais.desconto > 0
                  ? [[
                      { text: 'Descontos', style: 'valor', color: COR.tinta2 },
                      { text: `− ${moeda(d.totais.desconto)}`, style: 'valor', alignment: 'right' },
                    ]]
                  : []),
                [
                  { text: 'Total geral', style: 'valorForte' },
                  { text: moeda(d.totais.total), style: 'valorForte', alignment: 'right' },
                ],
                [
                  { text: 'Recebido', style: 'valor', color: COR.tinta2 },
                  { text: moeda(d.totais.pago), style: 'valor', alignment: 'right' },
                ],
                [
                  { text: quitado ? 'Saldo' : 'Saldo a receber', style: 'valorForte' },
                  {
                    text: moeda(Math.max(saldo, 0)),
                    style: 'valorForte',
                    alignment: 'right',
                    color: quitado ? COR.ok : COR.critico,
                  },
                ],
              ] as Content[][]),
            },
            layout: {
              hLineWidth: (i: number, node) =>
                i === 0 || i === node.table.body.length ? 0 : i === node.table.body.length - 2 ? 0.8 : 0.4,
              vLineWidth: () => 0,
              hLineColor: (i: number, node) => (i === node.table.body.length - 2 ? COR.linhaForte : COR.linha),
              paddingLeft: () => 0,
              paddingRight: () => 0,
              paddingTop: () => 3,
              paddingBottom: () => 3,
            },
          },
        ],
        columnGap: 24,
        margin: [0, 4, 0, 0],
      },

      ...(d.parcelas.length
        ? [
            tituloSecao('Parcelas a vencer'),
            tabela(
              ['Parcela', 'Vencimento', 'Valor'],
              d.parcelas.map((p) => [
                { text: `${p.numero}/${d.parcelas.length}`, style: 'td' },
                { text: data(p.vencimento), style: 'td' },
                { text: moeda(p.valor), style: 'td', alignment: 'right', bold: true },
              ]),
              [70, 100, '*'],
            ),
          ]
        : []),

      ...(d.garantias.length
        ? [
            tituloSecao('Garantia'),
            tabela(
              ['Item', 'Válida até', 'Limite de KM'],
              d.garantias.map((g) => [
                { text: g.descricao, style: 'td' },
                { text: data(g.ate), style: 'td' },
                { text: g.km_limite ? g.km_limite.toLocaleString('pt-BR') : '—', style: 'tdFraco', alignment: 'right' },
              ]),
              ['*', 90, 90],
            ),
          ]
        : []),

      assinaturas([
        { papel: 'Cliente / retirante', nota: 'Recebi o veículo e os serviços descritos' },
        { papel: 'Tecnoar Freios', nota: 'Responsável pela entrega' },
      ]),
    ] as Content[]),
  })

  const conteudo: Content[] = [
    via('Via do cliente'),
    {
      canvas: [
        {
          type: 'line',
          x1: 0,
          y1: 0,
          x2: 515,
          y2: 0,
          lineWidth: 0.8,
          lineColor: COR.linhaForte,
          dash: { length: 4, space: 3 },
        },
      ],
      margin: [0, 16, 0, 4],
    },
    { text: '✂  destaque aqui', style: 'rodape', alignment: 'center', margin: [0, 0, 0, 14] },
    via('Via do financeiro'),
  ]

  const def = documento(conteudo, {
    titulo: `Recibo ${String(d.recibo).padStart(5, '0')} — OS ${String(d.os.numero).padStart(5, '0')}`,
    assunto: `Recibo de serviço do veículo ${d.veiculo.placa ?? ''}`.trim(),
    rodape: `${d.empresa.nome} · ${numero} · OS ${String(d.os.numero).padStart(5, '0')}${d.veiculo.placa ? ` · ${d.veiculo.placa}` : ''}`,
  })

  /**
   * Marca d'água de quitação.
   *
   * Vai como `background` da página para atravessar as duas vias de uma vez e
   * ficar atrás do texto, sem atrapalhar a leitura.
   */
  if (quitado) {
    def.background = () => ({
      text: 'PAGO',
      color: COR.ok,
      opacity: 0.08,
      bold: true,
      fontSize: 130,
      alignment: 'center',
      margin: [0, 300, 0, 0],
    })
  }

  return def
}
