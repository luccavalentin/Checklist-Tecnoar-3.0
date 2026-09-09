/**
 * Tradução entre o vocabulário da Omie e o do Tecnoar.
 *
 * Existe um arquivo só para isto porque o erro que mais custa caro nesta
 * integração não é a chamada falhar — é ela funcionar gravando o número certo
 * na coluna errada. `valor_unitario` é preço de VENDA; o custo da Omie é o
 * `nCMC` da posição de estoque, e não tem nada a ver com o `preco_custo` que a
 * oficina digita. Ver `supabase/functions/_dicionario-omie.md`.
 */

export const so = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
export const digitos = (v: unknown) => so(v).replace(/\D/g, '')
export const num = (v: unknown) => {
  if (typeof v === 'number' && isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(',', '.'))
    return isFinite(n) ? n : null
  }
  return null
}
const sn = (v: unknown) => so(v).toUpperCase() === 'S'
const vazio = (v: string) => v || null

/** `produto_servico_cadastro` (geral/produtos/) -> colunas de `produtos`. */
export function produtoDaOmie(p: Record<string, unknown>, omieId: string, codigo: string) {
  const familia = (p.familia ?? {}) as Record<string, unknown>
  return {
    codigo,
    descricao: so(p.descricao) || `Produto Omie ${omieId}`,
    descricao_detalhada: vazio(so(p.descr_detalhada)),
    observacoes_internas: vazio(so(p.obs_internas)),
    unidade: so(p.unidade) || 'UN',
    ncm: vazio(so(p.ncm)),
    ean: vazio(so(p.ean)),
    marca: vazio(so(p.marca)),
    modelo: vazio(so(p.modelo)),
    familia: vazio(so(p.nome_familia ?? familia.cNomeFamilia)),
    omie_familia_id: vazio(so(p.codigo_familia ?? familia.nCodFamilia)),
    tipo_item: vazio(so(p.tipoItem)),
    peso_liquido: num(p.peso_liq),
    peso_bruto: num(p.peso_bruto),
    bloqueado: sn(p.bloqueado),
    // Omie: valor_unitario é o preço unitário de VENDA.
    preco_venda: num(p.valor_unitario) ?? 0,
    situacao: sn(p.inativo) ? 'inativo' : 'ativo',
    origem: 'omie',
    omie_id: omieId,
    omie_erro: null,
    omie_sincronizado_em: new Date().toISOString(),
  }
}

/** Item de `ListarPosEstoque` (estoque/consulta/) -> colunas de `produtos`. */
export function estoqueDaOmie(e: Record<string, unknown>) {
  const registro: Record<string, unknown> = {
    saldo: num(e.nSaldo) ?? 0,
    omie_sincronizado_em: new Date().toISOString(),
  }
  // Só grava o que a Omie realmente mandou: ausência não é zero.
  const fisico = num(e.fisico)
  const reservado = num(e.reservado)
  const pendente = num(e.nPendente)
  const minimo = num(e.estoque_minimo)
  const cmc = num(e.nCMC)
  const local = so(e.codigo_local_estoque)

  if (fisico !== null) registro.fisico = fisico
  if (reservado !== null) registro.reservado = reservado
  if (pendente !== null) registro.pendente = pendente
  if (minimo !== null) registro.estoque_minimo = minimo
  if (cmc !== null) registro.custo_medio = cmc
  if (local) registro.omie_local_estoque = local
  return registro
}

/** Colunas de `produtos` -> `param` de UpsertProduto. */
export function produtoParaOmie(r: Record<string, unknown>): Record<string, unknown> {
  const param: Record<string, unknown> = {
    codigo_produto_integracao: String(r.id),
    codigo: so(r.codigo),
    descricao: so(r.descricao),
    unidade: so(r.unidade) || 'UN',
    valor_unitario: num(r.preco_venda) ?? 0,
    bloqueado: r.bloqueado ? 'S' : 'N',
  }
  const opcionais: Array<[string, unknown]> = [
    ['ncm', so(r.ncm)],
    ['ean', so(r.ean)],
    ['marca', so(r.marca)],
    ['modelo', so(r.modelo)],
    ['descr_detalhada', so(r.descricao_detalhada)],
    ['obs_internas', so(r.observacoes_internas)],
    ['tipoItem', so(r.tipo_item)],
    // A Omie tipa codigo_familia como inteiro; mandar o texto é recusado.
    ['codigo_familia', num(r.omie_familia_id)],
    ['peso_liq', num(r.peso_liquido)],
    ['peso_bruto', num(r.peso_bruto)],
  ]
  for (const [chave, valor] of opcionais) {
    if (valor !== null && valor !== '' && valor !== undefined) param[chave] = valor
  }
  return param
}
