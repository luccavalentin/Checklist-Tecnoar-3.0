import { useEffect, useRef, useState } from 'react'
import {
  Camera,
  ChevronDown,
  CircleCheckBig,
  ClipboardList,
  FileText,
  Link2,
  ListChecks,
  MessageCircle,
  NotebookPen,
  Package,
  Play,
  ReceiptText,
  Brain,
  Stethoscope,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { useToast } from '@/componentes/ui/Toast'
import { vibrarAlerta } from '@/sos/alerta'
import { GaleriaAnexos, LinhaDoTempo } from '@/sos/componentes'
import type { ErroGPS, LeituraGPS } from '@/sos/geo'
import { formatarPlacaExibicao } from '@/sos/rotulos'
import type { DetalheChamado } from '@/sos/tipos'
import { useMecanico } from '../sessao'
import { Catalogo } from './Catalogo'
import { totaisItens, useAgora, useAlturaTeclado, useOnline } from './dados'
import { EmDeslocamento } from './EmDeslocamento'
import { FaixaFila } from './FilaPendente'
import { useFilaChamado } from './filaOffline'
import { Finalizacao } from './Finalizacao'
import { FotosAtendimento } from './FotosAtendimento'
import { HistoricoVeiculo } from './HistoricoVeiculo'
import { BotaoEscreverIa, KitIa, useIaLigada } from './Ia'
import { CartaoOrcamento, resumoOrcamento } from './Orcamento'
import { OrdemServico, linkChecklistOS, useOSParaVincular } from './OrdemServico'
import { FaixasCampo, Placa } from './pecas'
import {
  AtalhosContato,
  FichaVeiculo,
  FolhaConversa,
  LocalCliente,
  ProblemaRelatado,
  fotosDoCliente,
  mensagensNaoLidas,
  modeloVeiculo,
  useAvancar,
} from './PecasAtendimento'
import { IndicadorSalvo, useRascunhoAtendimento, type Rascunho } from './rascunho'
import { useSubTela, type SubTela } from './subtela'
import { ConversaTecnica } from './TecnoIA'
import { AreaM, BotaoM, CartaoM, FolhaM, LinhaTarefa, ListaM, RodapeAcao, RotuloM, SecaoM, TelaM, TopoM } from './ui'

/** Mensagem do banco quando falta a aprovação do orçamento para começar. */
const FALTA_APROVACAO = /orçamento/i

type Rastreio = { posicao: LeituraGPS | null; erroGps: ErroGPS | null; semRede: boolean }

/**
 * O atendimento em campo, do aceite ao "finalizar":
 *
 *   aceito / a caminho → A CAMINHO DO CLIENTE (mapa)
 *   no local           → ATENDIMENTO (chegada) → OS, diagnóstico, produtos,
 *                        serviços, aprovação → INICIAR SERVIÇO
 *   em serviço         → cronômetro, tarefas → FINALIZAR (conferência)
 *
 * O texto do atendimento salva sozinho (fila do aparelho quando sem sinal) e
 * cada tarefa abre em tela própria (`?tela=…`).
 */
export function AtendimentoEmCampo({ d, rastreio }: { d: DetalheChamado; rastreio: Rastreio }) {
  const c = d.chamado
  const rascunho = useRascunhoAtendimento(c)
  const sub = useSubTela()
  const [avisoInicio, setAvisoInicio] = useState<string | null>(null)
  const [aberto, abrirAtendimento] = useAtendimentoAberto(d)
  const noLocal = c.status === 'no_local' || c.status === 'servico_iniciado'

  // Sub-telas também valem a caminho: OS, consulta do catálogo e Tecno IA.
  const permitidas: SubTela[] = noLocal ? ['os', 'diagnostico', 'observacoes', 'fotos', 'produtos', 'servicos', 'orcamento', 'ia', 'finalizar'] : ['os', 'produtos', 'servicos', 'ia']
  const tela = sub.tela && permitidas.includes(sub.tela) && !(sub.tela === 'finalizar' && c.status !== 'servico_iniciado') ? sub.tela : null

  if (tela) {
    return <SubTelaAtendimento d={d} tela={tela} fechar={sub.fechar} abrir={sub.abrir} rascunho={rascunho} rastreio={rastreio} avisoInicio={avisoInicio} />
  }
  if (!noLocal) return <EmDeslocamento d={d} rastreio={rastreio} />
  if (c.status === 'no_local' && !aberto) return <Chegada d={d} rastreio={rastreio} aoIniciar={abrirAtendimento} />
  return <Painel d={d} rastreio={rastreio} rascunho={rascunho} abrir={sub.abrir} avisoInicio={avisoInicio} setAvisoInicio={setAvisoInicio} />
}

/**
 * "INICIAR ATENDIMENTO" é um passo do aparelho (o banco não tem etapa para
 * isso): fica guardado por chamado. Quem já mexeu no atendimento (itens,
 * OS, diagnóstico, fotos) entra direto nas tarefas.
 */
function useAtendimentoAberto(d: DetalheChamado): [boolean, () => void] {
  const chave = `sos.atendimento-aberto.${d.chamado.id}`
  const [marcado, setMarcado] = useState(() => {
    try {
      return localStorage.getItem(chave) === '1'
    } catch {
      return false
    }
  })
  const c = d.chamado
  const mexeu =
    !!d.os ||
    !!c.orcamento_status ||
    !!c.diagnostico ||
    d.itens.some((i) => i.origem !== 'deslocamento') ||
    d.anexos.some((a) => a.autor_papel === 'mecanico' && a.etapa === 'antes')
  const abrir = () => {
    setMarcado(true)
    try {
      localStorage.setItem(chave, '1')
    } catch {
      /* sem armazenamento: vale só nesta sessão */
    }
  }
  return [marcado || mexeu, abrir]
}

/* ── ATENDIMENTO: a chegada ─────────────────────────────────────────────── */

function Chegada({ d, rastreio, aoIniciar }: { d: DetalheChamado; rastreio: Rastreio; aoIniciar: () => void }) {
  const online = useOnline()
  const agora = useAgora(30_000)
  const { usuarioId } = useMecanico()
  const [conversa, setConversa] = useState(false)
  const c = d.chamado
  const doCliente = fotosDoCliente(d)
  const ha = c.chegou_em ? Math.max(0, Math.round((agora - Date.parse(c.chegou_em)) / 60_000)) : null

  return (
    <div className="mec mec-fundo">
      <TopoM
        voltar="/"
        sobretitulo={ha != null ? `Você chegou · há ${ha} min` : 'Você chegou'}
        titulo="Atendimento"
        sub={<span className="num">{c.protocolo}</span>}
        acao={<BotaoChat naoLidas={mensagensNaoLidas(d, usuarioId)} aoAbrir={() => setConversa(true)} />}
      />
      <TelaM comBarra={false} className="pb-[calc(8.5rem+env(safe-area-inset-bottom))]">
        <FaixasCampo online={online} semRede={rastreio.semRede} erroGps={rastreio.erroGps} />
        <FaixaFila chamadoId={c.id} />

        <CartaoM className="flex flex-col gap-3">
          <div>
            <RotuloM>Cliente</RotuloM>
            <p className="mt-1 font-display text-[22px] leading-tight font-extrabold text-ink">{d.cliente?.nome ?? 'Cliente'}</p>
          </div>
          <AtalhosContato d={d} aoConversa={() => setConversa(true)} />
        </CartaoM>

        {d.veiculo && (
          <CartaoM>
            <RotuloM className="mb-2">Veículo</RotuloM>
            <FichaVeiculo d={d} />
          </CartaoM>
        )}

        <CartaoM>
          <RotuloM className="mb-2">Problema informado</RotuloM>
          <ProblemaRelatado d={d} fotos={false} />
        </CartaoM>

        {doCliente.length > 0 && (
          <SecaoM titulo={`Fotos enviadas pelo cliente · ${doCliente.length}`}>
            <GaleriaAnexos anexos={doCliente} chamadoId={c.id} />
          </SecaoM>
        )}

        <HistoricoVeiculo veiculoId={c.veiculo_id} osAtualId={c.os_id} />

        <KitIa d={d} podeLancar={false} compacto />
      </TelaM>

      <RodapeAcao>
        <BotaoM variante="laranja" tamanho="xxl" largo icone={Play} onClick={aoIniciar}>
          Iniciar atendimento
        </BotaoM>
      </RodapeAcao>

      <FolhaConversa aberta={conversa} aoFechar={() => setConversa(false)} d={d} />
    </div>
  )
}

/* ── tarefas do atendimento (no local e em serviço) ─────────────────────── */

function Painel({
  d,
  rastreio,
  rascunho,
  abrir,
  avisoInicio,
  setAvisoInicio,
}: {
  d: DetalheChamado
  rastreio: Rastreio
  rascunho: Rascunho
  abrir: (t: SubTela) => void
  avisoInicio: string | null
  setAvisoInicio: (v: string | null) => void
}) {
  const toast = useToast()
  const online = useOnline()
  const { usuarioId } = useMecanico()
  const c = d.chamado
  const iniciado = c.status === 'servico_iniciado'
  const avancar = useAvancar(c.id)
  const fila = useFilaChamado(c.id)
  const [conversa, setConversa] = useState(false)
  const [folhaIniciar, setFolhaIniciar] = useState(false)
  const [detalhes, setDetalhes] = useState(false)

  // "Iniciar" recusado por falta de aprovação: no toque (avisoInicio) ou ao
  // sair da fila, sem sinal. Com o orçamento aprovado, o aviso perde o sentido.
  const inicioParado = fila.acoes.find((a) => a.tipo === 'avancar' && a.status === 'servico_iniciado' && a.erro && FALTA_APROVACAO.test(a.erro))
  const aviso = c.orcamento_status === 'aprovado' ? null : avisoInicio ?? inicioParado?.erro ?? null

  const doMecanico = d.anexos.filter((a) => a.autor_papel !== 'cliente' && a.etapa !== 'abertura' && a.tipo !== 'assinatura')
  const antes = doMecanico.filter((a) => a.etapa === 'antes')
  const finais = doMecanico.filter((a) => a.etapa === 'depois' || a.etapa === 'conclusao')
  const tot = totaisItens(d.itens)
  const orc = resumoOrcamento(d)
  const naoLidas = mensagensNaoLidas(d, usuarioId)
  const diag = rascunho.campos.diagnostico.trim()
  const serv = rascunho.campos.servico_realizado.trim()
  const obs = rascunho.campos.observacoes.trim()
  const veiculo = modeloVeiculo(d)

  function pedirInicio() {
    // Foto do antes protege o mecânico e a Tecnoar ("isso já estava assim").
    if (antes.length === 0) return setFolhaIniciar(true)
    iniciar()
  }

  function iniciar() {
    setAvisoInicio(null)
    avancar.mutate(
      { status: 'servico_iniciado', reserva: rastreio.posicao },
      {
        onSuccess: () => setFolhaIniciar(false),
        onError: (e) => {
          setFolhaIniciar(false)
          if (!FALTA_APROVACAO.test(e.message)) return toast.erro('Não foi possível iniciar', e.message)
          // Falta a assinatura do cliente: leva direto para a aprovação.
          setAvisoInicio(e.message)
          vibrarAlerta('aviso')
          abrir('orcamento')
        },
      },
    )
  }

  const checklist = d.os ? (
    <LinhaTarefa icone={ListChecks} titulo="Checklist" sub="Checklist da OS no sistema Tecnoar" href={linkChecklistOS(d.os.id)} />
  ) : (
    <LinhaTarefa icone={ListChecks} titulo="Checklist" sub="Disponível depois de gerar a OS" onClick={() => abrir('os')} />
  )

  return (
    <div className="mec mec-fundo">
      <TopoM
        voltar="/"
        sobretitulo={iniciado ? 'Em serviço' : 'Atendimento no local'}
        titulo={veiculo ?? d.cliente?.nome ?? 'Atendimento'}
        sub={
          <span className="num">
            {c.protocolo}
            {d.veiculo?.placa ? ` · ${formatarPlacaExibicao(d.veiculo.placa)}` : ''}
          </span>
        }
        acao={<BotaoChat naoLidas={naoLidas} aoAbrir={() => setConversa(true)} />}
      />

      <TelaM comBarra={false} className="pb-[calc(9rem+env(safe-area-inset-bottom))]">
        <FaixasCampo online={online} semRede={rastreio.semRede} erroGps={rastreio.erroGps} />
        <FaixaFila chamadoId={c.id} />

        {iniciado ? <Cronometro desde={c.iniciado_em} /> : <PassoLocal chegouEm={c.chegou_em} />}

        <CartaoOS d={d} abrir={abrir} />

        {aviso && !iniciado && (
          <button type="button" onClick={() => abrir('orcamento')} className="rounded-2xl bg-crit-soft px-3.5 py-3 text-left text-[14px] leading-snug font-semibold text-crit-ink">
            {aviso} <span className="underline underline-offset-2">Ver aprovação</span>
          </button>
        )}

        <SecaoM titulo={iniciado ? 'Durante o serviço' : 'Antes de iniciar o serviço'}>
          <ListaM>
            {iniciado ? (
              <LinhaTarefa
                icone={Stethoscope}
                titulo="Diagnóstico e serviço"
                obrigatoria
                estado={diag && serv ? 'feito' : 'pendente'}
                sub={diag && serv ? diag : diag ? 'Falta descrever o serviço realizado' : 'O que encontrou e o que foi feito'}
                onClick={() => abrir('diagnostico')}
              />
            ) : (
              <LinhaTarefa
                icone={Stethoscope}
                titulo="Diagnóstico inicial"
                estado={diag ? 'feito' : 'pendente'}
                sub={diag || 'O que você encontrou no veículo'}
                onClick={() => abrir('diagnostico')}
              />
            )}
            <LinhaTarefa
              icone={Camera}
              titulo={iniciado ? 'Fotos finais' : 'Fotos do veículo'}
              estado={(iniciado ? finais.length : antes.length) ? 'feito' : 'pendente'}
              sub={
                iniciado
                  ? finais.length
                    ? `${finais.length} ${finais.length === 1 ? 'foto' : 'fotos'} do serviço pronto`
                    : 'Registre o serviço pronto'
                  : antes.length
                    ? `${antes.length} ${antes.length === 1 ? 'foto' : 'fotos'} de como encontrou`
                    : 'Fotografe como encontrou (antes)'
              }
              onClick={() => abrir('fotos')}
            />
            <LinhaTarefa
              icone={Package}
              titulo="Produtos"
              estado={tot.nProdutos ? 'feito' : 'livre'}
              sub={tot.nProdutos ? `${tot.nProdutos} ${tot.nProdutos === 1 ? 'item' : 'itens'} · ${moeda(tot.produtos)}` : 'Buscar no cadastro e no estoque'}
              onClick={() => abrir('produtos')}
            />
            <LinhaTarefa
              icone={Wrench}
              titulo="Serviços"
              estado={tot.nServicos ? 'feito' : 'livre'}
              sub={tot.nServicos ? `${tot.nServicos} ${tot.nServicos === 1 ? 'serviço' : 'serviços'} · ${moeda(tot.servicos)}` : 'Buscar no catálogo de serviços'}
              onClick={() => abrir('servicos')}
            />
            {iniciado && (
              <LinhaTarefa
                icone={NotebookPen}
                titulo="Observações"
                estado={obs ? 'feito' : 'livre'}
                sub={obs || 'Recomendações ao cliente, pendências'}
                onClick={() => abrir('observacoes')}
              />
            )}
            <LinhaTarefa
              icone={ReceiptText}
              titulo={iniciado ? 'Problemas adicionais' : 'Enviar para aprovação'}
              estado={orc.estado}
              sub={iniciado && orc.estado !== 'aviso' ? 'Encontrou algo novo? Lance e peça nova aprovação' : orc.texto}
              onClick={() => abrir('orcamento')}
            />
            {checklist}
            <LinhaTarefa icone={Brain} titulo="Tecno IA" sub="Pontos para verificar, kit e dúvidas técnicas" onClick={() => abrir('ia')} />
          </ListaM>
        </SecaoM>

        <div className="grid grid-cols-3 gap-2 rounded-[1.25rem] border border-line bg-surface p-3 text-center">
          <Soma rotulo="Produtos" valor={tot.produtos} />
          <Soma rotulo="Serviços" valor={tot.servicos} />
          <Soma rotulo="Total" valor={tot.total} forte />
        </div>

        <button
          type="button"
          onClick={() => setDetalhes((v) => !v)}
          aria-expanded={detalhes}
          className="flex min-h-12 items-center justify-center gap-1.5 text-[14px] font-semibold text-ink-2"
        >
          <ClipboardList className="size-4" /> Cliente, problema e local
          <ChevronDown className={cn('size-4 transition-transform', detalhes && 'rotate-180')} />
        </button>
        {detalhes && (
          <div className="entrada-suave flex flex-col gap-3">
            <CartaoM className="flex flex-col gap-3">
              <div>
                <RotuloM>Cliente</RotuloM>
                <p className="mt-1 font-display text-[19px] leading-tight font-extrabold text-ink">{d.cliente?.nome ?? 'Cliente'}</p>
              </div>
              <AtalhosContato d={d} aoConversa={() => setConversa(true)} />
            </CartaoM>
            <CartaoM>
              <RotuloM className="mb-2">Problema informado</RotuloM>
              <ProblemaRelatado d={d} />
            </CartaoM>
            <CartaoM>
              <RotuloM className="mb-2">Local</RotuloM>
              <LocalCliente d={d} />
            </CartaoM>
            <HistoricoVeiculo veiculoId={c.veiculo_id} osAtualId={c.os_id} />
            <details className="rounded-[1.25rem] border border-line bg-surface p-4">
              <summary className="cursor-pointer font-display text-[12px] font-extrabold tracking-[0.14em] text-ink-3 uppercase">Linha do tempo</summary>
              <div className="mt-3">
                <LinhaDoTempo eventos={d.eventos} />
              </div>
            </details>
          </div>
        )}
      </TelaM>

      <RodapeAcao>
        {!online && <p className="text-center text-[13px] font-medium text-warn-ink">Sem sinal: pode seguir — o que você fizer fica guardado e envia sozinho.</p>}
        {iniciado ? (
          <BotaoM variante="verde" tamanho="xxl" largo icone={CircleCheckBig} onClick={() => abrir('finalizar')}>
            Finalizar serviço
          </BotaoM>
        ) : (
          <BotaoM variante="laranja" tamanho="xxl" largo icone={Play} carregando={avancar.isPending} onClick={pedirInicio}>
            Iniciar serviço
          </BotaoM>
        )}
      </RodapeAcao>

      <FolhaConversa aberta={conversa} aoFechar={() => setConversa(false)} d={d} />

      <FolhaM
        aberta={folhaIniciar}
        aoFechar={() => setFolhaIniciar(false)}
        titulo="Nenhuma foto do ANTES"
        descricao="As fotos de como o veículo estava protegem você e a Tecnoar. Leva dez segundos."
        rodape={
          <>
            <BotaoM
              variante="escuro"
              tamanho="xl"
              largo
              icone={Camera}
              onClick={() => {
                setFolhaIniciar(false)
                abrir('fotos')
              }}
            >
              Tirar fotos primeiro
            </BotaoM>
            <BotaoM variante="fantasma" tamanho="lg" largo carregando={avancar.isPending} onClick={iniciar}>
              Iniciar sem fotos
            </BotaoM>
          </>
        }
      />
    </div>
  )
}

function Soma({ rotulo, valor, forte }: { rotulo: string; valor: number; forte?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-semibold text-ink-3">{rotulo}</p>
      <p className={cn('num mt-0.5 truncate font-semibold', forte ? 'text-[17px] text-ink' : 'text-[14.5px] text-ink-2')}>{moeda(valor)}</p>
    </div>
  )
}

function BotaoChat({ naoLidas, aoAbrir }: { naoLidas: number; aoAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      aria-label={naoLidas ? `Chat, ${naoLidas} mensagens novas` : 'Chat com o cliente'}
      className="relative flex size-12 items-center justify-center rounded-2xl border border-line bg-surface text-ink active:bg-surface-2"
    >
      <MessageCircle className="size-6" />
      {naoLidas > 0 && (
        <span className="num absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full bg-[#ff6600] px-1 text-[11px] leading-5 font-bold text-white ring-2 ring-canvas">
          {naoLidas}
        </span>
      )}
    </button>
  )
}

/** Em serviço: o tempo correndo e o que o cliente está vendo. */
function Cronometro({ desde }: { desde: string | null }) {
  const agora = useAgora(1000)
  const seg = desde ? Math.max(0, Math.floor((agora - Date.parse(desde)) / 1000)) : 0
  const h = Math.floor(seg / 3600)
  const m = Math.floor((seg % 3600) / 60)
  const s = seg % 60
  const relogio = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return (
    <section className="flex items-center gap-4 rounded-[1.25rem] border-2 border-cyan/35 bg-cyan-soft px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <RotuloM className="text-cyan-ink">Tempo de serviço</RotuloM>
        <p className="num mt-1 text-[36px] leading-none font-semibold tracking-tight text-ink max-[359px]:text-[30px]">{relogio}</p>
        <p className="mt-1.5 flex items-center gap-2 text-[13px] leading-snug text-ink-2">
          <span className="relative flex size-2 shrink-0" aria-hidden>
            <span className="mec-pulso absolute inset-0 rounded-full bg-cyan" />
            <span className="relative size-2 rounded-full bg-cyan" />
          </span>
          O cliente vê: “Seu veículo está sendo atendido.”
        </p>
      </div>
    </section>
  )
}

/** No local: quanto tempo parado e o que falta para começar. */
function PassoLocal({ chegouEm }: { chegouEm: string | null }) {
  const agora = useAgora(30_000)
  const min = chegouEm ? Math.max(0, Math.round((agora - Date.parse(chegouEm)) / 60_000)) : null
  return (
    <section className="rounded-[1.25rem] border border-line bg-surface px-4 py-3.5">
      <RotuloM>{min != null ? `No local há ${min} min` : 'No local'}</RotuloM>
      <p className="mt-1 text-[14.5px] leading-snug text-ink-2">
        Gere a OS, registre o diagnóstico, lance produtos e serviços e peça a aprovação. Depois toque em <b className="text-ink">Iniciar serviço</b>.
      </p>
    </section>
  )
}

/**
 * A OS no topo das tarefas: gerar (um toque), lançar na OS que o veículo já
 * tem aberta, ou abrir a que já está ligada ao chamado.
 */
function CartaoOS({ d, abrir }: { d: DetalheChamado; abrir: (t: SubTela) => void }) {
  const online = useOnline()
  const abertas = useOSParaVincular(d.chamado.id, !d.os && online)
  const aberta = abertas.data?.[0] ?? null
  if (d.os) {
    return (
      <ListaM>
        <LinhaTarefa
          icone={FileText}
          titulo={`OS nº ${d.os.numero}`}
          estado="feito"
          sub={`No sistema Tecnoar${d.os.status ? ` · ${d.os.status}` : ''} · ${moeda(d.os.valor_total)}`}
          onClick={() => abrir('os')}
        />
      </ListaM>
    )
  }
  return (
    <section className="flex flex-col gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
          <FileText className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[17px] leading-tight font-extrabold text-ink">Ordem de serviço</p>
          <p className="mt-0.5 text-[13.5px] leading-snug text-ink-3">
            {aberta
              ? `O veículo já tem a OS nº ${aberta.numero} aberta: lance o atendimento nela, sem duplicar.`
              : 'Cliente, veículo, placa e SOS já vêm preenchidos.'}
          </p>
        </div>
      </div>
      <BotaoM variante="contorno" tamanho="xl" largo icone={aberta ? Link2 : FileText} onClick={() => abrir('os')} className="border-accent/70 text-accent-ink">
        {aberta ? `Lançar na OS nº ${aberta.numero}` : 'Gerar OS'}
      </BotaoM>
    </section>
  )
}

/* ── telas de cada tarefa ───────────────────────────────────────────────── */

const TITULOS: Record<SubTela, string> = {
  os: 'Ordem de serviço',
  diagnostico: 'Diagnóstico',
  observacoes: 'Observações',
  fotos: 'Fotos do veículo',
  produtos: 'Produtos',
  servicos: 'Serviços',
  orcamento: 'Aprovação do cliente',
  ia: 'Tecno IA',
  finalizar: 'Finalizar atendimento',
}

function SubTelaAtendimento({
  d,
  tela,
  fechar,
  abrir,
  rascunho,
  rastreio,
  avisoInicio,
}: {
  d: DetalheChamado
  tela: SubTela
  fechar: () => void
  abrir: (t: SubTela) => void
  rascunho: Rascunho
  rastreio: Rastreio
  avisoInicio: string | null
}) {
  const c = d.chamado
  const iniciado = c.status === 'servico_iniciado'
  const noLocal = c.status === 'no_local' || iniciado
  const fila = useFilaChamado(c.id)
  const tot = totaisItens(d.itens)
  // Chegada ainda guardada no aparelho: o banco não aceita orçamento antes dela.
  const chegadaGuardada = fila.acoes.some((a) => a.tipo === 'avancar' && a.status === 'no_local' && !a.erro)
  const titulo = tela === 'diagnostico' && !iniciado ? 'Diagnóstico inicial' : tela === 'fotos' && iniciado ? 'Fotos finais' : TITULOS[tela]
  const sub = (
    <span className="num">
      {c.protocolo}
      {d.veiculo?.placa ? ` · ${formatarPlacaExibicao(d.veiculo.placa)}` : ''}
    </span>
  )

  // Cada tarefa abre do topo (a lista de tarefas pode estar rolada).
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tela])

  // Tecno IA: o campo de mensagem ocupa o rodapé.
  if (tela === 'ia') {
    return (
      <div className="mec mec-fundo flex flex-col">
        <TopoM voltar={fechar} sobretitulo="Apoio técnico" titulo="Tecno IA" sub={sub} />
        <ConversaTecnica chamado={d} chaveConversa={c.id} topo={<KitIa d={d} podeLancar={noLocal} />} />
      </div>
    )
  }

  const pronto = (
    <RodapeAcao>
      <BotaoM variante="neutro" tamanho="xl" largo onClick={fechar}>
        Pronto
      </BotaoM>
    </RodapeAcao>
  )

  return (
    <div className="mec mec-fundo mec-entra">
      <TopoM
        voltar={fechar}
        titulo={titulo}
        sub={sub}
        acao={tela === 'diagnostico' || tela === 'observacoes' ? <IndicadorSalvo estado={rascunho.estado} salvoEm={rascunho.salvoEm} /> : undefined}
      />
      <TelaM comBarra={false} className="pb-[calc(8.5rem+env(safe-area-inset-bottom))]">
        {tela === 'os' && <OrdemServico d={d} />}

        {tela === 'diagnostico' && <TextoDiagnostico d={d} rascunho={rascunho} iniciado={iniciado} />}

        {tela === 'observacoes' && (
          <AreaM
            rotulo="Observações para a OS e para o cliente"
            placeholder="Recomendações, pendências, algo para a oficina olhar depois…"
            value={rascunho.campos.observacoes}
            onChange={(e) => rascunho.alterar('observacoes', e.target.value)}
            onBlur={() => void rascunho.salvarAgora()}
            maxLength={4000}
            autoFocus={!rascunho.campos.observacoes}
            dica="Salva sozinho enquanto você escreve."
          />
        )}

        {tela === 'fotos' && <FotosAtendimento d={d} />}

        {(tela === 'produtos' || tela === 'servicos') && (
          <Catalogo tipo={tela === 'produtos' ? 'produto' : 'servico'} chamado={d} podeAdicionar={noLocal && d.papel === 'mecanico'} />
        )}

        {tela === 'orcamento' && (
          <>
            <CartaoOrcamento d={d} aviso={c.orcamento_status === 'aprovado' ? null : avisoInicio} travado={chegadaGuardada} />
            {d.itens.length > 0 && (
              <SecaoM titulo="Itens do orçamento">
                <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-[1.25rem] border border-line bg-surface">
                  {d.itens.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[14.5px]">
                      <span className="min-w-0 truncate text-ink">
                        <span className="num text-ink-3">{Number(i.quantidade).toLocaleString('pt-BR')}×</span> {i.descricao}
                      </span>
                      <span className="num shrink-0 font-semibold text-ink">{moeda(i.valor_total)}</span>
                    </li>
                  ))}
                </ul>
              </SecaoM>
            )}
            <div className="grid grid-cols-2 gap-2">
              <BotaoM variante="neutro" tamanho="lg" icone={Package} onClick={() => abrir('produtos')}>
                Produtos
              </BotaoM>
              <BotaoM variante="neutro" tamanho="lg" icone={Wrench} onClick={() => abrir('servicos')}>
                Serviços
              </BotaoM>
            </div>
          </>
        )}

        {tela === 'finalizar' && <Finalizacao d={d} rascunho={rascunho} abrir={abrir} reserva={rastreio.posicao} />}
      </TelaM>

      {(tela === 'produtos' || tela === 'servicos') && (
        <RodapeAcao>
          <div className="flex items-center justify-between gap-3 px-1 text-[14px]">
            <span className="text-ink-2">Total do atendimento</span>
            <span className="num text-[18px] font-semibold text-ink">{moeda(tot.total)}</span>
          </div>
          <BotaoM variante="neutro" tamanho="xl" largo onClick={fechar}>
            Pronto
          </BotaoM>
        </RodapeAcao>
      )}
      {(tela === 'fotos' || tela === 'orcamento') && pronto}
      {(tela === 'diagnostico' || tela === 'observacoes') && <RodapeTexto aoPronto={fechar} />}
    </div>
  )
}

/** Barra "Pronto" que sobe com o teclado (campos de texto). */
function RodapeTexto({ aoPronto }: { aoPronto: () => void }) {
  const teclado = useAlturaTeclado()
  return (
    <RodapeAcao teclado={teclado}>
      <BotaoM variante="neutro" tamanho={teclado ? 'lg' : 'xl'} largo onClick={aoPronto}>
        Pronto
      </BotaoM>
    </RodapeAcao>
  )
}

/** Diagnóstico (e, em serviço, o serviço realizado), com a Tecno IA escrevendo. */
function TextoDiagnostico({ d, rascunho, iniciado }: { d: DetalheChamado; rascunho: Rascunho; iniciado: boolean }) {
  const iaResumo = useIaLigada('resumo')
  const refDiag = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!rascunho.campos.diagnostico) refDiag.current?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <>
      {iniciado && iaResumo && (
        <BotaoEscreverIa
          chamadoId={d.chamado.id}
          temTexto={!!(rascunho.campos.diagnostico.trim() || rascunho.campos.servico_realizado.trim() || rascunho.campos.observacoes.trim())}
          aoUsar={(r) => rascunho.substituir({ diagnostico: r.diagnostico, servico_realizado: r.servico_realizado, observacoes: r.observacoes })}
        />
      )}
      <AreaM
        ref={refDiag}
        rotulo={iniciado ? 'Diagnóstico — o que você encontrou *' : 'Diagnóstico inicial — o que você encontrou'}
        placeholder="Ex.: mangueira de ar do freio rompida no eixo traseiro."
        value={rascunho.campos.diagnostico}
        onChange={(e) => rascunho.alterar('diagnostico', e.target.value)}
        onBlur={() => void rascunho.salvarAgora()}
        maxLength={4000}
      />
      {iniciado ? (
        <AreaM
          rotulo="Serviço realizado — o que foi feito *"
          placeholder="Ex.: troca da mangueira e teste de vazamento."
          value={rascunho.campos.servico_realizado}
          onChange={(e) => rascunho.alterar('servico_realizado', e.target.value)}
          onBlur={() => void rascunho.salvarAgora()}
          maxLength={4000}
        />
      ) : (
        <p className="px-1 text-[13.5px] leading-snug text-ink-3">Pode ser curto agora: você completa durante o serviço. Salva sozinho, até sem sinal.</p>
      )}
      <div className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3.5 py-3">
        <Placa placa={d.veiculo?.placa} tamanho="sm" />
        <span className="min-w-0 truncate text-[13.5px] text-ink-2">
          {d.chamado.ocorrencia_rotulo}
          {d.chamado.descricao ? ` — “${d.chamado.descricao}”` : ''}
        </span>
      </div>
    </>
  )
}
