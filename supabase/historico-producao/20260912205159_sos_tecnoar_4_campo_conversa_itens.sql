-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260912205159.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- SOS Tecnoar (parte 4/8): posição, situação do mecânico, despacho, avaliação,
-- compartilhamento, conversa, itens do catálogo e anexos.

-- Posição durante o chamado. Mecânico atualiza também a própria ficha e a
-- previsão de chegada; cliente só o rastro do chamado.
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
    if v_c.status in ('aceito', 'a_caminho') then
      -- Posição voltou: se o vigia tinha avisado "sem sinal", pode avisar de novo.
      update public.sos_chamados set distancia_km = v_dist, eta_min = v_eta, sinal_avisado_em = null where id = p_chamado;
    end if;
  else
    -- O cliente pode ter se movido (ou o GPS melhorou): o pino segue a posição real.
    if v_c.status not in ('no_local', 'servico_iniciado') and not v_c.ponto_ajustado then
      update public.sos_chamados set latitude = p_lat, longitude = p_lng, precisao_m = p_precisao where id = p_chamado;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'distancia_km', v_dist, 'eta_min', v_eta);
end;
$$;

-- Disponível / em atendimento / indisponível / pausa / offline.
-- Com chamado em andamento, só "em atendimento" (ou pausa) faz sentido.
create or replace function public.sos_definir_situacao(
  p_situacao public.sos_situacao_mecanico,
  p_lat double precision default null, p_lng double precision default null,
  p_veiculo_apoio text default null, p_telefone text default null, p_mostrar_telefone boolean default null,
  p_aceita_sos boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_atual uuid;
begin
  if not public.sos_eh_mecanico() then raise exception 'Só mecânicos definem disponibilidade.'; end if;
  select chamado_atual_id into v_atual from public.sos_mecanicos where usuario_id = auth.uid();
  if v_atual is not null and p_situacao in ('disponivel', 'offline', 'indisponivel')
     and exists (select 1 from public.sos_chamados where id = v_atual and status not in ('servico_finalizado', 'concluido', 'cancelado')) then
    raise exception 'Você tem um atendimento em andamento. Finalize-o antes de mudar a situação.';
  end if;
  insert into public.sos_mecanicos (usuario_id, situacao, latitude, longitude, posicao_em, veiculo_apoio, telefone_contato, mostrar_telefone, aceita_sos)
  values (auth.uid(), p_situacao, p_lat, p_lng, case when p_lat is null then null else now() end,
          p_veiculo_apoio, p_telefone, coalesce(p_mostrar_telefone, false), coalesce(p_aceita_sos, true))
  on conflict (usuario_id) do update
    set situacao = excluded.situacao,
        latitude = coalesce(excluded.latitude, public.sos_mecanicos.latitude),
        longitude = coalesce(excluded.longitude, public.sos_mecanicos.longitude),
        posicao_em = coalesce(excluded.posicao_em, public.sos_mecanicos.posicao_em),
        veiculo_apoio = coalesce(p_veiculo_apoio, public.sos_mecanicos.veiculo_apoio),
        telefone_contato = coalesce(p_telefone, public.sos_mecanicos.telefone_contato),
        mostrar_telefone = coalesce(p_mostrar_telefone, public.sos_mecanicos.mostrar_telefone),
        aceita_sos = coalesce(p_aceita_sos, public.sos_mecanicos.aceita_sos),
        chamado_atual_id = case when excluded.situacao in ('disponivel', 'offline', 'indisponivel') then null
                                else public.sos_mecanicos.chamado_atual_id end;
  perform public.sos_pulso();
  return (select to_jsonb(m) from public.sos_mecanicos m where m.usuario_id = auth.uid());
end;
$$;

-- Posição do mecânico fora de chamado (para o mapa da central e o despacho).
create or replace function public.sos_atualizar_posicao_mecanico(p_lat double precision, p_lng double precision, p_precisao real default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.sos_mecanicos
  set latitude = p_lat, longitude = p_lng, precisao_m = p_precisao, posicao_em = now()
  where usuario_id = auth.uid() and situacao <> 'offline';
  perform public.sos_pulso();
end;
$$;

-- Sugestão de despacho: livre, perto, com a especialidade certa e menos
-- carregado. Posição com mais de 2 h não conta.
create or replace function public.sos_sugerir_mecanicos(p_chamado uuid)
returns table (
  usuario_id uuid, nome text, avatar_url text, funcao text, especialidades text,
  situacao public.sos_situacao_mecanico, disponivel boolean, aceita_sos boolean, em_atendimento boolean, chamado_atual_id uuid,
  distancia_km numeric, eta_min integer, posicao_em timestamptz, telefone text,
  afinidade boolean, atendimentos_hoje integer, nota_media numeric, recusou boolean, pontuacao numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with c as (select latitude, longitude, tipo_ocorrencia from public.sos_chamados where id = p_chamado),
       cfg as (select velocidade_media_kmh, raio_busca_km from public.sos_config where singleton),
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
         select u.id, u.nome_completo, u.avatar_url, f.nome as funcao,
                (select string_agg(e.nome, ', ' order by e.nome) from public.usuario_especialidades ue
                   join public.especialidades e on e.id = ue.especialidade_id where ue.usuario_id = u.id) as especialidades,
                coalesce(m.situacao, 'offline'::public.sos_situacao_mecanico) as situacao,
                coalesce(m.aceita_sos, true) as aceita_sos, m.chamado_atual_id,
                case when m.posicao_em > now() - interval '2 hours'
                     then public.sos_distancia_km(m.latitude, m.longitude, c.latitude, c.longitude) end as dist,
                m.posicao_em, coalesce(case when m.mostrar_telefone then m.telefone_contato end, u.telefone) as telefone,
                (select count(*)::int from public.sos_chamados x where x.mecanico_id = u.id
                   and x.recebido_em > date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as hoje,
                (select round(avg(x.avaliacao_nota), 1) from public.sos_chamados x where x.mecanico_id = u.id and x.avaliacao_nota is not null) as nota,
                exists (select 1 from public.sos_recusas r where r.chamado_id = p_chamado and r.mecanico_id = u.id) as recusou,
                cfg.velocidade_media_kmh, chave.rx
         from public.usuarios u
         join public.funcoes f on f.id = u.funcao_id
         left join public.sos_mecanicos m on m.usuario_id = u.id
         cross join c cross join cfg cross join chave
         where u.situacao = 'ativo' and (f.atua_como_mecanico or m.usuario_id is not null)
           and public.sos_eh_equipe()
       )
  select b.id, b.nome_completo, b.avatar_url, b.funcao, b.especialidades,
         b.situacao, b.situacao = 'disponivel', b.aceita_sos, b.chamado_atual_id is not null, b.chamado_atual_id,
         b.dist,
         case when b.dist is not null then greatest(1, ceil(b.dist / b.velocidade_media_kmh * 60))::int end,
         b.posicao_em, b.telefone,
         coalesce(b.rx is not null and b.especialidades ~* b.rx, false),
         b.hoje, b.nota, b.recusou,
         -- Quanto maior, melhor. Distância pesa mais; especialidade desempata forte.
         round((
           case b.situacao when 'disponivel' then 100 when 'pausa' then 20 when 'em_atendimento' then 10 else 0 end
           + case when b.dist is null then 0 else greatest(0, 60 - b.dist) end
           + case when b.rx is not null and b.especialidades ~* b.rx then 25 else 0 end
           - b.hoje * 4
           + coalesce(b.nota, 3) * 2
           - case when b.recusou then 50 else 0 end
           - case when not b.aceita_sos then 80 else 0 end
         )::numeric, 1)
  from base b
  order by 19 desc, b.dist asc nulls last, b.nome_completo
$$;

create or replace function public.sos_vincular_os(p_chamado uuid, p_os uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.tem_permissao('sos', 'editar') then raise exception 'Sem permissão.'; end if;
  if not exists (select 1 from public.ordens_servico o join public.sos_chamados c on c.id = p_chamado
                 where o.id = p_os and o.cliente_id = c.cliente_id) then
    raise exception 'A OS precisa ser do mesmo cliente.';
  end if;
  update public.sos_chamados set os_id = p_os where id = p_chamado;
  perform public.sos_sincronizar_itens_os(p_chamado);
  perform public.sos_registrar_evento(p_chamado, 'os', 'OS vinculada', null, jsonb_build_object('os_id', p_os), null, null, 'central');
end;
$$;

create or replace function public.sos_avaliar(p_chamado uuid, p_nota smallint, p_comentario text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_c public.sos_chamados;
begin
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_c.conta_usuario_id is distinct from auth.uid() and v_c.cliente_id is distinct from public.sos_cliente_atual() then
    raise exception 'Só o cliente avalia.';
  end if;
  if v_c.status not in ('servico_finalizado', 'concluido') then raise exception 'Avalie depois de concluído.'; end if;
  if p_nota not between 1 and 5 then raise exception 'Nota de 1 a 5.'; end if;
  update public.sos_chamados
  set avaliacao_nota = p_nota, avaliacao_comentario = nullif(trim(p_comentario), ''), avaliado_em = now(),
      status = 'concluido', concluido_em = coalesce(concluido_em, now()),
      tempo_total_seg = coalesce(tempo_total_seg, extract(epoch from now() - recebido_em)::int)
  where id = p_chamado;
  perform public.sos_registrar_evento(p_chamado, 'avaliacao', 'Cliente avaliou: ' || p_nota || ' estrela(s)', p_comentario,
    jsonb_build_object('nota', p_nota), null, null, 'cliente');
  return (select to_jsonb(c) from public.sos_chamados c where c.id = p_chamado);
end;
$$;

-- Link temporário para familiar/frota acompanhar sem entrar no app.
create or replace function public.sos_compartilhar(p_chamado uuid, p_horas integer default 12)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_token text;
begin
  if not public.sos_pode_ver_chamado(p_chamado) then raise exception 'Sem acesso ao chamado.'; end if;
  v_token := encode(gen_random_bytes(18), 'hex');
  insert into public.sos_compartilhamentos (chamado_id, token, criado_por, expira_em)
  values (p_chamado, v_token, auth.uid(), now() + make_interval(hours => least(greatest(p_horas, 1), 72)));
  perform public.sos_registrar_evento(p_chamado, 'compartilhamento', 'Acompanhamento compartilhado', null, null, null, null, null);
  return v_token;
end;
$$;

-- Página pública: status, previsão e posição APROXIMADA (3 casas ≈ 100 m).
create or replace function public.sos_acompanhar(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s public.sos_compartilhamentos;
  v_c public.sos_chamados;
  v_pos record;
begin
  select * into v_s from public.sos_compartilhamentos where token = p_token and revogado_em is null and expira_em > now();
  if not found then return jsonb_build_object('ok', false, 'motivo', 'link_invalido'); end if;
  update public.sos_compartilhamentos set acessos = acessos + 1 where id = v_s.id;
  select * into v_c from public.sos_chamados where id = v_s.chamado_id;
  select latitude, longitude, registrado_em into v_pos from public.sos_posicoes
  where chamado_id = v_c.id and papel = 'mecanico' order by registrado_em desc limit 1;
  return jsonb_build_object(
    'ok', true,
    'protocolo', v_c.protocolo,
    'status', v_c.status,
    'status_rotulo', public.sos_rotulo_status(v_c.status),
    'eta_min', v_c.eta_min,
    'distancia_km', v_c.distancia_km,
    'mecanico', split_part(coalesce((select nome_completo from public.usuarios where id = v_c.mecanico_id), ''), ' ', 1),
    'veiculo', (select concat_ws(' ', marca, modelo) from public.veiculos where id = v_c.veiculo_id),
    'cliente_lat', round(v_c.latitude::numeric, 3), 'cliente_lng', round(v_c.longitude::numeric, 3),
    'mecanico_lat', round(v_pos.latitude::numeric, 3), 'mecanico_lng', round(v_pos.longitude::numeric, 3),
    'posicao_em', v_pos.registrado_em,
    'recebido_em', v_c.recebido_em, 'aceito_em', v_c.aceito_em, 'chegou_em', v_c.chegou_em,
    'finalizado_em', v_c.finalizado_em, 'concluido_em', v_c.concluido_em, 'cancelado_em', v_c.cancelado_em,
    'expira_em', v_s.expira_em
  );
end;
$$;

create or replace function public.sos_enviar_mensagem(
  p_chamado uuid, p_texto text, p_midia_caminho text default null, p_midia_tipo text default null, p_rapida boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_papel public.sos_papel;
begin
  if not public.sos_pode_ver_chamado(p_chamado) then raise exception 'Sem acesso ao chamado.'; end if;
  if nullif(trim(coalesce(p_texto, '')), '') is null and p_midia_caminho is null then raise exception 'Mensagem vazia.'; end if;
  if exists (select 1 from public.sos_chamados where id = p_chamado and status in ('concluido', 'cancelado')) then
    raise exception 'Chamado encerrado: a conversa foi fechada.';
  end if;
  select case when c.mecanico_id = auth.uid() then 'mecanico'::public.sos_papel
              when c.conta_usuario_id = auth.uid() then 'cliente'::public.sos_papel
              else public.sos_papel_atual() end
    into v_papel from public.sos_chamados c where c.id = p_chamado;
  insert into public.sos_mensagens (chamado_id, autor_id, autor_papel, autor_nome, texto, midia_caminho, midia_tipo, rapida)
  values (p_chamado, auth.uid(), v_papel, public.sos_nome_conta(auth.uid()), left(p_texto, 2000), p_midia_caminho, p_midia_tipo, coalesce(p_rapida, false))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.sos_marcar_mensagens_lidas(p_chamado uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.sos_pode_ver_chamado(p_chamado) then return; end if;
  update public.sos_mensagens set lida_em = now()
  where chamado_id = p_chamado and lida_em is null and autor_id is distinct from auth.uid();
end;
$$;

-- ============================================================== RPCs — atendimento (catálogo e mídia)
-- Busca no catálogo do Checklist para o mecânico: só o que é preciso para
-- lançar o item (sem custo, sem fornecedor).
create or replace function public.sos_catalogo(p_termo text, p_tipo text default null, p_limite integer default 30)
returns table (tipo text, id uuid, codigo text, descricao text, unidade text, preco numeric, saldo numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from (
    select 'produto'::text, p.id, p.codigo, p.descricao, p.unidade, p.preco_venda, p.saldo
    from public.produtos p
    where (p_tipo is null or p_tipo = 'produto') and p.situacao = 'ativo' and not coalesce(p.bloqueado, false)
      and (p.descricao ilike '%' || p_termo || '%' or p.codigo ilike p_termo || '%' or coalesce(p.referencia, '') ilike p_termo || '%')
    union all
    select 'servico'::text, s.id, s.codigo, s.descricao, null, s.valor_padrao, null
    from public.servicos s
    where (p_tipo is null or p_tipo = 'servico') and s.situacao = 'ativo'
      and (s.descricao ilike '%' || p_termo || '%' or s.codigo ilike p_termo || '%')
  ) t
  where (public.sos_eh_mecanico() or public.sos_eh_equipe()) and length(trim(coalesce(p_termo, ''))) >= 2
  order by 4
  limit least(greatest(p_limite, 1), 60)
$$;

create or replace function public.sos_adicionar_item(p_chamado uuid, p_tipo text, p_ref uuid, p_quantidade numeric default 1)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c   public.sos_chamados;
  v_id  uuid;
  v_p   public.produtos;
  v_s   public.servicos;
begin
  if not public.sos_pode_atender(p_chamado) then raise exception 'Sem permissão.'; end if;
  select * into v_c from public.sos_chamados where id = p_chamado;
  if v_c.status in ('concluido', 'cancelado') then raise exception 'Chamado encerrado.'; end if;
  if coalesce(p_quantidade, 0) <= 0 then raise exception 'Quantidade inválida.'; end if;

  if p_tipo = 'produto' then
    select * into v_p from public.produtos where id = p_ref and situacao = 'ativo';
    if not found then raise exception 'Produto não encontrado no catálogo.'; end if;
    insert into public.sos_itens (chamado_id, tipo, produto_id, codigo, descricao, unidade, quantidade, valor_unitario, adicionado_por)
    values (p_chamado, 'produto', v_p.id, v_p.codigo, v_p.descricao, v_p.unidade, p_quantidade, coalesce(v_p.preco_venda, 0), auth.uid())
    returning id into v_id;
  elsif p_tipo = 'servico' then
    select * into v_s from public.servicos where id = p_ref and situacao = 'ativo';
    if not found then raise exception 'Serviço não encontrado no catálogo.'; end if;
    insert into public.sos_itens (chamado_id, tipo, servico_id, codigo, descricao, quantidade, valor_unitario, adicionado_por)
    values (p_chamado, 'servico', v_s.id, v_s.codigo, v_s.descricao, p_quantidade, coalesce(v_s.valor_padrao, 0), auth.uid())
    returning id into v_id;
  else
    raise exception 'Tipo de item inválido.';
  end if;

  perform public.sos_registrar_evento(p_chamado, 'item', 'Item lançado: ' || coalesce(v_p.descricao, v_s.descricao),
    null, jsonb_build_object('item_id', v_id, 'tipo', p_tipo, 'quantidade', p_quantidade), null, null, null);
  -- Chamado que já tem OS recebe o item lá também.
  perform public.sos_sincronizar_itens_os(p_chamado);
  return (select to_jsonb(i) from public.sos_itens i where i.id = v_id);
end;
$$;

create or replace function public.sos_alterar_item(p_item uuid, p_quantidade numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_i public.sos_itens;
begin
  select * into v_i from public.sos_itens where id = p_item;
  if not found then raise exception 'Item não encontrado.'; end if;
  if not public.sos_pode_atender(v_i.chamado_id) then raise exception 'Sem permissão.'; end if;
  if coalesce(p_quantidade, 0) <= 0 then raise exception 'Quantidade inválida.'; end if;
  update public.sos_itens set quantidade = p_quantidade where id = p_item;
  if v_i.os_item_id is not null then
    update public.os_produtos set quantidade = p_quantidade where id = v_i.os_item_id;
    update public.os_servicos set quantidade = p_quantidade where id = v_i.os_item_id;
  end if;
end;
$$;

create or replace function public.sos_remover_item(p_item uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_i public.sos_itens;
begin
  select * into v_i from public.sos_itens where id = p_item;
  if not found then return; end if;
  if not public.sos_pode_atender(v_i.chamado_id) then raise exception 'Sem permissão.'; end if;
  if v_i.os_item_id is not null then
    update public.os_produtos set situacao = 'cancelado' where id = v_i.os_item_id;
    update public.os_servicos set situacao = 'cancelado' where id = v_i.os_item_id;
  end if;
  delete from public.sos_itens where id = p_item;
  perform public.sos_registrar_evento(v_i.chamado_id, 'item', 'Item removido: ' || v_i.descricao, null, null, null, null, null);
end;
$$;

create or replace function public.sos_registrar_anexo(
  p_chamado uuid, p_caminho text, p_tipo public.sos_tipo_anexo default 'foto',
  p_etapa text default null, p_legenda text default null, p_tamanho bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_papel public.sos_papel; v_c public.sos_chamados;
begin
  if not public.sos_pode_ver_chamado(p_chamado) then raise exception 'Sem acesso ao chamado.'; end if;
  if split_part(p_caminho, '/', 1) <> p_chamado::text then raise exception 'Arquivo fora da pasta do chamado.'; end if;
  select * into v_c from public.sos_chamados where id = p_chamado;
  v_papel := case when v_c.mecanico_id = auth.uid() then 'mecanico'::public.sos_papel
                  when v_c.conta_usuario_id = auth.uid() then 'cliente'::public.sos_papel
                  else public.sos_papel_atual() end;
  insert into public.sos_anexos (chamado_id, caminho, tipo, etapa, legenda, tamanho_bytes, autor_id, autor_papel)
  values (p_chamado, p_caminho, coalesce(p_tipo, 'foto'),
          coalesce(nullif(p_etapa, ''), case v_c.status when 'no_local' then 'antes' when 'servico_iniciado' then 'diagnostico'
                                                        when 'servico_finalizado' then 'depois' else 'abertura' end),
          nullif(trim(p_legenda), ''), p_tamanho, auth.uid(), v_papel)
  on conflict (caminho) do update set legenda = coalesce(excluded.legenda, public.sos_anexos.legenda)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.sos_remover_anexo(p_anexo uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_a public.sos_anexos;
begin
  select * into v_a from public.sos_anexos where id = p_anexo;
  if not found then return; end if;
  if v_a.autor_id is distinct from auth.uid() and not public.tem_permissao('sos', 'editar') then
    raise exception 'Só quem enviou (ou a central) remove o arquivo.';
  end if;
  delete from storage.objects where bucket_id = 'sos' and name = v_a.caminho;
  delete from public.sos_anexos where id = p_anexo;
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
