-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260827102719.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Envio de cadastros do Tecnoar para a Omie (mão inversa da sincronização).

/**
 * Estado do envio para a Omie.
 *
 * A sincronização existente só traz dados. Estas colunas registram a outra
 * direção: quando o cadastro nasceu aqui e subiu para o ERP, e o que deu
 * errado quando não subiu. Sem isso o operador não teria como saber se o
 * cliente que ele criou está no financeiro ou só na oficina.
 */
do $$
declare t text;
begin
  foreach t in array array['clientes', 'fornecedores', 'produtos', 'servicos'] loop
    execute format('alter table %I add column if not exists omie_enviado_em timestamptz', t);
    execute format('alter table %I add column if not exists omie_erro text', t);
  end loop;
end $$;

comment on column clientes.omie_enviado_em is
  'Quando este cadastro foi enviado do Tecnoar para a Omie. Nulo em quem veio de lá.';
comment on column clientes.omie_erro is
  'Motivo da última recusa da Omie. Some quando o envio dá certo.';

/**
 * Cadastros criados aqui que ainda não existem na Omie.
 *
 * Alimenta o aviso de pendência: enquanto houver linha aqui, existe cliente,
 * peça ou serviço que o financeiro não enxerga.
 */
create or replace function omie_pendentes_de_envio()
returns table (entidade text, total bigint, com_erro bigint)
language sql stable security definer set search_path = public, pg_temp as $$
  select 'clientes', count(*), count(omie_erro) from clientes
    where origem = 'manual' and omie_id is null and situacao = 'ativo'
  union all
  select 'fornecedores', count(*), count(omie_erro) from fornecedores
    where origem = 'manual' and omie_id is null and situacao = 'ativo'
  union all
  select 'produtos', count(*), count(omie_erro) from produtos
    where origem = 'manual' and omie_id is null and situacao = 'ativo'
  union all
  select 'servicos', count(*), count(omie_erro) from servicos
    where origem = 'manual' and omie_id is null and situacao = 'ativo';
$$;

revoke all on function omie_pendentes_de_envio() from public, anon;
grant execute on function omie_pendentes_de_envio() to authenticated, service_role;;
