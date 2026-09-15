-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260827052549.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- A IA passa a aceitar Anthropic, OpenAI ou Gemini.

/**
 * Provedor ativo do modelo de linguagem.
 *
 * A chave de cada provedor continua em `integracoes` (uma linha por
 * fornecedor), lida apenas pela função de borda. Aqui fica só qual deles
 * está no ar — trocar de fornecedor é trocar este campo, sem perder a chave
 * do anterior.
 */
alter table ia_config
  add column provedor text not null default 'anthropic'
    check (provedor in ('anthropic', 'openai', 'gemini'));

comment on column ia_config.modelo is
  'Identificador do modelo no provedor escolhido. Texto livre de propósito: '
  'versões novas saem toda hora e não podem depender de migração.';

/* Uma linha por provedor. A chave de um não apaga a do outro. */
insert into integracoes (provedor, ambiente, ativa, status) values
  ('openai', 'gpt-5', false, 'nao_configurada'),
  ('gemini', 'gemini-2.5-pro', false, 'nao_configurada')
on conflict (provedor) do nothing;

/**
 * Situação da IA para a tela, sem expor chave nenhuma.
 *
 * A tela precisa saber se está configurada e qual provedor responde, mas não
 * pode receber o segredo. Esta função devolve só o suficiente para desenhar
 * o estado.
 */
create or replace function ia_situacao()
returns table (
  provedor text,
  modelo text,
  configurada boolean,
  status text,
  ultima_conexao_em timestamptz,
  ultimo_erro text,
  transcricao_configurada boolean,
  transcricao_status text
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    c.provedor,
    c.modelo,
    coalesce(i.app_key is not null, false),
    coalesce(i.status, 'nao_configurada'),
    i.ultima_conexao_em,
    i.ultimo_erro,
    coalesce(t.app_key is not null, false),
    coalesce(t.status, 'nao_configurada')
  from ia_config c
  left join integracoes i on i.provedor = c.provedor
  left join integracoes t on t.provedor = 'transcricao'
  where c.id and tem_permissao('tecnoar_ia', 'visualizar');
$$;

revoke all on function ia_situacao() from public, anon;
grant execute on function ia_situacao() to authenticated, service_role;

/** Quais provedores já têm chave guardada — para a tela mostrar os cadastrados. */
create or replace function ia_provedores()
returns table (provedor text, modelo text, configurada boolean, status text)
language sql stable security definer set search_path = public, pg_temp as $$
  select i.provedor, i.ambiente, i.app_key is not null, i.status
  from integracoes i
  where i.provedor in ('anthropic', 'openai', 'gemini', 'transcricao')
    and tem_permissao('tecnoar_ia', 'visualizar')
  order by case i.provedor
    when 'anthropic' then 1 when 'openai' then 2 when 'gemini' then 3 else 4 end;
$$;

revoke all on function ia_provedores() from public, anon;
grant execute on function ia_provedores() to authenticated, service_role;;
