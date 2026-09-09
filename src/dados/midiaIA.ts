/**
 * Captura e preparo de mídia para a Tecnoar IA.
 *
 * O mecânico manda o que tem na mão: fala no microfone, tira foto, filma o
 * vazamento. Cada formato precisa de um tratamento diferente antes de chegar
 * ao modelo — e nenhum deles pode fingir que foi entendido quando não foi.
 */

export type TipoMidia = 'imagem' | 'audio' | 'video' | 'documento'

export interface AnexoPreparado {
  tipo: TipoMidia
  nome: string
  mime: string
  tamanho: number
  arquivo: Blob
  /** Prévia local para a interface. Deve ser liberada com `URL.revokeObjectURL`. */
  previa: string | null
  /**
   * Quadros extraídos do vídeo, já como imagem.
   *
   * Modelo de linguagem não assiste vídeo. Em vez de recusar o arquivo,
   * tiramos fotos ao longo dele e mandamos as fotos — que é o que um perito
   * faria olhando a filmagem.
   */
  quadros?: Blob[]
}

export function tipoDoArquivo(mime: string): TipoMidia {
  if (mime.startsWith('image/')) return 'imagem'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return 'documento'
}

/* ------------------------------------------------------------- áudio */

/**
 * Gravador de voz.
 *
 * Existe porque digitar de luva, embaixo de um caminhão, não acontece. O
 * formato é escolhido pelo que o navegador aceita: Safari não grava webm.
 */
export class GravadorDeVoz {
  private gravador: MediaRecorder | null = null
  private pedacos: Blob[] = []
  private trilha: MediaStream | null = null

  static suportado(): boolean {
    return typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
  }

  private static formato(): string {
    const opcoes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
    return opcoes.find((t) => MediaRecorder.isTypeSupported(t)) ?? ''
  }

  async iniciar(): Promise<void> {
    this.trilha = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = GravadorDeVoz.formato()
    this.gravador = new MediaRecorder(this.trilha, mimeType ? { mimeType } : undefined)
    this.pedacos = []
    this.gravador.ondataavailable = (e) => {
      if (e.data.size > 0) this.pedacos.push(e.data)
    }
    this.gravador.start()
  }

  /** Encerra e devolve o áudio. Sempre solta o microfone, mesmo se falhar. */
  parar(): Promise<Blob> {
    return new Promise((resolver, rejeitar) => {
      const g = this.gravador
      if (!g) {
        this.soltar()
        rejeitar(new Error('Nenhuma gravação em andamento.'))
        return
      }
      g.onstop = () => {
        const tipo = g.mimeType || 'audio/webm'
        const blob = new Blob(this.pedacos, { type: tipo })
        this.soltar()
        resolver(blob)
      }
      g.stop()
    })
  }

  cancelar(): void {
    try {
      this.gravador?.stop()
    } catch {
      /* já parado */
    }
    this.soltar()
  }

  private soltar() {
    this.trilha?.getTracks().forEach((t) => t.stop())
    this.trilha = null
    this.gravador = null
    this.pedacos = []
  }
}

/** Extensão coerente com o que o navegador gravou. */
export function extensaoDeAudio(mime: string): string {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('wav')) return 'wav'
  return 'webm'
}

/* -------------------------------------------------------------- vídeo */

/**
 * Tira fotos ao longo de um vídeo.
 *
 * Roda no navegador porque é onde já existe um decodificador de vídeo: mandar
 * o arquivo inteiro para o servidor só para extrair quadros custaria banda da
 * oficina e um decodificador que a função de borda não tem.
 *
 * Os quadros saem espalhados pela duração — começo, meio e fim — porque o
 * defeito costuma aparecer em um momento específico da filmagem.
 */
export async function extrairQuadros(arquivo: Blob, quantidade = 4, larguraMax = 1280): Promise<Blob[]> {
  const url = URL.createObjectURL(arquivo)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.src = url

  try {
    await new Promise<void>((resolver, rejeitar) => {
      const falhou = () => rejeitar(new Error('Não foi possível ler este vídeo.'))
      video.onloadedmetadata = () => resolver()
      video.onerror = falhou
      setTimeout(falhou, 20000)
    })

    const duracao = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0
    const escala = video.videoWidth > larguraMax ? larguraMax / video.videoWidth : 1
    const largura = Math.round(video.videoWidth * escala)
    const altura = Math.round(video.videoHeight * escala)
    if (!largura || !altura) throw new Error('O vídeo não tem imagem legível.')

    const tela = document.createElement('canvas')
    tela.width = largura
    tela.height = altura
    const ctx = tela.getContext('2d')
    if (!ctx) throw new Error('O navegador não conseguiu preparar a imagem.')

    /* Evita o quadro 0 e o último, que costumam vir pretos. */
    const instantes = duracao
      ? Array.from({ length: quantidade }, (_, i) => (duracao * (i + 0.5)) / quantidade)
      : [0]

    const quadros: Blob[] = []
    for (const t of instantes) {
      await new Promise<void>((resolver) => {
        const pronto = () => {
          video.onseeked = null
          resolver()
        }
        video.onseeked = pronto
        video.currentTime = Math.min(t, Math.max(duracao - 0.05, 0))
        /* Vídeo sem duração conhecida não dispara `seeked`. */
        if (!duracao) setTimeout(pronto, 300)
      })
      ctx.drawImage(video, 0, 0, largura, altura)
      const quadro = await new Promise<Blob | null>((r) => tela.toBlob(r, 'image/jpeg', 0.82))
      if (quadro) quadros.push(quadro)
    }
    return quadros
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

/* ---------------------------------------------------------- preparo */

const LIMITE_BYTES = 25 * 1024 * 1024

/**
 * Prepara um arquivo escolhido pelo colaborador.
 *
 * Vídeo já sai com os quadros extraídos; o resto passa direto. Arquivo grande
 * demais é recusado aqui, antes de gastar a conexão da oficina.
 */
export async function prepararAnexo(arquivo: File): Promise<AnexoPreparado> {
  if (arquivo.size > LIMITE_BYTES) {
    throw new Error(`"${arquivo.name}" tem mais de 25 MB. Envie um arquivo menor.`)
  }
  const tipo = tipoDoArquivo(arquivo.type)
  const base: AnexoPreparado = {
    tipo,
    nome: arquivo.name,
    mime: arquivo.type || 'application/octet-stream',
    tamanho: arquivo.size,
    arquivo,
    previa: tipo === 'imagem' || tipo === 'video' ? URL.createObjectURL(arquivo) : null,
  }

  if (tipo === 'video') {
    base.quadros = await extrairQuadros(arquivo)
    if (base.quadros.length === 0) {
      throw new Error('Não consegui extrair imagens deste vídeo. Envie uma foto do problema.')
    }
  }
  return base
}
