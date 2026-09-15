-- ============================================================================
-- SOS Tecnoar — chamado aberto pelo mecânico guarda "ponto ajustado".
--
-- Quando o mecânico marca o local à mão no mapa (GPS fraco ou vai até o
-- cliente), a central vê o selo "ajustado" como nos pedidos do cliente, em vez
-- de achar que é leitura de GPS. Única mudança em relação a 20260922.
-- ============================================================================

-- ─────────────────────────────────── 3) chamado aberto pelo mecânico
-- p: cliente_id | (cliente_nome, telefone) ; veiculo_id | placa (+ veiculo_descricao) ;
--    tipo_ocorrencia, descricao, latitude, longitude, precisao_m, endereco, ponto_ajustado ;
--    ja_no_local (padrão true) ; mecanico_lat/mecanico_lng (quando vai a caminho) ;
--    gerar_os (padrão false) ; os_id (vincular a uma OS aberta do veículo).
create or replace function public.sos_mecanico_abrir_chamado(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cli      uuid := nullif(p->>'cliente_id', '')::uuid;
  v_vei      uuid := nullif(p->>'veiculo_id', '')::uuid;
  v_dono     uuid;
  v_nome     text := nullif(trim(coalesce(p->>'cliente_nome', '')), '');
  v_tel      text := nullif(trim(coalesce(p->>'telefone', '')), '');
  v_dig      text := regexp_replace(coalesce(p->>'telefone', ''), '\D', '', 'g');
  v_desc     text := nullif(trim(coalesce(p->>'descricao', '')), '');
  v_no_local boolean := coalesce((p->>'ja_no_local')::boolean, true);
  v_lat      double precision := (p->>'latitude')::double precision;
  v_lng      double precision := (p->>'longitude')::double precision;
  v_mlat     double precision := coalesce((p->>'mecanico_lat')::double precision, case when v_no_local then v_lat end);
  v_mlng     double precision := coalesce((p->>'mecanico_lng')::double precision, case when v_no_local then v_lng end);
  v_tipo     public.sos_tipo_ocorrencia := coalesce(nullif(p->>'tipo_ocorrencia', '')::public.sos_tipo_ocorrencia, 'outro');
  v_cfg      public.sos_config;
  v_atual    uuid;
  v_dist     numeric;
  v_id       uuid;
  v_nome_mec text;
  v_novo_cli boolean := false;
begin
  if not public.sos_eh_mecanico() then raise exception 'Só a equipe Tecnoar abre chamado pelo app do mecânico.'; end if;
  if v_desc is null then raise exception 'Descreva o problema.'; end if;

  -- Toque duplo: o segundo pedido espera o primeiro e cai na regra abaixo.
  perform pg_advisory_xact_lock(hashtextextended('sos_abrir:' || auth.uid()::text, 0));
  select chamado_atual_id into v_atual from public.sos_mecanicos where usuario_id = auth.uid();
  if v_atual is not null and exists (
    select 1 from public.sos_chamados where id = v_atual and status not in ('servico_finalizado', 'concluido', 'cancelado')
  ) then
    raise exception 'Termine o atendimento atual antes de abrir outro.';
  end if;

  -- Veículo escolhido define o cliente (o dono do cadastro).
  if v_vei is not null then
    select cliente_id into v_dono from public.veiculos where id = v_vei and situacao = 'ativo';
    if not found then raise exception 'Veículo não encontrado.'; end if;
    if v_cli is not null and v_dono is not null and v_dono <> v_cli then raise exception 'Veículo não pertence a este cliente.'; end if;
    v_cli := coalesce(v_cli, v_dono);
  end if;

  if v_cli is null then
    if v_nome is null then raise exception 'Informe o cliente (busque pelo nome, telefone ou placa, ou digite o nome).'; end if;
    -- Mesmo celular = mesmo cliente: nada de cadastro duplicado.
    if length(v_dig) >= 10 then
      select id into v_cli from public.clientes
      where situacao = 'ativo' and regexp_replace(coalesce(celular, ''), '\D', '', 'g') = v_dig
      order by updated_at desc limit 1;
    end if;
    if v_cli is null then
      insert into public.clientes (tipo_pessoa, nome_razao, celular, origem, notificar_whatsapp, criado_por)
      values ('fisica', v_nome, v_tel, 'manual', true, auth.uid())
      returning id into v_cli;
      v_novo_cli := true;
    end if;
  elsif not exists (select 1 from public.clientes where id = v_cli and situacao = 'ativo') then
    raise exception 'Cliente não encontrado.';
  end if;

  if v_vei is null and nullif(p->>'placa', '') is not null then
    v_vei := public.sos_garantir_veiculo(v_cli, p->>'placa', nullif(p->>'veiculo_descricao', ''), null);
  end if;

  select * into v_cfg from public.sos_config where singleton;
  v_dist := case when v_no_local then 0 else public.sos_distancia_km(v_mlat, v_mlng, v_lat, v_lng) end;

  insert into public.sos_chamados (
    cliente_id, veiculo_id, conta_usuario_id, aberto_por_equipe, origem, tipo_ocorrencia, descricao, prioridade,
    status, latitude, longitude, precisao_m, endereco, ponto_ajustado, telefone_contato,
    mecanico_id, atribuido_em, aceito_em, a_caminho_em, chegou_em, tempo_aceite_seg, distancia_km, eta_min
  ) values (
    v_cli, v_vei,
    (select usuario_id from public.sos_contas_cliente where cliente_id = v_cli order by updated_at desc limit 1),
    auth.uid(), 'mecanico', v_tipo, v_desc,
    (case when v_tipo in ('freios', 'acidente') then 'emergencia' when v_tipo in ('parado', 'nao_liga') then 'alta' else 'normal' end)::public.sos_prioridade,
    (case when v_no_local then 'no_local' else 'a_caminho' end)::public.sos_status,
    v_lat, v_lng, (p->>'precisao_m')::real, nullif(trim(coalesce(p->>'endereco', '')), ''),
    coalesce((p->>'ponto_ajustado')::boolean, false),
    coalesce(v_tel, (select coalesce(celular, telefone) from public.clientes where id = v_cli)),
    auth.uid(), now(), now(), now(), case when v_no_local then now() end, 0, v_dist,
    case when not v_no_local and v_dist is not null
         then greatest(1, ceil(v_dist / nullif(v_cfg.velocidade_media_kmh, 0) * 60))::int end
  ) returning id into v_id;

  insert into public.sos_mecanicos (usuario_id, situacao, chamado_atual_id, latitude, longitude, posicao_em)
  values (auth.uid(), 'em_atendimento', v_id, v_mlat, v_mlng, case when v_mlat is null then null else now() end)
  on conflict (usuario_id) do update
    set chamado_atual_id = excluded.chamado_atual_id,
        situacao = 'em_atendimento',
        latitude = coalesce(excluded.latitude, public.sos_mecanicos.latitude),
        longitude = coalesce(excluded.longitude, public.sos_mecanicos.longitude),
        posicao_em = coalesce(excluded.posicao_em, public.sos_mecanicos.posicao_em);

  select nome_completo into v_nome_mec from public.usuarios where id = auth.uid();
  perform public.sos_registrar_evento(v_id, 'status', 'Aberto pelo mecânico em campo',
    concat_ws(' · ', v_nome_mec, case when v_novo_cli then 'cliente novo cadastrado' end, v_desc),
    jsonb_build_object('status', 'recebido', 'origem', 'mecanico', 'cliente_novo', v_novo_cli), v_lat, v_lng, 'mecanico');
  perform public.sos_registrar_evento(v_id, 'status',
    public.sos_rotulo_status((case when v_no_local then 'no_local' else 'a_caminho' end)::public.sos_status), null,
    jsonb_build_object('status', case when v_no_local then 'no_local' else 'a_caminho' end), v_mlat, v_mlng, 'mecanico');

  if v_vei is not null then
    insert into public.eventos_veiculo (veiculo_id, cliente_id, tipo, titulo, descricao, referencia_tabela, referencia_id)
    values (v_vei, v_cli, 'sos', 'SOS aberto pelo mecânico', v_desc, 'sos_chamados', v_id);
  end if;

  -- Cliente novo cadastrado em campo: a central confere o cadastro.
  if v_novo_cli then
    perform public.sos_notificar(u, 'Cliente cadastrado em campo', coalesce(v_nome_mec, 'Mecânico') || ' cadastrou ' || v_nome ||
      '. Complete o cadastro (documento, endereço).', '/cadastros/clientes')
    from public.sos_usuarios_central() u;
  end if;

  -- OS: vincula à aberta do veículo (escolhida no app) ou abre uma nova.
  if nullif(p->>'os_id', '') is not null then
    perform public.sos_vincular_os(v_id, (p->>'os_id')::uuid);
  elsif coalesce((p->>'gerar_os')::boolean, false) and v_vei is not null then
    perform public.sos_gerar_os(v_id);
  end if;

  return (select to_jsonb(c) from public.sos_chamados c where c.id = v_id);
end;
$$;
revoke execute on function public.sos_mecanico_abrir_chamado(jsonb) from public, anon;
grant execute on function public.sos_mecanico_abrir_chamado(jsonb) to authenticated;
