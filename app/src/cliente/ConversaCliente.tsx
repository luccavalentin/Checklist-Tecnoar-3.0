import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { sosDetalhe } from '@/sos/api'
import { MENSAGENS_RAPIDAS_CLIENTE, STATUS_ENCERRADOS } from '@/sos/rotulos'
import { CHAVES_SOS, useTempoRealChamado } from '@/sos/tempoReal'
import { TelaConversa } from '@/sos/conversa/TelaConversa'
import { useCliente } from '../sessao'
import { iconesConversa3D } from '../comum/IconesConversa3D'
import { LogoSOS } from '../comum/ui'

/**
 * A conversa do motorista com o especialista, em rota própria.
 *
 * Em rota PRÓPRIA de propósito. Enquanto era um bloco dentro do
 * acompanhamento, escrever uma linha exigia rolar o mapa, o orçamento e a
 * linha do tempo — e a cada mensagem nova, rolar de novo. Com rota, o botão
 * de voltar do aparelho faz o que a pessoa espera, a notificação pode abrir
 * direto aqui, e o campo de escrever fica onde o polegar alcança.
 */
export function ConversaCliente() {
  const { id = '' } = useParams()
  const navegar = useNavigate()
  const { usuarioId } = useCliente()
  useTempoRealChamado(id)

  const detalhe = useQuery({
    queryKey: CHAVES_SOS.detalhe(id),
    queryFn: () => sosDetalhe(id),
    enabled: !!id,
  })

  const d = detalhe.data
  const mecanico = d?.mecanico?.nome?.trim()

  return (
    <TelaConversa
      chamadoId={id}
      icones={iconesConversa3D()}
      marca={<LogoSOS negativo altura={24} />}
      mensagens={d?.mensagens ?? []}
      meuId={usuarioId}
      /* Antes de alguém aceitar, quem responde é a central — e dizer
         "Especialista" nessa hora prometeria uma pessoa que ainda não existe. */
      tituloOutro={mecanico || 'Central Tecnoar'}
      rapidas={MENSAGENS_RAPIDAS_CLIENTE}
      encerrado={!!d && STATUS_ENCERRADOS.includes(d.chamado.status)}
      aoVoltar={() => navegar(`/chamado/${id}`)}
    />
  )
}
