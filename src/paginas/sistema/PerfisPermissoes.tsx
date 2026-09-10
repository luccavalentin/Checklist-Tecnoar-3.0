import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus, Shield } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { CabecalhoPagina, Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, AreaTexto, Entrada, Segmentado } from '@/componentes/ui/Campo'
import { Confirmacao, PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { CaixaPermissao, MatrizPermissoes } from './MatrizPermissoes'
import type { AcaoPermissao, PerfilAcesso, SituacaoRegistro } from '@/tipos/db'

interface FormPerfil {
  nome: string
  descricao: string
  situacao: SituacaoRegistro
}

export function PerfisPermissoes() {
  const qc = useQueryClient()
  const toast = useToast()
  const { pode } = usePermissoes()

  const podeVer = pode('perfis_permissoes', 'visualizar')
  const podeCriar = pode('perfis_permissoes', 'criar')
  const podeEditar = pode('perfis_permissoes', 'editar')
  const podeConfigurar = pode('perfis_permissoes', 'configurar')
  const podeInativar = pode('perfis_permissoes', 'inativar')


  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [editando, setEditando] = useState<PerfilAcesso | null>(null)
  const [criando, setCriando] = useState(false)
  const [alvoSituacao, setAlvoSituacao] = useState<PerfilAcesso | null>(null)

  const perfis = useQuery({
    queryKey: ['perfis_acesso', 'lista'],
    enabled: podeVer,
    queryFn: async (): Promise<PerfilAcesso[]> => {
      const { data, error } = await supabase.from('perfis_acesso').select('*').order('nome')
      if (error) throw error
      return data ?? []
    },
  })

  useEffect(() => {
    if (!selecionado && perfis.data?.length) setSelecionado(perfis.data[0]!.id)
  }, [perfis.data, selecionado])

  const permissoes = useQuery({
    queryKey: ['perfil_permissoes', selecionado],
    enabled: Boolean(selecionado),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('perfil_permissoes')
        .select('recurso, acao')
        .eq('perfil_id', selecionado!)
      if (error) throw error
      return new Set((data ?? []).map((p) => `${p.recurso}:${p.acao}`))
    },
  })

  const alternar = useMutation({
    mutationFn: async ({ recurso, acao, marcar }: { recurso: string; acao: AcaoPermissao; marcar: boolean }) => {
      if (!selecionado) return
      if (marcar) {
        const { error } = await supabase
          .from('perfil_permissoes')
          .insert({ perfil_id: selecionado, recurso, acao })
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('perfil_permissoes')
          .delete()
          .eq('perfil_id', selecionado)
          .eq('recurso', recurso)
          .eq('acao', acao)
        if (error) throw error
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['perfil_permissoes', selecionado] })
      void qc.invalidateQueries({ queryKey: ['minhas-permissoes'] })
    },
    onError: (e) => toast.erro('Não foi possível alterar a permissão', mensagemErro(e)),
  })

  const form = useForm<FormPerfil>({ defaultValues: { nome: '', descricao: '', situacao: 'ativo' } })

  useEffect(() => {
    if (editando) form.reset({ nome: editando.nome, descricao: editando.descricao ?? '', situacao: editando.situacao })
    else if (criando) form.reset({ nome: '', descricao: '', situacao: 'ativo' })
  }, [editando, criando, form])

  const salvarPerfil = useMutation({
    mutationFn: async (d: FormPerfil) => {
      const nome = d.nome.trim()
      if (nome.length < 2) throw new Error('Informe um nome com ao menos 2 caracteres.')
      const payload = { nome, descricao: d.descricao.trim() || null, situacao: d.situacao }
      const r = editando
        ? await supabase.from('perfis_acesso').update(payload).eq('id', editando.id)
        : await supabase.from('perfis_acesso').insert(payload)
      if (r.error) throw r.error
    },
    onSuccess: () => {
      toast.ok(editando ? 'Perfil atualizado' : 'Perfil criado')
      setEditando(null)
      setCriando(false)
      void qc.invalidateQueries({ queryKey: ['perfis_acesso'] })
    },
    onError: (e) => {
      const m = mensagemErro(e)
      toast.erro('Não foi possível salvar', m.includes('duplicate') ? 'Já existe um perfil com este nome.' : m)
    },
  })

  const mudarSituacao = useMutation({
    mutationFn: async (p: PerfilAcesso) => {
      const nova: SituacaoRegistro = p.situacao === 'ativo' ? 'inativo' : 'ativo'
      const { error } = await supabase.from('perfis_acesso').update({ situacao: nova }).eq('id', p.id)
      if (error) throw error
      return nova
    },
    onSuccess: () => {
      toast.ok('Situação alterada')
      setAlvoSituacao(null)
      void qc.invalidateQueries({ queryKey: ['perfis_acesso'] })
    },
    onError: (e) => toast.erro('Não foi possível alterar', mensagemErro(e)),
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Sistema" titulo="Perfis e Permissões" />
        <EstadoSemPermissao />
      </div>
    )
  }

  const perfilAtual = perfis.data?.find((p) => p.id === selecionado) ?? null

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Sistema"
        titulo="Perfis e Permissões"
        acoes={
          podeCriar ? (
            <Botao variante="primario" iconeInicio={<Plus />} onClick={() => setCriando(true)}>
              Novo perfil
            </Botao>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-[290px_1fr] lg:items-start">
        <Painel semPadding>
          <CabecalhoPainel titulo="Perfis" descricao="Cada perfil reúne um conjunto de permissões." />
          <div className="p-2">
            {perfis.isLoading && <EstadoCarregando rotulo="Carregando perfis…" className="min-h-40" />}
            {perfis.isError && (
              <EstadoErro
                descricao={mensagemErro(perfis.error)}
                aoTentarNovamente={() => void perfis.refetch()}
                compacto
              />
            )}
            {perfis.isSuccess && perfis.data.length === 0 && (
              <EstadoVazio icone={<Shield />} titulo="Nenhum perfil" descricao="Crie o primeiro perfil de acesso." compacto />
            )}
            {perfis.isSuccess &&
              perfis.data.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelecionado(p.id)}
                  className={
                    'flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors ' +
                    (p.id === selecionado ? 'bg-accent-soft' : 'hover:bg-surface-2')
                  }
                >
                  <span className="flex items-center gap-2">
                    <span className="flex-1 truncate text-[13.5px] font-medium text-ink">{p.nome}</span>
                    {p.is_system && <Selo tom="neutro">Sistema</Selo>}
                    {p.situacao === 'inativo' && <Selo tom="neutro">Inativo</Selo>}
                  </span>
                  {p.descricao && <span className="line-clamp-2 text-[12px] text-ink-3">{p.descricao}</span>}
                </button>
              ))}
          </div>
        </Painel>

        <Painel semPadding>
          <CabecalhoPainel
            titulo={perfilAtual ? `Permissões — ${perfilAtual.nome}` : 'Permissões'}
            descricao={
              perfilAtual?.is_system
                ? 'Perfil de sistema: tem acesso total e não é editável.'
                : 'Marque o que este perfil pode fazer. A regra vale no servidor, não só na tela.'
            }
            acao={
              perfilAtual && !perfilAtual.is_system ? (
                <div className="flex gap-1.5">
                  {podeEditar && (
                    <Botao tamanho="sm" variante="fantasma" onClick={() => setEditando(perfilAtual)}>
                      Editar
                    </Botao>
                  )}
                  {podeInativar && (
                    <Botao tamanho="sm" variante="fantasma" onClick={() => setAlvoSituacao(perfilAtual)}>
                      {perfilAtual.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
                    </Botao>
                  )}
                </div>
              ) : undefined
            }
          />

          <div className="p-5">
            {!perfilAtual ? (
              <EstadoVazio titulo="Selecione um perfil" descricao="Escolha um perfil à esquerda para ver as permissões." compacto />
            ) : perfilAtual.is_system ? (
              <Aviso tom="info" titulo="Acesso total">
                O perfil <strong className="font-semibold text-ink">{perfilAtual.nome}</strong> concede todas as
                permissões do sistema por definição. Para restringir alguém, use outro perfil ou uma exceção
                individual em Cadastros › Usuários.
              </Aviso>
            ) : permissoes.isLoading ? (
              <EstadoCarregando rotulo="Carregando permissões…" />
            ) : permissoes.isError ? (
              <EstadoErro
                descricao={mensagemErro(permissoes.error)}
                aoTentarNovamente={() => void permissoes.refetch()}
              />
            ) : (
              <MatrizPermissoes
                somenteLeitura={!podeConfigurar}
                aoRenderizarCelula={(recurso, acao) => {
                  const chave = `${recurso.chave}:${acao}`
                  const marcada = permissoes.data!.has(chave)
                  return (
                    <CaixaPermissao
                      rotulo={`${recurso.nome} — ${acao}`}
                      marcada={marcada}
                      desabilitada={!podeConfigurar || alternar.isPending}
                      aoAlternar={() => alternar.mutate({ recurso: recurso.chave, acao, marcar: !marcada })}
                    />
                  )
                }}
              />
            )}
          </div>
        </Painel>
      </div>

      <PainelLateral
        aberto={criando || Boolean(editando)}
        aoFechar={() => {
          setCriando(false)
          setEditando(null)
        }}
        titulo={editando ? 'Editar perfil' : 'Novo perfil de acesso'}
        rodape={
          <>
            <Botao
              variante="neutro"
              onClick={() => {
                setCriando(false)
                setEditando(null)
              }}
            >
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              carregando={salvarPerfil.isPending}
              onClick={form.handleSubmit((d) => salvarPerfil.mutate(d))}
            >
              Salvar
            </Botao>
          </>
        }
      >
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((d) => salvarPerfil.mutate(d))}>
          <Campo rotulo="Nome do perfil" obrigatorio>
            {(p) => <Entrada {...p} {...form.register('nome', { required: true })} autoFocus placeholder="Ex.: Operação Mecânica" />}
          </Campo>
          <Campo rotulo="Descrição" dica="Explique em uma linha o que este perfil representa.">
            {(p) => <AreaTexto {...p} {...form.register('descricao')} rows={3} />}
          </Campo>
          <Campo rotulo="Situação">
            {() => (
              <Segmentado
                rotuloGrupo="Situação"
                valor={form.watch('situacao')}
                onChange={(v) => form.setValue('situacao', v, { shouldDirty: true })}
                opcoes={[
                  { valor: 'ativo' as SituacaoRegistro, rotulo: 'Ativo' },
                  { valor: 'inativo' as SituacaoRegistro, rotulo: 'Inativo' },
                ]}
              />
            )}
          </Campo>
          {!editando && (
            <Aviso tom="info">
              O perfil nasce sem nenhuma permissão. Marque na matriz o que ele pode fazer depois de salvar.
            </Aviso>
          )}
        </form>
      </PainelLateral>

      <Confirmacao
        aberto={Boolean(alvoSituacao)}
        aoFechar={() => setAlvoSituacao(null)}
        aoConfirmar={() => alvoSituacao && mudarSituacao.mutate(alvoSituacao)}
        carregando={mudarSituacao.isPending}
        destrutivo={alvoSituacao?.situacao === 'ativo'}
        titulo={alvoSituacao?.situacao === 'ativo' ? 'Inativar perfil?' : 'Reativar perfil?'}
        rotuloConfirmar={alvoSituacao?.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
        descricao={
          alvoSituacao?.situacao === 'ativo'
            ? 'O perfil deixa de aparecer para atribuição. Quem já o tem continua com as permissões atuais até ser movido para outro perfil.'
            : 'O perfil volta a ficar disponível para atribuição.'
        }
      />

    </div>
  )
}
