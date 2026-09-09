import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock, Mail, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErroAuth } from '@/lib/utils'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Entrada } from '@/componentes/ui/Campo'
import { Aviso } from '@/componentes/ui/Aviso'
import { MolduraAuth } from './MolduraAuth'

const esquema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(3, 'Informe seu nome completo.')
      .refine((v) => v.split(/\s+/).length >= 2, 'Informe nome e sobrenome.'),
    email: z.string().trim().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
    senha: z.string().min(8, 'A senha precisa de ao menos 8 caracteres.'),
    confirmacao: z.string().min(1, 'Confirme a senha.'),
  })
  .refine((d) => d.senha === d.confirmacao, {
    path: ['confirmacao'],
    message: 'As senhas não conferem.',
  })

type Dados = z.infer<typeof esquema>

export function SolicitarAcesso() {
  const navegar = useNavigate()
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState<{ email: string; precisaConfirmar: boolean } | null>(null)
  const [mostrarSenha, setMostrarSenha] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Dados>({
    resolver: zodResolver(esquema),
    defaultValues: { nome: '', email: '', senha: '', confirmacao: '' },
  })

  async function criar(dados: Dados) {
    setErro(null)
    const { data, error } = await supabase.auth.signUp({
      email: dados.email.trim(),
      password: dados.senha,
      options: {
        data: { nome_completo: dados.nome.trim() },
        emailRedirectTo: `${window.location.origin}/entrar`,
      },
    })

    if (error) {
      setErro(mensagemErroAuth(error))
      return
    }

    setEnviado({ email: dados.email.trim(), precisaConfirmar: !data.session })
  }

  if (enviado) {
    return (
      <MolduraAuth sobretitulo="Acesso" titulo="Solicitação registrada">
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-3.5 rounded-lg border border-ok/35 bg-ok-soft p-4">
            <CheckCircle2 aria-hidden className="mt-0.5 size-[18px] shrink-0 text-ok" />
            <div className="flex flex-col gap-1">
              <p className="font-display text-[13.5px] font-semibold text-ink">Conta criada</p>
              <p className="text-[13px] leading-relaxed text-ink-2">
                {enviado.precisaConfirmar
                  ? `Enviamos um e-mail de confirmação para ${enviado.email}. Confirme o endereço para concluir o cadastro.`
                  : `A conta de ${enviado.email} foi criada.`}
              </p>
            </div>
          </div>

          <Aviso tom="info" titulo="O acesso ainda precisa ser liberado">
            Criar conta não concede permissão automaticamente. Um administrador precisa aprovar seu cadastro e
            definir função, perfil de acesso e especialidades antes de você entrar no sistema.
          </Aviso>

          <Botao variante="primario" tamanho="lg" larguraTotal onClick={() => navegar('/entrar')}>
            Voltar ao login
          </Botao>
        </div>
      </MolduraAuth>
    )
  }

  return (
    <MolduraAuth
      sobretitulo="Acesso"
      titulo="Solicitar acesso"
      descricao="Crie sua conta. A liberação é feita por um administrador."
      rodape={
        <div className="border-t border-line pt-5">
          <Link
            to="/entrar"
            className="flex items-center gap-2 text-[13px] font-medium text-ink-2 hover:text-ink"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Voltar ao login
          </Link>
        </div>
      }
    >
      <form noValidate onSubmit={handleSubmit(criar)} className="flex flex-col gap-5">
        {erro && <Aviso tom="critico">{erro}</Aviso>}

        <Campo rotulo="Nome completo" obrigatorio erro={errors.nome?.message}>
          {(p) => (
            <Entrada
              {...p}
              {...register('nome')}
              autoComplete="name"
              autoFocus
              placeholder="Nome e sobrenome"
              iconeInicio={<User />}
            />
          )}
        </Campo>

        <Campo rotulo="E-mail" obrigatorio erro={errors.email?.message}>
          {(p) => (
            <Entrada
              {...p}
              {...register('email')}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="nome@tecnoar.com.br"
              iconeInicio={<Mail />}
            />
          )}
        </Campo>

        <Campo rotulo="Senha" obrigatorio erro={errors.senha?.message} dica="Mínimo de 8 caracteres.">
          {(p) => (
            <Entrada
              {...p}
              {...register('senha')}
              type={mostrarSenha ? 'text' : 'password'}
              autoComplete="new-password"
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

        <Campo rotulo="Confirmar senha" obrigatorio erro={errors.confirmacao?.message}>
          {(p) => (
            <Entrada
              {...p}
              {...register('confirmacao')}
              type={mostrarSenha ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="••••••••"
              iconeInicio={<Lock />}
            />
          )}
        </Campo>

        <Botao type="submit" variante="primario" tamanho="lg" larguraTotal carregando={isSubmitting}>
          Criar conta
        </Botao>

        <p className="text-center text-[12px] leading-relaxed text-ink-3">
          Ao criar a conta você concorda com a{' '}
          <Link to="/politica-de-privacidade" className="text-cyan-ink hover:underline">
            Política de Privacidade
          </Link>
          .
        </p>
      </form>
    </MolduraAuth>
  )
}
