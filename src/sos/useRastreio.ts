import { useEffect, useRef, useState } from 'react'
import { acompanharPosicao, type ErroGPS, type LeituraGPS } from './geo'
import { sosAtualizarPosicaoMecanico, sosRegistrarPosicao } from './api'
import { liberarTela, manterTelaAcesa } from './alerta'

/**
 * Envia a posição do aparelho enquanto o chamado está em andamento.
 *
 * - Mecânico: a cada ~25 m ou 15 s — é o que move o pino no mapa do cliente
 *   e recalcula a previsão de chegada no servidor.
 * - Cliente: a cada ~50 m ou 60 s — o caminhão pode ter andado até um lugar
 *   seguro, e o pino do mecânico precisa ir junto.
 *
 * Falha de rede não para o rastreio: a leitura seguinte tenta de novo. O
 * último erro fica exposto para a tela avisar ("sem sinal").
 */
export function useRastreioChamado(
  chamadoId: string | null | undefined,
  ativo: boolean,
  papel: 'mecanico' | 'cliente',
): { posicao: LeituraGPS | null; erroGps: ErroGPS | null; semRede: boolean } {
  const [posicao, setPosicao] = useState<LeituraGPS | null>(null)
  const [erroGps, setErroGps] = useState<ErroGPS | null>(null)
  const [semRede, setSemRede] = useState(false)
  const enviando = useRef(false)

  useEffect(() => {
    if (!chamadoId || !ativo) return
    const parar = acompanharPosicao(
      async (l) => {
        setPosicao(l)
        setErroGps(null)
        if (enviando.current) return
        enviando.current = true
        try {
          await sosRegistrarPosicao(chamadoId, {
            lat: l.lat,
            lng: l.lng,
            precisao: l.precisao,
            velocidade: l.velocidade,
            rumo: l.rumo,
          })
          setSemRede(false)
        } catch {
          setSemRede(true)
        } finally {
          enviando.current = false
        }
      },
      (e) => setErroGps(e),
      // Mecânico: a cada 8 s no máximo — o cliente vê o carrinho andar e cada
      // ponto é uma gravação no banco e um aviso em tempo real para a central.
      // No app nativo segue com a tela desligada, com aviso fixo na notificação.
      papel === 'mecanico'
        ? {
            minMetros: 25,
            maxIntervaloMs: 15000,
            minIntervaloMs: 8000,
            segundoPlano: { titulo: 'Atendimento em andamento', mensagem: 'O cliente acompanha sua chegada pelo SOS Tecnoar.' },
          }
        : {
            minMetros: 50,
            maxIntervaloMs: 60000,
            minIntervaloMs: 10000,
            segundoPlano: { titulo: 'Socorro em andamento', mensagem: 'O mecânico da Tecnoar acompanha onde você está.' },
          },
    )

    // Tela acesa enquanto dirige / espera — e de novo quando o app volta.
    void manterTelaAcesa()
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') void manterTelaAcesa()
    }
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      parar()
      document.removeEventListener('visibilitychange', aoVoltar)
      void liberarTela()
    }
  }, [chamadoId, ativo, papel])

  return { posicao, erroGps, semRede }
}

/**
 * Mecânico disponível, sem chamado: posição de tempos em tempos para aparecer
 * no mapa da central e entrar no cálculo do despacho. Bem mais espaçado —
 * ninguém precisa do mecânico parado atualizando a cada metro.
 */
export function useRastreioDisponivel(ativo: boolean): { posicao: LeituraGPS | null; erroGps: ErroGPS | null } {
  const [posicao, setPosicao] = useState<LeituraGPS | null>(null)
  const [erroGps, setErroGps] = useState<ErroGPS | null>(null)

  useEffect(() => {
    if (!ativo) return
    const parar = acompanharPosicao(
      (l) => {
        setPosicao(l)
        setErroGps(null)
        void sosAtualizarPosicaoMecanico(l.lat, l.lng, l.precisao).catch(() => {})
      },
      (e) => setErroGps(e),
      {
        minMetros: 150,
        maxIntervaloMs: 120000,
        minIntervaloMs: 20000,
        segundoPlano: { titulo: 'Você está disponível', mensagem: 'A central vê sua posição para mandar o chamado mais perto.' },
      },
    )
    return parar
  }, [ativo])

  return { posicao, erroGps }
}
