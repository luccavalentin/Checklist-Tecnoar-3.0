-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824122252.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ============================================================
-- ETAPA 7 — Ordem de Serviço
-- ============================================================

create type public.tipo_os as enum ('os', 'orcamento', 'garantia');
create type public.situacao_aprovacao as enum ('pendente', 'aprovado', 'recusado');
create type public.estado_produto_os as enum ('necessario', 'reservado', 'utilizado', 'nao_utilizado', 'devolvido');
create type public.situacao_item as enum ('ativo', 'cancelado');

create table public.ordens_servico (
  id                 uuid primary key default gen_random_uuid(),
  numero             bigint generated always as identity,
  tipo               public.tipo_os not null default 'os',

  cliente_id         uuid not null references public.clientes (id) on delete restrict,
  veiculo_id         uuid not null references public.veiculos (id) on delete restrict,
  entrada_id         uuid references public.entradas_patio (id) on delete set null,
  status_id          uuid references public.status_os (id) on delete set null,

  km                 integer,
  problema_alegado   text,
  diagnostico        text,
  observacoes        text,

  aberta_em          timestamptz not null default now(),
  previsao_em        timestamptz,
  encerrada_em       timestamptz,
  status_alterado_em timestamptz not null default now(),

  valor_servicos     numeric(14, 2) not null default 0,
  valor_produtos     numeric(14, 2) not null default 0,
  desconto           numeric(14, 2) not null default 0,
  acrescimo          numeric(14, 2) not null default 0,
  valor_total        numeric(14, 2) not null default 0,

  prioridade         integer not null default 0,
  situacao           public.situacao_registro not null default 'ativo',

  aberta_por         uuid references public.usuarios (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index os_status_ix on public.ordens_servico (status_id, aberta_em desc);
create index os_cliente_ix on public.ordens_servico (cliente_id, aberta_em desc);
create index os_veiculo_ix on public.ordens_servico (veiculo_id, aberta_em desc);
create index os_aberta_ix on public.ordens_servico (aberta_em desc);
create index os_situacao_ix on public.ordens_servico (situacao);
create index os_problema_trgm on public.ordens_servico using gin (coalesce(problema_alegado, '') gin_trgm_ops);
create index os_diagnostico_trgm on public.ordens_servico using gin (coalesce(diagnostico, '') gin_trgm_ops);
create trigger os_updated_at before update on public.ordens_servico
  for each row execute function public.tg_set_updated_at();

-- mecânicos e especialidades atribuídos
create table public.os_mecanicos (
  os_id            uuid not null references public.ordens_servico (id) on delete cascade,
  usuario_id       uuid not null references public.usuarios (id) on delete cascade,
  especialidade_id uuid references public.especialidades (id) on delete set null,
  principal        boolean not null default false,
  atribuido_em     timestamptz not null default now(),
  primary key (os_id, usuario_id)
);
create index os_mecanicos_usuario_ix on public.os_mecanicos (usuario_id);

create table public.os_tags (
  os_id  uuid not null references public.ordens_servico (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (os_id, tag_id)
);

-- itens de serviço
create table public.os_servicos (
  id             uuid primary key default gen_random_uuid(),
  os_id          uuid not null references public.ordens_servico (id) on delete cascade,
  servico_id     uuid references public.servicos (id) on delete set null,
  codigo         text,
  descricao      text not null,
  quantidade     numeric(14, 3) not null default 1,
  valor_unitario numeric(14, 2) not null default 0,
  desconto       numeric(14, 2) not null default 0,
  valor_total    numeric(14, 2) generated always as
                   (round(greatest(quantidade * valor_unitario - desconto, 0), 2)) stored,
  aprovacao      public.situacao_aprovacao not null default 'pendente',
  aprovado_em    timestamptz,
  aprovado_por   uuid references public.usuarios (id) on delete set null,
  situacao       public.situacao_item not null default 'ativo',
  ordem          integer not null default 0,
  created_at     timestamptz not null default now()
);
create index os_servicos_os_ix on public.os_servicos (os_id, ordem);

-- itens de produto
create table public.os_produtos (
  id             uuid primary key default gen_random_uuid(),
  os_id          uuid not null references public.ordens_servico (id) on delete cascade,
  produto_id     uuid references public.produtos (id) on delete set null,
  codigo         text,
  descricao      text not null,
  unidade        text not null default 'UN',
  quantidade     numeric(14, 3) not null default 1,
  valor_unitario numeric(14, 2) not null default 0,
  desconto       numeric(14, 2) not null default 0,
  valor_total    numeric(14, 2) generated always as
                   (round(greatest(quantidade * valor_unitario - desconto, 0), 2)) stored,
  aprovacao      public.situacao_aprovacao not null default 'pendente',
  aprovado_em    timestamptz,
  aprovado_por   uuid references public.usuarios (id) on delete set null,
  estado         public.estado_produto_os not null default 'necessario',
  situacao       public.situacao_item not null default 'ativo',
  ordem          integer not null default 0,
  created_at     timestamptz not null default now()
);
create index os_produtos_os_ix on public.os_produtos (os_id, ordem);
create index os_produtos_produto_ix on public.os_produtos (produto_id);

-- linha do tempo da OS
create table public.os_eventos (
  id           uuid primary key default gen_random_uuid(),
  os_id        uuid not null references public.ordens_servico (id) on delete cascade,
  tipo         text not null,
  titulo       text not null,
  descricao    text,
  dados        jsonb,
  ocorrido_em  timestamptz not null default now(),
  usuario_id   uuid references public.usuarios (id) on delete set null
);
create index os_eventos_ix on public.os_eventos (os_id, ocorrido_em desc);

-- assinaturas
create table public.assinaturas (
  id            uuid primary key default gen_random_uuid(),
  entidade      text not null,
  entidade_id   uuid not null,
  momento       text not null,
  nome          text not null,
  documento     text,
  imagem_base64 text,
  observacao    text,
  assinado_em   timestamptz not null default now(),
  registrado_por uuid references public.usuarios (id) on delete set null
);
create index assinaturas_ix on public.assinaturas (entidade, entidade_id, assinado_em desc);

-- ============================================================
-- Totais recalculados no banco: a tela nunca inventa valor.
-- ============================================================
create or replace function public.recalcular_totais_os(p_os uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_serv numeric(14,2);
  v_prod numeric(14,2);
  v_desc numeric(14,2);
  v_acre numeric(14,2);
begin
  select coalesce(sum(valor_total), 0) into v_serv
  from public.os_servicos
  where os_id = p_os and situacao = 'ativo' and aprovacao <> 'recusado';

  select coalesce(sum(valor_total), 0) into v_prod
  from public.os_produtos
  where os_id = p_os and situacao = 'ativo' and aprovacao <> 'recusado';

  select desconto, acrescimo into v_desc, v_acre from public.ordens_servico where id = p_os;

  update public.ordens_servico
     set valor_servicos = v_serv,
         valor_produtos = v_prod,
         valor_total = greatest(v_serv + v_prod - coalesce(v_desc, 0) + coalesce(v_acre, 0), 0)
   where id = p_os;
end;
$$;
revoke execute on function public.recalcular_totais_os(uuid) from public, anon;
grant execute on function public.recalcular_totais_os(uuid) to authenticated;

create or replace function public.tg_os_item_totais()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.recalcular_totais_os(coalesce(new.os_id, old.os_id));
  return coalesce(new, old);
end;
$$;
revoke execute on function public.tg_os_item_totais() from public, anon, authenticated;

create trigger os_servicos_totais after insert or update or delete on public.os_servicos
  for each row execute function public.tg_os_item_totais();
create trigger os_produtos_totais after insert or update or delete on public.os_produtos
  for each row execute function public.tg_os_item_totais();

-- Histórico automático de status e prontuário do veículo.
create or replace function public.tg_os_historico()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text;
begin
  if tg_op = 'INSERT' then
    insert into public.os_eventos (os_id, tipo, titulo, usuario_id)
    values (new.id, 'abertura', 'Ordem de serviço aberta', new.aberta_por);

    insert into public.eventos_veiculo (
      veiculo_id, cliente_id, tipo, titulo, descricao, km, referencia_tabela, referencia_id, registrado_por
    ) values (
      new.veiculo_id, new.cliente_id, 'os', 'OS aberta', new.problema_alegado, new.km,
      'ordens_servico', new.id, new.aberta_por
    );
    return new;
  end if;

  if new.status_id is distinct from old.status_id then
    select nome into v_status from public.status_os where id = new.status_id;
    new.status_alterado_em := now();
    insert into public.os_eventos (os_id, tipo, titulo, descricao, usuario_id)
    values (new.id, 'status', 'Status alterado', coalesce(v_status, 'Sem status'), auth.uid());
  end if;

  if new.diagnostico is distinct from old.diagnostico and coalesce(new.diagnostico, '') <> '' then
    insert into public.os_eventos (os_id, tipo, titulo, descricao, usuario_id)
    values (new.id, 'diagnostico', 'Diagnóstico registrado', new.diagnostico, auth.uid());
  end if;

  return new;
end;
$$;
revoke execute on function public.tg_os_historico() from public, anon, authenticated;

create trigger os_historico_insert after insert on public.ordens_servico
  for each row execute function public.tg_os_historico();
create trigger os_historico_update before update on public.ordens_servico
  for each row execute function public.tg_os_historico();

-- ============================================================
-- RLS
-- ============================================================
alter table public.ordens_servico enable row level security;
create policy os_ler on public.ordens_servico for select to authenticated
  using (public.tem_permissao('ordens_servico', 'visualizar') or public.tem_permissao('patio', 'visualizar'));
create policy os_criar on public.ordens_servico for insert to authenticated
  with check (public.tem_permissao('ordens_servico', 'criar'));
create policy os_editar on public.ordens_servico for update to authenticated
  using (public.tem_permissao('ordens_servico', 'editar') or public.tem_permissao('minha_operacao', 'editar'))
  with check (public.tem_permissao('ordens_servico', 'editar') or public.tem_permissao('minha_operacao', 'editar'));

create or replace function public.rls_os_filhos_ler()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.tem_permissao('ordens_servico', 'visualizar')
      or public.tem_permissao('patio', 'visualizar')
      or public.tem_permissao('minha_operacao', 'visualizar');
$$;
create or replace function public.rls_os_filhos_escrever()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.tem_permissao('ordens_servico', 'editar')
      or public.tem_permissao('minha_operacao', 'editar');
$$;
revoke execute on function public.rls_os_filhos_ler() from public, anon;
revoke execute on function public.rls_os_filhos_escrever() from public, anon;
grant execute on function public.rls_os_filhos_ler() to authenticated;
grant execute on function public.rls_os_filhos_escrever() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['os_mecanicos','os_tags','os_servicos','os_produtos','os_eventos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.rls_os_filhos_ler())', t||'_ler', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.rls_os_filhos_escrever()) with check (public.rls_os_filhos_escrever())', t||'_escrever', t);
  end loop;
end $$;

alter table public.assinaturas enable row level security;
create policy assinaturas_ler on public.assinaturas for select to authenticated
  using (public.usuario_atual_ativo());
create policy assinaturas_criar on public.assinaturas for insert to authenticated
  with check (public.usuario_atual_ativo());;
