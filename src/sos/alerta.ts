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

/** Resposta de sala curta (ruído decaindo) para a sirene não soar "de computador". */
function impulsoAmbiente(ctx: AudioContext, segundos = 1.1): AudioBuffer {
  const n = Math.floor(ctx.sampleRate * segundos)
  const buf = ctx.createBuffer(2, n, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c)
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2)
  }
  return buf
}

/** Saturação suave: dá o "rasgado" de corneta de viatura. */
function curvaSaturacao(k = 6): Float32Array<ArrayBuffer> {
  const n = 1024
  const curva = new Float32Array(new ArrayBuffer(n * 4))
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1
    curva[i] = ((1 + k) * x) / (1 + k * Math.abs(x))
  }
  return curva
}

/**
 * Sirene de emergência de verdade (sintetizada, funciona offline):
 * ciclo "wail" — sobe e desce devagar, como ambulância — seguido de "yelp",
 * as varreduras rápidas de viatura em deslocamento. Timbre de corneta:
 * osciladores ricos em harmônicos levemente desafinados, ressonâncias da
 * corneta, saturação, compressor e um pouco de ambiente.
 */
function tocarSirene(ctx: AudioContext, duracao: number, volume: number) {
  const t0 = ctx.currentTime + 0.02
  const saida = ctx.createGain()
  saida.gain.value = 0
  const compressor = ctx.createDynamicsCompressor()
  compressor.threshold.value = -18
  compressor.ratio.value = 6
  compressor.attack.value = 0.003
  compressor.release.value = 0.2
  saida.connect(compressor)
  compressor.connect(ctx.destination)

  // corneta: duas ressonâncias + corte do chiado
  const corneta1 = ctx.createBiquadFilter()
  corneta1.type = 'peaking'
  corneta1.frequency.value = 1250
  corneta1.Q.value = 1.4
  corneta1.gain.value = 7
  const corneta2 = ctx.createBiquadFilter()
  corneta2.type = 'peaking'
  corneta2.frequency.value = 2700
  corneta2.Q.value = 2
  corneta2.gain.value = 4
  const corte = ctx.createBiquadFilter()
  corte.type = 'lowpass'
  corte.frequency.value = 5200
  const passaAlta = ctx.createBiquadFilter()
  passaAlta.type = 'highpass'
  passaAlta.frequency.value = 280
  const saturacao = ctx.createWaveShaper()
  saturacao.curve = curvaSaturacao(5)
  saturacao.oversample = '4x'

  const mistura = ctx.createGain()
  mistura.gain.value = 0.32
  mistura.connect(saturacao)
  saturacao.connect(passaAlta)
  passaAlta.connect(corneta1)
  corneta1.connect(corneta2)
  corneta2.connect(corte)

  const seco = ctx.createGain()
  seco.gain.value = 0.85
  const ambiente = ctx.createConvolver()
  ambiente.buffer = impulsoAmbiente(ctx)
  const molhado = ctx.createGain()
  molhado.gain.value = 0.22
  corte.connect(seco)
  corte.connect(ambiente)
  ambiente.connect(molhado)
  seco.connect(saida)
  molhado.connect(saida)

  const oscs = [
    { tipo: 'sawtooth' as OscillatorType, detune: 0, ganho: 0.55, mult: 1 },
    { tipo: 'square' as OscillatorType, detune: 9, ganho: 0.35, mult: 1 },
    { tipo: 'sawtooth' as OscillatorType, detune: -6, ganho: 0.18, mult: 2 },
  ].map((o) => {
    const osc = ctx.createOscillator()
    osc.type = o.tipo
    osc.detune.value = o.detune
    const g = ctx.createGain()
    g.gain.value = o.ganho
    osc.connect(g)
    g.connect(mistura)
    return { osc, mult: o.mult }
  })

  // padrão: 2 wails (2,6 s cada) + yelp (8 × 0,34 s), repetido
  const BAIXO = 650
  const ALTO = 1520
  const agenda = (f: number, t: number, rampa: 'exp' | 'set' = 'exp') => {
    for (const { osc, mult } of oscs) {
      if (rampa === 'set') osc.frequency.setValueAtTime(f * mult, t)
      else osc.frequency.exponentialRampToValueAtTime(f * mult, t)
    }
  }
  agenda(BAIXO, t0, 'set')
  let t = t0
  const fim = t0 + duracao
  while (t < fim) {
    for (let w = 0; w < 2 && t < fim; w++) {
      agenda(ALTO, t + 1.25)
      agenda(BAIXO, t + 2.6)
      t += 2.6
    }
    for (let y = 0; y < 8 && t < fim; y++) {
      agenda(ALTO * 0.97, t + 0.15)
      agenda(BAIXO * 1.08, t + 0.34)
      t += 0.34
    }
  }

  saida.gain.setValueAtTime(0, t0)
  saida.gain.linearRampToValueAtTime(volume, t0 + 0.12)
  saida.gain.setValueAtTime(volume, fim - 0.35)
  saida.gain.linearRampToValueAtTime(0, fim)
  for (const { osc } of oscs) {
    osc.start(t0)
    osc.stop(fim + 0.05)
  }

  const parar = () => {
    try {
      saida.gain.cancelScheduledValues(ctx.currentTime)
      saida.gain.setValueAtTime(0, ctx.currentTime)
      for (const { osc } of oscs) osc.stop()
    } catch {
      /* já parado */
    }
    // o ambiente ainda soa um instante: desliga depois
    window.setTimeout(() => compressor.disconnect(), 1200)
  }
  tocando = { parar }
  oscs[0].osc.onended = () => {
    if (tocando?.parar === parar) tocando = null
    window.setTimeout(() => compressor.disconnect(), 1200)
  }
}

/**
 * Alerta sonoro: `sirene` (novo SOS) repete até `pararAlerta` ou `duracaoMs`;
 * `aviso` são dois bipes curtos (mensagem, mudança de etapa).
 */
export function tocarAlerta(opcoes: { duracaoMs?: number; volume?: number; tipo?: 'sirene' | 'aviso' } = {}): boolean {
  const ctx = obterContexto()
  if (!ctx || ctx.state !== 'running') return false
  pararAlerta()
  if (opcoes.tipo !== 'aviso') {
    tocarSirene(ctx, (opcoes.duracaoMs ?? 8000) / 1000, opcoes.volume ?? 0.9)
    return true
  }
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
