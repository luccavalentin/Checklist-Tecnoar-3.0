-- ============================================================================
-- SOS Tecnoar — o mecânico também ABRE chamado (além de aceitar) e liga
-- chamado ↔ OS do sistema Tecnoar.
--
-- 1) `sos_catalogo` navegável: sem termo lista o catálogo inteiro (paginado),
--    o mesmo cadastro de produtos e serviços do sistema.
-- 2) `sos_buscar_cliente_campo`: o mecânico acha o cliente por nome, telefone,
--    documento ou placa — com os veículos e a OS aberta de cada um.
-- 3) `sos_mecanico_abrir_chamado`: chamado aberto em campo, já com o mecânico
--    (no local ou a caminho). Nasce na central como qualquer SOS (mesma
--    tabela, mesmo aviso, mesmo mapa) com origem "mecanico".
-- 4) `sos_os_para_vincular` + `sos_vincular_os`: em vez de abrir OS
--    duplicada, o chamado entra na OS que o veículo já tem aberta; as peças
--    do chamado passam para a OS (reservadas até a OS ser efetivada).
--
-- Estoque (regra de 20260921): peça lançada no chamado já conta como
-- comprometida — fica RESERVADA até a OS ser encerrada (efetivada) ou o
-- chamado ser cancelado. O saldo real continua vindo da Omie.
-- ============================================================================

alter type public.sos_origem add value if not exists 'mecanico';

-- ─────────────────────────────────────────────── 1) catálogo navegável
drop function if exists public.sos_catalogo(text, text, integer);
create or replace function public.sos_catalogo(
  p_termo text default '', p_tipo text default null, p_limite integer default 30, p_offset integer default 0
)
returns table (
  tipo text, id uuid, codigo text, descricao text, unidade text, preco numeric,
  saldo numeric, reservado numeric, comprometido numeric, disponivel numeric, estoque_em timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with termo as (select trim(coalesce(p_termo, '')) as t)
  select t.tipo, t.id, t.codigo, t.descricao, t.unidade, t.preco, t.saldo, t.reservado, t.comprometido,
         case when t.tipo = 'produto' then greatest(coalesce(t.saldo, 0) - coalesce(t.reservado, 0) - t.comprometido, 0) end,
         t.estoque_em
  from (
    select 'produto'::text as tipo, p.id, p.codigo, p.descricao, p.unidade, p.preco_venda as preco, p.saldo,
           p.reservado, public.sos_estoque_comprometido(p.id) as comprometido, p.omie_sincronizado_em as estoque_em
    from public.produtos p, termo
    where (p_tipo is null or p_tipo = 'produto') and p.situacao = 'ativo' and not coalesce(p.bloqueado, false)
      and (termo.t = '' or p.descricao ilike '%' || termo.t || '%' or p.codigo ilike termo.t || '%'
           or coalesce(p.referencia, '') ilike termo.t || '%')
    union all
    select 'servico'::text, s.id, s.codigo, s.descricao, null, s.valor_padrao, null, null, 0, null
    from public.servicos s, termo
    where (p_tipo is null or p_tipo = 'servico') and s.situacao = 'ativo'
      and (termo.t = '' or s.descricao ilike '%' || termo.t || '%' or s.codigo ilike termo.t || '%')
  ) t
  where public.sos_eh_mecanico() or public.sos_eh_equipe()
  order by 4, 2
  limit least(greatest(p_limite, 1), 60)
  offset greatest(coalesce(p_offset, 0), 0)
$$;
revoke execute on function public.sos_catalogo(text, text, integer, integer) from public, anon;
grant execute on function public.sos_catalogo(text, text, integer, integer) to authenticated;

-- ─────────────────────────────────────────── 2) cliente pelo mecânico
create or replace function public.sos_buscar_cliente_campo(p_termo text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with b as (
    select trim(coalesce(p_termo, '')) as t,
           regexp_replace(coalesce(p_termo, ''), '\D', '', 'g') as dig,
           upper(regexp_replace(coalesce(p_termo, ''), '[^A-Za-z0-9]', '', 'g')) as alnum
  )
  select case when not public.sos_eh_mecanico() or length((select t from b)) < 3 then '[]'::jsonb else coalesce((
    select jsonb_agg(x)
    from (
      select jsonb_build_object(
        'id', cl.id, 'nome', cl.nome_razao, 'telefone', coalesce(cl.celular, cl.telefone),
        'veiculos', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', v.id, 'placa', v.placa, 'veiculo', nullif(concat_ws(' ', v.marca, v.modelo, v.ano), ''), 'km_atual', v.km_atual,
            'os_aberta', (select jsonb_build_object('id', o.id, 'numero', o.numero)
                          from public.ordens_servico o
                          where o.veiculo_id = v.id and o.encerrada_em is null and o.situacao = 'ativo'
                          order by o.aberta_em desc limit 1)) order by v.placa)
          from public.veiculos v where v.cliente_id = cl.id and v.situacao = 'ativo'), '[]'::jsonb)) as x
      from public.clientes cl, b
      where cl.situacao = 'ativo' and (
        cl.nome_razao ilike '%' || b.t || '%'
        or coalesce(cl.nome_fantasia, '') ilike '%' || b.t || '%'
        or (length(b.dig) >= 4 and (regexp_replace(coalesce(cl.celular, ''), '\D', '', 'g') like '%' || b.dig || '%'
                                    or regexp_replace(coalesce(cl.telefone, ''), '\D', '', 'g') like '%' || b.dig || '%'))
        or (length(b.dig) >= 11 and cl.documento_digitos = b.dig)
        or (length(b.alnum) >= 3 and exists (
              select 1 from public.veiculos v
              where v.cliente_id = cl.id and v.situacao = 'ativo' and v.placa_normalizada like b.alnum || '%'))
      )
      order by cl.nome_razao
      limit 10
    ) l
  ), '[]'::jsonb) end
$$;
revoke execute on function public.sos_buscar_cliente_campo(text) from public, anon;
grant execute on function public.sos_buscar_cliente_campo(text) to authenticated;

-- ─────────────────────────────────── 3) chamado aberto pelo mecânico
-- p: cliente_id | (cliente_nome, telefone) ; veiculo_id | placa (+ veiculo_descricao) ;
--    tipo_ocorrencia, descricao, latitude, longitude, precisao_m, endereco ;
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
    status, latitude, longitude, precisao_m, endereco, telefone_contato,
    mecanico_id, atribuido_em, aceito_em, a_caminho_em, chegou_em, tempo_aceite_seg, distancia_km, eta_min
  ) values (
    v_cli, v_vei,
    (select usuario_id from public.sos_contas_cliente where cliente_id = v_cli order by updated_at desc limit 1),
    auth.uid(), 'mecanico', v_tipo, v_desc,
    (case when v_tipo in ('freios', 'acidente') then 'emergencia' when v_tipo in ('parado', 'nao_liga') then 'alta' else 'normal' end)::public.sos_prioridade,
    (case when v_no_local then 'no_local' else 'a_caminho' end)::public.sos_status,
    v_lat, v_lng, (p->>'precisao_m')::real, nullif(trim(coalesce(p->>'endereco', '')), ''),
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

-- ─────────────────────────────────────────── 4) chamado ↔ OS aberta
create or replace function public.sos_os_para_vincular(p_chamado uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.sos_pode_atender(p_chamado) then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'numero', o.numero, 'aberta_em', o.aberta_em, 'problema', o.problema_alegado,
      'placa', v.placa, 'status', s.nome, 'status_cor', s.cor, 'valor_total', o.valor_total) order by o.aberta_em desc)
    from public.sos_chamados c
    join public.ordens_servico o on o.encerrada_em is null and o.situacao = 'ativo' and o.cliente_id = c.cliente_id
      and (c.veiculo_id is null or o.veiculo_id = c.veiculo_id)
    join public.veiculos v on v.id = o.veiculo_id
    left join public.status_os s on s.id = o.status_id
    where c.id = p_chamado and c.os_id is null
  ), '[]'::jsonb) end
$$;
revoke execute on function public.sos_os_para_vincular(uuid) from public, anon;
grant execute on function public.sos_os_para_vincular(uuid) to authenticated;

-- Mesma assinatura da versão da central (20260912), agora também para o
-- mecânico do chamado, com OS aberta obrigatória e itens levados junto.
create or replace function public.sos_vincular_os(p_chamado uuid, p_os uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c public.sos_chamados;
  v_o public.ordens_servico;
begin
  if not public.sos_pode_atender(p_chamado) then raise exception 'Sem permissão.'; end if;
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_c.status in ('concluido', 'cancelado') then raise exception 'Chamado encerrado.'; end if;
  if v_c.os_id = p_os then return; end if;
  if v_c.os_id is not null then
    raise exception 'Este chamado já está na OS %.', (select numero from public.ordens_servico where id = v_c.os_id);
  end if;

  select * into v_o from public.ordens_servico where id = p_os and situacao = 'ativo' and encerrada_em is null for update;
  if not found then raise exception 'OS não encontrada ou já encerrada.'; end if;
  if v_o.cliente_id <> v_c.cliente_id then raise exception 'A OS precisa ser do mesmo cliente.'; end if;
  if v_c.veiculo_id is null then
    update public.sos_chamados set veiculo_id = v_o.veiculo_id where id = p_chamado;
  end if;

  update public.sos_chamados set os_id = p_os where id = p_chamado;
  if v_c.mecanico_id is not null then
    insert into public.os_mecanicos (os_id, usuario_id, principal) values (p_os, v_c.mecanico_id, false)
    on conflict do nothing;
  end if;
  -- Peças e serviços do chamado entram na OS (peça reservada até a OS fechar).
  perform public.sos_sincronizar_itens_os(p_chamado);

  insert into public.os_eventos (os_id, tipo, titulo, descricao, usuario_id, dados)
  values (p_os, 'os', 'SOS ' || v_c.protocolo || ' vinculado a esta OS', v_c.descricao,
          (select id from public.usuarios where id = auth.uid()), jsonb_build_object('sos_chamado_id', p_chamado));
  perform public.sos_registrar_evento(p_chamado, 'os', 'Vinculado à OS ' || v_o.numero, null,
    jsonb_build_object('os_id', p_os), null, null, public.sos_papel_no_chamado(p_chamado));
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.vincular_os', 'sos_chamados', p_chamado, jsonb_build_object('os_id', p_os));
end;
$$;
revoke execute on function public.sos_vincular_os(uuid, uuid) from public, anon;
grant execute on function public.sos_vincular_os(uuid, uuid) to authenticated;
