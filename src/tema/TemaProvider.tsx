import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { TemaInterface } from '@/tipos/db'

const CHAVE = 'tecnoar.tema'

interface CtxTema {
  tema: TemaInterface
  escuro: boolean
  definirTema: (t: TemaInterface) => void
}

const Ctx = createContext<CtxTema | null>(null)

function lerPreferencia(): TemaInterface {
  try {
    const v = localStorage.getItem(CHAVE)
    if (v === 'claro' || v === 'escuro' || v === 'sistema') return v
  } catch {
    /* localStorage indisponível */
  }
  return 'sistema'
}

function resolverEscuro(t: TemaInterface): boolean {
  if (t === 'escuro') return true
  if (t === 'claro') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ProvedorTema({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<TemaInterface>(lerPreferencia)
  const [escuro, setEscuro] = useState<boolean>(() => resolverEscuro(lerPreferencia()))

  const aplicar = useCallback((t: TemaInterface) => {
    const dark = resolverEscuro(t)
    document.documentElement.classList.toggle('dark', dark)
    document
      .querySelector('meta[name="theme-color"]:not([media])')
      ?.setAttribute('content', dark ? '#081830' : '#FFFFFF')
    setEscuro(dark)
  }, [])

  useEffect(() => {
    aplicar(tema)
    try {
      localStorage.setItem(CHAVE, tema)
    } catch {
      /* ignora */
    }
  }, [tema, aplicar])

  // Acompanha a mudança do sistema operacional quando o modo é "sistema".
  useEffect(() => {
    if (tema !== 'sistema') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => aplicar('sistema')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [tema, aplicar])

  const valor = useMemo<CtxTema>(() => ({ tema, escuro, definirTema: setTema }), [tema, escuro])

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useTema(): CtxTema {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTema precisa estar dentro de <ProvedorTema>.')
  return ctx
}
