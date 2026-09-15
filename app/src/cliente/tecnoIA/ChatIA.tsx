import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUp, CalendarPlus, Camera, CircleAlert, Clock, Image as IconeImagem, ListChecks, Loader2, PhoneCall, RotateCcw, Siren, WifiOff, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ErroIa, blobParaBase64, sosIaAtendimento } from '@/sos/api'
import { reduzirImagem } from '@/sos/componentes'
import { OCORRENCIAS, PRIORIDADES, linkTelefone } from '@/sos/rotulos'
import type { MensagemIa, SugestaoAgendamentoIa, SugestaoSosIa, TipoAgendamento } from '@/sos/tipos'
import { useCliente } from '../../sessao'
import { BotaoApp } from '../../comum/ui'
import { useOnline } from '../../comum/Pwa'
import { CHAVE_IA_PUBLICO, chaveConversaIA, primeiroNome, useAlturaTeclado, useHomeCliente, useInfoPublica, type EstadoAgendar, type EstadoFluxoSOS } from '../dados'
import { IconeOcorrencia } from '../pecas'
import { BalaoIA, BalaoVoce, Digitando, TextoIA } from './pecasIA'

/**
 * Conversa com a Tecno IA de verdade (função `sos-ia`, ação `atendimento`).
 *
 * O histórico vive na tela e na sessão do navegador (volta inteiro depois de
 * abrir o SOS ou a revisão e voltar); o servidor recebe as últimas mensagens
 * a cada pergunta e já junta o contexto do cliente (veículo, últimos
 * serviços). Quando a resposta traz uma sugestão, ela vira ação: "Pedir SOS
 * com isso" abre o pedido já preenchido, como no guia rápido; "Agendar" abre
 * o agendamento com a descrição.
 *
 * Tudo que pode dar errado tem saída: sem rede → guia rápido; IA desligada →
 * guia rápido; limite do dia → ligar, SOS ou guia; falha pontual → tentar de
 * novo na própria mensagem.
 */

/** Por que a conversa mandou para o guia rápido (`null` = a pessoa escolheu). */
export type MotivoGuia = 'offline' | 'desligada' | 'erro' | 'limite'

interface MsgChat {
  id: string
  papel: 'usuario' | 'assistente'
  texto: string
  /** Miniatura (data URL) da foto enviada — some se a sessão encher. */
  foto?: string | null
  temFoto?: boolean
  sos?: SugestaoSosIa | null
  agenda?: SugestaoAgendamentoIa | null
  falhou?: boolean
  erro?: string | null
  em: number
}

interface FotoPronta {
  mime: string
  base64: string
  miniatura: string | null
}

const GUARDAR = 40
const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp']
const SUGESTOES = [
  'Meu caminhão está puxando para um lado quando freio',
  'Meu pedal ficou baixo',
  'Tem uma luz acesa no painel',
  'Posso continuar dirigindo?',
  'Quanto tempo dura uma pastilha?',
  'Quando preciso revisar os freios?',
]
const ROTULO_AGENDA: Record<TipoAgendamento, string> = { revisao: 'uma revisão', manutencao: 'uma manutenção', orcamento: 'um orçamento', outro: 'um serviço' }

function lerConversa(chave: string): MsgChat[] {
  try {
    const j = JSON.parse(sessionStorage.getItem(chave) ?? '[]')
    return Array.isArray(j) ? j.filter((m) => m && (m.papel === 'usuario' || m.papel === 'assistente') && typeof m.texto === 'string') : []
  } catch {
    return []
  }
}

function salvarConversa(chave: string, lista: MsgChat[]) {
  const recorte = lista.slice(-GUARDAR)
  try {
    sessionStorage.setItem(chave, JSON.stringify(recorte))
  } catch {
    // Armazenamento cheio: guarda a conversa sem as miniaturas.
    try {
      sessionStorage.setItem(chave, JSON.stringify(recorte.map((m) => ({ ...m, foto: null }))))
    } catch {
      /* sem armazenamento: a conversa vale só enquanto a tela está aberta */
    }
  }
}

const novoId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

function paraApi(m: MsgChat): MensagemIa {
  return { papel: m.papel, texto: m.texto || (m.temFoto ? 'Enviei uma foto do problema.' : '') }
}

/* ── foto ───────────────────────────────────────────────────────────────── */

async function paraJpeg(arquivo: Blob, ladoMaior = 1280): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo)
  const escala = Math.min(1, ladoMaior / Math.max(bitmap.width, bitmap.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bitmap.width * escala)
  c.height = Math.round(bitmap.height * escala)
  c.getContext('2d')?.drawImage(bitmap, 0, 0, c.width, c.height)
  bitmap.close?.()
  const b = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', 0.82))
  if (!b) throw new Error('Não foi possível ler esta foto. Tente outra.')
  return b
}

async function miniaturaDe(blob: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(blob)
    const escala = Math.min(1, 360 / Math.max(bitmap.width, bitmap.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bitmap.width * escala)
    c.height = Math.round(bitmap.height * escala)
    c.getContext('2d')?.drawImage(bitmap, 0, 0, c.width, c.height)
    bitmap.close?.()
    return c.toDataURL('image/jpeg', 0.72)
  } catch {
    return null
  }
}

/* ── conversa ───────────────────────────────────────────────────────────── */

export function ChatIA({
  aoUsarGuia,
  aoEstado,
}: {
  aoUsarGuia: (motivo: MotivoGuia | null) => void
  aoEstado?: (e: { pensando: boolean; total: number }) => void
}) {
  const { conta, usuarioId } = useCliente()
  const navegar = useNavigate()
  const qc = useQueryClient()
  const online = useOnline()
  const teclado = useAlturaTeclado()
  const info = useInfoPublica()
  const ativo = useHomeCliente().data?.chamado_ativo ?? null
  const chave = chaveConversaIA(usuarioId)

  const [mensagens, setMensagens] = useState<MsgChat[]>(() => lerConversa(chave))
  const [texto, setTexto] = useState('')
  const [foto, setFoto] = useState<FotoPronta | null>(null)
  const [preparandoFoto, setPreparandoFoto] = useState(false)
  const [erroFoto, setErroFoto] = useState<string | null>(null)
  const [pensando, setPensando] = useState(false)
  const [limite, setLimite] = useState<string | null>(null)
  const [alturaRodape, setAlturaRodape] = useState(132)

  const travado = useRef(false)
  // Foto de mensagem que não chegou: o "tentar de novo" manda a mesma foto.
  const fotosFalhas = useRef(new Map<string, FotoPronta>())
  const rodape = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  // Teclado de verdade (computador, tablet com teclado): Enter envia.
  const tecladoFisico = useMemo(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches, [])

  const nome = primeiroNome(conta.nome)
  const tel = linkTelefone(info.data?.telefone)

  useEffect(() => salvarConversa(chave, mensagens), [chave, mensagens])
  useEffect(() => {
    aoEstado?.({ pensando, total: mensagens.length })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pensando, mensagens.length])

  // O rodapé (campo, foto, aviso) muda de altura: a lista reserva o espaço exato.
  useLayoutEffect(() => {
    const el = rodape.current
    if (!el) return
    const medir = () => setAlturaRodape(el.offsetHeight)
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // Campo cresce com o texto (até ~5 linhas) e volta ao tamanho de uma linha ao enviar.
  useLayoutEffect(() => {
    const el = campo.current
    if (!el) return
    // Vazio volta a uma linha (o Chrome mede o placeholder no scrollHeight).
    if (!texto) {
      el.style.height = ''
      el.style.overflowY = 'hidden'
      return
    }
    el.style.height = 'auto'
    const alvo = Math.min(el.scrollHeight, 132)
    el.style.height = `${alvo}px`
    el.style.overflowY = el.scrollHeight > 132 ? 'auto' : 'hidden'
  }, [texto])

  // A conversa acompanha a última mensagem — inclusive quando o teclado sobe.
  const primeira = useRef(true)
  useEffect(() => {
    if (!mensagens.length && !pensando) return
    const t = window.setTimeout(() => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: primeira.current ? 'auto' : 'smooth' })
      primeira.current = false
    }, 40)
    return () => window.clearTimeout(t)
  }, [mensagens.length, pensando, limite, teclado, alturaRodape])

  async function escolherFoto(lista: FileList | null) {
    const f = lista?.[0]
    if (!f) return
    setErroFoto(null)
    setPreparandoFoto(true)
    try {
      if (f.type && !f.type.startsWith('image/')) throw new Error('Escolha uma foto (JPG ou PNG).')
      let blob: Blob = await reduzirImagem(f, 1280, 0.8)
      // HEIC e outros formatos que a IA não lê: convertidos no aparelho.
      if (!TIPOS_IMAGEM.includes(blob.type)) blob = await paraJpeg(f)
      if (blob.size > 5 * 1024 * 1024) throw new Error('Foto grande demais. Tente outra ou tire uma nova.')
      const [base64, miniatura] = await Promise.all([blobParaBase64(blob), miniaturaDe(blob)])
      setFoto({ mime: blob.type, base64, miniatura })
    } catch (e) {
      setErroFoto((e as Error)?.message || 'Não foi possível usar esta foto.')
    } finally {
      setPreparandoFoto(false)
    }
  }

  async function enviar(conteudo: string, anexo: FotoPronta | null, reenvio?: MsgChat) {
    if (travado.current || limite || !online) return
    const t = conteudo.trim().slice(0, 1500)
    if (!t && !anexo) return
    travado.current = true
    const msg: MsgChat = reenvio
      ? { ...reenvio, falhou: false, erro: null }
      : { id: novoId(), papel: 'usuario', texto: t, foto: anexo?.miniatura ?? null, temFoto: !!anexo, em: Date.now() }
    // Reenvio vai para o fim: a IA sempre responde à última mensagem.
    const lista = [...mensagens.filter((m) => m.id !== msg.id), msg]
    setMensagens(lista)
    if (!reenvio) {
      setTexto('')
      setFoto(null)
      setErroFoto(null)
    }
    setPensando(true)
    try {
      const historico = lista
        .filter((m) => !m.falhou)
        .map(paraApi)
        .filter((m) => m.texto.trim())
        .slice(-16)
      const r = await sosIaAtendimento(historico, anexo ? { mime: anexo.mime, dados: anexo.base64 } : null)
      fotosFalhas.current.delete(msg.id)
      setMensagens((atual) => [
        ...atual,
        {
          id: novoId(),
          papel: 'assistente',
          texto: r.texto?.trim() || 'Não consegui montar uma resposta agora. Pode descrever de outro jeito?',
          sos: r.sugestao_sos ?? null,
          agenda: r.sugestao_agendamento ?? null,
          em: Date.now(),
        },
      ])
    } catch (e) {
      if (anexo) fotosFalhas.current.set(msg.id, anexo)
      const status = e instanceof ErroIa ? e.status : null
      const mensagem = (e as Error)?.message || 'A Tecno IA não respondeu agora.'
      if (status === 'desligada' || status === 'sem_chave') {
        void qc.invalidateQueries({ queryKey: CHAVE_IA_PUBLICO })
        setMensagens((atual) => atual.map((m) => (m.id === msg.id ? { ...m, falhou: true, erro: mensagem } : m)))
        aoUsarGuia('desligada')
      } else if (status === 'limite') {
        setLimite(mensagem)
        setMensagens((atual) => atual.map((m) => (m.id === msg.id ? { ...m, falhou: true, erro: null } : m)))
      } else {
        setMensagens((atual) => atual.map((m) => (m.id === msg.id ? { ...m, falhou: true, erro: navigator.onLine ? mensagem : 'Sem internet.' } : m)))
      }
    } finally {
      travado.current = false
      setPensando(false)
    }
  }

  function aoEnviar(e?: FormEvent) {
    e?.preventDefault()
    void enviar(texto, foto)
  }

  function pedirSOS(s: SugestaoSosIa) {
    const rotulo = OCORRENCIAS[s.tipo_ocorrencia]?.rotulo ?? 'Problema no veículo'
    const conversa = mensagens
      .filter((m) => !m.falhou && (m.texto || m.temFoto))
      .slice(-8)
      .map((m) => ({ papel: m.papel, texto: (m.texto || '[foto]').slice(0, 300) }))
    const estado: EstadoFluxoSOS = {
      ocorrencia: s.tipo_ocorrencia,
      prioridade: s.prioridade,
      descricao: `TECNO IA: ${s.descricao?.trim() || rotulo}`.slice(0, 600),
      contextoIA: {
        origem: 'tecno_ia',
        versao: 2,
        modo: 'ia',
        tipo_ocorrencia: s.tipo_ocorrencia,
        prioridade: s.prioridade,
        resumo: s.descricao,
        conversa,
        em: new Date().toISOString(),
      },
    }
    navegar('/sos', { state: estado })
  }

  function agendar(a: SugestaoAgendamentoIa) {
    const estado: EstadoAgendar = { tipo: a.tipo, descricao: a.descricao?.trim() ? `TECNO IA: ${a.descricao.trim()}` : undefined }
    navegar('/revisoes?agendar=1', { state: estado })
  }

  const podeEnviar = online && !limite && !pensando && !preparandoFoto && (!!texto.trim() || !!foto)
  const bloqueado = !online || !!limite

  return (
    <>
      <main className="entrada-suave mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pt-4 pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))]">
        <div role="log" aria-live="polite" aria-label="Conversa com a Tecno IA" className="flex flex-col gap-3">
          <BalaoIA>
            <p>
              Olá{nome ? `, ${nome}` : ''}! Sou a <strong>Tecno IA</strong>, a mecânica virtual da Tecnoar. Conte o que está acontecendo com o veículo — se puder,
              mande uma foto. Eu explico de um jeito simples, digo o que pode ser e se é seguro continuar.
            </p>
          </BalaoIA>

          {mensagens.length === 0 && (
            <div className="flex flex-col gap-2.5 pl-10 max-[359px]:pl-0">
              <div className="flex flex-wrap gap-2">
                {SUGESTOES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={bloqueado || pensando}
                    onClick={() => void enviar(s, null)}
                    className="min-h-11 rounded-2xl border border-line-strong bg-surface px-3.5 py-2 text-left text-[14px] leading-snug font-medium text-ink transition-transform active:scale-[0.97] disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => aoUsarGuia(online ? null : 'offline')}
                className="flex min-h-11 items-center gap-2 self-start text-[13.5px] font-semibold text-accent-ink"
              >
                <ListChecks className="size-4" /> Sem internet? Use o guia rápido
              </button>
            </div>
          )}

          {mensagens.map((m) =>
            m.papel === 'usuario' ? (
              <BalaoVoce
                key={m.id}
                soFoto={!!m.foto && !m.texto}
                rodape={
                  m.falhou && !limite ? (
                    <div className="flex max-w-[85%] flex-col items-end text-right">
                      <div className="flex items-center gap-3 text-[12.5px] text-crit-ink">
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <CircleAlert className="size-4 shrink-0" /> Não enviada
                        </span>
                        <button
                          type="button"
                          disabled={pensando || !online}
                          onClick={() => void enviar(m.texto, fotosFalhas.current.get(m.id) ?? null, m)}
                          className="inline-flex min-h-11 items-center gap-1 font-bold underline underline-offset-2 disabled:opacity-50"
                        >
                          <RotateCcw className="size-3.5" /> Tentar de novo
                        </button>
                      </div>
                      {m.erro && <p className="-mt-1.5 text-[11.5px] leading-snug text-ink-3">{m.erro}</p>}
                    </div>
                  ) : null
                }
              >
                {m.temFoto &&
                  (m.foto ? (
                    <img src={m.foto} alt="Foto enviada à Tecno IA" className={cn('max-h-56 w-full rounded-xl object-cover', m.texto && 'mb-2')} />
                  ) : (
                    <span className={cn('flex items-center gap-1.5 text-[13px] font-semibold opacity-90', m.texto && 'mb-1')}>
                      <IconeImagem className="size-4" /> Foto enviada
                    </span>
                  ))}
                {m.texto}
              </BalaoVoce>
            ) : (
              <div key={m.id} className="flex flex-col gap-2.5">
                <BalaoIA>
                  <TextoIA texto={m.texto} />
                </BalaoIA>
                {m.sos && <CartaoSugestaoSOS sugestao={m.sos} ativo={ativo} aoPedir={() => pedirSOS(m.sos!)} />}
                {m.agenda && <CartaoSugestaoAgenda sugestao={m.agenda} aoAgendar={() => agendar(m.agenda!)} />}
              </div>
            ),
          )}

          {pensando && <Digitando />}
        </div>

        {limite && (
          <section role="alert" className="sos-card entrada-suave flex flex-col gap-3 rounded-[1.45rem] border-warn/40 p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-warn-soft text-warn-ink">
                <Clock className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="font-display text-[16px] font-bold text-ink">Limite de hoje atingido</p>
                <p className="mt-0.5 text-[13.5px] leading-snug text-ink-2">{limite}</p>
              </div>
            </div>
            <div className="grid gap-2 min-[440px]:grid-cols-2">
              <BotaoApp variante="sos" icone={Siren} onClick={() => navegar(ativo ? `/chamado/${ativo.id}` : '/sos')}>
                {ativo ? 'Ver meu socorro' : 'Pedir SOS'}
              </BotaoApp>
              {tel && (
                <a href={tel} className="sos-night-action flex min-h-12 items-center justify-center gap-2 rounded-[1rem] px-4 font-display text-[15px] font-extrabold text-white dark:bg-white dark:text-[#0D1C33]">
                  <PhoneCall className="size-5" /> Ligar para a Tecnoar
                </a>
              )}
            </div>
            <BotaoApp variante="neutro" icone={ListChecks} onClick={() => aoUsarGuia('limite')}>
              Usar o guia rápido
            </BotaoApp>
          </section>
        )}

        {!online && !limite && (
          <section role="status" className="sos-card flex flex-col gap-3 rounded-[1.45rem] p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-warn-soft text-warn-ink">
                <WifiOff className="size-5" />
              </span>
              <p className="min-w-0 pt-0.5 text-[13.5px] leading-snug text-ink-2">
                <strong className="text-ink">Sem internet.</strong> A conversa com a IA precisa de conexão. O guia rápido funciona no aparelho, mesmo sem sinal.
              </p>
            </div>
            <BotaoApp variante="neutro" icone={ListChecks} onClick={() => aoUsarGuia('offline')}>
              Abrir o guia rápido
            </BotaoApp>
          </section>
        )}

        {/* Espaço do rodapé fixo (e do teclado, no iPhone). */}
        <div aria-hidden style={{ height: alturaRodape + teclado + 8 }} />
      </main>

      <div
        ref={rodape}
        style={teclado ? { bottom: teclado } : undefined}
        className={cn(
          'cli-fixo fixed bottom-0 z-40 border-t border-line bg-surface/98 shadow-[0_-10px_30px_-22px_rgb(8_24_48/0.5)]',
          teclado ? 'pb-2' : 'pb-[calc(0.5rem+env(safe-area-inset-bottom))]',
        )}
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-2 px-3 pt-2.5 pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(0.75rem,env(safe-area-inset-left))]">
          {(foto || preparandoFoto || erroFoto) && (
            <div className="flex items-center gap-2.5">
              {foto?.miniatura ? (
                <img src={foto.miniatura} alt="Foto pronta para enviar" className="size-12 shrink-0 rounded-xl object-cover ring-2 ring-accent/40" />
              ) : (
                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-3">
                  {preparandoFoto ? <Loader2 className="size-5 animate-spin" /> : <IconeImagem className="size-5" />}
                </span>
              )}
              <p className={cn('min-w-0 flex-1 text-[13px] leading-snug', erroFoto ? 'text-crit-ink' : 'text-ink-2')}>
                {erroFoto ?? (preparandoFoto ? 'Preparando a foto…' : 'Foto pronta. Escreva o que acontece ou envie só a foto.')}
              </p>
              {(foto || erroFoto) && (
                <button
                  type="button"
                  aria-label={erroFoto ? 'Fechar aviso da foto' : 'Remover a foto'}
                  onClick={() => {
                    setFoto(null)
                    setErroFoto(null)
                  }}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-3 active:bg-surface-2"
                >
                  <X className="size-5" />
                </button>
              )}
            </div>
          )}

          <form onSubmit={aoEnviar} className="flex items-end gap-2">
            <button
              type="button"
              aria-label="Anexar uma foto do problema"
              disabled={bloqueado || pensando || preparandoFoto}
              onClick={() => arquivo.current?.click()}
              className="flex size-12 shrink-0 items-center justify-center rounded-full border border-line-strong bg-surface text-accent-ink transition-transform active:scale-95 disabled:opacity-45"
            >
              <Camera className="size-5" />
            </button>
            <textarea
              ref={campo}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && tecladoFisico && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  aoEnviar()
                }
              }}
              rows={1}
              maxLength={1500}
              disabled={bloqueado}
              enterKeyHint={tecladoFisico ? 'send' : 'enter'}
              placeholder={limite ? 'Limite de hoje atingido' : !online ? 'Sem internet' : 'Conte o problema…'}
              aria-label="Mensagem para a Tecno IA"
              className="sos-field max-h-[8.25rem] min-h-12 min-w-0 flex-1 resize-none overflow-y-hidden rounded-[1.4rem] px-4 py-3 text-[16px] leading-snug text-ink outline-none placeholder:text-ink-3/80 focus:border-accent focus:ring-4 focus:ring-accent/15 disabled:opacity-60"
            />
            <button
              type="submit"
              aria-label="Enviar mensagem"
              disabled={!podeEnviar}
              className="sos-premium-action flex size-12 shrink-0 items-center justify-center rounded-full text-white transition-transform active:scale-95 disabled:opacity-40 disabled:shadow-none"
            >
              {pensando ? <Loader2 className="size-5 animate-spin" /> : <ArrowUp className="size-5" strokeWidth={2.6} />}
            </button>
          </form>
          <p className="px-1 text-center text-[11.5px] leading-snug text-ink-3">A Tecno IA orienta, mas não substitui o mecânico. Em perigo, toque em SOS.</p>
          <input
            ref={arquivo}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              void escolherFoto(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      </div>
    </>
  )
}

/* ── sugestões ──────────────────────────────────────────────────────────── */

function CartaoSugestaoSOS({ sugestao: s, ativo, aoPedir }: { sugestao: SugestaoSosIa; ativo: { id: string; protocolo: string } | null; aoPedir: () => void }) {
  const navegar = useNavigate()
  const ocorrencia = OCORRENCIAS[s.tipo_ocorrencia] ?? OCORRENCIAS.outro
  const prioridade = PRIORIDADES[s.prioridade] ?? PRIORIDADES.alta
  const urgente = s.prioridade === 'emergencia'
  return (
    <article aria-label="Sugestão: pedir socorro" className="entrada-suave ml-10 overflow-hidden rounded-[1.25rem] border-2 border-[#ff6600]/40 bg-surface max-[359px]:ml-0" role="alert">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-crit-soft text-crit">
            <Siren className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[16px] leading-snug font-bold text-ink">Pelo que você descreveu, pode não ser seguro continuar dirigindo.</p>
            <p className="mt-1 text-[14.5px] font-semibold text-crit-ink">Deseja solicitar um SOS Tecnoar?</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <IconeOcorrencia tipo={s.tipo_ocorrencia} tamanho="sm" />
          <span className="min-w-0 font-semibold text-ink">{ocorrencia.rotulo}</span>
          <span className={cn('rounded-full px-2.5 py-0.5 text-[11.5px] font-bold', urgente ? 'bg-crit-soft text-crit-ink' : 'bg-surface-2 text-ink-2')}>{prioridade.rotulo}</span>
        </div>
        {s.descricao && <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-[14px] leading-relaxed text-ink-2">{s.descricao}</p>}
        {ativo ? (
          <>
            <p className="text-[13px] leading-snug text-ink-2">
              Você já tem um socorro em andamento (<span className="whitespace-nowrap">{ativo.protocolo}</span>). Fale com o mecânico por lá.
            </p>
            <BotaoApp variante="sos" tamanho="lg" largo icone={Siren} onClick={() => navegar(`/chamado/${ativo.id}`)}>
              Acompanhar meu socorro
            </BotaoApp>
          </>
        ) : (
          <>
            <BotaoApp variante="sos" tamanho="lg" largo icone={Siren} onClick={aoPedir}>
              Sim, solicitar SOS
            </BotaoApp>
            <p className="text-center text-[12px] text-ink-3">O pedido abre já preenchido com esta conversa. Você confere o local e confirma.</p>
          </>
        )}
      </div>
    </article>
  )
}

function CartaoSugestaoAgenda({ sugestao: a, aoAgendar }: { sugestao: SugestaoAgendamentoIa; aoAgendar: () => void }) {
  return (
    <article aria-label="Sugestão: agendar" className="entrada-suave ml-10 flex flex-col gap-3 rounded-[1.25rem] border border-line bg-surface p-4 max-[359px]:ml-0">
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-ok-soft text-ok-ink">
          <CalendarPlus className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="font-display text-[15px] leading-tight font-bold text-ink">Sugestão: agendar {ROTULO_AGENDA[a.tipo] ?? 'um serviço'}</p>
          {a.descricao && <p className="mt-1 text-[13.5px] leading-snug text-ink-2">{a.descricao}</p>}
        </div>
      </div>
      <BotaoApp tamanho="md" largo icone={CalendarPlus} onClick={aoAgendar}>
        Agendar
      </BotaoApp>
    </article>
  )
}
