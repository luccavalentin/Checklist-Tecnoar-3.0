import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ChevronLeft, ImagePlus, Mic, MapPin, Search, Send, Square, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { sosApagarMensagem, sosEnviarAnexo, sosEnviarMensagem, sosMarcarMensagensLidas, sosUrlsArquivos } from '../api'
import { CHAVES_SOS } from '../tempoReal'
import type { MensagemSOS } from '../tipos'
import { useGravadorAudio } from '../componentes'
import { Bolha, JANELA_APAGAR_MS, relogio } from './Bolha'
import { usePresencaConversa } from './presenca'
import './conversa.css'

export interface EnvioConversa { texto?: string; rapida?: boolean; blob?: Blob; duracao?: number; lat?: number; lng?: number; respondeA?: string | null }
export interface TransporteConversa {
  sala: string; privada: boolean; chave: readonly unknown[]
  enviar: (p: EnvioConversa) => Promise<unknown>
  apagar: (id: string) => Promise<unknown>
  ler: () => Promise<unknown>
  urls: (caminhos: string[]) => Promise<Record<string, string>>
}

/**
 * A conversa entre o motorista e o mecânico, em tela cheia.
 *
 * O QUE ELA PRECISA SER, E POR QUÊ
 *
 * Antes era uma caixa de 46% da altura, enfiada no fim da tela de
 * acompanhamento, abaixo do mapa, do orçamento e da linha do tempo. Como
 * registro, funcionava. Como CONVERSA, não: para escrever uma linha a pessoa
 * rolava a tela inteira, e a cada mensagem nova rolava de novo. Conversa que
 * não é a tela toda não é conversa — é um campo de observações.
 *
 * As decisões que sustentam esta tela:
 *
 * 1. VOZ EM PRIMEIRO LUGAR. O botão do microfone fica onde o dedo cai, e só
 *    vira "enviar" quando há texto. As duas pontas têm as mãos ocupadas: um
 *    está debaixo do caminhão, o outro está dirigindo. Obrigar a digitar é
 *    obrigar a parar o que se está fazendo.
 *
 * 2. O ESTADO DO OUTRO LADO É INFORMAÇÃO, NÃO ENFEITE. "Online", "digitando"
 *    e os dois tiques respondem a mesma pergunta — tem gente do outro lado?
 *    —, que é a pergunta que mais importa para quem está parado no escuro.
 *
 * 3. NADA SOME. Mensagem apagada deixa lápide; mensagem sem sinal fica com o
 *    relógio e sai depois. Conversa de socorro vira prova em discussão de
 *    garantia: esta tela nunca finge que algo não aconteceu.
 *
 * 4. A ROLAGEM OBEDECE A QUEM LÊ. Só desce sozinho se a pessoa já estava no
 *    fim. Quem subiu para reler algo não é arrastado de volta — ganha um
 *    botão com o número de mensagens novas, e desce quando quiser.
 */
export function TelaConversa({
  chamadoId,
  mensagens,
  meuId,
  tituloOutro,
  rapidas = [],
  encerrado,
  aoVoltar,
  icones,
  marca,
  transporte,
  carregarAnteriores,
}: {
  chamadoId: string
  mensagens: MensagemSOS[]
  meuId: string | null | undefined
  /** Nome de quem está do outro lado, para o cabeçalho. */
  tituloOutro: string
  rapidas?: string[]
  encerrado?: boolean
  aoVoltar: () => void
  icones?: { foto: ReactNode; local: ReactNode; audio: ReactNode; enviar: ReactNode; perfil?: ReactNode }
  marca?: ReactNode
  transporte?: TransporteConversa
  carregarAnteriores?: () => void
}) {
  const qc = useQueryClient()
  const lista = useRef<HTMLDivElement>(null)
  const [texto, setTexto] = useState('')
  const [busca, setBusca] = useState<string | null>(null)
  const [respondendo, setRespondendo] = useState<MensagemSOS | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [noFim, setNoFim] = useState(true)
  const [destaque, setDestaque] = useState<string | null>(null)
  const foto = useRef<HTMLInputElement>(null)
  const gravador = useGravadorAudio()
  const presenca = usePresencaConversa(chamadoId, meuId, transporte?.sala, transporte?.privada)

  const porId = useMemo(() => new Map(mensagens.map((m) => [m.id, m])), [mensagens])
  const naoLidas = useMemo(
    () => mensagens.filter((m) => !m.lida_em && m.autor_id !== meuId).length,
    [mensagens, meuId],
  )

  /* ── mídia: uma URL assinada por arquivo, resolvida em lote ────────────── */
  const [urls, setUrls] = useState<Record<string, string>>({})
  const caminhos = useMemo(
    () => mensagens.map((m) => m.midia_caminho).filter((c): c is string => !!c),
    [mensagens],
  )
  useEffect(() => {
    const faltando = caminhos.filter((c) => !urls[c])
    if (!faltando.length) return
    let vivo = true
    void (transporte ? transporte.urls(faltando) : sosUrlsArquivos(faltando))
      .then((novas) => vivo && setUrls((a) => ({ ...a, ...novas })))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [caminhos, urls, transporte])

  /* ── lida ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    const marcar = () => {
      if (naoLidas && document.visibilityState === 'visible') void (transporte ? transporte.ler() : sosMarcarMensagensLidas(chamadoId)).catch(() => {})
    }
    marcar()
    document.addEventListener('visibilitychange', marcar)
    return () => document.removeEventListener('visibilitychange', marcar)
  }, [naoLidas, chamadoId, transporte])

  /* ── rolagem ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    const el = lista.current
    if (el && noFim) el.scrollTop = el.scrollHeight
  }, [mensagens.length, noFim])

  const enviar = useMutation({
    mutationFn: async (p: {
      texto?: string
      rapida?: boolean
      blob?: Blob
      duracao?: number
      lat?: number
      lng?: number
    }) => {
      if (transporte) return transporte.enviar({ ...p, respondeA: respondendo?.id ?? null })
      let midiaCaminho: string | null = null
      let midiaTipo: string | null = null
      if (p.blob) {
        const anexo = await sosEnviarAnexo(chamadoId, p.blob, { etapa: 'outro' })
        midiaCaminho = anexo.caminho
        midiaTipo = p.blob.type
      }
      return sosEnviarMensagem(chamadoId, p.texto ?? '', {
        rapida: p.rapida,
        midiaCaminho,
        midiaTipo,
        respondeA: respondendo?.id ?? null,
        duracaoSeg: p.duracao ?? null,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
      })
    },
    onSuccess: () => {
      setTexto('')
      setErro(null)
      setRespondendo(null)
      setNoFim(true)
      presenca.pararDigitando()
      void qc.invalidateQueries({ queryKey: transporte?.chave ?? CHAVES_SOS.detalhe(chamadoId) })
    },
    onError: (e) => setErro((e as Error).message),
  })

  const apagar = useMutation({
    mutationFn: (id: string) => transporte ? transporte.apagar(id) : sosApagarMensagem(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: transporte?.chave ?? CHAVES_SOS.detalhe(chamadoId) }),
    onError: (e) => setErro((e as Error).message),
  })

  async function alternarAudio() {
    setErro(null)
    if (gravador.gravando) {
      const segundos = gravador.segundos
      const blob = await gravador.parar()
      // Toque sem querer: um áudio de meio segundo só gera ruído na conversa.
      if (!blob || segundos < 1) return
      enviar.mutate({ blob, duracao: segundos })
      return
    }
    try {
      await gravador.iniciar()
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  function mandarLocal() {
    setErro(null)
    navigator.geolocation?.getCurrentPosition(
      (p) => enviar.mutate({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setErro('Não consegui pegar sua localização. Verifique a permissão do GPS.'),
      { enableHighAccuracy: true, timeout: 12_000 },
    )
  }

  function irParaCitada(id: string) {
    const el = document.getElementById(`msg-${id}`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setDestaque(id)
    window.setTimeout(() => setDestaque(null), 1400)
  }

  const blocos = agruparPorDia(busca?.trim() ? mensagens.filter(m => !m.apagada_em && m.texto?.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR'))) : mensagens)
  const primeiraNaoLida = mensagens.find((m) => !m.lida_em && m.autor_id !== meuId)?.id ?? null

  return (
    <div className={cn('cv-tela', icones && 'cv-com-arte')}>
      <header className="cv-topo">
        <button type="button" onClick={aoVoltar} aria-label="Voltar" className="cv-voltar">
          <ChevronLeft className="size-6" />
        </button>
        {icones?.perfil && <span className="flex size-10 shrink-0 items-center justify-center">{icones.perfil}</span>}
        <div className="min-w-0 flex-1">
          <p className="cv-topo-nome">{tituloOutro}</p>
          <p className={cn('cv-topo-estado', presenca.digitando && 'cv-topo-estado-vivo')}>
            {presenca.digitando
              ? 'digitando…'
              : presenca.online
                ? 'online'
                : presenca.vistoEm
                  ? `visto às ${presenca.vistoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
                  : 'offline'}
          </p>
        </div>
        {marca && <span className="cv-marca shrink-0">{marca}</span>}
        <button type="button" className="cv-voltar" aria-label={busca === null ? 'Buscar mensagens' : 'Fechar busca'} onClick={() => setBusca(v => v === null ? '' : null)}>{busca === null ? <Search className="size-5" /> : <X className="size-5" />}</button>
      </header>
      {busca !== null && <label className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2"><Search className="size-4 text-ink-3" /><input autoFocus aria-label="Buscar nesta conversa" placeholder="Buscar nesta conversa" value={busca} onChange={e => setBusca(e.target.value)} className="min-h-10 min-w-0 flex-1 bg-transparent text-ink outline-none" /></label>}

      <div
        ref={lista}
        className="cv-lista"
        onScroll={(e) => {
          const el = e.currentTarget
          setNoFim(el.scrollHeight - el.scrollTop - el.clientHeight < 90)
        }}
      >
        {carregarAnteriores && <button type="button" className="mx-auto mb-4 min-h-11 rounded-full bg-surface px-5 text-sm text-ink" onClick={() => { setNoFim(false); carregarAnteriores() }}>Carregar mensagens anteriores</button>}
        {mensagens.length === 0 && (
          <p className="cv-vazio">
            Nenhuma mensagem ainda. Mande um áudio contando o que está vendo — é mais rápido que escrever.
          </p>
        )}

        {blocos.map((bloco) => (
          <div key={bloco.dia} className="contents">
            <p className="cv-dia">{bloco.dia}</p>
            {bloco.itens.map((m) => (
              <div key={m.id} id={`msg-${m.id}`} className={cn(destaque === m.id && 'cv-destacada')}>
                {m.id === primeiraNaoLida && <p className="cv-divisor">Não lidas</p>}
                <Bolha
                  m={m}
                  minha={m.autor_id === meuId}
                  citada={m.responde_a ? (porId.get(m.responde_a) ?? null) : null}
                  urlMidia={m.midia_caminho ? (urls[m.midia_caminho] ?? null) : null}
                  podeApagar={
                    m.autor_id === meuId && Date.now() - Date.parse(m.created_at) < JANELA_APAGAR_MS && !m.apagada_em
                  }
                  aoResponder={() => setRespondendo(m)}
                  aoApagar={() => apagar.mutate(m.id)}
                  aoVerCitada={irParaCitada}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {!noFim && (
        <button
          type="button"
          onClick={() => {
            const el = lista.current
            if (el) el.scrollTop = el.scrollHeight
            setNoFim(true)
          }}
          className="cv-descer"
          aria-label={naoLidas ? `Descer para ${naoLidas} mensagens novas` : 'Descer para o fim'}
        >
          <ArrowDown className="size-5" />
          {naoLidas > 0 && <span className="cv-descer-contador num">{naoLidas > 99 ? '99+' : naoLidas}</span>}
        </button>
      )}

      {encerrado ? (
        <p className="cv-fechada">Chamado encerrado: a conversa foi fechada.</p>
      ) : (
        <div className="cv-compositor">
          {erro && <p className="cv-erro">{erro}</p>}

          {respondendo && (
            <div className="cv-respondendo">
              <span className="min-w-0 flex-1">
                <span className="cv-respondendo-autor">{respondendo.autor_nome?.split(' ')[0] ?? 'Mensagem'}</span>
                <span className="cv-respondendo-texto">{respondendo.texto ?? 'Mídia'}</span>
              </span>
              <button type="button" onClick={() => setRespondendo(null)} aria-label="Cancelar a resposta">
                <X className="size-[18px]" />
              </button>
            </div>
          )}

          {rapidas.length > 0 && !texto && !gravador.gravando && (
            <div className="cv-rapidas">
              {rapidas.map((r) => (
                <button key={r} type="button" disabled={enviar.isPending} onClick={() => enviar.mutate({ texto: r, rapida: true })}>
                  {r}
                </button>
              ))}
            </div>
          )}

          {gravador.gravando ? (
            <div className="cv-gravando">
              <span aria-hidden className="cv-gravando-ponto" />
              <span className="min-w-0 flex-1">Gravando… solte quando terminar</span>
              <span className="num">{relogio(gravador.segundos)}</span>
              <button type="button" onClick={() => void alternarAudio()} className="cv-enviar" aria-label="Parar e enviar o áudio">
                <Square className="size-5" fill="currentColor" />
              </button>
            </div>
          ) : (
            <form
              className="cv-barra"
              onSubmit={(e) => {
                e.preventDefault()
                if (texto.trim()) enviar.mutate({ texto: texto.trim() })
              }}
            >
              <button type="button" onClick={() => foto.current?.click()} aria-label={transporte ? 'Enviar foto, vídeo ou documento' : 'Mandar uma foto'} className="cv-acessorio">
                {icones?.foto ?? <ImagePlus className="size-[21px]" />}
              </button>
              <button type="button" onClick={mandarLocal} aria-label="Mandar minha localização" className="cv-acessorio">
                {icones?.local ?? <MapPin className="size-[21px]" />}
              </button>
              <textarea
                value={texto}
                maxLength={transporte ? 4000 : 2000}
                rows={1}
                placeholder="Mensagem"
                aria-label="Mensagem"
                onChange={(e) => {
                  setTexto(e.target.value)
                  presenca.avisarDigitando()
                }}
                onBlur={presenca.pararDigitando}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (texto.trim()) enviar.mutate({ texto: texto.trim() })
                  }
                }}
                className="cv-campo"
              />
              {/* Microfone vira avião quando há texto: um alvo só na posição
                  que o polegar já conhece, em vez de dois disputando o canto. */}
              <button
                type={texto.trim() ? 'submit' : 'button'}
                onClick={texto.trim() ? undefined : () => void alternarAudio()}
                disabled={enviar.isPending || (!texto.trim() && !gravador.suportado)}
                aria-label={texto.trim() ? 'Enviar' : 'Gravar um áudio'}
                className="cv-enviar"
              >
                {texto.trim() ? icones?.enviar ?? <Send className="size-5" /> : icones?.audio ?? <Mic className="size-5" />}
              </button>
            </form>
          )}

          <input
            ref={foto}
            type="file"
            accept={transporte ? 'image/jpeg,image/png,image/webp,image/heic,video/mp4,video/webm,application/pdf,text/plain' : 'image/*'}
            capture={transporte ? undefined : 'environment'}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) enviar.mutate({ blob: f })
            }}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Separadores de dia.
 *
 * Numa conversa que atravessa a virada da noite — e socorro de estrada
 * atravessa —, duas mensagens às 23h50 e às 00h10 ficam coladas e parecem do
 * mesmo momento. O separador é o que impede alguém de ler "ele disse que
 * estava chegando" como se fosse de agora.
 */
function agruparPorDia(ms: MensagemSOS[]): { dia: string; itens: MensagemSOS[] }[] {
  const out: { dia: string; itens: MensagemSOS[] }[] = []
  for (const m of ms) {
    const dia = rotuloDia(m.created_at)
    const ultimo = out[out.length - 1]
    if (ultimo?.dia === dia) ultimo.itens.push(m)
    else out.push({ dia, itens: [m] })
  }
  return out
}

function rotuloDia(iso: string): string {
  const d = new Date(iso)
  const hoje = new Date()
  const ontem = new Date(hoje)
  ontem.setDate(hoje.getDate() - 1)
  const mesmo = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (mesmo(d, hoje)) return 'Hoje'
  if (mesmo(d, ontem)) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
}
