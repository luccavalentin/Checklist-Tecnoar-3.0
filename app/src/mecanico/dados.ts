import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/componentes/ui/Toast'
import { dbSOS, sosCompartilhar, sosDefinirSituacao, sosDetalhe, sosHomeMecanico, sosInfoPublica, sosPulso } from '@/sos/api'
import { audioLiberado } from '@/sos/alerta'
import { posicaoAtual, type LeituraGPS } from '@/sos/geo'
import { SITUACOES_MECANICO } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { FichaMecanico, HomeMecanico, ItemSOS, SituacaoMecanico } from '@/sos/tipos'

/**
 * Dados e ganchos do app do mecânico.
 *
 * A home (`sos_home_mecanico`) é a fonte única do "como estou agora": ficha,
 * chamado atual, fila e números do dia. A casca, o painel e o histórico usam a
 * mesma consulta — o TanStack Query junta tudo numa ida ao banco só.
 */

export function useHomeMecanico() {
  return useQuery({
    queryKey: CHAVES_SOS.homeMecanico,
    queryFn: sosHomeMecanico,
    // O tempo real invalida a cada mudança; o intervalo é a rede de segurança
    // para quando o canal cair (túnel, troca de antena, aparelho dormindo).
    refetchInterval: 30_000,
    staleTime: 10_000,
  })
}

/** Telefone e WhatsApp da Tecnoar — "falar com a central" no meio do atendimento. */
export function useInfoCentral() {
  return useQuery({ queryKey: ['sos', 'info-publica'], queryFn: sosInfoPublica, staleTime: 60 * 60_000, retry: false })
}

/**
 * Troca a situação do mecânico. Ao ficar disponível, pede a posição na hora:
 * sem ela o despacho não sabe quem está mais perto. GPS negado não impede —
 * o mecânico continua recebendo chamados, só não entra no cálculo de distância.
 *
 * Importante: quem chama deve rodar `destravarAudio()` no próprio toque, antes
 * do `mutate` — o navegador só libera som dentro do gesto.
 */
export function useDefinirSituacao() {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: async (p: { situacao: SituacaoMecanico; aceitaSos?: boolean; reserva?: LeituraGPS | null }) => {
      let ponto: { lat: number; lng: number } | null = null
      let semGps = false
      if (p.situacao === 'disponivel') {
        try {
          const l = await posicaoAtual({ timeoutMs: 9000, maxIdadeMs: 30_000 })
          ponto = { lat: l.lat, lng: l.lng }
        } catch {
          if (p.reserva) ponto = { lat: p.reserva.lat, lng: p.reserva.lng }
          else semGps = true
        }
      }
      const ficha = await sosDefinirSituacao(p.situacao, {
        lat: ponto?.lat ?? null,
        lng: ponto?.lng ?? null,
        aceitaSos: p.aceitaSos ?? null,
      })
      return { ficha, semGps }
    },
    onSuccess: ({ ficha, semGps }, p) => {
      atualizarFicha(qc, ficha)
      const s = SITUACOES_MECANICO[p.situacao]
      if (p.situacao === 'disponivel') {
        if (semGps) toast.atencao('Você está disponível', 'Sem GPS agora: você recebe os chamados, mas a central não vê sua posição.')
        else toast.ok('Você está disponível', 'Quando chegar um SOS, este aparelho toca.')
      } else {
        toast.info(`Situação: ${s.rotulo}`, 'Você não recebe chamados automáticos até ficar disponível de novo.')
      }
    },
    onError: (e) => {
      // "Você tem um atendimento em andamento…" vem do banco: a mensagem já
      // diz o que fazer. Recarregar mostra o chamado atual no painel.
      toast.erro('Não foi possível mudar a situação', (e as Error).message)
      void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeMecanico })
    },
  })
}

/** Grava a ficha devolvida pelo banco direto no cache — o painel muda na hora. */
export function atualizarFicha(qc: ReturnType<typeof useQueryClient>, ficha: FichaMecanico) {
  qc.setQueryData<HomeMecanico>(CHAVES_SOS.homeMecanico, (h) => (h ? { ...h, ficha } : h))
  void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeMecanico })
  void qc.invalidateQueries({ queryKey: CHAVES_SOS.papel })
}

/**
 * "Estou com o app aberto": um pulso por minuto enquanto a tela está à vista,
 * e outro na hora em que o app volta (desbloqueio, internet que voltou). O
 * vigia do servidor usa isso para não deixar "disponível" quem fechou o app
 * há horas — e a central vê "app visto há 1 min".
 */
export function usePulsoApp() {
  useEffect(() => {
    const pulsar = () => {
      if (document.visibilityState === 'visible') void sosPulso().catch(() => {})
    }
    pulsar()
    const t = window.setInterval(pulsar, 60_000)
    document.addEventListener('visibilitychange', pulsar)
    window.addEventListener('online', pulsar)
    return () => {
      window.clearInterval(t)
      document.removeEventListener('visibilitychange', pulsar)
      window.removeEventListener('online', pulsar)
    }
  }, [])
}

/* ── pequenos ganchos de tela ───────────────────────────────────────────── */

/** Relógio da tela: "há 3 min" e contagens regressivas andam sozinhos. */
export function useAgora(intervaloMs = 30_000): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setAgora(Date.now()), intervaloMs)
    return () => window.clearInterval(t)
  }, [intervaloMs])
  return agora
}

/** Sinal de internet do aparelho — o mesmo da faixa global do app (comum/Pwa). */
export { useOnline } from '../comum/Pwa'

/**
 * O som do alerta só toca depois de um toque na página. Aberto por uma
 * notificação, o app ainda não recebeu toque nenhum — aí vale avisar.
 */
export function useSomLiberado(): boolean {
  const [liberado, setLiberado] = useState(() => audioLiberado())
  useEffect(() => {
    if (liberado) return
    const conferir = () => window.setTimeout(() => setLiberado(audioLiberado()), 250)
    window.addEventListener('pointerdown', conferir)
    const t = window.setInterval(() => setLiberado(audioLiberado()), 2000)
    return () => {
      window.removeEventListener('pointerdown', conferir)
      window.clearInterval(t)
    }
  }, [liberado])
  return liberado
}

/** Consulta de mídia viva (tablet na viatura, celular deitado). */
export function useMidia(consulta: string): boolean {
  const [ok, setOk] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches)
  useEffect(() => {
    const m = window.matchMedia(consulta)
    const mudar = () => setOk(m.matches)
    mudar()
    m.addEventListener('change', mudar)
    return () => m.removeEventListener('change', mudar)
  }, [consulta])
  return ok
}

/**
 * Altura do teclado virtual. O Safari do iPhone não encolhe a página quando o
 * teclado abre: uma barra fixa no rodapé some atrás dele. Com esta medida a
 * barra sobe junto e o botão da etapa continua à vista enquanto se digita.
 */
export function useAlturaTeclado(): number {
  const [altura, setAltura] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const medir = () => setAltura(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)))
    vv.addEventListener('resize', medir)
    vv.addEventListener('scroll', medir)
    return () => {
      vv.removeEventListener('resize', medir)
      vv.removeEventListener('scroll', medir)
    }
  }, [])
  // Barra de endereço que encolhe/cresce mexe uns 50–70 px: não é teclado.
  return altura > 90 ? altura : 0
}

export function primeiroNome(nome: string | null | undefined): string {
  return (nome ?? '').trim().split(/\s+/)[0] || 'mecânico'
}

export function saudacao(agora = new Date()): string {
  const h = agora.getHours()
  if (h < 5) return 'Boa madrugada'
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** Tema do mapa acompanha o tema do app (à noite o mapa escuro cansa menos). */
export function temaDoMapa(): 'claro' | 'escuro' {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? 'escuro' : 'claro'
}

/* ── atendimento ────────────────────────────────────────────────────────── */

/** Detalhe de um chamado (a mesma chave que o tempo real invalida). */
export function useDetalheChamado(id: string | null | undefined, opcoes: { refetchInterval?: number } = {}) {
  return useQuery({
    queryKey: CHAVES_SOS.detalhe(id ?? ''),
    queryFn: () => sosDetalhe(id ?? ''),
    enabled: !!id,
    staleTime: 15_000,
    refetchInterval: opcoes.refetchInterval,
  })
}

/** Soma dos itens lançados, separada em peças e serviços (como na OS). */
export function totaisItens(itens: ItemSOS[]): { produtos: number; servicos: number; total: number; nProdutos: number; nServicos: number } {
  let produtos = 0
  let servicos = 0
  let nProdutos = 0
  let nServicos = 0
  for (const i of itens) {
    const v = Number(i.valor_total ?? 0)
    if (i.tipo === 'produto') {
      produtos += v
      nProdutos++
    } else {
      servicos += v
      nServicos++
    }
  }
  return { produtos, servicos, total: produtos + servicos, nProdutos, nServicos }
}

/**
 * "Compartilhar localização": link público de acompanhamento ao vivo (a
 * página /acompanhar mostra a posição aproximada e a previsão), para mandar
 * ao gestor da frota ou a quem estiver esperando.
 */
export async function compartilharAcompanhamento(chamadoId: string, protocolo: string): Promise<'compartilhado' | 'copiado' | 'cancelado'> {
  const token = await sosCompartilhar(chamadoId)
  const url = `${window.location.origin}/acompanhar/${token}`
  const texto = `Acompanhe o atendimento Tecnoar (${protocolo}) ao vivo:`
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: 'Atendimento Tecnoar', text: texto, url })
      return 'compartilhado'
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelado'
    }
  }
  await navigator.clipboard.writeText(`${texto} ${url}`)
  return 'copiado'
}

/** Linha do histórico de OS do veículo (lida direto do Checklist). */
export interface OsDoVeiculo {
  id: string
  numero: number
  aberta_em: string
  encerrada_em: string | null
  km: number | null
  problema_alegado: string | null
  diagnostico: string | null
  valor_total: number | null
}

/**
 * Últimas OS do veículo no Checklist. Lidas direto da tabela: só aparecem se
 * o perfil do mecânico tem acesso às ordens de serviço (RLS). Sem acesso ou
 * sem histórico, devolve lista vazia e a tela simplesmente não mostra o bloco.
 */
export function useHistoricoVeiculo(veiculoId: string | null | undefined, osAtualId?: string | null) {
  return useQuery({
    queryKey: ['sos', 'historico-veiculo', veiculoId ?? ''],
    enabled: !!veiculoId,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<OsDoVeiculo[]> => {
      const { data, error } = await dbSOS
        .from('ordens_servico')
        .select('id, numero, aberta_em, encerrada_em, km, problema_alegado, diagnostico, valor_total')
        .eq('veiculo_id', veiculoId as string)
        .eq('situacao', 'ativo')
        .order('aberta_em', { ascending: false })
        .limit(6)
      if (error) return []
      return ((data ?? []) as OsDoVeiculo[]).filter((o) => o.id !== osAtualId)
    },
  })
}

/** O tema escuro está ligado agora? (lido na hora do render). */
export function temaEscuroAgora(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
}
