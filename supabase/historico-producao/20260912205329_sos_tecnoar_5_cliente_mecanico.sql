-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260912205329.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- SOS Tecnoar (parte 5/8): RPCs do cliente e do mecânico.

-- ============================================================== RPCs — cliente
create or replace function public.sos_home_cliente()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cli   uuid := public.sos_cliente_atual();
  v_conta public.sos_contas_cliente;
  v_vei   record;
  v_os    record;
  v_lemb  record;
begin
  if v_cli is null then return jsonb_build_object('ok', false); end if;
  select * into v_conta from public.sos_contas_cliente where usuario_id = auth.uid();

  select v.id, v.placa, v.marca, v.modelo, v.ano, v.km_atual, v.descricao, v.tipo
    into v_vei
  from public.veiculos v
  where v.cliente_id = v_cli and v.situacao = 'ativo'
  order by (v.id = v_conta.veiculo_principal_id) desc nulls last, v.updated_at desc limit 1;

  select o.id, o.numero, o.encerrada_em, o.aberta_em, o.km,
         (select string_agg(s.descricao, ', ') from public.os_servicos s where s.os_id = o.id and s.situacao = 'ativo') as servicos,
         (select nome from public.status_os where id = o.status_id) as status
    into v_os
  from public.ordens_servico o
  where o.cliente_id = v_cli and o.situacao = 'ativo' and (v_vei.id is null or o.veiculo_id = v_vei.id)
  order by coalesce(o.encerrada_em, o.aberta_em) desc limit 1;

  select l.id, l.titulo, l.mensagem, l.vence_em, l.vence_km into v_lemb from public.sos_lembretes l
  where l.cliente_id = v_cli and l.dispensado_em is null and (v_vei.id is null or l.veiculo_id = v_vei.id)
  order by l.vence_em nulls last limit 1;

  return jsonb_build_object(
    'ok', true,
    'nome', v_conta.nome,
    'veiculo', case when v_vei.id is null then null else to_jsonb(v_vei) end,
    'total_veiculos', (select count(*) from public.veiculos where cliente_id = v_cli and situacao = 'ativo'),
    'ultimo_servico', case when v_os.id is null then null else jsonb_build_object(
      'os_id', v_os.id, 'numero', v_os.numero, 'em', coalesce(v_os.encerrada_em, v_os.aberta_em), 'km', v_os.km,
      'servicos', v_os.servicos, 'status', v_os.status, 'encerrada', v_os.encerrada_em is not null) end,
    'veiculo_na_oficina', exists (select 1 from public.ordens_servico o where o.cliente_id = v_cli and o.situacao = 'ativo'
                                  and o.encerrada_em is null and (v_vei.id is null or o.veiculo_id = v_vei.id)),
    'proxima_revisao', case when v_lemb.titulo is null then null else to_jsonb(v_lemb) end,
    'chamado_ativo', (select to_jsonb(c) from public.sos_chamados c
                      where c.cliente_id = v_cli and c.status not in ('servico_finalizado', 'concluido', 'cancelado')
                      order by c.recebido_em desc limit 1),
    'pendente_avaliacao', (select to_jsonb(c) from public.sos_chamados c
                      where c.cliente_id = v_cli and c.status = 'servico_finalizado' and c.avaliado_em is null
                      order by c.finalizado_em desc limit 1),
    'agendamentos_abertos', (select count(*) from public.sos_agendamentos where cliente_id = v_cli and status in ('solicitado', 'confirmado')),
    'lembretes', (select count(*) from public.sos_lembretes where cliente_id = v_cli and dispensado_em is null and lido_em is null)
  );
end;
$$;

-- Histórico de serviços do cliente (OS + SOS), com nome do mecânico sem
-- expor a tabela `usuarios`.
create or replace function public.sos_historico_cliente(p_veiculo uuid default null, p_limite integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cli as (select public.sos_cliente_atual() as id),
  os as (
    select jsonb_build_object(
      'tipo', 'os', 'id', o.id, 'numero', o.numero, 'em', coalesce(o.encerrada_em, o.aberta_em),
      'veiculo_id', o.veiculo_id, 'placa', v.placa, 'veiculo', concat_ws(' ', v.marca, v.modelo),
      'km', o.km, 'problema', o.problema_alegado, 'diagnostico', o.diagnostico,
      'status', s.nome, 'status_cor', s.cor, 'encerrada', o.encerrada_em is not null,
      'valor_total', o.valor_total,
      'servicos', (select jsonb_agg(jsonb_build_object('descricao', x.descricao, 'quantidade', x.quantidade, 'valor', x.valor_total) order by x.ordem)
                   from public.os_servicos x where x.os_id = o.id and x.situacao = 'ativo'),
      'produtos', (select jsonb_agg(jsonb_build_object('descricao', x.descricao, 'quantidade', x.quantidade, 'valor', x.valor_total) order by x.ordem)
                   from public.os_produtos x where x.os_id = o.id and x.situacao = 'ativo'),
      'mecanicos', (select string_agg(u.nome_completo, ', ') from public.os_mecanicos m join public.usuarios u on u.id = m.usuario_id where m.os_id = o.id),
      'sos_protocolo', (select c.protocolo from public.sos_chamados c where c.os_id = o.id limit 1),
      'sos_id', (select c.id from public.sos_chamados c where c.os_id = o.id limit 1)
    ) as item, coalesce(o.encerrada_em, o.aberta_em) as em
    from public.ordens_servico o
    join cli on o.cliente_id = cli.id
    left join public.veiculos v on v.id = o.veiculo_id
    left join public.status_os s on s.id = o.status_id
    where o.situacao = 'ativo' and o.tipo = 'os' and (p_veiculo is null or o.veiculo_id = p_veiculo)
  ),
  sos as (
    select jsonb_build_object(
      'tipo', 'sos', 'id', c.id, 'protocolo', c.protocolo, 'em', c.recebido_em, 'status', c.status,
      'status_rotulo', public.sos_rotulo_status(c.status),
      'veiculo_id', c.veiculo_id, 'placa', v.placa, 'veiculo', concat_ws(' ', v.marca, v.modelo),
      'ocorrencia', c.tipo_ocorrencia, 'ocorrencia_rotulo', public.sos_rotulo_ocorrencia(c.tipo_ocorrencia),
      'diagnostico', c.diagnostico, 'servico', c.servico_realizado,
      'mecanico', (select nome_completo from public.usuarios where id = c.mecanico_id), 'os_id', c.os_id,
      'nota', c.avaliacao_nota
    ) as item, c.recebido_em as em
    from public.sos_chamados c
    join cli on c.cliente_id = cli.id
    left join public.veiculos v on v.id = c.veiculo_id
    where c.os_id is null and (p_veiculo is null or c.veiculo_id = p_veiculo)
  )
  select coalesce(jsonb_agg(item order by em desc), '[]'::jsonb)
  from (select * from (select * from os union all select * from sos) u order by em desc limit p_limite) t
$$;

-- Chamados do cliente (ativos e anteriores), com o essencial para a lista.
create or replace function public.sos_meus_chamados(p_limite integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x order by (x->>'recebido_em') desc), '[]'::jsonb) from (
    select to_jsonb(c) || jsonb_build_object(
      'placa', v.placa, 'veiculo', concat_ws(' ', v.marca, v.modelo),
      'status_rotulo', public.sos_rotulo_status(c.status),
      'ocorrencia_rotulo', public.sos_rotulo_ocorrencia(c.tipo_ocorrencia),
      'mecanico_nome', (select nome_completo from public.usuarios where id = c.mecanico_id)
    ) as x
    from public.sos_chamados c
    left join public.veiculos v on v.id = c.veiculo_id
    where c.conta_usuario_id = auth.uid() or c.cliente_id = public.sos_cliente_atual()
    order by c.recebido_em desc
    limit least(greatest(p_limite, 1), 200)
  ) t
$$;

-- Tudo que a tela de um chamado precisa, numa ida só — para cliente,
-- mecânico e central. Cada um vê o que lhe cabe (o telefone do mecânico só
-- se ele liberou; o do cliente só para quem atende).
create or replace function public.sos_detalhe_chamado(p_chamado uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_c     public.sos_chamados;
  v_eh_cliente boolean;
  v_mec   record;
begin
  if not public.sos_pode_ver_chamado(p_chamado) then raise exception 'Sem acesso ao chamado.'; end if;
  select * into v_c from public.sos_chamados where id = p_chamado;
  v_eh_cliente := v_c.conta_usuario_id = auth.uid()
                  or (v_c.cliente_id = public.sos_cliente_atual() and not public.sos_eh_equipe() and v_c.mecanico_id is distinct from auth.uid());

  select u.id, u.nome_completo, u.avatar_url, m.latitude, m.longitude, m.posicao_em, m.veiculo_apoio,
         case when m.mostrar_telefone or not v_eh_cliente then coalesce(m.telefone_contato, u.telefone) end as telefone,
         (select round(avg(x.avaliacao_nota), 1) from public.sos_chamados x where x.mecanico_id = u.id and x.avaliacao_nota is not null) as nota,
         (select count(*) from public.sos_chamados x where x.mecanico_id = u.id and x.status = 'concluido') as atendimentos
    into v_mec
  from public.usuarios u left join public.sos_mecanicos m on m.usuario_id = u.id
  where u.id = v_c.mecanico_id;

  return jsonb_build_object(
    'chamado', to_jsonb(v_c) || jsonb_build_object(
      'status_rotulo', public.sos_rotulo_status(v_c.status),
      'ocorrencia_rotulo', public.sos_rotulo_ocorrencia(v_c.tipo_ocorrencia)),
    'papel', case when v_c.mecanico_id = auth.uid() then 'mecanico'
                  when v_eh_cliente then 'cliente'
                  when public.sos_eh_equipe() then 'central'
                  else 'mecanico_candidato' end,
    'cliente', (select jsonb_build_object('id', cl.id, 'nome', cl.nome_razao,
                  'telefone', case when v_eh_cliente or public.sos_eh_equipe() or v_c.mecanico_id = auth.uid()
                                   then coalesce(v_c.telefone_contato, cl.celular, cl.telefone) end)
                from public.clientes cl where cl.id = v_c.cliente_id),
    'veiculo', (select jsonb_build_object('id', v.id, 'placa', v.placa, 'marca', v.marca, 'modelo', v.modelo,
                  'ano', v.ano, 'descricao', v.descricao, 'tipo', v.tipo, 'km_atual', v.km_atual)
                from public.veiculos v where v.id = v_c.veiculo_id),
    'mecanico', case when v_mec.id is null then null else jsonb_build_object(
                  'id', v_mec.id,
                  'nome', case when v_eh_cliente then split_part(v_mec.nome_completo, ' ', 1) || coalesce(' ' || nullif(split_part(v_mec.nome_completo, ' ', 2), ''), '') else v_mec.nome_completo end,
                  'avatar_url', v_mec.avatar_url, 'telefone', v_mec.telefone, 'veiculo_apoio', v_mec.veiculo_apoio,
                  'latitude', v_mec.latitude, 'longitude', v_mec.longitude, 'posicao_em', v_mec.posicao_em,
                  'nota', v_mec.nota, 'atendimentos', v_mec.atendimentos) end,
    'os', (select jsonb_build_object('id', o.id, 'numero', o.numero, 'status', s.nome, 'status_cor', s.cor, 'valor_total', o.valor_total, 'encerrada_em', o.encerrada_em)
           from public.ordens_servico o left join public.status_os s on s.id = o.status_id where o.id = v_c.os_id),
    'eventos', (select coalesce(jsonb_agg(to_jsonb(e) order by e.ocorrido_em), '[]'::jsonb) from public.sos_eventos e where e.chamado_id = p_chamado),
    'itens', (select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at), '[]'::jsonb) from public.sos_itens i where i.chamado_id = p_chamado),
    'anexos', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at), '[]'::jsonb) from public.sos_anexos a where a.chamado_id = p_chamado),
    'mensagens', (select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb) from public.sos_mensagens m where m.chamado_id = p_chamado),
    'ultima_posicao_mecanico', (select to_jsonb(p) from public.sos_posicoes p where p.chamado_id = p_chamado and p.papel = 'mecanico' order by p.registrado_em desc limit 1),
    'ultima_posicao_cliente', (select to_jsonb(p) from public.sos_posicoes p where p.chamado_id = p_chamado and p.papel = 'cliente' order by p.registrado_em desc limit 1)
  );
end;
$$;

create or replace function public.sos_solicitar_agendamento(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cli uuid := public.sos_cliente_atual(); v_id uuid; v_u uuid;
begin
  if v_cli is null then
    if public.sos_eh_equipe() then v_cli := nullif(p->>'cliente_id', '')::uuid; end if;
    if v_cli is null then raise exception 'Conclua seu cadastro primeiro.'; end if;
  end if;
  insert into public.sos_agendamentos (cliente_id, veiculo_id, conta_usuario_id, tipo, descricao, data_preferida, periodo)
  values (v_cli, nullif(p->>'veiculo_id', '')::uuid, auth.uid(),
    coalesce(nullif(p->>'tipo', '')::public.sos_tipo_agendamento, 'revisao'),
    nullif(trim(p->>'descricao'), ''), nullif(p->>'data_preferida', '')::date, coalesce(nullif(p->>'periodo', ''), 'qualquer'))
  returning id into v_id;
  for v_u in select * from public.sos_usuarios_central() loop
    perform public.sos_notificar(v_u, 'Pedido de agendamento',
      (select nome_razao from public.clientes where id = v_cli) || ' · ' || coalesce(p->>'tipo', 'revisão'), '/sos/agendamentos');
  end loop;
  return v_id;
end;
$$;

create or replace function public.sos_atualizar_agendamento(
  p_id uuid, p_status public.sos_status_agendamento, p_data_confirmada timestamptz default null,
  p_observacoes text default null, p_os uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_a public.sos_agendamentos;
begin
  select * into v_a from public.sos_agendamentos where id = p_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  if public.sos_eh_equipe() then
    if not public.tem_permissao('sos', 'editar') then raise exception 'Sem permissão.'; end if;
    update public.sos_agendamentos
    set status = p_status, data_confirmada = coalesce(p_data_confirmada, data_confirmada),
        observacoes_equipe = coalesce(p_observacoes, observacoes_equipe), os_id = coalesce(p_os, os_id),
        atendido_por = auth.uid(), updated_at = now()
    where id = p_id;
    perform public.sos_notificar(v_a.conta_usuario_id,
      case p_status when 'confirmado' then 'Revisão confirmada' when 'cancelado' then 'Agendamento cancelado'
                    when 'realizado' then 'Revisão realizada' else 'Agendamento atualizado' end,
      coalesce(p_observacoes, to_char(p_data_confirmada at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')),
      '/app/revisoes');
  elsif v_a.conta_usuario_id = auth.uid() and p_status = 'cancelado' then
    update public.sos_agendamentos set status = 'cancelado', updated_at = now() where id = p_id;
  else
    raise exception 'Sem permissão.';
  end if;
end;
$$;

-- Lembretes de manutenção a partir das OS: tempo desde a última OS encerrada
-- e km rodado desde então. Roda todo dia (pg_cron) ou pelo botão da central.
create or replace function public.sos_gerar_lembretes()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cfg public.sos_config; v_n integer := 0; r record; v_inicio timestamptz := now();
begin
  select * into v_cfg from public.sos_config where singleton;
  for r in
    select v.id as veiculo_id, v.cliente_id, v.placa, v.km_atual, o.id as os_id, o.encerrada_em, o.km as km_os
    from public.veiculos v
    join lateral (
      select o.id, o.encerrada_em, o.km from public.ordens_servico o
      where o.veiculo_id = v.id and o.situacao = 'ativo' and o.encerrada_em is not null
      order by o.encerrada_em desc limit 1
    ) o on true
    where v.situacao = 'ativo' and v.cliente_id is not null
      and exists (select 1 from public.sos_contas_cliente c where c.cliente_id = v.cliente_id)
  loop
    if r.encerrada_em < now() - make_interval(months => v_cfg.lembrete_meses) then
      insert into public.sos_lembretes (cliente_id, veiculo_id, chave, tipo, titulo, mensagem, vence_em, origem_os_id)
      values (r.cliente_id, r.veiculo_id, 'tempo:' || r.os_id, 'tempo',
        'Hora de revisar o ' || r.placa,
        'Faz mais de ' || v_cfg.lembrete_meses || ' meses desde o último serviço na Tecnoar. Agende uma revisão.',
        (r.encerrada_em + make_interval(months => v_cfg.lembrete_meses))::date, r.os_id)
      on conflict (chave) do nothing;
      if found then v_n := v_n + 1; end if;
    end if;
    if r.km_os is not null and r.km_atual is not null and r.km_atual - r.km_os >= v_cfg.lembrete_km then
      insert into public.sos_lembretes (cliente_id, veiculo_id, chave, tipo, titulo, mensagem, vence_km, origem_os_id)
      values (r.cliente_id, r.veiculo_id, 'km:' || r.os_id, 'km',
        'Revisão por quilometragem: ' || r.placa,
        'Seu veículo rodou ' || (r.km_atual - r.km_os) || ' km desde o último serviço. Vale uma revisão dos freios.',
        r.km_os + v_cfg.lembrete_km, r.os_id)
      on conflict (chave) do nothing;
      if found then v_n := v_n + 1; end if;
    end if;
  end loop;
  -- Avisa quem ganhou lembrete novo nesta rodada.
  for r in
    select l.id, l.titulo, l.mensagem, c.usuario_id from public.sos_lembretes l
    join public.sos_contas_cliente c on c.cliente_id = l.cliente_id
    where l.created_at >= v_inicio
  loop
    perform public.sos_notificar(r.usuario_id, r.titulo, r.mensagem, '/app/revisoes');
  end loop;
  return v_n;
end;
$$;

create or replace function public.sos_marcar_lembrete(p_id uuid, p_dispensar boolean default false)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.sos_lembretes
  set lido_em = coalesce(lido_em, now()), dispensado_em = case when p_dispensar then now() else dispensado_em end
  where id = p_id and cliente_id = public.sos_cliente_atual()
$$;

-- ============================================================== RPCs — mecânico
-- Painel do mecânico: situação, chamado atual, chamados aguardando e o dia.
create or replace function public.sos_home_mecanico()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_m public.sos_mecanicos; v_hoje timestamptz;
begin
  if not public.sos_eh_mecanico() then return jsonb_build_object('ok', false); end if;
  select * into v_m from public.sos_mecanicos where usuario_id = auth.uid();
  v_hoje := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  return jsonb_build_object(
    'ok', true,
    'nome', (select nome_completo from public.usuarios where id = auth.uid()),
    'ficha', to_jsonb(v_m),
    'chamado_atual', (select to_jsonb(c) || jsonb_build_object(
                         'status_rotulo', public.sos_rotulo_status(c.status),
                         'ocorrencia_rotulo', public.sos_rotulo_ocorrencia(c.tipo_ocorrencia),
                         'cliente_nome', (select nome_razao from public.clientes where id = c.cliente_id),
                         'placa', (select placa from public.veiculos where id = c.veiculo_id))
                       from public.sos_chamados c
                       where c.mecanico_id = auth.uid() and c.status not in ('servico_finalizado', 'concluido', 'cancelado')
                       order by c.recebido_em desc limit 1),
    'aguardando', (select coalesce(jsonb_agg(x order by (x->>'recebido_em')), '[]'::jsonb) from (
                     select to_jsonb(c) || jsonb_build_object(
                       'ocorrencia_rotulo', public.sos_rotulo_ocorrencia(c.tipo_ocorrencia),
                       'cliente_nome', (select nome_razao from public.clientes where id = c.cliente_id),
                       'placa', (select placa from public.veiculos where id = c.veiculo_id),
                       'veiculo', (select concat_ws(' ', marca, modelo) from public.veiculos where id = c.veiculo_id),
                       'distancia_km', public.sos_distancia_km(v_m.latitude, v_m.longitude, c.latitude, c.longitude),
                       'para_mim', c.mecanico_id = auth.uid(),
                       'recusei', exists (select 1 from public.sos_recusas r where r.chamado_id = c.id and r.mecanico_id = auth.uid())) as x
                     from public.sos_chamados c
                     where c.status in ('recebido', 'procurando_mecanico')
                       and (c.mecanico_id is null or c.mecanico_id = auth.uid())) t),
    'hoje', jsonb_build_object(
      'atendimentos', (select count(*) from public.sos_chamados where mecanico_id = auth.uid() and recebido_em >= v_hoje),
      'concluidos', (select count(*) from public.sos_chamados where mecanico_id = auth.uid() and status in ('servico_finalizado', 'concluido') and finalizado_em >= v_hoje),
      'nota_media', (select round(avg(avaliacao_nota), 1) from public.sos_chamados where mecanico_id = auth.uid() and avaliacao_nota is not null)
    ),
    'historico', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                    select jsonb_build_object('id', c.id, 'protocolo', c.protocolo, 'status', c.status,
                      'status_rotulo', public.sos_rotulo_status(c.status),
                      'ocorrencia_rotulo', public.sos_rotulo_ocorrencia(c.tipo_ocorrencia),
                      'cliente_nome', (select nome_razao from public.clientes where id = c.cliente_id),
                      'placa', (select placa from public.veiculos where id = c.veiculo_id),
                      'recebido_em', c.recebido_em, 'finalizado_em', c.finalizado_em, 'nota', c.avaliacao_nota) as x
                    from public.sos_chamados c
                    where c.mecanico_id = auth.uid() and c.status in ('servico_finalizado', 'concluido', 'cancelado')
                    order by c.recebido_em desc limit 20) t)
  );
end;
$$;

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as assinatura from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.proname like 'sos\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.assinatura);
  end loop;
end $$;;
