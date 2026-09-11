import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Loader2, Printer, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import { dataHora, mensagemErro } from '@/lib/utils'
import { mascaraDocumento, mascaraInscricaoEstadual, moeda, numeroBR } from '@/lib/formatos'
import { Botao } from '@/componentes/ui/Botao'
import { useOrdem, useAssinaturas } from './useOS'
import { baixarPdf, nomeArquivo } from '@/documentos/pdf'
import { pdfOS } from '@/documentos/pdfOS'
import { useToast } from '@/componentes/ui/Toast'
import type { DadosEmpresa, OSProduto, OSServico } from '@/tipos/db'

/**
 * Documento oficial da OS.
 *
 * "Baixar PDF" gera o arquivo de verdade, com papel timbrado e numeração de
 * página. A impressão pelo navegador continua disponível para quem só quer
 * mandar direto para a impressora.
 */
/** Nome que o cliente entende, não o valor gravado no banco. */
const ROTULO_FORMA: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  debito: 'Cartão de débito',
  credito: 'Cartão de crédito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  faturado: 'Faturado',
  outro: 'Outro',
}

export function DocumentoOS({
  osId,
  aoFechar,
  servicos,
  produtos,
}: {
  osId: string
  aoFechar: () => void
  servicos: OSServico[]
  produtos: OSProduto[]
}) {
  const ordem = useOrdem(osId)
  const assinaturas = useAssinaturas('ordens_servico', osId)

  const empresa = useQuery({
    queryKey: ['dados-empresa-documento'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<DadosEmpresa | null> => {
      const { data, error } = await supabase.from('dados_empresa').select('*').maybeSingle()
      if (error) throw error
      return data
    },
  })

  const mecanicos = useQuery({
    queryKey: ['os-mecanicos-doc', osId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('os_mecanicos')
        .select('usuario:usuarios ( nome_completo )')
        .eq('os_id', osId)
      if (error) throw error
      return (data ?? []) as unknown as Array<{ usuario: { nome_completo: string } | null }>
    },
  })

  const toast = useToast()
  const [baixando, setBaixando] = useState(false)

  /* Só entram no PDF os itens ativos que o cliente não recusou — mesma regra
     da tela, para o papel não divergir do sistema. */
  async function baixar() {
    const o = ordem.data
    if (!o) return
    setBaixando(true)
    try {
      const e = empresa.data
      const c = o.cliente
      const v = o.veiculo
      const linha = (i: OSServico | OSProduto) => ({
        codigo: i.codigo ?? null,
        descricao: i.descricao,
        quantidade: Number(i.quantidade),
        unidade: 'unidade' in i ? ((i as OSProduto).unidade ?? null) : null,
        valor_unitario: Number(i.valor_unitario),
        desconto: Number(i.desconto ?? 0),
        valor_total: Number(i.valor_total),
        aprovacao: i.aprovacao ?? null,
      })

      const { data: defeitos } = await supabase
        .from('checklist_defeitos')
        .select('defeito, criticidade, recomendacao, checklist:checklists!inner ( os_id )')
        .eq('checklist.os_id', osId)
        .limit(40)

      const definicao = await pdfOS({
        empresa: {
          nome: e?.nome_fantasia || e?.razao_social || 'Tecnoar Freios',
          razaoSocial: e?.razao_social ?? null,
          cnpj: e?.cnpj ? mascaraDocumento(e.cnpj) : null,
          inscricaoEstadual: e?.inscricao_estadual ? mascaraInscricaoEstadual(e.inscricao_estadual) : null,
          inscricaoMunicipal: e?.inscricao_municipal ?? null,
          telefone: e?.telefone ?? null,
          endereco: e?.endereco ?? null,
          email: e?.email ?? null,
        },
        os: {
          numero: o.numero,
          tipo: o.tipo,
          status: o.status?.nome ?? null,
          aberta_em: o.aberta_em,
          encerrada_em: o.encerrada_em,
          previsao_em: o.previsao_em,
          km: o.km,
          problema_alegado: o.problema_alegado,
          diagnostico: o.diagnostico,
          vendedor: null,
          mecanicos: (mecanicos.data ?? []).map((m) => m.usuario?.nome_completo).filter(Boolean) as string[],
        },
        cliente: {
          nome: c?.nome_razao ?? null,
          documento: c?.documento ? mascaraDocumento(c.documento) : null,
          contato: c?.celular ?? c?.telefone ?? null,
          email: c?.email ?? null,
          endereco: [c?.logradouro, c?.numero, c?.bairro, c?.municipio].filter(Boolean).join(', ') || null,
        },
        veiculo: {
          placa: v?.placa ?? null,
          modelo: v?.descricao || [v?.marca, v?.modelo].filter(Boolean).join(' ') || null,
          cor: v?.cor ?? null,
          ano: v?.ano ?? null,
          tipo: v?.tipo ?? null,
        },
        servicos: ativos(servicos).map(linha),
        produtos: ativos(produtos).map(linha),
        totais: {
          servicos: Number(o.valor_servicos),
          produtos: Number(o.valor_produtos),
          desconto: Number(o.desconto),
          acrescimo: Number(o.acrescimo),
          total: Number(o.valor_total),
          pago: Number(o.valor_pago ?? 0),
        },
        pagamento: {
          forma: o.forma_pagamento ? ROTULO_FORMA[o.forma_pagamento] : null,
          condicao: o.condicao_pagamento ?? null,
          parcelas: o.parcelas ?? null,
          observacao: o.observacao_pagamento ?? null,
        },
        defeitos: (defeitos ?? []).map((x: Record<string, unknown>) => ({
          defeito: String(x.defeito),
          criticidade: String(x.criticidade),
          recomendacao: (x.recomendacao as string | null) ?? null,
        })),
      })
      await baixarPdf(
        definicao,
        nomeArquivo([o.tipo === 'orcamento' ? 'orcamento' : 'os', String(o.numero).padStart(5, '0'), v?.placa]),
      )
    } catch (err) {
      toast.erro('Não foi possível gerar o PDF', mensagemErro(err))
    } finally {
      setBaixando(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [aoFechar])

  const o = ordem.data
  const ativos = <T extends { situacao: string; aprovacao: string }>(itens: T[]) =>
    itens.filter((i) => i.situacao === 'ativo' && i.aprovacao !== 'recusado')

  const servicosDoc = ativos(servicos)
  const produtosDoc = ativos(produtos)

  return createPortal(
    <div className="fixed inset-0 top-[env(safe-area-inset-top)] z-70 overflow-y-auto bg-canvas">
      <style>{`
        @media print {
          .sem-impressao { display: none !important; }
          .area-impressao { padding: 0 !important; }
          body { background: #fff !important; }
        }
      `}</style>

      <div className="sem-impressao sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3">
        <span className="font-display text-[15px] font-semibold text-ink">
          Documento da OS {o ? String(o.numero).padStart(5, '0') : ''}
        </span>
        <div className="flex gap-2">
          <Botao
            variante="primario"
            iconeInicio={baixando ? <Loader2 className="animate-spin" /> : <Download />}
            disabled={baixando || !ordem.data}
            onClick={() => void baixar()}
          >
            Baixar PDF
          </Botao>
          <Botao variante="neutro" iconeInicio={<Printer />} onClick={() => window.print()}>
            Imprimir
          </Botao>
          <Botao variante="neutro" iconeInicio={<X />} onClick={aoFechar}>
            Fechar
          </Botao>
        </div>
      </div>

      <div className="area-impressao mx-auto max-w-4xl p-6 print:max-w-none">
        {!o ? (
          <p className="text-[13px] text-ink-3">Carregando documento…</p>
        ) : (
          <article className="flex flex-col gap-6 rounded-lg border border-line bg-surface p-8 text-ink print:rounded-none print:border-0 print:p-0">
            {/* cabeçalho */}
            <header className="flex flex-col gap-5 pb-5">
              <span aria-hidden className="-mt-1 h-[3px] w-14 rounded-full bg-accent print:bg-[#fc6400]" />
              <div className="flex items-start justify-between gap-6 border-b-2 border-ink pb-5">
                <div className="flex items-center gap-4">
                  <img src="/brand/tecnoar-positivo.svg" alt="Tecnoar Freios" className="h-16 w-auto print:h-14" />
                  <div className="flex flex-col gap-0.5">
                    <span className="font-display text-[16px] font-bold tracking-tight">
                      {empresa.data?.nome_fantasia || empresa.data?.razao_social || 'Tecnoar Freios'}
                    </span>
                    {empresa.data?.cnpj && <span className="num text-[11px] text-ink-2">CNPJ {mascaraDocumento(empresa.data.cnpj)}</span>}
                    {empresa.data?.endereco && (
                      <span className="text-[11px] text-ink-2">
                        {empresa.data.endereco}
                        {empresa.data.municipio ? ` — ${empresa.data.municipio}` : ''}
                        {empresa.data.uf ? `/${empresa.data.uf}` : ''}
                      </span>
                    )}
                    {(empresa.data?.telefone || empresa.data?.email) && (
                      <span className="text-[11px] text-ink-2">
                        {[empresa.data?.telefone, empresa.data?.email].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5">
                  <span className="font-display text-[11px] font-bold tracking-[0.18em] text-accent-ink uppercase">
                    {o.tipo === 'orcamento' ? 'Orçamento' : o.tipo === 'garantia' ? 'Garantia' : 'Ordem de serviço'}
                  </span>
                  <span className="num text-4xl leading-none font-bold tabular-nums">{String(o.numero).padStart(5, '0')}</span>
                  <span
                    className="mt-0.5 inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-canvas px-2.5 py-0.5 text-[10.5px] font-semibold text-ink-2 print:border-ink/30"
                  >
                    <span aria-hidden className="size-1.5 rounded-full bg-ink-2" />
                    {o.status?.nome ?? 'Sem status'}
                  </span>
                  <span className="num text-[11px] text-ink-2">Abertura: {dataHora(o.aberta_em)}</span>
                  {o.previsao_em && <span className="num text-[11px] text-ink-2">Previsão: {dataHora(o.previsao_em)}</span>}
                </div>
              </div>
            </header>

            {/* cliente e veículo */}
            <section className="grid grid-cols-2 gap-6">
              <Bloco titulo="Cliente">
                <Linha rotulo="Nome / razão social" valor={o.cliente?.nome_razao} />
                <Linha rotulo="Documento" valor={o.cliente?.documento ? mascaraDocumento(o.cliente.documento) : null} mono />
                <Linha rotulo="Telefone" valor={o.cliente?.celular ?? o.cliente?.telefone} mono />
                <Linha rotulo="E-mail" valor={o.cliente?.email} />
                <Linha
                  rotulo="Endereço"
                  valor={
                    [o.cliente?.logradouro, o.cliente?.numero, o.cliente?.bairro, o.cliente?.municipio, o.cliente?.uf]
                      .filter(Boolean)
                      .join(', ') || null
                  }
                />
              </Bloco>

              <Bloco titulo="Veículo">
                <Linha rotulo="Placa" valor={o.veiculo?.placa} mono destaque />
                <Linha rotulo="Descrição" valor={o.veiculo?.descricao} />
                <Linha rotulo="Marca / modelo" valor={[o.veiculo?.marca, o.veiculo?.modelo].filter(Boolean).join(' ') || null} />
                <Linha rotulo="Frota" valor={o.veiculo?.numero_frota} mono />
                <Linha rotulo="KM na entrada" valor={o.km !== null ? `${numeroBR(o.km, 0)} km` : null} mono />
              </Bloco>
            </section>

            {(o.problema_alegado || o.diagnostico) && (
              <section className="grid grid-cols-2 gap-6">
                {o.problema_alegado && (
                  <Bloco titulo="Problema alegado">
                    <p className="text-[12px] leading-relaxed whitespace-pre-wrap">{o.problema_alegado}</p>
                  </Bloco>
                )}
                {o.diagnostico && (
                  <Bloco titulo="Diagnóstico">
                    <p className="text-[12px] leading-relaxed whitespace-pre-wrap">{o.diagnostico}</p>
                  </Bloco>
                )}
              </section>
            )}

            {servicosDoc.length > 0 && (
              <TabelaDoc
                titulo="Serviços"
                colunas={['Código', 'Descrição', 'Qtd.', 'Unitário', 'Desconto', 'Total']}
                linhas={servicosDoc.map((s) => [
                  s.codigo ?? '—',
                  s.descricao,
                  numeroBR(s.quantidade, 2),
                  moeda(s.valor_unitario),
                  moeda(s.desconto),
                  moeda(s.valor_total),
                ])}
              />
            )}

            {produtosDoc.length > 0 && (
              <TabelaDoc
                titulo="Produtos utilizados"
                colunas={['Código', 'Descrição', 'Un.', 'Qtd.', 'Unitário', 'Total']}
                linhas={produtosDoc.map((p) => [
                  p.codigo ?? '—',
                  p.descricao,
                  p.unidade,
                  numeroBR(p.quantidade, 2),
                  moeda(p.valor_unitario),
                  moeda(p.valor_total),
                ])}
              />
            )}

            {servicosDoc.length === 0 && produtosDoc.length === 0 && (
              <p className="rounded border border-dashed border-line-strong p-4 text-center text-[12px] text-ink-2">
                Nenhum serviço ou produto aprovado nesta ordem.
              </p>
            )}

            {/* totais */}
            <section className="flex justify-end">
              <table className="w-80 overflow-hidden rounded-md border border-line">
                <tbody>
                  <LinhaTotal rotulo="Serviços" valor={o.valor_servicos} />
                  <LinhaTotal rotulo="Produtos" valor={o.valor_produtos} />
                  {o.desconto > 0 && <LinhaTotal rotulo="Descontos" valor={-o.desconto} />}
                  {o.acrescimo > 0 && <LinhaTotal rotulo="Acréscimos" valor={o.acrescimo} />}
                  <tr className="border-t-2 border-ink bg-canvas/70 print:bg-transparent">
                    <td className="py-2.5 pl-3.5 font-display text-[12.5px] font-bold tracking-wide uppercase">Total geral</td>
                    <td className="num py-2.5 pr-3.5 text-right text-[17px] font-bold text-accent-ink">{moeda(o.valor_total)}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            {mecanicos.data && mecanicos.data.length > 0 && (
              <Bloco titulo="Equipe responsável">
                <p className="text-[12px]">
                  {mecanicos.data.map((m) => m.usuario?.nome_completo).filter(Boolean).join(' · ')}
                </p>
              </Bloco>
            )}

            {o.observacoes && (
              <Bloco titulo="Informações adicionais">
                <p className="text-[12px] leading-relaxed whitespace-pre-wrap">{o.observacoes}</p>
              </Bloco>
            )}

            {/* assinaturas */}
            <section className="mt-4 grid grid-cols-2 gap-10 pt-6">
              {(assinaturas.data && assinaturas.data.length > 0
                ? assinaturas.data.map((a) => ({ nome: a.nome, momento: a.momento, quando: dataHora(a.assinado_em) }))
                : [
                    { nome: '', momento: 'Cliente', quando: '' },
                    { nome: '', momento: 'Responsável Tecnoar', quando: '' },
                  ]
              ).map((a, i) => (
                <div key={i} className="flex flex-col gap-1">
                  <div className="h-10 border-b border-ink" />
                  <span className="text-[11px] font-semibold">{a.nome || a.momento}</span>
                  <span className="text-[10px] text-ink-2">
                    {a.nome ? `${a.momento} · ${a.quando}` : 'Assinatura'}
                  </span>
                </div>
              ))}
            </section>

            <footer className="num border-t border-line pt-3 text-center text-[10px] text-ink-2">
              Documento gerado pelo Sistema Operacional Tecnoar em {dataHora(new Date().toISOString())}
            </footer>
          </article>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 font-display text-[10px] font-bold tracking-[0.16em] uppercase text-ink-2">
        <span aria-hidden className="h-[3px] w-3 rounded-full bg-accent print:bg-[#fc6400]" />
        {titulo}
      </h3>
      <div className="flex flex-col gap-1 rounded-md border border-line bg-canvas/40 p-3.5 print:bg-transparent">{children}</div>
    </div>
  )
}

function Linha({
  rotulo,
  valor,
  mono,
  destaque,
}: {
  rotulo: string
  valor?: string | null
  mono?: boolean
  destaque?: boolean
}) {
  return (
    <div className="flex gap-2 text-[12px]">
      <span className="w-32 shrink-0 text-ink-2">{rotulo}</span>
      <span className={[mono ? 'num' : '', destaque ? 'font-bold' : '', 'flex-1'].filter(Boolean).join(' ')}>
        {valor || '—'}
      </span>
    </div>
  )
}

function TabelaDoc({ titulo, colunas, linhas }: { titulo: string; colunas: string[]; linhas: string[][] }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 font-display text-[10px] font-bold tracking-[0.16em] uppercase text-ink-2">
        <span aria-hidden className="h-[3px] w-3 rounded-full bg-accent print:bg-[#fc6400]" />
        {titulo}
      </h3>
      <table className="w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="bg-canvas/60 print:bg-transparent">
            {colunas.map((c, i) => (
              <th
                key={c}
                className={[
                  'border-b-2 border-ink py-2 font-display text-[10px] font-bold tracking-wide text-ink-2 uppercase',
                  i === 1 ? 'text-left' : i === 0 ? 'text-left' : 'text-right',
                ].join(' ')}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-line">
              {l.map((celula, j) => (
                <td
                  key={j}
                  className={[
                    'py-2',
                    j === 0 || j === 2 || j === 3 || j === 4 || j === 5 ? 'num' : '',
                    j <= 1 ? 'text-left' : 'text-right',
                  ].join(' ')}
                >
                  {celula}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function LinhaTotal({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="py-1.5 pl-3.5 text-[12px] text-ink-2">{rotulo}</td>
      <td className="num py-1.5 pr-3.5 text-right text-[12px]">{moeda(valor)}</td>
    </tr>
  )
}
