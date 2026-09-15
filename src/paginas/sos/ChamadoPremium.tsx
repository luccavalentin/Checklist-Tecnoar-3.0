import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardPen,
  FileDown,
  Handshake,
  Loader2,
  Package,
  PhoneCall,
  RefreshCw,
  Send,
  ShieldAlert,
  Brain,
  Timer,
  Wrench,
  XCircle,
} from 'lucide-react'
import { cn, mensagemErro } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { Aviso } from '@/componentes/ui/Aviso'
import { Botao } from '@/componentes/ui/Botao'
import { AreaTexto, Campo } from '@/componentes/ui/Campo'
import { Selo, type TomSelo } from '@/componentes/ui/Selo'
import { Confirmacao, Modal } from '@/componentes/ui/Sobreposicoes'
import { useToast } from '@/componentes/ui/Toast'
import { ErroIa, sosEnviarOrcamento, sosIaFoto, sosIaKit, sosIaResumo, sosResponderOrcamento, sosSalvarAtendimento, sosUrlsArquivos } from '@/sos/api'
import { baixarLaudoSOS } from '@/sos/laudo'
import { Bloco } from '@/sos/componentes'
import { CHAVES_SOS } from '@/sos/tempoReal'
import { dataHoraCurta, horaCurta, ordemStatus } from '@/sos/rotulos'
import type { AnexoSOS, DetalheChamado, IaKit, IaResumo, StatusOrcamento } from '@/sos/tipos'
import { cronometro, invalidarSOS, segundosDesde, useAgora } from './comum'

/**
 * Atendimento premium no painel do chamado: orçamento aprovado pelo app,
 * prazo de contrato, laudo em PDF e a IA (kit, resumo para a OS e leitura
 * de fotos). Cada peça some sozinha quando não se aplica — a IA desligada,
 * o chamado sem contrato, o mecânico ainda a caminho.
 */

type Chamado = DetalheChamado['chamado']

/** A partir da chegada existe atendimento para documentar e cobrar. */
export function jaChegou(c: Pick<Chamado, 'status' | 'chegou_em'>): boolean {
  return !!c.chegou_em || ordemStatus(c.status) >= ordemStatus('no_local')
}

function erroDaIa(e: unknown): { texto: string; tom: 'atencao' | 'critico' } {
  if (e instanceof ErroIa) return { texto: e.message, tom: e.status === 'desligada' || e.status === 'sem_chave' || e.status === 'limite' ? 'atencao' : 'critico' }
  return { texto: mensagemErro(e), tom: 'critico' }
}

/* ── prazo de contrato ──────────────────────────────────────────────────── */

/**
 * "Contrato: chegada em até 60 min" com a contagem regressiva até a
 * chegada. Estourado, fica vermelho e pisca: é a cobrança que o frotista
 * vai fazer, a central precisa ver antes dele.
 */
export function SeloContrato({ chamado: c, className }: { chamado: Chamado; className?: string }) {
  const correndo = !!c.sla_chegada_min && !c.chegou_em && c.status !== 'cancelado' && c.status !== 'concluido' && c.status !== 'servico_finalizado'
  const agora = useAgora(correndo ? 1000 : 60_000)
  if (!c.contrato_id) return null

  const prazo = c.sla_chegada_min
  const base = (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-cyan-soft px-2 py-1 text-cyan-ink ring-1 ring-cyan/25 ring-inset">
      <Handshake aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{prazo ? `Contrato: chegada em até ${prazo} min` : 'Cliente com contrato'}</span>
    </span>
  )
  if (!prazo) return <span className={cn('flex max-w-full text-[11.5px] font-semibold', className)}>{base}</span>

  const limite = Date.parse(c.recebido_em) + prazo * 60_000
  let tom: 'ok' | 'atencao' | 'critico' | 'neutro' = 'neutro'
  let texto: string
  if (c.chegou_em) {
    const levou = Math.round((Date.parse(c.chegou_em) - Date.parse(c.recebido_em)) / 60_000)
    const noPrazo = Date.parse(c.chegou_em) <= limite
    tom = noPrazo ? 'ok' : 'critico'
    texto = noPrazo ? `chegou em ${levou} min · no prazo` : `chegou em ${levou} min · +${levou - prazo} min`
  } else if (!correndo) {
    texto = 'sem chegada'
  } else {
    const restante = Math.round((limite - agora) / 1000)
    if (restante > 0) {
      tom = restante <= 10 * 60 ? 'atencao' : 'ok'
      texto = `faltam ${cronometro(restante)}`
    } else {
      tom = 'critico'
      texto = `Prazo estourado há ${cronometro(segundosDesde(new Date(limite).toISOString(), agora))}`
    }
  }
  const cores = {
    ok: 'bg-ok text-white',
    atencao: 'bg-warn text-white',
    critico: 'bg-crit text-white',
    neutro: 'bg-ink-3/15 text-ink-2',
  }[tom]
  return (
    <span
      className={cn('flex max-w-full flex-wrap items-center gap-1.5 text-[11.5px] font-semibold', className)}
      title={c.sla_avisado_em ? `O vigia avisou a central às ${horaCurta(c.sla_avisado_em)}.` : undefined}
    >
      {base}
      <span className={cn('num inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1', cores)}>
        {tom === 'critico' && correndo && <span aria-hidden className="sos-piscar size-1.5 rounded-full bg-white" />}
        {!c.chegou_em && correndo && tom !== 'critico' && <Timer aria-hidden className="size-3" />}
        {texto}
      </span>
      {c.sla_avisado_em && tom === 'critico' && <span className="font-medium text-ink-3">central avisada {horaCurta(c.sla_avisado_em)}</span>}
    </span>
  )
}

/* ── laudo ──────────────────────────────────────────────────────────────── */

/** PDF do atendimento (fotos, itens, assinatura, avaliação) — a partir da chegada. */
export function BotaoLaudo({ chamado: c, className }: { chamado: Chamado; className?: string }) {
  const toast = useToast()
  const laudo = useMutation({
    mutationFn: () => baixarLaudoSOS(c.id),
    onSuccess: () => toast.ok('Laudo gerado', `${c.protocolo} — o PDF foi baixado.`),
    onError: (e) => toast.erro('Não foi possível gerar o laudo', mensagemErro(e)),
  })
  if (!jaChegou(c)) return null
  return (
    <Botao variante="neutro" iconeInicio={<FileDown />} carregando={laudo.isPending} onClick={() => laudo.mutate()} className={className}>
      {laudo.isPending ? 'Gerando laudo…' : 'Laudo (PDF)'}
    </Botao>
  )
}

/* ── orçamento ──────────────────────────────────────────────────────────── */

const SITUACAO_ORCAMENTO: Record<StatusOrcamento, { rotulo: string; tom: TomSelo }> = {
  pendente: { rotulo: 'Aguardando o cliente', tom: 'atencao' },
  aprovado: { rotulo: 'Aprovado', tom: 'ok' },
  recusado: { rotulo: 'Recusado', tom: 'critico' },
}

const PODE_ENVIAR: Chamado['status'][] = ['no_local', 'servico_iniciado']

/**
 * O orçamento que o cliente aprova no app. A central acompanha o que foi
 * enviado e respondido e, quando o cliente responde por telefone, registra a
 * resposta — sempre dizendo como foi, porque não há assinatura.
 */
export function BlocoOrcamento({ d, podeEditar, exigirAprovacao }: { d: DetalheChamado; podeEditar: boolean; exigirAprovacao: boolean }) {
  const c = d.chamado
  const [enviando, setEnviando] = useState(false)
  const [respondendo, setRespondendo] = useState(false)
  const status = c.orcamento_status ?? null
  const podeEnviar = PODE_ENVIAR.includes(c.status)
  const encerrado = c.status === 'concluido' || c.status === 'cancelado'
  const total = d.itens.reduce((s, i) => s + Number(i.valor_total ?? 0), 0)

  const assinatura = useQuery({
    queryKey: ['sos', 'urls', c.id, 'orcamento', c.orcamento_assinatura ?? ''],
    enabled: !!c.orcamento_assinatura,
    staleTime: 50 * 60_000,
    queryFn: () => sosUrlsArquivos([c.orcamento_assinatura!]),
  })
  const urlAssinatura = c.orcamento_assinatura ? assinatura.data?.[c.orcamento_assinatura] : undefined

  if (!status && !podeEnviar) return null

  return (
    <Bloco
      titulo="Orçamento"
      acao={status ? <Selo tom={SITUACAO_ORCAMENTO[status].tom} ponto>{SITUACAO_ORCAMENTO[status].rotulo}</Selo> : <Selo tom="neutro">Não enviado</Selo>}
    >
      {status ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div>
              <p className="text-[11.5px] text-ink-3">Valor enviado</p>
              <p className="num text-[22px] leading-tight font-semibold text-ink">{moeda(c.orcamento_valor ?? 0)}</p>
            </div>
            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
              <div>
                <dt className="text-ink-3">Enviado</dt>
                <dd className="num font-medium text-ink">{dataHoraCurta(c.orcamento_enviado_em)}</dd>
              </div>
              <div>
                <dt className="text-ink-3">{status === 'recusado' ? 'Recusado' : 'Respondido'}</dt>
                <dd className="num font-medium text-ink">{c.orcamento_respondido_em ? dataHoraCurta(c.orcamento_respondido_em) : 'aguardando'}</dd>
              </div>
            </dl>
          </div>

          {c.orcamento_desatualizado && (
            <Aviso tom="atencao" titulo="Orçamento desatualizado">
              Os itens mudaram depois do envio{Math.abs(total - Number(c.orcamento_valor ?? 0)) > 0.004 ? ` — o total agora é ${moeda(total)}` : ''}. Reenvie para o cliente aprovar o valor novo.
            </Aviso>
          )}

          {c.orcamento_observacao && (
            <p className="rounded-lg bg-surface-2 px-3 py-2 text-[13px] leading-relaxed whitespace-pre-line text-ink-2">
              <span className="lbl mb-0.5 block">Observação</span>
              {c.orcamento_observacao}
            </p>
          )}

          {c.orcamento_assinatura && (
            <div className="flex flex-col gap-1.5">
              <span className="lbl">Assinatura do cliente</span>
              {/* Traço escuro sobre fundo transparente: o fundo fica branco nos dois temas. */}
              <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg border border-line bg-white p-2">
                {urlAssinatura ? (
                  <img src={urlAssinatura} alt="Assinatura do cliente aprovando o orçamento" className="max-h-full max-w-full object-contain" />
                ) : assinatura.isError ? (
                  <span className="text-[12px] text-crit-ink">Não foi possível abrir a assinatura.</span>
                ) : (
                  <Loader2 aria-hidden className="size-5 animate-spin text-[#71829b]" />
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[13px] leading-relaxed text-ink-3">
          {d.itens.length
            ? `Itens lançados: ${d.itens.length} · ${moeda(total)}. O mecânico envia pelo app — ou a central, daqui.`
            : 'Com o mecânico no local, os itens lançados viram o orçamento que o cliente aprova no app.'}
        </p>
      )}

      {exigirAprovacao && status !== 'aprovado' && !encerrado && c.status === 'no_local' && (
        <p className="flex items-start gap-2 rounded-lg border border-warn/35 bg-warn-soft px-3 py-2 text-[12.5px] leading-snug text-warn-ink">
          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          O serviço só pode começar com o orçamento aprovado (regra ligada nas configurações).
        </p>
      )}

      {podeEditar && !encerrado && (podeEnviar || status === 'pendente') && (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {podeEnviar && (
            <Botao
              variante={status && !c.orcamento_desatualizado && status !== 'recusado' ? 'neutro' : 'primario'}
              iconeInicio={<Send />}
              disabled={!d.itens.length}
              title={!d.itens.length ? 'Lance os itens antes de enviar o orçamento' : undefined}
              onClick={() => setEnviando(true)}
              className="w-full max-lg:h-11 sm:w-auto"
            >
              {status ? 'Reenviar orçamento' : 'Enviar orçamento'}
            </Botao>
          )}
          {status === 'pendente' && (
            <Botao variante="secundario" iconeInicio={<PhoneCall />} onClick={() => setRespondendo(true)} className="w-full max-lg:h-11 sm:w-auto">
              <span className="sm:hidden">Resposta por telefone</span>
              <span className="hidden sm:inline">Registrar resposta por telefone</span>
            </Botao>
          )}
        </div>
      )}

      <ModalEnviarOrcamento aberto={enviando} aoFechar={() => setEnviando(false)} d={d} total={total} />
      <ModalRespostaOrcamento aberto={respondendo} aoFechar={() => setRespondendo(false)} chamado={c} />
    </Bloco>
  )
}

function ModalEnviarOrcamento({ aberto, aoFechar, d, total }: { aberto: boolean; aoFechar: () => void; d: DetalheChamado; total: number }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [obs, setObs] = useState('')
  useEffect(() => {
    if (aberto) setObs('')
  }, [aberto])

  const enviar = useMutation({
    mutationFn: () => sosEnviarOrcamento(d.chamado.id, obs.trim() || null),
    onSuccess: () => {
      toast.ok('Orçamento enviado', 'O cliente recebeu o aviso no app para aprovar assinando.')
      invalidarSOS(qc, d.chamado.id)
      aoFechar()
    },
    onError: (e) => toast.erro('Não foi possível enviar o orçamento', mensagemErro(e)),
  })

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={d.chamado.orcamento_status ? 'Reenviar orçamento' : 'Enviar orçamento ao cliente'}
      descricao="O cliente recebe um aviso no app, vê os itens e o total, e aprova assinando na tela — ou recusa."
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar} disabled={enviar.isPending}>
            Voltar
          </Botao>
          <Botao variante="primario" iconeInicio={<Send />} carregando={enviar.isPending} onClick={() => enviar.mutate()}>
            Enviar {moeda(total)}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {d.itens.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md', i.tipo === 'servico' ? 'bg-cyan-soft text-cyan-ink' : 'bg-accent-soft text-accent-ink')}>
                {i.tipo === 'servico' ? <Wrench aria-hidden className="size-3.5" /> : <Package aria-hidden className="size-3.5" />}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                <span className="num text-ink-3">{Number(i.quantidade).toLocaleString('pt-BR')} × </span>
                {i.descricao}
              </span>
              <span className="num shrink-0 text-[13px] font-semibold text-ink">{moeda(i.valor_total)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between bg-surface-2 px-3.5 py-2.5">
            <span className="lbl">Total</span>
            <span className="num text-[15px] font-bold text-ink">{moeda(total)}</span>
          </li>
        </ul>
        <Campo rotulo="Observação para o cliente" dica="Opcional. Ex.: peça sob encomenda chega em 2 h; valor sem a mão de obra da retífica.">
          {(p) => <AreaTexto {...p} rows={3} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} />}
        </Campo>
      </div>
    </Modal>
  )
}

function ModalRespostaOrcamento({ aberto, aoFechar, chamado: c }: { aberto: boolean; aoFechar: () => void; chamado: Chamado }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [aprovado, setAprovado] = useState<boolean | null>(null)
  const [obs, setObs] = useState('')
  const [tentou, setTentou] = useState(false)
  useEffect(() => {
    if (!aberto) return
    setAprovado(null)
    setObs('')
    setTentou(false)
  }, [aberto])

  const faltaObs = obs.trim().length < 5
  const responder = useMutation({
    mutationFn: () => sosResponderOrcamento(c.id, aprovado!, { observacao: obs.trim() }),
    onSuccess: () => {
      toast.ok(aprovado ? 'Aprovação registrada' : 'Recusa registrada', 'O mecânico foi avisado no app.')
      invalidarSOS(qc, c.id)
      aoFechar()
    },
    onError: (e) => toast.erro('Não foi possível registrar a resposta', mensagemErro(e)),
  })

  return (
    <Modal
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Resposta do cliente por telefone"
      descricao={`Orçamento de ${moeda(c.orcamento_valor ?? 0)}. Fica registrado na linha do tempo como resposta dada à central.`}
      rodape={
        <>
          <Botao variante="neutro" onClick={aoFechar} disabled={responder.isPending}>
            Voltar
          </Botao>
          <Botao
            variante={aprovado === false ? 'destrutivo' : 'primario'}
            iconeInicio={aprovado === false ? <XCircle /> : <CheckCircle2 />}
            carregando={responder.isPending}
            disabled={aprovado === null}
            onClick={() => {
              setTentou(true)
              if (!faltaObs) responder.mutate()
            }}
          >
            {aprovado === false ? 'Registrar recusa' : 'Registrar aprovação'}
          </Botao>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Resposta do cliente" className="grid grid-cols-2 gap-2">
          {([
            [true, 'Aprovou', CheckCircle2, 'border-ok bg-ok-soft text-ok-ink ring-1 ring-ok/30'],
            [false, 'Recusou', XCircle, 'border-crit bg-crit-soft text-crit-ink ring-1 ring-crit/30'],
          ] as const).map(([v, rotulo, Icone, ativoCls]) => (
            <button
              key={rotulo}
              type="button"
              role="radio"
              aria-checked={aprovado === v}
              onClick={() => setAprovado(v)}
              className={cn(
                'flex min-h-14 items-center justify-center gap-2 rounded-xl border text-[14px] font-semibold transition-colors',
                aprovado === v ? ativoCls : 'border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink',
              )}
            >
              <Icone aria-hidden className="size-5" /> {rotulo}
            </button>
          ))}
        </div>
        <Campo
          rotulo="Como foi a resposta"
          obrigatorio
          erro={tentou && faltaObs ? 'Conte como o cliente respondeu — quem, por onde e quando.' : undefined}
          dica="Ex.: aprovado por telefone com o João (gestor da frota) às 14h20."
        >
          {(p) => <AreaTexto {...p} rows={3} maxLength={500} value={obs} onChange={(e) => setObs(e.target.value)} />}
        </Campo>
      </div>
    </Modal>
  )
}

/* ── IA: kit sugerido ───────────────────────────────────────────────────── */

/**
 * Kit que a IA sugere levar: hipóteses, ferramentas, cuidados e as peças já
 * conferidas no catálogo do Checklist, com preço e estoque de agora.
 */
export function BlocoKitIA({ chamado: c, podeGerar }: { chamado: Chamado; podeGerar: boolean }) {
  const qc = useQueryClient()
  const kit = c.ia_kit ?? null
  const gerar = useMutation({
    mutationFn: () => sosIaKit(c.id),
    onSuccess: (r) => {
      qc.setQueryData<DetalheChamado>(CHAVES_SOS.detalhe(c.id), (d) => (d ? { ...d, chamado: { ...d.chamado, ia_kit: r.kit } } : d))
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(c.id) })
    },
  })
  const erro = gerar.isError ? erroDaIa(gerar.error) : null

  return (
    <Bloco
      titulo="Kit sugerido pela IA"
      className="border-accent/25"
      acao={
        podeGerar && kit ? (
          <Botao tamanho="sm" variante="fantasma" iconeInicio={<RefreshCw />} carregando={gerar.isPending} onClick={() => gerar.mutate()} className="max-lg:h-11">
            Atualizar
          </Botao>
        ) : undefined
      }
    >
      {erro && <Aviso tom={erro.tom}>{erro.texto}</Aviso>}
      {kit ? (
        <ConteudoKit kit={kit} />
      ) : gerar.isPending ? (
        <p className="flex items-center gap-2 py-2 text-[13px] text-ink-3">
          <Loader2 aria-hidden className="size-4 animate-spin" /> A IA está montando o kit com o histórico do veículo e o catálogo…
        </p>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[13px] leading-relaxed text-ink-3">
            Hipóteses para o problema relatado, ferramentas, cuidados e peças do catálogo (com preço e estoque) para o mecânico levar.
          </p>
          {podeGerar && (
            <Botao variante="secundario" iconeInicio={<Brain />} onClick={() => gerar.mutate()} className="max-lg:h-11 max-sm:w-full">
              Gerar kit com IA
            </Botao>
          )}
        </div>
      )}
    </Bloco>
  )
}

function ConteudoKit({ kit }: { kit: IaKit }) {
  return (
    <div className="flex flex-col gap-4">
      {kit.resumo && (
        <p className="flex gap-2.5 rounded-xl bg-accent-soft/60 px-3.5 py-3 text-[13.5px] leading-relaxed text-ink">
          <Brain aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>{kit.resumo}</span>
        </p>
      )}

      {kit.hipoteses.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="lbl">Hipóteses, da mais provável</span>
          <ol className="flex flex-col gap-1">
            {kit.hipoteses.map((h, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-snug text-ink-2">
                <span className="num flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-ink">{i + 1}</span>
                <span>{h}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {kit.pecas.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="lbl">Peças para levar</span>
          <ul className="flex flex-col gap-2">
            {kit.pecas.map((p, i) => (
              <li key={i} className="overflow-hidden rounded-xl border border-line">
                <div className="flex items-start gap-2.5 px-3.5 py-2.5">
                  <Package aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink first-letter:uppercase">{p.termo}</p>
                    {p.motivo && <p className="text-[12.5px] leading-snug text-ink-3">{p.motivo}</p>}
                  </div>
                </div>
                {p.itens.length ? (
                  <ul className="divide-y divide-line border-t border-line bg-surface-2/50">
                    {p.itens.map((it) => {
                      // Disponível (saldo − reservado − comprometido), não o saldo cru da Omie.
                      const saldo = it.disponivel == null ? null : Number(it.disponivel)
                      return (
                        <li key={it.id} className="flex items-start gap-3 px-3.5 py-2">
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 text-[12.5px] leading-snug text-ink">{it.descricao}</span>
                            <span className="num block truncate text-[11px] text-ink-3">{it.codigo ?? 'sem código'}</span>
                          </span>
                          {/* Preço e estoque empilhados: no celular o nome da peça precisa da largura. */}
                          <span className="flex shrink-0 flex-col items-end gap-0.5">
                            <span className="num text-[12.5px] font-semibold text-ink">{it.preco != null ? moeda(it.preco) : '—'}</span>
                            <span
                              className={cn(
                                'num rounded px-1.5 py-px text-[10.5px] font-semibold',
                                saldo == null ? 'text-ink-3' : saldo > 0 ? 'bg-ok-soft text-ok-ink' : 'bg-crit-soft text-crit-ink',
                              )}
                            >
                              {saldo == null ? 'estoque —' : saldo > 0 ? `${saldo.toLocaleString('pt-BR')} ${(it.unidade ?? 'un').toLowerCase()} disponível` : 'sem estoque'}
                            </span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="border-t border-line bg-surface-2/50 px-3.5 py-2 text-[12px] text-ink-3">Nada no catálogo para “{p.termo}”.</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {kit.ferramentas.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="lbl">Ferramentas</span>
          <ul className="flex flex-wrap gap-1.5">
            {kit.ferramentas.map((f, i) => (
              <li key={i} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] text-ink-2">
                <Wrench aria-hidden className="size-3 text-ink-3" />
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {kit.cuidados.length > 0 && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-warn/30 bg-warn-soft/60 px-3.5 py-3">
          <span className="lbl flex items-center gap-1.5 text-warn-ink">
            <ShieldAlert aria-hidden className="size-3.5" /> Cuidados de segurança
          </span>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-[12.5px] leading-snug text-ink-2 marker:text-warn">
            {kit.cuidados.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[11px] text-ink-3">
        Sugestão gerada {dataHoraCurta(kit.gerado_em)} · <span className="num">{kit.modelo}</span>. Confira antes de sair — a IA pode errar.
      </p>
    </div>
  )
}

/* ── IA: resumo para a OS ───────────────────────────────────────────────── */

function lerResumo(texto: string | null | undefined): IaResumo | null {
  if (!texto) return null
  try {
    const j = JSON.parse(texto) as Partial<IaResumo> | null
    if (!j || typeof j !== 'object') return null
    return { diagnostico: String(j.diagnostico ?? ''), servico_realizado: String(j.servico_realizado ?? ''), observacoes: String(j.observacoes ?? '') }
  } catch {
    return null
  }
}

/**
 * Registro técnico do atendimento (o que vai para a OS) com o rascunho da IA:
 * diagnóstico, serviço e observações escritos a partir da conversa, da linha
 * do tempo e dos itens. "Usar" grava no chamado — a OS leva junto.
 */
export function BlocoRegistroTecnico({ chamado: c, podeEditar, iaResumo }: { chamado: Chamado; podeEditar: boolean; iaResumo: boolean }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [confirmando, setConfirmando] = useState(false)
  const salvo = useMemo(() => lerResumo(c.ia_resumo), [c.ia_resumo])
  const gerar = useMutation({ mutationFn: () => sosIaResumo(c.id) })
  const sugestao = gerar.data?.resumo ?? salvo
  const erro = gerar.isError ? erroDaIa(gerar.error) : null

  const aberto = c.status !== 'concluido' && c.status !== 'cancelado'
  const podeGerar = podeEditar && iaResumo && aberto && jaChegou(c)
  const temRegistro = !!(c.diagnostico || c.servico_realizado || c.observacoes_finais || c.pecas_utilizadas)
  const emUso =
    !!sugestao &&
    (sugestao.diagnostico || null) === (c.diagnostico || null) &&
    (sugestao.servico_realizado || null) === (c.servico_realizado || null) &&
    (sugestao.observacoes || null) === (c.observacoes_finais || null)

  const usar = useMutation({
    mutationFn: (r: IaResumo) => sosSalvarAtendimento(c.id, { diagnostico: r.diagnostico, servico_realizado: r.servico_realizado, observacoes: r.observacoes }),
    onSuccess: () => {
      setConfirmando(false)
      toast.ok('Registro técnico atualizado', 'Diagnóstico, serviço e observações seguem para a OS.')
      invalidarSOS(qc, c.id)
    },
    onError: (e) => toast.erro('Não foi possível salvar o registro', mensagemErro(e)),
  })

  if (!temRegistro && !podeGerar) return null

  return (
    <Bloco titulo="Registro técnico (OS)">
      {temRegistro ? (
        <dl className="flex flex-col gap-3">
          {c.diagnostico && <LinhaRegistro rotulo="Diagnóstico" valor={c.diagnostico} />}
          {c.servico_realizado && <LinhaRegistro rotulo="Serviço realizado" valor={c.servico_realizado} />}
          {c.pecas_utilizadas && <LinhaRegistro rotulo="Peças citadas" valor={c.pecas_utilizadas} />}
          {c.observacoes_finais && <LinhaRegistro rotulo="Observações" valor={c.observacoes_finais} />}
        </dl>
      ) : (
        <p className="text-[13px] leading-relaxed text-ink-3">O mecânico registra diagnóstico e serviço ao finalizar. A IA pode adiantar o rascunho.</p>
      )}

      {podeGerar && (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          {erro && <Aviso tom={erro.tom}>{erro.texto}</Aviso>}
          {sugestao && !gerar.isPending && (
            <div className="flex flex-col gap-2.5 rounded-xl border border-accent/30 bg-accent-soft/40 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-accent-ink">
                  <Brain aria-hidden className="size-3.5" /> Resumo sugerido pela IA
                </span>
                {emUso && (
                  <Selo tom="ok" ponto>
                    Em uso
                  </Selo>
                )}
              </div>
              <dl className="flex flex-col gap-2.5">
                {sugestao.diagnostico && <LinhaRegistro rotulo="Diagnóstico" valor={sugestao.diagnostico} />}
                {sugestao.servico_realizado && <LinhaRegistro rotulo="Serviço realizado" valor={sugestao.servico_realizado} />}
                {sugestao.observacoes && <LinhaRegistro rotulo="Observações" valor={sugestao.observacoes} />}
              </dl>
              {!emUso && (
                <div className="flex flex-wrap gap-2">
                  <Botao
                    variante="primario"
                    iconeInicio={<Check />}
                    carregando={usar.isPending}
                    onClick={() => (temRegistro ? setConfirmando(true) : usar.mutate(sugestao))}
                    className="flex-1 max-lg:h-11 sm:flex-none"
                  >
                    Usar
                  </Botao>
                </div>
              )}
            </div>
          )}
          {gerar.isPending ? (
            <p className="flex items-center gap-2 text-[13px] text-ink-3">
              <Loader2 aria-hidden className="size-4 animate-spin" /> Lendo a conversa, a linha do tempo e os itens…
            </p>
          ) : (
            <Botao
              variante={sugestao ? 'neutro' : 'secundario'}
              iconeInicio={sugestao ? <RefreshCw /> : <ClipboardPen />}
              onClick={() => gerar.mutate()}
              className="self-start max-lg:h-11 max-sm:w-full"
            >
              {sugestao ? 'Gerar de novo' : 'Resumo para a OS com IA'}
            </Botao>
          )}
        </div>
      )}

      <Confirmacao
        aberto={confirmando}
        aoFechar={() => setConfirmando(false)}
        aoConfirmar={() => sugestao && usar.mutate(sugestao)}
        carregando={usar.isPending}
        titulo="Substituir o registro atual?"
        rotuloConfirmar="Usar o resumo da IA"
        descricao="Diagnóstico, serviço realizado e observações do chamado passam a ser os do resumo sugerido. O texto atual é substituído."
      />
    </Bloco>
  )
}

function LinhaRegistro({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="lbl">{rotulo}</dt>
      <dd className="mt-1 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-2">{valor}</dd>
    </div>
  )
}

/* ── IA: leitura de fotos ───────────────────────────────────────────────── */

type Leitura = { texto: string } | { erro: string; tom: 'atencao' | 'critico' }

/**
 * "Analisar com IA" nas fotos do chamado: um toque na miniatura e a IA
 * devolve a leitura técnica (vazamento, desgaste, peça quebrada…). A galeria
 * continua sendo a de sempre; aqui ficam só as fotos e as leituras.
 */
export function AnaliseFotosIA({ chamadoId, anexos }: { chamadoId: string; anexos: AnexoSOS[] }) {
  const fotos = useMemo(() => anexos.filter((a) => a.tipo === 'foto'), [anexos])
  const caminhos = useMemo(() => fotos.map((f) => f.caminho), [fotos])
  const [leituras, setLeituras] = useState<Record<string, Leitura>>({})
  const [analisando, setAnalisando] = useState<string | null>(null)

  const urls = useQuery({
    queryKey: ['sos', 'urls', chamadoId, 'fotos', caminhos.join('|')],
    enabled: caminhos.length > 0,
    staleTime: 50 * 60_000,
    queryFn: () => sosUrlsArquivos(caminhos),
  })

  async function analisar(caminho: string) {
    setAnalisando(caminho)
    try {
      const r = await sosIaFoto(chamadoId, caminho)
      setLeituras((l) => ({ ...l, [caminho]: { texto: r.texto } }))
    } catch (e) {
      const { texto, tom } = erroDaIa(e)
      setLeituras((l) => ({ ...l, [caminho]: { erro: texto, tom } }))
    } finally {
      setAnalisando(null)
    }
  }

  if (!fotos.length) return null
  const lidas = fotos.filter((f) => leituras[f.caminho])

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-accent/40 bg-accent-soft/25 p-3">
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-ink">
        <Brain aria-hidden className="size-3.5 text-accent" /> Analisar com IA
        <span className="font-normal text-ink-3">· toque numa foto</span>
      </p>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
        {fotos.map((f) => {
          const url = urls.data?.[f.caminho]
          const esta = analisando === f.caminho
          const feita = !!leituras[f.caminho]
          return (
            <li key={f.id} className="shrink-0">
              <button
                type="button"
                disabled={!!analisando}
                onClick={() => void analisar(f.caminho)}
                aria-label={`Analisar com IA a foto de ${horaCurta(f.created_at)}`}
                className={cn(
                  'relative flex size-16 items-center justify-center overflow-hidden rounded-lg border bg-surface-2 transition-[border-color,opacity] disabled:opacity-70',
                  feita ? 'border-accent ring-1 ring-accent/40' : 'border-line hover:border-accent',
                )}
              >
                {url ? <img src={url} alt="" loading="lazy" className="size-full object-cover" /> : <Loader2 aria-hidden className="size-4 animate-spin text-ink-3" />}
                {(esta || feita) && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white">
                    {esta ? <Loader2 aria-hidden className="size-5 animate-spin" /> : <Brain aria-hidden className="size-4" />}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {analisando && (
        <p className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <Loader2 aria-hidden className="size-3.5 animate-spin" /> A IA está olhando a foto…
        </p>
      )}
      {lidas.length > 0 && (
        <ul className="flex flex-col gap-2">
          {lidas.map((f) => {
            const l = leituras[f.caminho]
            const url = urls.data?.[f.caminho]
            return (
              <li key={f.id} className="flex gap-3 rounded-lg border border-line bg-surface p-2.5">
                <span className="size-12 shrink-0 overflow-hidden rounded-md bg-surface-2">{url && <img src={url} alt="" className="size-full object-cover" />}</span>
                {'texto' in l ? (
                  <p className="min-w-0 flex-1 text-[12.5px] leading-relaxed whitespace-pre-line text-ink-2">{l.texto}</p>
                ) : (
                  <p className={cn('min-w-0 flex-1 text-[12.5px] leading-snug', l.tom === 'atencao' ? 'text-warn-ink' : 'text-crit-ink')}>{l.erro}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
