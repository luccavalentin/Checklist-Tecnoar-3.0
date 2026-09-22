import { useNavigate } from 'react-router-dom'
import { ChevronRight, CloudOff, MapPin, PhoneCall, Siren, Star } from 'lucide-react'
import { formatarCoordenadas } from '@/sos/geo'
import { OCORRENCIAS, STATUS_SOS, formatarEta, haQuanto, linkTelefone } from '@/sos/rotulos'
import type { ChamadoSOS } from '@/sos/tipos'
import { useCliente } from '../sessao'
import { BotaoApp, Faixa } from '../comum/ui'
import { useOnline } from '../comum/Pwa'
import { semVinculo, useCasca, useHomeCliente, useInfoPublica } from './dados'
import { pendenteExpirou, useEnvioPendenteSOS, type PedidoPendente } from './filaSOS'
import { ErroCarga } from './pecas'
import { Inicio, type PropsInicio } from './inicio/Inicio'

/**
 * Início do cliente, com a mesma composição nos dois temas (só as cores e a
 * foto do cartão mudam), nesta ordem de importância:
 *
 * 1. SOS. Nunca depende dos dados carregarem — sem internet ou com erro no
 *    banco, continua a um toque. Com um socorro em andamento, vira o
 *    acompanhamento dele.
 * 2. O veículo (e revisão vencida ou veículo na oficina).
 * 3. Atalhos.
 */
export function HomeCliente() {
  const { conta, usuarioId } = useCliente()
  const { naoLidas } = useCasca()
  const navegar = useNavigate()
  const home = useHomeCliente()
  const d = home.data
  const ativo = d?.chamado_ativo ?? null
  const { pendente, enviarAgora, descartar } = useEnvioPendenteSOS(usuarioId, (c) => navegar(`/chamado/${c.id}`))

  const props: PropsInicio = {
    nome: d?.nome || conta.nome || '',
    naoLidas,
    d,
    carregando: home.isLoading,
    avisos: (
      <>
        {home.isError && <ErroCarga erro={home.error} aoTentar={() => void home.refetch()} />}
        {semVinculo(d) && <Faixa tom="info">Seu pedido de socorro já funciona. O histórico da Tecnoar aparece assim que a conta for ligada ao seu cadastro.</Faixa>}
      </>
    ),
    socorro:
      pendente && !ativo ? (
        <CartaoPendente pendente={pendente} aoEnviar={() => void enviarAgora()} aoDescartar={descartar} />
      ) : ativo ? (
        <CartaoSocorroAtivo chamado={ativo} />
      ) : null,
    avaliar: d?.pendente_avaliacao && !ativo ? <ConviteAvaliar chamado={d.pendente_avaliacao} /> : null,
    chamadoAtivo: !!ativo,
    // Igual ao SOS da barra: com chamado aberto, leva ao acompanhamento — nunca a um segundo pedido.
    aoSOS: () => navegar(ativo ? `/chamado/${ativo.id}` : '/sos'),
  }

  return <Inicio {...props} />
}

/* ── estados do socorro ─────────────────────────────────────────────────── */

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
      className="sos-premium-row sos-native-card flex w-full items-center gap-3.5 rounded-[1.55rem] p-4 text-left"
    >
      <span className="sos-subtle-chip flex size-11 shrink-0 items-center justify-center rounded-2xl text-accent-ink">
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
