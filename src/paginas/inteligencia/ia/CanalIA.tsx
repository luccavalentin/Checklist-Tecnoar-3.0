import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookOpenCheck,
  Camera,
  FileText,
  Film,
  ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Plus,
  Send,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, dataHora, mensagemErro } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'
import { Botao, BotaoIcone } from '@/componentes/ui/Botao'
import { Selo } from '@/componentes/ui/Selo'
import { Aviso } from '@/componentes/ui/Aviso'
import { EstadoCarregando, EstadoVazio } from '@/componentes/ui/Estados'
import { useToast } from '@/componentes/ui/Toast'
import { Confirmacao } from '@/componentes/ui/Sobreposicoes'
import {
  GravadorDeVoz,
  extensaoDeAudio,
  prepararAnexo,
  type AnexoPreparado,
} from '@/dados/midiaIA'
import type { IAConversa, IAMensagem } from '@/tipos/db'

interface AnexoGravado {
  tipo: string
  nome: string
  mime: string
  caminho: string
}

/**
 * Canal da Tecnoar IA.
 *
 * É uma conversa, não um formulário de consulta: o colaborador escreve, fala,
 * fotografa ou filma, e a perita responde no mesmo fio. O que ela responde só
 * vira conhecimento da casa depois que um técnico marca como útil.
 */
/**
 * O motivo que a funcao de borda escreveu.
 *
 * Em resposta fora do 2xx o supabase-js entrega apenas "Edge Function returned
 * a non-2xx status code" e guarda a resposta em `context`. A funcao sempre
 * responde `{ erro }` — sem ler isso, a tela troca um motivo util ("Esta
 * conversa pertence a outro usuario") por uma frase que nao ajuda ninguem.
 */
async function motivoDaFuncao(erro: unknown): Promise<Error> {
  const ctx = (erro as { context?: Response })?.context
  if (ctx && typeof ctx.json === 'function') {
    try {
      const corpo = await ctx.clone().json()
      const motivo = typeof corpo?.erro === 'string' ? corpo.erro : ''
      if (motivo) return new Error(motivo)
    } catch {
      /* Corpo ilegivel: fica com o erro original, que ao menos existe. */
    }
  }
  if (erro instanceof Error) return erro
  /* PostgrestError nao e Error: sem isto, String() daria "[object Object]" e a
     tela mostraria isso no lugar da mensagem do banco. */
  const msg = (erro as { message?: string })?.message
  return new Error(msg && msg.trim() ? msg : String(erro))
}

export function CanalIA({ configurada }: { configurada: boolean }) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()

  const [conversaAtiva, setConversaAtiva] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [anexos, setAnexos] = useState<AnexoPreparado[]>([])
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [erro, setErro] = useState<string | null>(null)

  const gravador = useRef<GravadorDeVoz | null>(null)
  const fimDaLista = useRef<HTMLDivElement>(null)
  const entradaArquivo = useRef<HTMLInputElement>(null)
  const entradaCamera = useRef<HTMLInputElement>(null)

  const conversas = useQuery({
    queryKey: ['ia-conversas', usuario?.id],
    queryFn: async (): Promise<IAConversa[]> => {
      /* Administrador enxerga a conversa dos outros por RLS (precisa disso na
          Configuracao), mas o canal de atendimento e pessoal: listar conversa
          alheia so oferece uma thread que a funcao vai recusar no envio, com
          "Esta conversa pertence a outro usuario". */
      const { data, error } = await supabase
        .from('ia_conversas')
        .select('*')
        .eq('arquivada', false)
        .eq('usuario_id', usuario?.id ?? '')
        .order('updated_at', { ascending: false })
        .limit(60)
      if (error) throw error
      return data ?? []
    },
  })

  const selecionada = conversaAtiva ?? conversas.data?.[0]?.id ?? null

  const mensagens = useQuery({
    queryKey: ['ia-mensagens', selecionada],
    enabled: Boolean(selecionada),
    queryFn: async (): Promise<IAMensagem[]> => {
      const { data, error } = await supabase
        .from('ia_mensagens')
        .select('*')
        .eq('conversa_id', selecionada!)
        .order('created_at')
      if (error) throw await motivoDaFuncao(error)
      return data ?? []
    },
  })

  const fontes = useQuery({
    queryKey: ['ia-fontes', selecionada],
    enabled: Boolean(selecionada),
    queryFn: async () => {
      const ids = (mensagens.data ?? []).map((m) => m.id)
      if (!ids.length) return []
      const { data, error } = await supabase.from('ia_fontes').select('*').in('mensagem_id', ids)
      if (error) throw await motivoDaFuncao(error)
      return data ?? []
    },
  })

  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensagens.data])

  useEffect(() => {
    if (!gravando) return
    const t = setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [gravando])

  /* Prévias são URLs de objeto: soltar ao trocar de anexo evita vazamento. */
  useEffect(() => {
    return () => {
      anexos.forEach((a) => a.previa && URL.revokeObjectURL(a.previa))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const novaConversa = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('ia_conversas')
        .insert({ titulo: 'Nova conversa', usuario_id: usuario?.id ?? null })
        .select('id')
        .single()
      if (error) throw await motivoDaFuncao(error)
      return data.id as string
    },
    onSuccess: (id) => {
      setConversaAtiva(id)
      void qc.invalidateQueries({ queryKey: ['ia-conversas'] })
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  /** Sobe um arquivo para o bucket e devolve o caminho. */
  async function subir(blob: Blob, nome: string, mime: string): Promise<string> {
    const ext = nome.split('.').pop()?.toLowerCase() || 'bin'
    const caminho = `ia/${selecionada}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('evidencias').upload(caminho, blob, { contentType: mime })
    if (error) throw error
    return caminho
  }

  const enviar = useMutation({
    mutationFn: async () => {
      setErro(null)
      let conversa = selecionada
      if (!conversa) conversa = await novaConversa.mutateAsync()

      const gravados: AnexoGravado[] = []
      let transcricao = ''

      for (const a of anexos) {
        if (a.tipo === 'audio') {
          const caminho = await subir(a.arquivo, a.nome, a.mime)
          gravados.push({ tipo: 'audio', nome: a.nome, mime: a.mime, caminho })

          /* Áudio precisa virar texto antes: o modelo não escuta. */
          const { data, error } = await supabase.functions.invoke<{
            status?: string
            texto?: string
            erro?: string
          }>('ia', { body: { acao: 'transcrever', caminho, nome: a.nome } })
          if (error) throw await motivoDaFuncao(error)
          if (data?.status === 'ok' && data.texto) {
            transcricao = [transcricao, data.texto].filter(Boolean).join('\n')
          } else if (data?.status === 'sem_transcricao') {
            toast.erro('Áudio não foi ouvido', data.erro ?? 'Serviço de transcrição não configurado.')
          } else if (data?.erro) {
            toast.erro('Falha ao transcrever', data.erro)
          }
          continue
        }

        if (a.tipo === 'video') {
          /* Sobem os quadros, não o vídeo: é o que o modelo consegue ver. */
          const quadros = a.quadros ?? []
          for (let i = 0; i < quadros.length; i++) {
            const nome = `${a.nome.replace(/\.[^.]+$/, '')}-quadro-${i + 1}.jpg`
            const caminho = await subir(quadros[i], nome, 'image/jpeg')
            gravados.push({ tipo: 'imagem', nome, mime: 'image/jpeg', caminho })
          }
          continue
        }

        const caminho = await subir(a.arquivo, a.nome, a.mime)
        gravados.push({ tipo: a.tipo, nome: a.nome, mime: a.mime, caminho })
      }

      const { data, error } = await supabase.functions.invoke<{
        erro?: string
        mensagem?: IAMensagem
        anexos_recusados?: string[]
      }>('ia', {
        body: {
          acao: 'perguntar',
          conversa_id: conversa,
          pergunta: texto.trim(),
          transcricao,
          anexos: gravados,
        },
      })
      if (error) throw await motivoDaFuncao(error)
      return data
    },
    onSuccess: (d) => {
      setTexto('')
      anexos.forEach((a) => a.previa && URL.revokeObjectURL(a.previa))
      setAnexos([])
      if (d?.erro) setErro(d.erro)
      if (d?.anexos_recusados?.length) {
        toast.erro('Alguns anexos não foram analisados', d.anexos_recusados.join(' · '))
      }
      void qc.invalidateQueries({ queryKey: ['ia-mensagens', selecionada] })
      void qc.invalidateQueries({ queryKey: ['ia-conversas'] })
    },
    onError: (e) => setErro(mensagemErro(e)),
  })

  const [aExcluir, setAExcluir] = useState<IAConversa | null>(null)

  /* Conversa e dado pessoal, nao registro operacional: sai por DELETE direto,
     sob a politica que ja existe (dono + permissao de uso da IA). Nao passa
     por excluir_registro, que serve ao cadastro da oficina e exige auditoria. */
  const excluirConversa = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ia_conversas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_r, id) => {
      if (selecionada === id) setConversaAtiva(null)
      setAExcluir(null)
      void qc.invalidateQueries({ queryKey: ['ia-conversas', usuario?.id] })
    },
    onError: (e) => {
      setAExcluir(null)
      toast.erro('Não foi possível excluir a conversa', mensagemErro(e))
    },
  })

  const avaliar = useMutation({
    mutationFn: async ({ id, util }: { id: string; util: boolean }) => {
      const { data, error } = await supabase.functions.invoke<{ erro?: string }>('ia', {
        body: { acao: 'avaliar', mensagem_id: id, util },
      })
      if (error) throw await motivoDaFuncao(error)
      if (data?.erro) throw new Error(data.erro)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ia-mensagens', selecionada] }),
    onError: (e) => toast.erro('Não foi possível avaliar', mensagemErro(e)),
  })

  const gerarArtigo = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke<{
        erro?: string
        artigo?: { numero: number; titulo: string }
      }>('ia', { body: { acao: 'gerar_artigo', mensagem_id: id } })
      if (error) throw await motivoDaFuncao(error)
      if (data?.erro) throw new Error(data.erro)
      return data?.artigo
    },
    onSuccess: (a) => {
      toast.ok('Rascunho criado na Base Técnica', a ? `ART-${String(a.numero).padStart(4, '0')} — ${a.titulo}` : undefined)
      void qc.invalidateQueries({ queryKey: ['artigos'] })
    },
    onError: (e) => toast.erro('Não foi possível gerar o artigo', mensagemErro(e)),
  })

  async function alternarGravacao() {
    setErro(null)
    if (!GravadorDeVoz.suportado()) {
      setErro('Este navegador não permite gravar áudio. Escreva a pergunta ou envie um arquivo.')
      return
    }
    if (gravando) {
      try {
        const blob = await gravador.current!.parar()
        const mime = blob.type || 'audio/webm'
        setAnexos((a) => [
          ...a,
          {
            tipo: 'audio',
            nome: `audio-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.${extensaoDeAudio(mime)}`,
            mime,
            tamanho: blob.size,
            arquivo: blob,
            previa: null,
          },
        ])
      } catch (e) {
        setErro(mensagemErro(e))
      } finally {
        setGravando(false)
        setSegundos(0)
        gravador.current = null
      }
      return
    }
    try {
      gravador.current = new GravadorDeVoz()
      await gravador.current.iniciar()
      setSegundos(0)
      setGravando(true)
    } catch {
      gravador.current = null
      setErro('Não consegui acessar o microfone. Autorize o uso no navegador.')
    }
  }

  async function escolherArquivos(lista: FileList | null) {
    if (!lista?.length) return
    setErro(null)
    for (const f of Array.from(lista)) {
      try {
        const preparado = await prepararAnexo(f)
        setAnexos((a) => [...a, preparado])
      } catch (e) {
        setErro(mensagemErro(e))
      }
    }
  }

  const fontesPorMensagem = useMemo(() => {
    const m = new Map<string, Array<{ titulo: string; versao: number | null }>>()
    for (const f of fontes.data ?? []) {
      m.set(f.mensagem_id, [...(m.get(f.mensagem_id) ?? []), { titulo: f.titulo, versao: f.versao }])
    }
    return m
  }, [fontes.data])

  const podeEnviar = (texto.trim().length > 0 || anexos.length > 0) && !enviar.isPending && configurada

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* histórico */}
      <aside className="flex max-h-[70vh] flex-col gap-2 lg:max-h-[calc(100dvh-14rem)]">
        <Botao variante="secundario" iconeInicio={<Plus />} onClick={() => novaConversa.mutate()}>
          Nova conversa
        </Botao>
        <div className="aresta flex-1 overflow-y-auto rounded-lg border border-line bg-surface">
          {conversas.isLoading && <EstadoCarregando rotulo="Carregando…" />}
          {conversas.isSuccess && conversas.data.length === 0 && (
            <p className="p-4 text-[12.5px] text-ink-3">Nenhuma conversa ainda.</p>
          )}
          <ul className="flex flex-col">
            {(conversas.data ?? []).map((c) => (
              <li
                key={c.id}
                className={cn(
                  'group flex items-start border-b border-line transition-colors',
                  selecionada === c.id ? 'bg-cyan-soft' : 'hover:bg-surface-2',
                )}
              >
                <button
                  type="button"
                  onClick={() => setConversaAtiva(c.id)}
                  className="flex min-w-0 flex-1 flex-col gap-0.5 px-3.5 py-2.5 text-left"
                >
                  <span className="line-clamp-2 text-[12.5px] leading-snug text-ink">{c.titulo}</span>
                  <span className="num text-[11px] text-ink-3">{dataHora(c.updated_at)}</span>
                </button>
                <BotaoIcone
                  rotulo={`Excluir conversa ${c.titulo}`}
                  tamanho="sm"
                  /* No toque nao existe hover: o botao fica sempre visivel no
                     celular e aparece no hover apenas onde o mouse existe. */
                  className="mt-2 mr-1.5 shrink-0 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                  onClick={() => setAExcluir(c)}
                >
                  <Trash2 />
                </BotaoIcone>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* conversa */}
      <section className="aresta flex min-h-[70vh] flex-col rounded-lg border border-line bg-surface lg:min-h-[calc(100dvh-14rem)]">
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {!selecionada ? (
            <EstadoVazio
              titulo="Fale com a perita"
              descricao="Descreva o sintoma, grave um áudio, mande a foto da peça ou filme o vazamento. Ela é especialista em freio a ar, ABS, EBS, pneumática e diagnóstico eletrônico de pesados."
            />
          ) : mensagens.isLoading ? (
            <EstadoCarregando rotulo="Carregando conversa…" />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-4">
              {(mensagens.data ?? []).map((m) => (
                <Mensagem
                  key={m.id}
                  m={m}
                  fontes={fontesPorMensagem.get(m.id) ?? []}
                  aoAvaliar={(util) => avaliar.mutate({ id: m.id, util })}
                  aoGerarArtigo={() => gerarArtigo.mutate(m.id)}
                  gerando={gerarArtigo.isPending}
                />
              ))}
              {enviar.isPending && (
                <div className="flex items-center gap-2 text-[13px] text-ink-2">
                  <Loader2 aria-hidden className="size-4 animate-spin text-cyan" />
                  A perita está analisando…
                </div>
              )}
              <div ref={fimDaLista} />
            </div>
          )}
        </div>

        {/* redação */}
        <div className="border-t border-line p-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {erro && <Aviso tom="critico">{erro}</Aviso>}
            {!configurada && (
              <Aviso tom="atencao" titulo="IA não configurada">
                Informe uma chave em Configurações para que a perita possa responder.
              </Aviso>
            )}

            {anexos.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {anexos.map((a, i) => (
                  <li
                    key={`${a.nome}-${i}`}
                    className="flex items-center gap-2 rounded-md border border-line bg-surface-2 py-1.5 pr-1.5 pl-2.5 text-[12px]"
                  >
                    {a.tipo === 'imagem' && <ImageIcon aria-hidden className="size-3.5 text-cyan" />}
                    {a.tipo === 'audio' && <Mic aria-hidden className="size-3.5 text-accent" />}
                    {a.tipo === 'video' && <Film aria-hidden className="size-3.5 text-cyan" />}
                    {a.tipo === 'documento' && <FileText aria-hidden className="size-3.5 text-ink-3" />}
                    <span className="max-w-[180px] truncate text-ink">{a.nome}</span>
                    {a.tipo === 'video' && a.quadros && (
                      <span className="num text-[10.5px] text-ink-3">{a.quadros.length} quadros</span>
                    )}
                    <BotaoIcone
                      rotulo={`Remover ${a.nome}`}
                      tamanho="sm"
                      variante="fantasma"
                      onClick={() => {
                        if (a.previa) URL.revokeObjectURL(a.previa)
                        setAnexos((lista) => lista.filter((_, n) => n !== i))
                      }}
                    >
                      <X />
                    </BotaoIcone>
                  </li>
                ))}
              </ul>
            )}

            {gravando && (
              <div className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent-soft px-3.5 py-2.5">
                <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-accent" />
                <span className="text-[13px] text-ink">Gravando…</span>
                <span className="num text-[13px] text-ink-2">
                  {String(Math.floor(segundos / 60)).padStart(2, '0')}:{String(segundos % 60).padStart(2, '0')}
                </span>
                <Botao
                  tamanho="sm"
                  variante="neutro"
                  iconeInicio={<Trash2 />}
                  className="ml-auto"
                  onClick={() => {
                    gravador.current?.cancelar()
                    gravador.current = null
                    setGravando(false)
                    setSegundos(0)
                  }}
                >
                  Descartar
                </Botao>
                <Botao tamanho="sm" variante="secundario" iconeInicio={<Square />} onClick={() => void alternarGravacao()}>
                  Parar
                </Botao>
              </div>
            )}

            <div className="flex items-end gap-2">
              <input
                ref={entradaArquivo}
                type="file"
                multiple
                accept="image/*,video/*,audio/*,application/pdf"
                className="hidden"
                onChange={(e) => {
                  void escolherArquivos(e.target.files)
                  e.target.value = ''
                }}
              />
              <input
                ref={entradaCamera}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  void escolherArquivos(e.target.files)
                  e.target.value = ''
                }}
              />

              <BotaoIcone rotulo="Anexar arquivo" onClick={() => entradaArquivo.current?.click()}>
                <Paperclip />
              </BotaoIcone>
              <BotaoIcone rotulo="Tirar foto" onClick={() => entradaCamera.current?.click()} className="sm:hidden">
                <Camera />
              </BotaoIcone>
              <BotaoIcone
                rotulo={gravando ? 'Parar gravação' : 'Gravar áudio'}
                onClick={() => void alternarGravacao()}
                className={cn(gravando && 'text-accent')}
              >
                <Mic />
              </BotaoIcone>

              <textarea
                rows={1}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (podeEnviar) enviar.mutate()
                  }
                }}
                placeholder="Descreva o sintoma, o veículo e o que já testou…"
                className={cn(
                  'w-full rounded-md border border-line-strong bg-inset px-3 py-2.5 text-[13.5px] text-ink',
                  'placeholder:text-ink-3 transition-colors focus:border-cyan focus:ring-3 focus:ring-cyan/20',
                  'max-h-40 min-h-11 flex-1 resize-y focus:outline-none',
                )}
              />

              <Botao
                variante="primario"
                iconeInicio={enviar.isPending ? <Loader2 className="animate-spin" /> : <Send />}
                disabled={!podeEnviar}
                onClick={() => enviar.mutate()}
              >
                <span className="sr-only sm:not-sr-only">Enviar</span>
              </Botao>
            </div>
            <p className="text-[11.5px] text-ink-3">
              Enter envia · Shift+Enter quebra linha · vídeo entra como quadros, áudio precisa de transcrição
              configurada
            </p>
          </div>
        </div>
      </section>
      <Confirmacao
        aberto={Boolean(aExcluir)}
        aoFechar={() => setAExcluir(null)}
        aoConfirmar={() => aExcluir && excluirConversa.mutate(aExcluir.id)}
        carregando={excluirConversa.isPending}
        destrutivo
        titulo="Excluir conversa?"
        rotuloConfirmar="Excluir"
        descricao={
          <>
            <strong className="font-semibold text-ink">{aExcluir?.titulo}</strong> sai junto com todas as
            mensagens, anexos e avaliações dela. Esta ação não pode ser desfeita.
          </>
        }
      />

    </div>
  )
}

/* ------------------------------------------------------------ mensagem */

function Mensagem({
  m,
  fontes,
  aoAvaliar,
  aoGerarArtigo,
  gerando,
}: {
  m: IAMensagem
  fontes: Array<{ titulo: string; versao: number | null }>
  aoAvaliar: (util: boolean) => void
  aoGerarArtigo: () => void
  gerando: boolean
}) {
  const daIA = m.papel === 'assistente'

  if (!daIA) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[85%] rounded-lg rounded-br-sm border border-cyan/30 bg-cyan-soft px-4 py-2.5">
          {m.transcricao && (
            <p className="mb-1.5 flex items-start gap-1.5 border-b border-cyan/20 pb-1.5 text-[12px] text-ink-2 italic">
              <Mic aria-hidden className="mt-0.5 size-3 shrink-0" />
              {m.transcricao}
            </p>
          )}
          {m.conteudo && <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink">{m.conteudo}</p>}
          {Array.isArray(m.anexos) && m.anexos.length > 0 && (
            <p className="mt-1 text-[11.5px] text-ink-3">
              {(m.anexos as unknown as AnexoGravado[]).length} anexo(s)
            </p>
          )}
        </div>
        <span className="num text-[11px] text-ink-3">{dataHora(m.created_at)}</span>
      </div>
    )
  }

  if (m.erro && !m.conteudo) {
    return (
      <Aviso tom="critico" titulo="A perita não conseguiu responder">
        {m.erro}
      </Aviso>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="rounded-lg rounded-bl-sm border border-line bg-surface-2 px-4 py-3">
        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap text-ink">{m.conteudo}</p>

        {fontes.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
            <span className="lbl">Base técnica</span>
            {fontes.map((f) => (
              <Selo key={f.titulo} tom="ok">{f.titulo}{f.versao ? ` · v${f.versao}` : ''}</Selo>
            ))}
          </div>
        ) : (
          <p className="mt-3 flex items-start gap-1.5 border-t border-line pt-2.5 text-[11.5px] text-ink-3">
            <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warn" />
            Resposta sem respaldo em artigo publicado da base. Confirme valores críticos no manual do fabricante.
          </p>
        )}

        {m.erro && <p className="mt-2 text-[11.5px] text-warn-ink">{m.erro}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="num text-[11px] text-ink-3">{dataHora(m.created_at)}</span>

        <div className="ml-auto flex items-center gap-1">
          <BotaoIcone
            rotulo="Esta resposta ajudou"
            tamanho="sm"
            variante="fantasma"
            onClick={() => aoAvaliar(true)}
            className={cn(m.util === true && 'text-ok')}
          >
            <ThumbsUp />
          </BotaoIcone>
          <BotaoIcone
            rotulo="Esta resposta não ajudou"
            tamanho="sm"
            variante="fantasma"
            onClick={() => aoAvaliar(false)}
            className={cn(m.util === false && 'text-crit')}
          >
            <ThumbsDown />
          </BotaoIcone>
          {m.util === true && (
            <Botao
              tamanho="sm"
              variante="fantasma"
              iconeInicio={gerando ? <Loader2 className="animate-spin" /> : <BookOpenCheck />}
              disabled={gerando}
              onClick={aoGerarArtigo}
            >
              Virar artigo
            </Botao>
          )}
        </div>
      </div>
    </div>
  )
}
