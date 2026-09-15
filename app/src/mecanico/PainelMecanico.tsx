import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  BellRing,
  Brain,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Star,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/componentes/ui/Toast'
import { ativarNotificacoes, permissaoAtual } from '@/notificacoes/sistema'
import { destravarAudio } from '@/sos/alerta'
import { STATUS_SOS, formatarDistancia, haQuanto } from '@/sos/rotulos'
import type { HomeMecanico, SituacaoMecanico } from '@/sos/tipos'
import { useMecanico } from '../sessao'
import { Avatar, LogoSOS } from '../comum/ui'
import { useAlertaSOS } from './AlertaNovoSOS'
import { useCasca } from './contexto'
import { primeiroNome, useAgora, useDefinirSituacao, useDetalheChamado, useHomeMecanico, useOnline } from './dados'
import { FaixaFila } from './FilaPendente'
import { aplicarNoChamado, useFila } from './filaOffline'
import { IconeOcorrencia, Placa } from './pecas'
import { modeloVeiculo } from './PecasAtendimento'
import { BotaoM, EsqueletoM, FolhaM, RotuloM, SecaoM, SeloM, TelaM } from './ui'

/**
 * Início do mecânico — extremamente operacional.
 *
 * De cima para baixo: quem é, o status (um controle grande: DISPONÍVEL em
 * verde, INDISPONÍVEL em vermelho), os números do dia, o chamado atual com
 * "Continuar atendimento", os chamados esperando resposta e os atalhos.
 */
export function PainelMecanico() {
  const { perfil, usuarioId } = useMecanico()
  const home = useHomeMecanico()
  const { gps, abrirSituacao } = useCasca()
  const { abrir } = useAlertaSOS()
  const definir = useDefinirSituacao()
  const agora = useAgora(30_000)
  const online = useOnline()

  const h = home.data
  const ficha = h?.ficha ?? perfil.mecanico
  const situacao: SituacaoMecanico = ficha?.situacao ?? 'offline'
  const aceitaSos = ficha?.aceita_sos ?? true
  const guardadas = useFila().acoes
  const chamadoBanco = h?.chamado_atual ?? null
  // Etapa feita sem sinal já vale no cartão (a fila manda quando voltar).
  const chamadoAtual = useMemo(() => (chamadoBanco ? aplicarNoChamado(chamadoBanco, guardadas) : null), [chamadoBanco, guardadas])
  const fila = h?.aguardando ?? []
  const nome = primeiroNome(h?.nome ?? perfil.nome)
  const carregando = home.isLoading && !h

  function ficarDisponivel() {
    // Dentro do toque: libera o som da sirene para o próximo chamado.
    void destravarAudio()
    definir.mutate({ situacao: 'disponivel', aceitaSos: aceitaSos ? undefined : true, reserva: gps.posicao })
  }

  return (
    <>
      <header className="mx-auto flex max-w-xl flex-col gap-3 px-4 pt-[calc(env(safe-area-inset-top)+0.85rem)]">
        <div className="flex items-center justify-between gap-3">
          <LogoSOS altura={38} className="dark:hidden" />
          <LogoSOS negativo altura={38} className="hidden dark:block" />
          <Link to="/perfil" aria-label="Seu perfil" className="rounded-full ring-2 ring-line active:scale-95">
            <Avatar nome={perfil.nome} url={perfil.avatar_url} tamanho="sm" />
          </Link>
        </div>
        <div>
          <p className="text-[13px] font-medium text-ink-3 first-letter:uppercase">
            {new Date(agora).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
          <h1 className="font-display text-[30px] leading-[1.05] font-semibold tracking-tight text-ink">Olá, {nome}</h1>
        </div>
      </header>

      <TelaM>
        {home.isError && !h ? (
          <ErroPainel mensagem={(home.error as Error).message} tentando={home.isFetching} aoTentar={() => void home.refetch()} />
        ) : (
          <>
            {/* Ações de campo feitas sem sinal, esperando para sair. */}
            <FaixaFila />

            {/* Um cartão só para o dia: o interruptor em cima, os números embaixo.
                Cinco caixas soltas eram o que dava cara de painel de sistema. */}
            <section className="overflow-hidden rounded-[1.5rem] border border-line bg-surface mec-sombra">
              <ControleStatus
                situacao={situacao}
                carregando={carregando}
                aceitaSos={aceitaSos}
                chamadoId={chamadoAtual?.id ?? null}
                mudando={definir.isPending}
                online={online}
                aoFicarDisponivel={ficarDisponivel}
                aoFicarIndisponivel={() => definir.mutate({ situacao: 'indisponivel' })}
              />
              <NumerosDoDia h={h} emAndamento={chamadoAtual ? 1 : 0} />
              {!chamadoAtual && (
                <button
                  type="button"
                  onClick={abrirSituacao}
                  className="flex min-h-11 w-full items-center justify-between border-t border-line px-4 text-[13.5px] font-medium text-ink-2 active:bg-surface-2"
                >
                  Pausa e outras opções
                  <ChevronRight className="size-4 text-ink-3" />
                </button>
              )}
            </section>

            {/* Além de aceitar da fila, o mecânico abre o próprio chamado. */}
            <AbrirChamado atual={chamadoAtual} />

            {chamadoAtual && <CartaoChamadoAtual chamado={chamadoAtual} />}

            {fila.length > 0 && (
              <SecaoM
                titulo="Chamados aguardando"
                acao={<span className="num rounded-full bg-[#ff6600] px-2 py-0.5 text-[12px] font-bold text-white">{fila.length}</span>}
              >
                <ul className="flex flex-col gap-2">
                  {fila.map((c) => (
                    <li key={c.id}>
                      <CartaoFila chamado={c} agora={agora} aoAbrir={() => abrir(c.id, c)} />
                    </li>
                  ))}
                </ul>
                {situacao !== 'disponivel' && !chamadoAtual && (
                  <p className="px-1 text-[12.5px] text-ink-3">Você pode aceitar mesmo indisponível — mas só é avisado automaticamente quando está disponível.</p>
                )}
              </SecaoM>
            )}

            <AvisoNotificacoes usuarioId={usuarioId} />

            <Atalhos />
          </>
        )}
      </TelaM>
    </>
  )
}

/* ── status: o controle grande ──────────────────────────────────────────── */

function ControleStatus({
  situacao,
  carregando,
  aceitaSos,
  chamadoId,
  mudando,
  online,
  aoFicarDisponivel,
  aoFicarIndisponivel,
}: {
  situacao: SituacaoMecanico
  carregando: boolean
  aceitaSos: boolean
  chamadoId: string | null
  mudando: boolean
  online: boolean
  aoFicarDisponivel: () => void
  aoFicarIndisponivel: () => void
}) {
  const navegar = useNavigate()
  if (carregando) return <EsqueletoM className="m-4 h-12 rounded-2xl" />

  // Em atendimento: o status é do chamado, não da mão do mecânico.
  if (chamadoId || situacao === 'em_atendimento') {
    return (
      <button
        type="button"
        onClick={() => chamadoId && navegar(`/chamado/${chamadoId}`)}
        className="flex min-h-[4.25rem] w-full items-center gap-3 bg-cyan-soft/60 px-4 py-3 text-left active:bg-cyan-soft"
      >
        <span className="relative flex size-3 shrink-0" aria-hidden>
          <span className="mec-pulso absolute inset-0 rounded-full bg-cyan" />
          <span className="relative size-3 rounded-full bg-cyan" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[17px] leading-tight font-semibold text-ink">Em atendimento</span>
          <span className="block truncate text-[12.5px] text-ink-2">Chamado ativo em campo</span>
        </span>
      </button>
    )
  }

  const disponivel = situacao === 'disponivel'
  const recebendo = disponivel && aceitaSos
  const pausa = situacao === 'pausa'
  const titulo = disponivel ? 'Disponível' : pausa ? 'Em pausa' : 'Indisponível'
  let sub: string
  if (!online) sub = 'Sem internet'
  else if (disponivel && !aceitaSos) sub = 'SOS desligado'
  else if (recebendo) sub = 'Recebendo SOS'
  else if (pausa) sub = 'Toque para voltar'
  else sub = 'Toque para ficar disponível'

  function alternar() {
    if (recebendo) aoFicarIndisponivel()
    else aoFicarDisponivel()
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={recebendo}
      aria-label={`Status: ${titulo}. Tocar para ${recebendo ? 'ficar indisponível' : 'ficar disponível'}`}
      onClick={alternar}
      disabled={mudando || !online}
      className="flex min-h-[4.5rem] w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors active:bg-surface-2 disabled:cursor-not-allowed"
    >
      <span className="relative flex size-2.5 shrink-0" aria-hidden>
        {recebendo && <span className="mec-pulso absolute inset-0 rounded-full bg-[#00afef]" />}
        <span className={cn('relative size-2.5 rounded-full', recebendo ? 'bg-[#00afef]' : disponivel || pausa ? 'bg-warn' : 'bg-ink-3')} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[18px] leading-tight font-semibold tracking-tight text-ink">{titulo}</span>
        <span className="mt-0.5 block truncate text-[13px] leading-snug text-ink-3">{sub}</span>
      </span>

      {/* Interruptor no desenho do sistema: trilho fino, botão branco. */}
      <span
        aria-hidden
        className={cn('relative h-[1.9rem] w-[3.15rem] shrink-0 rounded-full transition-colors duration-200', recebendo ? 'bg-[#00afef]' : 'bg-line-strong')}
      >
        <span
          className={cn(
            'absolute top-[3px] flex size-6 items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgb(8_24_48/0.25)] transition-all duration-200',
            recebendo ? 'left-[calc(100%-1.65rem)]' : 'left-[3px]',
          )}
        >
          {mudando && <Loader2 className="size-3.5 animate-spin text-ink-3" />}
        </span>
      </span>
    </button>
  )
}

/* ── números do dia ─────────────────────────────────────────────────────── */

function NumerosDoDia({ h, emAndamento }: { h: HomeMecanico | undefined; emAndamento: number }) {
  const nota = h?.hoje.nota_media
  return (
    <dl className="grid grid-cols-4 divide-x divide-line border-t border-line">
      <Estatistica rotulo="Hoje" valor={h ? h.hoje.atendimentos : '–'} />
      <Estatistica rotulo="Em curso" valor={h ? emAndamento : '–'} destaque={!!emAndamento} />
      <Estatistica rotulo="Finalizados" valor={h ? h.hoje.concluidos : '–'} />
      <Estatistica
        rotulo="Avaliação"
        valor={nota != null ? Number(nota).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–'}
        icone={nota != null}
      />
    </dl>
  )
}

function Estatistica({ rotulo, valor, destaque, icone }: { rotulo: string; valor: ReactNode; destaque?: boolean; icone?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 px-1 py-3">
      <dd className={cn('num flex items-center gap-1 text-[21px] leading-none font-semibold', destaque ? 'text-cyan-ink' : 'text-ink')}>
        {valor}
        {icone && <Star className="size-3.5 fill-[#ff9a3d] text-[#ff9a3d]" />}
      </dd>
      <dt className="truncate text-[11.5px] text-ink-3">{rotulo}</dt>
    </div>
  )
}

/* ── chamado atual ──────────────────────────────────────────────────────── */

function CartaoChamadoAtual({ chamado }: { chamado: NonNullable<HomeMecanico['chamado_atual']> }) {
  const navegar = useNavigate()
  // O detalhe já fica carregado pela casca: dali vem o modelo do veículo.
  const detalhe = useDetalheChamado(chamado.id)
  const veiculo = detalhe.data ? modeloVeiculo(detalhe.data) : null
  return (
    <section className="entrada-suave overflow-hidden rounded-[1.5rem] border-2 border-accent/60 bg-surface">
      <div className="flex flex-col gap-1 p-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <RotuloM className="text-accent-ink">Chamado atual</RotuloM>
          <SeloM tom="laranja" ponto>
            {STATUS_SOS[chamado.status].curto}
          </SeloM>
        </div>
        <p className="num mt-1 text-[14px] font-semibold text-ink-2">{chamado.protocolo}</p>
        <p className="line-clamp-2 font-display text-[23px] leading-tight font-extrabold text-ink">{veiculo ?? chamado.cliente_nome}</p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <Placa placa={chamado.placa} />
          <span className="min-w-0 truncate text-[15px] font-semibold text-ink">{chamado.ocorrencia_rotulo}</span>
        </div>
        {veiculo && <p className="truncate text-[13.5px] text-ink-3">{chamado.cliente_nome}</p>}
      </div>
      <div className="px-4 pb-4">
        <BotaoM variante="laranja" tamanho="xxl" largo onClick={() => navegar(`/chamado/${chamado.id}`)}>
          Continuar atendimento
        </BotaoM>
      </div>
    </section>
  )
}

/* ── abrir chamado ──────────────────────────────────────────────────────── */

/**
 * Chamado aberto pelo mecânico em campo (cliente parou, ligou direto, achou
 * na estrada). Com um atendimento em andamento, o banco não deixa abrir
 * outro — o botão avisa e leva ao atendimento atual.
 */
function AbrirChamado({ atual }: { atual: { id: string; protocolo: string; cliente_nome: string } | null }) {
  const navegar = useNavigate()
  const [aviso, setAviso] = useState(false)
  const ocupado = !!atual
  return (
    <>
      <button
        type="button"
        onClick={() => (ocupado ? setAviso(true) : navegar('/novo-chamado'))}
        className={cn(
          'flex min-h-[4.35rem] w-full items-center gap-3 rounded-[1.2rem] px-3.5 py-3 text-left transition-transform active:scale-[0.99]',
          ocupado ? 'border-2 border-line bg-surface' : 'bg-[#0D1C33] text-white shadow-[0_14px_30px_-18px_rgb(8_24_48/0.9)] dark:bg-[#002061]',
        )}
      >
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', ocupado ? 'bg-surface-2 text-ink-3' : 'bg-[#ff6600] text-white')}>
          <Plus className="size-6" strokeWidth={2.6} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block font-display text-[17px] leading-tight font-bold tracking-normal', ocupado ? 'text-ink-2' : 'text-white')}>
            Novo chamado
          </span>
          <span className={cn('mt-0.5 block text-[13px] leading-snug', ocupado ? 'text-ink-3' : 'text-white/75')}>
            {ocupado ? 'Termine o atendimento atual primeiro' : 'Cliente na sua frente ou que ligou direto'}
          </span>
        </span>
        <ChevronRight className={cn('size-5 shrink-0', ocupado ? 'text-ink-3' : 'text-white/70')} />
      </button>

      <FolhaM
        aberta={aviso && !!atual}
        aoFechar={() => setAviso(false)}
        titulo="Um atendimento por vez"
        descricao={atual ? `Você está no ${atual.protocolo} (${atual.cliente_nome}). Finalize esse atendimento para abrir outro chamado.` : undefined}
        rodape={
          <>
            <BotaoM variante="laranja" tamanho="xl" largo onClick={() => atual && navegar(`/chamado/${atual.id}`)}>
              Continuar atendimento
            </BotaoM>
            <BotaoM variante="fantasma" largo onClick={() => setAviso(false)}>
              Fechar
            </BotaoM>
          </>
        }
      />
    </>
  )
}

/* ── fila ───────────────────────────────────────────────────────────────── */

function CartaoFila({ chamado: c, agora, aoAbrir }: { chamado: HomeMecanico['aguardando'][number]; agora: number; aoAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className={cn(
        'flex w-full items-center gap-3 rounded-[1.25rem] border bg-surface p-3.5 text-left transition-transform active:scale-[0.99]',
        c.para_mim ? 'border-2 border-accent' : c.prioridade === 'emergencia' ? 'border-2 border-crit/60' : 'border-line',
        c.recusei && 'opacity-70',
      )}
    >
      <IconeOcorrencia tipo={c.tipo_ocorrencia} prioridade={c.prioridade} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 truncate font-display text-[16px] font-bold text-ink">{c.ocorrencia_rotulo}</p>
          {c.para_mim && <SeloM tom="laranja">Para você</SeloM>}
          {c.prioridade === 'emergencia' && !c.para_mim && <SeloM tom="vermelho">Emergência</SeloM>}
          {c.recusei && <SeloM>Você recusou</SeloM>}
        </div>
        <p className="truncate text-[14px] text-ink-2">{c.cliente_nome}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] font-semibold text-ink-3">
          <Placa placa={c.placa} tamanho="sm" />
          <span className="num flex items-center gap-1">
            <MapPin className="size-3.5" />
            {c.distancia_km != null ? formatarDistancia(c.distancia_km) : '—'}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="size-3.5" />
            {haQuanto(c.recebido_em, agora)}
          </span>
        </div>
      </div>
      <ChevronRight className="size-5 shrink-0 text-ink-3" />
    </button>
  )
}

/* ── atalhos ────────────────────────────────────────────────────────────── */

function Atalhos() {
  const itens: Array<{ rotulo: string; icone: LucideIcon; para: string }> = [
    { rotulo: 'Histórico de chamados', icone: ClipboardList, para: '/chamados' },
    // Todas as OS do mecânico; a do chamado atual está no próprio atendimento.
    { rotulo: 'Ordens de serviço', icone: FileText, para: '/os' },
    { rotulo: 'Produtos e estoque', icone: Package, para: '/catalogo/produtos' },
    { rotulo: 'Serviços', icone: Wrench, para: '/catalogo/servicos' },
    { rotulo: 'Tecno IA', icone: Brain, para: '/tecno-ia' },
  ]
  return (
    <SecaoM titulo="Atalhos">
      <nav aria-label="Atalhos" className="overflow-hidden rounded-[1.5rem] border border-line bg-surface mec-sombra">
        {itens.map((i) => {
          const Icone = i.icone
          return (
            <Link
              key={i.rotulo}
              to={i.para}
              className="group flex min-h-[3.4rem] items-center gap-3.5 px-4 active:bg-surface-2 [&:not(:last-child)>span:last-child]:border-b [&:not(:last-child)>span:last-child]:border-line"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[0.7rem] bg-accent-soft text-accent-ink">
                <Icone className="size-[18px]" />
              </span>
              <span className="flex min-h-[3.4rem] min-w-0 flex-1 items-center justify-between gap-2">
                <span className="truncate text-[15.5px] font-medium text-ink">{i.rotulo}</span>
                <ChevronRight className="size-4 shrink-0 text-ink-3" />
              </span>
            </Link>
          )
        })}
      </nav>
    </SecaoM>
  )
}

/* ── avisos ─────────────────────────────────────────────────────────────── */

/** Sem notificação, o SOS só toca com o app aberto na tela. */
function AvisoNotificacoes({ usuarioId }: { usuarioId: string | null }) {
  const toast = useToast()
  const [permissao, setPermissao] = useState(() => permissaoAtual())
  if (permissao === 'granted') return null

  async function ativar() {
    if (!usuarioId) return
    const r = await ativarNotificacoes(usuarioId)
    setPermissao(permissaoAtual())
    if (r === 'ativadas') toast.ok('Notificações ativadas', 'Os chamados de SOS chegam mesmo com o app fechado.')
    else if (r === 'negada') toast.atencao('Notificações bloqueadas', 'Libere as notificações do app nas configurações do aparelho.')
    else toast.atencao('Indisponível neste aparelho', 'No iPhone, instale o app na tela de início para receber avisos.')
  }

  return (
    <section className="flex items-center gap-3 rounded-[1.5rem] border border-line bg-surface p-3.5 mec-sombra">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn-ink">
        <BellRing className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] leading-tight font-semibold text-ink">
          {permissao === 'denied' ? 'Notificações bloqueadas' : 'Receba SOS com o app fechado'}
        </p>
        <p className="text-[13px] leading-snug text-ink-2">
          {permissao === 'denied'
            ? 'Libere nas configurações do aparelho para não perder chamados.'
            : permissao === 'indisponivel'
              ? 'No iPhone, instale o app na tela de início primeiro.'
              : 'Sem isso, o chamado só toca com o app aberto.'}
        </p>
      </div>
      {permissao === 'default' && (
        <BotaoM variante="escuro" tamanho="md" onClick={() => void ativar()}>
          Ativar
        </BotaoM>
      )}
    </section>
  )
}

function ErroPainel({ mensagem, tentando, aoTentar }: { mensagem: string; tentando: boolean; aoTentar: () => void }) {
  return (
    <section className="flex flex-col items-center gap-3 rounded-[1.25rem] border border-line bg-surface px-5 py-8 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-crit-soft text-crit-ink">
        <AlertTriangle className="size-7" />
      </span>
      <p className="font-display text-[18px] font-bold text-ink">Não foi possível carregar o início</p>
      <p className="max-w-xs text-[14px] leading-relaxed text-ink-2">{mensagem}</p>
      <BotaoM variante="escuro" icone={RefreshCw} carregando={tentando} onClick={aoTentar}>
        Tentar de novo
      </BotaoM>
    </section>
  )
}
