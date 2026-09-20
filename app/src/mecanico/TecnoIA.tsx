import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Camera, ImageOff, Loader2, RotateCw, Send, ShieldAlert, Brain, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ErroIa, blobParaBase64, sosIaTecnica } from '@/sos/api'
import { reduzirImagem } from '@/sos/componentes'
import type { DetalheChamado, MensagemIa } from '@/sos/tipos'
import { useAlturaTeclado, useDetalheChamado, useHomeMecanico, useOnline } from './dados'
import { useIaPublico } from './Ia'
import { modeloVeiculo } from './PecasAtendimento'
import { Placa } from './pecas'
import { EsqueletoM, TopoM, VazioM } from './ui'

/**
 * TECNO IA técnica do mecânico: conversa de oficina, mais técnica que a do
 * cliente. Com um chamado aberto, a IA já recebe o veículo, o problema e o
 * que foi registrado; responde organizado por sistema (pneumático,
 * vazamentos, pressão, desgaste, válvulas, atuadores, histórico). É apoio:
 * nunca substitui o diagnóstico do profissional.
 */

/** Rota /tecno-ia: usa o chamado atual, se houver. */
export function TelaTecnoIA() {
  const home = useHomeMecanico()
  const atual = home.data?.chamado_atual ?? null
  const detalhe = useDetalheChamado(atual?.id)
  return (
    <div className="flex min-h-dvh flex-col">
      <TopoM voltar="/" sobretitulo="Apoio técnico" titulo="Tecno IA" sub={atual ? `Sobre o ${atual.protocolo}` : 'Pergunte como a um colega de oficina'} />
      {home.isLoading && !home.data ? (
        <div className="mx-auto w-full max-w-xl px-4 pt-4">
          <EsqueletoM className="h-24" />
        </div>
      ) : (
        <ConversaTecnica chamado={detalhe.data ?? null} chaveConversa={atual?.id ?? 'geral'} />
      )}
    </div>
  )
}

const CHAVE = (k: string) => `sos.ia.tecnica.${k}`

function lerConversa(k: string): MensagemIa[] {
  try {
    const v = sessionStorage.getItem(CHAVE(k))
    return v ? (JSON.parse(v) as MensagemIa[]) : []
  } catch {
    return []
  }
}

/**
 * A conversa em si (rota e atalho dentro do atendimento). O campo de mensagem
 * fica preso no rodapé e sobe junto com o teclado do iPhone.
 */
export function ConversaTecnica({ chamado, chaveConversa, topo }: { chamado: DetalheChamado | null; chaveConversa: string; topo?: ReactNode }) {
  const ia = useIaPublico()
  const online = useOnline()
  const teclado = useAlturaTeclado()
  const [mensagens, setMensagens] = useState<MensagemIa[]>(() => lerConversa(chaveConversa))
  const [texto, setTexto] = useState('')
  const [foto, setFoto] = useState<{ url: string; mime: string; dados: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const fim = useRef<HTMLDivElement>(null)
  const arquivo = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(CHAVE(chaveConversa), JSON.stringify(mensagens.slice(-30)))
    } catch {
      /* sem armazenamento */
    }
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensagens, chaveConversa])

  const perguntar = useMutation({
    mutationFn: (p: { historico: MensagemIa[]; imagem: { mime: string; dados: string } | null }) =>
      sosIaTecnica(p.historico, { chamadoId: chamado?.chamado.id ?? null, imagem: p.imagem }),
    onSuccess: (r) => setMensagens((m) => [...m, { papel: 'assistente', texto: r.texto }]),
    onError: (e) => setErro(e instanceof ErroIa ? e.message : (e as Error)?.message || 'A Tecno IA não respondeu agora. Tente de novo.'),
  })

  function enviar(t: string) {
    const limpo = t.trim()
    if ((!limpo && !foto) || perguntar.isPending) return
    setErro(null)
    const nova: MensagemIa = { papel: 'usuario', texto: limpo || 'Veja a foto que enviei.' }
    const historico = [...mensagens, nova]
    setMensagens(historico)
    setTexto('')
    const imagem = foto ? { mime: foto.mime, dados: foto.dados } : null
    if (foto) URL.revokeObjectURL(foto.url)
    setFoto(null)
    perguntar.mutate({ historico, imagem })
  }

  function tentarDeNovo() {
    if (!mensagens.length || mensagens[mensagens.length - 1].papel !== 'usuario') return
    setErro(null)
    perguntar.mutate({ historico: mensagens, imagem: null })
  }

  async function escolherFoto(lista: FileList | null) {
    const f = lista?.[0]
    if (!f) return
    try {
      const blob = await reduzirImagem(f)
      const dados = await blobParaBase64(blob)
      setFoto({ url: URL.createObjectURL(blob), mime: blob.type || 'image/jpeg', dados })
    } catch {
      setErro('Não foi possível ler a foto.')
    }
  }

  const veiculo = chamado ? modeloVeiculo(chamado) : null
  const problema = chamado?.chamado.ocorrencia_rotulo ?? null
  const sugestoes = chamado
    ? [
        `${[veiculo, problema ? `com ${problema.toLowerCase()}` : null].filter(Boolean).join(' ') || 'Este veículo'}. Quais pontos devo verificar primeiro?`,
        'Qual a sequência de testes mais rápida no local?',
        'Que peças e ferramentas separar para este caso?',
        'Quais cuidados de segurança antes de começar?',
      ]
    : [
        'Freio a ar com pedal baixo e perda de eficiência: por onde começar?',
        'Veículo não dá partida: sequência de testes elétricos.',
        'Vazamento de ar no circuito: como localizar rápido?',
      ]

  if (ia.isLoading) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pt-4">
        <EsqueletoM className="h-24" />
      </div>
    )
  }
  if (!ia.data?.ativa || !ia.data.atendimento) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 pt-4">
        <VazioM icone={Brain} titulo="Tecno IA desligada" texto="A central ainda não ligou a Tecno IA do SOS. Enquanto isso, fale com a central pelo telefone." />
      </div>
    )
  }

  return (
    <>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pt-3 pb-[calc(9rem+env(safe-area-inset-bottom))]">
        {chamado && (
          <div className="sos-native-card flex items-center gap-3 rounded-[1.55rem] px-3.5 py-3">
            <span className="sos-subtle-chip flex size-11 shrink-0 items-center justify-center rounded-2xl text-cyan-ink">
              <Brain className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-bold text-ink">{veiculo ?? 'Veículo do chamado'}</p>
              <p className="truncate text-[13px] text-ink-3">{problema} · a IA já conhece o chamado</p>
            </div>
            <Placa placa={chamado.veiculo?.placa} tamanho="sm" />
          </div>
        )}

        {topo}

        <section className="sos-native-card overflow-hidden rounded-[1.7rem] p-4">
          <div className="flex items-start gap-3">
            <span className="sos-subtle-chip flex size-11 shrink-0 items-center justify-center rounded-2xl text-cyan-ink">
              <Brain className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-[20px] leading-tight font-semibold text-ink">Assistente técnico Tecnoar</p>
              <p className="mt-1 text-[13.5px] leading-snug text-ink-2">Pergunte sobre sintomas, testes e peças com linguagem de oficina.</p>
            </div>
          </div>
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-surface-2/80 px-3.5 py-2.5 text-[13px] leading-snug text-ink-2">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn-ink" />
            Confira no veículo. A Tecno IA apoia o diagnóstico, não substitui o profissional.
          </p>
        </section>

        {mensagens.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="px-1 text-[14px] font-semibold text-ink-2">Perguntas rápidas</p>
            {sugestoes.map((s) => (
              <button
                key={s}
                type="button"
                disabled={!online}
                onClick={() => enviar(s)}
                className="sos-premium-row sos-native-card min-h-14 rounded-[1.35rem] px-4 py-3 text-left text-[15px] leading-snug font-semibold text-ink disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3" aria-live="polite">
            {mensagens.map((m, i) =>
              m.papel === 'usuario' ? (
                <div key={i} className="ml-8 self-end rounded-2xl rounded-br-md bg-accent px-3.5 py-2.5 text-[15px] leading-snug text-white shadow-[0_12px_24px_-18px_rgb(255_102_0/0.7)]">
                  {m.texto}
                </div>
              ) : (
                <div key={i} className="sos-native-card mr-4 rounded-2xl rounded-bl-md px-4 py-3">
                  <p className="mb-1.5 flex items-center gap-1.5 font-display text-[11px] font-semibold tracking-normal text-cyan-ink">
                    <Brain className="size-3.5" /> Tecno IA
                  </p>
                  <TextoIa texto={m.texto} />
                </div>
              ),
            )}
            {perguntar.isPending && (
              <div className="sos-native-card mr-4 flex items-center gap-2 rounded-2xl px-4 py-3 text-[14px] text-ink-2">
                <Loader2 className="size-4 animate-spin" /> Pensando no caso…
              </div>
            )}
            {erro && (
              <div className="sos-native-card flex flex-col gap-2 rounded-2xl px-3.5 py-3 text-[14px] text-crit-ink">
                <p className="font-semibold">{erro}</p>
                <button type="button" onClick={tentarDeNovo} className="sos-action-link flex min-h-11 items-center gap-1.5 self-start rounded-xl px-3 text-[13.5px] font-semibold text-ink">
                  <RotateCw className="size-4" /> Tentar de novo
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setMensagens([])
                setErro(null)
              }}
              className="flex min-h-11 items-center gap-1.5 self-center px-3 text-[13px] font-semibold text-ink-3"
            >
              <Trash2 className="size-4" /> Nova conversa
            </button>
          </div>
        )}
        <div ref={fim} />
      </div>

      {/* campo de mensagem, preso no rodapé (sobe com o teclado) */}
      <div className="tecno-ia-composer fixed inset-x-0 z-40 transition-[bottom] duration-150" style={{ bottom: teclado }}>
        <div className={cn('mx-auto flex max-w-xl flex-col gap-2 px-4 pt-3', teclado ? 'pb-3' : 'pb-[calc(0.85rem+env(safe-area-inset-bottom))]')}>
          {foto && (
            <div className="flex items-center gap-3">
              <img src={foto.url} alt="Foto para a Tecno IA" className="size-14 rounded-xl object-cover" />
              <span className="flex-1 text-[13px] text-ink-2">Foto anexada</span>
              <button
                type="button"
                aria-label="Tirar a foto"
                onClick={() => {
                  URL.revokeObjectURL(foto.url)
                  setFoto(null)
                }}
                className="sos-icon-button flex size-11 items-center justify-center rounded-full text-ink-2"
              >
                <X className="size-5" />
              </button>
            </div>
          )}
          {!online && (
            <p className="flex items-center gap-2 text-[13px] font-medium text-warn-ink">
              <ImageOff className="size-4" /> A Tecno IA precisa de internet.
            </p>
          )}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              enviar(texto)
            }}
          >
            <button
              type="button"
              aria-label="Anexar foto"
              onClick={() => arquivo.current?.click()}
              disabled={!online || perguntar.isPending}
              className="sos-soft-action flex size-12 shrink-0 items-center justify-center rounded-2xl text-ink-2 disabled:opacity-45"
            >
              <Camera className="size-5" />
            </button>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  enviar(texto)
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder="Sintoma ou dúvida técnica"
              aria-label="Pergunta para a Tecno IA"
              className="sos-field max-h-32 min-h-12 min-w-0 flex-1 resize-none rounded-2xl px-3.5 py-2.5 text-[16px] text-ink outline-none placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent/15"
            />
            <button
              type="submit"
              aria-label="Enviar pergunta"
              disabled={(!texto.trim() && !foto) || perguntar.isPending || !online}
              className="sos-premium-action flex size-12 shrink-0 items-center justify-center rounded-2xl text-white active:bg-accent-hover disabled:opacity-40"
            >
              {perguntar.isPending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
            </button>
          </form>
          <input ref={arquivo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void escolherFoto(e.target.files).finally(() => (e.target.value = ''))} />
        </div>
      </div>
    </>
  )
}

/**
 * Texto da IA com o mínimo de forma: títulos ("Pneumático:"), listas com
 * "-", "•" ou "1." e **negrito**. Sem HTML vindo de fora.
 */
function TextoIa({ texto }: { texto: string }) {
  const linhas = texto.split(/\r?\n/)
  const blocos: ReactNode[] = []
  let lista: string[] = []
  const fecharLista = () => {
    if (!lista.length) return
    blocos.push(
      <ul key={`l${blocos.length}`} className="my-1 flex flex-col gap-1 pl-1">
        {lista.map((l, i) => (
          <li key={i} className="flex gap-2 text-[15px] leading-snug text-ink">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
            <span>{negrito(l)}</span>
          </li>
        ))}
      </ul>,
    )
    lista = []
  }
  for (const bruta of linhas) {
    const l = bruta.trim()
    if (!l) {
      fecharLista()
      continue
    }
    const item = l.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/)
    if (item) {
      lista.push(item[1])
      continue
    }
    fecharLista()
    const titulo = /^#{1,4}\s+/.test(l) || (/:$/.test(l) && l.length <= 60)
    blocos.push(
      titulo ? (
        <p key={`t${blocos.length}`} className="mt-2 font-display text-[15px] font-extrabold text-ink first:mt-0">
          {negrito(l.replace(/^#{1,4}\s+/, ''))}
        </p>
      ) : (
        <p key={`p${blocos.length}`} className="text-[15px] leading-relaxed text-ink">
          {negrito(l)}
        </p>
      ),
    )
  }
  fecharLista()
  return <div className="flex flex-col gap-1">{blocos}</div>
}

function negrito(t: string): ReactNode {
  const partes = t.split(/\*\*(.+?)\*\*/g)
  return partes.map((p, i) => (i % 2 ? <strong key={i} className="font-bold">{p}</strong> : p))
}
