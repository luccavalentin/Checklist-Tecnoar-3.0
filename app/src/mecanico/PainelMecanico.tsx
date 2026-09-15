import { useMemo, useState } from 'react'
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
  Power,
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
import { BotaoM, EsqueletoM, FolhaM, NumeroM, RotuloM, SecaoM, SeloM, TelaM } from './ui'

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
          <LogoSOS altura={54} className="dark:hidden" />
          <LogoSOS negativo altura={54} className="hidden dark:block" />
          <Link to="/perfil" aria-label="Seu perfil" className="rounded-full ring-2 ring-line active:scale-95">
            <Avatar nome={perfil.nome} url={perfil.avatar_url} tamanho="sm" />
          </Link>
        </div>
        <div>
          <p className="text-[13px] font-semibold text-ink-3 first-letter:uppercase">
            {new Date(agora).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </p>
          <h1 className="font-display text-[24px] leading-[1.08] font-bold tracking-normal text-ink">Olá, {nome}</h1>
        </div>
      </header>

      <TelaM>
        {home.isError && !h ? (
          <ErroPainel mensagem={(home.error as Error).message} tentando={home.isFetching} aoTentar={() => void home.refetch()} />
        ) : (
          <>
            {/* Ações de campo feitas sem sinal, esperando para sair. */}
            <FaixaFila />

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
            {!chamadoAtual && (
              <button type="button" onClick={abrirSituacao} className="-mt-2 self-end px-2 py-1.5 text-[13px] font-semibold text-ink-3 underline-offset-4 active:underline">
                Pausa e outras opções
              </button>
            )}

            <NumerosDoDia h={h} emAndamento={chamadoAtual ? 1 : 0} />

            {/* Além de aceitar da fila, o mecânico abre o próprio chamado. */}
            <AbrirChamado atual={chamadoAtual} />

            <BannerCampo />

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

function BannerCampo() {
  return (
    <section className="mec-hero-foto flex items-end p-3.5">
      <div className="max-w-[15rem]">
        <p className="text-[10.5px] font-black tracking-[0.16em] text-white/68 uppercase">Tecnoar em campo</p>
        <p className="mt-1 font-display text-[18px] leading-[1.04] font-bold tracking-normal text-white">Rota, OS e peças em um fluxo único.</p>
      </div>
    </section>
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
  if (carregando) return <EsqueletoM className="h-[4.5rem] rounded-[1.25rem]" />

  // Em atendimento: o status é do chamado, não da mão do mecânico.
  if (chamadoId || situacao === 'em_atendimento') {
    return (
      <button
        type="button"
        onClick={() => chamadoId && navegar(`/chamado/${chamadoId}`)}
        className="flex min-h-[3.55rem] w-fit max-w-full items-center gap-3 rounded-2xl border border-cyan/24 bg-cyan-soft px-3.5 py-2.5 text-left active:scale-[0.99]"
      >
        <span className="relative flex size-3 shrink-0" aria-hidden>
          <span className="mec-pulso absolute inset-0 rounded-full bg-cyan" />
          <span className="relative size-3 rounded-full bg-cyan" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[10.5px] font-extrabold tracking-[0.14em] text-cyan-ink uppercase">Status</span>
          <span className="block font-display text-[16px] leading-tight font-bold text-ink">Em atendimento</span>
          <span className="block truncate text-[12.5px] text-ink-2">Chamado ativo em campo</span>
        </span>
      </button>
    )
  }

  const disponivel = situacao === 'disponivel'
  const recebendo = disponivel && aceitaSos
  const pausa = situacao === 'pausa'
  const titulo = disponivel ? 'DISPONÍVEL' : pausa ? 'EM PAUSA' : 'INDISPONÍVEL'
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
      className={cn(
        'flex min-h-[3.65rem] w-fit max-w-full items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left shadow-[0_1px_2px_rgb(8_24_48/0.05)] transition-colors active:scale-[0.99] disabled:cursor-not-allowed',
        recebendo
          ? 'border border-[#00afef]/34 bg-[#002061] text-white mec-sombra-verde'
          : disponivel || pausa
            ? 'border border-warn/32 bg-warn-soft'
            : 'border border-crit/32 bg-crit-soft',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cn('flex items-center gap-2 font-display text-[10.5px] font-extrabold tracking-[0.14em] uppercase', recebendo ? 'text-white/82' : 'text-ink-3')}>
          <span className="relative flex size-2" aria-hidden>
            {recebendo && <span className="mec-pulso absolute inset-0 rounded-full bg-[#00afef]" />}
            <span className={cn('relative size-2 rounded-full', recebendo ? 'bg-[#00afef]' : disponivel || pausa ? 'bg-warn' : 'bg-crit')} />
          </span>
          Status
        </span>
        <span
          className={cn(
            'mt-0.5 block font-display text-[16px] leading-[1.05] font-bold tracking-normal',
            recebendo ? 'text-white' : disponivel || pausa ? 'text-warn-ink' : 'text-crit-ink',
          )}
        >
          {titulo}
        </span>
        <span className={cn('mt-0.5 block truncate text-[12px] leading-snug font-medium', recebendo ? 'text-white/78' : 'text-ink-2')}>{sub}</span>
      </span>

      <span
        aria-hidden
        className={cn('relative h-8 w-14 shrink-0 rounded-full transition-colors', recebendo ? 'bg-white/24' : 'bg-line-strong')}
      >
        <span
          className={cn(
            'absolute top-1 flex size-6 items-center justify-center rounded-full bg-white shadow transition-all',
            recebendo ? 'left-[calc(100%-1.75rem)] text-[#002061]' : 'left-1 text-ink-3',
          )}
        >
          {mudando ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" strokeWidth={2.5} />}
        </span>
      </span>
    </button>
  )
}

/* ── números do dia ─────────────────────────────────────────────────────── */

function NumerosDoDia({ h, emAndamento }: { h: HomeMecanico | undefined; emAndamento: number }) {
  const nota = h?.hoje.nota_media
  return (
    <div className="grid grid-cols-2 gap-2 min-[360px]:grid-cols-4">
      <NumeroM rotulo="Chamados hoje" valor={h ? h.hoje.atendimentos : '–'} />
      <NumeroM rotulo="Em andamento" valor={h ? emAndamento : '–'} tom={emAndamento ? 'ciano' : 'neutro'} />
      <NumeroM rotulo="Finalizados hoje" valor={h ? h.hoje.concluidos : '–'} tom="ok" />
      <NumeroM
        rotulo="Avaliação"
        valor={nota != null ? Number(nota).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–'}
        icone={nota != null ? Star : undefined}
        tom="ambar"
      />
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
    { rotulo: 'Chamados', icone: ClipboardList, para: '/chamados' },
    // Todas as OS do mecânico; a do chamado atual está no próprio atendimento.
    { rotulo: 'OS', icone: FileText, para: '/os' },
    { rotulo: 'Produtos', icone: Package, para: '/catalogo/produtos' },
    { rotulo: 'Serviços', icone: Wrench, para: '/catalogo/servicos' },
    { rotulo: 'Tecno IA', icone: Brain, para: '/tecno-ia' },
  ]
  return (
    <SecaoM titulo="Atalhos">
      {/* Celular: 3 + 2 (os dois de baixo mais largos); a partir de 400 px, 5 lado a lado. */}
      <nav aria-label="Atalhos" className="grid grid-cols-6 gap-2 min-[400px]:grid-cols-5">
        {itens.map((i, n) => {
          const Icone = i.icone
          return (
            <Link
              key={i.rotulo}
              to={i.para}
              className={cn(
                'flex min-h-[5.25rem] min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-1 text-center mec-sombra active:bg-surface-2 min-[400px]:col-span-1',
                n < 3 ? 'col-span-2' : 'col-span-3',
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                <Icone className="size-5" strokeWidth={2.3} />
              </span>
              <span className="w-full truncate text-[12.5px] leading-tight font-bold text-ink min-[400px]:text-[11.5px]">{i.rotulo}</span>
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
    <section className="flex items-center gap-3 rounded-[1.25rem] border border-warn/40 bg-warn-soft p-3.5">
      <BellRing className="size-6 shrink-0 text-warn-ink" />
      <div className="min-w-0 flex-1">
        <p className="font-display text-[15px] leading-tight font-bold text-ink">
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
