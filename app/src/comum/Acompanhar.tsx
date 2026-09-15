import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Clock, LinkIcon, MapPin, Truck } from 'lucide-react'
import { sosAcompanhar } from '@/sos/api'
import { MapaSOS, type MarcadorMapa } from '@/sos/Mapa'
import { ProgressoChamado } from '@/sos/componentes'
import { formatarDistancia, formatarEta, haQuanto, horaCurta } from '@/sos/rotulos'
import { LogoSOS, VazioApp } from './ui'

/**
 * Acompanhamento compartilhado — o link que o motorista manda para a família
 * ou para a frota. Sem login. Mostra só o necessário, com posição arredondada
 * (~100 m): dá para saber que o socorro está chegando, não para rastrear
 * ninguém.
 */
export function Acompanhar() {
  const { token = '' } = useParams()
  const dados = useQuery({
    queryKey: ['sos', 'publico', token],
    queryFn: () => sosAcompanhar(token),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s && ['concluido', 'cancelado', 'servico_finalizado'].includes(s) ? false : 10_000
    },
  })

  const d = dados.data
  if (dados.isLoading) {
    return <div className="flex min-h-dvh items-center justify-center bg-canvas text-ink-3">Carregando…</div>
  }
  if (!d || !d.ok) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6">
        <LogoSOS altura={34} className="mb-6" />
        <VazioApp
          icone={LinkIcon}
          titulo="Link expirado"
          descricao="Este acompanhamento não está mais disponível. Peça um link novo a quem pediu o socorro."
        />
      </div>
    )
  }

  const marcadores: MarcadorMapa[] = []
  if (d.cliente_lat != null && d.cliente_lng != null)
    marcadores.push({ id: 'cliente', tipo: 'cliente', ponto: { lat: d.cliente_lat, lng: d.cliente_lng }, rotulo: 'Veículo' })
  if (d.mecanico_lat != null && d.mecanico_lng != null && !['concluido', 'cancelado'].includes(d.status))
    marcadores.push({
      id: 'mecanico',
      tipo: 'mecanico',
      ponto: { lat: d.mecanico_lat, lng: d.mecanico_lng },
      rotulo: d.mecanico || 'Mecânico',
      pulsar: d.status === 'a_caminho',
    })

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex items-center justify-between gap-3 bg-[#0D1C33] px-4 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-3 text-white">
        <LogoSOS negativo altura={26} />
        <span className="num text-[12px] text-white/70">{d.protocolo}</span>
      </header>
      <div className="relative h-[46dvh] min-h-64">
        <MapaSOS marcadores={marcadores} className="size-full" />
      </div>
      <main className="-mt-6 flex flex-1 flex-col gap-4 rounded-t-3xl bg-surface px-5 pt-5 pb-[calc(2rem+env(safe-area-inset-bottom))] shadow-e3 relative z-[500]">
        <div>
          <p className="lbl">Socorro Tecnoar</p>
          <h1 className="mt-1 font-display text-[24px] leading-tight font-extrabold text-ink">{d.status_rotulo}</h1>
          {d.veiculo && <p className="text-[14px] text-ink-2">{d.veiculo}</p>}
        </div>
        {d.status === 'a_caminho' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-accent-soft p-4">
              <Clock className="size-5 text-accent" />
              <p className="mt-2 font-display text-[22px] font-extrabold text-ink">{formatarEta(d.eta_min)}</p>
              <p className="text-[12.5px] text-ink-2">previsão de chegada</p>
            </div>
            <div className="rounded-2xl bg-surface-2 p-4">
              <MapPin className="size-5 text-ink-2" />
              <p className="mt-2 font-display text-[22px] font-extrabold text-ink">{formatarDistancia(d.distancia_km)}</p>
              <p className="text-[12.5px] text-ink-2">de distância</p>
            </div>
          </div>
        )}
        <ProgressoChamado
          chamado={{
            status: d.status,
            recebido_em: d.recebido_em,
            aceito_em: d.aceito_em,
            a_caminho_em: d.aceito_em,
            chegou_em: d.chegou_em,
            iniciado_em: d.chegou_em,
            finalizado_em: d.finalizado_em,
            concluido_em: d.concluido_em,
          }}
        />
        {d.mecanico && (
          <p className="flex items-center gap-2 text-[14px] text-ink-2">
            <Truck className="size-4 text-ink-3" /> Mecânico: <strong className="text-ink">{d.mecanico}</strong>
            {d.posicao_em && <span className="text-ink-3">· posição {haQuanto(d.posicao_em)}</span>}
          </p>
        )}
        <p className="mt-auto text-[12px] text-ink-3">
          Link válido até {horaCurta(d.expira_em)} de {new Date(d.expira_em).toLocaleDateString('pt-BR')}. Atualiza sozinho a cada 10 segundos.
        </p>
      </main>
    </div>
  )
}
