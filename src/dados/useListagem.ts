import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { PostgrestFilterBuilder } from '@supabase/postgrest-js'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/tipos/db'
import type { EstadoLista } from '@/componentes/ui/Tabela'

export type Consulta = PostgrestFilterBuilder<
  { PostgrestVersion: '14.15' },
  Database['public'],
  Record<string, unknown>,
  unknown,
  string,
  unknown[]
>

export interface Ordenacao {
  coluna: string
  ascendente: boolean
}

export interface OpcoesListagem<T> {
  /** Chave de cache — inclua tudo que muda o resultado. */
  chave: unknown[]
  tabela: keyof Database['public']['Tables'] | keyof Database['public']['Views']
  select: string
  /** Aplica busca e filtros. Recebe e devolve o construtor de consulta. */
  filtrar?: (q: Consulta) => Consulta
  ordenacao?: Ordenacao
  pagina: number
  porPagina: number
  habilitado?: boolean
  /** Transformação opcional das linhas cruas. */
  mapear?: (linhas: unknown[]) => T[]
}

export interface ResultadoListagem<T> {
  linhas: T[]
  total: number | null
  estado: EstadoLista
  carregando: boolean
  buscando: boolean
  erro: unknown
  recarregar: () => void
}

/**
 * Listagem paginada no servidor.
 *
 * Nunca carrega a tabela inteira: a contagem vem do Postgres e as linhas vêm
 * por faixa. É o que sustenta listas com milhares de registros.
 */
export function useListagem<T>({
  chave,
  tabela,
  select,
  filtrar,
  ordenacao,
  pagina,
  porPagina,
  habilitado = true,
  mapear,
}: OpcoesListagem<T>): ResultadoListagem<T> {
  const consulta = useQuery({
    queryKey: chave,
    enabled: habilitado,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const de = (pagina - 1) * porPagina
      const ate = de + porPagina - 1

      let q = supabase.from(tabela as never).select(select, { count: 'exact' }) as unknown as Consulta
      if (filtrar) q = filtrar(q)
      if (ordenacao) q = q.order(ordenacao.coluna, { ascending: ordenacao.ascendente, nullsFirst: false })

      const { data, error, count } = (await q.range(de, ate)) as {
        data: unknown[] | null
        error: { message: string } | null
        count: number | null
      }
      if (error) throw error
      return { linhas: (data ?? []) as unknown[], total: count ?? 0 }
    },
  })

  const linhas = useMemo<T[]>(() => {
    const brutas = consulta.data?.linhas ?? []
    return mapear ? mapear(brutas) : (brutas as T[])
  }, [consulta.data, mapear])

  const semPermissao =
    consulta.isError && String((consulta.error as Error)?.message ?? '').toLowerCase().includes('permission')

  const estado: EstadoLista = !habilitado
    ? 'sem-permissao'
    : consulta.isLoading
      ? 'carregando'
      : semPermissao
        ? 'sem-permissao'
        : consulta.isError
          ? 'erro'
          : linhas.length === 0
            ? 'vazio'
            : 'ok'

  return {
    linhas,
    total: consulta.data?.total ?? null,
    estado,
    carregando: consulta.isLoading,
    buscando: consulta.isFetching,
    erro: consulta.error,
    recarregar: () => void consulta.refetch(),
  }
}

/** Estado de paginação + busca com reinício automático de página. */
export function useControleListagem(porPaginaInicial = 25) {
  const [pagina, setPaginaBruta] = useState(1)
  const [porPagina, setPorPaginaBruto] = useState(porPaginaInicial)
  const [busca, setBuscaBruta] = useState('')

  return {
    pagina,
    porPagina,
    busca,
    setPagina: setPaginaBruta,
    setPorPagina: (n: number) => {
      setPorPaginaBruto(n)
      setPaginaBruta(1)
    },
    setBusca: (v: string) => {
      setBuscaBruta(v)
      setPaginaBruta(1)
    },
    /** Use ao trocar qualquer filtro. */
    reiniciar: () => setPaginaBruta(1),
  }
}

/** Escapa o termo para uso seguro em `or(...ilike...)` do PostgREST. */
export function termoBusca(v: string): string {
  return v.trim().replace(/[%,()]/g, ' ').replace(/\s+/g, ' ')
}
