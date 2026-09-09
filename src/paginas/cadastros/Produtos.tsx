import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  AlertTriangle,
  Ban,
  Cloud,
  CloudOff,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Shield,
  TriangleAlert,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro } from '@/lib/utils'
import { moeda, numeroBR, paraNumero } from '@/lib/formatos'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { BarraFiltros } from '@/componentes/ui/BarraFiltros'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade, Secao } from '@/componentes/ui/Secao'
import { Paginacao, Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { Confirmacao, PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { REF_FORNECEDOR, SeletorRef } from '@/componentes/ui/SeletorRef'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import type { ProdutoListado, SituacaoRegistro } from '@/tipos/db'

/**
 * Cadastro de produtos.
 *
 * O vocabulário desta tela é o da Omie de propósito. Quem confere uma peça
 * aqui e no ERP não deveria precisar traduzir nome de campo — e a tradução
 * errada é justamente onde nasce o "custo" que na verdade era preço de venda.
 * Cada campo que existe na Omie mostra o nome de lá como dica.
 *
 * Os dois números de dinheiro são conceitos diferentes e não se confundem:
 *
 * - **Preço unitário** (`valor_unitario` na Omie) é o preço de VENDA.
 * - **Custo médio** (`nCMC`) é contábil, vem da posição de estoque da Omie e
 *   por isso é somente leitura aqui: sobrescrever seria inventar contabilidade.
 * - **Custo de aquisição** não existe na Omie. É o que a oficina pagou, usado
 *   para margem quando ainda não há custo médio.
 */

const UNIDADES = ['UN', 'PC', 'CJ', 'KIT', 'JG', 'MT', 'KG', 'LT', 'CX', 'PAR']

interface FormProduto {
  codigo: string
  descricao: string
  descricao_detalhada: string
  referencia: string
  ean: string
  marca: string
  modelo: string
  familia: string
  unidade: string
  ncm: string
  preco_venda: string
  preco_custo: string
  estoque_minimo: string
  saldo: string
  peso_liquido: string
  peso_bruto: string
  fornecedor_id: string
  localizacao: string
  observacoes: string
  observacoes_internas: string
  situacao: SituacaoRegistro
}

const VAZIO: FormProduto = {
  codigo: '',
  descricao: '',
  descricao_detalhada: '',
  referencia: '',
  ean: '',
  marca: '',
  modelo: '',
  familia: '',
  unidade: 'UN',
  ncm: '',
  preco_venda: '',
  preco_custo: '',
  estoque_minimo: '',
  saldo: '',
  peso_liquido: '',
  peso_bruto: '',
  fornecedor_id: '',
  localizacao: '',
  observacoes: '',
  observacoes_internas: '',
  situacao: 'ativo',
}

const SELECT_LISTA =
  'id, codigo, descricao, referencia, ean, marca, familia, unidade, ncm, ' +
  'preco_venda, preco_custo, custo_medio, estoque_minimo, saldo, reservado, ' +
  'situacao, origem, omie_id, omie_erro, fornecedor_id, fornecedor:fornecedores ( id, descricao )'

/** Vírgula na tela, ponto no banco. */
const paraCampo = (v: number | null | undefined) =>
  v === null || v === undefined ? '' : String(v).replace('.', ',')

export function Produtos() {
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const ctrl = useControleListagem(25)
  const [fSituacao, setFSituacao] = useState<'todas' | SituacaoRegistro>('ativo')
  const [fFornecedor, setFFornecedor] = useState<string | null>(null)
  const [fEstoque, setFEstoque] = useState<'' | 'sem' | 'critico'>('')
  const [fOmie, setFOmie] = useState<'' | 'nao_enviados' | 'com_erro'>('')
  const [editando, setEditando] = useState<ProdutoListado | null>(null)
  const [criando, setCriando] = useState(false)
  const [alvo, setAlvo] = useState<ProdutoListado | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const podeVer = pode('produtos', 'visualizar')
  const podeCriar = pode('produtos', 'criar')
  const podeEditar = pode('produtos', 'editar')
  const podeInativar = pode('produtos', 'inativar')
  const podeCusto = pode('produtos', 'editar') || pode('estoque_vendas', 'visualizar')

  /**
   * Cada número é uma contagem real do banco, nenhuma estimativa.
   * "Abaixo do mínimo" compara duas colunas, o que o PostgREST não faz por
   * filtro — por isso vem de `vw_estoque`, que já resolve a comparação.
   */
  const stats = useQuery({
    queryKey: ['produtos', 'stats'],
    enabled: podeVer,
    queryFn: async () => {
      const [total, ativos, semSaldo, criticos, pendentesOmie] = await Promise.all([
        supabase.from('produtos').select('*', { count: 'exact', head: true }),
        supabase.from('produtos').select('*', { count: 'exact', head: true }).eq('situacao', 'ativo'),
        supabase.from('vw_estoque').select('*', { count: 'exact', head: true }).eq('situacao_estoque', 'sem_saldo').eq('situacao', 'ativo'),
        supabase.from('vw_estoque').select('*', { count: 'exact', head: true }).eq('situacao_estoque', 'critico').eq('situacao', 'ativo'),
        supabase.from('produtos').select('*', { count: 'exact', head: true }).is('omie_id', null).eq('situacao', 'ativo'),
      ])
      const primeiroErro = [total, ativos, semSaldo, criticos, pendentesOmie].find((r) => r.error)
      if (primeiroErro?.error) throw primeiroErro.error
      return {
        total: total.count ?? 0,
        ativos: ativos.count ?? 0,
        semSaldo: semSaldo.count ?? 0,
        criticos: criticos.count ?? 0,
        pendentesOmie: pendentesOmie.count ?? 0,
      }
    },
  })

  const filtrar = useMemo(
    () => (q: Consulta) => {
      const t = termoBusca(ctrl.busca)
      let r = q
      if (t.length >= 2) {
        r = r.or(`codigo.ilike.%${t}%,descricao.ilike.%${t}%,referencia.ilike.%${t}%,ean.ilike.%${t}%,marca.ilike.%${t}%`)
      }
      if (fSituacao !== 'todas') r = r.eq('situacao', fSituacao)
      if (fFornecedor) r = r.eq('fornecedor_id', fFornecedor)
      if (fEstoque === 'sem') r = r.lte('saldo', 0)
      if (fEstoque === 'critico') r = r.gt('estoque_minimo', 0)
      if (fOmie === 'nao_enviados') r = r.is('omie_id', null)
      if (fOmie === 'com_erro') r = r.not('omie_erro', 'is', null)
      return r
    },
    [ctrl.busca, fSituacao, fFornecedor, fEstoque, fOmie],
  )

  const lista = useListagem<ProdutoListado>({
    chave: ['produtos', 'lista', ctrl.busca, fSituacao, fFornecedor, fEstoque, fOmie, ctrl.pagina, ctrl.porPagina],
    tabela: 'produtos',
    select: SELECT_LISTA,
    filtrar,
    ordenacao: { coluna: 'descricao', ascendente: true },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
    habilitado: podeVer,
  })

  const form = useForm<FormProduto>({ defaultValues: VAZIO })

  useEffect(() => {
    if (editando) {
      form.reset({
        codigo: editando.codigo,
        descricao: editando.descricao,
        descricao_detalhada: editando.descricao_detalhada ?? '',
        referencia: editando.referencia ?? '',
        ean: editando.ean ?? '',
        marca: editando.marca ?? '',
        modelo: editando.modelo ?? '',
        familia: editando.familia ?? '',
        unidade: editando.unidade,
        ncm: editando.ncm ?? '',
        preco_venda: paraCampo(editando.preco_venda),
        preco_custo: paraCampo(editando.preco_custo),
        estoque_minimo: paraCampo(editando.estoque_minimo),
        saldo: paraCampo(editando.saldo),
        peso_liquido: paraCampo(editando.peso_liquido),
        peso_bruto: paraCampo(editando.peso_bruto),
        fornecedor_id: editando.fornecedor_id ?? '',
        localizacao: editando.localizacao ?? '',
        observacoes: editando.observacoes ?? '',
        observacoes_internas: editando.observacoes_internas ?? '',
        situacao: editando.situacao,
      })
    } else if (criando) form.reset(VAZIO)
    setErro(null)
  }, [editando, criando, form])

  /* Produto que veio da Omie tem o saldo mandado por lá. Deixar o campo
     editável convidaria a divergência que a próxima sincronização apagaria. */
  const saldoVemDaOmie = Boolean(editando?.omie_id)

  const salvar = useMutation({
    mutationFn: async (d: FormProduto) => {
      const codigo = d.codigo.trim()
      if (!codigo) throw new Error('Informe o código do produto.')
      if (d.descricao.trim().length < 2) throw new Error('Informe a descrição.')

      const texto = (v: string) => v.trim() || null
      const payload = {
        codigo,
        descricao: d.descricao.trim(),
        descricao_detalhada: texto(d.descricao_detalhada),
        referencia: texto(d.referencia),
        ean: texto(d.ean),
        marca: texto(d.marca),
        modelo: texto(d.modelo),
        familia: texto(d.familia),
        unidade: d.unidade || 'UN',
        ncm: texto(d.ncm),
        preco_venda: paraNumero(d.preco_venda) ?? 0,
        preco_custo: paraNumero(d.preco_custo),
        estoque_minimo: paraNumero(d.estoque_minimo) ?? 0,
        peso_liquido: paraNumero(d.peso_liquido),
        peso_bruto: paraNumero(d.peso_bruto),
        fornecedor_id: d.fornecedor_id || null,
        localizacao: texto(d.localizacao),
        observacoes: texto(d.observacoes),
        observacoes_internas: texto(d.observacoes_internas),
        situacao: d.situacao,
        ...(saldoVemDaOmie ? {} : { saldo: paraNumero(d.saldo) ?? 0 }),
      }
      const r = editando
        ? await supabase.from('produtos').update(payload).eq('id', editando.id)
        : await supabase.from('produtos').insert(payload)
      if (r.error) throw r.error
    },
    onSuccess: () => {
      toast.ok(editando ? 'Produto atualizado' : 'Produto cadastrado')
      setEditando(null)
      setCriando(false)
      void qc.invalidateQueries({ queryKey: ['produtos'] })
      void qc.invalidateQueries({ queryKey: ['omie-pendentes'] })
    },
    onError: (e) => {
      const m = mensagemErro(e)
      setErro(m.includes('duplicate key') ? 'Já existe um produto com este código.' : m)
    },
  })

  const mudarSituacao = useMutation({
    mutationFn: async (p: ProdutoListado) => {
      const nova: SituacaoRegistro = p.situacao === 'ativo' ? 'inativo' : 'ativo'
      const { error } = await supabase.from('produtos').update({ situacao: nova }).eq('id', p.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Situação alterada')
      setAlvo(null)
      void qc.invalidateQueries({ queryKey: ['produtos'] })
    },
    onError: (e) => toast.erro('Não foi possível alterar', mensagemErro(e)),
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoProdutos total={null} />
        <EstadoSemPermissao />
      </div>
    )
  }

  const chips = [
    fSituacao !== 'ativo' && {
      id: 's',
      rotulo: `Situação: ${fSituacao === 'todas' ? 'Todas' : 'Inativos'}`,
      aoRemover: () => setFSituacao('ativo'),
    },
    fFornecedor && { id: 'f', rotulo: 'Fornecedor filtrado', aoRemover: () => setFFornecedor(null) },
    fEstoque === 'sem' && { id: 'e', rotulo: 'Sem saldo', aoRemover: () => setFEstoque('') },
    fEstoque === 'critico' && { id: 'e', rotulo: 'Com estoque mínimo definido', aoRemover: () => setFEstoque('') },
    fOmie === 'nao_enviados' && { id: 'o', rotulo: 'Ainda não estão na Omie', aoRemover: () => setFOmie('') },
    fOmie === 'com_erro' && { id: 'o', rotulo: 'Recusados pela Omie', aoRemover: () => setFOmie('') },
  ].filter(Boolean) as Array<{ id: string; rotulo: string; aoRemover: () => void }>

  const limparTudo = () => {
    setFSituacao('ativo')
    setFFornecedor(null)
    setFEstoque('')
    setFOmie('')
    ctrl.reiniciar()
  }

  const colunas: Array<Coluna<ProdutoListado>> = [
    {
      chave: 'codigo',
      cabecalho: 'Código',
      largura: '108px',
      celula: (p) => <span className="num text-ink-2">{p.codigo}</span>,
    },
    {
      chave: 'descricao',
      cabecalho: 'Descrição',
      celula: (p) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-ink">{p.descricao}</span>
          <span className="num truncate text-[12px] text-ink-3">
            {[p.marca, p.referencia && `Ref. ${p.referencia}`, p.ean].filter(Boolean).join(' · ') || '—'}
          </span>
        </div>
      ),
    },
    {
      chave: 'fornecedor',
      cabecalho: 'Fornecedor',
      largura: '150px',
      classeResponsiva: 'hidden 2xl:table-cell',
      celula: (p) =>
        p.fornecedor ? <span className="truncate">{p.fornecedor.descricao}</span> : <span className="text-ink-3">—</span>,
    },
    {
      chave: 'unidade',
      cabecalho: 'Un.',
      largura: '60px',
      celula: (p) => <span className="num text-ink-3">{p.unidade}</span>,
    },
    {
      chave: 'preco_venda',
      cabecalho: 'Preço unit.',
      largura: '104px',
      alinhamento: 'direita',
      classeResponsiva: 'hidden md:table-cell',
      celula: (p) => (podeCusto ? <span className="num">{moeda(p.preco_venda)}</span> : <span className="text-ink-3">—</span>),
    },
    {
      chave: 'custo_medio',
      cabecalho: 'Custo méd.',
      largura: '108px',
      alinhamento: 'direita',
      classeResponsiva: 'hidden xl:table-cell',
      celula: (p) => {
        const custo = p.custo_medio ?? p.preco_custo
        if (!podeCusto || custo === null || custo === undefined) return <span className="text-ink-3">—</span>
        return (
          <span className={cn('num', p.custo_medio === null && 'text-ink-3')} title={p.custo_medio === null ? 'Custo de aquisição informado na oficina' : 'Custo médio contábil vindo da Omie'}>
            {moeda(custo)}
          </span>
        )
      },
    },
    {
      chave: 'saldo',
      cabecalho: 'Saldo',
      largura: '80px',
      alinhamento: 'direita',
      celula: (p) => (
        <span
          className={cn(
            'num font-semibold',
            p.saldo <= 0 ? 'text-crit' : p.estoque_minimo > 0 && p.saldo <= p.estoque_minimo ? 'text-warn' : 'text-ok',
          )}
        >
          {numeroBR(p.saldo, 0)}
        </span>
      ),
    },
    {
      chave: 'omie',
      cabecalho: 'Omie',
      largura: '72px',
      alinhamento: 'centro',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (p) =>
        p.omie_erro ? (
          <span title={p.omie_erro} className="inline-flex text-crit">
            <TriangleAlert aria-label="Recusado pela Omie" className="size-4" />
          </span>
        ) : p.omie_id ? (
          <span title={`Código Omie ${p.omie_id}`} className="inline-flex text-ok">
            <Cloud aria-label={`Na Omie, código ${p.omie_id}`} className="size-4" />
          </span>
        ) : (
          <span title="Existe só no Tecnoar, ainda não foi enviado" className="inline-flex text-warn">
            <CloudOff aria-label="Fora da Omie" className="size-4" />
          </span>
        ),
    },
    {
      chave: 'situacao',
      cabecalho: 'Sit.',
      largura: '76px',
      celula: (p) => (
        <Selo tom={p.situacao === 'ativo' ? 'ok' : 'neutro'} ponto>
          {p.situacao === 'ativo' ? 'Ativo' : 'Inat.'}
        </Selo>
      ),
    },
    {
      chave: 'acoes',
      cabecalho: '',
      largura: '84px',
      alinhamento: 'direita',
      celula: (p) => (
        <div className="flex justify-end gap-0.5">
          {podeEditar && (
            <BotaoIcone rotulo={`Editar ${p.descricao}`} tamanho="sm" onClick={() => setEditando(p)}>
              <Pencil />
            </BotaoIcone>
          )}
          {podeInativar && (
            <BotaoIcone
              rotulo={`${p.situacao === 'ativo' ? 'Inativar' : 'Reativar'} ${p.descricao}`}
              tamanho="sm"
              onClick={() => setAlvo(p)}
            >
              {p.situacao === 'ativo' ? <Ban /> : <RotateCcw />}
            </BotaoIcone>
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoProdutos
        total={lista.total}
        acao={
          podeCriar ? (
            <Botao variante="primario" iconeInicio={<Plus />} onClick={() => setCriando(true)}>
              Novo produto
            </Botao>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Kpi
          rotulo="Ativos"
          valor={stats.data?.ativos}
          subrotulo={stats.data ? `de ${stats.data.total.toLocaleString('pt-BR')} cadastrados` : undefined}
          cor="var(--c-ok)"
          icone={<Shield className="size-4" />}
          aoClicar={() => { setFSituacao('ativo'); limparTudo() }}
        />
        <Kpi
          rotulo="Sem saldo"
          valor={stats.data?.semSaldo}
          subrotulo="disponível zerado"
          cor="var(--c-crit)"
          icone={<AlertTriangle className="size-4" />}
          aoClicar={() => { setFEstoque('sem'); ctrl.reiniciar() }}
        />
        <Kpi
          rotulo="Abaixo do mínimo"
          valor={stats.data?.criticos}
          subrotulo="repor"
          cor="var(--c-warn)"
          icone={<Package className="size-4" />}
        />
        <Kpi
          rotulo="Fora da Omie"
          valor={stats.data?.pendentesOmie}
          subrotulo="ainda não enviados"
          cor="var(--c-accent)"
          icone={<CloudOff className="size-4" />}
          aoClicar={() => { setFOmie('nao_enviados'); ctrl.reiniciar() }}
        />
      </div>

      <div className="flex flex-col">
        <BarraFiltros
          busca={ctrl.busca}
          aoBuscar={ctrl.setBusca}
          placeholder="Buscar por código, descrição, referência, EAN ou marca"
          chips={chips}
          aoLimpar={chips.length ? limparTudo : undefined}
          aoAtualizar={lista.recarregar}
          atualizando={lista.buscando}
          filtros={
            <>
              <Campo rotulo="Situação">
                {(p) => (
                  <Selecao {...p} value={fSituacao} onChange={(e) => { setFSituacao(e.target.value as typeof fSituacao); ctrl.reiniciar() }}>
                    <option value="ativo">Ativos</option>
                    <option value="inativo">Inativos</option>
                    <option value="todas">Todos</option>
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Fornecedor">
                {(p) => (
                  <SeletorRef
                    {...p}
                    config={REF_FORNECEDOR}
                    valor={fFornecedor}
                    aoSelecionar={(o) => { setFFornecedor(o?.id ?? null); ctrl.reiniciar() }}
                    placeholder="Todos"
                  />
                )}
              </Campo>
              <Campo rotulo="Estoque">
                {(p) => (
                  <Selecao {...p} value={fEstoque} onChange={(e) => { setFEstoque(e.target.value as typeof fEstoque); ctrl.reiniciar() }}>
                    <option value="">Todos</option>
                    <option value="sem">Sem saldo</option>
                    <option value="critico">Com mínimo definido</option>
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Omie">
                {(p) => (
                  <Selecao {...p} value={fOmie} onChange={(e) => { setFOmie(e.target.value as typeof fOmie); ctrl.reiniciar() }}>
                    <option value="">Todos</option>
                    <option value="nao_enviados">Ainda não estão na Omie</option>
                    <option value="com_erro">Recusados pela Omie</option>
                  </Selecao>
                )}
              </Campo>
            </>
          }
        />

        <Tabela
          aoDuploClique={podeEditar ? (linha) => setEditando(linha) : undefined}
          densidade="compacta"
          className="rounded-none"
          colunas={colunas}
          linhas={lista.linhas}
          chaveDe={(p) => p.id}
          estado={lista.estado}
          mensagemVazio={{
            titulo: ctrl.busca || chips.length ? 'Nenhum resultado' : 'Nenhum produto cadastrado',
            descricao:
              ctrl.busca || chips.length
                ? 'Ajuste a busca ou os filtros.'
                : 'Os produtos cadastrados aqui abastecem o estoque, a OS e as garantias.',
            acao:
              podeCriar && !ctrl.busca && !chips.length ? (
                <Botao tamanho="sm" variante="neutro" iconeInicio={<Package />} onClick={() => setCriando(true)}>
                  Cadastrar o primeiro
                </Botao>
              ) : undefined,
          }}
          mensagemErro={{ descricao: mensagemErro(lista.erro), aoTentarNovamente: lista.recarregar }}
        />

        {lista.estado === 'ok' && (
          <Paginacao
            className="rounded-t-none border-t-0 py-2"
            pagina={ctrl.pagina}
            porPagina={ctrl.porPagina}
            total={lista.total}
            aoMudarPagina={ctrl.setPagina}
          />
        )}
      </div>

      <PainelLateral
        aberto={criando || Boolean(editando)}
        aoFechar={() => { setCriando(false); setEditando(null) }}
        largura="xl"
        titulo={editando ? 'Editar produto' : 'Novo produto'}
        descricao="Os nomes dos campos são os mesmos do cadastro de produtos da Omie."
        rodape={
          <>
            <Botao variante="neutro" onClick={() => { setCriando(false); setEditando(null) }}>
              Cancelar
            </Botao>
            <Botao variante="primario" carregando={salvar.isPending} onClick={form.handleSubmit((d) => salvar.mutate(d))}>
              Salvar
            </Botao>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((d) => salvar.mutate(d))}>
          {erro && <Aviso tom="critico">{erro}</Aviso>}

          {editando?.omie_erro && (
            <Aviso tom="critico" titulo="A Omie recusou o último envio">
              {editando.omie_erro}
            </Aviso>
          )}

          {editando?.omie_id && (
            <Aviso tom="info" titulo={`Vinculado à Omie · código ${editando.omie_id}`}>
              Saldo e custo médio são mantidos pela Omie e sobrescritos a cada sincronização.
            </Aviso>
          )}

          <Secao numero="01" titulo="Identificação" descricao="Campos que a Omie usa para reconhecer a peça.">
            <Grade>
              <Campo className="sm:col-span-3" rotulo="Código" obrigatorio dica="Omie: codigo (SKU)">
                {(p) => <Entrada {...p} mono {...form.register('codigo', { required: true })} />}
              </Campo>
              <Campo className="sm:col-span-6" rotulo="Descrição" obrigatorio dica="Omie: descricao">
                {(p) => <Entrada {...p} {...form.register('descricao', { required: true })} />}
              </Campo>
              <Campo className="sm:col-span-3" rotulo="Referência" dica="Uso interno da oficina">
                {(p) => <Entrada {...p} mono {...form.register('referencia')} />}
              </Campo>

              <Campo className="sm:col-span-3" rotulo="EAN" dica="Omie: ean (código de barras)">
                {(p) => <Entrada {...p} mono inputMode="numeric" {...form.register('ean')} />}
              </Campo>
              <Campo className="sm:col-span-3" rotulo="NCM" dica="Omie: ncm — obrigatório para enviar">
                {(p) => <Entrada {...p} mono inputMode="numeric" {...form.register('ncm')} />}
              </Campo>
              <Campo className="sm:col-span-3" rotulo="Marca" dica="Omie: marca">
                {(p) => <Entrada {...p} {...form.register('marca')} />}
              </Campo>
              <Campo className="sm:col-span-3" rotulo="Modelo" dica="Omie: modelo">
                {(p) => <Entrada {...p} {...form.register('modelo')} />}
              </Campo>

              <Campo className="sm:col-span-2" rotulo="Unidade" dica="Omie: unidade">
                {(p) => (
                  <Selecao {...p} {...form.register('unidade')}>
                    {UNIDADES.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </Selecao>
                )}
              </Campo>
              <Campo className="sm:col-span-3" rotulo="Família" dica="Omie: nome_familia">
                {(p) => <Entrada {...p} {...form.register('familia')} />}
              </Campo>
              <Campo className="sm:col-span-5" rotulo="Fornecedor" dica="Cadastro da oficina">
                {(p) => (
                  <SeletorRef
                    {...p}
                    config={REF_FORNECEDOR}
                    valor={form.watch('fornecedor_id') || null}
                    aoSelecionar={(o) => form.setValue('fornecedor_id', o?.id ?? '', { shouldDirty: true })}
                    placeholder="Buscar fornecedor"
                  />
                )}
              </Campo>
              <Campo className="sm:col-span-2" rotulo="Situação" dica="Omie: inativo">
                {(p) => (
                  <Selecao {...p} {...form.register('situacao')}>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </Selecao>
                )}
              </Campo>
            </Grade>
          </Secao>

          <Secao numero="02" titulo="Preço e custo" descricao="Preço unitário é venda. Custo médio é contábil e vem da Omie.">
            <Grade>
              <Campo className="sm:col-span-4" rotulo="Preço unitário" obrigatorio dica="Omie: valor_unitario — preço de venda">
                {(p) => <Entrada {...p} mono {...form.register('preco_venda')} placeholder="0,00" />}
              </Campo>
              <Campo className="sm:col-span-4" rotulo="Custo de aquisição" dica="Não existe na Omie: o que a oficina pagou">
                {(p) => <Entrada {...p} mono {...form.register('preco_custo')} placeholder="0,00" />}
              </Campo>
              <Campo className="sm:col-span-4" rotulo="Custo médio (CMC)" dica="Omie: nCMC — somente leitura">
                {(p) => (
                  <Entrada
                    {...p}
                    mono
                    readOnly
                    value={editando?.custo_medio !== null && editando?.custo_medio !== undefined ? moeda(editando.custo_medio) : '—'}
                    onChange={() => {}}
                  />
                )}
              </Campo>
            </Grade>
          </Secao>

          <Secao numero="03" titulo="Estoque" descricao="Posição de estoque da Omie (ListarPosEstoque).">
            <Grade>
              <Campo className="sm:col-span-3" rotulo="Estoque mínimo" dica="Omie: estoque_minimo">
                {(p) => <Entrada {...p} mono {...form.register('estoque_minimo')} placeholder="0" />}
              </Campo>
              <Campo
                className="sm:col-span-3"
                rotulo="Saldo"
                dica={saldoVemDaOmie ? 'Omie: nSaldo — mantido pelo ERP' : 'Omie: nSaldo'}
              >
                {(p) => (
                  <Entrada
                    {...p}
                    mono
                    readOnly={saldoVemDaOmie}
                    {...form.register('saldo')}
                    placeholder="0"
                  />
                )}
              </Campo>
              <Campo className="sm:col-span-3" rotulo="Reservado" dica="Omie: reservado — somente leitura">
                {(p) => <Entrada {...p} mono readOnly value={numeroBR(editando?.reservado ?? 0)} onChange={() => {}} />}
              </Campo>
              <Campo className="sm:col-span-3" rotulo="Localização física" dica="Uso interno da oficina">
                {(p) => <Entrada {...p} {...form.register('localizacao')} placeholder="Ex.: Prateleira A3" />}
              </Campo>

              <Campo className="sm:col-span-3" rotulo="Peso líquido (kg)" dica="Omie: peso_liq">
                {(p) => <Entrada {...p} mono {...form.register('peso_liquido')} placeholder="0,000" />}
              </Campo>
              <Campo className="sm:col-span-3" rotulo="Peso bruto (kg)" dica="Omie: peso_bruto">
                {(p) => <Entrada {...p} mono {...form.register('peso_bruto')} placeholder="0,000" />}
              </Campo>
            </Grade>
          </Secao>

          <Secao numero="04" titulo="Descrições">
            <Grade>
              <Campo className="sm:col-span-12" rotulo="Descrição detalhada" dica="Omie: descr_detalhada">
                {(p) => <AreaTexto {...p} rows={2} {...form.register('descricao_detalhada')} />}
              </Campo>
              <Campo className="sm:col-span-6" rotulo="Observações internas" dica="Omie: obs_internas">
                {(p) => <AreaTexto {...p} rows={2} {...form.register('observacoes_internas')} />}
              </Campo>
              <Campo className="sm:col-span-6" rotulo="Observações da oficina" dica="Não vai para a Omie">
                {(p) => <AreaTexto {...p} rows={2} {...form.register('observacoes')} />}
              </Campo>
            </Grade>
          </Secao>
        </form>
      </PainelLateral>

      <Confirmacao
        aberto={Boolean(alvo)}
        aoFechar={() => setAlvo(null)}
        aoConfirmar={() => alvo && mudarSituacao.mutate(alvo)}
        carregando={mudarSituacao.isPending}
        destrutivo={alvo?.situacao === 'ativo'}
        titulo={alvo?.situacao === 'ativo' ? 'Inativar produto?' : 'Reativar produto?'}
        rotuloConfirmar={alvo?.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
        descricao={
          <>
            <strong className="font-semibold text-ink">{alvo?.descricao}</strong>{' '}
            {alvo?.situacao === 'ativo'
              ? 'deixa de aparecer na OS e no estoque. O histórico é preservado.'
              : 'volta a ficar disponível.'}
          </>
        }
      />
    </div>
  )
}

function CabecalhoProdutos({ total, acao }: { total: number | null; acao?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-accent" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Cadastros</p>
        </div>
        <h1 className="font-display text-xl font-bold text-ink">Produtos</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {total !== null && (
          <span className="rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12px] text-ink-2">
            {total.toLocaleString('pt-BR')} registros
          </span>
        )}
        {acao}
      </div>
    </div>
  )
}

/**
 * Indicador compacto. Sem número real ainda, mostra travessão — nunca zero,
 * que seria uma afirmação falsa sobre o estoque.
 */
function Kpi({
  rotulo,
  valor,
  subrotulo,
  cor,
  icone,
  aoClicar,
}: {
  rotulo: string
  valor: number | undefined
  subrotulo?: string
  cor: string
  icone: React.ReactNode
  aoClicar?: () => void
}) {
  const conteudo = (
    <>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[9px] font-semibold uppercase tracking-wider text-ink-3">{rotulo}</span>
        <span className="num text-[22px] font-bold tracking-tight text-ink">
          {valor === undefined ? '—' : valor.toLocaleString('pt-BR')}
        </span>
        {subrotulo && <span className="truncate text-[9px] text-ink-3">{subrotulo}</span>}
      </div>
      <div
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line/60"
        style={{ backgroundColor: `${cor}14`, color: cor }}
      >
        {icone}
      </div>
    </>
  )

  const classe =
    'aresta flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-left transition-colors'

  return aoClicar ? (
    <button type="button" onClick={aoClicar} className={cn(classe, 'hover:border-line-strong hover:bg-surface-2')}>
      {conteudo}
    </button>
  ) : (
    <div className={classe}>{conteudo}</div>
  )
}
