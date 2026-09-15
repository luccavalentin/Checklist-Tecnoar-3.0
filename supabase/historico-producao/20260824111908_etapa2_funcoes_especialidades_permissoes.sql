-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824111908.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ============================================================
-- ETAPA 2 — Funções, Especialidades, Perfis e Permissões
-- ============================================================

create type public.acao_permissao as enum (
  'visualizar', 'criar', 'editar', 'aprovar', 'cancelar', 'inativar', 'configurar', 'exportar', 'sincronizar'
);

-- ---------- funções / cargos ----------
create table public.funcoes (
  id                      uuid primary key default gen_random_uuid(),
  nome                    text not null,
  descricao               text,
  /* Define quem pode ser atribuído como mecânico numa OS. */
  atua_como_mecanico      boolean not null default false,
  /* Define quem pode ser responsável por peças em teste (laboratório). */
  atua_no_laboratorio     boolean not null default false,
  is_system               boolean not null default false,
  situacao                public.situacao_registro not null default 'ativo',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create unique index funcoes_nome_uk on public.funcoes (lower(nome));
create index funcoes_situacao_ix on public.funcoes (situacao);

create trigger funcoes_updated_at before update on public.funcoes
  for each row execute function public.tg_set_updated_at();

-- ---------- especialidades ----------
create table public.especialidades (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null,
  descricao       text,
  de_laboratorio  boolean not null default false,
  situacao        public.situacao_registro not null default 'ativo',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index especialidades_nome_uk on public.especialidades (lower(nome));
create index especialidades_situacao_ix on public.especialidades (situacao);

create trigger especialidades_updated_at before update on public.especialidades
  for each row execute function public.tg_set_updated_at();

create table public.usuario_especialidades (
  usuario_id        uuid not null references public.usuarios (id) on delete cascade,
  especialidade_id  uuid not null references public.especialidades (id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (usuario_id, especialidade_id)
);
create index usuario_especialidades_esp_ix on public.usuario_especialidades (especialidade_id);

-- ---------- usuários: função vira relacionamento ----------
alter table public.usuarios add column funcao_id uuid references public.funcoes (id) on delete set null;
create index usuarios_funcao_ix on public.usuarios (funcao_id);

-- ---------- catálogo de recursos protegidos ----------
create table public.recursos (
  chave   text primary key,
  nome    text not null,
  grupo   text not null,
  acoes   public.acao_permissao[] not null,
  ordem   integer not null default 0
);

-- ---------- permissões por perfil ----------
create table public.perfil_permissoes (
  perfil_id  uuid not null references public.perfis_acesso (id) on delete cascade,
  recurso    text not null references public.recursos (chave) on delete cascade,
  acao       public.acao_permissao not null,
  primary key (perfil_id, recurso, acao)
);
create index perfil_permissoes_perfil_ix on public.perfil_permissoes (perfil_id);

-- ---------- exceções por usuário ----------
create table public.usuario_permissoes (
  usuario_id  uuid not null references public.usuarios (id) on delete cascade,
  recurso     text not null references public.recursos (chave) on delete cascade,
  acao        public.acao_permissao not null,
  /* true concede mesmo que o perfil não tenha; false revoga mesmo que tenha. */
  concedida   boolean not null,
  motivo      text,
  created_at  timestamptz not null default now(),
  primary key (usuario_id, recurso, acao)
);
create index usuario_permissoes_usuario_ix on public.usuario_permissoes (usuario_id);

-- ============================================================
-- Motor de autorização
-- ============================================================

create or replace function public.tem_permissao(p_recurso text, p_acao public.acao_permissao)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_ativo     boolean;
  v_admin     boolean;
  v_perfil    uuid;
  v_excecao   boolean;
begin
  if v_uid is null then
    return false;
  end if;

  select (u.situacao = 'ativo'), u.is_admin, u.perfil_id
    into v_ativo, v_admin, v_perfil
  from public.usuarios u where u.id = v_uid;

  if v_ativo is not true then
    return false;
  end if;

  if v_admin then
    return true;
  end if;

  -- Exceção individual sempre prevalece sobre o perfil.
  select up.concedida into v_excecao
  from public.usuario_permissoes up
  where up.usuario_id = v_uid and up.recurso = p_recurso and up.acao = p_acao;

  if found then
    return v_excecao;
  end if;

  if v_perfil is null then
    return false;
  end if;

  return exists (
    select 1 from public.perfil_permissoes pp
    where pp.perfil_id = v_perfil and pp.recurso = p_recurso and pp.acao = p_acao
  );
end;
$$;

revoke execute on function public.tem_permissao(text, public.acao_permissao) from public, anon;
grant execute on function public.tem_permissao(text, public.acao_permissao) to authenticated;

-- Conjunto efetivo de permissões do usuário autenticado (para a interface).
create or replace function public.minhas_permissoes()
returns table (recurso text, acao public.acao_permissao)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := auth.uid();
  v_ativo  boolean;
  v_admin  boolean;
  v_perfil uuid;
begin
  if v_uid is null then return; end if;

  select (u.situacao = 'ativo'), u.is_admin, u.perfil_id
    into v_ativo, v_admin, v_perfil
  from public.usuarios u where u.id = v_uid;

  if v_ativo is not true then return; end if;

  if v_admin then
    return query
      select r.chave, a from public.recursos r, unnest(r.acoes) a;
    return;
  end if;

  return query
    with do_perfil as (
      select pp.recurso, pp.acao
      from public.perfil_permissoes pp
      where v_perfil is not null and pp.perfil_id = v_perfil
    ),
    excecoes as (
      select up.recurso, up.acao, up.concedida
      from public.usuario_permissoes up
      where up.usuario_id = v_uid
    )
    select coalesce(p.recurso, e.recurso), coalesce(p.acao, e.acao)
    from do_perfil p
    full outer join excecoes e on e.recurso = p.recurso and e.acao = p.acao
    where coalesce(e.concedida, true);
end;
$$;

revoke execute on function public.minhas_permissoes() from public, anon;
grant execute on function public.minhas_permissoes() to authenticated;

-- ============================================================
-- RLS
-- ============================================================
alter table public.funcoes                enable row level security;
alter table public.especialidades         enable row level security;
alter table public.usuario_especialidades enable row level security;
alter table public.recursos               enable row level security;
alter table public.perfil_permissoes      enable row level security;
alter table public.usuario_permissoes     enable row level security;

-- funções
create policy funcoes_ler on public.funcoes for select to authenticated
  using (public.usuario_atual_ativo());
create policy funcoes_criar on public.funcoes for insert to authenticated
  with check (public.tem_permissao('funcoes', 'criar'));
create policy funcoes_editar on public.funcoes for update to authenticated
  using (public.tem_permissao('funcoes', 'editar')) with check (public.tem_permissao('funcoes', 'editar'));
create policy funcoes_excluir on public.funcoes for delete to authenticated
  using (public.tem_permissao('funcoes', 'inativar') and not is_system);

-- especialidades
create policy especialidades_ler on public.especialidades for select to authenticated
  using (public.usuario_atual_ativo());
create policy especialidades_criar on public.especialidades for insert to authenticated
  with check (public.tem_permissao('especialidades', 'criar'));
create policy especialidades_editar on public.especialidades for update to authenticated
  using (public.tem_permissao('especialidades', 'editar')) with check (public.tem_permissao('especialidades', 'editar'));
create policy especialidades_excluir on public.especialidades for delete to authenticated
  using (public.tem_permissao('especialidades', 'inativar'));

-- vínculo usuário x especialidade
create policy ue_ler on public.usuario_especialidades for select to authenticated
  using (public.usuario_atual_ativo());
create policy ue_escrever on public.usuario_especialidades for all to authenticated
  using (public.tem_permissao('usuarios', 'editar')) with check (public.tem_permissao('usuarios', 'editar'));

-- recursos (catálogo somente leitura pela API)
create policy recursos_ler on public.recursos for select to authenticated
  using (public.usuario_atual_ativo());

-- permissões de perfil
create policy pp_ler on public.perfil_permissoes for select to authenticated
  using (public.usuario_atual_ativo());
create policy pp_escrever on public.perfil_permissoes for all to authenticated
  using (public.tem_permissao('perfis_permissoes', 'configurar'))
  with check (public.tem_permissao('perfis_permissoes', 'configurar'));

-- exceções por usuário
create policy up_ler on public.usuario_permissoes for select to authenticated
  using (usuario_id = auth.uid() or public.tem_permissao('perfis_permissoes', 'visualizar'));
create policy up_escrever on public.usuario_permissoes for all to authenticated
  using (public.tem_permissao('perfis_permissoes', 'configurar'))
  with check (public.tem_permissao('perfis_permissoes', 'configurar'));

-- ============================================================
-- Usuários: leitura e escrita passam a respeitar permissões
-- ============================================================
drop policy if exists usuarios_ler_todos_admin on public.usuarios;
create policy usuarios_ler_com_permissao on public.usuarios for select to authenticated
  using (public.tem_permissao('usuarios', 'visualizar'));

create policy usuarios_criar on public.usuarios for insert to authenticated
  with check (public.tem_permissao('usuarios', 'criar'));
create policy usuarios_editar on public.usuarios for update to authenticated
  using (public.tem_permissao('usuarios', 'editar')) with check (public.tem_permissao('usuarios', 'editar'));

-- Só admin altera campos privilegiados; quem tem permissão de editar usuários
-- pode mexer em situação, função e perfil (mas nunca em is_admin).
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

-- ============================================================
-- Views de elegibilidade (usadas pelas etapas seguintes)
-- ============================================================
create or replace view public.vw_mecanicos
with (security_invoker = true) as
select distinct u.id, u.nome_completo, u.email, u.avatar_url, u.funcao_id, f.nome as funcao
from public.usuarios u
join public.funcoes f on f.id = u.funcao_id
where u.situacao = 'ativo' and f.situacao = 'ativo' and f.atua_como_mecanico;

create or replace view public.vw_mecanicos_laboratorio
with (security_invoker = true) as
select distinct u.id, u.nome_completo, u.email, u.avatar_url, u.funcao_id, f.nome as funcao
from public.usuarios u
join public.funcoes f on f.id = u.funcao_id
left join public.usuario_especialidades ue on ue.usuario_id = u.id
left join public.especialidades e on e.id = ue.especialidade_id
where u.situacao = 'ativo'
  and f.situacao = 'ativo'
  and (f.atua_no_laboratorio or (e.de_laboratorio and e.situacao = 'ativo'));;
