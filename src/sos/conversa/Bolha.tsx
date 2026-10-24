import { useEffect, useRef, useState } from 'react'
import { Ban, Check, CheckCheck, Clock3, CornerUpLeft, MapPin, Pause, Play, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MensagemSOS } from '../tipos'
import { horaCurta } from '../rotulos'

/** Quem pode apagar, e até quando. Mesma regra do banco (migração 20261009). */
export const JANELA_APAGAR_MS = 60 * 60_000

/**
 * Uma mensagem.
 *
 * O ESTADO DE ENTREGA É A PARTE QUE MAIS IMPORTA
 *
 * Antes havia um tique só: "saiu daqui". Mas a pergunta que angustia quem
 * está parado no escuro às duas da manhã não é "saiu?" — é "CHEGOU NELE?".
 * Sem o estado intermediário não dava para responder, e a tela deixava a
 * pessoa no escuro sobre a única coisa que ela queria saber.
 *
 *   relógio   → ainda na fila deste aparelho (sem sinal)
 *   ✓         → gravado no servidor
 *   ✓✓ cinza  → chegou ao aparelho do outro
 *   ✓✓ azul   → ele leu
 */
export function Bolha({
  m,
  minha,
  citada,
  urlMidia,
  podeApagar,
  aoResponder,
  aoApagar,
  aoVerCitada,
}: {
  m: MensagemSOS
  minha: boolean
  /** A mensagem que esta cita, quando houver. */
  citada: MensagemSOS | null
  /** URL assinada da mídia, quando já resolvida. */
  urlMidia: string | null
  podeApagar: boolean
  aoResponder: () => void
  aoApagar: () => void
  aoVerCitada: (id: string) => void
}) {
  const [menu, setMenu] = useState(false)
  const pressionando = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(pressionando.current), [])

  if (m.apagada_em) {
    return (
      <div className={cn('cv-linha', minha ? 'cv-linha-minha' : 'cv-linha-dele')}>
        <div className="cv-bolha cv-bolha-apagada">
          <Ban className="size-[15px] shrink-0 opacity-70" />
          <span className="italic">Mensagem apagada</span>
          <span className="cv-hora num">{horaCurta(m.created_at)}</span>
        </div>
      </div>
    )
  }

  const temLocal = m.local_lat != null && m.local_lng != null
  const ehAudio = !!m.midia_tipo?.startsWith('audio')
  const ehImagem = !!m.midia_tipo?.startsWith('image')

  return (
    <div className={cn('cv-linha', minha ? 'cv-linha-minha' : 'cv-linha-dele')}>
      <div
        className={cn('cv-bolha', minha ? 'cv-bolha-minha' : 'cv-bolha-dele')}
        /* Segurar abre as ações, como em qualquer mensageiro. O duplo
           caminho (botão visível no foco) existe para teclado e leitor de
           tela — gesto só de toque excluiria quem não usa toque. */
        onPointerDown={() => {
          pressionando.current = window.setTimeout(() => setMenu(true), 420)
        }}
        onPointerUp={() => window.clearTimeout(pressionando.current)}
        onPointerLeave={() => window.clearTimeout(pressionando.current)}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu(true)
        }}
      >
        {!minha && m.autor_nome && <p className="cv-autor">{m.autor_nome.split(' ')[0]}</p>}

        {citada && (
          <button type="button" onClick={() => aoVerCitada(citada.id)} className="cv-citacao">
            <span className="cv-citacao-autor">{citada.autor_nome?.split(' ')[0] ?? 'Mensagem'}</span>
            <span className="cv-citacao-texto">{resumo(citada)}</span>
          </button>
        )}

        {ehImagem && urlMidia && <img src={urlMidia} alt="" loading="lazy" className="cv-foto" />}
        {ehAudio && urlMidia && <Audio url={urlMidia} segundos={m.duracao_seg} minha={minha} />}
        {temLocal && (
          <a
            href={`https://www.google.com/maps?q=${m.local_lat},${m.local_lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="cv-local"
          >
            <MapPin className="size-[18px] shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Localização</span>
              <span className="num block text-[11.5px] opacity-75">
                {m.local_lat!.toFixed(5)}, {m.local_lng!.toFixed(5)}
              </span>
            </span>
          </a>
        )}

        {m.texto && <p className="cv-texto">{m.texto}</p>}

        <span className="cv-rodape">
          <span className="cv-hora num">{horaCurta(m.created_at)}</span>
          {minha && <Tiques m={m} />}
        </span>
      </div>

      {menu && (
        <>
          <button type="button" aria-label="Fechar" className="cv-veu" onClick={() => setMenu(false)} />
          <div role="menu" className={cn('cv-menu', minha ? 'cv-menu-minha' : 'cv-menu-dele')}>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false)
                aoResponder()
              }}
            >
              <CornerUpLeft className="size-4" /> Responder
            </button>
            {podeApagar && (
              <button
                type="button"
                role="menuitem"
                className="cv-menu-perigo"
                onClick={() => {
                  setMenu(false)
                  aoApagar()
                }}
              >
                <Trash2 className="size-4" /> Apagar para todos
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** O estado de entrega, em um glifo. Ver a nota no topo do arquivo. */
function Tiques({ m }: { m: MensagemSOS }) {
  if (m.id.startsWith('fila:')) return <Clock3 className="size-[13px] opacity-70" aria-label="Na fila, sem sinal" />
  if (m.lida_em) return <CheckCheck className="size-[14px] text-[#00a8e8]" aria-label="Lida" />
  if (m.entregue_em) return <CheckCheck className="size-[14px] opacity-70" aria-label="Entregue" />
  return <Check className="size-[13px] opacity-70" aria-label="Enviada" />
}

/** Resumo de uma mensagem para caber na citação. */
function resumo(m: MensagemSOS): string {
  if (m.texto) return m.texto
  if (m.midia_tipo?.startsWith('audio')) return 'Áudio'
  if (m.midia_tipo?.startsWith('image')) return 'Foto'
  if (m.local_lat != null) return 'Localização'
  return 'Mensagem'
}

/**
 * Áudio com barra de progresso.
 *
 * Sem a barra, quem recebe não sabe se o áudio tem cinco segundos ou dois
 * minutos — e na estrada essa diferença decide se dá para ouvir agora ou se
 * é melhor ligar. Por isso a duração aparece ANTES de tocar, não durante.
 */
function Audio({ url, segundos, minha }: { url: string; segundos: number | null; minha: boolean }) {
  const som = useRef<HTMLAudioElement | null>(null)
  const [tocando, setTocando] = useState(false)
  const [progresso, setProgresso] = useState(0)

  return (
    <div className={cn('cv-audio', minha && 'cv-audio-minha')}>
      <button
        type="button"
        onClick={() => {
          const a = som.current
          if (!a) return
          if (a.paused) void a.play()
          else a.pause()
        }}
        aria-label={tocando ? 'Pausar o áudio' : 'Ouvir o áudio'}
        className="cv-audio-botao"
      >
        {tocando ? <Pause className="size-[17px]" fill="currentColor" /> : <Play className="size-[17px]" fill="currentColor" />}
      </button>
      <span className="cv-audio-trilho">
        <span className="cv-audio-cheio" style={{ width: `${progresso * 100}%` }} />
      </span>
      <span className="cv-audio-tempo num">{relogio(segundos ?? 0)}</span>
      <audio
        ref={som}
        src={url}
        preload="metadata"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false)
          setProgresso(0)
        }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget
          if (a.duration && Number.isFinite(a.duration)) setProgresso(a.currentTime / a.duration)
        }}
        className="hidden"
      />
    </div>
  )
}

export function relogio(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
}
