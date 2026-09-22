import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Bell, Brain, CalendarCheck, CarFront, ChevronRight, MapPin, ShieldCheck, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HomeCliente as DadosHome } from '@/sos/tipos'
import { Avatar, Esqueleto, LogoSOS } from '../../comum/ui'
import { nomeVeiculo } from '../dados'
import { AlertasVeiculo, BotaoTema, OrbeSOS } from './pecasInicio'
import './inicio.css'

export interface PropsInicio {
  nome: string
  naoLidas: number
  d: DadosHome | undefined
  carregando: boolean
  /** Erro de carga e aviso de conta sem vínculo. */
  avisos: ReactNode
  /** Socorro em andamento ou pedido guardado sem sinal. */
  socorro: ReactNode
  /** Convite para avaliar o último atendimento. */
  avaliar: ReactNode
  chamadoAtivo: boolean
  aoSOS: () => void
}

/**
 * Início do cliente: saudação, o cartão "Preciso de ajuda" com o SOS, avisos,
 * três atalhos e a faixa da Tecnoar. O mesmo desenho nos dois temas — só as
 * cores e a foto do cartão mudam.
 */
export function Inicio({ nome, naoLidas, d, carregando, avisos, socorro, avaliar, chamadoAtivo, aoSOS }: PropsInicio) {
  const navegar = useNavigate()
  const primeiro = nome.split(/\s+/)[0] || ''
  const v = d?.veiculo ?? null

  return (
    <div className="ini-app">
      <header className="pt-[calc(env(safe-area-inset-top)+var(--faixa-rede,0px))]">
        <div className="flex items-start justify-between gap-3 px-4 pt-3">
          <div className="flex flex-col items-start">
            <span className="hidden dark:block">
              <LogoSOS negativo altura={40} />
            </span>
            <span className="dark:hidden">
              <LogoSOS altura={40} />
            </span>
            <span className="ini-marca">Sempre com você</span>
          </div>
          <div className="flex items-center gap-2">
            <BotaoTema para="escuro" className="ini-botao ini-so-claro" />
            <BotaoTema para="claro" className="ini-botao ini-so-escuro" />
            <button
              type="button"
              onClick={() => navegar('/notificacoes')}
              aria-label={naoLidas ? `Notificações, ${naoLidas} não lidas` : 'Notificações'}
              className="ini-botao relative"
            >
              <Bell className="size-[21px]" strokeWidth={1.8} />
              {naoLidas > 0 && (
                <span className="num absolute -top-1 -right-1 flex min-w-[20px] items-center justify-center rounded-full bg-[#FF6A00] px-1 text-[11px] leading-5 font-bold text-white shadow-[0_0_12px_rgb(255_106_0/0.7)]">
                  {naoLidas > 99 ? '99+' : naoLidas}
                </span>
              )}
            </button>
            <button type="button" onClick={() => navegar('/perfil')} aria-label="Minha conta" className="ini-botao p-0 active:scale-95">
              <Avatar nome={nome} className="ini-avatar size-full bg-transparent text-[15px] dark:bg-transparent" />
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-start justify-between gap-3 px-4">
          <div className="min-w-0">
            <h1 className="ini-ola truncate">Olá{primeiro ? `, ${primeiro}` : ''}</h1>
            <p className="ini-ola-sub">Socorro e revisões sempre à mão.</p>
          </div>
          <p className="ini-lema">
            Mais
            <br />
            mobilidade
            <br />
            para o seu
            <br />
            caminho
          </p>
        </div>
      </header>

      <main className="ini-conteudo entrada-suave">
        {avisos}

        {socorro ?? (
          <button type="button" onClick={aoSOS} className="ini-hero" aria-label={chamadoAtivo ? 'Acompanhar o socorro em andamento' : 'Preciso de ajuda. Pedir socorro (SOS)'}>
            <span className="ini-hero-texto">
              <span className="ini-sobre">
                Em qualquer lugar,
                <br />
                sempre com você
              </span>
              <span className="ini-titulo">
                Preciso
                <br />
                de ajuda
              </span>
              <span className="ini-sub">
                Toque e a Tecnoar
                <br />
                localiza você.
              </span>
              <span className="ini-local">
                <span className="ini-local-icone">
                  <MapPin className="size-[55%]" strokeWidth={1.9} />
                </span>
                <span>
                  Sua localização será
                  <br />
                  detectada automaticamente.
                </span>
              </span>
            </span>
            <OrbeSOS tema="escuro" ativo={chamadoAtivo} className="ini-hero-orbe" />
          </button>
        )}

        {avaliar}
        <AlertasVeiculo d={d} />

        {naoLidas > 0 && (
          <Link to="/notificacoes" className="ini-aviso">
            <span className="ini-aviso-icone">
              <Bell className="size-5" strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="ini-aviso-titulo">{naoLidas === 1 ? '1 aviso novo' : `${naoLidas} avisos novos`}</span>
              <span className="ini-aviso-sub">Confira suas notificações</span>
            </span>
            <ChevronRight className="size-5 shrink-0 opacity-80" />
          </Link>
        )}

        <nav aria-label="Atalhos" className="ini-atalhos">
          {carregando ? (
            <>
              <Esqueleto className="h-[10.5rem] rounded-[1.2rem]" />
              <Esqueleto className="h-[10.5rem] rounded-[1.2rem]" />
              <Esqueleto className="h-[10.5rem] rounded-[1.2rem]" />
            </>
          ) : (
            <>
              {v ? (
                <CartaoAtalho para="/veiculos" icone={CarFront} titulo="Meu veículo" texto={`${nomeVeiculo(v)} · ${v.placa}`} fundo="ini-card-veiculo" />
              ) : (
                <CartaoAtalho para="/veiculos?novo=1" icone={CarFront} titulo="Cadastrar veículo" texto="Com a placa salva, o socorro sai mais rápido." fundo="ini-card-veiculo" />
              )}
              <CartaoAtalho para="/tecno-ia" icone={Brain} titulo="Tecno IA" texto="Tire dúvidas sobre o seu veículo com nossa inteligência artificial." fundo="ini-card-ia" selo="IA" />
              <CartaoAtalho para="/revisoes" icone={CalendarCheck} titulo="Revisões" texto="Agende a preventiva e mantenha seu veículo sempre em dia." fundo="ini-card-revisoes" contador={d?.lembretes} />
            </>
          )}
        </nav>

        <Link to="/contato" className="ini-faixa">
          <ShieldCheck className="size-8 shrink-0 text-[#FF7A1A] drop-shadow-[0_0_8px_rgb(255_122_26/0.7)]" strokeWidth={1.6} />
          <span className="ini-faixa-texto">
            Mais que assistência,
            <br />
            tranquilidade na sua jornada.
          </span>
        </Link>
      </main>
    </div>
  )
}

function CartaoAtalho({
  para,
  icone: Icone,
  titulo,
  texto,
  fundo,
  selo,
  contador,
}: {
  para: string
  icone: LucideIcon
  titulo: string
  texto: string
  fundo: string
  selo?: string
  contador?: number
}) {
  return (
    <Link to={para} className={cn('ini-card', fundo)}>
      <span className="ini-card-icone">
        <Icone className="size-[52%]" strokeWidth={1.7} />
        {selo && <span className="ini-selo-ia">{selo}</span>}
      </span>
      <span className="ini-card-titulo">{titulo}</span>
      <span className="ini-card-texto">{texto}</span>
      <span aria-hidden className="ini-card-seta">
        <ArrowRight className="size-[18px]" strokeWidth={2} />
      </span>
      {!!contador && (
        <span className="num absolute top-2.5 right-2.5 flex min-w-[20px] items-center justify-center rounded-full bg-[#FF6A00] px-1.5 text-[11px] leading-5 font-semibold text-white">
          {contador > 99 ? '99+' : contador}
        </span>
      )}
    </Link>
  )
}
