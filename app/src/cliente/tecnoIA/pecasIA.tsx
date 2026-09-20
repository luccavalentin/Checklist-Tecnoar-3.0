import { Fragment, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Ellipsis, Brain, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Folha } from '../../comum/ui'
import { useHomeCliente } from '../dados'

/**
 * Peças da Tecno IA usadas pelos dois modos — a conversa com a IA e o guia
 * rápido do aparelho: moldura de tela cheia com o SOS sempre à mão, balões e
 * o texto da IA com negrito e listas.
 */

/* ── moldura ────────────────────────────────────────────────────────────── */

export interface OpcaoMenuIA {
  rotulo: string
  descricao?: string
  icone: LucideIcon
  aoEscolher?: () => void
  href?: string | null
  desativada?: boolean
}

/**
 * Tela cheia (sem a barra do app): cabeçalho fixo com voltar, o nome da IA,
 * o botão SOS vermelho — em qualquer modo, em qualquer momento — e o menu.
 */
export function MolduraIA({
  subtitulo,
  pensando,
  opcoes,
  children,
}: {
  subtitulo: string
  pensando?: boolean
  opcoes: OpcaoMenuIA[]
  children: ReactNode
}) {
  const navegar = useNavigate()
  const [menu, setMenu] = useState(false)

  function voltar() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navegar(-1)
    else navegar('/', { replace: true })
  }

  return (
    <div className="cli-palco">
      <div className="cli-coluna">
      <header className="tecno-ia-header sticky top-0 z-30 pt-[calc(env(safe-area-inset-top)+var(--faixa-rede,0px))]">
        <div className="mx-auto flex min-h-[4.2rem] max-w-2xl items-center gap-2 px-2 pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(0.5rem,env(safe-area-inset-left))]">
          <button type="button" aria-label="Voltar" onClick={voltar} className="sos-icon-button flex size-11 shrink-0 items-center justify-center rounded-full text-ink">
            <ChevronLeft className="size-6" />
          </button>
          <AvatarIA className="max-[359px]:hidden" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[17px] leading-tight font-bold text-ink">Tecno IA</h1>
            <p className={cn('truncate text-[12.5px]', pensando ? 'font-semibold text-accent-ink' : 'text-ink-3')} aria-live="polite">
              {pensando ? 'digitando…' : subtitulo}
            </p>
          </div>
          <BotaoSOSTopo />
          <button
            type="button"
            aria-label="Mais opções"
            aria-haspopup="dialog"
            onClick={() => setMenu(true)}
            className="sos-icon-button flex size-11 shrink-0 items-center justify-center rounded-full text-ink-2"
          >
            <Ellipsis className="size-5" />
          </button>
        </div>
      </header>

      {children}
      </div>

      <Folha aberta={menu} aoFechar={() => setMenu(false)} titulo="Tecno IA">
        <ul className="flex flex-col gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          {opcoes.map((o) => {
            const Icone = o.icone
            const conteudo = (
              <>
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[1rem] bg-accent-soft text-accent">
                  <Icone className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink">{o.rotulo}</span>
                  {o.descricao && <span className="block text-[12.5px] leading-snug text-ink-3">{o.descricao}</span>}
                </span>
                <ChevronRight className="size-5 shrink-0 text-ink-3" />
              </>
            )
            const cls = cn('sos-native-card flex min-h-14 w-full items-center gap-3 rounded-[1.25rem] px-3 py-2 text-left active:bg-surface-2', o.desativada && 'pointer-events-none opacity-45')
            return (
              <li key={o.rotulo}>
                {o.href ? (
                  <a href={o.href} className={cls} onClick={() => setMenu(false)}>
                    {conteudo}
                  </a>
                ) : (
                  <button
                    type="button"
                    disabled={o.desativada}
                    className={cls}
                    onClick={() => {
                      setMenu(false)
                      o.aoEscolher?.()
                    }}
                  >
                    {conteudo}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </Folha>
    </div>
  )
}

/**
 * O SOS nunca sai da tela da Tecno IA. Com socorro já aberto, leva ao
 * acompanhamento — ninguém pede um segundo por engano.
 */
export function BotaoSOSTopo() {
  const navegar = useNavigate()
  const ativo = useHomeCliente().data?.chamado_ativo ?? null
  return (
    <button
      type="button"
      onClick={() => navegar(ativo ? `/chamado/${ativo.id}` : '/sos')}
      aria-label={ativo ? 'Acompanhar o socorro em andamento' : 'Pedir socorro (SOS)'}
      className="sos-siren-action flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 font-display text-[15px] font-semibold text-white active:scale-95"
    >
      <span className={cn('size-2 rounded-full bg-white', ativo && 'sos-piscar')} aria-hidden />
      {ativo ? 'Ao vivo' : 'SOS'}
    </button>
  )
}

/* ── conversa ───────────────────────────────────────────────────────────── */

export function AvatarIA({ grande, className }: { grande?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'tecno-ia-avatar flex shrink-0 items-center justify-center rounded-full text-[#ff9a4d]',
        grande ? 'size-14 rounded-2xl' : 'size-8',
        className,
      )}
    >
      <Brain className={grande ? 'size-7' : 'size-4'} />
    </span>
  )
}

export function BalaoIA({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-end gap-2', className)}>
      <AvatarIA />
      <div className="tecno-ia-bubble-ai max-w-[85%] min-w-0 rounded-[1.25rem] rounded-bl-md px-4 py-3 text-[15px] leading-relaxed break-words text-ink">{children}</div>
    </div>
  )
}

export function BalaoVoce({ children, rodape, soFoto }: { children: ReactNode; rodape?: ReactNode; soFoto?: boolean }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className={cn(
          'tecno-ia-bubble-user entrada-suave max-w-[80%] min-w-0 rounded-[1.25rem] rounded-br-md text-[15px] font-medium break-words whitespace-pre-line text-white',
          soFoto ? 'p-1' : 'px-4 py-2.5',
        )}
      >
        {children}
      </div>
      {rodape}
    </div>
  )
}

export function Digitando() {
  return (
    <div className="flex items-end gap-2" role="status" aria-label="Tecno IA está pensando">
      <AvatarIA />
      <div className="tecno-ia-bubble-ai flex h-11 items-center gap-1.5 rounded-[1.25rem] rounded-bl-md px-4">
        {[0, 1, 2].map((i) => (
          <span key={i} className="size-2 animate-bounce rounded-full bg-ink-3" style={{ animationDelay: `${i * 120}ms` }} />
        ))}
      </div>
    </div>
  )
}

/* ── texto da IA ────────────────────────────────────────────────────────── */

/**
 * Markdown mínimo do que os modelos costumam mandar: **negrito**, quebras de
 * linha, listas com "-", "•" ou "1." e títulos com "#" (viram negrito). Tudo
 * vira elemento React — nada de HTML injetado.
 */
export function TextoIA({ texto }: { texto: string }) {
  const blocos: ReactNode[] = []
  const linhas = texto.replace(/\r/g, '').split('\n')
  let lista: { tipo: 'ul' | 'ol'; itens: string[] } | null = null
  let paragrafo: string[] = []

  const fecharParagrafo = () => {
    if (!paragrafo.length) return
    const n = blocos.length
    blocos.push(
      <p key={`p${n}`}>
        {paragrafo.map((l, i) => (
          <Fragment key={i}>
            {i > 0 && <br />}
            <Inline texto={l} />
          </Fragment>
        ))}
      </p>,
    )
    paragrafo = []
  }
  const fecharLista = () => {
    if (!lista) return
    const n = blocos.length
    const itens = lista.itens.map((l, i) => (
      <li key={i}>
        <Inline texto={l} />
      </li>
    ))
    blocos.push(
      lista.tipo === 'ul' ? (
        <ul key={`l${n}`} className="flex list-disc flex-col gap-1 pl-5 marker:text-accent">
          {itens}
        </ul>
      ) : (
        <ol key={`l${n}`} className="flex list-decimal flex-col gap-1 pl-5 marker:font-bold marker:text-accent">
          {itens}
        </ol>
      ),
    )
    lista = null
  }

  for (const bruta of linhas) {
    const l = bruta.trimEnd()
    const marcador = l.match(/^\s*[-•*]\s+(.*)$/)
    const numero = l.match(/^\s*\d{1,2}[.)]\s+(.*)$/)
    const titulo = l.match(/^\s*#{1,6}\s+(.*)$/)
    if (!l.trim()) {
      fecharParagrafo()
      fecharLista()
    } else if (marcador || numero) {
      fecharParagrafo()
      const tipo = marcador ? 'ul' : 'ol'
      if (lista && lista.tipo !== tipo) fecharLista()
      if (!lista) lista = { tipo, itens: [] }
      lista.itens.push((marcador ?? numero)![1])
    } else if (titulo) {
      fecharParagrafo()
      fecharLista()
      blocos.push(
        <p key={`t${blocos.length}`} className="font-bold text-ink">
          <Inline texto={titulo[1].replace(/\*\*/g, '')} />
        </p>,
      )
    } else {
      fecharLista()
      paragrafo.push(l)
    }
  }
  fecharParagrafo()
  fecharLista()

  return <div className="flex flex-col gap-2">{blocos}</div>
}

function Inline({ texto }: { texto: string }) {
  const partes = texto.split(/(\*\*[^*]+\*\*|__[^_]+__)/g)
  return (
    <>
      {partes.map((p, i) =>
        /^(\*\*|__).+(\*\*|__)$/.test(p) ? (
          <strong key={i} className="font-bold text-ink">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{p.replace(/(^|\s)\*(\S[^*]*\S|\S)\*(?=\s|$|[.,;:!?])/g, '$1$2')}</Fragment>
        ),
      )}
    </>
  )
}
