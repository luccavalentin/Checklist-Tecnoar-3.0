-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260901125835.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Sem isto a view leria produtos com os direitos do dono, furando a RLS.
alter view public.vw_estoque set (security_invoker = true);
revoke all on public.vw_estoque from anon;
grant select on public.vw_estoque to authenticated, service_role;;
