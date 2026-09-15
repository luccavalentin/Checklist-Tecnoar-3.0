-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260901125808.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

drop view if exists public.vw_estoque;

create view public.vw_estoque as
 select id,
    codigo,
    descricao,
    referencia,
    ean,
    marca,
    familia,
    unidade,
    saldo,
    reservado,
    fisico,
    pendente,
    saldo - reservado as disponivel,
    estoque_minimo,
    preco_venda,
    preco_custo,
    custo_medio,
    localizacao,
    situacao,
    origem,
    omie_id,
    omie_sincronizado_em,
    case
      when (saldo - reservado) <= 0::numeric then 'sem_saldo'::text
      when estoque_minimo > 0::numeric and (saldo - reservado) <= estoque_minimo then 'critico'::text
      when estoque_minimo > 0::numeric and (saldo - reservado) <= (estoque_minimo * 1.5) then 'baixo'::text
      else 'ok'::text
    end as situacao_estoque,
    round(coalesce(custo_medio, preco_custo, 0::numeric) * saldo, 2) as valor_custo_total
   from produtos p;;
