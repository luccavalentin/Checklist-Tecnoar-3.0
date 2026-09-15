import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { sosAbrirChamado } from '@/sos/api'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { ChamadoSOS, NovoChamado } from '@/sos/tipos'
import { useOnline } from '../comum/Pwa'

/**
 * Modo conexão ruim do pedido de socorro.
 *
 * Na estrada o sinal cai. Se a pessoa confirma o SOS sem internet, o pedido
 * (com as coordenadas do GPS, que funcionam sem dados) fica guardado neste
 * aparelho e sai sozinho assim que a conexão volta — sem ela precisar lembrar
 * de tentar de novo. O banco já devolve o SOS aberto se houver um em
 * andamento (`ja_existia`), então reenviar nunca duplica o chamado.
 *
 * Fotos e áudios não entram na fila (não cabem no armazenamento do
 * navegador); a pessoa manda depois, pela tela do chamado.
 */

export interface PedidoPendente {
  pedido: NovoChamado
  guardadoEm: string
  /** O que mostrar na tela enquanto espera o sinal. */
  resumo: { veiculo: string | null; placa: string | null; problema: string; endereco: string | null }
}

/** Depois disso o pedido não sai sozinho: a pessoa confirma se ainda precisa. */
const VALIDADE_AUTOMATICA_MS = 2 * 60 * 60_000

const chave = (usuarioId: string | null) => `sos.pedido-pendente.${usuarioId ?? 'sem-usuario'}`

const ouvintes = new Set<() => void>()
function avisar() {
  ouvintes.forEach((f) => f())
}

// useSyncExternalStore exige o mesmo objeto enquanto nada mudou: guardamos o
// texto lido junto com o objeto e só refazemos quando o armazenamento muda.
const cache = new Map<string, { bruto: string | null; valor: PedidoPendente | null }>()

export function lerPendente(usuarioId: string | null): PedidoPendente | null {
  const k = chave(usuarioId)
  let bruto: string | null = null
  try {
    bruto = localStorage.getItem(k)
  } catch {
    bruto = null
  }
  const anterior = cache.get(k)
  if (anterior && anterior.bruto === bruto) return anterior.valor
  let valor: PedidoPendente | null = null
  try {
    if (bruto) {
      const j = JSON.parse(bruto) as PedidoPendente
      if (j?.pedido?.tipo_ocorrencia && j.guardadoEm) valor = j
    }
  } catch {
    valor = null
  }
  cache.set(k, { bruto, valor })
  return valor
}

export function guardarPendente(usuarioId: string | null, p: PedidoPendente) {
  try {
    localStorage.setItem(chave(usuarioId), JSON.stringify(p))
  } catch {
    /* sem armazenamento: o aviso na tela continua mostrando as coordenadas */
  }
  avisar()
}

export function descartarPendente(usuarioId: string | null) {
  try {
    localStorage.removeItem(chave(usuarioId))
  } catch {
    /* nada a apagar */
  }
  avisar()
}

export function usePedidoPendente(usuarioId: string | null): PedidoPendente | null {
  return useSyncExternalStore(
    (f) => {
      ouvintes.add(f)
      const aoArmazenar = (e: StorageEvent) => e.key === chave(usuarioId) && avisar()
      window.addEventListener('storage', aoArmazenar)
      return () => {
        ouvintes.delete(f)
        window.removeEventListener('storage', aoArmazenar)
      }
    },
    () => lerPendente(usuarioId),
    () => null,
  )
}

export function pendenteExpirou(p: PedidoPendente, agora = Date.now()): boolean {
  return agora - Date.parse(p.guardadoEm) > VALIDADE_AUTOMATICA_MS
}

/** Um envio por vez no aparelho inteiro, mesmo com duas telas ouvindo. */
let enviandoAgora = false

/**
 * Envia o pedido guardado quando há conexão. `aoEnviar` recebe o chamado
 * aberto (normalmente para levar a pessoa ao acompanhamento).
 */
export function useEnvioPendenteSOS(usuarioId: string | null, aoEnviar?: (c: ChamadoSOS) => void) {
  const qc = useQueryClient()
  const online = useOnline()
  const pendente = usePedidoPendente(usuarioId)
  const retorno = useRef(aoEnviar)
  retorno.current = aoEnviar

  const enviar = useCallback(
    async (forcar = false): Promise<ChamadoSOS | null> => {
      const p = lerPendente(usuarioId)
      if (!p || enviandoAgora || !navigator.onLine) return null
      if (!forcar && pendenteExpirou(p)) return null
      enviandoAgora = true
      try {
        const hora = new Date(p.guardadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        const nota = `[Pedido feito sem sinal às ${hora}; enviado quando a conexão voltou.]`
        const descricao = [p.pedido.descricao?.trim(), nota].filter(Boolean).join('\n').slice(0, 800)
        const chamado = await sosAbrirChamado({ ...p.pedido, descricao })
        descartarPendente(usuarioId)
        void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeCliente })
        void qc.invalidateQueries({ queryKey: CHAVES_SOS.meusChamados })
        retorno.current?.(chamado)
        return chamado
      } catch {
        // Continua guardado: tenta de novo na próxima volta do sinal.
        return null
      } finally {
        enviandoAgora = false
      }
    },
    [usuarioId, qc],
  )

  // Sinal voltou (ou a tela abriu já com sinal): tenta na hora e, enquanto
  // houver pendência, de novo a cada 20 s — rede de estrada oscila.
  useEffect(() => {
    if (!online || !pendente) return
    void enviar()
    const t = window.setInterval(() => void enviar(), 20_000)
    return () => window.clearInterval(t)
  }, [online, pendente, enviar])

  return { pendente, enviarAgora: () => enviar(true), descartar: () => descartarPendente(usuarioId) }
}
