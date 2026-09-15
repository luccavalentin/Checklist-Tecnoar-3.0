import { useEffect, useState } from 'react'
import { Info, ListChecks, MessageSquarePlus, PhoneCall, RotateCcw, Brain, WifiOff } from 'lucide-react'
import { linkTelefone } from '@/sos/rotulos'
import { useCliente } from '../sessao'
import { Esqueleto, Faixa } from '../comum/ui'
import { useOnline } from '../comum/Pwa'
import { chaveConversaIA, useIaPublico, useInfoPublica } from './dados'
import { ChatIA, type MotivoGuia } from './tecnoIA/ChatIA'
import { GuiaRapido } from './tecnoIA/GuiaRapido'
import { MolduraIA, type OpcaoMenuIA } from './tecnoIA/pecasIA'

type Modo = 'ia' | 'guia'
const CHAVE_MODO = 'sos.tecnoia.modo'

function lerModo(): Modo | null {
  try {
    const v = sessionStorage.getItem(CHAVE_MODO)
    return v === 'ia' || v === 'guia' ? v : null
  } catch {
    return null
  }
}

function gravarModo(m: Modo) {
  try {
    sessionStorage.setItem(CHAVE_MODO, m)
  } catch {
    /* sem armazenamento */
  }
}

/**
 * TECNO IA — triagem do problema antes de pedir ajuda, em tela cheia com o
 * SOS sempre no topo.
 *
 * Dois modos:
 * - conversa com a IA de verdade (quando a Tecnoar liga o atendimento pela IA
 *   em `sos_ia_publico`): texto livre, foto, sugestões que viram SOS ou
 *   agendamento;
 * - guia rápido: a árvore de perguntas do aparelho, que funciona sem sinal.
 *
 * A escolha é feita uma vez ao abrir (IA se disponível; sem rede ou com a IA
 * fora, o guia) e depois só muda quando a pessoa pede — ou quando a IA sai do
 * ar no meio da conversa. Uma queda de sinal não arranca ninguém do meio de
 * uma conversa nem do meio do guia.
 */
export function TecnoIA() {
  const { usuarioId } = useCliente()
  const online = useOnline()
  const ia = useIaPublico()
  const info = useInfoPublica()
  const [escolha, setEscolha] = useState<Modo | null>(lerModo)
  const [motivo, setMotivo] = useState<MotivoGuia | null>(null)
  const [chat, setChat] = useState({ pensando: false, total: 0 })
  const [versaoChat, setVersaoChat] = useState(0)
  const [versaoGuia, setVersaoGuia] = useState(0)

  const iaLigada = !!ia.data?.ativa && !!ia.data?.atendimento

  // Primeira decisão, automática (não fica gravada: na próxima abertura, com
  // sinal, a IA volta a ser o padrão).
  useEffect(() => {
    if (escolha) return
    if (!online) {
      setEscolha('guia')
      setMotivo('offline')
    } else if (ia.isSuccess) {
      setEscolha(iaLigada ? 'ia' : 'guia')
    } else if (ia.isError) {
      setEscolha('guia')
      setMotivo('erro')
    }
  }, [escolha, online, ia.isSuccess, ia.isError, iaLigada])

  function mudar(m: Modo, porque: MotivoGuia | null = null) {
    setEscolha(m)
    setMotivo(porque)
    gravarModo(m)
    window.scrollTo({ top: 0 })
  }

  function novaConversa() {
    try {
      sessionStorage.removeItem(chaveConversaIA(usuarioId))
    } catch {
      /* sem armazenamento */
    }
    setVersaoChat((v) => v + 1)
    window.scrollTo({ top: 0 })
  }

  // A IA foi desligada na central enquanto a escolha era "IA": guia.
  const modo: Modo | null = escolha === 'ia' && ia.isSuccess && !iaLigada ? 'guia' : escolha
  const tel = linkTelefone(info.data?.telefone)
  const ligar: OpcaoMenuIA = { rotulo: 'Ligar para a Tecnoar', descricao: 'Fale com um mecânico da central', icone: PhoneCall, href: tel, desativada: !tel }

  const opcoes: OpcaoMenuIA[] =
    modo === 'ia'
      ? [
          {
            rotulo: 'Nova conversa',
            descricao: 'Apaga esta conversa da tela e começa do zero',
            icone: MessageSquarePlus,
            aoEscolher: novaConversa,
            desativada: chat.total === 0 || chat.pensando,
          },
          { rotulo: 'Guia rápido sem internet', descricao: 'Perguntas de um toque, funciona no aparelho', icone: ListChecks, aoEscolher: () => mudar('guia') },
          ligar,
        ]
      : [
          ...(iaLigada
            ? [
                {
                  rotulo: 'Conversar com a Tecno IA',
                  descricao: online ? 'Descreva com suas palavras e mande foto' : 'Precisa de internet',
                  icone: Brain,
                  aoEscolher: () => mudar('ia'),
                  desativada: !online,
                },
              ]
            : []),
          { rotulo: 'Recomeçar o guia', icone: RotateCcw, aoEscolher: () => setVersaoGuia((v) => v + 1) },
          ligar,
        ]

  return (
    <MolduraIA
      subtitulo={modo === 'guia' ? 'Guia rápido · funciona sem internet' : 'Mecânica virtual da Tecnoar'}
      pensando={modo === 'ia' && chat.pensando}
      opcoes={opcoes}
    >
      {!modo ? (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 pt-4" aria-busy="true" aria-label="Abrindo a Tecno IA">
          <Esqueleto className="h-20" />
          <Esqueleto className="h-14 w-4/5" />
          <Esqueleto className="h-14 w-3/5" />
        </div>
      ) : modo === 'ia' ? (
        <ChatIA key={versaoChat} aoUsarGuia={(m) => mudar('guia', m)} aoEstado={setChat} />
      ) : (
        <GuiaRapido
          key={versaoGuia}
          aviso={<AvisoGuia motivo={motivo} iaConhecida={iaLigada || !ia.data} />}
          aoConversarIA={iaLigada && online && motivo !== 'limite' ? () => mudar('ia') : undefined}
        />
      )}
    </MolduraIA>
  )
}

function AvisoGuia({ motivo, iaConhecida }: { motivo: MotivoGuia | null; iaConhecida: boolean }) {
  if (!motivo || !iaConhecida) return null
  if (motivo === 'offline')
    return (
      <Faixa tom="atencao" icone={WifiOff}>
        Sem internet agora. Este guia rápido funciona no aparelho; a conversa com a IA volta quando o sinal voltar.
      </Faixa>
    )
  return (
    <Faixa tom="info" icone={Info}>
      {motivo === 'desligada'
        ? 'A conversa com a IA está indisponível agora. O guia rápido responde na hora, até sem internet.'
        : motivo === 'limite'
          ? 'Você usou o limite de conversas com a IA de hoje. O guia rápido continua disponível, sem limite.'
          : 'Não conseguimos falar com a IA agora. O guia rápido funciona no aparelho.'}
    </Faixa>
  )
}
