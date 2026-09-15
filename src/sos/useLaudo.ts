import { useCallback, useEffect, useRef, useState } from 'react'
import { entregarArquivo, gerarLaudoArquivo, podeCompartilharArquivo } from './laudo'

export type EstadoLaudo = 'ocioso' | 'preparando' | 'pronto' | 'erro'

/**
 * Laudo em dois tempos, para o celular.
 *
 * O Safari do iPhone só abre a folha de compartilhar se a chamada sair direto
 * do toque; montar o PDF (dados, fotos, fontes) leva alguns segundos e quebra
 * esse vínculo. Então: 1º toque prepara (`preparar`); quando fica `pronto`, o
 * 2º toque entrega na hora (`entregar`). Onde não há folha de compartilhar
 * (computador), o arquivo já é baixado assim que fica pronto.
 */
export function useLaudoSOS(chamadoId: string) {
  const [estado, setEstado] = useState<EstadoLaudo>('ocioso')
  const [erro, setErro] = useState<string | null>(null)
  const arquivo = useRef<File | null>(null)

  useEffect(() => {
    arquivo.current = null
    setEstado('ocioso')
    setErro(null)
  }, [chamadoId])

  const preparar = useCallback(async () => {
    setEstado('preparando')
    setErro(null)
    try {
      const f = await gerarLaudoArquivo(chamadoId)
      if (podeCompartilharArquivo(f)) {
        arquivo.current = f
        setEstado('pronto')
      } else {
        await entregarArquivo(f)
        setEstado('ocioso')
      }
    } catch (e) {
      setErro((e as Error)?.message || 'Não foi possível gerar o laudo.')
      setEstado('erro')
    }
  }, [chamadoId])

  /** Chame direto no `onClick` do botão "Compartilhar". */
  const entregar = useCallback(() => {
    const f = arquivo.current
    if (!f) return
    void entregarArquivo(f).then((r) => {
      if (r !== 'cancelado') setEstado('ocioso')
    })
  }, [])

  return { estado, erro, preparar, entregar }
}
