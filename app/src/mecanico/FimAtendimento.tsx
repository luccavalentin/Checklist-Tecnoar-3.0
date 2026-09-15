import { useEffect, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ban, Check, ClipboardList, CloudOff, ExternalLink, FileText, House, RefreshCw, Share2, Star, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { Estrelas, LinhaDoTempo } from '@/sos/componentes'
import { useLaudoSOS } from '@/sos/useLaudo'
import { dataHoraCurta, formatarDuracao } from '@/sos/rotulos'
import type { DetalheChamado } from '@/sos/tipos'
import { totaisItens, useHomeMecanico, useOnline } from './dados'
import { FaixaFila } from './FilaPendente'
import { useFilaChamado } from './filaOffline'
import { linkOS } from './OrdemServico'
import { Placa } from './pecas'
import { modeloVeiculo } from './PecasAtendimento'
import { BotaoM, RotuloM } from './ui'

/**
 * Telas de fim de linha do chamado: finalizado (com a OS), cancelado e os
 * avisos de "não dá para abrir". Sempre com uma saída óbvia: o início.
 */

function Moldura({ children }: { children: ReactNode }) {
  return (
    <div className="mec mec-fundo flex flex-col">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pt-[calc(env(safe-area-inset-top)+1.75rem)] pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
    </div>
  )
}

export function TelaConclusao({ d }: { d: DetalheChamado }) {
  const navegar = useNavigate()
  const home = useHomeMecanico()
  const fila = useFilaChamado(d.chamado.id)
  const c = d.chamado
  const fotos = d.anexos.filter((a) => a.autor_papel !== 'cliente' && a.etapa !== 'abertura').length
  const { total } = totaisItens(d.itens)
  const disponivel = home.data?.ficha?.situacao === 'disponivel' && !home.data?.chamado_atual
  // Finalizou sem sinal: a tela já é a de conclusão, mas o banco ainda não sabe.
  const guardada = fila.acoes.some((a) => a.tipo === 'avancar' && !a.erro)
  const veiculo = modeloVeiculo(d)

  return (
    <Moldura>
      <div className="entrada-suave flex flex-col items-center text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-[#00afef] text-white mec-sombra-verde">
          <Check className="size-10" strokeWidth={3} />
        </span>
        <h1 className="mt-4 font-display text-[28px] leading-tight font-black tracking-tight text-ink">
          {c.status === 'concluido' ? 'Atendimento concluído' : 'Atendimento finalizado'}
        </h1>
        <p className="num mt-1 text-[13.5px] text-ink-3">
          {c.protocolo} · {dataHoraCurta(c.finalizado_em ?? c.concluido_em)}
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <FaixaFila chamadoId={c.id} />

        {/* o que a finalização fez */}
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-surface">
          {guardada ? (
            <Feito icone={CloudOff} tom="aviso">
              Finalização guardada no aparelho — envia sozinha quando o sinal voltar.
            </Feito>
          ) : (
            <>
              <Feito>SOS finalizado</Feito>
              {d.os ? (
                <Feito>
                  <a href={linkOS(d.os.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 underline-offset-2 active:underline">
                    OS nº <span className="num">{d.os.numero}</span> no sistema Tecnoar <ExternalLink className="size-3.5" />
                  </a>
                </Feito>
              ) : (
                <Feito icone={FileText} tom="info">
                  A central gera a OS com o que você lançou.
                </Feito>
              )}
              {c.veiculo_id && <Feito>Histórico do veículo atualizado</Feito>}
              <Feito>Cliente notificado</Feito>
              <Feito>Central atualizada</Feito>
              <Feito>Rastreamento encerrado</Feito>
            </>
          )}
        </ul>

        <section className="rounded-[1.25rem] border border-line bg-surface p-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-display text-[17px] leading-tight font-bold text-ink">{d.cliente?.nome ?? 'Cliente'}</p>
              <p className="truncate text-[13.5px] text-ink-3">
                {c.ocorrencia_rotulo}
                {veiculo ? ` · ${veiculo}` : ''}
              </p>
            </div>
            <Placa placa={d.veiculo?.placa} />
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-2">
            <Dado rotulo="Serviço" valor={formatarDuracao(c.tempo_servico_seg)} />
            <Dado rotulo="Total do SOS" valor={formatarDuracao(c.tempo_total_seg)} />
            <Dado rotulo="Valor" valor={moeda(total)} />
            <Dado rotulo="Fotos" valor={String(fotos)} />
          </dl>
          {c.servico_realizado && <p className="mt-3 line-clamp-3 text-[14px] leading-snug text-ink-2">{c.servico_realizado}</p>}
        </section>

        <section className="flex items-center gap-3 rounded-[1.25rem] border border-line bg-surface px-4 py-3.5">
          <Star className="size-6 shrink-0 fill-[#f5a524] text-[#f5a524]" />
          {c.avaliacao_nota ? (
            <div className="min-w-0">
              <RotuloM>Avaliação recebida</RotuloM>
              <div className="mt-1">
                <Estrelas valor={c.avaliacao_nota} tamanho="sm" />
              </div>
              {c.avaliacao_comentario && <p className="mt-1 text-[14px] text-ink-2">“{c.avaliacao_comentario}”</p>}
            </div>
          ) : (
            <p className="text-[14px] leading-snug text-ink-2">
              {guardada ? 'O cliente recebe o convite para avaliar quando a finalização chegar.' : 'O cliente foi convidado a avaliar o atendimento.'}
            </p>
          )}
        </section>

        {disponivel && (
          <p className="flex items-center justify-center gap-2 text-[14px] font-semibold text-ok-ink">
            <span className="size-2.5 rounded-full bg-ok" /> Você está disponível de novo para SOS
          </p>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-6">
        <BotaoLaudo chamadoId={c.id} guardada={guardada} />
        <BotaoM variante="laranja" tamanho="xxl" largo icone={House} onClick={() => navegar('/', { replace: true })}>
          Voltar ao início
        </BotaoM>
      </div>
    </Moldura>
  )
}

function Feito({ children, icone: Icone = Check, tom = 'ok' }: { children: ReactNode; icone?: LucideIcon; tom?: 'ok' | 'aviso' | 'info' }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3 text-[15px] font-semibold text-ink">
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full',
          tom === 'ok' ? 'bg-ok-soft text-ok-ink' : tom === 'aviso' ? 'bg-warn-soft text-warn-ink' : 'bg-cyan-soft text-cyan-ink',
        )}
      >
        <Icone className="size-4" strokeWidth={3} />
      </span>
      <span className="min-w-0">{children}</span>
    </li>
  )
}

/**
 * Laudo em PDF (fotos, horários, itens, assinaturas) para o cliente, o
 * gestor da frota ou a seguradora. Em dois toques: o primeiro monta o PDF, o
 * segundo abre a folha de compartilhar (WhatsApp, e-mail…) — o Safari do
 * iPhone só compartilha se a chamada sair direto do toque.
 */
function BotaoLaudo({ chamadoId, guardada }: { chamadoId: string; guardada: boolean }) {
  const toast = useToast()
  const online = useOnline()
  const laudo = useLaudoSOS(chamadoId)

  useEffect(() => {
    if (laudo.estado === 'erro' && laudo.erro) toast.erro('Não foi possível gerar o laudo', laudo.erro)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laudo.estado, laudo.erro])

  const pronto = laudo.estado === 'pronto'
  const bloqueio = guardada ? 'O laudo fica pronto quando a finalização for enviada.' : !online ? 'O laudo precisa de internet para buscar as fotos.' : null
  return (
    <div className="flex flex-col gap-1.5">
      <BotaoM
        variante={pronto ? 'verde' : 'neutro'}
        tamanho="xl"
        largo
        icone={pronto ? Share2 : FileText}
        carregando={laudo.estado === 'preparando'}
        disabled={!!bloqueio}
        onClick={pronto ? laudo.entregar : () => void laudo.preparar()}
      >
        {laudo.estado === 'preparando' ? 'Montando o laudo…' : pronto ? 'Compartilhar laudo' : 'Laudo em PDF'}
      </BotaoM>
      {bloqueio ? (
        <p className="text-center text-[13px] text-ink-3">{bloqueio}</p>
      ) : pronto ? (
        <p className="text-center text-[13px] text-ink-3">Laudo pronto. Toque para enviar pelo WhatsApp ou e-mail.</p>
      ) : null}
    </div>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 px-3 py-2">
      <dt className="text-[12px] font-semibold text-ink-3">{rotulo}</dt>
      <dd className="num mt-0.5 truncate text-[15.5px] font-semibold text-ink">{valor}</dd>
    </div>
  )
}

export function TelaCancelado({ d }: { d: DetalheChamado }) {
  const navegar = useNavigate()
  const c = d.chamado
  const quem = c.cancelado_por_papel === 'cliente' ? 'pelo cliente' : c.cancelado_por_papel === 'central' ? 'pela central' : ''
  return (
    <Moldura>
      <div className="entrada-suave flex flex-col items-center text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-crit-soft text-crit-ink">
          <Ban className="size-10" />
        </span>
        <h1 className="mt-4 font-display text-[28px] leading-tight font-black tracking-tight text-ink">Chamado cancelado</h1>
        <p className="mt-1 text-[15px] text-ink-2">
          Cancelado {quem}
          {c.cancelado_em ? ` às ${new Date(c.cancelado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}.
        </p>
      </div>

      {c.motivo_cancelamento && (
        <div className="mt-6 rounded-[1.25rem] border border-line bg-surface p-4">
          <RotuloM>Motivo</RotuloM>
          <p className="mt-1 text-[16px] leading-snug text-ink">{c.motivo_cancelamento}</p>
        </div>
      )}

      <div className="mt-3 rounded-[1.25rem] border border-line bg-surface p-4">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 font-display text-[16px] leading-tight font-bold text-ink">{d.cliente?.nome ?? 'Cliente'}</p>
            <p className="num truncate text-[13px] text-ink-3">{c.protocolo}</p>
          </div>
          <Placa placa={d.veiculo?.placa} tamanho="sm" />
        </div>
        <p className="mt-3 text-[14px] leading-snug text-ink-2">Você não precisa fazer nada. Se já estava a caminho, pode voltar.</p>
      </div>

      <details className="mt-3 rounded-[1.25rem] border border-line bg-surface p-4">
        <summary className="cursor-pointer font-display text-[12px] font-extrabold tracking-[0.14em] text-ink-3 uppercase">Linha do tempo</summary>
        <div className="mt-3">
          <LinhaDoTempo eventos={d.eventos} />
        </div>
      </details>

      <div className="mt-auto pt-6">
        <BotaoM variante="laranja" tamanho="xxl" largo icone={House} onClick={() => navegar('/', { replace: true })}>
          Voltar ao início
        </BotaoM>
      </div>
    </Moldura>
  )
}

/** Chamado que não dá para abrir (de outro mecânico, sumiu, erro de rede). */
export function TelaAvisoChamado({
  icone: Icone = ClipboardList,
  titulo,
  texto,
  aoTentar,
  tentando,
}: {
  icone?: LucideIcon
  titulo: string
  texto: ReactNode
  aoTentar?: () => void
  tentando?: boolean
}) {
  const navegar = useNavigate()
  return (
    <Moldura>
      <div className="entrada-suave my-auto flex flex-col items-center text-center">
        <span className="flex size-20 items-center justify-center rounded-3xl bg-warn-soft text-warn-ink">
          <Icone className="size-9" />
        </span>
        <h1 className="mt-5 font-display text-[24px] leading-tight font-black text-ink">{titulo}</h1>
        <div className="mt-2 max-w-sm text-[15px] leading-relaxed text-ink-2">{texto}</div>
      </div>
      <div className="mt-auto flex flex-col gap-2 pt-6">
        {aoTentar && (
          <BotaoM variante="neutro" tamanho="lg" largo icone={RefreshCw} carregando={tentando} onClick={aoTentar}>
            Tentar de novo
          </BotaoM>
        )}
        <BotaoM variante="laranja" tamanho="xxl" largo icone={House} onClick={() => navegar('/', { replace: true })}>
          Voltar ao início
        </BotaoM>
      </div>
    </Moldura>
  )
}
