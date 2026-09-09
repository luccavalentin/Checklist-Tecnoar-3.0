import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Mail, Send } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { mensagemErroAuth } from '@/lib/utils'
import { Botao } from '@/componentes/ui/Botao'
import { Campo, Entrada } from '@/componentes/ui/Campo'
import { Aviso } from '@/componentes/ui/Aviso'
import { MolduraAuth } from './MolduraAuth'

const esquema = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
})

type Dados = z.infer<typeof esquema>

export function EsqueciSenha() {
  const [erro, setErro] = useState<string | null>(null)
  const [enviadoPara, setEnviadoPara] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Dados>({ resolver: zodResolver(esquema), defaultValues: { email: '' } })

  async function solicitar(dados: Dados) {
    setErro(null)
    const email = dados.email.trim()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nova-senha`,
    })
    if (error) {
      setErro(mensagemErroAuth(error))
      return
    }
    setEnviadoPara(email)
  }

  return (
    <MolduraAuth
      sobretitulo="Acesso"
      titulo="Recuperar senha"
      descricao="Enviamos um link para você definir uma nova senha."
      rodape={
        <div className="border-t border-line pt-5">
          <Link to="/entrar" className="flex items-center gap-2 text-[13px] font-medium text-ink-2 hover:text-ink">
            <ArrowLeft aria-hidden className="size-4" />
            Voltar ao login
          </Link>
        </div>
      }
    >
      {enviadoPara ? (
        <div className="flex flex-col gap-5">
          <Aviso tom="ok" titulo="Solicitação enviada">
            Se existir uma conta para <strong className="font-semibold text-ink">{enviadoPara}</strong>, o link de
            recuperação chegará em instantes. O link vale por tempo limitado e só pode ser usado uma vez.
          </Aviso>
          <p className="text-[13px] leading-relaxed text-ink-3">
            Não chegou? Verifique a caixa de spam ou tente novamente em alguns minutos.
          </p>
          <Botao variante="neutro" larguraTotal onClick={() => setEnviadoPara(null)}>
            Enviar para outro e-mail
          </Botao>
        </div>
      ) : (
        <form noValidate onSubmit={handleSubmit(solicitar)} className="flex flex-col gap-5">
          {erro && <Aviso tom="critico">{erro}</Aviso>}

          <Campo rotulo="E-mail da conta" obrigatorio erro={errors.email?.message}>
            {(p) => (
              <Entrada
                {...p}
                {...register('email')}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                placeholder="nome@tecnoar.com.br"
                iconeInicio={<Mail />}
              />
            )}
          </Campo>

          <Botao
            type="submit"
            variante="primario"
            tamanho="lg"
            larguraTotal
            carregando={isSubmitting}
            iconeInicio={<Send />}
          >
            Solicitar recuperação
          </Botao>
        </form>
      )}
    </MolduraAuth>
  )
}
