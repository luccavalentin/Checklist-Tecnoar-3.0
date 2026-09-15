import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, CircleCheckBig, CloudOff, NotebookPen, Package, PenLine, ReceiptText, Stethoscope, Wrench } from 'lucide-react'
import { moeda } from '@/lib/formatos'
import type { LeituraGPS } from '@/sos/geo'
import { horaCurta } from '@/sos/rotulos'
import type { DetalheChamado } from '@/sos/tipos'
import { FolhaAssinatura } from './Assinatura'
import { totaisItens, useOnline } from './dados'
import { resumoOrcamento } from './Orcamento'
import { useAvancar } from './PecasAtendimento'
import type { Rascunho } from './rascunho'
import type { SubTela } from './subtela'
import { BotaoM, LinhaTarefa, ListaM, RodapeAcao, SecaoM } from './ui'

/**
 * FINALIZAÇÃO — confere o que a OS precisa antes de fechar: diagnóstico e
 * serviço realizado (obrigatórios, o banco também exige), serviços, produtos,
 * fotos finais, observações e a aprovação do cliente quando houve orçamento.
 * Cada linha abre a tela que resolve. Embaixo, os totais e o aceite.
 */
export function Finalizacao({
  d,
  rascunho,
  abrir,
  reserva,
}: {
  d: DetalheChamado
  rascunho: Rascunho
  abrir: (t: SubTela) => void
  reserva: LeituraGPS | null
}) {
  const navegar = useNavigate()
  const online = useOnline()
  const c = d.chamado
  const avancar = useAvancar(c.id)
  const [assinar, setAssinar] = useState(false)

  const { produtos, servicos, total, nProdutos, nServicos } = totaisItens(d.itens)
  const doMecanico = d.anexos.filter((a) => a.autor_papel !== 'cliente' && a.tipo !== 'assinatura')
  const fotosFinais = doMecanico.filter((a) => a.etapa === 'depois' || a.etapa === 'conclusao')
  const aceite = d.anexos.find((a) => a.tipo === 'assinatura' && a.etapa === 'conclusao') ?? null
  const temDiagnostico = !!rascunho.campos.diagnostico.trim()
  const temServico = !!rascunho.campos.servico_realizado.trim()
  const temObs = !!rascunho.campos.observacoes.trim()
  const orc = resumoOrcamento(d)
  const semOrcamento = !c.orcamento_status
  const faltam = [!temDiagnostico && 'diagnóstico', !temServico && 'serviço realizado'].filter(Boolean) as string[]

  function finalizar() {
    const { diagnostico, servico_realizado, observacoes } = rascunho.campos
    void rascunho.salvarAgora()
    avancar.mutate(
      { status: 'servico_finalizado', reserva, dados: { diagnostico, servico_realizado, observacoes } },
      {
        onSuccess: () => {
          rascunho.limpar()
          navegar(`/chamado/${c.id}`, { replace: true })
        },
      },
    )
  }

  return (
    <>
      <SecaoM titulo="Conferência">
        <ListaM>
          <LinhaTarefa
            icone={Stethoscope}
            titulo="Diagnóstico preenchido"
            obrigatoria
            estado={temDiagnostico ? 'feito' : 'pendente'}
            sub={temDiagnostico ? rascunho.campos.diagnostico : 'Falta — toque para escrever'}
            onClick={() => abrir('diagnostico')}
          />
          <LinhaTarefa
            icone={Wrench}
            titulo="Serviço realizado"
            obrigatoria
            estado={temServico ? 'feito' : 'pendente'}
            sub={temServico ? rascunho.campos.servico_realizado : 'Falta — descreva o que foi feito'}
            onClick={() => abrir('diagnostico')}
          />
          <LinhaTarefa
            icone={Wrench}
            titulo="Serviços adicionados"
            estado={nServicos ? 'feito' : 'aviso'}
            sub={nServicos ? `${nServicos} ${nServicos === 1 ? 'serviço' : 'serviços'} · ${moeda(servicos)}` : 'Nenhum serviço do catálogo lançado'}
            onClick={() => abrir('servicos')}
          />
          <LinhaTarefa
            icone={Package}
            titulo="Produtos adicionados"
            estado={nProdutos ? 'feito' : 'livre'}
            sub={nProdutos ? `${nProdutos} ${nProdutos === 1 ? 'produto' : 'produtos'} · ${moeda(produtos)}` : 'Nenhum — lance se usou peças'}
            onClick={() => abrir('produtos')}
          />
          <LinhaTarefa
            icone={Camera}
            titulo="Fotos finais"
            estado={fotosFinais.length ? 'feito' : 'aviso'}
            sub={fotosFinais.length ? `${fotosFinais.length} ${fotosFinais.length === 1 ? 'foto' : 'fotos'} do serviço pronto` : 'Registre o veículo depois do serviço'}
            onClick={() => abrir('fotos')}
          />
          <LinhaTarefa
            icone={NotebookPen}
            titulo="Observações"
            estado={temObs ? 'feito' : 'livre'}
            sub={temObs ? rascunho.campos.observacoes : 'Opcional — recomendações ao cliente'}
            onClick={() => abrir('observacoes')}
          />
          <LinhaTarefa
            icone={ReceiptText}
            titulo="Aprovação do cliente"
            estado={semOrcamento ? 'livre' : orc.estado}
            sub={semOrcamento ? 'Sem orçamento enviado — só quando necessária' : orc.texto}
            onClick={() => abrir('orcamento')}
          />
        </ListaM>
      </SecaoM>

      <section className="rounded-[1.25rem] border border-line bg-surface p-4">
        <dl className="flex flex-col gap-2 text-[15px]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-2">Produtos</dt>
            <dd className="num font-semibold text-ink">{moeda(produtos)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-2">Serviços</dt>
            <dd className="num font-semibold text-ink">{moeda(servicos)}</dd>
          </div>
          <div className="mt-1 flex items-end justify-between gap-3 border-t border-line pt-3">
            <dt className="font-display text-[15px] font-extrabold tracking-[0.08em] text-ink uppercase">Total</dt>
            <dd className="num text-[32px] leading-none font-semibold tracking-tight text-ink">{moeda(total)}</dd>
          </div>
        </dl>
      </section>

      <SecaoM titulo="Assinatura e aceite">
        <div className="flex flex-col gap-2 rounded-[1.25rem] border border-line bg-surface p-4">
          {c.orcamento_assinatura && (
            <p className="flex items-start gap-2 text-[14px] leading-snug font-semibold text-ok-ink">
              <CircleCheckBig className="mt-0.5 size-4 shrink-0" /> Orçamento assinado pelo cliente às {horaCurta(c.orcamento_respondido_em)}.
            </p>
          )}
          {aceite ? (
            <p className="flex items-start gap-2 text-[14px] leading-snug font-semibold text-ok-ink">
              <CircleCheckBig className="mt-0.5 size-4 shrink-0" /> Aceite do serviço assinado às {horaCurta(aceite.created_at)}
              {aceite.legenda?.includes('—') ? ` (${aceite.legenda.split('—').pop()?.trim()})` : ''}.
            </p>
          ) : (
            <>
              <p className="text-[14px] leading-snug text-ink-2">Se o cliente estiver no local, peça para ele conferir e assinar o aceite do serviço.</p>
              <BotaoM variante="neutro" tamanho="lg" largo icone={PenLine} disabled={!online} onClick={() => setAssinar(true)}>
                Colher assinatura do cliente
              </BotaoM>
            </>
          )}
        </div>
      </SecaoM>

      <p className="px-1 text-center text-[13px] leading-snug text-ink-3">Ao finalizar, o cliente e a central são avisados e o rastreamento é encerrado.</p>

      <RodapeAcao>
        {faltam.length > 0 ? (
          <p className="text-center text-[13.5px] font-semibold text-accent-ink">Falta: {faltam.join(' e ')}.</p>
        ) : !online ? (
          <p className="flex items-center justify-center gap-2 text-center text-[13px] font-medium text-warn-ink">
            <CloudOff className="size-4 shrink-0" /> Sem sinal: a finalização fica guardada e envia sozinha.
          </p>
        ) : null}
        <BotaoM variante="verde" tamanho="xxl" largo icone={CircleCheckBig} carregando={avancar.isPending} disabled={faltam.length > 0} onClick={finalizar}>
          Finalizar atendimento
        </BotaoM>
      </RodapeAcao>

      <FolhaAssinatura aberta={assinar} aoFechar={() => setAssinar(false)} chamadoId={c.id} />
    </>
  )
}
