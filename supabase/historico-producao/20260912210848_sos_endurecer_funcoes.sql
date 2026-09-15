-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260912210848.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

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
  -- pg_cron roda sem usuário; pela tela, só a central.
  if auth.uid() is not null and not public.tem_permissao('sos', 'editar') then raise exception 'Sem permissão.'; end if;
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

revoke execute on function public.sos_nome_conta(uuid) from authenticated;

-- Funções sem `security definer` também ficam com search_path fixo.
alter function public.sos_rotulo_status(public.sos_status) set search_path = public, pg_temp;
alter function public.sos_rotulo_ocorrencia(public.sos_tipo_ocorrencia) set search_path = public, pg_temp;
alter function public.sos_distancia_km(double precision, double precision, double precision, double precision) set search_path = public, pg_temp;
alter function public.sos_texto_duracao(integer) set search_path = public, pg_temp;
alter function public.sos_mecanicos_antes() set search_path = public, pg_temp;
alter function public.sos_chamados_antes() set search_path = public, pg_temp;;
