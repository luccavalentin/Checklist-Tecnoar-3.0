import { useEffect, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Loader2, Package, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { sosProdutoAoVivo, sosProdutoDetalhe } from '@/sos/api'
import { quantidadeBR } from '@/sos/estoque'
import { classeDisponivel } from './Catalogo'
import { CHAVES_OS } from './os/dados'
import { BotaoM, EsqueletoM, FolhaM, RotuloM } from './ui'

const quando = (iso: string | null | undefined) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const hoje = d.toDateString() === new Date().toDateString()
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return hoje ? `hoje, ${hora}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })} ${hora}`
}

/**
 * Ficha do produto: abre na hora com o cadastro do sistema e, ao mesmo tempo,
 * confere o item na Omie (cadastro, estoque do dia e fotos). Quando a Omie
 * responde, os números da ficha são relidos já atualizados.
 */
export function FichaProduto({ produtoId, aoFechar, acao }: { produtoId: string | null; aoFechar: () => void; acao?: ReactNode }) {
  const qc = useQueryClient()
  const [foto, setFoto] = useState(0)
  const aberta = !!produtoId

  const ficha = useQuery({
    queryKey: ['sos', 'produto', produtoId],
    queryFn: () => sosProdutoDetalhe(produtoId!),
    enabled: aberta,
  })
  const aoVivo = useQuery({
    queryKey: ['sos', 'produto-omie', produtoId],
    queryFn: () => sosProdutoAoVivo(produtoId!),
    enabled: aberta,
    staleTime: 30_000,
    retry: false,
  })

  // Omie atualizou o cadastro: relê a ficha e a lista do catálogo.
  useEffect(() => {
    if (aoVivo.data?.atualizado) {
      void qc.invalidateQueries({ queryKey: ['sos', 'produto', produtoId] })
      void qc.invalidateQueries({ queryKey: CHAVES_OS.catalogo })
    }
  }, [aoVivo.data, produtoId, qc])
  useEffect(() => setFoto(0), [produtoId])

  const p = ficha.data
  const imagens = aoVivo.data?.imagens ?? []
  const disponivel = p?.disponivel != null ? Number(p.disponivel) : null

  return (
    <FolhaM
      aberta={aberta}
      aoFechar={aoFechar}
      titulo="Produto"
      rodape={acao}
    >
      {ficha.isError ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <AlertTriangle className="size-7 text-crit" />
          <p className="text-[14px] text-ink-2">{(ficha.error as Error).message}</p>
          <BotaoM variante="neutro" tamanho="md" icone={RefreshCw} onClick={() => void ficha.refetch()}>
            Tentar de novo
          </BotaoM>
        </div>
      ) : !p ? (
        <div className="flex flex-col gap-3 pb-2">
          <EsqueletoM className="h-40 rounded-2xl" />
          <EsqueletoM className="h-6 w-3/4 rounded-lg" />
          <EsqueletoM className="h-24 rounded-2xl" />
        </div>
      ) : (
        <div className="flex flex-col gap-5 pb-2">
          {/* foto da Omie ou o ícone */}
          {imagens.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border border-line bg-white">
                <img src={imagens[foto]} alt={p.descricao} className="size-full object-contain" loading="lazy" />
              </div>
              {imagens.length > 1 && (
                <div className="flex gap-2 overflow-x-auto">
                  {imagens.map((u, i) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setFoto(i)}
                      aria-label={`Foto ${i + 1}`}
                      className={cn('size-14 shrink-0 overflow-hidden rounded-xl border bg-white', i === foto ? 'border-accent' : 'border-line')}
                    >
                      <img src={u} alt="" className="size-full object-contain" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : aoVivo.isFetching ? (
            <EsqueletoM className="aspect-[4/3] rounded-2xl" />
          ) : null}

          <div className="flex items-start gap-3">
            {!imagens.length && (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
                <Package className="size-6" />
              </span>
            )}
            <div className="min-w-0">
              <h3 className="font-display text-[19px] leading-snug font-semibold text-ink">{p.descricao}</h3>
              <p className="num mt-1 text-[13px] text-ink-3">
                {p.codigo}
                {p.referencia ? ` · Ref. ${p.referencia}` : ''}
              </p>
            </div>
          </div>

          <SincroniaOmie carregando={aoVivo.isFetching} omie={aoVivo.data?.omie ?? null} aviso={aoVivo.data?.aviso ?? null} em={p.sincronizado_em} semVinculo={!p.omie_id} aoAtualizar={() => void aoVivo.refetch()} />

          {(p.bloqueado || p.situacao !== 'ativo') && (
            <p className="rounded-xl bg-crit-soft px-3.5 py-2.5 text-[13.5px] font-semibold text-crit-ink">
              {p.bloqueado ? 'Produto bloqueado na Omie.' : 'Produto inativo no cadastro.'} Confirme com a central antes de usar.
            </p>
          )}

          {/* preço e estoque */}
          <section className="overflow-hidden rounded-2xl border border-line">
            <div className="flex items-end justify-between gap-3 px-4 py-3.5">
              <div>
                <RotuloM>Preço de venda</RotuloM>
                <p className="num mt-1 text-[24px] leading-none font-semibold text-ink">{p.preco_venda != null ? moeda(Number(p.preco_venda)) : '—'}</p>
                {p.unidade && <p className="mt-1 text-[12px] text-ink-3">por {p.unidade.toLowerCase()}</p>}
              </div>
              <div className="text-right">
                <RotuloM>Disponível agora</RotuloM>
                <p className={cn('num mt-1 text-[24px] leading-none font-semibold', classeDisponivel(disponivel))}>
                  {disponivel == null ? '—' : disponivel > 0 ? quantidadeBR(disponivel) : 'Sem estoque'}
                </p>
                {disponivel != null && disponivel > 0 && p.unidade && <p className="mt-1 text-[12px] text-ink-3">{p.unidade.toLowerCase()}</p>}
              </div>
            </div>
            <dl className="grid grid-cols-3 divide-x divide-line border-t border-line text-center">
              <Numero rotulo="Saldo" valor={p.saldo} />
              <Numero rotulo="Reservado" valor={p.reservado} />
              <Numero rotulo="Em OS aberta" valor={p.comprometido} />
            </dl>
            <dl className="grid grid-cols-3 divide-x divide-line border-t border-line text-center">
              <Numero rotulo="Físico" valor={p.fisico} />
              <Numero rotulo="A receber" valor={p.pendente} />
              <Numero rotulo="Mínimo" valor={p.estoque_minimo} />
            </dl>
          </section>

          {(p.custo_medio != null || p.preco_custo != null) && (
            <section className="grid grid-cols-2 gap-2">
              <Dado rotulo="Custo médio (Omie)" valor={p.custo_medio != null ? moeda(Number(p.custo_medio)) : null} />
              <Dado rotulo="Preço de custo" valor={p.preco_custo != null ? moeda(Number(p.preco_custo)) : null} />
            </section>
          )}

          {p.descricao_detalhada && (
            <section>
              <RotuloM>Descrição</RotuloM>
              <p className="mt-1.5 text-[14px] leading-relaxed whitespace-pre-line text-ink-2">{p.descricao_detalhada}</p>
            </section>
          )}

          <section className="grid grid-cols-2 gap-2">
            <Dado rotulo="Marca" valor={p.marca} />
            <Dado rotulo="Modelo" valor={p.modelo} />
            <Dado rotulo="Família" valor={p.familia} />
            <Dado rotulo="Unidade" valor={p.unidade} />
            <Dado rotulo="NCM" valor={p.ncm} mono />
            <Dado rotulo="EAN" valor={p.ean} mono />
            <Dado rotulo="Localização" valor={p.localizacao} />
            <Dado rotulo="Fornecedor" valor={p.fornecedor} />
            {aoVivo.data?.garantia_dias ? <Dado rotulo="Garantia" valor={`${aoVivo.data.garantia_dias} dias`} /> : null}
            {Number(p.peso_bruto) > 0 && <Dado rotulo="Peso bruto" valor={`${quantidadeBR(p.peso_bruto)} kg`} />}
          </section>

          {p.observacoes && (
            <section>
              <RotuloM>Observações</RotuloM>
              <p className="mt-1.5 text-[14px] leading-relaxed whitespace-pre-line text-ink-2">{p.observacoes}</p>
            </section>
          )}
        </div>
      )}
    </FolhaM>
  )
}

function SincroniaOmie({
  carregando,
  omie,
  aviso,
  em,
  semVinculo,
  aoAtualizar,
}: {
  carregando: boolean
  omie: boolean | null
  aviso: string | null
  em: string | null
  semVinculo: boolean
  aoAtualizar: () => void
}) {
  const data = quando(em)
  if (carregando)
    return (
      <p className="flex items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[13px] text-ink-2">
        <Loader2 className="size-4 animate-spin text-cyan-ink" /> Conferindo com a Omie…
      </p>
    )
  if (omie && !aviso)
    return (
      <p className="flex items-center gap-2 rounded-xl bg-ok-soft px-3.5 py-2.5 text-[13px] font-medium text-ok-ink">
        <CheckCircle2 className="size-4" /> Sincronizado com a Omie {data ? `· ${data}` : 'agora'}
      </p>
    )
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[13px] text-warn-ink">
      <p className="leading-snug">
        {semVinculo ? 'Produto só do cadastro Tecnoar.' : (aviso ?? 'Não foi possível conferir na Omie agora.')}
        {data && !semVinculo ? ` Dados de ${data}.` : ''}
      </p>
      {!semVinculo && (
        <button type="button" onClick={aoAtualizar} className="flex shrink-0 items-center gap-1 font-semibold underline-offset-2 active:underline">
          <RefreshCw className="size-3.5" /> Tentar
        </button>
      )}
    </div>
  )
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number | null }) {
  return (
    <div className="flex flex-col gap-0.5 px-2 py-2.5">
      <dd className="num text-[15px] font-semibold text-ink">{valor != null ? quantidadeBR(valor) : '—'}</dd>
      <dt className="text-[11.5px] text-ink-3">{rotulo}</dt>
    </div>
  )
}

function Dado({ rotulo, valor, mono }: { rotulo: string; valor: string | null | undefined; mono?: boolean }) {
  if (!valor) return null
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 px-3 py-2.5">
      <p className="text-[11.5px] text-ink-3">{rotulo}</p>
      <p className={cn('mt-0.5 truncate text-[14px] font-medium text-ink', mono && 'num')}>{valor}</p>
    </div>
  )
}
