import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  Gauge,
  MonitorCog,
  Settings2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { LogoNegativo } from '@/componentes/marca/Logo'
import { CLASSE_COR_STATUS } from '@/paginas/cadastros/StatusOS'
import { duracao, motivoAlerta, useEstagiosPatio, useIndicadoresPatio, usePatio } from './usePatio'
import type { LinhaPatioVeiculo } from '@/tipos/db'

const CHAVE_CONFIG_TV = 'tecnoar.modo-tv.config'

type TemaTV = 'executivo' | 'compacto' | 'alertas'

interface ConfigTV {
  tema: TemaTV
  mostrarLogo: boolean
  mostrarKpis: boolean
  mostrarAlertas: boolean
  mostrarRelogio: boolean
  mostrarCliente: boolean
  mostrarMecanicos: boolean
  mostrarTempo: boolean
  mostrarContadores: boolean
  cardsPorColuna: number
  segundosPorPagina: number
  kpis: Record<string, boolean>
}

const CONFIG_PADRAO: ConfigTV = {
  tema: 'executivo',
  mostrarLogo: true,
  mostrarKpis: true,
  mostrarAlertas: true,
  mostrarRelogio: true,
  mostrarCliente: true,
  mostrarMecanicos: true,
  mostrarTempo: true,
  mostrarContadores: true,
  cardsPorColuna: 4,
  segundosPorPagina: 15,
  kpis: {
    no_patio: true,
    entradas_hoje: true,
    aguardando_triagem: false,
    aguardando_aprovacao: true,
    aguardando_peca: true,
    prontos: true,
    sla_vencido: true,
  },
}

const KPIS_CONFIG = [
  { id: 'no_patio', rotulo: 'No pátio' },
  { id: 'entradas_hoje', rotulo: 'Entradas hoje' },
  { id: 'aguardando_triagem', rotulo: 'Aguardando triagem' },
  { id: 'aguardando_aprovacao', rotulo: 'Aguardando aprovação' },
  { id: 'aguardando_peca', rotulo: 'Aguardando peça' },
  { id: 'prontos', rotulo: 'Prontos' },
  { id: 'sla_vencido', rotulo: 'SLA vencido' },
]

function lerConfig(): ConfigTV {
  try {
    const bruto = localStorage.getItem(CHAVE_CONFIG_TV)
    if (!bruto) return CONFIG_PADRAO
    const salvo = JSON.parse(bruto) as Partial<ConfigTV>
    return {
      ...CONFIG_PADRAO,
      ...salvo,
      kpis: { ...CONFIG_PADRAO.kpis, ...(salvo.kpis ?? {}) },
      cardsPorColuna: Math.min(8, Math.max(2, Number(salvo.cardsPorColuna ?? CONFIG_PADRAO.cardsPorColuna))),
      segundosPorPagina: Math.min(60, Math.max(5, Number(salvo.segundosPorPagina ?? CONFIG_PADRAO.segundosPorPagina))),
    }
  } catch {
    return CONFIG_PADRAO
  }
}

/**
 * Modo TV — painel de parede.
 *
 * Só abre por ação explícita do usuário e sempre expõe a saída. Quando há mais
 * veículos do que cabem, a tela pagina automaticamente em vez de esconder
 * qualquer veículo.
 */
export function ModoTV({ aoSair }: { aoSair: () => void }) {
  const patio = usePatio(true)
  const indicadores = useIndicadoresPatio(true)
  const estagios = useEstagiosPatio()
  const [pagina, setPagina] = useState(0)
  const [relogio, setRelogio] = useState(() => new Date())
  const [config, setConfig] = useState<ConfigTV>(lerConfig)
  const [configurando, setConfigurando] = useState(false)

  useEffect(() => {
    localStorage.setItem(CHAVE_CONFIG_TV, JSON.stringify(config))
  }, [config])

  useEffect(() => {
    const t = window.setInterval(() => setRelogio(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoSair()
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    /* O painel de parede é sempre escuro; ao sair, o tema do usuário volta. */
    const eraEscuro = document.documentElement.classList.contains('dark')
    document.documentElement.classList.add('dark')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      if (!eraEscuro) document.documentElement.classList.remove('dark')
    }
  }, [aoSair])

  const porEstagio = useMemo(() => {
    const mapa = new Map<string, LinhaPatioVeiculo[]>()
    for (const e of estagios.data ?? []) mapa.set(e.id, [])
    for (const v of patio.data ?? []) {
      const lista = mapa.get(v.status_id) ?? []
      lista.push(v)
      mapa.set(v.status_id, lista)
    }
    return mapa
  }, [patio.data, estagios.data])

  /* Quantas páginas são necessárias para mostrar todo mundo. */
  const totalPaginas = useMemo(() => {
    let maior = 1
    for (const lista of porEstagio.values()) {
      maior = Math.max(maior, Math.ceil(lista.length / config.cardsPorColuna) || 1)
    }
    return maior
  }, [porEstagio, config.cardsPorColuna])

  useEffect(() => {
    if (totalPaginas <= 1) {
      setPagina(0)
      return
    }
    const t = window.setInterval(() => setPagina((p) => (p + 1) % totalPaginas), config.segundosPorPagina * 1000)
    return () => window.clearInterval(t)
  }, [totalPaginas, config.segundosPorPagina])

  const ind = indicadores.data
  const alertas = (patio.data ?? []).flatMap((v) => {
    const motivo = motivoAlerta(v)
    return motivo ? [{ os_id: v.os_id, placa: v.placa, ...motivo }] : []
  })

  const KPIS = [
    { id: 'no_patio', rotulo: 'No pátio', valor: ind?.no_patio ?? 0, unidade: 'veículos', cor: 'text-ink' },
    { id: 'entradas_hoje', rotulo: 'Entradas hoje', valor: ind?.entradas_hoje ?? 0, unidade: 'recepções', cor: 'text-ink' },
    { id: 'aguardando_triagem', rotulo: 'Aguard. triagem', valor: ind?.aguardando_triagem ?? 0, unidade: 'recebidos', cor: 'text-warn' },
    { id: 'aguardando_aprovacao', rotulo: 'Aguard. aprovação', valor: ind?.aguardando_aprovacao ?? 0, unidade: 'OS', cor: 'text-warn' },
    { id: 'aguardando_peca', rotulo: 'Aguard. peça', valor: ind?.aguardando_peca ?? 0, unidade: 'OS', cor: 'text-accent' },
    { id: 'prontos', rotulo: 'Prontos', valor: ind?.prontos ?? 0, unidade: 'para retirada', cor: 'text-ok' },
    { id: 'sla_vencido', rotulo: 'SLA vencido', valor: ind?.sla_vencido ?? 0, unidade: 'OS', cor: 'text-crit' },
  ].filter((k) => config.kpis[k.id] ?? true)

  const totalVeiculos = patio.data?.length ?? 0
  const totalCriticos = alertas.filter((a) => a.critico).length
  const modoCompacto = config.tema === 'compacto'
  const modoAlertas = config.tema === 'alertas'
  const estagiosVisiveis = (estagios.data ?? []).filter(
    (e) => !modoAlertas || (porEstagio.get(e.id) ?? []).some((v) => motivoAlerta(v)),
  )

  return createPortal(
    <div className="topo-seguro fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[#050b16] text-slate-100">
      {/* cabeçalho */}
      <header className="relative flex shrink-0 items-center justify-between gap-6 border-b border-white/10 bg-[#071225]/95 px-8 py-4 shadow-[0_20px_60px_rgb(0_0_0_/_0.25)]">
        <div className="flex items-center gap-6">
          {config.mostrarLogo && <LogoNegativo altura={52} />}
          {config.mostrarLogo && <span aria-hidden className="h-11 w-px bg-white/12" />}
          <div className="flex flex-col gap-1">
            <span className="font-display text-[11px] font-bold tracking-[0.18em] text-cyan uppercase">Painel do Pátio</span>
            <span className="font-display text-2xl font-bold tracking-tight text-white">Operação em tempo real</span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2.5 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-4 py-2">
            <span aria-hidden className="pulso-ativo size-2.5 rounded-full bg-ok" />
            <span className="font-display text-[11px] font-bold tracking-[0.14em] text-emerald-200 uppercase">Ao vivo</span>
          </span>
          {config.mostrarRelogio && (
            <div className="flex flex-col items-end">
              <span className="num text-3xl leading-none font-medium text-white">
                {relogio.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="mt-1 font-display text-[10px] font-bold tracking-[0.15em] text-slate-400 uppercase">
                {relogio.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setConfigurando(true)}
            className="flex items-center gap-2.5 rounded-lg border border-white/12 bg-white/5 px-4 py-3 font-display text-xs font-bold tracking-[0.1em] text-slate-200 uppercase transition-colors hover:bg-white/10"
          >
            <Settings2 aria-hidden className="size-4" />
            Configurar
          </button>
          <button
            type="button"
            onClick={aoSair}
            className="flex items-center gap-2.5 rounded-lg border border-white/12 bg-white/5 px-5 py-3 font-display text-xs font-bold tracking-[0.1em] text-slate-200 uppercase transition-colors hover:bg-white/10"
          >
            <X aria-hidden className="size-5" />
            Sair do Modo TV
          </button>
        </div>
      </header>

      {/* indicadores */}
      {config.mostrarKpis && (
        <div
          className="grid shrink-0 border-b border-white/10 bg-[#071225]/70"
          style={{ gridTemplateColumns: `repeat(${Math.max(KPIS.length, 1)}, minmax(0, 1fr))` }}
        >
          {KPIS.map((k) => (
            <div key={k.rotulo} className="relative flex min-w-0 flex-col gap-2 border-r border-white/10 px-6 py-4 last:border-r-0">
              <span className="font-display text-[10px] font-bold tracking-[0.16em] text-slate-400 uppercase">{k.rotulo}</span>
              <div className="flex items-baseline gap-2">
                <span className={cn('num text-5xl leading-none font-medium', k.cor)}>{k.valor}</span>
                <span className="text-sm text-slate-400">{k.unidade}</span>
              </div>
              <span aria-hidden className={cn('absolute inset-x-6 bottom-0 h-[2px]', k.id === 'sla_vencido' && k.valor > 0 ? 'bg-crit' : k.id === 'aguardando_peca' && k.valor > 0 ? 'bg-accent' : k.id === 'aguardando_aprovacao' && k.valor > 0 ? 'bg-warn' : 'bg-white/10')} />
            </div>
          ))}
        </div>
      )}

      {/* quadro */}
      <div className={cn('min-h-0 flex-1 p-6', modoCompacto && 'p-4')}>
        {patio.isSuccess && (patio.data?.length ?? 0) === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <span className="font-display text-4xl font-semibold text-white">Pátio vazio</span>
            <span className="text-lg text-slate-400">Nenhum veículo em atendimento no momento.</span>
          </div>
        ) : modoAlertas && alertas.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <span className="flex size-16 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-400/10 text-emerald-200">
              <Check aria-hidden className="size-8" />
            </span>
            <span className="font-display text-4xl font-semibold text-white">Sem alertas agora</span>
            <span className="text-lg text-slate-400">O pátio está em modo foco, mas nenhum veículo exige atenção.</span>
          </div>
        ) : (
          <div className={cn('grid h-full gap-5', modoCompacto && 'gap-3')} style={{ gridTemplateColumns: `repeat(${Math.max(estagiosVisiveis.length, 1)}, minmax(0, 1fr))` }}>
            {estagiosVisiveis.map((e) => {
              const todos = porEstagio.get(e.id) ?? []
              const inicio = pagina * config.cardsPorColuna
              const visiveis = todos.slice(inicio, inicio + config.cardsPorColuna)
              return (
                <section key={e.id} className="flex min-h-0 flex-col gap-3">
                  <header className="flex min-h-11 items-start gap-2 pb-2.5">
                    <span className="line-clamp-2 flex-1 font-display text-[14px] leading-tight font-bold tracking-[0.08em] text-slate-100 uppercase">
                      {e.nome}
                    </span>
                    {config.mostrarContadores && <span className="num shrink-0 text-xl leading-none font-medium text-slate-300">{todos.length}</span>}
                  </header>
                  <div className={cn('-mt-3 h-1 rounded-full', CLASSE_COR_STATUS[e.cor] ?? 'bg-ink-3')} />

                  <ul className="flex min-h-0 flex-col gap-3 overflow-hidden">
                    {visiveis.map((v) => {
                      const alerta = motivoAlerta(v)
                      return (
                        <li
                          key={v.os_id}
                          className={cn(
                            'relative overflow-hidden rounded-xl border bg-white/[0.055] p-4 pl-5 shadow-[0_18px_40px_rgb(0_0_0_/_0.18)] backdrop-blur-sm',
                            modoCompacto && 'p-3 pl-4',
                            alerta?.critico ? 'border-crit/55' : alerta ? 'border-warn/45' : 'border-white/10',
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              'absolute inset-y-0 left-0 w-1.5',
                              v.sla_vencido ? 'bg-crit' : CLASSE_COR_STATUS[v.status_cor] ?? 'bg-ink-3',
                            )}
                          />
                          <div className="flex items-baseline justify-between gap-3">
                            <span className={cn('num shrink-0 whitespace-nowrap font-semibold tracking-wide text-white', modoCompacto ? 'text-xl' : 'text-2xl')}>
                              {v.placa}
                            </span>
                            {config.mostrarTempo && (
                              <span
                                className={cn(
                                  'num shrink-0 text-base',
                                  v.segundos_no_estagio > 86400 ? 'text-crit' : v.segundos_no_estagio > 14400 ? 'text-warn' : 'text-slate-400',
                                )}
                              >
                                {duracao(v.segundos_no_estagio)}
                              </span>
                            )}
                          </div>
                          {config.mostrarCliente && <p className="mt-1 truncate text-sm text-slate-300">{v.cliente_nome}</p>}
                          <div className="mt-1.5 flex items-center justify-between gap-2">
                            <span className="num text-[13px] text-slate-500">OS {String(v.os_numero).padStart(5, '0')}</span>
                            {config.mostrarMecanicos && (
                              <span className="truncate text-[13px] text-slate-500">
                                {v.mecanicos.length ? v.mecanicos.map((m) => m.nome.split(' ')[0]).join(', ') : 'Não atribuído'}
                              </span>
                            )}
                          </div>

                          {/* O motivo do travamento é o que a gestão precisa ler de longe. */}
                          {alerta && (
                            <p
                              className={cn(
                                'mt-2.5 truncate border-t pt-2 text-[13px] font-semibold',
                                alerta.critico ? 'border-crit/30 text-crit' : 'border-white/10 text-warn',
                              )}
                            >
                              {alerta.texto}
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </div>

      {/* rodapé com alertas e paginação */}
      {(config.mostrarAlertas || totalPaginas > 1) && (
        <footer className="flex shrink-0 items-center gap-6 border-t border-white/10 bg-[#071225]/95 px-8 py-4">
          {config.mostrarAlertas && (
            <>
              <span className="flex shrink-0 items-center gap-2.5 rounded-lg border border-crit/35 bg-crit/10 px-4 py-2">
                <AlertTriangle aria-hidden className="size-5 text-crit" />
                <span className="font-display text-[11px] font-bold tracking-[0.14em] text-crit uppercase">Alertas</span>
              </span>

              <div className="flex flex-1 items-center gap-8 overflow-hidden">
                {alertas.length === 0 ? (
                  <span className="text-lg text-slate-400">Nenhum alerta no momento.</span>
                ) : (
                  <>
                    {alertas.slice(0, 4).map((a) => (
                      <span key={a.os_id} className="flex shrink-0 items-center gap-2.5 text-lg whitespace-nowrap">
                        <span className={cn('num font-semibold', a.critico ? 'text-crit' : 'text-warn')}>{a.placa}</span>
                        <span className="text-slate-400">{a.texto}</span>
                      </span>
                    ))}
                    {alertas.length > 4 && <span className="num shrink-0 text-lg text-slate-400">+{alertas.length - 4}</span>}
                  </>
                )}
              </div>
            </>
          )}

          {totalPaginas > 1 && (
            <div className="ml-auto flex shrink-0 items-center gap-3">
              <button type="button" className="rounded-md border border-white/10 p-1.5 text-slate-300 hover:bg-white/10" onClick={() => setPagina((p) => (p - 1 + totalPaginas) % totalPaginas)}>
                <ChevronLeft aria-hidden className="size-4" />
              </button>
              <span className="font-display text-[10px] font-bold tracking-[0.14em] text-slate-400 uppercase">Página</span>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: totalPaginas }).map((_, i) => (
                  <span key={i} aria-hidden className={cn('h-1.5 rounded-full transition-all', i === pagina ? 'w-7 bg-cyan' : 'w-4 bg-white/20')} />
                ))}
              </div>
              <span className="num text-base text-slate-300">{pagina + 1}/{totalPaginas}</span>
              <button type="button" className="rounded-md border border-white/10 p-1.5 text-slate-300 hover:bg-white/10" onClick={() => setPagina((p) => (p + 1) % totalPaginas)}>
                <ChevronRight aria-hidden className="size-4" />
              </button>
            </div>
          )}
        </footer>
      )}

      <PainelConfiguracaoTV
        aberto={configurando}
        config={config}
        kpis={KPIS_CONFIG}
        totalVeiculos={totalVeiculos}
        totalCriticos={totalCriticos}
        aoFechar={() => setConfigurando(false)}
        aoMudar={setConfig}
      />
    </div>,
    document.body,
  )
}

function PainelConfiguracaoTV({
  aberto,
  config,
  kpis,
  totalVeiculos,
  totalCriticos,
  aoFechar,
  aoMudar,
}: {
  aberto: boolean
  config: ConfigTV
  kpis: Array<{ id: string; rotulo: string }>
  totalVeiculos: number
  totalCriticos: number
  aoFechar: () => void
  aoMudar: (config: ConfigTV) => void
}) {
  if (!aberto) return null

  function patch(campos: Partial<ConfigTV>) {
    aoMudar({ ...config, ...campos })
  }

  function toggle(chave: keyof ConfigTV) {
    patch({ [chave]: !config[chave] } as Partial<ConfigTV>)
  }

  function toggleKpi(id: string) {
    patch({ kpis: { ...config.kpis, [id]: !(config.kpis[id] ?? true) } })
  }

  return (
    <div className="absolute inset-0 z-[2] flex justify-end bg-black/45 backdrop-blur-[2px]">
      <aside className="entrada-suave flex h-full w-[420px] max-w-[92vw] flex-col border-l border-white/12 bg-[#071225] text-slate-100 shadow-[0_0_80px_rgb(0_0_0_/_0.45)]">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-display text-[11px] font-bold tracking-[0.18em] text-cyan uppercase">Modo TV</span>
            <h2 className="font-display text-xl font-semibold tracking-tight text-white">Configuração do painel</h2>
            <p className="text-[12.5px] leading-relaxed text-slate-400">Escolha o que aparece no telão. As preferências ficam salvas neste navegador.</p>
          </div>
          <button type="button" onClick={aoFechar} className="rounded-md border border-white/10 p-2 text-slate-300 transition-colors hover:bg-white/10">
            <X aria-hidden className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <PainelStatusTV icone={<Gauge />} rotulo="Veículos" valor={totalVeiculos.toLocaleString('pt-BR')} />
            <PainelStatusTV icone={<AlertTriangle />} rotulo="Críticos" valor={totalCriticos.toLocaleString('pt-BR')} critico={totalCriticos > 0} />
          </div>

          <section className="mt-5 flex flex-col gap-3">
            <h3 className="font-display text-[11px] font-bold tracking-[0.16em] text-slate-400 uppercase">Presets visuais</h3>
            <div className="grid grid-cols-1 gap-2">
              <PresetTV ativo={config.tema === 'executivo'} icone={<MonitorCog />} titulo="Executivo" descricao="KPI, colunas e alertas equilibrados." onClick={() => patch({ tema: 'executivo', mostrarKpis: true, mostrarAlertas: true, cardsPorColuna: 4 })} />
              <PresetTV ativo={config.tema === 'compacto'} icone={<BarChart3 />} titulo="Compacto" descricao="Mais veículos por tela e menos respiro." onClick={() => patch({ tema: 'compacto', cardsPorColuna: 6, mostrarCliente: true })} />
              <PresetTV ativo={config.tema === 'alertas'} icone={<AlertTriangle />} titulo="Foco em alertas" descricao="Mostra colunas com veículos em atenção." onClick={() => patch({ tema: 'alertas', mostrarAlertas: true, mostrarKpis: true })} />
            </div>
          </section>

          <section className="mt-5 flex flex-col gap-3">
            <h3 className="font-display text-[11px] font-bold tracking-[0.16em] text-slate-400 uppercase">Exibição</h3>
            <div className="grid grid-cols-1 gap-2">
              <OpcaoTV ativo={config.mostrarLogo} rotulo="Logo no cabeçalho" onClick={() => toggle('mostrarLogo')} />
              <OpcaoTV ativo={config.mostrarKpis} rotulo="Faixa de indicadores" onClick={() => toggle('mostrarKpis')} />
              <OpcaoTV ativo={config.mostrarAlertas} rotulo="Rodapé de alertas" onClick={() => toggle('mostrarAlertas')} />
              <OpcaoTV ativo={config.mostrarRelogio} rotulo="Relógio e data" onClick={() => toggle('mostrarRelogio')} />
              <OpcaoTV ativo={config.mostrarCliente} rotulo="Nome do cliente nos cartões" onClick={() => toggle('mostrarCliente')} />
              <OpcaoTV ativo={config.mostrarMecanicos} rotulo="Mecânicos atribuídos" onClick={() => toggle('mostrarMecanicos')} />
              <OpcaoTV ativo={config.mostrarTempo} rotulo="Tempo no estágio" onClick={() => toggle('mostrarTempo')} />
              <OpcaoTV ativo={config.mostrarContadores} rotulo="Contador por coluna" onClick={() => toggle('mostrarContadores')} />
            </div>
          </section>

          <section className="mt-5 flex flex-col gap-3">
            <h3 className="font-display text-[11px] font-bold tracking-[0.16em] text-slate-400 uppercase">Indicadores visíveis</h3>
            <div className="grid grid-cols-1 gap-2">
              {kpis.map((k) => (
                <OpcaoTV key={k.id} ativo={config.kpis[k.id] ?? true} rotulo={k.rotulo} onClick={() => toggleKpi(k.id)} />
              ))}
            </div>
          </section>

          <section className="mt-5 grid gap-3 sm:grid-cols-2">
            <CampoNumericoTV
              icone={<Eye />}
              rotulo="Cards por coluna"
              valor={config.cardsPorColuna}
              min={2}
              max={8}
              onChange={(cardsPorColuna) => patch({ cardsPorColuna })}
            />
            <CampoNumericoTV
              icone={<Clock3 />}
              rotulo="Rotação"
              sufixo="s"
              valor={config.segundosPorPagina}
              min={5}
              max={60}
              onChange={(segundosPorPagina) => patch({ segundosPorPagina })}
            />
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={() => aoMudar(CONFIG_PADRAO)}
            className="rounded-md border border-white/10 px-3 py-2 font-display text-[11px] font-bold tracking-[0.1em] text-slate-300 uppercase transition-colors hover:bg-white/10"
          >
            Restaurar padrão
          </button>
          <button
            type="button"
            onClick={aoFechar}
            className="rounded-md bg-accent px-4 py-2 font-display text-[11px] font-bold tracking-[0.1em] text-white uppercase transition-colors hover:bg-accent-hover"
          >
            Aplicar
          </button>
        </footer>
      </aside>
    </div>
  )
}

function PainelStatusTV({ icone, rotulo, valor, critico }: { icone: React.ReactNode; rotulo: string; valor: string; critico?: boolean }) {
  return (
    <div className={cn('rounded-lg border p-3', critico ? 'border-crit/35 bg-crit/10' : 'border-white/10 bg-white/[0.04]')}>
      <span className="flex items-center gap-2 text-slate-400 [&_svg]:size-4">
        {icone}
        <span className="font-display text-[10px] font-bold tracking-[0.14em] uppercase">{rotulo}</span>
      </span>
      <span className={cn('num mt-2 block text-3xl leading-none font-semibold', critico ? 'text-crit' : 'text-white')}>{valor}</span>
    </div>
  )
}

function PresetTV({
  ativo,
  icone,
  titulo,
  descricao,
  onClick,
}: {
  ativo: boolean
  icone: React.ReactNode
  titulo: string
  descricao: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors',
        ativo ? 'border-cyan/45 bg-cyan/10' : 'border-white/10 bg-white/[0.035] hover:bg-white/[0.07]',
      )}
    >
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-md border [&_svg]:size-4', ativo ? 'border-cyan/30 bg-cyan/15 text-cyan' : 'border-white/10 bg-white/5 text-slate-300')}>
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-white">{titulo}</span>
        <span className="block text-[12px] leading-snug text-slate-400">{descricao}</span>
      </span>
      {ativo && <Check aria-hidden className="size-4 shrink-0 text-cyan" />}
    </button>
  )
}

function OpcaoTV({ ativo, rotulo, onClick }: { ativo: boolean; rotulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07]"
    >
      <span className="text-[12.5px] text-slate-200">{rotulo}</span>
      <span className={cn('flex h-5 w-9 items-center rounded-full border p-0.5 transition-colors', ativo ? 'border-cyan/40 bg-cyan/25' : 'border-white/15 bg-white/5')}>
        <span className={cn('size-3.5 rounded-full bg-white transition-transform', ativo && 'translate-x-4')} />
      </span>
    </button>
  )
}

function CampoNumericoTV({
  icone,
  rotulo,
  valor,
  min,
  max,
  sufixo,
  onChange,
}: {
  icone: React.ReactNode
  rotulo: string
  valor: number
  min: number
  max: number
  sufixo?: string
  onChange: (valor: number) => void
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
      <span className="flex items-center gap-2 text-slate-400 [&_svg]:size-4">
        {icone}
        <span className="font-display text-[10px] font-bold tracking-[0.14em] uppercase">{rotulo}</span>
      </span>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" className="size-8 rounded-md border border-white/10 text-slate-200 hover:bg-white/10" onClick={() => onChange(Math.max(min, valor - 1))}>-</button>
        <span className="num min-w-12 flex-1 text-center text-xl font-semibold text-white">
          {valor}
          {sufixo}
        </span>
        <button type="button" className="size-8 rounded-md border border-white/10 text-slate-200 hover:bg-white/10" onClick={() => onChange(Math.min(max, valor + 1))}>+</button>
      </div>
    </div>
  )
}
