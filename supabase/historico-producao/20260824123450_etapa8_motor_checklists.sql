-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824123450.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ============================================================
-- ETAPA 8 — Motor de checklists (versionado)
-- ============================================================

create type public.tipo_checklist as enum (
  'tecnico_inicial', 'final_os', 'diario_abertura', 'diario_fechamento'
);
create type public.tipo_resposta_checklist as enum ('estado', 'conformidade');
create type public.resposta_checklist as enum (
  'ok', 'nao_ok', 'nao_se_aplica', 'nao_verificado', 'conforme', 'nao_conforme'
);
create type public.situacao_checklist as enum ('em_andamento', 'concluido', 'cancelado');
create type public.criticidade as enum ('baixa', 'media', 'alta', 'critica');

-- ---------- modelos ----------
create table public.checklist_modelos (
  id            uuid primary key default gen_random_uuid(),
  descricao     text not null,
  tipo          public.tipo_checklist not null,
  tipo_veiculo  public.tipo_veiculo,
  versao_atual  integer not null default 1,
  situacao      public.situacao_registro not null default 'ativo',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index checklist_modelos_tipo_ix on public.checklist_modelos (tipo, situacao);
create trigger checklist_modelos_updated_at before update on public.checklist_modelos
  for each row execute function public.tg_set_updated_at();

-- ---------- itens por versão ----------
create table public.checklist_modelo_itens (
  id                uuid primary key default gen_random_uuid(),
  modelo_id         uuid not null references public.checklist_modelos (id) on delete cascade,
  versao            integer not null,
  secao             text not null default 'Geral',
  ordem             integer not null default 0,
  texto             text not null,
  tipo_resposta     public.tipo_resposta_checklist not null default 'estado',
  exige_evidencia   boolean not null default false,
  exige_medicao     boolean not null default false,
  unidade_medicao   text,
  obrigatorio       boolean not null default true,
  orientacao        text,
  created_at        timestamptz not null default now()
);
create index checklist_itens_ix on public.checklist_modelo_itens (modelo_id, versao, ordem);
create unique index checklist_itens_uk on public.checklist_modelo_itens (modelo_id, versao, secao, texto);

-- ---------- execuções ----------
create table public.checklists (
  id               uuid primary key default gen_random_uuid(),
  numero           bigint generated always as identity,
  modelo_id        uuid references public.checklist_modelos (id) on delete set null,
  /* Versão congelada: alterar o modelo depois não muda este histórico. */
  versao           integer not null,
  modelo_descricao text not null,
  tipo             public.tipo_checklist not null,

  os_id            uuid references public.ordens_servico (id) on delete set null,
  veiculo_id       uuid references public.veiculos (id) on delete set null,
  cliente_id       uuid references public.clientes (id) on delete set null,
  km               integer,
  placa_carreta_1  text,
  placa_carreta_2  text,

  /* 5S e checklists diários não pertencem a uma OS. */
  setor            text,
  data_referencia  date,

  responsavel_id   uuid references public.usuarios (id) on delete set null,
  especialidade_id uuid references public.especialidades (id) on delete set null,

  situacao         public.situacao_checklist not null default 'em_andamento',
  iniciado_em      timestamptz not null default now(),
  concluido_em     timestamptz,
  observacoes      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index checklists_os_ix on public.checklists (os_id);
create index checklists_veiculo_ix on public.checklists (veiculo_id, iniciado_em desc);
create index checklists_tipo_ix on public.checklists (tipo, iniciado_em desc);
create index checklists_responsavel_ix on public.checklists (responsavel_id, iniciado_em desc);
create index checklists_data_ix on public.checklists (data_referencia desc);
create trigger checklists_updated_at before update on public.checklists
  for each row execute function public.tg_set_updated_at();

-- ---------- respostas (com o item congelado) ----------
create table public.checklist_respostas (
  id             uuid primary key default gen_random_uuid(),
  checklist_id   uuid not null references public.checklists (id) on delete cascade,
  item_id        uuid references public.checklist_modelo_itens (id) on delete set null,
  secao          text not null,
  ordem          integer not null default 0,
  texto          text not null,
  tipo_resposta  public.tipo_resposta_checklist not null default 'estado',
  exige_evidencia boolean not null default false,
  exige_medicao  boolean not null default false,
  unidade_medicao text,
  obrigatorio    boolean not null default true,

  resposta       public.resposta_checklist,
  observacao     text,
  medicao        numeric(14, 3),
  respondido_em  timestamptz,
  respondido_por uuid references public.usuarios (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index checklist_respostas_ix on public.checklist_respostas (checklist_id, ordem);

-- ---------- defeitos apontados a partir de um item "Não OK" ----------
create table public.checklist_defeitos (
  id              uuid primary key default gen_random_uuid(),
  resposta_id     uuid not null references public.checklist_respostas (id) on delete cascade,
  checklist_id    uuid not null references public.checklists (id) on delete cascade,
  sistema         text,
  componente      text,
  defeito         text not null,
  descricao       text,
  criticidade     public.criticidade not null default 'media',
  recomendacao    text,
  produto_id      uuid references public.produtos (id) on delete set null,
  servico_id      uuid references public.servicos (id) on delete set null,
  aprovacao       public.situacao_aprovacao not null default 'pendente',
  aprovado_em     timestamptz,
  aprovado_por    uuid references public.usuarios (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index checklist_defeitos_ix on public.checklist_defeitos (checklist_id);

-- ============================================================
-- Publicar nova versão: copia os itens da versão atual
-- ============================================================
create or replace function public.nova_versao_checklist(p_modelo uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atual integer;
  v_nova  integer;
begin
  if not public.tem_permissao('checklists', 'configurar') then
    raise exception 'Sem permissão para versionar checklists.' using errcode = '42501';
  end if;

  select versao_atual into v_atual from public.checklist_modelos where id = p_modelo;
  if v_atual is null then
    raise exception 'Modelo não encontrado.';
  end if;
  v_nova := v_atual + 1;

  insert into public.checklist_modelo_itens (
    modelo_id, versao, secao, ordem, texto, tipo_resposta,
    exige_evidencia, exige_medicao, unidade_medicao, obrigatorio, orientacao
  )
  select modelo_id, v_nova, secao, ordem, texto, tipo_resposta,
         exige_evidencia, exige_medicao, unidade_medicao, obrigatorio, orientacao
  from public.checklist_modelo_itens
  where modelo_id = p_modelo and versao = v_atual;

  update public.checklist_modelos set versao_atual = v_nova where id = p_modelo;
  return v_nova;
end;
$$;
revoke execute on function public.nova_versao_checklist(uuid) from public, anon;
grant execute on function public.nova_versao_checklist(uuid) to authenticated;

-- ============================================================
-- Iniciar execução: congela o modelo na versão atual
-- ============================================================
create or replace function public.iniciar_checklist(
  p_modelo uuid,
  p_os uuid default null,
  p_veiculo uuid default null,
  p_cliente uuid default null,
  p_km integer default null,
  p_setor text default null,
  p_data date default null,
  p_especialidade uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_modelo record;
  v_id uuid;
begin
  if not (public.tem_permissao('checklists', 'criar') or public.tem_permissao('checklist_5s', 'criar')) then
    raise exception 'Sem permissão para iniciar checklist.' using errcode = '42501';
  end if;

  select * into v_modelo from public.checklist_modelos where id = p_modelo;
  if v_modelo is null then raise exception 'Modelo não encontrado.'; end if;
  if v_modelo.situacao <> 'ativo' then raise exception 'Este modelo está inativo.'; end if;

  insert into public.checklists (
    modelo_id, versao, modelo_descricao, tipo, os_id, veiculo_id, cliente_id, km,
    setor, data_referencia, responsavel_id, especialidade_id
  ) values (
    v_modelo.id, v_modelo.versao_atual, v_modelo.descricao, v_modelo.tipo,
    p_os, p_veiculo, p_cliente, p_km, p_setor, coalesce(p_data, current_date), auth.uid(), p_especialidade
  )
  returning id into v_id;

  insert into public.checklist_respostas (
    checklist_id, item_id, secao, ordem, texto, tipo_resposta,
    exige_evidencia, exige_medicao, unidade_medicao, obrigatorio
  )
  select v_id, i.id, i.secao, i.ordem, i.texto, i.tipo_resposta,
         i.exige_evidencia, i.exige_medicao, i.unidade_medicao, i.obrigatorio
  from public.checklist_modelo_itens i
  where i.modelo_id = v_modelo.id and i.versao = v_modelo.versao_atual
  order by i.ordem;

  if p_os is not null then
    insert into public.os_eventos (os_id, tipo, titulo, descricao, usuario_id)
    values (p_os, 'checklist', 'Checklist iniciado', v_modelo.descricao, auth.uid());
  end if;

  return v_id;
end;
$$;
revoke execute on function public.iniciar_checklist(uuid, uuid, uuid, uuid, integer, text, date, uuid) from public, anon;
grant execute on function public.iniciar_checklist(uuid, uuid, uuid, uuid, integer, text, date, uuid) to authenticated;

-- ============================================================
-- Concluir execução
-- ============================================================
create or replace function public.concluir_checklist(p_checklist uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pendentes integer;
  v_check record;
begin
  select * into v_check from public.checklists where id = p_checklist;
  if v_check is null then raise exception 'Checklist não encontrado.'; end if;

  select count(*) into v_pendentes
  from public.checklist_respostas
  where checklist_id = p_checklist and obrigatorio and resposta is null;

  if v_pendentes > 0 then
    raise exception 'Ainda há % item(ns) obrigatório(s) sem resposta.', v_pendentes;
  end if;

  update public.checklists
     set situacao = 'concluido', concluido_em = now()
   where id = p_checklist;

  if v_check.os_id is not null then
    insert into public.os_eventos (os_id, tipo, titulo, descricao, usuario_id)
    values (v_check.os_id, 'checklist', 'Checklist concluído', v_check.modelo_descricao, auth.uid());
  end if;

  if v_check.veiculo_id is not null then
    insert into public.eventos_veiculo (
      veiculo_id, cliente_id, tipo, titulo, descricao, km, referencia_tabela, referencia_id, registrado_por
    ) values (
      v_check.veiculo_id, v_check.cliente_id, 'checklist', 'Checklist concluído',
      v_check.modelo_descricao, v_check.km, 'checklists', v_check.id, auth.uid()
    );
  end if;
end;
$$;
revoke execute on function public.concluir_checklist(uuid) from public, anon;
grant execute on function public.concluir_checklist(uuid) to authenticated;

-- ============================================================
-- RLS
-- ============================================================
create or replace function public.rls_checklist_ler()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.tem_permissao('checklists', 'visualizar')
      or public.tem_permissao('checklist_5s', 'visualizar')
      or public.tem_permissao('minha_operacao', 'visualizar');
$$;
create or replace function public.rls_checklist_escrever()
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.tem_permissao('checklists', 'editar')
      or public.tem_permissao('checklists', 'criar')
      or public.tem_permissao('checklist_5s', 'editar')
      or public.tem_permissao('checklist_5s', 'criar')
      or public.tem_permissao('minha_operacao', 'editar');
$$;
revoke execute on function public.rls_checklist_ler() from public, anon;
revoke execute on function public.rls_checklist_escrever() from public, anon;
grant execute on function public.rls_checklist_ler() to authenticated;
grant execute on function public.rls_checklist_escrever() to authenticated;

alter table public.checklist_modelos enable row level security;
create policy cm_ler on public.checklist_modelos for select to authenticated using (public.rls_checklist_ler());
create policy cm_escrever on public.checklist_modelos for all to authenticated
  using (public.tem_permissao('checklists', 'configurar') or public.tem_permissao('checklist_5s', 'configurar'))
  with check (public.tem_permissao('checklists', 'configurar') or public.tem_permissao('checklist_5s', 'configurar'));

alter table public.checklist_modelo_itens enable row level security;
create policy cmi_ler on public.checklist_modelo_itens for select to authenticated using (public.rls_checklist_ler());
create policy cmi_escrever on public.checklist_modelo_itens for all to authenticated
  using (public.tem_permissao('checklists', 'configurar') or public.tem_permissao('checklist_5s', 'configurar'))
  with check (public.tem_permissao('checklists', 'configurar') or public.tem_permissao('checklist_5s', 'configurar'));

do $$
declare t text;
begin
  foreach t in array array['checklists','checklist_respostas','checklist_defeitos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.rls_checklist_ler())', t||'_ler', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.rls_checklist_escrever()) with check (public.rls_checklist_escrever())', t||'_escrever', t);
  end loop;
end $$;;
