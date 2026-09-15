import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Eye, EyeOff, Lock, Mail, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { BotaoApp, CampoApp, Faixa } from '../comum/ui'
import { FolhaLegal } from '../cliente/legal/DocumentoLegal'
import type { TipoDocumentoLegal } from '../cliente/legal/textos'
import { MolduraAcesso, traduzirErroAuth } from './Moldura'

/**
 * Criar conta de cliente. Só o essencial para entrar — nome, e-mail e senha.
 * Celular, CPF e veículo vêm no passo seguinte, já com a conta aberta.
 *
 * `tipo_conta: 'sos_cliente'` nos metadados é o que impede o banco de tratar
 * este cadastro como pedido de acesso da equipe.
 */
export function Cadastro() {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [legal, setLegal] = useState<TipoDocumentoLegal | null>(null)

  async function criar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (nome.trim().split(/\s+/).length < 2) return setErro('Informe nome e sobrenome.')
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.')
    setEnviando(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: senha,
      options: {
        data: { nome_completo: nome.trim(), tipo_conta: 'sos_cliente' },
        emailRedirectTo: `${window.location.origin}/`,
      },
    })
    setEnviando(false)
    if (error) return setErro(traduzirErroAuth(error))
    // Sem sessão = o projeto exige confirmação por e-mail.
    if (!data.session) setConfirmar(email.trim())
  }

  if (confirmar) {
    return (
      <MolduraAcesso titulo="Confirme seu e-mail" subtitulo="Falta só um passo para usar o SOS Tecnoar.">
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <CheckCircle2 className="size-14 text-ok" />
          <p className="text-[15px] leading-relaxed text-ink-2">
            Enviamos um link para <strong className="text-ink">{confirmar}</strong>. Abra o e-mail neste celular e toque no link — o app abre
            já conectado.
          </p>
          <p className="text-[13px] text-ink-3">Não chegou? Veja a caixa de spam ou promoções.</p>
        </div>
        <Link to="/entrar" className="text-center text-[14px] font-bold text-accent-ink">
          Voltar para entrar
        </Link>
      </MolduraAcesso>
    )
  }

  return (
    <MolduraAcesso titulo="Crie sua conta" subtitulo="Grátis e leva um minuto. Se você já é cliente Tecnoar, seus veículos e o histórico aparecem sozinhos.">
      <form onSubmit={(e) => void criar(e)} className="flex flex-col gap-4">
        <CampoApp rotulo="Nome completo" autoComplete="name" icone={User} value={nome} onChange={(e) => setNome(e.target.value)} required />
        <CampoApp rotulo="E-mail" type="email" inputMode="email" autoComplete="email" icone={Mail} value={email} onChange={(e) => setEmail(e.target.value)} required />
        <CampoApp
          rotulo="Senha"
          type={ver ? 'text' : 'password'}
          autoComplete="new-password"
          icone={Lock}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          dica="Pelo menos 8 caracteres."
          required
          direita={
            <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Esconder senha' : 'Mostrar senha'} className="flex size-10 items-center justify-center text-ink-3">
              {ver ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          }
        />
        {erro && <Faixa tom="critico">{erro}</Faixa>}
        <BotaoApp type="submit" tamanho="lg" largo carregando={enviando}>
          Criar conta
        </BotaoApp>
        <p className="text-center text-[12.5px] leading-relaxed text-ink-3">
          Ao criar a conta, você concorda com os{' '}
          <button type="button" onClick={() => setLegal('termos')} className="font-semibold text-accent-ink underline underline-offset-2">
            termos de uso
          </button>{' '}
          e com a{' '}
          <button type="button" onClick={() => setLegal('privacidade')} className="font-semibold text-accent-ink underline underline-offset-2">
            política de privacidade
          </button>
          .
        </p>
      </form>
      <FolhaLegal tipo={legal} aoFechar={() => setLegal(null)} />
      <p className="text-center text-[14px] text-ink-2">
        Já tem conta?{' '}
        <Link to="/entrar" className="font-bold text-accent-ink">
          Entrar
        </Link>
      </p>
    </MolduraAcesso>
  )
}
