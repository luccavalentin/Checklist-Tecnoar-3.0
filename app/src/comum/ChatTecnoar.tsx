import { useNavigate } from 'react-router-dom'
import { useSessao } from '../sessao'
import { useAbrirChatEquipe } from '@/sos/chatEquipe'
import { ChatEquipe } from '@/sos/conversa/ChatEquipe'

export function ChatTecnoar() {
  const { usuarioId } = useSessao()
  const navegar = useNavigate()
  const conversa = useAbrirChatEquipe(usuarioId)
  if (conversa.data && usuarioId) return <ChatEquipe id={conversa.data} usuarioId={usuarioId} titulo="Equipe Tecnoar" aoVoltar={() => navegar('/')} />
  return <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-4 p-6 text-center text-ink">
    <h1 className="text-xl font-bold">Chat com a Tecnoar</h1>
    <p>{conversa.isError ? conversa.error.message : 'Abrindo seu canal de atendimento…'}</p>
    {conversa.isError && <button className="sos-button-3d min-h-11 rounded-xl px-5" onClick={() => void conversa.refetch()}>Tentar novamente</button>}
    <button className="min-h-11 px-5 underline" onClick={() => navegar('/')}>Voltar</button>
  </main>
}
