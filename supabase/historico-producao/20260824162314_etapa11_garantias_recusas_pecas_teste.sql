-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824162314.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ============================================================
-- ETAPA 11 — Pós-serviço e laboratório
-- ============================================================

create type public.tipo_item_garantia as enum ('produto', 'servico');
create type public.situacao_garantia as enum ('vigente', 'expirada', 'acionada', 'cancelada');
create type public.decisao_retorno as enum ('pendente', 'procedente', 'improcedente', 'cortesia');
create type public.situacao_retorno as enum ('aberto', 'em_analise', 'concluido', 'cancelado');
create type public.status_peca_teste as enum (
  'recebida', 'aguardando_teste', 'em_teste', 'aguardando_peca',
  'reparada', 'reprovada', 'aguardando_cliente', 'entregue'
);

-- ---------- garantias por item ----------
create table public.garantias (
  id             uuid primary key default gen_random_uuid(),
  numero         bigint generated always as identity,
  cliente_id     uuid not null references public.clientes (id) on delete restrict,
  veiculo_id     uuid references public.veiculos (id) on delete set null,
  os_id          uuid references public.ordens_servico (id) on delete set null,

  tipo_item      public.tipo_item_garantia not null,
  os_produto_id  uuid references public.os_produtos (id) on delete set null,
  os_servico_id  uuid references public.os_servicos (id) on delete set null,
  produto_id     uuid references public.produtos (id) on delete set null,
  servico_id     uuid references public.servicos (id) on delete set null,
  descricao_item text not null,

  inicio         date not null default current_date,
  fim            date,
  km_inicial     integer,
  km_limite      integer,
  politica       text,

  situacao       public.situacao_garantia not null default 'vigente',
  observacoes    text,
  criada_por     uuid references public.usuarios (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index garantias_cliente_ix on public.garantias (cliente_id, inicio desc);
create index garantias_veiculo_ix on public.garantias (veiculo_id, inicio desc);
create index garantias_os_ix on public.garantias (os_id);
create index garantias_situacao_ix on public.garantias (situacao, fim);
create trigger garantias_updated_at before update on public.garantias
  for each row execute function public.tg_set_updated_at();

-- ---------- retornos ----------
create table public.retornos (
  id            uuid primary key default gen_random_uuid(),
  numero        bigint generated always as identity,
  garantia_id   uuid references public.garantias (id) on delete set null,
  cliente_id    uuid not null references public.clientes (id) on delete restrict,
  veiculo_id    uuid references public.veiculos (id) on delete set null,
  os_origem_id  uuid references public.ordens_servico (id) on delete set null,
  os_retorno_id uuid references public.ordens_servico (id) on delete set null,

  data_retorno  date not null default current_date,
  km            integer,
  motivo        text not null,
  descricao     text,
  analise       text,
  responsavel_id uuid references public.usuarios (id) on delete set null,
  decisao       public.decisao_retorno not null default 'pendente',
  situacao      public.situacao_retorno not null default 'aberto',
  concluido_em  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index retornos_cliente_ix on public.retornos (cliente_id, data_retorno desc);
create index retornos_situacao_ix on public.retornos (situacao);
create trigger retornos_updated_at before update on public.retornos
  for each row execute function public.tg_set_updated_at();

-- ---------- termo de ciência e responsabilidade (recusa) ----------
create table public.termos_recusa (
  id              uuid primary key default gen_random_uuid(),
  numero          bigint generated always as identity,
  cliente_id      uuid not null references public.clientes (id) on delete restrict,
  veiculo_id      uuid references public.veiculos (id) on delete set null,
  os_id           uuid references public.ordens_servico (id) on delete set null,
  defeito_id      uuid references public.checklist_defeitos (id) on delete set null,

  km              integer,
  defeito         text not null,
  risco           text,
  recomendacao    text,
  item_recusado   text,

  responsavel_id  uuid references public.usuarios (id) on delete set null,
  assinado_em     timestamptz,
  snapshot        jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index termos_cliente_ix on public.termos_recusa (cliente_id, created_at desc);
create index termos_os_ix on public.termos_recusa (os_id);
create trigger termos_updated_at before update on public.termos_recusa
  for each row execute function public.tg_set_updated_at();

create or replace function public.tg_termo_imutavel()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.assinado_em is not null then
    raise exception 'Este termo já foi assinado e não pode ser alterado. Emita um novo termo.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_termo_imutavel() from public, anon, authenticated;
create trigger termos_imutaveis before update on public.termos_recusa
  for each row execute function public.tg_termo_imutavel();

-- ---------- peças em teste (laboratório) ----------
create sequence public.protocolo_peca_seq;

create table public.pecas_teste (
  id                uuid primary key default gen_random_uuid(),
  -- Protocolo único e sequencial: nunca aleatório, nunca duplicado.
  protocolo         text not null unique
                      default 'PT-' || to_char(now(), 'YYYY') || '-' ||
                              lpad(nextval('public.protocolo_peca_seq')::text, 5, '0'),
  cliente_id        uuid not null references public.clientes (id) on delete restrict,
  os_id             uuid references public.ordens_servico (id) on delete set null,
  veiculo_id        uuid references public.veiculos (id) on delete set null,

  peca              text not null,
  descricao         text,
  fabricante        text,
  numero_serie      text,
  quantidade        integer not null default 1,

  especialidade_id  uuid references public.especialidades (id) on delete set null,
  mecanico_id       uuid references public.usuarios (id) on delete set null,

  entrada_em        timestamptz not null default now(),
  sla_horas         integer not null default 48,
  -- Calculado por gatilho: soma de timestamptz com intervalo não é imutável.
  prazo_em          timestamptz,

  status            public.status_peca_teste not null default 'recebida',
  laudo             text,
  observacao        text,
  entregue_em       timestamptz,
  recebido_por      uuid references public.usuarios (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index pecas_status_ix on public.pecas_teste (status, prazo_em);
create index pecas_mecanico_ix on public.pecas_teste (mecanico_id, status);
create index pecas_cliente_ix on public.pecas_teste (cliente_id, entrada_em desc);
create trigger pecas_updated_at before update on public.pecas_teste
  for each row execute function public.tg_set_updated_at();

create or replace function public.tg_peca_prazo()
returns trigger
language plpgsql
as $$
begin
  new.prazo_em := new.entrada_em + make_interval(hours => coalesce(new.sla_horas, 48));
  return new;
end;
$$;
create trigger pecas_prazo before insert or update of entrada_em, sla_horas on public.pecas_teste
  for each row execute function public.tg_peca_prazo();

create table public.pecas_teste_eventos (
  id            uuid primary key default gen_random_uuid(),
  peca_id       uuid not null references public.pecas_teste (id) on delete cascade,
  status        public.status_peca_teste not null,
  observacao    text,
  ocorrido_em   timestamptz not null default now(),
  usuario_id    uuid references public.usuarios (id) on delete set null
);
create index pecas_eventos_ix on public.pecas_teste_eventos (peca_id, ocorrido_em desc);

create or replace function public.tg_peca_evento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.pecas_teste_eventos (peca_id, status, usuario_id)
    values (new.id, new.status, auth.uid());
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into public.pecas_teste_eventos (peca_id, status, observacao, usuario_id)
    values (new.id, new.status, new.observacao, auth.uid());
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_peca_evento() from public, anon, authenticated;
create trigger pecas_evento_insert after insert on public.pecas_teste
  for each row execute function public.tg_peca_evento();
create trigger pecas_evento_update after update on public.pecas_teste
  for each row execute function public.tg_peca_evento();

create or replace function public.tg_peca_entrega()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'entregue' and new.entregue_em is null then
    new.entregue_em := now();
  end if;
  return new;
end;
$$;
create trigger pecas_entrega before update on public.pecas_teste
  for each row execute function public.tg_peca_entrega();

-- ============================================================
-- Indicadores de SLA do laboratório (cálculo real)
-- ============================================================
create or replace function public.sla_pecas_teste()
returns table (no_prazo bigint, atencao bigint, vencido bigint, entregues_mes bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    count(*) filter (where status <> 'entregue' and prazo_em - now() > interval '8 hours'),
    count(*) filter (where status <> 'entregue' and prazo_em > now() and prazo_em - now() <= interval '8 hours'),
    count(*) filter (where status <> 'entregue' and prazo_em <= now()),
    count(*) filter (where status = 'entregue' and entregue_em >= date_trunc('month', now()))
  from public.pecas_teste
  where public.tem_permissao('pecas_em_teste', 'visualizar');
$$;
revoke execute on function public.sla_pecas_teste() from public, anon;
grant execute on function public.sla_pecas_teste() to authenticated;

-- ============================================================
-- RLS
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['garantias','retornos','termos_recusa'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.tem_permissao(''garantias'', ''visualizar''))', t||'_ler', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.tem_permissao(''garantias'', ''criar''))', t||'_criar', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.tem_permissao(''garantias'', ''editar'')) with check (public.tem_permissao(''garantias'', ''editar''))', t||'_editar', t);
  end loop;

  foreach t in array array['pecas_teste','pecas_teste_eventos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.tem_permissao(''pecas_em_teste'', ''visualizar''))', t||'_ler', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.tem_permissao(''pecas_em_teste'', ''criar''))', t||'_criar', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.tem_permissao(''pecas_em_teste'', ''editar'')) with check (public.tem_permissao(''pecas_em_teste'', ''editar''))', t||'_editar', t);
  end loop;
end $$;;
