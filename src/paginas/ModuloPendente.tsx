import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, Construction } from 'lucide-react'
import { CabecalhoPagina } from '@/componentes/ui/Painel'
import { Botao } from '@/componentes/ui/Botao'
import { grupoDaRota, itemPorRota } from '@/layout/navegacao'

/**
 * Módulo previsto, ainda não implantado.
 *
 * A rota existe porque o menu completo faz parte da fundação, mas a tela não
 * simula funcionalidade: declara o que ainda não está no ar em vez de exibir
 * indicadores, listas ou botões que não fazem nada.
 */
export function ModuloPendente() {
  const { pathname } = useLocation()
  const navegar = useNavigate()

  const item = itemPorRota(pathname)
  const grupo = grupoDaRota(pathname)
  const Icone = item?.icone ?? Construction

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoPagina sobretitulo={grupo?.rotulo ?? 'Sistema'} titulo={item?.rotulo ?? 'Módulo'} />

      <div className="flex min-h-[26rem] flex-col items-center justify-center gap-5 rounded-lg border border-dashed border-line-strong bg-surface p-10 text-center">
        <span
          aria-hidden
          className="flex size-14 items-center justify-center rounded-xl border border-dashed border-line-strong text-ink-3 [&_svg]:size-6"
        >
          <Icone />
        </span>

        <div className="flex max-w-md flex-col gap-2">
          <p className="font-display text-lg font-semibold text-ink">Módulo ainda não implantado</p>
          <p className="text-[13.5px] leading-relaxed text-ink-3">
            {item?.rotulo ? <strong className="font-semibold text-ink-2">{item.rotulo}</strong> : 'Este módulo'} faz
            parte do escopo do sistema e será entregue na{' '}
            <strong className="font-semibold text-ink-2">Etapa {item?.etapa ?? '—'}</strong>. Até lá esta tela não
            exibe dados, porque não há dado real a exibir.
          </p>
        </div>

        <Botao variante="neutro" iconeInicio={<ArrowLeft />} onClick={() => navegar('/visao-geral')}>
          Voltar à Visão Geral
        </Botao>
      </div>
    </div>
  )
}
