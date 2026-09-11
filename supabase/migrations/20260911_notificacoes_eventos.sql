-- Eventos que geram notificação.
--
-- Até aqui nada no banco inseria em `notificacoes`: o sino nunca mostrou nada
-- e o push, mesmo pronto, não tinha o que enviar. Três avisos, escolhidos com
-- a oficina:
--
--   1. Mecânico escalado em OS          — gatilho, na hora
--   2. Peça em teste com prazo vencido   — verificação a cada 15 min
--   3. OS que passou da previsão         — verificação a cada 15 min
--
-- Cada notificação inserida aciona o gatilho `notificacoes_push`, que envia ao
-- aparelho. Aplicada no projeto zdhebeqlhynffxfmedvj em 11/09/2026.

-- Aviso de prazo sai uma vez só. A chave inclui o prazo: se ele for adiado e
-- vencer de novo, o aviso volta — é outro atraso.
create table if not exists privado.avisos_enviados (
  chave     text primary key,
  criado_em timestamptz not null default now()
);

-- 1. Mecânico escalado em OS: aviso imediato ------------------------------------
create or replace function public.avisar_mecanico_escalado()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_os record;
begin
  -- Quem se escala sozinho não precisa ser avisado do que acabou de fazer.
  if new.usuario_id = auth.uid() then
    return new;
  end if;

  select o.id, o.numero, v.placa, v.marca, v.modelo
    into v_os
  from ordens_servico o
  left join veiculos v on v.id = o.veiculo_id
  where o.id = new.os_id;
  if not found then
    return new;
  end if;

  insert into notificacoes (usuario_id, tipo, titulo, mensagem, link)
  values (
    new.usuario_id,
    'sistema',
    'Você foi escalado na OS ' || lpad(v_os.numero::text, 5, '0'),
    nullif(concat_ws(' · ', v_os.placa, nullif(concat_ws(' ', v_os.marca, v_os.modelo), '')), ''),
    '/operacao/ordens-de-servico?os=' || v_os.id
  );
  return new;
exception when others then
  -- Aviso é a mais. Nunca pode impedir a escala do mecânico.
  return new;
end;
$$;

drop trigger if exists os_mecanicos_aviso on public.os_mecanicos;
create trigger os_mecanicos_aviso
  after insert on public.os_mecanicos
  for each row execute function public.avisar_mecanico_escalado();

-- 2 e 3. Prazos vencidos: verificação periódica -------------------------------
create or replace function public.avisar_prazos()
returns void
language plpgsql
security definer
set search_path = public, privado, pg_temp
as $$
declare
  r      record;
  v_qtd  integer;
begin
  -- Peça pendente no laboratório. Reparada, reprovada, aguardando cliente e
  -- entregue já saíram da bancada: prazo de teste não se aplica mais.
  for r in
    select p.id, p.protocolo, p.descricao, p.mecanico_id,
           'peca_prazo:' || p.id || ':' || extract(epoch from p.prazo_em)::bigint as chave
    from pecas_teste p
    where p.prazo_em < now()
      and p.mecanico_id is not null
      and p.status in ('recebida', 'aguardando_teste', 'em_teste', 'aguardando_peca')
      and not exists (
        select 1 from privado.avisos_enviados a
        where a.chave = 'peca_prazo:' || p.id || ':' || extract(epoch from p.prazo_em)::bigint
      )
  loop
    -- O registro vem antes do aviso: se duas execuções se cruzarem, só a que
    -- gravou a chave avisa.
    insert into privado.avisos_enviados (chave) values (r.chave) on conflict do nothing;
    if found then
      insert into notificacoes (usuario_id, tipo, titulo, mensagem, link)
      values (
        r.mecanico_id,
        'sistema',
        'Prazo vencido: ' || coalesce(r.protocolo, 'peça em teste'),
        r.descricao,
        '/operacao/pecas-em-teste'
      );
    end if;
  end loop;

  -- OS aberta que passou da previsão: avisa os mecânicos da OS. Sem mecânico
  -- escalado, a chave não é gravada — o aviso sai quando alguém for escalado,
  -- em vez de se perder numa OS sem ninguém.
  for r in
    select o.id, o.numero, o.previsao_em, v.placa,
           'os_previsao:' || o.id || ':' || extract(epoch from o.previsao_em)::bigint as chave
    from ordens_servico o
    left join veiculos v on v.id = o.veiculo_id
    where o.previsao_em < now()
      and o.encerrada_em is null
      and o.situacao = 'ativo'
      and not exists (
        select 1 from privado.avisos_enviados a
        where a.chave = 'os_previsao:' || o.id || ':' || extract(epoch from o.previsao_em)::bigint
      )
  loop
    with inseridas as (
      insert into notificacoes (usuario_id, tipo, titulo, mensagem, link)
      select m.usuario_id,
             'sistema',
             'OS ' || lpad(r.numero::text, 5, '0') || ' passou da previsão',
             concat_ws(' · ', r.placa,
                       'Prevista para ' || to_char(r.previsao_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')),
             '/operacao/ordens-de-servico?os=' || r.id
      from os_mecanicos m
      where m.os_id = r.id
      returning 1
    )
    select count(*) into v_qtd from inseridas;

    if v_qtd > 0 then
      insert into privado.avisos_enviados (chave) values (r.chave) on conflict do nothing;
    end if;
  end loop;
end;
$$;

revoke execute on function public.avisar_prazos() from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid) from cron.job where jobname = 'tecnoar-avisos-de-prazo';
select cron.schedule('tecnoar-avisos-de-prazo', '*/15 * * * *', 'select public.avisar_prazos()');
