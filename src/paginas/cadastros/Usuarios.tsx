import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import {
  BriefcaseBusiness,
  Clock,
  KeyRound,
  Mail,
  Plus,
  ShieldCheck,
  Star,
  TrendingUp,
  Users,
  UserCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { iniciais, mensagemErro } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { BarraFiltros } from '@/componentes/ui/BarraFiltros'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Paginacao, Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { Confirmacao, PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { Selo } from '@/componentes/ui/Selo'
import { Abas } from '@/componentes/ui/Abas'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { ExcecoesUsuario } from '@/paginas/sistema/ExcecoesUsuario'
import type { Especialidade, Funcao, PerfilAcesso, SituacaoUsuario, UsuarioListado } from '@/tipos/db'
import { cn } from '@/lib/utils'

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

const SELO: Record<SituacaoUsuario, { rotulo: string; tom: 'ok' | 'atencao' | 'neutro' | 'critico' }> = {
  ativo: { rotulo: 'Ativo', tom: 'ok' },
  pendente: { rotulo: 'Pendente', tom: 'atencao' },
  inativo: { rotulo: 'Inativo', tom: 'neutro' },
  recusado: { rotulo: 'Recusado', tom: 'critico' },
}

const SELECT_LISTA =
  'id, nome_completo, email, telefone, situacao, is_admin, funcao_id, perfil_id, ultimo_acesso_em, created_at, ' +
  'perfil:perfis_acesso ( id, nome ), funcao:funcoes ( id, nome ), ' +
  'usuario_especialidades ( especialidade:especialidades ( id, nome ) )'

interface FormUsuario {
  nome_completo: string
  email: string
  telefone: string
  funcao_id: string
  perfil_id: string
  situacao: SituacaoUsuario
  especialidades: string[]
}

const VAZIO: FormUsuario = {
  nome_completo: '',
  email: '',
  telefone: '',
  funcao_id: '',
  perfil_id: '',
  situacao: 'ativo',
  especialidades: [],
}

export function Usuarios() {
  const { usuario: eu } = useAuth()
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const ctrl = useControleListagem(25)
  const [fSituacao, setFSituacao] = useState<'todas' | SituacaoUsuario>('todas')
  const [fFuncao, setFFuncao] = useState('')
  const [fPerfil, setFPerfil] = useState('')
  const [fEspecialidade, setFEspecialidade] = useState('')

  const [emEdicao, setEmEdicao] = useState<UsuarioListado | null>(null)
  const [criando, setCriando] = useState(false)
  const [aba, setAba] = useState<'dados' | 'excecoes'>('dados')
  const [alvoSituacao, setAlvoSituacao] = useState<UsuarioListado | null>(null)
  const [senhaGerada, setSenhaGerada] = useState<{ email: string; senha: string } | null>(null)

  const podeVer = pode('usuarios', 'visualizar')
  const podeCriar = pode('usuarios', 'criar')
  const podeEditar = pode('usuarios', 'editar')
  const podeInativar = pode('usuarios', 'inativar')

  const podeConfigurarPermissoes = pode('perfis_permissoes', 'configurar')
  const podeVerFuncoes = pode('funcoes', 'visualizar')
  const podeVerEspecialidades = pode('especialidades', 'visualizar')

  // Estatísticas
  const stats = useQuery({
    queryKey: ['usuarios', 'stats'],
    enabled: podeVer,
    queryFn: async () => {
      const [total, ativos, pendentes, inativos] = await Promise.all([
        supabase.from('usuarios').select('*', { count: 'exact', head: true }),
        supabase.from('usuarios').select('*', { count: 'exact', head: true }).eq('situacao', 'ativo'),
        supabase.from('usuarios').select('*', { count: 'exact', head: true }).eq('situacao', 'pendente'),
        supabase.from('usuarios').select('*', { count: 'exact', head: true }).eq('situacao', 'inativo'),
      ])
      return {
        total: total.count ?? 0,
        ativos: ativos.count ?? 0,
        pendentes: pendentes.count ?? 0,
        inativos: inativos.count ?? 0,
      }
    },
  })

  /* ----------------------------------------------------------- apoio */

  const funcoes = useQuery({
    queryKey: ['funcoes', 'opcoes'],
    enabled: podeVer,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Funcao[]> => {
      const { data, error } = await supabase.from('funcoes').select('*').order('nome')
      if (error) throw error
      return data ?? []
    },
  })

  const perfis = useQuery({
    queryKey: ['perfis_acesso', 'opcoes'],
    enabled: podeVer,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PerfilAcesso[]> => {
      const { data, error } = await supabase.from('perfis_acesso').select('*').order('nome')
      if (error) throw error
      return data ?? []
    },
  })

  const especialidades = useQuery({
    queryKey: ['especialidades', 'opcoes'],
    enabled: podeVer,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Especialidade[]> => {
      const { data, error } = await supabase.from('especialidades').select('*').eq('situacao', 'ativo').order('nome')
      if (error) throw error
      return data ?? []
    },
  })

  /* -------------------------------------------------------- listagem */

  const filtrar = useMemo(
    () => (q: Consulta) => {
      const t = termoBusca(ctrl.busca)
      let r = q
      if (t.length >= 2) r = r.or(`nome_completo.ilike.%${t}%,email.ilike.%${t}%,telefone.ilike.%${t}%`)
      if (fSituacao !== 'todas') r = r.eq('situacao', fSituacao)
      if (fFuncao) r = r.eq('funcao_id', fFuncao)
      if (fPerfil) r = r.eq('perfil_id', fPerfil)
      if (fEspecialidade) r = r.eq('usuario_especialidades.especialidade_id', fEspecialidade)
      return r
    },
    [ctrl.busca, fSituacao, fFuncao, fPerfil, fEspecialidade],
  )

  const lista = useListagem<UsuarioListado>({
    chave: ['usuarios', 'lista', ctrl.busca, fSituacao, fFuncao, fPerfil, fEspecialidade, ctrl.pagina, ctrl.porPagina],
    tabela: 'usuarios',
    select: fEspecialidade ? SELECT_LISTA.replace('usuario_especialidades (', 'usuario_especialidades!inner (') : SELECT_LISTA,
    filtrar,
    ordenacao: { coluna: 'nome_completo', ascendente: true },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
    habilitado: podeVer,
  })

  /* ----------------------------------------------------------- form */

  const form = useForm<FormUsuario>({ defaultValues: VAZIO })

  useEffect(() => {
    if (emEdicao) {
      form.reset({
        nome_completo: emEdicao.nome_completo,
        email: emEdicao.email,
        telefone: emEdicao.telefone ?? '',
        funcao_id: emEdicao.funcao_id ?? '',
        perfil_id: emEdicao.perfil_id ?? '',
        situacao: emEdicao.situacao,
        especialidades: emEdicao.usuario_especialidades
          .map((v) => v.especialidade?.id)
          .filter((v): v is string => Boolean(v)),
      })
      setAba('dados')
    } else if (criando) {
      form.reset(VAZIO)
      setAba('dados')
    }
  }, [emEdicao, criando, form])

  function invalidar() {
    void qc.invalidateQueries({ queryKey: ['usuarios'] })
    void qc.invalidateQueries({ queryKey: ['visao-geral-contagens'] })
  }

  async function sincronizarEspecialidades(usuarioId: string, selecionadas: string[]) {
    const { data: atuais, error: erroLer } = await supabase
      .from('usuario_especialidades')
      .select('especialidade_id')
      .eq('usuario_id', usuarioId)
    if (erroLer) throw erroLer

    const antes = new Set((atuais ?? []).map((a) => a.especialidade_id))
    const depois = new Set(selecionadas)

    const remover = [...antes].filter((id) => !depois.has(id))
    const inserir = [...depois].filter((id) => !antes.has(id))

    if (remover.length) {
      const { error } = await supabase
        .from('usuario_especialidades')
        .delete()
        .eq('usuario_id', usuarioId)
        .in('especialidade_id', remover)
      if (error) throw error
    }
    if (inserir.length) {
      const { error } = await supabase
        .from('usuario_especialidades')
        .insert(inserir.map((especialidade_id) => ({ usuario_id: usuarioId, especialidade_id })))
      if (error) throw error
    }
  }

  const salvar = useMutation({
    mutationFn: async (d: FormUsuario) => {
      const nome = d.nome_completo.trim()
      if (nome.split(/\s+/).length < 2) throw new Error('Informe nome e sobrenome.')

      if (emEdicao) {
        const { error } = await supabase
          .from('usuarios')
          .update({
            nome_completo: nome,
            telefone: d.telefone.trim() || null,
            funcao_id: d.funcao_id || null,
            perfil_id: d.perfil_id || null,
            situacao: d.situacao,
          })
          .eq('id', emEdicao.id)
        if (error) throw error
        await sincronizarEspecialidades(emEdicao.id, d.especialidades)
        return { criado: false as const }
      }

      const email = d.email.trim().toLowerCase()
      if (!email) throw new Error('Informe o e-mail.')

      const { data, error } = await supabase.functions.invoke<{
        id: string
        senha_temporaria: string
        erro?: string
      }>('admin-usuarios', {
        body: {
          acao: 'criar',
          nome_completo: nome,
          email,
          telefone: d.telefone.trim() || null,
          funcao_id: d.funcao_id || null,
          perfil_id: d.perfil_id || null,
          situacao: d.situacao,
          especialidades: d.especialidades,
        },
      })

      if (error) {
        const detalhe = await lerErroFuncao(error)
        throw new Error(detalhe)
      }
      if (!data?.id) throw new Error(data?.erro ?? 'Não foi possível criar a conta.')

      return { criado: true as const, email, senha: data.senha_temporaria }
    },
    onSuccess: (r) => {
      if (r.criado) {
        setSenhaGerada({ email: r.email, senha: r.senha })
        toast.ok('Usuário criado', 'Uma senha temporária foi gerada.')
      } else {
        toast.ok('Usuário atualizado')
      }
      setEmEdicao(null)
      setCriando(false)
      invalidar()
    },
    onError: (e) => toast.erro('Não foi possível salvar', mensagemErro(e)),
  })

  const mudarSituacao = useMutation({
    mutationFn: async (u: UsuarioListado) => {
      const nova: SituacaoUsuario = u.situacao === 'ativo' ? 'inativo' : 'ativo'
      const { error } = await supabase.from('usuarios').update({ situacao: nova }).eq('id', u.id)
      if (error) throw error
      return nova
    },
    onSuccess: (nova) => {
      toast.ok(nova === 'ativo' ? 'Acesso liberado' : 'Acesso inativado')
      setAlvoSituacao(null)
      invalidar()
    },
    onError: (e) => toast.erro('Não foi possível alterar', mensagemErro(e)),
  })

  const novaSenha = useMutation({
    mutationFn: async (u: UsuarioListado) => {
      const { data, error } = await supabase.functions.invoke<{ senha_temporaria: string }>('admin-usuarios', {
        body: { acao: 'nova_senha_temporaria', usuario_id: u.id },
      })
      if (error) throw new Error(await lerErroFuncao(error))
      return { email: u.email, senha: data!.senha_temporaria }
    },
    onSuccess: (r) => setSenhaGerada(r),
    onError: (e) => toast.erro('Não foi possível redefinir a senha', mensagemErro(e)),
  })

  const enviarLink = useMutation({
    mutationFn: async (u: UsuarioListado) => {
      const { error } = await supabase.functions.invoke('admin-usuarios', {
        body: { acao: 'enviar_convite', email: u.email, redirecionar_para: `${window.location.origin}/nova-senha` },
      })
      if (error) throw new Error(await lerErroFuncao(error))
    },
    onSuccess: () => toast.ok('E-mail enviado', 'A pessoa recebeu um link para definir a senha.'),
    onError: (e) => toast.erro('Não foi possível enviar', mensagemErro(e)),
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-accent" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Cadastros</p>
        </div>
        <h1 className="font-display text-xl font-bold text-ink">Usuários</h1>
        <EstadoSemPermissao />
      </div>
    )
  }

  /* --------------------------------------------------------- colunas */
  const colunas: Array<Coluna<UsuarioListado>> = [
    {
      chave: 'nome',
      cabecalho: 'Nome',
      celula: (u) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line-strong bg-surface-2 font-display text-[11px] font-bold text-ink-2"
          >
            {iniciais(u.nome_completo)}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 truncate font-medium text-ink">
              {u.nome_completo}
              {u.is_admin && <ShieldCheck aria-label="Administrador" className="size-3.5 shrink-0 text-accent" />}
            </span>
            <span className="truncate text-[12px] text-ink-3 lg:hidden">{u.email}</span>
          </div>
        </div>
      ),
    },
    {
      chave: 'email',
      cabecalho: 'E-mail',
      largura: '230px',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (u) => <span className="truncate text-[12.5px]">{u.email}</span>,
    },
    {
      chave: 'telefone',
      cabecalho: 'Telefone',
      largura: '150px',
      classeResponsiva: 'hidden xl:table-cell',
      celula: (u) => (u.telefone ? <span className="num text-[12.5px]">{u.telefone}</span> : <span className="text-ink-3">—</span>),
    },
    {
      chave: 'funcao',
      cabecalho: 'Função',
      largura: '170px',
      classeResponsiva: 'hidden md:table-cell',
      celula: (u) => u.funcao?.nome ?? <span className="text-ink-3">—</span>,
    },
    {
      chave: 'perfil',
      cabecalho: 'Perfil',
      largura: '170px',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (u) => u.perfil?.nome ?? <span className="text-ink-3">Sem perfil</span>,
    },
    {
      chave: 'especialidades',
      cabecalho: 'Especialidades do mecânico',
      largura: '210px',
      classeResponsiva: 'hidden xl:table-cell',
      celula: (u) => {
        const nomes = u.usuario_especialidades.map((v) => v.especialidade?.nome).filter(Boolean) as string[]
        if (nomes.length === 0) return <span className="text-ink-3">—</span>
        return (
          <div className="flex flex-wrap gap-1">
            {nomes.slice(0, 2).map((n) => (
              <Selo key={n} tom="info">
                {n}
              </Selo>
            ))}
            {nomes.length > 2 && <Selo tom="neutro">+{nomes.length - 2}</Selo>}
          </div>
        )
      },
    },
    {
      chave: 'situacao',
      cabecalho: 'Situação',
      largura: '120px',
      celula: (u) => (
        <Selo tom={SELO[u.situacao].tom} ponto>
          {SELO[u.situacao].rotulo}
        </Selo>
      ),
    },
    {
      chave: 'acoes',
      cabecalho: '',
      largura: '170px',
      alinhamento: 'direita',
      celula: (u) => (
        <div className="flex justify-end gap-1.5">
          {podeEditar && (
            <Botao tamanho="sm" variante="fantasma" onClick={() => setEmEdicao(u)}>
              Editar
            </Botao>
          )}
          {podeInativar && u.id !== eu?.id && (
            <Botao tamanho="sm" variante="fantasma" onClick={() => setAlvoSituacao(u)}>
              {u.situacao === 'ativo' ? 'Inativar' : 'Ativar'}
            </Botao>
          )}
        </div>
      ),
    },
  ]

  const chips = [
    fSituacao !== 'todas' && { id: 's', rotulo: `Situação: ${SELO[fSituacao].rotulo}`, aoRemover: () => setFSituacao('todas') },
    fFuncao && {
      id: 'f',
      rotulo: `Função: ${funcoes.data?.find((f) => f.id === fFuncao)?.nome ?? ''}`,
      aoRemover: () => setFFuncao(''),
    },
    fPerfil && {
      id: 'p',
      rotulo: `Perfil: ${perfis.data?.find((p) => p.id === fPerfil)?.nome ?? ''}`,
      aoRemover: () => setFPerfil(''),
    },
    fEspecialidade && {
      id: 'e',
      rotulo: `Especialidade do mecânico: ${especialidades.data?.find((e) => e.id === fEspecialidade)?.nome ?? ''}`,
      aoRemover: () => setFEspecialidade(''),
    },
  ].filter(Boolean) as Array<{ id: string; rotulo: string; aoRemover: () => void }>

  function limparFiltros() {
    setFSituacao('todas')
    setFFuncao('')
    setFPerfil('')
    setFEspecialidade('')
    ctrl.reiniciar()
  }

  const painelAberto = criando || Boolean(emEdicao)
  const espSelecionadas = form.watch('especialidades')

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 rounded-full bg-accent" />
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Cadastros</p>
          </div>
          <h1 className="font-display text-xl font-bold text-ink">Usuários</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {lista.total !== null && (
            <span className="rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12px] text-ink-2">
              {lista.total.toLocaleString('pt-BR')} registros
            </span>
          )}
          {podeCriar && (
            <Botao variante="primario" iconeInicio={<Plus className="size-4" />} onClick={() => setCriando(true)}>
              Novo usuário
            </Botao>
          )}
        </div>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <KpiCard indice={0} valor={stats.data?.total.toLocaleString('pt-BR') ?? '—'} rotulo="Total" subrotulo="usuários" cor="var(--c-accent)" icone={<Users className="size-4" />} onClick={() => { setFSituacao('todas'); ctrl.setBusca(''); ctrl.reiniciar() }} />
        <KpiCard indice={1} valor={stats.data?.ativos.toLocaleString('pt-BR') ?? '—'} rotulo="Ativos" subrotulo="no sistema" cor="var(--c-ok)" icone={<UserCheck className="size-4" />} onClick={() => { setFSituacao('ativo'); ctrl.setBusca(''); ctrl.reiniciar() }} />
        <KpiCard indice={2} valor={stats.data?.pendentes.toLocaleString('pt-BR') ?? '—'} rotulo="Pendentes" subrotulo="aguardando" cor="var(--c-warn)" icone={<Clock className="size-4" />} onClick={() => { setFSituacao('pendente'); ctrl.setBusca(''); ctrl.reiniciar() }} />
        <KpiCard indice={3} valor={stats.data?.inativos.toLocaleString('pt-BR') ?? '—'} rotulo="Inativos" subrotulo="bloqueados" cor="var(--c-crit)" icone={<TrendingUp className="size-4" />} onClick={() => { setFSituacao('inativo'); ctrl.setBusca(''); ctrl.reiniciar() }} />
      </div>

      {/* Links Rápidos */}
      {(podeVerFuncoes || podeVerEspecialidades) && (
        <div className="grid gap-2 rounded-lg border border-line bg-surface p-2 sm:grid-cols-2">
          {podeVerFuncoes && (
            <Link
              to="/cadastros/funcoes"
              className="flex min-w-0 items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-2"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface-2 text-ink-3">
                <BriefcaseBusiness className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-ink">Funções e cargos</span>
                <span className="block truncate text-[12px] text-ink-3">
                  Define mecânico, laboratório e responsabilidade operacional.
                </span>
              </span>
            </Link>
          )}

          {podeVerEspecialidades && (
            <Link
              to="/cadastros/especialidades"
              className="flex min-w-0 items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-2"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-cyan/25 bg-cyan-soft text-cyan-ink">
                <Star className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-ink">Especialidades do mecânico</span>
                <span className="block truncate text-[12px] text-ink-3">Freios, ABS/EBS, APU, laboratório e afins.</span>
              </span>
            </Link>
          )}
        </div>
      )}

      {/* Barra de Filtros */}
      <div className="flex flex-col">
        <BarraFiltros
          busca={ctrl.busca}
          aoBuscar={ctrl.setBusca}
          placeholder="Buscar por nome, e-mail ou telefone"
          chips={chips}
          aoLimpar={chips.length ? limparFiltros : undefined}
          aoAtualizar={lista.recarregar}
          atualizando={lista.buscando}
          filtros={
            <>
              <Campo rotulo="Situação">
                {(p) => (
                  <Selecao
                    {...p}
                    value={fSituacao}
                    onChange={(e) => {
                      setFSituacao(e.target.value as typeof fSituacao)
                      ctrl.reiniciar()
                    }}
                  >
                    <option value="todas">Todas</option>
                    <option value="ativo">Ativo</option>
                    <option value="pendente">Pendente</option>
                    <option value="inativo">Inativo</option>
                    <option value="recusado">Recusado</option>
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Função">
                {(p) => (
                  <Selecao
                    {...p}
                    value={fFuncao}
                    onChange={(e) => {
                      setFFuncao(e.target.value)
                      ctrl.reiniciar()
                    }}
                  >
                    <option value="">Todas</option>
                    {funcoes.data?.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Perfil de acesso">
                {(p) => (
                  <Selecao
                    {...p}
                    value={fPerfil}
                    onChange={(e) => {
                      setFPerfil(e.target.value)
                      ctrl.reiniciar()
                    }}
                  >
                    <option value="">Todos</option>
                    {perfis.data?.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Especialidade do mecânico">
                {(p) => (
                  <Selecao
                    {...p}
                    value={fEspecialidade}
                    onChange={(e) => {
                      setFEspecialidade(e.target.value)
                      ctrl.reiniciar()
                    }}
                  >
                    <option value="">Todas</option>
                    {especialidades.data?.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </Selecao>
                )}
              </Campo>
            </>
          }
        />

        <Tabela
          aoDuploClique={podeEditar ? (linha) => setEmEdicao(linha) : undefined}
          className="rounded-none"
          colunas={colunas}
          linhas={lista.linhas}
          chaveDe={(u) => u.id}
          estado={lista.estado}
          mensagemVazio={{
            titulo: ctrl.busca || chips.length ? 'Nenhum resultado' : 'Nenhum usuário cadastrado',
            descricao:
              ctrl.busca || chips.length
                ? 'Ajuste a busca ou os filtros.'
                : 'Cadastre as pessoas que vão operar o sistema e defina função, perfil e especialidades.',
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

      {/* ------------------------------------------------ painel do usuário */}
      <PainelLateral
        aberto={painelAberto}
        aoFechar={() => {
          setEmEdicao(null)
          setCriando(false)
        }}
        largura="lg"
        titulo={emEdicao ? emEdicao.nome_completo : 'Novo usuário'}
        descricao={emEdicao ? emEdicao.email : 'A conta de acesso é criada junto com o cadastro.'}
        rodape={
          aba === 'dados' ? (
            <>
              <Botao
                variante="neutro"
                onClick={() => {
                  setEmEdicao(null)
                  setCriando(false)
                }}
              >
                Cancelar
              </Botao>
              <Botao
                variante="primario"
                carregando={salvar.isPending}
                onClick={form.handleSubmit((d) => salvar.mutate(d))}
              >
                Salvar
              </Botao>
            </>
          ) : undefined
        }
      >
        {emEdicao && podeConfigurarPermissoes && (
          <Abas
            className="mb-5"
            ativa={aba}
            aoMudar={setAba}
            abas={[
              { valor: 'dados', rotulo: 'Dados' },
              { valor: 'excecoes', rotulo: 'Exceções de permissão' },
            ]}
          />
        )}

        {aba === 'excecoes' && emEdicao ? (
          <ExcecoesUsuario usuarioId={emEdicao.id} perfilNome={emEdicao.perfil?.nome ?? null} />
        ) : (
          <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((d) => salvar.mutate(d))}>
            {emEdicao?.is_admin && (
              <Aviso tom="atencao" titulo="Conta administradora">
                Esta conta tem acesso total ao sistema. O privilégio administrativo só pode ser alterado
                diretamente no banco, por segurança.
              </Aviso>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo className="sm:col-span-2" rotulo="Nome completo" obrigatorio>
                {(p) => <Entrada {...p} {...form.register('nome_completo', { required: true })} autoFocus />}
              </Campo>

              <Campo
                rotulo="E-mail"
                obrigatorio={!emEdicao}
                dica={emEdicao ? 'O e-mail de acesso não pode ser alterado por aqui.' : undefined}
              >
                {(p) => (
                  <Entrada {...p} {...form.register('email')} type="email" disabled={Boolean(emEdicao)} readOnly={Boolean(emEdicao)} />
                )}
              </Campo>

              <Campo rotulo="Telefone">
                {(p) => <Entrada {...p} {...form.register('telefone')} type="tel" mono placeholder="(00) 00000-0000" />}
              </Campo>

              <Campo rotulo="Função / cargo" dica="Define quem pode atuar como mecânico ou no laboratório.">
                {(p) => (
                  <Selecao {...p} {...form.register('funcao_id')}>
                    <option value="">Sem função definida</option>
                    {funcoes.data
                      ?.filter((f) => f.situacao === 'ativo' || f.id === form.watch('funcao_id'))
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                        </option>
                      ))}
                  </Selecao>
                )}
              </Campo>

              <Campo rotulo="Perfil de acesso" dica="Define o que a pessoa pode fazer no sistema.">
                {(p) => (
                  <Selecao {...p} {...form.register('perfil_id')}>
                    <option value="">Sem perfil (sem acesso aos módulos)</option>
                    {perfis.data
                      ?.filter((f) => f.situacao === 'ativo' || f.id === form.watch('perfil_id'))
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                        </option>
                      ))}
                  </Selecao>
                )}
              </Campo>

              <Campo className="sm:col-span-2" rotulo="Situação">
                {(p) => (
                  <Selecao {...p} {...form.register('situacao')}>
                    <option value="ativo">Ativo — acesso liberado</option>
                    <option value="pendente">Pendente — aguardando liberação</option>
                    <option value="inativo">Inativo — sem acesso</option>
                    <option value="recusado">Recusado</option>
                  </Selecao>
                )}
              </Campo>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="lbl">Especialidades do mecânico</span>
                {podeVerEspecialidades && (
                  <Link to="/cadastros/especialidades" className="text-[12px] font-medium text-cyan hover:underline">
                    Gerenciar especialidades
                  </Link>
                )}
              </div>
              {especialidades.data && especialidades.data.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {especialidades.data.map((e) => {
                    const marcada = espSelecionadas.includes(e.id)
                    return (
                      <button
                        key={e.id}
                        type="button"
                        aria-pressed={marcada}
                        onClick={() =>
                          form.setValue(
                            'especialidades',
                            marcada ? espSelecionadas.filter((x) => x !== e.id) : [...espSelecionadas, e.id],
                            { shouldDirty: true },
                          )
                        }
                        className={
                          marcada
                            ? 'rounded-full border border-cyan bg-cyan-soft px-3 py-1.5 text-[12.5px] text-cyan-ink'
                            : 'rounded-full border border-line-strong px-3 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:text-ink'
                        }
                      >
                        {e.nome}
                        {e.de_laboratorio && <span className="ml-1.5 text-[10px] opacity-70">LAB</span>}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <p className="text-[12.5px] text-ink-3">
                  Nenhuma especialidade cadastrada ainda. Use Gerenciar especialidades para criar competências como
                  freios, ABS/EBS, APU ou laboratório.
                </p>
              )}
            </div>

            {emEdicao && podeEditar && (
              <div className="flex flex-col gap-2 rounded-lg border border-line p-4">
                <span className="lbl">Acesso da pessoa</span>
                <div className="flex flex-wrap gap-2">
                  <Botao
                    tamanho="sm"
                    variante="neutro"
                    iconeInicio={<KeyRound />}
                    carregando={novaSenha.isPending}
                    onClick={() => novaSenha.mutate(emEdicao)}
                  >
                    Gerar senha temporária
                  </Botao>
                  <Botao
                    tamanho="sm"
                    variante="neutro"
                    iconeInicio={<Mail />}
                    carregando={enviarLink.isPending}
                    onClick={() => enviarLink.mutate(emEdicao)}
                  >
                    Enviar link por e-mail
                  </Botao>
                </div>
                <p className="text-[12px] leading-relaxed text-ink-3">
                  O envio por e-mail depende do serviço de e-mail configurado no servidor. Se falhar, use a senha
                  temporária.
                </p>
              </div>
            )}
          </form>
        )}
      </PainelLateral>

      {/* --------------------------------------------- senha temporária */}
      <PainelLateral
        aberto={Boolean(senhaGerada)}
        aoFechar={() => setSenhaGerada(null)}
        titulo="Senha temporária"
        descricao="Anote agora: ela não será exibida novamente."
        rodape={
          <Botao variante="primario" onClick={() => setSenhaGerada(null)}>
            Entendido
          </Botao>
        }
      >
        <div className="flex flex-col gap-4">
          <Aviso tom="atencao">
            Entregue estes dados pessoalmente. Peça que a pessoa troque a senha no primeiro acesso em
            Configurações › Segurança.
          </Aviso>
          <div className="flex flex-col gap-1.5">
            <span className="lbl">E-mail</span>
            <code className="num rounded-md border border-line bg-inset px-3 py-2.5 text-[13px] break-all">
              {senhaGerada?.email}
            </code>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="lbl">Senha temporária</span>
            <code className="num rounded-md border border-line bg-inset px-3 py-2.5 text-[15px] tracking-wider break-all">
              {senhaGerada?.senha}
            </code>
          </div>
        </div>
      </PainelLateral>

      <Confirmacao
        aberto={Boolean(alvoSituacao)}
        aoFechar={() => setAlvoSituacao(null)}
        aoConfirmar={() => alvoSituacao && mudarSituacao.mutate(alvoSituacao)}
        carregando={mudarSituacao.isPending}
        destrutivo={alvoSituacao?.situacao === 'ativo'}
        titulo={alvoSituacao?.situacao === 'ativo' ? 'Inativar acesso?' : 'Liberar acesso?'}
        rotuloConfirmar={alvoSituacao?.situacao === 'ativo' ? 'Inativar' : 'Liberar'}
        descricao={
          alvoSituacao?.situacao === 'ativo' ? (
            <>
              <strong className="font-semibold text-ink">{alvoSituacao?.nome_completo}</strong> perde o acesso
              imediatamente. O histórico de atendimentos é preservado.
            </>
          ) : (
            <>
              <strong className="font-semibold text-ink">{alvoSituacao?.nome_completo}</strong> passa a acessar o
              sistema com o perfil atribuído.
            </>
          )
        }
      />

    </div>
  )
}

/** Extrai a mensagem útil de um erro devolvido por Edge Function. */
async function lerErroFuncao(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const corpo = (await ctx.json()) as { erro?: string }
      if (corpo?.erro) return corpo.erro
    } catch {
      /* corpo não era JSON */
    }
  }
  return mensagemErro(error)
}
