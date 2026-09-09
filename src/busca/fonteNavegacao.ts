import { registrarFonteBusca, type ResultadoBusca } from './registro'
import { NAVEGACAO, TODOS_ITENS } from '@/layout/navegacao'

export function normalizar(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

const GRUPO_DE = new Map<string, string>(
  NAVEGACAO.flatMap((g) => g.itens.map((i) => [i.rota, g.rotulo] as const)),
)

registrarFonteBusca({
  id: 'navegacao',
  rotulo: 'Ir para',
  ordem: 0,
  async buscar(termo) {
    const t = normalizar(termo)
    if (!t) return []
    const achados: ResultadoBusca[] = []

    for (const item of TODOS_ITENS) {
      const grupo = GRUPO_DE.get(item.rota) ?? ''
      if (normalizar(item.rotulo).includes(t) || normalizar(grupo).includes(t)) {
        achados.push({
          id: `nav:${item.rota}`,
          titulo: item.rotulo,
          subtitulo: grupo,
          rota: item.rota,
          icone: item.icone,
        })
      }
    }

    return achados.slice(0, 8)
  },
})
