import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, Eye, EyeOff, Lock, Mail, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErroAuth } from '@/lib/utils'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Entrada } from '@/componentes/ui/Campo'
import { Aviso } from '@/componentes/ui/Aviso'
import { MolduraAuth } from './MolduraAuth'

const esquema = z.object({
  email: z.string().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
  senha: z.string().min(1, 'Informe a senha.'),
})

type Dados = z.infer<typeof esquema>

export function Login() {
  const navegar = useNavigate()
  const local = useLocation() as { state?: { de?: string } }
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Dados>({ resolver: zodResolver(esquema), defaultValues: { email: '', senha: '' } })

  async function entrar(dados: Dados) {
    setErro(null)
    const { error } = await supabase.auth.signInWithPassword({
      email: dados.email.trim(),
      password: dados.senha,
    })
    if (error) {
      setErro(mensagemErroAuth(error))
      return
    }
    // Após login válido a Visão Geral é sempre o destino inicial.
    navegar(local.state?.de ?? '/visao-geral', { replace: true })
  }

  return (
    <MolduraAuth
      sobretitulo="Acesso"
      titulo="Entrar"
      descricao="Use as credenciais fornecidas pela Tecnoar."
      rodape={
        <div className="flex items-center justify-between border-t border-line pt-5">
          <Link to="/politica-de-privacidade" className="text-xs text-ink-3 hover:text-ink-2 hover:underline">
            Política de Privacidade
          </Link>
          <span className="num text-[11px] text-ink-3">v3.0</span>
        </div>
      }
    >
      <form noValidate onSubmit={handleSubmit(entrar)} className="flex flex-col gap-5">
        {erro && <Aviso tom="critico">{erro}</Aviso>}

        <Campo rotulo="E-mail" obrigatorio erro={errors.email?.message}>
          {(p) => (
            <Entrada
              {...p}
              {...register('email')}
              type="email"
              autoComplete="email"
              autoFocus
              inputMode="email"
              placeholder="nome@tecnoar.com.br"
              iconeInicio={<Mail />}
            />
          )}
        </Campo>

        <Campo rotulo="Senha" obrigatorio erro={errors.senha?.message}>
          {(p) => (
            <Entrada
              {...p}
              {...register('senha')}
              type={mostrarSenha ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              iconeInicio={<Lock />}
              acaoFim={
                <button
                  type="button"
                  onClick={() => setMostrarSenha((v) => !v)}
                  aria-pressed={mostrarSenha}
                  className="flex items-center gap-1.5 rounded px-2 py-1.5 font-display text-[10px] font-semibold tracking-[0.14em] text-ink-2 uppercase transition-colors hover:text-ink"
                >
                  {mostrarSenha ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  {mostrarSenha ? 'Ocultar' : 'Mostrar'}
                </button>
              }
            />
          )}
        </Campo>

        <div className="-mt-1 flex justify-end">
          <Link to="/esqueci-a-senha" className="text-[13px] font-medium text-cyan-ink hover:underline">
            Esqueci minha senha
          </Link>
        </div>

        <Botao
          type="submit"
          variante="primario"
          tamanho="lg"
          larguraTotal
          carregando={isSubmitting}
          iconeFim={<ArrowRight />}
        >
          Entrar
        </Botao>
      </form>

      <div className="flex items-center gap-3.5">
        <span className="h-px flex-1 bg-line" />
        <span className="lbl">ou</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <Botao
        variante="neutro"
        tamanho="lg"
        larguraTotal
        iconeInicio={<UserPlus />}
        onClick={() => navegar('/solicitar-acesso')}
      >
        Solicitar acesso
      </Botao>
    </MolduraAuth>
  )
}
