import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { cn, mensagemErro } from '@/lib/utils'
import { EstadoCarregando, EstadoErro } from '@/componentes/ui/Estados'
import type { AcaoPermissao, Recurso } from '@/tipos/db'

export const ACOES: AcaoPermissao[] = [
  'visualizar',
  'criar',
  'editar',
  'aprovar',
  'cancelar',
  'inativar',
  'configurar',
  'exportar',
  'sincronizar',
]

export const ROTULO_ACAO: Record<AcaoPermissao, string> = {
  visualizar: 'Visualizar',
  criar: 'Criar',
  editar: 'Editar',
  aprovar: 'Aprovar',
  cancelar: 'Cancelar',
  inativar: 'Inativar',
  configurar: 'Configurar',
  exportar: 'Exportar',
  sincronizar: 'Sincronizar',
}

export function useRecursos() {
  return useQuery({
    queryKey: ['recursos'],
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Recurso[]> => {
      const { data, error } = await supabase.from('recursos').select('*').order('ordem')
      if (error) throw error
      return data ?? []
    },
  })
}

export interface CelulaMatriz {
  /** Estado visual da célula. */
  estado: 'concedido' | 'negado' | 'herdado-sim' | 'herdado-nao'
  titulo: string
}

/**
 * Grade recurso × ação.
 *
 * Renderiza apenas as ações que fazem sentido para cada recurso — a matriz
 * densa fica legível e o gestor não marca combinação que não existe.
 */
export function MatrizPermissoes({
  aoRenderizarCelula,
  somenteLeitura,
  legenda,
}: {
  aoRenderizarCelula: (recurso: Recurso, acao: AcaoPermissao) => React.ReactNode
  somenteLeitura?: boolean
  legenda?: React.ReactNode
}) {
  const recursos = useRecursos()

  const porGrupo = useMemo(() => {
    const mapa = new Map<string, Recurso[]>()
    for (const r of recursos.data ?? []) {
      const lista = mapa.get(r.grupo) ?? []
      lista.push(r)
      mapa.set(r.grupo, lista)
    }
    return [...mapa.entries()]
  }, [recursos.data])

  if (recursos.isLoading) return <EstadoCarregando rotulo="Carregando recursos…" />
  if (recursos.isError)
    return <EstadoErro descricao={mensagemErro(recursos.error)} aoTentarNovamente={() => void recursos.refetch()} />

  return (
    <div className="flex flex-col gap-3">
      {legenda}

      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="lbl sticky top-0 left-0 z-20 h-10 min-w-56 border-b border-line-strong bg-surface-2 px-3.5 text-left">
                Recurso
              </th>
              {ACOES.map((a) => (
                <th
                  key={a}
                  className="lbl sticky top-0 z-10 h-10 w-24 border-b border-line-strong bg-surface-2 px-2 text-center whitespace-nowrap"
                >
                  {ROTULO_ACAO[a]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {porGrupo.map(([grupo, itens]) => (
              <>
                <tr key={`g-${grupo}`}>
                  <td
                    colSpan={ACOES.length + 1}
                    className="lbl border-b border-line bg-surface-2/60 px-3.5 py-1.5 text-ink-2"
                  >
                    {grupo}
                  </td>
                </tr>
                {itens.map((r) => (
                  <tr key={r.chave} className="border-b border-line last:border-b-0">
                    <td className="sticky left-0 z-10 bg-surface px-3.5 py-2 text-[13px] text-ink">{r.nome}</td>
                    {ACOES.map((a) => (
                      <td key={a} className="px-2 py-2 text-center">
                        {r.acoes.includes(a) ? (
                          aoRenderizarCelula(r, a)
                        ) : (
                          <span aria-hidden className="text-ink-3/40">
                            ·
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {somenteLeitura && (
        <p className="text-[12px] text-ink-3">
          Somente leitura: seu perfil não permite configurar permissões.
        </p>
      )}
    </div>
  )
}

export function CaixaPermissao({
  marcada,
  aoAlternar,
  desabilitada,
  rotulo,
}: {
  marcada: boolean
  aoAlternar: () => void
  desabilitada?: boolean
  rotulo: string
}) {
  return (
    <input
      type="checkbox"
      aria-label={rotulo}
      checked={marcada}
      disabled={desabilitada}
      onChange={aoAlternar}
      className={cn('size-[15px] accent-[var(--c-accent)]', desabilitada ? 'cursor-not-allowed opacity-40' : 'cursor-pointer')}
    />
  )
}
