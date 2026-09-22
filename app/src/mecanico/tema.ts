import { useLayoutEffect } from 'react'

/**
 * Tema do app do mecânico.
 *
 * Usa o mesmo tema escolhido no app. Cliente e mecânico precisam alternar
 * claro/escuro de forma previsível, sem uma tela forçar outra aparência.
 */

export type TemaMecanico = 'claro' | 'escuro' | 'sistema'

const CHAVE = 'sos.tema'

export function lerTemaMecanico(): TemaMecanico {
  try {
    const v = localStorage.getItem(CHAVE)
    if (v === 'claro' || v === 'escuro' || v === 'sistema') return v
  } catch {
    /* sem armazenamento */
  }
  return 'escuro'
}

function ehEscuro(t: TemaMecanico): boolean {
  return t === 'escuro' || (t === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches)
}

export function aplicarTemaMecanico(t: TemaMecanico) {
  try {
    localStorage.setItem(CHAVE, t)
  } catch {
    /* sem armazenamento */
  }
  document.documentElement.classList.toggle('dark', ehEscuro(t))
}

/**
 * Garante que as telas do mecânico acompanhem o tema salvo antes do primeiro
 * desenho visível.
 */
export function useTemaMecanico() {
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', ehEscuro(lerTemaMecanico()))
  }, [])
}
