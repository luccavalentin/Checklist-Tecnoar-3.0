import type { ComponentType, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, CalendarCheck, ChevronRight, CloudOff, History, MapPin, PhoneCall, Plus, Siren, Brain, Star, Truck, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatarCoordenadas } from '@/sos/geo'
import { OCORRENCIAS, ROTULO_TIPO_VEICULO, STATUS_SOS, formatarEta, haQuanto, linkTelefone } from '@/sos/rotulos'
import type { ChamadoSOS, HomeCliente as DadosHome } from '@/sos/tipos'
import { useCliente } from '../sessao'
import { Avatar, BotaoApp, Esqueleto, Faixa, LogoSOS } from '../comum/ui'
import { useOnline } from '../comum/Pwa'
import { dataNumerica, kmTexto, nomeVeiculo, primeiroNome, saudacao, semVinculo, useCasca, useHomeCliente, useInfoPublica, venceu } from './dados'
import { pendenteExpirou, useEnvioPendenteSOS, type PedidoPendente } from './filaSOS'
import { ErroCarga, PlacaVeiculo, Rotulo } from './pecas'

/**
 * Início do cliente — três níveis, nesta ordem de importância:
 *
 * 1. SOS: um botão grande, "PRECISO DE AJUDA". Nunca depende dos dados
 *    carregarem — sem internet ou com erro no banco, continua a um toque.
 * 2. O veículo: modelo, placa, último serviço, próxima revisão e km.
 * 3. Atalhos: Meus veículos, Histórico, Tecno IA, Revisões.
 *
 * Nada além disso. Com um socorro em andamento, o nível 1 vira o
 * acompanhamento dele.
 */
export function HomeCliente() {
  const { conta, usuarioId } = useCliente()
  const { naoLidas } = useCasca()
  const navegar = useNavigate()
  const home = useHomeCliente()
  const d = home.data
  const nome = primeiroNome(d?.nome || conta.nome)
  const ativo = d?.chamado_ativo ?? null
  const { pendente, enviarAgora, descartar } = useEnvioPendenteSOS(usuarioId, (c) => navegar(`/chamado/${c.id}`))

  return (
    <>
      <header className="cli-home-top z-30 pt-[calc(env(safe-area-inset-top)+var(--faixa-rede,0px))]">
        <div className="mx-auto flex h-16 max-w-xl items-center justify-between gap-3 px-4 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
          <LogoSOS negativo altura={58} />
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navegar('/notificacoes')}
              aria-label={naoLidas ? `Notificações, ${naoLidas} não lidas` : 'Notificações'}
              className="relative flex size-11 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 active:bg-white/10"
            >
              <Bell className="size-[22px]" />
              {naoLidas > 0 && (
                <span className="num absolute top-1 right-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-[#ff6600] px-1 text-[10px] leading-[18px] font-bold text-white ring-2 ring-canvas">
                  {naoLidas > 99 ? '99+' : naoLidas}
                </span>
              )}
            </button>
            <button type="button" onClick={() => navegar('/perfil')} aria-label="Minha conta" className="flex size-11 items-center justify-center rounded-full active:scale-95">
              <Avatar nome={d?.nome || conta.nome} tamanho="sm" className="ring-2 ring-white/18" />
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-xl flex-col gap-1 px-4 pt-1 pb-7 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
          <span className="text-[12px] font-semibold tracking-[0.08em] text-[#00afef] uppercase">Assistência Tecnoar</span>
          <h1 className="font-display text-[25px] leading-tight font-bold text-white">
            {saudacao()}
            {nome ? `, ${nome}` : ''}
          </h1>
          <p className="max-w-[18rem] text-[13.5px] leading-snug text-white/68">Socorro, manutenção e acompanhamento em uma experiência rápida.</p>
        </div>
      </header>

      <main className="entrada-suave mx-auto -mt-4 flex w-full max-w-xl flex-col gap-5 px-4 pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(6.5rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))]">
        {home.isError && <ErroCarga erro={home.error} aoTentar={() => void home.refetch()} />}
        {semVinculo(d) && <Faixa tom="info">Seu pedido de socorro já funciona. O histórico da Tecnoar aparece assim que a conta for ligada ao seu cadastro.</Faixa>}

        {/* ── nível 1: socorro ── */}
        {pendente && !ativo ? (
          <CartaoPendente pendente={pendente} aoEnviar={() => void enviarAgora()} aoDescartar={descartar} />
        ) : ativo ? (
          <CartaoSocorroAtivo chamado={ativo} />
        ) : (
          <BotaoPrecisoDeAjuda />
        )}

        {d?.pendente_avaliacao && !ativo && <ConviteAvaliar chamado={d.pendente_avaliacao} />}

        {/* ── nível 2: veículo ── */}
        <CartaoVeiculo dados={d} carregando={home.isLoading} />

        {naoLidas > 0 && (
          <Link to="/notificacoes" className="flex min-h-12 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 active:bg-surface-2">
            <Bell className="size-5 shrink-0 text-accent-ink" />
            <span className="min-w-0 flex-1 text-[14.5px] font-semibold text-ink">
              {naoLidas === 1 ? '1 aviso novo' : `${naoLidas} avisos novos`}
            </span>
            <ChevronRight className="size-5 shrink-0 text-ink-3" />
          </Link>
        )}

        {/* ── nível 3: atalhos ── */}
        <nav aria-label="Atalhos" className="grid grid-cols-4 gap-2">
          <Atalho para="/veiculos" icone={Truck} rotulo="Meus veículos" />
          <Atalho para="/historico" icone={History} rotulo="Histórico" />
          <Atalho para="/tecno-ia" icone={Brain} rotulo="Tecno IA" />
          <Atalho para="/revisoes" icone={CalendarCheck} rotulo="Revisões" contador={d?.lembretes} />
        </nav>
      </main>
    </>
  )
}

/* ── nível 1 ────────────────────────────────────────────────────────────── */

/** Ação principal da home: imediata, mas com acabamento de app premium. */
function BotaoPrecisoDeAjuda() {
  const navegar = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navegar('/sos')}
      className="cli-sos-stage flex w-full flex-col justify-between px-4 pt-4 pb-4 text-left transition-transform active:scale-[0.985]"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 rounded-full border border-[#00afef]/35 bg-[#0D1C33]/64 px-3 py-1.5 text-[11px] font-black tracking-[0.14em] text-white/90 uppercase backdrop-blur-md">
          <span className="size-2 rounded-full bg-[#00afef]" />
          SOS Tecnoar
        </span>
        <span className="rounded-full border border-white/14 bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white/82 backdrop-blur-md">24h</span>
      </span>

      <span className="flex items-end justify-between gap-4">
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] leading-snug font-semibold text-white/72">Assistência automotiva em tempo real</span>
          <span className="mt-1 block font-display text-[24px] leading-[1.02] font-black tracking-normal text-white">Preciso de ajuda</span>
          <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#ff6600] px-4 py-2 font-display text-[13px] font-bold text-white shadow-[0_12px_26px_-16px_rgb(255_102_0/0.9)]">
            Acionar SOS
            <ChevronRight className="size-4" />
          </span>
        </span>
        <span className="cli-sos-orb sos-respira shrink-0">
          <span className="flex flex-col items-center justify-center">
            <Siren className="sos-sirene size-7" strokeWidth={2.35} />
            <span className="font-display text-[22px] leading-none font-black tracking-normal">SOS</span>
          </span>
        </span>
      </span>
    </button>
  )
}

function CartaoSocorroAtivo({ chamado }: { chamado: ChamadoSOS }) {
  const navegar = useNavigate()
  const s = STATUS_SOS[chamado.status]
  const aCaminho = chamado.status === 'a_caminho' || chamado.status === 'aceito'
  return (
    <section aria-label="Socorro em andamento" className="flex flex-col gap-4 rounded-[1.75rem] bg-[#0D1C33] p-5 text-white shadow-[0_18px_40px_-26px_rgb(8_24_48/0.9)]">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[12px] font-bold tracking-[0.12em] text-white/80 uppercase">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#ff6600]" />
            <span className="relative inline-flex size-2.5 rounded-full bg-[#ff6600]" />
          </span>
          Socorro em andamento
        </span>
        <span className="num text-[12px] text-white/60">{chamado.protocolo}</span>
      </div>
      <div>
        <p className="font-display text-[22px] leading-tight font-bold">{s.cliente}</p>
        <p className="mt-1 text-[14px] text-white/70">{OCORRENCIAS[chamado.tipo_ocorrencia]?.rotulo ?? 'Socorro'}</p>
      </div>
      {aCaminho && chamado.eta_min != null && (
        <p className="flex items-baseline gap-2">
          <span className="text-[14px] text-white/70">Chega em cerca de</span>
          <span className="font-display text-[28px] leading-none font-black">{formatarEta(chamado.eta_min)}</span>
        </p>
      )}
      <BotaoApp tamanho="lg" largo onClick={() => navegar(`/chamado/${chamado.id}`)}>
        Acompanhar agora <ChevronRight className="size-5" />
      </BotaoApp>
    </section>
  )
}

/** Pedido feito sem sinal, esperando a conexão voltar para sair. */
function CartaoPendente({ pendente, aoEnviar, aoDescartar }: { pendente: PedidoPendente; aoEnviar: () => void; aoDescartar: () => void }) {
  const online = useOnline()
  const info = useInfoPublica()
  const tel = linkTelefone(info.data?.telefone)
  const p = pendente.pedido
  const expirou = pendenteExpirou(pendente)
  return (
    <section aria-label="Pedido de socorro guardado" className="flex flex-col gap-4 rounded-[1.75rem] border border-warn/30 bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-warn-soft text-warn-ink">
          <CloudOff className="size-6" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[18px] leading-tight font-bold text-ink">Pedido de socorro guardado</p>
          <p className="mt-1 text-[14px] leading-snug text-ink-2">
            {expirou
              ? `Guardado ${haQuanto(pendente.guardadoEm)}. Ainda precisa de ajuda? Envie agora.`
              : online
                ? 'Conexão de volta. Enviando…'
                : 'Sem sinal agora. Ele sai sozinho assim que a internet voltar.'}
          </p>
        </div>
      </div>
      <div className="rounded-2xl bg-surface-2 px-4 py-3 text-[13.5px] text-ink-2">
        <p className="font-semibold text-ink">{pendente.resumo.problema}</p>
        {p.latitude != null && p.longitude != null && (
          <p className="mt-1 flex items-center gap-1.5">
            <MapPin className="size-4 shrink-0 text-accent-ink" />
            <span className="num">{formatarCoordenadas({ lat: p.latitude, lng: p.longitude })}</span>
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {expirou && (
          <BotaoApp variante="sos" tamanho="lg" largo icone={Siren} disabled={!online} onClick={aoEnviar}>
            {online ? 'Enviar agora' : 'Sem internet'}
          </BotaoApp>
        )}
        {tel && (
          <a href={tel} className="flex min-h-12 items-center justify-center gap-2 rounded-[0.95rem] bg-[#0D1C33] font-display text-[15px] font-bold text-white">
            <PhoneCall className="size-5" /> Ligar para a Tecnoar
          </a>
        )}
        <button type="button" onClick={aoDescartar} className="min-h-11 text-[14px] font-semibold text-ink-3">
          Não preciso mais — apagar pedido
        </button>
      </div>
    </section>
  )
}

function ConviteAvaliar({ chamado }: { chamado: ChamadoSOS }) {
  const navegar = useNavigate()
  return (
    <button
      type="button"
      onClick={() => navegar(`/chamado/${chamado.id}`)}
      className="flex w-full items-center gap-3.5 rounded-[1.25rem] border border-line bg-surface p-4 text-left active:bg-surface-2"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
        <Star className="size-5 fill-current" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[15.5px] font-bold text-ink">Como foi o atendimento?</span>
        <span className="block text-[13px] text-ink-3">Avalie o mecânico · leva 5 segundos</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-ink-3" />
    </button>
  )
}

/* ── nível 2 ────────────────────────────────────────────────────────────── */

function CartaoVeiculo({ dados, carregando }: { dados: DadosHome | undefined; carregando: boolean }) {
  const navegar = useNavigate()
  if (carregando) return <Esqueleto className="h-[13.5rem] rounded-[1.25rem]" />
  const v = dados?.veiculo ?? null

  if (!v) {
    return (
      <button
        type="button"
        onClick={() => navegar('/veiculos?novo=1')}
        className="flex w-full items-center gap-4 rounded-[1.25rem] border border-dashed border-line-strong bg-surface p-4 text-left active:bg-surface-2"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
          <Plus className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[16px] font-bold text-ink">Cadastre seu veículo</span>
          <span className="block text-[13px] leading-snug text-ink-3">Com a placa salva, o socorro sai com um toque.</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-ink-3" />
      </button>
    )
  }

  const u = dados?.ultimo_servico ?? null
  const r = dados?.proxima_revisao ?? null
  const revisaoVencida = venceu(r?.vence_em)
  const detalhes = [v.tipo ? (ROTULO_TIPO_VEICULO[v.tipo] ?? v.tipo) : null, v.ano].filter(Boolean).join(' · ')
  const total = dados?.total_veiculos ?? 1

  return (
    <section aria-label="Seu veículo" className="overflow-hidden rounded-[1.25rem] border border-line bg-surface">
      <button type="button" onClick={() => navegar('/veiculos')} className="flex w-full flex-col gap-4 p-4 text-left active:bg-surface-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Rotulo>{total > 1 ? `Veículo principal · ${total} veículos` : 'Seu veículo'}</Rotulo>
            <p className="mt-0.5 font-display text-[21px] leading-tight font-bold break-words text-ink">{nomeVeiculo(v)}</p>
            {detalhes && <p className="mt-0.5 text-[13px] text-ink-3">{detalhes}</p>}
          </div>
          <PlacaVeiculo placa={v.placa} className="mt-1" />
        </div>

        <dl className="grid grid-cols-1 divide-y divide-line rounded-2xl bg-surface-2 min-[400px]:grid-cols-3 min-[400px]:divide-x min-[400px]:divide-y-0">
          <Dado rotulo="Último serviço" valor={u ? (u.encerrada ? dataNumerica(u.em) : 'Na oficina') : '—'} />
          <Dado
            rotulo="Próxima revisão"
            valor={r ? (r.vence_em ? dataNumerica(r.vence_em) : r.vence_km != null ? kmTexto(r.vence_km) : 'Pendente') : 'Em dia'}
            tom={r ? (revisaoVencida ? 'crit' : 'warn') : 'ok'}
          />
          <Dado rotulo="Quilometragem" valor={kmTexto(v.km_atual) ?? '—'} />
        </dl>
      </button>

      {(r || dados?.veiculo_na_oficina) && (
        <div className="flex flex-col divide-y divide-line border-t border-line">
          {dados?.veiculo_na_oficina && (
            <Link to="/historico?tipo=os" className="flex min-h-12 items-center gap-3 px-4 text-[14px] active:bg-surface-2">
              <Wrench className="size-[18px] shrink-0 text-cyan" />
              <span className="min-w-0 flex-1 font-semibold text-ink">Seu veículo está na oficina</span>
              <ChevronRight className="size-5 shrink-0 text-ink-3" />
            </Link>
          )}
          {r && (
            <Link to="/revisoes" className="flex min-h-12 items-center gap-3 px-4 text-[14px] active:bg-surface-2">
              <CalendarCheck className={cn('size-[18px] shrink-0', revisaoVencida ? 'text-crit' : 'text-warn')} />
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">{revisaoVencida ? 'Revisão vencida' : r.titulo || 'Revisão chegando'}</span>
              <span className="shrink-0 font-semibold text-accent-ink">Agendar</span>
            </Link>
          )}
        </div>
      )}
    </section>
  )
}

function Dado({ rotulo, valor, tom }: { rotulo: string; valor: ReactNode; tom?: 'ok' | 'warn' | 'crit' }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 px-3.5 py-2.5 min-[400px]:flex-col min-[400px]:items-start min-[400px]:justify-start min-[400px]:gap-1 min-[400px]:px-2.5 min-[400px]:py-3 min-[400px]:first:pl-3.5 min-[400px]:last:pr-3.5">
      <dt className="text-[12.5px] leading-tight font-medium text-ink-3 min-[400px]:text-[11.5px]">{rotulo}</dt>
      <dd
        className={cn(
          'truncate text-[14.5px] leading-tight font-bold min-[400px]:text-[14px]',
          tom === 'crit' ? 'text-crit-ink' : tom === 'warn' ? 'text-warn-ink' : tom === 'ok' ? 'text-ok-ink' : 'text-ink',
        )}
      >
        {valor}
      </dd>
    </div>
  )
}

/* ── nível 3 ────────────────────────────────────────────────────────────── */

function Atalho({ para, icone: Icone, rotulo, contador }: { para: string; icone: ComponentType<{ className?: string }>; rotulo: string; contador?: number }) {
  return (
    <Link to={para} className="group flex min-w-0 flex-col items-center gap-2 rounded-2xl py-1 text-center">
      <span className="relative flex size-14 items-center justify-center rounded-2xl border border-line bg-surface text-accent-ink transition-transform group-active:scale-95">
        <Icone className="size-6" />
        {!!contador && (
          <span className="num absolute -top-1.5 -right-1.5 flex min-w-[20px] items-center justify-center rounded-full bg-[#ff6600] px-1 text-[10.5px] leading-5 font-bold text-white ring-2 ring-canvas">
            {contador > 99 ? '99+' : contador}
          </span>
        )}
      </span>
      <span className="text-[12.5px] leading-tight font-semibold text-ink-2">{rotulo}</span>
    </Link>
  )
}
