import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  BellRing,
  Brain,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Clock,
  FileText,
  Loader2,
  MapPin,
  Moon,
  Package,
  Pause,
  Phone,
  PhoneCall,
  RefreshCw,
  Star,
  Sun,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/componentes/ui/Toast'
import { ativarNotificacoes, permissaoAtual } from '@/notificacoes/sistema'
import { destravarAudio } from '@/sos/alerta'
import { enderecoDoPonto } from '@/sos/geo'
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
import { aplicarTemaMecanico } from './tema'
import { BotaoM, EsqueletoM, FolhaM, RotuloM, SecaoM, SeloM } from './ui'
import './inicioMecanico.css'

/**
 * Início do mecânico — extremamente operacional.
 *
 * De cima para baixo: quem é (com a foto de campo), o status com a chave
 * liga/desliga (DISPONÍVEL recebe chamados; INDISPONÍVEL não), a área de
 * atendimento, os números do dia, o chamado atual com "Continuar
 * atendimento", o novo chamado, os que esperam resposta, os acessos rápidos
 * e os últimos chamados. Claro e escuro têm o mesmo desenho.
 */
export function PainelMecanico() {
  const { perfil, usuarioId } = useMecanico()
  const home = useHomeMecanico()
  const { gps, abrirSituacao, naoLidas } = useCasca()
  const { abrir } = useAlertaSOS()
  const definir = useDefinirSituacao()
  const agora = useAgora(30_000)
  const online = useOnline()
  const navegar = useNavigate()

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
    <div className="mi">
      <header className="mi-topo pt-[calc(env(safe-area-inset-top)+0.6rem)]">
        <div aria-hidden className="mi-foto" />
        <img aria-hidden src="/brand/tecnoar-negativo.svg" alt="" className="mi-logo-camisa" draggable={false} />
        <p aria-hidden className="mi-lema">
          Você
          <br />
          sempre em
          <br />
          movimento
        </p>

        <div className="mi-barra">
          <span className="hidden dark:block">
            <LogoSOS negativo altura={52} />
          </span>
          <span className="dark:hidden">
            <LogoSOS altura={52} />
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={alternarTema} aria-label="Trocar entre modo claro e escuro" className="mi-redondo">
              <Moon className="size-[19px] dark:hidden" strokeWidth={1.8} />
              <Sun className="hidden size-[19px] dark:block" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={() => navegar('/notificacoes')}
              aria-label={naoLidas ? `Avisos, ${naoLidas} não lidos` : 'Avisos'}
              className="mi-redondo mi-sino relative"
            >
              <Bell className="size-[20px]" strokeWidth={1.8} />
              {naoLidas > 0 && <span aria-hidden className="mi-sino-ponto" />}
            </button>
            <Link to="/perfil" aria-label="Seu perfil" className="mi-redondo mi-avatar active:scale-95">
              <Avatar nome={perfil.nome} url={perfil.avatar_url} className="size-full bg-transparent text-[14px] dark:bg-transparent" />
            </Link>
          </div>
        </div>

        <div className="mi-saudacao">
          <p className="mi-data">{new Date(agora).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
          <h1 className="mi-ola">
            Olá, <span className="text-[#FF6A00]">{nome || 'mecânico'}!</span>
          </h1>
          <p className="mi-sub">Pronto para o próximo atendimento?</p>
        </div>
      </header>

      <main className="mi-conteudo">
        {home.isError && !h ? (
          <ErroPainel mensagem={(home.error as Error).message} tentando={home.isFetching} aoTentar={() => void home.refetch()} />
        ) : (
          <>
            {/* Ações de campo feitas sem sinal, esperando para sair. */}
            <FaixaFila />

            <div className="mi-linha-status">
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
              <CartaoArea />
            </div>

            {chamadoAtual && <CartaoChamadoAtual chamado={chamadoAtual} />}

            <NumerosDoDia h={h} emAndamento={chamadoAtual ? 1 : 0} />

            {/* Além de aceitar da fila, o mecânico abre o próprio chamado. */}
            <AbrirChamado atual={chamadoAtual} />

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

            <AcessosRapidos aoPausa={abrirSituacao} />

            <UltimosChamados h={h} agora={agora} />
          </>
        )}
      </main>
    </div>
  )
}

function alternarTema() {
  aplicarTemaMecanico(document.documentElement.classList.contains('dark') ? 'claro' : 'escuro')
}

/* ── status: a chave liga/desliga ───────────────────────────────────────── */

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
  if (carregando) return <EsqueletoM className="mi-status h-[5.4rem] rounded-[1.2rem]" />

  // Em atendimento: o status é do chamado, não da mão do mecânico.
  if (chamadoId || situacao === 'em_atendimento') {
    return (
      <button type="button" onClick={() => chamadoId && navegar(`/chamado/${chamadoId}`)} className="mi-cartao mi-status mi-status-campo text-left">
        <span aria-hidden className="mi-status-ponto" />
        <span className="min-w-0 flex-1">
          <span className="mi-status-rotulo">Status atual</span>
          <span className="mi-status-titulo">EM ATENDIMENTO</span>
          <span className="mi-status-sub">Chamado em campo</span>
        </span>
        <ChevronRight className="size-5 shrink-0 opacity-70" />
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
  else if (recebendo) sub = 'Recebendo chamados'
  else if (pausa) sub = 'Toque para voltar'
  else sub = 'Não recebe chamados'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={recebendo}
      aria-label={`Status: ${titulo}. Tocar para ${recebendo ? 'ficar indisponível' : 'ficar disponível'}`}
      onClick={() => (recebendo ? aoFicarIndisponivel() : aoFicarDisponivel())}
      disabled={mudando || !online}
      className={cn('mi-cartao mi-status text-left disabled:cursor-not-allowed disabled:opacity-70', recebendo ? 'mi-status-on' : 'mi-status-off')}
    >
      <span aria-hidden className="mi-status-ponto" />
      <span className="min-w-0 flex-1">
        <span className="mi-status-rotulo">Status atual</span>
        <span className="mi-status-titulo">{titulo}</span>
        <span className="mi-status-sub">{sub}</span>
      </span>
      <span aria-hidden className="mi-chave">
        <span className="mi-chave-bola">{mudando && <Loader2 className="size-3.5 animate-spin text-[#536781]" />}</span>
      </span>
    </button>
  )
}

/** Onde o mecânico está recebendo chamados agora (cidade pela posição do GPS). */
function CartaoArea() {
  const { gps } = useCasca()
  const [cidade, setCidade] = useState<string | null>(null)
  // Arredondado (~1 km): a cidade não muda a cada metro andado.
  const lat = gps.posicao ? Number(gps.posicao.lat.toFixed(2)) : null
  const lng = gps.posicao ? Number(gps.posicao.lng.toFixed(2)) : null
  useEffect(() => {
    if (lat == null || lng == null) return
    let vivo = true
    void enderecoDoPonto({ lat, lng }).then((e) => {
      const ultimo = e?.split(' — ').pop() ?? null
      if (vivo && ultimo) setCidade(ultimo.replace('/', ' - '))
    })
    return () => {
      vivo = false
    }
  }, [lat, lng])
  return (
    <Link to="/perfil" className="mi-cartao mi-area">
      <span className="mi-area-icone">
        <MapPin className="size-5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="mi-area-titulo">
          Minha área{' '}
          <br />
          de atendimento
        </span>
        {cidade && <span className="mi-area-cidade">{cidade}</span>}
      </span>
      <ChevronRight className="size-4 shrink-0 opacity-70" />
    </Link>
  )
}

/* ── números do dia ─────────────────────────────────────────────────────── */

function NumerosDoDia({ h, emAndamento }: { h: HomeMecanico | undefined; emAndamento: number }) {
  const nota = h?.hoje.nota_media
  return (
    <dl className="mi-numeros">
      <Estatistica icone={Phone} rotulo="Hoje" valor={h ? h.hoje.atendimentos : '–'} />
      <Estatistica icone={Clock} rotulo="Em andamento" valor={h ? emAndamento : '–'} />
      <Estatistica icone={CircleCheck} rotulo="Finalizados" valor={h ? h.hoje.concluidos : '–'} />
      <Estatistica
        icone={Star}
        rotulo="Avaliação"
        valor={nota != null ? Number(nota).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '–'}
      />
    </dl>
  )
}

function Estatistica({ icone: Icone, rotulo, valor }: { icone: LucideIcon; rotulo: string; valor: ReactNode }) {
  return (
    <div className="mi-cartao mi-numero">
      <Icone className="mi-numero-icone" strokeWidth={1.7} />
      <dd className="mi-numero-valor num">{valor}</dd>
      <dt className="mi-numero-rotulo">{rotulo}</dt>
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
    <section className="entrada-suave sos-native-card overflow-hidden rounded-[1.4rem]">
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
      <button type="button" onClick={() => (ocupado ? setAviso(true) : navegar('/novo-chamado'))} className={cn('mi-novo', ocupado && 'mi-novo-ocupado')}>
        <span className="mi-novo-icone">
          <BellRing className="size-7" strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="mi-novo-titulo">Novo chamado</span>
          <span className="mi-novo-sub">{ocupado ? 'Termine o atendimento atual primeiro' : 'Cliente na sua frente ou que ligou direto'}</span>
        </span>
        <span className="mi-novo-seta">
          <ChevronRight className="size-6" strokeWidth={2.2} />
        </span>
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
        'sos-choice-card flex w-full items-center gap-3 rounded-[1.25rem] p-3.5 text-left transition-transform active:scale-[0.99]',
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

/* ── acessos rápidos ────────────────────────────────────────────────────── */

const TODOS_ATALHOS: Array<{ rotulo: string; icone: LucideIcon; para: string }> = [
  { rotulo: 'Histórico de chamados', icone: ClipboardList, para: '/chamados' },
  // Todas as OS do mecânico; a do chamado atual está no próprio atendimento.
  { rotulo: 'Ordens de serviço', icone: Wrench, para: '/os' },
  { rotulo: 'Produtos e estoque', icone: Package, para: '/catalogo/produtos' },
  { rotulo: 'Serviços', icone: FileText, para: '/catalogo/servicos' },
  { rotulo: 'Tecno IA', icone: Brain, para: '/tecno-ia' },
  { rotulo: 'Avisos', icone: Bell, para: '/notificacoes' },
]

function AcessosRapidos({ aoPausa }: { aoPausa: () => void }) {
  const [todos, setTodos] = useState(false)
  return (
    <section className="flex flex-col gap-3">
      <div className="mi-secao-topo">
        <h2 className="mi-secao-titulo">Acessos rápidos</h2>
        <button type="button" onClick={() => setTodos(true)} className="mi-ver-todos">
          Ver todos <ChevronRight className="size-4" />
        </button>
      </div>
      <nav aria-label="Acessos rápidos" className="mi-acessos">
        <Acesso para="/chamados" icone={ClipboardList} rotulo={['Histórico', 'de chamados']} />
        <Acesso para="/os" icone={Wrench} rotulo={['Ordens', 'de serviço']} />
        <Acesso para="/catalogo/produtos" icone={Package} rotulo={['Produtos', 'e estoque']} />
        <Acesso aoTocar={aoPausa} icone={Pause} rotulo={['Pausa e', 'outras opções']} />
      </nav>
      <FolhaM aberta={todos} aoFechar={() => setTodos(false)} titulo="Acessos">
        <nav className="flex flex-col gap-1.5 pb-2">
          {TODOS_ATALHOS.map((i) => {
            const Icone = i.icone
            return (
              <Link
                key={i.para}
                to={i.para}
                onClick={() => setTodos(false)}
                className="flex min-h-12 items-center gap-3 rounded-2xl px-2 text-[15px] font-medium text-ink active:bg-surface-2"
              >
                <span className="sos-subtle-chip flex size-9 shrink-0 items-center justify-center rounded-full text-accent-ink">
                  <Icone className="size-[18px]" />
                </span>
                <span className="min-w-0 flex-1 truncate">{i.rotulo}</span>
                <ChevronRight className="size-4 text-ink-3" />
              </Link>
            )
          })}
        </nav>
      </FolhaM>
    </section>
  )
}

function Acesso({ para, aoTocar, icone: Icone, rotulo }: { para?: string; aoTocar?: () => void; icone: LucideIcon; rotulo: [string, string] }) {
  const miolo = (
    <>
      <span className="mi-acesso-icone">
        <Icone className="size-[19px]" strokeWidth={1.8} />
      </span>
      <span className="mi-acesso-rotulo">
        {rotulo[0]}
        <br />
        {rotulo[1]}
      </span>
      <ChevronRight className="mi-acesso-seta" strokeWidth={2} />
    </>
  )
  if (para)
    return (
      <Link to={para} className="mi-cartao mi-acesso">
        {miolo}
      </Link>
    )
  return (
    <button type="button" onClick={aoTocar} className="mi-cartao mi-acesso text-left">
      {miolo}
    </button>
  )
}

/* ── últimos chamados ───────────────────────────────────────────────────── */

function quando(iso: string, agora: number): string {
  const d = new Date(iso)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const hoje = new Date(agora).toDateString() === d.toDateString()
  return `${hoje ? 'Hoje' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} • ${hora}`
}

function UltimosChamados({ h, agora }: { h: HomeMecanico | undefined; agora: number }) {
  const lista = (h?.historico ?? []).slice(0, 3)
  if (!lista.length) return null
  return (
    <section className="flex flex-col gap-3">
      <div className="mi-secao-topo">
        <h2 className="mi-secao-titulo">Últimos chamados</h2>
        <Link to="/chamados" className="mi-ver-todos">
          Ver todos <ChevronRight className="size-4" />
        </Link>
      </div>
      <ul className="flex flex-col gap-2.5">
        {lista.map((c) => {
          const tom = c.status === 'concluido' || c.status === 'servico_finalizado' ? 'ok' : c.status === 'cancelado' ? 'neutro' : 'andamento'
          return (
            <li key={c.id}>
              <Link to={`/chamado/${c.id}`} className="mi-cartao mi-ultimo">
                <span className={cn('mi-ultimo-icone', `mi-tom-${tom}`)}>
                  <Phone className="size-5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="mi-ultimo-protocolo num">{c.protocolo}</span>
                    <span className={cn('mi-selo', `mi-selo-${tom}`)}>{c.status_rotulo}</span>
                  </span>
                  <span className="mi-ultimo-cliente">Cliente: {c.cliente_nome}</span>
                  <span className="mi-ultimo-extra">{[c.placa, c.ocorrencia_rotulo].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="mi-ultimo-quando">{quando(c.recebido_em, agora)}</span>
                <ChevronRight className="size-4 shrink-0 opacity-60" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
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
    <section className="mi-cartao mi-aviso">
      <span className="mi-aviso-icone">
        <PhoneCall className="size-6" strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="mi-aviso-titulo">{permissao === 'denied' ? 'Notificações bloqueadas' : 'Receba SOS com o app fechado'}</p>
        <p className="mi-aviso-texto">
          {permissao === 'denied'
            ? 'Libere nas configurações do aparelho para não perder chamados.'
            : permissao === 'indisponivel'
              ? 'No iPhone, instale o app na tela de início primeiro.'
              : 'Sem isso, o chamado só toca com o app aberto.'}
        </p>
      </div>
      {permissao === 'default' && (
        <button type="button" onClick={() => void ativar()} className="mi-aviso-botao">
          Ativar
        </button>
      )}
    </section>
  )
}

function ErroPainel({ mensagem, tentando, aoTentar }: { mensagem: string; tentando: boolean; aoTentar: () => void }) {
  return (
    <section className="sos-native-card flex flex-col items-center gap-3 rounded-[1.55rem] px-5 py-8 text-center">
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
