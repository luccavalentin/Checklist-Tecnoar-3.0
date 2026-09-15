-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260912210416.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- O cliente do app cadastra o próprio veículo; `registrado_por` aponta para
-- `usuarios` (equipe). Para quem não é da equipe fica vazio — igual ao que já
-- acontece quando o cadastro vem de uma rotina do servidor.
create or replace function public.tg_veiculo_historico_proprietario()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_quem uuid := (select id from public.usuarios where id = auth.uid());
begin
  if tg_op = 'INSERT' then
    if new.cliente_id is not null then
      insert into public.veiculo_proprietarios (veiculo_id, cliente_id, registrado_por)
      values (new.id, new.cliente_id, v_quem);
    end if;
    return new;
  end if;

  if new.cliente_id is distinct from old.cliente_id then
    update public.veiculo_proprietarios
       set fim_em = now()
     where veiculo_id = new.id and fim_em is null;
    if new.cliente_id is not null then
      insert into public.veiculo_proprietarios (veiculo_id, cliente_id, registrado_por)
      values (new.id, new.cliente_id, v_quem);
    end if;
  end if;
  return new;
end;
$function$;;
