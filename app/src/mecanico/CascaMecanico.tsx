import { useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Bell, ChevronRight, ClipboardList, House, UserRound, Volume2, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sosDetalhe } from '@/sos/api'
import { destravarAudio, tocarAlerta } from '@/sos/alerta'
import { STATUS_SOS } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import { useRastreioDisponivel } from '@/sos/useRastreio'
import type { HomeMecanico, SituacaoMecanico } from '@/sos/tipos'
import { useMecanico } from '../sessao'
import { useNaoLidasApp } from '../comum/Notificacoes'
import { ProvedorAlertaSOS } from './AlertaNovoSOS'
import { ContextoCasca, type ValorCasca } from './contexto'
import { useHomeMecanico, usePulsoApp, useSomLiberado } from './dados'
import { aplicarNoChamado, useFila, useProcessadorFila } from './filaOffline'
import { Placa } from './pecas'
import { FolhaSituacao } from './Situacao'
import { useTemaMecanico } from './tema'

/**
 * Casca do app do mecânico: abas, alerta de SOS e envio de posição.
 *
 * Três coisas moram aqui e não nas telas, porque precisam continuar vivas
 * enquanto o mecânico troca de aba:
 * - o tempo real que dispara o alerta de novo SOS (em qualquer tela);
 * - o GPS de quem está disponível (a central precisa vê-lo no mapa);
 * - o atalho de volta para o atendimento em andamento.
 */
export function CascaMecanico() {
  useTemaMecanico()
  const { perfil, usuarioId } = useMecanico()
  const home = useHomeMecanico()
  const naoLidas = useNaoLidasApp(usuarioId)
  const [folhaSituacao, setFolhaSituacao] = useState(false)

  const ficha = home.data?.ficha ?? perfil.mecanico
  const situacao: SituacaoMecanico = ficha?.situacao ?? 'offline'
  const fila = useFila()
  const chamadoBanco = home.data?.chamado_atual ?? null
  // Etapa feita sem sinal já aparece na pílula (a fila manda quando voltar).
  const chamadoAtual = useMemo(() => (chamadoBanco ? aplicarNoChamado(chamadoBanco, fila.acoes) : null), [chamadoBanco, fila.acoes])
  const disponivel = situacao === 'disponivel' && !chamadoAtual
  const gps = useRastreioDisponivel(disponivel)
  usePulsoApp()
  // Ações de campo guardadas sem sinal saem daqui também (em qualquer aba).
  useProcessadorFila(usuarioId)
  const somLiberado = useSomLiberado()
  // O chamado em andamento fica carregado enquanto o mecânico anda pelas abas:
  // se o sinal cair, ele ainda abre o atendimento e segue (a fila manda depois).
  useQuery({
    queryKey: CHAVES_SOS.detalhe(chamadoAtual?.id ?? ''),
    queryFn: () => sosDetalhe(chamadoAtual?.id ?? ''),
    enabled: !!chamadoAtual,
    staleTime: 60_000,
  })
  const naFila = (home.data?.aguardando ?? []).filter((c) => !c.recusei).length
  // Na tela inicial o atendimento já aparece em destaque; a pílula é para as outras abas.
  const { pathname } = useLocation()
  // A Tecno IA ocupa o rodapé com o campo de mensagem: sem abas nem avisos flutuantes.
  const telaCheia = pathname.startsWith('/tecno-ia')
  const mostrarPilula = !!chamadoAtual && pathname !== '/' && !telaCheia
  const mostrarAvisoSom = !mostrarPilula && !telaCheia && disponivel && !somLiberado

  const valor = useMemo<ValorCasca>(
    () => ({ gps: { posicao: gps.posicao, erroGps: gps.erroGps, ativo: disponivel }, abrirSituacao: () => setFolhaSituacao(true) }),
    [gps.posicao, gps.erroGps, disponivel],
  )

  const itens: ItemAba[] = [
    { rota: '/', rotulo: 'Início', icone: House, contador: naFila || undefined },
    { rota: '/chamados', rotulo: 'Chamados', icone: ClipboardList },
    { rota: '/notificacoes', rotulo: 'Avisos', icone: Bell, contador: naoLidas || undefined },
    { rota: '/perfil', rotulo: 'Perfil', icone: UserRound },
  ]

  return (
    <ContextoCasca.Provider value={valor}>
      <ProvedorAlertaSOS posicao={gps.posicao}>
        <div className="mec mec-fundo">
          <Outlet />

          {/* Espaço extra no fim da página para a pílula de atendimento não cobrir conteúdo. */}
          {mostrarPilula && <div aria-hidden className="h-20" />}

          {mostrarPilula && chamadoAtual ? <PilulaAtendimento chamado={chamadoAtual} /> : mostrarAvisoSom ? <AvisoSom /> : null}

          {!telaCheia && <BarraAbas itens={itens} />}
        </div>

        <FolhaSituacao
          aberta={folhaSituacao}
          aoFechar={() => setFolhaSituacao(false)}
          situacao={situacao}
          aceitaSos={ficha?.aceita_sos ?? true}
          emChamado={!!chamadoAtual}
          reserva={gps.posicao}
        />
      </ProvedorAlertaSOS>
    </ContextoCasca.Provider>
  )
}

/* ── abas ───────────────────────────────────────────────────────────────── */

interface ItemAba {
  rota: string
  rotulo: string
  icone: LucideIcon
  contador?: number
}

/** Barra de abas encostada no rodapé, como a de um app de motorista. */
function BarraAbas({ itens }: { itens: ItemAba[] }) {
  return (
    <nav
      aria-label="Navegação"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/96 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur-xl"
    >
      <div className="mx-auto flex h-[4.25rem] max-w-xl items-stretch">
        {itens.map((i) => {
          const Icone = i.icone
          return (
            <NavLink
              key={i.rota}
              to={i.rota}
              end={i.rota === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11.5px] font-bold transition-colors',
                  isActive ? 'text-accent-ink dark:text-accent' : 'text-ink-3 active:text-ink-2',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-accent" />}
                  <span className="relative">
                    <Icone className="size-6" strokeWidth={isActive ? 2.5 : 2} />
                    {!!i.contador && (
                      <span className="num absolute -top-1.5 -right-3 flex min-w-[19px] items-center justify-center rounded-full bg-[#ff6600] px-1 text-[10.5px] leading-[19px] font-bold text-white ring-2 ring-surface">
                        {i.contador > 99 ? '99+' : i.contador}
                      </span>
                    )}
                  </span>
                  <span className="max-w-full truncate">{i.rotulo}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}

/**
 * Atendimento em andamento sempre à mão, logo acima da barra (ao alcance do
 * polegar), em qualquer aba que não seja a inicial.
 */
function PilulaAtendimento({ chamado }: { chamado: NonNullable<HomeMecanico['chamado_atual']> }) {
  return (
    <Link
      to={`/chamado/${chamado.id}`}
      className="entrada-suave sos-premium-action fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-40 mx-auto flex max-w-[34rem] items-center gap-3 rounded-2xl py-2.5 pr-3 pl-3.5 text-white active:brightness-95"
    >
      <span className="relative flex size-3 shrink-0" aria-hidden>
        <span className="mec-pulso absolute inset-0 rounded-full bg-white" />
        <span className="relative size-3 rounded-full bg-white" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[11px] font-extrabold tracking-[0.12em] text-white/85 uppercase">
          {STATUS_SOS[chamado.status].curto} · <span className="num">{chamado.protocolo}</span>
        </span>
        <span className="block truncate text-[15px] font-bold">{chamado.cliente_nome}</span>
      </span>
      <Placa placa={chamado.placa} tamanho="sm" className="max-[359px]:hidden" />
      <ChevronRight className="size-5 shrink-0" />
    </Link>
  )
}

/** App aberto por uma notificação ainda não recebeu toque: o som está mudo. */
function AvisoSom() {
  return (
    <button
      type="button"
      onClick={() => void destravarAudio().then((ok) => ok && tocarAlerta({ tipo: 'aviso' }))}
      aria-label="Ativar som dos chamados"
      title="Ativar som dos chamados"
      className="entrada-suave fixed top-[calc(env(safe-area-inset-top)+var(--faixa-rede,0px)+0.9rem)] right-[max(4.5rem,env(safe-area-inset-right))] z-40 flex size-10 items-center justify-center rounded-full border border-white/16 bg-[#002061]/88 text-white shadow-[0_10px_24px_-16px_rgb(0_32_97/0.9)] backdrop-blur-md active:scale-95"
    >
      <Volume2 className="size-[18px] text-[#00afef]" />
    </button>
  )
}
