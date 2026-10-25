import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * "Digitando…" e "online" — sem tocar no banco.
 *
 * POR QUE NÃO É UMA TABELA
 *
 * Foi a primeira ideia e é a errada. Gravar "fulano está digitando" seria uma
 * escrita no Postgres a cada tecla, para um dado que vale dois segundos e não
 * tem valor nenhum depois — amplificação de escrita absurda, e ainda deixaria
 * lixo acumulando numa tabela que ninguém limpa. O mesmo vale para "online":
 * é estado de CONEXÃO, e quando o aparelho perde o sinal no meio da estrada
 * ninguém volta para marcar a linha como offline. A tabela mentiria.
 *
 * O Realtime do Supabase tem as duas ferramentas certas:
 *
 *   · BROADCAST para "digitando": mensagem efêmera, não persiste, não entra
 *     no banco. Se ninguém está ouvindo, some — que é exatamente o
 *     comportamento desejado.
 *   · PRESENCE para "online": o servidor mantém quem está no canal e avisa
 *     quando alguém entra ou sai, INCLUSIVE quando a conexão cai sozinha.
 *     É a única forma honesta de dizer "ele está na conversa agora".
 *
 * O "visto por último" guardado localmente é só um consolo: quando o outro
 * some, a tela lembra da última vez que ele esteve presente NESTA sessão. Não
 * inventamos um histórico que não temos.
 */

/** Depois disso sem receber tecla, o "digitando" apaga sozinho. */
const SILENCIO_MS = 2600

/** Não dispara broadcast a cada tecla: uma vez a cada tanto já basta. */
const INTERVALO_AVISO_MS = 1800

export interface Presenca {
  /** O outro lado está com a conversa aberta agora. */
  online: boolean
  /** O outro lado está digitando neste instante. */
  digitando: boolean
  /** Última vez que vimos o outro online nesta sessão, se ele já saiu. */
  vistoEm: Date | null
  /** Avisa que EU estou digitando. Pode ser chamado a cada tecla. */
  avisarDigitando: () => void
  /** Apaga o meu "digitando" na hora (mandei a mensagem, ou desisti). */
  pararDigitando: () => void
}

export function usePresencaConversa(chamadoId: string | null, meuId: string | null | undefined, sala?: string, privada = false): Presenca {
  const [online, setOnline] = useState(false)
  const [digitando, setDigitando] = useState(false)
  const [vistoEm, setVistoEm] = useState<Date | null>(null)

  const canal = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const ultimoAviso = useRef(0)
  const apagarDigitando = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!chamadoId || !meuId) return
    const c = supabase.channel(sala ?? `sos:conversa:${chamadoId}`, { config: { private: privada, presence: { key: meuId } } })

    function recontar() {
      const estado = c.presenceState() as Record<string, unknown[]>
      // "Online" é o OUTRO lado, não eu: eu sempre estou aqui.
      const outros = Object.keys(estado).filter((k) => k !== meuId)
      setOnline(outros.length > 0)
      if (outros.length > 0) setVistoEm(new Date())
    }

    c.on('presence', { event: 'sync' }, recontar)
      .on('presence', { event: 'join' }, recontar)
      .on('presence', { event: 'leave' }, recontar)
      .on('broadcast', { event: 'digitando' }, ({ payload }) => {
        if ((payload as { de?: string })?.de === meuId) return
        setDigitando(true)
        window.clearTimeout(apagarDigitando.current)
        // Some sozinho: quem para de digitar raramente avisa que parou, e
        // um "digitando…" preso na tela mente mais do que não mostrar nada.
        apagarDigitando.current = window.setTimeout(() => setDigitando(false), SILENCIO_MS)
      })
      .on('broadcast', { event: 'parou' }, ({ payload }) => {
        if ((payload as { de?: string })?.de === meuId) return
        window.clearTimeout(apagarDigitando.current)
        setDigitando(false)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void c.track({ em: new Date().toISOString() })
      })

    canal.current = c
    return () => {
      window.clearTimeout(apagarDigitando.current)
      canal.current = null
      setOnline(false)
      setDigitando(false)
      void supabase.removeChannel(c)
    }
  }, [chamadoId, meuId, sala, privada])

  const avisarDigitando = useCallback(() => {
    const agora = Date.now()
    if (agora - ultimoAviso.current < INTERVALO_AVISO_MS) return
    ultimoAviso.current = agora
    void canal.current?.send({ type: 'broadcast', event: 'digitando', payload: { de: meuId } })
  }, [meuId])

  const pararDigitando = useCallback(() => {
    ultimoAviso.current = 0
    void canal.current?.send({ type: 'broadcast', event: 'parou', payload: { de: meuId } })
  }, [meuId])

  return { online, digitando, vistoEm, avisarDigitando, pararDigitando }
}
