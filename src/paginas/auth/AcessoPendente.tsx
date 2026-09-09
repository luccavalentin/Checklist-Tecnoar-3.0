import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, LogOut, RefreshCw, ShieldX } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { Botao } from '@/componentes/ui/Botao'
import { Aviso } from '@/componentes/ui/Aviso'
import { MolduraAuth } from './MolduraAuth'

const TEXTOS = {
  pendente: {
    titulo: 'Acesso aguardando liberação',
    icone: Clock,
    tom: 'atencao' as const,
    mensagem:
      'Sua conta foi criada, mas ainda não foi aprovada. Um administrador precisa liberar o acesso e definir sua função, perfil e especialidades.',
  },
  inativo: {
    titulo: 'Acesso inativado',
    icone: ShieldX,
    tom: 'critico' as const,
    mensagem: 'Sua conta está inativa no sistema. Fale com o administrador para reativar o acesso.',
  },
  recusado: {
    titulo: 'Solicitação recusada',
    icone: ShieldX,
    tom: 'critico' as const,
    mensagem: 'A solicitação de acesso desta conta foi recusada. Fale com o administrador da Tecnoar.',
  },
}

export function AcessoPendente() {
  const { usuario, sair, recarregarPerfil } = useAuth()
  const navegar = useNavigate()
  const [verificando, setVerificando] = useState(false)

  const chave = (usuario?.situacao ?? 'pendente') as keyof typeof TEXTOS
  const t = TEXTOS[chave] ?? TEXTOS.pendente
  const Icone = t.icone

  async function verificar() {
    setVerificando(true)
    await recarregarPerfil()
    setVerificando(false)
  }

  async function encerrar() {
    await sair()
    navegar('/entrar', { replace: true })
  }

  return (
    <MolduraAuth sobretitulo="Acesso" titulo={t.titulo}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-line-strong text-ink-3 [&_svg]:size-5"
          >
            <Icone />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[13.5px] font-semibold text-ink">
              {usuario?.nome_completo ?? '—'}
            </span>
            <span className="truncate text-[12.5px] text-ink-3">{usuario?.email}</span>
          </div>
        </div>

        <Aviso tom={t.tom}>{t.mensagem}</Aviso>

        <div className="flex flex-col gap-2.5">
          <Botao
            variante="primario"
            tamanho="lg"
            larguraTotal
            iconeInicio={<RefreshCw />}
            carregando={verificando}
            onClick={() => void verificar()}
          >
            Verificar novamente
          </Botao>
          <Botao variante="neutro" tamanho="lg" larguraTotal iconeInicio={<LogOut />} onClick={() => void encerrar()}>
            Sair
          </Botao>
        </div>
      </div>
    </MolduraAuth>
  )
}
