import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { BellOff, Clock, MapPin, Phone, Siren, Truck, Volume2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mascaraTelefone } from '@/lib/formatos'
import { useAuth } from '@/auth/AuthProvider'
import { usePermissoes } from '@/permissoes/PermissoesProvider'
import { sosDetalhe } from '@/sos/api'
import { destravarNoPrimeiroToque, pararAlerta, pararTitulo, piscarTitulo, tocarAlerta, vibrarAlerta } from '@/sos/alerta'
import { useTempoRealCentral } from '@/sos/tempoReal'
import { OCORRENCIAS, PRIORIDADES, STATUS_AGUARDANDO, horaCurta, linkTelefone } from '@/sos/rotulos'
import type { ChamadoSOS, DetalheChamado } from '@/sos/tipos'
import { Placa, useChamadosAtivos, useIndicadoresSOS, useSomLiberado } from '@/paginas/sos/comum'

/**
 * Alerta de SOS novo em qualquer tela do Checklist.
 *
 * A central nem sempre está olhando a página do SOS — está na OS, no pátio,
 * no financeiro. Quando um cliente pede socorro, o sistema inteiro avisa:
 * cartão por cima de tudo, sirene, título da aba piscando e vibração no
 * celular. O som depende de um toque prévio na página (regra dos
 * navegadores); enquanto não houver, o cartão oferece "Ativar som".
 */
export function AlertaSOS() {
  const { podeVer, carregando } = usePermissoes()
  if (carregando || !podeVer('sos')) return null
  return <AlertaSOSAtivo />
}

interface AlertaNovo {
  chamado: ChamadoSOS
  detalhe: DetalheChamado | null
  /** Voltou a tocar porque o vigia escalou: ninguém aceitou no prazo. */
  escalado?: boolean
}

function minutosDesde(iso: string): number {
  return Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60_000))
}

/** Sirene repete enquanto ninguém responde, mas não para sempre. */
const INTERVALO_SIRENE_MS = 20_000
const MAX_SIRENES = 6

function AlertaSOSAtivo() {
  const { usuario } = useAuth()
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const indicadores = useIndicadoresSOS()
  const [somLiberado, liberarSom] = useSomLiberado()
  const [fila, setFila] = useState<AlertaNovo[]>([])
  const [silenciado, setSilenciado] = useState(false)
  // Conta só chegadas: dispensar um alerta não pode fazer a sirene tocar de novo.
  const [chegadas, setChegadas] = useState(0)
  const toques = useRef(0)

  // Sem a migração do SOS, nem assina o tempo real: não há tabela para ouvir.
  const ativo = indicadores.isSuccess && indicadores.data?.ok !== false

  useEffect(() => {
    destravarNoPrimeiroToque()
  }, [])

  useTempoRealCentral((c, motivo) => {
    if (!STATUS_AGUARDANDO.includes(c.status)) return
    const escalado = motivo === 'escalado'
    // Quem abriu o SOS pela central já sabe dele — mas não de que ninguém aceitou.
    if (!escalado && c.aberto_por_equipe && c.aberto_por_equipe === usuario?.id) return
    setSilenciado(false)
    toques.current = 0
    setChegadas((n) => n + 1)
    setFila((f) =>
      f.some((x) => x.chamado.id === c.id)
        ? f.map((x) => (x.chamado.id === c.id ? { ...x, chamado: { ...x.chamado, ...c }, escalado: escalado || x.escalado } : x))
        : [{ chamado: c, detalhe: null, escalado }, ...f].slice(0, 12),
    )
    // O evento traz só ids; nome, placa e telefone vêm do detalhe.
    void sosDetalhe(c.id)
      .then((d) => setFila((f) => f.map((x) => (x.chamado.id === c.id ? { ...x, detalhe: d } : x))))
      .catch(() => {})
  }, ativo)

  // Chamado que outra pessoa já despachou (ou o cliente cancelou) sai do alerta sozinho.
  const ativos = useChamadosAtivos(ativo && fila.length > 0)
  useEffect(() => {
    if (!ativos.data || !fila.length) return
    const aguardandoIds = new Set(ativos.data.filter((c) => STATUS_AGUARDANDO.includes(c.status)).map((c) => c.id))
    // Só remove o que a lista já conhece — um SOS recém-chegado pode ainda não estar nela.
    const conhecidos = new Set(ativos.data.map((c) => c.id))
    setFila((f) => {
      const resto = f.filter((x) => aguardandoIds.has(x.chamado.id) || (!conhecidos.has(x.chamado.id) && Date.now() - Date.parse(x.chamado.recebido_em) < 60_000))
      return resto.length === f.length ? f : resto
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativos.data])

  const temAlerta = fila.length > 0

  // Sirene + vibração + título piscando enquanto houver SOS novo sem resposta.
  useEffect(() => {
    if (!temAlerta || silenciado) {
      pararAlerta()
      if (!temAlerta) pararTitulo()
      return
    }
    piscarTitulo('🚨 NOVO SOS')
    const soar = () => {
      if (toques.current >= MAX_SIRENES) return
      toques.current += 1
      tocarAlerta({ tipo: 'sirene', duracaoMs: 6000 })
      vibrarAlerta('sos')
    }
    soar()
    const t = window.setInterval(soar, INTERVALO_SIRENE_MS)
    return () => window.clearInterval(t)
  }, [temAlerta, silenciado, chegadas])

  useEffect(
    () => () => {
      pararAlerta()
      pararTitulo()
    },
    [],
  )

  function dispensar(id: string) {
    setFila((f) => f.filter((x) => x.chamado.id !== id))
  }

  function abrir(id: string) {
    dispensar(id)
    pararAlerta()
    // Dentro do módulo SOS, abre o chamado sem tirar o operador da área em que está.
    navegar(`${naCentral ? pathname : '/sos'}?chamado=${id}`)
  }

  async function ativarSom() {
    if (await liberarSom()) {
      toques.current = Math.max(0, toques.current - 1)
      tocarAlerta({ tipo: 'sirene', duracaoMs: 6000 })
    }
  }

  const aguardando = indicadores.data?.ok === false ? 0 : indicadores.data?.aguardando ?? 0
  const naCentral = pathname === '/sos' || pathname.startsWith('/sos/')
  const atual = fila[0]

  return (
    <>
      {atual && (
        <CartaoAlerta
          alerta={atual}
          restantes={fila.length - 1}
          somLiberado={somLiberado}
          silenciado={silenciado}
          aoAbrir={() => abrir(atual.chamado.id)}
          aoDispensar={() => dispensar(atual.chamado.id)}
          aoSilenciar={() => setSilenciado(true)}
          aoAtivarSom={() => void ativarSom()}
          aoVerTodos={() => {
            setFila([])
            navegar('/sos')
          }}
        />
      )}

      {/* Lembrete discreto fora da central: a fila não pode ser esquecida. Fica
          abaixo dos modais (z-50) para nunca cobrir o botão de salvar de um formulário. */}
      {!atual && !naCentral && aguardando > 0 && (
        <button
          type="button"
          onClick={() => navegar('/sos')}
          style={{ animation: 'tec-surgir .25s ease-out both' }}
          className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex min-h-11 items-center gap-2.5 rounded-full border border-crit/40 bg-crit py-2 pr-4 pl-3 text-white shadow-e3 transition-transform hover:-translate-y-0.5"
          aria-label={`${aguardando} SOS aguardando mecânico. Abrir a central.`}
        >
          <span className="relative flex size-6 items-center justify-center">
            <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-white/40" />
            <Siren aria-hidden className="relative size-4" />
          </span>
          <span className="num text-[13px] font-semibold">{aguardando}</span>
          <span className="text-[12.5px] font-medium">SOS aguardando</span>
        </button>
      )}
    </>
  )
}

function CartaoAlerta({
  alerta,
  restantes,
  somLiberado,
  silenciado,
  aoAbrir,
  aoDispensar,
  aoSilenciar,
  aoAtivarSom,
  aoVerTodos,
}: {
  alerta: AlertaNovo
  restantes: number
  somLiberado: boolean
  silenciado: boolean
  aoAbrir: () => void
  aoDispensar: () => void
  aoSilenciar: () => void
  aoAtivarSom: () => void
  aoVerTodos: () => void
}) {
  const c = alerta.chamado
  const d = alerta.detalhe
  const info = OCORRENCIAS[c.tipo_ocorrencia] ?? OCORRENCIAS.outro
  const Icone = info.icone
  const emergencia = c.prioridade === 'emergencia'
  const telefone = d?.cliente?.telefone ?? c.telefone_contato
  const tel = linkTelefone(telefone)
  const veiculo = d?.veiculo ? [d.veiculo.marca, d.veiculo.modelo].filter(Boolean).join(' ') || d.veiculo.descricao : null

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-labelledby="alerta-sos-titulo"
      aria-describedby="alerta-sos-corpo"
      className="pointer-events-none fixed inset-x-0 top-[calc(4.5rem+env(safe-area-inset-top))] z-[75] flex justify-center px-3"
    >
      {/* Entrada que já começa visível: com a aba em segundo plano o navegador
          pausa animações, e um alerta preso em opacidade zero seria o pior caso. */}
      <div
        style={{ animation: 'tec-surgir .25s ease-out both' }}
        className={cn(
          'pointer-events-auto relative w-full max-w-[560px] overflow-hidden rounded-2xl border text-white shadow-[0_24px_60px_-12px_rgb(0_0_0/0.55)]',
          'bg-[#081830]',
          emergencia ? 'border-[#f0483e]/70' : 'border-[#ff6a00]/60',
        )}
      >
        <span aria-hidden className={cn('sos-piscar absolute inset-x-0 top-0 h-1', emergencia ? 'bg-[#f0483e]' : 'bg-[#ff6a00]')} />
        {/* Brilho vermelho no canto: o cartão precisa gritar sem virar poluição. */}
        <span aria-hidden className={cn('absolute -top-16 -left-16 size-44 rounded-full blur-3xl', emergencia ? 'bg-[#f0483e]/35' : 'bg-[#ff6a00]/30')} />

        <div className="relative flex items-start gap-3 px-4 pt-4 sm:px-5">
          <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#f0483e]">
            <span aria-hidden className="absolute inset-0 animate-ping rounded-xl bg-[#f0483e]/60" />
            <Siren aria-hidden className="relative size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p id="alerta-sos-titulo" className="font-display text-[14px] font-bold tracking-[0.06em] uppercase sm:text-[16px] sm:tracking-[0.08em]">
              {alerta.escalado ? `Sem mecânico há ${minutosDesde(c.recebido_em)} min` : 'Novo SOS Tecnoar'}
            </p>
            {alerta.escalado && (
              <p className="text-[12px] font-semibold text-[#ffc15e]">Ninguém aceitou no prazo — despache agora ou ligue para o cliente.</p>
            )}
            <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-white/70">
              <span className="num">{c.protocolo}</span>
              <span className="flex items-center gap-1">
                <Clock aria-hidden className="size-3" /> {horaCurta(c.recebido_em)}
              </span>
              {c.prioridade !== 'normal' && (
                <span className={cn('rounded-full px-2 py-px text-[10.5px] font-bold uppercase', emergencia ? 'bg-[#f0483e]' : 'bg-[#f5a524] text-[#081830]')}>
                  {PRIORIDADES[c.prioridade].rotulo}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {somLiberado && !silenciado && (
              <button
                type="button"
                onClick={aoSilenciar}
                aria-label="Silenciar sirene"
                title="Silenciar sirene"
                className="flex size-10 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
              >
                <BellOff className="size-4" />
              </button>
            )}
            <button
              type="button"
              onClick={aoDispensar}
              aria-label="Dispensar alerta"
              title="Dispensar"
              className="flex size-10 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        <div id="alerta-sos-corpo" className="relative flex flex-col gap-2.5 px-4 pt-3 pb-4 sm:px-5">
          <p className="truncate font-display text-[19px] leading-tight font-semibold sm:text-[21px]">{d?.cliente?.nome ?? 'Carregando cliente…'}</p>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-white/85">
            <span className="flex min-w-0 items-center gap-1.5">
              <Icone aria-hidden className="size-4 shrink-0 text-[#ff9a4d]" />
              <span className="font-semibold">{info.rotulo}</span>
            </span>
            {(d?.veiculo || veiculo) && (
              <span className="flex min-w-0 items-center gap-1.5">
                <Truck aria-hidden className="size-4 shrink-0 text-white/60" />
                {d?.veiculo?.placa && <Placa placa={d.veiculo.placa} className="border-white/70 bg-white text-[#081830]" />}
                {veiculo && <span className="truncate">{veiculo}</span>}
              </span>
            )}
          </div>
          {telefone && (
            <p className="flex items-center gap-1.5 text-[12.5px] text-white/75">
              <Phone aria-hidden className="size-3.5 shrink-0" />
              <span className="num">{mascaraTelefone(telefone)}</span>
            </p>
          )}
          {c.endereco && (
            <p className="flex min-w-0 items-start gap-1.5 text-[12.5px] text-white/75">
              <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              <span className="line-clamp-2">{c.endereco}</span>
            </p>
          )}
          {c.descricao && <p className="line-clamp-2 text-[12.5px] leading-relaxed text-white/70">“{c.descricao}”</p>}

          {!somLiberado && (
            <button
              type="button"
              onClick={aoAtivarSom}
              className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-[#f5a524]/50 bg-[#f5a524]/15 px-3 text-[12.5px] font-semibold text-[#ffc15e]"
            >
              <Volume2 aria-hidden className="size-4" /> O navegador bloqueou o som — toque para ativar a sirene
            </button>
          )}

          <div className={cn('mt-1 grid grid-cols-1 gap-2', tel ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1')}>
            <button
              type="button"
              onClick={aoAbrir}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#ff6a00] font-display text-[13px] font-bold tracking-[0.06em] uppercase shadow-[0_8px_20px_-8px_rgb(255_106_0/0.8)] transition-transform hover:bg-[#ff7a22] active:scale-[0.99]"
            >
              <Siren aria-hidden className="size-4" /> Abrir chamado
            </button>
            {tel && (
              <a
                href={tel}
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-white/20 px-4 font-display text-[12px] font-bold tracking-[0.06em] uppercase hover:bg-white/10"
              >
                <Phone aria-hidden className="size-4" /> Ligar
              </a>
            )}
          </div>

          {restantes > 0 && (
            <button type="button" onClick={aoVerTodos} className="text-center text-[12px] text-white/70 underline-offset-2 hover:text-white hover:underline">
              Mais {restantes} SOS novo{restantes > 1 ? 's' : ''} — ver todos na central
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
