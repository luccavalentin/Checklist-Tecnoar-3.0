import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { corrigirPorPosicao, normalizarPlaca, placaValida } from './placa'

/**
 * Camada de reconhecimento de placa e do documento do veículo.
 *
 * A tela nunca fala com um provedor específico: ela pede uma leitura e recebe
 * campos com um grau de confiança. Trocar de provedor — a Tecnoar IA, Plate
 * Recognizer, Google Vision, AWS Rekognition, Azure AI Vision — é trocar a
 * implementação aqui, sem tocar em nenhuma tela.
 *
 * Regra que não muda: a chave do provedor fica no servidor, numa função de
 * borda. O navegador manda a imagem e recebe os campos; nunca vê credencial.
 * E nada é gravado sem uma pessoa confirmar.
 */

/** O que uma foto de CRLV consegue preencher. Ilegível é sempre `null`. */
export interface CamposVeiculoLidos {
  placa: string | null
  marca: string | null
  modelo: string | null
  ano: string | null
  cor: string | null
  renavam: string | null
  chassi: string | null
  municipio: string | null
  uf: string | null
}

export interface ProprietarioLido {
  nome: string | null
  documento: string | null
}

export const CAMPOS_VAZIOS: CamposVeiculoLidos = {
  placa: null, marca: null, modelo: null, ano: null, cor: null,
  renavam: null, chassi: null, municipio: null, uf: null,
}

export type ResultadoLeitura =
  | { estado: 'indisponivel'; motivo: string }
  | { estado: 'sem_leitura'; motivo: string }
  | {
      estado: 'lida'
      /** `placa`: foto do veículo. `crlv`: foto do documento, com mais campos. */
      tipo: 'placa' | 'crlv'
      placa: string
      campos: CamposVeiculoLidos
      proprietario: ProprietarioLido
      confianca: number
      provedor: string
    }

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
      return {
        estado: 'lida',
        tipo: 'placa',
        placa: corrigida,
        campos: { ...CAMPOS_VAZIOS, placa: corrigida },
        proprietario: { nome: null, documento: null },
        confianca: 0.86,
        provedor: 'mock-local',
      }
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
 * A função de borda é quem guarda a chave e fala com o serviço de leitura. Se
 * ela não estiver publicada, a chamada falha e caímos no manual — sem travar
 * nada: a digitação continua ali, e a busca do veículo funciona igual.
 */
export function provedorBorda(): ProvedorPlaca {
  return {
    nome: 'Tecnoar IA',
    disponivel: true,
    ler: async (imagem) => {
      const base64 = await paraBase64(imagem)
      const { data, error } = await supabase.functions.invoke<{
        tipo?: 'placa' | 'crlv'
        campos?: Partial<CamposVeiculoLidos>
        proprietario?: Partial<ProprietarioLido>
        confianca?: number
        provedor?: string
        erro?: string
      }>('placa', { body: { imagem: base64, mime: imagem.type || 'image/jpeg' } })

      if (error) {
        return {
          estado: 'indisponivel',
          motivo: 'O serviço de leitura não respondeu. Digite a placa.',
        }
      }
      if (data?.erro) {
        return { estado: 'sem_leitura', motivo: data.erro }
      }

      const campos = { ...CAMPOS_VAZIOS, ...(data?.campos ?? {}) }
      const placa = campos.placa ? corrigirPorPosicao(campos.placa) : ''
      if (!placaValida(placa)) {
        /* O documento pode ter vindo legível com a placa borrada. Os campos não
           se perdem: quem digita a placa é o operador, e o resto já está lido. */
        return {
          estado: 'sem_leitura',
          motivo: 'Não consegui ler a placa nesta foto. Digite a placa para seguir.',
        }
      }

      return {
        estado: 'lida',
        tipo: data?.tipo === 'crlv' ? 'crlv' : 'placa',
        placa,
        campos: { ...campos, placa },
        proprietario: {
          nome: data?.proprietario?.nome ?? null,
          documento: data?.proprietario?.documento ?? null,
        },
        confianca: typeof data?.confianca === 'number' ? data.confianca : 0,
        provedor: data?.provedor ?? 'externo',
      }
    },
  }
}

/**
 * Em produção vale o servidor; o mock é só para desenvolver sem gastar
 * chamada de IA (`VITE_PLACA_PROVIDER=mock`). O padrão precisa ser o que
 * funciona de verdade: esquecer uma variável não pode virar leitura falsa.
 */
export function provedorPadrao(): ProvedorPlaca {
  return import.meta.env.VITE_PLACA_PROVIDER === 'mock' ? provedorMock : provedorBorda()
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
  /** Acha o cliente pelo CPF/CNPJ lido no documento. Null quando não existe. */
  buscarClientePorDocumento: (documento: string) => Promise<ClienteEncontrado | null>
}

export interface ClienteEncontrado {
  id: string
  nome_razao: string
  documento: string | null
  situacao: 'ativo' | 'inativo'
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

  const buscarClientePorDocumento = useCallback(async (documento: string): Promise<ClienteEncontrado | null> => {
    const digitos = (documento ?? '').replace(/\D/g, '')
    if (digitos.length !== 11 && digitos.length !== 14) return null

    /* Sem filtrar por situação de propósito: o documento é único na base, e
       dizer "inativo" é melhor do que mandar cadastrar de novo e esbarrar na
       chave única. */
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nome_razao, documento, situacao')
      .eq('documento_digitos', digitos)
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return (data as ClienteEncontrado | null) ?? null
  }, [])

  const valor = useMemo<Contexto>(
    () => ({ provedor, ler: provedor.ler, buscarPorPlaca, buscarClientePorDocumento }),
    [provedor, buscarPorPlaca, buscarClientePorDocumento],
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
