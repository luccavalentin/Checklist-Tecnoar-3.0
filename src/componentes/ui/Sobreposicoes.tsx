import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Botao, BotaoIcone } from './Botao'

/**
 * Fecha no Esc, trava a rolagem de fundo e devolve o foco ao fechar.
 *
 * O efeito depende apenas de `aberto`. As telas passam `aoFechar` como função
 * anônima, recriada a cada render — se ela entrasse nas dependências, cada
 * tecla digitada rodaria a limpeza, que devolve o foco ao elemento de origem
 * e tira o cursor do campo. A referência mantém a função sempre atual sem
 * reexecutar o efeito.
 */
function useSobreposicao(aberto: boolean, aoFechar: () => void) {
  const anterior = useRef<HTMLElement | null>(null)
  const fechar = useRef(aoFechar)
  fechar.current = aoFechar

  useEffect(() => {
    if (!aberto) return
    anterior.current = document.activeElement as HTMLElement | null

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar.current()
    }
    document.addEventListener('keydown', onKey)

    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      anterior.current?.focus?.()
    }
  }, [aberto])
}

/** Move o foco para dentro da sobreposição ao abrir. */
function useFocoInicial(aberto: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const alvo = ref.current?.querySelector<HTMLElement>(
      'input:not([type="hidden"]), textarea, select, button, [href], [tabindex]:not([tabindex="-1"])',
    )
    ;(alvo ?? ref.current)?.focus?.()
  }, [aberto])
  return ref
}

/**
 * Rodapé de ações das sobreposições.
 *
 * No celular as ações empilham em largura total — duas delas lado a lado em
 * 360px dão alvos de ~150px que a mão de luva erra, e rótulos como "Registrar
 * assinatura" ainda estouravam a linha. A ordem é invertida para a ação
 * primária (sempre a última no código) ficar em cima, como no padrão de
 * folha de ação do celular. A partir de `sm` volta a ser uma linha à direita.
 */
const RODAPE_ACOES = cn(
  'area-segura flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:px-6 sm:py-4',
  'sm:flex-row sm:flex-wrap sm:items-center sm:justify-end',
  '[&>*]:w-full sm:[&>*]:w-auto',
)

/** Cabeçalho e corpo compartilham o medianiz para os campos não desalinharem. */
const MEDIANIZ = 'px-5 sm:px-6'

/* ----------------------------------------------------------------- Modal */

export function Modal({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
  largura = 'md',
}: {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  descricao?: string
  children?: ReactNode
  rodape?: ReactNode
  largura?: 'sm' | 'md' | 'lg'
}) {
  useSobreposicao(aberto, aoFechar)
  const ref = useFocoInicial(aberto)
  if (!aberto) return null

  const larguras = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-overlay backdrop-blur-[2px]" onClick={aoFechar} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={cn(
          'entrada-suave relative flex max-h-[92dvh] w-full flex-col overflow-hidden bg-surface shadow-e3',
          /* Celular: folha encostada embaixo, sem borda lateral raspando a tela. */
          'rounded-t-2xl border-x-0 border-b-0 border-t border-line-strong',
          'sm:rounded-xl sm:border',
          larguras[largura],
        )}
      >
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-accent" />
        <div className={cn('flex items-start justify-between gap-4 border-b border-line bg-surface pt-5 pb-4', MEDIANIZ)}>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-display text-[15px] font-semibold text-ink">{titulo}</h2>
            {descricao && <p className="text-[13px] leading-relaxed text-ink-2">{descricao}</p>}
          </div>
          <BotaoIcone rotulo="Fechar" tamanho="sm" onClick={aoFechar}>
            <X />
          </BotaoIcone>
        </div>
        {children && <div className={cn('flex-1 overflow-y-auto py-5', MEDIANIZ)}>{children}</div>}
        {rodape && (
          <div className={RODAPE_ACOES}>{rodape}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------ Painel */

/**
 * Painel de formulário — um diálogo centralizado.
 *
 * Mantém o nome e a assinatura de sempre para não mexer nas dezenas de telas
 * que já o usam. No celular ocupa a tela inteira; a partir de `sm` vira um
 * cartão centrado que nunca passa da altura da janela: cabeçalho e rodapé
 * ficam fixos e só o miolo rola.
 */
export function PainelLateral({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  rodape,
  largura = 'md',
}: {
  aberto: boolean
  aoFechar: () => void
  titulo: string
  descricao?: string
  children: ReactNode
  rodape?: ReactNode
  largura?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  useSobreposicao(aberto, aoFechar)
  const ref = useFocoInicial(aberto)
  if (!aberto) return null

  const larguras = {
    sm: 'sm:max-w-md',
    md: 'sm:max-w-xl',
    lg: 'sm:max-w-3xl',
    xl: 'sm:max-w-5xl',
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-overlay backdrop-blur-[2px]" onClick={aoFechar} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={cn(
          'entrada-suave relative flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-surface shadow-e3',
          'border-line-strong sm:h-auto sm:max-h-[88dvh] sm:rounded-xl sm:border',
          larguras[largura],
        )}
      >
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-accent" />
        <div className={cn('flex shrink-0 items-start justify-between gap-4 border-b border-line bg-surface pt-5 pb-4', MEDIANIZ)}>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-display text-[15px] font-semibold text-ink">{titulo}</h2>
            {descricao && <p className="text-[13px] leading-relaxed text-ink-2">{descricao}</p>}
          </div>
          <BotaoIcone rotulo="Fechar" tamanho="sm" onClick={aoFechar}>
            <X />
          </BotaoIcone>
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto py-5', MEDIANIZ)}>{children}</div>
        {rodape && (
          <div className={cn(RODAPE_ACOES, 'shrink-0')}>{rodape}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/* ---------------------------------------------------------- Confirmação */

export function Confirmacao({
  aberto,
  aoFechar,
  aoConfirmar,
  titulo,
  descricao,
  rotuloConfirmar = 'Confirmar',
  rotuloCancelar = 'Cancelar',
  destrutivo = false,
  carregando = false,
}: {
  aberto: boolean
  aoFechar: () => void
  aoConfirmar: () => void
  titulo: string
  descricao: ReactNode
  rotuloConfirmar?: string
  rotuloCancelar?: string
  destrutivo?: boolean
  carregando?: boolean
}) {
  useSobreposicao(aberto, aoFechar)
  const ref = useFocoInicial(aberto)
  if (!aberto) return null

  return createPortal(
    <div className="fixed inset-0 z-60 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-overlay backdrop-blur-[2px]" onClick={aoFechar} aria-hidden />
      <div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className={cn(
          /* `overflow-hidden` é o que impede a faixa do topo de passar por cima
             do canto arredondado e da borda. Sem ele, a borda some ali. */
          'entrada-suave relative w-full max-w-md overflow-hidden bg-surface shadow-e3',
          'rounded-t-2xl border-x-0 border-b-0 border-t border-line-strong',
          'px-5 pb-5 pt-6 sm:rounded-xl sm:border sm:px-6 sm:pb-6',
        )}
      >
        <span aria-hidden className={cn('absolute inset-x-0 top-0 h-[3px]', destrutivo ? 'bg-crit' : 'bg-warn')} />
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-lg border [&_svg]:size-[18px]',
              destrutivo ? 'border-crit/35 bg-crit-soft text-crit' : 'border-warn/35 bg-warn-soft text-warn',
            )}
          >
            <AlertTriangle />
          </span>
          <div className="flex flex-col gap-1.5">
            <h2 className="font-display text-[15px] font-semibold text-ink">{titulo}</h2>
            <div className="text-[13px] leading-relaxed text-ink-2">{descricao}</div>
          </div>
        </div>
        <div className="area-segura mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
          <Botao variante="neutro" onClick={aoFechar} disabled={carregando}>
            {rotuloCancelar}
          </Botao>
          <Botao variante={destrutivo ? 'destrutivo' : 'primario'} onClick={aoConfirmar} carregando={carregando}>
            {rotuloConfirmar}
          </Botao>
        </div>
      </div>
    </div>,
    document.body,
  )
}
