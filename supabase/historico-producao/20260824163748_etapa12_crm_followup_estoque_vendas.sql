-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824163748.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ETAPA 12 — Relacionamento (CRM, Follow-up, Inatividade) e Comercial (Estoque e Vendas)

create type tipo_interacao as enum ('ligacao','whatsapp','email','visita','observacao');
create type situacao_follow_up as enum ('aberto','concluido','cancelado');
create type tipo_movimento_estoque as enum ('entrada','saida','ajuste','reserva','liberacao');

/* ---------------------------------------------------------- parâmetros */
create table parametros (
  chave text primary key,
  valor jsonb not null,
  descricao text,
  atualizado_por uuid references usuarios (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table parametros enable row level security;

create policy parametros_ler on parametros
  for select to authenticated using (usuario_atual_ativo());

create policy parametros_gravar on parametros
  for all to authenticated
  using (tem_permissao('configuracoes', 'editar'))
  with check (tem_permissao('configuracoes', 'editar'));

insert into parametros (chave, valor, descricao) values
  ('crm_faixas_inatividade', '[90, 180, 365]'::jsonb,
   'Dias sem atendimento que classificam um cliente como inativo (três faixas crescentes).');

/* ---------------------------------------------------------- interações */
create table interacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  contato_id uuid references cliente_contatos (id) on delete set null,
  os_id uuid references ordens_servico (id) on delete set null,
  tipo tipo_interacao not null,
  assunto text not null,
  descricao text,
  ocorrida_em timestamptz not null default now(),
  responsavel_id uuid references usuarios (id) on delete set null,
  created_at timestamptz not null default now()
);

create index interacoes_cliente_idx on interacoes (cliente_id, ocorrida_em desc);
create index interacoes_data_idx on interacoes (ocorrida_em desc);
select aplicar_rls_cadastro('interacoes', 'crm');

/* ---------------------------------------------------------- follow-ups */
create table follow_ups (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes (id) on delete cascade,
  interacao_id uuid references interacoes (id) on delete set null,
  proxima_acao text not null,
  data date not null,
  responsavel_id uuid references usuarios (id) on delete set null,
  prioridade prioridade_acao not null default 'media',
  situacao situacao_follow_up not null default 'aberto',
  observacao text,
  resultado text,
  concluido_em timestamptz,
  concluido_por uuid references usuarios (id) on delete set null,
  criado_por uuid references usuarios (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index follow_ups_agenda_idx on follow_ups (situacao, data);
create index follow_ups_cliente_idx on follow_ups (cliente_id, data desc);
select aplicar_rls_cadastro('follow_ups', 'follow_up');
create trigger tg_follow_ups_updated before update on follow_ups
  for each row execute function tg_set_updated_at();

/* Concluir/cancelar carimba quem e quando — sem depender do cliente. */
create or replace function tg_follow_up_conclusao() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.situacao <> old.situacao then
    if new.situacao in ('concluido','cancelado') then
      new.concluido_em := coalesce(new.concluido_em, now());
      new.concluido_por := coalesce(new.concluido_por, auth.uid());
    else
      new.concluido_em := null;
      new.concluido_por := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger tg_follow_ups_conclusao before update on follow_ups
  for each row execute function tg_follow_up_conclusao();

/* ------------------------------------------------- movimentos de estoque */
create table estoque_movimentos (
  id bigserial primary key,
  produto_id uuid not null references produtos (id) on delete cascade,
  tipo tipo_movimento_estoque not null,
  quantidade numeric(14,3) not null check (quantidade > 0),
  saldo_anterior numeric(14,3) not null,
  saldo_posterior numeric(14,3) not null,
  motivo text,
  os_id uuid references ordens_servico (id) on delete set null,
  venda_id uuid references vendas (id) on delete set null,
  usuario_id uuid references usuarios (id) on delete set null,
  created_at timestamptz not null default now()
);

create index estoque_movimentos_produto_idx on estoque_movimentos (produto_id, created_at desc);

alter table estoque_movimentos enable row level security;

create policy estoque_movimentos_ler on estoque_movimentos
  for select to authenticated using (tem_permissao('estoque_vendas', 'visualizar'));

/* Escrita só pela função — nenhuma policy de insert/update/delete. */

/**
 * Movimenta o estoque de um produto de forma atômica: grava o histórico e
 * atualiza saldo/reservado na mesma transação. Sem esta função o saldo não
 * muda — não existe caminho que altere `produtos.saldo` sem deixar rastro.
 */
create or replace function movimentar_estoque(
  p_produto uuid,
  p_tipo tipo_movimento_estoque,
  p_quantidade numeric,
  p_motivo text default null,
  p_os uuid default null,
  p_venda uuid default null
) returns numeric
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_saldo numeric;
  v_reservado numeric;
  v_novo numeric;
  v_novo_reservado numeric;
begin
  if not tem_permissao('estoque_vendas', 'editar') then
    raise exception 'Sem permissão para movimentar estoque.' using errcode = '42501';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'A quantidade deve ser maior que zero.' using errcode = '22023';
  end if;

  select saldo, reservado into v_saldo, v_reservado
  from produtos where id = p_produto for update;

  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'P0002';
  end if;

  v_novo := v_saldo;
  v_novo_reservado := v_reservado;

  case p_tipo
    when 'entrada' then v_novo := v_saldo + p_quantidade;
    when 'saida' then
      if p_quantidade > v_saldo then
        raise exception 'Saldo insuficiente: disponível %.', v_saldo using errcode = '22023';
      end if;
      v_novo := v_saldo - p_quantidade;
    when 'ajuste' then v_novo := p_quantidade;
    when 'reserva' then
      if v_reservado + p_quantidade > v_saldo then
        raise exception 'Não é possível reservar mais que o saldo.' using errcode = '22023';
      end if;
      v_novo_reservado := v_reservado + p_quantidade;
    when 'liberacao' then
      if p_quantidade > v_reservado then
        raise exception 'Não há essa quantidade reservada.' using errcode = '22023';
      end if;
      v_novo_reservado := v_reservado - p_quantidade;
  end case;

  update produtos set saldo = v_novo, reservado = v_novo_reservado, updated_at = now()
  where id = p_produto;

  insert into estoque_movimentos
    (produto_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, os_id, venda_id, usuario_id)
  values
    (p_produto, p_tipo, p_quantidade, v_saldo, v_novo, nullif(btrim(coalesce(p_motivo,'')), ''), p_os, p_venda, auth.uid());

  return v_novo;
end;
$$;

revoke all on function movimentar_estoque(uuid, tipo_movimento_estoque, numeric, text, uuid, uuid) from public;
grant execute on function movimentar_estoque(uuid, tipo_movimento_estoque, numeric, text, uuid, uuid) to authenticated;

/* ------------------------------------------------------------- visões */
create view vw_estoque
with (security_invoker = true) as
select
  p.id,
  p.codigo,
  p.descricao,
  p.unidade,
  p.saldo,
  p.reservado,
  p.saldo - p.reservado as disponivel,
  p.estoque_minimo,
  p.preco_venda,
  p.preco_custo,
  p.localizacao,
  p.situacao,
  p.origem,
  p.omie_sincronizado_em,
  case
    when p.saldo - p.reservado <= 0 then 'sem_saldo'
    when p.estoque_minimo > 0 and p.saldo - p.reservado <= p.estoque_minimo then 'critico'
    when p.estoque_minimo > 0 and p.saldo - p.reservado <= p.estoque_minimo * 1.5 then 'baixo'
    else 'ok'
  end as situacao_estoque,
  round(coalesce(p.preco_custo, 0) * p.saldo, 2) as valor_custo_total
from produtos p;

grant select on vw_estoque to authenticated;

/**
 * Um cliente por linha, com a data do último atendimento real — a mais
 * recente entre OS aberta, entrada no pátio e venda. Nenhuma data é
 * inventada: cliente sem histórico volta com NULL.
 */
create view vw_clientes_relacionamento
with (security_invoker = true) as
select
  c.id,
  c.codigo,
  c.nome_razao,
  c.nome_fantasia,
  c.documento,
  c.celular,
  c.telefone,
  c.email,
  c.municipio,
  c.uf,
  c.situacao,
  h.ultimo_atendimento,
  case when h.ultimo_atendimento is null then null
       else (current_date - h.ultimo_atendimento::date) end as dias_sem_atendimento,
  coalesce(h.total_os, 0) as total_os,
  coalesce(h.valor_os, 0) as valor_os,
  coalesce(h.total_vendas, 0) as total_vendas,
  coalesce(h.valor_vendas, 0) as valor_vendas,
  coalesce(i.total_interacoes, 0) as total_interacoes,
  i.ultima_interacao,
  f.proximo_follow_up,
  coalesce(f.follow_ups_abertos, 0) as follow_ups_abertos
from clientes c
left join lateral (
  select
    greatest(
      (select max(o.aberta_em) from ordens_servico o where o.cliente_id = c.id),
      (select max(e.entrada_em) from entradas_patio e where e.cliente_id = c.id),
      (select max(v.data_venda)::timestamptz from vendas v where v.cliente_id = c.id)
    ) as ultimo_atendimento,
    (select count(*) from ordens_servico o where o.cliente_id = c.id) as total_os,
    (select coalesce(sum(o.valor_total), 0) from ordens_servico o where o.cliente_id = c.id) as valor_os,
    (select count(*) from vendas v where v.cliente_id = c.id) as total_vendas,
    (select coalesce(sum(v.valor_total), 0) from vendas v where v.cliente_id = c.id) as valor_vendas
) h on true
left join lateral (
  select count(*) as total_interacoes, max(x.ocorrida_em) as ultima_interacao
  from interacoes x where x.cliente_id = c.id
) i on true
left join lateral (
  select min(fu.data) filter (where fu.situacao = 'aberto') as proximo_follow_up,
         count(*) filter (where fu.situacao = 'aberto') as follow_ups_abertos
  from follow_ups fu where fu.cliente_id = c.id
) f on true;

grant select on vw_clientes_relacionamento to authenticated;

/* -------------------------------------------------------- indicadores */
create or replace function indicadores_estoque()
returns table (
  itens integer,
  criticos integer,
  sem_saldo integer,
  reservados integer,
  valor_custo numeric
)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    count(*)::int,
    count(*) filter (where e.situacao_estoque = 'critico')::int,
    count(*) filter (where e.situacao_estoque = 'sem_saldo')::int,
    count(*) filter (where e.reservado > 0)::int,
    coalesce(sum(e.valor_custo_total), 0)
  from vw_estoque e
  where e.situacao = 'ativo'
    and tem_permissao('estoque_vendas', 'visualizar');
$$;

/**
 * Indicadores de venda do período informado (padrão: mês corrente) mais o
 * período imediatamente anterior de mesmo tamanho, para comparação.
 */
create or replace function indicadores_vendas(p_de date default null, p_ate date default null)
returns table (
  de date,
  ate date,
  quantidade integer,
  valor numeric,
  ticket_medio numeric,
  quantidade_anterior integer,
  valor_anterior numeric
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_de date := coalesce(p_de, date_trunc('month', current_date)::date);
  v_ate date := coalesce(p_ate, current_date);
  v_dias integer;
begin
  if not tem_permissao('estoque_vendas', 'visualizar') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  v_dias := (v_ate - v_de) + 1;

  return query
  select
    v_de,
    v_ate,
    (select count(*)::int from vendas v where v.data_venda between v_de and v_ate),
    (select coalesce(sum(v.valor_total), 0) from vendas v where v.data_venda between v_de and v_ate),
    (select case when count(*) = 0 then 0 else round(coalesce(sum(v.valor_total), 0) / count(*), 2) end
       from vendas v where v.data_venda between v_de and v_ate),
    (select count(*)::int from vendas v where v.data_venda between v_de - v_dias and v_de - 1),
    (select coalesce(sum(v.valor_total), 0) from vendas v where v.data_venda between v_de - v_dias and v_de - 1);
end;
$$;

create or replace function produtos_mais_vendidos(p_de date default null, p_ate date default null, p_limite integer default 10)
returns table (produto_id uuid, codigo text, descricao text, quantidade numeric, valor numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    i.produto_id,
    p.codigo,
    coalesce(p.descricao, i.descricao),
    sum(i.quantidade),
    sum(i.valor_total)
  from venda_itens i
  join vendas v on v.id = i.venda_id
  left join produtos p on p.id = i.produto_id
  where v.data_venda between coalesce(p_de, date_trunc('month', current_date)::date) and coalesce(p_ate, current_date)
    and tem_permissao('estoque_vendas', 'visualizar')
  group by i.produto_id, p.codigo, p.descricao, i.descricao
  order by sum(i.valor_total) desc
  limit greatest(coalesce(p_limite, 10), 1);
$$;

create or replace function evolucao_vendas(p_meses integer default 12)
returns table (mes date, quantidade integer, valor numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select
    date_trunc('month', v.data_venda)::date,
    count(*)::int,
    coalesce(sum(v.valor_total), 0)
  from vendas v
  where v.data_venda >= (date_trunc('month', current_date) - make_interval(months => greatest(coalesce(p_meses, 12), 1) - 1))::date
    and tem_permissao('estoque_vendas', 'visualizar')
  group by 1
  order by 1;
$$;

/**
 * Resumo de relacionamento: totais de clientes por faixa de inatividade,
 * usando as faixas configuradas em `parametros.crm_faixas_inatividade`.
 */
create or replace function indicadores_crm()
returns table (
  clientes_ativos integer,
  sem_historico integer,
  faixa1_dias integer,
  faixa1 integer,
  faixa2_dias integer,
  faixa2 integer,
  faixa3_dias integer,
  faixa3 integer,
  interacoes_30d integer,
  follow_ups_abertos integer,
  follow_ups_atrasados integer
)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_faixas jsonb;
  f1 integer; f2 integer; f3 integer;
begin
  if not tem_permissao('crm', 'visualizar') then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select valor into v_faixas from parametros where chave = 'crm_faixas_inatividade';
  f1 := coalesce((v_faixas ->> 0)::int, 90);
  f2 := coalesce((v_faixas ->> 1)::int, 180);
  f3 := coalesce((v_faixas ->> 2)::int, 365);

  return query
  select
    (select count(*)::int from clientes c where c.situacao = 'ativo'),
    (select count(*)::int from vw_clientes_relacionamento r where r.situacao = 'ativo' and r.ultimo_atendimento is null),
    f1,
    (select count(*)::int from vw_clientes_relacionamento r where r.situacao = 'ativo' and r.dias_sem_atendimento >= f1 and r.dias_sem_atendimento < f2),
    f2,
    (select count(*)::int from vw_clientes_relacionamento r where r.situacao = 'ativo' and r.dias_sem_atendimento >= f2 and r.dias_sem_atendimento < f3),
    f3,
    (select count(*)::int from vw_clientes_relacionamento r where r.situacao = 'ativo' and r.dias_sem_atendimento >= f3),
    (select count(*)::int from interacoes i where i.ocorrida_em >= now() - interval '30 days'),
    (select count(*)::int from follow_ups f where f.situacao = 'aberto'),
    (select count(*)::int from follow_ups f where f.situacao = 'aberto' and f.data < current_date);
end;
$$;

grant execute on function indicadores_estoque() to authenticated;
grant execute on function indicadores_vendas(date, date) to authenticated;
grant execute on function produtos_mais_vendidos(date, date, integer) to authenticated;
grant execute on function evolucao_vendas(integer) to authenticated;
grant execute on function indicadores_crm() to authenticated;;
