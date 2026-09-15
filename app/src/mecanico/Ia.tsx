import { useMemo, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, Hammer, ImageOff, Loader2, Package, Plus, RotateCw, ShieldAlert, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { ErroIa, sosAdicionarItem, sosIaFoto, sosIaKit, sosIaPublico, sosIaResumo, sosUrlsArquivos } from '@/sos/api'
import { AVISO_SEM_ESTOQUE, faltouEstoque, textoDisponivel, tomDisponivel } from '@/sos/estoque'
import { horaCurta } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { AnexoSOS, DetalheChamado, IaKit, IaResumo, ItemCatalogo } from '@/sos/tipos'
import { BotaoM, FolhaM } from './ui'
import { useOnline } from './dados'

/**
 * A IA do SOS no app do mecânico: kit do que levar, texto do atendimento e
 * leitura de fotos. Tudo é sugestão — o mecânico confere e decide. Só aparece
 * com a IA ligada na central (e cada recurso com a sua chave).
 */

export function useIaPublico() {
  return useQuery({ queryKey: ['sos', 'ia-publico'], queryFn: sosIaPublico, staleTime: 5 * 60_000, retry: false })
}

export function useIaLigada(recurso: 'kit' | 'resumo' | 'foto'): boolean {
  const ia = useIaPublico()
  return !!ia.data?.ativa && !!ia.data[recurso]
}

function mensagemIa(e: unknown): string {
  if (e instanceof ErroIa) return e.message
  return (e as Error)?.message || 'A IA não respondeu agora. Tente de novo em instantes.'
}

/** Selo "IA" — deixa claro que é sugestão de máquina, não da central. */
function SeloIa({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-cyan-soft px-2 py-0.5 text-[10.5px] font-extrabold tracking-[0.1em] text-cyan-ink uppercase', className)}>
      <Brain className="size-3" /> IA
    </span>
  )
}

/* ── kit sugerido ───────────────────────────────────────────────────────── */

function useGerarKit(chamadoId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => sosIaKit(chamadoId),
    onSuccess: ({ kit }) => {
      qc.setQueryData<DetalheChamado>(CHAVES_SOS.detalhe(chamadoId), (d) => (d ? { ...d, chamado: { ...d.chamado, ia_kit: kit } } : d))
    },
  })
}

/**
 * Kit sugerido pela Tecno IA. `compacto`: uma linha que abre a folha (a caminho,
 * por cima do mapa). Senão, um cartão na tela de atendimento — com "Lançar"
 * nas peças do catálogo quando `podeLancar` (mecânico no local).
 */
export function KitIa({ d, podeLancar, compacto }: { d: DetalheChamado; podeLancar: boolean; compacto?: boolean }) {
  const ligada = useIaLigada('kit')
  const online = useOnline()
  const gerar = useGerarKit(d.chamado.id)
  const [aberta, setAberta] = useState(false)
  const kit = d.chamado.ia_kit ?? null
  if (!ligada) return null

  const botaoGerar = (
    <div className="flex flex-col gap-1.5">
      <BotaoM
        variante="escuro"
        tamanho="lg"
        largo
        icone={kit ? RotateCw : Brain}
        carregando={gerar.isPending}
        disabled={!online}
        onClick={() => gerar.mutate()}
      >
        {gerar.isPending ? 'Montando o kit…' : kit ? 'Gerar de novo' : 'Gerar kit com a Tecno IA'}
      </BotaoM>
      {gerar.isPending && <p className="text-center text-[12.5px] text-ink-3">A IA lê o problema e o histórico do veículo. Leva uns segundos.</p>}
      {!online && <p className="text-center text-[12.5px] font-medium text-warn-ink">A IA precisa de internet.</p>}
      {gerar.isError && <p className="text-center text-[12.5px] font-medium text-crit-ink">{mensagemIa(gerar.error)}</p>}
    </div>
  )

  if (compacto) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAberta(true)}
          className="flex min-h-16 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-2.5 text-left active:scale-[0.99]"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-soft text-cyan-ink">
            <Brain className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-bold text-ink">Kit sugerido pela Tecno IA</span>
            <span className="block truncate text-[12.5px] text-ink-2">{kit ? kit.resumo || 'Peças, ferramentas e cuidados' : 'O que levar para este problema'}</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-ink-3" />
        </button>
        <FolhaM
          aberta={aberta}
          aoFechar={() => setAberta(false)}
          titulo="Kit sugerido pela Tecno IA"
          descricao="Sugestão para conferir antes de sair. As peças vêm do catálogo da Tecnoar, com preço e estoque."
          rodape={botaoGerar}
        >
          {kit ? <ConteudoKit d={d} kit={kit} podeLancar={podeLancar} /> : <KitVazio />}
        </FolhaM>
      </>
    )
  }

  if (!kit) {
    return (
      <section className="flex flex-col gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
        <h2 className="flex items-center gap-2 font-display text-[16px] font-bold text-ink">
          <Brain className="size-[18px] text-cyan-ink" /> Kit sugerido pela Tecno IA
        </h2>
        <KitVazio />
        {botaoGerar}
      </section>
    )
  }

  return (
    <details className="group rounded-[1.25rem] border border-line bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
        <Brain className="size-[18px] shrink-0 text-cyan-ink" />
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[15px] font-bold text-ink">Kit sugerido pela Tecno IA</span>
          <span className="block group-open:hidden">
            <span className="line-clamp-2 text-[12.5px] leading-snug text-ink-2">{kit.resumo}</span>
          </span>
        </span>
        <span className="shrink-0 text-[12px] font-semibold text-ink-3 group-open:hidden">abrir</span>
      </summary>
      <div className="flex flex-col gap-4 px-4 pb-4">
        <ConteudoKit d={d} kit={kit} podeLancar={podeLancar} />
        {botaoGerar}
      </div>
    </details>
  )
}

function KitVazio() {
  return <p className="text-[13.5px] leading-relaxed text-ink-2">A IA sugere hipóteses, ferramentas e peças do catálogo para este problema, a partir do relato do cliente e do histórico do veículo.</p>
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="lbl">{titulo}</h3>
      {children}
    </div>
  )
}

function ConteudoKit({ d, kit, podeLancar }: { d: DetalheChamado; kit: IaKit; podeLancar: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const online = useOnline()
  const [lancando, setLancando] = useState<string | null>(null)
  const lancados = useMemo(() => new Set(d.itens.flatMap((i) => [i.produto_id, i.servico_id]).filter(Boolean) as string[]), [d.itens])

  const lancar = useMutation({
    mutationFn: (i: ItemCatalogo) => sosAdicionarItem(d.chamado.id, i.tipo, i.id, 1),
    onMutate: (i) => setLancando(i.id),
    onSuccess: (r, i) => {
      if (faltouEstoque(r)) toast.atencao(AVISO_SEM_ESTOQUE.titulo, `${AVISO_SEM_ESTOQUE.texto} ${i.descricao}`)
      else toast.ok('Lançado no atendimento', i.descricao)
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(d.chamado.id) })
      // O disponível do catálogo e as OS mudam junto (a peça passa a contar como comprometida).
      void qc.invalidateQueries({ queryKey: ['sos', 'catalogo'] })
      void qc.invalidateQueries({ queryKey: ['sos', 'minhas-os'] })
      if (d.os) void qc.invalidateQueries({ queryKey: ['sos', 'os', d.os.id] })
    },
    onError: (e) => toast.erro('Não foi possível lançar', (e as Error).message),
    onSettled: () => setLancando(null),
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[15px] leading-snug font-semibold text-ink">{kit.resumo}</p>
        <SeloIa className="mt-0.5 shrink-0" />
      </div>

      {kit.hipoteses.length > 0 && (
        <Grupo titulo="Hipóteses, da mais provável">
          <ol className="flex flex-col gap-1.5">
            {kit.hipoteses.map((h, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[14px] leading-snug text-ink">
                <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-bold text-ink-2">{i + 1}</span>
                <span className="pt-0.5">{h}</span>
              </li>
            ))}
          </ol>
        </Grupo>
      )}

      {kit.pecas.length > 0 && (
        <Grupo titulo="Peças do catálogo">
          {!podeLancar && <p className="-mt-1 text-[12.5px] text-ink-3">O botão Lançar aparece quando você chegar ao local.</p>}
          <ul className="flex flex-col gap-2.5">
            {kit.pecas.map((p, i) => (
              <li key={`${p.termo}-${i}`} className="rounded-xl border border-line bg-surface-2 p-3">
                <p className="text-[14px] font-bold text-ink first-letter:uppercase">{p.termo}</p>
                {p.motivo && <p className="text-[12.5px] leading-snug text-ink-2">{p.motivo}</p>}
                {p.itens.length === 0 ? (
                  <p className="mt-2 text-[12.5px] text-ink-3">Nada com esse nome no catálogo.</p>
                ) : (
                  <ul className="mt-2 flex flex-col divide-y divide-line">
                    {p.itens.map((it) => {
                      const ja = lancados.has(it.id)
                      // Disponível (saldo − reservado − comprometido), não o saldo cru da Omie.
                      const estoque = it.tipo === 'produto' ? textoDisponivel(it.disponivel, it.unidade) : null
                      const semEstoque = it.tipo === 'produto' && tomDisponivel(it.disponivel) === 'sem'
                      return (
                        <li key={`${it.tipo}-${it.id}`} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                          <Package className="size-4 shrink-0 text-accent" />
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-[13.5px] leading-snug font-medium text-ink">{it.descricao}</p>
                            <p className="num text-[11.5px] text-ink-3">
                              {[it.codigo, it.preco != null ? moeda(it.preco) : null].filter(Boolean).join(' · ')}
                              {estoque && (
                                <span className={cn(semEstoque ? 'font-semibold text-crit-ink' : '')}>
                                  {' · '}
                                  {estoque.toLowerCase()}
                                </span>
                              )}
                            </p>
                          </div>
                          {podeLancar &&
                            (ja ? (
                              <span className="flex min-h-11 shrink-0 items-center gap-1 px-2 text-[12.5px] font-bold text-ok-ink">
                                <Check className="size-4" strokeWidth={3} /> Lançado
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => lancar.mutate(it)}
                                disabled={!online || lancando != null}
                                className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-accent px-3 text-[13px] font-bold text-white active:scale-[0.97] disabled:opacity-50"
                              >
                                {lancando === it.id ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" strokeWidth={3} />}
                                Lançar
                              </button>
                            ))}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </Grupo>
      )}

      {kit.ferramentas.length > 0 && (
        <Grupo titulo="Ferramentas">
          <ul className="flex flex-wrap gap-1.5">
            {kit.ferramentas.map((f, i) => (
              <li key={i} className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1.5 text-[13px] font-medium text-ink">
                <Hammer className="size-3.5 text-ink-3" /> {f}
              </li>
            ))}
          </ul>
        </Grupo>
      )}

      {kit.cuidados.length > 0 && (
        <Grupo titulo="Cuidados">
          <ul className="flex flex-col gap-1.5 rounded-xl bg-warn-soft px-3.5 py-3">
            {kit.cuidados.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[13.5px] leading-snug text-warn-ink">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {c}
              </li>
            ))}
          </ul>
        </Grupo>
      )}

      <p className="text-[11.5px] text-ink-3">Sugestão da IA às {horaCurta(kit.gerado_em)} — confira no local antes de usar.</p>
    </div>
  )
}

/* ── texto do atendimento ───────────────────────────────────────────────── */

/**
 * "Escrever com a Tecno IA": diagnóstico, serviço e observações a partir do que
 * aconteceu no chamado (relato, conversa, itens, linha do tempo). Com os
 * campos vazios, preenche direto; se o mecânico já escreveu, mostra antes de
 * trocar. Continua tudo editável até finalizar.
 */
export function BotaoEscreverIa({
  chamadoId,
  temTexto,
  aoUsar,
  className,
}: {
  chamadoId: string
  temTexto: boolean
  aoUsar: (r: IaResumo) => void
  className?: string
}) {
  const ligada = useIaLigada('resumo')
  const online = useOnline()
  const toast = useToast()
  const [previa, setPrevia] = useState<IaResumo | null>(null)
  const escrever = useMutation({
    mutationFn: () => sosIaResumo(chamadoId),
    onSuccess: ({ resumo }) => {
      if (temTexto) return setPrevia(resumo)
      aoUsar(resumo)
      toast.ok('Texto da IA pronto', 'Revise e ajuste antes de finalizar.')
    },
    onError: (e) => toast.erro('A IA não escreveu agora', mensagemIa(e)),
  })
  if (!ligada) return null

  return (
    <>
      <button
        type="button"
        onClick={() => escrever.mutate()}
        disabled={!online || escrever.isPending}
        title={!online ? 'A IA precisa de internet' : undefined}
        className={cn(
          'flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-cyan/30 bg-cyan-soft px-3.5 text-[14.5px] font-bold text-cyan-ink transition-transform active:scale-[0.98] disabled:opacity-50',
          className,
        )}
      >
        {escrever.isPending ? <Loader2 className="size-4 animate-spin" /> : <Brain className="size-4" />}
        {escrever.isPending ? 'Escrevendo…' : online ? 'Escrever com a Tecno IA' : 'IA sem internet'}
      </button>

      <FolhaM
        aberta={!!previa}
        aoFechar={() => setPrevia(null)}
        titulo="Texto sugerido pela Tecno IA"
        descricao="Troca o que você escreveu. Dá para ajustar depois, antes de finalizar."
        rodape={
          <>
            <BotaoM
              variante="escuro"
              tamanho="xl"
              largo
              icone={Brain}
              onClick={() => {
                if (previa) aoUsar(previa)
                setPrevia(null)
              }}
            >
              Usar o texto da Tecno IA
            </BotaoM>
            <BotaoM variante="fantasma" tamanho="lg" largo onClick={() => setPrevia(null)}>
              Manter o meu
            </BotaoM>
          </>
        }
      >
        {previa && (
          <div className="flex flex-col gap-2.5 pb-1">
            <TextoPrevia titulo="Diagnóstico" texto={previa.diagnostico} />
            <TextoPrevia titulo="Serviço realizado" texto={previa.servico_realizado} />
            <TextoPrevia titulo="Observações" texto={previa.observacoes} />
          </div>
        )}
      </FolhaM>
    </>
  )
}

function TextoPrevia({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3.5 py-2.5">
      <p className="lbl">{titulo}</p>
      <p className="mt-1 text-[14px] leading-snug whitespace-pre-line text-ink">{texto.trim() || '—'}</p>
    </div>
  )
}

/* ── fotos ──────────────────────────────────────────────────────────────── */

const ETAPA_FOTO: Record<string, string> = {
  abertura: 'Foto do cliente',
  diagnostico: 'Diagnóstico',
  antes: 'Antes',
  depois: 'Depois',
  conclusao: 'Conclusão',
  outro: 'Foto',
}

/**
 * Leitura de fotos pela IA: o que se vê, hipóteses, o que conferir e riscos.
 * Cada análise fica na linha do tempo do chamado — reabrir a tela mostra a
 * que já foi feita, sem pagar a IA de novo.
 */
export function FotosIa({ d }: { d: DetalheChamado }) {
  const ligada = useIaLigada('foto')
  const fotos = useMemo(() => d.anexos.filter((a) => a.tipo === 'foto'), [d.anexos])
  if (!ligada || fotos.length === 0) return null
  return (
    <details className="group rounded-[1.25rem] border border-line bg-surface">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3">
        <Brain className="size-[18px] shrink-0 text-cyan-ink" />
        <span className="min-w-0 flex-1 font-display text-[15px] font-bold text-ink">Analisar fotos com a Tecno IA</span>
        <span className="num shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11.5px] font-semibold text-ink-2">{fotos.length}</span>
      </summary>
      <div className="px-4 pb-4">
        <p className="mb-3 text-[12.5px] leading-snug text-ink-3">Triagem por imagem: ajuda a pensar, não substitui a sua conferência.</p>
        <ListaFotosIa d={d} fotos={fotos} />
      </div>
    </details>
  )
}

function ListaFotosIa({ d, fotos }: { d: DetalheChamado; fotos: AnexoSOS[] }) {
  const caminhos = useMemo(() => fotos.map((f) => f.caminho), [fotos])
  const urls = useQuery({
    queryKey: ['sos', 'urls', d.chamado.id, caminhos.join('|')],
    staleTime: 50 * 60_000,
    queryFn: () => sosUrlsArquivos(caminhos),
  })
  // Análises já feitas ficam na linha do tempo (evento "ia" com o caminho da foto).
  const feitas = useMemo(() => {
    const m: Record<string, string> = {}
    for (const e of d.eventos) {
      const caminho = (e.dados as { caminho?: unknown } | null)?.caminho
      if (e.tipo === 'ia' && typeof caminho === 'string' && e.descricao) m[caminho] = e.descricao
    }
    return m
  }, [d.eventos])

  return (
    <ul className="flex flex-col gap-3">
      {fotos.map((f) => (
        <FotoIa key={f.id} chamadoId={d.chamado.id} foto={f} url={urls.data?.[f.caminho]} analise={feitas[f.caminho] ?? null} />
      ))}
    </ul>
  )
}

function FotoIa({ chamadoId, foto, url, analise }: { chamadoId: string; foto: AnexoSOS; url: string | undefined; analise: string | null }) {
  const online = useOnline()
  const [texto, setTexto] = useState<string | null>(null)
  const [inteiro, setInteiro] = useState(false)
  const analisar = useMutation({
    mutationFn: () => sosIaFoto(chamadoId, foto.caminho),
    onSuccess: (r) => {
      setTexto(r.texto)
      setInteiro(true)
    },
  })
  const resultado = texto ?? analise

  return (
    <li className="rounded-xl border border-line bg-surface-2 p-2.5">
      <div className="flex items-center gap-3">
        <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-2">
          {url ? <img src={url} alt="" className="size-full object-cover" loading="lazy" /> : <ImageOff className="size-5 text-ink-3" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold text-ink">{ETAPA_FOTO[foto.etapa] ?? 'Foto'}</p>
          <p className="num text-[12px] text-ink-3">
            {horaCurta(foto.created_at)}
            {foto.legenda ? ` · ${foto.legenda}` : ''}
          </p>
        </div>
        {!resultado && (
          <button
            type="button"
            onClick={() => analisar.mutate()}
            disabled={!online || analisar.isPending}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-cyan px-3 text-[13px] font-bold text-white active:scale-[0.97] disabled:opacity-50"
          >
            {analisar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Brain className="size-4" />}
            {analisar.isPending ? 'Analisando' : 'Analisar'}
          </button>
        )}
      </div>
      {analisar.isError && <p className="mt-2 text-[12.5px] font-medium text-crit-ink">{mensagemIa(analisar.error)}</p>}
      {!resultado && !online && <p className="mt-2 text-[12px] text-warn-ink">A IA precisa de internet.</p>}
      {resultado && (
        <div className="mt-2.5 rounded-lg bg-cyan-soft px-3 py-2.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <SeloIa />
            {analisar.isSuccess ? null : (
              <button
                type="button"
                onClick={() => analisar.mutate()}
                disabled={!online || analisar.isPending}
                className="-my-1 flex min-h-11 items-center gap-1 px-1 text-[12.5px] font-semibold text-ink-2 disabled:opacity-50"
              >
                {analisar.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />} Analisar de novo
              </button>
            )}
          </div>
          <p className={cn('text-[13.5px] leading-relaxed whitespace-pre-line text-ink', !inteiro && 'line-clamp-4')}>{resultado}</p>
          {!inteiro && resultado.length > 180 && (
            <button type="button" onClick={() => setInteiro(true)} className="mt-0.5 min-h-11 pr-3 text-[13px] font-bold text-accent">
              Ler tudo
            </button>
          )}
        </div>
      )}
    </li>
  )
}
