import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, FileText, Info, LifeBuoy, Minus, Package, Plus, RefreshCw, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { moeda, paraNumero } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { sosAdicionarItem, sosOSAdicionarItem } from '@/sos/api'
import { AVISO_SEM_ESTOQUE, faltouEstoque, quantidadeBR, textoDisponivel, textoEstoqueEm } from '@/sos/estoque'
import type { ItemCatalogo } from '@/sos/tipos'
import { AJUDA_RESERVA, classeDisponivel } from '../Catalogo'
import { useOnline } from '../dados'
import { BotaoM, EsqueletoM, FolhaM, RotuloM } from '../ui'
import { invalidarDepoisDeLancar, type DestinoLancamento } from './dados'

export type { DestinoLancamento }

const chaveDestino = (d: DestinoLancamento) => `${d.tipo}:${d.id}`

/**
 * Folha "Lançar": quantidade e destino, um toque para confirmar. O banco
 * responde se havia estoque; se faltou, a peça entra como necessária e a
 * central já foi avisada — o mecânico só fica sabendo, não precisa ligar.
 */
export function FolhaLancar({
  item,
  aoFechar,
  destinos,
  carregandoDestinos = false,
  erroDestinos = null,
  aoTentarDestinos,
  aoLancado,
}: {
  item: ItemCatalogo | null
  aoFechar: () => void
  destinos: DestinoLancamento[]
  carregandoDestinos?: boolean
  erroDestinos?: string | null
  aoTentarDestinos?: () => void
  aoLancado?: (d: DestinoLancamento) => void
}) {
  const qc = useQueryClient()
  const toast = useToast()
  const online = useOnline()
  const [texto, setTexto] = useState('1')
  const [escolha, setEscolha] = useState<string | null>(null)

  // Item novo: começa de 1 e deixa o destino padrão.
  useEffect(() => {
    setTexto('1')
    setEscolha(null)
  }, [item?.tipo, item?.id])

  const destino =
    destinos.find((d) => chaveDestino(d) === escolha) ?? (destinos.length === 1 ? destinos[0] : destinos.find((d) => d.tipo === 'chamado')) ?? null
  const quantidade = paraNumero(texto)
  const qtdValida = quantidade != null && quantidade > 0 && quantidade <= 9999

  const lancar = useMutation({
    mutationFn: async (p: { item: ItemCatalogo; destino: DestinoLancamento; quantidade: number }) =>
      p.destino.tipo === 'chamado'
        ? sosAdicionarItem(p.destino.id, p.item.tipo, p.item.id, p.quantidade)
        : sosOSAdicionarItem(p.destino.id, p.item.tipo, p.item.id, p.quantidade),
    onSuccess: (r, p) => {
      if (faltouEstoque(r)) toast.atencao(AVISO_SEM_ESTOQUE.titulo, `${AVISO_SEM_ESTOQUE.texto} ${quantidadeBR(p.quantidade)}× ${p.item.descricao}`)
      else toast.ok(p.destino.tipo === 'chamado' ? 'Lançado no atendimento' : `Lançado na ${p.destino.titulo}`, `${quantidadeBR(p.quantidade)}× ${p.item.descricao}`)
      invalidarDepoisDeLancar(qc, {
        osId: p.destino.tipo === 'os' ? p.destino.id : (p.destino.osId ?? null),
        chamadoId: p.destino.tipo === 'chamado' ? p.destino.id : (p.destino.chamadoId ?? null),
      })
      aoLancado?.(p.destino)
      aoFechar()
    },
    onError: (e) => toast.erro('Não foi possível lançar', (e as Error).message),
  })

  if (!item) return null

  const produto = item.tipo === 'produto'
  const disponivel = item.disponivel != null ? Number(item.disponivel) : null
  const estoque = produto ? textoDisponivel(disponivel, item.unidade) : null
  const estoqueEm = produto ? textoEstoqueEm(item.estoque_em) : null
  const vaiFaltar = produto && disponivel != null && qtdValida && (quantidade ?? 0) > disponivel
  const unidade = item.unidade ? item.unidade.toLowerCase() : produto ? 'un' : ''
  const total = qtdValida && item.preco != null ? Number(item.preco) * (quantidade ?? 0) : null

  function mudar(delta: number) {
    const atual = quantidade ?? 0
    const nova = Math.round((atual + delta) * 1000) / 1000
    // Sem separador de milhar: "1.000" viraria 1 ao editar à mão.
    if (nova > 0) setTexto(String(nova).replace('.', ','))
  }

  return (
    <FolhaM
      aberta
      aoFechar={lancar.isPending ? () => {} : aoFechar}
      titulo={produto ? 'Lançar peça' : 'Lançar serviço'}
      rodape={
        <>
          {!online && <p className="text-center text-[13px] font-medium text-warn-ink">Sem internet: lançar precisa de sinal.</p>}
          <BotaoM
            variante="laranja"
            tamanho="xl"
            largo
            icone={Plus}
            carregando={lancar.isPending}
            disabled={!online || !destino || !qtdValida}
            onClick={() => destino && quantidade != null && lancar.mutate({ item, destino, quantidade })}
          >
            {destino ? `Lançar ${qtdValida ? quantidadeBR(quantidade) : ''}${unidade ? ` ${unidade}` : ''}` : 'Escolha o destino'}
          </BotaoM>
        </>
      }
    >
      <div className="flex flex-col gap-5 pb-1">
        {/* o item */}
        <div className="flex items-start gap-3">
          <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl', produto ? 'bg-accent-soft text-accent-ink' : 'bg-cyan-soft text-cyan-ink')}>
            {produto ? <Package className="size-6" /> : <Wrench className="size-6" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[17px] leading-snug font-bold text-ink">{item.descricao}</p>
            <p className="num mt-0.5 text-[12.5px] text-ink-3">Código: {item.codigo ?? '—'}</p>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="num text-[18px] font-semibold text-ink">{item.preco != null ? moeda(Number(item.preco)) : 'sem preço'}</span>
              {estoque && <span className={cn('num text-[14px] font-bold', classeDisponivel(disponivel))}>{estoque}</span>}
              {estoqueEm && <span className="num text-[11.5px] text-ink-3">{estoqueEm}</span>}
            </div>
          </div>
        </div>

        {/* quantidade */}
        <div className="flex flex-col gap-2">
          <RotuloM className="px-0.5">Quantidade</RotuloM>
          <div className="flex items-center gap-3">
            <div className="flex items-center rounded-2xl border-2 border-line bg-surface-2">
              <button
                type="button"
                aria-label="Diminuir"
                disabled={!qtdValida || (quantidade ?? 0) <= 1}
                onClick={() => mudar(-1)}
                className="flex size-14 items-center justify-center text-ink-2 disabled:opacity-35"
              >
                <Minus className="size-6" />
              </button>
              {/* Ponto vira vírgula: "1.5" é um e meio, não quinze. */}
              <input
                inputMode="decimal"
                enterKeyHint="done"
                aria-label="Quantidade"
                value={texto}
                onChange={(e) => setTexto(e.target.value.replace(/\./g, ',').replace(/[^\d,]/g, '').slice(0, 8))}
                onFocus={(e) => e.currentTarget.select()}
                className="num h-14 w-16 bg-transparent text-center text-[22px] font-bold text-ink outline-none"
              />
              <button type="button" aria-label="Aumentar" onClick={() => mudar(1)} className="flex size-14 items-center justify-center text-ink-2">
                <Plus className="size-6" />
              </button>
            </div>
            <div className="min-w-0">
              {unidade && <p className="text-[14px] font-semibold text-ink-2">{unidade}</p>}
              {total != null && <p className="num text-[15px] font-bold text-ink">{moeda(total)}</p>}
            </div>
          </div>
          {!qtdValida && <p className="px-0.5 text-[12.5px] font-semibold text-crit-ink">Informe uma quantidade maior que zero.</p>}
          {vaiFaltar && (
            <p className="flex items-start gap-2 rounded-2xl bg-warn-soft px-3.5 py-2.5 text-[13px] leading-snug font-medium text-warn-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {disponivel && disponivel > 0
                ? `Disponível só ${quantidadeBR(disponivel)}. O que faltar entra como necessária e a central é avisada.`
                : 'Sem estoque agora: entra como necessária e a central é avisada.'}
            </p>
          )}
        </div>

        {/* destino */}
        <div className="flex flex-col gap-2">
          <RotuloM className="px-0.5">Lançar em</RotuloM>
          {carregandoDestinos && !destinos.length ? (
            <div className="flex flex-col gap-2">
              <EsqueletoM className="h-16" />
              <EsqueletoM className="h-16" />
            </div>
          ) : erroDestinos && !destinos.length ? (
            <div className="flex flex-col items-start gap-2 rounded-2xl bg-crit-soft px-3.5 py-3">
              <p className="text-[13.5px] leading-snug text-crit-ink">{erroDestinos}</p>
              {aoTentarDestinos && (
                <BotaoM variante="escuro" tamanho="md" icone={RefreshCw} onClick={aoTentarDestinos}>
                  Tentar de novo
                </BotaoM>
              )}
            </div>
          ) : !destinos.length ? (
            <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-[13.5px] leading-snug text-ink-2">
              Nenhum chamado em atendimento e nenhuma OS aberta com você agora. Aqui fica só a consulta.
            </p>
          ) : (
            <div role="radiogroup" aria-label="Destino" className="flex flex-col gap-2">
              {destinos.map((d) => {
                const marcado = destino != null && chaveDestino(d) === chaveDestino(destino)
                const Icone = d.tipo === 'chamado' ? LifeBuoy : FileText
                return (
                  <button
                    key={chaveDestino(d)}
                    type="button"
                    role="radio"
                    aria-checked={marcado}
                    onClick={() => setEscolha(chaveDestino(d))}
                    className={cn(
                      'flex min-h-16 w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition-colors',
                      marcado ? 'border-accent bg-accent-soft' : 'border-line bg-surface active:bg-surface-2',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-xl',
                        d.tipo === 'chamado' ? 'bg-cyan-soft text-cyan-ink' : 'bg-surface-2 text-ink-2',
                      )}
                    >
                      <Icone className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[15.5px] font-bold text-ink">{d.titulo}</span>
                      {d.sub && <span className="block truncate text-[12.5px] text-ink-3">{d.sub}</span>}
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                        marcado ? 'border-accent bg-accent text-white' : 'border-line-strong',
                      )}
                    >
                      {marcado && <Check className="size-4" strokeWidth={3} />}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          {produto && (
            <p className="flex items-start gap-2 px-0.5 text-[12.5px] leading-snug text-ink-3">
              <Info className="mt-0.5 size-3.5 shrink-0" />{' '}
              {destino?.tipo === 'chamado' || destinos.some((d) => d.tipo === 'chamado') ? AJUDA_RESERVA : 'Com estoque, a peça fica reservada para a OS.'}
            </p>
          )}
        </div>
      </div>
    </FolhaM>
  )
}
