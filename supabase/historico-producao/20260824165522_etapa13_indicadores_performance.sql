-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824165522.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ETAPA 13 — Gestão: indicadores executivos, performance por eventos reais e alertas

create type origem_criterio as enum ('manual','automatico');
create type evento_performance as enum (
  'os_concluida',
  'checklist_concluido',
  'retorno_vinculado',
  'nao_conformidade_5s',
  'apontamento_concluido',
  'manual'
);

/**
 * Critérios de pontuação.
 *
 * O catálogo nasce desligado e sem pontos: nenhum colaborador recebe nota
 * antes de alguém definir explicitamente a regra. Critérios negativos só
 * descontam se forem ativados com pontuação negativa — o sistema nunca pune
 * por conta própria.
 */
create table criterios_performance (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  categoria text not null,
  origem origem_criterio not null default 'manual',
  evento evento_performance not null default 'manual',
  pontos numeric(8,2) not null default 0,
  ativo boolean not null default false,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

select aplicar_rls_cadastro('criterios_performance', 'performance');
create trigger tg_criterios_performance_updated before update on criterios_performance
  for each row execute function tg_set_updated_at();

insert into criterios_performance (nome, descricao, categoria, origem, evento, ordem) values
  ('Ordem de serviço concluída', 'Pontua cada OS encerrada em que o colaborador atuou como mecânico.', 'Qualidade', 'automatico', 'os_concluida', 1),
  ('Checklist concluído', 'Pontua cada checklist finalizado pelo colaborador.', 'Checklist', 'automatico', 'checklist_concluido', 2),
  ('Apontamento concluído', 'Pontua cada apontamento de tempo encerrado.', 'Tempo', 'automatico', 'apontamento_concluido', 3),
  ('Retorno vinculado', 'Retrabalho: retorno de cliente em OS na qual o colaborador atuou.', 'Retrabalho', 'automatico', 'retorno_vinculado', 4),
  ('Não conformidade no 5S', 'Item respondido como não conforme em checklist diário sob responsabilidade do colaborador.', '5S', 'automatico', 'nao_conformidade_5s', 5),
  ('Elogio', 'Registro manual de reconhecimento.', 'Elogio', 'manual', 'manual', 6),
  ('Ocorrência', 'Registro manual de ocorrência. Só desconta se receber pontuação negativa.', 'Ocorrência', 'manual', 'manual', 7);

/** Lançamentos manuais — sempre com autor, data e motivo. */
create table eventos_performance (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references usuarios (id) on delete cascade,
  criterio_id uuid not null references criterios_performance (id) on delete restrict,
  pontos numeric(8,2) not null,
  motivo text not null,
  ocorrido_em date not null default current_date,
  registrado_por uuid references usuarios (id) on delete set null,
  created_at timestamptz not null default now()
);

create index eventos_performance_usuario_idx on eventos_performance (usuario_id, ocorrido_em desc);
select aplicar_rls_cadastro('eventos_performance', 'performance');

/* ------------------------------------------------- indicadores executivos */

/**
 * Painel executivo. Cada número vem de uma contagem real; nada é estimado.
 * Os recortes de período usam a data do fato (encerramento da OS, data da
 * venda, data de referência do checklist), não a data de criação do registro.
 */
create or replace function indicadores_gestao(p_de date default null, p_ate date default null)
returns table (
  de date,
  ate date,
  os_abertas integer,
  os_concluidas_periodo integer,
  tempo_medio_horas numeric,
  veiculos_patio integer,
  aguardando_aprovacao integer,
  aguardando_peca integer,
  retornos_periodo integer,
  garantias_vigentes integer,
  garantias_acionadas_periodo integer,
  pecas_teste_abertas integer,
  pecas_teste_vencidas integer,
  conformidade_5s numeric,
  itens_5s_avaliados integer,
  clientes_inativos integer,
  vendas_periodo integer,
  faturamento_periodo numeric,
  estoque_critico integer,
  acoes_vencidas integer,
  follow_ups_atrasados integer
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_de date := coalesce(p_de, date_trunc('month', current_date)::date);
  v_ate date := coalesce(p_ate, current_date);
  v_faixa integer;
begin
  if not tem_permissao('indicadores', 'visualizar') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select coalesce((valor ->> 2)::int, 365) into v_faixa
  from parametros where chave = 'crm_faixas_inatividade';
  v_faixa := coalesce(v_faixa, 365);

  return query
  select
    v_de,
    v_ate,
    (select count(*)::int from vw_patio),
    (select count(*)::int from ordens_servico o
      where o.encerrada_em::date between v_de and v_ate),
    (select round(avg(extract(epoch from (o.encerrada_em - o.aberta_em)) / 3600.0)::numeric, 1)
       from ordens_servico o
      where o.encerrada_em is not null and o.encerrada_em::date between v_de and v_ate),
    (select count(*)::int from vw_patio),
    (select count(*)::int from vw_patio p where p.status_categoria = 'aprovacao'),
    (select count(*)::int from vw_patio p where p.status_categoria = 'espera'),
    (select count(*)::int from retornos r where r.data_retorno between v_de and v_ate),
    (select count(*)::int from garantias g where g.situacao = 'vigente'),
    (select count(*)::int from garantias g where g.situacao = 'acionada' and g.updated_at::date between v_de and v_ate),
    (select count(*)::int from pecas_teste p where p.status <> 'entregue'),
    (select count(*)::int from pecas_teste p where p.status <> 'entregue' and p.prazo_em < now()),
    (select case when count(*) filter (where r.resposta in ('conforme','nao_conforme')) = 0 then null
                 else round(100.0 * count(*) filter (where r.resposta = 'conforme')
                      / count(*) filter (where r.resposta in ('conforme','nao_conforme')), 1) end
       from checklist_respostas r
       join checklists c on c.id = r.checklist_id
      where c.tipo in ('diario_abertura','diario_fechamento')
        and c.situacao = 'concluido'
        and c.data_referencia between v_de and v_ate),
    (select count(*)::int
       from checklist_respostas r
       join checklists c on c.id = r.checklist_id
      where c.tipo in ('diario_abertura','diario_fechamento')
        and c.situacao = 'concluido'
        and c.data_referencia between v_de and v_ate
        and r.resposta in ('conforme','nao_conforme')),
    (select count(*)::int from vw_clientes_relacionamento x
      where x.situacao = 'ativo' and x.dias_sem_atendimento >= v_faixa),
    (select count(*)::int from vendas v where v.data_venda between v_de and v_ate),
    (select coalesce(sum(v.valor_total), 0) from vendas v where v.data_venda between v_de and v_ate),
    (select count(*)::int from vw_estoque e where e.situacao = 'ativo' and e.situacao_estoque in ('critico','sem_saldo')),
    (select count(*)::int from acoes_corretivas a
      where a.status in ('aberta','em_andamento') and a.prazo is not null and a.prazo < current_date),
    (select count(*)::int from follow_ups f where f.situacao = 'aberto' and f.data < current_date);
end;
$$;

/** Ações e prazos realmente vencidos — a lista que o gestor precisa atacar. */
create or replace function alertas_gestao(p_limite integer default 50)
returns table (
  tipo text,
  titulo text,
  detalhe text,
  responsavel text,
  vencido_em date,
  dias_vencido integer,
  entidade text,
  entidade_id text
)
language sql stable security definer set search_path = public, pg_temp as $$
  with base as (
    select
      'Ação corretiva'::text as tipo,
      a.problema as titulo,
      a.acao as detalhe,
      u.nome_completo as responsavel,
      a.prazo as vencido_em,
      'acoes_corretivas'::text as entidade,
      a.id::text as entidade_id
    from acoes_corretivas a
    left join usuarios u on u.id = a.responsavel_id
    where a.status in ('aberta','em_andamento') and a.prazo is not null and a.prazo < current_date

    union all
    select
      'Follow-up',
      f.proxima_acao,
      c.nome_razao,
      u.nome_completo,
      f.data,
      'follow_ups',
      f.id::text
    from follow_ups f
    left join clientes c on c.id = f.cliente_id
    left join usuarios u on u.id = f.responsavel_id
    where f.situacao = 'aberto' and f.data < current_date

    union all
    select
      'Peça em teste',
      p.protocolo || ' — ' || p.peca,
      c.nome_razao,
      u.nome_completo,
      p.prazo_em::date,
      'pecas_teste',
      p.id::text
    from pecas_teste p
    left join clientes c on c.id = p.cliente_id
    left join usuarios u on u.id = p.mecanico_id
    where p.status <> 'entregue' and p.prazo_em < now()

    union all
    select
      'Ordem de serviço',
      'OS ' || lpad(o.numero::text, 5, '0'),
      coalesce(c.nome_razao, 'Cliente não informado'),
      null,
      o.previsao_em::date,
      'ordens_servico',
      o.id::text
    from ordens_servico o
    left join clientes c on c.id = o.cliente_id
    join status_os s on s.id = o.status_id
    where o.previsao_em is not null and o.previsao_em < now()
      and o.situacao = 'ativo' and s.categoria not in ('concluido','cancelado')
  )
  select
    b.tipo, b.titulo, b.detalhe, b.responsavel, b.vencido_em,
    (current_date - b.vencido_em)::int,
    b.entidade, b.entidade_id
  from base b
  where tem_permissao('indicadores', 'visualizar')
  order by b.vencido_em
  limit greatest(coalesce(p_limite, 50), 1);
$$;

/* ------------------------------------------------------------ performance */

/**
 * Performance por colaborador.
 *
 * As colunas de atividade são contagens de fatos: OS encerradas em que a
 * pessoa estava atribuída, checklists que ela concluiu, apontamentos que ela
 * fechou, retornos em OS onde atuou, itens 5S não conformes sob sua
 * responsabilidade.
 *
 * A pontuação só existe para os critérios que alguém ativou. Enquanto nenhum
 * critério estiver ativo, `pontos` volta zero para todo mundo — e a tela diz
 * isso, em vez de inventar um ranking.
 *
 * "Não se aplica" e "não verificado" ficam fora da conformidade 5S: não contam
 * nem como acerto nem como erro.
 */
create or replace function performance_equipe(
  p_de date default null,
  p_ate date default null,
  p_funcao uuid default null,
  p_especialidade uuid default null
)
returns table (
  usuario_id uuid,
  nome_completo text,
  funcao text,
  os_concluidas integer,
  checklists_concluidos integer,
  apontamentos_concluidos integer,
  horas_apontadas numeric,
  retornos integer,
  itens_5s_avaliados integer,
  nao_conformidades_5s integer,
  conformidade_5s numeric,
  pontos_automaticos numeric,
  pontos_manuais numeric,
  pontos numeric
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_de date := coalesce(p_de, date_trunc('month', current_date)::date);
  v_ate date := coalesce(p_ate, current_date);
  p_os numeric; p_chk numeric; p_apt numeric; p_ret numeric; p_5s numeric;
begin
  if not tem_permissao('performance', 'visualizar') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select coalesce(sum(pontos) filter (where evento = 'os_concluida'), 0),
         coalesce(sum(pontos) filter (where evento = 'checklist_concluido'), 0),
         coalesce(sum(pontos) filter (where evento = 'apontamento_concluido'), 0),
         coalesce(sum(pontos) filter (where evento = 'retorno_vinculado'), 0),
         coalesce(sum(pontos) filter (where evento = 'nao_conformidade_5s'), 0)
    into p_os, p_chk, p_apt, p_ret, p_5s
  from criterios_performance
  where ativo and origem = 'automatico';

  return query
  with pessoas as (
    select u.id, u.nome_completo, f.nome as funcao
    from usuarios u
    left join funcoes f on f.id = u.funcao_id
    where u.situacao = 'ativo'
      and (p_funcao is null or u.funcao_id = p_funcao)
      and (
        p_especialidade is null
        or exists (select 1 from usuario_especialidades ue
                    where ue.usuario_id = u.id and ue.especialidade_id = p_especialidade)
      )
  ),
  atividade as (
    select
      p.id as pid,
      (select count(*)::int from os_mecanicos m
         join ordens_servico o on o.id = m.os_id
        where m.usuario_id = p.id and o.encerrada_em::date between v_de and v_ate) as os_concluidas,
      (select count(*)::int from checklists c
        where c.responsavel_id = p.id and c.situacao = 'concluido'
          and c.concluido_em::date between v_de and v_ate) as checklists_concluidos,
      (select count(*)::int from os_apontamentos a
        where a.usuario_id = p.id and a.concluido_em::date between v_de and v_ate) as apontamentos,
      (select coalesce(round(sum(
                 greatest(extract(epoch from (a.concluido_em - a.iniciado_em)) - a.segundos_pausa, 0)
               ) / 3600.0, 1), 0)
         from os_apontamentos a
        where a.usuario_id = p.id and a.concluido_em::date between v_de and v_ate) as horas,
      (select count(*)::int from retornos r
        where r.data_retorno between v_de and v_ate
          and r.os_origem_id is not null
          and exists (select 1 from os_mecanicos m where m.os_id = r.os_origem_id and m.usuario_id = p.id)) as retornos,
      (select count(*)::int from checklist_respostas cr
         join checklists c on c.id = cr.checklist_id
        where c.responsavel_id = p.id and c.situacao = 'concluido'
          and c.tipo in ('diario_abertura','diario_fechamento')
          and c.data_referencia between v_de and v_ate
          and cr.resposta in ('conforme','nao_conforme')) as itens_5s,
      (select count(*)::int from checklist_respostas cr
         join checklists c on c.id = cr.checklist_id
        where c.responsavel_id = p.id and c.situacao = 'concluido'
          and c.tipo in ('diario_abertura','diario_fechamento')
          and c.data_referencia between v_de and v_ate
          and cr.resposta = 'nao_conforme') as nc_5s,
      (select coalesce(sum(e.pontos), 0) from eventos_performance e
        where e.usuario_id = p.id and e.ocorrido_em between v_de and v_ate) as manuais
    from pessoas p
  )
  select
    p.id,
    p.nome_completo,
    p.funcao,
    a.os_concluidas,
    a.checklists_concluidos,
    a.apontamentos,
    a.horas,
    a.retornos,
    a.itens_5s,
    a.nc_5s,
    case when a.itens_5s = 0 then null
         else round(100.0 * (a.itens_5s - a.nc_5s) / a.itens_5s, 1) end,
    round(
      a.os_concluidas * p_os + a.checklists_concluidos * p_chk + a.apontamentos * p_apt
      + a.retornos * p_ret + a.nc_5s * p_5s, 2),
    round(a.manuais, 2),
    round(
      a.os_concluidas * p_os + a.checklists_concluidos * p_chk + a.apontamentos * p_apt
      + a.retornos * p_ret + a.nc_5s * p_5s + a.manuais, 2)
  from pessoas p
  join atividade a on a.pid = p.id
  order by p.nome_completo;
end;
$$;

grant execute on function indicadores_gestao(date, date) to authenticated;
grant execute on function alertas_gestao(integer) to authenticated;
grant execute on function performance_equipe(date, date, uuid, uuid) to authenticated;;
