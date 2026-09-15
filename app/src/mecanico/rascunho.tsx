import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, CloudOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { horaCurta } from '@/sos/rotulos'
import type { ChamadoSOS } from '@/sos/tipos'
import { acoesDoChamado, enviarAcao, useFilaChamado, type CamposAtendimento } from './filaOffline'

/**
 * Texto do atendimento (diagnóstico, serviço realizado, observações) com
 * salvamento automático e o indicador "Salvo / Guardado no aparelho".
 */

export type EstadoSalvo = 'salvo' | 'pendente' | 'salvando' | 'erro'

export function IndicadorSalvo({ estado, salvoEm }: { estado: EstadoSalvo; salvoEm: number | null }) {
  const base = 'flex shrink-0 items-center gap-1.5 text-[12px] font-semibold'
  if (estado === 'salvando')
    return (
      <span className={cn(base, 'text-ink-3')} role="status">
        <Loader2 className="size-3.5 animate-spin" /> Salvando…
      </span>
    )
  if (estado === 'erro')
    return (
      <span className={cn(base, 'text-warn-ink')} role="status">
        <CloudOff className="size-3.5" /> Guardado no aparelho
      </span>
    )
  if (estado === 'pendente')
    return (
      <span className={cn(base, 'text-ink-3')} role="status">
        <span className="size-2 rounded-full bg-warn" /> Não salvo
      </span>
    )
  return (
    <span className={cn(base, 'text-ok-ink')} role="status">
      <Check className="size-3.5" strokeWidth={3} /> Salvo{salvoEm ? ` ${horaCurta(new Date(salvoEm).toISOString())}` : ''}
    </span>
  )
}

/* ── rascunho com salvamento automático ─────────────────────────────────── */

export type Campo = 'diagnostico' | 'servico_realizado' | 'observacoes'
export type Campos = Record<Campo, string>

interface RascunhoLocal {
  campos: Campos
  pendentes: Campo[]
}

function chaveRascunho(id: string) {
  return `sos.rascunho.${id}`
}

function lerRascunho(id: string): RascunhoLocal | null {
  try {
    const v = localStorage.getItem(chaveRascunho(id))
    return v ? (JSON.parse(v) as RascunhoLocal) : null
  } catch {
    return null
  }
}

const CAMPOS: Campo[] = ['diagnostico', 'servico_realizado', 'observacoes']

/**
 * Diagnóstico, serviço e observações salvos sozinhos: 1,2 s depois de parar
 * de digitar, ao sair do campo e ao minimizar o app. O envio passa pela fila
 * do aparelho — sem sinal o texto fica guardado lá e sobe sozinho, na ordem
 * certa (antes do "finalizar", se ele também estiver esperando). O que foi
 * digitado e ainda não entrou na fila fica no rascunho local: fechar o app no
 * meio da frase não perde nada.
 */
export function useRascunhoAtendimento(chamado: ChamadoSOS) {
  const id = chamado.id
  const fila = useFilaChamado(id)
  const [campos, setCampos] = useState<Campos>(() => {
    const r: Campos = {
      diagnostico: chamado.diagnostico ?? '',
      servico_realizado: chamado.servico_realizado ?? '',
      observacoes: chamado.observacoes_finais ?? '',
    }
    // O texto guardado na fila (ainda sem sinal) vence o banco…
    for (const a of acoesDoChamado(id)) {
      if (a.tipo !== 'salvar') continue
      for (const k of CAMPOS) if (typeof a.dados[k] === 'string') r[k] = a.dados[k] as string
    }
    // …e o que foi digitado e nem chegou à fila vence tudo.
    const local = lerRascunho(id)
    if (local) for (const k of local.pendentes) r[k] = local.campos[k] ?? r[k]
    return r
  })
  const camposRef = useRef(campos)
  const pendentes = useRef<Set<Campo>>(new Set(lerRascunho(id)?.pendentes ?? []))
  const [digitando, setDigitando] = useState(pendentes.current.size > 0)
  const [enviando, setEnviando] = useState(false)
  const [recusado, setRecusado] = useState(false)
  const [salvoEm, setSalvoEm] = useState<number | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const gravarLocal = useCallback(() => {
    try {
      localStorage.setItem(chaveRascunho(id), JSON.stringify({ campos: camposRef.current, pendentes: [...pendentes.current] } satisfies RascunhoLocal))
    } catch {
      /* sem armazenamento: segue só com a fila */
    }
  }, [id])

  const salvarRef = useRef<() => Promise<boolean>>(async () => true)
  const salvarAgora = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current)
    if (!pendentes.current.size) return true
    const lote = [...pendentes.current]
    const dados: CamposAtendimento = {}
    for (const k of lote) dados[k] = camposRef.current[k]
    // Daqui em diante quem guarda é a fila.
    pendentes.current = new Set()
    setDigitando(false)
    gravarLocal()
    setEnviando(true)
    try {
      const r = await enviarAcao({ tipo: 'salvar', chamadoId: id, dados })
      setRecusado(false)
      if (r === 'feito') setSalvoEm(Date.now())
      return r === 'feito'
    } catch {
      // O servidor recusou (sem permissão…): o texto continua na tela e no aparelho.
      for (const k of lote) pendentes.current.add(k)
      setRecusado(true)
      gravarLocal()
      return false
    } finally {
      setEnviando(false)
    }
  }, [id, gravarLocal])
  salvarRef.current = salvarAgora

  const agendar = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void salvarRef.current(), 1200)
  }, [])

  const alterar = useCallback(
    (campo: Campo, valor: string) => {
      camposRef.current = { ...camposRef.current, [campo]: valor }
      setCampos(camposRef.current)
      pendentes.current.add(campo)
      setDigitando(true)
      gravarLocal()
      agendar()
    },
    [gravarLocal, agendar],
  )

  /** Troca vários campos de uma vez (texto da IA) e já manda salvar. */
  const substituir = useCallback(
    (novos: Partial<Campos>) => {
      camposRef.current = { ...camposRef.current, ...novos }
      setCampos(camposRef.current)
      for (const k of Object.keys(novos) as Campo[]) pendentes.current.add(k)
      setDigitando(true)
      gravarLocal()
      void salvarRef.current()
    },
    [gravarLocal],
  )

  const limpar = useCallback(() => {
    window.clearTimeout(timer.current)
    pendentes.current = new Set()
    setDigitando(false)
    try {
      localStorage.removeItem(chaveRascunho(id))
    } catch {
      /* nada a limpar */
    }
  }, [id])

  useEffect(() => {
    // Rascunho de outra sessão que nem chegou à fila: entra assim que a tela abre.
    if (pendentes.current.size) void salvarRef.current()
    const aoEsconder = () => document.visibilityState === 'hidden' && void salvarRef.current()
    document.addEventListener('visibilitychange', aoEsconder)
    return () => {
      document.removeEventListener('visibilitychange', aoEsconder)
      window.clearTimeout(timer.current)
      void salvarRef.current()
    }
  }, [])

  const naFila = fila.acoes.filter((a) => a.tipo === 'salvar')
  // Texto que estava guardado saiu da fila (o sinal voltou): "salvo" com a hora de agora.
  const tinhaNaFila = useRef(naFila.length)
  useEffect(() => {
    if (tinhaNaFila.current > 0 && naFila.length === 0) setSalvoEm(Date.now())
    tinhaNaFila.current = naFila.length
  }, [naFila.length])

  const estado: EstadoSalvo = digitando
    ? 'pendente'
    : enviando || naFila.some((a) => a.id === fila.emVoo)
      ? 'salvando'
      : recusado || naFila.length
        ? 'erro'
        : 'salvo'

  return { campos, estado, salvoEm, alterar, substituir, salvarAgora, limpar }
}

export type Rascunho = ReturnType<typeof useRascunhoAtendimento>
