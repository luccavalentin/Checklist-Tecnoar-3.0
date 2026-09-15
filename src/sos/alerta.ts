/**
 * Alerta de novo SOS: som, vibração e tela acesa.
 *
 * O som é sintetizado com Web Audio (nada para baixar, funciona offline).
 * Navegadores só liberam áudio depois de um toque na página — por isso
 * `destravarAudio` roda no primeiro toque e o alerta avisa quando o som está
 * bloqueado, para a central clicar "Ativar som".
 */

let contexto: AudioContext | null = null
let tocando: { parar: () => void } | null = null

function obterContexto(): AudioContext | null {
  if (contexto) return contexto
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!C) return null
  contexto = new C()
  return contexto
}

/** Chame num gesto do usuário (clique/toque) para liberar o som. */
export async function destravarAudio(): Promise<boolean> {
  const ctx = obterContexto()
  if (!ctx) return false
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      return false
    }
  }
  return ctx.state === 'running'
}

export function audioLiberado(): boolean {
  return contexto?.state === 'running'
}

/** Libera o áudio no primeiro toque em qualquer lugar da página. */
export function destravarNoPrimeiroToque() {
  const liberar = () => {
    void destravarAudio()
    window.removeEventListener('pointerdown', liberar)
    window.removeEventListener('keydown', liberar)
  }
  window.addEventListener('pointerdown', liberar, { once: true })
  window.addEventListener('keydown', liberar, { once: true })
}

/**
 * Sirene de dois tons (como alarme de socorro), repetindo até `pararAlerta`
 * ou `duracaoMs`. Volume moderado: é para chamar atenção na oficina, não
 * para assustar.
 */
export function tocarAlerta(opcoes: { duracaoMs?: number; volume?: number; tipo?: 'sirene' | 'aviso' } = {}): boolean {
  const ctx = obterContexto()
  if (!ctx || ctx.state !== 'running') return false
  pararAlerta()
  const volume = opcoes.volume ?? 0.22
  const ganho = ctx.createGain()
  ganho.gain.value = 0
  ganho.connect(ctx.destination)
  const osc = ctx.createOscillator()
  osc.type = 'sawtooth'
  const filtro = ctx.createBiquadFilter()
  filtro.type = 'lowpass'
  filtro.frequency.value = 2400
  osc.connect(filtro)
  filtro.connect(ganho)

  const t0 = ctx.currentTime
  const duracao = (opcoes.duracaoMs ?? 6000) / 1000
  if (opcoes.tipo === 'aviso') {
    // Dois bipes curtos: mensagem nova, mudança de etapa.
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, t0)
    osc.frequency.setValueAtTime(1175, t0 + 0.16)
    ganho.gain.setValueAtTime(0, t0)
    ganho.gain.linearRampToValueAtTime(volume, t0 + 0.02)
    ganho.gain.setValueAtTime(volume, t0 + 0.3)
    ganho.gain.linearRampToValueAtTime(0, t0 + 0.36)
    osc.start(t0)
    osc.stop(t0 + 0.4)
  } else {
    for (let t = 0; t < duracao; t += 1.2) {
      osc.frequency.setValueAtTime(760, t0 + t)
      osc.frequency.linearRampToValueAtTime(1180, t0 + t + 0.55)
      osc.frequency.linearRampToValueAtTime(760, t0 + t + 1.2)
    }
    ganho.gain.setValueAtTime(0, t0)
    ganho.gain.linearRampToValueAtTime(volume, t0 + 0.08)
    ganho.gain.setValueAtTime(volume, t0 + duracao - 0.2)
    ganho.gain.linearRampToValueAtTime(0, t0 + duracao)
    osc.start(t0)
    osc.stop(t0 + duracao + 0.05)
  }

  const parar = () => {
    try {
      ganho.gain.cancelScheduledValues(ctx.currentTime)
      ganho.gain.setValueAtTime(0, ctx.currentTime)
      osc.stop()
    } catch {
      /* já parado */
    }
    ganho.disconnect()
  }
  tocando = { parar }
  osc.onended = () => {
    if (tocando?.parar === parar) tocando = null
  }
  return true
}

export function pararAlerta() {
  tocando?.parar()
  tocando = null
  try {
    navigator.vibrate?.(0)
  } catch {
    /* sem vibração */
  }
}

/** Padrão de vibração de chamado urgente (iPhone ignora; Android respeita). */
export function vibrarAlerta(tipo: 'sos' | 'aviso' = 'sos') {
  try {
    navigator.vibrate?.(tipo === 'sos' ? [400, 180, 400, 180, 800] : [120, 60, 120])
  } catch {
    /* sem vibração */
  }
}

/* ── tela acesa ─────────────────────────────────────────────────────────── */

type Trava = { release: () => Promise<void> }
let trava: Trava | null = null

/**
 * Mantém a tela acesa enquanto o mecânico dirige até o cliente ou o cliente
 * acompanha a chegada. O sistema solta a trava quando o app vai para o
 * fundo; `manterTelaAcesa` a refaz ao voltar.
 */
export async function manterTelaAcesa(): Promise<boolean> {
  const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Trava> } }
  if (!nav.wakeLock) return false
  try {
    trava = await nav.wakeLock.request('screen')
    return true
  } catch {
    return false
  }
}

export async function liberarTela() {
  try {
    await trava?.release()
  } catch {
    /* já liberada */
  }
  trava = null
}

/** Título da aba piscando — a central às vezes está em outra aba. */
let piscaTitulo: number | undefined
let tituloOriginal = ''
export function piscarTitulo(texto: string) {
  pararTitulo()
  tituloOriginal = document.title
  let alterna = false
  piscaTitulo = window.setInterval(() => {
    document.title = alterna ? tituloOriginal : texto
    alterna = !alterna
  }, 900)
}
export function pararTitulo() {
  if (piscaTitulo) window.clearInterval(piscaTitulo)
  piscaTitulo = undefined
  if (tituloOriginal) document.title = tituloOriginal
}
