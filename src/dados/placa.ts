/**
 * Placas brasileiras.
 *
 * Convivem dois padrões na frota e os dois precisam funcionar:
 * - antigo, três letras e quatro dígitos: ABC-1234 / ABC1234
 * - Mercosul, com uma letra no lugar do quarto dígito: ABC1D23
 *
 * Tudo que entra é normalizado para caixa alta sem separador, que é a forma
 * como a coluna `placa_normalizada` do banco guarda — é por ela que se busca.
 */

export type PadraoPlaca = 'antigo' | 'mercosul'

const ANTIGO = /^[A-Z]{3}[0-9]{4}$/
const MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/

/** Caixa alta, sem hífen, espaço ou ponto. */
export function normalizarPlaca(valor: string): string {
  return (valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function padraoDaPlaca(valor: string): PadraoPlaca | null {
  const p = normalizarPlaca(valor)
  if (ANTIGO.test(p)) return 'antigo'
  if (MERCOSUL.test(p)) return 'mercosul'
  return null
}

export function placaValida(valor: string): boolean {
  return padraoDaPlaca(valor) !== null
}

/** Formata para leitura humana: ABC-1234 no padrão antigo, ABC1D23 no Mercosul. */
export function formatarPlaca(valor: string): string {
  const p = normalizarPlaca(valor)
  if (ANTIGO.test(p)) return `${p.slice(0, 3)}-${p.slice(3)}`
  return p
}

/**
 * Corrige confusões clássicas de OCR conforme a posição do caractere.
 *
 * Em placa, cada posição só aceita letra ou só dígito. Então um `0` lido onde
 * só cabe letra é quase certamente `O`, e um `S` onde só cabe dígito é `5`.
 * Aplicar isso antes de desistir da leitura salva boa parte dos casos.
 */
const PARA_LETRA: Record<string, string> = {
  '0': 'O',
  '1': 'I',
  '2': 'Z',
  '4': 'A',
  '5': 'S',
  '6': 'G',
  '7': 'T',
  '8': 'B',
}
const PARA_DIGITO: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6' }

export function corrigirPorPosicao(bruto: string): string {
  const p = normalizarPlaca(bruto)
  if (p.length !== 7) return p

  const saida = p.split('')
  /* posições 0-2: sempre letras */
  for (let i = 0; i < 3; i++) saida[i] = PARA_LETRA[saida[i]] ?? saida[i]
  /* posição 3: sempre dígito nos dois padrões */
  saida[3] = PARA_DIGITO[saida[3]] ?? saida[3]

  /* posição 4 decide o padrão: letra = Mercosul, dígito = antigo. Mantemos o
     que veio e só ajustamos as posições 5 e 6, que são dígitos nos dois. */
  for (let i = 5; i < 7; i++) saida[i] = PARA_DIGITO[saida[i]] ?? saida[i]

  const tentativa = saida.join('')
  if (placaValida(tentativa)) return tentativa

  /* Se ainda não fechou, tenta forçar a posição 4 para cada padrão. */
  const comoAntigo = [...saida]
  comoAntigo[4] = PARA_DIGITO[comoAntigo[4]] ?? comoAntigo[4]
  if (placaValida(comoAntigo.join(''))) return comoAntigo.join('')

  const comoMercosul = [...saida]
  comoMercosul[4] = PARA_LETRA[comoMercosul[4]] ?? comoMercosul[4]
  if (placaValida(comoMercosul.join(''))) return comoMercosul.join('')

  return tentativa
}
