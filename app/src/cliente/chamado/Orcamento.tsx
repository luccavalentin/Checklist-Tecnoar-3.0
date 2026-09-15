import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, BadgeCheck, ChevronRight, CircleSlash, FileText, Package, PenLine, Receipt, Route, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { sosEnviarAnexo, sosResponderOrcamento } from '@/sos/api'
import { dataHoraCurta, horaCurta } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { ChamadoSOS, DetalheChamado, ItemSOS } from '@/sos/tipos'
import { AreaApp, Avatar, BotaoApp, Faixa, Folha } from '../../comum/ui'
import { useOnline } from '../../comum/Pwa'
import { TelaAssinatura } from './Assinatura'

/**
 * Orçamento do atendimento, do lado do cliente.
 *
 * O mecânico lança peças e serviços (do catálogo, com o preço de lá) e envia;
 * a taxa de deslocamento entra sozinha na chegada. Aqui o cliente vê item por
 * item, o total e o recado do mecânico, e responde: aprova ASSINANDO na tela
 * (a assinatura vai para o laudo) ou recusa, com motivo se quiser.
 *
 * Quem manda é o banco: `sos_responder_orcamento` confere se ainda há
 * orçamento pendente e se a assinatura é deste chamado. Se o mecânico mudou
 * os itens depois de enviar (`orcamento_desatualizado`), a aprovação espera o
 * reenvio — ninguém assina um total que já não é o da tela.
 */

const MOTIVOS_RECUSA = ['Valor acima do esperado', 'Não quero algum dos itens', 'Quero falar com a Tecnoar antes', 'Vou resolver de outro jeito', 'Outro motivo']

type Chamado = DetalheChamado['chamado']

function totalItens(itens: ItemSOS[]): number {
  return itens.reduce((s, i) => s + Number(i.valor_total ?? 0), 0)
}

/** Motivo da recusa que o cliente escreveu (fica no evento, não no recado do mecânico). */
function motivoRecusa(d: DetalheChamado): string | null {
  const e = [...d.eventos].reverse().find((x) => x.tipo === 'orcamento' && /recusado/i.test(x.titulo))
  return e?.descricao?.trim() || null
}

function enviadoPor(d: DetalheChamado): string | null {
  const e = [...d.eventos].reverse().find((x) => x.tipo === 'orcamento' && /enviado/i.test(x.titulo))
  return e?.autor_nome ?? d.mecanico?.nome ?? null
}

/* ── cartão na folha do chamado ─────────────────────────────────────────── */

export function CartaoOrcamento({ detalhe: d, aoAbrir }: { detalhe: DetalheChamado; aoAbrir: () => void }) {
  const c = d.chamado
  const st = c.orcamento_status
  if (!st) return null
  const total = c.orcamento_valor ?? totalItens(d.itens)

  if (st === 'pendente') {
    const n = d.itens.length
    return (
      <section aria-label="Orçamento para aprovar" className="overflow-hidden rounded-[1.25rem] border-2 border-accent bg-surface shadow-[0_14px_32px_-22px_rgb(252_100_0/0.7)]">
        <div className="flex flex-col gap-3.5 p-4">
          <div className="flex items-start gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Receipt className="size-6" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-accent-ink">
                <span className="sos-piscar size-2 rounded-full bg-accent" aria-hidden /> Aguardando sua resposta
              </p>
              <p className="mt-0.5 font-display text-[18px] leading-tight font-bold text-ink">Orçamento para aprovar</p>
              <p className="mt-0.5 text-[12.5px] text-ink-3">
                {n} ite{n === 1 ? 'm' : 'ns'}
                {c.orcamento_enviado_em ? ` · enviado às ${horaCurta(c.orcamento_enviado_em)}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-ink-3">Total</p>
              <p className="num font-display text-[30px] leading-none font-black tracking-tight text-ink">{moeda(total)}</p>
            </div>
            {d.itens.some((i) => i.origem === 'deslocamento') && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-cyan-soft px-2.5 py-1 text-[11.5px] font-semibold text-cyan-ink">
                <Route className="size-3.5" /> com deslocamento
              </span>
            )}
          </div>
          {c.orcamento_desatualizado && (
            <Faixa tom="atencao" icone={AlertTriangle}>
              O mecânico mudou os itens depois de enviar. Aguarde o orçamento atualizado.
            </Faixa>
          )}
          <BotaoApp tamanho="lg" largo icone={FileText} onClick={aoAbrir}>
            Ver itens e responder
          </BotaoApp>
        </div>
      </section>
    )
  }

  const aprovado = st === 'aprovado'
  const motivo = aprovado ? null : motivoRecusa(d)
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className={cn(
        'flex w-full items-start gap-3 rounded-[1.25rem] border bg-surface p-4 text-left transition-transform active:scale-[0.99]',
        aprovado ? 'border-ok/35' : 'border-line',
      )}
    >
      <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-2xl', aprovado ? 'bg-ok text-white' : 'bg-surface-2 text-ink-2')}>
        {aprovado ? <BadgeCheck className="size-6" /> : <CircleSlash className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[15.5px] leading-tight font-bold text-ink">{aprovado ? 'Orçamento aprovado' : 'Orçamento recusado'}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">
          <span className="num font-semibold text-ink">{moeda(total)}</span>
          {c.orcamento_respondido_em ? ` · ${dataHoraCurta(c.orcamento_respondido_em)}` : ''}
          {aprovado ? (c.orcamento_assinatura ? ' · assinado por você' : ' · registrado pela Tecnoar') : ''}
        </span>
        {motivo && <span className="mt-1 block truncate text-[12.5px] text-ink-3">Motivo: {motivo}</span>}
        {c.orcamento_desatualizado && (
          <span className="mt-1.5 block text-[12px] leading-snug font-semibold text-warn-ink">Os itens mudaram depois da resposta. O mecânico pode enviar um orçamento novo.</span>
        )}
      </span>
      <ChevronRight className="mt-1 size-5 shrink-0 text-ink-3" />
    </button>
  )
}

/* ── folha com os detalhes e a resposta ─────────────────────────────────── */

type Etapa = 'detalhes' | 'assinar' | 'recusar'

export function FolhaOrcamento({ detalhe: d, aberta, aoFechar }: { detalhe: DetalheChamado; aberta: boolean; aoFechar: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const online = useOnline()
  const c = d.chamado
  const [etapa, setEtapa] = useState<Etapa>('detalhes')
  const [motivo, setMotivo] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  // Assinatura já no bucket: se a aprovação falhar (rede), tentar de novo não
  // sobe outro arquivo — a menos que a pessoa mexa no desenho.
  const assinaturaEnviada = useRef<string | null>(null)
  const travado = useRef(false)

  useEffect(() => {
    if (!aberta) return
    setEtapa('detalhes')
    setMotivo(null)
    setTexto('')
  }, [aberta])

  const pendente = c.orcamento_status === 'pendente'
  // Respondido em outro lugar (central por telefone, outro aparelho) enquanto a
  // folha estava aberta: a assinatura/recusa não tem mais o que responder.
  useEffect(() => {
    if (!pendente && etapa !== 'detalhes') setEtapa('detalhes')
  }, [pendente, etapa])

  function atualizar(novo: ChamadoSOS) {
    qc.setQueryData<DetalheChamado>(CHAVES_SOS.detalhe(c.id), (antigo) => (antigo ? { ...antigo, chamado: { ...antigo.chamado, ...novo } } : antigo))
    void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(c.id) })
  }

  const aprovar = useMutation({
    mutationFn: async (png: Blob) => {
      let caminho = assinaturaEnviada.current
      if (!caminho) {
        const r = await sosEnviarAnexo(c.id, png, { tipo: 'assinatura', etapa: 'outro', legenda: 'Assinatura do orçamento' })
        caminho = r.caminho
        assinaturaEnviada.current = caminho
      }
      return sosResponderOrcamento(c.id, true, { assinatura: caminho })
    },
    onSuccess: (novo) => {
      assinaturaEnviada.current = null
      atualizar(novo)
      toast.ok('Orçamento aprovado', 'O mecânico já foi avisado e pode seguir com o serviço.')
      aoFechar()
    },
    onSettled: () => (travado.current = false),
  })

  const final = motivo === 'Outro motivo' ? texto.trim() : [motivo, texto.trim()].filter(Boolean).join(' — ')
  const recusar = useMutation({
    mutationFn: () => sosResponderOrcamento(c.id, false, { observacao: final || null }),
    onSuccess: (novo) => {
      atualizar(novo)
      toast.ok('Orçamento recusado', 'O mecânico e a Tecnoar foram avisados.')
      aoFechar()
    },
    onSettled: () => (travado.current = false),
  })

  function confirmarAssinatura(png: Blob) {
    if (travado.current) return
    travado.current = true
    aprovar.mutate(png)
  }

  function confirmarRecusa() {
    if (travado.current) return
    travado.current = true
    recusar.mutate()
  }

  const total = c.orcamento_valor ?? totalItens(d.itens)
  const soma = totalItens(d.itens)
  const cancelado = c.status === 'cancelado'
  const podeResponder = pendente && !cancelado
  const bloqueio = !podeResponder
    ? null
    : c.orcamento_desatualizado
      ? 'A aprovação volta assim que o orçamento atualizado chegar.'
      : !online
        ? 'Sem internet. A resposta precisa de conexão para chegar ao mecânico.'
        : null

  const ocupado = aprovar.isPending || recusar.isPending

  return (
    <>
      <Folha
        aberta={aberta && etapa !== 'assinar'}
        aoFechar={() => (ocupado ? undefined : aoFechar())}
        titulo={etapa === 'recusar' ? 'Recusar o orçamento?' : 'Orçamento do atendimento'}
        descricao={
          etapa === 'recusar'
            ? 'O mecânico e a Tecnoar recebem sua resposta na hora. Se quiser, conte o motivo.'
            : podeResponder
              ? 'Confira os itens e responda. O mecânico aguarda sua resposta para seguir.'
              : subtituloResposta(c)
        }
        rodape={
          etapa === 'recusar' ? (
            <>
              {recusar.isError && <Faixa tom="critico">{(recusar.error as Error).message}</Faixa>}
              <BotaoApp variante="perigo" tamanho="lg" largo icone={CircleSlash} carregando={recusar.isPending} disabled={!online} onClick={confirmarRecusa}>
                Recusar orçamento
              </BotaoApp>
              <BotaoApp variante="fantasma" largo disabled={recusar.isPending} onClick={() => setEtapa('detalhes')}>
                Voltar aos itens
              </BotaoApp>
            </>
          ) : podeResponder ? (
            <>
              {bloqueio && <p className="text-center text-[12.5px] leading-snug font-medium text-warn-ink">{bloqueio}</p>}
              <BotaoApp tamanho="lg" largo icone={PenLine} disabled={!!bloqueio} onClick={() => setEtapa('assinar')}>
                Aprovar e assinar
              </BotaoApp>
              <BotaoApp variante="fantasma" largo disabled={!online} onClick={() => setEtapa('recusar')} className="text-crit-ink">
                Recusar
              </BotaoApp>
            </>
          ) : (
            <BotaoApp variante="neutro" largo onClick={aoFechar}>
              Fechar
            </BotaoApp>
          )
        }
      >
        {etapa === 'recusar' ? (
          <div className="flex flex-col gap-2 pb-2">
            <div className="sos-chip mb-1 flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
              <span className="text-[13px] font-semibold text-ink-2">Total do orçamento</span>
              <span className="num text-[17px] font-bold text-ink">{moeda(total)}</span>
            </div>
            {MOTIVOS_RECUSA.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={motivo === m}
                onClick={() => setMotivo((atual) => (atual === m ? null : m))}
                className={cn(
                  'flex min-h-12 items-center rounded-xl border px-4 text-left text-[15px] font-medium transition-colors',
                  motivo === m ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line-strong text-ink',
                )}
              >
                {m}
              </button>
            ))}
            <AreaApp
              rotulo={motivo === 'Outro motivo' ? 'Qual o motivo? (opcional)' : 'Quer explicar melhor? (opcional)'}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={300}
              rows={2}
              className="mt-2"
            />
          </div>
        ) : (
          <ConteudoOrcamento detalhe={d} total={total} soma={soma} />
        )}
      </Folha>

      <TelaAssinatura
        aberta={aberta && etapa === 'assinar'}
        descricao={`Ao assinar, você aprova ${d.itens.length} ite${d.itens.length === 1 ? 'm' : 'ns'} no total de ${moeda(total)}.`}
        resumo={
          <div className="sos-chip flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold text-ink-3">{c.protocolo}</span>
              <span className="block truncate text-[13px] text-ink-2">{d.mecanico?.nome ? `Mecânico: ${d.mecanico.nome}` : 'Atendimento Tecnoar'}</span>
            </span>
            <span className="num shrink-0 font-display text-[22px] font-black text-ink">{moeda(total)}</span>
          </div>
        }
        rotuloConfirmar="Assinar e aprovar"
        enviando={aprovar.isPending}
        erro={aprovar.isError ? (aprovar.error as Error).message : null}
        aoAlterar={() => {
          assinaturaEnviada.current = null
          if (aprovar.isError) aprovar.reset()
        }}
        aoConfirmar={confirmarAssinatura}
        aoFechar={() => {
          if (aprovar.isPending) return
          aprovar.reset()
          setEtapa('detalhes')
        }}
      />
    </>
  )
}

function subtituloResposta(c: Chamado): string {
  if (c.orcamento_status === 'aprovado')
    return `Aprovado${c.orcamento_respondido_em ? ` em ${dataHoraCurta(c.orcamento_respondido_em)}` : ''}${c.orcamento_assinatura ? ', com a sua assinatura.' : ' (registrado pela Tecnoar).'}`
  if (c.orcamento_status === 'recusado') return `Recusado${c.orcamento_respondido_em ? ` em ${dataHoraCurta(c.orcamento_respondido_em)}` : ''}.`
  return 'Este chamado foi cancelado.'
}

function ConteudoOrcamento({ detalhe: d, total, soma }: { detalhe: DetalheChamado; total: number; soma: number }) {
  const c = d.chamado
  const deslocamento = d.itens.filter((i) => i.origem === 'deslocamento')
  const itens = d.itens.filter((i) => i.origem !== 'deslocamento')
  const nota = c.orcamento_status === 'recusado' ? null : c.orcamento_observacao?.trim()
  const motivo = c.orcamento_status === 'recusado' ? motivoRecusa(d) : null
  const autor = enviadoPor(d)
  const diferenca = Math.abs(soma - total) > 0.009

  return (
    <div className="flex flex-col gap-4 pb-2">
      <div className="flex flex-col gap-1 rounded-[1.25rem] border border-line bg-surface-2 p-4 text-ink">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12.5px] font-medium text-ink-3">Total do orçamento</p>
          <EstadoSelo chamado={c} />
        </div>
        <p className="num font-display text-[32px] leading-none font-black tracking-tight">{moeda(total)}</p>
        <p className="mt-1 flex flex-wrap gap-x-1.5 text-[12px] text-ink-3">
          <span className="whitespace-nowrap">{c.protocolo}</span>
          {c.orcamento_enviado_em && <span className="whitespace-nowrap">· enviado {dataHoraCurta(c.orcamento_enviado_em)}</span>}
        </p>
      </div>

      {c.orcamento_desatualizado && (
        <Faixa tom="atencao" icone={AlertTriangle}>
          {c.orcamento_status === 'pendente'
            ? `Os itens mudaram depois do envio${diferenca ? `: agora somam ${moeda(soma)}` : ''}. O mecânico precisa reenviar o orçamento.`
            : `Os itens mudaram depois da sua resposta${diferenca ? ` e agora somam ${moeda(soma)}` : ''}. O mecânico pode enviar um orçamento novo.`}
        </Faixa>
      )}

      {nota && (
        <div className="flex items-start gap-3">
          <Avatar nome={autor ?? 'Mecânico'} url={autor === d.mecanico?.nome ? d.mecanico?.avatar_url : null} tamanho="sm" />
          <div className="sos-chip min-w-0 flex-1 rounded-2xl rounded-tl-md px-3.5 py-2.5">
            <p className="text-[11.5px] font-semibold text-ink-3">{autor ? `${autor.split(' ')[0]} · recado do mecânico` : 'Recado do mecânico'}</p>
            <p className="mt-0.5 text-[14px] leading-relaxed whitespace-pre-line text-ink">{nota}</p>
          </div>
        </div>
      )}
      {motivo && (
        <div className="sos-chip rounded-2xl px-3.5 py-2.5">
          <p className="text-[11.5px] font-semibold text-ink-3">Motivo que você deu</p>
          <p className="mt-0.5 text-[14px] leading-relaxed text-ink">{motivo}</p>
        </div>
      )}

      {itens.length > 0 && (
        <section aria-label="Serviços e peças">
          <h3 className="mb-2 px-1 font-display text-[14.5px] font-bold text-ink">Serviços e peças</h3>
          <ul className="sos-card divide-y divide-line overflow-hidden rounded-[1.2rem]">
            {itens.map((i) => (
              <LinhaItem key={i.id} item={i} />
            ))}
          </ul>
        </section>
      )}

      {deslocamento.length > 0 && (
        <section aria-label="Deslocamento">
          <h3 className="mb-2 px-1 font-display text-[14.5px] font-bold text-ink">Deslocamento</h3>
          <ul className="sos-card divide-y divide-line overflow-hidden rounded-[1.2rem]">
            {deslocamento.map((i) => (
              <LinhaItem key={i.id} item={i} />
            ))}
          </ul>
          <p className="mt-1.5 px-1 text-[12px] leading-snug text-ink-3">Calculada pela distância percorrida até o seu veículo, lançada automaticamente na chegada do mecânico.</p>
        </section>
      )}

      {d.itens.length === 0 && <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-ink-3">Nenhum item no orçamento.</p>}

      <dl className="sos-chip flex flex-col gap-1.5 rounded-2xl px-4 py-3">
        {deslocamento.length > 0 && itens.length > 0 && (
          <>
            <Linha rotulo="Serviços e peças" valor={moeda(totalItens(itens))} />
            <Linha rotulo="Deslocamento" valor={moeda(totalItens(deslocamento))} />
          </>
        )}
        <div className="flex items-baseline justify-between gap-3 pt-0.5">
          <dt className="font-display text-[15px] font-bold text-ink">Total</dt>
          <dd className="num font-display text-[19px] font-black text-ink">{moeda(total)}</dd>
        </div>
      </dl>

      {c.orcamento_status === 'pendente' && (
        <p className="px-1 text-[12px] leading-snug text-ink-3">
          Ao aprovar, você assina com o dedo na tela. A assinatura fica registrada no chamado e no laudo do atendimento. O pagamento é combinado com a Tecnoar.
        </p>
      )}
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13.5px]">
      <dt className="text-ink-2">{rotulo}</dt>
      <dd className="num font-semibold text-ink">{valor}</dd>
    </div>
  )
}

function LinhaItem({ item: i }: { item: ItemSOS }) {
  const desloc = i.origem === 'deslocamento'
  const Icone = desloc ? Route : i.tipo === 'servico' ? Wrench : Package
  const qtd = Number(i.quantidade).toLocaleString('pt-BR', { maximumFractionDigits: 3 })
  return (
    <li className="flex items-start gap-3 px-3.5 py-3">
      <span
        className={cn(
          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl',
          desloc ? 'bg-cyan-soft text-cyan-ink' : i.tipo === 'servico' ? 'bg-cyan-soft text-cyan-ink' : 'bg-accent-soft text-accent-ink',
        )}
      >
        <Icone className="size-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[14px] leading-snug font-medium text-ink">{i.descricao}</p>
        <p className="num mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-ink-3">
          <span>
            {qtd}
            {i.unidade ? ` ${i.unidade}` : ''} × {moeda(i.valor_unitario)}
          </span>
          {Number(i.desconto) > 0 && <span className="text-ok-ink">· desconto {moeda(i.desconto)}</span>}
          {desloc && <span className="rounded-full bg-cyan-soft px-2 py-px font-sans text-[10.5px] font-bold text-cyan-ink">Taxa de deslocamento</span>}
        </p>
      </div>
      <span className="num shrink-0 pt-0.5 text-right text-[14px] font-bold text-ink">{moeda(i.valor_total)}</span>
    </li>
  )
}

function EstadoSelo({ chamado: c }: { chamado: Chamado }) {
  const st = c.orcamento_status
  const [rotulo, classe] =
    st === 'aprovado'
      ? ['Aprovado', 'bg-ok text-white']
      : st === 'recusado'
        ? ['Recusado', 'border border-line bg-surface text-ink-2']
        : ['Aguardando você', 'bg-accent-soft text-accent-ink']
  return <span className={cn('shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold', classe)}>{rotulo}</span>
}
