import { useCallback, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Arte 3D com recuo para o ícone de linha.
 *
 * As imagens dos veículos e das ocorrências são geradas fora do projeto (ver
 * `design/prompts-3d-app.md`) e chegam aos poucos: primeiro o cavalo, depois
 * a carreta, e assim por diante. Esta peça existe para que isso não vire um
 * problema de cronograma.
 *
 * Enquanto o arquivo não está lá, a tela mostra o ícone de linha de sempre e
 * ninguém vê nada quebrado — nem um quadrado vazio, nem o ícone de imagem
 * partida do navegador. Quando o arquivo aparece na pasta, a tela passa a
 * mostrá-lo sozinha, sem deploy de código e sem lista de "quais já chegaram"
 * para alguém manter em dia (e esquecer de atualizar).
 *
 * O recuo acontece no `onError` do próprio `img`: é o navegador quem decide,
 * então vale para arquivo que não existe, que veio corrompido ou que o
 * service worker não conseguiu buscar offline.
 */
export function Arte({
  src,
  alt,
  recuo,
  className,
  classeImagem,
}: {
  /** Caminho do PNG. Pode não existir — é esse o ponto. */
  src: string
  /** Vazio quando a arte é decorativa e o texto ao lado já diz o que é. */
  alt: string
  /** O que mostrar enquanto o arquivo não existe. */
  recuo: ReactNode
  className?: string
  classeImagem?: string
}) {
  const [falhou, setFalhou] = useState(false)
  const [pronta, setPronta] = useState(false)

  /**
   * Imagem que veio do CACHE termina de carregar antes de o React pendurar o
   * `onLoad` — e aí o evento nunca dispara. Como a arte só fica visível
   * depois de `pronta`, ela sumia para sempre a partir da segunda visita,
   * que é justamente o caso comum. Esta função roda quando o elemento entra
   * no DOM e pergunta ao próprio `img` se ele já está pronto, em vez de
   * esperar por um evento que já passou.
   */
  const aoMontar = useCallback((el: HTMLImageElement | null) => {
    if (!el) return
    if (el.complete) {
      if (el.naturalWidth > 0) setPronta(true)
      else setFalhou(true)
    }
  }, [])

  if (falhou) return <>{recuo}</>
  return (
    <span className={cn('contents', className)}>
      <img
        ref={aoMontar}
        src={src}
        alt={alt}
        /* Eager de propósito: estas artes NÃO são enfeite de rodapé — são o
           conteúdo de um estado vazio ou o pino de um mapa, já dentro da
           dobra. Com `lazy`, o lugar delas ficava um buraco visível por
           alguns segundos, que é pior do que os 20 KB que ela economiza. */
        loading="eager"
        fetchpriority="low"
        decoding="async"
        draggable={false}
        onError={() => setFalhou(true)}
        onLoad={() => setPronta(true)}
        /* `data-pronta` só aparece depois que o arquivo carregou de fato.
           Sem isso, uma regra como `:has(.arte)` casaria já durante a
           tentativa de carregar — e o layout encolheria e voltaria a cada
           render enquanto a arte não existisse, que é o estado NORMAL
           enquanto as imagens não foram geradas. */
        data-pronta={pronta || undefined}
        className={cn('select-none object-contain transition-opacity duration-200', pronta ? 'opacity-100' : 'opacity-0', classeImagem)}
      />
    </span>
  )
}
