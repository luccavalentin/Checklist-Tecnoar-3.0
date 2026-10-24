import type { PedidoPendente } from './filaSOS'

/**
 * Pedir socorro quando a internet acabou.
 *
 * SOBRE SATÉLITE, QUE É O QUE SEMPRE PERGUNTAM
 *
 * Um aplicativo de loja NÃO consegue transmitir por satélite. No iOS a API de
 * satélite para terceiros não existe publicamente; no Android as APIs de
 * satélite são de sistema e a permissão fica com fabricante e operadora. O
 * caminho de terceiros que existe hoje é mediado por operadora, e fora do
 * Brasil. Prometer satélite aqui seria mentir para quem está no acostamento.
 *
 * O QUE FUNCIONA DE VERDADE, EM ORDEM
 *
 * 1. DADOS. O pedido normal. Quando não há, ele fica guardado no aparelho e
 *    sai sozinho na volta do sinal (filaSOS.ts). Isso já existia.
 *
 * 2. SMS. É o degrau que faltava, e é o que mais importa na estrada: a rede
 *    de voz e SMS alcança onde os dados já morreram, e aguenta sinal fraco
 *    que uma requisição HTTP nunca completaria. O aplicativo monta a
 *    mensagem e entrega pronta ao aparelho; quem envia é a pessoa, num
 *    toque.
 *
 * 3. SATÉLITE, PELO CAMINHO HONESTO. Num iPhone 14 ou superior, e nos
 *    Android recentes com mensagem por satélite, é o APLICATIVO DE MENSAGENS
 *    DO PRÓPRIO CELULAR que fala com o satélite quando não há torre. Como o
 *    degrau 2 entrega a mensagem a ele já escrita, o pedido sai por satélite
 *    sem que a Tecnoar precise de nada — nem contrato, nem API, nem antena.
 *    Não dá para prometer, porque depende do aparelho e do país; dá para
 *    deixar pronto, que é o que fazemos.
 *
 * 4. VOZ. Ligar. Sempre visível, e promovido quando não há dados.
 *
 * POR QUE A MENSAGEM É FEIA DE PROPÓSITO
 *
 * Sem acento, sem emoji, sem "·". Um SMS só com caracteres GSM-7 cabe em 160
 * caracteres; um único "é" joga a mensagem para UCS-2 e o limite cai para 70,
 * partindo em duas — e duas partes são duas chances de uma se perder num
 * sinal ruim. Numa ligação por satélite, onde cada byte é caro e lento, isso
 * deixa de ser economia e vira a diferença entre chegar e não chegar.
 */

/** Tira acento e qualquer coisa fora do GSM-7, que dobraria o tamanho do SMS. */
function soGsm7(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E\n]/g, '')
}

/**
 * Código curto do pedido, estável para o mesmo pedido.
 *
 * Serve para a central casar as duas vias: se o SMS chegar E a fila disparar
 * quando o sinal voltar, o mesmo código aparece nos dois, e ninguém abre dois
 * atendimentos para o mesmo caminhão parado.
 */
export function referencia(p: PedidoPendente, usuarioId: string | null): string {
  const semente = `${usuarioId ?? ''}|${p.guardadoEm}`
  let h = 0x811c9dc5
  for (let i = 0; i < semente.length; i++) {
    h ^= semente.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(36).toUpperCase().slice(-4).padStart(4, '0')
}

/** Coordenada com 5 casas: ~1 m de resolucao, e 2 caracteres a menos que 6. */
function coord(n: number): string {
  return n.toFixed(5)
}

/**
 * A mensagem. Legível por uma pessoa na central E recortável por máquina: o
 * prefixo `SOS TECNOAR` e a linha de coordenada têm formato fixo, então o dia
 * em que a Tecnoar contratar um recebedor de SMS, o mesmo texto já serve sem
 * mudar nada no aplicativo.
 */
export function mensagemSocorro(p: PedidoPendente, usuarioId: string | null, nome: string): string {
  const { pedido, resumo } = p
  const ref = referencia(p, usuarioId)
  const quem = [nome.split(/\s+/).slice(0, 2).join(' '), pedido.telefone_contato].filter(Boolean).join(' ')
  const veiculo = [resumo.placa, resumo.problema].filter(Boolean).join(' ')
  const onde =
    pedido.latitude != null && pedido.longitude != null
      ? `${coord(pedido.latitude)},${coord(pedido.longitude)}`
      : null

  const linhas = [
    `SOS TECNOAR ${ref}`,
    quem,
    veiculo,
    onde,
    onde ? `maps.google.com/?q=${onde}` : resumo.endereco,
  ]
  return soGsm7(linhas.filter(Boolean).join('\n')).slice(0, 300)
}

/** iOS quis `&` por muito tempo; Android sempre quis `?`. Erra um, não envia. */
function ehApple(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** Link que abre o aplicativo de mensagens do aparelho com o texto pronto. */
export function linkSms(numero: string | null, corpo: string): string {
  const destino = (numero ?? '').replace(/[^\d+]/g, '')
  return `sms:${destino}${ehApple() ? '&' : '?'}body=${encodeURIComponent(corpo)}`
}

/**
 * Este aparelho pode ter mensagem por satélite?
 *
 * Não existe jeito de PERGUNTAR isso ao navegador — nem no iOS nem no
 * Android. O que dá para saber é se o aparelho é de uma geração em que o
 * recurso existe, e isso só serve para decidir se vale explicar o caminho na
 * tela. A tela nunca afirma que vai funcionar: diz o que tentar, e por quê.
 */
export function podeTerSatelite(): boolean {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) {
    // iOS 18+ é onde "Mensagens via satélite" existe. Abaixo disso, só o SOS
    // de emergência, que não é nosso caso.
    const m = /OS (\d+)[._]/.exec(ua)
    return !m || Number(m[1]) >= 18
  }
  if (/Android/.test(ua)) {
    const m = /Android (\d+)/.exec(ua)
    return !m || Number(m[1]) >= 15
  }
  return false
}
