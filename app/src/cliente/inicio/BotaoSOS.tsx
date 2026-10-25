import { useEffect, useRef, type CSSProperties } from 'react'
import { CloudOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ARTE3D, sumirSeFalhar } from '../../comum/kit3d'
import './botaoSOS.css'

/**
 * O que a peça está dizendo.
 *
 * `pronto`     — duas batidas curtas, uma pausa, esperando o toque.
 * `vivo`       — socorro em andamento: para de chamar e passa a informar.
 * `sem-sinal`  — o instrumento tem energia, o canal é que morreu. A peça
 *                esfria e o aro varre atrás de rede. Mesma peça, outro
 *                estado: trocar o objeto quando o estado muda obrigaria a
 *                pessoa a reaprender a tela justo na pior hora dela.
 */
export type ModoSOS = 'pronto' | 'vivo' | 'sem-sinal'

/**
 * O botão de socorro.
 *
 * O DESENHO, E POR QUÊ
 *
 * Quem abre esta tela pode estar parado no acostamento, no escuro, com pressa
 * e com medo. O alvo precisa se achar sem ler e sem mirar, e precisa parecer
 * equipamento sério — não enfeite de aplicativo.
 *
 * 1. É UM BOTÃO DE EMERGÊNCIA DE VERDADE. Carcaça de alumínio usinado com
 *    serrilhado, canal de luz ciano embutido e cúpula laranja em verniz
 *    espesso. O material vem da marca: ciano e laranja são as cores da
 *    Tecnoar, e metal usinado é o que a oficina faz o dia inteiro.
 *
 * 2. A MARCA E O TEXTO NÃO ESTÃO NA IMAGEM. A logo é o SVG oficial e o "SOS"
 *    é HTML, os dois por cima da peça. Saem nítidos em qualquer densidade de
 *    tela, o leitor de tela encontra, e se a arte não carregar o aro de
 *    reserva do CSS mantém um alvo laranja redondo com a marca legível.
 *    Pedido de socorro não pode depender de um arquivo. Gerar a logo dentro
 *    da imagem seria pior de todo jeito: modelo de imagem deforma marca.
 *
 *    A peça foi renderizada com a face CHAPADA de propósito — uma cúpula
 *    abaulada e espelhada entortaria a logo e roubaria o contraste do texto.
 *
 * 3. MOVIMENTO LENTO. O brilho respira em 3,4s e as duas ondas saem com saída
 *    longa, uma laranja e uma ciano. Pulso rápido é brinquedo; o que transmite
 *    prontidão é a batida calma de um equipamento ligado. Em
 *    `prefers-reduced-motion` tudo para e o botão continua inteiro, porque a
 *    profundidade está na luz da peça, não na animação.
 */
export function BotaoSOS({
  aoTocar,
  modo = 'pronto',
  className,
  style,
}: {
  /** Sem `aoTocar`, é só o desenho. */
  aoTocar?: () => void
  modo?: ModoSOS
  className?: string
  style?: CSSProperties
}) {
  const vivo = modo === 'vivo'
  const semSinal = modo === 'sem-sinal'
  const botao = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const el = botao.current
    if (!el) return
    let visivel = true
    const atualizar = () => {
      el.dataset.motionPaused = String(!visivel || document.hidden)
    }
    const observador = new IntersectionObserver(([entrada]) => {
      visivel = entrada.isIntersecting
      atualizar()
    })
    observador.observe(el)
    document.addEventListener('visibilitychange', atualizar)
    atualizar()
    return () => {
      observador.disconnect()
      document.removeEventListener('visibilitychange', atualizar)
    }
  }, [])

  const miolo = (
    <>
      <span aria-hidden className="b3d-brilho" />
      <span aria-hidden className="b3d-onda" />
      <span aria-hidden className="b3d-onda b3d-onda-2" />
      <img
        src={ARTE3D.botaoSOS}
        alt=""
        aria-hidden="true"
        width={898}
        height={931}
        fetchpriority="high"
        decoding="async"
        draggable={false}
        onError={sumirSeFalhar}
        className="b3d-peca"
      />
      <span className="b3d-letras">
        <img src="/brand/tecnoar-negativo.svg" alt="" aria-hidden="true" draggable={false} className="b3d-logo" />
        {semSinal ? (
          <CloudOff aria-hidden className="b3d-icone size-7" strokeWidth={1.8} />
        ) : (
          <span className="b3d-sos">{vivo ? 'AO VIVO' : 'SOS'}</span>
        )}
      </span>
    </>
  )

  const classe = cn('b3d', modo === 'pronto' && 'b3d-pronto', vivo && 'b3d-vivo', semSinal && 'b3d-frio', className)
  if (!aoTocar) {
    return (
      <span aria-hidden className={classe} style={style}>
        {miolo}
      </span>
    )
  }
  return (
    <button
      ref={botao}
      type="button"
      onClick={aoTocar}
      aria-label={
        vivo
          ? 'Acompanhar o socorro em andamento'
          : semSinal
            ? 'Sem sinal: ver como enviar o pedido'
            : 'Pedir socorro'
      }
      className={classe}
      style={style}
    >
      {miolo}
    </button>
  )
}
