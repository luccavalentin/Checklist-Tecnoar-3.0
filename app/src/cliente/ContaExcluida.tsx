import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Check, FileText, PhoneCall, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { linkTelefone } from '@/sos/rotulos'
import { BotaoApp, LogoSOS } from '../comum/ui'
import { limparDadosLocais } from '../sessao'
import { useInfoPublica } from './dados'

/**
 * Despedida depois de excluir a conta (LGPD). Rota pública: a sessão é
 * encerrada aqui, com a tela já trocada — assim o roteador não pisca a tela
 * de entrada no meio do caminho.
 *
 * Só abre vindo da exclusão (`state.excluida`); digitada à mão, volta ao início.
 */
export function ContaExcluida() {
  const local = useLocation()
  const navegar = useNavigate()
  const qc = useQueryClient()
  const info = useInfoPublica()
  const veioDaExclusao = (local.state as { excluida?: boolean } | null)?.excluida === true
  const [encerrado, setEncerrado] = useState(false)

  useEffect(() => {
    if (!veioDaExclusao) return
    let vivo = true
    void (async () => {
      // O usuário já não existe no servidor: basta limpar a sessão do aparelho.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
      qc.clear()
      // Nada da pessoa fica no aparelho: papel, pedido pendente, rascunhos, IA.
      limparDadosLocais({ manterFilaDoMecanico: false })
      // Este aparelho não deve mais receber avisos de uma conta que não existe.
      try {
        const registro = await navigator.serviceWorker?.getRegistration?.()
        const inscricao = await registro?.pushManager?.getSubscription()
        await inscricao?.unsubscribe()
      } catch {
        /* sem service worker ou sem push: nada a desfazer */
      }
      if (vivo) setEncerrado(true)
    })()
    return () => {
      vivo = false
    }
  }, [veioDaExclusao, qc])

  if (!veioDaExclusao) return <Navigate to="/" replace />

  const tel = linkTelefone(info.data?.telefone)

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <LogoSOS altura={30} className="self-start" />

        <div className="mt-10 flex flex-col items-center gap-4 text-center">
          <span className="flex size-20 items-center justify-center rounded-full bg-ok text-white">
            <Check className="size-10" strokeWidth={3} />
          </span>
          <h1 className="font-display text-[28px] leading-tight font-bold">Sua conta foi excluída</h1>
          <p className="max-w-sm text-[15px] leading-relaxed text-ink-2">Obrigado por ter usado o app da Tecnoar. Se precisar de nós na estrada, é só voltar.</p>
        </div>

        <section className="mt-8 flex flex-col gap-3 rounded-[1.25rem] border border-line bg-surface p-4" aria-label="O que aconteceu com seus dados">
          <p className="text-[13.5px] font-semibold text-ink">O que foi apagado</p>
          <ul className="flex flex-col gap-2 text-[14px] leading-snug text-ink-2">
            {['Seu acesso (e-mail e senha) e o vínculo da conta', 'Todo o trajeto de localização registrado nos socorros', 'As conversas com a Tecno IA', 'Os links de acompanhamento que ainda estavam ativos'].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-ok" strokeWidth={3} /> {t}
              </li>
            ))}
          </ul>
          <div className="mt-1 flex items-start gap-2.5 rounded-2xl bg-surface-2 p-3 text-[13px] leading-snug text-ink-2">
            <FileText className="mt-0.5 size-4 shrink-0 text-accent-ink" />
            <span>Os registros dos serviços prestados (chamados, ordens de serviço e laudos) continuam com a {info.data?.empresa ?? 'Tecnoar'} pelo prazo legal, sem ligação com a conta do app.</span>
          </div>
        </section>

        <div className="mt-auto flex flex-col gap-2 pt-8">
          {tel && (
            <a href={tel} className="flex min-h-14 items-center justify-center gap-2.5 rounded-2xl bg-[#0D1C33] font-display text-[16px] font-bold text-white active:scale-[0.99]">
              <PhoneCall className="size-5" /> Precisa de socorro? Ligue
            </a>
          )}
          <BotaoApp tamanho="lg" largo icone={UserPlus} disabled={!encerrado} onClick={() => navegar('/cadastro', { replace: true })}>
            Criar uma nova conta
          </BotaoApp>
          <button
            type="button"
            disabled={!encerrado}
            onClick={() => navegar('/entrar', { replace: true })}
            className="min-h-12 text-[14px] font-semibold text-ink-2 disabled:opacity-50"
          >
            Ir para a tela de entrada
          </button>
        </div>
      </main>
    </div>
  )
}
