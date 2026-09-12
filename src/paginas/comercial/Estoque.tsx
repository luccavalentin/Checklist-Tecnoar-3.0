import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { dataHora, mensagemErro } from '@/lib/utils'
import { moeda, numeroBR, paraNumero } from '@/lib/formatos'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { sincronizarOmie } from '@/dados/omie'
import { CabecalhoPagina, Painel } from '@/componentes/ui/Painel'
import { BarraFiltros } from '@/componentes/ui/BarraFiltros'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade } from '@/componentes/ui/Secao'
import { Paginacao, Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { Selo, type TomSelo } from '@/componentes/ui/Selo'
import { GradeMetricas, Metrica } from '@/componentes/ui/Metrica'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import type {
  EstadoIntegracao,
  IndicadoresEstoque,
  ItemEstoque,
  MovimentoListado,
  SituacaoEstoque,
  TipoMovimentoEstoque,
} from '@/tipos/db'

const SELO_ESTOQUE: Record<SituacaoEstoque, { rotulo: string; tom: TomSelo }> = {
  sem_saldo: { rotulo: 'Sem saldo', tom: 'critico' },
  critico: { rotulo: 'Crítico', tom: 'atencao' },
  baixo: { rotulo: 'Baixo', tom: 'destaque' },
  ok: { rotulo: 'Normal', tom: 'ok' },
}

const TIPOS_MOVIMENTO: Array<{ valor: TipoMovimentoEstoque; rotulo: string; ajuda: string }> = [
  { valor: 'entrada', rotulo: 'Entrada', ajuda: 'Soma ao saldo (compra, devolução, produção).' },
  { valor: 'saida', rotulo: 'Saída', ajuda: 'Subtrai do saldo (consumo, perda, venda avulsa).' },
  { valor: 'ajuste', rotulo: 'Ajuste de inventário', ajuda: 'Define o saldo exato contado na prateleira.' },
  { valor: 'reserva', rotulo: 'Reservar', ajuda: 'Separa parte do saldo sem retirá-lo.' },
  { valor: 'liberacao', rotulo: 'Liberar reserva', ajuda: 'Devolve o que estava reservado ao disponível.' },
]

/**
 * Controle de estoque.
 *
 * A tela era "Estoque e Vendas" com duas abas. Prateleira e receita não têm o
 * mesmo dono nem a mesma pergunta: o painel de Vendas foi para o Financeiro e
 * aqui sobrou só o que o almoxarifado precisa ver.
 */
export function Estoque() {
  const { pode } = usePermissoes()
  if (!pode('estoque_vendas', 'visualizar')) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Comercial" titulo="Estoque" />
        <EstadoSemPermissao />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina sobretitulo="Comercial" titulo="Estoque" />
      <PainelEstoque />
    </div>
  )
}

function PainelEstoque() {
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const ctrl = useControleListagem(25)
  const [fSituacao, setFSituacao] = useState<'' | SituacaoEstoque>('')
  const [movimentando, setMovimentando] = useState<ItemEstoque | null>(null)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const podeEditar = pode('estoque_vendas', 'editar')
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
    queryKey: ['estoque-indicadores'],
    queryFn: async (): Promise<IndicadoresEstoque | null> => {
      const { data, error } = await supabase.rpc('indicadores_estoque')
      if (error) throw error
      return (data ?? [])[0] ?? null
    },
  })

  const filtrar = useMemo(
    () => (q: Consulta) => {
      const t = termoBusca(ctrl.busca)
      let r = q.eq('situacao', 'ativo')
      if (t.length >= 2) r = r.or(`codigo.ilike.%${t}%,descricao.ilike.%${t}%`)
      if (fSituacao) r = r.eq('situacao_estoque', fSituacao)
      return r
    },
    [ctrl.busca, fSituacao],
  )

  const lista = useListagem<ItemEstoque>({
    chave: ['estoque', 'lista', ctrl.busca, fSituacao, ctrl.pagina, ctrl.porPagina],
    tabela: 'vw_estoque',
    select: '*',
    filtrar,
    ordenacao: { coluna: 'descricao', ascendente: true },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
  })

  const sincronizar = useMutation({
    mutationFn: () =>
      sincronizarOmie(['produtos', 'estoque'], (p) =>
        setProgresso(`${p.tipo === 'produtos' ? 'Produtos' : 'Estoque'} — página ${p.pagina}${p.total ? ` de ${p.total}` : ''}`),
      ),
    onSettled: () => setProgresso(null),
    onSuccess: (resumo) => {
      const comErro = resumo.filter((r) => r.erro)
      if (comErro.length) {
        toast.erro('Sincronização interrompida', comErro.map((r) => `${r.tipo}: ${r.erro}`).join(' · '))
      } else {
        const n = resumo.reduce((s, r) => s + r.novos, 0)
        const a = resumo.reduce((s, r) => s + r.atualizados, 0)
        toast.ok('Sincronização concluída', `${n} novo(s), ${a} atualizado(s).`)
      }
      void qc.invalidateQueries({ queryKey: ['estoque'] })
      void qc.invalidateQueries({ queryKey: ['estoque-indicadores'] })
      void qc.invalidateQueries({ queryKey: ['integracao'] })
    },
    onError: (e) => toast.erro('Falha na sincronização', mensagemErro(e)),
  })

  /* -------------------------------------------------------- movimentação */
  const [mov, setMov] = useState({ tipo: 'entrada' as TipoMovimentoEstoque, quantidade: '', motivo: '' })

  const historico = useQuery({
    queryKey: ['estoque-movimentos', movimentando?.id],
    enabled: movimentando !== null,
    queryFn: async (): Promise<MovimentoListado[]> => {
      const { data, error } = await supabase
        .from('estoque_movimentos')
        .select('*, usuario:usuarios ( id, nome_completo )')
        .eq('produto_id', movimentando!.id)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as unknown as MovimentoListado[]
    },
  })

  const movimentar = useMutation({
    mutationFn: async () => {
      setErro(null)
      const q = paraNumero(mov.quantidade)
      if (q === null || q <= 0) throw new Error('Informe uma quantidade maior que zero.')
      const { error } = await supabase.rpc('movimentar_estoque', {
        p_produto: movimentando!.id,
        p_tipo: mov.tipo,
        p_quantidade: q,
        p_motivo: mov.motivo.trim() || null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Estoque movimentado')
      setMov({ tipo: 'entrada', quantidade: '', motivo: '' })
      void qc.invalidateQueries({ queryKey: ['estoque'] })
      void qc.invalidateQueries({ queryKey: ['estoque-indicadores'] })
      void qc.invalidateQueries({ queryKey: ['estoque-movimentos'] })
      setMovimentando(null)
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const colunas: Array<Coluna<ItemEstoque>> = [
    {
      chave: 'codigo',
      cabecalho: 'Código',
      largura: '130px',
      celula: (p) => <span className="num text-ink">{p.codigo}</span>,
    },
    {
      chave: 'produto',
      cabecalho: 'Produto',
      celula: (p) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-ink">{p.descricao}</span>
          {p.localizacao && <span className="truncate text-[12px] text-ink-3">{p.localizacao}</span>}
        </div>
      ),
    },
    {
      chave: 'unidade',
      cabecalho: 'Un.',
      largura: '70px',
      classeResponsiva: 'hidden sm:table-cell',
      celula: (p) => <span className="num text-[12.5px] text-ink-2">{p.unidade}</span>,
    },
    {
      chave: 'saldo',
      cabecalho: 'Saldo',
      largura: '90px',
      alinhamento: 'direita',
      celula: (p) => <span className="num text-ink">{numeroBR(Number(p.saldo), 0)}</span>,
    },
    {
      chave: 'reservado',
      cabecalho: 'Reservado',
      largura: '100px',
      alinhamento: 'direita',
      classeResponsiva: 'hidden md:table-cell',
      celula: (p) => <span className="num text-ink-2">{numeroBR(Number(p.reservado), 0)}</span>,
    },
    {
      chave: 'disponivel',
      cabecalho: 'Disponível',
      largura: '100px',
      alinhamento: 'direita',
      celula: (p) => <span className="num font-semibold text-ink">{numeroBR(Number(p.disponivel), 0)}</span>,
    },
    {
      chave: 'minimo',
      cabecalho: 'Mínimo',
      largura: '90px',
      alinhamento: 'direita',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (p) => <span className="num text-ink-3">{numeroBR(Number(p.estoque_minimo), 0)}</span>,
    },
    {
      chave: 'situacao',
      cabecalho: 'Situação',
      largura: '120px',
      celula: (p) => <Selo tom={SELO_ESTOQUE[p.situacao_estoque].tom} ponto>{SELO_ESTOQUE[p.situacao_estoque].rotulo}</Selo>,
    },
    {
      chave: 'acoes',
      cabecalho: '',
      largura: '156px',
      alinhamento: 'direita',
      celula: (p) =>
        podeEditar ? (
          <Botao
            tamanho="sm"
            variante="fantasma"
            className="whitespace-nowrap"
            iconeInicio={<ArrowLeftRight />}
            onClick={(e) => { e.stopPropagation(); setMov({ tipo: 'entrada', quantidade: '', motivo: '' }); setMovimentando(p) }}
          >
            Movimentar
          </Botao>
        ) : null,
    },
  ]

  const chips = [
    fSituacao && { id: 's', rotulo: `Situação: ${SELO_ESTOQUE[fSituacao].rotulo}`, aoRemover: () => setFSituacao('') },
  ].filter(Boolean) as Array<{ id: string; rotulo: string; aoRemover: () => void }>

  const ind = indicadores.data
  const conectada = integracao.data?.status === 'conectada'

  return (
    <div className="flex flex-col gap-5">
      <GradeMetricas>
        <Metrica
          rotulo="Itens em estoque"
          tom="cyan"
          valor={ind ? numeroBR(ind.itens, 0) : '—'}
          glosa="produtos ativos no catálogo"
          carregando={indicadores.isLoading}
        />
        <Metrica
          rotulo="Estoque crítico"
          tom="critico"
          valor={ind ? numeroBR(ind.criticos + ind.sem_saldo, 0) : '—'}
          glosa="abaixo do mínimo ou zerados"
          alerta={(ind?.criticos ?? 0) + (ind?.sem_saldo ?? 0) > 0}
          carregando={indicadores.isLoading}
        />
        <Metrica
          rotulo="Itens com reserva"
          tom="accent"
          valor={ind ? numeroBR(ind.reservados, 0) : '—'}
          glosa="saldo separado, ainda na prateleira"
          carregando={indicadores.isLoading}
        />
        <Metrica
          rotulo="Valor a custo"
          tom="ok"
          valor={ind ? moeda(Number(ind.valor_custo)) : '—'}
          glosa={ind && Number(ind.valor_custo) === 0 ? 'sem preço de custo cadastrado' : 'parado na prateleira'}
          carregando={indicadores.isLoading}
        />
      </GradeMetricas>

      {ind && ind.valor_custo === 0 && ind.itens > 0 && (
        <Aviso tom="info" titulo="Valor a custo em zero">
          Nenhum produto tem preço de custo preenchido. Informe o custo em Cadastros › Produtos para que este
          indicador tenha significado.
        </Aviso>
      )}

      {podeSincronizar && (
        <Painel>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-display text-[13px] font-semibold text-ink">Integração Omie</span>
              <span className="text-[12.5px] text-ink-3">
                {integracao.isLoading
                  ? 'Verificando…'
                  : conectada
                    ? 'Conectada. É possível trazer produtos e a posição de estoque.'
                    : 'Não conectada — o estoque funciona normalmente com a base do próprio sistema.'}
              </span>
            </div>
            {progresso && <span className="num text-[12.5px] text-cyan">{progresso}</span>}
            <Botao
              variante="secundario"
              iconeInicio={<RefreshCw />}
              disabled={!conectada}
              carregando={sincronizar.isPending}
              onClick={() => sincronizar.mutate()}
            >
              {/* O rótulo inteiro não cabe numa tela de 320px. */}
              <span className="sm:hidden">Sincronizar</span>
              <span className="hidden sm:inline">Sincronizar produtos e estoque</span>
            </Botao>
          </div>
        </Painel>
      )}

      <div className="flex flex-col">
        <BarraFiltros
          busca={ctrl.busca}
          aoBuscar={ctrl.setBusca}
          placeholder="Buscar por código ou descrição"
          chips={chips}
          aoLimpar={chips.length ? () => { setFSituacao(''); ctrl.reiniciar() } : undefined}
          aoAtualizar={lista.recarregar}
          atualizando={lista.buscando}
          filtros={
            <Campo rotulo="Situação do estoque">
              {(p) => (
                <Selecao {...p} value={fSituacao} onChange={(e) => { setFSituacao(e.target.value as typeof fSituacao); ctrl.reiniciar() }}>
                  <option value="">Todas</option>
                  <option value="sem_saldo">Sem saldo</option>
                  <option value="critico">Crítico</option>
                  <option value="baixo">Baixo</option>
                  <option value="ok">Normal</option>
                </Selecao>
              )}
            </Campo>
          }
        />

        <Tabela
          className="rounded-none"
          colunas={colunas}
          linhas={lista.linhas}
          chaveDe={(p) => p.id}
          estado={lista.estado}
          mensagemVazio={{
            titulo: ctrl.busca || chips.length ? 'Nenhum resultado' : 'Nenhum produto ativo',
            descricao:
              ctrl.busca || chips.length
                ? 'Ajuste a busca ou os filtros.'
                : 'O estoque usa a mesma base de Cadastros › Produtos. Cadastre o primeiro produto por lá.',
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
        aberto={movimentando !== null}
        aoFechar={() => setMovimentando(null)}
        largura="lg"
        titulo="Movimentar estoque"
        descricao={movimentando ? `${movimentando.codigo} · ${movimentando.descricao}` : undefined}
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setMovimentando(null)}>Fechar</Botao>
            <Botao variante="primario" carregando={movimentar.isPending} onClick={() => movimentar.mutate()}>
              Confirmar movimento
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          {erro && <Aviso tom="critico">{erro}</Aviso>}

          {movimentando && (
            <div className="grid grid-cols-1 gap-3 xs:grid-cols-3 sm:grid-cols-3">
              {[
                { r: 'Saldo', v: movimentando.saldo },
                { r: 'Reservado', v: movimentando.reservado },
                { r: 'Disponível', v: movimentando.disponivel },
              ].map((k) => (
                <div key={k.r} className="flex flex-col gap-1 rounded-lg border border-line bg-surface-2 p-3">
                  <span className="lbl">{k.r}</span>
                  <span className="num text-lg leading-none text-ink">{numeroBR(Number(k.v), 0)}</span>
                </div>
              ))}
            </div>
          )}

          <Grade>
            <Campo className="sm:col-span-6" rotulo="Tipo de movimento" obrigatorio>
              {(p) => (
                <Selecao {...p} value={mov.tipo} onChange={(e) => setMov({ ...mov, tipo: e.target.value as TipoMovimentoEstoque })}>
                  {TIPOS_MOVIMENTO.map((t) => (
                    <option key={t.valor} value={t.valor}>{t.rotulo}</option>
                  ))}
                </Selecao>
              )}
            </Campo>
            <Campo
              className="sm:col-span-6"
              rotulo={mov.tipo === 'ajuste' ? 'Saldo contado' : 'Quantidade'}
              obrigatorio
              dica={TIPOS_MOVIMENTO.find((t) => t.valor === mov.tipo)?.ajuda}
            >
              {(p) => (
                <Entrada {...p} mono inputMode="decimal" value={mov.quantidade} onChange={(e) => setMov({ ...mov, quantidade: e.target.value })} />
              )}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Motivo">
              {(p) => (
                <Entrada
                  {...p}
                  value={mov.motivo}
                  onChange={(e) => setMov({ ...mov, motivo: e.target.value })}
                  placeholder="Ex.: Nota fiscal 1234 · Inventário mensal"
                />
              )}
            </Campo>
          </Grade>

          <section className="flex flex-col gap-3">
            <h3 className="lbl">Últimos movimentos</h3>
            {historico.isLoading ? (
              <EstadoCarregando />
            ) : historico.isError ? (
              <EstadoErro descricao={mensagemErro(historico.error)} aoTentarNovamente={() => void historico.refetch()} />
            ) : (historico.data?.length ?? 0) === 0 ? (
              <EstadoVazio compacto titulo="Nenhum movimento registrado" descricao="Todo movimento feito por aqui fica registrado com autor, data e saldo resultante." />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {(historico.data ?? []).map((m) => (
                  <li key={m.id} className="flex flex-wrap items-baseline gap-3 rounded border border-line px-3 py-2 text-[12.5px]">
                    <Selo tom={m.tipo === 'entrada' ? 'ok' : m.tipo === 'saida' ? 'atencao' : 'neutro'}>
                      {TIPOS_MOVIMENTO.find((t) => t.valor === m.tipo)?.rotulo ?? m.tipo}
                    </Selo>
                    <span className="num text-ink">{numeroBR(Number(m.quantidade), 0)}</span>
                    <span className="num text-ink-3">
                      {numeroBR(Number(m.saldo_anterior), 0)} → {numeroBR(Number(m.saldo_posterior), 0)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-ink-2">{m.motivo || '—'}</span>
                    <span className="num shrink-0 text-[11.5px] text-ink-3">{dataHora(m.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </PainelLateral>
    </div>
  )
}

