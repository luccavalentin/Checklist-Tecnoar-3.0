-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260912205623.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- SOS Tecnoar (parte 7/8): vigia (pulso do app, escalonamento, atraso, sem sinal).

-- ============================================================== vigia
-- Pulso do app do mecânico: "estou com o app aberto". O vigia usa para não
-- deixar "disponível" quem fechou o app há horas; a central vê "app visto há".
create or replace function public.sos_pulso()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.sos_presenca (usuario_id, visto_em)
  select auth.uid(), now() where exists (select 1 from public.usuarios where id = auth.uid())
  on conflict (usuario_id) do update set visto_em = now()
$$;

create or replace function public.sos_texto_duracao(p_seg integer)
returns text
language sql
immutable
as $$
  select case when p_seg < 90 then p_seg || ' s'
              when p_seg < 5400 then round(p_seg / 60.0) || ' min'
              else round(p_seg / 3600.0, 1) || ' h' end
$$;

-- Push para os mecânicos disponíveis que ainda não recusaram este chamado.
create or replace function public.sos_avisar_mecanicos(p_chamado uuid, p_titulo text, p_mensagem text, p_exceto uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_u uuid; v_n integer := 0;
begin
  for v_u in
    select m.usuario_id from public.sos_mecanicos m
    join public.usuarios u on u.id = m.usuario_id and u.situacao = 'ativo'
    where m.aceita_sos and m.situacao = 'disponivel'
      and m.usuario_id is distinct from p_exceto
      and not exists (select 1 from public.sos_recusas r where r.chamado_id = p_chamado and r.mecanico_id = m.usuario_id)
  loop
    perform public.sos_notificar(v_u, p_titulo, p_mensagem, '/app/chamado/' || p_chamado);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Roda a cada 30 s (pg_cron). É o que garante que nenhum SOS fica esquecido:
--   1. ninguém aceitou no prazo → avisa de novo mecânicos e central, subindo o
--      tom (1×, 3× e 6× o prazo de aceite); atribuição direta sem resposta
--      volta para todos no modo inteligente;
--   2. deslocamento atrasado, ou sem posição do mecânico → central, e o próprio
--      mecânico recebe um push para reabrir o app;
--   3. serviço finalizado sem avaliação por muito tempo → concluído;
--   4. "disponível" com o app fechado há horas → offline (o despacho não conta
--      com quem não vai responder).
-- Cada aviso é marcado no chamado e sai uma vez só.
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

  return jsonb_build_object('ok', true, 'espera', n_espera, 'devolvidos', n_devolv, 'atrasos', n_atraso,
                            'sem_sinal', n_sinal, 'concluidos', n_concl, 'offline', n_off);
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
