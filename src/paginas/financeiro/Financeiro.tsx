import { useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  FileText,
  RotateCcw,
  TriangleAlert,
  Wallet,
} from 'lucide-react'
import { cn, mensagemErro } from '@/lib/utils'
import { data as fmtData, moeda } from '@/lib/formatos'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { Abas } from '@/componentes/ui/Abas'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade } from '@/componentes/ui/Secao'
import { CabecalhoPagina, Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Selo, type TomSelo } from '@/componentes/ui/Selo'
import { Modal } from '@/componentes/ui/Sobreposicoes'
import { Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import type { FormaPagamento } from '@/tipos/db'
import { PainelVendas } from './PainelVendas'
import {
  FORMAS_PAGAMENTO,
  ROTULO_FAIXA,
  ROTULO_FORMA,
  diasDeAtraso,
  faixaDeAtraso,
  hojeISO,
  inicioDoMes,
  soma,
  truncou,
  useAReceber,
  useBaixarParcela,
  useEstornarParcela,
  useFaturamento,
  useRecebido,
  useRecebidoNaOS,
  type FaixaAtraso,
  type FaturaResumo,
  type Parcela,
} from './useFinanceiro'

/**
 * Módulo financeiro.
 *
 * Existe porque o dinheiro já circulava pelo sistema sem lugar próprio: o
 * valor fechava na OS, virava fatura na saída do pátio e depois sumia. Aqui
 * ele tem endereço — o que há a receber, o que venceu, o que entrou e de onde.
 *
 * O recorte é o que o banco já registra hoje: **contas a receber**. Contas a
 * pagar e fluxo de caixa precisam de tabelas que ainda não existem; a migração
 * está pronta em `supabase/migrations/` e o módulo ganha as abas assim que ela
 * for aplicada.
 */

type AbaFin = 'visao' | 'receber' | 'recebido' | 'faturamento' | 'vendas'

const TOM_FAIXA: Record<FaixaAtraso, TomSelo> = {
  a_vencer: 'neutro',
  hoje: 'atencao',
  ate_30: 'atencao',
  ate_60: 'critico',
  ate_90: 'critico',
  acima_90: 'critico',
}

export function Financeiro() {
  const { pode } = usePermissoes()
  const [aba, setAba] = useState<AbaFin>('visao')

  /* O recurso `financeiro` ainda não existe na tabela de permissões — vem na
     migração. Até lá vale quem já enxerga os indicadores da gestão, que é
     exatamente o público desta tela. */
  const podeVer = pode('financeiro', 'visualizar') || pode('indicadores', 'visualizar')
  const podeBaixar = pode('financeiro', 'editar') || pode('ordens_servico', 'editar')

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Gestão" titulo="Financeiro" />
        <EstadoSemPermissao />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina sobretitulo="Gestão" titulo="Financeiro" />
      <Abas
        ativa={aba}
        aoMudar={setAba}
        abas={[
          { valor: 'visao', rotulo: 'Visão geral' },
          { valor: 'receber', rotulo: 'A receber' },
          { valor: 'recebido', rotulo: 'Recebido' },
          { valor: 'faturamento', rotulo: 'Faturamento' },
          { valor: 'vendas', rotulo: 'Vendas' },
        ]}
      />

      {aba === 'visao' && <VisaoGeralFinanceira />}
      {aba === 'receber' && <AReceber podeBaixar={podeBaixar} />}
      {aba === 'recebido' && <Recebido />}
      {aba === 'faturamento' && <Faturamento />}
      {aba === 'vendas' && <PainelVendas />}
    </div>
  )
}

/* ═══════════════════════════════════════════════════ visão geral */

function VisaoGeralFinanceira() {
  const de = inicioDoMes()
  const ate = hojeISO()

  const aReceber = useAReceber(true)
  const recebido = useRecebido(de, ate, true)
  const naOS = useRecebidoNaOS(de, ate, true)
  const faturado = useFaturamento(de, ate, true)

  const carregando = aReceber.isLoading || recebido.isLoading || naOS.isLoading || faturado.isLoading
  const erro = aReceber.error ?? recebido.error ?? naOS.error ?? faturado.error

  const abertas = aReceber.data ?? []
  const vencidas = abertas.filter((p) => diasDeAtraso(p.vencimento) > 0)

  const totalAberto = soma(abertas.map((p) => p.valor))
  const totalVencido = soma(vencidas.map((p) => p.valor))
  const totalRecebido = soma((recebido.data ?? []).map((p) => p.valor)) + soma((naOS.data ?? []).map((o) => o.valor_pago))
  const totalFaturado = soma((faturado.data ?? []).map((f) => f.valor_total))

  /* Aging: onde o dinheiro está preso. É a leitura que decide quem a oficina
     liga hoje — muito mais útil que um total único de inadimplência. */
  const aging = useMemo(() => {
    const mapa = new Map<FaixaAtraso, { qtd: number; valor: number }>()
    for (const p of abertas) {
      const f = faixaDeAtraso(p.vencimento)
      const at = mapa.get(f) ?? { qtd: 0, valor: 0 }
      at.qtd += 1
      at.valor += Number(p.valor)
      mapa.set(f, at)
    }
    return (Object.keys(ROTULO_FAIXA) as FaixaAtraso[])
      .map((f) => ({ faixa: f, ...(mapa.get(f) ?? { qtd: 0, valor: 0 }) }))
      .filter((l) => l.qtd > 0)
  }, [abertas])

  /* Quem deve mais. Cinco nomes bastam para a cobrança do dia. */
  const porCliente = useMemo(() => {
    const mapa = new Map<string, { nome: string; valor: number; qtd: number }>()
    for (const p of abertas) {
      const nome = p.fatura?.cliente?.nome_razao ?? 'Sem cliente'
      const at = mapa.get(nome) ?? { nome, valor: 0, qtd: 0 }
      at.valor += Number(p.valor)
      at.qtd += 1
      mapa.set(nome, at)
    }
    return [...mapa.values()].sort((a, b) => b.valor - a.valor).slice(0, 5)
  }, [abertas])

  if (erro) {
    return <EstadoErro descricao={mensagemErro(erro)} aoTentarNovamente={() => void aReceber.refetch()} />
  }

  const maiorAging = Math.max(1, ...aging.map((a) => a.valor))
  const maiorCliente = Math.max(1, ...porCliente.map((c) => c.valor))

  return (
    <div className="flex flex-col gap-5">
      {truncou(abertas.length) && (
        <Aviso tom="atencao" titulo="Carteira maior que o limite da consulta">
          A tela somou as {abertas.length} primeiras parcelas em aberto. Os totais abaixo são parciais.
        </Aviso>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoValor
          rotulo="A receber"
          valor={totalAberto}
          detalhe={`${abertas.length} parcela(s) em aberto`}
          tom="accent"
          icone={<Wallet className="size-4" />}
          carregando={carregando}
        />
        <CartaoValor
          rotulo="Vencido"
          valor={totalVencido}
          detalhe={vencidas.length ? `${vencidas.length} parcela(s) atrasada(s)` : 'nada em atraso'}
          tom={totalVencido > 0 ? 'critico' : 'ok'}
          icone={<TriangleAlert className="size-4" />}
          carregando={carregando}
        />
        <CartaoValor
          rotulo="Recebido no mês"
          valor={totalRecebido}
          detalhe="parcelas baixadas e pagamentos na OS"
          tom="ok"
          icone={<ArrowDownRight className="size-4" />}
          carregando={carregando}
        />
        <CartaoValor
          rotulo="Faturado no mês"
          valor={totalFaturado}
          detalhe={`${(faturado.data ?? []).length} fatura(s) emitida(s)`}
          tom="cyan"
          icone={<FileText className="size-4" />}
          carregando={carregando}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <Painel semPadding>
          <CabecalhoPainel
            titulo="Idade da carteira"
            descricao="Há quanto tempo cada parcela em aberto está vencida."
          />
          <div className="p-4 sm:p-5">
            {carregando ? (
              <EstadoCarregando rotulo="" />
            ) : aging.length === 0 ? (
              <EstadoVazio compacto titulo="Nada a receber" descricao="Não há parcelas em aberto." />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {aging.map((l) => (
                  <li key={l.faixa} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-2">
                        <Selo tom={TOM_FAIXA[l.faixa]} ponto>{ROTULO_FAIXA[l.faixa]}</Selo>
                        <span className="num shrink-0 text-[11.5px] text-ink-3">{l.qtd}×</span>
                      </span>
                      <span className="num shrink-0 text-[13px] font-semibold text-ink">{moeda(l.valor)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          l.faixa === 'a_vencer' ? 'bg-ink-3' : TOM_FAIXA[l.faixa] === 'critico' ? 'bg-crit' : 'bg-warn',
                        )}
                        style={{ width: `${Math.max(2, (l.valor / maiorAging) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Painel>

        <Painel semPadding>
          <CabecalhoPainel titulo="Maiores saldos" descricao="Clientes com mais valor em aberto." />
          <div className="p-4 sm:p-5">
            {carregando ? (
              <EstadoCarregando rotulo="" />
            ) : porCliente.length === 0 ? (
              <EstadoVazio compacto titulo="Nenhum saldo" descricao="Nenhum cliente com parcela em aberto." />
            ) : (
              <ul className="flex flex-col gap-2.5">
                {porCliente.map((c) => (
                  <li key={c.nome} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[13px] text-ink">{c.nome}</span>
                      <span className="num shrink-0 text-[13px] font-semibold text-ink">{moeda(c.valor)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, (c.valor / maiorCliente) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Painel>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════ a receber */

function AReceber({ podeBaixar }: { podeBaixar: boolean }) {
  const toast = useToast()
  const consulta = useAReceber(true)
  const baixar = useBaixarParcela()
  const [alvo, setAlvo] = useState<Parcela | null>(null)
  const [fFaixa, setFFaixa] = useState<'' | 'vencidas' | 'a_vencer'>('')
  const [baixa, setBaixa] = useState({ pagoEm: hojeISO(), forma: 'pix' as FormaPagamento, observacao: '' })

  const linhas = useMemo(() => {
    const todas = consulta.data ?? []
    if (fFaixa === 'vencidas') return todas.filter((p) => diasDeAtraso(p.vencimento) > 0)
    if (fFaixa === 'a_vencer') return todas.filter((p) => diasDeAtraso(p.vencimento) <= 0)
    return todas
  }, [consulta.data, fFaixa])

  const total = soma(linhas.map((p) => p.valor))

  const colunas: Array<Coluna<Parcela>> = [
    {
      chave: 'vencimento',
      cabecalho: 'Vencimento',
      largura: '130px',
      celula: (p) => {
        const d = diasDeAtraso(p.vencimento)
        return (
          <div className="flex min-w-0 flex-col">
            <span className="num text-ink">{fmtData(p.vencimento)}</span>
            <span className={cn('text-[11px]', d > 0 ? 'text-crit-ink' : 'text-ink-3')}>
              {d > 0 ? `${d} dia(s) em atraso` : d === 0 ? 'vence hoje' : `em ${-d} dia(s)`}
            </span>
          </div>
        )
      },
    },
    {
      chave: 'cliente',
      cabecalho: 'Cliente',
      celula: (p) => <span className="truncate text-ink">{p.fatura?.cliente?.nome_razao ?? '—'}</span>,
    },
    {
      chave: 'origem',
      cabecalho: 'Origem',
      largura: '150px',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (p) => (
        <div className="flex min-w-0 flex-col">
          <span className="num text-[12px] text-ink-2">
            Fatura {String(p.fatura?.numero ?? 0).padStart(5, '0')}
          </span>
          {p.fatura?.os && (
            <span className="num text-[11px] text-ink-3">OS {String(p.fatura.os.numero).padStart(5, '0')}</span>
          )}
        </div>
      ),
    },
    {
      chave: 'parcela',
      cabecalho: 'Parcela',
      largura: '90px',
      classeResponsiva: 'hidden sm:table-cell',
      celula: (p) => <span className="num text-ink-2">{p.numero}</span>,
    },
    {
      chave: 'faixa',
      cabecalho: 'Situação',
      largura: '150px',
      celula: (p) => {
        const f = faixaDeAtraso(p.vencimento)
        return <Selo tom={TOM_FAIXA[f]} ponto>{ROTULO_FAIXA[f]}</Selo>
      },
    },
    {
      chave: 'valor',
      cabecalho: 'Valor',
      largura: '120px',
      alinhamento: 'direita',
      celula: (p) => <span className="num font-semibold text-ink">{moeda(Number(p.valor))}</span>,
    },
    {
      chave: 'acoes',
      cabecalho: '',
      largura: '110px',
      alinhamento: 'direita',
      celula: (p) =>
        podeBaixar ? (
          <Botao
            tamanho="sm"
            variante="secundario"
            onClick={() => { setBaixa({ pagoEm: hojeISO(), forma: 'pix', observacao: '' }); setAlvo(p) }}
          >
            Dar baixa
          </Botao>
        ) : null,
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {([
            { v: '', r: 'Todas' },
            { v: 'vencidas', r: 'Vencidas' },
            { v: 'a_vencer', r: 'A vencer' },
          ] as const).map((o) => (
            <Botao
              key={o.v}
              tamanho="sm"
              variante={fFaixa === o.v ? 'primario' : 'neutro'}
              onClick={() => setFFaixa(o.v)}
            >
              {o.r}
            </Botao>
          ))}
        </div>
        <span className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[12px] text-ink-2">
          {linhas.length} parcela(s) · <strong className="num font-semibold text-ink">{moeda(total)}</strong>
        </span>
      </div>

      <Tabela
        densidade="compacta"
        colunas={colunas}
        linhas={linhas}
        chaveDe={(p) => p.id}
        estado={consulta.isLoading ? 'carregando' : consulta.isError ? 'erro' : 'ok'}
        mensagemVazio={{
          titulo: 'Nada a receber',
          descricao:
            fFaixa === 'vencidas'
              ? 'Nenhuma parcela em atraso.'
              : 'As parcelas aparecem aqui quando uma OS é liberada com saldo a faturar.',
        }}
        mensagemErro={{ descricao: mensagemErro(consulta.error), aoTentarNovamente: () => void consulta.refetch() }}
      />

      <Modal
        aberto={alvo !== null}
        aoFechar={() => setAlvo(null)}
        titulo="Dar baixa na parcela"
        descricao={
          alvo
            ? `${alvo.fatura?.cliente?.nome_razao ?? 'Sem cliente'} · parcela ${alvo.numero} · ${moeda(Number(alvo.valor))}`
            : undefined
        }
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setAlvo(null)}>Cancelar</Botao>
            <Botao
              variante="primario"
              carregando={baixar.isPending}
              onClick={() =>
                alvo &&
                baixar.mutate(
                  { id: alvo.id, pagoEm: baixa.pagoEm, forma: baixa.forma, observacao: baixa.observacao },
                  {
                    onSuccess: () => { toast.ok('Parcela recebida'); setAlvo(null) },
                    onError: (e) => toast.erro('Não foi possível dar baixa', mensagemErro(e)),
                  },
                )
              }
            >
              Confirmar recebimento
            </Botao>
          </>
        }
      >
        <Grade>
          <Campo className="sm:col-span-6" rotulo="Data do recebimento" obrigatorio>
            {(p) => (
              <Entrada {...p} type="date" value={baixa.pagoEm} onChange={(e) => setBaixa({ ...baixa, pagoEm: e.target.value })} />
            )}
          </Campo>
          <Campo className="sm:col-span-6" rotulo="Forma de pagamento" obrigatorio>
            {(p) => (
              <Selecao {...p} value={baixa.forma} onChange={(e) => setBaixa({ ...baixa, forma: e.target.value as FormaPagamento })}>
                {FORMAS_PAGAMENTO.map((f) => <option key={f} value={f}>{ROTULO_FORMA[f]}</option>)}
              </Selecao>
            )}
          </Campo>
          <Campo className="sm:col-span-12" rotulo="Observação" dica="Fica registrada na parcela.">
            {(p) => (
              <AreaTexto {...p} rows={2} value={baixa.observacao} onChange={(e) => setBaixa({ ...baixa, observacao: e.target.value })} />
            )}
          </Campo>
        </Grade>
      </Modal>
    </div>
  )
}

/* ═══════════════════════════════════════════════════ recebido */

function Recebido() {
  const toast = useToast()
  const [de, setDe] = useState(inicioDoMes())
  const [ate, setAte] = useState(hojeISO())

  const parcelas = useRecebido(de, ate, true)
  const naOS = useRecebidoNaOS(de, ate, true)
  const estornar = useEstornarParcela()

  const totalParcelas = soma((parcelas.data ?? []).map((p) => p.valor))
  const totalOS = soma((naOS.data ?? []).map((o) => o.valor_pago))

  /* De onde veio o dinheiro. Uma oficina que recebe 80% em PIX negocia taxa de
     maquininha diferente de uma que recebe 80% em crédito. */
  const porForma = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const p of parcelas.data ?? []) {
      const k = p.forma_pagamento ? ROTULO_FORMA[p.forma_pagamento] : 'Não informada'
      mapa.set(k, (mapa.get(k) ?? 0) + Number(p.valor))
    }
    for (const o of naOS.data ?? []) {
      const k = o.forma_pagamento ? ROTULO_FORMA[o.forma_pagamento] : 'Não informada'
      mapa.set(k, (mapa.get(k) ?? 0) + Number(o.valor_pago))
    }
    return [...mapa.entries()].map(([forma, valor]) => ({ forma, valor })).sort((a, b) => b.valor - a.valor)
  }, [parcelas.data, naOS.data])

  const maior = Math.max(1, ...porForma.map((f) => f.valor))
  const carregando = parcelas.isLoading || naOS.isLoading

  const colunas: Array<Coluna<Parcela>> = [
    {
      chave: 'pago_em',
      cabecalho: 'Recebido em',
      largura: '130px',
      celula: (p) => <span className="num text-ink">{p.pago_em ? fmtData(p.pago_em) : '—'}</span>,
    },
    {
      chave: 'cliente',
      cabecalho: 'Cliente',
      celula: (p) => <span className="truncate text-ink">{p.fatura?.cliente?.nome_razao ?? '—'}</span>,
    },
    {
      chave: 'forma',
      cabecalho: 'Forma',
      largura: '140px',
      classeResponsiva: 'hidden sm:table-cell',
      celula: (p) => (p.forma_pagamento ? <Selo tom="info">{ROTULO_FORMA[p.forma_pagamento]}</Selo> : <span className="text-ink-3">—</span>),
    },
    {
      chave: 'origem',
      cabecalho: 'Origem',
      largura: '140px',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (p) => (
        <span className="num text-[12px] text-ink-2">
          Fatura {String(p.fatura?.numero ?? 0).padStart(5, '0')} · {p.numero}
        </span>
      ),
    },
    {
      chave: 'valor',
      cabecalho: 'Valor',
      largura: '120px',
      alinhamento: 'direita',
      celula: (p) => <span className="num font-semibold text-ink">{moeda(Number(p.valor))}</span>,
    },
    {
      chave: 'acoes',
      cabecalho: '',
      largura: '100px',
      alinhamento: 'direita',
      celula: (p) => (
        <Botao
          tamanho="sm"
          variante="fantasma"
          iconeInicio={<RotateCcw />}
          carregando={estornar.isPending}
          onClick={() =>
            estornar.mutate(p.id, {
              onSuccess: () => toast.ok('Baixa estornada'),
              onError: (e) => toast.erro('Não foi possível estornar', mensagemErro(e)),
            })
          }
        >
          Estornar
        </Botao>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <FiltroPeriodo de={de} ate={ate} aoMudarDe={setDe} aoMudarAte={setAte} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CartaoValor rotulo="Total recebido" valor={totalParcelas + totalOS} detalhe="no período" tom="ok" icone={<ArrowDownRight className="size-4" />} carregando={carregando} />
        <CartaoValor rotulo="Em parcelas" valor={totalParcelas} detalhe={`${(parcelas.data ?? []).length} baixa(s)`} tom="cyan" icone={<CalendarClock className="size-4" />} carregando={carregando} />
        <CartaoValor rotulo="À vista na OS" valor={totalOS} detalhe={`${(naOS.data ?? []).length} OS`} tom="accent" icone={<CircleDollarSign className="size-4" />} carregando={carregando} />
      </div>

      <Painel semPadding>
        <CabecalhoPainel titulo="Por forma de pagamento" descricao="Soma do período, parcelas e pagamentos na OS." />
        <div className="p-4 sm:p-5">
          {carregando ? (
            <EstadoCarregando rotulo="" />
          ) : porForma.length === 0 ? (
            <EstadoVazio compacto titulo="Nenhum recebimento" descricao="Não houve entrada no período escolhido." />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {porForma.map((f) => (
                <li key={f.forma} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[13px] text-ink">{f.forma}</span>
                    <span className="num shrink-0 text-[13px] font-semibold text-ink">{moeda(f.valor)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-ok" style={{ width: `${Math.max(2, (f.valor / maior) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Painel>

      <Tabela
        densidade="compacta"
        colunas={colunas}
        linhas={parcelas.data ?? []}
        chaveDe={(p) => p.id}
        estado={parcelas.isLoading ? 'carregando' : parcelas.isError ? 'erro' : 'ok'}
        mensagemVazio={{
          titulo: 'Nenhuma parcela baixada',
          descricao: 'Pagamentos feitos à vista na OS entram no total acima, mas não viram parcela.',
        }}
        mensagemErro={{ descricao: mensagemErro(parcelas.error), aoTentarNovamente: () => void parcelas.refetch() }}
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════ faturamento */

function Faturamento() {
  const [de, setDe] = useState(inicioDoMes(-2))
  const [ate, setAte] = useState(hojeISO())
  const consulta = useFaturamento(de, ate, true)

  const total = soma((consulta.data ?? []).map((f) => f.valor_total))
  const qtd = (consulta.data ?? []).length
  const ticket = qtd > 0 ? total / qtd : 0

  /* Faturamento por mês. Sem gráfico externo: a barra é o próprio valor. */
  const porMes = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const f of consulta.data ?? []) {
      const k = f.emitida_em.slice(0, 7)
      mapa.set(k, (mapa.get(k) ?? 0) + Number(f.valor_total))
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, valor]) => ({ mes, valor }))
  }, [consulta.data])

  const maior = Math.max(1, ...porMes.map((m) => m.valor))

  const colunas: Array<Coluna<FaturaResumo>> = [
    {
      chave: 'numero',
      cabecalho: 'Fatura',
      largura: '110px',
      celula: (f) => <span className="num font-semibold text-ink">{String(f.numero).padStart(5, '0')}</span>,
    },
    {
      chave: 'emitida',
      cabecalho: 'Emissão',
      largura: '120px',
      celula: (f) => <span className="num text-ink-2">{fmtData(f.emitida_em)}</span>,
    },
    {
      chave: 'cliente',
      cabecalho: 'Cliente',
      celula: (f) => <span className="truncate text-ink">{f.cliente?.nome_razao ?? '—'}</span>,
    },
    {
      chave: 'os',
      cabecalho: 'OS',
      largura: '100px',
      classeResponsiva: 'hidden sm:table-cell',
      celula: (f) => (f.os ? <span className="num text-ink-2">{String(f.os.numero).padStart(5, '0')}</span> : <span className="text-ink-3">—</span>),
    },
    {
      chave: 'condicao',
      cabecalho: 'Condição',
      largura: '160px',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (f) => <span className="truncate text-[12.5px] text-ink-2">{f.condicao}</span>,
    },
    {
      chave: 'valor',
      cabecalho: 'Valor',
      largura: '130px',
      alinhamento: 'direita',
      celula: (f) => <span className="num font-semibold text-ink">{moeda(Number(f.valor_total))}</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <FiltroPeriodo de={de} ate={ate} aoMudarDe={setDe} aoMudarAte={setAte} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CartaoValor rotulo="Faturado" valor={total} detalhe="no período" tom="cyan" icone={<FileText className="size-4" />} carregando={consulta.isLoading} />
        <CartaoValor rotulo="Ticket médio" valor={ticket} detalhe={`${qtd} fatura(s)`} tom="accent" icone={<ArrowUpRight className="size-4" />} carregando={consulta.isLoading} />
        <CartaoValor rotulo="Faturas" valor={qtd} detalhe="emitidas" tom="neutro" icone={<CalendarClock className="size-4" />} carregando={consulta.isLoading} formato="numero" />
      </div>

      {porMes.length > 1 && (
        <Painel semPadding>
          <CabecalhoPainel titulo="Faturamento por mês" descricao="Somatório das faturas emitidas em cada mês do período." />
          <div className="p-4 sm:p-5">
            <ul className="flex flex-col gap-2.5">
              {porMes.map((m) => (
                <li key={m.mes} className="flex items-center gap-3">
                  <span className="num w-16 shrink-0 text-[12px] text-ink-3 sm:w-20">
                    {new Date(`${m.mes}-01T00:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}
                  </span>
                  <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-cyan" style={{ width: `${Math.max(2, (m.valor / maior) * 100)}%` }} />
                  </div>
                  <span className="num w-24 shrink-0 text-right text-[12.5px] text-ink sm:w-28">{moeda(m.valor)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Painel>
      )}

      <Tabela
        densidade="compacta"
        colunas={colunas}
        linhas={consulta.data ?? []}
        chaveDe={(f) => f.id}
        estado={consulta.isLoading ? 'carregando' : consulta.isError ? 'erro' : 'ok'}
        mensagemVazio={{
          titulo: 'Nenhuma fatura no período',
          descricao: 'A fatura é gerada na saída do pátio quando a OS sai com saldo a faturar.',
        }}
        mensagemErro={{ descricao: mensagemErro(consulta.error), aoTentarNovamente: () => void consulta.refetch() }}
      />
    </div>
  )
}

/* ═══════════════════════════════════════════════════ compartilhados */

function FiltroPeriodo({
  de,
  ate,
  aoMudarDe,
  aoMudarAte,
}: {
  de: string
  ate: string
  aoMudarDe: (v: string) => void
  aoMudarAte: (v: string) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(2,minmax(0,200px))]">
      <Campo rotulo="De">
        {(p) => <Entrada {...p} type="date" value={de} onChange={(e) => aoMudarDe(e.target.value)} />}
      </Campo>
      <Campo rotulo="Até">
        {(p) => <Entrada {...p} type="date" value={ate} onChange={(e) => aoMudarAte(e.target.value)} />}
      </Campo>
    </div>
  )
}

const TOM_CARTAO = {
  accent: { faixa: 'bg-accent', icone: 'bg-accent-soft text-accent-ink' },
  ok: { faixa: 'bg-ok', icone: 'bg-ok-soft text-ok-ink' },
  cyan: { faixa: 'bg-cyan', icone: 'bg-cyan-soft text-cyan-ink' },
  critico: { faixa: 'bg-crit', icone: 'bg-crit-soft text-crit-ink' },
  neutro: { faixa: 'bg-ink-3', icone: 'bg-surface-2 text-ink-3' },
} as const

/** Cartão de valor. Dinheiro em destaque, contexto embaixo, sem enfeite. */
function CartaoValor({
  rotulo,
  valor,
  detalhe,
  tom,
  icone,
  carregando,
  formato = 'moeda',
}: {
  rotulo: string
  valor: number
  detalhe: string
  tom: keyof typeof TOM_CARTAO
  icone: React.ReactNode
  carregando?: boolean
  formato?: 'moeda' | 'numero'
}) {
  const t = TOM_CARTAO[tom]
  return (
    <div className="aresta relative flex items-start justify-between gap-3 overflow-hidden rounded-xl border border-line bg-surface p-4">
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-[3px]', t.faixa)} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="lbl text-[9px]">{rotulo}</span>
        <span className="num text-[20px] leading-tight font-bold tracking-tight text-ink sm:text-[24px]">
          {carregando ? '—' : formato === 'moeda' ? moeda(valor) : valor.toLocaleString('pt-BR')}
        </span>
        <span className="truncate text-[11.5px] text-ink-3">{detalhe}</span>
      </div>
      <span aria-hidden className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', t.icone)}>
        {icone}
      </span>
    </div>
  )
}
