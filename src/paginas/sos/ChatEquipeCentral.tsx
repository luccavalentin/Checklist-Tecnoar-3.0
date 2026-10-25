import { useState } from 'react'
import { MessageCircle, Search } from 'lucide-react'
import { useAuth } from '@/auth/AuthProvider'
import { useConversasEquipe, type ConversaEquipe } from '@/sos/chatEquipe'
import { ChatEquipe } from '@/sos/conversa/ChatEquipe'

export function ChatEquipeCentral() {
  const { usuario } = useAuth()
  const lista = useConversasEquipe()
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState<ConversaEquipe | null>(null)
  if (aberta && usuario) return <ChatEquipe id={aberta.id} usuarioId={usuario.id} titulo={aberta.nome} aoVoltar={() => setAberta(null)} />
  const filtradas = (lista.data ?? []).filter(c => c.nome.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')))
  return <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-5 text-ink">
    <div><h1 className="text-2xl font-bold">Chat Tecnoar</h1><p className="mt-1 text-sm text-ink-3">Canal de atendimento humano com os usuários do aplicativo.</p></div>
    <label className="flex min-h-12 items-center gap-3 rounded-xl border border-line bg-surface px-4"><Search className="size-5 text-ink-3" /><input className="min-w-0 flex-1 bg-transparent py-3 outline-none" placeholder="Buscar por nome" aria-label="Buscar conversas" value={busca} onChange={e => setBusca(e.target.value)} /></label>
    {lista.isPending && <p>Carregando conversas…</p>}
    {lista.isError && <div role="alert"><p>{lista.error.message}</p><button className="min-h-11 underline" onClick={() => void lista.refetch()}>Tentar novamente</button></div>}
    {!lista.isPending && !lista.isError && !filtradas.length && <p className="py-12 text-center text-ink-3">Nenhuma conversa encontrada.</p>}
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">{filtradas.map(c => <li key={c.id}>
      <button className="flex min-h-20 w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2" onClick={() => setAberta(c)}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-ink"><MessageCircle /></span>
        <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{c.nome}</span><span className="mt-1 block text-xs text-ink-3">Última atividade: {new Date(c.atualizado_em).toLocaleString('pt-BR')}</span></span>
        <span className="text-sm text-accent-ink">Abrir</span>
      </button>
    </li>)}</ul>
  </main>
}
