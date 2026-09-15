import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, CheckCheck, Clock3, Loader2, RotateCw, Send, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sosMarcarMensagensLidas } from '@/sos/api'
import { MENSAGENS_RAPIDAS_MECANICO, STATUS_ENCERRADOS, horaCurta } from '@/sos/rotulos'
import type { DetalheChamado } from '@/sos/tipos'
import { useMecanico } from '../sessao'
import { descartarAcao, enviarAcao, tentarDeNovo, useFilaChamado, type AcaoFila } from './filaOffline'

const PAPEL: Record<string, string> = { cliente: 'Cliente', mecanico: 'Mecânico', central: 'Central', sistema: 'Sistema' }

/**
 * Conversa do mecânico com o cliente. Igual à do cliente, com uma diferença
 * que importa na estrada: sem sinal a mensagem não se perde — aparece na
 * conversa como "aguardando sinal" e sai sozinha quando a internet voltar.
 * Os atalhos são grandes: quem escreve de luva precisa de um toque.
 */
export function ConversaCampo({ d }: { d: DetalheChamado }) {
  const { usuarioId } = useMecanico()
  const chamadoId = d.chamado.id
  const { acoes, emVoo } = useFilaChamado(chamadoId)
  const pendentes = acoes.filter((a): a is Extract<AcaoFila, { tipo: 'mensagem' }> => a.tipo === 'mensagem')
  const encerrado = STATUS_ENCERRADOS.includes(d.chamado.status)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const lista = useRef<HTMLDivElement>(null)

  const naoLidas = d.mensagens.some((m) => !m.lida_em && m.autor_id !== usuarioId)
  useEffect(() => {
    if (naoLidas) void sosMarcarMensagensLidas(chamadoId).catch(() => {})
  }, [naoLidas, chamadoId, d.mensagens.length])

  useEffect(() => {
    // Rola só a lista — rolar a página arrastaria o mapa junto.
    const el = lista.current
    if (el) el.scrollTop = el.scrollHeight
  }, [d.mensagens.length, pendentes.length])

  function enviar(t: string, rapida = false) {
    const limpo = t.trim()
    if (!limpo) return
    setErro(null)
    if (!rapida) setTexto('')
    // A mensagem entra na conversa na hora (como pendente); o erro de verdade
    // devolve o texto para a caixa.
    enviarAcao({ tipo: 'mensagem', chamadoId, texto: limpo, rapida }).catch((e: Error) => {
      setErro(e.message)
      if (!rapida) setTexto((atual) => atual || limpo)
    })
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div ref={lista} className="flex max-h-[46dvh] min-h-24 flex-col gap-2 overflow-y-auto overscroll-contain pr-1">
        {d.mensagens.length === 0 && pendentes.length === 0 && (
          <p className="py-6 text-center text-[13px] text-ink-3">Nenhuma mensagem. Use os atalhos abaixo para avisar rápido.</p>
        )}
        {d.mensagens.map((m) => {
          const minha = m.autor_id === usuarioId
          return (
            <div key={m.id} className={cn('flex flex-col', minha ? 'items-end' : 'items-start')}>
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-3.5 py-2 text-[14.5px] leading-snug break-words shadow-e1',
                  minha ? 'rounded-br-md bg-accent text-on-accent' : 'rounded-bl-md border border-line bg-surface text-ink',
                )}
              >
                {!minha && (
                  <p className="mb-0.5 text-[11px] font-semibold opacity-75">
                    {m.autor_nome?.split(' ')[0] ?? PAPEL[m.autor_papel]} · {PAPEL[m.autor_papel]}
                  </p>
                )}
                {m.texto}
              </div>
              <span className="mt-0.5 flex items-center gap-1 px-1 text-[10.5px] text-ink-3">
                {horaCurta(m.created_at)}
                {minha && (m.lida_em ? <CheckCheck className="size-3 text-cyan" aria-label="Lida" /> : <Check className="size-3" aria-label="Enviada" />)}
              </span>
            </div>
          )
        })}
        {pendentes.map((p) => (
          <MensagemPendente key={p.id} acao={p} enviando={p.id === emVoo} />
        ))}
      </div>

      {encerrado ? (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-center text-[12.5px] text-ink-3">Chamado encerrado: a conversa foi fechada.</p>
      ) : (
        <>
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label="Mensagens rápidas">
            {MENSAGENS_RAPIDAS_MECANICO.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => enviar(r, true)}
                className="min-h-11 shrink-0 rounded-full border border-line-strong bg-surface px-3.5 text-[13.5px] font-semibold whitespace-nowrap text-ink transition-colors active:scale-[0.98] active:border-accent"
              >
                {r}
              </button>
            ))}
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              enviar(texto)
            }}
          >
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  enviar(texto)
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Escreva uma mensagem"
              aria-label="Mensagem"
              className="max-h-28 min-h-12 min-w-0 flex-1 resize-none rounded-2xl border border-line-strong bg-inset px-3.5 py-3 text-[16px] text-ink outline-none placeholder:text-ink-3 focus:border-accent"
            />
            <button
              type="submit"
              aria-label="Enviar"
              disabled={!texto.trim()}
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent shadow-accent transition-transform active:scale-95 disabled:opacity-40"
            >
              <Send className="size-5" />
            </button>
          </form>
          {erro && <p className="text-[12.5px] font-medium text-crit-ink">{erro}</p>}
        </>
      )}
    </div>
  )
}

/** Mensagem que ainda não chegou ao servidor: enviando, aguardando sinal ou recusada. */
function MensagemPendente({ acao, enviando }: { acao: Extract<AcaoFila, { tipo: 'mensagem' }>; enviando: boolean }) {
  return (
    <div className="flex flex-col items-end">
      <div
        className={cn(
          'max-w-[85%] rounded-2xl rounded-br-md border-2 border-dashed px-3.5 py-2 text-[14.5px] leading-snug break-words',
          acao.erro ? 'border-crit/50 bg-crit-soft text-crit-ink' : 'border-accent/45 bg-accent-soft text-accent-ink',
        )}
      >
        {acao.texto}
      </div>
      {acao.erro ? (
        <div className="mt-1 flex max-w-[85%] flex-col items-end gap-1">
          <span className="flex items-start gap-1 text-right text-[11.5px] font-semibold text-crit-ink">
            <AlertTriangle className="mt-px size-3.5 shrink-0" /> Não enviada: {acao.erro}
          </span>
          <span className="flex gap-1.5">
            <button type="button" onClick={() => tentarDeNovo(acao.id)} className="sos-chip flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-bold text-ink">
              <RotateCw className="size-3.5" /> Tentar de novo
            </button>
            <button type="button" onClick={() => descartarAcao(acao.id)} className="flex min-h-10 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold text-ink-3" aria-label="Descartar mensagem">
              <Trash2 className="size-3.5" /> Descartar
            </button>
          </span>
        </div>
      ) : (
        <span className="mt-0.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-warn-ink">
          {enviando ? (
            <>
              <Loader2 className="size-3 animate-spin" /> Enviando…
            </>
          ) : (
            <>
              <Clock3 className="size-3" /> Aguardando sinal · {horaCurta(acao.criadaEm)}
            </>
          )}
        </span>
      )}
    </div>
  )
}
