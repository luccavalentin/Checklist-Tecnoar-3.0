-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260901134423.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Uma delas tinha EXECUTE concedido a PUBLIC (o `=X/postgres` no ACL), o que
-- passa por cima do revoke por papel.
revoke execute on function public.tg_ia_ativa_provedor_configurado() from public;;
