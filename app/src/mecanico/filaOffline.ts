import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useToast } from '@/componentes/ui/Toast'
import { sosAvancar, sosDetalhe, sosEnviarMensagem, sosSalvarAtendimento } from '@/sos/api'
import { PROXIMA_ETAPA, STATUS_ENCERRADOS, STATUS_SOS, ordemStatus } from '@/sos/rotulos'
import { CHAVES_SOS } from '@/sos/tempoReal'
import type { ChamadoSOS, DetalheChamado, StatusSOS } from '@/sos/tipos'

/**
 * Fila de ações de campo que esperam sinal.
 *
 * Na estrada o sinal cai no meio do "cheguei". Em vez de travar o botão, a
 * ação entra numa fila guardada no aparelho (localStorage, por usuário e por
 * chamado, na ordem em que foi feita), a tela já mostra o resultado e o envio
 * acontece sozinho quando a internet volta: evento `online`, a cada 20 s e ao
 * reabrir o app.
 *
 * Regras de envio:
 * - Uma ação por vez, na ordem. Sem rede no meio: para tudo e espera o
 *   próximo gatilho — nada sai fora de ordem.
 * - Erro do servidor que na verdade quer dizer "já foi" (etapa já chegou lá,
 *   mensagem já está na conversa) conta como sucesso: o pedido pode ter
 *   chegado antes de o sinal cair, só a resposta se perdeu.
 * - Erro de verdade (ex.: orçamento não aprovado) fica parado e visível, com
 *   "tentar de novo" e "descartar". Uma etapa parada segura as etapas seguintes
 *   do mesmo chamado (não dá para finalizar o que não começou); mensagens e
 *   texto seguem.
 * - Quem tocou no botão com sinal recebe o erro na hora, como sempre — a ação
 *   nem fica na fila.
 */

/* ── tipos ──────────────────────────────────────────────────────────────── */

export interface CamposAtendimento {
  diagnostico?: string
  servico_realizado?: string
  observacoes?: string
}

interface BaseAcao {
  id: string
  /** Ordem de criação, entre todos os chamados. */
  seq: number
  chamadoId: string
  criadaEm: string
  tentativas: number
  /** Erro de verdade: a ação para até alguém tentar de novo ou descartar. */
  erro: string | null
}

export type AcaoFila = BaseAcao &
  (
    | { tipo: 'avancar'; status: StatusSOS; lat: number | null; lng: number | null; dados?: Record<string, unknown> }
    | { tipo: 'salvar'; dados: CamposAtendimento }
    | { tipo: 'mensagem'; texto: string; rapida: boolean }
  )

type SemBase<T> = T extends unknown ? Omit<T, keyof BaseAcao> & { chamadoId: string } : never
export type NovaAcao = SemBase<AcaoFila>

/** O que a tela recebe ao disparar uma ação. Erro de verdade vem como exceção. */
export type ResultadoFila = 'feito' | 'na_fila'

export interface EstadoFila {
  acoes: AcaoFila[]
  /** Ação sendo enviada agora. */
  emVoo: string | null
}

/* ── estado do módulo ───────────────────────────────────────────────────── */

const PREFIXO = 'sos.fila.v1'
/** Sem resposta neste tempo, o pedido conta como "sem sinal" e volta para a fila. */
const PRAZO_MS = 20_000
/** Com o dedo no botão, espera menos: sinal fraco vira "guardado" e o mecânico segue. */
const PRAZO_TOQUE_MS = 12_000
const INTERVALO_MS = 20_000

let usuario: string | null = null
let cliente: QueryClient | null = null
let estado: EstadoFila = { acoes: [], emVoo: null }
let contador = 0
let rodando: Promise<void> | null = null
let deNovo = false

const ouvintes = new Set<() => void>()
const ouvintesAviso = new Set<(a: AvisoFila) => void>()
/** Quem tocou no botão e está esperando a resposta desta ação. */
const esperando = new Map<string, Array<{ ok: (r: ResultadoFila) => void; falha: (e: Error) => void }>>()

interface AvisoFila {
  tom: 'ok' | 'atencao' | 'erro'
  titulo: string
  mensagem?: string
}

function mudar(novo: Partial<EstadoFila>) {
  estado = { ...estado, ...novo }
  for (const o of ouvintes) o()
}

function avisar(a: AvisoFila) {
  for (const o of ouvintesAviso) o(a)
}

/* ── armazenamento ──────────────────────────────────────────────────────── */

function chave(usuarioId: string, chamadoId: string) {
  return `${PREFIXO}.${usuarioId}.${chamadoId}`
}

function lerTudo(usuarioId: string): AcaoFila[] {
  const lista: AcaoFila[] = []
  try {
    const inicio = `${PREFIXO}.${usuarioId}.`
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k?.startsWith(inicio)) continue
      const v = JSON.parse(localStorage.getItem(k) ?? '[]') as unknown
      if (Array.isArray(v)) lista.push(...(v as AcaoFila[]).filter((a) => a && typeof a.id === 'string' && typeof a.chamadoId === 'string'))
    }
  } catch {
    /* sem armazenamento: a fila vive só na memória */
  }
  return lista.sort((a, b) => a.seq - b.seq)
}

function gravar(chamadoId: string) {
  if (!usuario) return
  const doChamado = estado.acoes.filter((a) => a.chamadoId === chamadoId)
  try {
    if (doChamado.length) localStorage.setItem(chave(usuario, chamadoId), JSON.stringify(doChamado))
    else localStorage.removeItem(chave(usuario, chamadoId))
  } catch {
    /* armazenamento cheio ou bloqueado: segue na memória */
  }
}

function trocarAcoes(acoes: AcaoFila[], chamados: Iterable<string>) {
  mudar({ acoes })
  for (const c of new Set(chamados)) gravar(c)
}

function atualizarAcao(id: string, mudanca: Partial<AcaoFila>) {
  const alvo = estado.acoes.find((a) => a.id === id)
  if (!alvo) return
  trocarAcoes(
    estado.acoes.map((a) => (a.id === id ? ({ ...a, ...mudanca } as AcaoFila) : a)),
    [alvo.chamadoId],
  )
}

function removerAcao(id: string) {
  const alvo = estado.acoes.find((a) => a.id === id)
  if (!alvo) return
  trocarAcoes(
    estado.acoes.filter((a) => a.id !== id),
    [alvo.chamadoId],
  )
}

function responder(id: string, r: { ok: ResultadoFila } | { falha: Error }) {
  const lista = esperando.get(id)
  if (!lista) return
  esperando.delete(id)
  for (const w of lista) {
    if ('ok' in r) w.ok(r.ok)
    else w.falha(r.falha)
  }
}

/**
 * Liga a fila ao usuário da sessão (cada conta tem a sua fila no aparelho).
 * Roda já na renderização, sem avisar ninguém: a tela que abre logo depois
 * (o rascunho do atendimento, por exemplo) precisa ler a fila carregada.
 */
function configurar(usuarioId: string, qc: QueryClient) {
  cliente = qc
  if (usuario === usuarioId) return
  usuario = usuarioId
  estado = { acoes: lerTudo(usuarioId), emVoo: null }
}

/* ── classificação dos erros ────────────────────────────────────────────── */

function mensagemDe(e: unknown): string {
  return (e as Error)?.message ?? String(e ?? '')
}

/**
 * Sem sinal (ou servidor fora do ar): vale esperar e mandar de novo. O Safari
 * do iPhone diz "Load failed" onde o Chrome diz "Failed to fetch".
 */
function faltaDeRede(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  return /sem conex|failed to fetch|load failed|networkerror|network request|tempo esgotado|timed? ?out|aborted|\b50[234]\b|upstream|gateway|unavailable/i.test(mensagemDe(e))
}

/** Sessão vencida enquanto estava sem sinal: o Supabase renova sozinho quando a rede volta. */
function sessaoVencida(e: unknown): boolean {
  return /sessão expirou/i.test(mensagemDe(e))
}

function comPrazo<T>(p: Promise<T>, ms = PRAZO_MS): Promise<T> {
  return new Promise<T>((ok, falha) => {
    const t = window.setTimeout(() => falha(new Error('Tempo esgotado sem resposta do servidor.')), ms)
    p.then(
      (v) => {
        window.clearTimeout(t)
        ok(v)
      },
      (e) => {
        window.clearTimeout(t)
        falha(e)
      },
    )
  })
}

/* ── envio ──────────────────────────────────────────────────────────────── */

function enviarAoServidor(a: AcaoFila): Promise<unknown> {
  switch (a.tipo) {
    case 'avancar': {
      // Saiu bem depois do toque: a hora real fica registrada no evento.
      const atrasada = Date.now() - Date.parse(a.criadaEm) > 60_000
      const dados = atrasada ? { ...(a.dados ?? {}), registrado_no_aparelho_em: a.criadaEm } : a.dados
      return sosAvancar(a.chamadoId, a.status, { lat: a.lat, lng: a.lng, dados })
    }
    case 'salvar':
      return sosSalvarAtendimento(a.chamadoId, a.dados)
    case 'mensagem':
      return sosEnviarMensagem(a.chamadoId, a.texto, { rapida: a.rapida })
  }
}

/**
 * Confere no servidor se a ação já está feita — o pedido pode ter chegado
 * antes de a resposta se perder no caminho.
 */
async function situacaoNoServidor(a: AcaoFila): Promise<'feita' | 'pendente' | 'cancelado'> {
  if (a.tipo === 'salvar') return 'pendente' // salvar de novo não faz mal
  const d = await comPrazo(sosDetalhe(a.chamadoId))
  cliente?.setQueryData(CHAVES_SOS.detalhe(a.chamadoId), d)
  const s = d.chamado.status
  if (s === 'cancelado') return 'cancelado'
  if (a.tipo === 'avancar') return ordemStatus(s) >= ordemStatus(a.status) ? 'feita' : 'pendente'
  // Mesma mensagem, minha, a partir de pouco antes do toque (relógio do aparelho pode estar adiantado).
  const desde = Date.parse(a.criadaEm) - 10 * 60_000
  const achou = d.mensagens.some((m) => m.autor_id === usuario && (m.texto ?? '').trim() === a.texto.trim() && Date.parse(m.created_at) >= desde)
  return achou ? 'feita' : 'pendente'
}

function aoConcluir(a: AcaoFila, resposta: unknown) {
  const qc = cliente
  if (!qc) return
  const id = a.chamadoId
  if (a.tipo === 'avancar') {
    const novo = resposta as ChamadoSOS | null
    if (novo?.status) {
      qc.setQueryData<DetalheChamado>(CHAVES_SOS.detalhe(id), (d) =>
        d ? { ...d, chamado: { ...d.chamado, ...novo, status_rotulo: STATUS_SOS[novo.status].rotulo } } : d,
      )
      if (STATUS_ENCERRADOS.includes(novo.status)) void qc.invalidateQueries({ queryKey: CHAVES_SOS.papel })
    }
    void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(id) })
    void qc.invalidateQueries({ queryKey: CHAVES_SOS.homeMecanico })
  } else if (a.tipo === 'mensagem') {
    // A mensagem entra na conversa já com o id do banco: sem piscar entre
    // sair da fila e a conversa recarregar.
    const msgId = typeof resposta === 'string' ? resposta : null
    if (msgId) {
      qc.setQueryData<DetalheChamado>(CHAVES_SOS.detalhe(id), (d) =>
        d && !d.mensagens.some((m) => m.id === msgId)
          ? {
              ...d,
              mensagens: [
                ...d.mensagens,
                {
                  id: msgId,
                  chamado_id: id,
                  autor_id: usuario,
                  autor_papel: 'mecanico',
                  autor_nome: null,
                  texto: a.texto,
                  midia_caminho: null,
                  midia_tipo: null,
                  rapida: a.rapida,
                  lida_em: null,
                  created_at: new Date().toISOString(),
                },
              ],
            }
          : d,
      )
    }
    void qc.invalidateQueries({ queryKey: CHAVES_SOS.detalhe(id) })
  } else {
    // Texto salvo: o cache fica igual ao banco sem buscar tudo de novo a cada frase.
    const novo = resposta as ChamadoSOS | null
    if (novo?.id) qc.setQueryData<DetalheChamado>(CHAVES_SOS.detalhe(id), (d) => (d ? { ...d, chamado: { ...d.chamado, ...novo } } : d))
  }
}

/**
 * A central finalizou antes de a finalização guardada sair: o texto do
 * mecânico não se perde — entra onde o banco ainda está vazio.
 */
async function aproveitarTexto(a: AcaoFila) {
  if (a.tipo !== 'avancar' || a.status !== 'servico_finalizado' || !a.dados) return
  const c = (cliente?.getQueryData<DetalheChamado>(CHAVES_SOS.detalhe(a.chamadoId)))?.chamado
  if (!c) return
  const dados: CamposAtendimento = {}
  const texto = (k: string) => (typeof a.dados?.[k] === 'string' ? (a.dados[k] as string).trim() : '')
  if (!c.diagnostico && texto('diagnostico')) dados.diagnostico = texto('diagnostico')
  if (!c.servico_realizado && texto('servico_realizado')) dados.servico_realizado = texto('servico_realizado')
  if (!c.observacoes_finais && texto('observacoes')) dados.observacoes = texto('observacoes')
  if (Object.keys(dados).length) await sosSalvarAtendimento(a.chamadoId, dados).catch(() => {})
}

function descartarChamado(chamadoId: string, motivo: string) {
  const doChamado = estado.acoes.filter((a) => a.chamadoId === chamadoId)
  if (!doChamado.length) return
  trocarAcoes(
    estado.acoes.filter((a) => a.chamadoId !== chamadoId),
    [chamadoId],
  )
  for (const a of doChamado) responder(a.id, { falha: new Error(motivo) })
  avisar({ tom: 'atencao', titulo: 'Chamado cancelado', mensagem: 'O que estava guardado no aparelho para ele foi descartado.' })
}

type Desfecho = 'ok' | 'rede' | 'erro'

async function executar(a: AcaoFila): Promise<Desfecho> {
  mudar({ emVoo: a.id })
  try {
    // Já tentou antes (o sinal caiu no meio): confere antes de mandar de novo.
    if (a.tentativas > 0) {
      const s = await situacaoNoServidor(a)
      if (s === 'cancelado') {
        descartarChamado(a.chamadoId, 'O chamado foi cancelado.')
        return 'ok'
      }
      if (s === 'feita') {
        await aproveitarTexto(a)
        removerAcao(a.id)
        aoConcluir(a, null)
        responder(a.id, { ok: 'feito' })
        return 'ok'
      }
    }
    atualizarAcao(a.id, { tentativas: a.tentativas + 1 })
    const resposta = await comPrazo(enviarAoServidor(a), esperando.has(a.id) && a.tentativas === 0 ? PRAZO_TOQUE_MS : PRAZO_MS)
    removerAcao(a.id)
    aoConcluir(a, resposta)
    responder(a.id, { ok: 'feito' })
    return 'ok'
  } catch (e) {
    if (faltaDeRede(e)) return 'rede'
    if (sessaoVencida(e) && a.tentativas < 3) return 'rede'
    // Erro do servidor: pode ser só "isso já foi feito".
    let s: 'feita' | 'pendente' | 'cancelado' = 'pendente'
    try {
      s = await situacaoNoServidor(a)
    } catch (e2) {
      if (faltaDeRede(e2)) return 'rede'
    }
    if (s === 'cancelado') {
      descartarChamado(a.chamadoId, 'O chamado foi cancelado.')
      return 'ok'
    }
    if (s === 'feita') {
      await aproveitarTexto(a)
      removerAcao(a.id)
      aoConcluir(a, null)
      responder(a.id, { ok: 'feito' })
      return 'ok'
    }
    const erro = e instanceof Error ? e : new Error(mensagemDe(e))
    if (esperando.has(a.id)) {
      // Alguém está com o dedo no botão: devolve o erro na hora, sem guardar.
      removerAcao(a.id)
      responder(a.id, { falha: erro })
    } else {
      atualizarAcao(a.id, { erro: erro.message || 'O servidor recusou esta ação.' })
      avisar({ tom: 'erro', titulo: `Não enviado: ${rotuloAcao(a)}`, mensagem: erro.message })
    }
    return 'erro'
  } finally {
    mudar({ emVoo: null })
  }
}

async function rodada() {
  let enviadas = 0
  let ultima: AcaoFila | null = null
  const chamados = [...new Set(estado.acoes.map((a) => a.chamadoId))]
  for (const chamadoId of chamados) {
    let etapaParada = false
    for (const a of estado.acoes.filter((x) => x.chamadoId === chamadoId)) {
      const atual = estado.acoes.find((x) => x.id === a.id)
      if (!atual) continue
      if (atual.erro) {
        if (atual.tipo === 'avancar') etapaParada = true
        continue
      }
      // Etapa parada segura as seguintes (não se finaliza o que não começou).
      if (atual.tipo === 'avancar' && etapaParada) continue
      const aoVivo = esperando.has(atual.id)
      const r = await executar(atual)
      if (r === 'rede') return { enviadas, ultima }
      if (r === 'ok' && !aoVivo) {
        enviadas++
        ultima = atual
      }
      if (r === 'erro' && atual.tipo === 'avancar' && estado.acoes.some((x) => x.id === atual.id)) etapaParada = true
    }
  }
  return { enviadas, ultima }
}

/** Uma aba por vez envia a fila (duas abas mandariam a mesma mensagem duas vezes). */
async function comTrava(fn: () => Promise<void>) {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks
  if (!locks || !usuario) return fn()
  await locks.request(`sos-fila-${usuario}`, { ifAvailable: true }, async (trava) => {
    if (trava) await fn()
  })
}

/** Manda o que estiver na fila. Pode chamar à vontade: uma rodada por vez. */
export function processarFila(): Promise<void> {
  if (!usuario || !cliente) return Promise.resolve()
  if (rodando) {
    deNovo = true
    return rodando
  }
  rodando = (async () => {
    try {
      await comTrava(async () => {
        let total = 0
        let ultima: AcaoFila | null = null
        do {
          deNovo = false
          if (typeof navigator !== 'undefined' && !navigator.onLine) break
          const r = await rodada()
          total += r.enviadas
          ultima = r.ultima ?? ultima
        } while (deNovo)
        if (total > 0) {
          avisar({
            tom: 'ok',
            titulo: 'Sinal de volta',
            mensagem: total === 1 && ultima ? `Enviado: ${rotuloAcao(ultima)}.` : `${total} ações guardadas foram enviadas.`,
          })
        }
      })
    } finally {
      rodando = null
    }
  })()
  return rodando
}

/**
 * Registra uma ação e tenta mandar na hora. Devolve `feito` (o servidor já
 * aceitou) ou `na_fila` (guardada no aparelho, sai sozinha com o sinal). Erro
 * de verdade vem como exceção, e a ação não fica guardada.
 */
export async function enviarAcao(nova: NovaAcao): Promise<ResultadoFila> {
  if (!usuario) throw new Error('Sessão não carregada. Abra o app de novo.')
  const doChamado = estado.acoes.filter((a) => a.chamadoId === nova.chamadoId)
  let alvo: AcaoFila | undefined

  if (nova.tipo === 'avancar') {
    // A mesma etapa já está guardada: vale a nova posição e o novo texto, e
    // uma etapa parada por erro ganha outra chance.
    const igual = doChamado.find((a) => a.tipo === 'avancar' && a.status === nova.status)
    if (igual && igual.id !== estado.emVoo) {
      atualizarAcao(igual.id, { ...nova, erro: null } as Partial<AcaoFila>)
      alvo = estado.acoes.find((a) => a.id === igual.id)
    }
  } else if (nova.tipo === 'salvar') {
    // Texto: junta com o salvamento que ainda não saiu, em vez de empilhar um por frase.
    const ultimo = doChamado[doChamado.length - 1]
    if (ultimo?.tipo === 'salvar' && ultimo.id !== estado.emVoo) {
      atualizarAcao(ultimo.id, { dados: { ...ultimo.dados, ...nova.dados }, erro: null } as Partial<AcaoFila>)
      alvo = estado.acoes.find((a) => a.id === ultimo.id)
    }
  }

  if (!alvo) {
    alvo = {
      ...nova,
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      seq: Date.now() * 1000 + (contador++ % 1000),
      criadaEm: new Date().toISOString(),
      tentativas: 0,
      erro: null,
    } as AcaoFila
    trocarAcoes([...estado.acoes, alvo], [alvo.chamadoId])
  }

  const id = alvo.id
  const resultado = new Promise<ResultadoFila>((ok, falha) => {
    esperando.set(id, [...(esperando.get(id) ?? []), { ok, falha }])
  })
  void processarFila().finally(() => {
    // A rodada acabou sem chegar a esta ação (sem sinal, ou atrás de outra parada).
    if (estado.acoes.some((a) => a.id === id)) responder(id, { ok: 'na_fila' })
  })
  return resultado
}

export function tentarDeNovo(id: string) {
  atualizarAcao(id, { erro: null })
  void processarFila()
}

export function descartarAcao(id: string) {
  if (estado.emVoo === id) return
  removerAcao(id)
  responder(id, { falha: new Error('Ação descartada.') })
}

/* ── leitura ────────────────────────────────────────────────────────────── */

function assinar(o: () => void) {
  ouvintes.add(o)
  return () => void ouvintes.delete(o)
}

export function useFila(): EstadoFila {
  return useSyncExternalStore(
    assinar,
    () => estado,
    () => estado,
  )
}

/** Ações guardadas de um chamado, na ordem. */
export function useFilaChamado(chamadoId: string) {
  const f = useFila()
  const acoes = useMemo(() => f.acoes.filter((a) => a.chamadoId === chamadoId), [f.acoes, chamadoId])
  return { acoes, emVoo: f.emVoo }
}

/** Leitura direta (fora do React): o rascunho abre já com o texto guardado. */
export function acoesDoChamado(chamadoId: string): AcaoFila[] {
  return estado.acoes.filter((a) => a.chamadoId === chamadoId)
}

/** Nome curto da ação, para a lista de pendentes e os avisos. */
export function rotuloAcao(a: AcaoFila): string {
  if (a.tipo === 'avancar') {
    const botao = Object.values(PROXIMA_ETAPA).find((p) => p?.status === a.status)?.botao
    return botao ?? STATUS_SOS[a.status].rotulo
  }
  if (a.tipo === 'salvar') return 'Diagnóstico e anotações'
  return `Mensagem “${a.texto.length > 40 ? `${a.texto.slice(0, 38)}…` : a.texto}”`
}

/**
 * O chamado como vai ficar quando a fila sair: a etapa guardada já vale na
 * tela (sem sinal, o mecânico continua o atendimento). Para na primeira etapa
 * parada por erro — dali em diante, vale o que o banco diz.
 */
export function aplicarFila(d: DetalheChamado, acoes: AcaoFila[]): DetalheChamado {
  const c = aplicarNoChamado(d.chamado, acoes)
  return c === d.chamado ? d : { ...d, chamado: c }
}

/** O mesmo, para o chamado solto (cartão do painel, pílula de "em andamento"). */
export function aplicarNoChamado<C extends ChamadoSOS & { status_rotulo?: string }>(chamado: C, acoes: AcaoFila[]): C {
  if (chamado.status === 'cancelado') return chamado
  let c = chamado
  for (const a of acoes) {
    if (a.tipo !== 'avancar' || a.chamadoId !== c.id) continue
    if (a.erro) break
    if (ordemStatus(a.status) <= ordemStatus(c.status)) continue
    const em = a.criadaEm
    c = {
      ...c,
      status: a.status,
      status_rotulo: STATUS_SOS[a.status].rotulo,
      a_caminho_em: a.status === 'a_caminho' ? c.a_caminho_em ?? em : c.a_caminho_em,
      chegou_em: a.status === 'no_local' ? c.chegou_em ?? em : c.chegou_em,
      iniciado_em: a.status === 'servico_iniciado' ? c.iniciado_em ?? em : c.iniciado_em,
      finalizado_em: a.status === 'servico_finalizado' ? c.finalizado_em ?? em : c.finalizado_em,
    }
    if (a.status === 'servico_finalizado' && a.dados) {
      const t = (k: string) => (typeof a.dados?.[k] === 'string' ? (a.dados[k] as string) : null)
      c = {
        ...c,
        diagnostico: t('diagnostico') ?? c.diagnostico,
        servico_realizado: t('servico_realizado') ?? c.servico_realizado,
        observacoes_finais: t('observacoes') ?? c.observacoes_finais,
      }
    }
  }
  return c
}

/* ── motor ──────────────────────────────────────────────────────────────── */

/**
 * Liga a fila à sessão e aos gatilhos de envio. Montado na casca e na tela
 * do chamado (as duas nunca estão abertas ao mesmo tempo; montar duas vezes
 * não duplica envio).
 */
export function useProcessadorFila(usuarioId: string | null) {
  const qc = useQueryClient()
  const toast = useToast()
  if (usuarioId) configurar(usuarioId, qc)

  useEffect(() => {
    if (!usuarioId) return
    const tentar = () => {
      if (estado.acoes.some((a) => !a.erro)) void processarFila()
    }
    const aoVoltar = () => document.visibilityState === 'visible' && tentar()
    // Outra aba mexeu na fila: lê de novo.
    const aoArmazenar = (e: StorageEvent) => {
      if (e.key?.startsWith(`${PREFIXO}.${usuarioId}.`) && !rodando) mudar({ acoes: lerTudo(usuarioId) })
    }
    tentar()
    const t = window.setInterval(tentar, INTERVALO_MS)
    window.addEventListener('online', tentar)
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('storage', aoArmazenar)
    return () => {
      window.clearInterval(t)
      window.removeEventListener('online', tentar)
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('storage', aoArmazenar)
    }
  }, [usuarioId, qc])

  useEffect(() => {
    const ouvir = (a: AvisoFila) => {
      if (a.tom === 'ok') toast.ok(a.titulo, a.mensagem)
      else if (a.tom === 'atencao') toast.atencao(a.titulo, a.mensagem)
      else toast.erro(a.titulo, a.mensagem)
    }
    ouvintesAviso.add(ouvir)
    return () => void ouvintesAviso.delete(ouvir)
  }, [toast])
}
