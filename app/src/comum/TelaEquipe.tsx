import { Building2, ChevronRight, Command, Hourglass, LogOut, MapPinned, Radio, ShieldCheck, Wrench } from 'lucide-react'
import { URL_CHECKLIST } from '@/sos/endereco'
import { useSessao } from '../sessao'
import { BotaoApp, LogoSOS } from './ui'

/**
 * Conta da equipe que não é mecânico (ou ainda pendente) abriu o app. A
 * central do SOS mora no Checklist, em outro endereço; aqui só oferecemos o
 * caminho certo — e explicamos como a conta passa a atender pelo app.
 */
export function TelaEquipe() {
  const { papel, sair } = useSessao()
  const pendente = papel?.papel === 'equipe_pendente'
  const nome = papel && 'nome' in papel ? papel.nome : null

  return (
    <div className="sos-tech-layer flex min-h-dvh flex-col overflow-hidden bg-[#0D1C33] px-5 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_68%_at_95%_2%,rgb(252_100_0/0.28),transparent_58%),radial-gradient(72%_64%_at_4%_20%,rgb(41_199_184/0.18),transparent_60%),linear-gradient(180deg,transparent,rgb(0_0_0/0.22))]"
      />
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex items-center justify-between">
          <LogoSOS negativo altura={32} />
          <span className="rounded-full border border-white/12 bg-white/10 px-3 py-1.5 font-display text-[11px] font-extrabold tracking-[0.16em] text-[#ffb27a] backdrop-blur-xl">
            OPERAÇÃO
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-5 py-8">
          <section className="sos-hero-panel rounded-[1.8rem] p-5">
            <span className="relative z-[1] flex size-16 items-center justify-center rounded-[1.35rem] bg-white/10 text-[#ffb27a] ring-1 ring-white/12">
              {pendente ? <Hourglass className="size-8" /> : <Building2 className="size-8" />}
            </span>
            <div className="relative z-[1] mt-6 flex flex-col gap-2">
              <p className="text-[11px] font-bold tracking-[0.18em] text-[#5fe0b5] uppercase">
                {pendente ? 'Liberação pendente' : 'Comando SOS'}
              </p>
              <h1 className="font-display text-[33px] leading-[1] font-black tracking-tight text-white">
                {pendente ? 'Acesso em análise' : `Olá${nome ? ', ' + nome.split(' ')[0] : ''}`}
              </h1>
              <p className="text-[14.5px] leading-relaxed text-white/72">
                {pendente ? 'Aguardando liberação para atendimento em campo.' : 'Mapa vivo, despacho rápido e acompanhamento em tempo real.'}
              </p>
            </div>
          </section>

          {!pendente && (
            <div className="grid grid-cols-3 gap-2.5">
              <Sinal icone={MapPinned} valor="Mapa vivo" rotulo="tempo real" />
              <Sinal icone={Radio} valor="Despacho" rotulo="SOS" />
              <Sinal icone={ShieldCheck} valor="Campo" rotulo="equipe pronta" />
            </div>
          )}

          {!pendente && (
            <div className="flex items-start gap-3 rounded-[1.1rem] border border-white/12 bg-white/8 p-3.5 text-[13px] leading-snug text-white/75 backdrop-blur-xl">
              <Wrench className="mt-0.5 size-4 shrink-0 text-[#ffb27a]" />
              <p>
                <b className="text-white">Receber chamados no celular</b>
                <br />
                Ative seu perfil em SOS → Mecânicos.
              </p>
            </div>
          )}

          {!pendente && (
            <button
              type="button"
              onClick={() => (window.location.href = `${URL_CHECKLIST}/sos`)}
              className="sos-premium-action flex min-h-16 items-center justify-center gap-3 rounded-[1.25rem] px-5 font-display text-[17px] font-extrabold text-white uppercase active:scale-[0.98]"
            >
              <Command className="size-5" />
              Abrir Central SOS
              <ChevronRight className="size-5" />
            </button>
          )}
          <BotaoApp variante="neutro" tamanho="lg" icone={LogOut} largo onClick={() => void sair()} className="border-white/12 bg-white/8 text-white hover:bg-white/12">
            Sair e entrar com outra conta
          </BotaoApp>
        </div>
      </div>
    </div>
  )
}

function Sinal({ icone: Icone, valor, rotulo }: { icone: typeof MapPinned; valor: string; rotulo: string }) {
  return (
    <div className="rounded-[1.1rem] border border-white/12 bg-white/8 p-3 text-white shadow-[0_1px_0_rgb(255_255_255/0.12)_inset] backdrop-blur-xl">
      <Icone className="mb-2 size-4 text-[#5fe0b5]" />
      <span className="block font-display text-[15px] font-extrabold">{valor}</span>
      <span className="mt-0.5 block text-[10.5px] leading-tight font-semibold text-white/50">{rotulo}</span>
    </div>
  )
}
