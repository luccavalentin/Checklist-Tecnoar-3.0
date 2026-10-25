import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { dbSOS } from './api'
import { supabase } from '@/lib/supabase'
import type { MensagemSOS } from './tipos'
import type { TransporteConversa } from './conversa/TelaConversa'

export const CHAVE_CHAT_EQUIPE = ['sos', 'chat-equipe'] as const
const bucket = 'tecnoar-chat'
export interface ConversaEquipe { id: string; usuario_id: string; nome: string; atualizado_em: string }
async function rpc<T>(nome: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await dbSOS.rpc(nome, args)
  if (error) {
    if (/PGRST202|42P01/.test(error.code ?? '')) throw new Error('O canal de atendimento ainda não foi ativado no servidor. Use Ligar ou WhatsApp enquanto isso.')
    throw new Error(error.message)
  }
  return data as T
}
export function useConversasEquipe() {
  const qc = useQueryClient()
  useEffect(() => {
    const c = supabase.channel('chat-equipe-inbox').on('postgres_changes', { event: '*', schema: 'public', table: 'tecnoar_conversas' }, () => void qc.invalidateQueries({ queryKey: CHAVE_CHAT_EQUIPE })).subscribe()
    return () => { void supabase.removeChannel(c) }
  }, [qc])
  return useQuery({ queryKey: [...CHAVE_CHAT_EQUIPE, 'lista'], refetchInterval: 15000, queryFn: async () => {
    const { data, error } = await dbSOS.from('tecnoar_conversas').select('id,usuario_id,nome,atualizado_em').order('atualizado_em', { ascending: false }).limit(100)
    if (error) throw new Error(error.message)
    return data as ConversaEquipe[]
  } })
}
export function useAbrirChatEquipe(usuarioId: string | null | undefined) {
  return useQuery({ queryKey: [...CHAVE_CHAT_EQUIPE, 'abrir', usuarioId], enabled: !!usuarioId, retry: false, staleTime: Infinity, queryFn: () => rpc<string>('tecnoar_chat_abrir') })
}
export function useMensagensEquipe(id?: string | null) {
  const [limite, setLimite] = useState(100)
  const qc = useQueryClient()
  useEffect(() => {
    if (!id) return
    const c = supabase.channel(`chat-equipe-msg-${id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'tecnoar_chat_mensagens', filter: `conversa_id=eq.${id}` }, () => void qc.invalidateQueries({ queryKey: [...CHAVE_CHAT_EQUIPE, id] })).subscribe()
    return () => { void supabase.removeChannel(c) }
  }, [id, qc])
  const query = useQuery({ queryKey: [...CHAVE_CHAT_EQUIPE, id, limite], enabled: !!id, refetchInterval: 10000, queryFn: async () => {
    const { data, error } = await dbSOS.from('tecnoar_chat_mensagens').select('*').eq('conversa_id', id!).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limite)
    if (error) throw new Error(error.message)
    return (data as Array<MensagemSOS & { conversa_id: string }>).reverse().map(m => ({ ...m, chamado_id: m.conversa_id, rapida: false }))
  } })
  return { ...query, temAnteriores: query.data?.length === limite, carregarMais: () => setLimite(v => v + 100) }
}

export function transporteEquipe(id: string, usuarioId: string): TransporteConversa {
  return {
    sala: `tecnoar:chat:${id}`, privada: true, chave: [...CHAVE_CHAT_EQUIPE, id],
    ler: () => rpc<void>('tecnoar_chat_ler', { p_conversa: id }),
    apagar: mensagemId => rpc<void>('tecnoar_chat_apagar', { p_mensagem: mensagemId }),
    urls: async caminhos => {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls(caminhos, 3600)
      if (error) throw error
      return Object.fromEntries((data ?? []).filter(d => d.path && d.signedUrl).map(d => [d.path!, d.signedUrl!]))
    },
    enviar: async p => {
      let caminho: string | null = null
      let tipo: string | null = null
      if (p.blob) {
        if (p.blob.size > 25 * 1024 * 1024) throw new Error('O limite por arquivo é 25 MB.')
        tipo = p.blob.type.split(';')[0]
        if (!/^(image\/(jpeg|png|webp|heic)|audio\/(webm|ogg|mp4|mpeg|wav)|video\/(mp4|webm)|application\/pdf|text\/plain)$/.test(tipo)) throw new Error('Envie foto, áudio, vídeo MP4/WebM, PDF ou texto.')
        caminho = `${id}/${usuarioId}/${crypto.randomUUID()}`
        const { error } = await supabase.storage.from(bucket).upload(caminho, p.blob, { contentType: tipo, upsert: false })
        if (error) throw error
      }
      return rpc<string>('tecnoar_chat_enviar', { p_conversa: id, p_id: crypto.randomUUID(), p_texto: p.texto ?? null, p_caminho: caminho, p_tipo: tipo, p_responde: p.respondeA ?? null, p_duracao: p.duracao ?? null, p_lat: p.lat ?? null, p_lng: p.lng ?? null })
    },
  }
}
