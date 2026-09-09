import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, ChevronDown, ChevronUp, Eye, Plus, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErro } from '@/lib/utils'
import { data as fmtData } from '@/lib/formatos'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { CabecalhoPagina, Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { AreaTexto, Campo, Entrada, Selecao } from '@/componentes/ui/Campo'
import { Grade } from '@/componentes/ui/Secao'
import { PainelLateral } from '@/componentes/ui/Sobreposicoes'
import { Selo } from '@/componentes/ui/Selo'
import { EstadoCarregando, EstadoErro, EstadoSemPermissao, EstadoVazio } from '@/componentes/ui/Estados'
import { Aviso } from '@/componentes/ui/Aviso'
import { useToast } from '@/componentes/ui/Toast'
import { DocumentoEbook } from './ebooks/DocumentoEbook'
import type { ArtigoTecnico, Ebook, EbookCapituloDetalhe, SituacaoEbook } from '@/tipos/db'

export function Ebooks() {
  const { usuario } = useAuth()
  const { pode } = usePermissoes()
  const qc = useQueryClient()
  const toast = useToast()

  const [selecionado, setSelecionado] = useState<Ebook | null>(null)
  const [criando, setCriando] = useState(false)
  const [lendo, setLendo] = useState<Ebook | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const podeVer = pode('ebooks', 'visualizar')
  const podeCriar = pode('ebooks', 'criar')
  const podeEditar = pode('ebooks', 'editar')

  const ebooks = useQuery({
    queryKey: ['ebooks'],
    enabled: podeVer,
    queryFn: async (): Promise<Ebook[]> => {
      const { data, error } = await supabase.from('ebooks').select('*').order('updated_at', { ascending: false }).limit(100)
      if (error) throw error
      return data ?? []
    },
  })

  const capitulos = useQuery({
    queryKey: ['ebook-capitulos', selecionado?.id],
    enabled: Boolean(selecionado),
    queryFn: async (): Promise<EbookCapituloDetalhe[]> => {
      const { data, error } = await supabase
        .from('vw_ebook_capitulos')
        .select('*')
        .eq('ebook_id', selecionado!.id)
        .order('ordem')
      if (error) throw error
      /* `select('*')` de view infere tudo nullable; a SQL garante essas colunas
         preenchidas (JOIN obrigatório com artigos_tecnicos). */
      return (data ?? []) as unknown as EbookCapituloDetalhe[]
    },
  })

  const publicados = useQuery({
    queryKey: ['artigos-publicados'],
    enabled: Boolean(selecionado) && podeEditar,
    queryFn: async (): Promise<Array<Pick<ArtigoTecnico, 'id' | 'numero' | 'titulo' | 'categoria'>>> => {
      const { data, error } = await supabase
        .from('artigos_tecnicos')
        .select('id, numero, titulo, categoria')
        .eq('situacao', 'publicado')
        .order('titulo')
        .limit(300)
      if (error) throw error
      return data ?? []
    },
  })

  const [form, setForm] = useState({ titulo: '', subtitulo: '', descricao: '', versao: '1.0' })

  const criar = useMutation({
    mutationFn: async () => {
      setErro(null)
      if (form.titulo.trim().length < 3) throw new Error('Informe o título do e-book.')
      const { data, error } = await supabase
        .from('ebooks')
        .insert({
          titulo: form.titulo.trim(),
          subtitulo: form.subtitulo.trim() || null,
          descricao: form.descricao.trim() || null,
          versao: form.versao.trim() || '1.0',
          criado_por: usuario?.id ?? null,
        })
        .select('*')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (e) => {
      toast.ok('E-book criado')
      setCriando(false)
      setForm({ titulo: '', subtitulo: '', descricao: '', versao: '1.0' })
      setSelecionado(e)
      void qc.invalidateQueries({ queryKey: ['ebooks'] })
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const atualizar = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Partial<Ebook> }) => {
      const { error } = await supabase.from('ebooks').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ebooks'] })
    },
    onError: (e) => toast.erro('Não foi possível atualizar', mensagemErro(e)),
  })

  const adicionar = useMutation({
    mutationFn: async (artigoId: string) => {
      const ordem = (capitulos.data?.length ?? 0) + 1
      const { error } = await supabase
        .from('ebook_capitulos')
        .insert({ ebook_id: selecionado!.id, artigo_id: artigoId, ordem })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ebook-capitulos'] })
    },
    onError: (e) => toast.erro('Não foi possível adicionar', mensagemErro(e)),
  })

  const mover = useMutation({
    mutationFn: async ({ id, ordem }: { id: string; ordem: number }) => {
      const { error } = await supabase.from('ebook_capitulos').update({ ordem }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ebook-capitulos'] }),
    onError: (e) => toast.erro('Não foi possível reordenar', mensagemErro(e)),
  })

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ebook_capitulos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ebook-capitulos'] }),
    onError: (e) => toast.erro('Não foi possível remover', mensagemErro(e)),
  })

  if (!podeVer) {
    return (
      <div className="flex flex-col gap-5">
        <CabecalhoPagina sobretitulo="Inteligência" titulo="E-books" />
        <EstadoSemPermissao />
      </div>
    )
  }

  const usados = new Set((capitulos.data ?? []).map((c) => c.artigo_id))
  const disponiveis = (publicados.data ?? []).filter((a) => !usados.has(a.id))
  const desatualizados = (capitulos.data ?? []).filter((c) => c.situacao !== 'publicado')

  function trocar(indice: number, direcao: -1 | 1) {
    const l = capitulos.data ?? []
    const alvo = l[indice + direcao]
    const atual = l[indice]
    if (!alvo || !atual) return
    mover.mutate({ id: atual.id, ordem: alvo.ordem })
    mover.mutate({ id: alvo.id, ordem: atual.ordem })
  }

  return (
    <div className="flex flex-col gap-5">
      <CabecalhoPagina
        sobretitulo="Inteligência"
        titulo="E-books"
        meta={<span className="num text-[13px] text-ink-3">{ebooks.data?.length ?? 0} documento(s)</span>}
        acoes={
          podeCriar ? (
            <Botao variante="primario" iconeInicio={<Plus />} onClick={() => setCriando(true)}>Novo e-book</Botao>
          ) : undefined
        }
      />

      <Aviso tom="info" titulo="Só entra conteúdo aprovado">
        Os capítulos são artigos da Base Técnica com situação “publicado”. Nada é gerado automaticamente e nenhum
        texto é inventado para preencher o documento.
      </Aviso>

      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <Painel semPadding>
          <CabecalhoPainel titulo="Documentos" />
          <div className="p-2">
            {ebooks.isLoading ? (
              <EstadoCarregando />
            ) : ebooks.isError ? (
              <EstadoErro descricao={mensagemErro(ebooks.error)} aoTentarNovamente={() => void ebooks.refetch()} />
            ) : (ebooks.data?.length ?? 0) === 0 ? (
              <EstadoVazio compacto titulo="Nenhum e-book" descricao="Crie o primeiro documento a partir dos artigos publicados." />
            ) : (
              <ul className="flex flex-col gap-1">
                {(ebooks.data ?? []).map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => setSelecionado(e)}
                      className={`flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors ${
                        selecionado?.id === e.id ? 'bg-surface-2' : 'hover:bg-surface-2'
                      }`}
                    >
                      <span className="truncate text-[13px] text-ink">{e.titulo}</span>
                      <span className="flex items-center gap-2">
                        <Selo tom={e.situacao === 'publicado' ? 'ok' : e.situacao === 'arquivado' ? 'neutro' : 'atencao'}>
                          {e.situacao}
                        </Selo>
                        <span className="num text-[11px] text-ink-3">v{e.versao}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Painel>

        {!selecionado ? (
          <Painel className="flex items-center justify-center">
            <EstadoVazio
              titulo="Selecione um e-book"
              descricao="Escolha um documento à esquerda para montar o índice e visualizar."
            />
          </Painel>
        ) : (
          <div className="flex flex-col gap-5">
            <Painel>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="font-display text-lg font-semibold text-ink">{selecionado.titulo}</h2>
                  {selecionado.subtitulo && <p className="text-[13px] text-ink-2">{selecionado.subtitulo}</p>}
                  {selecionado.publicado_em && (
                    <span className="num text-[12px] text-ink-3">Publicado em {fmtData(selecionado.publicado_em)}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {podeEditar && (
                    <Selecao
                      aria-label="Situação do e-book"
                      value={selecionado.situacao}
                      className="h-9 w-40"
                      onChange={(e) => {
                        const v = e.target.value as SituacaoEbook
                        atualizar.mutate({
                          id: selecionado.id,
                          campos: { situacao: v, publicado_em: v === 'publicado' ? new Date().toISOString() : null },
                        })
                        setSelecionado({ ...selecionado, situacao: v })
                      }}
                    >
                      <option value="rascunho">Rascunho</option>
                      <option value="publicado">Publicado</option>
                      <option value="arquivado">Arquivado</option>
                    </Selecao>
                  )}
                  <Botao
                    variante="primario"
                    iconeInicio={<Eye />}
                    disabled={(capitulos.data?.length ?? 0) === 0}
                    onClick={() => setLendo(selecionado)}
                  >
                    Visualizar documento
                  </Botao>
                </div>
              </div>
            </Painel>

            {desatualizados.length > 0 && (
              <Aviso tom="atencao" titulo="Capítulos com artigo fora do ar">
                {desatualizados.length} capítulo(s) apontam para artigos que não estão mais publicados. Eles aparecem
                marcados no índice e ficam de fora do documento gerado.
              </Aviso>
            )}

            <Painel semPadding>
              <CabecalhoPainel
                titulo="Índice"
                descricao="A ordem dos capítulos é a ordem do documento."
                acao={<span className="num text-[12px] text-ink-3">{capitulos.data?.length ?? 0} capítulo(s)</span>}
              />
              <div className="p-5">
                {capitulos.isLoading ? (
                  <EstadoCarregando />
                ) : (capitulos.data?.length ?? 0) === 0 ? (
                  <EstadoVazio
                    compacto
                    titulo="Nenhum capítulo"
                    descricao="Adicione artigos publicados abaixo para montar o e-book."
                  />
                ) : (
                  <ol className="flex flex-col gap-2">
                    {(capitulos.data ?? []).map((c, i) => (
                      <li key={c.id} className="flex items-center gap-3 rounded-lg border border-line px-3.5 py-2.5">
                        <span className="num w-6 shrink-0 text-[12.5px] text-ink-3">{i + 1}</span>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[13px] text-ink">{c.titulo}</span>
                          <span className="truncate text-[11.5px] text-ink-3">
                            ART-{String(c.numero).padStart(4, '0')} · v{c.versao}
                            {c.categoria ? ` · ${c.categoria}` : ''}
                          </span>
                        </div>
                        {c.situacao !== 'publicado' && <Selo tom="critico">{c.situacao}</Selo>}
                        {podeEditar && (
                          <div className="flex shrink-0 gap-0.5">
                            <BotaoIcone rotulo="Subir" variante="fantasma" tamanho="sm" disabled={i === 0} onClick={() => trocar(i, -1)}>
                              <ChevronUp />
                            </BotaoIcone>
                            <BotaoIcone
                              rotulo="Descer"
                              variante="fantasma"
                              tamanho="sm"
                              disabled={i === (capitulos.data?.length ?? 1) - 1}
                              onClick={() => trocar(i, 1)}
                            >
                              <ChevronDown />
                            </BotaoIcone>
                            <BotaoIcone rotulo="Remover capítulo" variante="fantasma" tamanho="sm" onClick={() => remover.mutate(c.id)}>
                              <Trash2 />
                            </BotaoIcone>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </Painel>

            {podeEditar && (
              <Painel semPadding>
                <CabecalhoPainel titulo="Adicionar capítulo" descricao="Somente artigos publicados na Base Técnica." />
                <div className="p-5">
                  {publicados.isLoading ? (
                    <EstadoCarregando />
                  ) : disponiveis.length === 0 ? (
                    <EstadoVazio
                      compacto
                      titulo={(publicados.data?.length ?? 0) === 0 ? 'Nenhum artigo publicado' : 'Todos já estão no índice'}
                      descricao={
                        (publicados.data?.length ?? 0) === 0
                          ? 'Publique artigos em Inteligência › Base Técnica para poder montar e-books.'
                          : undefined
                      }
                    />
                  ) : (
                    <ul className="flex flex-col gap-1.5">
                      {disponiveis.map((a) => (
                        <li key={a.id} className="flex items-center gap-3 rounded border border-line px-3 py-2">
                          <BookOpen aria-hidden className="size-3.5 shrink-0 text-ink-3" />
                          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">{a.titulo}</span>
                          <Botao tamanho="sm" variante="fantasma" onClick={() => adicionar.mutate(a.id)}>Adicionar</Botao>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Painel>
            )}
          </div>
        )}
      </div>

      {lendo && <DocumentoEbook ebook={lendo} aoFechar={() => setLendo(null)} />}

      <PainelLateral
        aberto={criando}
        aoFechar={() => setCriando(false)}
        largura="md"
        titulo="Novo e-book"
        rodape={
          <>
            <Botao variante="neutro" onClick={() => setCriando(false)}>Cancelar</Botao>
            <Botao variante="primario" carregando={criar.isPending} onClick={() => criar.mutate()}>Criar</Botao>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <Aviso tom="critico">{erro}</Aviso>}
          <Grade>
            <Campo className="sm:col-span-12" rotulo="Título" obrigatorio>
              {(p) => <Entrada {...p} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-8" rotulo="Subtítulo">
              {(p) => <Entrada {...p} value={form.subtitulo} onChange={(e) => setForm({ ...form, subtitulo: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-4" rotulo="Versão">
              {(p) => <Entrada {...p} mono value={form.versao} onChange={(e) => setForm({ ...form, versao: e.target.value })} />}
            </Campo>
            <Campo className="sm:col-span-12" rotulo="Descrição">
              {(p) => <AreaTexto {...p} rows={3} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} />}
            </Campo>
          </Grade>
        </div>
      </PainelLateral>
    </div>
  )
}
