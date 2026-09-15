-- Achados da auditoria de 13/09/2026 (segurança e escala).
--
-- 1) Vínculo da conta do app com o cadastro de cliente. Antes, bastava saber
--    o CPF/CNPJ ou o celular de um cliente para a conta nova herdar o
--    cadastro dele — histórico, OS, valores e veículos (LGPD). Agora a conta
--    só assume um cadastro existente quando o e-mail CONFIRMADO dela é o
--    mesmo do cadastro. Documento ou celular iguais com e-mail diferente
--    viram cadastro novo, e a central é avisada para vincular se for mesmo a
--    mesma pessoa (SOS → Clientes do app → Vincular). O vínculo automático
--    só acontece com a confirmação de e-mail ligada no Supabase Auth.
-- 2) Um SOS ativo por conta: a checagem agora trava por conta (dois toques
--    ao mesmo tempo não abrem dois chamados).
-- 3) GPS: o chamado só é regravado quando a previsão ou a distância mudam de
--    verdade — cada ponto regravava e fazia a central e o cliente recarregarem.
-- 4) Índices das chaves e filtros do SOS; limpeza do log do pg_cron (o vigia
--    roda a cada 30 s: ~2.900 linhas por dia sem limpeza).
-- 5) Funções que o visitante sem login não precisa chamar.

-- ─────────────────────────────────────────────── 1) cadastro de cliente
create index if not exists clientes_email_lower_ix on public.clientes (lower(trim(email)));

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
  v_tel        text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_doc        text := nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '');
  v_cli        uuid;
  v_nome       text := nullif(trim(p_nome), '');
  v_email_conta text;
  v_confirmado boolean;
  v_email      text;
  v_sit        text;
  v_parecido   public.clientes;
  v_u          uuid;
begin
  if auth.uid() is null then raise exception 'Sessão necessária.'; end if;
  if v_nome is null then raise exception 'Informe seu nome.'; end if;
  if v_tel is null or length(v_tel) < 10 then raise exception 'Informe um celular com DDD.'; end if;
  if v_doc is not null and length(v_doc) not in (11, 14) then raise exception 'CPF ou CNPJ incompleto.'; end if;

  -- Confirmado = recebeu o e-mail de confirmação e clicou no link. Com a
  -- confirmação desligada no Auth, `email_confirmed_at` é preenchido na hora
  -- (sem `confirmation_sent_at`) e não prova nada: aí nunca herda cadastro.
  select nullif(lower(trim(u.email)), ''), u.email_confirmed_at is not null and u.confirmation_sent_at is not null
    into v_email_conta, v_confirmado
  from auth.users u where u.id = auth.uid();
  v_email := coalesce(nullif(trim(p_email), ''), v_email_conta);

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

  -- Já tem conta de cliente: só atualiza os dados, o vínculo não muda aqui.
  select cliente_id into v_cli from public.sos_contas_cliente where usuario_id = auth.uid();

  -- A mesma pessoa: e-mail confirmado da conta = e-mail do cadastro.
  if v_cli is null and v_confirmado and v_email_conta is not null then
    select id into v_cli from public.clientes
    where situacao = 'ativo' and lower(trim(email)) = v_email_conta
    order by created_at limit 1;
  end if;

  if v_cli is null then
    -- Documento ou celular de um cadastro existente, sem o e-mail: pode ser
    -- a mesma pessoa ou alguém se passando por ela. Não herda nada.
    if v_doc is not null then
      select * into v_parecido from public.clientes where documento_digitos = v_doc and situacao = 'ativo' limit 1;
    end if;
    if v_parecido.id is null then
      -- Últimos 8 dígitos evitam diferença de DDI/9º dígito entre cadastros.
      select * into v_parecido from public.clientes
      where situacao = 'ativo'
        and (right(regexp_replace(coalesce(celular, ''), '\D', '', 'g'), 8) = right(v_tel, 8)
             or right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = right(v_tel, 8))
      order by created_at limit 1;
    end if;

    -- `documento_digitos` é coluna gerada e única: com um cadastro parecido,
    -- o documento fica só na conta do app até a central conferir.
    insert into public.clientes (tipo_pessoa, nome_razao, documento, celular, email, origem, notificar_whatsapp)
    values (
      (case when v_doc is not null and length(v_doc) = 14 then 'juridica' else 'fisica' end)::public.tipo_pessoa,
      v_nome, case when v_parecido.id is null then nullif(trim(p_documento), '') end, p_telefone, v_email, 'manual', true
    )
    returning id into v_cli;

    if v_parecido.id is not null then
      for v_u in select * from public.sos_usuarios_central() loop
        perform public.sos_notificar(v_u, 'Conta do app para conferir',
          v_nome || ' se cadastrou no app com ' || case when v_doc is not null and v_parecido.documento_digitos = v_doc then 'o documento' else 'o celular' end
            || ' de ' || v_parecido.nome_razao || '. Se for a mesma pessoa, vincule em SOS → Clientes do app.',
          '/sos/clientes');
      end loop;
    end if;
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

-- ───────────────────────────────────────── 2) um SOS ativo por conta
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
    -- Toque duplo, rede lenta, nervosismo: um SOS ativo por conta. A trava
    -- por conta faz o segundo pedido simultâneo esperar o primeiro e
    -- devolver o mesmo chamado, em vez de criar outro.
    perform pg_advisory_xact_lock(hashtextextended('sos_abrir:' || auth.uid()::text, 0));
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

-- ─────────────────────────────────────────────── 3) GPS sem regravar à toa
create or replace function public.sos_registrar_posicao(
  p_chamado uuid, p_lat double precision, p_lng double precision,
  p_precisao real default null, p_velocidade real default null, p_rumo real default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c     public.sos_chamados;
  v_papel public.sos_papel;
  v_cfg   public.sos_config;
  v_dist  numeric;
  v_eta   integer;
begin
  select * into v_c from public.sos_chamados where id = p_chamado;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_c.status in ('concluido', 'cancelado', 'servico_finalizado') then
    return jsonb_build_object('ok', false, 'motivo', 'encerrado');
  end if;

  if v_c.mecanico_id = auth.uid() then
    v_papel := 'mecanico';
  elsif v_c.conta_usuario_id = auth.uid() then
    v_papel := 'cliente';
  else
    raise exception 'Só cliente e mecânico do chamado registram posição.';
  end if;

  insert into public.sos_posicoes (chamado_id, autor_id, papel, latitude, longitude, precisao_m, velocidade_ms, rumo)
  values (p_chamado, auth.uid(), v_papel, p_lat, p_lng, p_precisao, p_velocidade, p_rumo);

  if v_papel = 'mecanico' then
    select * into v_cfg from public.sos_config where singleton;
    v_dist := public.sos_distancia_km(p_lat, p_lng, v_c.latitude, v_c.longitude);
    v_eta := case when v_dist is null then null
                  when v_c.status in ('no_local', 'servico_iniciado') then 0
                  else greatest(1, ceil(v_dist / v_cfg.velocidade_media_kmh * 60))::int end;
    update public.sos_mecanicos
    set latitude = p_lat, longitude = p_lng, precisao_m = p_precisao, posicao_em = now()
    where usuario_id = auth.uid();
    perform public.sos_pulso();
    -- O chamado (e com ele a tela da central e a do cliente) só muda quando
    -- a previsão muda de minuto, a distância anda 200 m ou o sinal volta.
    if v_c.status in ('aceito', 'a_caminho')
       and (v_c.eta_min is distinct from v_eta
            or v_c.distancia_km is null or v_dist is null
            or abs(v_c.distancia_km - v_dist) >= 0.2
            or v_c.sinal_avisado_em is not null) then
      update public.sos_chamados set distancia_km = v_dist, eta_min = v_eta, sinal_avisado_em = null where id = p_chamado;
    end if;
  else
    -- O cliente pode ter se movido (ou o GPS melhorou): o pino segue a posição
    -- real — só quando anda de verdade (~30 m), para não regravar parado.
    if v_c.status not in ('no_local', 'servico_iniciado') and not v_c.ponto_ajustado
       and coalesce(public.sos_distancia_km(p_lat, p_lng, v_c.latitude, v_c.longitude), 1) >= 0.03 then
      update public.sos_chamados set latitude = p_lat, longitude = p_lng, precisao_m = p_precisao where id = p_chamado;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'distancia_km', v_dist, 'eta_min', v_eta);
end;
$$;

-- ─────────────────────────────────────────────────────────────── 4) índices
create index if not exists sos_chamados_os_ix            on public.sos_chamados (os_id) where os_id is not null;
create index if not exists sos_chamados_contrato_ix      on public.sos_chamados (contrato_id) where contrato_id is not null;
create index if not exists sos_chamados_recebido_ix      on public.sos_chamados (recebido_em desc);
create index if not exists sos_chamados_aberto_equipe_ix on public.sos_chamados (aberto_por_equipe) where aberto_por_equipe is not null;
create index if not exists sos_agendamentos_cliente_ix   on public.sos_agendamentos (cliente_id);
create index if not exists sos_agendamentos_conta_ix     on public.sos_agendamentos (conta_usuario_id);
create index if not exists sos_agendamentos_veiculo_ix   on public.sos_agendamentos (veiculo_id);
create index if not exists sos_agendamentos_os_ix        on public.sos_agendamentos (os_id) where os_id is not null;
create index if not exists sos_compartilhamentos_chamado_ix on public.sos_compartilhamentos (chamado_id);
create index if not exists sos_contatos_emergencia_usuario_ix on public.sos_contatos_emergencia (usuario_id);
create index if not exists sos_recusas_mecanico_ix       on public.sos_recusas (mecanico_id);
create index if not exists sos_posicoes_autor_ix         on public.sos_posicoes (autor_id);
create index if not exists sos_itens_produto_ix          on public.sos_itens (produto_id) where produto_id is not null;
create index if not exists sos_itens_servico_ix          on public.sos_itens (servico_id) where servico_id is not null;
create index if not exists sos_lembretes_veiculo_ix      on public.sos_lembretes (veiculo_id);
create index if not exists sos_lembretes_origem_os_ix    on public.sos_lembretes (origem_os_id) where origem_os_id is not null;
create index if not exists sos_eventos_autor_ix          on public.sos_eventos (autor_id);
create index if not exists sos_mensagens_autor_ix        on public.sos_mensagens (autor_id);
create index if not exists sos_anexos_autor_ix           on public.sos_anexos (autor_id);

-- Log do pg_cron: o vigia (30 s) grava ~2.900 linhas por dia. Guarda 3 dias
-- (o painel do vigia olha a última hora).
create or replace function public.sos_limpar_log_cron()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer := 0;
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    execute 'delete from cron.job_run_details where end_time < now() - interval ''3 days''';
    get diagnostics v_n = row_count;
  end if;
  return v_n;
end;
$$;
revoke execute on function public.sos_limpar_log_cron() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'sos_limpar_log_cron';
    perform cron.schedule('sos_limpar_log_cron', '45 3 * * *', $c$ select public.sos_limpar_log_cron() $c$);
  end if;
end $$;

-- ───────────────────────────── 5) o que o visitante sem login não chama
-- (As funções já recusam por dentro; isto tira a porta da API.)
do $$
declare v_f text;
begin
  foreach v_f in array array[
    'public.excluir_registro(text, uuid)', 'public.previa_exclusao(text, uuid)',
    'public.avisar_mecanico_escalado()', 'public.enviar_push_notificacao()'
  ] loop
    if to_regprocedure(v_f) is not null then
      execute format('revoke execute on function %s from public, anon', v_f);
    end if;
  end loop;
  -- A exclusão de registros continua sendo da equipe logada (com permissão,
  -- conferida dentro da função).
  if to_regprocedure('public.excluir_registro(text, uuid)') is not null then
    grant execute on function public.excluir_registro(text, uuid) to authenticated;
    grant execute on function public.previa_exclusao(text, uuid) to authenticated;
  end if;
end $$;
