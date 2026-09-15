-- OS em campo: o app do mecânico gera a OS logo na chegada ("GERAR OS") e
-- segue registrando. Duas lacunas desse fluxo:
--
-- 1) O diagnóstico e o serviço registrados DEPOIS de gerar a OS não chegavam
--    a ela (só a geração copiava o texto). Agora o gatilho
--    `sos_chamados_texto_os` leva o texto do chamado para a OS sempre que ele
--    muda — sem atropelar o que a oficina já editou na OS (só troca o
--    diagnóstico se ele ainda é o que veio do SOS, e as observações se ainda
--    são o bloco "Atendimento SOS…") e nunca em OS encerrada. Na finalização,
--    sem serviço do catálogo, o serviço descrito entra como linha para a
--    oficina precificar (o mesmo que a geração faz).
-- 2) O mecânico não tinha como informar a quilometragem. `sos_registrar_km`
--    atualiza o veículo e a OS do chamado.

create or replace function public.sos_texto_para_os()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_obs text;
begin
  if new.os_id is null then return new; end if;
  if new.diagnostico is not distinct from old.diagnostico
     and new.servico_realizado is not distinct from old.servico_realizado
     and new.observacoes_finais is not distinct from old.observacoes_finais
     and new.os_id is not distinct from old.os_id
     and new.status is not distinct from old.status then
    return new;
  end if;

  -- Mesmo formato de `sos_gerar_os`: é por ele que sabemos que o bloco é do SOS.
  v_obs := concat_ws(E'\n', 'Atendimento SOS em ' || coalesce(new.endereco, 'local informado no app'),
                     nullif(trim(new.servico_realizado), ''), nullif(trim(new.observacoes_finais), ''));

  update public.ordens_servico o
  set diagnostico = case
        when coalesce(trim(o.diagnostico), '') in ('', coalesce(trim(old.diagnostico), ''))
          then coalesce(nullif(trim(new.diagnostico), ''), o.diagnostico)
        else o.diagnostico end,
      observacoes = case
        when coalesce(o.observacoes, '') = '' or o.observacoes like 'Atendimento SOS%' then v_obs
        else o.observacoes end
  where o.id = new.os_id and o.encerrada_em is null;

  -- Finalizou sem serviço do catálogo: o serviço descrito vira linha da OS.
  if new.status = 'servico_finalizado' and old.status is distinct from 'servico_finalizado'
     and nullif(trim(new.servico_realizado), '') is not null
     and not exists (select 1 from public.sos_itens where chamado_id = new.id and tipo = 'servico')
     and not exists (select 1 from public.os_servicos where os_id = new.os_id and descricao like 'Socorro: %')
     and exists (select 1 from public.ordens_servico where id = new.os_id and encerrada_em is null) then
    insert into public.os_servicos (os_id, descricao, quantidade, valor_unitario, ordem)
    values (new.os_id, left('Socorro: ' || new.servico_realizado, 200), 1, 0,
            (select coalesce(max(ordem), 0) + 1 from public.os_servicos where os_id = new.os_id));
  end if;
  return new;
end;
$$;

drop trigger if exists sos_chamados_texto_os on public.sos_chamados;
create trigger sos_chamados_texto_os
  after update of diagnostico, servico_realizado, observacoes_finais, status, os_id on public.sos_chamados
  for each row execute function public.sos_texto_para_os();

revoke execute on function public.sos_texto_para_os() from public, anon, authenticated;

-- Quilometragem informada em campo (mecânico do chamado ou central com `editar`).
create or replace function public.sos_registrar_km(p_chamado uuid, p_km integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c  public.sos_chamados;
  v_km integer;
begin
  if not public.sos_pode_atender(p_chamado) then raise exception 'Sem permissão.'; end if;
  select * into v_c from public.sos_chamados where id = p_chamado;
  if v_c.veiculo_id is null then raise exception 'Informe o veículo do chamado antes da quilometragem.'; end if;
  if p_km is null or p_km <= 0 or p_km > 9999999 then raise exception 'Quilometragem inválida.'; end if;
  select km_atual into v_km from public.veiculos where id = v_c.veiculo_id;
  if v_km is not null and p_km < v_km then
    raise exception 'A quilometragem informada (% km) é menor que a do cadastro (% km). Confira o painel.', p_km, v_km;
  end if;

  update public.veiculos set km_atual = p_km where id = v_c.veiculo_id;
  if v_c.os_id is not null then
    update public.ordens_servico set km = p_km where id = v_c.os_id and encerrada_em is null;
  end if;
  perform public.sos_registrar_evento(p_chamado, 'veiculo', 'Quilometragem registrada',
    to_char(p_km, 'FM9G999G999') || ' km', jsonb_build_object('km', p_km), null, null, null);
  return p_km;
end;
$$;

revoke execute on function public.sos_registrar_km(uuid, integer) from public, anon;
grant execute on function public.sos_registrar_km(uuid, integer) to authenticated;
