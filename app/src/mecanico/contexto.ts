import { createContext, useContext } from 'react'
import type { ErroGPS, LeituraGPS } from '@/sos/geo'

/**
 * O que a casca do mecânico compartilha com as telas de dentro: o GPS de quem
 * está disponível (o envio de posição mora na casca para continuar rodando em
 * qualquer aba) e o atalho para trocar de situação.
 */
export interface ValorCasca {
  gps: { posicao: LeituraGPS | null; erroGps: ErroGPS | null; ativo: boolean }
  abrirSituacao: () => void
  /** Avisos não lidos (o sino do Início). */
  naoLidas: number
}

export const ContextoCasca = createContext<ValorCasca>({
  gps: { posicao: null, erroGps: null, ativo: false },
  abrirSituacao: () => {},
  naoLidas: 0,
})

export function useCasca(): ValorCasca {
  return useContext(ContextoCasca)
}
