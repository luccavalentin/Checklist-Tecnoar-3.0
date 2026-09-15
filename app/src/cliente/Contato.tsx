import { Link, useNavigate } from 'react-router-dom'
import { CalendarPlus, ChevronRight, MessageCircle, PhoneCall, ShieldAlert, Siren, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'
import { linkTelefone, linkWhatsApp } from '@/sos/rotulos'
import { CabecalhoTela, Esqueleto, Tela } from '../comum/ui'
import { useInfoPublica } from './dados'
import { ErroCarga, GrupoLista, LinhaLista } from './pecas'

/**
 * Falar com a Tecnoar. Dois botões grandes: ligar e WhatsApp. Emergência na
 * estrada tem atalho próprio (SOS) e os números públicos de resgate.
 */
export function Contato() {
  const navegar = useNavigate()
  const info = useInfoPublica()
  const d = info.data
  const tel = linkTelefone(d?.telefone)
  const whats = linkWhatsApp(d?.whatsapp ?? d?.telefone, 'Olá, Tecnoar! Vim pelo app.')

  return (
    <>
      <CabecalhoTela titulo="Falar com a Tecnoar" voltar />
      <Tela className="entrada-suave">
        {info.isLoading ? (
          <div className="flex flex-col gap-3">
            <Esqueleto className="h-20" />
            <Esqueleto className="h-20" />
          </div>
        ) : info.isError ? (
          <ErroCarga erro={info.error} aoTentar={() => void info.refetch()} />
        ) : (
          <div className="grid gap-3">
            <CanalGrande href={tel} icone={PhoneCall} titulo="Ligar" detalhe={d?.telefone ?? 'Telefone não cadastrado'} classe="bg-[#0D1C33] text-white dark:bg-[#002061]" />
            <CanalGrande
              href={whats}
              icone={MessageCircle}
              titulo="WhatsApp"
              detalhe={d?.whatsapp ?? d?.telefone ?? 'WhatsApp não cadastrado'}
              classe="border border-line bg-surface text-ink"
              corIcone="bg-ok-soft text-ok"
            />
          </div>
        )}

        <button
          type="button"
          onClick={() => navegar('/sos')}
          className="flex items-center gap-4 rounded-[1.25rem] border border-crit/30 bg-surface p-4 text-left active:scale-[0.99]"
        >
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[#ff6600] text-white">
            <Siren className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[16.5px] font-bold text-ink">Parado na estrada?</span>
            <span className="block text-[13.5px] leading-snug text-ink-2">Peça socorro pelo app com localização automática.</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-ink-3" />
        </button>

        <GrupoLista>
          <LinhaLista para="/tecno-ia" icone={Brain} tomIcone="marca" titulo="Tecno IA" detalhe="Tire dúvidas sobre o veículo agora" />
          <LinhaLista para="/revisoes?agendar=1" icone={CalendarPlus} tomIcone="marca" titulo="Agendar revisão" detalhe="A Tecnoar confirma o horário" />
        </GrupoLista>

        <section className="flex flex-col gap-3 rounded-[1.25rem] border border-line bg-surface p-4">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="size-5 text-crit" />
            <h2 className="font-display text-[16px] font-bold text-ink">Feridos ou fogo?</h2>
          </div>
          <p className="text-[14px] leading-snug text-ink-2">Ligue primeiro para o resgate. Depois, peça o socorro mecânico.</p>
          <div className="grid grid-cols-4 gap-2">
            {[
              ['193', 'Bombeiros'],
              ['192', 'SAMU'],
              ['190', 'Polícia'],
              ['191', 'PRF'],
            ].map(([n, r]) => (
              <a key={n} href={`tel:${n}`} className="flex min-h-16 flex-col items-center justify-center rounded-2xl bg-crit-soft text-crit-ink active:scale-[0.97]">
                <span className="font-display text-[19px] leading-none font-black">{n}</span>
                <span className="mt-1 text-[11px] font-semibold">{r}</span>
              </a>
            ))}
          </div>
        </section>

        <p className="flex flex-wrap items-center justify-center gap-x-4 text-[13px] font-semibold text-ink-3">
          <Link to="/privacidade" className="inline-flex min-h-11 items-center underline underline-offset-2">
            Política de privacidade
          </Link>
          <Link to="/termos" className="inline-flex min-h-11 items-center underline underline-offset-2">
            Termos de uso
          </Link>
        </p>
      </Tela>
    </>
  )
}

function CanalGrande({
  href,
  icone: Icone,
  titulo,
  detalhe,
  classe,
  corIcone = 'bg-white/10',
}: {
  href: string | null
  icone: typeof PhoneCall
  titulo: string
  detalhe: string
  classe: string
  corIcone?: string
}) {
  const conteudo = (
    <>
      <span className={cn('flex size-12 shrink-0 items-center justify-center rounded-2xl', corIcone)}>
        <Icone className="size-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[19px] leading-tight font-bold">{titulo}</span>
        <span className="num block truncate text-[13.5px] opacity-75">{detalhe}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 opacity-60" />
    </>
  )
  const base = cn('flex min-h-[5rem] items-center gap-4 rounded-[1.25rem] p-4 transition-transform active:scale-[0.99]', classe)
  if (!href) return <div className={cn(base, 'opacity-50')}>{conteudo}</div>
  return (
    <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={base}>
      {conteudo}
    </a>
  )
}
