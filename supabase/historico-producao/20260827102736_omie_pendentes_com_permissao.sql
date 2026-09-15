-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260827102736.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- A contagem segue a mesma regra de acesso do resto da integração.
create or replace function omie_pendentes_de_envio()
returns table (entidade text, total bigint, com_erro bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'clientes', count(*), count(omie_erro) from clientes
    where origem = 'manual' and omie_id is null and situacao = 'ativo'
      and tem_permissao('integracoes', 'visualizar')
  union all
  select 'fornecedores', count(*), count(omie_erro) from fornecedores
    where origem = 'manual' and omie_id is null and situacao = 'ativo'
      and tem_permissao('integracoes', 'visualizar')
  union all
  select 'produtos', count(*), count(omie_erro) from produtos
    where origem = 'manual' and omie_id is null and situacao = 'ativo'
      and tem_permissao('integracoes', 'visualizar')
  union all
  select 'servicos', count(*), count(omie_erro) from servicos
    where origem = 'manual' and omie_id is null and situacao = 'ativo'
      and tem_permissao('integracoes', 'visualizar');
$$;;
