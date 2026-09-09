import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import { data as fmtData, moeda, numeroBR, paraNumero } from '@/lib/formatos'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { sincronizarOmie } from '@/dados/omie'
import { Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { BarraFiltros } from '@/componentes/ui/BarraFiltros'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada } from '@/componentes/ui/Campo'
import { Grade } from '@/componentes/ui/Secao'
import { Paginacao, Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { REF_CLIENTE, REF_PRODUTO, SeletorRef } from '@/componentes/ui/SeletorRef'
import { Selo } from '@/componentes/ui/Selo'
import { GradeMetricas, Metrica } from '@/componentes/ui/Metrica'
import { EstadoCarregando, EstadoErro, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import type {
  EstadoIntegracao,
  EvolucaoVenda,
  IndicadoresVendas,
  ProdutoMaisVendido,
  VendaListada,
} from '@/tipos/db'

interface ItemVenda {
  produto_id: string | null
  descricao: string
  quantidade: string
  valor_unitario: string
  baixar_estoque: boolean
}

const ITEM_VAZIO: ItemVenda = { produto_id: null, descricao: '', quantidade: '1', valor_unitario: '', baixar_estoque: true }

/* =========================================================== VENDAS ==== */

export function PainelVendas() {
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const ctrl = useControleListagem(25)
  const [criando, setCriando] = useState(false)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const podeCriar = pode('estoque_vendas', 'editar')
  const podeSincronizar = pode('integracoes', 'sincronizar')

  const integracao = useQuery({
    queryKey: ['integracao', 'omie'],
    queryFn: async (): Promise<EstadoIntegracao | null> => {
      const { data, error } = await supabase.rpc('integracao_estado', { p_provedor: 'omie' })
      if (error) throw error
      return (data ?? [])[0] ?? null
    },
  })

  const indicadores = useQuery({
    queryKey: ['vendas-indicadores'],
    queryFn: async (): Promise<IndicadoresVendas | null> => {
      const { data, error } = await supabase.rpc('indicadores_vendas', {})
      if (error) throw error
      return (data ?? [])[0] ?? null
    },
  })

  const evolucao = useQuery({
    queryKey: ['vendas-evolucao'],
    queryFn: async (): Promise<EvolucaoVenda[]> => {
      const { data, error } = await supabase.rpc('evolucao_vendas', { p_meses: 12 })
      if (error) throw error
      return data ?? []
    },
  })

  const maisVendidos = useQuery({
    queryKey: ['vendas-mais-vendidos'],
    queryFn: async (): Promise<ProdutoMaisVendido[]> => {
      const inicioAno = `${new Date().getFullYear()}-01-01`
      const { data, error } = await supabase.rpc('produtos_mais_vendidos', { p_de: inicioAno, p_limite: 8 })
      if (error) throw error
      return data ?? []
    },
  })

  const filtrar = useMemo(
    () => (q: Consulta) => {
      const t = termoBusca(ctrl.busca)
      return t.length >= 2 ? q.or(`numero.ilike.%${t}%,observacoes.ilike.%${t}%`) : q
    },
    [ctrl.busca],
  )

  const lista = useListagem<VendaListada>({
    chave: ['vendas', 'lista', ctrl.busca, ctrl.pagina, ctrl.porPagina],
    tabela: 'vendas',
    select: '*, cliente:clientes ( id, nome_razao ), vendedor:vendedores ( id, descricao )',
    filtrar,
    ordenacao: { coluna: 'data_venda', ascendente: false },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
  })

  const sincronizar = useMutation({
    mutationFn: () =>
      sincronizarOmie(['vendas'], (p) => setProgresso(`Vendas — página ${p.pagina}${p.total ? ` de ${p.total}` : ''}`)),
    onSettled: () => setProgresso(null),
    onSuccess: (resumo) => {
      const comErro = resumo.filter((r) => r.erro)
      if (comErro.length) toast.erro('Sincronização interrompida', comErro.map((r) => r.erro).join(' · '))
      else {
        const n = resumo.reduce((s, r) => s + r.novos, 0)
        const a = resumo.reduce((s, r) => s + r.atualizados, 0)
        toast.ok('Sincronização concluída', `${n} nova(s), ${a} atualizada(s).`)
      }
      void qc.invalidateQueries({ queryKey: ['vendas'] })
      void qc.invalidateQueries({ queryKey: ['vendas-indicadores'] })
      void qc.invalidateQueries({ queryKey: ['vendas-evolucao'] })
    },
    onError: (e) => toast.erro('Falha na sincronização', mensagemErro(e)),
  })

  /* ---------------------------------------------------------- nova venda */
  const [venda, setVenda] = useState({
    numero: '',
    cliente_id: null as string | null,
    data_venda: new Date().toISOString().slice(0, 10),
    observacoes: '',
  })
  const [itens, setItens] = useState<ItemVenda[]>([{ ...ITEM_VAZIO }])

  const totalVenda = itens.reduce(
    (s, i) => s + (paraNumero(i.quantidade) ?? 0) * (paraNumero(i.valor_unitario) ?? 0),
    0,
  )

  const registrar = useMutation({
    mutationFn: async () => {
      setErro(null)
      if (!venda.numero.trim()) throw new Error('Informe o número da venda.')
      const validos = itens.filter((i) => i.descricao.trim() && (paraNumero(i.quantidade) ?? 0) > 0)
      if (validos.length === 0) throw new Error('Adicione ao menos um item com descrição e quantidade.')

      const { data: nova, error } = await supabase
        .from('vendas')
        .insert({
          numero: venda.numero.trim(),
          cliente_id: venda.cliente_id,
          data_venda: venda.data_venda,
          valor_total: totalVenda,
          observacoes: venda.observacoes.trim() || null,
          /* Venda digitada aqui é do sistema; sem isto herdaria o padrão da
             tabela, criada para a importação da Omie, e a origem mentiria. */
          origem: 'manual',
        })
        .select('id')
        .single()
      if (error) throw error

      const { error: erroItens } = await supabase.from('venda_itens').insert(
        validos.map((i) => ({
          venda_id: nova.id,
          produto_id: i.produto_id,
          descricao: i.descricao.trim(),
          quantidade: paraNumero(i.quantidade) ?? 0,
          valor_unitario: paraNumero(i.valor_unitario) ?? 0,
          valor_total: (paraNumero(i.quantidade) ?? 0) * (paraNumero(i.valor_unitario) ?? 0),
        })),
      )
      if (erroItens) throw erroItens

      // Baixa de estoque item a item — cada falha é relatada, nenhuma é escondida.
      const falhas: string[] = []
      for (const i of validos) {
        if (!i.baixar_estoque || !i.produto_id) continue
        const { error: erroMov } = await supabase.rpc('movimentar_estoque', {
          p_produto: i.produto_id,
          p_tipo: 'saida',
          p_quantidade: paraNumero(i.quantidade) ?? 0,
          p_motivo: `Venda ${venda.numero.trim()}`,
          p_venda: nova.id,
        })
        if (erroMov) falhas.push(`${i.descricao}: ${erroMov.message}`)
      }
      return falhas
    },
    onSuccess: (falhas) => {
      if (falhas.length) {
        toast.erro('Venda registrada, mas o estoque não baixou em todos os itens', falhas.join(' · '))
      } else {
        toast.ok('Venda registrada')
      }
      setCriando(false)
      setVenda({ numero: '', cliente_id: null, data_venda: new Date().toISOString().slice(0, 10), observacoes: '' })
      setItens([{ ...ITEM_VAZIO }])
      void qc.invalidateQueries({ queryKey: ['vendas'] })
      void qc.invalidateQueries({ queryKey: ['vendas-indicadores'] })
      void qc.invalidateQueries({ queryKey: ['vendas-evolucao'] })
      void qc.invalidateQueries({ queryKey: ['vendas-mais-vendidos'] })
      void qc.invalidateQueries({ queryKey: ['estoque'] })
      void qc.invalidateQueries({ queryKey: ['estoque-indicadores'] })
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const colunas: Array<Coluna<VendaListada>> = [
    {
      chave: 'numero',
      cabecalho: 'Número',
      largura: '130px',
      celula: (v) => <span className="num font-semibold text-ink">{v.numero}</span>,
    },
    {
      chave: 'data',
      cabecalho: 'Data',
      largura: '120px',
      celula: (v) => <span className="num text-[12.5px]">{fmtData(v.data_venda)}</span>,
    },
    {
      chave: 'cliente',
      cabecalho: 'Cliente',
      celula: (v) => v.cliente?.nome_razao ?? <span className="text-ink-3">Não vinculado</span>,
    },
    {
      chave: 'origem',
      cabecalho: 'Origem',
      largura: '110px',
      classeResponsiva: 'hidden md:table-cell',
      celula: (v) => <Selo tom={v.origem === 'omie' ? 'info' : 'neutro'}>{v.origem === 'omie' ? 'Omie' : 'Sistema'}</Selo>,
    },
    {
      chave: 'etapa',
      cabecalho: 'Etapa',
      largura: '130px',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (v) => <span className="text-[12.5px] text-ink-3">{v.etapa || '—'}</span>,
    },
    {
      chave: 'valor',
      cabecalho: 'Valor',
      largura: '140px',
      alinhamento: 'direita',
      celula: (v) => <span className="num font-medium text-ink">{moeda(Number(v.valor_total))}</span>,
    },
  ]

  const ind = indicadores.data
  const variacao =
    ind && Number(ind.valor_anterior) > 0
      ? ((Number(ind.valor) - Number(ind.valor_anterior)) / Number(ind.valor_anterior)) * 100
      : null

  const maiorMes = Math.max(1, ...(evolucao.data ?? []).map((e) => Number(e.valor)))
  const conectada = integracao.data?.status === 'conectada'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-ink-3">
          {ind ? `Período: ${fmtData(ind.de)} a ${fmtData(ind.ate)}` : 'Carregando período…'}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {progresso && <span className="num text-[12.5px] text-cyan">{progresso}</span>}
          {podeSincronizar && (
            <Botao
              variante="neutro"
              iconeInicio={<RefreshCw />}
              disabled={!conectada}
              carregando={sincronizar.isPending}
              onClick={() => sincronizar.mutate()}
            >
              Sincronizar vendas (Omie)
            </Botao>
          )}
          {podeCriar && (
            <Botao variante="primario" iconeInicio={<Plus />} onClick={() => setCriando(true)}>Registrar venda</Botao>
          )}
        </div>
      </div>

      <GradeMetricas>
        <Metrica
          rotulo="Vendas no mês"
          tom="cyan"
          valor={ind ? numeroBR(ind.quantidade, 0) : '—'}
          glosa="pedidos registrados no período"
          carregando={indicadores.isLoading}
        />
        <Metrica
          rotulo="Faturamento no mês"
          tom="ok"
          valor={ind ? moeda(Number(ind.valor)) : '—'}
          glosa="soma dos pedidos do período"
          carregando={indicadores.isLoading}
        />
        <Metrica
          rotulo="Ticket médio"
          tom="accent"
          valor={ind ? moeda(Number(ind.ticket_medio)) : '—'}
          glosa="quanto rende cada pedido"
          carregando={indicadores.isLoading}
        />
        <Metrica
          rotulo="Contra o período anterior"
          tom={variacao === null ? 'neutro' : variacao >= 0 ? 'ok' : 'critico'}
          valor={variacao === null ? 'Sem base' : `${variacao >= 0 ? '+' : ''}${numeroBR(variacao, 1)}%`}
          glosa={variacao === null ? 'não houve vendas no período anterior' : 'mesma quantidade de dias, período anterior'}
          alerta={variacao !== null && variacao < 0}
          carregando={indicadores.isLoading}
        />
      </GradeMetricas>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <Painel semPadding>
          <CabecalhoPainel titulo="Evolução mensal" descricao="Últimos 12 meses, somando as vendas registradas." />
          <div className="p-5">
            {evolucao.isLoading ? (
              <EstadoCarregando />
            ) : evolucao.isError ? (
              <EstadoErro descricao={mensagemErro(evolucao.error)} aoTentarNovamente={() => void evolucao.refetch()} />
            ) : (evolucao.data?.length ?? 0) === 0 ? (
              <EstadoVazio
                compacto
                titulo="Sem vendas no período"
                descricao="O gráfico aparece assim que existir a primeira venda registrada ou sincronizada."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {(evolucao.data ?? []).map((m) => (
                  <li key={m.mes} className="flex items-center gap-3">
                    <span className="num w-20 shrink-0 text-[12px] text-ink-3">
                      {new Date(`${m.mes}T00:00:00`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })}
                    </span>
                    <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-cyan"
                        style={{ width: `${Math.max(2, (Number(m.valor) / maiorMes) * 100)}%` }}
                      />
                    </div>
                    <span className="num w-28 shrink-0 text-right text-[12.5px] text-ink">{moeda(Number(m.valor))}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Painel>

        <Painel semPadding>
          <CabecalhoPainel titulo="Peças mais vendidas" descricao="Somatório do ano corrente, por valor." />
          <div className="p-5">
            {maisVendidos.isLoading ? (
              <EstadoCarregando />
            ) : maisVendidos.isError ? (
              <EstadoErro descricao={mensagemErro(maisVendidos.error)} aoTentarNovamente={() => void maisVendidos.refetch()} />
            ) : (maisVendidos.data?.length ?? 0) === 0 ? (
              <EstadoVazio
                compacto
                titulo="Nenhum item vendido"
                descricao="A lista é montada a partir dos itens das vendas — nenhum número é estimado."
              />
            ) : (
              <ol className="flex flex-col gap-1.5">
                {(maisVendidos.data ?? []).map((p, i) => (
                  <li key={`${p.produto_id ?? p.descricao}-${i}`} className="flex items-baseline gap-3 rounded border border-line px-3 py-2">
                    <span className="num w-5 shrink-0 text-[12px] text-ink-3">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{p.descricao}</span>
                    <span className="num shrink-0 text-[12.5px] text-ink-2">{numeroBR(Number(p.quantidade), 0)}</span>
                    <span className="num w-28 shrink-0 text-right text-[12.5px] font-medium text-ink">{moeda(Number(p.valor))}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Painel>
      </div>

      <div className="flex flex-col">
        <BarraFiltros
          busca={ctrl.busca}
          aoBuscar={ctrl.setBusca}
          placeholder="Buscar pelo número da venda"
          aoAtualizar={lista.recarregar}
          atualizando={lista.buscando}
        />
        <Tabela
          className="rounded-none"
          colunas={colunas}
          linhas={lista.linhas}
          chaveDe={(v) => v.id}
          estado={lista.estado}
          mensagemVazio={{
            titulo: ctrl.busca ? 'Nenhum resultado' : 'Nenhuma venda registrada',
            descricao: ctrl.busca
              ? 'Ajuste a busca.'
              : 'Registre uma venda no próprio sistema ou sincronize os pedidos da Omie.',
          }}
          mensagemErro={{ descricao: mensagemErro(lista.erro), aoTentarNovamente: lista.recarregar }}
        />
        {lista.estado === 'ok' && (
          <Paginacao
            className="rounded-t-none border-t-0"
            pagina={ctrl.pagina}
            porPagina={ctrl.porPagina}
            total={lista.total}
            aoMudarPagina={ctrl.setPagina}
          />
        )}
      </div>

      <PainelLateral
        aberto={criando}
        aoFechar={() => setCriando(false)}
        largura="xl"
        titulo="Registrar venda"
        descricao="Os itens vinculados a um produto podem baixar o estoque na hora."
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setCriando(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={registrar.isPending} onClick={() => registrar.mutate()}>
              Registrar venda
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          {erro && <Aviso tom="critico">{erro}</Aviso>}

          <Grade>
            <Campo className="sm:col-span-4" rotulo="Número" obrigatorio>
              {(p) => <Entrada {...p} mono value={venda.numero} onChange={(e) => setVenda({ ...venda, numero: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="Data" obrigatorio>
              {(p) => (
                <Entrada {...p} mono type="date" value={venda.data_venda} onChange={(e) => setVenda({ ...venda, data_venda: e.target.value })} />
              )}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="Total calculado">
              {() => (
                <div className="num flex h-10 items-center rounded-lg border border-line bg-surface-2 px-3 text-[13px] font-semibold text-ink">
                  {moeda(totalVenda)}
                </div>
              )}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Cliente">
              {(p) => (
                <SeletorRef
                  {...p}
                  config={REF_CLIENTE}
                  valor={venda.cliente_id}
                  aoSelecionar={(o) => setVenda({ ...venda, cliente_id: o?.id ?? null })}
                  placeholder="Opcional — busca na mesma base de Clientes"
                />
              )}
            </Campo>
          </Grade>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="lbl">Itens</h3>
              <Botao tamanho="sm" variante="neutro" iconeInicio={<Plus />} onClick={() => setItens([...itens, { ...ITEM_VAZIO }])}>
                Adicionar item
              </Botao>
            </div>

            {itens.map((it, idx) => (
              <div key={idx} className="flex flex-col gap-3 rounded-lg border border-line p-4">
                <Grade>
                  <Campo className="sm:col-span-12" rotulo="Produto">
                    {(p) => (
                      <SeletorRef
                        {...p}
                        config={REF_PRODUTO}
                        valor={it.produto_id}
                        aoSelecionar={(o) => {
                          const novos = [...itens]
                          novos[idx] = {
                            ...it,
                            produto_id: o?.id ?? null,
                            descricao: o?.rotulo ?? it.descricao,
                          }
                          setItens(novos)
                        }}
                        placeholder="Buscar no catálogo (opcional)"
                      />
                    )}
                  </Campo>
                  <Campo className="sm:col-span-12" rotulo="Descrição" obrigatorio>
                    {(p) => (
                      <Entrada
                        {...p}
                        value={it.descricao}
                        onChange={(e) => {
                          const novos = [...itens]
                          novos[idx] = { ...it, descricao: e.target.value }
                          setItens(novos)
                        }}
                      />
                    )}
                  </Campo>
                  <Campo className="sm:col-span-4" rotulo="Quantidade" obrigatorio>
                    {(p) => (
                      <Entrada
                        {...p}
                        mono
                        inputMode="decimal"
                        value={it.quantidade}
                        onChange={(e) => {
                          const novos = [...itens]
                          novos[idx] = { ...it, quantidade: e.target.value }
                          setItens(novos)
                        }}
                      />
                    )}
                  </Campo>
                  <Campo className="sm:col-span-4" rotulo="Valor unitário">
                    {(p) => (
                      <Entrada
                        {...p}
                        mono
                        inputMode="decimal"
                        value={it.valor_unitario}
                        onChange={(e) => {
                          const novos = [...itens]
                          novos[idx] = { ...it, valor_unitario: e.target.value }
                          setItens(novos)
                        }}
                      />
                    )}
                  </Campo>
                  <Campo className="sm:col-span-4" rotulo="Total do item">
                    {() => (
                      <div className="num flex h-10 items-center rounded-lg border border-line bg-surface-2 px-3 text-[13px] text-ink">
                        {moeda((paraNumero(it.quantidade) ?? 0) * (paraNumero(it.valor_unitario) ?? 0))}
                      </div>
                    )}
                  </Campo>
                </Grade>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-[12.5px] text-ink-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--c-accent)]"
                      checked={it.baixar_estoque}
                      disabled={!it.produto_id}
                      onChange={(e) => {
                        const novos = [...itens]
                        novos[idx] = { ...it, baixar_estoque: e.target.checked }
                        setItens(novos)
                      }}
                    />
                    Baixar do estoque ao registrar
                    {!it.produto_id && <span className="text-ink-3">— só para itens do catálogo</span>}
                  </label>
                  {itens.length > 1 && (
                    <BotaoIcone
                      rotulo="Remover item"
                      variante="fantasma"
                      onClick={() => setItens(itens.filter((_, i) => i !== idx))}
                    >
                      <Trash2 />
                    </BotaoIcone>
                  )}
                </div>
              </div>
            ))}
          </section>

          <Campo rotulo="Observações">
            {(p) => (
              <AreaTexto {...p} rows={3} value={venda.observacoes} onChange={(e) => setVenda({ ...venda, observacoes: e.target.value })} />
            )}
          </Campo>
        </div>
      </PainelLateral>
    </div>
  )
}
