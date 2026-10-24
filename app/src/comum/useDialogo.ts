import { useEffect, useRef } from 'react'

/** Preserva foco, rolagem e navegação por teclado nas janelas do app. */
export function useDialogo(aberta: boolean, aoFechar: () => void) {
  const painel = useRef<HTMLDivElement>(null)
  const fechar = useRef(aoFechar)
  fechar.current = aoFechar
  useEffect(() => {
    if (!aberta) return
    const anterior = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    painel.current?.focus()
    function teclado(e: KeyboardEvent) {
      if (!painel.current?.contains(document.activeElement)) return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar.current(); return }
      if (e.key !== 'Tab') return
      const alvos = [...painel.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length)
      const primeiro = alvos[0], ultimo = alvos[alvos.length - 1]
      if (!primeiro) { e.preventDefault(); return }
      if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === painel.current)) { e.preventDefault(); ultimo.focus() }
      else if (!e.shiftKey && (document.activeElement === ultimo || document.activeElement === painel.current)) { e.preventDefault(); primeiro.focus() }
    }
    document.addEventListener('keydown', teclado)
    return () => { document.removeEventListener('keydown', teclado); document.body.style.overflow = overflow; if (anterior?.isConnected) anterior.focus() }
  }, [aberta])
  return painel
}
