import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'

export function NaoEncontrado() {
  const navegar = useNavigate()
  return (
    <div className="flex min-h-[28rem] flex-col items-center justify-center gap-5 text-center">
      <span
        aria-hidden
        className="flex size-14 items-center justify-center rounded-xl border border-dashed border-line-strong text-ink-3 [&_svg]:size-6"
      >
        <FileQuestion />
      </span>
      <div className="flex max-w-sm flex-col gap-2">
        <p className="font-display text-lg font-semibold text-ink">Página não encontrada</p>
        <p className="text-[13.5px] leading-relaxed text-ink-3">
          O endereço acessado não corresponde a nenhuma tela do sistema.
        </p>
      </div>
      <Botao variante="neutro" iconeInicio={<ArrowLeft />} onClick={() => navegar('/visao-geral')}>
        Voltar à Visão Geral
      </Botao>
    </div>
  )
}
