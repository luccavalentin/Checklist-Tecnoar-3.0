import { useEffect, useState, type ReactNode } from 'react'
import { LogoSOS } from '../comum/ui'

const dois = (n: number) => String(n).padStart(2, '0')

/**
 * Cronômetro digital: horas, minutos e segundos em dígitos de largura fixa,
 * separadores piscando no ritmo do segundo, numa cápsula de vidro.
 */
function Cronometro() {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    let t: number
    // Alinha ao segundo cheio do relógio do aparelho (não acumula atraso).
    const agendar = () => {
      t = window.setTimeout(() => {
        setAgora(new Date())
        agendar()
      }, 1000 - new Date().getMilliseconds() + 5)
    }
    agendar()
    return () => window.clearTimeout(t)
  }, [])
  return (
    <time dateTime={agora.toISOString()} className="sos-cronometro" aria-label={`Agora: ${dois(agora.getHours())}:${dois(agora.getMinutes())}`}>
      <span className="sos-cronometro-ponto" aria-hidden />
      <span aria-hidden className="sos-cronometro-digitos">
        {dois(agora.getHours())}
        <span className="sos-cronometro-sep">:</span>
        {dois(agora.getMinutes())}
        <span className="sos-cronometro-sep">:</span>
        <span className="sos-cronometro-seg">{dois(agora.getSeconds())}</span>
      </span>
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
        {/* Uma identidade só: o selo do topo ("SOS Tecnoar" / "Equipe Tecnoar"). */}
        <div className="flex items-center justify-between gap-3">
          <Cronometro />
          <span className="rounded-full border border-white/16 bg-white/10 px-3 py-1 text-[12.5px] font-semibold text-white/85 backdrop-blur-md">{selo}</span>
        </div>

        <div className="sos-login-brand">
          <LogoSOS negativo altura={132} className="sos-login-logo max-w-[17rem]" />
          <p className="sos-login-lema mt-3 max-w-[17rem] text-[12.5px] leading-relaxed font-semibold text-white/85">
            {mecanico ? 'Área do mecânico' : 'Você sempre em movimento'}
          </p>
        </div>

        {topo && <div className="sos-login-topo flex justify-center">{topo}</div>}

        <section className="sos-access-card sos-login-cartao rounded-[1.55rem]">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-[22px] leading-tight font-semibold text-ink">{titulo}</h1>
            {subtitulo && <p className="sos-login-sub text-[13.5px] leading-snug text-ink-2">{subtitulo}</p>}
          </div>

          <div className="sos-login-form mt-4 flex flex-col gap-3">{children}</div>
        </section>

        {rodape && <div className="sos-login-rodape flex flex-col gap-3">{rodape}</div>}
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
