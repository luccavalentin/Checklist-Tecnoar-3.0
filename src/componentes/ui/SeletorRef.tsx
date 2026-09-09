import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown, Loader2, Plus, Search, X } from 'lucide-react'
import { tabelaDinamica } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { mascaraDocumento } from '@/lib/formatos'
import { termoBusca } from '@/dados/useListagem'
import type { OpcaoRef } from '@/tipos/db'

export interface ConfigSeletorRef {
  tabela: string
  /** Colunas trazidas do banco. Precisa conter id e as usadas em `mapear`. */
  select: string
  /** Colunas usadas na busca `ilike`. */
  colunasBusca: string[]
  ordenarPor: string
  mapear: (linha: Record<string, unknown>) => OpcaoRef
  /** Filtro fixo aplicado sempre (ex.: situacao ativo). */
  filtroFixo?: Record<string, string>
}

/**
 * Seleção de um registro de outra tabela, com busca no servidor.
 *
 * Nunca carrega a tabela inteira: consulta por termo e limita o resultado —
 * é o que permite escolher entre milhares de clientes ou produtos.
 */
export function SeletorRef({
  config,
  valor,
  aoSelecionar,
  placeholder = 'Buscar…',
  aoCriar,
  rotuloCriar,
  desabilitado,
  id,
  'aria-invalid': invalido,
  'aria-describedby': descrito,
}: {
  config: ConfigSeletorRef
  valor: string | null
  aoSelecionar: (opcao: OpcaoRef | null) => void
  placeholder?: string
  aoCriar?: (termo: string) => void
  rotuloCriar?: string
  desabilitado?: boolean
  id?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [selecionado, setSelecionado] = useState<OpcaoRef | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const lista_ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ topo: number; esquerda: number; largura: number; acima: boolean } | null>(null)

  // Carrega o rótulo do valor já gravado.
  const atual = useQuery({
    queryKey: [config.tabela, 'ref', valor],
    enabled: Boolean(valor),
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<OpcaoRef | null> => {
      const { data, error } = await tabelaDinamica(config.tabela)
        .select(config.select)
        .eq('id', valor!)
        .maybeSingle()
      if (error) throw error
      return data ? config.mapear(data as unknown as Record<string, unknown>) : null
    },
  })

  useEffect(() => {
    if (!valor) setSelecionado(null)
    else if (atual.data) setSelecionado(atual.data)
  }, [valor, atual.data])

  /**
   * A lista é desenhada num portal preso ao body.
   *
   * Dentro de um modal o conteúdo rola e tem `overflow` escondido: uma lista
   * posicionada de forma absoluta seria recortada pelas bordas do modal. Presa
   * ao body e posicionada pelas coordenadas do botão, ela aparece inteira por
   * cima — e ainda decide sozinha se abre para baixo ou para cima conforme o
   * espaço disponível.
   */
  const medir = useCallback(() => {
    const b = caixa.current?.getBoundingClientRect()
    if (!b) return
    const alturaLista = Math.min(360, window.innerHeight - 24)
    const abaixo = window.innerHeight - b.bottom
    const acima = abaixo < alturaLista && b.top > abaixo
    setPos({
      topo: acima ? b.top - 4 : b.bottom + 4,
      esquerda: Math.max(8, Math.min(b.left, window.innerWidth - b.width - 8)),
      largura: b.width,
      acima,
    })
  }, [])

  useLayoutEffect(() => {
    if (!aberto) {
      setPos(null)
      return
    }
    medir()
    window.addEventListener('resize', medir)
    window.addEventListener('scroll', medir, true)
    return () => {
      window.removeEventListener('resize', medir)
      window.removeEventListener('scroll', medir, true)
    }
  }, [aberto, medir])

  useEffect(() => {
    if (!aberto) return
    const onClique = (e: MouseEvent) => {
      const alvo = e.target as Node
      if (caixa.current?.contains(alvo) || lista_ref.current?.contains(alvo)) return
      setAberto(false)
    }
    const onTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', onClique)
    document.addEventListener('keydown', onTecla, true)
    return () => {
      document.removeEventListener('mousedown', onClique)
      document.removeEventListener('keydown', onTecla, true)
    }
  }, [aberto])

  const opcoes = useQuery({
    queryKey: [config.tabela, 'busca', termo, config.filtroFixo],
    enabled: aberto,
    queryFn: async (): Promise<OpcaoRef[]> => {
      let q = tabelaDinamica(config.tabela).select(config.select).order(config.ordenarPor).limit(20)
      for (const [col, v] of Object.entries(config.filtroFixo ?? {})) q = q.eq(col, v)
      const t = termoBusca(termo)
      if (t.length >= 2) q = q.or(config.colunasBusca.map((c) => `${c}.ilike.%${t}%`).join(','))
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((l) => config.mapear(l))
    },
  })

  const lista = useMemo(() => opcoes.data ?? [], [opcoes.data])

  return (
    <div ref={caixa} className="relative">
      <button
        id={id}
        type="button"
        disabled={desabilitado}
        aria-invalid={invalido}
        aria-describedby={descrito}
        aria-expanded={aberto}
        aria-haspopup="listbox"
        onClick={() => setAberto((v) => !v)}
        className={cn(
          'flex h-10 w-full items-center gap-2 rounded-md border bg-inset px-3 text-left text-[13.5px] transition-colors',
          'disabled:cursor-not-allowed disabled:opacity-50',
          invalido ? 'border-crit' : 'border-line-strong hover:border-line-strong',
        )}
      >
        {atual.isLoading && valor ? (
          <Loader2 aria-hidden className="size-4 animate-spin text-ink-3" />
        ) : selecionado ? (
          <span className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="truncate text-ink">{selecionado.rotulo}</span>
            {selecionado.detalhe && <span className="num shrink-0 text-[11.5px] text-ink-3">{selecionado.detalhe}</span>}
          </span>
        ) : (
          <span className="flex-1 truncate text-ink-3">{placeholder}</span>
        )}

        {selecionado && !desabilitado && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Limpar seleção"
            onClick={(e) => {
              e.stopPropagation()
              setSelecionado(null)
              aoSelecionar(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation()
                setSelecionado(null)
                aoSelecionar(null)
              }
            }}
            className="shrink-0 rounded p-0.5 text-ink-3 hover:text-ink"
          >
            <X aria-hidden className="size-3.5" />
          </span>
        )}
        <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-3" />
      </button>

      {aberto && pos && createPortal(
        <div
          ref={lista_ref}
          style={{
            position: 'fixed',
            top: pos.acima ? undefined : pos.topo,
            bottom: pos.acima ? window.innerHeight - pos.topo : undefined,
            left: pos.esquerda,
            width: pos.largura,
          }}
          className="entrada-suave z-[65] overflow-hidden rounded-lg border border-line-strong bg-surface shadow-e3">
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search aria-hidden className="size-4 shrink-0 text-ink-3" />
            <input
              autoFocus
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Digite para buscar…"
              className="h-10 flex-1 bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3"
            />
            {opcoes.isFetching && <Loader2 aria-hidden className="size-3.5 animate-spin text-cyan" />}
          </div>

          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {opcoes.isError && <li className="px-3 py-3 text-[12.5px] text-crit-ink">Falha ao buscar. Tente de novo.</li>}
            {!opcoes.isError && lista.length === 0 && !opcoes.isFetching && (
              <li className="px-3 py-3 text-[12.5px] text-ink-3">
                {termo.trim().length >= 2 ? 'Nenhum registro encontrado.' : 'Nenhum registro disponível.'}
              </li>
            )}
            {lista.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={o.id === valor}
                  onClick={() => {
                    setSelecionado(o)
                    aoSelecionar(o)
                    setAberto(false)
                    setTermo('')
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-2"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[13.5px] text-ink">{o.rotulo}</span>
                    {o.detalhe && <span className="num truncate text-[11.5px] text-ink-3">{o.detalhe}</span>}
                  </span>
                  {o.id === valor && <Check aria-hidden className="size-4 shrink-0 text-accent" />}
                </button>
              </li>
            ))}
          </ul>

          {aoCriar && (
            <button
              type="button"
              onClick={() => {
                aoCriar(termo.trim())
                setAberto(false)
              }}
              className="flex w-full items-center gap-2 border-t border-line px-3 py-2.5 text-left text-[13px] font-medium text-cyan-ink transition-colors hover:bg-surface-2"
            >
              <Plus aria-hidden className="size-4" />
              {rotuloCriar ?? 'Cadastrar novo'}
              {termo.trim() && <span className="truncate text-ink-3">— “{termo.trim()}”</span>}
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

/* --------------------------------- configurações prontas mais usadas ----- */

export const REF_CLIENTE: ConfigSeletorRef = {
  tabela: 'clientes',
  select: 'id, nome_razao, documento, codigo',
  colunasBusca: ['nome_razao', 'nome_fantasia', 'documento_digitos'],
  ordenarPor: 'nome_razao',
  filtroFixo: { situacao: 'ativo' },
  mapear: (l) => ({
    id: String(l.id),
    rotulo: String(l.nome_razao ?? ''),
    /* CPF/CNPJ sai pontuado: o operador confere documento pela pontuação,
       e a sequência crua de 11 ou 14 dígitos é ilegível no balcão. */
    detalhe: l.documento ? mascaraDocumento(String(l.documento)) : undefined,
  }),
}

export const REF_FORNECEDOR: ConfigSeletorRef = {
  tabela: 'fornecedores',
  select: 'id, descricao, documento',
  colunasBusca: ['descricao', 'nome_fantasia', 'documento_digitos'],
  ordenarPor: 'descricao',
  filtroFixo: { situacao: 'ativo' },
  mapear: (l) => ({
    id: String(l.id),
    rotulo: String(l.descricao ?? ''),
    detalhe: l.documento ? mascaraDocumento(String(l.documento)) : undefined,
  }),
}

export const REF_VEICULO: ConfigSeletorRef = {
  tabela: 'veiculos',
  select: 'id, placa, descricao',
  colunasBusca: ['placa_normalizada', 'descricao', 'numero_frota'],
  ordenarPor: 'placa',
  filtroFixo: { situacao: 'ativo' },
  mapear: (l) => ({ id: String(l.id), rotulo: String(l.placa ?? ''), detalhe: String(l.descricao ?? '') }),
}

export const REF_PRODUTO: ConfigSeletorRef = {
  tabela: 'produtos',
  select: 'id, codigo, descricao, unidade, preco_venda, saldo',
  colunasBusca: ['codigo', 'descricao', 'referencia'],
  ordenarPor: 'descricao',
  filtroFixo: { situacao: 'ativo' },
  mapear: (l) => ({ id: String(l.id), rotulo: String(l.descricao ?? ''), detalhe: String(l.codigo ?? '') }),
}

export const REF_SERVICO: ConfigSeletorRef = {
  tabela: 'servicos',
  select: 'id, codigo, descricao, valor_padrao',
  colunasBusca: ['codigo', 'descricao'],
  ordenarPor: 'descricao',
  filtroFixo: { situacao: 'ativo' },
  mapear: (l) => ({ id: String(l.id), rotulo: String(l.descricao ?? ''), detalhe: String(l.codigo ?? '') }),
}

export const REF_ESPECIALIDADE: ConfigSeletorRef = {
  tabela: 'especialidades',
  select: 'id, nome',
  colunasBusca: ['nome'],
  ordenarPor: 'nome',
  filtroFixo: { situacao: 'ativo' },
  mapear: (l) => ({ id: String(l.id), rotulo: String(l.nome ?? '') }),
}
