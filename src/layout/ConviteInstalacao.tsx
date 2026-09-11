import { Fragment, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ArrowDown, Check, ChevronRight, Compass, Copy, Download, Share, SquarePlus, X } from 'lucide-react'
import { Botao } from '@/componentes/ui/Botao'
import { Modal } from '@/componentes/ui/Sobreposicoes'

/**
 * Convite para instalar o aplicativo.
 *
 * O navegador não instala nada sozinho: ele dispara `beforeinstallprompt` e
 * espera que a página decida o momento de convidar. Sem ninguém escutando esse
 * evento, o convite simplesmente nunca aparece.
 *
 * O evento chega uma vez só, logo depois do carregamento — quando a tela ainda
 * é a de login. Quem escuta precisa existir antes disso, e continuar existindo
 * depois: entrar no sistema é navegação do React Router, não recarga, e o
 * navegador não repete o convite. Por isso a escuta começa aqui, no módulo,
 * assim que o `main.tsx` o importa, e o evento fica guardado até que exista
 * tela para mostrá-lo.
 *
 * Regras de convivência:
 * - Só no celular e no tablet. No desktop a instalação muda pouco, e o convite
 *   do próprio navegador (o ícone na barra de endereço) basta — por isso lá o
 *   evento nem é interceptado.
 * - Some para sempre depois de instalar, e por 30 dias se for dispensado.
 *   Insistir num convite recusado é a forma mais rápida de ensinar a equipe a
 *   ignorar avisos do sistema — inclusive os importantes.
 * - Dispensar o convite não tira o caminho: "Instalar aplicativo" continua no
 *   menu da conta (`useInstalacao`).
 */

const CHAVE_ADIADO = 'tecnoar.instalacao.adiada'
const DIAS_DE_PAUSA = 30
const LARGURA_DESKTOP = 1024

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/* ── Estado do módulo ──────────────────────────────────────────────────────
   Vive fora do React porque o evento chega antes de qualquer tela montar. */

let eventoGuardado: EventoInstalacao | null = null
let guiaAberto = false
const ouvintes = new Set<() => void>()

function avisarOuvintes() {
  for (const ouvinte of ouvintes) ouvinte()
}

function assinar(ouvinte: () => void) {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

function ehDesktop(): boolean {
  return window.innerWidth >= LARGURA_DESKTOP
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // No desktop, deixa o navegador oferecer do jeito dele: interceptar sem
    // ter o que mostrar no lugar seria remover a única forma de instalar.
    if (ehDesktop()) return
    e.preventDefault()
    eventoGuardado = e as EventoInstalacao
    avisarOuvintes()
  })

  window.addEventListener('appinstalled', () => {
    eventoGuardado = null
    avisarOuvintes()
  })
}

/* ── Regras de exibição ────────────────────────────────────────────────── */

function adiadoRecentemente(): boolean {
  try {
    const quando = localStorage.getItem(CHAVE_ADIADO)
    if (!quando) return false
    const dias = (Date.now() - Number(quando)) / 86_400_000
    return dias < DIAS_DE_PAUSA
  } catch {
    /* Armazenamento bloqueado: melhor convidar do que travar. */
    return false
  }
}

function jaInstalado(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

/**
 * iOS não tem `beforeinstallprompt`: nenhuma página consegue pedir instalação
 * lá, nem com um toque. O caminho é manual, pelo menu de compartilhamento —
 * então em vez de um botão que não existiria, o convite vira instrução.
 */
function ehIOS(): boolean {
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  // iPad recente se apresenta como Mac; o toque é o que o denuncia.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
}

/**
 * Onde a página está aberta no iPhone. Muda tudo nas instruções:
 * - `safari`: o único que instala com certeza.
 * - `outro-navegador`: Chrome, Firefox, Edge… Instalam pelo Compartilhar do
 *   próprio navegador desde o iOS 16.4, mas o caminho varia de app para app.
 * - `embutido`: o link foi aberto dentro do WhatsApp, Instagram, Gmail etc.
 *   Esse navegador de dentro do app não tem "Adicionar à Tela de Início" —
 *   é a causa mais comum de "não consigo instalar". Precisa ir para o Safari.
 */
type NavegadorIOS = 'safari' | 'outro-navegador' | 'embutido'

function navegadorIOS(): NavegadorIOS {
  const ua = navigator.userAgent
  if (/FBAN|FBAV|FB_IAB|Instagram|WhatsApp|LinkedInApp|Line\/|Snapchat|musical_ly|TikTok|Twitter|GSA\//.test(ua)) {
    return 'embutido'
  }
  if (/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|Brave/.test(ua)) return 'outro-navegador'
  // Visualizador dentro de app sem identificação: não se diz Safari.
  if (!/Safari\//.test(ua)) return 'embutido'
  return 'safari'
}

/**
 * No Safari do iOS 26 o botão Compartilhar saiu da barra e foi para dentro do
 * menu "•••". O `User-Agent` congelou a versão do sistema em 18, mas o
 * `Version/` do Safari continua acompanhando o iOS.
 */
function safariNovo(): boolean {
  const versao = /Version\/(\d+)/.exec(navigator.userAgent)
  return versao ? Number(versao[1]) >= 26 : false
}

/* ── API para o resto do sistema ───────────────────────────────────────── */

function abrirGuia() {
  guiaAberto = true
  avisarOuvintes()
}

function fecharGuia() {
  guiaAberto = false
  avisarOuvintes()
}

async function instalarAgora(): Promise<void> {
  const evento = eventoGuardado
  if (!evento) {
    abrirGuia()
    return
  }
  await evento.prompt()
  await evento.userChoice
  /* O evento serve uma vez só: depois de usado, não pode ser reaproveitado. */
  eventoGuardado = null
  avisarOuvintes()
}

/**
 * Para o menu da conta: diz se ainda há o que instalar e faz o melhor que o
 * aparelho permite — a janela nativa no Android, o passo a passo no iPhone.
 */
export function useInstalacao() {
  const evento = useSyncExternalStore(assinar, () => eventoGuardado)
  const disponivel = !jaInstalado() && (evento !== null || ehIOS())
  return { disponivel, instalar: () => void instalarAgora() }
}

/* ── Passos, por aparelho ──────────────────────────────────────────────────
   Cada passo mostra o botão como ele aparece na tela do iPhone: a pessoa
   procura um desenho, não uma palavra. */

type Glifo = 'mais' | 'compartilhar' | 'adicionar' | 'safari' | 'confirmar'

interface PassoInstalacao {
  glifo: Glifo
  /** Rótulo curto do convite — cabe em três colunas de 375px. */
  curto: string
  /** Frase completa do guia. */
  completo: ReactNode
}

type Cenario = 'safari-novo' | 'safari' | 'outro-navegador' | 'embutido'

function cenarioAtual(): Cenario {
  const onde = navegadorIOS()
  if (onde === 'safari') return safariNovo() ? 'safari-novo' : 'safari'
  return onde
}

const PASSOS: Record<Cenario, PassoInstalacao[]> = {
  'safari-novo': [
    { glifo: 'mais', curto: 'Toque em •••', completo: <>Toque em <b>•••</b>, no canto de baixo, ao lado do endereço.</> },
    { glifo: 'compartilhar', curto: 'Compartilhar', completo: <>Toque em <b>Compartilhar</b>.</> },
    {
      glifo: 'adicionar',
      curto: 'Adicionar à Tela de Início',
      completo: (
        <>
          Toque em <b>Adicionar à Tela de Início</b>. Se não aparecer, toque antes em <b>Ver Mais</b>.
        </>
      ),
    },
    {
      glifo: 'confirmar',
      curto: 'Adicionar',
      completo: (
        <>
          Deixe <b>Abrir como App da Web</b> ligado e toque em <b>Adicionar</b>.
        </>
      ),
    },
  ],
  safari: [
    {
      glifo: 'compartilhar',
      curto: 'Compartilhar',
      completo: <>Toque em <b>Compartilhar</b>, o quadrado com a seta, no meio da barra de baixo.</>,
    },
    {
      glifo: 'adicionar',
      curto: 'Adicionar à Tela de Início',
      completo: <>Role a lista e toque em <b>Adicionar à Tela de Início</b>.</>,
    },
    { glifo: 'confirmar', curto: 'Adicionar', completo: <>Toque em <b>Adicionar</b>, no canto de cima.</> },
  ],
  'outro-navegador': [
    {
      glifo: 'compartilhar',
      curto: 'Compartilhar',
      completo: <>Toque em <b>Compartilhar</b>, na barra do endereço.</>,
    },
    {
      glifo: 'adicionar',
      curto: 'Adicionar à Tela de Início',
      completo: (
        <>
          Toque em <b>Adicionar à Tela de Início</b>. Se a opção não existir, abra o endereço no <b>Safari</b>.
        </>
      ),
    },
    { glifo: 'confirmar', curto: 'Adicionar', completo: <>Toque em <b>Adicionar</b>.</> },
  ],
  embutido: [
    { glifo: 'mais', curto: 'Toque em •••', completo: <>Toque em <b>•••</b> ou em <b>Compartilhar</b>.</> },
    { glifo: 'safari', curto: 'Abrir no Safari', completo: <>Escolha <b>Abrir no Safari</b>.</> },
    {
      glifo: 'adicionar',
      curto: 'Adicionar à Tela de Início',
      completo: <>Já no Safari, siga o passo a passo para <b>Adicionar à Tela de Início</b>.</>,
    },
  ],
}

/** O botão do iPhone, desenhado. */
function BotaoDoIPhone({ glifo, tamanho = 'md' }: { glifo: Glifo; tamanho?: 'sm' | 'md' }) {
  const caixa = tamanho === 'md' ? 'size-10' : 'size-9'
  const icone = '[&>svg]:size-[18px] [&>svg]:stroke-[1.9]'
  return (
    <span
      aria-hidden
      className={
        `${caixa} ${icone} flex shrink-0 items-center justify-center border border-line-strong bg-surface text-ink shadow-e1 ` +
        (glifo === 'mais' ? 'rounded-full' : 'rounded-[10px]')
      }
    >
      {glifo === 'mais' && <span className="-mt-1 text-[15px] leading-none font-bold tracking-[0.08em]">•••</span>}
      {glifo === 'compartilhar' && <Share />}
      {glifo === 'adicionar' && <SquarePlus />}
      {glifo === 'safari' && <Compass />}
      {glifo === 'confirmar' && <Check />}
    </span>
  )
}

function IconeDoApp({ className = 'size-11' }: { className?: string }) {
  /* O mesmo ícone que vai para a tela do iPhone: mostra o que vai aparecer. */
  return (
    <img
      src="/apple-touch-icon.png"
      alt=""
      className={`${className} shrink-0 rounded-[22%] shadow-e1 ring-1 ring-black/5`}
    />
  )
}

/* ── Convite ───────────────────────────────────────────────────────────── */

export function ConviteInstalacao() {
  const evento = useSyncExternalStore(assinar, () => eventoGuardado)
  const guia = useSyncExternalStore(assinar, () => guiaAberto)
  const [candidato] = useState(() => !jaInstalado() && !adiadoRecentemente())
  const [instrucaoIOS, setInstrucaoIOS] = useState(false)
  const [dispensado, setDispensado] = useState(false)

  useEffect(() => {
    if (!candidato) return
    /* No iOS não há evento para esperar. O atraso evita que a primeira coisa
       vista no sistema seja um pedido de instalação. */
    if (!ehIOS() || ehDesktop()) return
    const relogio = window.setTimeout(() => setInstrucaoIOS(true), 4000)
    return () => window.clearTimeout(relogio)
  }, [candidato])

  const convite = candidato && !dispensado && !guia && (evento !== null || instrucaoIOS)

  function dispensar() {
    try {
      localStorage.setItem(CHAVE_ADIADO, String(Date.now()))
    } catch {
      /* Sem armazenamento o convite volta na próxima visita. Aceitável. */
    }
    setDispensado(true)
  }

  return (
    <>
      {convite &&
        (evento ? (
          <ConviteAndroid
            aoInstalar={() => {
              /* O convite do Android é de uso único. */
              setDispensado(true)
              void instalarAgora()
            }}
            aoDispensar={dispensar}
          />
        ) : (
          <ConviteIPhone aoDispensar={dispensar} />
        ))}

      <GuiaInstalacaoIOS aberto={guia} aoFechar={fecharGuia} />
    </>
  )
}

/** Cartão flutuante: acima da barra de ações da OS e do indicador de início. */
const CARTAO =
  'entrada-suave fixed inset-x-3 z-[60] mx-auto max-w-md rounded-2xl border border-line-strong bg-surface shadow-e3 lg:hidden'
const POSICAO = { bottom: 'calc(max(var(--barra-acoes, 0px), env(safe-area-inset-bottom)) + 0.75rem)' }

function BotaoFechar({ aoClicar }: { aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-label="Agora não"
      className="-mt-1 -mr-1 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
    >
      <X aria-hidden className="size-4" />
    </button>
  )
}

function ConviteAndroid({ aoInstalar, aoDispensar }: { aoInstalar: () => void; aoDispensar: () => void }) {
  return (
    <div role="dialog" aria-label="Instalar aplicativo" className={`${CARTAO} flex items-center gap-3 p-3`} style={POSICAO}>
      <IconeDoApp />
      <div className="min-w-0 flex-1">
        <p className="font-display text-[14px] font-semibold text-ink">Instale o app Tecnoar</p>
        <p className="text-[12px] leading-snug text-ink-3">Ícone na tela e abre em tela cheia.</p>
      </div>
      <Botao tamanho="sm" variante="primario" iconeInicio={<Download aria-hidden />} onClick={aoInstalar}>
        Instalar
      </Botao>
      <BotaoFechar aoClicar={aoDispensar} />
    </div>
  )
}

function ConviteIPhone({ aoDispensar }: { aoDispensar: () => void }) {
  const cenario = cenarioAtual()
  const passos = PASSOS[cenario].slice(0, 3)
  /* Só onde a barra do Safari fica embaixo dá para apontar o botão certo. */
  const noIPhone = /iPhone|iPod/.test(navigator.userAgent)
  const seta = !noIPhone ? null : cenario === 'safari-novo' ? 'direita' : cenario === 'safari' ? 'centro' : null

  return (
    <div role="dialog" aria-label="Como instalar o aplicativo" className={`${CARTAO} p-4`} style={POSICAO}>
      <div className="flex items-start gap-3">
        <IconeDoApp />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[14.5px] leading-tight font-semibold text-ink">
            {cenario === 'embutido' ? 'Abra no Safari para instalar' : 'Instale o app no seu iPhone'}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-3">
            {cenario === 'embutido'
              ? 'Dentro deste aplicativo o iPhone não deixa instalar.'
              : 'Ícone na tela de início e abre em tela cheia.'}
          </p>
        </div>
        <BotaoFechar aoClicar={aoDispensar} />
      </div>

      <ol className="mt-3.5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-start gap-x-1">
        {passos.map((p, i) => (
          <Fragment key={p.curto}>
            {i > 0 && <ChevronRight aria-hidden className="mt-3 size-4 text-ink-3" />}
            <li className="flex min-w-0 flex-col items-center gap-1.5 text-center">
              <span className="relative">
                <BotaoDoIPhone glifo={p.glifo} />
                <span className="absolute -top-1.5 -left-1.5 flex size-[18px] items-center justify-center rounded-full bg-accent font-display text-[10px] font-bold text-on-accent ring-2 ring-surface">
                  {i + 1}
                </span>
              </span>
              <span className="text-[11.5px] leading-tight font-medium text-balance text-ink-2">{p.curto}</span>
            </li>
          </Fragment>
        ))}
      </ol>

      <button
        type="button"
        onClick={abrirGuia}
        className="mt-3 w-full rounded-md py-1 text-center text-[12px] font-medium text-cyan-ink underline-offset-2 hover:underline"
      >
        Não encontrou? Ver passo a passo com detalhes
      </button>

      {/* Aponta para o botão do Safari, que fica logo abaixo da tela. */}
      {seta && (
        <span
          aria-hidden
          className={
            'absolute top-full flex size-5 items-center justify-center text-accent ' +
            (seta === 'direita' ? 'right-[2.1rem]' : 'left-1/2 -ml-2.5')
          }
        >
          <ArrowDown className="size-5 animate-bounce stroke-[2.5] motion-reduce:animate-none" />
        </span>
      )}
    </div>
  )
}

/* ── Guia completo ─────────────────────────────────────────────────────── */

function GuiaInstalacaoIOS({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  if (!aberto) return null

  const cenario = cenarioAtual()
  const endereco = window.location.origin

  async function copiarEndereco() {
    try {
      await navigator.clipboard.writeText(endereco)
      setCopiado(true)
    } catch {
      /* Área de transferência bloqueada: o endereço está escrito na tela. */
    }
  }

  const passosSafari = PASSOS[safariNovo() ? 'safari-novo' : 'safari']
  const passos = cenario === 'embutido' ? passosSafari : PASSOS[cenario]

  return (
    <Modal
      aberto
      aoFechar={() => {
        setCopiado(false)
        aoFechar()
      }}
      titulo="Instalar no iPhone"
      descricao="A Apple não deixa nenhum site instalar sozinho — são poucos toques, pelo Safari."
      rodape={
        <Botao variante="primario" onClick={aoFechar}>
          Entendi
        </Botao>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
          <IconeDoApp className="size-12" />
          <p className="text-[12.5px] leading-snug text-ink-2">
            No fim, este ícone aparece na tela do iPhone e o sistema abre em tela cheia, como um aplicativo.
          </p>
        </div>

        {cenario !== 'safari' && cenario !== 'safari-novo' && (
          <div className="flex flex-col gap-3 rounded-xl border border-warn/40 bg-warn-soft p-3.5">
            <p className="text-[13px] leading-relaxed text-ink-2">
              {cenario === 'embutido' ? (
                <>
                  Este link está aberto <b className="text-ink">dentro de outro aplicativo</b>, e daqui o iPhone não
                  deixa instalar. Toque em <b className="text-ink">•••</b> ou <b className="text-ink">Compartilhar</b> e
                  escolha <b className="text-ink">Abrir no Safari</b> — ou copie o endereço e cole no Safari.
                </>
              ) : (
                <>
                  O caminho garantido é o <b className="text-ink">Safari</b>. Se o seu navegador não tiver a opção,
                  copie o endereço e abra no Safari.
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface px-2.5 py-2 font-mono text-[12px] text-ink">
                {endereco}
              </code>
              <Botao tamanho="sm" iconeInicio={<Copy aria-hidden />} onClick={() => void copiarEndereco()}>
                {copiado ? 'Copiado' : 'Copiar'}
              </Botao>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {cenario === 'embutido' && <p className="lbl">Depois, já no Safari</p>}
          <ol className="flex flex-col">
            {passos.map((p, i) => (
              <li key={p.curto} className="relative flex gap-3.5 pb-4 last:pb-0">
                {/* Trilho entre os passos: lê-se como sequência, não como lista solta. */}
                {i < passos.length - 1 && (
                  <span aria-hidden className="absolute top-11 bottom-1 left-5 w-px bg-line-strong" />
                )}
                <span className="relative">
                  <BotaoDoIPhone glifo={p.glifo} />
                  <span className="absolute -top-1.5 -left-1.5 flex size-[18px] items-center justify-center rounded-full bg-accent font-display text-[10px] font-bold text-on-accent ring-2 ring-surface">
                    {i + 1}
                  </span>
                </span>
                <p className="pt-2 text-[13.5px] leading-relaxed text-ink-2 [&_b]:font-semibold [&_b]:text-ink">
                  {p.completo}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Modal>
  )
}
