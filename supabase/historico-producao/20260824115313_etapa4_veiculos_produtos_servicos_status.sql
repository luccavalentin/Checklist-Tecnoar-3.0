-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824115313.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ============================================================
-- ETAPA 4 — Cadastros operacionais
-- ============================================================

create type public.tipo_veiculo as enum (
  'cavalo', 'carreta', 'truck', 'toco', 'bitrem', 'rodotrem', 'vanderleia', 'onibus', 'van', 'utilitario', 'outro'
);
create type public.categoria_status_os as enum (
  'entrada', 'diagnostico', 'aprovacao', 'espera', 'execucao', 'finalizacao', 'concluido', 'cancelado'
);

-- ---------- veículos ----------
create table public.veiculos (
  id                   uuid primary key default gen_random_uuid(),
  codigo               bigint generated always as identity,
  placa                text not null,
  placa_normalizada    text generated always as (upper(regexp_replace(placa, '[^A-Za-z0-9]', '', 'g'))) stored,
  descricao            text not null,
  cliente_id           uuid references public.clientes (id) on delete set null,
  tipo                 public.tipo_veiculo,
  marca                text,
  modelo               text,
  ano                  integer,
  cor                  text,
  renavam              text,
  chassi               text,
  numero_frota         text,
  municipio            text,
  uf                   text,
  km_atual             integer,
  observacoes          text,
  alerta_operador      text,
  situacao             public.situacao_registro not null default 'ativo',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index veiculos_placa_uk on public.veiculos (placa_normalizada);
create index veiculos_cliente_ix on public.veiculos (cliente_id);
create index veiculos_desc_trgm on public.veiculos using gin (descricao gin_trgm_ops);
create index veiculos_situacao_ix on public.veiculos (situacao);
create trigger veiculos_updated_at before update on public.veiculos
  for each row execute function public.tg_set_updated_at();

-- histórico de proprietário: o prontuário do veículo não se perde na troca
create table public.veiculo_proprietarios (
  id           uuid primary key default gen_random_uuid(),
  veiculo_id   uuid not null references public.veiculos (id) on delete cascade,
  cliente_id   uuid references public.clientes (id) on delete set null,
  inicio_em    timestamptz not null default now(),
  fim_em       timestamptz,
  registrado_por uuid references public.usuarios (id) on delete set null
);
create index veiculo_prop_ix on public.veiculo_proprietarios (veiculo_id, inicio_em desc);

create or replace function public.tg_veiculo_historico_proprietario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.cliente_id is not null then
      insert into public.veiculo_proprietarios (veiculo_id, cliente_id, registrado_por)
      values (new.id, new.cliente_id, auth.uid());
    end if;
    return new;
  end if;

  if new.cliente_id is distinct from old.cliente_id then
    update public.veiculo_proprietarios
       set fim_em = now()
     where veiculo_id = new.id and fim_em is null;
    if new.cliente_id is not null then
      insert into public.veiculo_proprietarios (veiculo_id, cliente_id, registrado_por)
      values (new.id, new.cliente_id, auth.uid());
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_veiculo_historico_proprietario() from public, anon, authenticated;

create trigger veiculos_historico_proprietario
  after insert or update of cliente_id on public.veiculos
  for each row execute function public.tg_veiculo_historico_proprietario();

-- ---------- produtos ----------
create table public.produtos (
  id                   uuid primary key default gen_random_uuid(),
  codigo               text not null,
  descricao            text not null,
  referencia           text,
  unidade              text not null default 'UN',
  preco_venda          numeric(14, 2) not null default 0,
  preco_custo          numeric(14, 2),
  estoque_minimo       numeric(14, 3) not null default 0,
  saldo                numeric(14, 3) not null default 0,
  reservado            numeric(14, 3) not null default 0,
  fornecedor_id        uuid references public.fornecedores (id) on delete set null,
  ncm                  text,
  localizacao          text,
  observacoes          text,
  situacao             public.situacao_registro not null default 'ativo',
  origem               public.origem_registro not null default 'manual',
  omie_id              text,
  omie_sincronizado_em timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index produtos_codigo_uk on public.produtos (upper(codigo));
create unique index produtos_omie_uk on public.produtos (omie_id) where omie_id is not null;
create index produtos_desc_trgm on public.produtos using gin (descricao gin_trgm_ops);
create index produtos_ref_trgm on public.produtos using gin (coalesce(referencia, '') gin_trgm_ops);
create index produtos_situacao_ix on public.produtos (situacao);
create index produtos_fornecedor_ix on public.produtos (fornecedor_id);
create trigger produtos_updated_at before update on public.produtos
  for each row execute function public.tg_set_updated_at();

-- ---------- serviços ----------
create table public.servicos (
  id                   uuid primary key default gen_random_uuid(),
  codigo               text not null,
  descricao            text not null,
  valor_padrao         numeric(14, 2) not null default 0,
  tempo_estimado_min   integer,
  especialidade_id     uuid references public.especialidades (id) on delete set null,
  observacoes          text,
  situacao             public.situacao_registro not null default 'ativo',
  origem               public.origem_registro not null default 'manual',
  omie_id              text,
  omie_sincronizado_em timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index servicos_codigo_uk on public.servicos (upper(codigo));
create unique index servicos_omie_uk on public.servicos (omie_id) where omie_id is not null;
create index servicos_desc_trgm on public.servicos using gin (descricao gin_trgm_ops);
create index servicos_situacao_ix on public.servicos (situacao);
create trigger servicos_updated_at before update on public.servicos
  for each row execute function public.tg_set_updated_at();

-- ---------- status da OS ----------
create table public.status_os (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  descricao    text,
  ordem        integer not null default 0,
  categoria    public.categoria_status_os not null default 'execucao',
  cor          text not null default 'neutro',
  conta_no_patio boolean not null default true,
  is_final     boolean not null default false,
  is_system    boolean not null default false,
  situacao     public.situacao_registro not null default 'ativo',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index status_os_nome_uk on public.status_os (lower(nome));
create index status_os_ordem_ix on public.status_os (ordem);
create trigger status_os_updated_at before update on public.status_os
  for each row execute function public.tg_set_updated_at();

-- ============================================================
-- RLS
-- ============================================================
select public.aplicar_rls_cadastro('veiculos', 'veiculos');
select public.aplicar_rls_cadastro('produtos', 'produtos');
select public.aplicar_rls_cadastro('servicos', 'servicos');
select public.aplicar_rls_cadastro('status_os', 'status_os');

alter table public.veiculo_proprietarios enable row level security;
create policy veiculo_prop_ler on public.veiculo_proprietarios for select to authenticated
  using (public.tem_permissao('veiculos', 'visualizar'));

-- status precisa ser legível por toda a operação, não só por quem o configura
drop policy if exists status_os_ler on public.status_os;
create policy status_os_ler on public.status_os for select to authenticated
  using (public.usuario_atual_ativo());

-- ============================================================
-- Status iniciais da OS (configuração, editável)
-- ============================================================
insert into public.status_os (nome, descricao, ordem, categoria, cor, conta_no_patio, is_final, is_system) values
  ('Recebido',                'Veículo deu entrada e aguarda triagem.',            10, 'entrada',      'neutro',  true,  false, true),
  ('Aguardando Diagnóstico',  'Na fila para avaliação técnica.',                   20, 'diagnostico',  'neutro',  true,  false, false),
  ('Em Diagnóstico',          'Mecânico avaliando o veículo.',                     30, 'diagnostico',  'ciano',   true,  false, false),
  ('Aguardando Aprovação',    'Orçamento enviado, aguardando o cliente.',          40, 'aprovacao',    'atencao', true,  false, false),
  ('Aguardando Peça',         'Serviço parado por falta de peça.',                 50, 'espera',       'laranja', true,  false, false),
  ('Em Manutenção',           'Serviço em execução.',                              60, 'execucao',     'ciano',   true,  false, false),
  ('Checklist Final',         'Conferência final antes da liberação.',             70, 'finalizacao',  'ciano',   true,  false, false),
  ('Aguardando Faturamento',  'Serviço concluído, pendente de faturamento.',       80, 'finalizacao',  'atencao', true,  false, false),
  ('Pronto',                  'Liberado para retirada.',                           90, 'concluido',    'sucesso', true,  false, false),
  ('Entregue',                'Veículo entregue ao cliente.',                     100, 'concluido',    'sucesso', false, true,  true),
  ('Cancelado',               'Atendimento cancelado.',                           110, 'cancelado',    'critico', false, true,  true);;
