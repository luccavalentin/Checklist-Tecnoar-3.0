import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Search,
  Tag,
  X,
  Trash2,
  Edit3,
  Building2,
  Car,
  Users,
  Package,
  Wrench,
  FileText,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro } from '@/lib/utils'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { CabecalhoPagina } from '@/componentes/ui/Painel'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Entrada } from '@/componentes/ui/Campo'
import { Confirmacao, PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import type { LinhaTag, SituacaoRegistro } from '@/tipos/supabase'

// Tipos de entidade que podem ter tags
type EntidadeTag = 'cliente' | 'veiculo' | 'produto' | 'servico' | 'fornecedor' | 'os'

interface UsoTag {
  clientes: number
  ordens: number
}

interface TagComUso {
  tag: LinhaTag
  uso: UsoTag
  total: number
}

const CORES_DISPONIVEIS = [
  { valor: '#3B82F6', nome: 'Azul' },
  { valor: '#10B981', nome: 'Verde' },
  { valor: '#F59E0B', nome: 'Amarelo' },
  { valor: '#EF4444', nome: 'Vermelho' },
  { valor: '#8B5CF6', nome: 'Roxo' },
  { valor: '#EC4899', nome: 'Rosa' },
  { valor: '#06B6D4', nome: 'Ciano' },
  { valor: '#F97316', nome: 'Laranja' },
  { valor: '#6366F1', nome: 'Índigo' },
  { valor: '#84CC16', nome: 'Lima' },
  { valor: '#78716C', nome: 'Pedra' },
  { valor: '#0EA5E9', nome: 'Sky' },
]

const ICONES_ENTIDADE: Record<EntidadeTag, { icon: React.ReactNode; label: string }> = {
  cliente: { icon: <Users className="size-3.5" />, label: 'Clientes' },
  veiculo: { icon: <Car className="size-3.5" />, label: 'Veículos' },
  produto: { icon: <Package className="size-3.5" />, label: 'Produtos' },
  servico: { icon: <Wrench className="size-3.5" />, label: 'Serviços' },
  fornecedor: { icon: <Building2 className="size-3.5" />, label: 'Fornecedores' },
  os: { icon: <FileText className="size-3.5" />, label: 'Ordens de Serviço' },
}

export function Tags() {
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const [busca, setBusca] = useState('')
  const [filtroEntidade, setFiltroEntidade] = useState<EntidadeTag | 'todas'>('todas')
  const [criandoTag, setCriandoTag] = useState(false)
  const [editandoTag, setEditandoTag] = useState<LinhaTag | null>(null)
  const [excluindoTag, setExcluindoTag] = useState<LinhaTag | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const podeVer = pode('tags', 'visualizar')
  const podeCriar = pode('tags', 'criar')
  const podeEditar = pode('tags', 'editar')
  const podeExcluir = pode('tags', 'inativar')

  // Busca todas as tags
  const tags = useQuery({
    queryKey: ['tags'],
    enabled: podeVer,
    queryFn: async (): Promise<LinhaTag[]> => {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .order('nome')
      if (error) throw error
      return data ?? []
    },
  })

  /**
   * Uso de cada tag.
   *
   * Só existem dois vínculos no banco: `cliente_tags` e `os_tags`. A contagem
   * é por tag, não por entidade — antes de apagar uma tag o que interessa é
   * quantos registros ficam sem ela, não quantos vínculos existem no total.
   */
  const usoTags = useQuery({
    queryKey: ['tags-uso'],
    enabled: podeVer && tags.isSuccess,
    queryFn: async (): Promise<Record<string, UsoTag>> => {
      const [clientes, ordens] = await Promise.all([
        supabase.from('cliente_tags').select('tag_id'),
        supabase.from('os_tags').select('tag_id'),
      ])
      if (clientes.error) throw clientes.error
      if (ordens.error) throw ordens.error

      const mapa: Record<string, UsoTag> = {}
      const somar = (linhas: Array<{ tag_id: string }>, campo: keyof UsoTag) => {
        for (const l of linhas) {
          mapa[l.tag_id] ??= { clientes: 0, ordens: 0 }
          mapa[l.tag_id][campo] += 1
        }
      }
      somar(clientes.data ?? [], 'clientes')
      somar(ordens.data ?? [], 'ordens')
      return mapa
    },
  })

  const tagsComUso = useMemo((): TagComUso[] => {
    if (!tags.data) return []
    return tags.data.map((tag) => {
      const uso = usoTags.data?.[tag.id] ?? { clientes: 0, ordens: 0 }
      return { tag, uso, total: uso.clientes + uso.ordens }
    })
  }, [tags.data, usoTags.data])

  // Filtragem
  const tagsFiltradas = useMemo(() => {
    if (!tagsComUso.length) return []
    const buscaLower = busca.toLowerCase().trim()

    return tagsComUso.filter(({ tag }) => {
      if (!buscaLower) return true
      return (
        tag.nome.toLowerCase().includes(buscaLower) ||
        tag.descricao?.toLowerCase().includes(buscaLower)
      )
    })
  }, [tagsComUso, busca])

  /* --------------------------------------------------------- criar tag */
  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    cor: CORES_DISPONIVEIS[0].valor,
  })

  const criarTag = useMutation({
    mutationFn: async () => {
      setErro(null)
      if (!form.nome.trim()) throw new Error('Informe o nome da tag.')
      const { error } = await supabase.from('tags').insert({
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        cor: form.cor,
      })
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Tag criada com sucesso')
      setCriandoTag(false)
      setForm({ nome: '', descricao: '', cor: CORES_DISPONIVEIS[0].valor })
      void qc.invalidateQueries({ queryKey: ['tags'] })
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  /* --------------------------------------------------------- editar tag */
  const [formEdit, setFormEdit] = useState<{
    nome: string
    descricao: string
    cor: string
    situacao: SituacaoRegistro
  }>({
    nome: '',
    descricao: '',
    cor: '',
    situacao: 'ativo',
  })

  const editarTag = useMutation({
    mutationFn: async () => {
      if (!editandoTag) throw new Error('Tag não encontrada')
      setErro(null)
      if (!formEdit.nome.trim()) throw new Error('Informe o nome da tag.')
      const { error } = await supabase
        .from('tags')
        .update({
          nome: formEdit.nome.trim(),
          descricao: formEdit.descricao.trim() || null,
          cor: formEdit.cor,
          situacao: formEdit.situacao,
        })
        .eq('id', editandoTag.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Tag atualizada')
      setEditandoTag(null)
      void qc.invalidateQueries({ queryKey: ['tags'] })
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  /* --------------------------------------------------------- excluir tag */
  const excluirTag = useMutation({
    mutationFn: async () => {
      if (!excluindoTag) throw new Error('Tag não encontrada')
      setErro(null)
      /* Os vínculos saem primeiro. Só existem estes dois no banco: apagar de
         tabelas inexistentes silenciava o erro e dava falsa sensação de
         limpeza. */
      const cli = await supabase.from('cliente_tags').delete().eq('tag_id', excluindoTag.id)
      if (cli.error) throw cli.error
      const os = await supabase.from('os_tags').delete().eq('tag_id', excluindoTag.id)
      if (os.error) throw os.error

      const { error } = await supabase.from('tags').delete().eq('id', excluindoTag.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Tag removida')
      setExcluindoTag(null)
      void qc.invalidateQueries({ queryKey: ['tags'] })
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const abrirEdicao = (tag: LinhaTag) => {
    setFormEdit({
      nome: tag.nome,
      descricao: tag.descricao ?? '',
      cor: tag.cor ?? CORES_DISPONIVEIS[0].valor,
      situacao: tag.situacao,
    })
    setEditandoTag(tag)
  }

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Cadastros" titulo="Tags" />
        <EstadoSemPermissao />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <CabecalhoPagina
        sobretitulo="Cadastros"
        titulo="Tags"
        meta={
          <span className="text-[12px] text-ink-3">
            {tags.data?.length ?? 0} tags cadastradas
          </span>
        }
        acoes={
          podeCriar ? (
            <Botao
              variante="primario"
              iconeInicio={<Plus />}
              onClick={() => {
                setErro(null)
                setForm({ nome: '', descricao: '', cor: CORES_DISPONIVEIS[0].valor })
                setCriandoTag(true)
              }}
            >
              Nova Tag
            </Botao>
          ) : undefined
        }
      />

      {/* Barra de busca */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar tags..."
            className="w-full rounded-lg border border-line bg-surface-2 py-2 pl-10 pr-10 text-[13px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Filtro por tipo de entidade */}
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface-2 p-1">
          <button
            onClick={() => setFiltroEntidade('todas')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors',
              filtroEntidade === 'todas'
                ? 'bg-accent text-white'
                : 'text-ink-3 hover:bg-surface',
            )}
          >
            Todas
          </button>
          {(Object.keys(ICONES_ENTIDADE) as EntidadeTag[]).map((entidade) => (
            <button
              key={entidade}
              onClick={() => setFiltroEntidade(entidade)}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                filtroEntidade === entidade
                  ? 'bg-accent text-white'
                  : 'text-ink-3 hover:bg-surface',
              )}
              title={ICONES_ENTIDADE[entidade].label}
            >
              {ICONES_ENTIDADE[entidade].icon}
              <span className="hidden sm:inline">{ICONES_ENTIDADE[entidade].label.split(' ')[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Total de vínculos, somando o que cada tag realmente marca. */}
      {usoTags.data && tagsComUso.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'cliente', label: 'Clientes marcados', count: tagsComUso.reduce((a, t) => a + t.uso.clientes, 0) },
            { key: 'os', label: 'Ordens marcadas', count: tagsComUso.reduce((a, t) => a + t.uso.ordens, 0) },
          ] as const).map(({ key, label, count }) => (
            <div key={key} className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1">
              {ICONES_ENTIDADE[key]?.icon}
              <span className="text-[11px] text-ink-3">{label}:</span>
              <span className="num text-[11px] font-semibold text-ink">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Lista de Tags */}
      {tags.isLoading && <EstadoCarregando rotulo="Carregando tags..." />}
      {tags.isError && <EstadoErro descricao={mensagemErro(tags.error)} aoTentarNovamente={() => void tags.refetch()} />}
      {tags.isSuccess && tagsFiltradas.length === 0 && (
        <EstadoVazio
          icone={<Tag />}
          titulo={busca ? 'Nenhuma tag encontrada' : 'Nenhuma tag cadastrada'}
          descricao={busca ? 'Tente buscar por outros termos' : 'Crie tags para organizar e categorizar seus registros.'}
        />
      )}
      {tags.isSuccess && tagsFiltradas.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tagsFiltradas.map(({ tag, total }) => (
            <div
              key={tag.id}
              className={cn(
                'group flex items-center justify-between rounded-lg border bg-surface p-3 transition-colors hover:border-accent/30',
                tag.situacao === 'inativo' && 'opacity-50',
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.cor ?? '#3B82F6' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-ink">{tag.nome}</p>
                  <p className="truncate text-[11px] text-ink-3">
                    {tag.descricao ? `${tag.descricao} · ` : ''}
                    {total === 0 ? 'sem uso' : total === 1 ? '1 registro' : `${total} registros`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {podeEditar && (
                  <button
                    onClick={() => abrirEdicao(tag)}
                    className="flex size-7 items-center justify-center rounded text-ink-3 hover:bg-surface-2 hover:text-ink"
                  >
                    <Edit3 className="size-3.5" />
                  </button>
                )}
                {podeExcluir && (
                  <button
                    onClick={() => setExcluindoTag(tag)}
                    className="flex size-7 items-center justify-center rounded text-ink-3 hover:bg-crit-soft/50 hover:text-crit"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal criar tag */}
      <PainelLateral
        aberto={criandoTag}
        aoFechar={() => setCriandoTag(false)}
        largura="sm"
        titulo="Nova Tag"
        descricao="Tags permitem categorizar e organizar seus registros."
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setCriandoTag(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={criarTag.isPending} onClick={() => criarTag.mutate()}>
              Criar Tag
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <Aviso tom="critico">{erro}</Aviso>}
          <Campo rotulo="Nome" obrigatorio>
            {(p) => (
              <Entrada
                {...p}
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex: VIP, Urgente, Retorno..."
              />
            )}
          </Campo>
          <Campo rotulo="Descrição">
            {(p) => (
              <Entrada
                {...p}
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Breve descrição do uso da tag..."
              />
            )}
          </Campo>
          <Campo rotulo="Cor">
            {() => (
              <div className="flex flex-wrap gap-2">
                {CORES_DISPONIVEIS.map((cor) => (
                  <button
                    key={cor.valor}
                    onClick={() => setForm({ ...form, cor: cor.valor })}
                    className={cn(
                      'size-8 rounded-full transition-all',
                      form.cor === cor.valor && 'ring-2 ring-offset-2 ring-accent',
                    )}
                    style={{ backgroundColor: cor.valor }}
                    title={cor.nome}
                  />
                ))}
              </div>
            )}
          </Campo>
          <div className="rounded-lg border border-line bg-surface-2 p-3">
            <p className="mb-2 text-[11px] font-medium text-ink-3">Preview</p>
            <div className="flex items-center gap-2">
              <div
                className="size-3 rounded-full"
                style={{ backgroundColor: form.cor }}
              />
              <span className="text-[13px] font-medium text-ink">
                {form.nome || 'Nome da tag'}
              </span>
            </div>
          </div>
        </div>
      </PainelLateral>

      {/* Modal editar tag */}
      <PainelLateral
        aberto={Boolean(editandoTag)}
        aoFechar={() => setEditandoTag(null)}
        largura="sm"
        titulo="Editar Tag"
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setEditandoTag(null)}>Cancelar</Botao>
            <Botao variante="primario" carregando={editarTag.isPending} onClick={() => editarTag.mutate()}>
              Salvar
            </Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <Aviso tom="critico">{erro}</Aviso>}
          <Campo rotulo="Nome" obrigatorio>
            {(p) => (
              <Entrada
                {...p}
                value={formEdit.nome}
                onChange={(e) => setFormEdit({ ...formEdit, nome: e.target.value })}
              />
            )}
          </Campo>
          <Campo rotulo="Descrição">
            {(p) => (
              <Entrada
                {...p}
                value={formEdit.descricao}
                onChange={(e) => setFormEdit({ ...formEdit, descricao: e.target.value })}
              />
            )}
          </Campo>
          <Campo rotulo="Cor">
            {() => (
              <div className="flex flex-wrap gap-2">
                {CORES_DISPONIVEIS.map((cor) => (
                  <button
                    key={cor.valor}
                    onClick={() => setFormEdit({ ...formEdit, cor: cor.valor })}
                    className={cn(
                      'size-8 rounded-full transition-all',
                      formEdit.cor === cor.valor && 'ring-2 ring-offset-2 ring-accent',
                    )}
                    style={{ backgroundColor: cor.valor }}
                    title={cor.nome}
                  />
                ))}
              </div>
            )}
          </Campo>
          <Campo rotulo="Situação">
            {() => (
              <select
                value={formEdit.situacao}
                onChange={(e) => setFormEdit({ ...formEdit, situacao: e.target.value as 'ativo' | 'inativo' })}
                className="w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink focus:border-accent focus:outline-none"
              >
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </select>
            )}
          </Campo>
        </div>
      </PainelLateral>

      {/* Confirmação de exclusão */}
      <Confirmacao
        aberto={Boolean(excluindoTag)}
        aoFechar={() => setExcluindoTag(null)}
        aoConfirmar={() => excluirTag.mutate()}
        carregando={excluirTag.isPending}
        titulo="Excluir tag"
        rotuloConfirmar="Excluir"
        destrutivo
        descricao={
          <>
            <p>
              Tem certeza que deseja excluir a tag <strong>{excluindoTag?.nome}</strong>?
            </p>
            <p className="mt-2 text-[12px] text-ink-3">
              {(() => {
                const uso = excluindoTag ? usoTags.data?.[excluindoTag.id] : undefined
                const total = (uso?.clientes ?? 0) + (uso?.ordens ?? 0)
                return total === 0
                  ? 'Nenhum registro usa esta tag hoje.'
                  : `A tag sai de ${total} registro(s). O histórico dos registros é preservado.`
              })()}
            </p>
          </>
        }
      />
    </div>
  )
}
