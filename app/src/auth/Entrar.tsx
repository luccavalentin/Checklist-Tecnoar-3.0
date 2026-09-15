import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail, UserRound, Wrench } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { sosInfoPublica } from '@/sos/api'
import { linkTelefone, linkWhatsApp } from '@/sos/rotulos'
import { consumirAvisoContaNaoEquipe, useSessao } from '../sessao'
import { BotaoApp, CampoApp, Faixa } from '../comum/ui'
import { MolduraAcesso, traduzirErroAuth } from './Moldura'

/** Sirene desenhada para o botão de emergência: cúpula, reflexo e raios finos. */
function IconeSirene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden className={className}>
      <g className="sos-raios" stroke="#fff" strokeWidth="2" strokeLinecap="round">
        <path d="M24 4.5v5" />
        <path d="M9.2 10.7l3.4 3.4" />
        <path d="M38.8 10.7l-3.4 3.4" />
        <path d="M3.8 24.5h4.6" />
        <path d="M44.2 24.5h-4.6" />
      </g>
      <path d="M13.5 35.5v-9.2C13.5 20.3 18.2 15.5 24 15.5s10.5 4.8 10.5 10.8v9.2z" fill="#fff" />
      <path d="M19.3 27.2c0-2.9 2-5.3 4.7-5.9" stroke="#ff6600" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="9.5" y="35.5" width="29" height="5.5" rx="2.2" fill="#fff" />
    </svg>
  )
}

/** Logo oficial do WhatsApp. */
function IconeWhatsApp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  )
}

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
      topo={
        !mecanico && telefone ? (
          <a href={telefone} aria-label="Emergência 24 horas: ligar para a Tecnoar sem cadastro" className="sos-emergencia">
            <span className="sos-emergencia-orb">
              <IconeSirene className="size-9" />
            </span>
            <span className="flex flex-col text-left leading-tight">
              <span className="text-[11px] font-semibold tracking-[0.16em] text-white/75 uppercase">Emergência 24h</span>
              <span className="font-display text-[17px] font-semibold text-white">Ligar agora</span>
            </span>
          </a>
        ) : undefined
      }
      rodape={
        <>
          {!mecanico && whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Falar com a Tecnoar no WhatsApp"
              className="mx-auto flex min-h-12 w-fit items-center gap-2.5 rounded-full bg-[#25D366] py-2 pr-5 pl-2.5 text-[14.5px] font-semibold text-white shadow-[0_12px_26px_-16px_rgb(37_211_102/0.9)] transition-transform active:scale-95"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-white/20">
                <IconeWhatsApp className="size-5" />
              </span>
              Falar no WhatsApp
            </a>
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
