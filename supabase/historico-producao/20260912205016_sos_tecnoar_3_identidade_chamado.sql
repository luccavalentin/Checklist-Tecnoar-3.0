-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260912205016.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- SOS Tecnoar (parte 3/8): RPCs de identidade e do chamado.

-- ============================================================== RPCs — identidade
create or replace function public.sos_meu_papel()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_u   public.usuarios;
  v_c   public.sos_contas_cliente;
  v_mec public.sos_mecanicos;
begin
  if auth.uid() is null then
    return jsonb_build_object('papel', 'anonimo');
  end if;
  select * into v_u from public.usuarios where id = auth.uid();
  if found and v_u.situacao = 'ativo' then
    select * into v_mec from public.sos_mecanicos where usuario_id = auth.uid();
    return jsonb_build_object(
      'papel', case when public.sos_eh_mecanico() then 'mecanico' else 'equipe' end,
      'central', public.sos_eh_equipe(),
      'usuario_id', v_u.id,
      'nome', v_u.nome_completo,
      'avatar_url', v_u.avatar_url,
      'telefone', v_u.telefone,
      'mecanico', case when v_mec.usuario_id is null then null else to_jsonb(v_mec) end
    );
  end if;
  if found and v_u.situacao = 'pendente' then
    return jsonb_build_object('papel', 'equipe_pendente', 'nome', v_u.nome_completo);
  end if;
  select * into v_c from public.sos_contas_cliente where usuario_id = auth.uid();
  if found then
    return jsonb_build_object(
      'papel', 'cliente',
      'usuario_id', v_c.usuario_id,
      'nome', v_c.nome,
      'telefone', v_c.telefone,
      'email', v_c.email,
      'cliente_id', v_c.cliente_id,
      'veiculo_principal_id', v_c.veiculo_principal_id,
      'aceite_termos_em', v_c.aceite_termos_em,
      'aceite_localizacao_em', v_c.aceite_localizacao_em
    );
  end if;
  return jsonb_build_object('papel', 'novo',
    'nome', (select raw_user_meta_data->>'nome_completo' from auth.users where id = auth.uid()),
    'email', (select email from auth.users where id = auth.uid()));
end;
$$;

-- Primeiro acesso do cliente: acha o cadastro pelo documento ou celular; se
-- não existe, cria. Nunca duplica.
create or replace function public.sos_registrar_conta(
  p_nome text, p_telefone text, p_documento text default null, p_email text default null,
  p_aceite_termos boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tel   text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_doc   text := nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '');
  v_cli   uuid;
  v_nome  text := nullif(trim(p_nome), '');
  v_email text := coalesce(nullif(trim(p_email), ''), (select email from auth.users where id = auth.uid()));
  v_sit   text;
begin
  if auth.uid() is null then raise exception 'Sessão necessária.'; end if;
  if v_nome is null then raise exception 'Informe seu nome.'; end if;
  if v_tel is null or length(v_tel) < 10 then raise exception 'Informe um celular com DDD.'; end if;
  if v_doc is not null and length(v_doc) not in (11, 14) then raise exception 'CPF ou CNPJ incompleto.'; end if;

  select situacao::text into v_sit from public.usuarios where id = auth.uid();
  if v_sit is not null and v_sit <> 'pendente' then
    raise exception 'Esta conta é da equipe Tecnoar. Entre como mecânico.';
  end if;
  if v_sit = 'pendente' then
    -- Pedido de acesso criado sozinho quando a conta nasceu pelo app: some.
    if coalesce((select raw_user_meta_data->>'tipo_conta' from auth.users where id = auth.uid()), '') = 'sos_cliente' then
      delete from public.usuarios where id = auth.uid() and situacao = 'pendente';
    else
      raise exception 'Esta conta tem um pedido de acesso à equipe em análise. Use outro e-mail para o app de cliente.';
    end if;
  end if;

  if v_doc is not null then
    select id into v_cli from public.clientes where documento_digitos = v_doc and situacao = 'ativo' limit 1;
  end if;
  if v_cli is null then
    -- Últimos 8 dígitos evitam diferença de DDI/9º dígito entre cadastros.
    select id into v_cli from public.clientes
    where situacao = 'ativo'
      and (right(regexp_replace(coalesce(celular, ''), '\D', '', 'g'), 8) = right(v_tel, 8)
           or right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = right(v_tel, 8))
    order by created_at limit 1;
  end if;
  if v_cli is null then
    insert into public.clientes (tipo_pessoa, nome_razao, documento, documento_digitos, celular, email, origem, notificar_whatsapp)
    values (
      (case when v_doc is not null and length(v_doc) = 14 then 'juridica' else 'fisica' end)::public.tipo_pessoa,
      v_nome, p_documento, v_doc, p_telefone, v_email, 'manual', true
    )
    returning id into v_cli;
  end if;

  insert into public.sos_contas_cliente (usuario_id, cliente_id, nome, telefone, telefone_digitos, documento_digitos, email, aceite_termos_em)
  values (auth.uid(), v_cli, v_nome, p_telefone, v_tel, v_doc, v_email, case when p_aceite_termos then now() end)
  on conflict (usuario_id) do update
    set cliente_id = coalesce(public.sos_contas_cliente.cliente_id, excluded.cliente_id),
        nome = excluded.nome, telefone = excluded.telefone, telefone_digitos = excluded.telefone_digitos,
        documento_digitos = coalesce(excluded.documento_digitos, public.sos_contas_cliente.documento_digitos),
        email = coalesce(excluded.email, public.sos_contas_cliente.email),
        aceite_termos_em = coalesce(public.sos_contas_cliente.aceite_termos_em, excluded.aceite_termos_em),
        updated_at = now();

  return public.sos_meu_papel();
end;
$$;

create or replace function public.sos_atualizar_conta(
  p_nome text default null, p_telefone text default null, p_veiculo_principal uuid default null,
  p_aceite_localizacao boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_veiculo_principal is not null and not exists (
    select 1 from public.veiculos where id = p_veiculo_principal and cliente_id = public.sos_cliente_atual()
  ) then
    raise exception 'Veículo não pertence a você.';
  end if;
  update public.sos_contas_cliente
  set nome = coalesce(nullif(trim(p_nome), ''), nome),
      telefone = coalesce(p_telefone, telefone),
      telefone_digitos = coalesce(nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), ''), telefone_digitos),
      veiculo_principal_id = coalesce(p_veiculo_principal, veiculo_principal_id),
      aceite_localizacao_em = case when p_aceite_localizacao then coalesce(aceite_localizacao_em, now())
                                   when p_aceite_localizacao = false then null else aceite_localizacao_em end,
      updated_at = now()
  where usuario_id = auth.uid();
  return public.sos_meu_papel();
end;
$$;

-- Cliente cadastra um veículo pela placa (sem duplicar a placa).
create or replace function public.sos_cadastrar_veiculo(p_placa text, p_descricao text default null, p_tipo text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cli uuid := public.sos_cliente_atual(); v_id uuid;
begin
  if v_cli is null then raise exception 'Conclua seu cadastro primeiro.'; end if;
  if length(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g')) <> 7 then
    raise exception 'Placa inválida (7 caracteres).';
  end if;
  v_id := public.sos_garantir_veiculo(v_cli, p_placa, p_descricao, p_tipo);
  update public.sos_contas_cliente set veiculo_principal_id = coalesce(veiculo_principal_id, v_id), updated_at = now()
  where usuario_id = auth.uid();
  return v_id;
end;
$$;

-- Equipe amarra uma conta do app a outro cadastro (cliente errado no primeiro acesso).
create or replace function public.sos_vincular_cliente(p_usuario uuid, p_cliente uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.tem_permissao('sos', 'editar') then raise exception 'Sem permissão.'; end if;
  update public.sos_contas_cliente set cliente_id = p_cliente, updated_at = now() where usuario_id = p_usuario;
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.vincular_cliente', 'sos_contas_cliente', p_usuario, jsonb_build_object('cliente_id', p_cliente));
end;
$$;

-- Dados que qualquer pessoa pode saber (telefone da central, nome).
create or replace function public.sos_info_publica()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'empresa', coalesce(e.nome_fantasia, e.razao_social, 'Tecnoar'),
    'telefone', coalesce(c.telefone_central, e.suporte_telefone, e.celular, e.telefone),
    'whatsapp', coalesce(e.celular, e.suporte_telefone),
    'politica_privacidade_url', e.politica_privacidade_url,
    'mensagem_espera', c.mensagem_espera,
    'cancelamento_cliente_ate', c.cancelamento_cliente_ate
  )
  from public.sos_config c
  left join public.dados_empresa e on e.singleton
  where c.singleton
$$;

-- ============================================================== RPCs — chamado
create or replace function public.sos_abrir_chamado(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_papel   public.sos_papel := public.sos_papel_atual();
  v_cli     uuid;
  v_vei     uuid := nullif(p->>'veiculo_id', '')::uuid;
  v_cfg     public.sos_config;
  v_id      uuid;
  v_status  public.sos_status;
  v_tel     text;
  v_existe  public.sos_chamados;
begin
  if auth.uid() is null then raise exception 'Sessão necessária.'; end if;
  select * into v_cfg from public.sos_config where singleton;

  if v_papel = 'central' then
    if not public.tem_permissao('sos', 'criar') then raise exception 'Sem permissão para abrir SOS.'; end if;
    v_cli := nullif(p->>'cliente_id', '')::uuid;
    if v_cli is null then raise exception 'Informe o cliente.'; end if;
  else
    v_cli := public.sos_cliente_atual();
    if v_cli is null then raise exception 'Conclua seu cadastro antes de pedir socorro.'; end if;
    -- Toque duplo, rede lenta, nervosismo: um SOS ativo por conta. O segundo
    -- pedido devolve o primeiro em vez de criar outro.
    select * into v_existe from public.sos_chamados
    where conta_usuario_id = auth.uid() and status not in ('servico_finalizado', 'concluido', 'cancelado')
    order by recebido_em desc limit 1;
    if found then
      return to_jsonb(v_existe) || jsonb_build_object('ja_existia', true);
    end if;
  end if;

  -- Veículo: o já cadastrado do cliente, ou um novo pela placa (sem duplicar).
  if v_vei is not null then
    if not exists (select 1 from public.veiculos where id = v_vei and (cliente_id = v_cli or v_papel = 'central')) then
      raise exception 'Veículo não pertence a este cliente.';
    end if;
  elsif nullif(p->>'placa', '') is not null then
    v_vei := public.sos_garantir_veiculo(v_cli, p->>'placa', nullif(p->>'veiculo_descricao', ''), nullif(p->>'veiculo_tipo', ''));
  end if;

  select coalesce(nullif(p->>'telefone_contato', ''), c.telefone, cl.celular, cl.telefone)
    into v_tel
  from public.clientes cl
  left join public.sos_contas_cliente c on c.usuario_id = auth.uid()
  where cl.id = v_cli;

  v_status := case when v_cfg.modo_distribuicao = 'inteligente' then 'procurando_mecanico' else 'recebido' end;

  insert into public.sos_chamados (
    cliente_id, veiculo_id, conta_usuario_id, aberto_por_equipe, origem, tipo_ocorrencia, descricao, prioridade,
    status, latitude, longitude, precisao_m, endereco, ponto_ajustado, telefone_contato, contexto_ia
  ) values (
    v_cli, v_vei,
    case when v_papel = 'central' then (select usuario_id from public.sos_contas_cliente where cliente_id = v_cli order by updated_at desc limit 1)
         else auth.uid() end,
    case when v_papel = 'central' then auth.uid() else null end,
    coalesce(nullif(p->>'origem', '')::public.sos_origem,
             (case when v_papel = 'central' then 'central' else 'app' end)::public.sos_origem),
    coalesce(nullif(p->>'tipo_ocorrencia', '')::public.sos_tipo_ocorrencia, 'outro'),
    nullif(trim(p->>'descricao'), ''),
    coalesce(nullif(p->>'prioridade', '')::public.sos_prioridade,
             (case when (p->>'tipo_ocorrencia') in ('freios', 'acidente') then 'emergencia'
                   when (p->>'tipo_ocorrencia') in ('parado', 'nao_liga') then 'alta'
                   else 'normal' end)::public.sos_prioridade),
    v_status,
    (p->>'latitude')::double precision, (p->>'longitude')::double precision, (p->>'precisao_m')::real,
    nullif(p->>'endereco', ''), coalesce((p->>'ponto_ajustado')::boolean, false), v_tel, p->'contexto_ia'
  ) returning id into v_id;

  perform public.sos_registrar_evento(v_id, 'status', public.sos_rotulo_status('recebido'),
    nullif(trim(p->>'descricao'), ''), jsonb_build_object('status', 'recebido', 'precisao_m', p->>'precisao_m'),
    (p->>'latitude')::double precision, (p->>'longitude')::double precision);
  if v_status = 'procurando_mecanico' then
    perform public.sos_registrar_evento(v_id, 'status', public.sos_rotulo_status('procurando_mecanico'),
      'Mecânicos disponíveis avisados automaticamente.', jsonb_build_object('status', 'procurando_mecanico'), null, null, 'sistema');
  end if;

  if v_vei is not null then
    insert into public.eventos_veiculo (veiculo_id, cliente_id, tipo, titulo, descricao, referencia_tabela, referencia_id)
    values (v_vei, v_cli, 'sos', 'SOS solicitado', nullif(trim(p->>'descricao'), ''), 'sos_chamados', v_id);
  end if;

  return (select to_jsonb(c) from public.sos_chamados c where c.id = v_id);
end;
$$;

create or replace function public.sos_aceitar(p_chamado uuid, p_lat double precision default null, p_lng double precision default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c   public.sos_chamados;
  v_cfg public.sos_config;
  v_dist numeric;
  v_atual uuid;
begin
  if not public.sos_eh_mecanico() then raise exception 'Só mecânicos aceitam chamados.'; end if;
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_c.status not in ('recebido', 'procurando_mecanico') then
    raise exception 'Este chamado não está mais disponível (%).', public.sos_rotulo_status(v_c.status);
  end if;
  if v_c.mecanico_id is not null and v_c.mecanico_id <> auth.uid() then
    raise exception 'Este chamado foi atribuído a outro mecânico.';
  end if;
  select chamado_atual_id into v_atual from public.sos_mecanicos where usuario_id = auth.uid();
  if v_atual is not null and v_atual <> p_chamado and exists (
    select 1 from public.sos_chamados where id = v_atual and status not in ('servico_finalizado', 'concluido', 'cancelado')
  ) then
    raise exception 'Termine o atendimento atual antes de aceitar outro.';
  end if;
  select * into v_cfg from public.sos_config where singleton;

  v_dist := public.sos_distancia_km(p_lat, p_lng, v_c.latitude, v_c.longitude);

  update public.sos_chamados
  set mecanico_id = auth.uid(), status = 'a_caminho', aceito_em = now(), a_caminho_em = now(),
      atribuido_em = coalesce(atribuido_em, now()),
      tempo_aceite_seg = extract(epoch from now() - recebido_em)::int,
      distancia_km = coalesce(v_dist, distancia_km),
      eta_min = case when v_dist is not null then greatest(1, ceil(v_dist / v_cfg.velocidade_media_kmh * 60))::int else eta_min end
  where id = p_chamado;

  insert into public.sos_mecanicos (usuario_id, situacao, chamado_atual_id, latitude, longitude, posicao_em)
  values (auth.uid(), 'em_atendimento', p_chamado, p_lat, p_lng, case when p_lat is null then null else now() end)
  on conflict (usuario_id) do update
    set chamado_atual_id = excluded.chamado_atual_id,
        situacao = 'em_atendimento',
        latitude = coalesce(excluded.latitude, public.sos_mecanicos.latitude),
        longitude = coalesce(excluded.longitude, public.sos_mecanicos.longitude),
        posicao_em = coalesce(excluded.posicao_em, public.sos_mecanicos.posicao_em);

  perform public.sos_registrar_evento(p_chamado, 'status', public.sos_rotulo_status('aceito'), null,
    jsonb_build_object('status', 'aceito', 'distancia_km', v_dist), p_lat, p_lng, 'mecanico');
  perform public.sos_registrar_evento(p_chamado, 'status', public.sos_rotulo_status('a_caminho'), null,
    jsonb_build_object('status', 'a_caminho'), p_lat, p_lng, 'mecanico');

  return (select to_jsonb(c) from public.sos_chamados c where c.id = p_chamado);
end;
$$;

create or replace function public.sos_recusar(p_chamado uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_c public.sos_chamados;
begin
  if not public.sos_eh_mecanico() then raise exception 'Só mecânicos recusam chamados.'; end if;
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  insert into public.sos_recusas (chamado_id, mecanico_id, motivo) values (p_chamado, auth.uid(), p_motivo);
  -- Atribuição direta recusada volta para a fila e a central fica sabendo.
  if v_c.mecanico_id = auth.uid() and v_c.status in ('recebido', 'procurando_mecanico') then
    update public.sos_chamados set mecanico_id = null, atribuido_em = null, atribuido_por = null,
      status = 'procurando_mecanico' where id = p_chamado;
  end if;
  perform public.sos_registrar_evento(p_chamado, 'recusa', 'Mecânico recusou', p_motivo, null, null, null, 'mecanico');
end;
$$;

-- Central escolhe o mecânico. `p_confirmar` pula o aceite (mecânico avisado por telefone).
create or replace function public.sos_atribuir(p_chamado uuid, p_mecanico uuid, p_confirmar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_c public.sos_chamados; v_nome text;
begin
  if not public.tem_permissao('sos', 'editar') then raise exception 'Sem permissão.'; end if;
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_c.status in ('servico_finalizado', 'concluido', 'cancelado') then
    raise exception 'Chamado já encerrado.';
  end if;
  select nome_completo into v_nome from public.usuarios where id = p_mecanico and situacao = 'ativo';
  if v_nome is null then raise exception 'Mecânico inválido.'; end if;

  -- Troca de mecânico no meio do caminho: o anterior fica livre.
  if v_c.mecanico_id is not null and v_c.mecanico_id <> p_mecanico then
    update public.sos_mecanicos set chamado_atual_id = null,
      situacao = case when situacao = 'em_atendimento' then 'disponivel'::public.sos_situacao_mecanico else situacao end
    where usuario_id = v_c.mecanico_id and chamado_atual_id = p_chamado;
  end if;

  update public.sos_chamados
  set mecanico_id = p_mecanico, atribuido_em = now(), atribuido_por = auth.uid(),
      status = case when p_confirmar and status in ('recebido', 'procurando_mecanico') then 'a_caminho'
                    when not p_confirmar and status in ('recebido') then 'procurando_mecanico'
                    else status end,
      aceito_em = case when p_confirmar then coalesce(aceito_em, now()) else aceito_em end,
      a_caminho_em = case when p_confirmar then coalesce(a_caminho_em, now()) else a_caminho_em end,
      tempo_aceite_seg = case when p_confirmar then coalesce(tempo_aceite_seg, extract(epoch from now() - recebido_em)::int) else tempo_aceite_seg end
  where id = p_chamado;

  insert into public.sos_mecanicos (usuario_id, chamado_atual_id, situacao)
  values (p_mecanico, case when p_confirmar then p_chamado end, case when p_confirmar then 'em_atendimento'::public.sos_situacao_mecanico else 'offline' end)
  on conflict (usuario_id) do update
    set chamado_atual_id = coalesce(excluded.chamado_atual_id, public.sos_mecanicos.chamado_atual_id),
        situacao = case when p_confirmar then 'em_atendimento'::public.sos_situacao_mecanico else public.sos_mecanicos.situacao end;

  perform public.sos_registrar_evento(p_chamado, 'atribuicao',
    case when p_confirmar then 'Central escalou ' || v_nome || ' (a caminho)' else 'Central atribuiu a ' || v_nome end,
    null, jsonb_build_object('mecanico_id', p_mecanico, 'confirmado', p_confirmar), null, null, 'central');

  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.atribuir', 'sos_chamados', p_chamado, jsonb_build_object('mecanico_id', p_mecanico, 'confirmar', p_confirmar));

  return (select to_jsonb(c) from public.sos_chamados c where c.id = p_chamado);
end;
$$;

-- Copia para a OS os itens do chamado que ainda não estão lá.
create or replace function public.sos_sincronizar_itens_os(p_chamado uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_os  uuid;
  v_it  public.sos_itens;
  v_id  uuid;
  v_ord integer;
  v_n   integer := 0;
begin
  select os_id into v_os from public.sos_chamados where id = p_chamado;
  if v_os is null then return 0; end if;
  for v_it in select * from public.sos_itens where chamado_id = p_chamado and os_item_id is null order by created_at loop
    if v_it.tipo = 'produto' then
      select coalesce(max(ordem), 0) + 1 into v_ord from public.os_produtos where os_id = v_os;
      insert into public.os_produtos (os_id, produto_id, codigo, descricao, unidade, quantidade, valor_unitario, desconto, ordem)
      values (v_os, v_it.produto_id, v_it.codigo, v_it.descricao, coalesce(v_it.unidade, 'UN'), v_it.quantidade, v_it.valor_unitario, v_it.desconto, v_ord)
      returning id into v_id;
    else
      select coalesce(max(ordem), 0) + 1 into v_ord from public.os_servicos where os_id = v_os;
      insert into public.os_servicos (os_id, servico_id, codigo, descricao, quantidade, valor_unitario, desconto, ordem)
      values (v_os, v_it.servico_id, v_it.codigo, v_it.descricao, v_it.quantidade, v_it.valor_unitario, v_it.desconto, v_ord)
      returning id into v_id;
    end if;
    update public.sos_itens set os_item_id = v_id where id = v_it.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Vira OS na oficina: mesmo cliente, mesmo veículo, mecânico escalado, itens
-- do catálogo copiados e histórico ligado.
create or replace function public.sos_gerar_os(p_chamado uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c      public.sos_chamados;
  v_papel  public.sos_papel := public.sos_papel_atual();
  v_status uuid;
  v_os     uuid;
  v_km     integer;
begin
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_c.os_id is not null then return v_c.os_id; end if;
  if v_papel = 'cliente' then raise exception 'Sem permissão.'; end if;
  if v_papel = 'mecanico' and v_c.mecanico_id <> auth.uid() then raise exception 'Este chamado é de outro mecânico.'; end if;
  if v_papel = 'central' and not public.tem_permissao('ordens_servico', 'criar') then raise exception 'Sem permissão para abrir OS.'; end if;
  if v_c.veiculo_id is null then raise exception 'Informe o veículo antes de gerar a OS.'; end if;

  select id into v_status from public.status_os
  where situacao = 'ativo' and categoria = 'entrada' order by ordem limit 1;
  select km_atual into v_km from public.veiculos where id = v_c.veiculo_id;

  insert into public.ordens_servico (tipo, cliente_id, veiculo_id, status_id, km, problema_alegado, diagnostico, observacoes, aberta_por, prioridade)
  values ('os', v_c.cliente_id, v_c.veiculo_id, v_status, v_km,
    concat_ws(' — ', 'SOS ' || v_c.protocolo, public.sos_rotulo_ocorrencia(v_c.tipo_ocorrencia), v_c.descricao),
    v_c.diagnostico,
    concat_ws(E'\n', 'Atendimento SOS em ' || coalesce(v_c.endereco, 'local informado no app'), v_c.servico_realizado, v_c.observacoes_finais),
    case when v_papel <> 'cliente' then auth.uid() end,
    case v_c.prioridade when 'emergencia' then 3 when 'alta' then 2 else 1 end)
  returning id into v_os;

  if v_c.mecanico_id is not null then
    insert into public.os_mecanicos (os_id, usuario_id, principal) values (v_os, v_c.mecanico_id, true)
    on conflict do nothing;
  end if;
  insert into public.os_eventos (os_id, tipo, titulo, descricao, usuario_id, dados)
  values (v_os, 'os', 'OS gerada a partir do SOS ' || v_c.protocolo, v_c.descricao,
    case when v_papel <> 'cliente' then auth.uid() end, jsonb_build_object('sos_chamado_id', p_chamado));

  update public.sos_chamados set os_id = v_os where id = p_chamado;
  perform public.sos_sincronizar_itens_os(p_chamado);
  -- Sem item do catálogo, o serviço descrito entra como linha para a oficina precificar.
  if not exists (select 1 from public.sos_itens where chamado_id = p_chamado and tipo = 'servico')
     and nullif(v_c.servico_realizado, '') is not null then
    insert into public.os_servicos (os_id, descricao, quantidade, valor_unitario, ordem)
    values (v_os, left('Socorro: ' || v_c.servico_realizado, 200), 1, 0,
            (select coalesce(max(ordem), 0) + 1 from public.os_servicos where os_id = v_os));
  end if;

  perform public.sos_registrar_evento(p_chamado, 'os', 'OS gerada', null, jsonb_build_object('os_id', v_os), null, null, v_papel);
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.gerar_os', 'sos_chamados', p_chamado, jsonb_build_object('os_id', v_os));
  return v_os;
end;
$$;

-- Avanço de etapa pelo mecânico (ou central). A ordem é fixa; pular não é permitido.
create or replace function public.sos_avancar(
  p_chamado uuid, p_status public.sos_status,
  p_lat double precision default null, p_lng double precision default null, p_dados jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c     public.sos_chamados;
  v_papel public.sos_papel := public.sos_papel_atual();
  v_cfg   public.sos_config;
  v_ok    boolean;
  v_dist  numeric;
begin
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_papel = 'cliente' then raise exception 'Cliente não altera a etapa.'; end if;
  -- Quem é mecânico E central age como mecânico no próprio chamado.
  if v_c.mecanico_id = auth.uid() then
    v_papel := 'mecanico';
  elsif v_papel = 'mecanico' then
    raise exception 'Este chamado é de outro mecânico.';
  elsif not public.tem_permissao('sos', 'editar') then
    raise exception 'Sem permissão.';
  end if;
  select * into v_cfg from public.sos_config where singleton;

  v_ok := (v_c.status, p_status) in (
    ('recebido', 'procurando_mecanico'),
    ('aceito', 'a_caminho'),
    ('a_caminho', 'no_local'),
    ('no_local', 'servico_iniciado'),
    ('servico_iniciado', 'servico_finalizado'),
    ('servico_finalizado', 'concluido')
  );
  if not v_ok then
    raise exception 'De "%" não dá para ir para "%".', public.sos_rotulo_status(v_c.status), public.sos_rotulo_status(p_status);
  end if;

  if p_status = 'servico_finalizado' then
    if nullif(trim(coalesce(p_dados->>'diagnostico', v_c.diagnostico, '')), '') is null
       or nullif(trim(coalesce(p_dados->>'servico_realizado', v_c.servico_realizado, '')), '') is null then
      raise exception 'Diagnóstico e serviço realizado são obrigatórios para finalizar.';
    end if;
  end if;

  -- "Cheguei" com GPS longe do cliente fica registrado (sem bloquear: o
  -- pino pode estar errado). A central vê a distância na linha do tempo.
  if p_status = 'no_local' then
    v_dist := public.sos_distancia_km(p_lat, p_lng, v_c.latitude, v_c.longitude);
  end if;

  update public.sos_chamados
  set status = p_status,
      a_caminho_em = case when p_status = 'a_caminho' then now() else a_caminho_em end,
      chegou_em = case when p_status = 'no_local' then now() else chegou_em end,
      iniciado_em = case when p_status = 'servico_iniciado' then now() else iniciado_em end,
      finalizado_em = case when p_status = 'servico_finalizado' then now() else finalizado_em end,
      concluido_em = case when p_status = 'concluido' then now() else concluido_em end,
      diagnostico = coalesce(nullif(trim(p_dados->>'diagnostico'), ''), diagnostico),
      servico_realizado = coalesce(nullif(trim(p_dados->>'servico_realizado'), ''), servico_realizado),
      observacoes_finais = coalesce(nullif(trim(p_dados->>'observacoes'), ''), observacoes_finais),
      pecas_utilizadas = coalesce(nullif(trim(p_dados->>'pecas'), ''), pecas_utilizadas),
      tempo_deslocamento_seg = case when p_status = 'no_local' and a_caminho_em is not null
                                    then extract(epoch from now() - a_caminho_em)::int else tempo_deslocamento_seg end,
      tempo_servico_seg = case when p_status = 'servico_finalizado' and iniciado_em is not null
                               then extract(epoch from now() - iniciado_em)::int else tempo_servico_seg end,
      tempo_total_seg = case when p_status in ('servico_finalizado', 'concluido')
                             then extract(epoch from now() - recebido_em)::int else tempo_total_seg end,
      distancia_km = case when p_status = 'no_local' then 0 else distancia_km end,
      eta_min = case when p_status in ('no_local', 'servico_iniciado', 'servico_finalizado', 'concluido') then 0 else eta_min end
  where id = p_chamado;

  if p_status in ('servico_finalizado', 'concluido') then
    update public.sos_mecanicos set chamado_atual_id = null,
      situacao = case when situacao = 'em_atendimento' then 'disponivel'::public.sos_situacao_mecanico else situacao end
    where usuario_id = v_c.mecanico_id and chamado_atual_id = p_chamado;
  end if;

  perform public.sos_registrar_evento(p_chamado, 'status', public.sos_rotulo_status(p_status),
    case when p_status = 'no_local' and v_dist > 0.5
         then 'GPS do mecânico a ' || v_dist || ' km do ponto informado.'
         else coalesce(nullif(p_dados->>'servico_realizado', ''), nullif(p_dados->>'observacoes', '')) end,
    jsonb_build_object('status', p_status, 'distancia_km', v_dist) || coalesce(p_dados, '{}'::jsonb), p_lat, p_lng, v_papel);

  if p_status = 'servico_finalizado' then
    if v_c.veiculo_id is not null then
      insert into public.eventos_veiculo (veiculo_id, cliente_id, tipo, titulo, descricao, referencia_tabela, referencia_id, registrado_por)
      values (v_c.veiculo_id, v_c.cliente_id, 'sos', 'Socorro realizado',
        concat_ws(' — ', coalesce(nullif(p_dados->>'diagnostico', ''), v_c.diagnostico), coalesce(nullif(p_dados->>'servico_realizado', ''), v_c.servico_realizado)),
        'sos_chamados', p_chamado, auth.uid());
      if v_cfg.gerar_os_ao_finalizar and v_c.os_id is null then
        begin
          perform public.sos_gerar_os(p_chamado);
        exception when others then
          -- OS é consequência, não condição: a finalização nunca falha por ela.
          perform public.sos_registrar_evento(p_chamado, 'os', 'OS não gerada automaticamente', sqlerrm, null, null, null, 'sistema');
        end;
      end if;
    end if;
    perform public.sos_sincronizar_itens_os(p_chamado);
  end if;

  return (select to_jsonb(c) from public.sos_chamados c where c.id = p_chamado);
end;
$$;

-- Diagnóstico e anotações durante o serviço, sem mudar de etapa.
create or replace function public.sos_salvar_atendimento(p_chamado uuid, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.sos_pode_atender(p_chamado) then raise exception 'Sem permissão.'; end if;
  update public.sos_chamados
  set diagnostico = case when p_dados ? 'diagnostico' then nullif(trim(p_dados->>'diagnostico'), '') else diagnostico end,
      servico_realizado = case when p_dados ? 'servico_realizado' then nullif(trim(p_dados->>'servico_realizado'), '') else servico_realizado end,
      observacoes_finais = case when p_dados ? 'observacoes' then nullif(trim(p_dados->>'observacoes'), '') else observacoes_finais end
  where id = p_chamado and status not in ('concluido', 'cancelado');
  return (select to_jsonb(c) from public.sos_chamados c where c.id = p_chamado);
end;
$$;

create or replace function public.sos_cancelar(p_chamado uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c     public.sos_chamados;
  v_papel public.sos_papel := public.sos_papel_atual();
  v_cfg   public.sos_config;
begin
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_c.status in ('concluido', 'cancelado') then raise exception 'Chamado já encerrado.'; end if;
  select * into v_cfg from public.sos_config where singleton;

  if v_papel = 'cliente' then
    if v_c.conta_usuario_id is distinct from auth.uid() and v_c.cliente_id is distinct from public.sos_cliente_atual() then
      raise exception 'Este chamado não é seu.';
    end if;
    if v_c.status >= v_cfg.cancelamento_cliente_ate then
      raise exception 'O serviço já começou. Fale com a Tecnoar para cancelar.';
    end if;
  elsif v_papel = 'mecanico' then
    raise exception 'Mecânico não cancela: peça à central.';
  elsif not public.tem_permissao('sos', 'cancelar') then
    raise exception 'Sem permissão para cancelar.';
  end if;
  if nullif(trim(coalesce(p_motivo, '')), '') is null then raise exception 'Informe o motivo.'; end if;

  update public.sos_chamados
  set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), cancelado_por_papel = v_papel,
      motivo_cancelamento = p_motivo, eta_min = null
  where id = p_chamado;
  update public.sos_mecanicos set chamado_atual_id = null,
    situacao = case when situacao = 'em_atendimento' then 'disponivel'::public.sos_situacao_mecanico else situacao end
  where chamado_atual_id = p_chamado;

  perform public.sos_registrar_evento(p_chamado, 'status', 'Cancelado', p_motivo, jsonb_build_object('status', 'cancelado'), null, null, v_papel);
  if v_papel = 'central' then
    insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
    values (auth.uid(), 'sos.cancelar', 'sos_chamados', p_chamado, jsonb_build_object('motivo', p_motivo));
  end if;
  return (select to_jsonb(c) from public.sos_chamados c where c.id = p_chamado);
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
