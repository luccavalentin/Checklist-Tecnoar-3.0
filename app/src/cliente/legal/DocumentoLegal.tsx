import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, ExternalLink, MessageCircle, PhoneCall, ScrollText, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { linkTelefone, linkWhatsApp } from '@/sos/rotulos'
import { BotaoApp, Folha } from '../../comum/ui'
import { useInfoPublica } from '../dados'
import { VIGENCIA_LEGAL, politicaDePrivacidade, termosDeUso, type ContextoLegal, type TipoDocumentoLegal } from './textos'

/**
 * Termos de uso e política de privacidade: como página (rota pública, abre
 * logado ou não) e como folha (no cadastro, para ler sem perder o que já foi
 * digitado no formulário).
 */

const ROTA: Record<TipoDocumentoLegal, string> = { termos: '/termos', privacidade: '/privacidade' }

function useContextoLegal(): ContextoLegal {
  const d = useInfoPublica().data
  // Enquanto a informação pública não chega (ou sem rede), o texto fala da empresa pelo nome da marca.
  const empresa = d?.empresa?.trim() || 'Tecnoar'
  const telefone = d?.telefone ?? null
  const whatsapp = d?.whatsapp ?? null
  const politicaUrl = d?.politica_privacidade_url?.trim() || null
  return useMemo(() => ({ empresa, telefone, whatsapp, politicaUrl }), [empresa, telefone, whatsapp, politicaUrl])
}

/* ── página ─────────────────────────────────────────────────────────────── */

export function PaginaLegal({ tipo }: { tipo: TipoDocumentoLegal }) {
  const navegar = useNavigate()
  const ctx = useContextoLegal()
  const doc = useMemo(() => (tipo === 'termos' ? termosDeUso(ctx) : politicaDePrivacidade(ctx)), [tipo, ctx])
  const Icone = tipo === 'termos' ? ScrollText : ShieldCheck

  useEffect(() => {
    window.scrollTo({ top: 0 })
    const antes = document.title
    document.title = `${doc.titulo} · SOS Tecnoar`
    return () => {
      document.title = antes
    }
  }, [doc.titulo])

  function voltar() {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navegar(-1)
    else navegar('/', { replace: true })
  }

  return (
    <div className="sos-app-bg min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/95 pt-[calc(env(safe-area-inset-top)+var(--faixa-rede,0px))] backdrop-blur-md">
        <div className="mx-auto flex min-h-[3.75rem] max-w-3xl items-center gap-2 px-2">
          <button type="button" aria-label="Voltar" onClick={voltar} className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink hover:bg-surface-2 active:bg-surface-2">
            <ChevronLeft className="size-6" />
          </button>
          {/* Telas estreitas: o título já está no topo da página; a troca de documento ganha o espaço. */}
          <p className="min-w-0 flex-1 truncate font-display text-[17px] font-bold text-ink max-[419px]:invisible">{doc.titulo}</p>
          <TrocaDocumento atual={tipo} aoTrocar={(t) => navegar(ROTA[t], { replace: true })} />
        </div>
      </header>

      <main className="entrada-suave mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-4 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <section className="flex flex-col gap-3 rounded-[1.25rem] border border-line bg-surface p-5">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
            <Icone className="size-6" />
          </span>
          <div>
            <h1 className="font-display text-[26px] leading-tight font-bold text-ink">{doc.titulo}</h1>
            <p className="mt-1 max-w-xl text-[14.5px] leading-snug text-ink-2">{doc.subtitulo}</p>
            <p className="mt-3 text-[12.5px] font-medium text-ink-3">Vigente desde {VIGENCIA_LEGAL}</p>
          </div>
        </section>

        <CorpoDocumento doc={doc} ctx={ctx} tipo={tipo} comSumario />
      </main>
    </div>
  )
}

function TrocaDocumento({ atual, aoTrocar, className }: { atual: TipoDocumentoLegal; aoTrocar: (t: TipoDocumentoLegal) => void; className?: string }) {
  return (
    <div role="tablist" aria-label="Documento" className={cn('sos-segmented flex shrink-0 gap-1 rounded-full p-1', className)}>
      {(
        [
          ['termos', 'Termos'],
          ['privacidade', 'Privacidade'],
        ] as const
      ).map(([t, r]) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={atual === t}
          onClick={() => atual !== t && aoTrocar(t)}
          className={cn(
            'min-h-9 rounded-full px-3 text-[12.5px] font-bold transition-colors',
            atual === t ? 'bg-[#0D1C33] text-white dark:bg-white dark:text-[#0D1C33]' : 'text-ink-2',
          )}
        >
          {r}
        </button>
      ))}
    </div>
  )
}

/* ── corpo (página e folha) ─────────────────────────────────────────────── */

function CorpoDocumento({
  doc,
  ctx,
  tipo,
  comSumario,
}: {
  doc: ReturnType<typeof termosDeUso>
  ctx: ContextoLegal
  tipo: TipoDocumentoLegal
  comSumario?: boolean
}) {
  const secoes = useRef<Record<string, HTMLElement | null>>({})
  const tel = linkTelefone(ctx.telefone)
  const whats = linkWhatsApp(ctx.whatsapp ?? ctx.telefone, tipo === 'privacidade' ? 'Olá! Assunto: Privacidade / LGPD no app SOS Tecnoar.' : 'Olá! Tenho uma dúvida sobre os termos do app SOS Tecnoar.')

  return (
    <>
      <section className="sos-card flex flex-col gap-3 rounded-[1.45rem] p-4" aria-label="Em resumo">
        <h2 className="font-display text-[15px] font-bold text-ink">Em resumo</h2>
        <ul className="flex flex-col gap-2.5">
          {doc.resumo.map((r) => (
            <li key={r} className="flex items-start gap-2.5 text-[14.5px] leading-snug text-ink">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok-ink">
                <Check className="size-3.5" strokeWidth={3} />
              </span>
              {r}
            </li>
          ))}
        </ul>
      </section>

      {comSumario && (
        <nav aria-label="Sumário" className="flex flex-col gap-2">
          <h2 className="px-1 font-display text-[15px] font-bold text-ink">Sumário</h2>
          <ol className="grid gap-1.5 sm:grid-cols-2">
            {doc.secoes.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => secoes.current[s.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="sos-chip flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[13.5px] font-semibold text-ink-2 active:scale-[0.99]"
                >
                  <span className="num w-5 shrink-0 text-right text-[12px] text-ink-3">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate">{s.titulo}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-col gap-3">
        {doc.secoes.map((s, i) => (
          <section
            key={s.id}
            ref={(el) => {
              secoes.current[s.id] = el
            }}
            aria-labelledby={`legal-${s.id}`}
            className="sos-card flex scroll-mt-24 flex-col gap-3 rounded-[1.45rem] p-4 sm:p-5"
          >
            <h2 id={`legal-${s.id}`} className="flex items-baseline gap-2 font-display text-[17px] leading-snug font-bold text-ink">
              <span className="num text-[13px] font-bold text-accent-ink">{i + 1}.</span>
              {s.titulo}
            </h2>
            {s.conteudo}
          </section>
        ))}
      </div>

      <section className="sos-card flex flex-col gap-3 rounded-[1.45rem] p-4 sm:p-5" aria-labelledby="legal-contato">
        <h2 id="legal-contato" className="font-display text-[17px] font-bold text-ink">
          Fale com a {ctx.empresa}
        </h2>
        <p className="text-[14.5px] leading-relaxed text-ink-2">
          {tipo === 'privacidade'
            ? 'Para qualquer assunto sobre seus dados pessoais — pedidos, dúvidas ou reclamações —, fale com a Tecnoar pelos canais abaixo e informe que o assunto é “Privacidade / LGPD”.'
            : 'Dúvidas sobre estes termos ou sobre um atendimento? Fale com a central da Tecnoar.'}
        </p>
        {(tel || whats) && (
          <div className="grid gap-2 sm:grid-cols-2">
            {tel && (
              <a href={tel} className="sos-night-action flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 font-display text-[15px] font-bold text-white active:scale-[0.99] dark:bg-white dark:text-[#0D1C33]">
                <PhoneCall className="size-5 shrink-0" /> <span className="truncate">Ligar {ctx.telefone ? `· ${ctx.telefone}` : ''}</span>
              </a>
            )}
            {whats && (
              <a href={whats} target="_blank" rel="noreferrer" className="sos-operator-action flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 font-display text-[15px] font-bold text-white active:scale-[0.99]">
                <MessageCircle className="size-5 shrink-0" /> WhatsApp
              </a>
            )}
          </div>
        )}
        {ctx.politicaUrl && (
          <a
            href={ctx.politicaUrl}
            target="_blank"
            rel="noreferrer"
            className="sos-chip flex min-h-12 items-center gap-2.5 rounded-2xl px-4 text-[14px] font-semibold text-ink active:scale-[0.99]"
          >
            <ShieldCheck className="size-5 shrink-0 text-cyan" />
            <span className="min-w-0 flex-1">Política de privacidade geral da {ctx.empresa}</span>
            <ExternalLink className="size-4 shrink-0 text-ink-3" />
          </a>
        )}
      </section>

      <p className="px-1 text-center text-[12px] leading-snug text-ink-3">
        {ctx.empresa} · SOS Tecnoar · vigente desde {VIGENCIA_LEGAL}
        {comSumario && (
          <>
            {' · '}
            <Link to={ROTA[tipo === 'termos' ? 'privacidade' : 'termos']} replace className="font-semibold text-accent-ink underline underline-offset-2">
              {tipo === 'termos' ? 'Política de privacidade' : 'Termos de uso'}
            </Link>
          </>
        )}
      </p>
    </>
  )
}

/* ── folha ──────────────────────────────────────────────────────────────── */

/**
 * Leitura dentro do cadastro: a folha sobe por cima do formulário, a pessoa
 * lê, fecha e continua de onde parou (abrir em outra aba, no app instalado do
 * iPhone, joga a pessoa para o Safari).
 */
export function FolhaLegal({ tipo, aoFechar }: { tipo: TipoDocumentoLegal | null; aoFechar: () => void }) {
  const ctx = useContextoLegal()
  const [atual, setAtual] = useState<TipoDocumentoLegal>(tipo ?? 'termos')
  useEffect(() => {
    if (tipo) setAtual(tipo)
  }, [tipo])
  const doc = useMemo(() => (atual === 'termos' ? termosDeUso(ctx) : politicaDePrivacidade(ctx)), [atual, ctx])
  const corpo = useRef<HTMLDivElement>(null)

  return (
    <Folha
      aberta={!!tipo}
      aoFechar={aoFechar}
      titulo={doc.titulo}
      descricao={`Vigente desde ${VIGENCIA_LEGAL}`}
      rodape={
        <BotaoApp tamanho="lg" largo onClick={aoFechar}>
          Entendi
        </BotaoApp>
      }
    >
      <div ref={corpo} className="flex flex-col gap-4 pb-2">
        <TrocaDocumento
          atual={atual}
          aoTrocar={(t) => {
            setAtual(t)
            corpo.current?.parentElement?.scrollTo({ top: 0 })
          }}
          className="self-start"
        />
        <CorpoDocumento doc={doc} ctx={ctx} tipo={atual} />
      </div>
    </Folha>
  )
}
