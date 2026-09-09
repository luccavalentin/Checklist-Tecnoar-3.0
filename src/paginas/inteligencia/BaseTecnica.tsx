import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Brain, FileText, Layers3, Plus, Send, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import { data as fmtData } from '@/lib/formatos'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { useControleListagem, useListagem, termoBusca, type Consulta } from '@/dados/useListagem'
import { CabecalhoPagina } from '@/componentes/ui/Painel'
import { BarraFiltros } from '@/componentes/ui/BarraFiltros'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade } from '@/componentes/ui/Secao'
import { Paginacao, Tabela, type Coluna } from '@/componentes/ui/Tabela'
import { Confirmacao, PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { Selo, type TomSelo } from '@/componentes/ui/Selo'
import { EstadoSemPermissao } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { LeitorArtigo } from './base/LeitorArtigo'
import { ResumoCadastro } from '@/componentes/padroes/ResumoCadastro'
import type { ArtigoListado, SituacaoArtigo, TabelasUpdate } from '@/tipos/db'

const SELECT_LISTA =
  'id, numero, titulo, resumo, categoria, fabricante, equipamento, componente, codigos, tags, sintomas, ' +
  'situacao, versao, autor_id, revisor_id, aprovado_por, aprovado_em, publicado_em, arquivado_em, ' +
  'conteudo, created_at, updated_at, ' +
  'autor:usuarios!artigos_tecnicos_autor_id_fkey ( id, nome_completo ), ' +
  'revisor:usuarios!artigos_tecnicos_revisor_id_fkey ( id, nome_completo )'

const SITUACOES: Array<{ valor: SituacaoArtigo; rotulo: string; tom: TomSelo }> = [
  { valor: 'rascunho', rotulo: 'Rascunho', tom: 'neutro' },
  { valor: 'em_revisao', rotulo: 'Em revisão', tom: 'atencao' },
  { valor: 'aprovado', rotulo: 'Aprovado', tom: 'info' },
  { valor: 'publicado', rotulo: 'Publicado', tom: 'ok' },
  { valor: 'arquivado', rotulo: 'Arquivado', tom: 'neutro' },
]

const MAPA = Object.fromEntries(SITUACOES.map((s) => [s.valor, s])) as Record<SituacaoArtigo, (typeof SITUACOES)[number]>

const VAZIO = {
  titulo: '',
  resumo: '',
  conteudo: '',
  categoria: '',
  fabricante: '',
  equipamento: '',
  componente: '',
  codigos: '',
  tags: '',
  sintomas: '',
}

const lista = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean)

export function BaseTecnica() {
  const { usuario } = useAuth()
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const ctrl = useControleListagem(25)
  const [fSituacao, setFSituacao] = useState<'' | SituacaoArtigo>('')
  const [fFabricante, setFFabricante] = useState('')
  const [editando, setEditando] = useState<ArtigoListado | null>(null)
  const [criando, setCriando] = useState(false)
  const [lendo, setLendo] = useState<string | null>(null)
  const [publicando, setPublicando] = useState<ArtigoListado | null>(null)
  const [form, setForm] = useState({ ...VAZIO })
  const [erro, setErro] = useState<string | null>(null)

  const podeVer = pode('base_tecnica', 'visualizar')
  const podeCriar = pode('base_tecnica', 'criar')
  const podeEditar = pode('base_tecnica', 'editar')
  const podeAprovar = pode('base_tecnica', 'aprovar')

  const filtrar = useMemo(
    () => (q: Consulta) => {
      const t = termoBusca(ctrl.busca)
      let r = q
      if (t.length >= 2) {
        r = r.or(
          `titulo.ilike.%${t}%,resumo.ilike.%${t}%,conteudo.ilike.%${t}%,categoria.ilike.%${t}%,` +
            `fabricante.ilike.%${t}%,equipamento.ilike.%${t}%,componente.ilike.%${t}%`,
        )
      }
      if (fSituacao) r = r.eq('situacao', fSituacao)
      if (fFabricante) r = r.ilike('fabricante', `%${fFabricante}%`)
      return r
    },
    [ctrl.busca, fSituacao, fFabricante],
  )

  const artigos = useListagem<ArtigoListado>({
    chave: ['artigos', 'lista', ctrl.busca, fSituacao, fFabricante, ctrl.pagina, ctrl.porPagina],
    tabela: 'artigos_tecnicos',
    select: SELECT_LISTA,
    filtrar,
    ordenacao: { coluna: 'updated_at', ascendente: false },
    pagina: ctrl.pagina,
    porPagina: ctrl.porPagina,
    habilitado: podeVer,
  })

  const salvar = useMutation({
    mutationFn: async () => {
      setErro(null)
      if (form.titulo.trim().length < 4) throw new Error('O título precisa de pelo menos 4 caracteres.')
      const campos = {
        titulo: form.titulo.trim(),
        resumo: form.resumo.trim() || null,
        conteudo: form.conteudo,
        categoria: form.categoria.trim() || null,
        fabricante: form.fabricante.trim() || null,
        equipamento: form.equipamento.trim() || null,
        componente: form.componente.trim() || null,
        codigos: lista(form.codigos),
        tags: lista(form.tags),
        sintomas: lista(form.sintomas),
      }
      if (editando) {
        const { error } = await supabase.from('artigos_tecnicos').update(campos).eq('id', editando.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('artigos_tecnicos')
          .insert({ ...campos, autor_id: usuario?.id ?? null })
        if (error) throw error
      }
    },
    onSuccess: () => {
      toast.ok(editando ? 'Artigo atualizado' : 'Artigo criado')
      setCriando(false)
      setEditando(null)
      setForm({ ...VAZIO })
      void qc.invalidateQueries({ queryKey: ['artigos'] })
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const mudarSituacao = useMutation({
    mutationFn: async ({ id, situacao }: { id: string; situacao: SituacaoArtigo }) => {
      const campos: TabelasUpdate<'artigos_tecnicos'> = { situacao }
      if (situacao === 'em_revisao') campos.revisor_id = usuario?.id ?? null
      if (situacao === 'aprovado') {
        campos.aprovado_por = usuario?.id ?? null
        campos.aprovado_em = new Date().toISOString()
      }
      if (situacao === 'arquivado') campos.arquivado_em = new Date().toISOString()
      const { error } = await supabase.from('artigos_tecnicos').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Situação atualizada')
      void qc.invalidateQueries({ queryKey: ['artigos'] })
    },
    onError: (e) => toast.erro('Não foi possível atualizar', mensagemErro(e)),
  })

  const publicar = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('publicar_artigo', { p_artigo: id })
      if (error) throw error
      return data
    },
    onSuccess: (versao) => {
      toast.ok(`Artigo publicado na versão ${versao}`)
      setPublicando(null)
      void qc.invalidateQueries({ queryKey: ['artigos'] })
    },
    onError: (e) => toast.erro('Não foi possível publicar', mensagemErro(e)),
  })

  const perguntarIA = useMutation({
    mutationFn: async (a: ArtigoListado) => {
      const { data, error } = await supabase
        .from('ia_conversas')
        .insert({ usuario_id: usuario?.id ?? null, titulo: `Sobre: ${a.titulo}`.slice(0, 80) })
        .select('id')
        .single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => {
      toast.ok('Análise criada', 'Abra Inteligência › Tecnoar IA para continuar.')
      void qc.invalidateQueries({ queryKey: ['ia-conversas'] })
    },
    onError: (e) => toast.erro('Não foi possível abrir a análise', mensagemErro(e)),
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Inteligência" titulo="Base Técnica" />
        <EstadoSemPermissao />
      </div>
    )
  }

  function abrirEdicao(a: ArtigoListado) {
    setEditando(a)
    setForm({
      titulo: a.titulo,
      resumo: a.resumo ?? '',
      conteudo: a.conteudo,
      categoria: a.categoria ?? '',
      fabricante: a.fabricante ?? '',
      equipamento: a.equipamento ?? '',
      componente: a.componente ?? '',
      codigos: a.codigos.join(', '),
      tags: a.tags.join(', '),
      sintomas: a.sintomas.join(', '),
    })
  }

  const colunas: Array<Coluna<ArtigoListado>> = [
    {
      chave: 'numero',
      cabecalho: 'Código',
      largura: '110px',
      celula: (a) => <span className="num text-ink-2">ART-{String(a.numero).padStart(4, '0')}</span>,
    },
    {
      chave: 'titulo',
      cabecalho: 'Artigo',
      celula: (a) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium leading-snug break-words text-ink [overflow-wrap:anywhere]">{a.titulo}</span>
          <span className="text-[12px] leading-snug break-words text-ink-3 [overflow-wrap:anywhere]">
            {[a.categoria, a.fabricante, a.equipamento, a.componente].filter(Boolean).join(' · ') || '—'}
          </span>
          {(a.tags.length > 0 || a.sintomas.length > 0) && (
            <span className="mt-1 flex flex-wrap gap-1">
              {a.tags.slice(0, 2).map((tag) => (
                <Selo key={tag} tom="neutro">{tag}</Selo>
              ))}
              {a.sintomas.slice(0, 1).map((sintoma) => (
                <Selo key={sintoma} tom="atencao">{sintoma}</Selo>
              ))}
            </span>
          )}
        </div>
      ),
    },
    {
      chave: 'autor',
      cabecalho: 'Autor',
      largura: '160px',
      classeResponsiva: 'hidden lg:table-cell',
      celula: (a) => a.autor?.nome_completo ?? <span className="text-ink-3">—</span>,
    },
    {
      chave: 'versao',
      cabecalho: 'Versão',
      largura: '90px',
      alinhamento: 'direita',
      classeResponsiva: 'hidden md:table-cell',
      celula: (a) => <span className="num text-ink-2">v{a.versao}</span>,
    },
    {
      chave: 'atualizado',
      cabecalho: 'Atualizado',
      largura: '120px',
      classeResponsiva: 'hidden xl:table-cell',
      celula: (a) => <span className="num text-[12.5px]">{fmtData(a.updated_at)}</span>,
    },
    {
      chave: 'situacao',
      cabecalho: 'Situação',
      largura: '140px',
      celula: (a) =>
        podeEditar ? (
          <Selecao
            aria-label={`Situação de ${a.titulo}`}
            value={a.situacao}
            className="h-8 text-[12px]"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const v = e.target.value as SituacaoArtigo
              if (v === 'publicado') setPublicando(a)
              else mudarSituacao.mutate({ id: a.id, situacao: v })
            }}
          >
            {SITUACOES.map((s) => (
              <option key={s.valor} value={s.valor} disabled={s.valor === 'publicado' && !podeAprovar}>
                {s.rotulo}
              </option>
            ))}
          </Selecao>
        ) : (
          <Selo tom={MAPA[a.situacao].tom} ponto>{MAPA[a.situacao].rotulo}</Selo>
        ),
    },
    {
      chave: 'acoes',
      cabecalho: '',
      largura: '210px',
      alinhamento: 'direita',
      celula: (a) => (
        <div className="flex justify-end gap-1">
          <Botao tamanho="sm" variante="fantasma" onClick={(e) => { e.stopPropagation(); setLendo(a.id) }}>Ler</Botao>
          {podeEditar && (
            <Botao tamanho="sm" variante="fantasma" onClick={(e) => { e.stopPropagation(); abrirEdicao(a) }}>Editar</Botao>
          )}
          <Botao
            tamanho="sm"
            variante="fantasma"
            iconeInicio={<Brain />}
            onClick={(e) => { e.stopPropagation(); perguntarIA.mutate(a) }}
          >
            <span className="sr-only">Perguntar à Tecnoar IA</span>
          </Botao>
        </div>
      ),
    },
  ]

  const chips = [
    fSituacao && { id: 's', rotulo: `Situação: ${MAPA[fSituacao].rotulo}`, aoRemover: () => setFSituacao('') },
    fFabricante && { id: 'f', rotulo: `Fabricante: ${fFabricante}`, aoRemover: () => setFFabricante('') },
  ].filter(Boolean) as Array<{ id: string; rotulo: string; aoRemover: () => void }>

  const painelAberto = criando || editando !== null
  const publicadosPagina = artigos.linhas.filter((a) => a.situacao === 'publicado').length
  const revisaoPagina = artigos.linhas.filter((a) => a.situacao === 'em_revisao' || a.situacao === 'aprovado').length

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Inteligência"
        titulo="Base Técnica"
        meta={artigos.total !== null ? <span className="num text-[13px] text-ink-3">{artigos.total.toLocaleString('pt-BR')} artigos</span> : undefined}
        acoes={
          podeCriar ? (
            <Botao
              variante="primario"
              iconeInicio={<Plus />}
              onClick={() => { setForm({ ...VAZIO }); setEditando(null); setCriando(true) }}
            >
              Novo artigo
            </Botao>
          ) : undefined
        }
      />

      <ResumoCadastro
        titulo="Conhecimento técnico"
        descricao="Artigos técnicos para diagnóstico, bancada, garantia, procedimentos e consulta da Tecnoar IA."
        itens={[
          {
            rotulo: 'Artigos visíveis',
            valor: artigos.total !== null ? artigos.total.toLocaleString('pt-BR') : '—',
            detalhe: 'base técnica filtrada',
            icone: <BookOpen />,
            tom: 'cyan',
          },
          {
            rotulo: 'Publicados na página',
            valor: publicadosPagina.toLocaleString('pt-BR'),
            detalhe: 'prontos para consulta',
            icone: <FileText />,
            tom: 'ok',
          },
          {
            rotulo: 'Revisão técnica',
            valor: revisaoPagina.toLocaleString('pt-BR'),
            detalhe: 'em revisão/aprovação',
            icone: <Layers3 />,
            tom: revisaoPagina ? 'warn' : 'neutro',
          },
          {
            rotulo: 'Uso principal',
            valor: 'Diagnóstico e IA',
            detalhe: 'consulta operacional',
            icone: <Sparkles />,
            tom: 'accent',
          },
        ]}
      />

      <div className="flex flex-col">
        <BarraFiltros
          busca={ctrl.busca}
          aoBuscar={ctrl.setBusca}
          placeholder="Buscar por título, sintoma, componente, fabricante, equipamento ou código"
          chips={chips}
          aoLimpar={chips.length ? () => { setFSituacao(''); setFFabricante(''); ctrl.reiniciar() } : undefined}
          aoAtualizar={artigos.recarregar}
          atualizando={artigos.buscando}
          filtros={
            <>
              <Campo rotulo="Situação">
                {(p) => (
                  <Selecao {...p} value={fSituacao} onChange={(e) => { setFSituacao(e.target.value as typeof fSituacao); ctrl.reiniciar() }}>
                    <option value="">Todas</option>
                    {SITUACOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
                  </Selecao>
                )}
              </Campo>
              <Campo rotulo="Fabricante">
                {(p) => (
                  <Entrada {...p} value={fFabricante} onChange={(e) => { setFFabricante(e.target.value); ctrl.reiniciar() }} placeholder="Todos" />
                )}
              </Campo>
            </>
          }
        />

        <Tabela
          className="rounded-none"
          colunas={colunas}
          linhas={artigos.linhas}
          chaveDe={(a) => a.id}
          estado={artigos.estado}
          aoClicarLinha={(a) => setLendo(a.id)}
          mensagemVazio={{
            titulo: ctrl.busca || chips.length ? 'Nenhum resultado' : 'Nenhum artigo na base',
            descricao:
              ctrl.busca || chips.length
                ? 'Ajuste a busca ou os filtros.'
                : 'A base começa vazia de propósito: nada aqui é conteúdo de exemplo. Escreva o primeiro artigo com o conhecimento real da Tecnoar.',
            acao:
              podeCriar && !ctrl.busca && !chips.length ? (
                <Botao tamanho="sm" variante="neutro" iconeInicio={<BookOpen />} onClick={() => { setForm({ ...VAZIO }); setCriando(true) }}>
                  Escrever o primeiro
                </Botao>
              ) : undefined,
          }}
          mensagemErro={{ descricao: mensagemErro(artigos.erro), aoTentarNovamente: artigos.recarregar }}
        />

        {artigos.estado === 'ok' && (
          <Paginacao
            className="rounded-t-none border-t-0"
            pagina={ctrl.pagina}
            porPagina={ctrl.porPagina}
            total={artigos.total}
            aoMudarPagina={ctrl.setPagina}
          />
        )}
      </div>

      {lendo && <LeitorArtigo artigoId={lendo} aoFechar={() => setLendo(null)} />}

      <PainelLateral
        aberto={painelAberto}
        aoFechar={() => { setCriando(false); setEditando(null) }}
        largura="xl"
        titulo={editando ? `Editar ${editando.titulo}` : 'Novo artigo técnico'}
        descricao="O conteúdo aceita Markdown: ## títulos, listas, tabelas, `código` e > citações."
        rodape={
          <>
            <Botao variante="neutro" onClick={() => { setCriando(false); setEditando(null) }}>Cancelar</Botao>
            <Botao variante="primario" carregando={salvar.isPending} onClick={() => salvar.mutate()}>Salvar</Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <Aviso tom="critico">{erro}</Aviso>}

          {editando?.situacao === 'publicado' && (
            <Aviso tom="atencao" titulo="Este artigo está publicado">
              Salvar altera o texto de trabalho. A versão publicada só muda quando alguém publicar de novo — e isso
              cria a versão {editando.versao + 1}.
            </Aviso>
          )}

          <Grade>
            <Campo className="sm:col-span-12" rotulo="Título" obrigatorio>
              {(p) => <Entrada {...p} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Resumo" dica="Uma ou duas frases que aparecem na busca e no índice.">
              {(p) => <AreaTexto {...p} rows={2} value={form.resumo} onChange={(e) => setForm({ ...form, resumo: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="Categoria">
              {(p) => <Entrada {...p} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Ex.: Pneumática" />}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="Fabricante">
              {(p) => <Entrada {...p} value={form.fabricante} onChange={(e) => setForm({ ...form, fabricante: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="Equipamento">
              {(p) => <Entrada {...p} value={form.equipamento} onChange={(e) => setForm({ ...form, equipamento: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="Componente">
              {(p) => <Entrada {...p} value={form.componente} onChange={(e) => setForm({ ...form, componente: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="Códigos" dica="Separados por vírgula.">
              {(p) => <Entrada {...p} mono value={form.codigos} onChange={(e) => setForm({ ...form, codigos: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="Tags" dica="Separadas por vírgula.">
              {(p) => <Entrada {...p} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Sintomas" dica="Como o problema aparece na oficina. Separados por vírgula — alimentam a busca e a IA.">
              {(p) => <Entrada {...p} value={form.sintomas} onChange={(e) => setForm({ ...form, sintomas: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Conteúdo">
              {(p) => (
                <AreaTexto
                  {...p}
                  rows={20}
                  value={form.conteudo}
                  onChange={(e) => setForm({ ...form, conteudo: e.target.value })}
                  className="font-mono text-[12.5px]"
                />
              )}
            </Campo>
          </Grade>
        </div>
      </PainelLateral>

      <Confirmacao
        aberto={publicando !== null}
        aoFechar={() => setPublicando(null)}
        aoConfirmar={() => publicando && publicar.mutate(publicando.id)}
        carregando={publicar.isPending}
        titulo="Publicar artigo"
        rotuloConfirmar="Publicar"
        descricao={
          <>
            O texto atual será congelado como versão{' '}
            <strong>{publicando ? (publicando.publicado_em ? publicando.versao + 1 : publicando.versao) : ''}</strong> e
            passará a ser consultável pela Tecnoar IA. Publicar registra você como aprovador.
          </>
        }
      />

      {perguntarIA.isSuccess && (
        <Aviso tom="info" titulo="Análise criada" acao={<Send aria-hidden className="size-4 text-cyan" />}>
          Abra Inteligência › Tecnoar IA para escrever a pergunta.
        </Aviso>
      )}
    </div>
  )
}
