import { AlarmClock, MapPin, MessageSquareText, Siren, SquareArrowOutUpRight, UserRoundX, WifiOff, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Selo } from '@/componentes/ui/Selo'
import { SeloStatus } from '@/sos/componentes'
import { PRIORIDADES, dataHoraCurta, formatarDuracao, formatarEta, horaCurta } from '@/sos/rotulos'
import type { ChamadoListado, ChamadoSOS } from '@/sos/tipos'
import { IconeOcorrencia, Placa, aguardando, cronometro, segundosDesde, useAgora } from './comum'

/**
 * Relógio do chamado conforme a etapa: quem espera vê a espera correndo; quem
 * está em campo vê a previsão ou há quanto tempo está lá. Fica vermelho
 * quando a espera passa do tempo de aceite configurado — é o sinal de que a
 * central precisa agir, não só observar.
 */
export function RelogioChamado({ chamado: c, tempoAceiteSeg, className }: { chamado: ChamadoSOS; tempoAceiteSeg: number; className?: string }) {
  const espera = aguardando(c.status)
  const agora = useAgora(espera ? 1000 : 20_000)

  if (espera) {
    const seg = segundosDesde(c.recebido_em, agora)
    const atrasado = seg > tempoAceiteSeg
    return (
      <span
        className={cn(
          'num inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12px] font-semibold',
          atrasado ? 'bg-crit text-white' : 'bg-crit-soft text-crit-ink',
          className,
        )}
        title={atrasado ? 'Passou do tempo de aceite configurado' : 'Tempo de espera'}
      >
        <span aria-hidden className={cn('size-1.5 rounded-full', atrasado ? 'sos-piscar bg-white' : 'bg-crit')} />
        {cronometro(seg)}
      </span>
    )
  }

  let texto: string
  switch (c.status) {
    case 'aceito':
    case 'a_caminho':
      texto = c.eta_min != null ? `chega em ${formatarEta(c.eta_min)}` : `a caminho há ${formatarDuracao(segundosDesde(c.a_caminho_em ?? c.aceito_em, agora))}`
      break
    case 'no_local':
      texto = `no local há ${formatarDuracao(segundosDesde(c.chegou_em, agora))}`
      break
    case 'servico_iniciado':
      texto = `em serviço há ${formatarDuracao(segundosDesde(c.iniciado_em, agora))}`
      break
    case 'servico_finalizado':
      texto = `finalizado ${horaCurta(c.finalizado_em)}`
      break
    case 'cancelado':
      texto = dataHoraCurta(c.cancelado_em ?? c.recebido_em)
      break
    default:
      texto = dataHoraCurta(c.concluido_em ?? c.recebido_em)
  }
  return <span className={cn('num text-[11.5px] whitespace-nowrap text-ink-3', className)}>{texto}</span>
}

/**
 * O que o vigia do servidor já denunciou neste chamado: escalado por falta de
 * aceite, mecânico atrasado, mecânico sem posição. Some sozinho quando deixa
 * de valer (aceitou, chegou, a posição voltou).
 */
export function AvisosVigia({ chamado: c, className }: { chamado: ChamadoSOS; className?: string }) {
  const avisos: Array<{ chave: string; texto: string; icone: typeof Siren; forte?: boolean }> = []
  if (aguardando(c.status) && (c.alerta_nivel ?? 0) >= 1) {
    avisos.push({
      chave: 'escalado',
      texto: (c.alerta_nivel ?? 0) >= 2 ? 'Escalado: despache já' : 'Ninguém aceitou no prazo',
      icone: Siren,
      forte: (c.alerta_nivel ?? 0) >= 2,
    })
  }
  const emDeslocamento = c.status === 'aceito' || c.status === 'a_caminho'
  if (emDeslocamento && c.atraso_avisado_em) avisos.push({ chave: 'atraso', texto: 'Mecânico atrasado', icone: AlarmClock })
  if (emDeslocamento && c.sinal_avisado_em) avisos.push({ chave: 'sinal', texto: 'Sem posição do mecânico', icone: WifiOff, forte: true })
  if (!avisos.length) return null
  return (
    <div className={cn('flex min-w-0 flex-wrap gap-1.5', className)}>
      {avisos.map(({ chave, texto, icone: Icone, forte }) => (
        <span
          key={chave}
          className={cn(
            'inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
            forte ? 'bg-crit text-white' : 'bg-warn-soft text-warn-ink',
          )}
        >
          <Icone aria-hidden className="size-3 shrink-0" />
          <span className="truncate">{texto}</span>
        </span>
      ))}
    </div>
  )
}

function faixaDoChamado(c: ChamadoSOS): string {
  if (c.status === 'cancelado') return 'bg-line-strong'
  if (c.prioridade === 'emergencia' && c.status !== 'concluido' && c.status !== 'servico_finalizado') return 'bg-crit'
  if (aguardando(c.status)) return 'bg-accent'
  if (c.status === 'servico_finalizado' || c.status === 'concluido') return 'bg-ok'
  return 'bg-cyan'
}

export function CartaoChamado({
  chamado: c,
  tempoAceiteSeg,
  aoAbrir,
  aoAbrirDetalhe,
  selecionado,
  aoPassar,
  compacto,
}: {
  chamado: ChamadoListado
  tempoAceiteSeg: number
  /** Toque no cartão. Na fila da central, seleciona e mostra no mapa; nas listas, abre. */
  aoAbrir: () => void
  /**
   * Quando o toque no cartão só seleciona, este é o caminho direto para o
   * painel do chamado — um botão "Abrir" próprio no rodapé do cartão.
   */
  aoAbrirDetalhe?: () => void
  selecionado?: boolean
  /** Realça o pino correspondente no mapa enquanto o cursor está no cartão. */
  aoPassar?: (id: string | null) => void
  compacto?: boolean
}) {
  const espera = aguardando(c.status)
  const emergencia = c.prioridade === 'emergencia'
  const seleciona = !!aoAbrirDetalhe

  return (
    <div
      data-chamado={c.id}
      onMouseEnter={aoPassar ? () => aoPassar(c.id) : undefined}
      onMouseLeave={aoPassar ? () => aoPassar(null) : undefined}
      className={cn(
        '@container group relative flex w-full min-w-0 flex-col gap-2 overflow-hidden rounded-lg border bg-surface text-left shadow-e1',
        'transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-line-strong hover:shadow-e2 has-[>button:active]:translate-y-0',
        compacto ? 'p-3 pl-3.5' : 'p-3.5 pl-4',
        espera && emergencia ? 'border-crit/55 ring-1 ring-crit/25' : espera ? 'border-accent/45' : 'border-line',
        selecionado && 'border-cyan bg-cyan-soft/25 ring-2 ring-cyan/35 hover:border-cyan',
      )}
    >
      {/* O cartão inteiro é um botão só (camada por baixo do conteúdo), e o
          "Abrir" fica por cima dela: botão dentro de botão não é HTML válido e
          o leitor de tela se perde. O conteúdo deixa o toque passar. */}
      <button
        type="button"
        onClick={aoAbrir}
        onFocus={aoPassar ? () => aoPassar(c.id) : undefined}
        onBlur={aoPassar ? () => aoPassar(null) : undefined}
        aria-label={seleciona ? `Mostrar no mapa o chamado ${c.protocolo} de ${c.cliente_nome}` : `Abrir chamado ${c.protocolo} de ${c.cliente_nome}`}
        aria-pressed={seleciona ? !!selecionado : undefined}
        title={seleciona ? (selecionado ? 'Toque de novo para abrir o chamado' : 'Mostrar no mapa') : undefined}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-cyan focus-visible:outline-none focus-visible:ring-inset"
      />

      <span aria-hidden className={cn('pointer-events-none absolute inset-y-0 left-0 w-[3px]', faixaDoChamado(c), espera && 'sos-piscar')} />

      <div className="pointer-events-none flex min-w-0 items-start gap-2.5">
        <IconeOcorrencia tipo={c.tipo_ocorrencia} tamanho={compacto ? 'sm' : 'md'} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1">
            {selecionado && seleciona && <MapPin aria-hidden className="size-3 shrink-0 text-cyan-ink" />}
            <span className={cn('num truncate text-[11.5px] font-semibold', selecionado && seleciona ? 'text-cyan-ink' : 'text-ink-3')}>{c.protocolo}</span>
            {/* Aberto pelo próprio mecânico em campo: já nasce com ele no local ou a caminho. */}
            {c.origem === 'mecanico' && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-cyan-soft px-1.5 py-px text-[10.5px] font-semibold text-cyan-ink" title="Chamado aberto pelo mecânico em campo">
                <Wrench aria-hidden className="size-2.5" /> Pelo mecânico
              </span>
            )}
          </span>
          <span className="truncate text-[14px] leading-snug font-semibold text-ink">{c.cliente_nome}</span>
        </div>
        <RelogioChamado chamado={c} tempoAceiteSeg={tempoAceiteSeg} className="shrink-0" />
      </div>

      <div className="pointer-events-none flex min-w-0 items-center gap-2">
        <Placa placa={c.placa} />
        <span className="min-w-0 truncate text-[12.5px] text-ink-2">
          {[c.veiculo, c.ocorrencia_rotulo].filter(Boolean).join(' · ')}
        </span>
      </div>

      <AvisosVigia chamado={c} className="pointer-events-none" />

      {!compacto && (c.endereco || c.latitude == null) && (
        <span className="pointer-events-none flex min-w-0 items-center gap-1.5 text-[12px] text-ink-3">
          <MapPin aria-hidden className={cn('size-3.5 shrink-0', c.latitude == null && 'text-warn')} />
          <span className={cn('truncate', c.latitude == null && !c.endereco && 'text-warn-ink')}>{c.endereco ?? 'Sem localização'}</span>
        </span>
      )}

      <div className="pointer-events-none flex min-w-0 items-center gap-1.5 border-t border-line pt-2">
        {c.prioridade !== 'normal' && c.status !== 'concluido' && c.status !== 'cancelado' && (
          <Selo tom={PRIORIDADES[c.prioridade].tom}>{PRIORIDADES[c.prioridade].rotulo}</Selo>
        )}
        <SeloStatus status={c.status} />
        <span className="ml-0.5 flex min-w-0 flex-1 items-center gap-1.5 text-[12px]">
          {c.mecanico_nome ? (
            <>
              <Wrench aria-hidden className="size-3.5 shrink-0 text-ink-3" />
              <span className="truncate text-ink-2">{c.mecanico_nome.split(' ').slice(0, 2).join(' ')}</span>
            </>
          ) : c.status === 'cancelado' || c.status === 'concluido' ? null : (
            <>
              <UserRoundX aria-hidden className="size-3.5 shrink-0 text-warn" />
              {/* Cartão estreito (celular, duas colunas no tablet): sobra o ícone —
                  cortado em "Sem mecâ…" o texto não diz nada. */}
              <span className="truncate font-medium text-warn-ink @max-[24rem]:sr-only">Sem mecânico</span>
            </>
          )}
        </span>
        {c.mensagens_nao_lidas > 0 && (
          <span className="num flex shrink-0 items-center gap-1 rounded-full bg-accent px-1.5 py-0.5 text-[10.5px] font-semibold text-on-accent" title="Mensagens do cliente não lidas">
            <MessageSquareText aria-hidden className="size-3" />
            {c.mensagens_nao_lidas}
          </span>
        )}
        {c.os_numero != null && <span className="num shrink-0 text-[11px] text-ink-3">OS {String(c.os_numero).padStart(5, '0')}</span>}
        {aoAbrirDetalhe && (
          <button
            type="button"
            onClick={aoAbrirDetalhe}
            aria-label={`Abrir o chamado ${c.protocolo}`}
            title="Abrir o chamado"
            className={cn(
              // Visualmente compacto, mas a área de toque vai a 44 px (a
              // camada ::before), para não errar o alvo no tablet.
              'pointer-events-auto relative z-10 -my-1 inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-line-strong bg-surface px-2',
              'font-display text-[10.5px] font-bold tracking-[0.06em] text-ink-2 uppercase transition-colors hover:border-ink-3 hover:text-ink',
              "before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']",
              'focus-visible:ring-2 focus-visible:ring-cyan focus-visible:outline-none',
            )}
          >
            <SquareArrowOutUpRight aria-hidden className="size-3.5" />
            <span className="max-[380px]:sr-only">Abrir</span>
          </button>
        )}
      </div>
    </div>
  )
}
