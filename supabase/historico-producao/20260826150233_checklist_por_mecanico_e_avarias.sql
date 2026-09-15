-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260826150233.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Checklist por especialidade (mecânico) e mapa de avarias de entrada.

/* Um modelo pode ser dirigido a uma especialidade: o mecânico de freio vê os
   checklists de freio, o de laboratório vê os dele. Nulo = serve a todos. */
alter table checklist_modelos
  add column especialidade_id uuid references especialidades (id) on delete set null,
  add column entrada_visual boolean not null default false;

comment on column checklist_modelos.entrada_visual is
  'Quando verdadeiro, o checklist abre também o mapa de avarias do veículo.';

/**
 * Avarias registradas na entrada do veículo.
 *
 * A legenda é fechada de propósito: seis tipos que o setor reconhece. Texto
 * livre viraria "risco", "riscado", "arranhado" para a mesma coisa e nenhum
 * relatório fecharia.
 */
create type tipo_avaria as enum (
  'batido',
  'riscado',
  'amassado',
  'quebrado',
  'faltante',
  'trincado'
);

create table avarias_veiculo (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references checklists (id) on delete cascade,
  veiculo_id uuid references veiculos (id) on delete set null,
  /* Onde no veículo. Livre porque a carroceria muda de tipo para tipo. */
  posicao text not null,
  tipo tipo_avaria not null,
  observacao text,
  registrado_por uuid references usuarios (id) on delete set null,
  created_at timestamptz not null default now()
);

create index avarias_checklist_idx on avarias_veiculo (checklist_id);

alter table avarias_veiculo enable row level security;

create policy avarias_ler on avarias_veiculo
  for select to authenticated using (rls_checklist_ler());
create policy avarias_escrever on avarias_veiculo
  for all to authenticated
  using (rls_checklist_escrever())
  with check (rls_checklist_escrever());

/**
 * Progresso de um checklist: quantos itens existem, quantos foram respondidos
 * e quantos vieram negativos. Sai do banco para a tela não ter que baixar
 * todas as respostas só para escrever "12 de 20".
 */
create or replace function progresso_checklist(p_checklist uuid)
returns table (
  secao text,
  total integer,
  respondidos integer,
  negativos integer
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    r.secao,
    count(*)::int,
    count(*) filter (where r.resposta is not null)::int,
    count(*) filter (where r.resposta in ('nao_ok', 'nao_conforme'))::int
  from checklist_respostas r
  where r.checklist_id = p_checklist
    and rls_checklist_ler()
  group by r.secao
  order by min(r.ordem);
$$;

revoke all on function progresso_checklist(uuid) from public, anon;
grant execute on function progresso_checklist(uuid) to authenticated, service_role;;
