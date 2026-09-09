# Dicionário de campos — Tecnoar ↔ Omie

Fonte: API Omie v1 (`geral/produtos/`, `estoque/consulta/`, `servicos/servico/`,
`geral/clientes/`). Este arquivo é a referência única do mapeamento; qualquer
campo novo na tela de cadastro precisa aparecer aqui antes de existir.

## Produtos — `produtos` ↔ `produto_servico_cadastro`

| Tecnoar | Omie | Sentido |
| --- | --- | --- |
| `omie_id` | `codigo_produto` | Código interno da Omie (chave). |
| `id` | `codigo_produto_integracao` | Nosso UUID, usado como chave de integração no envio. |
| `codigo` | `codigo` | SKU exibido na Omie. |
| `descricao` | `descricao` | Descrição (120). |
| `descricao_detalhada` | `descr_detalhada` | Descrição longa. |
| `observacoes_internas` | `obs_internas` | Notas internas. |
| `unidade` | `unidade` | Unidade de medida. |
| `ncm` | `ncm` | NCM. |
| `ean` | `ean` | Código de barras / GTIN. |
| `marca` | `marca` | Marca. |
| `modelo` | `modelo` | Modelo. |
| `familia` / `omie_familia_id` | `nome_familia` / `codigo_familia` | Família do produto. |
| `preco_venda` | `valor_unitario` | **Preço unitário de venda.** |
| `peso_liquido` | `peso_liq` | Peso líquido (kg). |
| `peso_bruto` | `peso_bruto` | Peso bruto (kg). |
| `tipo_item` | `tipoItem` | Tipo do item (SPED). |
| `bloqueado` | `bloqueado` | Bloqueado para uso. |
| `situacao` | `inativo` | `inativo = 'S'` → `situacao = 'inativo'`. |

## Estoque — `produtos` ↔ `ListarPosEstoque`

| Tecnoar | Omie | Sentido |
| --- | --- | --- |
| `saldo` | `nSaldo` | Saldo na data da posição. |
| `fisico` | `fisico` | Quantidade física. |
| `reservado` | `reservado` | Quantidade reservada. |
| `pendente` | `nPendente` | Comprometido em pedidos em aberto. |
| `estoque_minimo` | `estoque_minimo` | Estoque mínimo. |
| `custo_medio` | `nCMC` | **Custo médio contábil** (somente leitura). |
| `preco_venda` | `nPrecoUnitario` | Preço unitário de venda. |
| `omie_local_estoque` | `codigo_local_estoque` | Local do estoque. |

`preco_custo` **não existe na Omie**: é o custo de aquisição informado na
oficina. O custo que vem da Omie é o `custo_medio` (nCMC), e é ele que
valoriza o estoque em `vw_estoque`.

## Serviços — `servicos` ↔ `ListarCadastroServico`

| Tecnoar | Omie |
| --- | --- |
| `omie_id` | `nCodServ` |
| `id` | `cCodIntServ` |
| `codigo` | `cCodigo` |
| `descricao` | `cDescricao` |
| `valor_padrao` | `nValorUnit` |

## Clientes e fornecedores — `clientes` / `fornecedores` ↔ `clientes_cadastro`

A Omie guarda os dois na mesma lista e separa por **tag** (`Cliente`,
`Fornecedor`). O mesmo CNPJ pode ser os dois.

| Tecnoar | Omie |
| --- | --- |
| `omie_id` | `codigo_cliente_omie` |
| `id` | `codigo_cliente_integracao` |
| `nome_razao` / `descricao` | `razao_social` |
| `nome_fantasia` | `nome_fantasia` |
| `documento` | `cnpj_cpf` |
| `inscricao_estadual` | `inscricao_estadual` |
| `email` | `email` |
| `telefone` | `telefone1_ddd` + `telefone1_numero` |
| `cep` | `cep` |
| `logradouro` | `endereco` |
| `numero` | `endereco_numero` |
| `bairro` | `bairro` |
| `complemento` | `complemento` |
| `municipio` | `cidade` |
| `uf` | `estado` |
