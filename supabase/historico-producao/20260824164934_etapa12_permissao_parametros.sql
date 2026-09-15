-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824164934.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

/**
 * Quem pode alterar cada parâmetro.
 *
 * Não existe um recurso genérico de "configurações": cada parâmetro pertence
 * à área que o usa. As faixas de inatividade são uma regra do CRM, então quem
 * edita o CRM as edita; o resto exige permissão de configuração de perfis.
 */
create or replace function pode_editar_parametro(p_chave text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p_chave like 'crm\_%' then tem_permissao('crm', 'editar')
    else tem_permissao('perfis_permissoes', 'configurar')
  end;
$$;

grant execute on function pode_editar_parametro(text) to authenticated;

drop policy parametros_gravar on parametros;

create policy parametros_gravar on parametros
  for all to authenticated
  using (pode_editar_parametro(chave))
  with check (pode_editar_parametro(chave));;
