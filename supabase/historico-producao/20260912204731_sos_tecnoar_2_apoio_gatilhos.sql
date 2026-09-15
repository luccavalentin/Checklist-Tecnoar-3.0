-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260912204731.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- SOS Tecnoar (parte 2/8): funções de apoio e gatilhos.

-- ============================================================== funções de apoio
create or replace function public.sos_cliente_atual()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cliente_id from public.sos_contas_cliente where usuario_id = auth.uid()
$$;

create or replace function public.sos_eh_equipe()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.situacao = 'ativo'
      and (u.is_admin or public.tem_permissao('sos', 'visualizar'))
  )
$$;

create or replace function public.sos_eh_mecanico()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios u
    left join public.funcoes f on f.id = u.funcao_id
    left join public.sos_mecanicos m on m.usuario_id = u.id
    where u.id = auth.uid() and u.situacao = 'ativo'
      and (coalesce(f.atua_como_mecanico, false) or m.usuario_id is not null)
  )
$$;

-- Quem recebe o alerta de novo SOS na central: admins e quem tem `sos`.
create or replace function public.sos_usuarios_central()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id
  from public.usuarios u
  where u.situacao = 'ativo'
    and (
      u.is_admin
      or exists (select 1 from public.perfil_permissoes pp
                 where pp.perfil_id = u.perfil_id and pp.recurso = 'sos' and pp.acao = 'visualizar')
      or exists (select 1 from public.usuario_permissoes up
                 where up.usuario_id = u.id and up.recurso = 'sos' and up.acao = 'visualizar' and up.concedida)
    )
$$;

create or replace function public.sos_nome_conta(p_usuario uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select nome_completo from public.usuarios where id = p_usuario),
    (select nome from public.sos_contas_cliente where usuario_id = p_usuario),
    'Sistema'
  )
$$;

create or replace function public.sos_papel_atual()
returns public.sos_papel
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.sos_eh_equipe() then 'central'::public.sos_papel
    when public.sos_eh_mecanico() then 'mecanico'::public.sos_papel
    else 'cliente'::public.sos_papel
  end
$$;

-- Haversine em km. Suficiente para ordenar mecânicos e estimar chegada.
create or replace function public.sos_distancia_km(
  lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision
)
returns numeric
language sql
immutable
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else round((
      2 * 6371 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2)
        + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
      ))
    )::numeric, 2)
  end
$$;

create or replace function public.sos_pode_ver_chamado(p_chamado uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sos_chamados c
    where c.id = p_chamado
      and (
        public.sos_eh_equipe()
        or c.mecanico_id = auth.uid()
        or c.conta_usuario_id = auth.uid()
        or c.cliente_id = public.sos_cliente_atual()
        or (public.sos_eh_mecanico() and c.mecanico_id is null
            and c.status in ('recebido', 'procurando_mecanico'))
      )
  )
$$;

-- Quem mexe no atendimento: o mecânico do chamado ou a central com `editar`.
create or replace function public.sos_pode_atender(p_chamado uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sos_chamados c
    where c.id = p_chamado
      and (c.mecanico_id = auth.uid() or public.tem_permissao('sos', 'editar'))
  )
$$;

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
    coalesce(p_papel, case when auth.uid() is null then 'sistema'::public.sos_papel else public.sos_papel_atual() end),
    case when auth.uid() is null then 'Sistema' else public.sos_nome_conta(auth.uid()) end
  );
end;
$$;

-- Aviso é a mais: nunca derruba a operação que o gerou.
create or replace function public.sos_notificar(p_destinatario uuid, p_titulo text, p_mensagem text, p_link text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_destinatario is null then return; end if;
  insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link)
  values (p_destinatario, 'sistema', p_titulo, p_mensagem, p_link);
exception when others then
  null;
end;
$$;

create or replace function public.sos_rotulo_status(p public.sos_status)
returns text
language sql
immutable
as $$
  select case p
    when 'solicitado' then 'SOS solicitado'
    when 'recebido' then 'SOS recebido pela Tecnoar'
    when 'procurando_mecanico' then 'Procurando mecânico'
    when 'aceito' then 'Mecânico aceitou'
    when 'a_caminho' then 'Mecânico a caminho'
    when 'no_local' then 'Mecânico chegou'
    when 'servico_iniciado' then 'Serviço iniciado'
    when 'servico_finalizado' then 'Serviço finalizado'
    when 'concluido' then 'Atendimento concluído'
    when 'cancelado' then 'Cancelado'
  end
$$;

create or replace function public.sos_rotulo_ocorrencia(p public.sos_tipo_ocorrencia)
returns text
language sql
immutable
as $$
  select case p::text
    when 'freios' then 'Problema nos freios'
    when 'nao_liga' then 'Veículo não liga'
    when 'mecanico' then 'Pane mecânica'
    when 'pane_eletrica' then 'Pane elétrica'
    when 'roda_pneu' then 'Roda ou pneu'
    when 'vazamento' then 'Vazamento'
    when 'parado' then 'Caminhão parado'
    when 'acidente' then 'Acidente'
    when 'desconhecido' then 'Problema desconhecido'
    else 'Outro'
  end
$$;

-- WhatsApp complementar via Evolution API (pg_net). A chave fica em privado.config.
create or replace function public.sos_avisar_whatsapp(p_chamado uuid, p_cabecalho text default null)
returns void
language plpgsql
security definer
set search_path = public, privado, extensions, pg_temp
as $$
declare
  v_cfg    public.sos_config;
  v_c      record;
  v_chave  text;
  v_texto  text;
  v_dest   text;
begin
  select * into v_cfg from public.sos_config where singleton;
  if not v_cfg.whatsapp_ativo or v_cfg.whatsapp_url is null or v_cfg.whatsapp_instancia is null
     or coalesce(array_length(v_cfg.whatsapp_destinos, 1), 0) = 0 then
    return;
  end if;
  select valor into v_chave from privado.config where chave = 'sos_whatsapp_apikey';
  if v_chave is null then return; end if;

  select c.protocolo, c.tipo_ocorrencia, c.descricao, c.endereco, c.latitude, c.longitude, c.telefone_contato,
         c.recebido_em, cl.nome_razao as cliente, v.placa, v.marca, v.modelo
    into v_c
  from public.sos_chamados c
  join public.clientes cl on cl.id = c.cliente_id
  left join public.veiculos v on v.id = c.veiculo_id
  where c.id = p_chamado;

  v_texto := coalesce(p_cabecalho, '🚨 NOVO SOS TECNOAR') || E'\n\n'
    || 'Cliente: ' || v_c.cliente || E'\n'
    || 'Veículo: ' || coalesce(nullif(concat_ws(' ', v_c.marca, v_c.modelo), ''), '-') || E'\n'
    || 'Placa: ' || coalesce(v_c.placa, '-') || E'\n'
    || 'Problema: ' || public.sos_rotulo_ocorrencia(v_c.tipo_ocorrencia) || coalesce(' — ' || v_c.descricao, '') || E'\n'
    || 'Horário: ' || to_char(v_c.recebido_em at time zone 'America/Sao_Paulo', 'HH24:MI') || E'\n'
    || 'Telefone: ' || coalesce(v_c.telefone_contato, '-') || E'\n'
    || case when v_c.latitude is not null
         then 'Localização: https://maps.google.com/?q=' || v_c.latitude || ',' || v_c.longitude || E'\n'
         else coalesce('Localização: ' || v_c.endereco || E'\n', '') end
    || E'\nProtocolo:\n' || v_c.protocolo;

  foreach v_dest in array v_cfg.whatsapp_destinos loop
    perform net.http_post(
      url     := rtrim(v_cfg.whatsapp_url, '/') || '/message/sendText/' || v_cfg.whatsapp_instancia,
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_chave),
      body    := jsonb_build_object('number', regexp_replace(v_dest, '\D', '', 'g'), 'text', v_texto)
    );
  end loop;
exception when others then
  null;
end;
$$;

-- Veículo do cliente pela placa, sem duplicar: reaproveita o cadastro que
-- existir (mesma placa) e só cria quando não há nenhum.
create or replace function public.sos_garantir_veiculo(
  p_cliente uuid, p_placa text, p_descricao text default null, p_tipo text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_placa text := nullif(upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_id    uuid;
  v_dono  uuid;
begin
  if v_placa is null then return null; end if;
  select id, cliente_id into v_id, v_dono from public.veiculos
  where upper(regexp_replace(placa, '[^A-Za-z0-9]', '', 'g')) = v_placa
  order by (cliente_id = p_cliente) desc nulls last, (situacao = 'ativo') desc, updated_at desc
  limit 1;
  if v_id is not null then
    if v_dono is null then
      update public.veiculos set cliente_id = p_cliente where id = v_id;
    end if;
    return v_id;
  end if;
  insert into public.veiculos (cliente_id, placa, descricao, tipo)
  values (p_cliente, v_placa, coalesce(nullif(trim(p_descricao), ''), 'Veículo ' || v_placa),
          nullif(p_tipo, '')::public.tipo_veiculo)
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================== gatilhos
create or replace function public.sos_chamados_antes()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.protocolo := 'SOS-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') || '-' || lpad(new.numero::text, 6, '0');
    new.espera_desde := coalesce(new.espera_desde, now());
  else
    -- Nova espera (voltou para a fila, ou foi atribuído a outro mecânico):
    -- o prazo de aceite recomeça e os avisos do vigia zeram.
    if new.status in ('recebido', 'procurando_mecanico')
       and (new.mecanico_id is distinct from old.mecanico_id or old.status not in ('recebido', 'procurando_mecanico')) then
      new.espera_desde := now();
      new.alerta_nivel := 0;
      new.alerta_em := null;
    end if;
    -- Saída para o cliente: guarda a previsão inicial, base do "atrasado".
    if new.status = 'a_caminho' and old.status is distinct from 'a_caminho' then
      new.eta_inicial_min := new.eta_min;
      new.atraso_avisado_em := null;
      new.sinal_avisado_em := null;
    elsif new.mecanico_id is distinct from old.mecanico_id then
      new.eta_inicial_min := null;
      new.atraso_avisado_em := null;
      new.sinal_avisado_em := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sos_chamados_antes on public.sos_chamados;
create trigger sos_chamados_antes
  before insert or update on public.sos_chamados
  for each row execute function public.sos_chamados_antes();

-- Depois de nascer: avisa central, mecânicos disponíveis e WhatsApp. Depois
-- de mudar de status: avisa quem não fez a mudança.
create or replace function public.sos_chamados_depois()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_u        uuid;
  v_titulo   text;
  v_link_app text;
  v_link_sis text;
  v_cliente  text;
  v_mec      text;
  v_placa    text;
begin
  v_link_app := '/app/chamado/' || new.id;
  v_link_sis := '/sos?chamado=' || new.id;
  select nome_razao into v_cliente from public.clientes where id = new.cliente_id;
  select placa into v_placa from public.veiculos where id = new.veiculo_id;

  if tg_op = 'INSERT' then
    for v_u in select * from public.sos_usuarios_central() loop
      if v_u is distinct from auth.uid() then
        perform public.sos_notificar(v_u, '🚨 Novo SOS ' || new.protocolo,
          concat_ws(' · ', v_cliente, v_placa, public.sos_rotulo_ocorrencia(new.tipo_ocorrencia)), v_link_sis);
      end if;
    end loop;
    -- Só quem está disponível recebe o chamado automático.
    if new.status = 'procurando_mecanico' then
      for v_u in select m.usuario_id from public.sos_mecanicos m
                 join public.usuarios u on u.id = m.usuario_id and u.situacao = 'ativo'
                 where m.aceita_sos and m.situacao = 'disponivel' loop
        if v_u is distinct from auth.uid() then
          perform public.sos_notificar(v_u, '🚨 Novo SOS para aceitar',
            concat_ws(' · ', v_cliente, v_placa, public.sos_rotulo_ocorrencia(new.tipo_ocorrencia)), v_link_app);
        end if;
      end loop;
    end if;
    perform public.sos_avisar_whatsapp(new.id);
    return new;
  end if;

  if new.status is distinct from old.status then
    v_titulo := public.sos_rotulo_status(new.status) || ' · ' || new.protocolo;
    v_mec := coalesce((select split_part(nome_completo, ' ', 1) from public.usuarios where id = new.mecanico_id), 'O mecânico');

    -- Cliente
    if new.conta_usuario_id is not null and new.conta_usuario_id is distinct from auth.uid() then
      perform public.sos_notificar(new.conta_usuario_id, v_titulo,
        case new.status
          when 'aceito' then v_mec || ' aceitou seu chamado.'
          when 'a_caminho' then v_mec || ' está a caminho.' || coalesce(' Chegada em cerca de ' || new.eta_min || ' min.', '')
          when 'no_local' then v_mec || ' chegou ao local.'
          when 'servico_iniciado' then 'O serviço começou.'
          when 'servico_finalizado' then 'Serviço finalizado. Conte como foi o atendimento.'
          when 'concluido' then 'Obrigado por contar com a Tecnoar.'
          when 'cancelado' then coalesce('Motivo: ' || new.motivo_cancelamento, 'Chamado cancelado.')
          else null end,
        v_link_app);
    end if;

    -- Mecânico (quando a central cancela)
    if new.mecanico_id is not null and new.mecanico_id is distinct from auth.uid() and new.status = 'cancelado' then
      perform public.sos_notificar(new.mecanico_id, 'SOS cancelado · ' || new.protocolo,
        coalesce(new.motivo_cancelamento, v_cliente), v_link_app);
    end if;

    -- Central: só o que exige olhar (cancelamento, finalização)
    if new.status in ('cancelado', 'servico_finalizado') then
      for v_u in select * from public.sos_usuarios_central() loop
        if v_u is distinct from auth.uid() then
          perform public.sos_notificar(v_u, v_titulo, coalesce(v_cliente, ''), v_link_sis);
        end if;
      end loop;
    end if;
  end if;

  -- Atribuição pela central: o mecânico escolhido é avisado.
  if tg_op = 'UPDATE' and new.mecanico_id is not null and new.mecanico_id is distinct from old.mecanico_id
     and new.mecanico_id is distinct from auth.uid()
     and new.status in ('recebido', 'procurando_mecanico', 'a_caminho') then
    perform public.sos_notificar(new.mecanico_id, '🚨 SOS atribuído a você · ' || new.protocolo,
      concat_ws(' · ', v_cliente, v_placa, new.endereco), v_link_app);
  end if;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists sos_chamados_depois on public.sos_chamados;
create trigger sos_chamados_depois
  after insert or update on public.sos_chamados
  for each row execute function public.sos_chamados_depois();

-- Mensagem nova avisa o outro lado.
create or replace function public.sos_mensagens_depois()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c record;
begin
  select id, protocolo, conta_usuario_id, mecanico_id into v_c from public.sos_chamados where id = new.chamado_id;
  if new.autor_papel = 'cliente' then
    perform public.sos_notificar(v_c.mecanico_id, 'Mensagem do cliente · ' || v_c.protocolo, left(new.texto, 120), '/app/chamado/' || v_c.id);
  else
    perform public.sos_notificar(v_c.conta_usuario_id, 'Nova mensagem · ' || v_c.protocolo, left(new.texto, 120), '/app/chamado/' || v_c.id);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists sos_mensagens_depois on public.sos_mensagens;
create trigger sos_mensagens_depois
  after insert on public.sos_mensagens
  for each row execute function public.sos_mensagens_depois();;
