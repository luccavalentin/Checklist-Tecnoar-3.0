-- Notificações push: a notificação do aparelho que chega com o app fechado.
--
-- Aplicada no projeto zdhebeqlhynffxfmedvj em 11/09/2026.
-- Nenhum segredo neste arquivo: o segredo entre o gatilho e a função é gerado
-- no próprio banco, e as chaves VAPID são geradas pela própria função `push`
-- (ver 20260911_push_chaves_vapid.sql).

begin;

-- 1. Uma linha por aparelho inscrito ------------------------------------------
create table if not exists public.push_inscricoes (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references public.usuarios(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  agente      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_inscricoes_usuario on public.push_inscricoes (usuario_id);

alter table public.push_inscricoes enable row level security;

-- Cada pessoa vê e mantém só os próprios aparelhos.
drop policy if exists push_inscricoes_proprias on public.push_inscricoes;
create policy push_inscricoes_proprias on public.push_inscricoes
  for all to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

-- 2. Configuração privada: fora do alcance da API ----------------------------
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create table if not exists privado.config (
  chave text primary key,
  valor text not null
);

insert into privado.config (chave, valor) values
  ('push_url', 'https://zdhebeqlhynffxfmedvj.supabase.co/functions/v1/push'),
  ('push_segredo', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (chave) do nothing;

-- A função de borda confere o segredo por aqui. Só a chave de serviço executa.
create or replace function public.push_segredo()
returns text
language sql
stable
security definer
set search_path = privado, pg_temp
as $$ select valor from privado.config where chave = 'push_segredo' $$;

revoke execute on function public.push_segredo() from public, anon, authenticated;
grant execute on function public.push_segredo() to service_role;

-- 3. O gatilho: cada notificação inserida vira um envio ------------------------
create extension if not exists pg_net with schema extensions;

create or replace function public.enviar_push_notificacao()
returns trigger
language plpgsql
security definer
set search_path = public, privado, extensions, pg_temp
as $$
declare
  v_url     text;
  v_segredo text;
begin
  select valor into v_url     from privado.config where chave = 'push_url';
  select valor into v_segredo from privado.config where chave = 'push_segredo';
  if v_url is null or v_segredo is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-segredo', v_segredo),
    body    := jsonb_build_object('notificacao_id', new.id)
  );
  return new;
exception when others then
  -- Push é aviso a mais. Falha no envio nunca pode impedir a notificação de
  -- existir: ela continua no sino dentro do sistema.
  return new;
end;
$$;

drop trigger if exists notificacoes_push on public.notificacoes;
create trigger notificacoes_push
  after insert on public.notificacoes
  for each row execute function public.enviar_push_notificacao();

commit;
