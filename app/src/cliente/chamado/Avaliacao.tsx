import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, PartyPopper } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sosAvaliar } from '@/sos/api'
import { Estrelas } from '@/sos/componentes'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { DetalheChamado } from '@/sos/tipos'
import { AreaApp, Avatar, BotaoApp, Faixa } from '../../comum/ui'

const SENTIDO_NOTA = ['', 'Muito ruim', 'Ruim', 'Regular', 'Bom', 'Excelente']
const ELOGIOS = ['Chegou rápido', 'Resolveu o problema', 'Educado e atencioso', 'Explicou o que fez', 'Preço justo']
const QUEIXAS = ['Demorou para chegar', 'Não resolveu', 'Faltou explicar', 'Faltou peça']

/**
 * Avaliação no fim do atendimento — tela inteira, porque é o momento em que a
 * pessoa está aliviada e disposta a responder. Uma nota basta; o resto é
 * opcional e vira texto para a central.
 */
export function TelaAvaliacao({ detalhe, aoFechar }: { detalhe: DetalheChamado; aoFechar: () => void }) {
  const qc = useQueryClient()
  const [nota, setNota] = useState(0)
  const [marcas, setMarcas] = useState<string[]>([])
  const [comentario, setComentario] = useState('')
  const [enviado, setEnviado] = useState(false)
  const c = detalhe.chamado
  const mec = detalhe.mecanico

  const enviar = useMutation({
    mutationFn: () => sosAvaliar(c.id, nota, [marcas.join(' · '), comentario.trim()].filter(Boolean).join('\n') || null),
    onSuccess: () => {
      setEnviado(true)
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(c.id) })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeCliente })
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.meusChamados })
      window.setTimeout(aoFechar, 1800)
    },
  })

  const sugestoes = nota === 0 ? [] : nota >= 4 ? ELOGIOS : QUEIXAS

  return (
    <div className="fixed inset-0 z-[90] flex flex-col overflow-y-auto bg-canvas" role="dialog" aria-modal="true" aria-label="Avaliar atendimento">
      <div className="px-5 pt-[calc(2rem+env(safe-area-inset-top)+var(--faixa-rede,0px))] pb-2 text-center">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
          <span className="flex size-16 items-center justify-center rounded-full bg-ok text-white">
            {enviado ? <PartyPopper className="size-8" /> : <Check className="size-9" strokeWidth={3} />}
          </span>
          <h1 className="font-display text-[26px] leading-tight font-bold text-ink">{enviado ? 'Obrigado!' : 'Serviço finalizado'}</h1>
          <p className="num text-[13px] text-ink-3">{c.protocolo}</p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-5 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {enviado ? (
          <p className="text-center text-[15px] leading-relaxed text-ink-2">Sua avaliação chegou à Tecnoar. Ela ajuda a manter o socorro rápido e bem feito.</p>
        ) : (
          <>
            {mec && (
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                <Avatar nome={mec.nome} url={mec.avatar_url} />
                <div className="min-w-0">
                  <p className="text-[12px] text-ink-3">Atendido por</p>
                  <p className="truncate font-display text-[16px] font-bold text-ink">{mec.nome}</p>
                </div>
              </div>
            )}

            <div className="flex flex-col items-center gap-2 text-center">
              <h2 className="font-display text-[20px] font-bold text-ink">Como foi o atendimento?</h2>
              <div className="py-1 [&_button]:p-1.5 [&_svg]:size-11">
                <Estrelas valor={nota} aoMudar={setNota} tamanho="lg" />
              </div>
              <p className={cn('h-5 text-[14px] font-semibold', nota >= 4 ? 'text-ok-ink' : nota > 0 ? 'text-warn-ink' : 'text-ink-3')}>
                {nota ? SENTIDO_NOTA[nota] : 'Toque nas estrelas'}
              </p>
            </div>

            {sugestoes.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {sugestoes.map((s) => {
                  const ativo = marcas.includes(s)
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={ativo}
                      onClick={() => setMarcas((m) => (ativo ? m.filter((x) => x !== s) : [...m, s]))}
                      className={cn(
                        'min-h-10 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
                        ativo ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong text-ink-2',
                      )}
                    >
                      {s}
                    </button>
                  )
                })}
              </div>
            )}

            {nota > 0 && (
              <AreaApp
                rotulo="Quer deixar um comentário? (opcional)"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                maxLength={500}
                rows={3}
              />
            )}

            {enviar.isError && <Faixa tom="critico">{(enviar.error as Error).message}</Faixa>}

            <div className="mt-auto flex flex-col gap-2 pt-2">
              <BotaoApp tamanho="xl" largo disabled={!nota} carregando={enviar.isPending} onClick={() => enviar.mutate()}>
                Enviar avaliação
              </BotaoApp>
              <BotaoApp variante="fantasma" tamanho="md" largo onClick={aoFechar}>
                Agora não
              </BotaoApp>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
