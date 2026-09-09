import { cn } from '@/lib/utils'
import { useTema } from '@/tema/TemaProvider'

/**
 * Logo oficial Tecnoar Freios.
 *
 * Existem exatamente três versões oficiais, extraídas do vetor original:
 * negativa (fundos escuros), positiva (fundos claros) e monocromática.
 * Nenhum símbolo reduzido alternativo pode ser criado.
 */
export function Logo({
  versao,
  className,
  altura = 34,
}: {
  /** Deixe indefinido para acompanhar o tema em uso. */
  versao?: 'negativo' | 'positivo' | 'mono'
  className?: string
  altura?: number
}) {
  const { escuro } = useTema()
  const escolhida = versao ?? (escuro ? 'negativo' : 'positivo')

  return (
    <img
      src={`/brand/tecnoar-${escolhida}.svg`}
      alt="Tecnoar Freios"
      height={altura}
      style={{ height: altura }}
      className={cn('w-auto select-none', className)}
      draggable={false}
    />
  )
}

/** Versão fixa para superfícies sempre escuras (Modo TV, cabeçalhos navy). */
export function LogoNegativo({ className, altura = 34 }: { className?: string; altura?: number }) {
  return <Logo versao="negativo" className={className} altura={altura} />
}
