import { useCallback, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, FileText, Image as Icone, Loader2, Trash2, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro } from '@/lib/utils'
import { useAuth } from '@/auth/AuthProvider'
import { Botao, BotaoIcone } from './Botao'
import { useToast } from './Toast'
import type { Json, TipoEvidencia } from '@/tipos/db'

export interface Evidencia {
  id: string
  entidade: string
  entidade_id: string
  categoria: string | null
  tipo: TipoEvidencia
  caminho: string
  nome_arquivo: string | null
  descricao: string | null
  contexto: Json | null
  created_at: string
}

const LIMITE_BYTES = 25 * 1024 * 1024

function tipoDoArquivo(f: File): TipoEvidencia {
  if (f.type.startsWith('image/')) return 'foto'
  if (f.type.startsWith('video/')) return 'video'
  if (f.type.startsWith('audio/')) return 'audio'
  return 'documento'
}

/**
 * Captura e listagem de evidências.
 *
 * O mesmo componente serve Recepção, OS, checklists e laboratório. Cada
 * arquivo guarda o contexto do momento (cliente, veículo, OS) para que a
 * evidência continue fazendo sentido anos depois.
 */
export function Evidencias({
  entidade,
  entidadeId,
  categorias,
  ocultarCategorias,
  contexto,
  somenteLeitura,
  titulo = 'Evidências',
  descricao,
}: {
  entidade: string
  entidadeId: string | null
  categorias?: string[]
  /**
   * Categorias que esta galeria não deve listar.
   *
   * Serve para quando outra parte da tela já é dona daquelas fotos — a
   * vistoria de entrada, por exemplo, tem vaga própria para cada posição.
   * Sem isso a mesma foto apareceria duas vezes, e apagar em um lugar
   * deixaria a outra listagem mentindo.
   */
  ocultarCategorias?: string[]
  contexto?: Record<string, unknown>
  somenteLeitura?: boolean
  titulo?: string
  descricao?: string
}) {
  const { usuario } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [categoria, setCategoria] = useState(categorias?.[0] ?? 'Geral')
  const [enviando, setEnviando] = useState(0)
  const entradaArquivo = useRef<HTMLInputElement>(null)
  const entradaCamera = useRef<HTMLInputElement>(null)

  const lista = useQuery({
    queryKey: ['evidencias', entidade, entidadeId, ocultarCategorias?.join('|') ?? ''],
    enabled: Boolean(entidadeId),
    queryFn: async (): Promise<Evidencia[]> => {
      const { data, error } = await supabase
        .from('evidencias')
        .select('*')
        .eq('entidade', entidade)
        .eq('entidade_id', entidadeId!)
        .order('created_at')
      if (error) throw error
      const todas = (data ?? []) as Evidencia[]
      if (!ocultarCategorias?.length) return todas
      return todas.filter((e) => !e.categoria || !ocultarCategorias.includes(e.categoria))
    },
  })

  const enviar = useMutation({
    mutationFn: async (arquivos: File[]) => {
      if (!entidadeId || !usuario) throw new Error('Salve o registro antes de anexar evidências.')
      let enviados = 0

      for (const arquivo of arquivos) {
        if (arquivo.size > LIMITE_BYTES) {
          throw new Error(`"${arquivo.name}" passa de 25 MB e não foi enviado.`)
        }
        const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? 'bin'
        const caminho = `${entidade}/${entidadeId}/${crypto.randomUUID()}.${extensao}`

        const { error: erroUpload } = await supabase.storage
          .from('evidencias')
          .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
        if (erroUpload) throw erroUpload

        const { error: erroReg } = await supabase.from('evidencias').insert({
          entidade,
          entidade_id: entidadeId,
          categoria,
          tipo: tipoDoArquivo(arquivo),
          caminho,
          nome_arquivo: arquivo.name,
          tamanho_bytes: arquivo.size,
          contexto: (contexto ?? null) as Json,
          criado_por: usuario.id,
        })
        if (erroReg) throw erroReg

        enviados++
        setEnviando(arquivos.length - enviados)
      }
      return enviados
    },
    onSuccess: (n) => {
      setEnviando(0)
      toast.ok(`${n} arquivo(s) anexado(s)`)
      void qc.invalidateQueries({ queryKey: ['evidencias', entidade, entidadeId] })
    },
    onError: (e) => {
      setEnviando(0)
      toast.erro('Falha ao anexar', mensagemErro(e))
    },
  })

  const remover = useMutation({
    mutationFn: async (ev: Evidencia) => {
      const { error: erroArquivo } = await supabase.storage.from('evidencias').remove([ev.caminho])
      if (erroArquivo) throw erroArquivo
      const { error } = await supabase.from('evidencias').delete().eq('id', ev.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.ok('Evidência removida')
      void qc.invalidateQueries({ queryKey: ['evidencias', entidade, entidadeId] })
    },
    onError: (e) => toast.erro('Não foi possível remover', mensagemErro(e)),
  })

  const selecionar = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const arquivos = Array.from(e.target.files ?? [])
      if (arquivos.length === 0) return
      setEnviando(arquivos.length)
      enviar.mutate(arquivos)
      e.target.value = ''
    },
    [enviar],
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="lbl">{titulo}</span>
          {descricao && <span className="text-[12px] text-ink-3">{descricao}</span>}
        </div>

        {!somenteLeitura && (
          <div className="flex flex-wrap items-center gap-2">
            {categorias && categorias.length > 1 && (
              <select
                aria-label="Categoria da evidência"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className="h-8 rounded-md border border-line-strong bg-inset px-2 text-[12.5px] text-ink"
              >
                {categorias.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            <Botao
              tamanho="sm"
              variante="secundario"
              iconeInicio={<Camera />}
              disabled={!entidadeId || enviar.isPending}
              onClick={() => entradaCamera.current?.click()}
            >
              Câmera
            </Botao>
            <Botao
              tamanho="sm"
              variante="neutro"
              iconeInicio={<Upload />}
              disabled={!entidadeId || enviar.isPending}
              onClick={() => entradaArquivo.current?.click()}
            >
              Arquivo
            </Botao>
          </div>
        )}
      </div>

      <input ref={entradaCamera} type="file" accept="image/*" capture="environment" multiple hidden onChange={selecionar} />
      <input ref={entradaArquivo} type="file" accept="image/*,video/*,audio/*,application/pdf" multiple hidden onChange={selecionar} />

      {!entidadeId && (
        <p className="rounded-md border border-dashed border-line-strong px-3 py-3 text-[12.5px] text-ink-3">
          Salve o registro para poder anexar fotos e documentos.
        </p>
      )}

      {enviar.isPending && (
        <p className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <Loader2 aria-hidden className="size-3.5 animate-spin text-cyan" />
          Enviando… {enviando > 0 ? `${enviando} restante(s)` : ''}
        </p>
      )}

      {lista.isSuccess && lista.data.length === 0 && entidadeId && (
        <p className="rounded-md border border-dashed border-line-strong px-3 py-4 text-center text-[12.5px] text-ink-3">
          Nenhuma evidência anexada.
        </p>
      )}

      {lista.isSuccess && lista.data.length > 0 && (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {lista.data.map((ev) => (
            <li key={ev.id}>
              <CartaoEvidencia
                evidencia={ev}
                somenteLeitura={somenteLeitura}
                aoRemover={() => remover.mutate(ev)}
                removendo={remover.isPending}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CartaoEvidencia({
  evidencia,
  somenteLeitura,
  aoRemover,
  removendo,
}: {
  evidencia: Evidencia
  somenteLeitura?: boolean
  aoRemover: () => void
  removendo: boolean
}) {
  const url = useQuery({
    queryKey: ['evidencia-url', evidencia.id],
    staleTime: 45 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('evidencias').createSignedUrl(evidencia.caminho, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })

  return (
    <div className="group relative overflow-hidden rounded-lg border border-line bg-surface-2">
      <a
        href={url.data}
        target="_blank"
        rel="noopener noreferrer"
        className={cn('flex aspect-4/3 items-center justify-center', !url.data && 'pointer-events-none')}
      >
        {evidencia.tipo === 'foto' && url.data ? (
          <img src={url.data} alt={evidencia.descricao ?? evidencia.nome_arquivo ?? 'Evidência'} className="size-full object-cover" loading="lazy" />
        ) : url.isLoading ? (
          <Loader2 aria-hidden className="size-4 animate-spin text-ink-3" />
        ) : (
          <span aria-hidden className="flex flex-col items-center gap-1 text-ink-3 [&_svg]:size-5">
            {evidencia.tipo === 'documento' ? <FileText /> : <Icone />}
            <span className="text-[10.5px] uppercase">{evidencia.tipo}</span>
          </span>
        )}
      </a>

      <div className="flex items-center justify-between gap-1 border-t border-line px-2 py-1.5">
        <span className="truncate text-[11px] text-ink-3">{evidencia.categoria ?? '—'}</span>
        {!somenteLeitura && (
          <BotaoIcone rotulo="Remover evidência" tamanho="sm" disabled={removendo} onClick={aoRemover}>
            <Trash2 />
          </BotaoIcone>
        )}
      </div>
    </div>
  )
}
