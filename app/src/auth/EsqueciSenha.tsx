import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Mail, MailCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BotaoApp, CampoApp, Faixa } from '../comum/ui'
import { MolduraAcesso, traduzirErroAuth } from './Moldura'

export function EsqueciSenha() {
  const [email, setEmail] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  async function enviar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/nova-senha`,
    })
    setEnviando(false)
    if (error) return setErro(traduzirErroAuth(error))
    setEnviado(true)
  }

  return (
    <MolduraAcesso titulo="Recuperar senha" subtitulo="Enviamos um link para você criar uma senha nova.">
      {enviado ? (
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <MailCheck className="size-14 text-ok" />
          <p className="text-[15px] leading-relaxed text-ink-2">
            Se <strong className="text-ink">{email}</strong> tiver conta, o link chega em instantes. Abra neste celular.
          </p>
        </div>
      ) : (
        <form onSubmit={(e) => void enviar(e)} className="flex flex-col gap-4">
          <CampoApp rotulo="E-mail da conta" type="email" inputMode="email" autoComplete="email" icone={Mail} value={email} onChange={(e) => setEmail(e.target.value)} required />
          {erro && <Faixa tom="critico">{erro}</Faixa>}
          <BotaoApp type="submit" tamanho="lg" largo carregando={enviando}>
            Enviar link
          </BotaoApp>
        </form>
      )}
      <Link to="/entrar" className="text-center text-[14px] font-bold text-accent-ink">
        Voltar para entrar
      </Link>
    </MolduraAcesso>
  )
}
