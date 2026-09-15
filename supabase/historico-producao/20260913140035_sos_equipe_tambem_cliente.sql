-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260913140035.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

create or replace function public.sos_papel_no_chamado(p_chamado uuid)
returns public.sos_papel
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select case when c.mecanico_id = auth.uid() then 'mecanico'::public.sos_papel
                when c.conta_usuario_id = auth.uid() then 'cliente'::public.sos_papel end
    from public.sos_chamados c where c.id = p_chamado
  ), public.sos_papel_atual())
$$;

revoke execute on function public.sos_papel_no_chamado(uuid) from public, anon;
grant execute on function public.sos_papel_no_chamado(uuid) to authenticated, service_role;

create or replace function public.sos_registrar_evento(
  p_chamado uuid, p_tipo text, p_titulo text, p_descricao text default null,
  p_dados jsonb default null, p_lat double precision default null, p_lng double precision default null,
  p_papel public.sos_papel default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.sos_eventos (chamado_id, tipo, titulo, descricao, dados, latitude, longitude, autor_id, autor_papel, autor_nome)
  values (
    p_chamado, p_tipo, p_titulo, p_descricao, p_dados, p_lat, p_lng, auth.uid(),
    coalesce(p_papel, case when auth.uid() is null then 'sistema'::public.sos_papel else public.sos_papel_no_chamado(p_chamado) end),
    case when auth.uid() is null then 'Sistema' else public.sos_nome_conta(auth.uid()) end
  );
end;
$$;

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
    select * into v_c from public.sos_contas_cliente where usuario_id = auth.uid();
    return jsonb_build_object(
      'papel', case when public.sos_eh_mecanico() then 'mecanico' else 'equipe' end,
      'central', public.sos_eh_equipe(),
      'usuario_id', v_u.id,
      'nome', v_u.nome_completo,
      'avatar_url', v_u.avatar_url,
      'telefone', v_u.telefone,
      'email', (select email from auth.users where id = auth.uid()),
      'mecanico', case when v_mec.usuario_id is null then null else to_jsonb(v_mec) end,
      -- Conta de cliente da mesma pessoa (modo cliente do app), se houver.
      'cliente', case when v_c.usuario_id is null then null else jsonb_build_object(
        'usuario_id', v_c.usuario_id,
        'nome', v_c.nome,
        'telefone', v_c.telefone,
        'email', v_c.email,
        'cliente_id', v_c.cliente_id,
        'veiculo_principal_id', v_c.veiculo_principal_id,
        'aceite_termos_em', v_c.aceite_termos_em,
        'aceite_localizacao_em', v_c.aceite_localizacao_em) end
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
  -- Funcionário ativo pode ter também o perfil de cliente (modo cliente do app).
  if v_sit is not null and v_sit not in ('pendente', 'ativo') then
    raise exception 'Esta conta da equipe está inativa. Fale com a Tecnoar.';
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
    -- `documento_digitos` é coluna gerada a partir de `documento`.
    insert into public.clientes (tipo_pessoa, nome_razao, documento, celular, email, origem, notificar_whatsapp)
    values (
      (case when v_doc is not null and length(v_doc) = 14 then 'juridica' else 'fisica' end)::public.tipo_pessoa,
      v_nome, nullif(trim(p_documento), ''), p_telefone, v_email, 'manual', true
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

create or replace function public.sos_abrir_chamado(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_papel   public.sos_papel := public.sos_papel_atual();
  v_central boolean;
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

  -- A central abre em nome de um cliente (informa `cliente_id`). Sem ele,
  -- quem tem conta de cliente — inclusive alguém da equipe no modo cliente
  -- do app — pede socorro para si.
  v_central := v_papel = 'central'
    and (nullif(p->>'cliente_id', '') is not null or public.sos_cliente_atual() is null);

  if v_central then
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
    if not exists (select 1 from public.veiculos where id = v_vei and (cliente_id = v_cli or v_central)) then
      raise exception 'Veículo não pertence a este cliente.';
    end if;
  elsif nullif(p->>'placa', '') is not null then
    v_vei := public.sos_garantir_veiculo(v_cli, p->>'placa', nullif(p->>'veiculo_descricao', ''), nullif(p->>'veiculo_tipo', ''));
  elsif not v_central then
    -- Sem escolha no app: o veículo principal da conta (sem ele não nasce OS).
    select c.veiculo_principal_id into v_vei from public.sos_contas_cliente c
    join public.veiculos v on v.id = c.veiculo_principal_id and v.cliente_id = v_cli
    where c.usuario_id = auth.uid();
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
    case when v_central then (select usuario_id from public.sos_contas_cliente where cliente_id = v_cli order by updated_at desc limit 1)
         else auth.uid() end,
    case when v_central then auth.uid() else null end,
    coalesce(nullif(p->>'origem', '')::public.sos_origem,
             (case when v_central then 'central' else 'app' end)::public.sos_origem),
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
    (p->>'latitude')::double precision, (p->>'longitude')::double precision,
    (case when v_central then 'central' else 'cliente' end)::public.sos_papel);
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

create or replace function public.sos_cancelar(p_chamado uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c     public.sos_chamados;
  v_papel public.sos_papel := public.sos_papel_no_chamado(p_chamado);
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
$$;;
