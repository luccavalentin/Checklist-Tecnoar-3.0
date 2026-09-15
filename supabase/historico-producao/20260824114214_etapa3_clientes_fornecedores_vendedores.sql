-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824114214.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ============================================================
-- ETAPA 3 — Cadastros comerciais
-- ============================================================
create extension if not exists pg_trgm;

create type public.tipo_pessoa as enum ('fisica', 'juridica');
create type public.origem_registro as enum ('manual', 'omie');

-- ---------- tags (cadastro central, tela na Etapa 4) ----------
create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  descricao   text,
  cor         text,
  situacao    public.situacao_registro not null default 'ativo',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index tags_nome_uk on public.tags (lower(nome));
create trigger tags_updated_at before update on public.tags
  for each row execute function public.tg_set_updated_at();

-- ---------- clientes ----------
create table public.clientes (
  id                     uuid primary key default gen_random_uuid(),
  codigo                 bigint generated always as identity,
  tipo_pessoa            public.tipo_pessoa not null default 'juridica',
  nome_razao             text not null,
  nome_fantasia          text,
  documento              text,
  documento_digitos      text generated always as (regexp_replace(coalesce(documento, ''), '\D', '', 'g')) stored,
  nascimento_fundacao    date,
  produtor_rural         boolean not null default false,
  inscricao_estadual     text,
  email                  text,
  celular                text,
  telefone               text,

  cep                    text,
  logradouro             text,
  numero                 text,
  sem_numero             boolean not null default false,
  bairro                 text,
  complemento            text,
  municipio              text,
  uf                     text,

  entrega_mesmo_endereco boolean not null default true,
  entrega_cep            text,
  entrega_logradouro     text,
  entrega_numero         text,
  entrega_bairro         text,
  entrega_complemento    text,
  entrega_municipio      text,
  entrega_uf             text,

  limite_credito         numeric(14, 2),
  observacao_credito     text,

  notificar_whatsapp     boolean not null default true,
  notificar_email        boolean not null default true,

  observacoes            text,
  situacao               public.situacao_registro not null default 'ativo',
  origem                 public.origem_registro not null default 'manual',
  omie_id                text,
  omie_sincronizado_em   timestamptz,

  criado_por             uuid references public.usuarios (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create unique index clientes_documento_uk on public.clientes (documento_digitos) where documento_digitos <> '';
create unique index clientes_omie_uk on public.clientes (omie_id) where omie_id is not null;
create index clientes_nome_trgm on public.clientes using gin (nome_razao gin_trgm_ops);
create index clientes_fantasia_trgm on public.clientes using gin (nome_fantasia gin_trgm_ops);
create index clientes_doc_ix on public.clientes (documento_digitos);
create index clientes_situacao_ix on public.clientes (situacao);
create index clientes_uf_ix on public.clientes (uf);
create index clientes_municipio_ix on public.clientes (lower(municipio));
create index clientes_criado_ix on public.clientes (created_at desc);
create trigger clientes_updated_at before update on public.clientes
  for each row execute function public.tg_set_updated_at();

create table public.cliente_contatos (
  id          uuid primary key default gen_random_uuid(),
  cliente_id  uuid not null references public.clientes (id) on delete cascade,
  nome_setor  text not null,
  email       text,
  telefone    text,
  celular     text,
  ordem       integer not null default 0,
  created_at  timestamptz not null default now()
);
create index cliente_contatos_cliente_ix on public.cliente_contatos (cliente_id, ordem);

create table public.cliente_tags (
  cliente_id  uuid not null references public.clientes (id) on delete cascade,
  tag_id      uuid not null references public.tags (id) on delete cascade,
  primary key (cliente_id, tag_id)
);
create index cliente_tags_tag_ix on public.cliente_tags (tag_id);

-- ---------- fornecedores ----------
create table public.fornecedores (
  id                   uuid primary key default gen_random_uuid(),
  codigo               bigint generated always as identity,
  tipo_pessoa          public.tipo_pessoa not null default 'juridica',
  descricao            text not null,
  nome_fantasia        text,
  documento            text,
  documento_digitos    text generated always as (regexp_replace(coalesce(documento, ''), '\D', '', 'g')) stored,
  produtor_rural       boolean not null default false,
  inscricao_estadual   text,
  cep                  text,
  logradouro           text,
  numero               text,
  bairro               text,
  complemento          text,
  municipio            text,
  uf                   text,
  telefone1            text,
  telefone2            text,
  email                text,
  observacoes          text,
  situacao             public.situacao_registro not null default 'ativo',
  origem               public.origem_registro not null default 'manual',
  omie_id              text,
  omie_sincronizado_em timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index fornecedores_documento_uk on public.fornecedores (documento_digitos) where documento_digitos <> '';
create unique index fornecedores_omie_uk on public.fornecedores (omie_id) where omie_id is not null;
create index fornecedores_desc_trgm on public.fornecedores using gin (descricao gin_trgm_ops);
create index fornecedores_situacao_ix on public.fornecedores (situacao);
create trigger fornecedores_updated_at before update on public.fornecedores
  for each row execute function public.tg_set_updated_at();

-- ---------- vendedores ----------
create type public.momento_comissao as enum ('faturamento', 'recebimento', 'entrega');
create type public.base_comissao as enum ('valor_total', 'produtos', 'servicos', 'lucro');
create type public.forma_comissao as enum ('percentual', 'valor_fixo');

create table public.vendedores (
  id                   uuid primary key default gen_random_uuid(),
  codigo               bigint generated always as identity,
  tipo_pessoa          public.tipo_pessoa not null default 'fisica',
  descricao            text not null,
  documento            text,
  documento_digitos    text generated always as (regexp_replace(coalesce(documento, ''), '\D', '', 'g')) stored,
  nascimento           date,
  inscricao_estadual   text,
  cep                  text,
  logradouro           text,
  numero               text,
  bairro               text,
  municipio            text,
  uf                   text,
  telefone             text,
  email                text,

  gerar_comissao       boolean not null default false,
  momento_comissao     public.momento_comissao,
  base_comissao        public.base_comissao,
  forma_comissao       public.forma_comissao,
  percentual_comissao  numeric(6, 3),

  usuario_id           uuid references public.usuarios (id) on delete set null,
  situacao             public.situacao_registro not null default 'ativo',
  origem               public.origem_registro not null default 'manual',
  omie_id              text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index vendedores_documento_uk on public.vendedores (documento_digitos) where documento_digitos <> '';
create index vendedores_desc_trgm on public.vendedores using gin (descricao gin_trgm_ops);
create index vendedores_situacao_ix on public.vendedores (situacao);
create trigger vendedores_updated_at before update on public.vendedores
  for each row execute function public.tg_set_updated_at();

-- ============================================================
-- RLS — padrão dos cadastros: leitura para conta ativa com permissão,
-- escrita conforme a ação.
-- ============================================================
create or replace function public.aplicar_rls_cadastro(p_tabela text, p_recurso text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  execute format('alter table public.%I enable row level security', p_tabela);
  execute format(
    'create policy %I on public.%I for select to authenticated using (public.tem_permissao(%L, ''visualizar''))',
    p_tabela || '_ler', p_tabela, p_recurso);
  execute format(
    'create policy %I on public.%I for insert to authenticated with check (public.tem_permissao(%L, ''criar''))',
    p_tabela || '_criar', p_tabela, p_recurso);
  execute format(
    'create policy %I on public.%I for update to authenticated using (public.tem_permissao(%L, ''editar'')) with check (public.tem_permissao(%L, ''editar''))',
    p_tabela || '_editar', p_tabela, p_recurso, p_recurso);
  execute format(
    'create policy %I on public.%I for delete to authenticated using (public.tem_permissao(%L, ''inativar''))',
    p_tabela || '_excluir', p_tabela, p_recurso);
end;
$$;
revoke execute on function public.aplicar_rls_cadastro(text, text) from public, anon, authenticated;

select public.aplicar_rls_cadastro('clientes', 'clientes');
select public.aplicar_rls_cadastro('fornecedores', 'fornecedores');
select public.aplicar_rls_cadastro('vendedores', 'vendedores');
select public.aplicar_rls_cadastro('tags', 'tags');

-- tabelas filhas seguem a permissão do pai
alter table public.cliente_contatos enable row level security;
create policy cliente_contatos_ler on public.cliente_contatos for select to authenticated
  using (public.tem_permissao('clientes', 'visualizar'));
create policy cliente_contatos_escrever on public.cliente_contatos for all to authenticated
  using (public.tem_permissao('clientes', 'editar')) with check (public.tem_permissao('clientes', 'editar'));

alter table public.cliente_tags enable row level security;
create policy cliente_tags_ler on public.cliente_tags for select to authenticated
  using (public.tem_permissao('clientes', 'visualizar'));
create policy cliente_tags_escrever on public.cliente_tags for all to authenticated
  using (public.tem_permissao('clientes', 'editar')) with check (public.tem_permissao('clientes', 'editar'));

-- tags precisam ser legíveis por quem usa clientes/OS, não só por quem gere tags
drop policy if exists tags_ler on public.tags;
create policy tags_ler on public.tags for select to authenticated
  using (public.usuario_atual_ativo());;
