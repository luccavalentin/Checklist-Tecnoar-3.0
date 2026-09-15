-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260901125737.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Espelha no cadastro local os campos que a Omie realmente mantém para produto,
-- para que a mesma peça tenha o mesmo significado nos dois sistemas.
--
-- Correspondência (API Omie v1):
--   geral/produtos/  -> produto_servico_cadastro
--   estoque/consulta -> ListarPosEstoque

alter table public.produtos
  add column if not exists ean                  text,        -- Omie: ean (GTIN)
  add column if not exists marca                text,        -- Omie: marca
  add column if not exists modelo               text,        -- Omie: modelo
  add column if not exists familia              text,        -- Omie: nome da família (codigo_familia)
  add column if not exists omie_familia_id      text,        -- Omie: codigo_familia
  add column if not exists descricao_detalhada  text,        -- Omie: descr_detalhada
  add column if not exists observacoes_internas text,        -- Omie: obs_internas
  add column if not exists peso_liquido         numeric(14,4), -- Omie: peso_liq (kg)
  add column if not exists peso_bruto           numeric(14,4), -- Omie: peso_bruto (kg)
  add column if not exists tipo_item            text,        -- Omie: tipoItem (SPED)
  add column if not exists bloqueado            boolean not null default false, -- Omie: bloqueado
  add column if not exists custo_medio          numeric(14,4), -- Omie: nCMC (custo médio contábil)
  add column if not exists fisico               numeric(14,4), -- Omie: fisico
  add column if not exists pendente             numeric(14,4), -- Omie: nPendente
  add column if not exists omie_local_estoque   text;        -- Omie: codigo_local_estoque

comment on column public.produtos.preco_venda  is 'Omie: valor_unitario — preço unitário de venda.';
comment on column public.produtos.preco_custo  is 'Custo de aquisição definido na oficina. O custo contábil vindo da Omie fica em custo_medio.';
comment on column public.produtos.custo_medio  is 'Omie: nCMC — custo médio contábil, somente leitura, vem da posição de estoque.';
comment on column public.produtos.saldo        is 'Omie: nSaldo — saldo do produto na data da posição.';
comment on column public.produtos.fisico       is 'Omie: fisico — quantidade física em estoque.';
comment on column public.produtos.pendente     is 'Omie: nPendente — saldo comprometido em pedidos de venda em aberto.';
comment on column public.produtos.reservado    is 'Omie: reservado — quantidade reservada do estoque.';
comment on column public.produtos.estoque_minimo is 'Omie: estoque_minimo.';
comment on column public.produtos.ean          is 'Omie: ean — código de barras / GTIN.';
comment on column public.produtos.ncm          is 'Omie: ncm.';
comment on column public.produtos.unidade      is 'Omie: unidade.';
comment on column public.produtos.codigo       is 'Omie: codigo — SKU exibido na Omie.';

create index if not exists produtos_ean_idx on public.produtos (ean) where ean is not null;
create index if not exists produtos_marca_idx on public.produtos (marca) where marca is not null;;
