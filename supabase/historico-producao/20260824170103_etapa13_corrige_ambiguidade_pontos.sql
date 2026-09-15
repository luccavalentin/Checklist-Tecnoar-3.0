-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824170103.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

/**
 * `pontos` também é o nome de uma coluna de saída da função, então a leitura
 * dos critérios precisa vir qualificada — sem isso o Postgres não sabe a qual
 * das duas o `sum(pontos)` se refere.
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

  select coalesce(sum(cp.pontos) filter (where cp.evento = 'os_concluida'), 0),
         coalesce(sum(cp.pontos) filter (where cp.evento = 'checklist_concluido'), 0),
         coalesce(sum(cp.pontos) filter (where cp.evento = 'apontamento_concluido'), 0),
         coalesce(sum(cp.pontos) filter (where cp.evento = 'retorno_vinculado'), 0),
         coalesce(sum(cp.pontos) filter (where cp.evento = 'nao_conformidade_5s'), 0)
    into p_os, p_chk, p_apt, p_ret, p_5s
  from criterios_performance cp
  where cp.ativo and cp.origem = 'automatico';

  return query
  with pessoas as (
    select u.id as pid, u.nome_completo as pnome, f.nome as pfuncao
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
      p.pid,
      (select count(*)::int from os_mecanicos m
         join ordens_servico o on o.id = m.os_id
        where m.usuario_id = p.pid and o.encerrada_em::date between v_de and v_ate) as a_os,
      (select count(*)::int from checklists c
        where c.responsavel_id = p.pid and c.situacao = 'concluido'
          and c.concluido_em::date between v_de and v_ate) as a_chk,
      (select count(*)::int from os_apontamentos a
        where a.usuario_id = p.pid and a.concluido_em::date between v_de and v_ate) as a_apt,
      (select coalesce(round(sum(
                 greatest(extract(epoch from (a.concluido_em - a.iniciado_em)) - a.segundos_pausa, 0)
               ) / 3600.0, 1), 0)
         from os_apontamentos a
        where a.usuario_id = p.pid and a.concluido_em::date between v_de and v_ate) as a_horas,
      (select count(*)::int from retornos r
        where r.data_retorno between v_de and v_ate
          and r.os_origem_id is not null
          and exists (select 1 from os_mecanicos m where m.os_id = r.os_origem_id and m.usuario_id = p.pid)) as a_ret,
      (select count(*)::int from checklist_respostas cr
         join checklists c on c.id = cr.checklist_id
        where c.responsavel_id = p.pid and c.situacao = 'concluido'
          and c.tipo in ('diario_abertura','diario_fechamento')
          and c.data_referencia between v_de and v_ate
          and cr.resposta in ('conforme','nao_conforme')) as a_5s,
      (select count(*)::int from checklist_respostas cr
         join checklists c on c.id = cr.checklist_id
        where c.responsavel_id = p.pid and c.situacao = 'concluido'
          and c.tipo in ('diario_abertura','diario_fechamento')
          and c.data_referencia between v_de and v_ate
          and cr.resposta = 'nao_conforme') as a_nc,
      (select coalesce(sum(ev.pontos), 0) from eventos_performance ev
        where ev.usuario_id = p.pid and ev.ocorrido_em between v_de and v_ate) as a_manuais
    from pessoas p
  )
  select
    p.pid,
    p.pnome,
    p.pfuncao,
    a.a_os,
    a.a_chk,
    a.a_apt,
    a.a_horas,
    a.a_ret,
    a.a_5s,
    a.a_nc,
    case when a.a_5s = 0 then null else round(100.0 * (a.a_5s - a.a_nc) / a.a_5s, 1) end,
    round(a.a_os * p_os + a.a_chk * p_chk + a.a_apt * p_apt + a.a_ret * p_ret + a.a_nc * p_5s, 2),
    round(a.a_manuais, 2),
    round(a.a_os * p_os + a.a_chk * p_chk + a.a_apt * p_apt + a.a_ret * p_ret + a.a_nc * p_5s + a.a_manuais, 2)
  from pessoas p
  join atividade a on a.pid = p.pid
  order by p.pnome;
end;
$$;;
