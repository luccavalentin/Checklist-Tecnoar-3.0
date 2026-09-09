/**
 * Fila de envios pendentes.
 *
 * A oficina tem ponto morto de sinal. Uma foto tirada embaixo do caminhão não
 * pode se perder porque o 4G caiu — mas também não pode aparecer como salva
 * quando ainda está no celular. Por isso a fila guarda o arquivo em IndexedDB
 * (localStorage não aceita binário) e a interface mostra o item como
 * *pendente* até o servidor confirmar.
 *
 * Reenvio acontece quando a conexão volta, quando o app reabre e quando o
 * operador manda tentar de novo. Nunca em silêncio: a contagem fica visível.
 */

import { supabase } from '@/lib/supabase'

const BANCO = 'tecnoar-envios'
const LOJA = 'pendentes'
const VERSAO = 1

export interface EnvioPendente {
  id: string
  /** Caminho de destino no bucket. */
  caminho: string
  arquivo: Blob
  nomeArquivo: string
  tipoMime: string
  tamanho: number
  /** Linha a gravar em `evidencias` depois que o arquivo subir. */
  registro: Record<string, unknown>
  tentativas: number
  ultimoErro: string | null
  criadoEm: number
}

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolver, rejeitar) => {
    const req = indexedDB.open(BANCO, VERSAO)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(LOJA)) db.createObjectStore(LOJA, { keyPath: 'id' })
    }
    req.onsuccess = () => resolver(req.result)
    req.onerror = () => rejeitar(req.error ?? new Error('Não foi possível abrir a fila de envios.'))
  })
}

async function comLoja<T>(modo: IDBTransactionMode, fn: (loja: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await abrir()
  return new Promise<T>((resolver, rejeitar) => {
    const tx = db.transaction(LOJA, modo)
    const req = fn(tx.objectStore(LOJA))
    req.onsuccess = () => resolver(req.result)
    req.onerror = () => rejeitar(req.error ?? new Error('Falha na fila de envios.'))
    tx.oncomplete = () => db.close()
  })
}

export async function enfileirar(
  item: Omit<EnvioPendente, 'id' | 'tentativas' | 'ultimoErro' | 'criadoEm'>,
): Promise<EnvioPendente> {
  const completo: EnvioPendente = {
    ...item,
    id: crypto.randomUUID(),
    tentativas: 0,
    ultimoErro: null,
    criadoEm: Date.now(),
  }
  await comLoja('readwrite', (l) => l.put(completo))
  avisar()
  return completo
}

export async function listarPendentes(): Promise<EnvioPendente[]> {
  const todos = await comLoja<EnvioPendente[]>('readonly', (l) => l.getAll() as IDBRequest<EnvioPendente[]>)
  return todos.sort((a, b) => a.criadoEm - b.criadoEm)
}

export async function removerPendente(id: string): Promise<void> {
  await comLoja('readwrite', (l) => l.delete(id) as unknown as IDBRequest<undefined>)
  avisar()
}

/**
 * Tenta subir tudo que está na fila.
 *
 * Devolve quantos subiram e quantos continuam presos. Um item só sai da fila
 * quando o arquivo E a linha da tabela estão gravados — meio caminho é
 * tratado como falha e volta para a próxima tentativa.
 */
export async function processarFila(): Promise<{ enviados: number; restantes: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const presos = await listarPendentes()
    return { enviados: 0, restantes: presos.length }
  }

  const fila = await listarPendentes()
  let enviados = 0

  for (const item of fila) {
    try {
      const { error: erroUp } = await supabase.storage
        .from('evidencias')
        .upload(item.caminho, item.arquivo, { contentType: item.tipoMime, upsert: true })
      if (erroUp) throw erroUp

      const { error } = await supabase.from('evidencias').insert(item.registro as never)
      if (error) {
        /* Arquivo subiu mas o registro falhou: desfaz para não deixar órfão. */
        await supabase.storage.from('evidencias').remove([item.caminho])
        throw error
      }

      await removerPendente(item.id)
      enviados++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await comLoja('readwrite', (l) =>
        l.put({ ...item, tentativas: item.tentativas + 1, ultimoErro: msg }),
      )
    }
  }

  const restantes = (await listarPendentes()).length
  avisar()
  return { enviados, restantes }
}

/* -------------------------------------------------- aviso para a interface */

const EVENTO = 'tecnoar:fila-envios'

function avisar() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO))
}

export function observarFila(aoMudar: () => void): () => void {
  window.addEventListener(EVENTO, aoMudar)
  return () => window.removeEventListener(EVENTO, aoMudar)
}

export const EVENTO_FILA = EVENTO
