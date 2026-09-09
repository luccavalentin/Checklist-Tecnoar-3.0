import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Clock, Flag, ListChecks, Plus, SlidersHorizontal } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro } from '@/lib/utils'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { Alternador, AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Confirmacao, PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import type { CategoriaStatusOS, SituacaoRegistro, StatusOS as Status } from '@/tipos/db'

/** Cores disponíveis para o status — presas aos tokens do design system. */
export const CORES_STATUS: Array<{ valor: string; rotulo: string; classe: string }> = [
  { valor: 'neutro', rotulo: 'Neutro', classe: 'bg-ink-3' },
  { valor: 'ciano', rotulo: 'Ciano', classe: 'bg-cyan' },
  { valor: 'laranja', rotulo: 'Laranja', classe: 'bg-accent' },
  { valor: 'atencao', rotulo: 'Atenção', classe: 'bg-warn' },
  { valor: 'sucesso', rotulo: 'Sucesso', classe: 'bg-ok' },
  { valor: 'critico', rotulo: 'Crítico', classe: 'bg-crit' },
]

export const CLASSE_COR_STATUS: Record<string, string> = Object.fromEntries(
  CORES_STATUS.map((c) => [c.valor, c.classe]),
)

export const TOM_COR_STATUS: Record<string, 'neutro' | 'info' | 'destaque' | 'atencao' | 'ok' | 'critico'> = {
  neutro: 'neutro',
  ciano: 'info',
  laranja: 'destaque',
  atencao: 'atencao',
  sucesso: 'ok',
  critico: 'critico',
}

const CATEGORIAS: Array<{ valor: CategoriaStatusOS; rotulo: string }> = [
  { valor: 'entrada', rotulo: 'Entrada' },
  { valor: 'diagnostico', rotulo: 'Diagnóstico' },
  { valor: 'aprovacao', rotulo: 'Aprovação' },
  { valor: 'espera', rotulo: 'Espera' },
  { valor: 'execucao', rotulo: 'Execução' },
  { valor: 'finalizacao', rotulo: 'Finalização' },
  { valor: 'concluido', rotulo: 'Concluído' },
  { valor: 'cancelado', rotulo: 'Cancelado' },
]

const ROTULO_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.valor, c.rotulo])) as Record<
  CategoriaStatusOS,
  string
>

/* ═══════════════════════════════════════════════════════════════
   KPI CARD — Premium Design Compacto Clicável
   ═══════════════════════════════════════════════════════════════ */
function KpiCard({ valor, rotulo, subrotulo, cor, icone, indice, onClick }: {
  valor: string | number; rotulo: string; subrotulo?: string; cor: string; icone: React.ReactNode; indice: number; onClick?: () => void
}) {
  return (
    <div onClick={onClick}
      className={cn('group relative overflow-hidden rounded-xl border border-line/50 bg-gradient-to-br from-surface to-surface-2 p-3 transition-all duration-300',
        onClick ? 'cursor-pointer hover:shadow-lg hover:shadow-accent/5 hover:-translate-y-0.5' : '')}
      style={{ animationDelay: `${indice * 80}ms` }}>
      <div className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full opacity-15 blur-xl" style={{ backgroundColor: cor }} />
      </div>
      <div className="relative flex items-center justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-ink-3 truncate">{rotulo}</span>
          <span className="font-mono text-[22px] font-bold tracking-tight text-ink transition-transform duration-300 group-hover:scale-105">{valor}</span>
          {subrotulo && <span className="text-[9px] text-ink-3 truncate">{subrotulo}</span>}
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line/50 transition-all duration-300 group-hover:scale-110"
          style={{ backgroundColor: `${cor}10`, boxShadow: `0 0 12px ${cor}20` }}>
          <div style={{ color: cor }} className="scale-90">{icone}</div>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 h-[2px] w-0 rounded-b-xl transition-all duration-500 group-hover:w-full" style={{ background: `linear-gradient(90deg, ${cor}, transparent)` }} />
      {onClick && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="text-[9px] font-medium text-ink-3 bg-surface/80 px-2 py-1 rounded-full backdrop-blur-sm">Ver lista →</span>
        </div>
      )}
    </div>
  )
}

interface FormStatus {
  nome: string
  descricao: string
  categoria: CategoriaStatusOS
  cor: string
  conta_no_patio: boolean
  is_final: boolean
  situacao: SituacaoRegistro
}

const VAZIO: FormStatus = {
  nome: '',
  descricao: '',
  categoria: 'execucao',
  cor: 'neutro',
  conta_no_patio: true,
  is_final: false,
  situacao: 'ativo',
}

export function StatusOS() {
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const [editando, setEditando] = useState<Status | null>(null)
  const [criando, setCriando] = useState(false)
  const [alvo, setAlvo] = useState<Status | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const podeVer = pode('status_os', 'visualizar')
  const podeCriar = pode('status_os', 'criar')
  const podeEditar = pode('status_os', 'editar')
  const podeInativar = pode('status_os', 'inativar')
  const podeConfigurar = pode('status_os', 'configurar')

  const lista = useQuery({
    queryKey: ['status_os', 'lista'],
    enabled: podeVer,
    queryFn: async (): Promise<Status[]> => {
      const { data, error } = await supabase.from('status_os').select('*').order('ordem')
      if (error) throw error
      return data ?? []
    },
  })

  const form = useForm<FormStatus>({ defaultValues: VAZIO })

  useEffect(() => {
    if (editando) {
      form.reset({
        nome: editando.nome,
        descricao: editando.descricao ?? '',
        categoria: editando.categoria,
        cor: editando.cor,
        conta_no_patio: editando.conta_no_patio,
        is_final: editando.is_final,
        situacao: editando.situacao,
      })
    } else if (criando) form.reset(VAZIO)
    setErro(null)
  }, [editando, criando, form])

  const salvar = useMutation({
    mutationFn: async (d: FormStatus) => {
      if (d.nome.trim().length < 2) throw new Error('Informe o nome do status.')
      const maiorOrdem = Math.max(0, ...(lista.data ?? []).map((s) => s.ordem))
      const payload = {
        nome: d.nome.trim(),
        descricao: d.descricao.trim() || null,
        categoria: d.categoria,
        cor: d.cor,
        conta_no_patio: d.conta_no_patio,
        is_final: d.is_final,
        situacao: d.situacao,
        ...(editando ? {} : { ordem: maiorOrdem + 10 }),
      }
      const r = editando
        ? await supabase.from('status_os').update(payload).eq('id', editando.id)
        : await supabase.from('status_os').insert(payload)
      if (r.error) throw r.error
    },
    onSuccess: () => {
      toast.ok(editando ? 'Status atualizado' : 'Status criado')
      setEditando(null)
      setCriando(false)
      void qc.invalidateQueries({ queryKey: ['status_os'] })
    },
    onError: (e) => {
      const m = mensagemErro(e)
      setErro(m.includes('duplicate key') ? 'Já existe um status com este nome.' : m)
    },
  })

  const mover = useMutation({
    mutationFn: async ({ item, direcao }: { item: Status; direcao: -1 | 1 }) => {
      const itens = [...(lista.data ?? [])]
      const i = itens.findIndex((s) => s.id === item.id)
      const j = i + direcao
      if (i < 0 || j < 0 || j >= itens.length) return
      const outro = itens[j]!
      const [a, b] = [item.ordem, outro.ordem]
      const r1 = await supabase.from('status_os').update({ ordem: b }).eq('id', item.id)
      if (r1.error) throw r1.error
      const r2 = await supabase.from('status_os').update({ ordem: a }).eq('id', outro.id)
      if (r2.error) throw r2.error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['status_os'] }),
    onError: (e) => toast.erro('Não foi possível reordenar', mensagemErro(e)),
  })

  const mudarSituacao = useMutation({
    mutationFn: async (s: Status) => {
      const nova: SituacaoRegistro = s.situacao === 'ativo' ? 'inativo' : 'ativo'
      const { error } = await supabase.from('status_os').update({ situacao: nova }).eq('id', s.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Situação alterada')
      setAlvo(null)
      void qc.invalidateQueries({ queryKey: ['status_os'] })
    },
    onError: (e) => toast.erro('Não foi possível alterar', mensagemErro(e)),
  })


  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-6 rounded-full bg-accent" />
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Cadastros</p>
        </div>
        <h1 className="font-display text-xl font-bold text-ink">Status da OS</h1>
        <EstadoSemPermissao />
      </div>
    )
  }

  const stats = lista.data ? {
    total: lista.data.length,
    ativos: lista.data.filter(s => s.situacao === 'ativo').length,
    inativos: lista.data.filter(s => s.situacao === 'inativo').length,
    finais: lista.data.filter(s => s.is_final).length,
    noPatio: lista.data.filter(s => s.conta_no_patio).length,
  } : null

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="h-0.5 w-6 rounded-full bg-accent" />
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-ink-3">Cadastros</p>
          </div>
          <h1 className="font-display text-xl font-bold text-ink">Status da OS</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stats && (
            <span className="rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-[12px] text-ink-2">
              {stats.total} status
            </span>
          )}
          {podeCriar && (
            <Botao variante="primario" iconeInicio={<Plus className="size-4" />} onClick={() => setCriando(true)}>
              Novo Status
            </Botao>
          )}
        </div>
      </div>

      {/* Cards de Estatísticas */}
      {stats && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <KpiCard indice={0} valor={stats.total} rotulo="Total" subrotulo="status" cor="var(--c-accent)" icone={<SlidersHorizontal className="size-4" />} />
          <KpiCard indice={1} valor={stats.ativos} rotulo="Ativos" subrotulo="no sistema" cor="var(--c-ok)" icone={<CheckCircle2 className="size-4" />} />
          <KpiCard indice={2} valor={stats.inativos} rotulo="Inativos" subrotulo="desativados" cor="var(--c-warn)" icone={<Clock className="size-4" />} />
          <KpiCard indice={3} valor={stats.finais} rotulo="Finais" subrotulo="concluem a OS" cor="var(--c-cyan)" icone={<Flag className="size-4" />} />
          <KpiCard indice={4} valor={stats.noPatio} rotulo="No Pátio" subrotulo="ocupam vaga" cor="var(--c-crit)" icone={<Circle className="size-4" />} />
        </div>
      )}

      <Aviso tom="info">
        A ordem define a sequência das colunas no Painel do Pátio e no Modo TV. "Conta no pátio" determina se o veículo continua ocupando posição enquanto estiver neste status.
      </Aviso>

      <Painel semPadding>
        <CabecalhoPainel titulo="Fluxo da ordem de serviço" descricao="Da entrada até a entrega." />
        <div className="p-2">
          {lista.isLoading && <EstadoCarregando rotulo="Carregando status…" />}
          {lista.isError && (
            <EstadoErro descricao={mensagemErro(lista.error)} aoTentarNovamente={() => void lista.refetch()} />
          )}
          {lista.isSuccess && lista.data.length === 0 && (
            <EstadoVazio icone={<ListChecks />} titulo="Nenhum status configurado" descricao="Crie o primeiro status do fluxo." compacto />
          )}
          {lista.isSuccess &&
            lista.data.map((s, i) => (
              <div
                key={s.id}
                /* Mesmo atalho das tabelas: dois cliques abrem a edição. */
                onDoubleClick={
                  podeEditar
                    ? () => {
                        window.getSelection?.()?.removeAllRanges()
                        setEditando(s)
                      }
                    : undefined
                }
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-2',
                  podeEditar && 'cursor-pointer',
                  s.situacao === 'inativo' && 'opacity-55',
                )}
              >
                <span className="num w-8 shrink-0 text-[12px] text-ink-3">{String(i + 1).padStart(2, '0')}</span>
                <span aria-hidden className={cn('size-2.5 shrink-0 rounded-sm', CLASSE_COR_STATUS[s.cor] ?? 'bg-ink-3')} />

                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13.5px] font-medium text-ink">{s.nome}</span>
                  {s.descricao && <span className="truncate text-[12px] text-ink-3">{s.descricao}</span>}
                </div>

                <Selo tom="neutro" className="hidden md:inline-flex">{ROTULO_CATEGORIA[s.categoria]}</Selo>
                {s.conta_no_patio ? (
                  <Selo tom="info" className="hidden lg:inline-flex">No pátio</Selo>
                ) : (
                  <Selo tom="neutro" className="hidden lg:inline-flex">Fora do pátio</Selo>
                )}
                {s.is_final && <Selo tom="ok" className="hidden lg:inline-flex">Final</Selo>}
                {s.is_system && <Selo tom="neutro">Sistema</Selo>}

                {podeConfigurar && (
                  <div className="flex shrink-0">
                    <BotaoIcone rotulo="Subir" tamanho="sm" disabled={i === 0 || mover.isPending} onClick={() => mover.mutate({ item: s, direcao: -1 })}>
                      <ChevronUp />
                    </BotaoIcone>
                    <BotaoIcone rotulo="Descer" tamanho="sm" disabled={i === lista.data.length - 1 || mover.isPending} onClick={() => mover.mutate({ item: s, direcao: 1 })}>
                      <ChevronDown />
                    </BotaoIcone>
                  </div>
                )}

                <div className="flex shrink-0 gap-1">
                  {podeEditar && <Botao tamanho="sm" variante="fantasma" onClick={() => setEditando(s)}>Editar</Botao>}
                  {podeInativar && !s.is_system && (
                    <Botao tamanho="sm" variante="fantasma" onClick={() => setAlvo(s)}>
                      {s.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
                    </Botao>
                  )}
                </div>
              </div>
            ))}
        </div>
      </Painel>

      <PainelLateral
        aberto={criando || Boolean(editando)}
        aoFechar={() => { setCriando(false); setEditando(null) }}
        titulo={editando ? 'Editar status' : 'Novo status'}
        rodape={
          <>
            <Botao variante="neutro" onClick={() => { setCriando(false); setEditando(null) }}>Cancelar</Botao>
            <Botao variante="primario" carregando={salvar.isPending} onClick={form.handleSubmit((d) => salvar.mutate(d))}>Salvar</Botao>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((d) => salvar.mutate(d))}>
          {erro && <Aviso tom="critico">{erro}</Aviso>}

          <Campo rotulo="Nome" obrigatorio>
            {(p) => <Entrada {...p} {...form.register('nome', { required: true })} autoFocus />}
          </Campo>
          <Campo rotulo="Descrição">
            {(p) => <AreaTexto {...p} {...form.register('descricao')} rows={2} />}
          </Campo>
          <Campo rotulo="Categoria" dica="Agrupa o status para indicadores e para o painel.">
            {(p) => (
              <Selecao {...p} {...form.register('categoria')}>
                {CATEGORIAS.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
              </Selecao>
            )}
          </Campo>

          <div className="flex flex-col gap-2">
            <span className="lbl">Identidade visual</span>
            <div className="flex flex-wrap gap-2">
              {CORES_STATUS.map((c) => {
                const ativa = form.watch('cor') === c.valor
                return (
                  <button
                    key={c.valor}
                    type="button"
                    aria-pressed={ativa}
                    onClick={() => form.setValue('cor', c.valor, { shouldDirty: true })}
                    className={cn(
                      'flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] transition-colors',
                      ativa ? 'border-cyan bg-cyan-soft text-ink' : 'border-line-strong text-ink-2 hover:text-ink',
                    )}
                  >
                    <span aria-hidden className={cn('size-2.5 rounded-sm', c.classe)} />
                    {c.rotulo}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-line p-3.5">
            <Alternador rotulo="Conta no pátio" ativo={form.watch('conta_no_patio')} onChange={(v) => form.setValue('conta_no_patio', v, { shouldDirty: true })} />
            <div className="flex flex-col gap-0.5">
              <span className="text-[13.5px] font-medium text-ink">Conta no pátio</span>
              <span className="text-[12px] leading-relaxed text-ink-3">O veículo neste status ainda ocupa posição no pátio e entra nos indicadores.</span>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-line p-3.5">
            <Alternador rotulo="Status final" ativo={form.watch('is_final')} onChange={(v) => form.setValue('is_final', v, { shouldDirty: true })} />
            <div className="flex flex-col gap-0.5">
              <span className="text-[13.5px] font-medium text-ink">Status final</span>
              <span className="text-[12px] leading-relaxed text-ink-3">Encerra o atendimento. A OS deixa de ser considerada em andamento.</span>
            </div>
          </div>

          <Campo rotulo="Situação">
            {(p) => (
              <Selecao {...p} {...form.register('situacao')}>
                <option value="ativo">Ativo</option>
                <option value="inativo">Inativo</option>
              </Selecao>
            )}
          </Campo>
        </form>
      </PainelLateral>

      <Confirmacao
        aberto={Boolean(alvo)}
        aoFechar={() => setAlvo(null)}
        aoConfirmar={() => alvo && mudarSituacao.mutate(alvo)}
        carregando={mudarSituacao.isPending}
        destrutivo={alvo?.situacao === 'ativo'}
        titulo={alvo?.situacao === 'ativo' ? 'Inativar status?' : 'Reativar status?'}
        rotuloConfirmar={alvo?.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
        descricao={<><strong className="font-semibold text-ink">{alvo?.nome}</strong> {alvo?.situacao === 'ativo' ? 'deixa de ser oferecido em novas OS. As OS que já estão nele continuam válidas.' : 'volta a ficar disponível no fluxo.'}</>}
      />
    </div>
  )
}
