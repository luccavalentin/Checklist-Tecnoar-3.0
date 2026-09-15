import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Camera,
  Check,
  CheckCheck,
  FileAudio,
  Film,
  Loader2,
  Mic,
  Minus,
  Package,
  Plus,
  Search,
  Send,
  Square,
  Star,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { Selo } from '@/componentes/ui/Selo'
import {
  sosAdicionarItem,
  sosAlterarItem,
  sosCatalogo,
  sosEnviarAnexo,
  sosEnviarMensagem,
  sosMarcarMensagensLidas,
  sosRemoverAnexo,
  sosRemoverItem,
  sosUrlsArquivos,
} from './api'
import { AVISO_SEM_ESTOQUE, faltouEstoque, textoDisponivel, tomDisponivel } from './estoque'
import { CHAVES_SOS } from './tempoReal'
import { ETAPAS_SOS, STATUS_SOS, horaCurta, ordemStatus } from './rotulos'
import type { AnexoSOS, ChamadoSOS, EtapaAnexo, EventoSOS, ItemCatalogo, ItemSOS, MensagemSOS, PapelSOS, StatusSOS } from './tipos'

/* ── status ─────────────────────────────────────────────────────────────── */

export function SeloStatus({ status, className }: { status: StatusSOS; className?: string }) {
  const s = STATUS_SOS[status]
  return (
    <Selo tom={s.tom} ponto className={cn(status === 'procurando_mecanico' || status === 'recebido' ? 'sos-piscar' : '', className)}>
      {s.curto}
    </Selo>
  )
}

/**
 * Linha de progresso do chamado — o "rastreador de pedido". Cada etapa
 * cumprida mostra a hora; a atual pulsa.
 */
export function ProgressoChamado({
  chamado,
  compacto,
  tema = 'claro',
}: {
  chamado: Pick<ChamadoSOS, 'status' | 'recebido_em' | 'aceito_em' | 'a_caminho_em' | 'chegou_em' | 'iniciado_em' | 'finalizado_em' | 'concluido_em'>
  compacto?: boolean
  tema?: 'claro' | 'escuro'
}) {
  const atual = chamado.status === 'procurando_mecanico' || chamado.status === 'aceito' ? 'recebido' : chamado.status
  const ordemAtual = ordemStatus(atual)
  const horas: Partial<Record<StatusSOS, string | null>> = {
    recebido: chamado.recebido_em,
    a_caminho: chamado.a_caminho_em ?? chamado.aceito_em,
    no_local: chamado.chegou_em,
    servico_iniciado: chamado.iniciado_em,
    servico_finalizado: chamado.finalizado_em,
    concluido: chamado.concluido_em,
  }
  const rotulos: Partial<Record<StatusSOS, string>> = {
    recebido: 'Recebido',
    a_caminho: 'A caminho',
    no_local: 'Chegou',
    servico_iniciado: 'Serviço',
    servico_finalizado: 'Finalizado',
    concluido: 'Concluído',
  }
  const escuro = tema === 'escuro'
  // Etapa mais recente cumprida — a legenda única das telas estreitas.
  const etapaAtual = [...ETAPAS_SOS].reverse().find((e) => chamado.status !== 'cancelado' && ordemStatus(e) <= ordemAtual)

  return (
    <div className="flex w-full flex-col gap-1.5">
    <ol className="flex w-full items-start" aria-label="Andamento do chamado">
      {ETAPAS_SOS.map((etapa, i) => {
        const o = ordemStatus(etapa)
        const feito = chamado.status !== 'cancelado' && o <= ordemAtual
        const agora = chamado.status !== 'cancelado' && o === ordemAtual && etapa !== 'concluido'
        return (
          <li key={etapa} className="relative flex min-w-0 flex-1 flex-col items-center text-center" aria-current={agora ? 'step' : undefined}>
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  'absolute top-[9px] right-1/2 left-[-50%] h-[3px] rounded-full',
                  feito ? 'bg-accent' : escuro ? 'bg-white/15' : 'bg-line-strong',
                )}
              />
            )}
            <span
              className={cn(
                'relative z-[1] flex size-[21px] items-center justify-center rounded-full border-2 transition-colors',
                feito
                  ? 'border-accent bg-accent text-on-accent'
                  : escuro
                    ? 'border-white/25 bg-[#0b1d38] text-transparent'
                    : 'border-line-strong bg-surface text-transparent',
                agora && 'ring-4 ring-accent/25',
              )}
            >
              {feito && !agora ? <Check className="size-3" strokeWidth={3} /> : agora ? <span className="sos-piscar size-2 rounded-full bg-on-accent" /> : null}
            </span>
            {!compacto && (
              <>
                <span
                  className={cn(
                    // Abaixo de 400px seis rótulos não cabem: some e fica a legenda única.
                    'mt-1.5 hidden truncate px-0.5 text-[10.5px] leading-tight font-semibold min-[400px]:block',
                    feito ? (escuro ? 'text-white' : 'text-ink') : escuro ? 'text-white/45' : 'text-ink-3',
                  )}
                >
                  {rotulos[etapa]}
                </span>
                <span className={cn('num hidden text-[10px] min-[400px]:block', escuro ? 'text-white/50' : 'text-ink-3')}>{feito ? horaCurta(horas[etapa]) : ''}</span>
              </>
            )}
          </li>
        )
      })}
    </ol>
    {!compacto && etapaAtual && (
      <p className={cn('text-center text-[12.5px] font-semibold min-[400px]:hidden', escuro ? 'text-white' : 'text-ink')}>
        {rotulos[etapaAtual]} <span className={cn('num font-normal', escuro ? 'text-white/60' : 'text-ink-3')}>· {horaCurta(horas[etapaAtual])}</span>
      </p>
    )}
    </div>
  )
}

/* ── linha do tempo ─────────────────────────────────────────────────────── */

const COR_PAPEL: Record<PapelSOS, string> = {
  cliente: 'bg-accent',
  mecanico: 'bg-cyan',
  central: 'bg-[#081830] dark:bg-white',
  sistema: 'bg-ink-3',
}
const ROTULO_PAPEL: Record<PapelSOS, string> = {
  cliente: 'Cliente',
  mecanico: 'Mecânico',
  central: 'Central',
  sistema: 'Sistema',
}

export function LinhaDoTempo({ eventos, className }: { eventos: EventoSOS[]; className?: string }) {
  if (!eventos.length) return <p className="text-[13px] text-ink-3">Nenhum registro ainda.</p>
  return (
    <ol className={cn('relative flex flex-col gap-4 pl-5', className)}>
      <span aria-hidden className="absolute top-1.5 bottom-1.5 left-[5px] w-px bg-line-strong" />
      {eventos.map((e) => (
        <li key={e.id} className="relative">
          {/* Aviso do vigia (sem aceite, atraso, sem sinal) se destaca do resto do histórico. */}
          <span
            aria-hidden
            className={cn('absolute top-1.5 -left-5 size-[11px] rounded-full ring-4 ring-surface', e.tipo === 'alerta' ? 'bg-warn' : COR_PAPEL[e.autor_papel])}
          />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className={cn('text-[13px] font-semibold', e.tipo === 'alerta' ? 'text-warn-ink' : 'text-ink')}>{e.titulo}</p>
            <time className="num text-[11px] text-ink-3" dateTime={e.ocorrido_em}>
              {new Date(e.ocorrido_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </time>
          </div>
          <p className="text-[11.5px] text-ink-3">
            {ROTULO_PAPEL[e.autor_papel]}
            {e.autor_nome && e.autor_papel !== 'sistema' ? ` · ${e.autor_nome}` : ''}
          </p>
          {e.descricao && <p className="mt-1 text-[12.5px] leading-relaxed whitespace-pre-line text-ink-2">{e.descricao}</p>}
        </li>
      ))}
    </ol>
  )
}

/* ── conversa ───────────────────────────────────────────────────────────── */

/**
 * Chat do chamado, com mensagens rápidas. Quem escreve de luva ou dirigindo
 * precisa de um toque, não de um teclado.
 */
export function Conversa({
  chamadoId,
  mensagens,
  meuId,
  rapidas = [],
  encerrado,
  className,
  alturaMaxima = 'max-h-[46vh]',
}: {
  chamadoId: string
  mensagens: MensagemSOS[]
  meuId: string | null | undefined
  rapidas?: string[]
  encerrado?: boolean
  className?: string
  alturaMaxima?: string
}) {
  const qc = useQueryClient()
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const lista = useRef<HTMLDivElement>(null)

  const enviar = useMutation({
    mutationFn: (p: { texto: string; rapida?: boolean }) => sosEnviarMensagem(chamadoId, p.texto, { rapida: p.rapida }),
    onSuccess: () => {
      setTexto('')
      setErro(null)
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(chamadoId) })
    },
    onError: (e) => setErro((e as Error).message),
  })

  const naoLidas = mensagens.some((m) => !m.lida_em && m.autor_id !== meuId)
  useEffect(() => {
    if (naoLidas) void sosMarcarMensagensLidas(chamadoId).catch(() => {})
  }, [naoLidas, chamadoId, mensagens.length])

  useEffect(() => {
    // Rola só a lista de mensagens — scrollIntoView arrastava a tela inteira
    // do chamado junto (e, no celular, escondia o mapa).
    const el = lista.current
    if (el) el.scrollTop = el.scrollHeight
  }, [mensagens.length])

  return (
    <div className={cn('flex min-h-0 flex-col gap-3', className)}>
      <div ref={lista} className={cn('flex min-h-24 flex-col gap-2 overflow-y-auto overscroll-contain pr-1', alturaMaxima)}>
        {mensagens.length === 0 && (
          <p className="py-6 text-center text-[13px] text-ink-3">Nenhuma mensagem. Use os atalhos abaixo para avisar rápido.</p>
        )}
        {mensagens.map((m) => {
          const minha = m.autor_id === meuId
          return (
            <div key={m.id} className={cn('flex flex-col', minha ? 'items-end' : 'items-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-snug shadow-e1',
                  minha ? 'rounded-br-md bg-accent text-on-accent' : 'rounded-bl-md border border-line bg-surface text-ink',
                )}
              >
                {!minha && (
                  <p className="mb-0.5 text-[11px] font-semibold opacity-75">
                    {m.autor_nome?.split(' ')[0] ?? ROTULO_PAPEL[m.autor_papel]} · {ROTULO_PAPEL[m.autor_papel]}
                  </p>
                )}
                {m.texto}
              </div>
              <span className="mt-0.5 flex items-center gap-1 px-1 text-[10.5px] text-ink-3">
                {horaCurta(m.created_at)}
                {minha && (m.lida_em ? <CheckCheck className="size-3 text-cyan" aria-label="Lida" /> : <Check className="size-3" aria-label="Enviada" />)}
              </span>
            </div>
          )
        })}
      </div>

      {encerrado ? (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-center text-[12.5px] text-ink-3">Chamado encerrado: a conversa foi fechada.</p>
      ) : (
        <>
          {rapidas.length > 0 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
              {rapidas.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={enviar.isPending}
                  onClick={() => enviar.mutate({ texto: r, rapida: true })}
                  className="shrink-0 rounded-full border border-line-strong bg-surface px-3 py-2 text-[12.5px] font-medium whitespace-nowrap text-ink-2 transition-colors hover:border-accent hover:text-ink active:scale-[0.98] disabled:opacity-50"
                >
                  {r}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (texto.trim()) enviar.mutate({ texto: texto.trim() })
            }}
          >
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (texto.trim()) enviar.mutate({ texto: texto.trim() })
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Escreva uma mensagem"
              aria-label="Mensagem"
              className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-line-strong bg-inset px-3.5 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
            />
            <button
              type="submit"
              aria-label="Enviar"
              disabled={!texto.trim() || enviar.isPending}
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent shadow-accent transition-transform active:scale-95 disabled:opacity-40"
            >
              {enviar.isPending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
            </button>
          </form>
          {erro && <p className="text-[12px] text-crit-ink">{erro}</p>}
        </>
      )}
    </div>
  )
}

/* ── mídia ──────────────────────────────────────────────────────────────── */

const ROTULO_ETAPA: Record<EtapaAnexo, string> = {
  abertura: 'Pedido',
  diagnostico: 'Diagnóstico',
  antes: 'Antes',
  depois: 'Depois',
  conclusao: 'Conclusão',
  outro: 'Outro',
}

export function GaleriaAnexos({
  anexos,
  meuId,
  podeRemoverTudo,
  chamadoId,
  vazio = 'Nenhuma foto ou áudio enviado.',
}: {
  anexos: AnexoSOS[]
  meuId?: string | null
  podeRemoverTudo?: boolean
  chamadoId: string
  vazio?: string
}) {
  const qc = useQueryClient()
  const [aberto, setAberto] = useState<AnexoSOS | null>(null)
  const caminhos = useMemo(() => anexos.map((a) => a.caminho), [anexos])
  const urls = useQuery({
    queryKey: ['sos', 'urls', chamadoId, caminhos.join('|')],
    enabled: caminhos.length > 0,
    staleTime: 50 * 60_000,
    queryFn: () => sosUrlsArquivos(caminhos),
  })
  const remover = useMutation({
    mutationFn: (a: AnexoSOS) => sosRemoverAnexo(a.id, a.caminho),
    onSuccess: () => {
      setAberto(null)
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(chamadoId) })
    },
  })

  if (!anexos.length) return <p className="text-[13px] text-ink-3">{vazio}</p>

  return (
    <>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {anexos.map((a) => {
          const url = urls.data?.[a.caminho]
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setAberto(a)}
                className="group relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-2"
              >
                {a.tipo === 'foto' || a.tipo === 'assinatura' ? (
                  url ? (
                    <img src={url} alt={a.legenda ?? 'Foto do chamado'} loading="lazy" className="size-full object-cover" />
                  ) : (
                    <Loader2 className="size-5 animate-spin text-ink-3" />
                  )
                ) : a.tipo === 'audio' ? (
                  <FileAudio className="size-7 text-cyan" />
                ) : (
                  <Film className="size-7 text-accent" />
                )}
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pt-4 pb-1 text-left text-[10px] font-semibold text-white">
                  {ROTULO_ETAPA[a.etapa]}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {aberto && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-black/92 p-4 pt-[max(1rem,env(safe-area-inset-top))]" role="dialog" aria-modal="true" aria-label="Arquivo do chamado">
          <div className="flex items-center justify-between gap-3 text-white">
            <p className="text-[13px] font-medium">
              {ROTULO_ETAPA[aberto.etapa]} · {horaCurta(aberto.created_at)}
              {aberto.legenda ? ` · ${aberto.legenda}` : ''}
            </p>
            <div className="flex items-center gap-2">
              {(podeRemoverTudo || aberto.autor_id === meuId) && (
                <button
                  type="button"
                  onClick={() => remover.mutate(aberto)}
                  disabled={remover.isPending}
                  className="flex h-10 items-center gap-2 rounded-full bg-white/10 px-4 text-[13px] font-semibold"
                >
                  <Trash2 className="size-4" /> Remover
                </button>
              )}
              <button type="button" aria-label="Fechar" onClick={() => setAberto(null)} className="flex size-10 items-center justify-center rounded-full bg-white/10">
                <X className="size-5" />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center py-4">
            {urls.data?.[aberto.caminho] ? (
              aberto.tipo === 'audio' ? (
                <audio src={urls.data[aberto.caminho]} controls autoPlay className="w-full max-w-md" />
              ) : aberto.tipo === 'video' ? (
                <video src={urls.data[aberto.caminho]} controls autoPlay playsInline className="max-h-full max-w-full rounded-lg" />
              ) : (
                <img src={urls.data[aberto.caminho]} alt={aberto.legenda ?? ''} className="max-h-full max-w-full rounded-lg object-contain" />
              )
            ) : (
              <Loader2 className="size-8 animate-spin text-white" />
            )}
          </div>
        </div>
      )}
    </>
  )
}

/**
 * Foto, vídeo e áudio direto da câmera/microfone. A foto é reduzida no
 * aparelho (lado maior 1600 px, JPEG 0,82) antes de subir: rede de estrada
 * é fraca e uma foto de 8 MB não passa.
 */
export function EnviarMidia({
  chamadoId,
  etapa,
  compacto,
  aoEnviar,
}: {
  chamadoId: string
  etapa?: EtapaAnexo
  compacto?: boolean
  aoEnviar?: () => void
}) {
  const qc = useQueryClient()
  const foto = useRef<HTMLInputElement>(null)
  const video = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const gravador = useGravadorAudio()

  async function subir(arquivo: Blob, rotulo: string) {
    setErro(null)
    setEnviando(rotulo)
    try {
      await sosEnviarAnexo(chamadoId, arquivo, { etapa })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(chamadoId) })
      aoEnviar?.()
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(null)
    }
  }

  async function aoEscolherFoto(lista: FileList | null) {
    for (const f of Array.from(lista ?? [])) await subir(await reduzirImagem(f), 'foto')
  }

  const botao =
    'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-3 text-[13px] font-semibold text-ink transition-colors hover:border-accent active:scale-[0.99] disabled:opacity-50'

  return (
    <div className="flex flex-col gap-2">
      <div className={cn('flex gap-2', compacto && 'flex-wrap')}>
        <button type="button" className={botao} disabled={!!enviando} onClick={() => foto.current?.click()}>
          {enviando === 'foto' ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4 text-accent" />} Foto
        </button>
        {gravador.gravando ? (
          <button type="button" className={cn(botao, 'border-crit bg-crit-soft text-crit-ink')} onClick={async () => {
            const b = await gravador.parar()
            if (b) await subir(b, 'audio')
          }}>
            <Square className="size-4 fill-current" /> Parar {gravador.segundos}s
          </button>
        ) : (
          <button type="button" className={botao} disabled={!!enviando || !gravador.suportado} onClick={() => void gravador.iniciar().catch((e: Error) => setErro(e.message))}>
            {enviando === 'audio' ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4 text-cyan" />} Áudio
          </button>
        )}
        <button type="button" className={botao} disabled={!!enviando} onClick={() => video.current?.click()}>
          {enviando === 'video' ? <Loader2 className="size-4 animate-spin" /> : <Film className="size-4 text-ink-2" />} Vídeo
        </button>
      </div>
      <input ref={foto} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => void aoEscolherFoto(e.target.files).finally(() => (e.target.value = ''))} />
      <input
        ref={video}
        type="file"
        accept="video/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          if (f.size > 50 * 1024 * 1024) return setErro('Vídeo maior que 50 MB. Grave um trecho mais curto.')
          void subir(f, 'video')
        }}
      />
      {erro && <p className="text-[12px] text-crit-ink">{erro}</p>}
    </div>
  )
}

export async function reduzirImagem(arquivo: File, ladoMaior = 1600, qualidade = 0.82): Promise<Blob> {
  if (!arquivo.type.startsWith('image/') || arquivo.type === 'image/gif') return arquivo
  try {
    const bitmap = await createImageBitmap(arquivo)
    const escala = Math.min(1, ladoMaior / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * escala)
    canvas.height = Math.round(bitmap.height * escala)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', qualidade))
    return blob && blob.size < arquivo.size ? blob : arquivo
  } catch {
    return arquivo
  }
}

export function useGravadorAudio() {
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const rec = useRef<MediaRecorder | null>(null)
  const partes = useRef<Blob[]>([])
  const relogio = useRef<number | undefined>(undefined)
  const suportado = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia

  async function iniciar() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {
      throw new Error('Microfone bloqueado. Libere o acesso nas configurações do aparelho.')
    })
    const tipo = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t))
    const r = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined)
    partes.current = []
    r.ondataavailable = (e) => e.data.size && partes.current.push(e.data)
    r.start()
    rec.current = r
    setGravando(true)
    setSegundos(0)
    relogio.current = window.setInterval(() => {
      setSegundos((s) => {
        // Dois minutos bastam para descrever o problema; evita arquivo gigante esquecido.
        if (s + 1 >= 120) void parar()
        return s + 1
      })
    }, 1000)
  }

  function parar(): Promise<Blob | null> {
    window.clearInterval(relogio.current)
    const r = rec.current
    rec.current = null
    setGravando(false)
    if (!r) return Promise.resolve(null)
    return new Promise((resolve) => {
      r.onstop = () => {
        r.stream.getTracks().forEach((t) => t.stop())
        const tipo = r.mimeType || 'audio/webm'
        resolve(partes.current.length ? new Blob(partes.current, { type: tipo.split(';')[0] }) : null)
      }
      r.stop()
    })
  }

  useEffect(() => () => window.clearInterval(relogio.current), [])

  return { gravando, segundos, suportado, iniciar, parar }
}

/* ── itens do catálogo ──────────────────────────────────────────────────── */

/**
 * Produtos e serviços usados no atendimento — sempre do catálogo do
 * Checklist, com o preço de lá. Nada de digitar descrição livre: é isso que
 * permite a OS nascer pronta e o estoque bater.
 */
export function ItensAtendimento({
  chamadoId,
  itens,
  podeEditar,
  mostrarValores = true,
}: {
  chamadoId: string
  itens: ItemSOS[]
  podeEditar: boolean
  mostrarValores?: boolean
}) {
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<'servico' | 'produto' | null>(null)
  const [termo, setTermo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    const t = window.setTimeout(() => setTermo(busca.trim()), 300)
    return () => window.clearTimeout(t)
  }, [busca])

  const catalogo = useQuery({
    queryKey: ['sos', 'catalogo', termo, tipo],
    enabled: podeEditar && termo.length >= 2,
    staleTime: 60_000,
    queryFn: () => sosCatalogo(termo, tipo),
  })

  const invalidar = () => void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(chamadoId) })
  const adicionar = useMutation({
    mutationFn: (i: ItemCatalogo) => sosAdicionarItem(chamadoId, i.tipo, i.id, 1),
    onSuccess: (r, i) => {
      setBusca('')
      setErro(null)
      // Peça sem estoque disponível: entra como necessária e a central já foi avisada.
      setAviso(faltouEstoque(r) ? `${AVISO_SEM_ESTOQUE.titulo} ${AVISO_SEM_ESTOQUE.texto} (${i.descricao})` : null)
      invalidar()
      void qc.invalidateQueries({ queryKey: ['sos', 'catalogo'] })
    },
    onError: (e) => setErro((e as Error).message),
  })
  const alterar = useMutation({
    mutationFn: (p: { id: string; quantidade: number }) => sosAlterarItem(p.id, p.quantidade),
    onSuccess: invalidar,
    onError: (e) => setErro((e as Error).message),
  })
  const remover = useMutation({
    mutationFn: (id: string) => sosRemoverItem(id),
    onSuccess: invalidar,
    onError: (e) => setErro((e as Error).message),
  })

  const total = itens.reduce((s, i) => s + Number(i.valor_total ?? 0), 0)

  return (
    <div className="flex flex-col gap-3">
      {podeEditar && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-1.5">
            {([
              [null, 'Tudo'],
              ['servico', 'Serviços'],
              ['produto', 'Peças e produtos'],
            ] as const).map(([v, r]) => (
              <button
                key={r}
                type="button"
                onClick={() => setTipo(v)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors',
                  tipo === v ? 'bg-ink text-surface' : 'bg-surface-2 text-ink-2 hover:text-ink',
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <label className="flex min-h-12 items-center gap-2.5 rounded-xl border border-line-strong bg-inset px-3.5 focus-within:border-accent">
            <Search className="size-4 shrink-0 text-ink-3" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar no catálogo da Tecnoar (nome ou código)"
              aria-label="Buscar no catálogo"
              className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
            />
            {catalogo.isFetching && <Loader2 className="size-4 animate-spin text-ink-3" />}
          </label>
          {termo.length >= 2 && (
            <ul className="max-h-72 overflow-y-auto rounded-xl border border-line bg-surface shadow-e2">
              {(catalogo.data ?? []).length === 0 && !catalogo.isFetching && (
                <li className="px-4 py-3 text-[13px] text-ink-3">Nada encontrado para “{termo}”.</li>
              )}
              {(catalogo.data ?? []).map((i) => (
                <li key={`${i.tipo}-${i.id}`} className="border-b border-line last:border-b-0">
                  <button
                    type="button"
                    disabled={adicionar.isPending}
                    onClick={() => adicionar.mutate(i)}
                    className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-surface-2 active:bg-accent-soft disabled:opacity-60"
                  >
                    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', i.tipo === 'servico' ? 'bg-cyan-soft text-cyan-ink' : 'bg-accent-soft text-accent-ink')}>
                      {i.tipo === 'servico' ? <Wrench className="size-4" /> : <Package className="size-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{i.descricao}</span>
                      <span className="num block text-[11.5px] text-ink-3">
                        {i.codigo ?? 'sem código'}
                        {i.tipo === 'produto' && textoDisponivel(i.disponivel, i.unidade) && (
                          <span
                            className={cn(
                              'font-semibold',
                              tomDisponivel(i.disponivel) === 'sem' ? 'text-crit-ink' : tomDisponivel(i.disponivel) === 'baixo' ? 'text-warn-ink' : 'text-ok-ink',
                            )}
                          >
                            {' · '}
                            {textoDisponivel(i.disponivel, i.unidade)?.toLowerCase()}
                          </span>
                        )}
                      </span>
                    </span>
                    {mostrarValores && i.preco != null && <span className="num shrink-0 text-[13px] font-semibold text-ink">{moeda(i.preco)}</span>}
                    <Plus className="size-4 shrink-0 text-accent" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {itens.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-ink-3">
          {podeEditar ? 'Busque acima os serviços e peças usados neste atendimento.' : 'Nenhum item lançado.'}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {itens.map((i) => (
            // Em tela estreita os botões e o total quebram para a segunda linha,
            // alinhados à direita — o nome do item nunca fica sem espaço.
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', i.tipo === 'servico' ? 'bg-cyan-soft text-cyan-ink' : 'bg-accent-soft text-accent-ink')}>
                {i.tipo === 'servico' ? <Wrench className="size-4" /> : <Package className="size-4" />}
              </span>
              <div className="min-w-[9rem] flex-1">
                <p className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[14px] font-medium text-ink">{i.descricao}</span>
                  {/* Lançado sozinho na chegada (km × valor) — não foi alguém que digitou. */}
                  {i.origem === 'deslocamento' && (
                    <span className="shrink-0 rounded bg-cyan-soft px-1.5 py-px text-[10.5px] font-semibold text-cyan-ink ring-1 ring-cyan/25 ring-inset">Deslocamento</span>
                  )}
                </p>
                <p className="num text-[11.5px] text-ink-3">
                  {i.codigo ?? 'sem código'}
                  {mostrarValores ? ` · ${moeda(i.valor_unitario)} ${i.unidade ? '/' + i.unidade : ''}` : ''}
                  {i.os_item_id ? ' · na OS' : ''}
                </p>
              </div>
              {podeEditar ? (
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Diminuir"
                    disabled={alterar.isPending || i.quantidade <= 1}
                    onClick={() => alterar.mutate({ id: i.id, quantidade: Number(i.quantidade) - 1 })}
                    className="flex size-11 items-center justify-center rounded-lg sm:size-9 border border-line-strong text-ink-2 disabled:opacity-40"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="num w-8 text-center text-[14px] font-semibold text-ink">{Number(i.quantidade).toLocaleString('pt-BR')}</span>
                  <button
                    type="button"
                    aria-label="Aumentar"
                    disabled={alterar.isPending}
                    onClick={() => alterar.mutate({ id: i.id, quantidade: Number(i.quantidade) + 1 })}
                    className="flex size-11 items-center justify-center rounded-lg sm:size-9 border border-line-strong text-ink-2"
                  >
                    <Plus className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover ${i.descricao}`}
                    disabled={remover.isPending}
                    onClick={() => remover.mutate(i.id)}
                    className="ml-1 flex size-11 items-center justify-center rounded-lg sm:size-9 text-ink-3 hover:bg-crit-soft hover:text-crit-ink"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ) : (
                <span className="num text-[13px] text-ink-2">× {Number(i.quantidade).toLocaleString('pt-BR')}</span>
              )}
              {mostrarValores && <span className="num w-20 shrink-0 text-right text-[13px] font-semibold text-ink">{moeda(i.valor_total)}</span>}
            </li>
          ))}
          {mostrarValores && (
            <li className="flex items-center justify-between bg-surface-2 px-3.5 py-2.5">
              <span className="lbl">Total estimado</span>
              <span className="num text-[15px] font-bold text-ink">{moeda(total)}</span>
            </li>
          )}
        </ul>
      )}
      {aviso && <p className="rounded-lg bg-warn-soft px-3 py-2 text-[12.5px] font-medium text-warn-ink">{aviso}</p>}
      {erro && <p className="text-[12px] text-crit-ink">{erro}</p>}
    </div>
  )
}

/* ── avaliação ──────────────────────────────────────────────────────────── */

export function Estrelas({
  valor,
  aoMudar,
  tamanho = 'md',
}: {
  valor: number
  aoMudar?: (n: number) => void
  tamanho?: 'sm' | 'md' | 'lg'
}) {
  const t = tamanho === 'lg' ? 'size-10' : tamanho === 'sm' ? 'size-4' : 'size-6'
  return (
    <div className="flex items-center gap-1" role={aoMudar ? 'radiogroup' : undefined} aria-label="Nota">
      {[1, 2, 3, 4, 5].map((n) =>
        aoMudar ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={valor === n}
            aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
            onClick={() => aoMudar(n)}
            className="rounded-md p-0.5 transition-transform active:scale-90"
          >
            <Star className={cn(t, n <= valor ? 'fill-[#f5a524] text-[#f5a524]' : 'text-line-strong')} />
          </button>
        ) : (
          <Star key={n} aria-hidden className={cn(t, n <= valor ? 'fill-[#f5a524] text-[#f5a524]' : 'text-line-strong')} />
        ),
      )}
    </div>
  )
}

/** Cartão simples com título — usado nos blocos do painel do chamado. */
export function Bloco({ titulo, acao, children, className }: { titulo: string; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('sos-card sos-lift flex flex-col gap-3 rounded-[1.35rem] p-4', className)}>
      <header className="flex items-center justify-between gap-3">
        <h3 className="font-display text-[12px] font-extrabold tracking-[0.14em] text-ink-3 uppercase">{titulo}</h3>
        {acao}
      </header>
      {children}
    </section>
  )
}
