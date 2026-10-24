import { useNavigate } from 'react-router-dom'
import { ChevronRight, Star } from 'lucide-react'
import { OCORRENCIAS, STATUS_SOS, WHATSAPP_SOS_PADRAO, formatarEta, linkTelefone, linkWhatsApp } from '@/sos/rotulos'
import type { ChamadoSOS } from '@/sos/tipos'
import { useCliente } from '../sessao'
import { BotaoApp, Faixa } from '../comum/ui'
import { useOnline } from '../comum/Pwa'
import { semVinculo, useCasca, useHomeCliente, useInfoPublica } from './dados'
import { useEnvioPendenteSOS } from './filaSOS'
import { ErroCarga } from './pecas'
import { Inicio, type PropsInicio } from './inicio/Inicio'
import { SemSinal } from './inicio/SemSinal'
import { Arte } from '../comum/Arte'
import { ARTE_MOBILE } from '../comum/kit3d'

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
  // A tela diz se o app PODE ajudar: sem conexão ela promove o telefone, que
  // é o canal que funciona quando este não funciona.
  const online = useOnline()
  const info = useInfoPublica()
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
        <SemSinal
          pendente={pendente}
          usuarioId={usuarioId}
          nome={d?.nome || conta.nome || ''}
          telefone={linkTelefone(info.data?.telefone)}
          online={online}
          aoEnviar={() => void enviarAgora()}
          aoDescartar={descartar}
        />
      ) : ativo ? (
        <CartaoSocorroAtivo chamado={ativo} />
      ) : null,
    avaliar: d?.pendente_avaliacao && !ativo ? <ConviteAvaliar chamado={d.pendente_avaliacao} /> : null,
    chamadoAtivo: !!ativo,
    online,
    telefone: linkTelefone(info.data?.telefone),
    whatsapp: linkWhatsApp(info.data?.whatsapp ?? WHATSAPP_SOS_PADRAO, 'Olá, Tecnoar! Vim pelo app SOS.'),
    // Igual ao SOS da barra: com chamado aberto, leva ao acompanhamento — nunca a um segundo pedido.
    aoSOS: () => navegar(ativo ? `/chamado/${ativo.id}` : '/sos'),
  }

  return <Inicio {...props} />
}

/* ── estados do socorro ─────────────────────────────────────────────────── */

function CartaoSocorroAtivo({ chamado }: { chamado: ChamadoSOS }) {
  const navegar = useNavigate()
  const s = STATUS_SOS[chamado.status]
  const aCaminho = chamado.status === 'a_caminho'
  return (
    <section aria-label="Socorro em andamento" className="home-socorro-compacto flex flex-col gap-3 rounded-[1.25rem] p-4 text-white">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[11px] font-semibold text-white/80">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#ff6600]" />
            <span className="relative inline-flex size-2.5 rounded-full bg-[#ff6600]" />
          </span>
          Socorro em andamento
        </span>
        <span className="num text-[12px] text-white/60">{chamado.protocolo}</span>
      </div>
      <div className="flex items-center gap-3">
        <Arte src={ARTE_MOBILE.seloSOS} alt="" classeImagem="size-14 shrink-0 object-contain" recuo={null} />
        <div className="min-w-0"><p className="font-display text-[18px] leading-tight font-bold">{s.cliente}</p>
        <p className="mt-1 text-[13px] text-white/70">{OCORRENCIAS[chamado.tipo_ocorrencia]?.rotulo ?? 'Socorro'}</p></div>
      </div>
      {aCaminho && chamado.eta_min != null && (
        <p className="flex items-baseline gap-2">
          <span className="text-[14px] text-white/70">Chega em cerca de</span>
          <span className="font-display text-[28px] leading-none font-black">{formatarEta(chamado.eta_min)}</span>
        </p>
      )}
      <BotaoApp tamanho="md" onClick={() => navegar(`/chamado/${chamado.id}`)} className="w-full max-w-[230px] self-end px-3 text-[14px]">
        <Arte src={ARTE_MOBILE.mapaBrasil} alt="" classeImagem="size-7 shrink-0 object-contain" recuo={null} /><span>Acompanhar agora</span> <ChevronRight className="size-4 shrink-0" />
      </BotaoApp>
    </section>
  )
}

/** Pedido feito sem sinal, esperando a conexão voltar para sair. */
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
        <span className="block text-[13px] text-ink-3">Avalie o especialista · leva 5 segundos</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-ink-3" />
    </button>
  )
}
