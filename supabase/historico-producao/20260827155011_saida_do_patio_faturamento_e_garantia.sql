-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260827155011.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Fluxo de saída: conferência, fechamento financeiro, recibo e garantia.

/**
 * Garantia definida no checklist de saída.
 *
 * Quem sabe quanto tempo a peça aguenta é o mecânico que acabou de montá-la,
 * e o momento em que ele sabe disso é ao conferir o serviço. Por isso o prazo
 * nasce aqui e não numa tela separada que ninguém lembra de preencher.
 */
alter table checklists
  add column if not exists garantia_dias integer check (garantia_dias is null or garantia_dias between 0 and 3650),
  add column if not exists garantia_km integer check (garantia_km is null or garantia_km >= 0),
  add column if not exists garantia_observacao text;

comment on column checklists.garantia_dias is
  'Prazo em dias definido no checklist de saída. Vira registro em `garantias` no fechamento.';

/**
 * Fatura da OS.
 *
 * Existe quando o cliente não paga na hora. Guarda o combinado — condição,
 * número de parcelas — e as parcelas ficam na tabela filha, cada uma com seu
 * vencimento e sua própria baixa.
 */
create table if not exists faturas (
  id uuid primary key default gen_random_uuid(),
  numero integer generated always as identity,
  os_id uuid not null references ordens_servico (id) on delete cascade,
  cliente_id uuid references clientes (id) on delete set null,
  valor_total numeric(14,2) not null check (valor_total >= 0),
  condicao text not null,
  emitida_em timestamptz not null default now(),
  emitida_por uuid references usuarios (id) on delete set null,
  observacoes text,
  created_at timestamptz not null default now()
);

create index if not exists faturas_os_idx on faturas (os_id);

create table if not exists fatura_parcelas (
  id uuid primary key default gen_random_uuid(),
  fatura_id uuid not null references faturas (id) on delete cascade,
  numero integer not null check (numero >= 1),
  vencimento date not null,
  valor numeric(14,2) not null check (valor >= 0),
  pago_em timestamptz,
  forma_pagamento forma_pagamento,
  observacao text,
  unique (fatura_id, numero)
);

create index if not exists fatura_parcelas_vencimento_idx
  on fatura_parcelas (vencimento) where pago_em is null;

/** Saída do veículo: o carimbo de que a OS terminou e o pátio esvaziou. */
alter table ordens_servico
  add column if not exists saida_em timestamptz,
  add column if not exists saida_por uuid references usuarios (id) on delete set null,
  add column if not exists recibo_numero integer;

alter table faturas enable row level security;
alter table fatura_parcelas enable row level security;

create policy faturas_ler on faturas for select to authenticated
  using (tem_permissao('ordens_servico', 'visualizar'));
create policy faturas_escrever on faturas for all to authenticated
  using (tem_permissao('ordens_servico', 'editar'))
  with check (tem_permissao('ordens_servico', 'editar'));

create policy parcelas_ler on fatura_parcelas for select to authenticated
  using (tem_permissao('ordens_servico', 'visualizar'));
create policy parcelas_escrever on fatura_parcelas for all to authenticated
  using (tem_permissao('ordens_servico', 'editar'))
  with check (tem_permissao('ordens_servico', 'editar'));

/**
 * Situação da OS para a tela de saída.
 *
 * Reúne, num lugar só, tudo que impede um veículo de sair: checklist de
 * entrada aberto, checklist de saída não feito, item pendente de aprovação e
 * saldo em aberto. O operador vê a lista de pendências em vez de descobrir
 * uma por vez.
 */
create or replace function situacao_para_saida(p_os uuid)
returns table (
  os_id uuid,
  numero integer,
  valor_total numeric,
  valor_pago numeric,
  saldo numeric,
  checklist_entrada_id uuid,
  checklist_entrada_ok boolean,
  checklist_saida_id uuid,
  checklist_saida_ok boolean,
  itens_pendentes integer,
  ja_saiu boolean
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    o.id,
    o.numero,
    o.valor_total,
    o.valor_pago,
    o.valor_total - o.valor_pago,
    ce.id,
    coalesce(ce.situacao = 'concluido', false),
    cs.id,
    coalesce(cs.situacao = 'concluido', false),
    (
      select count(*)::int from (
        select 1 from os_servicos where os_id = o.id and aprovacao = 'pendente' and situacao = 'ativo'
        union all
        select 1 from os_produtos where os_id = o.id and aprovacao = 'pendente' and situacao = 'ativo'
      ) x
    ),
    o.saida_em is not null
  from ordens_servico o
  left join lateral (
    select c.* from checklists c
     where c.os_id = o.id and c.tipo = 'tecnico_inicial' and c.situacao <> 'cancelado'
     order by c.iniciado_em desc limit 1
  ) ce on true
  left join lateral (
    select c.* from checklists c
     where c.os_id = o.id and c.tipo = 'final_os' and c.situacao <> 'cancelado'
     order by c.iniciado_em desc limit 1
  ) cs on true
  where o.id = p_os and tem_permissao('ordens_servico', 'visualizar');
$$;

revoke all on function situacao_para_saida(uuid) from public, anon;
grant execute on function situacao_para_saida(uuid) to authenticated, service_role;;
