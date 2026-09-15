import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useSessao } from '../sessao'
import { BotaoApp, CampoApp, Faixa } from '../comum/ui'
import { MolduraAcesso, traduzirErroAuth } from './Moldura'

/**
 * Chegada pelo link de recuperação: o Supabase troca o código da URL por uma
 * sessão (PKCE, `detectSessionInUrl`) e aqui a pessoa define a senha nova.
 */
export function NovaSenha() {
  const { sessao, carregando } = useSessao()
  const navegar = useNavigate()
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.')
    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)
    if (error) return setErro(traduzirErroAuth(error))
    navegar('/', { replace: true })
  }

  return (
    <MolduraAcesso titulo="Nova senha" subtitulo="Escolha uma senha que você vá lembrar.">
      {!carregando && !sessao ? (
        <Faixa tom="atencao">Este link expirou ou já foi usado. Peça um novo em “Esqueci a senha”.</Faixa>
      ) : (
        <form onSubmit={(e) => void salvar(e)} className="flex flex-col gap-4">
          <CampoApp rotulo="Nova senha" type="password" autoComplete="new-password" icone={Lock} value={senha} onChange={(e) => setSenha(e.target.value)} dica="Pelo menos 8 caracteres." required />
          {erro && <Faixa tom="critico">{erro}</Faixa>}
          <BotaoApp type="submit" tamanho="lg" largo carregando={salvando}>
            Salvar e entrar
          </BotaoApp>
        </form>
      )}
    </MolduraAcesso>
  )
}
