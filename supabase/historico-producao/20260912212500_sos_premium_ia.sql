-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260912212500.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- SOS Tecnoar — atendimento premium, contratos com prazo, IA, LGPD e monitor
-- do vigia. Roda depois de 20260912_sos_tecnoar.sql. Idempotente.
--
-- 1. Orçamento no app: o mecânico envia, o cliente aprova assinando na tela
--    (ou a central registra a aprovação por telefone). Opcionalmente o serviço
--    só começa com orçamento aprovado.
-- 2. Taxa de deslocamento: ao chegar no local, o chamado ganha a linha de
--    deslocamento (km × valor, com taxa mínima; ida e volta opcional), que
--    segue para a OS como qualquer item.
-- 3. Contratos de frotistas: prazo de chegada (SLA), prioridade mínima e valor
--    de km próprios. O vigia avisa a central quando o prazo estoura.
-- 4. IA do SOS: configurada dentro da Gestão SOS (chave própria ou a mesma da
--    Tecnoar IA). As chamadas ao modelo ficam na função `sos-ia`; aqui ficam a
--    configuração, o registro de uso e o que o app pode saber (ativo ou não).
-- 5. LGPD: o cliente exclui a própria conta pelo app.
-- 6. Monitor do vigia: a central vê quando ele rodou pela última vez.

-- ============================================================== colunas
alter table public.sos_config
  add column if not exists exigir_aprovacao_orcamento boolean not null default false,
  add column if not exists deslocamento_ativo boolean not null default false,
  add column if not exists deslocamento_valor_km numeric not null default 0 check (deslocamento_valor_km >= 0),
  add column if not exists deslocamento_taxa_minima numeric not null default 0 check (deslocamento_taxa_minima >= 0),
  add column if not exists deslocamento_ida_volta boolean not null default true,
  add column if not exists deslocamento_servico_id uuid references public.servicos(id) on delete set null,
  add column if not exists ia_ativa boolean not null default false,
  add column if not exists ia_provedor text not null default 'anthropic' check (ia_provedor in ('anthropic', 'openai', 'gemini')),
  add column if not exists ia_modelo text not null default 'claude-sonnet-5',
  add column if not exists ia_usar_chave_tecnoar_ia boolean not null default false,
  add column if not exists ia_instrucoes text,
  add column if not exists ia_atendimento boolean not null default true,
  add column if not exists ia_foto boolean not null default true,
  add column if not exists ia_kit boolean not null default true,
  add column if not exists ia_resumo boolean not null default true,
  add column if not exists ia_limite_cliente_dia integer not null default 30 check (ia_limite_cliente_dia >= 0);

alter table public.sos_chamados
  add column if not exists distancia_inicial_km numeric,
  add column if not exists orcamento_status text check (orcamento_status in ('pendente', 'aprovado', 'recusado')),
  add column if not exists orcamento_valor numeric,
  add column if not exists orcamento_enviado_em timestamptz,
  add column if not exists orcamento_respondido_em timestamptz,
  add column if not exists orcamento_respondido_por uuid references auth.users(id) on delete set null,
  add column if not exists orcamento_assinatura text,
  add column if not exists orcamento_observacao text,
  add column if not exists orcamento_desatualizado boolean not null default false,
  add column if not exists contrato_id uuid,
  add column if not exists sla_chegada_min integer,
  add column if not exists sla_avisado_em timestamptz,
  add column if not exists ia_kit jsonb,
  add column if not exists ia_resumo text;

alter table public.sos_itens
  add column if not exists origem text not null default 'manual' check (origem in ('manual', 'deslocamento', 'ia'));

-- ============================================================== contratos
create table if not exists public.sos_contratos (
  id                uuid primary key default gen_random_uuid(),
  cliente_id        uuid not null references public.clientes(id) on delete cascade,
  nome              text not null,
  -- Prazo de chegada combinado, contado do pedido até o mecânico no local.
  prazo_chegada_min integer check (prazo_chegada_min is null or prazo_chegada_min > 0),
  prioridade        public.sos_prioridade not null default 'alta',
  valor_km          numeric check (valor_km is null or valor_km >= 0),
  taxa_minima       numeric check (taxa_minima is null or taxa_minima >= 0),
  vigencia_inicio   date,
  vigencia_fim      date,
  ativo             boolean not null default true,
  observacoes       text,
  criado_por        uuid references public.usuarios(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
-- Um contrato ativo por cliente: sem ambiguidade na hora do SOS.
create unique index if not exists sos_contratos_um_ativo on public.sos_contratos (cliente_id) where ativo;

alter table public.sos_chamados drop constraint if exists sos_chamados_contrato_fk;
alter table public.sos_chamados
  add constraint sos_chamados_contrato_fk foreign key (contrato_id) references public.sos_contratos(id) on delete set null;

-- ============================================================== registro da IA
create table if not exists public.sos_ia_mensagens (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid references auth.users(id) on delete cascade,
  chamado_id      uuid references public.sos_chamados(id) on delete cascade,
  acao            text not null check (acao in ('atendimento', 'foto', 'kit', 'resumo', 'testar')),
  papel           text not null check (papel in ('usuario', 'assistente')),
  conteudo        text,
  sugestao        jsonb,
  modelo          text,
  tokens_entrada  integer,
  tokens_saida    integer,
  erro            text,
  created_at      timestamptz not null default now()
);
create index if not exists sos_ia_mensagens_usuario on public.sos_ia_mensagens (usuario_id, created_at desc);
create index if not exists sos_ia_mensagens_chamado on public.sos_ia_mensagens (chamado_id, created_at);

-- ============================================================== apoio
create or replace function public.sos_moeda(p numeric)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select 'R$ ' || replace(replace(replace(to_char(coalesce(p, 0), 'FM999,999,990.00'), ',', '_'), '.', ','), '_', '.')
$$;

create or replace function public.sos_contrato_vigente(p_cliente uuid)
returns public.sos_contratos
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.sos_contratos
  where cliente_id = p_cliente and ativo
    and (vigencia_inicio is null or vigencia_inicio <= current_date)
    and (vigencia_fim is null or vigencia_fim >= current_date)
  order by created_at desc limit 1
$$;

-- ============================================================== gatilhos
-- Mesmo gatilho de antes (protocolo, espera, previsão inicial) com: contrato e
-- prazo no nascimento, distância inicial na saída e a trava do orçamento.
create or replace function public.sos_chamados_antes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_ct public.sos_contratos;
begin
  if tg_op = 'INSERT' then
    new.protocolo := 'SOS-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') || '-' || lpad(new.numero::text, 6, '0');
    new.espera_desde := coalesce(new.espera_desde, now());
    -- Frotista com contrato: prazo de chegada e prioridade mínima do contrato.
    v_ct := public.sos_contrato_vigente(new.cliente_id);
    if v_ct.id is not null then
      new.contrato_id := v_ct.id;
      new.sla_chegada_min := v_ct.prazo_chegada_min;
      if new.prioridade < v_ct.prioridade then new.prioridade := v_ct.prioridade; end if;
    end if;
  else
    -- Nova espera (voltou para a fila, ou foi atribuído a outro mecânico):
    -- o prazo de aceite recomeça e os avisos do vigia zeram.
    if new.status in ('recebido', 'procurando_mecanico')
       and (new.mecanico_id is distinct from old.mecanico_id or old.status not in ('recebido', 'procurando_mecanico')) then
      new.espera_desde := now();
      new.alerta_nivel := 0;
      new.alerta_em := null;
    end if;
    -- Saída para o cliente: guarda a previsão e a distância iniciais (base do
    -- "atrasado" e da taxa de deslocamento).
    if new.status = 'a_caminho' and old.status is distinct from 'a_caminho' then
      new.eta_inicial_min := new.eta_min;
      new.distancia_inicial_km := new.distancia_km;
      new.atraso_avisado_em := null;
      new.sinal_avisado_em := null;
    elsif new.mecanico_id is distinct from old.mecanico_id then
      new.eta_inicial_min := null;
      new.distancia_inicial_km := null;
      new.atraso_avisado_em := null;
      new.sinal_avisado_em := null;
    end if;
    -- Com a regra ligada, o serviço só começa com o orçamento aprovado.
    if new.status = 'servico_iniciado' and old.status is distinct from 'servico_iniciado'
       and new.orcamento_status is distinct from 'aprovado'
       and coalesce((select exigir_aprovacao_orcamento from public.sos_config where singleton), false) then
      raise exception 'Envie o orçamento e aguarde o cliente aprovar antes de iniciar o serviço.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Ao chegar no local: lança a taxa de deslocamento (uma vez por chamado).
create or replace function public.sos_lancar_deslocamento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg      public.sos_config;
  v_ct       public.sos_contratos;
  v_km       numeric;
  v_valor_km numeric;
  v_minimo   numeric;
  v_rotulo   text;
begin
  if new.status <> 'no_local' or old.status = 'no_local' then return new; end if;
  select * into v_cfg from public.sos_config where singleton;
  if not v_cfg.deslocamento_ativo then return new; end if;
  if exists (select 1 from public.sos_itens where chamado_id = new.id and origem = 'deslocamento') then return new; end if;
  if new.contrato_id is not null then
    select * into v_ct from public.sos_contratos where id = new.contrato_id;
  end if;
  v_valor_km := coalesce(v_ct.valor_km, v_cfg.deslocamento_valor_km);
  v_minimo := coalesce(v_ct.taxa_minima, v_cfg.deslocamento_taxa_minima);
  if coalesce(v_valor_km, 0) <= 0 and coalesce(v_minimo, 0) <= 0 then return new; end if;

  -- Distância no aceite; sem ela, da primeira posição enviada pelo mecânico.
  v_km := coalesce(new.distancia_inicial_km, (
    select public.sos_distancia_km(p.latitude, p.longitude, new.latitude, new.longitude)
    from public.sos_posicoes p where p.chamado_id = new.id and p.papel = 'mecanico'
    order by p.registrado_em limit 1));
  if v_km is null then
    perform public.sos_registrar_evento(new.id, 'item', 'Taxa de deslocamento não lançada',
      'Sem a distância percorrida (GPS do mecânico desligado). Lance manualmente se for o caso.', null, null, null, 'sistema');
    return new;
  end if;
  if v_cfg.deslocamento_ida_volta then v_km := v_km * 2; end if;
  v_km := round(v_km, 1);
  v_rotulo := replace(v_km::text, '.', ',') || ' km' || case when v_cfg.deslocamento_ida_volta then ' ida e volta' else '' end;

  if v_km > 0 and v_km * v_valor_km >= v_minimo and v_valor_km > 0 then
    insert into public.sos_itens (chamado_id, tipo, servico_id, codigo, descricao, unidade, quantidade, valor_unitario, origem)
    values (new.id, 'servico', v_cfg.deslocamento_servico_id,
            (select codigo from public.servicos where id = v_cfg.deslocamento_servico_id),
            'Deslocamento (' || v_rotulo || ')', 'KM', v_km, v_valor_km, 'deslocamento');
  else
    insert into public.sos_itens (chamado_id, tipo, servico_id, codigo, descricao, quantidade, valor_unitario, origem)
    values (new.id, 'servico', v_cfg.deslocamento_servico_id,
            (select codigo from public.servicos where id = v_cfg.deslocamento_servico_id),
            'Deslocamento — taxa mínima (' || v_rotulo || ')', 1, v_minimo, 'deslocamento');
  end if;
  perform public.sos_registrar_evento(new.id, 'item', 'Taxa de deslocamento lançada',
    v_rotulo || ' · ' || public.sos_moeda(greatest(v_km * v_valor_km, v_minimo)), null, null, null, 'sistema');
  perform public.sos_sincronizar_itens_os(new.id);
  return new;
exception when others then
  -- Cobrança é consequência: a chegada nunca falha por ela.
  return new;
end;
$$;

drop trigger if exists sos_chamados_deslocamento on public.sos_chamados;
create trigger sos_chamados_deslocamento
  after update of status on public.sos_chamados
  for each row execute function public.sos_lancar_deslocamento();

-- Item mudou depois do orçamento respondido: o orçamento fica desatualizado
-- (o app oferece reenviar).
create or replace function public.sos_itens_orcamento()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.sos_chamados set orcamento_desatualizado = true
  where id = coalesce(new.chamado_id, old.chamado_id)
    and orcamento_status is not null and not orcamento_desatualizado;
  return null;
end;
$$;

drop trigger if exists sos_itens_orcamento on public.sos_itens;
create trigger sos_itens_orcamento
  after insert or update of quantidade, valor_unitario, desconto or delete on public.sos_itens
  for each row execute function public.sos_itens_orcamento();

-- ============================================================== orçamento
create or replace function public.sos_enviar_orcamento(p_chamado uuid, p_observacao text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_c public.sos_chamados; v_total numeric; v_n integer;
begin
  if not public.sos_pode_atender(p_chamado) then raise exception 'Sem permissão.'; end if;
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if v_c.status not in ('no_local', 'servico_iniciado') then
    raise exception 'O orçamento é enviado com o mecânico no local.';
  end if;
  select count(*), coalesce(sum(valor_total), 0) into v_n, v_total from public.sos_itens where chamado_id = p_chamado;
  if v_n = 0 then raise exception 'Lance as peças e serviços antes de enviar o orçamento.'; end if;

  update public.sos_chamados
  set orcamento_status = 'pendente', orcamento_valor = v_total, orcamento_enviado_em = now(),
      orcamento_respondido_em = null, orcamento_respondido_por = null, orcamento_assinatura = null,
      orcamento_desatualizado = false, orcamento_observacao = nullif(trim(p_observacao), '')
  where id = p_chamado;

  perform public.sos_registrar_evento(p_chamado, 'orcamento', 'Orçamento enviado ao cliente',
    v_n || ' ite' || case when v_n = 1 then 'm' else 'ns' end || ' · ' || public.sos_moeda(v_total),
    jsonb_build_object('valor', v_total, 'itens', v_n), null, null, null);
  perform public.sos_notificar(v_c.conta_usuario_id, '🧾 Orçamento para aprovar · ' || v_c.protocolo,
    'Total de ' || public.sos_moeda(v_total) || '. Toque para ver os itens e aprovar.', '/app/chamado/' || p_chamado);
  return (select to_jsonb(c) from public.sos_chamados c where c.id = p_chamado);
end;
$$;

-- Cliente aprova (assinando) ou recusa. A central pode registrar a resposta
-- dada por telefone — sempre com a observação de como foi.
create or replace function public.sos_responder_orcamento(
  p_chamado uuid, p_aprovado boolean, p_assinatura text default null, p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_c public.sos_chamados; v_cliente boolean; v_u uuid;
begin
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  v_cliente := v_c.conta_usuario_id = auth.uid()
               or (v_c.cliente_id = public.sos_cliente_atual() and not public.sos_eh_equipe());
  if not v_cliente and not public.tem_permissao('sos', 'editar') then
    raise exception 'Só o cliente (ou a central) responde o orçamento.';
  end if;
  if v_c.orcamento_status is distinct from 'pendente' then raise exception 'Não há orçamento aguardando resposta.'; end if;
  if p_aprovado and v_cliente and (p_assinatura is null or split_part(p_assinatura, '/', 1) <> p_chamado::text) then
    raise exception 'Assine para aprovar o orçamento.';
  end if;
  if not v_cliente and nullif(trim(coalesce(p_observacao, '')), '') is null then
    raise exception 'Informe como o cliente respondeu (ex.: aprovado por telefone com o João).';
  end if;

  update public.sos_chamados
  set orcamento_status = case when p_aprovado then 'aprovado' else 'recusado' end,
      orcamento_respondido_em = now(), orcamento_respondido_por = auth.uid(),
      orcamento_assinatura = case when p_aprovado then p_assinatura end,
      orcamento_observacao = coalesce(nullif(trim(p_observacao), ''), orcamento_observacao)
  where id = p_chamado;

  perform public.sos_registrar_evento(p_chamado, 'orcamento',
    case when p_aprovado then 'Orçamento aprovado' else 'Orçamento recusado' end || case when v_cliente then '' else ' (registrado pela central)' end,
    p_observacao, jsonb_build_object('aprovado', p_aprovado, 'valor', v_c.orcamento_valor), null, null, null);
  perform public.sos_notificar(v_c.mecanico_id,
    case when p_aprovado then '✅ Orçamento aprovado · ' else '❌ Orçamento recusado · ' end || v_c.protocolo,
    coalesce(nullif(trim(p_observacao), ''), public.sos_moeda(v_c.orcamento_valor)), '/app/chamado/' || p_chamado);
  if not p_aprovado then
    for v_u in select * from public.sos_usuarios_central() loop
      perform public.sos_notificar(v_u, 'Orçamento recusado · ' || v_c.protocolo, coalesce(p_observacao, ''), '/sos?chamado=' || p_chamado);
    end loop;
  end if;
  return (select to_jsonb(c) from public.sos_chamados c where c.id = p_chamado);
end;
$$;

-- ============================================================== contratos (RPC)
create or replace function public.sos_salvar_contrato(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if not public.tem_permissao('sos', 'configurar') then raise exception 'Sem permissão.'; end if;
  if nullif(p->>'cliente_id', '') is null then raise exception 'Escolha o cliente.'; end if;
  if nullif(trim(p->>'nome'), '') is null then raise exception 'Dê um nome ao contrato.'; end if;
  if coalesce((p->>'ativo')::boolean, true) and exists (
    select 1 from public.sos_contratos where cliente_id = (p->>'cliente_id')::uuid and ativo and id is distinct from v_id
  ) then
    raise exception 'Este cliente já tem um contrato ativo. Encerre o anterior antes.';
  end if;

  if v_id is null then
    insert into public.sos_contratos (cliente_id, nome, prazo_chegada_min, prioridade, valor_km, taxa_minima,
                                      vigencia_inicio, vigencia_fim, ativo, observacoes, criado_por)
    values ((p->>'cliente_id')::uuid, trim(p->>'nome'), nullif(p->>'prazo_chegada_min', '')::int,
            coalesce(nullif(p->>'prioridade', '')::public.sos_prioridade, 'alta'),
            nullif(p->>'valor_km', '')::numeric, nullif(p->>'taxa_minima', '')::numeric,
            nullif(p->>'vigencia_inicio', '')::date, nullif(p->>'vigencia_fim', '')::date,
            coalesce((p->>'ativo')::boolean, true), nullif(trim(p->>'observacoes'), ''), auth.uid())
    returning id into v_id;
  else
    update public.sos_contratos
    set cliente_id = (p->>'cliente_id')::uuid, nome = trim(p->>'nome'),
        prazo_chegada_min = nullif(p->>'prazo_chegada_min', '')::int,
        prioridade = coalesce(nullif(p->>'prioridade', '')::public.sos_prioridade, prioridade),
        valor_km = nullif(p->>'valor_km', '')::numeric, taxa_minima = nullif(p->>'taxa_minima', '')::numeric,
        vigencia_inicio = nullif(p->>'vigencia_inicio', '')::date, vigencia_fim = nullif(p->>'vigencia_fim', '')::date,
        ativo = coalesce((p->>'ativo')::boolean, ativo), observacoes = nullif(trim(p->>'observacoes'), ''),
        updated_at = now()
    where id = v_id;
  end if;
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.contrato', 'sos_contratos', v_id, p);
  return (select to_jsonb(c) from public.sos_contratos c where c.id = v_id);
end;
$$;

-- Contratos com o que a central precisa para cobrar prazo: quantos SOS no
-- mês e quantos chegaram dentro do combinado.
create or replace function public.sos_listar_contratos()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.sos_eh_equipe() then '[]'::jsonb else coalesce((
    select jsonb_agg(to_jsonb(ct) || jsonb_build_object(
      'cliente_nome', cl.nome_razao,
      'chamados_30d', (select count(*) from public.sos_chamados c where c.contrato_id = ct.id and c.recebido_em > now() - interval '30 days'),
      'no_prazo_30d', (select count(*) from public.sos_chamados c where c.contrato_id = ct.id and c.recebido_em > now() - interval '30 days'
                        and c.chegou_em is not null and c.chegou_em <= c.recebido_em + make_interval(mins => c.sla_chegada_min)),
      'com_chegada_30d', (select count(*) from public.sos_chamados c where c.contrato_id = ct.id and c.recebido_em > now() - interval '30 days'
                           and c.chegou_em is not null and c.sla_chegada_min is not null)
    ) order by ct.ativo desc, cl.nome_razao)
    from public.sos_contratos ct join public.clientes cl on cl.id = ct.cliente_id
  ), '[]'::jsonb) end
$$;

-- ============================================================== vigia (com prazo de contrato)
create or replace function public.sos_vigiar()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg     public.sos_config;
  v_lim     integer;
  v_c       record;
  v_u       uuid;
  v_idade   integer;
  v_min     integer;
  v_prazo   integer;
  v_nivel   smallint;
  v_nome    text;
  v_resumo  text;
  v_link    text;
  n_espera  integer := 0;
  n_devolv  integer := 0;
  n_atraso  integer := 0;
  n_sinal   integer := 0;
  n_concl   integer := 0;
  n_off     integer := 0;
  n_sla     integer := 0;
begin
  -- Execuções sobrepostas (cron atrasado) não duplicam avisos.
  if not pg_try_advisory_xact_lock(hashtext('sos_vigiar')) then
    return jsonb_build_object('ok', false, 'motivo', 'em_execucao');
  end if;
  select * into v_cfg from public.sos_config where singleton;
  v_lim := greatest(coalesce(v_cfg.tempo_aceite_seg, 120), 30);

  -- 1. Esperando mecânico além do prazo de aceite.
  for v_c in
    select c.id, c.protocolo, c.mecanico_id, c.conta_usuario_id, c.recebido_em,
           coalesce(c.espera_desde, c.recebido_em) as desde, c.alerta_nivel, c.tipo_ocorrencia,
           cl.nome_razao as cliente, v.placa
    from public.sos_chamados c
    join public.clientes cl on cl.id = c.cliente_id
    left join public.veiculos v on v.id = c.veiculo_id
    where c.status in ('recebido', 'procurando_mecanico')
      and coalesce(c.espera_desde, c.recebido_em) <= now() - make_interval(secs => v_lim)
    order by c.recebido_em
  loop
    v_idade := extract(epoch from now() - v_c.desde)::int;
    v_min := greatest(1, round(extract(epoch from now() - v_c.recebido_em) / 60.0))::int;
    v_resumo := concat_ws(' · ', v_c.cliente, v_c.placa, public.sos_rotulo_ocorrencia(v_c.tipo_ocorrencia));
    v_link := '/sos?chamado=' || v_c.id;

    -- 1a. Atribuído pela central a um mecânico que não respondeu.
    if v_c.mecanico_id is not null then
      v_nome := coalesce((select split_part(nome_completo, ' ', 1) from public.usuarios where id = v_c.mecanico_id), 'O mecânico');
      if v_cfg.modo_distribuicao = 'inteligente' then
        update public.sos_chamados
        set mecanico_id = null, atribuido_em = null, atribuido_por = null, status = 'procurando_mecanico'
        where id = v_c.id;
        perform public.sos_registrar_evento(v_c.id, 'alerta', v_nome || ' não respondeu',
          'Sem resposta em ' || public.sos_texto_duracao(v_idade) || '. O chamado voltou para todos os mecânicos disponíveis.',
          jsonb_build_object('mecanico_id', v_c.mecanico_id, 'motivo', 'sem_resposta'), null, null, 'sistema');
        for v_u in select * from public.sos_usuarios_central() loop
          perform public.sos_notificar(v_u, '⚠️ ' || v_nome || ' não respondeu · ' || v_c.protocolo,
            'O SOS voltou para todos os mecânicos disponíveis. ' || v_resumo, v_link);
        end loop;
        perform public.sos_avisar_mecanicos(v_c.id, '🚨 SOS esperando mecânico · ' || v_c.protocolo, v_resumo, v_c.mecanico_id);
        n_devolv := n_devolv + 1;
      elsif v_c.alerta_nivel = 0 then
        update public.sos_chamados set alerta_nivel = 1, alerta_em = now() where id = v_c.id;
        perform public.sos_registrar_evento(v_c.id, 'alerta', v_nome || ' ainda não respondeu',
          'Sem resposta em ' || public.sos_texto_duracao(v_idade) || '.', jsonb_build_object('mecanico_id', v_c.mecanico_id), null, null, 'sistema');
        for v_u in select * from public.sos_usuarios_central() loop
          perform public.sos_notificar(v_u, '⚠️ ' || v_nome || ' não respondeu · ' || v_c.protocolo,
            'Escolha outro mecânico ou ligue para ele. ' || v_resumo, v_link);
        end loop;
        perform public.sos_notificar(v_c.mecanico_id, '🚨 SOS aguardando sua resposta · ' || v_c.protocolo, v_resumo, '/app/chamado/' || v_c.id);
        n_espera := n_espera + 1;
      end if;
      continue;
    end if;

    -- 1b. Ninguém com o chamado: o tom sobe com o tempo.
    v_nivel := case when v_idade >= 6 * v_lim then 3 when v_idade >= 3 * v_lim then 2 else 1 end;
    if v_nivel <= v_c.alerta_nivel then continue; end if;

    update public.sos_chamados set alerta_nivel = v_nivel, alerta_em = now() where id = v_c.id;
    perform public.sos_registrar_evento(v_c.id, 'alerta',
      case v_nivel when 1 then 'Ainda sem mecânico' when 2 then 'Central acionada' else 'Alerta máximo: sem mecânico' end,
      'Aguardando há ' || v_min || ' min. ' ||
      case v_nivel
        when 1 then case when v_cfg.modo_distribuicao = 'inteligente' then 'Mecânicos disponíveis e central avisados de novo.' else 'Central avisada de novo.' end
        when 2 then 'A central foi acionada para despachar pessoalmente.'
        else 'Alerta máximo enviado à central.' end,
      jsonb_build_object('nivel', v_nivel), null, null, 'sistema');

    for v_u in select * from public.sos_usuarios_central() loop
      perform public.sos_notificar(v_u,
        case v_nivel when 1 then '⏱ SOS sem mecânico há ' when 2 then '🔴 SOS sem mecânico há ' else '🔴🔴 SOS parado há ' end
          || v_min || ' min · ' || v_c.protocolo,
        case when v_nivel = 1 then v_resumo else 'Despache manualmente ou ligue para o cliente. ' || v_resumo end,
        v_link);
    end loop;
    if v_cfg.modo_distribuicao = 'inteligente' then
      perform public.sos_avisar_mecanicos(v_c.id, '⏱ SOS esperando há ' || v_min || ' min · ' || v_c.protocolo, v_resumo, null);
    end if;
    if v_nivel >= 2 then
      perform public.sos_avisar_whatsapp(v_c.id, '⚠️ SOS SEM MECÂNICO HÁ ' || v_min || ' MIN');
    end if;
    if v_nivel = 2 and v_c.conta_usuario_id is not null then
      perform public.sos_notificar(v_c.conta_usuario_id, 'Seu SOS continua em andamento · ' || v_c.protocolo,
        'A central da Tecnoar está cuidando do seu chamado pessoalmente e pode te ligar.', '/app/chamado/' || v_c.id);
    end if;
    n_espera := n_espera + 1;
  end loop;

  -- 2. Deslocamento: atrasado, ou sem posição do mecânico.
  for v_c in
    select c.id, c.protocolo, c.mecanico_id, c.eta_inicial_min, c.eta_min,
           greatest(c.a_caminho_em, c.atribuido_em) as saiu_em, c.atraso_avisado_em, c.sinal_avisado_em,
           cl.nome_razao as cliente, m.posicao_em, u.nome_completo
    from public.sos_chamados c
    join public.clientes cl on cl.id = c.cliente_id
    left join public.sos_mecanicos m on m.usuario_id = c.mecanico_id
    left join public.usuarios u on u.id = c.mecanico_id
    where c.status in ('aceito', 'a_caminho') and c.mecanico_id is not null
      and (c.atraso_avisado_em is null or c.sinal_avisado_em is null)
  loop
    if v_c.saiu_em is null then continue; end if;
    v_nome := coalesce(nullif(split_part(v_c.nome_completo, ' ', 1), ''), 'O mecânico');
    v_min := greatest(0, round(extract(epoch from now() - v_c.saiu_em) / 60.0))::int;
    v_link := '/sos?chamado=' || v_c.id;

    -- Atrasado: 1,5× a previsão inicial + 10 min de folga (sem previsão, 30 min).
    v_prazo := greatest(15, ceil(coalesce(v_c.eta_inicial_min, 30) * 1.5)::int + 10);
    if v_c.atraso_avisado_em is null and v_min >= v_prazo then
      update public.sos_chamados set atraso_avisado_em = now() where id = v_c.id;
      perform public.sos_registrar_evento(v_c.id, 'alerta', 'Deslocamento atrasado',
        'A caminho há ' || v_min || ' min' || coalesce(' (previsão inicial: ' || v_c.eta_inicial_min || ' min)', '')
          || coalesce(', faltando cerca de ' || v_c.eta_min || ' min', '') || '.',
        jsonb_build_object('minutos', v_min, 'eta_inicial_min', v_c.eta_inicial_min), null, null, 'sistema');
      for v_u in select * from public.sos_usuarios_central() loop
        perform public.sos_notificar(v_u, '⏰ ' || v_nome || ' atrasado · ' || v_c.protocolo,
          'A caminho há ' || v_min || ' min' || coalesce(' (previsão era ' || v_c.eta_inicial_min || ' min)', '') || '. ' || v_c.cliente, v_link);
      end loop;
      n_atraso := n_atraso + 1;
    end if;

    -- Sem posição: 8 min sem nada do GPS do mecânico, depois de 5 min de saída.
    if v_c.sinal_avisado_em is null and v_c.saiu_em <= now() - interval '5 minutes'
       and coalesce(v_c.posicao_em, '-infinity'::timestamptz) < now() - interval '8 minutes' then
      update public.sos_chamados set sinal_avisado_em = now() where id = v_c.id;
      perform public.sos_registrar_evento(v_c.id, 'alerta', 'Sem posição do mecânico',
        coalesce('Última posição há ' || round(extract(epoch from now() - v_c.posicao_em) / 60.0) || ' min.', 'O mecânico ainda não enviou posição.')
          || ' O app dele pode estar fechado.',
        null, null, null, 'sistema');
      for v_u in select * from public.sos_usuarios_central() loop
        perform public.sos_notificar(v_u, '📡 Sem sinal de ' || v_nome || ' · ' || v_c.protocolo,
          'Ligue para o mecânico: o cliente não está vendo a posição dele. ' || v_c.cliente, v_link);
      end loop;
      perform public.sos_notificar(v_c.mecanico_id, '📍 Abra o SOS Tecnoar',
        'O cliente não está vendo sua posição. Toque para voltar ao atendimento.', '/app/chamado/' || v_c.id);
      n_sinal := n_sinal + 1;
    end if;
  end loop;

  -- 3. Serviço finalizado e o cliente não avaliou: conclui sozinho.
  for v_c in
    select c.id from public.sos_chamados c
    where c.status = 'servico_finalizado'
      and c.finalizado_em < now() - make_interval(hours => greatest(coalesce(v_cfg.concluir_apos_horas, 24), 1))
  loop
    update public.sos_chamados set status = 'concluido', concluido_em = now() where id = v_c.id;
    perform public.sos_registrar_evento(v_c.id, 'status', public.sos_rotulo_status('concluido'),
      'Concluído automaticamente: o cliente não avaliou em ' || greatest(coalesce(v_cfg.concluir_apos_horas, 24), 1) || ' h.',
      jsonb_build_object('status', 'concluido', 'automatico', true), null, null, 'sistema');
    n_concl := n_concl + 1;
  end loop;

  -- 4. "Disponível" sem nenhum sinal do app (pulso, GPS ou mudança de situação).
  if coalesce(v_cfg.offline_apos_min, 240) > 0 then
    for v_c in
      select m.usuario_id from public.sos_mecanicos m
      left join public.sos_presenca p on p.usuario_id = m.usuario_id
      where m.situacao = 'disponivel' and m.chamado_atual_id is null
        and greatest(m.situacao_em, coalesce(p.visto_em, m.situacao_em), coalesce(m.posicao_em, m.situacao_em))
            < now() - make_interval(mins => greatest(v_cfg.offline_apos_min, 15))
    loop
      update public.sos_mecanicos set situacao = 'offline' where usuario_id = v_c.usuario_id;
      perform public.sos_notificar(v_c.usuario_id, 'Você ficou offline no SOS',
        'O app ficou fechado por muito tempo. Abra o SOS Tecnoar e toque em FICAR DISPONÍVEL para voltar a receber chamados.', '/app/');
      n_off := n_off + 1;
    end loop;
  end if;

  -- 5. Contrato com prazo de chegada: a central fica sabendo quando estoura.
  for v_c in
    select c.id, c.protocolo, c.sla_chegada_min, cl.nome_razao as cliente, ct.nome as contrato
    from public.sos_chamados c
    join public.clientes cl on cl.id = c.cliente_id
    left join public.sos_contratos ct on ct.id = c.contrato_id
    where c.sla_chegada_min is not null and c.sla_avisado_em is null
      and c.status in ('recebido', 'procurando_mecanico', 'aceito', 'a_caminho')
      and now() > c.recebido_em + make_interval(mins => c.sla_chegada_min)
  loop
    update public.sos_chamados set sla_avisado_em = now() where id = v_c.id;
    perform public.sos_registrar_evento(v_c.id, 'alerta', 'Prazo do contrato estourado',
      coalesce(v_c.contrato, 'Contrato') || ': chegada em até ' || v_c.sla_chegada_min || ' min.',
      jsonb_build_object('sla_min', v_c.sla_chegada_min), null, null, 'sistema');
    for v_u in select * from public.sos_usuarios_central() loop
      perform public.sos_notificar(v_u, '⏰ Prazo de contrato estourado · ' || v_c.protocolo,
        v_c.cliente || ' · ' || coalesce(v_c.contrato, 'contrato') || ' (' || v_c.sla_chegada_min || ' min)', '/sos?chamado=' || v_c.id);
    end loop;
    n_sla := n_sla + 1;
  end loop;

  return jsonb_build_object('ok', true, 'espera', n_espera, 'devolvidos', n_devolv, 'atrasos', n_atraso,
                            'sem_sinal', n_sinal, 'concluidos', n_concl, 'offline', n_off, 'sla', n_sla);
end;
$$;

-- Monitor do vigia: última execução e falhas recentes (pg_cron).
create or replace function public.sos_vigia_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v jsonb;
begin
  if not public.sos_eh_equipe() then return jsonb_build_object('ok', false); end if;
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    return jsonb_build_object('ok', true, 'agendado', false);
  end if;
  execute $q$
    select jsonb_build_object(
      'ok', true,
      'agendado', exists (select 1 from cron.job where jobname = 'sos_vigiar' and active),
      'agenda', (select schedule from cron.job where jobname = 'sos_vigiar'),
      'ultima', (select jsonb_build_object('inicio', d.start_time, 'fim', d.end_time, 'status', d.status, 'mensagem', left(d.return_message, 300))
                 from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                 where j.jobname = 'sos_vigiar' order by d.start_time desc limit 1),
      'falhas_1h', (select count(*) from cron.job_run_details d join cron.job j on j.jobid = d.jobid
                    where j.jobname = 'sos_vigiar' and d.status = 'failed' and d.start_time > now() - interval '1 hour'))
  $q$ into v;
  return v;
end;
$$;

-- ============================================================== relatório (mapa de calor e prazo)
create or replace function public.sos_relatorio(p_inicio timestamptz, p_fim timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cfg as (select tempo_aceite_seg from public.sos_config where singleton),
  c as (select * from public.sos_chamados where recebido_em >= p_inicio and recebido_em < p_fim),
  it as (select i.* from public.sos_itens i join c on c.id = i.chamado_id)
  select case when not public.sos_eh_equipe() then jsonb_build_object('ok', false) else jsonb_build_object(
    'ok', true,
    'inicio', p_inicio, 'fim', p_fim,
    'total', (select count(*) from c),
    'concluidos', (select count(*) from c where status in ('servico_finalizado', 'concluido')),
    'cancelados', (select count(*) from c where status = 'cancelado'),
    'em_aberto', (select count(*) from c where status not in ('servico_finalizado', 'concluido', 'cancelado')),
    'emergencias', (select count(*) from c where prioridade = 'emergencia'),
    'os_geradas', (select count(*) from c where os_id is not null),
    'valor_itens', (select coalesce(sum(valor_total), 0) from it),
    'valor_deslocamento', (select coalesce(sum(valor_total), 0) from it where origem = 'deslocamento'),
    'orcamentos', jsonb_build_object(
      'enviados', (select count(*) from c where orcamento_status is not null),
      'aprovados', (select count(*) from c where orcamento_status = 'aprovado'),
      'recusados', (select count(*) from c where orcamento_status = 'recusado')),
    'sla', jsonb_build_object(
      'com_prazo', (select count(*) from c where sla_chegada_min is not null and chegou_em is not null),
      'no_prazo', (select count(*) from c where sla_chegada_min is not null and chegou_em is not null
                   and chegou_em <= recebido_em + make_interval(mins => sla_chegada_min))),
    'aceite_no_prazo_pct', (select round(100.0 * count(*) filter (where c.tempo_aceite_seg <= cfg.tempo_aceite_seg)
                                         / nullif(count(*) filter (where c.tempo_aceite_seg is not null), 0), 1)
                            from c cross join cfg),
    'tempo_medio_aceite_seg', (select round(avg(tempo_aceite_seg)) from c),
    'tempo_medio_deslocamento_seg', (select round(avg(tempo_deslocamento_seg)) from c),
    'tempo_medio_servico_seg', (select round(avg(tempo_servico_seg)) from c),
    'tempo_medio_total_seg', (select round(avg(tempo_total_seg)) from c),
    'nota_media', (select round(avg(avaliacao_nota), 2) from c),
    'avaliacoes', (select count(avaliacao_nota) from c),
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'total', n, 'concluidos', ok) order by dia), '[]'::jsonb) from (
                  select (recebido_em at time zone 'America/Sao_Paulo')::date as dia, count(*) n,
                         count(*) filter (where status in ('servico_finalizado', 'concluido')) ok
                  from c group by 1) t),
    'por_hora', (select coalesce(jsonb_object_agg(h, n), '{}'::jsonb) from (
                  select extract(hour from recebido_em at time zone 'America/Sao_Paulo')::int h, count(*) n from c group by 1) t),
    'por_ocorrencia', (select coalesce(jsonb_object_agg(tipo_ocorrencia, n), '{}'::jsonb) from (
                  select tipo_ocorrencia, count(*) n from c group by 1) t),
    'por_origem', (select coalesce(jsonb_object_agg(origem, n), '{}'::jsonb) from (select origem, count(*) n from c group by 1) t),
    'por_mecanico', (select coalesce(jsonb_agg(x order by (x->>'atendimentos')::int desc), '[]'::jsonb) from (
                  select jsonb_build_object(
                    'mecanico_id', c.mecanico_id, 'nome', u.nome_completo,
                    'atendimentos', count(*),
                    'concluidos', count(*) filter (where c.status in ('servico_finalizado', 'concluido')),
                    'cancelados', count(*) filter (where c.status = 'cancelado'),
                    'tempo_medio_aceite_seg', round(avg(c.tempo_aceite_seg)),
                    'tempo_medio_deslocamento_seg', round(avg(c.tempo_deslocamento_seg)),
                    'tempo_medio_servico_seg', round(avg(c.tempo_servico_seg)),
                    'nota_media', round(avg(c.avaliacao_nota), 2),
                    'recusas', (select count(*) from public.sos_recusas r where r.mecanico_id = c.mecanico_id
                                 and r.created_at >= p_inicio and r.created_at < p_fim),
                    'valor_itens', (select coalesce(sum(i.valor_total), 0) from it i join c c2 on c2.id = i.chamado_id where c2.mecanico_id = c.mecanico_id)
                  ) as x
                  from c join public.usuarios u on u.id = c.mecanico_id
                  group by c.mecanico_id, u.nome_completo) t),
    'por_cliente', (select coalesce(jsonb_agg(x order by (x->>'chamados')::int desc), '[]'::jsonb) from (
                  select jsonb_build_object(
                    'cliente_id', c.cliente_id, 'nome', cl.nome_razao, 'chamados', count(*),
                    'valor_itens', (select coalesce(sum(i.valor_total), 0) from it i join c c2 on c2.id = i.chamado_id where c2.cliente_id = c.cliente_id)
                  ) as x
                  from c join public.clientes cl on cl.id = c.cliente_id
                  group by c.cliente_id, cl.nome_razao
                  order by count(*) desc limit 15) t),
    'itens', (select coalesce(jsonb_agg(x order by (x->>'valor_total')::numeric desc), '[]'::jsonb) from (
                  select jsonb_build_object(
                    'tipo', tipo, 'produto_id', produto_id, 'servico_id', servico_id, 'codigo', max(codigo),
                    'descricao', max(descricao), 'quantidade', sum(quantidade), 'valor_total', sum(valor_total),
                    'chamados', count(distinct chamado_id)
                  ) as x
                  from it group by tipo, produto_id, servico_id, coalesce(produto_id, servico_id)::text || descricao
                  order by sum(valor_total) desc limit 40) t),
    'motivos_cancelamento', (select coalesce(jsonb_agg(jsonb_build_object('motivo', motivo, 'papel', papel, 'n', n) order by n desc), '[]'::jsonb) from (
                  select coalesce(nullif(trim(motivo_cancelamento), ''), 'Sem motivo') motivo, cancelado_por_papel papel, count(*) n
                  from c where status = 'cancelado' group by 1, 2 order by 3 desc limit 10) t),
    -- Mapa de calor: onde os caminhões param (≈1 km de precisão, sem expor ponto exato).
    'pontos', (select coalesce(jsonb_agg(jsonb_build_object('lat', la, 'lng', lo, 'n', n, 'emergencias', e) order by n desc), '[]'::jsonb) from (
                  select round(latitude::numeric, 2) la, round(longitude::numeric, 2) lo, count(*) n,
                         count(*) filter (where prioridade = 'emergencia') e
                  from c where latitude is not null and longitude is not null
                  group by 1, 2 order by 3 desc limit 500) t)
  ) end
$$;

-- ============================================================== configuração (com IA e premium)
create or replace function public.sos_salvar_config(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, privado, pg_temp
as $$
begin
  if not public.tem_permissao('sos', 'configurar') then raise exception 'Sem permissão.'; end if;
  update public.sos_config
  set modo_distribuicao = coalesce(p->>'modo_distribuicao', modo_distribuicao),
      raio_busca_km = coalesce((p->>'raio_busca_km')::numeric, raio_busca_km),
      velocidade_media_kmh = coalesce((p->>'velocidade_media_kmh')::numeric, velocidade_media_kmh),
      tempo_aceite_seg = coalesce((p->>'tempo_aceite_seg')::int, tempo_aceite_seg),
      telefone_central = case when p ? 'telefone_central' then nullif(p->>'telefone_central', '') else telefone_central end,
      whatsapp_ativo = coalesce((p->>'whatsapp_ativo')::boolean, whatsapp_ativo),
      whatsapp_url = case when p ? 'whatsapp_url' then nullif(p->>'whatsapp_url', '') else whatsapp_url end,
      whatsapp_instancia = case when p ? 'whatsapp_instancia' then nullif(p->>'whatsapp_instancia', '') else whatsapp_instancia end,
      whatsapp_destinos = case when p ? 'whatsapp_destinos' then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p->'whatsapp_destinos') x) else whatsapp_destinos end,
      mensagem_espera = coalesce(nullif(p->>'mensagem_espera', ''), mensagem_espera),
      lembrete_meses = coalesce((p->>'lembrete_meses')::int, lembrete_meses),
      lembrete_km = coalesce((p->>'lembrete_km')::int, lembrete_km),
      cancelamento_cliente_ate = coalesce(nullif(p->>'cancelamento_cliente_ate', '')::public.sos_status, cancelamento_cliente_ate),
      gerar_os_ao_finalizar = coalesce((p->>'gerar_os_ao_finalizar')::boolean, gerar_os_ao_finalizar),
      offline_apos_min = greatest(0, coalesce((p->>'offline_apos_min')::int, offline_apos_min)),
      concluir_apos_horas = greatest(1, coalesce((p->>'concluir_apos_horas')::int, concluir_apos_horas)),
      exigir_aprovacao_orcamento = coalesce((p->>'exigir_aprovacao_orcamento')::boolean, exigir_aprovacao_orcamento),
      deslocamento_ativo = coalesce((p->>'deslocamento_ativo')::boolean, deslocamento_ativo),
      deslocamento_valor_km = greatest(0, coalesce((p->>'deslocamento_valor_km')::numeric, deslocamento_valor_km)),
      deslocamento_taxa_minima = greatest(0, coalesce((p->>'deslocamento_taxa_minima')::numeric, deslocamento_taxa_minima)),
      deslocamento_ida_volta = coalesce((p->>'deslocamento_ida_volta')::boolean, deslocamento_ida_volta),
      deslocamento_servico_id = case when p ? 'deslocamento_servico_id' then nullif(p->>'deslocamento_servico_id', '')::uuid else deslocamento_servico_id end,
      ia_ativa = coalesce((p->>'ia_ativa')::boolean, ia_ativa),
      ia_provedor = coalesce(nullif(p->>'ia_provedor', ''), ia_provedor),
      ia_modelo = coalesce(nullif(trim(p->>'ia_modelo'), ''), ia_modelo),
      ia_usar_chave_tecnoar_ia = coalesce((p->>'ia_usar_chave_tecnoar_ia')::boolean, ia_usar_chave_tecnoar_ia),
      ia_instrucoes = case when p ? 'ia_instrucoes' then nullif(trim(p->>'ia_instrucoes'), '') else ia_instrucoes end,
      ia_atendimento = coalesce((p->>'ia_atendimento')::boolean, ia_atendimento),
      ia_foto = coalesce((p->>'ia_foto')::boolean, ia_foto),
      ia_kit = coalesce((p->>'ia_kit')::boolean, ia_kit),
      ia_resumo = coalesce((p->>'ia_resumo')::boolean, ia_resumo),
      ia_limite_cliente_dia = greatest(0, coalesce((p->>'ia_limite_cliente_dia')::int, ia_limite_cliente_dia)),
      atualizado_por = auth.uid(), updated_at = now()
  where singleton;
  -- Chaves nunca voltam para a tela: só entram.
  if nullif(p->>'whatsapp_apikey', '') is not null then
    insert into privado.config (chave, valor) values ('sos_whatsapp_apikey', p->>'whatsapp_apikey')
    on conflict (chave) do update set valor = excluded.valor;
  end if;
  if nullif(p->>'ia_apikey', '') is not null then
    insert into privado.config (chave, valor) values ('sos_ia_apikey', trim(p->>'ia_apikey'))
    on conflict (chave) do update set valor = excluded.valor;
  end if;
  if coalesce((p->>'ia_remover_chave')::boolean, false) then
    delete from privado.config where chave = 'sos_ia_apikey';
  end if;
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.config', 'sos_config', '00000000-0000-0000-0000-000000000000'::uuid, p - 'whatsapp_apikey' - 'ia_apikey');
  return public.sos_config_atual();
end;
$$;

create or replace function public.sos_config_atual()
returns jsonb
language sql
stable
security definer
set search_path = public, privado, pg_temp
as $$
  select case when not public.sos_eh_equipe() then null else
    to_jsonb(c) || jsonb_build_object(
      'whatsapp_apikey_definida', exists (select 1 from privado.config where chave = 'sos_whatsapp_apikey'),
      'ia_apikey_definida', exists (select 1 from privado.config where chave = 'sos_ia_apikey'),
      -- A Tecnoar IA (base técnica dos colaboradores) já tem chave deste provedor?
      'tecnoar_ia_provedores', coalesce((select jsonb_agg(jsonb_build_object('provedor', i.provedor, 'modelo', i.ambiente, 'conectada', i.status::text = 'conectada'))
                                          from public.integracoes i where i.provedor in ('anthropic', 'openai', 'gemini') and i.app_key is not null), '[]'::jsonb),
      'ia_uso_30d', (select jsonb_build_object(
                        'respostas', count(*) filter (where papel = 'assistente' and erro is null),
                        'erros', count(*) filter (where erro is not null),
                        'tokens_entrada', coalesce(sum(tokens_entrada), 0),
                        'tokens_saida', coalesce(sum(tokens_saida), 0))
                     from public.sos_ia_mensagens where created_at > now() - interval '30 days'))
  end from public.sos_config c where c.singleton
$$;

-- ============================================================== IA
-- O que qualquer conta logada pode saber: se a IA está ligada e para quê.
create or replace function public.sos_ia_publico()
returns jsonb
language sql
stable
security definer
set search_path = public, privado, pg_temp
as $$
  select jsonb_build_object(
    'ativa', c.ia_ativa and (
      exists (select 1 from privado.config where chave = 'sos_ia_apikey')
      or (c.ia_usar_chave_tecnoar_ia and exists (select 1 from public.integracoes i where i.provedor = c.ia_provedor and i.app_key is not null))),
    'atendimento', c.ia_atendimento, 'foto', c.ia_foto, 'kit', c.ia_kit, 'resumo', c.ia_resumo)
  from public.sos_config c where c.singleton
$$;

-- Só para a função `sos-ia` (chave de serviço): provedor, modelo e chave.
create or replace function public.sos_ia_credencial()
returns jsonb
language sql
stable
security definer
set search_path = public, privado, pg_temp
as $$
  select jsonb_build_object(
    'ativa', c.ia_ativa, 'provedor', c.ia_provedor,
    -- O modelo é escolhido na tela (ao reaproveitar a chave da Tecnoar IA, a
    -- tela já traz o modelo de lá).
    'modelo', coalesce(nullif(c.ia_modelo, ''), (select ambiente from public.integracoes where provedor = c.ia_provedor)),
    'chave', coalesce((select valor from privado.config where chave = 'sos_ia_apikey'),
                      case when c.ia_usar_chave_tecnoar_ia then (select app_key from public.integracoes where provedor = c.ia_provedor) end),
    'instrucoes', c.ia_instrucoes,
    'atendimento', c.ia_atendimento, 'foto', c.ia_foto, 'kit', c.ia_kit, 'resumo', c.ia_resumo,
    'limite_cliente_dia', c.ia_limite_cliente_dia,
    'telefone_central', coalesce(c.telefone_central, (select coalesce(suporte_telefone, celular, telefone) from public.dados_empresa where singleton)))
  from public.sos_config c where c.singleton
$$;

-- ============================================================== LGPD
-- O cliente apaga a própria conta do app. O histórico de serviço da empresa
-- (chamados, OS, cadastro do cliente no Checklist) continua — é registro da
-- prestação do serviço —, mas sem vínculo com a conta, sem rastro de
-- localização e sem conversas com a IA.
create or replace function public.sos_excluir_minha_conta(p_confirmacao text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.sos_eh_conta_cliente() then
    raise exception 'Só contas de cliente do app podem ser excluídas por aqui.';
  end if;
  if upper(trim(coalesce(p_confirmacao, ''))) <> 'EXCLUIR' then raise exception 'Digite EXCLUIR para confirmar.'; end if;
  if exists (select 1 from public.sos_chamados where conta_usuario_id = v_uid
             and status not in ('servico_finalizado', 'concluido', 'cancelado')) then
    raise exception 'Você tem um socorro em andamento. Conclua ou cancele antes de excluir a conta.';
  end if;
  -- Localização é o dado mais sensível: sai já, sem esperar os 30 dias.
  delete from public.sos_posicoes where autor_id = v_uid;
  update public.sos_compartilhamentos set revogado_em = now() where criado_por = v_uid and revogado_em is null;
  delete from public.sos_contatos_emergencia where usuario_id = v_uid;
  delete from public.sos_ia_mensagens where usuario_id = v_uid;
  delete from public.sos_contas_cliente where usuario_id = v_uid;
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (null, 'sos.conta_excluida', 'auth.users', v_uid, '{}'::jsonb);
  delete from auth.users where id = v_uid;
end;
$$;

-- ============================================================== RLS
alter table public.sos_contratos    enable row level security;
alter table public.sos_ia_mensagens enable row level security;

drop policy if exists sos_contratos_ler on public.sos_contratos;
create policy sos_contratos_ler on public.sos_contratos
  for select to authenticated using ((select public.sos_eh_equipe()));

drop policy if exists sos_ia_mensagens_ler on public.sos_ia_mensagens;
create policy sos_ia_mensagens_ler on public.sos_ia_mensagens
  for select to authenticated using (usuario_id = (select auth.uid()) or (select public.sos_eh_equipe()));

-- ============================================================== grants
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like 'sos\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    execute format('grant execute on function %s to authenticated, service_role', f.assinatura);
  end loop;
end $$;

revoke execute on function public.sos_limpar_posicoes(), public.sos_avisar_whatsapp(uuid, text),
  public.sos_vigiar(), public.sos_avisar_mecanicos(uuid, text, text, uuid), public.sos_texto_duracao(integer),
  public.sos_ignorar_conta_cliente(), public.sos_mecanicos_antes(),
  public.sos_chamados_antes(), public.sos_chamados_depois(), public.sos_mensagens_depois(),
  public.sos_sincronizar_itens_os(uuid), public.sos_registrar_evento(uuid, text, text, text, jsonb, double precision, double precision, public.sos_papel),
  public.sos_notificar(uuid, text, text, text), public.sos_garantir_veiculo(uuid, text, text, text), public.sos_usuarios_central(),
  public.sos_nome_conta(uuid), public.sos_lancar_deslocamento(), public.sos_itens_orcamento(),
  public.sos_contrato_vigente(uuid), public.sos_ia_credencial()
  from authenticated;

grant execute on function public.sos_acompanhar(text), public.sos_info_publica(),
  public.sos_rotulo_status(public.sos_status), public.sos_rotulo_ocorrencia(public.sos_tipo_ocorrencia) to anon;;
