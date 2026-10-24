import type { ReactNode } from 'react'
import { CheckCircle2, MessageSquareShare, PhoneCall, RefreshCw, Satellite, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { pendenteExpirou, type PedidoPendente } from '../filaSOS'
import { linkSms, mensagemSocorro, podeTerSatelite, referencia } from '../semSinal'
import { BotaoSOS } from './BotaoSOS'

/**
 * O pedido de socorro quando a internet acabou.
 *
 * O DESENHO, E POR QUÊ
 *
 * 1. A PEÇA NÃO TROCA, O ESTADO DELA TROCA. É o mesmo botão do Início, frio:
 *    a cúpula esfria e o aro varre atrás de rede. Quem chega aqui chegou pela
 *    pior porta possível — trocar o objeto central obrigaria a pessoa a
 *    reaprender a tela justo quando ela está menos capaz de aprender.
 *
 * 2. A ORDEM É A INFORMAÇÃO. Os três caminhos não são três cartões iguais
 *    lado a lado; são degraus de uma corrente, do que acontece sozinho ao
 *    que precisa de um toque. Lado a lado, a pessoa teria de ESCOLHER entre
 *    três coisas sem saber qual é a melhor. Em corrente, ela lê de cima para
 *    baixo e para no primeiro que resolve.
 *
 * 3. NADA DE FINGIR QUE JÁ DEU CERTO. O primeiro degrau diz que está
 *    guardado e tentando — não "enviado". O segundo abre as mensagens do
 *    celular com o texto pronto, mas quem envia é a pessoa, e a tela diz
 *    isso. Prometer entrega que não houve é a única coisa que esta tela não
 *    pode fazer.
 *
 * 4. SATÉLITE, SEM MENTIRA. A linha sobre satélite só aparece em aparelho de
 *    geração que tem o recurso, e explica o mecanismo real: quem fala com o
 *    satélite é o aplicativo de mensagens do celular, não a Tecnoar. Está
 *    escrito como possibilidade, nunca como garantia.
 */
export function SemSinal({
  pendente,
  usuarioId,
  nome,
  telefone,
  online,
  aoEnviar,
  aoDescartar,
}: {
  pendente: PedidoPendente
  usuarioId: string | null
  nome: string
  /** Emergência 24h, já em formato `tel:`. */
  telefone: string | null
  online: boolean
  aoEnviar: () => void
  aoDescartar: () => void
}) {
  const ref = referencia(pendente, usuarioId)
  const mensagem = mensagemSocorro(pendente, usuarioId, nome)
  const expirou = pendenteExpirou(pendente)
  const satelite = podeTerSatelite()
  const numeroSms = telefone?.replace(/^tel:/, '') ?? null

  return (
    <section aria-label="Pedido de socorro sem sinal" className="ini-acao">
      <BotaoSOS modo="sem-sinal" className="ini-beacon" />
      <h1 className="ini-chamada">{online ? 'Enviando seu pedido' : 'Sem sinal'}</h1>
      <p className="ini-prontidao ini-prontidao-off">
        {online
          ? 'A conexão voltou. Estamos mandando o pedido que ficou guardado.'
          : `Seu pedido está guardado neste celular. Protocolo ${ref}.`}
      </p>

      <div className="sin-escada">
        <Degrau
          ativo={!online}
          pulsa={!online}
          icone={online ? <RefreshCw /> : <CheckCircle2 />}
          titulo="Guardado no aparelho"
          sub={
            online
              ? 'Enviando agora.'
              : expirou
                ? 'Guardado há mais de duas horas. Se ainda precisa, use um dos caminhos abaixo.'
                : 'Sai sozinho assim que a internet voltar. O app tenta a cada 20 segundos.'
          }
        />

        {numeroSms && !online && (
          <Degrau
            como="a"
            href={linkSms(numeroSms, mensagem)}
            ativo
            icone={<MessageSquareShare />}
            titulo="Mandar por SMS"
            sub="A rede de SMS alcança onde os dados já morreram. Abre suas mensagens com o texto e a localização prontos — você só confirma o envio."
            acao="Abrir mensagem pronta"
          />
        )}

        {telefone && (
          <Degrau
            como="a"
            href={telefone}
            ativo={!online}
            icone={<PhoneCall />}
            titulo="Ligar para a Tecnoar"
            sub="Emergência 24 horas. A voz passa com sinal fraco demais para qualquer dado."
            acao="Ligar agora"
          />
        )}

        {satelite && !online && (
          <Degrau
            icone={<Satellite />}
            titulo="Se não houver rede nenhuma"
            sub="Seu celular pode ter mensagem por satélite. Mande o SMS acima: quem fala com o satélite é o aplicativo de mensagens do próprio aparelho, e ele segue as instruções na tela para você apontar o céu."
          />
        )}
      </div>

      <div className="mt-4 flex flex-col items-center gap-1">
        {expirou && (
          <button
            type="button"
            onClick={aoEnviar}
            disabled={!online}
            className="ini-ligar disabled:opacity-45"
          >
            <RefreshCw className="size-[18px]" strokeWidth={2} />
            {online ? 'Tentar enviar agora' : 'Sem internet para enviar'}
          </button>
        )}
        <button type="button" onClick={aoDescartar} className="flex min-h-11 items-center gap-1.5 text-[13.5px] font-semibold text-ink-3">
          <Trash2 className="size-4" /> Não preciso mais
        </button>
      </div>
    </section>
  )
}

/** Um degrau da corrente. Vira link quando leva o usuário para fora do app. */
function Degrau({
  como = 'div',
  href,
  ativo,
  pulsa,
  icone,
  titulo,
  sub,
  acao,
}: {
  como?: 'div' | 'a'
  href?: string
  ativo?: boolean
  pulsa?: boolean
  icone: ReactNode
  titulo: string
  sub: string
  acao?: string
}) {
  const miolo = (
    <>
      <span aria-hidden className="sin-no">
        {pulsa && <span className="sin-pulso" />}
        {icone}
      </span>
      <span className="min-w-0 flex-1">
        <span className="sin-titulo block">{titulo}</span>
        <span className="sin-sub block">{sub}</span>
        {acao && <span className="sin-acao block">{acao}</span>}
      </span>
    </>
  )
  const classe = cn('sin-degrau', ativo && 'sin-degrau-ativo')
  if (como === 'a' && href) {
    return (
      <a href={href} className={classe}>
        {miolo}
      </a>
    )
  }
  return <div className={classe}>{miolo}</div>
}
