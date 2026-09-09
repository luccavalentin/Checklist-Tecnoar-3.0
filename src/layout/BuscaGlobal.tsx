import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { CornerDownLeft, Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ENTIDADES_PREVISTAS, fontesRegistradas, type ResultadoBusca } from '@/busca/registro'

interface Grupo {
  rotulo: string
  itens: ResultadoBusca[]
}

export function BuscaGlobal({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const navegar = useNavigate()
  const [termo, setTermo] = useState('')
  const [grupos, setGrupos] = useState<Grupo[]>([])
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [indice, setIndice] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const planos = useMemo(() => grupos.flatMap((g) => g.itens), [grupos])

  useEffect(() => {
    if (!aberto) {
      setTermo('')
      setGrupos([])
      setErro(null)
      setIndice(0)
      return
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 30)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', onEsc)

    return () => {
      window.clearTimeout(t)
      document.body.style.overflow = overflow
      document.removeEventListener('keydown', onEsc)
    }
  }, [aberto, aoFechar])

  useEffect(() => {
    if (!aberto) return
    const alvo = termo.trim()
    if (alvo.length < 2) {
      setGrupos([])
      setBuscando(false)
      setErro(null)
      return
    }

    const controlador = new AbortController()
    const atraso = window.setTimeout(async () => {
      setBuscando(true)
      setErro(null)
      try {
        const fontes = fontesRegistradas()
        const resultados = await Promise.all(
          fontes.map(async (f) => ({ rotulo: f.rotulo, itens: await f.buscar(alvo, controlador.signal) })),
        )
        if (controlador.signal.aborted) return
        setGrupos(resultados.filter((g) => g.itens.length > 0))
        setIndice(0)
      } catch {
        if (!controlador.signal.aborted) setErro('A busca falhou. Tente novamente.')
      } finally {
        if (!controlador.signal.aborted) setBuscando(false)
      }
    }, 180)

    return () => {
      controlador.abort()
      window.clearTimeout(atraso)
    }
  }, [termo, aberto])

  if (!aberto) return null

  function abrir(r: ResultadoBusca) {
    navegar(r.rota)
    aoFechar()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') return aoFechar()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndice((i) => Math.min(i + 1, Math.max(planos.length - 1, 0)))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndice((i) => Math.max(i - 1, 0))
    }
    if (e.key === 'Enter' && planos[indice]) {
      e.preventDefault()
      abrir(planos[indice])
    }
  }

  const termoCurto = termo.trim().length > 0 && termo.trim().length < 2
  const semResultado = termo.trim().length >= 2 && !buscando && !erro && grupos.length === 0

  let contador = -1

  return createPortal(
    <div className="fixed inset-0 z-70 flex items-start justify-center p-4 pt-[8vh] sm:pt-[12vh]">
      <div className="absolute inset-0 bg-overlay backdrop-blur-[2px]" onClick={aoFechar} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca global"
        onKeyDown={onKeyDown}
        className="entrada-suave relative flex max-h-[70dvh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-e3"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search aria-hidden className="size-[18px] shrink-0 text-ink-3" />
          <input
            ref={inputRef}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar no sistema…"
            aria-label="Buscar no sistema"
            className="h-14 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
          />
          {buscando && <Loader2 aria-hidden className="size-4 animate-spin text-cyan" />}
          <kbd className="num rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-3">Esc</kbd>
        </div>

        <div className="flex-1 overflow-y-auto">
          {termo.trim().length === 0 && (
            <div className="flex flex-col gap-3 p-5">
              <span className="lbl">O que dá para encontrar</span>
              <div className="flex flex-wrap gap-1.5">
                {ENTIDADES_PREVISTAS.map((e) => (
                  <span
                    key={e}
                    className="rounded-full border border-line px-2.5 py-1 text-[11.5px] text-ink-3"
                  >
                    {e}
                  </span>
                ))}
              </div>
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                A busca cobre o que já existe no sistema. Módulos ainda não implantados não retornam resultado —
                e nada é inventado para preencher a lista.
              </p>
            </div>
          )}

          {termoCurto && <p className="p-5 text-[13px] text-ink-3">Digite ao menos 2 caracteres.</p>}

          {erro && (
            <div className="p-5">
              <p className="text-[13px] text-crit-ink">{erro}</p>
            </div>
          )}

          {semResultado && (
            <div className="flex flex-col gap-1.5 p-5">
              <p className="font-display text-[14px] font-semibold text-ink">Nenhum resultado</p>
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                Não há registro correspondente a “{termo.trim()}” nas áreas já disponíveis.
              </p>
            </div>
          )}

          {grupos.map((g) => (
            <div key={g.rotulo} className="border-b border-line py-2 last:border-b-0">
              <p className="lbl px-4 py-1.5">{g.rotulo}</p>
              <ul>
                {g.itens.map((r) => {
                  contador += 1
                  const ativo = contador === indice
                  const i = contador
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setIndice(i)}
                        onClick={() => abrir(r)}
                        className={cn(
                          'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                          ativo ? 'bg-surface-2' : 'hover:bg-surface-2',
                        )}
                      >
                        <r.icone aria-hidden className="size-4 shrink-0 text-ink-3" />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[13.5px] text-ink">{r.titulo}</span>
                          {r.subtitulo && <span className="truncate text-[11.5px] text-ink-3">{r.subtitulo}</span>}
                        </span>
                        {ativo && <CornerDownLeft aria-hidden className="size-3.5 shrink-0 text-ink-3" />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
