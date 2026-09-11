import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Compass, Copy, Download, Share, SquarePlus, X } from 'lucide-react'
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

/* ── Tela ──────────────────────────────────────────────────────────────── */

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
      {convite && (
        <div
          role="dialog"
          aria-label="Instalar aplicativo"
          className="area-segura fixed inset-x-3 z-[60] flex items-center gap-3 rounded-xl border border-line-strong bg-surface p-3 shadow-e3 lg:hidden"
          /* Se a tela tem barra de ações fixa (a OS no celular), sobe acima dela. */
          style={{ bottom: 'calc(var(--barra-acoes, 0px) + 0.75rem)' }}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-ink">
            {evento ? <Download aria-hidden className="size-4" /> : <SquarePlus aria-hidden className="size-4" />}
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">Instalar o Tecnoar Checklist</p>
            <p className="text-[11.5px] leading-snug text-balance text-ink-3">
              {evento
                ? 'Abre em tela cheia e a câmera das evidências funciona melhor.'
                : 'No iPhone são três toques. Mostramos onde.'}
            </p>
          </div>

          <Botao
            tamanho="sm"
            onClick={() => {
              /* O convite do Android é de uso único; o do iPhone vira guia. */
              if (evento) setDispensado(true)
              void instalarAgora()
            }}
          >
            {evento ? 'Instalar' : 'Ver como'}
          </Botao>

          <button
            type="button"
            onClick={dispensar}
            aria-label="Agora não"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}

      <GuiaInstalacaoIOS aberto={guia} aoFechar={fecharGuia} />
    </>
  )
}

/* ── Passo a passo do iPhone ───────────────────────────────────────────── */

function Passo({ numero, children }: { numero: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-display text-[12px] font-bold text-accent-ink">
        {numero}
      </span>
      <p className="pt-0.5 text-[13.5px] leading-relaxed text-ink-2">{children}</p>
    </li>
  )
}

/** Ícone no meio da frase, do jeito que aparece na tela do iPhone. */
function Tecla({ icone, children }: { icone?: ReactNode; children: ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface-2 px-1.5 py-px align-middle text-[12.5px] font-semibold whitespace-nowrap text-ink [&>svg]:size-3.5">
      {icone}
      {children}
    </span>
  )
}

function GuiaInstalacaoIOS({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  if (!aberto) return null

  const onde = navegadorIOS()
  const endereco = window.location.origin

  async function copiarEndereco() {
    try {
      await navigator.clipboard.writeText(endereco)
      setCopiado(true)
    } catch {
      /* Área de transferência bloqueada: o endereço está escrito na tela. */
    }
  }

  const passosSafari = (
    <ol className="flex flex-col gap-3.5">
      {safariNovo() ? (
        <Passo numero={1}>
          Na barra do endereço, toque em <Tecla>•••</Tecla> e depois em{' '}
          <Tecla icone={<Share />}>Compartilhar</Tecla>.
        </Passo>
      ) : (
        <Passo numero={1}>
          Toque em <Tecla icone={<Share />}>Compartilhar</Tecla> na barra do Safari (o quadrado com a seta para cima).
          Se estiver no iOS 26, ele fica dentro do botão <Tecla>•••</Tecla>.
        </Passo>
      )}
      <Passo numero={2}>
        Role a lista e toque em <Tecla icone={<SquarePlus />}>Adicionar à Tela de Início</Tecla>. Se não aparecer, toque
        em <Tecla>Ver Mais</Tecla> primeiro.
      </Passo>
      <Passo numero={3}>
        Deixe <Tecla>Abrir como App da Web</Tecla> ligado, se aparecer, e toque em <Tecla>Adicionar</Tecla>. O ícone da
        Tecnoar aparece na tela do iPhone.
      </Passo>
    </ol>
  )

  const abrirNoSafari = (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-2 p-3.5">
      <p className="text-[13px] leading-relaxed text-ink-2">
        {onde === 'embutido' ? (
          <>
            Este link está aberto <strong className="text-ink">dentro de outro aplicativo</strong> (WhatsApp, Instagram,
            e-mail…), e daqui o iPhone não deixa instalar. Abra no Safari: procure{' '}
            <Tecla icone={<Compass />}>Abrir no Safari</Tecla> no menu <Tecla>•••</Tecla> ou{' '}
            <Tecla icone={<Share />}>Compartilhar</Tecla>, ou copie o endereço e cole no Safari.
          </>
        ) : (
          <>
            O jeito garantido é pelo <strong className="text-ink">Safari</strong>. No Chrome ou outro navegador, tente{' '}
            <Tecla icone={<Share />}>Compartilhar</Tecla> → <Tecla>Adicionar à Tela de Início</Tecla>; se não houver
            essa opção, copie o endereço e abra no Safari.
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-[12px] text-ink">
          {endereco}
        </code>
        <Botao tamanho="sm" variante="neutro" iconeInicio={<Copy aria-hidden />} onClick={() => void copiarEndereco()}>
          {copiado ? 'Copiado' : 'Copiar'}
        </Botao>
      </div>
    </div>
  )

  return (
    <Modal
      aberto
      aoFechar={() => {
        setCopiado(false)
        aoFechar()
      }}
      titulo="Instalar no iPhone"
      descricao="A Apple não permite instalar com um toque só: é pelo menu Compartilhar do Safari."
      rodape={<Botao onClick={aoFechar}>Entendi</Botao>}
    >
      <div className="flex flex-col gap-5">
        {onde !== 'safari' && abrirNoSafari}
        {onde === 'embutido' ? (
          <div className="flex flex-col gap-3">
            <p className="lbl">Depois, já no Safari</p>
            {passosSafari}
          </div>
        ) : (
          passosSafari
        )}
      </div>
    </Modal>
  )
}
