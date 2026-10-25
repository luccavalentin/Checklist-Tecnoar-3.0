import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, Brain, CalendarCheck, ChevronRight, History, MessageCircle, PhoneCall, WifiOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HomeCliente as DadosHome } from '@/sos/tipos'
import { Arte } from '../../comum/Arte'
import { ARTE3D, ARTE_MOBILE } from '../../comum/kit3d'
import { Avatar, Esqueleto, LogoSOS } from '../../comum/ui'
import { nomeVeiculo } from '../dados'
import { BotaoSOS } from './BotaoSOS'
import { AlertasVeiculo, BotaoTema, IconeVeiculo } from './pecasInicio'
import './inicio.css'
import './inicio-premium.css'

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
  /** Conexão do aparelho. Sem ela o pedido fica guardado e o telefone sobe. */
  online: boolean
  /** Emergência 24h, já em formato `tel:`. */
  telefone: string | null
  whatsapp?: string | null
  aoSOS: () => void
}

/**
 * Início do cliente.
 *
 * O DESENHO, E POR QUÊ
 *
 * Quem abre esta tela pode estar parado no acostamento, no escuro, com pressa
 * e com medo. Isso decide tudo:
 *
 * 1. A TELA É A AÇÃO. O beacon não mora dentro de um cartão com foto, ele é o
 *    centro do aparelho — alvo enorme, que se acha sem ler e sem mirar. Antes
 *    havia um SOS translúcido no canto de uma foto E outro na barra de baixo:
 *    duas ações primárias para a mesma coisa, nenhuma delas evidente.
 *
 * 2. UMA COISA DE CADA VEZ. Saíram o lema vertical, os dois rótulos
 *    decorativos e os três cartões iguais de ícone+título+texto que eram a
 *    estrutura da página. Veículo, IA, Revisões e Histórico continuam a um
 *    toque, numa faixa discreta embaixo — secundários de verdade, não
 *    competindo com o pedido de socorro.
 *
 * 3. A TELA DIZ SE PODE AJUDAR. O subtítulo do beacon é estado real, não
 *    slogan: com internet promete a localização; sem internet avisa que o
 *    pedido fica guardado e PROMOVE o telefone, que é o canal que funciona
 *    quando o app não funciona. Prometer o que não se pode cumprir é o pior
 *    que esta tela poderia fazer.
 *
 * 4. COM SOCORRO EM ANDAMENTO, a tela inteira vira o acompanhamento: o beacon
 *    sai e entra o cartão ao vivo. Não se pede socorro duas vezes.
 */
export function Inicio({
  nome,
  naoLidas,
  d,
  carregando,
  avisos,
  socorro,
  avaliar,
  chamadoAtivo,
  online,
  telefone,
  whatsapp,
  aoSOS,
}: PropsInicio) {
  const navegar = useNavigate()
  const v = d?.veiculo ?? null

  return (
    <div className="ini-app ini-premium">
      <header className="ini-topo">
        <span>
          <LogoSOS negativo altura={58} />
        </span>
        <div className="flex items-center gap-2">
          <BotaoTema para="escuro" className="ini-botao ini-so-claro" />
          <BotaoTema para="claro" className="ini-botao ini-so-escuro" />
          <button
            type="button"
            onClick={() => navegar('/notificacoes')}
            aria-label={naoLidas ? `Notificações, ${naoLidas} não lidas` : 'Notificações'}
            className="ini-botao relative"
          >
            <Arte src={ARTE_MOBILE.sino} alt="" recuo={<Bell className="size-[21px]" strokeWidth={1.8} />} classeImagem="ini-topo-peca" />
            {naoLidas > 0 && (
              <span className="ini-selo-sino num">{naoLidas > 99 ? '99+' : naoLidas}</span>
            )}
          </button>
          <button type="button" onClick={() => navegar('/perfil')} aria-label="Minha conta" className="ini-botao p-0 active:scale-95">
            <Avatar nome={nome} className="ini-avatar size-full bg-transparent text-[15px] dark:bg-transparent" />
          </button>
        </div>
      </header>

      <main className="ini-palco">
        {(avisos || avaliar) && (
          <div className="ini-avisos">
            {avisos}
            {avaliar}
          </div>
        )}

        {socorro ?? (
          <section className="ini-acao">
            <div className="ini-cena-estrada" aria-hidden="true" />
            <h1 className="ini-chamada">Socorro para <span>seguir viagem.</span></h1>
            <BotaoSOS modo={chamadoAtivo ? 'vivo' : 'pronto'} aoTocar={aoSOS} className="ini-beacon" />
            <p className="ini-sos-descricao">Pedir socorro</p>
            {/* Estado, não slogan. Ver a nota 3 no topo do arquivo. */}
            <p className={cn('ini-prontidao', !online && 'ini-prontidao-off')}>
              {online ? (
                <>
                  Confirme o local antes de enviar.
                </>
              ) : (
                <>
                  <WifiOff aria-hidden className="size-[15px] shrink-0" />
                  Sem internet. Seu pedido fica guardado e sai quando a conexão voltar.
                </>
              )}
            </p>

            <div className="ini-contatos">
            {telefone && (
              <a
                href={telefone}
                className={cn('ini-ligar', !online && 'ini-ligar-forte')}
                aria-label="Ligar para a Tecnoar"
              >
                <Arte src={ARTE3D.ligar} alt="" recuo={<PhoneCall className="size-[18px]" strokeWidth={2} />} classeImagem="ini-contato-peca" />
                Ligar
              </a>
            )}
              <Link
                to="/chat-tecnoar"
                className="ini-ligar ini-chat-duvidas"
                aria-label="Chat tira-dúvidas com a equipe Tecnoar"
              >
                <Arte src={ARTE_MOBILE.chatDuvidas} alt="" recuo={<MessageCircle className="size-[18px]" aria-hidden="true" />} classeImagem="ini-contato-peca" />
                <span>Chat<span className="ini-chat-sub">Tira-dúvidas</span></span>
              </Link>
            {online && whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="ini-ligar" aria-label="Falar com a Tecnoar no WhatsApp">
                <Arte src={ARTE_MOBILE.whatsapp} alt="" recuo={<MessageCircle className="size-[18px]" aria-hidden="true" />} classeImagem="ini-contato-peca" />
                WhatsApp
              </a>
            )}
            </div>
          </section>
        )}
      </main>

      <footer className="ini-rodape">
        <AlertasVeiculo d={d} className="ini-alertas" />

        {carregando ? (
          <Esqueleto className="h-[3.4rem] rounded-[1.1rem]" />
        ) : (
          <Link to={v ? '/veiculos' : '/veiculos?novo=1'} className="ini-veiculo">
            <span className="ini-veiculo-conjunto">
            <span className="ini-veiculo-icone">
              <IconeVeiculo tipo={v?.tipo} className="size-[22px]" />
            </span>
            <span className="min-w-0">
              <span className="ini-veiculo-nome">{v ? nomeVeiculo(v) : 'Cadastrar meu veículo'}</span>
              <span className="ini-veiculo-sub">
                {v ? v.placa : 'Com a placa salva, o socorro sai mais rápido.'}
              </span>
            </span>
            </span>
            <ChevronRight aria-hidden className="size-5 shrink-0 opacity-50" />
          </Link>
        )}

        <nav aria-label="Atalhos" className="ini-pastilhas">
          <Pastilha
            para="/tecno-ia"
            icone={<Brain />}
            peca={ARTE3D.ia}
            rotulo="Tecno IA"
            texto="Tire dúvidas na hora"
          />
          <Pastilha
            para="/revisoes"
            icone={<CalendarCheck />}
            peca={ARTE3D.revisoes}
            rotulo="Revisões"
            texto="Agende a preventiva"
            contador={d?.lembretes}
          />
          <Pastilha
            para="/historico"
            icone={<History />}
            peca={ARTE3D.historico}
            rotulo="Histórico"
            texto="Seus atendimentos"
          />
        </nav>
      </footer>
    </div>
  )
}

/**
 * Atalho secundário, em cartão.
 *
 * Era uma pastilha de uma linha só, com o nome e mais nada. Quem nunca tinha
 * aberto o app não descobria o que havia ali dentro — "Tecno IA" não diz a
 * ninguém que existe uma triagem que funciona sem internet. A linha de apoio
 * devolve isso, e a peça 3D dá ao cartão o mesmo material do resto da tela.
 *
 * Continua secundário: fica abaixo do veículo, não disputa altura com o SOS, e
 * a linha de apoio é curta de propósito — num celular de 320 px, três colunas
 * deixam cerca de 90 px para cada uma.
 */
function Pastilha({
  para,
  icone,
  peca,
  rotulo,
  texto,
  contador,
}: {
  para: string
  icone: ReactNode
  /** Peça 3D do atalho; sem ela (ou se falhar) fica o ícone de linha. */
  peca: string
  rotulo: string
  texto: string
  contador?: number
}) {
  return (
    <Link to={para} className="ini-pastilha">
      <span aria-hidden className="ini-pastilha-icone">
        <Arte src={peca} alt="" recuo={icone} classeImagem="ini-pastilha-peca" />
      </span>
      <span className="ini-pastilha-nome">{rotulo}</span>
      <span className="ini-pastilha-texto">{texto}</span>
      {!!contador && <span className="ini-pastilha-contador num">{contador > 99 ? '99+' : contador}</span>}
    </Link>
  )
}
