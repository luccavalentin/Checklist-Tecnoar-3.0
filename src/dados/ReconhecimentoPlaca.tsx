import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { corrigirPorPosicao, normalizarPlaca, placaValida } from './placa'

/**
 * Camada de reconhecimento de placa.
 *
 * A tela nunca fala com um provedor específico: ela pede uma leitura e recebe
 * uma sugestão com confiança. Trocar de provedor — Plate Recognizer,
 * OpenALPR/Rekor, Google Vision, AWS Rekognition/Textract, Azure AI Vision —
 * é trocar a implementação aqui, sem tocar em nenhuma tela.
 *
 * Regra que não muda: a chave do provedor fica no servidor, numa função de
 * borda. O navegador manda a imagem e recebe o texto; nunca vê credencial.
 */

export type ResultadoLeitura =
  | { estado: 'indisponivel'; motivo: string }
  | { estado: 'sem_leitura'; motivo: string }
  | { estado: 'lida'; placa: string; confianca: number; provedor: string }

export interface ProvedorPlaca {
  nome: string
  /** Falso quando não há provedor configurado — a tela avisa e segue no manual. */
  disponivel: boolean
  ler: (imagem: Blob) => Promise<ResultadoLeitura>
}

/**
 * Provedor padrão: nenhum.
 *
 * Enquanto ninguém configurar um serviço de OCR, o sistema diz isso na cara e
 * cai na digitação manual. Não existe leitura fingida — inventar uma placa
 * provável é pior do que não ler.
 */
export const provedorManual: ProvedorPlaca = {
  nome: 'Digitação manual',
  disponivel: false,
  ler: async () => ({
    estado: 'indisponivel',
    motivo: 'Nenhum serviço de leitura de placa está configurado. Digite a placa.',
  }),
}

/**
 * Provedor mock para desenvolvimento.
 *
 * Ele só sugere placa quando o nome do arquivo contém algo parecido com placa
 * brasileira. Fora isso, devolve sem leitura e mantém o operador no fluxo
 * manual. Serve para desenhar e testar a experiência sem contratar OCR.
 */
export const provedorMock: ProvedorPlaca = {
  nome: 'Mock local',
  disponivel: true,
  ler: async (imagem) => {
    const nome = imagem instanceof File ? imagem.name : ''
    const candidata = nome.match(/[a-zA-Z]{3}[-_ ]?[0-9][a-zA-Z0-9][0-9]{2}/)?.[0] ?? ''
    const corrigida = corrigirPorPosicao(candidata)

    if (placaValida(corrigida)) {
      return { estado: 'lida', placa: corrigida, confianca: 0.86, provedor: 'mock-local' }
    }

    return {
      estado: 'sem_leitura',
      motivo: 'Não encontrei uma placa no nome da imagem. Digite ou confirme manualmente.',
    }
  },
}

/**
 * Provedor que chama a função de borda `placa`.
 *
 * A função de borda é quem guarda a chave e fala com o serviço externo. Se ela
 * não estiver publicada, a chamada falha e caímos no manual — sem travar nada.
 */
export function provedorBorda(): ProvedorPlaca {
  return {
    nome: 'Servidor Tecnoar',
    disponivel: true,
    ler: async (imagem) => {
      const base64 = await paraBase64(imagem)
      const { data, error } = await supabase.functions.invoke<{
        placa?: string
        confianca?: number
        provedor?: string
        erro?: string
      }>('placa', { body: { imagem: base64 } })

      if (error) {
        return {
          estado: 'indisponivel',
          motivo: 'O serviço de leitura não respondeu. Digite a placa.',
        }
      }
      if (data?.erro || !data?.placa) {
        return {
          estado: 'sem_leitura',
          motivo: data?.erro ?? 'Não foi possível identificar a placa nesta foto.',
        }
      }

      const corrigida = corrigirPorPosicao(data.placa)
      return {
        estado: 'lida',
        placa: corrigida,
        confianca: typeof data.confianca === 'number' ? data.confianca : 0,
        provedor: data.provedor ?? 'externo',
      }
    },
  }
}

export function provedorPadrao(): ProvedorPlaca {
  return import.meta.env.VITE_PLACA_PROVIDER === 'edge' ? provedorBorda() : provedorMock
}

async function paraBase64(b: Blob): Promise<string> {
  const buffer = new Uint8Array(await b.arrayBuffer())
  let bin = ''
  const passo = 0x8000
  for (let i = 0; i < buffer.length; i += passo) {
    bin += String.fromCharCode(...buffer.subarray(i, i + passo))
  }
  return btoa(bin)
}

/* ------------------------------------------------------------- contexto */

interface Contexto {
  provedor: ProvedorPlaca
  ler: (imagem: Blob) => Promise<ResultadoLeitura>
  /** Busca veículo, cliente e OS aberta pela placa normalizada. */
  buscarPorPlaca: (placa: string) => Promise<VeiculoEncontrado | null>
}

export interface VeiculoEncontrado {
  id: string
  placa: string
  descricao: string | null
  tipo: string | null
  cliente: { id: string; nome_razao: string; celular: string | null } | null
  osAberta: { id: string; numero: number; status: string | null } | null
}

const ContextoPlaca = createContext<Contexto | null>(null)

export function ReconhecimentoPlacaProvider({
  children,
  provedor = provedorManual,
}: {
  children: ReactNode
  provedor?: ProvedorPlaca
}) {
  const buscarPorPlaca = useCallback(async (placa: string): Promise<VeiculoEncontrado | null> => {
    const normalizada = normalizarPlaca(placa)
    if (!normalizada) return null

    const { data, error } = await supabase
      .from('veiculos')
      .select('id, placa, descricao, tipo, cliente:clientes ( id, nome_razao, celular )')
      .eq('placa_normalizada', normalizada)
      .maybeSingle()
    if (error) throw error
    if (!data) return null

    const v = data as unknown as {
      id: string
      placa: string
      descricao: string | null
      tipo: string | null
      cliente: { id: string; nome_razao: string; celular: string | null } | null
    }

    /* OS ainda aberta para este veículo: evita abrir uma segunda por engano. */
    const { data: os } = await supabase
      .from('ordens_servico')
      .select('id, numero, status:status_os ( nome, categoria )')
      .eq('veiculo_id', v.id)
      .is('encerrada_em', null)
      .eq('situacao', 'ativo')
      .order('aberta_em', { ascending: false })
      .limit(1)
      .maybeSingle()

    const osTipada = os as unknown as
      | { id: string; numero: number; status: { nome: string; categoria: string } | null }
      | null

    return {
      ...v,
      osAberta:
        osTipada && osTipada.status?.categoria !== 'concluido' && osTipada.status?.categoria !== 'cancelado'
          ? { id: osTipada.id, numero: osTipada.numero, status: osTipada.status?.nome ?? null }
          : null,
    }
  }, [])

  const valor = useMemo<Contexto>(
    () => ({ provedor, ler: provedor.ler, buscarPorPlaca }),
    [provedor, buscarPorPlaca],
  )

  return <ContextoPlaca.Provider value={valor}>{children}</ContextoPlaca.Provider>
}

export function useReconhecimentoPlaca(): Contexto {
  const ctx = useContext(ContextoPlaca)
  if (!ctx) {
    throw new Error('useReconhecimentoPlaca precisa estar dentro de ReconhecimentoPlacaProvider.')
  }
  return ctx
}

export { placaValida, normalizarPlaca }
