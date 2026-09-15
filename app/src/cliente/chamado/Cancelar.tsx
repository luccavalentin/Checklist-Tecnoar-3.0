import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { useToast } from '@/componentes/ui/Toast'
import { sosCancelar } from '@/sos/api'
import { CHAVES_SOS } from '@/sos/tempoReal'
import { AreaApp, BotaoApp, Faixa, Folha } from '../../comum/ui'

const MOTIVOS = ['Consegui resolver sozinho', 'Outro socorro vai me atender', 'Pedi por engano', 'Está demorando muito', 'Outro motivo']

/**
 * Cancelar o SOS. Motivo obrigatório (é regra do banco e ajuda a central a
 * entender o que aconteceu), escolhido com um toque. Quem decide se ainda dá
 * para cancelar é o banco — a mensagem dele aparece aqui como veio.
 */
export function FolhaCancelar({ chamadoId, aberta, aoFechar }: { chamadoId: string; aberta: boolean; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [motivo, setMotivo] = useState<string | null>(null)
  const [texto, setTexto] = useState('')

  const final = motivo === 'Outro motivo' ? texto.trim() : [motivo, texto.trim()].filter(Boolean).join(' — ')

  const cancelar = useMutation({
    mutationFn: () => sosCancelar(chamadoId, final),
    onSuccess: () => {
      toast.ok('Socorro cancelado', 'A Tecnoar e o mecânico foram avisados.')
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(chamadoId) })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeCliente })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.meusChamados })
      aoFechar()
    },
  })

  return (
    <Folha
      aberta={aberta}
      aoFechar={aoFechar}
      titulo="Cancelar o socorro?"
      descricao="Se o mecânico já estiver a caminho, ele volta. Conte o motivo:"
      rodape={
        <>
          {cancelar.isError && <Faixa tom="critico">{(cancelar.error as Error).message}</Faixa>}
          <BotaoApp variante="perigo" tamanho="lg" largo disabled={!final} carregando={cancelar.isPending} onClick={() => cancelar.mutate()}>
            Cancelar o socorro
          </BotaoApp>
          <BotaoApp variante="fantasma" tamanho="md" largo onClick={aoFechar}>
            Voltar, não cancelar
          </BotaoApp>
        </>
      }
    >
      <div className="flex flex-col gap-2 pb-2">
        {MOTIVOS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={motivo === m}
            onClick={() => setMotivo(m)}
            className={cn(
              'flex min-h-12 items-center rounded-xl border px-4 text-left text-[15px] font-medium transition-colors',
              motivo === m ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong text-ink',
            )}
          >
            {m}
          </button>
        ))}
        {motivo && (
          <AreaApp
            rotulo={motivo === 'Outro motivo' ? 'Qual o motivo?' : 'Algo mais? (opcional)'}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={300}
            rows={2}
            className="mt-2"
          />
        )}
      </div>
    </Folha>
  )
}
