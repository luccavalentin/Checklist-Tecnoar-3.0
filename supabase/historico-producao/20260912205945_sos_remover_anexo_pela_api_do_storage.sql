-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260912205945.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- O Supabase bloqueia DELETE direto em storage.objects (o arquivo ficaria
-- órfão no armazenamento). O app remove o arquivo pela API do Storage e a
-- função apaga só o registro.
create or replace function public.sos_remover_anexo(p_anexo uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_a public.sos_anexos;
begin
  select * into v_a from public.sos_anexos where id = p_anexo;
  if not found then return; end if;
  if v_a.autor_id is distinct from auth.uid() and not public.tem_permissao('sos', 'editar') then
    raise exception 'Só quem enviou (ou a central) remove o arquivo.';
  end if;
  -- O arquivo sai antes, pela API do Storage (o app chama `remove`): apagar a
  -- linha de storage.objects por SQL deixaria o arquivo órfão e o Supabase
  -- bloqueia. Aqui sai só o registro.
  delete from public.sos_anexos where id = p_anexo;
end;
$$;

-- Remover pela API do Storage: quem enviou o anexo, ou a central com `editar`.
drop policy if exists sos_storage_remover on storage.objects;
create policy sos_storage_remover on storage.objects
  for delete to authenticated
  using (bucket_id = 'sos' and exists (
    select 1 from public.sos_anexos a
    where a.caminho = name and (a.autor_id = (select auth.uid()) or (select public.tem_permissao('sos', 'editar')))));;
