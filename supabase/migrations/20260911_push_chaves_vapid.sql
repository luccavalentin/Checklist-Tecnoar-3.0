-- Chaves VAPID geradas e guardadas no servidor, fora da API.
--
-- A função de borda `push` gera o par na primeira chamada e o grava aqui. Assim
-- a chave privada nunca passa por arquivo, repositório ou painel de segredos.
-- Ambas as funções só executam com a chave de serviço.

create or replace function public.push_vapid()
returns jsonb
language sql
stable
security definer
set search_path = privado, pg_temp
as $$
  select case when count(*) = 2 then jsonb_object_agg(chave, valor) end
  from privado.config
  where chave in ('vapid_publica', 'vapid_privada')
$$;

revoke execute on function public.push_vapid() from public, anon, authenticated;
grant execute on function public.push_vapid() to service_role;

create or replace function public.push_vapid_salvar(p_publica text, p_privada text)
returns void
language sql
security definer
set search_path = privado, pg_temp
as $$
  insert into privado.config (chave, valor)
  values ('vapid_publica', p_publica), ('vapid_privada', p_privada)
  on conflict (chave) do nothing
$$;

revoke execute on function public.push_vapid_salvar(text, text) from public, anon, authenticated;
grant execute on function public.push_vapid_salvar(text, text) to service_role;
