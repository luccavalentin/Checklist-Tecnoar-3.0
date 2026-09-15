import { useRef, useState } from 'react'
import { Camera, Film, Loader2, Mic, Play, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { reduzirImagem, useGravadorAudio } from '@/sos/componentes'

/**
 * Fotos, vídeo e áudio escolhidos ANTES de o chamado existir.
 *
 * O arquivo só pode subir depois (o caminho no storage começa pelo id do
 * chamado, e é isso que a política do bucket confere). Então guardamos em
 * memória e o fluxo envia logo depois de criar o SOS. As URLs de
 * pré-visualização são liberadas pelo fluxo, que é quem guarda a lista.
 */
export interface AnexoPendente {
  id: string
  blob: Blob
  tipo: 'foto' | 'video' | 'audio'
  url: string
  segundos?: number
}

const LIMITE_VIDEO = 50 * 1024 * 1024
const MAX_ANEXOS = 6

export function AnexosPendentes({ anexos, aoMudar }: { anexos: AnexoPendente[]; aoMudar: (a: AnexoPendente[]) => void }) {
  const foto = useRef<HTMLInputElement>(null)
  const video = useRef<HTMLInputElement>(null)
  const gravador = useGravadorAudio()
  const [preparando, setPreparando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // Referência viva da lista: o áudio termina de gravar depois de um render.
  const lista = useRef(anexos)
  lista.current = anexos

  function novo(blob: Blob, tipo: AnexoPendente['tipo'], segundos?: number): AnexoPendente {
    return { id: Math.random().toString(36).slice(2), blob, tipo, url: URL.createObjectURL(blob), segundos }
  }

  async function aoEscolherFotos(arquivos: FileList | null) {
    const escolhidos = Array.from(arquivos ?? []).slice(0, MAX_ANEXOS - anexos.length)
    if (!escolhidos.length) return
    setErro(null)
    setPreparando(true)
    const prontos: AnexoPendente[] = []
    for (const f of escolhidos) prontos.push(novo(await reduzirImagem(f), 'foto'))
    setPreparando(false)
    aoMudar([...lista.current, ...prontos])
  }

  function remover(a: AnexoPendente) {
    URL.revokeObjectURL(a.url)
    aoMudar(anexos.filter((x) => x.id !== a.id))
  }

  const cheio = anexos.length >= MAX_ANEXOS
  const botao =
    'flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-2xl border border-line-strong bg-surface px-2 py-2 text-[12.5px] font-semibold text-ink transition-colors active:scale-[0.98] disabled:opacity-45'

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <button type="button" className={botao} disabled={cheio || preparando || gravador.gravando} onClick={() => foto.current?.click()}>
          {preparando ? <Loader2 className="size-5 animate-spin text-accent" /> : <Camera className="size-5 text-accent" />}
          Foto
        </button>
        {gravador.gravando ? (
          <button
            type="button"
            className={cn(botao, 'border-crit bg-crit-soft text-crit-ink')}
            onClick={async () => {
              const s = gravador.segundos
              const b = await gravador.parar()
              if (b) aoMudar([...lista.current, novo(b, 'audio', s)])
            }}
          >
            <Square className="size-5 fill-current" />
            Parar · {gravador.segundos}s
          </button>
        ) : (
          <button
            type="button"
            className={botao}
            disabled={cheio || !gravador.suportado}
            onClick={() => {
              setErro(null)
              void gravador.iniciar().catch((e: Error) => setErro(e.message))
            }}
          >
            <Mic className="size-5 text-cyan" />
            Áudio
          </button>
        )}
        <button type="button" className={botao} disabled={cheio || gravador.gravando} onClick={() => video.current?.click()}>
          <Film className="size-5 text-ink-2" />
          Vídeo
        </button>
      </div>

      <input ref={foto} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => void aoEscolherFotos(e.target.files).finally(() => (e.target.value = ''))} />
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
          if (f.size > LIMITE_VIDEO) return setErro('Vídeo maior que 50 MB. Grave um trecho mais curto (uns 20 segundos bastam).')
          setErro(null)
          aoMudar([...lista.current, novo(f, 'video')])
        }}
      />

      {anexos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-4">
          {anexos.map((a) => (
            <li key={a.id} className="relative aspect-square overflow-hidden rounded-xl border border-line bg-surface-2">
              {a.tipo === 'foto' ? (
                <img src={a.url} alt="Foto anexada" className="size-full object-cover" />
              ) : a.tipo === 'video' ? (
                <div className="relative size-full">
                  <video src={a.url} muted playsInline preload="metadata" className="size-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/25">
                    <Play className="size-6 fill-white text-white" />
                  </span>
                </div>
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-1 bg-cyan-soft text-cyan-ink">
                  <Mic className="size-6" />
                  <span className="num text-[11px] font-semibold">{a.segundos ?? 0}s</span>
                </div>
              )}
              <button
                type="button"
                aria-label="Remover anexo"
                onClick={() => remover(a)}
                className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-black/60 text-white"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {erro && <p className="text-[12.5px] text-crit-ink">{erro}</p>}
      {cheio && <p className="text-[12px] text-ink-3">Limite de {MAX_ANEXOS} arquivos. Mande mais depois, pela tela do chamado.</p>}
    </div>
  )
}
