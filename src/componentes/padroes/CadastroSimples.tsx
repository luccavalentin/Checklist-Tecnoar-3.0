import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Plus } from 'lucide-react'
import { tabelaDinamica } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { CabecalhoPagina } from '@/componentes/ui/Painel'
import { BarraFiltros } from '@/componentes/ui/BarraFiltros'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Alternador, AreaTexto, Entrada, Segmentado } from '@/componentes/ui/Campo'
import { Paginacao, Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { PainelLateral, Confirmacao } from '@/componentes/ui/Sobreposicoes'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'
import type { Database, SituacaoRegistro } from '@/tipos/db'

export interface CampoBooleano {
  chave: string
  rotulo: string
  dica?: string
  /** Rótulo curto exibido como selo na listagem quando verdadeiro. */
  selo?: string
}

export interface RegistroSimples {
  id: string
  nome: string
  descricao: string | null
  situacao: SituacaoRegistro
  is_system?: boolean
  [k: string]: unknown
}

export interface ConfigCadastroSimples {
  recurso: string
  tabela: keyof Database['public']['Tables']
  sobretitulo: string
  titulo: string
  /** Singular, usado nos textos de ação. Ex.: 'especialidade'. */
  singular: string
  artigo?: 'a' | 'o'
  placeholderBusca: string
  descricaoVazio: string
  camposBooleanos?: CampoBooleano[]
}

interface Formulario {
  nome: string
  descricao: string
  situacao: SituacaoRegistro
  [k: string]: unknown
}

export function CadastroSimples({ config }: { config: ConfigCadastroSimples }) {
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()
  const artigo = config.artigo ?? 'a'

  const ctrl = useControleListagem(25)
  const [situacao, setSituacao] = useState<'todas' | SituacaoRegistro>('ativo')
  const [emEdicao, setEmEdicao] = useState<RegistroSimples | null>(null)
  const [criando, setCriando] = useState(false)
  const [inativando, setInativando] = useState<RegistroSimples | null>(null)

  const podeCriar = pode(config.recurso, 'criar')
  const podeEditar = pode(config.recurso, 'editar')
  const podeInativar = pode(config.recurso, 'inativar')
  const podeVer = pode(config.recurso, 'visualizar')

  const booleanos = useMemo(() => config.camposBooleanos ?? [], [config.camposBooleanos])

  const filtrar = useMemo(
    () => (q: Consulta) => {
      const t = termoBusca(ctrl.busca)
      let r = q
      if (t.length >= 2) r = r.or(`nome.ilike.%${t}%,descricao.ilike.%${t}%`)
      if (situacao !== 'todas') r = r.eq('situacao', situacao)
      return r
    },
    [ctrl.busca, situacao],
  )

  const lista = useListagem<RegistroSimples>({
    chave: [config.tabela, 'lista', ctrl.busca, situacao, ctrl.pagina, ctrl.porPagina],
    tabela: config.tabela,
    select: '*',
    filtrar,
    ordenacao: { coluna: 'nome', ascendente: true },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
    habilitado: podeVer,
  })

  const form = useForm<Formulario>({
    defaultValues: { nome: '', descricao: '', situacao: 'ativo' },
  })

  useEffect(() => {
    if (emEdicao) {
      const base: Formulario = {
        nome: emEdicao.nome,
        descricao: emEdicao.descricao ?? '',
        situacao: emEdicao.situacao,
      }
      for (const b of booleanos) base[b.chave] = Boolean(emEdicao[b.chave])
      form.reset(base)
    } else if (criando) {
      const base: Formulario = { nome: '', descricao: '', situacao: 'ativo' }
      for (const b of booleanos) base[b.chave] = false
      form.reset(base)
    }
  }, [emEdicao, criando, booleanos, form])

  function invalidar() {
    void qc.invalidateQueries({ queryKey: [config.tabela] })
  }

  const salvar = useMutation({
    mutationFn: async (dados: Formulario) => {
      const nome = dados.nome.trim()
      if (nome.length < 2) throw new Error('Informe um nome com ao menos 2 caracteres.')

      const payload: Record<string, unknown> = {
        nome,
        descricao: dados.descricao.trim() || null,
        situacao: dados.situacao,
      }
      for (const b of booleanos) payload[b.chave] = Boolean(dados[b.chave])

      const r = emEdicao
        ? await tabelaDinamica(config.tabela).update(payload).eq('id', emEdicao.id)
        : await tabelaDinamica(config.tabela).insert(payload)
      if (r.error) throw r.error
    },
    onSuccess: () => {
      toast.ok(emEdicao ? 'Registro atualizado' : 'Registro criado')
      setEmEdicao(null)
      setCriando(false)
      invalidar()
    },
    onError: (e) => toast.erro('Não foi possível salvar', traduzir(e)),
  })

  const alternarSituacao = useMutation({
    mutationFn: async (reg: RegistroSimples) => {
      const nova: SituacaoRegistro = reg.situacao === 'ativo' ? 'inativo' : 'ativo'
      const { error } = await tabelaDinamica(config.tabela).update({ situacao: nova }).eq('id', reg.id)
      if (error) throw error
      return nova
    },
    onSuccess: (nova) => {
      toast.ok(nova === 'ativo' ? 'Registro reativado' : 'Registro inativado')
      setInativando(null)
      invalidar()
    },
    onError: (e) => toast.erro('Não foi possível alterar a situação', traduzir(e)),
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo={config.sobretitulo} titulo={config.titulo} />
        <EstadoSemPermissao />
      </div>
    )
  }

  const colunas: Array<Coluna<RegistroSimples>> = [
    {
      chave: 'nome',
      cabecalho: 'Nome',
      celula: (r) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-medium text-ink">{r.nome}</span>
          {r.descricao && <span className="truncate text-[12px] text-ink-3">{r.descricao}</span>}
        </div>
      ),
    },
    ...booleanos
      .filter((b) => b.selo)
      .map<Coluna<RegistroSimples>>((b) => ({
        chave: b.chave,
        cabecalho: b.selo!,
        largura: '150px',
        classeResponsiva: 'hidden md:table-cell',
        celula: (r) => (r[b.chave] ? <Selo tom="info">{b.selo}</Selo> : <span className="text-ink-3">—</span>),
      })),
    {
      chave: 'situacao',
      cabecalho: 'Situação',
      largura: '120px',
      celula: (r) => (
        <Selo tom={r.situacao === 'ativo' ? 'ok' : 'neutro'} ponto>
          {r.situacao === 'ativo' ? 'Ativo' : 'Inativo'}
        </Selo>
      ),
    },
    {
      chave: 'acoes',
      cabecalho: '',
      largura: '190px',
      alinhamento: 'direita',
      celula: (r) => (
        <div className="flex justify-end gap-1.5">
          {podeEditar && (
            <Botao tamanho="sm" variante="fantasma" onClick={() => setEmEdicao(r)}>
              Editar
            </Botao>
          )}
          {podeInativar && !r.is_system && (
            <Botao tamanho="sm" variante="fantasma" onClick={() => setInativando(r)}>
              {r.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
            </Botao>
          )}
          {r.is_system && <Selo tom="neutro">Sistema</Selo>}
        </div>
      ),
    },
  ]

  const chips =
    situacao !== 'ativo'
      ? [{ id: 'situacao', rotulo: `Situação: ${situacao === 'todas' ? 'Todas' : 'Inativo'}`, aoRemover: () => setSituacao('ativo') }]
      : []

  const painelAberto = criando || Boolean(emEdicao)

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo={config.sobretitulo}
        titulo={config.titulo}
        meta={
          lista.total !== null ? (
            <span className="num text-[13px] text-ink-3">{lista.total.toLocaleString('pt-BR')} registros</span>
          ) : undefined
        }
        acoes={
          podeCriar ? (
            <Botao variante="primario" iconeInicio={<Plus />} onClick={() => setCriando(true)}>
              {artigo === 'a' ? 'Nova' : 'Novo'} {config.singular}
            </Botao>
          ) : undefined
        }
      />

      <div className="flex flex-col">
        <BarraFiltros
          busca={ctrl.busca}
          aoBuscar={ctrl.setBusca}
          placeholder={config.placeholderBusca}
          chips={chips}
          aoLimpar={chips.length ? () => setSituacao('ativo') : undefined}
          aoAtualizar={lista.recarregar}
          atualizando={lista.buscando}
          filtros={
            <Campo rotulo="Situação">
              {() => (
                <Segmentado
                  rotuloGrupo="Situação"
                  valor={situacao}
                  onChange={(v) => {
                    setSituacao(v)
                    ctrl.reiniciar()
                  }}
                  opcoes={[
                    { valor: 'ativo', rotulo: 'Ativos' },
                    { valor: 'inativo', rotulo: 'Inativos' },
                    { valor: 'todas', rotulo: 'Todos' },
                  ]}
                />
              )}
            </Campo>
          }
        />

        <Tabela
          className="rounded-none"
          densidade="compacta"
          aoDuploClique={podeEditar ? (r) => setEmEdicao(r) : undefined}
          colunas={colunas}
          linhas={lista.linhas}
          chaveDe={(r) => r.id}
          estado={lista.estado}
          mensagemVazio={{
            titulo: ctrl.busca ? 'Nenhum resultado' : 'Nenhum registro cadastrado',
            descricao: ctrl.busca ? 'Tente outro termo ou ajuste os filtros.' : config.descricaoVazio,
            acao: podeCriar && !ctrl.busca ? <Botao tamanho="sm" variante="neutro" onClick={() => setCriando(true)}>{artigo === 'a' ? 'Nova' : 'Novo'} {config.singular}</Botao> : undefined,
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
        aberto={painelAberto}
        aoFechar={() => {
          setEmEdicao(null)
          setCriando(false)
        }}
        titulo={emEdicao ? `Editar ${config.singular}` : `${artigo === 'a' ? 'Nova' : 'Novo'} ${config.singular}`}
        rodape={
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
        }
      >
        <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((d) => salvar.mutate(d))}>
          <Campo rotulo="Nome" obrigatorio>
            {(p) => <Entrada {...p} {...form.register('nome', { required: true })} autoFocus />}
          </Campo>

          <Campo rotulo="Descrição">
            {(p) => <AreaTexto {...p} {...form.register('descricao')} rows={3} placeholder="Opcional" />}
          </Campo>

          {booleanos.map((b) => (
            <div key={b.chave} className="flex items-start gap-3 rounded-lg border border-line p-3.5">
              <Alternador
                rotulo={b.rotulo}
                ativo={Boolean(form.watch(b.chave))}
                onChange={(v) => form.setValue(b.chave, v, { shouldDirty: true })}
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-[13.5px] font-medium text-ink">{b.rotulo}</span>
                {b.dica && <span className="text-[12px] leading-relaxed text-ink-3">{b.dica}</span>}
              </div>
            </div>
          ))}

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
        </form>
      </PainelLateral>

      <Confirmacao
        aberto={Boolean(inativando)}
        aoFechar={() => setInativando(null)}
        aoConfirmar={() => inativando && alternarSituacao.mutate(inativando)}
        carregando={alternarSituacao.isPending}
        destrutivo={inativando?.situacao === 'ativo'}
        titulo={inativando?.situacao === 'ativo' ? `Inativar ${config.singular}?` : `Reativar ${config.singular}?`}
        rotuloConfirmar={inativando?.situacao === 'ativo' ? 'Inativar' : 'Reativar'}
        descricao={
          inativando?.situacao === 'ativo' ? (
            <>
              <strong className="font-semibold text-ink">{inativando?.nome}</strong> deixa de aparecer nas seleções.
              O histórico já registrado é preservado.
            </>
          ) : (
            <>
              <strong className="font-semibold text-ink">{inativando?.nome}</strong> volta a ficar disponível para
              seleção.
            </>
          )
        }
      />
    </div>
  )
}

function traduzir(e: unknown): string {
  const m = mensagemErro(e)
  if (m.includes('duplicate key') || m.includes('_uk')) return 'Já existe um registro com este nome.'
  if (m.toLowerCase().includes('row-level security')) return 'Seu perfil não permite esta ação.'
  return m
}
