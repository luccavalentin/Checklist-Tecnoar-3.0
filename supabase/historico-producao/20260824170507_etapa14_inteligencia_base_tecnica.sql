-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824170507.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ETAPA 14 — Inteligência: Tecnoar IA, Base Técnica e E-books

create type papel_mensagem as enum ('usuario','assistente');
create type situacao_artigo as enum ('rascunho','em_revisao','aprovado','publicado','arquivado');
create type situacao_ebook as enum ('rascunho','publicado','arquivado');

/* ------------------------------------------------------------ base técnica */

create table artigos_tecnicos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity,
  titulo text not null,
  resumo text,
  conteudo text not null default '',
  categoria text,
  fabricante text,
  equipamento text,
  componente text,
  codigos text[] not null default '{}',
  tags text[] not null default '{}',
  sintomas text[] not null default '{}',
  situacao situacao_artigo not null default 'rascunho',
  versao integer not null default 1,
  autor_id uuid references usuarios (id) on delete set null,
  revisor_id uuid references usuarios (id) on delete set null,
  aprovado_por uuid references usuarios (id) on delete set null,
  aprovado_em timestamptz,
  publicado_em timestamptz,
  arquivado_em timestamptz,
  busca tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/* `array_to_string` é apenas STABLE, então o índice de busca é mantido por
   gatilho em vez de coluna gerada. */
create or replace function tg_artigo_busca() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.busca := to_tsvector('portuguese',
    coalesce(new.titulo,'') || ' ' || coalesce(new.resumo,'') || ' ' || coalesce(new.conteudo,'') || ' ' ||
    coalesce(new.categoria,'') || ' ' || coalesce(new.fabricante,'') || ' ' || coalesce(new.equipamento,'') || ' ' ||
    coalesce(new.componente,'') || ' ' || array_to_string(new.codigos,' ') || ' ' ||
    array_to_string(new.tags,' ') || ' ' || array_to_string(new.sintomas,' '));
  return new;
end;
$$;

create trigger tg_artigos_busca before insert or update on artigos_tecnicos
  for each row execute function tg_artigo_busca();

create index artigos_busca_idx on artigos_tecnicos using gin (busca);
create index artigos_situacao_idx on artigos_tecnicos (situacao, titulo);
select aplicar_rls_cadastro('artigos_tecnicos', 'base_tecnica');
create trigger tg_artigos_updated before update on artigos_tecnicos
  for each row execute function tg_set_updated_at();

/** Histórico de versões — cada publicação congela o texto daquele momento. */
create table artigo_versoes (
  id uuid primary key default gen_random_uuid(),
  artigo_id uuid not null references artigos_tecnicos (id) on delete cascade,
  versao integer not null,
  titulo text not null,
  conteudo text not null,
  publicado_em timestamptz not null default now(),
  publicado_por uuid references usuarios (id) on delete set null,
  unique (artigo_id, versao)
);

alter table artigo_versoes enable row level security;
create policy artigo_versoes_ler on artigo_versoes
  for select to authenticated using (tem_permissao('base_tecnica', 'visualizar'));
create policy artigo_versoes_criar on artigo_versoes
  for insert to authenticated with check (tem_permissao('base_tecnica', 'aprovar'));

/**
 * Publicar congela a versão e carimba quem aprovou. Reeditar um artigo já
 * publicado e publicar de novo gera a versão seguinte.
 */
create or replace function publicar_artigo(p_artigo uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a artigos_tecnicos;
  v_nova integer;
begin
  if not tem_permissao('base_tecnica', 'aprovar') then
    raise exception 'Sem permissão para publicar artigos.' using errcode = '42501';
  end if;

  select * into a from artigos_tecnicos where id = p_artigo for update;
  if not found then raise exception 'Artigo não encontrado.' using errcode = 'P0002'; end if;
  if btrim(coalesce(a.conteudo,'')) = '' then
    raise exception 'Não é possível publicar um artigo sem conteúdo.' using errcode = '22023';
  end if;

  v_nova := case when a.publicado_em is null then a.versao else a.versao + 1 end;

  insert into artigo_versoes (artigo_id, versao, titulo, conteudo, publicado_por)
  values (p_artigo, v_nova, a.titulo, a.conteudo, auth.uid())
  on conflict (artigo_id, versao) do update
    set titulo = excluded.titulo, conteudo = excluded.conteudo,
        publicado_em = now(), publicado_por = auth.uid();

  update artigos_tecnicos
     set situacao = 'publicado',
         versao = v_nova,
         publicado_em = now(),
         aprovado_por = coalesce(aprovado_por, auth.uid()),
         aprovado_em = coalesce(aprovado_em, now()),
         arquivado_em = null
   where id = p_artigo;

  return v_nova;
end;
$$;

grant execute on function publicar_artigo(uuid) to authenticated;

/** Busca full-text nos artigos publicados. Devolve só o que existe. */
create or replace function buscar_artigos(p_termo text, p_limite integer default 8)
returns table (
  id uuid,
  numero bigint,
  titulo text,
  resumo text,
  categoria text,
  fabricante text,
  equipamento text,
  componente text,
  versao integer,
  relevancia real
)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id, a.numero, a.titulo, a.resumo, a.categoria, a.fabricante, a.equipamento,
         a.componente, a.versao,
         ts_rank(a.busca, websearch_to_tsquery('portuguese', p_termo))
  from artigos_tecnicos a
  where a.situacao = 'publicado'
    and coalesce(btrim(p_termo), '') <> ''
    and a.busca @@ websearch_to_tsquery('portuguese', p_termo)
    and tem_permissao('base_tecnica', 'visualizar')
  order by ts_rank(a.busca, websearch_to_tsquery('portuguese', p_termo)) desc
  limit greatest(coalesce(p_limite, 8), 1);
$$;

grant execute on function buscar_artigos(text, integer) to authenticated;

/* ---------------------------------------------------------------- Tecnoar IA */

create table ia_conversas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null default 'Nova análise',
  usuario_id uuid references usuarios (id) on delete set null,
  os_id uuid references ordens_servico (id) on delete set null,
  veiculo_id uuid references veiculos (id) on delete set null,
  cliente_id uuid references clientes (id) on delete set null,
  arquivada boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index ia_conversas_usuario_idx on ia_conversas (usuario_id, updated_at desc);
create trigger tg_ia_conversas_updated before update on ia_conversas
  for each row execute function tg_set_updated_at();

alter table ia_conversas enable row level security;

/* Cada pessoa vê e escreve nas próprias análises; quem configura o módulo vê todas. */
create policy ia_conversas_ler on ia_conversas
  for select to authenticated
  using (tem_permissao('tecnoar_ia','visualizar') and (usuario_id = auth.uid() or tem_permissao('tecnoar_ia','configurar')));
create policy ia_conversas_criar on ia_conversas
  for insert to authenticated
  with check (tem_permissao('tecnoar_ia','criar') and usuario_id = auth.uid());
create policy ia_conversas_editar on ia_conversas
  for update to authenticated
  using (usuario_id = auth.uid() and tem_permissao('tecnoar_ia','criar'))
  with check (usuario_id = auth.uid());
create policy ia_conversas_excluir on ia_conversas
  for delete to authenticated
  using (usuario_id = auth.uid() and tem_permissao('tecnoar_ia','criar'));

create table ia_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references ia_conversas (id) on delete cascade,
  papel papel_mensagem not null,
  conteudo text not null default '',
  estruturado jsonb,
  anexos jsonb,
  modelo text,
  tokens_entrada integer,
  tokens_saida integer,
  fora_do_escopo boolean not null default false,
  sem_fonte boolean not null default false,
  erro text,
  created_at timestamptz not null default now()
);

create index ia_mensagens_conversa_idx on ia_mensagens (conversa_id, created_at);

alter table ia_mensagens enable row level security;

create policy ia_mensagens_ler on ia_mensagens
  for select to authenticated
  using (exists (select 1 from ia_conversas c where c.id = conversa_id
                  and (c.usuario_id = auth.uid() or tem_permissao('tecnoar_ia','configurar'))));

/* A escrita é da função de borda (service_role): a resposta nunca é forjada pelo cliente. */

create table ia_fontes (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references ia_mensagens (id) on delete cascade,
  artigo_id uuid references artigos_tecnicos (id) on delete set null,
  titulo text not null,
  versao integer,
  created_at timestamptz not null default now()
);

alter table ia_fontes enable row level security;
create policy ia_fontes_ler on ia_fontes
  for select to authenticated
  using (exists (select 1 from ia_mensagens m join ia_conversas c on c.id = m.conversa_id
                  where m.id = mensagem_id and (c.usuario_id = auth.uid() or tem_permissao('tecnoar_ia','configurar'))));

create table ia_feedback (
  mensagem_id uuid not null references ia_mensagens (id) on delete cascade,
  usuario_id uuid not null references usuarios (id) on delete cascade,
  util boolean not null,
  comentario text,
  created_at timestamptz not null default now(),
  primary key (mensagem_id, usuario_id)
);

alter table ia_feedback enable row level security;
create policy ia_feedback_ler on ia_feedback
  for select to authenticated using (tem_permissao('tecnoar_ia','visualizar'));
create policy ia_feedback_gravar on ia_feedback
  for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid() and tem_permissao('tecnoar_ia','criar'));

/* ------------------------------------------------------------------ e-books */

create table ebooks (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  subtitulo text,
  descricao text,
  versao text not null default '1.0',
  situacao situacao_ebook not null default 'rascunho',
  publicado_em timestamptz,
  criado_por uuid references usuarios (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select aplicar_rls_cadastro('ebooks', 'ebooks');
create trigger tg_ebooks_updated before update on ebooks
  for each row execute function tg_set_updated_at();

create table ebook_capitulos (
  id uuid primary key default gen_random_uuid(),
  ebook_id uuid not null references ebooks (id) on delete cascade,
  artigo_id uuid not null references artigos_tecnicos (id) on delete restrict,
  ordem integer not null default 0,
  unique (ebook_id, artigo_id)
);

alter table ebook_capitulos enable row level security;
create policy ebook_capitulos_ler on ebook_capitulos
  for select to authenticated using (tem_permissao('ebooks','visualizar'));
create policy ebook_capitulos_escrever on ebook_capitulos
  for all to authenticated
  using (tem_permissao('ebooks','editar'))
  with check (tem_permissao('ebooks','editar'));

/**
 * Só entram no e-book artigos publicados. Se um capítulo apontar para um
 * artigo que saiu do ar, ele aparece como pendente em vez de sumir calado.
 */
create view vw_ebook_capitulos
with (security_invoker = true) as
select
  c.id,
  c.ebook_id,
  c.ordem,
  a.id as artigo_id,
  a.numero,
  a.titulo,
  a.resumo,
  a.conteudo,
  a.categoria,
  a.fabricante,
  a.versao,
  a.situacao,
  a.publicado_em
from ebook_capitulos c
join artigos_tecnicos a on a.id = c.artigo_id;

grant select on vw_ebook_capitulos to authenticated;

/* A linha da Anthropic nasce não configurada — nada finge estar conectado. */
insert into integracoes (provedor, ambiente, status)
values ('anthropic', 'claude-sonnet-4-5', 'nao_configurada')
on conflict do nothing;;
