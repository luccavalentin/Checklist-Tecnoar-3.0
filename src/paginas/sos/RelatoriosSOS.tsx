import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CircleMarker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Download, Handshake, Package, Receipt, Route, Star, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { moeda } from '@/lib/formatos'
import { Botao } from '@/componentes/ui/Botao'
import { Segmentado } from '@/componentes/ui/Campo'
import { Esqueleto } from '@/componentes/ui/Estados'
import { GradeMetricas, Metrica } from '@/componentes/ui/Metrica'
import { Painel, CabecalhoPainel } from '@/componentes/ui/Painel'
import { sosRelatorio } from '@/sos/api'
import { MapaSOS } from '@/sos/Mapa'
import { OCORRENCIAS, ORDEM_OCORRENCIAS, formatarDuracao } from '@/sos/rotulos'
import type { RelatorioSOS } from '@/sos/tipos'
import { ErroSOS, moedaCurta } from './comum'

type Periodo = 'hoje' | '7d' | '30d' | '90d'

function intervalo(p: Periodo): { inicio: string; fim: string; rotulo: string } {
  const fim = new Date()
  fim.setHours(23, 59, 59, 999)
  const inicio = new Date()
  inicio.setHours(0, 0, 0, 0)
  const dias = { hoje: 0, '7d': 6, '30d': 29, '90d': 89 }[p]
  inicio.setDate(inicio.getDate() - dias)
  const rotulo = { hoje: 'hoje', '7d': 'nos últimos 7 dias', '30d': 'nos últimos 30 dias', '90d': 'nos últimos 90 dias' }[p]
  return { inicio: inicio.toISOString(), fim: fim.toISOString(), rotulo }
}

function pct(parte: number, todo: number): string {
  return todo ? `${Math.round((parte / todo) * 100)}%` : '—'
}

/**
 * Relatórios do SOS — o que a gestão precisa para decidir escala, cobrar
 * prazo e ver quanto o socorro fatura. Tudo vem de uma consulta só
 * (`sos_relatorio`), calculada no banco sobre os mesmos chamados, itens e
 * OS do Checklist.
 */
export function RelatoriosSOS() {
  const [periodo, setPeriodo] = useState<Periodo>('30d')
  const faixa = useMemo(() => intervalo(periodo), [periodo])
  const dados = useQuery({
    queryKey: ['sos', 'relatorio', periodo],
    queryFn: () => sosRelatorio(faixa.inicio, faixa.fim),
    staleTime: 60_000,
  })
  const r = dados.data?.ok ? dados.data : undefined

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
          <Segmentado<Periodo>
            rotuloGrupo="Período do relatório"
            valor={periodo}
            onChange={setPeriodo}
            opcoes={[
              { valor: 'hoje', rotulo: 'Hoje' },
              { valor: '7d', rotulo: '7 dias' },
              { valor: '30d', rotulo: '30 dias' },
              { valor: '90d', rotulo: '90 dias' },
            ]}
          />
        </div>
        <Botao variante="neutro" iconeInicio={<Download />} disabled={!r} onClick={() => r && exportarCsv(r, periodo)} className="max-sm:h-11">
          Exportar CSV
        </Botao>
      </div>

      {dados.isError ? (
        <ErroSOS erro={dados.error} aoTentarNovamente={() => void dados.refetch()} />
      ) : (
        <>
          <GradeMetricas colunas={4}>
            <Metrica rotulo="Chamados" valor={r ? r.total : '—'} glosa={faixa.rotulo} tom="accent" carregando={dados.isLoading} />
            <Metrica
              rotulo="Concluídos"
              valor={r ? r.concluidos : '—'}
              glosa={r ? `${pct(r.concluidos, r.total)} do total` : undefined}
              tom="ok"
              carregando={dados.isLoading}
            />
            <Metrica
              rotulo="Aceite no prazo"
              valor={r?.aceite_no_prazo_pct != null ? `${r.aceite_no_prazo_pct.toLocaleString('pt-BR')}%` : '—'}
              glosa="aceitos dentro do tempo configurado"
              tom={r?.aceite_no_prazo_pct != null && r.aceite_no_prazo_pct < 80 ? 'atencao' : 'cyan'}
              alerta={r?.aceite_no_prazo_pct != null && r.aceite_no_prazo_pct < 60}
              carregando={dados.isLoading}
            />
            <Metrica
              rotulo="Valor em peças e serviços"
              valor={r ? moedaCurta(r.valor_itens) : '—'}
              glosa={r ? `${r.os_geradas} OS geradas no Checklist` : undefined}
              tom="neutro"
              carregando={dados.isLoading}
            />
            <Metrica
              rotulo="Cancelados"
              valor={r ? r.cancelados : '—'}
              glosa={r ? `${pct(r.cancelados, r.total)} do total` : undefined}
              tom={r && r.total && r.cancelados / r.total > 0.2 ? 'critico' : 'neutro'}
              carregando={dados.isLoading}
            />
            <Metrica rotulo="Emergências" valor={r ? r.emergencias : '—'} glosa="freios e acidentes" tom="critico" carregando={dados.isLoading} />
            <Metrica
              rotulo="Nota média"
              valor={r?.nota_media != null ? r.nota_media.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}
              glosa={r ? `${r.avaliacoes} avaliações de clientes` : undefined}
              tom="ok"
              icone={<Star />}
              carregando={dados.isLoading}
            />
            <Metrica rotulo="Em aberto" valor={r ? r.em_aberto : '—'} glosa="ainda sem conclusão" tom="atencao" carregando={dados.isLoading} />
          </GradeMetricas>

          <MetricasPremium r={r} carregando={dados.isLoading} />

          <Painel semPadding>
            <CabecalhoPainel titulo="Tempos médios" descricao="Do pedido do cliente até o serviço pronto." />
            <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
              {[
                ['Aceite', r?.tempo_medio_aceite_seg, 'do pedido ao mecânico aceitar'],
                ['Chegada', r?.tempo_medio_deslocamento_seg, 'do aceite ao mecânico no local'],
                ['Serviço', r?.tempo_medio_servico_seg, 'do início ao fim do serviço'],
                ['Total', r?.tempo_medio_total_seg, 'do pedido à finalização'],
              ].map(([rotulo, seg, glosa]) => (
                <div key={rotulo as string} className="flex flex-col gap-1 bg-surface p-4">
                  <span className="lbl">{rotulo as string}</span>
                  <span className="num font-display text-[24px] font-semibold text-ink">
                    {dados.isLoading ? '…' : formatarDuracao(seg as number | null | undefined)}
                  </span>
                  <span className="text-[12px] text-ink-3">{glosa as string}</span>
                </div>
              ))}
            </div>
          </Painel>

          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
            <Painel>
              <CabecalhoPainel className="-mx-5 -mt-5 mb-4" titulo="Chamados por dia" descricao="Barra cheia: concluídos. Contorno: o total do dia." />
              {dados.isLoading ? <Esqueleto className="h-40" /> : <GraficoDias r={r} />}
            </Painel>
            <Painel>
              <CabecalhoPainel className="-mx-5 -mt-5 mb-4" titulo="Horário dos pedidos" descricao="Onde a escala de plantão precisa estar mais forte." />
              {dados.isLoading ? <Esqueleto className="h-40" /> : <GraficoHoras r={r} />}
            </Painel>
          </div>

          <Painel semPadding>
            <CabecalhoPainel
              titulo="Onde os caminhões param"
              descricao="Mapa de calor dos SOS do período, agrupados a cada ~1 km. Círculo maior, mais chamados; vermelho, houve emergência."
            />
            <div className="p-4 sm:p-5">
              {dados.isLoading ? <Esqueleto className="h-72 rounded-xl sm:h-96" /> : <MapaCalor pontos={r?.pontos ?? []} />}
            </div>
          </Painel>

          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2">
            <Painel>
              <CabecalhoPainel className="-mx-5 -mt-5 mb-4" titulo="Tipos de problema" />
              <ListaOcorrencias r={r} carregando={dados.isLoading} />
            </Painel>
            <Painel>
              <CabecalhoPainel className="-mx-5 -mt-5 mb-4" titulo="Clientes que mais acionaram" />
              {!r?.por_cliente.length ? (
                <p className="py-6 text-center text-[13px] text-ink-3">{dados.isLoading ? 'Carregando…' : 'Sem chamados no período.'}</p>
              ) : (
                <ol className="flex flex-col divide-y divide-line">
                  {r.por_cliente.map((c, i) => (
                    <li key={c.cliente_id} className="flex items-center gap-3 py-2.5">
                      <span className="num w-5 shrink-0 text-center text-[12px] text-ink-3">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{c.nome}</span>
                      <span className="num shrink-0 text-[12.5px] text-ink-2">{c.chamados} SOS</span>
                      <span className="num hidden w-28 shrink-0 text-right text-[12.5px] text-ink sm:block">{moeda(c.valor_itens)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Painel>
          </div>

          <Painel semPadding>
            <CabecalhoPainel titulo="Desempenho dos mecânicos" descricao="Atendimentos, prazos, recusas, nota e o que cada um lançou." />
            {!r?.por_mecanico.length ? (
              <p className="px-5 py-8 text-center text-[13px] text-ink-3">{dados.isLoading ? 'Carregando…' : 'Nenhum atendimento no período.'}</p>
            ) : (
              <>
                {/* Celular: cartões; a tabela só a partir de `lg`. */}
                <ul className="flex flex-col divide-y divide-line lg:hidden">
                  {r.por_mecanico.map((m) => (
                    <li key={m.mecanico_id} className="flex flex-col gap-2 px-4 py-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-[14px] font-semibold text-ink">{m.nome}</p>
                        <span className="num shrink-0 text-[12.5px] text-ink-2">
                          {m.concluidos}/{m.atendimentos} concluídos
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-[11.5px] text-ink-3">
                        <span>
                          Aceite <b className="num text-ink">{formatarDuracao(m.tempo_medio_aceite_seg)}</b>
                        </span>
                        <span>
                          Chegada <b className="num text-ink">{formatarDuracao(m.tempo_medio_deslocamento_seg)}</b>
                        </span>
                        <span>
                          Nota <b className="num text-ink">{m.nota_media ?? '—'}</b>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full border-collapse text-[13px]">
                    <thead>
                      <tr className="text-left">
                        {['Mecânico', 'Atend.', 'Concl.', 'Canc.', 'Recusas', 'Aceite', 'Chegada', 'Serviço', 'Nota', 'Itens lançados'].map((h, i) => (
                          <th key={h} className={cn('lbl h-9 border-b border-line-strong bg-surface-2 px-3.5', i > 0 && 'text-right')}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {r.por_mecanico.map((m) => (
                        <tr key={m.mecanico_id} className="border-b border-line last:border-b-0">
                          <td className="px-3.5 py-2.5 font-medium text-ink">{m.nome}</td>
                          <td className="num px-3.5 text-right">{m.atendimentos}</td>
                          <td className="num px-3.5 text-right text-ok-ink">{m.concluidos}</td>
                          <td className="num px-3.5 text-right">{m.cancelados}</td>
                          <td className={cn('num px-3.5 text-right', m.recusas > 2 && 'text-warn-ink')}>{m.recusas}</td>
                          <td className="num px-3.5 text-right">{formatarDuracao(m.tempo_medio_aceite_seg)}</td>
                          <td className="num px-3.5 text-right">{formatarDuracao(m.tempo_medio_deslocamento_seg)}</td>
                          <td className="num px-3.5 text-right">{formatarDuracao(m.tempo_medio_servico_seg)}</td>
                          <td className="num px-3.5 text-right">{m.nota_media ?? '—'}</td>
                          <td className="num px-3.5 text-right font-medium text-ink">{moeda(m.valor_itens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Painel>

          <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Painel>
              <CabecalhoPainel className="-mx-5 -mt-5 mb-4" titulo="Peças e serviços mais usados" descricao="Lançados do catálogo do Checklist nos atendimentos." />
              <ListaItens itens={r?.itens ?? []} carregando={dados.isLoading} />
            </Painel>
            <Painel>
              <CabecalhoPainel className="-mx-5 -mt-5 mb-4" titulo="Motivos de cancelamento" />
              {!r?.motivos_cancelamento.length ? (
                <p className="py-6 text-center text-[13px] text-ink-3">{dados.isLoading ? 'Carregando…' : 'Nenhum cancelamento. 👏'}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {r.motivos_cancelamento.map((m, i) => (
                    <li key={i} className="flex items-start justify-between gap-3 rounded-md bg-surface-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-[13px] text-ink">{m.motivo}</p>
                        <p className="text-[11px] text-ink-3">por {m.papel === 'cliente' ? 'cliente' : m.papel === 'central' ? 'central' : 'sistema'}</p>
                      </div>
                      <span className="num shrink-0 text-[13px] font-semibold text-ink">{m.n}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Painel>
          </div>
        </>
      )}
    </div>
  )
}

/* ── contratos, orçamentos e deslocamento ───────────────────────────────── */

function MetricasPremium({ r, carregando }: { r: RelatorioSOS | undefined; carregando: boolean }) {
  const sla = r?.sla
  const pctSla = sla?.com_prazo ? Math.round((sla.no_prazo / sla.com_prazo) * 100) : null
  const orc = r?.orcamentos
  const pctOrc = orc?.enviados ? Math.round((orc.aprovados / orc.enviados) * 100) : null
  const desloc = Number(r?.valor_deslocamento ?? 0)
  return (
    <GradeMetricas colunas={3}>
      <Metrica
        rotulo="Chegada no prazo (contratos)"
        valor={pctSla != null ? `${pctSla}%` : '—'}
        glosa={sla?.com_prazo ? `${sla.no_prazo} de ${sla.com_prazo} chegadas dentro do combinado` : 'nenhuma chegada de contrato no período'}
        tom={pctSla == null ? 'neutro' : pctSla >= 90 ? 'ok' : pctSla >= 70 ? 'atencao' : 'critico'}
        alerta={pctSla != null && pctSla < 70}
        icone={<Handshake />}
        carregando={carregando}
      />
      <Metrica
        rotulo="Orçamentos aprovados"
        valor={pctOrc != null ? `${pctOrc}%` : '—'}
        glosa={orc?.enviados ? `${orc.aprovados} de ${orc.enviados} enviados · ${orc.recusados} recusado${orc.recusados === 1 ? '' : 's'}` : 'nenhum orçamento enviado no período'}
        tom={pctOrc == null ? 'neutro' : pctOrc >= 70 ? 'ok' : 'atencao'}
        icone={<Receipt />}
        carregando={carregando}
      />
      <Metrica
        rotulo="Taxa de deslocamento"
        valor={r ? moedaCurta(desloc) : '—'}
        glosa={r?.valor_itens ? `${pct(desloc, r.valor_itens)} do valor lançado nos SOS` : 'lançada na chegada do mecânico'}
        tom="cyan"
        icone={<Route />}
        carregando={carregando}
      />
    </GradeMetricas>
  )
}

/* ── mapa de calor ──────────────────────────────────────────────────────── */

const COR_PONTO = '#fc6400'
const COR_EMERGENCIA = '#d13328'

function MapaCalor({ pontos }: { pontos: NonNullable<RelatorioSOS['pontos']> }) {
  if (!pontos.length) {
    return (
      <p className="rounded-xl border border-dashed border-line-strong px-4 py-12 text-center text-[13px] text-ink-3">
        Nenhum SOS com localização no período.
      </p>
    )
  }
  const max = Math.max(...pontos.map((p) => p.n), 1)
  const total = pontos.reduce((s, p) => s + p.n, 0)
  const comEmergencia = pontos.filter((p) => p.emergencias > 0).length
  return (
    <div className="flex flex-col gap-3">
      <div className="relative isolate h-72 overflow-hidden rounded-xl border border-line sm:h-96">
        <MapaSOS marcadores={[]} enquadrar={false} tema="claro" className="size-full">
          <AjusteMapaCalor pontos={pontos} />
          {pontos.map((p) => {
            const critico = p.emergencias > 0
            const cor = critico ? COR_EMERGENCIA : COR_PONTO
            return (
              <CircleMarker
                key={`${p.lat},${p.lng}`}
                center={[p.lat, p.lng]}
                // Área proporcional à contagem: o raio cresce com a raiz.
                radius={6 + 18 * Math.sqrt(p.n / max)}
                pathOptions={{ color: cor, weight: 1.5, opacity: 0.9, fillColor: cor, fillOpacity: 0.25 + 0.4 * (p.n / max) }}
              >
                <Tooltip direction="top" className="tooltip-sos">
                  {p.n} SOS{p.emergencias ? ` · ${p.emergencias} emergência${p.emergencias === 1 ? '' : 's'}` : ''}
                </Tooltip>
              </CircleMarker>
            )
          })}
        </MapaSOS>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-full border-[1.5px]" style={{ borderColor: COR_PONTO, background: `${COR_PONTO}55` }} /> SOS
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-full border-[1.5px]" style={{ borderColor: COR_EMERGENCIA, background: `${COR_EMERGENCIA}55` }} /> Com emergência
        </span>
        <span className="tabular-nums sm:ml-auto">
          {total} SOS em {pontos.length} ponto{pontos.length === 1 ? '' : 's'}
          {comEmergencia ? ` · ${comEmergencia} com emergência` : ''} · maior concentração: {max}
        </span>
      </div>
    </div>
  )
}

/**
 * Enquadra os pontos. Numa página de relatório a roda do mouse rola a
 * página (não o mapa) e, no celular, um dedo rola a página e dois dão zoom.
 */
function AjusteMapaCalor({ pontos }: { pontos: NonNullable<RelatorioSOS['pontos']> }) {
  const mapa = useMap()
  useEffect(() => {
    mapa.scrollWheelZoom.disable()
    if (L.Browser.mobile) mapa.dragging.disable()
  }, [mapa])
  const chave = pontos.map((p) => `${p.lat},${p.lng}`).join('|')
  useEffect(() => {
    if (!pontos.length) return
    if (pontos.length === 1) {
      mapa.setView([pontos[0].lat, pontos[0].lng], 11)
      return
    }
    mapa.fitBounds(L.latLngBounds(pontos.map((p) => [p.lat, p.lng] as [number, number])), { padding: [32, 32], maxZoom: 12 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, mapa])
  return null
}

/* ── gráficos simples (CSS puro, seguem o tema) ─────────────────────────── */

function GraficoDias({ r }: { r: RelatorioSOS | undefined }) {
  const dias = r?.por_dia ?? []
  if (!dias.length) return <p className="py-10 text-center text-[13px] text-ink-3">Sem chamados no período.</p>
  const max = Math.max(...dias.map((d) => d.total), 1)
  // Com muitos dias, só alguns rótulos — 30 números não cabem num celular.
  const passo = dias.length > 45 ? 10 : dias.length > 14 ? 5 : 1
  return (
    <div className="flex h-44 items-end gap-[3px] overflow-x-auto pt-2 pb-1" role="img" aria-label="Chamados por dia">
      {dias.map((d, i) => (
        <div
          key={d.dia}
          className="flex h-full min-w-[4px] flex-1 flex-col items-center justify-end gap-1"
          title={`${d.dia.split('-').reverse().join('/')}: ${d.total} chamados, ${d.concluidos} concluídos`}
        >
          <div className="relative flex w-full flex-1 items-end">
            <div className="absolute inset-x-0 bottom-0 rounded-t-sm border border-accent/40" style={{ height: `${(d.total / max) * 100}%` }} />
            <div className="relative w-full rounded-t-sm bg-accent" style={{ height: `${(d.concluidos / max) * 100}%` }} />
          </div>
          <span className={cn('num h-3 text-[9.5px] leading-3 text-ink-3', (i % passo !== 0 && i !== dias.length - 1) && 'invisible')}>
            {d.dia.slice(8, 10)}
          </span>
        </div>
      ))}
    </div>
  )
}

function GraficoHoras({ r }: { r: RelatorioSOS | undefined }) {
  const horas = Array.from({ length: 24 }, (_, h) => Number(r?.por_hora?.[String(h)] ?? 0))
  const max = Math.max(...horas, 1)
  if (!r?.total) return <p className="py-10 text-center text-[13px] text-ink-3">Sem chamados no período.</p>
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-12 gap-1 sm:grid-cols-24" role="img" aria-label="Chamados por hora do dia">
        {horas.map((n, h) => (
          <div key={h} className="flex flex-col items-center gap-1" title={`${h}h: ${n} chamados`}>
            <div
              className="aspect-square w-full rounded-sm"
              style={{ background: n ? `color-mix(in srgb, var(--c-accent) ${Math.round(20 + (n / max) * 80)}%, transparent)` : 'var(--c-surface-2)' }}
            />
            <span className="num text-[9px] text-ink-3">{h}</span>
          </div>
        ))}
      </div>
      <p className="text-[11.5px] text-ink-3">Mais forte = mais pedidos naquela hora.</p>
    </div>
  )
}

function ListaOcorrencias({ r, carregando }: { r: RelatorioSOS | undefined; carregando: boolean }) {
  const total = r?.total ?? 0
  const linhas = ORDEM_OCORRENCIAS.map((o) => ({ o, n: Number(r?.por_ocorrencia?.[o] ?? 0) }))
    .filter((l) => l.n > 0)
    .sort((a, b) => b.n - a.n)
  if (!linhas.length) return <p className="py-6 text-center text-[13px] text-ink-3">{carregando ? 'Carregando…' : 'Sem chamados no período.'}</p>
  const max = Math.max(...linhas.map((l) => l.n), 1)
  return (
    <ul className="flex flex-col gap-2.5">
      {linhas.map(({ o, n }) => {
        const info = OCORRENCIAS[o]
        const Icone = info.icone
        return (
          <li key={o} className="flex items-center gap-3">
            <Icone aria-hidden className={cn('size-4 shrink-0', info.cor)} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[13px] text-ink">{info.rotulo}</span>
                <span className="num shrink-0 text-[12px] text-ink-2">
                  {n} · {pct(n, total)}
                </span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${(n / max) * 100}%` }} />
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function ListaItens({ itens, carregando }: { itens: RelatorioSOS['itens']; carregando: boolean }) {
  if (!itens.length) return <p className="py-6 text-center text-[13px] text-ink-3">{carregando ? 'Carregando…' : 'Nenhum item lançado no período.'}</p>
  return (
    <ul className="flex flex-col divide-y divide-line">
      {itens.map((i, k) => (
        <li key={k} className="flex items-center gap-3 py-2.5">
          <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', i.tipo === 'servico' ? 'bg-cyan-soft text-cyan-ink' : 'bg-accent-soft text-accent-ink')}>
            {i.tipo === 'servico' ? <Wrench className="size-4" /> : <Package className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] text-ink">{i.descricao}</p>
            <p className="num text-[11.5px] text-ink-3">
              {i.codigo ?? 'sem código'} · {Number(i.quantidade).toLocaleString('pt-BR')} un. em {i.chamados} SOS
            </p>
          </div>
          <span className="num shrink-0 text-[13px] font-semibold text-ink">{moeda(i.valor_total)}</span>
        </li>
      ))}
    </ul>
  )
}

/* ── exportação ─────────────────────────────────────────────────────────── */

function exportarCsv(r: RelatorioSOS, periodo: Periodo) {
  const linhas: string[][] = [
    ['Relatório SOS Tecnoar', `${new Date(r.inicio).toLocaleDateString('pt-BR')} a ${new Date(r.fim).toLocaleDateString('pt-BR')}`],
    [],
    ['Chamados', String(r.total)],
    ['Concluídos', String(r.concluidos)],
    ['Cancelados', String(r.cancelados)],
    ['Emergências', String(r.emergencias)],
    ['OS geradas', String(r.os_geradas)],
    ['Valor em itens', String(r.valor_itens).replace('.', ',')],
    ['Aceite no prazo (%)', String(r.aceite_no_prazo_pct ?? '')],
    ['Nota média', String(r.nota_media ?? '')],
    ['Taxa de deslocamento (R$)', String(r.valor_deslocamento ?? 0).replace('.', ',')],
    ['Orçamentos enviados', String(r.orcamentos?.enviados ?? 0)],
    ['Orçamentos aprovados', String(r.orcamentos?.aprovados ?? 0)],
    ['Orçamentos recusados', String(r.orcamentos?.recusados ?? 0)],
    ['Chegadas de contrato (com prazo)', String(r.sla?.com_prazo ?? 0)],
    ['Chegadas de contrato no prazo', String(r.sla?.no_prazo ?? 0)],
    ['Chegada no prazo — contratos (%)', r.sla?.com_prazo ? String(Math.round((r.sla.no_prazo / r.sla.com_prazo) * 1000) / 10).replace('.', ',') : ''],
    [],
    ['Mecânico', 'Atendimentos', 'Concluídos', 'Cancelados', 'Recusas', 'Aceite (min)', 'Chegada (min)', 'Serviço (min)', 'Nota', 'Itens (R$)'],
    ...r.por_mecanico.map((m) => [
      m.nome,
      String(m.atendimentos),
      String(m.concluidos),
      String(m.cancelados),
      String(m.recusas),
      m.tempo_medio_aceite_seg != null ? String(Math.round(m.tempo_medio_aceite_seg / 60)) : '',
      m.tempo_medio_deslocamento_seg != null ? String(Math.round(m.tempo_medio_deslocamento_seg / 60)) : '',
      m.tempo_medio_servico_seg != null ? String(Math.round(m.tempo_medio_servico_seg / 60)) : '',
      String(m.nota_media ?? ''),
      String(m.valor_itens).replace('.', ','),
    ]),
    [],
    ['Item', 'Tipo', 'Código', 'Quantidade', 'Chamados', 'Valor (R$)'],
    ...r.itens.map((i) => [i.descricao, i.tipo === 'servico' ? 'Serviço' : 'Produto', i.codigo ?? '', String(i.quantidade), String(i.chamados), String(i.valor_total).replace('.', ',')]),
    [],
    ['Mapa de calor (pontos de ~1 km)'],
    ['Latitude', 'Longitude', 'Chamados', 'Emergências'],
    ...(r.pontos ?? []).map((p) => [String(p.lat).replace('.', ','), String(p.lng).replace('.', ','), String(p.n), String(p.emergencias)]),
  ]
  // `;` e BOM: o Excel em português abre direto, com acentos.
  const csv = '﻿' + linhas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `sos-tecnoar-relatorio-${periodo}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
