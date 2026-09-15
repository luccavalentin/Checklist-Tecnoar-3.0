-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824161512.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ============================================================
-- ETAPA 10 — Pátio, Modo TV e Minha Operação
-- ============================================================

create type public.situacao_apontamento as enum ('em_execucao', 'pausado', 'concluido');

-- Apontamento de trabalho do mecânico numa OS.
create table public.os_apontamentos (
  id            uuid primary key default gen_random_uuid(),
  os_id         uuid not null references public.ordens_servico (id) on delete cascade,
  usuario_id    uuid not null references public.usuarios (id) on delete cascade,
  situacao      public.situacao_apontamento not null default 'em_execucao',
  iniciado_em   timestamptz not null default now(),
  pausado_em    timestamptz,
  concluido_em  timestamptz,
  segundos_pausa integer not null default 0,
  motivo_pausa  text,
  observacao    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index apontamentos_os_ix on public.os_apontamentos (os_id, iniciado_em desc);
create index apontamentos_usuario_ix on public.os_apontamentos (usuario_id, situacao);
create trigger apontamentos_updated_at before update on public.os_apontamentos
  for each row execute function public.tg_set_updated_at();

alter table public.os_apontamentos enable row level security;
create policy apontamentos_ler on public.os_apontamentos for select to authenticated
  using (public.rls_os_filhos_ler());
create policy apontamentos_escrever on public.os_apontamentos for all to authenticated
  using (usuario_id = auth.uid() or public.tem_permissao('ordens_servico', 'editar'))
  with check (usuario_id = auth.uid() or public.tem_permissao('ordens_servico', 'editar'));

-- ============================================================
-- Visão do pátio: só o que está de fato em atendimento
-- ============================================================
create or replace view public.vw_patio
with (security_invoker = true) as
select
  o.id                                as os_id,
  o.numero                            as os_numero,
  o.tipo,
  o.prioridade,
  o.aberta_em,
  o.previsao_em,
  o.status_alterado_em,
  o.valor_total,
  o.km,
  s.id                                as status_id,
  s.nome                              as status_nome,
  s.cor                               as status_cor,
  s.categoria                         as status_categoria,
  s.ordem                             as status_ordem,
  v.id                                as veiculo_id,
  v.placa,
  v.descricao                         as veiculo_descricao,
  v.alerta_operador,
  c.id                                as cliente_id,
  c.nome_razao                        as cliente_nome,
  extract(epoch from (now() - o.status_alterado_em))::bigint as segundos_no_estagio,
  extract(epoch from (now() - o.aberta_em))::bigint          as segundos_na_oficina,
  (o.previsao_em is not null and o.previsao_em < now())      as sla_vencido,
  coalesce(m.mecanicos, '[]'::jsonb)  as mecanicos,
  coalesce(p.itens_pendentes, 0)      as itens_pendentes,
  coalesce(k.checklists_abertos, 0)   as checklists_abertos
from public.ordens_servico o
join public.status_os s on s.id = o.status_id
join public.veiculos v on v.id = o.veiculo_id
join public.clientes c on c.id = o.cliente_id
left join lateral (
  select jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome_completo) order by u.nome_completo) as mecanicos
  from public.os_mecanicos om
  join public.usuarios u on u.id = om.usuario_id
  where om.os_id = o.id
) m on true
left join lateral (
  select count(*) as itens_pendentes
  from (
    select 1 from public.os_servicos where os_id = o.id and situacao = 'ativo' and aprovacao = 'pendente'
    union all
    select 1 from public.os_produtos where os_id = o.id and situacao = 'ativo' and aprovacao = 'pendente'
  ) x
) p on true
left join lateral (
  select count(*) as checklists_abertos
  from public.checklists ck
  where ck.os_id = o.id and ck.situacao = 'em_andamento'
) k on true
where o.situacao = 'ativo'
  and s.conta_no_patio
  and not s.is_final;

-- ============================================================
-- Indicadores do pátio (contagens reais)
-- ============================================================
create or replace function public.indicadores_patio()
returns table (
  no_patio             bigint,
  entradas_hoje        bigint,
  em_diagnostico       bigint,
  aguardando_aprovacao bigint,
  aguardando_peca      bigint,
  em_manutencao        bigint,
  checklist_final      bigint,
  aguardando_faturamento bigint,
  prontos              bigint,
  urgentes             bigint,
  sla_vencido          bigint,
  tempo_medio_segundos numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    (select count(*) from public.vw_patio),
    (select count(*) from public.entradas_patio where entrada_em::date = current_date),
    (select count(*) from public.vw_patio where status_categoria = 'diagnostico'),
    (select count(*) from public.vw_patio where status_categoria = 'aprovacao'),
    (select count(*) from public.vw_patio where status_categoria = 'espera'),
    (select count(*) from public.vw_patio where status_categoria = 'execucao'),
    (select count(*) from public.vw_patio where status_categoria = 'finalizacao' and lower(status_nome) like '%checklist%'),
    (select count(*) from public.vw_patio where status_categoria = 'finalizacao' and lower(status_nome) like '%fatur%'),
    (select count(*) from public.vw_patio where status_categoria = 'concluido'),
    (select count(*) from public.vw_patio where prioridade > 0),
    (select count(*) from public.vw_patio where sla_vencido),
    (select avg(segundos_na_oficina) from public.vw_patio)
  where public.tem_permissao('patio', 'visualizar');
$$;
revoke execute on function public.indicadores_patio() from public, anon;
grant execute on function public.indicadores_patio() to authenticated;

-- ============================================================
-- Tarefas do mecânico autenticado
-- ============================================================
create or replace view public.vw_minhas_tarefas
with (security_invoker = true) as
select
  o.id            as os_id,
  o.numero        as os_numero,
  o.problema_alegado,
  o.prioridade,
  o.previsao_em,
  s.nome          as status_nome,
  s.cor           as status_cor,
  s.categoria     as status_categoria,
  v.placa,
  v.descricao     as veiculo_descricao,
  c.nome_razao    as cliente_nome,
  om.usuario_id,
  ap.id           as apontamento_id,
  ap.situacao     as apontamento_situacao,
  ap.iniciado_em  as apontamento_iniciado_em,
  coalesce(k.abertos, 0) as checklists_abertos
from public.os_mecanicos om
join public.ordens_servico o on o.id = om.os_id and o.situacao = 'ativo'
left join public.status_os s on s.id = o.status_id
join public.veiculos v on v.id = o.veiculo_id
join public.clientes c on c.id = o.cliente_id
left join lateral (
  select * from public.os_apontamentos a
  where a.os_id = o.id and a.usuario_id = om.usuario_id and a.situacao <> 'concluido'
  order by a.iniciado_em desc limit 1
) ap on true
left join lateral (
  select count(*) as abertos from public.checklists ck
  where ck.os_id = o.id and ck.situacao = 'em_andamento'
) k on true
where coalesce(s.is_final, false) = false;;
