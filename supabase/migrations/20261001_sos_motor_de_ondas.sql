-- SOS Tecnoar — o motor de despacho em ondas.
-- Roda depois de 20260930_sos_ofertas_e_politica.sql. Idempotente.
--
-- O chamado deixa de ser gritado para todo mundo e passa a ser OFERECIDO, em
-- ondas que se abrem no tempo e no espaço:
--
--   caminhoneiro aperta SOS
--     └─ onda 1: Tecnoar, 0–60 km, exclusiva ....... 90 s
--     └─ onda 2: Tecnoar, 0–60 km, todos ........... 90 s
--     └─ onda 3: Tecnoar, 60–120 km ................ 120 s
--     └─ onda 4: parceiro ouro/prata, 0–60 km ...... 120 s
--     └─ onda 5: parceiro, qualquer raio ........... até alguém aceitar
--
-- Quem decide as faixas é `sos_politica_despacho`, não este código. Aqui está
-- só a mecânica: achar os candidatos, criar as ofertas, esperar, virar a onda.
--
-- Decisões que vale registrar:
--
-- * Distância sem PostGIS. O Supabase tem a extensão, mas a suíte
--   `npm run test:sos` roda em PGlite, que não. Perder 171 etapas de teste
--   custa mais do que o índice ganha, então o corte do raio é feito por
--   PRÉ-FILTRO DE RETÂNGULO (`latitude between … and longitude between …`,
--   que usa o índice `sos_mecanicos_posicao_ix`) e só os sobreviventes do
--   retângulo passam pelo haversine exato de `sos_distancia_km`. Mesmo efeito
--   prático, qualquer Postgres. Trocar por ST_DWithin depois é mexer só em
--   `sos_candidatos`.
--
-- * A distância é em linha reta. 60 km de reta na serra é mais de uma hora de
--   estrada; o número honesto viria do OSRM. O pré-filtro é reta de propósito
--   (é o que o índice sabe fazer) e a previsão de chegada continua sendo
--   recalculada pela rota depois do aceite, como já era.
--
-- * Posição velha não vale distância: mecânico pode ter andado 200 km desde a
--   última leitura. Sem posição recente, vale a base do prestador; sem base,
--   ele só entra nas ondas marcadas `aceita_sem_posicao` (as de reforço), para
--   que ninguém fique sem socorro por estar com a tela apagada.
--
-- * `sos_avisar_mecanicos` passou a respeitar a oferta. Era por ali que o
--   vigia re-notificava "todos os disponíveis" quando ninguém aceitava — o que
--   furaria o raio a cada 30 s. Com a mudança, o vigia inteiro passa a
--   respeitar as ondas sem precisar ser reescrito.

-- ============================================================ candidatos
-- Quem pode receber a oferta desta onda, do melhor para o pior. Não cria
-- nada: é a consulta que o despacho e a central usam para olhar antes.
create or replace function public.sos_candidatos(p_chamado uuid, p_politica uuid)
returns table (
  mecanico_id uuid, prestador_id uuid, nome text, prestador text,
  tipo public.sos_tipo_prestador, nivel public.sos_nivel_prestador,
  situacao public.sos_situacao_mecanico, distancia_km numeric, eta_min integer,
  por_base boolean, afinidade boolean, atendimentos_hoje integer, nota_media numeric,
  pontuacao numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with c as (select * from public.sos_chamados where id = p_chamado),
  pol as (select * from public.sos_politica_despacho where id = p_politica),
  cfg as (select velocidade_media_kmh, posicao_valida_min from public.sos_config where singleton),
  -- Retângulo em volta do veículo parado. 111,045 km = 1 grau de latitude; a
  -- longitude encurta com o cosseno da latitude. O greatest() evita divisão
  -- por zero perto dos polos (não é o caso do Brasil, mas sai de graça).
  caixa as (
    select
      c.latitude  - pol.raio_max_km / 111.045 as lat_min,
      c.latitude  + pol.raio_max_km / 111.045 as lat_max,
      c.longitude - pol.raio_max_km / (111.045 * greatest(cos(radians(c.latitude)), 0.01)) as lng_min,
      c.longitude + pol.raio_max_km / (111.045 * greatest(cos(radians(c.latitude)), 0.01)) as lng_max
    from c cross join pol
  ),
  -- Palavras que ligam o problema relatado às especialidades cadastradas.
  chave as (
    select case c.tipo_ocorrencia::text
      when 'freios' then '(frei|pneum|ar compr)'
      when 'pane_eletrica' then '(el[eé]tr|bateria)'
      when 'nao_liga' then '(el[eé]tr|bateria|partida|motor)'
      when 'roda_pneu' then '(pneu|roda|borrach)'
      when 'mecanico' then '(mec[aâ]n|motor|suspens|transmiss)'
      when 'vazamento' then '(vazam|hidr|pneum|arrefec)'
      when 'parado' then '(mec[aâ]n|motor|frei|el[eé]tr)'
      else null end as rx
    from c
  ),
  base as (
    select
      m.usuario_id, m.prestador_id, u.nome_completo, p.nome as prestador_nome,
      p.tipo, p.nivel, m.situacao,
      (m.posicao_em > now() - make_interval(mins => cfg.posicao_valida_min)) as posicao_boa,
      case when m.posicao_em > now() - make_interval(mins => cfg.posicao_valida_min)
           then public.sos_distancia_km(m.latitude, m.longitude, c.latitude, c.longitude)
           else public.sos_distancia_km(p.base_latitude, p.base_longitude, c.latitude, c.longitude)
      end as dist,
      p.raio_atuacao_km, pol.raio_min_km, pol.raio_max_km, pol.aceita_sem_posicao,
      cfg.velocidade_media_kmh,
      (select string_agg(e.nome, ', ') from public.usuario_especialidades ue
         join public.especialidades e on e.id = ue.especialidade_id where ue.usuario_id = u.id) as especialidades,
      chave.rx,
      (select count(*)::int from public.sos_chamados x where x.mecanico_id = u.id
         and x.recebido_em > date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as hoje,
      (select round(avg(x.avaliacao_nota), 1) from public.sos_chamados x
         where x.mecanico_id = u.id and x.avaliacao_nota is not null) as nota
    from public.sos_mecanicos m
    join public.usuarios u on u.id = m.usuario_id and u.situacao = 'ativo'
    join public.sos_prestadores p on p.id = m.prestador_id
    cross join c cross join pol cross join cfg cross join caixa cross join chave
    where m.aceita_sos
      and m.situacao = any (pol.situacoes)
      and p.situacao = 'ativo'
      and (pol.tipo_prestador is null or p.tipo = pol.tipo_prestador)
      and (cardinality(pol.niveis) = 0 or p.nivel = any (pol.niveis))
      -- Parceiro de borracharia não recebe pane elétrica.
      and (cardinality(p.atende_tipos) = 0 or c.tipo_ocorrencia = any (p.atende_tipos))
      -- Quem já está com um socorro em andamento não recebe outro.
      and not exists (select 1 from public.sos_chamados x
                      where x.mecanico_id = m.usuario_id
                        and x.status in ('a_caminho', 'no_local', 'servico_iniciado'))
      and not exists (select 1 from public.sos_recusas r
                      where r.chamado_id = p_chamado and r.mecanico_id = m.usuario_id)
      -- Já recebeu oferta deste chamado numa onda anterior: não repete.
      and not exists (select 1 from public.sos_ofertas o
                      where o.chamado_id = p_chamado and o.mecanico_id = m.usuario_id)
      -- PRÉ-FILTRO: só quem cai no retângulo entra no cálculo exato. Quem não
      -- tem posição nem base passa aqui e é filtrado depois por
      -- `aceita_sem_posicao`.
      and (
        (m.posicao_em > now() - make_interval(mins => cfg.posicao_valida_min)
         and m.latitude between caixa.lat_min and caixa.lat_max
         and m.longitude between caixa.lng_min and caixa.lng_max)
        or (coalesce(m.posicao_em, '-infinity'::timestamptz) <= now() - make_interval(mins => cfg.posicao_valida_min)
            and p.base_latitude between caixa.lat_min and caixa.lat_max
            and p.base_longitude between caixa.lng_min and caixa.lng_max)
        or (pol.aceita_sem_posicao
            and coalesce(m.posicao_em, '-infinity'::timestamptz) <= now() - make_interval(mins => cfg.posicao_valida_min)
            and (p.base_latitude is null or p.base_longitude is null))
      )
  ),
  elegivel as (
    select b.*,
      case when b.dist is not null then greatest(1, ceil(b.dist / b.velocidade_media_kmh * 60))::int end as eta,
      coalesce(b.rx is not null and b.especialidades ~* b.rx, false) as afin
    from base b
    where
      -- Com distância conhecida, tem de estar na faixa da onda. O
      -- `raio_atuacao_km` é o compromisso do PARCEIRO: a Tecnoar vai onde a
      -- central mandar, e é por isso que a última onda alcança o país.
      (b.dist is not null and b.dist >= b.raio_min_km and b.dist <= b.raio_max_km
       and (b.tipo = 'proprio' or b.dist <= b.raio_atuacao_km))
      -- Sem distância, só nas ondas que aceitam.
      or (b.dist is null and b.aceita_sem_posicao)
  )
  select
    e.usuario_id, e.prestador_id, e.nome_completo, e.prestador_nome,
    e.tipo, e.nivel, e.situacao, e.dist, e.eta, not e.posicao_boa, e.afin, e.hoje, e.nota,
    -- Quanto maior, melhor. Distância pesa mais; prestador próprio e
    -- especialidade desempatam forte. Sem distância, perde para quem tem.
    round((
      case e.situacao when 'disponivel' then 100 when 'pausa' then 20 when 'em_atendimento' then 10 else 0 end
      + case when e.dist is null then -20 else greatest(0, 60 - e.dist) end
      + case when e.tipo = 'proprio' then 40 else 0 end
      + case e.nivel when 'ouro' then 15 when 'prata' then 8 else 0 end
      + case when e.afin then 25 else 0 end
      - e.hoje * 4
      + coalesce(e.nota, 3) * 2
    )::numeric, 1)
  from elegivel e
  order by 14 desc, e.dist asc nulls last, e.nome_completo
$$;

-- ============================================================== despacho
-- Abre a próxima onda do chamado: acha a política, cria as ofertas, avisa.
-- Idempotente por onda (índice único em chamado+mecânico+onda) e seguro em
-- chamadas simultâneas (lock na linha do chamado).
--
-- Onda sem candidato nenhum não faz ninguém esperar: o despacho segue para a
-- seguinte na mesma transação. Quem está parado na pista não deve cumprir 90
-- segundos de cronômetro por uma onda vazia.
create or replace function public.sos_despachar(p_chamado uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c       public.sos_chamados;
  v_cfg     public.sos_config;
  v_pol     public.sos_politica_despacho;
  v_cand    record;
  v_n       integer := 0;
  v_espera  integer;
  v_cliente text;
  v_placa   text;
  v_u       uuid;
  v_onda    integer;
  v_vazias  integer := 0;
  v_voltas  integer := 0;
begin
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  select * into v_cfg from public.sos_config where singleton;
  if not coalesce(v_cfg.despacho_em_ondas, false) then
    return jsonb_build_object('ok', false, 'motivo', 'despacho_em_ondas_desligado');
  end if;
  -- Já tem mecânico, ou já saiu da fila: nada a oferecer.
  if v_c.mecanico_id is not null or v_c.status not in ('recebido', 'procurando_mecanico') then
    return jsonb_build_object('ok', false, 'motivo', 'fora_da_fila', 'status', v_c.status);
  end if;

  select nome_razao into v_cliente from public.clientes where id = v_c.cliente_id;
  select placa into v_placa from public.veiculos where id = v_c.veiculo_id;
  v_onda := v_c.onda_atual;

  <<ondas>>
  loop
  v_voltas := v_voltas + 1;
  -- Trava de segurança: política mal configurada não vira laço infinito.
  exit ondas when v_voltas > 20;

  -- A próxima onda cuja regra vale para esta prioridade.
  select * into v_pol from public.sos_politica_despacho
  where ativo and ordem > v_onda
    and (cardinality(prioridades) = 0 or v_c.prioridade = any (prioridades))
  order by ordem limit 1;

  if not found then
    -- Acabaram as ondas. O chamado NÃO é cancelado: fica na fila para a
    -- central assumir na mão, e ela é avisada uma vez só.
    if v_c.sem_prestador_em is null then
      update public.sos_chamados
      set sem_prestador_em = now(), onda_expira_em = null, onda_atual = v_onda
      where id = p_chamado;
      for v_u in select * from public.sos_usuarios_central() loop
        perform public.sos_notificar(v_u, '⚠️ SOS sem prestador · ' || v_c.protocolo,
          concat_ws(' · ', v_cliente, 'Nenhum mecânico aceitou em nenhuma onda. Assuma na mão.'),
          '/sos?chamado=' || p_chamado);
      end loop;
      perform public.sos_registrar_evento(p_chamado, 'despacho', 'Sem prestador disponível',
        'As ondas de despacho terminaram sem ninguém para oferecer.',
        jsonb_build_object('onda', v_onda, 'ondas_vazias', v_vazias), null, null, 'sistema');
    end if;
    return jsonb_build_object('ok', false, 'motivo', 'sem_ondas', 'onda', v_onda,
                              'ondas_vazias', v_vazias);
  end if;

  -- Emergência espera menos.
  v_espera := case
    when v_pol.espera_seg = 0 then 0
    when v_c.prioridade = 'emergencia'
      then greatest(20, ceil(v_pol.espera_seg * coalesce(v_cfg.onda_emergencia_pct, 50) / 100.0)::int)
    else v_pol.espera_seg end;

  v_n := 0;
  for v_cand in select * from public.sos_candidatos(p_chamado, v_pol.id) loop
    insert into public.sos_ofertas
      (chamado_id, mecanico_id, prestador_id, onda, politica_id, distancia_km, eta_min, por_base, expira_em)
    values
      (p_chamado, v_cand.mecanico_id, v_cand.prestador_id, v_pol.ordem, v_pol.id,
       v_cand.distancia_km, v_cand.eta_min, v_cand.por_base,
       case when v_espera > 0 then now() + make_interval(secs => v_espera) end)
    on conflict (chamado_id, mecanico_id, onda) do nothing;
    if found then
      v_n := v_n + 1;
      perform public.sos_notificar(v_cand.mecanico_id, '🚨 Novo SOS para aceitar',
        concat_ws(' · ', v_cliente, v_placa, public.sos_rotulo_ocorrencia(v_c.tipo_ocorrencia),
                  case when v_cand.distancia_km is not null
                       then round(v_cand.distancia_km)::text || ' km' end),
        '/app/chamado/' || p_chamado);
    end if;
  end loop;

  -- Ninguém elegível: não há o que esperar, vai para a onda seguinte agora.
  if v_n = 0 then
    v_vazias := v_vazias + 1;
    v_onda := v_pol.ordem;
    continue ondas;
  end if;

  update public.sos_chamados
  set onda_atual = v_pol.ordem,
      onda_em = now(),
      onda_expira_em = case when v_espera > 0 then now() + make_interval(secs => v_espera) end,
      status = case when status = 'recebido' then 'procurando_mecanico'::public.sos_status else status end,
      espera_desde = coalesce(espera_desde, now())
  where id = p_chamado;

  perform public.sos_registrar_evento(p_chamado, 'despacho',
    'Onda ' || v_pol.ordem || ' · ' || v_pol.nome,
    v_n || ' mecânico(s) avisado(s).'
      || case when v_vazias > 0 then ' ' || v_vazias || ' onda(s) anterior(es) sem ninguém elegível.' else '' end,
    jsonb_build_object('onda', v_pol.ordem, 'politica', v_pol.nome, 'ofertas', v_n,
                       'raio_km', jsonb_build_array(v_pol.raio_min_km, v_pol.raio_max_km),
                       'espera_seg', v_espera, 'ondas_vazias', v_vazias),
    null, null, 'sistema');

  return jsonb_build_object('ok', true, 'onda', v_pol.ordem, 'nome', v_pol.nome,
                            'ofertas', v_n, 'espera_seg', v_espera, 'ondas_vazias', v_vazias);
  end loop ondas;

  return jsonb_build_object('ok', false, 'motivo', 'voltas_demais', 'onda', v_onda);
end;
$$;

-- ========================================================= girar as ondas
-- Roda no pg_cron junto do vigia: fecha oferta vencida e abre a onda
-- seguinte de quem ficou sem resposta.
create or replace function public.sos_girar_ondas()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id      uuid;
  n_expira  integer := 0;
  n_ondas   integer := 0;
begin
  -- Execuções sobrepostas (cron atrasado) não duplicam ofertas.
  if not pg_try_advisory_xact_lock(hashtext('sos_girar_ondas')) then
    return jsonb_build_object('ok', false, 'motivo', 'em_execucao');
  end if;
  if not public.sos_despacho_em_ondas() then
    return jsonb_build_object('ok', false, 'motivo', 'desligado');
  end if;

  update public.sos_ofertas
  set resposta = 'expirada', respondida_em = now()
  where resposta is null and expira_em is not null and expira_em <= now();
  n_expira := coalesce((select count(*)::int from public.sos_ofertas
                        where resposta = 'expirada' and respondida_em >= now() - interval '1 minute'), 0);

  for v_id in
    select id from public.sos_chamados
    where status in ('recebido', 'procurando_mecanico')
      and mecanico_id is null
      and onda_expira_em is not null
      and onda_expira_em <= now()
    order by prioridade desc, recebido_em
    limit 200
  loop
    perform public.sos_despachar(v_id);
    n_ondas := n_ondas + 1;
  end loop;

  return jsonb_build_object('ok', true, 'ofertas_expiradas', n_expira, 'ondas_abertas', n_ondas);
end;
$$;

-- ============================================================== aceitar
-- Igual ao de antes, com três acréscimos: só aceita quem tem oferta aberta
-- (ou atribuição da central), fecha as outras ofertas na mesma transação e
-- grava o prestador que atendeu.
create or replace function public.sos_aceitar(p_chamado uuid, p_lat double precision default null, p_lng double precision default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c     public.sos_chamados;
  v_cfg   public.sos_config;
  v_dist  numeric;
  v_atual uuid;
  v_prest uuid;
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

  -- Chamado despachado em ondas é de quem recebeu a oferta. Quem a central
  -- escolheu (`sos_atribuir`) também ganha oferta, então passa aqui.
  -- `onda_atual = 0` é chamado que nunca passou pelo despacho — modo manual
  -- de distribuição, em que a fila é da central: aí vale a regra antiga.
  if public.sos_despacho_em_ondas()
     and v_c.onda_atual > 0
     and v_c.mecanico_id is distinct from auth.uid()
     and not public.sos_tem_oferta(p_chamado) then
    raise exception 'Este chamado não está oferecido a você.';
  end if;

  select chamado_atual_id into v_atual from public.sos_mecanicos where usuario_id = auth.uid();
  if v_atual is not null and v_atual <> p_chamado and exists (
    select 1 from public.sos_chamados where id = v_atual and status not in ('servico_finalizado', 'concluido', 'cancelado')
  ) then
    raise exception 'Termine o atendimento atual antes de aceitar outro.';
  end if;
  select * into v_cfg from public.sos_config where singleton;

  v_dist := public.sos_distancia_km(p_lat, p_lng, v_c.latitude, v_c.longitude);
  select prestador_id into v_prest from public.sos_mecanicos where usuario_id = auth.uid();

  update public.sos_chamados
  set mecanico_id = auth.uid(), status = 'a_caminho', aceito_em = now(), a_caminho_em = now(),
      atribuido_em = coalesce(atribuido_em, now()),
      prestador_id = coalesce(v_prest, public.sos_prestador_proprio()),
      tempo_aceite_seg = extract(epoch from now() - recebido_em)::int,
      distancia_km = coalesce(v_dist, distancia_km),
      onda_expira_em = null,
      eta_min = case when v_dist is not null then greatest(1, ceil(v_dist / v_cfg.velocidade_media_kmh * 60))::int else eta_min end
  where id = p_chamado;

  -- A oferta de quem aceitou vira 'aceita'; as outras saem da tela dos
  -- demais na mesma transação (o Realtime leva a baixa na hora).
  update public.sos_ofertas
  set resposta = case when mecanico_id = auth.uid() then 'aceita'::public.sos_resposta_oferta
                      else 'cancelada'::public.sos_resposta_oferta end,
      respondida_em = now()
  where chamado_id = p_chamado and resposta is null;

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

-- ============================================================== recusar
-- Marca a oferta e, se a onda esgotou (todo mundo respondeu), abre a
-- seguinte na hora, sem esperar o prazo.
create or replace function public.sos_recusar(p_chamado uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_c public.sos_chamados; v_abertas integer;
begin
  if not public.sos_eh_mecanico() then raise exception 'Só mecânicos recusam chamados.'; end if;
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  insert into public.sos_recusas (chamado_id, mecanico_id, motivo) values (p_chamado, auth.uid(), p_motivo);

  update public.sos_ofertas
  set resposta = 'recusada', respondida_em = now(), motivo = p_motivo
  where chamado_id = p_chamado and mecanico_id = auth.uid() and resposta is null;

  -- Atribuição direta recusada volta para a fila e a central fica sabendo.
  if v_c.mecanico_id = auth.uid() and v_c.status in ('recebido', 'procurando_mecanico') then
    update public.sos_chamados set mecanico_id = null, atribuido_em = null, atribuido_por = null,
      status = 'procurando_mecanico' where id = p_chamado;
    select * into v_c from public.sos_chamados where id = p_chamado;
  end if;
  perform public.sos_registrar_evento(p_chamado, 'recusa', 'Mecânico recusou', p_motivo, null, null, null, 'mecanico');

  if public.sos_despacho_em_ondas() and v_c.mecanico_id is null
     and v_c.status in ('recebido', 'procurando_mecanico') then
    select count(*)::int into v_abertas from public.sos_ofertas
    where chamado_id = p_chamado and resposta is null;
    -- Ninguém mais para responder nesta onda: não faz sentido o caminhoneiro
    -- esperar o cronômetro acabar.
    if v_abertas = 0 then perform public.sos_despachar(p_chamado); end if;
  end if;
end;
$$;

-- ============================================================= atribuir
-- A central escolhendo o mecânico cria a oferta dele: assim ele vê o chamado
-- pela RLS e o aceite passa pela mesma porta de todo mundo.
create or replace function public.sos_atribuir(p_chamado uuid, p_mecanico uuid, p_confirmar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_c public.sos_chamados; v_nome text; v_prest uuid; v_r jsonb;
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

  select prestador_id into v_prest from public.sos_mecanicos where usuario_id = p_mecanico;
  v_prest := coalesce(v_prest, public.sos_prestador_proprio());

  update public.sos_chamados
  set mecanico_id = p_mecanico, atribuido_em = now(), atribuido_por = auth.uid(),
      prestador_id = v_prest,
      status = case when p_confirmar and status in ('recebido', 'procurando_mecanico') then 'a_caminho'
                    when not p_confirmar and status in ('recebido') then 'procurando_mecanico'
                    else status end,
      aceito_em = case when p_confirmar then coalesce(aceito_em, now()) else aceito_em end,
      a_caminho_em = case when p_confirmar then coalesce(a_caminho_em, now()) else a_caminho_em end,
      onda_expira_em = case when p_confirmar then null else onda_expira_em end,
      tempo_aceite_seg = case when p_confirmar then coalesce(tempo_aceite_seg, extract(epoch from now() - recebido_em)::int) else tempo_aceite_seg end
  where id = p_chamado;

  -- Oferta da escolha da central: onda 0, para não disputar numeração com as
  -- ondas automáticas, e sem prazo (quem decide é a central).
  if not p_confirmar then
    insert into public.sos_ofertas
      (chamado_id, mecanico_id, prestador_id, onda, distancia_km, eta_min, expira_em)
    values (p_chamado, p_mecanico, v_prest, 0, v_c.distancia_km, v_c.eta_min, null)
    on conflict (chamado_id, mecanico_id, onda) do update
      set resposta = null, respondida_em = null, enviada_em = now();
  end if;

  insert into public.sos_mecanicos (usuario_id, chamado_atual_id, situacao)
  values (p_mecanico, case when p_confirmar then p_chamado end, case when p_confirmar then 'em_atendimento'::public.sos_situacao_mecanico else 'offline' end)
  on conflict (usuario_id) do update
    set chamado_atual_id = coalesce(excluded.chamado_atual_id, public.sos_mecanicos.chamado_atual_id),
        situacao = case when p_confirmar then 'em_atendimento'::public.sos_situacao_mecanico else public.sos_mecanicos.situacao end;

  perform public.sos_registrar_evento(p_chamado, 'atribuicao',
    case when p_confirmar then 'Central confirmou ' || v_nome else 'Central escolheu ' || v_nome end,
    null, jsonb_build_object('mecanico_id', p_mecanico, 'confirmado', p_confirmar), null, null, 'central');
  perform public.sos_notificar(p_mecanico,
    case when p_confirmar then 'SOS para você · ' || v_c.protocolo else '🚨 SOS escolhido para você · ' || v_c.protocolo end,
    coalesce((select nome_razao from public.clientes where id = v_c.cliente_id), ''), '/app/chamado/' || p_chamado);
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.atribuir', 'sos_chamados', p_chamado,
          jsonb_build_object('mecanico_id', p_mecanico, 'confirmado', p_confirmar));

  select to_jsonb(c) into v_r from public.sos_chamados c where c.id = p_chamado;
  return v_r;
end;
$$;

-- ================================================ avisar só quem tem oferta
-- Era por aqui que o vigia re-notificava "todos os disponíveis" a cada 30 s,
-- o que furaria o raio das ondas. Agora, com as ondas ligadas, ele insiste
-- com quem está de fato com a oferta na mão.
create or replace function public.sos_avisar_mecanicos(p_chamado uuid, p_titulo text, p_mensagem text, p_exceto uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_u uuid; v_n integer := 0;
begin
  if public.sos_despacho_em_ondas() then
    for v_u in
      select o.mecanico_id from public.sos_ofertas o
      join public.usuarios u on u.id = o.mecanico_id and u.situacao = 'ativo'
      where o.chamado_id = p_chamado and o.resposta is null
        and o.mecanico_id is distinct from p_exceto
    loop
      perform public.sos_notificar(v_u, p_titulo, p_mensagem, '/app/chamado/' || p_chamado);
      v_n := v_n + 1;
    end loop;
    return v_n;
  end if;

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

-- ====================================================== nascimento do SOS
-- O gatilho de INSERT para de gritar para todo mundo e passa a chamar o
-- despacho. Com as ondas desligadas, segue o comportamento antigo.
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
    if new.status = 'procurando_mecanico' then
      if public.sos_despacho_em_ondas() then
        -- Onda 1: Tecnoar, até 60 km, exclusiva.
        perform public.sos_despachar(new.id);
      else
        for v_u in select m.usuario_id from public.sos_mecanicos m
                   join public.usuarios u on u.id = m.usuario_id and u.situacao = 'ativo'
                   where m.aceita_sos and m.situacao = 'disponivel' loop
          if v_u is distinct from auth.uid() then
            perform public.sos_notificar(v_u, '🚨 Novo SOS para aceitar',
              concat_ws(' · ', v_cliente, v_placa, public.sos_rotulo_ocorrencia(new.tipo_ocorrencia)), v_link_app);
          end if;
        end loop;
      end if;
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

    -- Chamado encerrado: nenhuma oferta aberta fica na tela de ninguém.
    if new.status in ('cancelado', 'concluido') then
      update public.sos_ofertas set resposta = 'cancelada', respondida_em = now()
      where chamado_id = new.id and resposta is null;
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
  return new;
end;
$$;

-- ======================================================= fila do mecânico
-- `aguardando` passa a ser "o que está oferecido a mim", não "todo chamado em
-- aberto no Brasil". Cada cartão já vem com a onda e o prazo da oferta.
create or replace function public.sos_home_mecanico()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_m public.sos_mecanicos; v_hoje timestamptz; v_ondas boolean;
begin
  if not public.sos_eh_mecanico() then return jsonb_build_object('ok', false); end if;
  select * into v_m from public.sos_mecanicos where usuario_id = auth.uid();
  v_hoje := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_ondas := public.sos_despacho_em_ondas();
  return jsonb_build_object(
    'ok', true,
    'nome', (select nome_completo from public.usuarios where id = auth.uid()),
    'ficha', to_jsonb(v_m),
    'prestador', (select to_jsonb(p) from public.sos_prestadores p where p.id = v_m.prestador_id),
    'chamado_atual', (select to_jsonb(c) || jsonb_build_object(
                         'status_rotulo', public.sos_rotulo_status(c.status),
                         'ocorrencia_rotulo', public.sos_rotulo_ocorrencia(c.tipo_ocorrencia),
                         'cliente_nome', (select nome_razao from public.clientes where id = c.cliente_id),
                         'placa', (select placa from public.veiculos where id = c.veiculo_id))
                       from public.sos_chamados c
                       where c.mecanico_id = auth.uid() and c.status not in ('servico_finalizado', 'concluido', 'cancelado')
                       order by c.recebido_em desc limit 1),
    'aguardando', (select coalesce(jsonb_agg(x order by (x->>'recebido_em')), '[]'::jsonb) from (
                     select to_jsonb(c) || jsonb_build_object(
                       'ocorrencia_rotulo', public.sos_rotulo_ocorrencia(c.tipo_ocorrencia),
                       'cliente_nome', (select nome_razao from public.clientes where id = c.cliente_id),
                       'placa', (select placa from public.veiculos where id = c.veiculo_id),
                       'veiculo', (select concat_ws(' ', marca, modelo) from public.veiculos where id = c.veiculo_id),
                       -- A distância da oferta vale mais que a de agora: é a
                       -- que o mecânico viu quando o chamado chegou nele.
                       'distancia_km', coalesce(o.distancia_km,
                         public.sos_distancia_km(v_m.latitude, v_m.longitude, c.latitude, c.longitude)),
                       'eta_min_oferta', o.eta_min,
                       'onda', o.onda,
                       'oferta_expira_em', o.expira_em,
                       'para_mim', c.mecanico_id = auth.uid(),
                       'recusei', exists (select 1 from public.sos_recusas r where r.chamado_id = c.id and r.mecanico_id = auth.uid())) as x
                     from public.sos_chamados c
                     left join public.sos_ofertas o
                       on o.chamado_id = c.id and o.mecanico_id = auth.uid() and o.resposta is null
                     where c.status in ('recebido', 'procurando_mecanico')
                       and (c.mecanico_id is null or c.mecanico_id = auth.uid())
                       -- Despachado em ondas: só o que foi oferecido a mim.
                       -- Modo manual (onda_atual = 0): a fila continua aberta.
                       and (not v_ondas or c.onda_atual = 0
                            or o.id is not null or c.mecanico_id = auth.uid())) t),
    'hoje', jsonb_build_object(
      'atendimentos', (select count(*) from public.sos_chamados where mecanico_id = auth.uid() and recebido_em >= v_hoje),
      'concluidos', (select count(*) from public.sos_chamados where mecanico_id = auth.uid() and status in ('servico_finalizado', 'concluido') and finalizado_em >= v_hoje),
      'nota_media', (select round(avg(avaliacao_nota), 1) from public.sos_chamados where mecanico_id = auth.uid() and avaliacao_nota is not null),
      'ofertas_recebidas', (select count(*) from public.sos_ofertas where mecanico_id = auth.uid() and enviada_em >= v_hoje),
      'ofertas_aceitas', (select count(*) from public.sos_ofertas where mecanico_id = auth.uid() and resposta = 'aceita' and respondida_em >= v_hoje)
    ),
    'historico', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                    select jsonb_build_object('id', c.id, 'protocolo', c.protocolo, 'status', c.status,
                      'status_rotulo', public.sos_rotulo_status(c.status),
                      'ocorrencia_rotulo', public.sos_rotulo_ocorrencia(c.tipo_ocorrencia),
                      'cliente_nome', (select nome_razao from public.clientes where id = c.cliente_id),
                      'placa', (select placa from public.veiculos where id = c.veiculo_id),
                      'recebido_em', c.recebido_em, 'finalizado_em', c.finalizado_em,
                      'avaliacao_nota', c.avaliacao_nota) as x
                    from public.sos_chamados c
                    where c.mecanico_id = auth.uid() and c.status in ('servico_finalizado', 'concluido')
                    order by c.finalizado_em desc nulls last limit 20) t)
  );
end;
$$;

-- ============================================================== realtime
-- A oferta tem de chegar na tela do mecânico sem ele recarregar nada. O bloco
-- é tolerante de propósito: em banco sem a publicação do Realtime (o PGlite
-- dos testes) ele não faz nada em vez de quebrar a migração.
do $$ begin
  alter publication supabase_realtime add table public.sos_ofertas;
exception when others then null; end $$;
do $$ begin
  alter table public.sos_ofertas replica identity full;
exception when others then null; end $$;

-- ================================================================== cron
-- Junto do vigia (que roda a cada 30 s), girar as ondas a cada 15 s: é o que
-- faz a onda 1 de 90 s virar em 90 s, e não em 90 + 30.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'sos_girar_ondas';
    -- A cada 15 s (pg_cron 1.5+); versões antigas aceitam no máximo 1 min.
    begin
      perform cron.schedule('sos_girar_ondas', '15 seconds', $c$ select public.sos_girar_ondas() $c$);
    exception when others then
      perform cron.schedule('sos_girar_ondas', '* * * * *', $c$ select public.sos_girar_ondas() $c$);
    end;
  end if;
exception when others then
  raise notice 'pg_cron indisponível (%): sem ele as ondas não viram sozinhas.', sqlerrm;
end $$;

revoke execute on function public.sos_candidatos(uuid, uuid), public.sos_despachar(uuid),
  public.sos_girar_ondas() from public, anon;
revoke execute on function public.sos_girar_ondas() from authenticated;
grant execute on function public.sos_candidatos(uuid, uuid), public.sos_despachar(uuid)
  to authenticated, service_role;
grant execute on function public.sos_girar_ondas() to service_role;
