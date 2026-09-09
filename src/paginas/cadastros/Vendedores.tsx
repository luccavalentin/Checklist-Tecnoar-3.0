/**
 * Tecnoar — Vendedores Premium
 * World-Class Design: Clean, sofisticado, hierarquia visual refinada
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  Filter,
  Plus,
  Search,
  Store,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro, cn } from '@/lib/utils'
import { mascaraCEP, mascaraDocumento, paraNumero, validarDocumento } from '@/lib/formatos'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { Botao } from '@/componentes/ui/Botao'
import { Alternador, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { CampoCEP } from '@/componentes/ui/CampoCEP'
import { Paginacao } from '@/componentes/ui/Tabela'
import { Confirmacao, PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'
import type { BaseComissao, FormaComissao, MomentoComissao, SituacaoRegistro, TipoPessoa, Usuario, Vendedor } from '@/tipos/db'

/* ═══════════════════════════════════════════════════════════════
   TIPOS
   ═══════════════════════════════════════════════════════════════ */
interface FormVendedor {
  tipo_pessoa: TipoPessoa
  descricao: string
  documento: string
  nascimento: string
  inscricao_estadual: string
  cep: string
  logradouro: string
  numero: string
  bairro: string
  municipio: string
  uf: string
  telefone: string
  email: string
  usuario_id: string
  gerar_comissao: boolean
  momento_comissao: MomentoComissao | ''
  base_comissao: BaseComissao | ''
  forma_comissao: FormaComissao | ''
  percentual_comissao: string
  situacao: SituacaoRegistro
}

const VAZIO: FormVendedor = {
  tipo_pessoa: 'fisica',
  descricao: '',
  documento: '',
  nascimento: '',
  inscricao_estadual: '',
  cep: '',
  logradouro: '',
  numero: '',
  bairro: '',
  municipio: '',
  uf: '',
  telefone: '',
  email: '',
  usuario_id: '',
  gerar_comissao: false,
  momento_comissao: '',
  base_comissao: '',
  forma_comissao: '',
  percentual_comissao: '',
  situacao: 'ativo',
}

/* ═══════════════════════════════════════════════════════════════
   KPI CARD — Premium Design Compacto Clicável
   ═══════════════════════════════════════════════════════════════ */
function KpiCard({
  valor,
  rotulo,
  subrotulo,
  cor,
  icone,
  indice,
  onClick,
}: {
  valor: string | number
  rotulo: string
  subrotulo?: string
  cor: string
  icone: React.ReactNode
  indice: number
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-xl border border-line/50 bg-gradient-to-br from-surface to-surface-2 p-3 transition-all duration-300',
        onClick ? 'cursor-pointer hover:shadow-lg hover:shadow-accent/5 hover:-translate-y-0.5' : ''
      )}
      style={{ animationDelay: `${indice * 80}ms` }}
    >
      <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-15 blur-xl" style={{ backgroundColor: cor }} />
      </div>
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-3 truncate">{rotulo}</span>
          <span className="font-mono text-[22px] font-bold tracking-tight text-ink transition-transform duration-300 group-hover:scale-105">
            {valor}
          </span>
          {subrotulo && <span className="text-[9px] text-ink-3 truncate">{subrotulo}</span>}
        </div>
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line/50 transition-all duration-300 group-hover:scale-110"
          style={{ backgroundColor: `${cor}10`, boxShadow: `0 0 12px ${cor}20` }}
        >
          <div style={{ color: cor }} className="scale-90">{icone}</div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 h-[2px] w-0 rounded-b-xl transition-all duration-500 group-hover:w-full" style={{ background: `linear-gradient(90deg, ${cor}, transparent)` }} />
      {onClick && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="text-[9px] font-medium text-ink-3 bg-surface/80 px-2 py-1 rounded-full backdrop-blur-sm">
            Ver lista →
          </span>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
   LINHA DA TABELA
   ═══════════════════════════════════════════════════════════════ */
function VendedorRow({
  vendedor,
  onEdit,
  onSituacao,
}: {
  vendedor: Vendedor
  /** Ausente quando o perfil não pode editar: a linha deixa de ser clicável. */
  onEdit?: () => void
  onSituacao?: () => void
}) {
  const [hover, setHover] = useState(false)

  return (
    <tr
      onClick={onEdit}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        'border-b border-line/60 transition-all duration-150',
        onEdit && 'cursor-pointer',
        hover && 'bg-accent/[0.04]'
      )}
    >
      <td className="px-4 py-3.5">
        <span className="font-mono text-[11px] font-medium text-ink-3">#{String(vendedor.codigo).padStart(6, '0')}</span>
      </td>
      <td className="px-4 py-3.5">
        <p className="text-[13px] font-semibold text-ink max-w-[200px] truncate">{vendedor.descricao}</p>
        {vendedor.email && <p className="text-[11px] text-ink-3 max-w-[200px] truncate">{vendedor.email}</p>}
      </td>
      <td className="px-4 py-3.5">
        <span className="font-mono text-[11px] text-ink-2">
          {vendedor.documento ? mascaraDocumento(vendedor.documento) : '—'}
        </span>
      </td>
      <td className="px-4 py-3.5">
        <span className="font-mono text-[11px] text-ink">{vendedor.telefone || '—'}</span>
      </td>
      <td className="px-4 py-3.5">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold"
          style={{
            backgroundColor: vendedor.situacao === 'ativo' ? 'var(--c-ok-soft)' : 'var(--c-surface-2)',
            color: vendedor.situacao === 'ativo' ? 'var(--c-ok)' : 'var(--c-ink-3)',
            border: `1px solid ${vendedor.situacao === 'ativo' ? 'var(--c-ok)' : 'var(--c-line)'}20`
          }}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', vendedor.situacao === 'ativo' ? 'bg-ok animate-pulse' : 'bg-ink-3')} />
          {vendedor.situacao === 'ativo' ? 'Ativo' : 'Inativo'}
        </span>
      </td>
      <td className="px-4 py-3.5 text-right">
        {onSituacao && (
          <Botao
            tamanho="sm"
            variante="fantasma"
            onClick={(e) => { e.stopPropagation(); onSituacao() }}
          >
            {vendedor.situacao === 'ativo' ? 'Inativar' : 'Ativar'}
          </Botao>
        )}
      </td>
    </tr>
  )
}

/* ═══════════════════════════════════════════════════════════════
   MAIN
   ═══════════════════════════════════════════════════════════════ */
export function Vendedores() {
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const ctrl = useControleListagem(25)
  const [fTipo, setFTipo] = useState<'' | TipoPessoa>('')
  const [fSituacao, setFSituacao] = useState<'todas' | SituacaoRegistro>('ativo')
  const [editando, setEditando] = useState<Vendedor | null>(null)
  const [criando, setCriando] = useState(false)
  const [alvo, setAlvo] = useState<Vendedor | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)

  const podeVer = pode('vendedores', 'visualizar')
  const podeCriar = pode('vendedores', 'criar')
  const podeEditar = pode('vendedores', 'editar')
  const podeInativar = pode('vendedores', 'inativar')

  // Estatísticas
  const stats = useQuery({
    queryKey: ['vendedores', 'stats'],
    enabled: podeVer,
    queryFn: async () => {
      const [total, pj, pf, ativos] = await Promise.all([
        supabase.from('vendedores').select('*', { count: 'exact', head: true }),
        supabase.from('vendedores').select('*', { count: 'exact', head: true }).eq('tipo_pessoa', 'juridica'),
        supabase.from('vendedores').select('*', { count: 'exact', head: true }).eq('tipo_pessoa', 'fisica'),
        supabase.from('vendedores').select('*', { count: 'exact', head: true }).eq('situacao', 'ativo'),
      ])
      return {
        total: total.count ?? 0,
        pj: pj.count ?? 0,
        pf: pf.count ?? 0,
        ativos: ativos.count ?? 0,
      }
    },
  })

  const usuarios = useQuery({
    queryKey: ['usuarios', 'opcoes-vendedor'],
    enabled: podeVer && pode('usuarios', 'visualizar'),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Array<Pick<Usuario, 'id' | 'nome_completo'>>> => {
      const { data, error } = await supabase.from('usuarios').select('id, nome_completo').eq('situacao', 'ativo').order('nome_completo')
      if (error) throw error
      return data ?? []
    },
  })

  const filtrar = useMemo(
    () => (q: Consulta) => {
      const t = termoBusca(ctrl.busca)
      let r = q
      if (t.length >= 2) {
        const dig = t.replace(/\D/g, '')
        const partes = [`descricao.ilike.%${t}%`, `email.ilike.%${t}%`]
        if (dig.length >= 3) partes.push(`documento_digitos.ilike.%${dig}%`)
        r = r.or(partes.join(','))
      }
      if (fTipo) r = r.eq('tipo_pessoa', fTipo)
      if (fSituacao !== 'todas') r = r.eq('situacao', fSituacao)
      return r
    },
    [ctrl.busca, fTipo, fSituacao],
  )

  const lista = useListagem<Vendedor>({
    chave: ['vendedores', 'lista', ctrl.busca, fTipo, fSituacao, ctrl.pagina, ctrl.porPagina],
    tabela: 'vendedores',
    select: '*',
    filtrar,
    ordenacao: { coluna: 'descricao', ascendente: true },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
    habilitado: podeVer,
  })

  const form = useForm<FormVendedor>({ defaultValues: VAZIO })

  useEffect(() => {
    if (editando) {
      form.reset({
        tipo_pessoa: editando.tipo_pessoa,
        descricao: editando.descricao,
        documento: mascaraDocumento(editando.documento ?? ''),
        nascimento: editando.nascimento ?? '',
        inscricao_estadual: editando.inscricao_estadual ?? '',
        cep: mascaraCEP(editando.cep ?? ''),
        logradouro: editando.logradouro ?? '',
        numero: editando.numero ?? '',
        bairro: editando.bairro ?? '',
        municipio: editando.municipio ?? '',
        uf: editando.uf ?? '',
        telefone: editando.telefone ?? '',
        email: editando.email ?? '',
        usuario_id: editando.usuario_id ?? '',
        gerar_comissao: editando.gerar_comissao ?? false,
        momento_comissao: editando.momento_comissao ?? '',
        base_comissao: editando.base_comissao ?? '',
        forma_comissao: editando.forma_comissao ?? '',
        percentual_comissao: editando.percentual_comissao !== null ? String(editando.percentual_comissao).replace('.', ',') : '',
        situacao: editando.situacao,
      })
    } else if (criando) {
      form.reset(VAZIO)
    }
    setErro(null)
  }, [editando, criando, form])

  const salvar = useMutation({
    mutationFn: async (d: FormVendedor) => {
      if (!d.descricao.trim()) throw new Error('Informe o nome.')
      if (d.documento && !validarDocumento(d.documento, d.tipo_pessoa))
        throw new Error(d.tipo_pessoa === 'fisica' ? 'CPF inválido.' : 'CNPJ inválido.')
      const payload = {
        tipo_pessoa: d.tipo_pessoa,
        descricao: d.descricao.trim(),
        documento: d.documento.trim() || null,
        nascimento: d.nascimento || null,
        inscricao_estadual: d.inscricao_estadual.trim() || null,
        cep: d.cep.trim() || null,
        logradouro: d.logradouro.trim() || null,
        numero: d.numero.trim() || null,
        bairro: d.bairro.trim() || null,
        municipio: d.municipio.trim() || null,
        uf: d.uf || null,
        telefone: d.telefone.trim() || null,
        email: d.email.trim() || null,
        usuario_id: d.usuario_id || null,
        gerar_comissao: d.gerar_comissao,
        momento_comissao: d.momento_comissao || null,
        base_comissao: d.base_comissao || null,
        forma_comissao: d.forma_comissao || null,
        percentual_comissao: paraNumero(d.percentual_comissao),
        situacao: d.situacao,
      }
      const r = editando
        ? await supabase.from('vendedores').update(payload).eq('id', editando.id)
        : await supabase.from('vendedores').insert(payload)
      if (r.error) throw r.error
    },
    onSuccess: () => {
      toast.ok(editando ? 'Vendedor atualizado' : 'Vendedor cadastrado')
      setEditando(null)
      setCriando(false)
      void qc.invalidateQueries({ queryKey: ['vendedores'] })
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const mudarSituacao = useMutation({
    mutationFn: async (v: Vendedor) => {
      const nova: SituacaoRegistro = v.situacao === 'ativo' ? 'inativo' : 'ativo'
      const { error } = await supabase.from('vendedores').update({ situacao: nova }).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Situação alterada')
      setAlvo(null)
      void qc.invalidateQueries({ queryKey: ['vendedores'] })
    },
    onError: (e) => toast.erro('Não foi possível alterar', mensagemErro(e)),
  })

  const limparFiltros = () => {
    setFTipo(''); setFSituacao('ativo')
    ctrl.reiniciar()
  }

  const temFiltros = fTipo || fSituacao !== 'ativo'

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-accent" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Cadastros</p>
        </div>
        <h1 className="font-display text-xl font-bold text-ink">Vendedores</h1>
        <EstadoSemPermissao />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 rounded-full bg-accent" />
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Cadastros</p>
          </div>
          <h1 className="font-display text-xl font-bold text-ink">Vendedores</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lista.total !== null && (
            <span className="rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12px] text-ink-2">
              {lista.total.toLocaleString('pt-BR')} registros
            </span>
          )}
          {podeCriar && (
            <Botao variante="primario" iconeInicio={<Plus className="size-4" />} onClick={() => setCriando(true)}>
              Novo Vendedor
            </Botao>
          )}
        </div>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard indice={0} valor={stats.data?.total.toLocaleString('pt-BR') ?? '—'} rotulo="Total" subrotulo="vendedores" cor="var(--c-accent)" icone={<Users className="size-4" />} onClick={() => { setFTipo(''); setFSituacao('todas'); ctrl.setBusca(''); ctrl.reiniciar() }} />
        <KpiCard indice={1} valor={stats.data?.pj.toLocaleString('pt-BR') ?? '—'} rotulo="Jurídica" subrotulo="empresas" cor="var(--c-accent)" icone={<Store className="size-4" />} onClick={() => { setFTipo('juridica'); setFSituacao('ativo'); ctrl.setBusca(''); ctrl.reiniciar() }} />
        <KpiCard indice={2} valor={stats.data?.pf.toLocaleString('pt-BR') ?? '—'} rotulo="Física" subrotulo="vendedores" cor="var(--c-cyan)" icone={<UserCheck className="size-4" />} onClick={() => { setFTipo('fisica'); setFSituacao('ativo'); ctrl.setBusca(''); ctrl.reiniciar() }} />
        <KpiCard indice={3} valor={stats.data?.ativos.toLocaleString('pt-BR') ?? '—'} rotulo="Ativos" subrotulo="no sistema" cor="var(--c-ok)" icone={<TrendingUp className="size-4" />} onClick={() => { setFTipo(''); setFSituacao('ativo'); ctrl.setBusca(''); ctrl.reiniciar() }} />
      </div>

      {/* Busca */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-3" />
          <input type="text" value={ctrl.busca} onChange={(e) => ctrl.setBusca(e.target.value)}
            placeholder="Buscar por nome, documento ou e-mail..."
            className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-10 text-[13px] focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/10" />
          {ctrl.busca && (
            <button onClick={() => ctrl.setBusca('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink">
              <X className="size-4" />
            </button>
          )}
        </div>
        <button onClick={() => setMostrarFiltros(!mostrarFiltros)}
          className={cn('inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[12px] font-semibold transition-all',
            mostrarFiltros || temFiltros ? 'border-accent bg-accent/10 text-accent' : 'border-line bg-surface text-ink-2 hover:border-ink/20'
          )}>
          <Filter className="size-4" />Filtros
        </button>
      </div>

      {/* Filtros */}
      {mostrarFiltros && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-ink">Filtros</span>
            <button onClick={limparFiltros} className="text-[10px] text-ink-3 underline hover:text-ink">Limpar</button>
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-ink-3">Tipo:</label>
              <select value={fTipo} onChange={(e) => { setFTipo(e.target.value as '' | TipoPessoa); ctrl.reiniciar() }}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] focus:border-accent focus:outline-none">
                <option value="">Todos</option>
                <option value="juridica">Jurídica</option>
                <option value="fisica">Física</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-ink-3">Status:</label>
              <select value={fSituacao} onChange={(e) => { setFSituacao(e.target.value as typeof fSituacao); ctrl.reiniciar() }}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] focus:border-accent focus:outline-none">
                <option value="ativo">Ativos</option>
                <option value="inativo">Inativos</option>
                <option value="todas">Todos</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Chips */}
      {temFiltros && (
        <div className="flex flex-wrap gap-2">
          {fTipo && <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[10px]">{fTipo === 'fisica' ? 'PF' : 'PJ'}<button onClick={() => { setFTipo(''); ctrl.reiniciar() }}><X className="size-2.5" /></button></span>}
          {fSituacao !== 'ativo' && <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[10px]">{fSituacao === 'inativo' ? 'Inativos' : 'Todos'}<button onClick={() => { setFSituacao('ativo'); ctrl.reiniciar() }}><X className="size-2.5" /></button></span>}
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-xl border border-line bg-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-line bg-surface-2/60">
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3">ID</th>
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3">Vendedor</th>
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3">Documento</th>
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3">Telefone</th>
                <th className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3">Status</th>
                <th className="px-4 py-3 text-right text-[9px] font-bold uppercase tracking-[0.15em] text-ink-3" />
              </tr>
            </thead>
            <tbody>
              {lista.linhas.map((v) => (
                <VendedorRow
                  key={v.id}
                  vendedor={v}
                  onEdit={podeEditar ? () => setEditando(v) : undefined}
                  onSituacao={podeInativar ? () => setAlvo(v) : undefined}
                />
              ))}
            </tbody>
          </table>
        </div>

        {lista.estado === 'carregando' && (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          </div>
        )}

        {lista.estado === 'ok' && lista.linhas.length === 0 && (
          <div className="py-20 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-2">
              <Store className="size-6 text-ink-3" />
            </div>
            <p className="font-medium text-ink">{ctrl.busca || temFiltros ? 'Nenhum resultado' : 'Nenhum vendedor cadastrado'}</p>
            <p className="mt-1 text-[12px] text-ink-3">{ctrl.busca || temFiltros ? 'Ajuste a busca' : 'Clique em Novo Vendedor'}</p>
          </div>
        )}

        {lista.estado === 'erro' && (
          <div className="py-16 text-center">
            <p className="text-[13px] text-crit">{mensagemErro(lista.erro)}</p>
            <button onClick={lista.recarregar} className="mt-2 text-[12px] text-accent underline">Tentar novamente</button>
          </div>
        )}
      </div>

      {lista.estado === 'ok' && lista.total !== null && lista.total > 0 && (
        <Paginacao pagina={ctrl.pagina} porPagina={ctrl.porPagina} total={lista.total} aoMudarPagina={ctrl.setPagina} />
      )}

      {/* Painel do formulario */}
      <PainelLateral
        aberto={Boolean(editando || criando)}
        aoFechar={() => { setEditando(null); setCriando(false) }}
        titulo={editando ? 'Editar Vendedor' : 'Novo Vendedor'}
      >
        <form onSubmit={form.handleSubmit((d) => salvar.mutate(d))} className="space-y-4">
          {/* Tipo de pessoa */}
          <div className="flex rounded-lg border border-line bg-surface-2 p-1">
            <button type="button" onClick={() => form.setValue('tipo_pessoa', 'fisica')} className={cn('flex-1 rounded-md py-2 text-[12px] font-medium transition-all', form.watch('tipo_pessoa') === 'fisica' ? 'bg-surface shadow-sm text-ink' : 'text-ink-3')}>Pessoa Fisica</button>
            <button type="button" onClick={() => form.setValue('tipo_pessoa', 'juridica')} className={cn('flex-1 rounded-md py-2 text-[12px] font-medium transition-all', form.watch('tipo_pessoa') === 'juridica' ? 'bg-surface shadow-sm text-ink' : 'text-ink-3')}>Pessoa Juridica</button>
          </div>

          <Campo rotulo="Nome / Razao Social" erro={form.formState.errors.descricao?.message}>
              {(p) => (
                <Entrada {...p} {...form.register('descricao', { required: 'Obrigatorio' })} placeholder="Nome completo ou empresa" />
              )}
          </Campo>

          <Campo rotulo={form.watch('tipo_pessoa') === 'fisica' ? 'CPF' : 'CNPJ'}>
              {(p) => (
                <Entrada {...p} {...form.register('documento')} placeholder={form.watch('tipo_pessoa') === 'fisica' ? '000.000.000-00' : '00.000.000/0000-00'} />
              )}
          </Campo>

          {form.watch('tipo_pessoa') === 'fisica' && (
            <Campo rotulo="Data de Nascimento">
                {(p) => (
                  <Entrada {...p} type="date" {...form.register('nascimento')} />
                )}
            </Campo>
          )}

          {form.watch('tipo_pessoa') === 'juridica' && (
            <Campo rotulo="Inscricao Estadual">
                {(p) => (
                  <Entrada {...p} {...form.register('inscricao_estadual')} placeholder="000.000.000" />
                )}
            </Campo>
          )}

          <Campo rotulo="Telefone">
              {(p) => (
                <Entrada {...p} {...form.register('telefone')} placeholder="(00) 00000-0000" />
              )}
          </Campo>

          <Campo rotulo="E-mail">
              {(p) => (
                <Entrada {...p} type="email" {...form.register('email')} placeholder="email@exemplo.com" />
              )}
          </Campo>

          <CampoCEP
            valor={form.watch('cep')}
            aoMudar={(v) => form.setValue('cep', v, { shouldDirty: true })}
            aoEncontrar={(e) => {
              /* O CEP so serve se preencher o resto: digitar e continuar
                 batendo o endereco a mao e o mesmo que nao ter busca. */
              form.setValue('logradouro', e.logradouro, { shouldDirty: true })
              form.setValue('bairro', e.bairro, { shouldDirty: true })
              form.setValue('municipio', e.municipio, { shouldDirty: true })
              form.setValue('uf', e.uf, { shouldDirty: true })
            }}
          />

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Logradouro">
                {(p) => (
                  <Entrada {...p} {...form.register('logradouro')} placeholder="Rua..." />
                )}
            </Campo>
            <Campo rotulo="Numero">
                {(p) => (
                  <Entrada {...p} {...form.register('numero')} placeholder="000" />
                )}
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Bairro">
                {(p) => (
                  <Entrada {...p} {...form.register('bairro')} placeholder="Bairro" />
                )}
            </Campo>
            <Campo rotulo="Municipio">
                {(p) => (
                  <Entrada {...p} {...form.register('municipio')} placeholder="Cidade" />
                )}
            </Campo>
          </div>

          <Campo rotulo="UF">
            {(p) => (
            <Selecao {...p} {...form.register('uf')}>
              <option value="">Selecione</option>
              <option value="AC">AC</option><option value="AL">AL</option><option value="AP">AP</option>
              <option value="AM">AM</option><option value="BA">BA</option><option value="CE">CE</option>
              <option value="DF">DF</option><option value="ES">ES</option><option value="GO">GO</option>
              <option value="MA">MA</option><option value="MT">MT</option><option value="MS">MS</option>
              <option value="MG">MG</option><option value="PA">PA</option><option value="PB">PB</option>
              <option value="PR">PR</option><option value="PE">PE</option><option value="PI">PI</option>
              <option value="RJ">RJ</option><option value="RN">RN</option><option value="RS">RS</option>
              <option value="RO">RO</option><option value="RR">RR</option><option value="SC">SC</option>
              <option value="SP">SP</option><option value="SE">SE</option><option value="TO">TO</option>
            </Selecao>
            )}
          </Campo>

          <Campo
            rotulo="Usuário do sistema"
            dica="Vincula o vendedor a uma conta para ele ver as próprias comissões."
          >
            {(p) => (
              <Selecao {...p} {...form.register('usuario_id')}>
                <option value="">Sem vínculo</option>
                {(usuarios.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.nome_completo}</option>
                ))}
              </Selecao>
            )}
          </Campo>

          {/* Comissao */}
          <div className="space-y-3 rounded-lg border border-line bg-surface-2 p-4">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-ink">Gerar comissao</span>
              <Alternador
                rotulo="Gerar comissao para este vendedor"
                ativo={form.watch('gerar_comissao')}
                onChange={(v) => form.setValue('gerar_comissao', v, { shouldDirty: true })}
              />
            </div>

            {form.watch('gerar_comissao') && (
              <>
                <Campo rotulo="Momento">
                  {(p) => (
                    <Selecao {...p} {...form.register('momento_comissao')}>
                      <option value="">Selecione</option>
                      <option value="faturamento">No faturamento</option>
                      <option value="recebimento">No recebimento</option>
                      <option value="entrega">Na entrega</option>
                    </Selecao>
                  )}
                </Campo>
                <Campo rotulo="Base">
                  {(p) => (
                    <Selecao {...p} {...form.register('base_comissao')}>
                      <option value="">Selecione</option>
                      <option value="valor_total">Valor total</option>
                      <option value="produtos">Produtos</option>
                      <option value="servicos">Serviços</option>
                      <option value="lucro">Lucro</option>
                    </Selecao>
                  )}
                </Campo>
                <Campo rotulo="Forma">
                  {(p) => (
                    <Selecao {...p} {...form.register('forma_comissao')}>
                      <option value="">Selecione</option>
                      <option value="percentual">Percentual</option>
                      <option value="valor_fixo">Valor fixo</option>
                    </Selecao>
                  )}
                </Campo>
                {form.watch('forma_comissao') === 'percentual' && (
                  <Campo rotulo="Percentual">
                      {(p) => (
                        <Entrada {...p} {...form.register('percentual_comissao')} placeholder="0,00" />
                      )}
                  </Campo>
                )}
              </>
            )}
          </div>

          {/* Status */}
          <Campo rotulo="Status">
            {(p) => (
              <Selecao {...p} {...form.register('situacao')}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </Selecao>
            )}
          </Campo>

          {erro && (
            <div className="rounded-lg border border-crit/30 bg-crit-soft/20 p-3 text-[12px] text-crit-ink">{erro}</div>
          )}

          <div className="flex gap-2 pt-2">
            <Botao type="button" variante="fantasma" onClick={() => { setEditando(null); setCriando(false) }} className="flex-1">Cancelar</Botao>
            <Botao type="submit" variante="primario" carregando={salvar.isPending} className="flex-1">{editando ? 'Salvar' : 'Cadastrar'}</Botao>
          </div>
        </form>
      </PainelLateral>

      <Confirmacao
        aberto={Boolean(alvo)}
        aoFechar={() => setAlvo(null)}
        aoConfirmar={() => alvo && mudarSituacao.mutate(alvo)}
        carregando={mudarSituacao.isPending}
        destrutivo={alvo?.situacao === 'ativo'}
        titulo={alvo?.situacao === 'ativo' ? 'Inativar vendedor?' : 'Reativar vendedor?'}
        rotuloConfirmar={alvo?.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
        descricao={<><strong>{alvo?.descricao}</strong> {alvo?.situacao === 'ativo' ? 'deixa de aparecer na seleção de vendedores.' : 'volta a ficar disponível.'}</>}
      />
    </div>
  )
}
