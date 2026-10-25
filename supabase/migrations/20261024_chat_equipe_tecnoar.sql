-- Canal privado entre cada usuário do aplicativo e a equipe Tecnoar.
-- Independente de chamado. Não altera as conversas existentes de socorro.
begin;
create table if not exists public.tecnoar_conversas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references auth.users(id) on delete cascade,
  nome text not null,
  atualizado_em timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.tecnoar_chat_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.tecnoar_conversas(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  autor_nome text not null,
  autor_papel public.sos_papel not null,
  texto text,
  midia_caminho text,
  midia_tipo text,
  responde_a uuid references public.tecnoar_chat_mensagens(id),
  duracao_seg smallint,
  local_lat double precision check (local_lat between -90 and 90),
  local_lng double precision check (local_lng between -180 and 180),
  entregue_em timestamptz,
  lida_em timestamptz,
  apagada_em timestamptz,
  created_at timestamptz not null default now(),
  check ((local_lat is null) = (local_lng is null))
);
create index if not exists tecnoar_chat_ordem on public.tecnoar_chat_mensagens(conversa_id, created_at, id);
create index if not exists tecnoar_chat_recent on public.tecnoar_conversas(atualizado_em desc);
alter table public.tecnoar_conversas enable row level security;
alter table public.tecnoar_chat_mensagens enable row level security;
create or replace function public.tecnoar_chat_acesso(p_conversa uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select auth.uid() is not null and exists(select 1 from public.tecnoar_conversas c
    where c.id=p_conversa and (c.usuario_id=auth.uid() or public.sos_eh_equipe()));
$$;
drop policy if exists tecnoar_conversas_ler on public.tecnoar_conversas;
create policy tecnoar_conversas_ler on public.tecnoar_conversas for select to authenticated
  using(usuario_id=(select auth.uid()) or (select public.sos_eh_equipe()));
drop policy if exists tecnoar_chat_ler on public.tecnoar_chat_mensagens;
create policy tecnoar_chat_ler on public.tecnoar_chat_mensagens for select to authenticated
  using(public.tecnoar_chat_acesso(conversa_id));
revoke all on public.tecnoar_conversas,public.tecnoar_chat_mensagens from anon,authenticated;
grant select on public.tecnoar_conversas,public.tecnoar_chat_mensagens to authenticated;

create or replace function public.tecnoar_chat_abrir()
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para conversar.'; end if;
  insert into public.tecnoar_conversas(usuario_id,nome)
    values(auth.uid(),coalesce(public.sos_nome_conta(auth.uid()),'Cliente'))
    on conflict(usuario_id) do update set nome=excluded.nome returning id into v_id;
  return v_id;
end $$;

create or replace function public.tecnoar_chat_enviar(
  p_conversa uuid,p_id uuid,p_texto text default null,p_caminho text default null,
  p_tipo text default null,p_responde uuid default null,p_duracao smallint default null,
  p_lat double precision default null,p_lng double precision default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_dono uuid; v_id uuid;
begin
  if not public.tecnoar_chat_acesso(p_conversa) then raise exception 'Sem acesso à conversa.'; end if;
  if length(coalesce(p_texto,''))>4000 then raise exception 'Limite de 4000 caracteres.'; end if;
  if nullif(trim(p_texto),'') is null and p_caminho is null and p_lat is null then raise exception 'Mensagem vazia.'; end if;
  if (p_lat is null)<>(p_lng is null) then raise exception 'Localização incompleta.'; end if;
  if p_responde is not null and not exists(select 1 from public.tecnoar_chat_mensagens where id=p_responde and conversa_id=p_conversa)
    then raise exception 'A mensagem citada pertence a outra conversa.'; end if;
  if p_caminho is not null and (split_part(p_caminho,'/',1)<>p_conversa::text
    or split_part(p_caminho,'/',2)<>auth.uid()::text or not exists(select 1 from storage.objects where bucket_id='tecnoar-chat' and name=p_caminho))
    then raise exception 'Anexo inválido.'; end if;
  select usuario_id into v_dono from public.tecnoar_conversas where id=p_conversa;
  select id into v_id from public.tecnoar_chat_mensagens where id=p_id and conversa_id=p_conversa and autor_id=auth.uid();
  if v_id is not null then return v_id; end if;
  insert into public.tecnoar_chat_mensagens(id,conversa_id,autor_id,autor_nome,autor_papel,texto,midia_caminho,midia_tipo,responde_a,duracao_seg,local_lat,local_lng)
    values(p_id,p_conversa,auth.uid(),coalesce(public.sos_nome_conta(auth.uid()),'Equipe Tecnoar'),
      case when v_dono=auth.uid() then 'cliente'::public.sos_papel else 'central'::public.sos_papel end,
      nullif(trim(p_texto),''),p_caminho,p_tipo,p_responde,p_duracao,p_lat,p_lng);
  update public.tecnoar_conversas set atualizado_em=now() where id=p_conversa;
  return p_id;
end $$;

create or replace function public.tecnoar_chat_ler(p_conversa uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_dono uuid;
begin
  if not public.tecnoar_chat_acesso(p_conversa) then raise exception 'Sem acesso.'; end if;
  select usuario_id into v_dono from public.tecnoar_conversas where id=p_conversa;
  update public.tecnoar_chat_mensagens set entregue_em=coalesce(entregue_em,now()),lida_em=coalesce(lida_em,now())
    where conversa_id=p_conversa and lida_em is null and
      ((auth.uid()=v_dono and autor_id is distinct from v_dono) or (auth.uid()<>v_dono and autor_id=v_dono));
end $$;

create or replace function public.tecnoar_chat_apagar(p_mensagem uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.tecnoar_chat_mensagens set apagada_em=now(),texto=null,midia_caminho=null,midia_tipo=null,local_lat=null,local_lng=null
    where id=p_mensagem and autor_id=auth.uid() and public.tecnoar_chat_acesso(conversa_id)
      and created_at>now()-interval '1 hour' and apagada_em is null;
  if not found then raise exception 'Não foi possível apagar esta mensagem.'; end if;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('tecnoar-chat','tecnoar-chat',false,26214400,
    array['image/jpeg','image/png','image/webp','image/heic','audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','video/mp4','video/webm','application/pdf','text/plain'])
  on conflict(id) do nothing;
create or replace function public.tecnoar_chat_arquivo_acesso(p_nome text)
returns boolean language plpgsql stable security definer set search_path=public,pg_temp as $$
begin return public.tecnoar_chat_acesso(split_part(p_nome,'/',1)::uuid);
exception when invalid_text_representation then return false; end $$;
drop policy if exists tecnoar_chat_storage_ler on storage.objects;
create policy tecnoar_chat_storage_ler on storage.objects for select to authenticated
  using(bucket_id='tecnoar-chat' and public.tecnoar_chat_arquivo_acesso(name));
drop policy if exists tecnoar_chat_storage_enviar on storage.objects;
create policy tecnoar_chat_storage_enviar on storage.objects for insert to authenticated
  with check(bucket_id='tecnoar-chat' and split_part(name,'/',2)=(select auth.uid())::text and public.tecnoar_chat_arquivo_acesso(name));

-- Presença privada; o nome da sala nunca basta para receber eventos.
drop policy if exists tecnoar_chat_presence_ler on realtime.messages;
create policy tecnoar_chat_presence_ler on realtime.messages for select to authenticated
  using(realtime.topic() like 'tecnoar:chat:%' and public.tecnoar_chat_arquivo_acesso(substr(realtime.topic(),14)||'/'));
drop policy if exists tecnoar_chat_presence_escrever on realtime.messages;
create policy tecnoar_chat_presence_escrever on realtime.messages for insert to authenticated
  with check(realtime.topic() like 'tecnoar:chat:%' and public.tecnoar_chat_arquivo_acesso(substr(realtime.topic(),14)||'/'));
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='tecnoar_chat_mensagens') then
    alter publication supabase_realtime add table public.tecnoar_chat_mensagens;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='tecnoar_conversas') then
    alter publication supabase_realtime add table public.tecnoar_conversas;
  end if;
end $$;
revoke execute on function public.tecnoar_chat_acesso(uuid),public.tecnoar_chat_arquivo_acesso(text),public.tecnoar_chat_abrir(),
  public.tecnoar_chat_enviar(uuid,uuid,text,text,text,uuid,smallint,double precision,double precision),public.tecnoar_chat_ler(uuid),public.tecnoar_chat_apagar(uuid) from public,anon;
grant execute on function public.tecnoar_chat_acesso(uuid),public.tecnoar_chat_arquivo_acesso(text),public.tecnoar_chat_abrir(),
  public.tecnoar_chat_enviar(uuid,uuid,text,text,text,uuid,smallint,double precision,double precision),public.tecnoar_chat_ler(uuid),public.tecnoar_chat_apagar(uuid) to authenticated;
commit;
