-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260913014324.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

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
  v_c        public.sos_chamados;
  v_papel    public.sos_papel := public.sos_papel_atual();
  v_cfg      public.sos_config;
  v_ok       boolean;
  v_dist     numeric;
  v_quando   timestamptz := now();
  v_aparelho timestamptz;
  v_anterior timestamptz;
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

  -- Hora do toque, vinda da fila do aparelho (ver o cabeçalho).
  if nullif(p_dados->>'registrado_no_aparelho_em', '') is not null then
    begin
      v_aparelho := (p_dados->>'registrado_no_aparelho_em')::timestamptz;
    exception when others then
      v_aparelho := null;
    end;
    if v_aparelho is not null and v_aparelho < now() and v_aparelho > now() - interval '12 hours' then
      v_anterior := coalesce(case p_status
        when 'a_caminho' then v_c.aceito_em
        when 'no_local' then v_c.a_caminho_em
        when 'servico_iniciado' then v_c.chegou_em
        when 'servico_finalizado' then v_c.iniciado_em
        when 'concluido' then v_c.finalizado_em
      end, v_c.recebido_em);
      v_quando := greatest(v_aparelho, v_anterior);
    end if;
  end if;

  -- "Cheguei" com GPS longe do cliente fica registrado (sem bloquear: o
  -- pino pode estar errado). A central vê a distância na linha do tempo.
  if p_status = 'no_local' then
    v_dist := public.sos_distancia_km(p_lat, p_lng, v_c.latitude, v_c.longitude);
  end if;

  update public.sos_chamados
  set status = p_status,
      a_caminho_em = case when p_status = 'a_caminho' then v_quando else a_caminho_em end,
      chegou_em = case when p_status = 'no_local' then v_quando else chegou_em end,
      iniciado_em = case when p_status = 'servico_iniciado' then v_quando else iniciado_em end,
      finalizado_em = case when p_status = 'servico_finalizado' then v_quando else finalizado_em end,
      concluido_em = case when p_status = 'concluido' then v_quando else concluido_em end,
      diagnostico = coalesce(nullif(trim(p_dados->>'diagnostico'), ''), diagnostico),
      servico_realizado = coalesce(nullif(trim(p_dados->>'servico_realizado'), ''), servico_realizado),
      observacoes_finais = coalesce(nullif(trim(p_dados->>'observacoes'), ''), observacoes_finais),
      pecas_utilizadas = coalesce(nullif(trim(p_dados->>'pecas'), ''), pecas_utilizadas),
      tempo_deslocamento_seg = case when p_status = 'no_local' and a_caminho_em is not null
                                    then extract(epoch from v_quando - a_caminho_em)::int else tempo_deslocamento_seg end,
      tempo_servico_seg = case when p_status = 'servico_finalizado' and iniciado_em is not null
                               then extract(epoch from v_quando - iniciado_em)::int else tempo_servico_seg end,
      tempo_total_seg = case when p_status in ('servico_finalizado', 'concluido')
                             then extract(epoch from v_quando - recebido_em)::int else tempo_total_seg end,
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
    jsonb_build_object('status', p_status, 'distancia_km', v_dist)
      || coalesce(p_dados, '{}'::jsonb)
      -- A hora que valeu para a etapa, quando não foi a do servidor.
      || case when v_quando < now() then jsonb_build_object('hora_da_etapa', v_quando) else '{}'::jsonb end,
    p_lat, p_lng, v_papel);

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

revoke execute on function public.sos_avancar(uuid, public.sos_status, double precision, double precision, jsonb) from public, anon;
grant execute on function public.sos_avancar(uuid, public.sos_status, double precision, double precision, jsonb) to authenticated;;
