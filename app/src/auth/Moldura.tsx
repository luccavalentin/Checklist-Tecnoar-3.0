import { useEffect, useState, type ReactNode } from 'react'
import { LogoSOS } from '../comum/ui'

const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Hora do aparelho, virando o minuto na hora certa. */
function Relogio() {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    let t: number
    const agendar = () => {
      const d = new Date()
      t = window.setTimeout(() => {
        setAgora(new Date())
        agendar()
      }, 60_000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50)
    }
    agendar()
    // Voltando de segundo plano o timer pode ter atrasado: acerta na hora.
    const aoVoltar = () => document.visibilityState === 'visible' && setAgora(new Date())
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      window.clearTimeout(t)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [])
  return (
    <time className="num" dateTime={agora.toISOString()}>
      {HORA.format(agora)}
    </time>
  )
}

/**
 * Moldura das telas de acesso: abre como splash de aplicativo, com imagem da
 * marca, logo grande e formulário compacto na parte inferior. A entrada do
 * mecânico usa a foto da oficina e a faixa laranja, para ninguém confundir as
 * duas portas.
 */
export function MolduraAcesso({
  titulo,
  subtitulo,
  children,
  rodape,
  topo,
  selo = 'SOS Tecnoar',
  mecanico = false,
}: {
  titulo: ReactNode
  subtitulo?: ReactNode
  children: ReactNode
  rodape?: ReactNode
  /** Ação de destaque acima do formulário (o SOS na entrada do cliente). */
  topo?: ReactNode
  selo?: ReactNode
  mecanico?: boolean
}) {
  return (
    <div className={mecanico ? 'sos-login-shell sos-login-mecanico' : 'sos-login-shell'}>
      <div className="sos-login-frame">
        <div className="flex items-center justify-between text-[13px] font-semibold text-white/82">
          <Relogio />
          <span className="rounded-full border border-white/16 bg-white/10 px-3 py-1 backdrop-blur-md">{selo}</span>
        </div>

        <div className="sos-login-brand">
          <span className="mb-4 rounded-full border border-[#00afef]/45 bg-[#0D1C33]/62 px-4 py-1.5 text-[12px] font-black tracking-[0.18em] text-white uppercase backdrop-blur-md">
            SOS Tecnoar
          </span>
          <LogoSOS negativo altura={132} className="max-w-[17rem]" />
          <p className="mt-4 max-w-[17rem] text-[12px] leading-relaxed font-black tracking-[0.24em] text-white/90 uppercase">
            {mecanico ? 'Área do mecânico' : 'Você sempre em movimento'}
          </p>
        </div>

        {topo && <div className="-mt-2 mb-6 flex justify-center">{topo}</div>}

        <section className="sos-access-card rounded-[1.55rem] p-5">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-[23px] leading-tight font-black text-ink">{titulo}</h1>
            {subtitulo && <p className="text-[14px] leading-snug text-ink-2">{subtitulo}</p>}
          </div>

          <div className="mt-5 flex flex-col gap-4">{children}</div>
        </section>

        {rodape && <div className="mt-auto flex flex-col gap-3 pt-8 sm:mt-6 sm:pt-6">{rodape}</div>}
      </div>
    </div>
  )
}

/** Mensagem de erro de login/cadastro em português que ajuda. */
export function traduzirErroAuth(e: unknown): string {
  const msg = String((e as { message?: string })?.message ?? e ?? '').toLowerCase()
  if (msg.includes('invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (msg.includes('email not confirmed')) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.'
  if (msg.includes('already registered') || msg.includes('already been registered')) return 'Este e-mail já tem conta. Entre com ele ou recupere a senha.'
  if (msg.includes('password should be at least') || msg.includes('weak')) return 'A senha precisa ter pelo menos 8 caracteres.'
  if (msg.includes('rate limit') || msg.includes('too many')) return 'Muitas tentativas. Aguarde um minuto e tente de novo.'
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'Sem conexão. Verifique a internet.'
  if (msg.includes('signups not allowed') || msg.includes('signup is disabled')) return 'O cadastro pelo app está desativado no momento. Fale com a Tecnoar.'
  return (e as { message?: string })?.message ?? 'Não foi possível concluir. Tente de novo.'
}
