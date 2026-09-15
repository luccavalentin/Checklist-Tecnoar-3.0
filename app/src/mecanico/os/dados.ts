import { useMemo } from 'react'
import { useQuery, type QueryClient } from '@tanstack/react-query'
import { sosMinhasOS, sosOSDetalhe } from '@/sos/api'
import { URL_CHECKLIST } from '@/sos/endereco'
import { STATUS_EM_CAMPO, formatarPlacaExibicao } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import { useHomeMecanico } from '../dados'
import type { TomSelo } from '../ui'

/**
 * Dados das OS do sistema Tecnoar no app do mecânico. As OS são as mesmas do
 * Checklist: tudo o que se lança aqui aparece lá (e vice-versa).
 */

export type SituacaoOS = 'abertas' | 'encerradas'

export const CHAVES_OS = {
  raiz: ['sos', 'minhas-os'] as const,
  lista: (s: SituacaoOS) => ['sos', 'minhas-os', s] as const,
  detalhe: (id: string) => ['sos', 'os', id] as const,
  /** Prefixo de toda consulta do catálogo (lista paginada e buscas). */
  catalogo: ['sos', 'catalogo'] as const,
}

export function useMinhasOS(situacao: SituacaoOS, ligado = true) {
  return useQuery({
    queryKey: CHAVES_OS.lista(situacao),
    queryFn: () => sosMinhasOS(situacao),
    enabled: ligado,
    staleTime: 15_000,
    refetchInterval: situacao === 'abertas' ? 60_000 : undefined,
  })
}

export function useDetalheOS(id: string | null | undefined) {
  return useQuery({
    queryKey: CHAVES_OS.detalhe(id ?? ''),
    queryFn: () => sosOSDetalhe(id ?? ''),
    enabled: !!id,
    staleTime: 10_000,
    refetchInterval: 45_000,
    // "Sem acesso a esta OS" é resposta, não falha de rede: não adianta insistir.
    retry: (tentativas, erro) => !/sem acesso|permiss|não encontrad/i.test(String((erro as Error)?.message ?? '')) && tentativas < 2,
  })
}

/**
 * Depois de lançar, alterar ou remover: o que pode ter mudado é a OS, a lista
 * de OS (total, itens, peças sem estoque), o chamado ligado a ela e o
 * disponível do catálogo (a peça lançada passa a contar como comprometida).
 */
export function invalidarDepoisDeLancar(qc: QueryClient, alvo: { osId?: string | null; chamadoId?: string | null } = {}) {
  void qc.invalidateQueries({ queryKey: CHAVES_OS.raiz })
  void qc.invalidateQueries({ queryKey: CHAVES_OS.catalogo })
  if (alvo.osId) void qc.invalidateQueries({ queryKey: CHAVES_OS.detalhe(alvo.osId) })
  else void qc.invalidateQueries({ queryKey: ['sos', 'os'] })
  if (alvo.chamadoId) void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(alvo.chamadoId) })
  void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeMecanico })
}

/** A OS no sistema Tecnoar (Checklist) — mesma rota de `OrdemServico.linkOS`. */
export function linkOSNoSistema(osId: string): string {
  return `${URL_CHECKLIST}/operacao/ordens-de-servico?os=${osId}`
}

/** Cor do status da OS (token do cadastro de status do Checklist) → tom do selo. */
const TOM_STATUS: Record<string, TomSelo> = {
  neutro: 'neutro',
  ciano: 'ciano',
  laranja: 'laranja',
  atencao: 'ambar',
  sucesso: 'ok',
  critico: 'vermelho',
}

export function tomStatusOS(cor: string | null | undefined): TomSelo {
  return TOM_STATUS[cor ?? 'neutro'] ?? 'neutro'
}

/** Para onde vai o item lançado: o chamado em atendimento ou uma OS aberta. */
export type DestinoLancamento =
  | { tipo: 'chamado'; id: string; titulo: string; sub?: string | null; osId?: string | null }
  | { tipo: 'os'; id: string; titulo: string; sub?: string | null; chamadoId?: string | null }

/**
 * Destinos possíveis fora de um atendimento: o chamado em campo (aceito, a
 * caminho, no local ou em serviço — a peça fica reservada nele até a OS ser
 * efetivada) e as OS abertas com o mecânico. A OS do próprio chamado não
 * aparece duas vezes: lançar nela é lançar no chamado (o banco resolve).
 */
export function useDestinosLancamento() {
  const home = useHomeMecanico()
  const abertas = useMinhasOS('abertas')
  const atual = home.data?.chamado_atual ?? null
  const chamadoValido = !!atual && STATUS_EM_CAMPO.includes(atual.status)

  const destinos = useMemo<DestinoLancamento[]>(() => {
    const lista: DestinoLancamento[] = []
    const oss = abertas.data?.lista ?? []
    const osDoChamado = chamadoValido && atual ? oss.find((o) => o.chamado_id === atual.id) ?? null : null
    if (chamadoValido && atual) {
      lista.push({
        tipo: 'chamado',
        id: atual.id,
        titulo: `Atendimento ${rotuloProtocolo(atual.protocolo)}`,
        sub: [osDoChamado ? `OS nº ${osDoChamado.numero}` : 'Chamado em andamento', atual.cliente_nome, atual.placa ? formatarPlacaExibicao(atual.placa) : null]
          .filter(Boolean)
          .join(' · '),
        osId: osDoChamado?.id ?? null,
      })
    }
    for (const o of oss) {
      if (osDoChamado && o.id === osDoChamado.id) continue
      lista.push({
        tipo: 'os',
        id: o.id,
        titulo: `OS nº ${o.numero}`,
        sub: [o.cliente, o.placa ? formatarPlacaExibicao(o.placa) : null].filter(Boolean).join(' · '),
        chamadoId: o.chamado_id,
      })
    }
    return lista
  }, [abertas.data, atual, chamadoValido])

  const erro = (abertas.error as Error | null) ?? (home.error as Error | null)
  return {
    destinos,
    carregando: (abertas.isLoading && !abertas.data) || (home.isLoading && !home.data),
    erro: erro ? erro.message : null,
    tentar: () => {
      void abertas.refetch()
      void home.refetch()
    },
  }
}

/** "SOS-2026-000123" já vem com o prefixo; garante que sempre venha. */
export function rotuloProtocolo(protocolo: string): string {
  return /^sos/i.test(protocolo) ? protocolo : `SOS-${protocolo}`
}
