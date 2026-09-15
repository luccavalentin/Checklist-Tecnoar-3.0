-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260823233422.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- search_path fixo também na função utilitária
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Funções de gatilho não devem ser expostas como RPC na API
revoke execute on function public.tg_set_updated_at() from public, anon, authenticated;
revoke execute on function public.tg_provisionar_usuario() from public, anon, authenticated;
revoke execute on function public.tg_usuarios_proteger_campos() from public, anon, authenticated;

-- Helpers de autorização: só quem está autenticado precisa executá-los
revoke execute on function public.usuario_atual_admin() from public, anon;
revoke execute on function public.usuario_atual_ativo() from public, anon;
grant execute on function public.usuario_atual_admin() to authenticated;
grant execute on function public.usuario_atual_ativo() to authenticated;;
