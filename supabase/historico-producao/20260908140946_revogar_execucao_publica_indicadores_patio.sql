-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260908140946.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- O Postgres concede EXECUTE ao pseudo-papel PUBLIC por padrão, e é por ele
-- que o anônimo continuava alcançando a função. Revogar de PUBLIC e devolver
-- o EXECUTE apenas a quem o app realmente usa.
revoke execute on function public.indicadores_patio() from public;
grant execute on function public.indicadores_patio() to authenticated, service_role;;
