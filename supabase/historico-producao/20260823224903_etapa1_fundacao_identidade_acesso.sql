-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260823224903.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ============================================================
-- ETAPA 1 — Fundação: identidade, acesso, notificações, ajuda
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- tipos ----------
create type public.situacao_registro as enum ('ativo', 'inativo');
create type public.situacao_usuario  as enum ('pendente', 'ativo', 'inativo', 'recusado');
create type public.tema_interface    as enum ('claro', 'escuro', 'sistema');
create type public.tipo_notificacao  as enum ('alerta_inteligente', 'sistema');

-- ---------- utilidades ----------
create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- perfis de acesso ----------
create table public.perfis_acesso (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  descricao   text,
  is_system   boolean not null default false,
  situacao    public.situacao_registro not null default 'ativo',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index perfis_acesso_nome_uk on public.perfis_acesso (lower(nome));

create trigger perfis_acesso_updated_at
  before update on public.perfis_acesso
  for each row execute function public.tg_set_updated_at();

-- ---------- usuários ----------
create table public.usuarios (
  id                uuid primary key references auth.users (id) on delete cascade,
  nome_completo     text not null,
  email             text not null,
  telefone          text,
  avatar_url        text,
  funcao            text,
  perfil_id         uuid references public.perfis_acesso (id) on delete set null,
  situacao          public.situacao_usuario not null default 'pendente',
  is_admin          boolean not null default false,
  tema              public.tema_interface not null default 'sistema',
  ultimo_acesso_em  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index usuarios_email_uk on public.usuarios (lower(email));
create index usuarios_situacao_ix on public.usuarios (situacao);
create index usuarios_perfil_ix   on public.usuarios (perfil_id);
create index usuarios_nome_ix     on public.usuarios (lower(nome_completo));

create trigger usuarios_updated_at
  before update on public.usuarios
  for each row execute function public.tg_set_updated_at();

-- ---------- helpers de autorização (SECURITY DEFINER: não recursivos sob RLS) ----------
create or replace function public.usuario_atual_ativo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.situacao = 'ativo'
  );
$$;

create or replace function public.usuario_atual_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.situacao = 'ativo' and u.is_admin = true
  );
$$;

-- ---------- provisionamento no cadastro ----------
-- Primeiro usuário do sistema vira administrador ativo (bootstrap obrigatório:
-- sem ele ninguém poderia aprovar ninguém). Todos os demais nascem PENDENTES,
-- sem perfil de acesso e sem privilégio administrativo.
create or replace function public.tg_provisionar_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_primeiro   boolean;
  v_perfil_id  uuid;
begin
  select not exists (select 1 from public.usuarios) into v_primeiro;

  if v_primeiro then
    select id into v_perfil_id from public.perfis_acesso where is_system and lower(nome) = 'administrador';
  end if;

  insert into public.usuarios (id, nome_completo, email, telefone, situacao, is_admin, perfil_id, funcao)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome_completo'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'telefone'), ''),
    case when v_primeiro then 'ativo'::public.situacao_usuario else 'pendente'::public.situacao_usuario end,
    v_primeiro,
    v_perfil_id,
    case when v_primeiro then 'Administrador do sistema' else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_provisionar_usuario();

-- ---------- notificações ----------
create table public.notificacoes (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references public.usuarios (id) on delete cascade,
  tipo           public.tipo_notificacao not null default 'sistema',
  titulo         text not null,
  mensagem       text,
  link           text,
  lida_em        timestamptz,
  dispensada_em  timestamptz,
  created_at     timestamptz not null default now()
);
create index notificacoes_caixa_ix on public.notificacoes (usuario_id, dispensada_em, created_at desc);

-- ---------- central de ajuda ----------
create table public.artigos_ajuda (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  resumo      text,
  conteudo    text,
  categoria   text,
  tags        text[] not null default '{}',
  publicado   boolean not null default false,
  autor_id    uuid references public.usuarios (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index artigos_ajuda_publicado_ix on public.artigos_ajuda (publicado, categoria);
create index artigos_ajuda_busca_ix on public.artigos_ajuda
  using gin (to_tsvector('portuguese', coalesce(titulo,'') || ' ' || coalesce(resumo,'') || ' ' || coalesce(conteudo,'')));

create trigger artigos_ajuda_updated_at
  before update on public.artigos_ajuda
  for each row execute function public.tg_set_updated_at();

-- ---------- dados da empresa (registro único) ----------
create table public.dados_empresa (
  id                        uuid primary key default gen_random_uuid(),
  singleton                 boolean not null default true,
  razao_social              text,
  nome_fantasia             text,
  cnpj                      text,
  telefone                  text,
  email                     text,
  site                      text,
  endereco                  text,
  municipio                 text,
  uf                        text,
  suporte_nome              text,
  suporte_email             text,
  suporte_telefone          text,
  politica_privacidade_url  text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint dados_empresa_singleton_ck check (singleton)
);
create unique index dados_empresa_singleton_uk on public.dados_empresa (singleton);

create trigger dados_empresa_updated_at
  before update on public.dados_empresa
  for each row execute function public.tg_set_updated_at();

-- ---------- auditoria ----------
create table public.auditoria (
  id          bigint generated always as identity primary key,
  usuario_id  uuid references public.usuarios (id) on delete set null,
  acao        text not null,
  entidade    text,
  entidade_id text,
  dados       jsonb,
  created_at  timestamptz not null default now()
);
create index auditoria_created_ix on public.auditoria (created_at desc);
create index auditoria_usuario_ix on public.auditoria (usuario_id, created_at desc);

-- ============================================================
-- RLS
-- ============================================================
alter table public.perfis_acesso  enable row level security;
alter table public.usuarios       enable row level security;
alter table public.notificacoes   enable row level security;
alter table public.artigos_ajuda  enable row level security;
alter table public.dados_empresa  enable row level security;
alter table public.auditoria      enable row level security;

-- usuarios
create policy usuarios_ler_proprio on public.usuarios
  for select to authenticated using (id = auth.uid());
create policy usuarios_ler_todos_admin on public.usuarios
  for select to authenticated using (public.usuario_atual_admin());
create policy usuarios_atualizar_proprio on public.usuarios
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy usuarios_admin_tudo on public.usuarios
  for all to authenticated using (public.usuario_atual_admin()) with check (public.usuario_atual_admin());

-- impede escalada de privilégio pelo próprio usuário
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
  new.situacao  := old.situacao;
  new.is_admin  := old.is_admin;
  new.perfil_id := old.perfil_id;
  new.funcao    := old.funcao;
  new.email     := old.email;
  return new;
end;
$$;

create trigger usuarios_proteger_campos
  before update on public.usuarios
  for each row execute function public.tg_usuarios_proteger_campos();

-- perfis de acesso
create policy perfis_ler on public.perfis_acesso
  for select to authenticated using (public.usuario_atual_ativo());
create policy perfis_admin on public.perfis_acesso
  for all to authenticated using (public.usuario_atual_admin()) with check (public.usuario_atual_admin());

-- notificações
create policy notificacoes_proprias on public.notificacoes
  for select to authenticated using (usuario_id = auth.uid());
create policy notificacoes_atualizar_proprias on public.notificacoes
  for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy notificacoes_admin on public.notificacoes
  for all to authenticated using (public.usuario_atual_admin()) with check (public.usuario_atual_admin());

-- artigos de ajuda
create policy artigos_ler_publicados on public.artigos_ajuda
  for select to authenticated using (publicado and public.usuario_atual_ativo());
create policy artigos_admin on public.artigos_ajuda
  for all to authenticated using (public.usuario_atual_admin()) with check (public.usuario_atual_admin());

-- dados da empresa
create policy empresa_ler on public.dados_empresa
  for select to authenticated using (public.usuario_atual_ativo());
create policy empresa_admin on public.dados_empresa
  for all to authenticated using (public.usuario_atual_admin()) with check (public.usuario_atual_admin());

-- auditoria
create policy auditoria_ler_admin on public.auditoria
  for select to authenticated using (public.usuario_atual_admin());
create policy auditoria_inserir on public.auditoria
  for insert to authenticated with check (usuario_id = auth.uid());

-- ============================================================
-- Perfil de sistema mínimo (configuração, não dado operacional)
-- ============================================================
insert into public.perfis_acesso (nome, descricao, is_system)
values ('Administrador', 'Acesso total ao sistema. Perfil de sistema, não removível.', true);;
