import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail, MessageCircle, Siren, UserRound, Wrench } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { sosInfoPublica } from '@/sos/api'
import { linkTelefone, linkWhatsApp } from '@/sos/rotulos'
import { consumirAvisoContaNaoEquipe, useSessao } from '../sessao'
import { BotaoApp, CampoApp, Faixa } from '../comum/ui'
import { MolduraAcesso, traduzirErroAuth } from './Moldura'

/**
 * Duas portas, duas experiências:
 * - `/entrar` — cliente: pede socorro, acompanha, cria conta.
 * - `/mecanico/entrar` — equipe Tecnoar: o mesmo usuário e senha do sistema
 *   (Checklist), sem "criar conta" (quem cria é o administrador).
 * Quem é da equipe e entra pela porta do cliente usa o app como cliente.
 */
export function Entrar({ perfil = 'cliente' }: { perfil?: 'cliente' | 'mecanico' }) {
  const mecanico = perfil === 'mecanico'
  const { trocarModo } = useSessao()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [ver, setVer] = useState(false)
  const [erro, setErro] = useState<string | null>(() =>
    mecanico && consumirAvisoContaNaoEquipe() ? 'Esta conta é de cliente. Para pedir socorro, use a entrada do cliente.' : null,
  )
  const [entrando, setEntrando] = useState(false)
  const info = useQuery({ queryKey: ['sos', 'info-publica'], queryFn: sosInfoPublica, staleTime: 60 * 60_000, retry: false, enabled: !mecanico })
  const telefone = linkTelefone(info.data?.telefone)
  const whatsapp = linkWhatsApp(info.data?.whatsapp ?? info.data?.telefone, 'Olá, Tecnoar! Preciso de ajuda.')

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setEntrando(true)
    // O modo vale antes da sessão chegar: a primeira tela já é a certa.
    trocarModo(perfil)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
    setEntrando(false)
    if (error) setErro(traduzirErroAuth(error))
    // Sucesso: o ProvedorSessao percebe a sessão e o roteador leva para a tela certa.
  }

  return (
    <MolduraAcesso
      mecanico={mecanico}
      selo={mecanico ? 'Equipe Tecnoar' : 'SOS Tecnoar'}
      titulo={mecanico ? 'Entrar como mecânico' : 'Acesse sua conta'}
      subtitulo={
        mecanico
          ? 'Use o mesmo e-mail e senha do sistema Tecnoar. Chamados, OS e peças no seu bolso.'
          : 'Assistência automotiva com resposta rápida e acompanhamento em tempo real.'
      }
      rodape={
        <>
          {!mecanico && (telefone || whatsapp) && (
            <div className="flex items-center justify-center gap-4">
              {telefone && (
                <a
                  href={telefone}
                  aria-label="Ligar para emergência sem cadastro"
                  title="Emergência sem cadastro"
                  className="flex size-16 items-center justify-center rounded-full border border-[#00afef]/28 bg-[#ff6600] text-white shadow-[0_14px_32px_-18px_rgb(255_102_0/0.95)] transition-transform active:scale-95"
                >
                  <Siren className="size-8" strokeWidth={2.35} />
                </a>
              )}
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Falar no WhatsApp"
                  title="WhatsApp"
                  className="flex size-14 items-center justify-center rounded-full border border-[#00afef]/38 bg-[#0D1C33] text-[#00afef] shadow-[0_12px_26px_-18px_rgb(0_32_97/0.9)] transition-transform active:scale-95"
                >
                  <MessageCircle className="size-7" />
                </a>
              )}
            </div>
          )}
          <Link
            to={mecanico ? '/entrar' : '/mecanico/entrar'}
            replace
            className="mx-auto flex min-h-10 w-fit items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 text-[13px] font-bold text-white backdrop-blur-md"
          >
            {mecanico ? <UserRound className="size-5" /> : <Wrench className="size-5" />}
            {mecanico ? 'Sou cliente — pedir socorro' : 'Sou mecânico da Tecnoar'}
          </Link>
        </>
      }
    >
      <form onSubmit={(e) => void entrar(e)} className="flex flex-col gap-4">
        <CampoApp
          rotulo="E-mail"
          type="email"
          inputMode="email"
          autoComplete={mecanico ? 'username' : 'email'}
          icone={Mail}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <CampoApp
          rotulo="Senha"
          type={ver ? 'text' : 'password'}
          autoComplete="current-password"
          icone={Lock}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
          direita={
            <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Esconder senha' : 'Mostrar senha'} className="flex size-10 items-center justify-center text-ink-3">
              {ver ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </button>
          }
        />
        {erro && <Faixa tom="critico">{erro}</Faixa>}
        <BotaoApp
          type="submit"
          tamanho="lg"
          largo
          carregando={entrando}
          className={mecanico ? 'bg-[#ff6600] shadow-[0_10px_22px_-12px_rgb(255_102_0/0.7)] hover:bg-[#cc5200]' : undefined}
        >
          {mecanico ? 'Entrar no app do mecânico' : 'Entrar'}
        </BotaoApp>
        <div className="flex items-center justify-between text-[14.5px]">
          <Link to="/esqueci-senha" className="inline-flex min-h-11 items-center font-semibold text-ink-2">
            Esqueci a senha
          </Link>
          {mecanico ? (
            <span className="text-[13px] text-ink-3">Sem acesso? Fale com o administrador.</span>
          ) : (
            <Link to="/cadastro" className="inline-flex min-h-11 items-center font-bold text-accent-ink">
              Criar conta
            </Link>
          )}
        </div>
      </form>
    </MolduraAcesso>
  )
}
