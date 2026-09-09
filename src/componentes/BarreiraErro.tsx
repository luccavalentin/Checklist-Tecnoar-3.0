import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'
import { Botao } from './ui/Botao'
import { Aviso } from './ui/Aviso'

interface Props {
  children: ReactNode
}
interface Estado {
  erro: Error | null
}

/**
 * Rede de segurança: uma falha de renderização vira tela de erro com ação de
 * recuperação — nunca tela branca.
 */
export class BarreiraErro extends Component<Props, Estado> {
  state: Estado = { erro: null }

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro }
  }

  componentDidCatch(erro: Error, info: ErrorInfo) {
    console.error('[Tecnoar] Falha de renderização:', erro, info.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-canvas px-5">
        <div className="flex w-full max-w-lg flex-col gap-4">
          <Aviso tom="critico" titulo="Algo quebrou nesta tela">
            <span className="block">
              O sistema interrompeu a operação em vez de continuar em estado inconsistente.
            </span>
            <code className="mt-2 block rounded border border-line bg-inset px-2.5 py-2 font-mono text-[11.5px] break-words text-ink-2">
              {this.state.erro.message}
            </code>
          </Aviso>
          <div className="flex gap-2">
            <Botao variante="primario" iconeInicio={<RefreshCw />} onClick={() => window.location.reload()}>
              Recarregar
            </Botao>
            <Botao variante="neutro" onClick={() => this.setState({ erro: null })}>
              Tentar continuar
            </Botao>
          </div>
        </div>
      </div>
    )
  }
}
