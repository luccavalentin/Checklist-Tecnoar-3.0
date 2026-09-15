-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260823233315.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Tentativa de alterar campo privilegiado deve FALHAR de forma explícita,
-- não ser silenciosamente descartada.
create or replace function public.tg_usuarios_proteger_campos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.usuario_atual_admin() then
    return new;
  end if;

  if new.situacao  is distinct from old.situacao
     or new.is_admin  is distinct from old.is_admin
     or new.perfil_id is distinct from old.perfil_id
     or new.funcao    is distinct from old.funcao
     or new.email     is distinct from old.email
  then
    raise exception 'Alteração não permitida: situação, perfil de acesso, função, e-mail e privilégio administrativo só podem ser alterados por um administrador.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;;
