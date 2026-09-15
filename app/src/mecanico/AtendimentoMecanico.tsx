import { useMemo } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, UserRoundX } from 'lucide-react'
import { sosDetalhe } from '@/sos/api'
import { URL_CHECKLIST } from '@/sos/endereco'
import { tocarAlerta, vibrarAlerta } from '@/sos/alerta'
import { STATUS_AGUARDANDO, STATUS_EM_CAMPO } from '@/sos/rotulos'
import { CHAVES_SOS, useTempoRealChamado } from '@/sos/tempoReal'
import { useRastreioChamado } from '@/sos/useRastreio'
import { useMecanico } from '../sessao'
import { AlertaNovoSOS, ProvedorAlertaSOS } from './AlertaNovoSOS'
import { AtendimentoEmCampo } from './EmServico'
import { aplicarFila, useFilaChamado, useProcessadorFila } from './filaOffline'
import { TelaAvisoChamado, TelaCancelado, TelaConclusao } from './FimAtendimento'
import { useTemaMecanico } from './tema'

/**
 * Tela cheia do chamado (`/chamado/:id`) — é para cá que apontam as
 * notificações. Escolhe o que mostrar pela etapa:
 *
 *   aguardando  → NOVO SOS (aceitar / recusar)
 *   a caminho   → A CAMINHO DO CLIENTE (mapa + "Cheguei ao local")
 *   no local    → ATENDIMENTO → OS, produtos, serviços, aprovação
 *   em serviço  → tarefas + cronômetro → FINALIZAR (conferência)
 *   finalizado  → conclusão com a OS
 *   cancelado   → aviso claro, com o motivo
 *
 * O rastreio (posição + tela acesa) liga só nas etapas em campo.
 */
export function AtendimentoMecanico() {
  useTemaMecanico()
  const { id } = useParams<{ id: string }>()
  if (!id) return <Navigate to="/" replace />
  // A chave zera o estado ao trocar de chamado (aceitar outro pelo alerta).
  return <Atendimento key={id} id={id} />
}

function Atendimento({ id }: { id: string }) {
  const { usuarioId } = useMecanico()
  const navegar = useNavigate()
  const qc = useQueryClient()

  useProcessadorFila(usuarioId)
  const fila = useFilaChamado(id)

  const detalhe = useQuery({
    queryKey: CHAVES_SOS.detalhe(id),
    queryFn: () => sosDetalhe(id),
    // O tempo real traz tudo na hora; o intervalo cobre o canal caído.
    refetchInterval: 20_000,
  })
  // Etapa guardada no aparelho (sem sinal) já vale na tela: o mecânico segue
  // o atendimento e a fila manda quando a internet voltar.
  const d = useMemo(() => (detalhe.data ? aplicarFila(detalhe.data, fila.acoes) : undefined), [detalhe.data, fila.acoes])
  const status = d?.chamado.status
  const meu = d?.papel === 'mecanico'
  const emCampo = !!status && meu && STATUS_EM_CAMPO.includes(status)
  const rastreio = useRastreioChamado(id, emCampo, 'mecanico')

  useTempoRealChamado(id, {
    aoChamado: (c, anterior) => {
      // Central ou cliente cancelou com o mecânico a caminho: bipe e vibração.
      if (c.status === 'cancelado' && anterior?.status !== 'cancelado') {
        tocarAlerta({ tipo: 'aviso' })
        vibrarAlerta('sos')
      }
    },
    aoMensagem: (m) => {
      if (m.autor_papel !== 'mecanico' && m.autor_id !== usuarioId) {
        tocarAlerta({ tipo: 'aviso' })
        vibrarAlerta('aviso')
      }
    },
  })

  if (detalhe.isLoading) return <CarregandoAtendimento />

  if (!d) {
    const msg = (detalhe.error as Error | null)?.message ?? 'Não foi possível abrir o chamado.'
    const semAcesso = /sem acesso/i.test(msg)
    return (
      <TelaAvisoChamado
        icone={semAcesso ? Ban : undefined}
        titulo={semAcesso ? 'Chamado indisponível' : 'Não foi possível abrir'}
        texto={semAcesso ? 'Outro mecânico já assumiu este chamado, ou ele foi encerrado.' : msg}
        aoTentar={semAcesso ? undefined : () => void detalhe.refetch()}
        tentando={detalhe.isFetching}
      />
    )
  }

  // Ainda esperando alguém: a mesma tela de aceite do alerta.
  if (d.papel === 'mecanico_candidato' || (meu && status && STATUS_AGUARDANDO.includes(status))) {
    return (
      <div className="mec mec-fundo">
        <AlertaNovoSOS
          chamadoId={id}
          posicao={rastreio.posicao}
          aoFechar={() => navegar('/', { replace: true })}
          aoAceitar={() => {
            void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(id) })
          }}
        />
      </div>
    )
  }

  if (!meu) {
    return (
      <TelaAvisoChamado
        icone={UserRoundX}
        titulo="Chamado de outro mecânico"
        texto={
          <>
            Este atendimento está com {d.mecanico?.nome ?? 'outro mecânico'}.
            {d.papel === 'central' && (
              <>
                {' '}
                Acompanhe pela central, no{' '}
                <a href={`${URL_CHECKLIST}/sos?chamado=${id}`} className="font-semibold text-accent-ink underline underline-offset-2">
                  Checklist
                </a>
                .
              </>
            )}
          </>
        }
      />
    )
  }

  if (status === 'cancelado') {
    return (
      <ProvedorAlertaSOS>
        <TelaCancelado d={d} />
      </ProvedorAlertaSOS>
    )
  }

  if (status === 'servico_finalizado' || status === 'concluido') {
    return (
      <ProvedorAlertaSOS>
        <TelaConclusao d={d} />
      </ProvedorAlertaSOS>
    )
  }

  return <AtendimentoEmCampo d={d} rastreio={rastreio} />
}

/** Esqueleto no formato da tela: mapa em cima, painel embaixo. */
function CarregandoAtendimento() {
  return (
    <div className="mec fixed inset-0 flex flex-col bg-canvas md:flex-row" aria-busy="true" aria-label="Carregando o chamado">
      <div className="relative flex-1 animate-pulse bg-skeleton">
        <div className="absolute top-[calc(env(safe-area-inset-top)+0.6rem)] left-3 size-11 rounded-full bg-surface/80" />
      </div>
      <div className="flex flex-col gap-3 rounded-t-[1.75rem] border-t border-line bg-surface px-4 pt-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:w-[400px] md:rounded-none md:pt-[calc(env(safe-area-inset-top)+1.25rem)] lg:w-[440px]">
        <div className="h-3 w-24 animate-pulse rounded-full bg-skeleton" />
        <div className="h-9 w-40 animate-pulse rounded-xl bg-skeleton" />
        <div className="h-16 animate-pulse rounded-2xl bg-skeleton" />
        <div className="h-16 animate-pulse rounded-2xl bg-skeleton" />
        <div className="h-[4.5rem] animate-pulse rounded-2xl bg-skeleton" />
      </div>
    </div>
  )
}
