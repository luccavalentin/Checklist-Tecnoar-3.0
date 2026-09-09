import { useCallback, useEffect, useState } from 'react'
import { CloudUpload, Loader2, RefreshCw } from 'lucide-react'
import { cn, dataHora } from '@/lib/utils'
import { Botao } from '@/componentes/ui/Botao'
import { useToast } from '@/componentes/ui/Toast'
import { listarPendentes, observarFila, processarFila, type EnvioPendente } from '@/dados/filaEnvios'

/**
 * Aviso de envios presos.
 *
 * Só aparece quando existe foto esperando sinal. Enquanto houver item na fila,
 * o operador vê quantos são e pode mandar tentar de novo — e sabe que aquelas
 * fotos ainda não estão no servidor.
 */
export function EnviosPendentes() {
  const toast = useToast()
  const [fila, setFila] = useState<EnvioPendente[]>([])
  const [enviando, setEnviando] = useState(false)

  const recarregar = useCallback(() => {
    void listarPendentes().then(setFila).catch(() => setFila([]))
  }, [])

  const tentar = useCallback(
    async (avisarResultado: boolean) => {
      setEnviando(true)
      try {
        const r = await processarFila()
        if (avisarResultado) {
          if (r.enviados > 0) toast.ok(`${r.enviados} envio(s) concluído(s)`)
          else if (r.restantes > 0) toast.erro('Ainda sem conexão com o servidor', 'As fotos continuam guardadas.')
        }
      } finally {
        setEnviando(false)
        recarregar()
      }
    },
    [recarregar, toast],
  )

  useEffect(() => {
    recarregar()
    const solta = observarFila(recarregar)

    /* Tenta ao voltar a conexão e uma vez na abertura do app. */
    const aoVoltar = () => void tentar(true)
    window.addEventListener('online', aoVoltar)
    void tentar(false)

    return () => {
      solta()
      window.removeEventListener('online', aoVoltar)
    }
  }, [recarregar, tentar])

  if (fila.length === 0) return null

  const maisAntigo = fila[0]

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-warn/40 bg-warn-soft px-4 py-2.5',
      )}
    >
      <CloudUpload aria-hidden className="size-4 shrink-0 text-warn" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[13px] font-medium text-ink">
          {fila.length} foto(s) aguardando envio
        </span>
        <span className="num text-[11.5px] text-ink-2">
          A mais antiga é de {dataHora(new Date(maisAntigo.criadoEm).toISOString())}
          {maisAntigo.ultimoErro ? ` · ${maisAntigo.ultimoErro}` : ''}
        </span>
      </div>
      <Botao
        tamanho="sm"
        variante="neutro"
        iconeInicio={enviando ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        disabled={enviando}
        onClick={() => void tentar(true)}
      >
        Tentar agora
      </Botao>
    </div>
  )
}
