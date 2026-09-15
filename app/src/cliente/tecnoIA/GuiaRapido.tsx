import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarPlus,
  CircleCheckBig,
  Info,
  ListChecks,
  OctagonX,
  PhoneCall,
  RotateCcw,
  ShieldAlert,
  Siren,
  Brain,
  TriangleAlert,
  Undo2,
  Wrench,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { linkTelefone } from '@/sos/rotulos'
import type { PrioridadeSOS } from '@/sos/tipos'
import { useCliente } from '../../sessao'
import { BotaoApp, Tela } from '../../comum/ui'
import { primeiroNome, useInfoPublica, type EstadoAgendar, type EstadoFluxoSOS } from '../dados'
import { GRAVIDADES, NOS, SINTOMAS, type Gravidade, type NoPergunta, type NoResultado, type OpcaoResposta, type Sintoma } from './arvore'
import { AvatarIA, BalaoIA, BalaoVoce, Digitando } from './pecasIA'

interface Passo {
  no: NoPergunta
  resposta: OpcaoResposta
}

const ESPERA_MS = 520

/**
 * Guia rápido da Tecno IA — pré-diagnóstico em forma de conversa, 100% no
 * aparelho: funciona sem sinal e responde na hora. É o que a Tecno IA mostra
 * quando a IA de verdade está desligada, sem internet ou fora do ar — e fica
 * sempre a um toque, pelo menu.
 *
 * O motorista escolhe o sintoma e responde de duas a quatro perguntas com um
 * toque. No fim: gravidade clara (seguir / cautela / parar), o que fazer
 * agora e o que NÃO fazer — e, se for o caso, o SOS já sai com o problema
 * escolhido e as respostas anexadas para o mecânico.
 */
export function GuiaRapido({ aviso, aoConversarIA }: { aviso?: ReactNode; aoConversarIA?: () => void }) {
  const { conta } = useCliente()
  const navegar = useNavigate()
  const info = useInfoPublica()
  const [sintoma, setSintoma] = useState<Sintoma | null>(null)
  const [passos, setPassos] = useState<Passo[]>([])
  const [atual, setAtual] = useState<string | null>(null)
  const [digitando, setDigitando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  const espera = useRef<number | undefined>(undefined)

  const no = atual ? NOS[atual] : null
  const nome = primeiroNome(conta.nome)

  // A "digitação" dá ritmo de conversa — e tempo para o olho acompanhar a
  // pergunta nova. Com movimento reduzido, a resposta vem direto.
  function avancar(proximo: string) {
    window.clearTimeout(espera.current)
    setAtual(proximo)
    const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduzido) return setDigitando(false)
    setDigitando(true)
    espera.current = window.setTimeout(() => setDigitando(false), ESPERA_MS)
  }
  useEffect(() => () => window.clearTimeout(espera.current), [])

  function escolherSintoma(s: Sintoma) {
    setSintoma(s)
    setPassos([])
    avancar(s.inicio)
  }

  function responder(o: OpcaoResposta) {
    if (no?.tipo !== 'pergunta') return
    setPassos((p) => [...p, { no, resposta: o }])
    avancar(o.vai)
  }

  function voltarUma() {
    window.clearTimeout(espera.current)
    setDigitando(false)
    const ultimo = passos[passos.length - 1]
    if (ultimo) {
      setPassos((p) => p.slice(0, -1))
      setAtual(ultimo.no.id)
    } else {
      setSintoma(null)
      setAtual(null)
    }
  }

  function recomecar() {
    window.clearTimeout(espera.current)
    setDigitando(false)
    setSintoma(null)
    setPassos([])
    setAtual(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Acompanha a conversa descendo — mas só depois que ela começou: na
  // abertura, a apresentação e a lista de sintomas ficam no topo.
  useEffect(() => {
    if (!sintoma) return
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [passos.length, atual, digitando, sintoma])

  function pedirSOS(r: NoResultado) {
    if (!sintoma) return
    const linhas = passos.map((p) => `• ${p.no.resumo}: ${p.resposta.rotulo}`)
    const descricao = [`TECNO IA — ${sintoma.rotulo}.`, ...linhas, `Resultado: ${r.titulo} (${GRAVIDADES[r.gravidade].curto}).`].join('\n').slice(0, 600)
    const estado: EstadoFluxoSOS = {
      ocorrencia: r.ocorrencia,
      descricao,
      prioridade: prioridadePara(r),
      contextoIA: {
        origem: 'tecno_ia',
        versao: 1,
        modo: 'guia',
        sintoma: sintoma.id,
        sintoma_rotulo: sintoma.rotulo,
        resultado: r.id,
        titulo: r.titulo,
        gravidade: r.gravidade,
        respostas: passos.map((p) => ({ pergunta: p.no.texto, resposta: p.resposta.rotulo })),
        em: new Date().toISOString(),
      },
    }
    navegar('/sos', { state: estado })
  }

  function agendar(r: NoResultado) {
    const estado: EstadoAgendar = {
      tipo: r.gravidade === 'seguir' ? 'revisao' : 'manutencao',
      descricao: `TECNO IA: ${r.titulo}. Sintoma: ${sintoma?.rotulo ?? ''}.`,
    }
    navegar('/revisoes?agendar=1', { state: estado })
  }

  return (
    <Tela comBarra={false} className="entrada-suave gap-3 md:max-w-2xl">
      {aviso}
      <section className="flex items-center gap-3.5 rounded-[1.25rem] border border-line bg-surface p-4">
        <AvatarIA grande />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] leading-tight font-bold text-ink">Guia rápido em 1 minuto</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-2">Feito com a experiência dos mecânicos da Tecnoar. Funciona até sem internet.</p>
        </div>
        {sintoma && (
          <button
            type="button"
            onClick={recomecar}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-line-strong px-3 text-[13px] font-semibold text-ink-2 active:bg-surface-2"
          >
            <RotateCcw className="size-4" /> <span className="max-[359px]:sr-only">Recomeçar</span>
          </button>
        )}
      </section>
      {aoConversarIA && !sintoma && (
        <button
          type="button"
          onClick={aoConversarIA}
          className="flex min-h-14 items-center gap-3 rounded-[1.25rem] border border-line bg-surface px-4 py-3 text-left active:scale-[0.99]"
        >
          <Brain className="size-5 shrink-0 text-accent-ink" />
          <span className="min-w-0 flex-1">
            <span className="block text-[14.5px] font-bold text-ink">Prefere descrever com suas palavras?</span>
            <span className="block text-[12.5px] text-ink-3">Converse com a Tecno IA e mande foto do problema.</span>
          </span>
        </button>
      )}
      <p className="flex items-start gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-[12.5px] leading-snug text-ink-2">
        <Info className="mt-0.5 size-4 shrink-0 text-ink-3" />
        É uma triagem automática e não substitui a avaliação de um mecânico. Se você estiver em perigo, pare em local seguro e toque em SOS.
      </p>

      <div className="flex flex-col gap-3 pt-1" aria-live="polite">
        <BalaoIA>
          Olá{nome ? `, ${nome}` : ''}! Sou a <strong>Tecno IA</strong>. Vou fazer perguntas rápidas para entender o que está acontecendo e dizer se dá para seguir
          viagem.
        </BalaoIA>
        <BalaoIA>O que você está percebendo?</BalaoIA>

        {!sintoma ? (
          <div className="grid grid-cols-2 gap-2 pl-10 max-[359px]:pl-0 sm:grid-cols-3">
            {SINTOMAS.map((s) => {
              const Icone = s.icone
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => escolherSintoma(s)}
                  className="flex min-h-[7.25rem] flex-col items-start gap-2 rounded-[1.25rem] border border-line bg-surface p-3 text-left transition-transform active:scale-[0.97]"
                >
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                    <Icone className="size-5" />
                  </span>
                  <span className="text-[14px] leading-tight font-bold text-ink">{s.rotulo}</span>
                  <span className="text-[11.5px] leading-snug text-ink-3">{s.descricao}</span>
                </button>
              )
            })}
          </div>
        ) : (
          <BalaoVoce>{sintoma.rotulo}</BalaoVoce>
        )}

        {passos.map((p, i) => (
          <div key={`${p.no.id}-${i}`} className="flex flex-col gap-3">
            <BalaoIA>{p.no.texto}</BalaoIA>
            <BalaoVoce>{p.resposta.rotulo}</BalaoVoce>
          </div>
        ))}

        {sintoma && digitando && <Digitando />}

        {sintoma && !digitando && no?.tipo === 'pergunta' && (
          <div className="entrada-suave flex flex-col gap-3">
            <BalaoIA>
              <p>{no.texto}</p>
              {no.ajuda && (
                <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] leading-snug text-ink-2">
                  <Info className="mt-0.5 size-3.5 shrink-0 text-cyan" /> {no.ajuda}
                </p>
              )}
            </BalaoIA>
            <div className="flex flex-col gap-2 pl-10 max-[359px]:pl-0" role="group" aria-label="Respostas">
              {no.opcoes.map((o) => (
                <button
                  key={o.rotulo}
                  type="button"
                  onClick={() => responder(o)}
                  className={cn(
                    'flex min-h-14 items-center justify-between gap-3 rounded-[1.25rem] border-2 bg-surface px-4 text-left text-[15px] font-semibold text-ink transition-transform active:scale-[0.98]',
                    o.tom === 'sim' ? 'border-accent/45' : o.tom === 'duvida' ? 'border-dashed border-line-strong text-ink-2' : 'border-line',
                  )}
                >
                  {o.rotulo}
                  <span aria-hidden className="text-ink-3">›</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {sintoma && !digitando && no?.tipo === 'resultado' && (
          <CartaoResultado
            r={no}
            telefone={linkTelefone(info.data?.telefone)}
            aoPedirSOS={() => pedirSOS(no)}
            aoAgendar={() => agendar(no)}
            aoRecomecar={recomecar}
          />
        )}

        {sintoma && !digitando && (
          <button type="button" onClick={voltarUma} className="flex min-h-11 items-center gap-2 self-start pl-10 text-[13.5px] font-semibold text-ink-3 max-[359px]:pl-0">
            <Undo2 className="size-4" /> {passos.length ? 'Voltar uma pergunta' : 'Escolher outro sintoma'}
          </button>
        )}
        <div ref={fim} className="h-1" />
      </div>
    </Tela>
  )
}

function prioridadePara(r: NoResultado): PrioridadeSOS {
  if (r.gravidade === 'parar') return r.ocorrencia === 'freios' || r.ocorrencia === 'acidente' ? 'emergencia' : 'alta'
  if (r.gravidade === 'cautela') return r.ocorrencia === 'freios' ? 'alta' : 'normal'
  return 'normal'
}

/* ── resultado ──────────────────────────────────────────────────────────── */

const ESTILO: Record<Gravidade, { faixa: string; icone: typeof OctagonX; texto: string }> = {
  parar: { faixa: 'bg-[#ff6600] text-white', icone: OctagonX, texto: 'text-white' },
  cautela: { faixa: 'bg-warn-soft text-warn-ink', icone: TriangleAlert, texto: 'text-warn-ink' },
  seguir: { faixa: 'bg-ok-soft text-ok-ink', icone: CircleCheckBig, texto: 'text-ok-ink' },
}

function CartaoResultado({
  r,
  telefone,
  aoPedirSOS,
  aoAgendar,
  aoRecomecar,
}: {
  r: NoResultado
  telefone: string | null
  aoPedirSOS: () => void
  aoAgendar: () => void
  aoRecomecar: () => void
}) {
  const e = ESTILO[r.gravidade]
  const Icone = e.icone
  const parar = r.gravidade === 'parar'
  return (
    <article className="entrada-suave overflow-hidden rounded-[1.25rem] border border-line bg-surface" aria-label="Resultado do pré-diagnóstico">
      <header className={cn('flex items-center gap-3 px-4 py-4', e.faixa)}>
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/20">
          <Icone className="size-7" />
        </span>
        <div className="min-w-0">
          <p className={cn('text-[11px] font-bold tracking-[0.16em] uppercase opacity-85', e.texto)}>Resultado</p>
          <p className={cn('font-display text-[20px] leading-tight font-extrabold', e.texto)}>{r.selo ?? GRAVIDADES[r.gravidade].selo}</p>
        </div>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <div>
          <h3 className="font-display text-[19px] leading-snug font-bold text-ink">{r.titulo}</h3>
          <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{r.explicacao}</p>
        </div>

        <section>
          <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold tracking-wide text-ink uppercase">
            <ListChecks className="size-4 text-accent" /> O que fazer agora
          </p>
          <ol className="flex flex-col gap-2">
            {r.agora.map((a, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[14.5px] leading-snug text-ink">
                <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-bold text-accent-ink">{i + 1}</span>
                <span className="pt-0.5">{a}</span>
              </li>
            ))}
          </ol>
        </section>

        {r.evitar && r.evitar.length > 0 && (
          <section className="rounded-2xl bg-crit-soft p-3.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold tracking-wide text-crit-ink uppercase">
              <ShieldAlert className="size-4" /> Não faça
            </p>
            <ul className="flex flex-col gap-1.5">
              {r.evitar.map((a, i) => (
                <li key={i} className="text-[13.5px] leading-snug text-crit-ink">
                  {a}
                </li>
              ))}
            </ul>
          </section>
        )}

        <details className="sos-chip group rounded-2xl p-3.5">
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-bold tracking-wide text-ink-2 uppercase [&::-webkit-details-marker]:hidden">
            <Wrench className="size-4" /> Causas mais comuns
            <span className="ml-auto text-[18px] leading-none transition-transform group-open:rotate-90">›</span>
          </summary>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[13.5px] leading-snug text-ink-2">
            {r.causas.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </details>

        <div className="flex flex-col gap-2 pt-1">
          {parar ? (
            <>
              <BotaoApp variante="sos" tamanho="xl" largo icone={Siren} onClick={aoPedirSOS} className="sos-respira">
                Pedir SOS com este diagnóstico
              </BotaoApp>
              <BotaoApp variante="neutro" tamanho="md" largo icone={CalendarPlus} onClick={aoAgendar}>
                Agendar revisão
              </BotaoApp>
            </>
          ) : (
            <>
              <BotaoApp tamanho="lg" largo icone={CalendarPlus} onClick={aoAgendar}>
                Agendar revisão
              </BotaoApp>
              <BotaoApp variante="neutro" tamanho="md" largo icone={Siren} onClick={aoPedirSOS} className="text-[#d62d30]">
                Pedir SOS com este diagnóstico
              </BotaoApp>
            </>
          )}
          {telefone && (
            <a href={telefone} className="flex min-h-11 items-center justify-center gap-2 text-[14px] font-semibold text-ink-2">
              <PhoneCall className="size-4" /> Falar com um mecânico da Tecnoar
            </a>
          )}
          <button type="button" onClick={aoRecomecar} className="flex min-h-11 items-center justify-center gap-2 text-[13.5px] font-semibold text-ink-3">
            <RotateCcw className="size-4" /> Fazer outro diagnóstico
          </button>
        </div>
        <p className="border-t border-line pt-3 text-[11.5px] leading-snug text-ink-3">
          Orientação automática com base nas suas respostas. Não substitui a avaliação de um mecânico. Na dúvida, pare em local seguro.
        </p>
      </div>
    </article>
  )
}
