import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Polyline } from 'react-leaflet'
import { Clock3, Maximize, Phone, Plus, Radar, Siren, Star, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Botao } from '@/componentes/ui/Botao'
import { Esqueleto } from '@/componentes/ui/Estados'
import { BotaoMapa, CapturaMapa, MapaSOS, enquadrarMapa, focarMapa, type MapaLeaflet, type MarcadorMapa } from '@/sos/Mapa'
import { SITUACOES_MECANICO, STATUS_AGUARDANDO, STATUS_EM_CAMPO, formatarDuracao, haQuanto, linkTelefone } from '@/sos/rotulos'
import type { ChamadoListado, IndicadoresSOS, MecanicoMapa, SituacaoMecanico, StatusSOS } from '@/sos/tipos'
import { CartaoChamado } from './CartaoChamado'
import {
  BotaoVerNaLista,
  CartaoFocoChamado,
  EnquadramentoAutomatico,
  ModalDespacho,
  pontosDoFoco,
  rolarAteVisivel,
  rolarDentroDaLista,
  telaEmpilhada,
  useAltura,
  useEscParaFechar,
} from './SelecaoMapa'
import {
  ErroSOS,
  aguardando,
  marcadorChamado,
  marcadorMecanico,
  posicaoRecente,
  useAgora,
  useChamadosAtivos,
  useMecanicosSOS,
} from './comum'

/** Chamado em foco: de onde veio o toque decide quem rola até quem. */
interface Selecao {
  id: string
  origem: 'fila' | 'mapa'
  /** Muda a cada toque — refaz o voo mesmo quando o chamado é o mesmo. */
  vez: number
}

/**
 * Margem do cabeçalho fixo ao rolar até o mapa ou até um cartão da fila
 * (o cabeçalho tem 4rem e cresce com a faixa do relógio no iPhone).
 */
const MARGEM_ROLAGEM = 'scroll-mt-[calc(4.75rem+env(safe-area-inset-top))]'

/**
 * Torre de controle da central: números do momento no topo, mapa escuro com
 * tudo o que está acontecendo e a fila ao lado, com quem espera sempre em
 * cima. Tocar num chamado da fila leva o mapa até ele; tocar de novo (ou em
 * "Abrir") abre o painel completo.
 *
 * Do monitor largo (xl) para cima, mapa e fila ficam lado a lado na altura da
 * janela. Abaixo disso ficam empilhados — a fila primeiro, porque é nela que
 * se age — e o toque na fila rola a página até o mapa.
 */
export function PainelOperacao({
  indicadores,
  carregandoIndicadores,
  tempoAceiteSeg,
  podeCriar,
  aoAbrirChamado,
  aoNovoChamado,
  aoVerChamados,
}: {
  indicadores: IndicadoresSOS | undefined
  carregandoIndicadores: boolean
  tempoAceiteSeg: number
  podeCriar: boolean
  aoAbrirChamado: (id: string) => void
  aoNovoChamado: () => void
  aoVerChamados: (status: StatusSOS[]) => void
}) {
  const chamados = useChamadosAtivos()
  const mecanicos = useMecanicosSOS()
  const [realce, setRealce] = useState<string | null>(null)
  const [selecao, setSelecao] = useState<Selecao | null>(null)
  const [despachando, setDespachando] = useState<string | null>(null)
  const areaMapa = useRef<HTMLDivElement>(null)
  const areaFila = useRef<HTMLDivElement>(null)

  const lista = useMemo(() => chamados.data ?? [], [chamados.data])
  const selecionado = selecao ? (lista.find((c) => c.id === selecao.id) ?? null) : null

  // Chamado que saiu da fila (concluído, cancelado) fecha o cartão sozinho.
  useEffect(() => {
    if (selecao && chamados.isSuccess && !lista.some((c) => c.id === selecao.id)) setSelecao(null)
  }, [selecao, chamados.isSuccess, lista])

  const selecionarDaFila = useCallback(
    (id: string) => {
      // Segundo toque no chamado já em foco abre o painel — o gesto de "abrir"
      // continua onde sempre esteve.
      if (selecao?.id === id) {
        aoAbrirChamado(id)
        return
      }
      setSelecao((s) => ({ id, origem: 'fila', vez: (s?.vez ?? 0) + 1 }))
      // Empilhado, o mapa está abaixo da fila: sem rolar, o voo aconteceria
      // fora da vista e o toque pareceria não ter feito nada.
      if (telaEmpilhada()) rolarAteVisivel(areaMapa.current, 'start')
    },
    [selecao?.id, aoAbrirChamado],
  )

  const selecionarDoMapa = useCallback((id: string) => {
    setSelecao((s) => (s?.id === id ? s : { id, origem: 'mapa', vez: (s?.vez ?? 0) + 1 }))
  }, [])

  const fecharSelecao = useCallback(() => setSelecao(null), [])

  const verNaFila = useCallback(() => {
    const cartao = selecao ? areaFila.current?.querySelector<HTMLElement>(`[data-chamado="${selecao.id}"]`) : null
    rolarAteVisivel(cartao ?? areaFila.current, 'center')
  }, [selecao])

  const chamadoDespacho = despachando ? (lista.find((c) => c.id === despachando) ?? null) : null

  return (
    <div className="flex flex-col gap-4">
      <KpisAgora ind={indicadores} carregando={carregandoIndicadores} aoVerChamados={aoVerChamados} />

      {/* Tempos médios e mecânicos ficam depois do mapa e da fila em todas as
          larguras: é número do dia, não do minuto. Acima do mapa, num notebook
          de 800 px de altura, empurravam o mapa para fora da tela. */}
      <div className="order-3">
        <KpisTempos ind={indicadores} carregando={carregandoIndicadores} />
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
        <div ref={areaMapa} className={cn('order-2 min-w-0 xl:order-none', MARGEM_ROLAGEM)}>
          <MapaOperacao
            chamados={lista}
            mecanicos={mecanicos.data ?? []}
            realce={realce}
            selecao={selecao}
            selecionado={selecionado}
            tempoAceiteSeg={tempoAceiteSeg}
            aoSelecionar={selecionarDoMapa}
            aoFecharSelecao={fecharSelecao}
            aoAbrirChamado={aoAbrirChamado}
            aoDespachar={setDespachando}
            aoVerNaFila={verNaFila}
          />
        </div>

        <div ref={areaFila} className={cn('order-1 min-w-0 xl:order-none', MARGEM_ROLAGEM)}>
          <FilaChamados
            consulta={chamados}
            tempoAceiteSeg={tempoAceiteSeg}
            selecao={selecao}
            aoPassar={setRealce}
            aoSelecionar={selecionarDaFila}
            aoAbrirChamado={aoAbrirChamado}
            podeCriar={podeCriar}
            aoNovoChamado={aoNovoChamado}
          />
        </div>
      </div>

      <ModalDespacho chamado={chamadoDespacho} aoFechar={() => setDespachando(null)} />
    </div>
  )
}

/* ── indicadores ────────────────────────────────────────────────────────── */

type TomKpi = 'crit' | 'warn' | 'accent' | 'cyan' | 'ok' | 'neutro'

const FAIXA_KPI: Record<TomKpi, string> = {
  crit: 'bg-crit',
  warn: 'bg-warn',
  accent: 'bg-accent',
  cyan: 'bg-cyan',
  ok: 'bg-ok',
  neutro: 'bg-ink-3',
}
const NUMERO_KPI: Record<TomKpi, string> = {
  crit: 'text-crit-ink',
  warn: 'text-warn-ink',
  accent: 'text-accent-ink',
  cyan: 'text-cyan-ink',
  ok: 'text-ok-ink',
  neutro: 'text-ink',
}

/**
 * Indicador compacto. No celular vira uma pastilha de número (quatro por
 * linha, número em cima e nome embaixo, sem a glosa): os oito números cabem
 * em duas linhas e a fila aparece já na primeira tela, sem rolar.
 */
function Kpi({
  rotulo,
  valor,
  glosa,
  tom,
  alerta,
  carregando,
  onClick,
  pastilha,
}: {
  rotulo: string
  valor: ReactNode
  glosa?: ReactNode
  tom: TomKpi
  alerta?: boolean
  carregando?: boolean
  onClick?: () => void
  /** Vira pastilha (número + nome) abaixo de `sm`. */
  pastilha?: boolean
}) {
  const Elemento = onClick ? 'button' : 'div'
  return (
    <Elemento
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'aresta relative flex min-h-[78px] min-w-0 flex-col justify-between gap-1 overflow-hidden rounded-lg border bg-surface px-3 pt-3 pb-2.5 text-left shadow-e1',
        pastilha && 'max-sm:min-h-[62px] max-sm:justify-start max-sm:gap-1 max-sm:px-2 max-sm:pt-2.5 max-sm:pb-2',
        alerta ? 'border-crit/45' : 'border-line',
        onClick && 'cursor-pointer transition-[border-color,transform] duration-150 hover:-translate-y-px hover:border-line-strong',
      )}
    >
      <span aria-hidden className={cn('absolute inset-x-0 top-0 h-[3px]', FAIXA_KPI[tom], alerta && 'sos-piscar')} />
      <span
        className={cn(
          'lbl truncate',
          pastilha &&
            'max-sm:order-2 max-sm:line-clamp-2 max-sm:text-[10.5px] max-sm:leading-tight max-sm:font-medium max-sm:tracking-normal max-sm:break-words max-sm:whitespace-normal max-sm:normal-case max-sm:hyphens-auto max-sm:text-ink-2',
        )}
      >
        {rotulo}
      </span>
      {carregando ? (
        <Esqueleto className={cn('h-7', pastilha && 'max-sm:order-1 max-sm:h-5')} largura="2.5rem" />
      ) : (
        <span
          className={cn(
            'num truncate text-[24px] leading-none font-semibold sm:text-[26px]',
            pastilha && 'max-sm:order-1 max-sm:text-[21px]',
            alerta ? NUMERO_KPI[tom] : 'text-ink',
          )}
        >
          {valor}
        </span>
      )}
      {/* `sm:line-clamp-2` e não `line-clamp-2`: há uma regra `.line-clamp-2` fora
          de camada no CSS global que venceria o `max-sm:hidden`. */}
      {glosa && <span className={cn('text-[11px] leading-snug text-ink-3', pastilha ? 'max-sm:hidden sm:line-clamp-2' : 'line-clamp-2')}>{glosa}</span>}
    </Elemento>
  )
}

function duracaoOuTraco(seg: number | null | undefined): string {
  return seg == null ? '—' : formatarDuracao(seg)
}

function KpisAgora({
  ind,
  carregando,
  aoVerChamados,
}: {
  ind: IndicadoresSOS | undefined
  carregando: boolean
  aoVerChamados: (status: StatusSOS[]) => void
}) {
  const agora = useAgora(30_000)
  const maisAntigo = ind?.aguardando_mais_antigo

  return (
    <section aria-label="Chamados agora">
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 xl:grid-cols-8">
        <Kpi pastilha
          rotulo="Aguardando"
          tom="crit"
          valor={ind?.aguardando ?? 0}
          alerta={(ind?.aguardando ?? 0) > 0}
          glosa={maisAntigo ? `mais antigo ${haQuanto(maisAntigo, agora)}` : 'fila zerada'}
          carregando={carregando}
          onClick={() => aoVerChamados(STATUS_AGUARDANDO)}
        />
        <Kpi pastilha
          rotulo="Sem mecânico"
          tom="warn"
          valor={ind?.aguardando_mecanico ?? 0}
          alerta={(ind?.aguardando_mecanico ?? 0) > 0}
          glosa="sem despacho"
          carregando={carregando}
          onClick={() => aoVerChamados(STATUS_AGUARDANDO)}
        />
        <Kpi pastilha
          rotulo="A caminho"
          tom="accent"
          valor={(ind?.a_caminho ?? 0) + (ind?.aceitos ?? 0)}
          glosa="deslocando"
          carregando={carregando}
          onClick={() => aoVerChamados(['aceito', 'a_caminho'])}
        />
        <Kpi pastilha rotulo="No local" tom="cyan" valor={ind?.no_local ?? 0} glosa="mecânico chegou" carregando={carregando} onClick={() => aoVerChamados(['no_local'])} />
        <Kpi pastilha
          rotulo="Em serviço"
          tom="cyan"
          valor={ind?.em_servico ?? 0}
          glosa="serviços iniciados"
          carregando={carregando}
          onClick={() => aoVerChamados(['servico_iniciado'])}
        />
        <Kpi pastilha
          rotulo="Finalizados"
          tom="ok"
          valor={ind?.finalizados_periodo ?? 0}
          glosa="encerrados hoje"
          carregando={carregando}
          onClick={() => aoVerChamados(['servico_finalizado', 'concluido'])}
        />
        <Kpi pastilha rotulo="Abertos" tom="neutro" valor={ind?.abertos_periodo ?? 0} glosa="pedidos hoje" carregando={carregando} onClick={() => aoVerChamados([])} />
        <Kpi pastilha
          rotulo="Cancelados"
          tom="neutro"
          valor={ind?.cancelados_periodo ?? 0}
          glosa="hoje"
          carregando={carregando}
          onClick={() => aoVerChamados(['cancelado'])}
        />
      </div>
    </section>
  )
}

function KpisTempos({ ind, carregando }: { ind: IndicadoresSOS | undefined; carregando: boolean }) {
  return (
    <section aria-label="Tempos médios e mecânicos">
      {/* Lado a lado só no monitor largo: em 1024 px os quatro tempos ficavam
          com 40 px cada e o rótulo virava "AC…". */}
      <div className="grid min-w-0 grid-cols-1 gap-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi rotulo="Aceite" tom="neutro" valor={duracaoOuTraco(ind?.tempo_medio_aceite_seg)} glosa="tempo médio hoje" carregando={carregando} />
          <Kpi rotulo="Chegada" tom="neutro" valor={duracaoOuTraco(ind?.tempo_medio_deslocamento_seg)} glosa="deslocamento médio" carregando={carregando} />
          <Kpi rotulo="Serviço" tom="neutro" valor={duracaoOuTraco(ind?.tempo_medio_servico_seg)} glosa="atendimento médio" carregando={carregando} />
          <Kpi
            rotulo="Avaliação"
            tom="ok"
            valor={
              ind?.nota_media != null ? (
                <span className="inline-flex items-center gap-1">
                  {Number(ind.nota_media).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
                  <Star aria-hidden className="size-4 fill-[#f5a524] text-[#f5a524]" />
                </span>
              ) : (
                '—'
              )
            }
            glosa={ind?.avaliacoes ? `${ind.avaliacoes} ${ind.avaliacoes > 1 ? 'avaliações' : 'avaliação'} hoje` : 'sem avaliações hoje'}
            carregando={carregando}
          />
        </div>
        <MecanicosPorSituacao ind={ind} carregando={carregando} />
      </div>
    </section>
  )
}

const ORDEM_SITUACOES: SituacaoMecanico[] = ['disponivel', 'em_atendimento', 'pausa', 'indisponivel', 'offline']

/** Barra única: a proporção de quem está livre se lê antes de qualquer número. */
function MecanicosPorSituacao({ ind, carregando }: { ind: IndicadoresSOS | undefined; carregando: boolean }) {
  const contagem = ind?.mecanicos ?? { disponivel: 0, em_atendimento: 0, pausa: 0, indisponivel: 0, offline: 0 }
  const total = ORDEM_SITUACOES.reduce((s, k) => s + (Number(contagem[k]) || 0), 0)

  return (
    <div className="aresta flex min-w-0 flex-col justify-between gap-2.5 rounded-lg border border-line bg-surface px-3.5 pt-3 pb-3 shadow-e1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="lbl">Mecânicos</span>
        <span className="num text-[11.5px] text-ink-3">{carregando ? '…' : `${total} no SOS`}</span>
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-2" aria-hidden>
        {total > 0 &&
          ORDEM_SITUACOES.map((k) =>
            contagem[k] ? (
              <span key={k} className={cn('h-full', SITUACOES_MECANICO[k].ponto)} style={{ width: `${(Number(contagem[k]) / total) * 100}%` }} />
            ) : null,
          )}
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
        {ORDEM_SITUACOES.map((k) => (
          <li key={k} className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden className={cn('size-2 shrink-0 rounded-full', SITUACOES_MECANICO[k].ponto)} />
            <span className="truncate text-[11.5px] text-ink-2">{SITUACOES_MECANICO[k].rotulo}</span>
            <span className="num ml-auto text-[12px] font-semibold text-ink">{carregando ? '·' : contagem[k] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── mapa ───────────────────────────────────────────────────────────────── */

function MapaOperacao({
  chamados,
  mecanicos,
  realce,
  selecao,
  selecionado,
  tempoAceiteSeg,
  aoSelecionar,
  aoFecharSelecao,
  aoAbrirChamado,
  aoDespachar,
  aoVerNaFila,
}: {
  chamados: ChamadoListado[]
  mecanicos: MecanicoMapa[]
  realce: string | null
  selecao: Selecao | null
  selecionado: ChamadoListado | null
  tempoAceiteSeg: number
  aoSelecionar: (id: string) => void
  aoFecharSelecao: () => void
  aoAbrirChamado: (id: string) => void
  aoDespachar: (id: string) => void
  aoVerNaFila: () => void
}) {
  const mapa = useRef<MapaLeaflet | null>(null)
  const legenda = useRef<HTMLDivElement>(null)
  const sobreposicao = useRef<HTMLDivElement>(null)
  const voltarFila = useRef<HTMLDivElement>(null)
  const [mecSel, setMecSel] = useState<string | null>(null)
  const idSel = selecionado?.id ?? null
  // Só a caminho o mecânico acende junto; no local ele está em cima do pino do
  // chamado, e aceso ficaria por cima dele.
  const mecDoFoco = selecionado && (selecionado.status === 'aceito' || selecionado.status === 'a_caminho') ? selecionado.mecanico_id : null

  // Finalizado sai do mapa — a menos que seja justamente o chamado em foco.
  const emMapa = useMemo(
    () => chamados.filter((c) => c.latitude != null && c.longitude != null && (c.status !== 'servico_finalizado' || c.id === idSel)),
    [chamados, idSel],
  )
  const mecsVisiveis = useMemo(() => {
    const agora = Date.now()
    return mecanicos.filter((m) => posicaoRecente(m, agora))
  }, [mecanicos])

  // Memorizado: o Leaflet recria o ícone do pino quando o objeto muda, e o
  // pino piscaria a cada atualização da lista.
  const marcadores = useMemo<MarcadorMapa[]>(() => {
    const lista: MarcadorMapa[] = []
    for (const m of mecsVisiveis) {
      const mk = marcadorMecanico(m, {
        // O mecânico do chamado em foco acende junto: a dupla se lê de relance.
        selecionado: mecSel === m.usuario_id || mecDoFoco === m.usuario_id,
        aoClicar: () => {
          aoFecharSelecao()
          setMecSel(m.usuario_id)
        },
      })
      if (mk) lista.push(mk)
    }
    for (const c of emMapa) {
      // O realce de passar o cursor na fila só vale sem foco: dois pinos
      // acesos ao mesmo tempo não dizem qual é o chamado do cartão.
      const mk = marcadorChamado(c, { selecionado: idSel ? idSel === c.id : realce === c.id, aoClicar: () => aoSelecionar(c.id) })
      if (mk) lista.push(mk)
    }
    return lista
  }, [emMapa, mecsVisiveis, realce, mecSel, idSel, mecDoFoco, aoSelecionar, aoFecharSelecao])

  const pontos = useMemo(() => marcadores.map((m) => m.ponto), [marcadores])

  // Linha tracejada do mecânico até o cliente enquanto ele se desloca.
  const trajetos = useMemo(() => {
    const porId = new Map(mecsVisiveis.map((m) => [m.usuario_id, m]))
    return emMapa.flatMap((c) => {
      if (!c.mecanico_id || (c.status !== 'aceito' && c.status !== 'a_caminho')) return []
      const m = porId.get(c.mecanico_id)
      if (!m || m.latitude == null || m.longitude == null) return []
      return [{ id: c.id, de: [m.latitude, m.longitude] as [number, number], para: [c.latitude!, c.longitude!] as [number, number] }]
    })
  }, [emMapa, mecsVisiveis])

  const mecanicoSel = mecSel ? (mecanicos.find((m) => m.usuario_id === mecSel) ?? null) : null
  const chamadoDoMecanico = mecanicoSel?.chamado_atual_id ? chamados.find((c) => c.id === mecanicoSel.chamado_atual_id) : undefined
  const alturaSobreposicao = useAltura(sobreposicao, !!selecionado || !!mecanicoSel)

  // Cada toque num chamado (fila ou pino) leva a câmera até ele. Um quadro de
  // espera: o cartão precisa estar desenhado para se saber quanto do mapa cobre.
  useEffect(() => {
    if (!selecao || !selecionado) return
    setMecSel(null)
    const alvo = pontosDoFoco(selecionado, mecanicos)
    if (!alvo.length) return
    const quadro = requestAnimationFrame(() =>
      focarMapa(mapa.current, alvo, {
        zoom: 15,
        // Legenda + o "Ver na fila" logo abaixo dela (0 quando escondido no monitor).
        margemTopo: (legenda.current?.offsetHeight ?? 0) + 12 + (voltarFila.current?.offsetHeight ? voltarFila.current.offsetHeight + 8 : 0),
        margemInferior: (sobreposicao.current?.offsetHeight ?? 0) + 12,
      }),
    )
    return () => cancelAnimationFrame(quadro)
    // Só o toque conta: atualização da lista não pode refazer o voo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecao?.vez])

  const fecharTudo = useCallback(() => {
    aoFecharSelecao()
    setMecSel(null)
  }, [aoFecharSelecao])
  useEscParaFechar(!!selecionado || !!mecanicoSel, fecharTudo)

  const contagem = {
    aguardando: emMapa.filter((c) => aguardando(c.status)).length,
    campo: emMapa.filter((c) => STATUS_EM_CAMPO.includes(c.status)).length,
    livres: mecsVisiveis.filter((m) => m.situacao === 'disponivel').length,
    ocupados: mecsVisiveis.filter((m) => m.situacao === 'em_atendimento').length,
    fora: mecsVisiveis.filter((m) => m.situacao !== 'disponivel' && m.situacao !== 'em_atendimento').length,
  }

  // Empilhado (celular e tablet): altura pela janela, com teto e piso — cabe o
  // mapa inteiro com o cartão do chamado por cima. No monitor, a altura da
  // janela menos o topo da página (cabeçalho, abas e indicadores do momento):
  // mapa e fila cabem inteiros, sem rolar, a partir de ~780 px de altura.
  return (
    <section
      aria-label="Mapa operacional"
      className="relative isolate h-[clamp(360px,64dvh,640px)] overflow-hidden rounded-lg border border-line bg-[#0b1526] shadow-e2 xl:h-[calc(100dvh-23.5rem)] xl:min-h-[400px]"
    >
      <MapaSOS marcadores={marcadores} enquadrar={false} tema="escuro" className="size-full [&_.leaflet-container]:!bg-[#0b1526]">
        <CapturaMapa destino={mapa} />
        <EnquadramentoAutomatico marcadores={marcadores} pausado={!!idSel} />
        {trajetos.map((t) => {
          const foco = idSel === t.id
          return (
            <Polyline
              key={t.id}
              positions={[t.de, t.para]}
              pathOptions={{
                color: '#00a8e8',
                weight: foco ? 3.5 : 2.5,
                opacity: idSel && !foco ? 0.35 : foco ? 1 : 0.85,
                dashArray: '6 9',
                lineCap: 'round',
              }}
            />
          )
        })}
      </MapaSOS>

      {/* Legenda com contagem: o mapa diz quantos antes de o olho procurar. */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[600] flex items-start justify-between gap-2">
        <div
          ref={legenda}
          className="pointer-events-auto flex max-w-full items-center gap-3 overflow-x-auto rounded-lg border border-white/10 bg-[#081830]/85 px-3 py-2 text-white shadow-e2 backdrop-blur-md [scrollbar-width:none]"
        >
          <span className="flex shrink-0 items-center gap-1.5">
            <Radar aria-hidden className="size-3.5 text-[#ff6a00]" />
            <span className="font-display text-[10px] font-semibold tracking-[0.16em] uppercase">Ao vivo</span>
          </span>
          <Legenda cor="bg-[#e5383b]" rotulo="Aguardando" n={contagem.aguardando} piscar={contagem.aguardando > 0} />
          <Legenda cor="bg-[#ff6a00]" rotulo="Em campo" n={contagem.campo} />
          <Legenda cor="bg-[#16a34a]" rotulo="Livres" n={contagem.livres} redondo />
          <Legenda cor="bg-[#0891b2]" rotulo="Ocupados" n={contagem.ocupados} redondo />
          <Legenda cor="bg-[#94a3b8]" rotulo="Fora" n={contagem.fora} redondo />
        </div>
      </div>

      {/* No celular o cartão ocupa a largura do mapa: o botão sobe junto para
          não ficar escondido atrás dele. */}
      <div
        className="absolute right-3 bottom-8 z-[600] flex flex-col gap-2 transition-[bottom] duration-200 max-sm:bottom-[calc(var(--sobe,0px)+0.75rem)]"
        style={{ '--sobe': alturaSobreposicao ? `${alturaSobreposicao + 12}px` : '1.25rem' } as CSSProperties}
      >
        <BotaoMapa rotulo="Enquadrar tudo" onClick={() => enquadrarMapa(mapa.current, pontos)}>
          <Maximize />
        </BotaoMapa>
      </div>

      {marcadores.length === 0 && !selecionado && (
        <div className="pointer-events-none absolute inset-0 z-[550] flex items-center justify-center p-6">
          <div className="max-w-xs rounded-xl border border-white/10 bg-[#081830]/80 px-5 py-4 text-center text-white backdrop-blur-md">
            <p className="font-display text-[14px] font-semibold">Nada no mapa agora</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/70">
              Chamados com localização e mecânicos com o app aberto nas últimas 2 horas aparecem aqui.
            </p>
          </div>
        </div>
      )}

      {selecionado && (
        <div ref={voltarFila} className="absolute top-[3.75rem] left-3 z-[600] xl:hidden">
          <BotaoVerNaLista rotulo="Ver na fila" onClick={aoVerNaFila} />
        </div>
      )}

      {(selecionado || mecanicoSel) && (
        <div ref={sobreposicao} className="absolute inset-x-2.5 bottom-2.5 z-[650] sm:inset-x-3 sm:right-auto sm:bottom-3 sm:w-[380px]">
          {selecionado ? (
            <CartaoFocoChamado
              key={selecionado.id}
              chamado={selecionado}
              mecanicos={mecanicos}
              tempoAceiteSeg={tempoAceiteSeg}
              aoAbrir={() => aoAbrirChamado(selecionado.id)}
              aoDespachar={() => aoDespachar(selecionado.id)}
              aoFechar={aoFecharSelecao}
            />
          ) : (
            mecanicoSel && (
              <div className="entrada-suave flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-e3">
                <span aria-hidden className={cn('mt-1 size-2.5 shrink-0 rounded-full', SITUACOES_MECANICO[mecanicoSel.situacao].ponto)} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="truncate text-[14px] font-semibold text-ink">{mecanicoSel.nome}</p>
                  <p className="text-[12px] text-ink-2">
                    {SITUACOES_MECANICO[mecanicoSel.situacao].rotulo}
                    {mecanicoSel.posicao_em ? ` · posição ${haQuanto(mecanicoSel.posicao_em)}` : ''}
                  </p>
                  {mecanicoSel.especialidades && <p className="truncate text-[11.5px] text-ink-3">{mecanicoSel.especialidades}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {chamadoDoMecanico && (
                      <Botao
                        tamanho="sm"
                        variante="secundario"
                        onClick={() => aoSelecionar(chamadoDoMecanico.id)}
                        title="Mostrar o chamado no mapa"
                        className="max-sm:h-11"
                      >
                        {chamadoDoMecanico.protocolo}
                      </Botao>
                    )}
                    {linkTelefone(mecanicoSel.telefone) && (
                      <a
                        href={linkTelefone(mecanicoSel.telefone)!}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-3 font-display text-[11px] font-bold tracking-[0.06em] text-ink-2 uppercase hover:bg-surface-2 max-sm:h-11"
                      >
                        <Phone aria-hidden className="size-3.5" /> Ligar
                      </a>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Fechar"
                  onClick={() => setMecSel(null)}
                  className="-mt-1.5 -mr-1.5 flex size-11 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink lg:size-9"
                >
                  <X className="size-4" />
                </button>
              </div>
            )
          )}
        </div>
      )}
    </section>
  )
}

function Legenda({ cor, rotulo, n, redondo, piscar }: { cor: string; rotulo: string; n: number; redondo?: boolean; piscar?: boolean }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] whitespace-nowrap">
      <span aria-hidden className={cn('size-2.5 ring-2 ring-white/80', redondo ? 'rounded-full' : 'rounded-[3px]', cor, piscar && 'sos-piscar')} />
      <span className="text-white/75">{rotulo}</span>
      <span className="num font-semibold">{n}</span>
    </span>
  )
}

/* ── fila ───────────────────────────────────────────────────────────────── */

function FilaChamados({
  consulta,
  tempoAceiteSeg,
  selecao,
  aoPassar,
  aoSelecionar,
  aoAbrirChamado,
  podeCriar,
  aoNovoChamado,
}: {
  consulta: ReturnType<typeof useChamadosAtivos>
  tempoAceiteSeg: number
  selecao: Selecao | null
  aoPassar: (id: string | null) => void
  aoSelecionar: (id: string) => void
  aoAbrirChamado: (id: string) => void
  podeCriar: boolean
  aoNovoChamado: () => void
}) {
  const lista = consulta.data ?? []
  // Na espera, o mais antigo primeiro (é quem está há mais tempo sem socorro);
  // emergência fura a fila.
  const esperando = lista
    .filter((c) => aguardando(c.status))
    .sort((a, b) => Number(b.prioridade === 'emergencia') - Number(a.prioridade === 'emergencia') || Date.parse(a.recebido_em) - Date.parse(b.recebido_em))
  const emCampo = lista.filter((c) => STATUS_EM_CAMPO.includes(c.status))
  const finalizados = lista.filter((c) => c.status === 'servico_finalizado')
  const [verFinalizados, setVerFinalizados] = useState(false)
  const rolagem = useRef<HTMLDivElement>(null)

  // Pino tocado no mapa: o cartão correspondente aparece na fila (no monitor,
  // onde a fila rola sozinha ao lado do mapa).
  useEffect(() => {
    if (selecao?.origem !== 'mapa') return
    const item = rolagem.current?.querySelector<HTMLElement>(`[data-chamado="${selecao.id}"]`)
    rolarDentroDaLista(rolagem.current, item ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecao?.vez])

  const cartao = (c: ChamadoListado, compacto?: boolean) => (
    <CartaoChamado
      key={c.id}
      chamado={c}
      tempoAceiteSeg={tempoAceiteSeg}
      aoAbrir={() => aoSelecionar(c.id)}
      aoAbrirDetalhe={() => aoAbrirChamado(c.id)}
      aoPassar={aoPassar}
      selecionado={selecao?.id === c.id}
      compacto={compacto}
    />
  )

  return (
    <section
      aria-label="Fila de chamados"
      className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-e1 xl:h-[calc(100dvh-23.5rem)] xl:min-h-[400px]"
    >
      <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Siren aria-hidden className={cn('size-4 shrink-0', esperando.length ? 'sos-piscar text-crit' : 'text-ink-3')} />
          <h2 className="truncate font-display text-[14px] font-semibold text-ink">Fila de atendimento</h2>
          <span className="num rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-ink-2">{lista.length - finalizados.length}</span>
        </div>
        {/* No celular o "Abrir SOS" grande do topo da página está logo acima. */}
        {podeCriar && (
          <Botao tamanho="sm" variante="neutro" iconeInicio={<Plus />} onClick={aoNovoChamado} className="max-lg:h-10 max-sm:hidden">
            Abrir SOS
          </Botao>
        )}
      </header>

      {lista.length > 0 && (
        <p className="shrink-0 border-b border-line bg-surface-2/50 px-4 py-1.5 text-[11.5px] text-ink-3">
          Toque para ver no mapa · toque de novo ou em <span className="font-semibold text-ink-2">Abrir</span> para o painel completo
        </p>
      )}

      <div ref={rolagem} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-3">
        {consulta.isLoading && (
          <div className="flex flex-col gap-2.5" role="status" aria-label="Carregando fila">
            {[0, 1, 2].map((i) => (
              <Esqueleto key={i} className="h-[118px] rounded-lg" />
            ))}
          </div>
        )}

        {consulta.isError && <ErroSOS erro={consulta.error} aoTentarNovamente={() => void consulta.refetch()} compacto />}

        {consulta.isSuccess && lista.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-10 text-center">
            <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-ok-soft text-ok-ink ring-1 ring-ok/25">
              <Clock3 className="size-5" />
            </span>
            <div>
              <p className="font-display text-[15px] font-semibold text-ink">Nenhum SOS ativo</p>
              <p className="mt-1 max-w-[30ch] text-[12.5px] leading-relaxed text-ink-3">
                Quando um cliente pedir socorro pelo app, o chamado aparece aqui na hora — com sirene em qualquer tela do sistema.
              </p>
            </div>
            {podeCriar && (
              <Botao tamanho="sm" variante="primario" iconeInicio={<Plus />} onClick={aoNovoChamado} className="max-sm:h-11">
                Abrir SOS por telefone
              </Botao>
            )}
          </div>
        )}

        {esperando.length > 0 && (
          <GrupoFila titulo="Aguardando mecânico" quantidade={esperando.length} tom="crit">
            {esperando.map((c) => cartao(c))}
          </GrupoFila>
        )}

        {emCampo.length > 0 && (
          <GrupoFila titulo="Em atendimento" quantidade={emCampo.length} tom="cyan">
            {emCampo.map((c) => cartao(c, true))}
          </GrupoFila>
        )}

        {finalizados.length > 0 && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setVerFinalizados((v) => !v)}
              aria-expanded={verFinalizados}
              className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-dashed border-line-strong px-3 py-2 text-left text-[12.5px] text-ink-2 hover:bg-surface-2"
            >
              <span>
                <span className="font-semibold text-ink">{finalizados.length}</span> finalizado{finalizados.length > 1 ? 's' : ''} aguardando avaliação do
                cliente
              </span>
              <span className="shrink-0 text-[11.5px] text-ink-3">{verFinalizados ? 'Ocultar' : 'Ver'}</span>
            </button>
            {verFinalizados && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">{finalizados.map((c) => cartao(c, true))}</div>}
          </div>
        )}
      </div>
    </section>
  )
}

function GrupoFila({ titulo, quantidade, tom, children }: { titulo: string; quantidade: number; tom: 'crit' | 'cyan'; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-0.5">
        <span aria-hidden className={cn('h-[3px] w-3.5 rounded-full', tom === 'crit' ? 'bg-crit' : 'bg-cyan')} />
        <span className="lbl">{titulo}</span>
        <span className={cn('num text-[11px] font-semibold', tom === 'crit' ? 'text-crit-ink' : 'text-cyan-ink')}>{quantidade}</span>
      </div>
      {/* Empilhado (tablet): dois cartões por linha; na coluna estreita ao lado do mapa, um. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">{children}</div>
    </div>
  )
}
