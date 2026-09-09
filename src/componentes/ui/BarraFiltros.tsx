import { useState, type ReactNode } from 'react'
import { Filter, RotateCw, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Botao, BotaoIcone } from './Botao'
import { Entrada } from './Campo'

export interface ChipFiltro {
  id: string
  rotulo: string
  aoRemover: () => void
}

/**
 * Barra padrão de busca e filtros das listagens.
 * Os filtros avançados ficam num painel que abre no lugar, sem tirar a lista da tela.
 */
export function BarraFiltros({
  busca,
  aoBuscar,
  placeholder = 'Buscar…',
  chips = [],
  aoLimpar,
  filtros,
  acoes,
  aoAtualizar,
  atualizando,
}: {
  busca: string
  aoBuscar: (v: string) => void
  placeholder?: string
  chips?: ChipFiltro[]
  aoLimpar?: () => void
  filtros?: ReactNode
  acoes?: ReactNode
  aoAtualizar?: () => void
  atualizando?: boolean
}) {
  const [aberto, setAberto] = useState(false)

  return (
    <div className="flex flex-col rounded-t-lg border border-b-0 border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <div className="min-w-52 flex-1 sm:max-w-md">
          <Entrada
            value={busca}
            onChange={(e) => aoBuscar(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            iconeInicio={<Search />}
            className="h-[34px]"
            acaoFim={
              busca ? (
                <BotaoIcone rotulo="Limpar busca" tamanho="sm" onClick={() => aoBuscar('')}>
                  <X />
                </BotaoIcone>
              ) : undefined
            }
          />
        </div>

        {filtros && (
          <Botao
            tamanho="sm"
            variante={aberto ? 'secundario' : 'neutro'}
            iconeInicio={<Filter />}
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
          >
            Filtros
          </Botao>
        )}

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <span
                key={c.id}
                className="flex h-7 items-center gap-1.5 rounded-full border border-cyan/40 bg-cyan-soft pr-1 pl-2.5 text-[12px] text-ink"
              >
                {c.rotulo}
                <button
                  type="button"
                  aria-label={`Remover filtro ${c.rotulo}`}
                  onClick={c.aoRemover}
                  className="rounded-full p-0.5 text-ink-3 transition-colors hover:text-ink"
                >
                  <X aria-hidden className="size-3" />
                </button>
              </span>
            ))}
            {aoLimpar && (
              <button type="button" onClick={aoLimpar} className="px-1 text-[12px] text-ink-3 hover:text-ink">
                Limpar
              </button>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {aoAtualizar && (
            <Botao tamanho="sm" variante="neutro" iconeInicio={<RotateCw />} onClick={aoAtualizar} carregando={atualizando}>
              Atualizar
            </Botao>
          )}
          {acoes}
        </div>
      </div>

      {filtros && aberto && (
        <div className={cn('border-t border-line bg-surface-2/45 p-3.5')}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{filtros}</div>
        </div>
      )}
    </div>
  )
}
