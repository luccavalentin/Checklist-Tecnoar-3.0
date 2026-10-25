import { useMemo } from 'react'
import { TelaConversa } from './TelaConversa'
import { transporteEquipe, useMensagensEquipe } from '../chatEquipe'

/** A mesma conversa privada nas duas pontas; nenhum envio passa pela IA. */
export function ChatEquipe({ id, usuarioId, titulo, aoVoltar }: { id: string; usuarioId: string; titulo: string; aoVoltar: () => void }) {
  const mensagens = useMensagensEquipe(id)
  const transporte = useMemo(() => transporteEquipe(id, usuarioId), [id, usuarioId])
  if (mensagens.isPending || mensagens.isError) return (
    <div className="cv-tela items-center justify-center gap-4 p-6 text-center text-ink">
      <p>{mensagens.isError ? mensagens.error.message : 'Carregando conversa…'}</p>
      {mensagens.isError && <button className="min-h-11 rounded-xl bg-accent px-5 text-white" onClick={() => void mensagens.refetch()}>Tentar novamente</button>}
      <button className="min-h-11 px-4 underline" onClick={aoVoltar}>Voltar</button>
    </div>
  )
  return <TelaConversa chamadoId={id} mensagens={mensagens.data ?? []} meuId={usuarioId} tituloOutro={titulo}
    carregarAnteriores={mensagens.temAnteriores ? mensagens.carregarMais : undefined}
    aoVoltar={aoVoltar} transporte={transporte} rapidas={['Olá, preciso de ajuda.', 'Pode me passar mais informações?']}
    marca={<span className="text-[11px] font-semibold text-ink-3">Atendimento humano</span>} />
}
