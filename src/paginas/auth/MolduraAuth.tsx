import type { ReactNode } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Logo } from '@/componentes/marca/Logo'
import { useTema } from '@/tema/TemaProvider'
import { cn } from '@/lib/utils'
import type { TemaInterface } from '@/tipos/db'

function SeletorTema() {
  const { tema, definirTema } = useTema()
  const opcoes: Array<{ v: TemaInterface; rotulo: string; icone: ReactNode }> = [
    { v: 'claro', rotulo: 'Tema claro', icone: <Sun /> },
    { v: 'escuro', rotulo: 'Tema escuro', icone: <Moon /> },
    { v: 'sistema', rotulo: 'Seguir o sistema', icone: <Monitor /> },
  ]

  return (
    <div
      role="radiogroup"
      aria-label="Tema da interface"
      className="flex gap-0.5 rounded-full border border-line bg-surface/80 p-1 backdrop-blur-sm"
    >
      {opcoes.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={tema === o.v}
          aria-label={o.rotulo}
          title={o.rotulo}
          onClick={() => definirTema(o.v)}
          className={cn(
            'flex size-7 items-center justify-center rounded-full transition-colors [&_svg]:size-3.5',
            tema === o.v ? 'bg-surface-2 text-ink shadow-e1' : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {o.icone}
        </button>
      ))}
    </div>
  )
}

/** Módulos realmente implantados — nada aqui é promessa de tela futura. */
const MODULOS = [
  'Recepção',
  'Ordens de Serviço',
  'Painel do Pátio',
  'Checklists técnicos',
  'Peças em Teste',
  'Garantias e Retornos',
]

export function MolduraAuth({
  sobretitulo,
  titulo,
  descricao,
  children,
  rodape,
}: {
  sobretitulo: string
  titulo: string
  descricao?: string
  children: ReactNode
  rodape?: ReactNode
}) {
  return (
    <div className="grid min-h-dvh bg-canvas lg:grid-cols-[1fr_minmax(480px,44%)]">
      {/* Painel da marca — escondido no mobile para dar espaço ao formulário */}
      <section className="malha-tecnica relative hidden flex-col justify-between overflow-hidden bg-surface p-14 lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 -left-44 size-[900px] rounded-full"
          style={{ background: 'radial-gradient(circle, var(--c-cyan-soft) 0%, transparent 62%)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-48 -bottom-52 size-[620px] rounded-full"
          style={{ background: 'radial-gradient(circle, var(--c-accent-soft) 0%, transparent 64%)' }}
        />

        {/*
          Três blocos, não dois.
          Com apenas o rótulo e a logo, o `justify-between` jogava a marca para
          o rodapé e abria um vazio no meio do painel. O bloco central segura a
          composição; o rodapé fecha a coluna.
        */}
        <div className="relative flex items-center gap-2.5">
          <span aria-hidden className="h-[3px] w-8 rounded-full bg-accent" />
          <span className="lbl text-cyan-ink">Sistema Operacional</span>
        </div>

        <div className="relative flex max-w-[30rem] flex-col gap-8">
          <Logo altura={116} />

          <p className="text-[15px] leading-relaxed text-ink-2">
            Da recepção do veículo à entrega: ordem de serviço, pátio, checklists técnicos,
            evidências e assinatura em um só fluxo.
          </p>

          <div className="flex flex-col gap-3">
            <span className="lbl">Módulos em operação</span>
            <ul className="grid grid-cols-2 gap-x-8 gap-y-2">
              {MODULOS.map((m) => (
                <li key={m} className="flex items-center gap-2 text-[13px] text-ink-3">
                  <span aria-hidden className="size-1 shrink-0 rounded-full bg-cyan" />
                  {m}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <span className="lbl relative">Tecnoar Freios · Freios pneumáticos e diagnóstico</span>
      </section>

      {/* Painel do formulário */}
      <section className="relative flex flex-col justify-center border-line px-5 py-10 sm:px-10 lg:border-l lg:px-16">
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 hidden w-0.5 opacity-60 lg:block"
          style={{
            background:
              'linear-gradient(180deg, transparent 0%, var(--c-cyan) 22%, var(--c-cyan) 42%, var(--c-accent) 70%, transparent 100%)',
          }}
        />

        <div className="absolute top-[calc(1.25rem+env(safe-area-inset-top))] right-5">
          <SeletorTema />
        </div>

        <div className="mx-auto flex w-full max-w-[26rem] flex-col gap-7">
          <div className="flex justify-center lg:hidden">
            <Logo altura={62} />
          </div>

          <div className="flex flex-col gap-2">
            <span className="lbl">{sobretitulo}</span>
            <h2 className="font-display text-[28px] font-semibold tracking-tight text-ink">{titulo}</h2>
            {descricao && <p className="text-sm leading-relaxed text-ink-3">{descricao}</p>}
          </div>

          {children}

          {rodape}
        </div>
      </section>
    </div>
  )
}
