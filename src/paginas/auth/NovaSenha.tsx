import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErroAuth } from '@/lib/utils'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Entrada } from '@/componentes/ui/Campo'
import { Aviso } from '@/componentes/ui/Aviso'
import { EstadoCarregando } from '@/componentes/ui/Estados'
import { MolduraAuth } from './MolduraAuth'

const esquema = z
  .object({
    senha: z.string().min(8, 'A senha precisa de ao menos 8 caracteres.'),
    confirmacao: z.string().min(1, 'Confirme a nova senha.'),
  })
  .refine((d) => d.senha === d.confirmacao, {
    path: ['confirmacao'],
    message: 'As senhas não conferem.',
  })

type Dados = z.infer<typeof esquema>
type Estado = 'verificando' | 'pronto' | 'link-invalido' | 'concluido'

export function NovaSenha() {
  const navegar = useNavigate()
  const [estado, setEstado] = useState<Estado>('verificando')
  const [erro, setErro] = useState<string | null>(null)
  const [mostrar, setMostrar] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Dados>({ resolver: zodResolver(esquema), defaultValues: { senha: '', confirmacao: '' } })

  // O link de recuperação estabelece uma sessão temporária. Sem ela, não há o que redefinir.
  useEffect(() => {
    let vivo = true
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.auth.getSession()
      if (!vivo) return
      setEstado(data.session ? 'pronto' : 'link-invalido')
    }, 400)
    return () => {
      vivo = false
      window.clearTimeout(timer)
    }
  }, [])

  async function redefinir(dados: Dados) {
    setErro(null)
    const { error } = await supabase.auth.updateUser({ password: dados.senha })
    if (error) {
      setErro(mensagemErroAuth(error))
      return
    }
    await supabase.auth.signOut()
    setEstado('concluido')
  }

  if (estado === 'verificando') {
    return (
      <MolduraAuth sobretitulo="Acesso" titulo="Nova senha">
        <EstadoCarregando rotulo="Validando o link…" className="min-h-40" />
      </MolduraAuth>
    )
  }

  if (estado === 'link-invalido') {
    return (
      <MolduraAuth sobretitulo="Acesso" titulo="Link inválido ou expirado">
        <div className="flex flex-col gap-5">
          <Aviso tom="atencao">
            Este link de recuperação não é mais válido. Links expiram e só podem ser usados uma vez.
          </Aviso>
          <Botao variante="primario" tamanho="lg" larguraTotal onClick={() => navegar('/esqueci-a-senha')}>
            Solicitar novo link
          </Botao>
          <Link to="/entrar" className="flex items-center gap-2 text-[13px] font-medium text-ink-2 hover:text-ink">
            <ArrowLeft aria-hidden className="size-4" />
            Voltar ao login
          </Link>
        </div>
      </MolduraAuth>
    )
  }

  if (estado === 'concluido') {
    return (
      <MolduraAuth sobretitulo="Acesso" titulo="Senha alterada">
        <div className="flex flex-col gap-5">
          <Aviso tom="ok">Sua senha foi redefinida. Entre novamente com a nova senha.</Aviso>
          <Botao variante="primario" tamanho="lg" larguraTotal onClick={() => navegar('/entrar', { replace: true })}>
            Ir para o login
          </Botao>
        </div>
      </MolduraAuth>
    )
  }

  return (
    <MolduraAuth sobretitulo="Acesso" titulo="Definir nova senha" descricao="Escolha uma senha que você não usa em outro lugar.">
      <form noValidate onSubmit={handleSubmit(redefinir)} className="flex flex-col gap-5">
        {erro && <Aviso tom="critico">{erro}</Aviso>}

        <Campo rotulo="Nova senha" obrigatorio erro={errors.senha?.message} dica="Mínimo de 8 caracteres.">
          {(p) => (
            <Entrada
              {...p}
              {...register('senha')}
              type={mostrar ? 'text' : 'password'}
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              iconeInicio={<Lock />}
              acaoFim={
                <button
                  type="button"
                  onClick={() => setMostrar((v) => !v)}
                  aria-pressed={mostrar}
                  className="flex items-center gap-1.5 rounded px-2 py-1.5 font-display text-[10px] font-semibold tracking-[0.14em] text-ink-2 uppercase transition-colors hover:text-ink"
                >
                  {mostrar ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  {mostrar ? 'Ocultar' : 'Mostrar'}
                </button>
              }
            />
          )}
        </Campo>

        <Campo rotulo="Confirmar nova senha" obrigatorio erro={errors.confirmacao?.message}>
          {(p) => (
            <Entrada
              {...p}
              {...register('confirmacao')}
              type={mostrar ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              iconeInicio={<Lock />}
            />
          )}
        </Campo>

        <Botao type="submit" variante="primario" tamanho="lg" larguraTotal carregando={isSubmitting}>
          Salvar nova senha
        </Botao>
      </form>
    </MolduraAuth>
  )
}
