-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824113931.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- O gatilho protege contra escalada feita por um usuário autenticado.
-- Operações de servidor (service_role, migrações, funções administrativas) não
-- têm auth.uid() e já passaram pela sua própria verificação de permissão.
create or replace function public.tg_usuarios_proteger_campos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.usuario_atual_admin() then
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin then
    raise exception 'Somente um administrador pode conceder ou remover privilégio administrativo.'
      using errcode = '42501';
  end if;

  if public.tem_permissao('usuarios', 'editar') then
    return new;
  end if;

  if new.situacao   is distinct from old.situacao
     or new.perfil_id is distinct from old.perfil_id
     or new.funcao_id is distinct from old.funcao_id
     or new.email     is distinct from old.email
  then
    raise exception 'Alteração não permitida: situação, perfil de acesso, função e e-mail só podem ser alterados por quem tem permissão de editar usuários.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;
revoke execute on function public.tg_usuarios_proteger_campos() from public, anon, authenticated;

-- limpa contas de teste que ficaram sem cadastro completo
delete from auth.users where email like 'direto.%@tecnoar.test' or email like 'mecanico.%@tecnoar.test';;
