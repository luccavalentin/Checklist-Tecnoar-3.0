-- SOS Tecnoar — lista vazia também é resposta.
-- Roda depois de 20261002_sos_config_das_ondas.sql. Idempotente.
--
-- `sos_salvar_prestador` e `sos_salvar_politica` guardam listas: os tipos de
-- ocorrência que o parceiro atende, e os níveis / situações / prioridades de
-- cada onda. Nas duas, o campo era gravado assim:
--
--   atende_tipos = coalesce((select array_agg(v::...) from
--                            jsonb_array_elements_text(p->'atende_tipos') v),
--                           atende_tipos)
--
-- Com a lista cheia funciona. Com a lista VAZIA não: `array_agg` sobre zero
-- linhas devolve null, o `coalesce` cai no valor antigo e a alteração é
-- descartada em silêncio. E vazio aqui não é "não mexi", é uma regra: lista
-- vazia significa "atende qualquer ocorrência" no prestador e "vale para
-- qualquer nível / qualquer prioridade" na onda.
--
-- Isso só não aparecia porque não havia tela: por SQL quem editava escrevia
-- o array direto. Com a Gestão SOS de prestadores e ondas, desmarcar a última
-- caixinha é um gesto comum — e ele tem de valer.
--
-- A correção: a lista é trocada quando vem no payload (ainda que vazia) e
-- preservada quando não vem. `jsonb_typeof(...) = 'array'` é o que separa os
-- dois casos — e também protege de um `null` enviado por engano, que faria
-- `jsonb_array_elements_text` levantar erro.
--
-- Nada mais muda: o resto das duas funções é cópia fiel de
-- 20260928_sos_prestadores.sql e 20260930_sos_ofertas_e_politica.sql. Migração
-- nova em vez de corrigir as antigas porque reaplicar um arquivo antigo volta
-- à versão dele todas as funções redefinidas depois.

create or replace function public.sos_salvar_prestador(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   uuid := nullif(p->>'id', '')::uuid;
  v_tipo public.sos_tipo_prestador;
begin
  if not public.tem_permissao('sos', 'configurar') then raise exception 'Sem permissão.'; end if;
  if nullif(trim(p->>'nome'), '') is null then raise exception 'Dê um nome ao prestador.'; end if;

  -- O próprio não se cria nem se converte pela tela: ele nasce na migração e
  -- é único. Tentar criar outro daria erro de índice sem explicar nada.
  v_tipo := coalesce(nullif(p->>'tipo', '')::public.sos_tipo_prestador, 'parceiro');
  if v_tipo = 'proprio' and (v_id is null or v_id is distinct from public.sos_prestador_proprio()) then
    raise exception 'O prestador próprio é a Tecnoar e já existe.';
  end if;
  if v_id is not null and v_id = public.sos_prestador_proprio() then
    v_tipo := 'proprio';
  end if;

  if v_id is null then
    insert into public.sos_prestadores (
      nome, tipo, nivel, situacao, documento, telefone, email, responsavel,
      base_latitude, base_longitude, base_municipio, base_uf,
      raio_atuacao_km, comissao_pct, atende_tipos, observacoes, criado_por)
    values (
      trim(p->>'nome'), v_tipo,
      coalesce(nullif(p->>'nivel', '')::public.sos_nivel_prestador, 'bronze'),
      coalesce(nullif(p->>'situacao', '')::public.sos_situacao_prestador, 'ativo'),
      nullif(trim(p->>'documento'), ''), nullif(trim(p->>'telefone'), ''),
      nullif(trim(p->>'email'), ''), nullif(trim(p->>'responsavel'), ''),
      nullif(p->>'base_latitude', '')::double precision, nullif(p->>'base_longitude', '')::double precision,
      nullif(trim(p->>'base_municipio'), ''), nullif(trim(p->>'base_uf'), ''),
      coalesce(nullif(p->>'raio_atuacao_km', '')::numeric, 60),
      coalesce(nullif(p->>'comissao_pct', '')::numeric, 0),
      case when jsonb_typeof(p->'atende_tipos') = 'array'
           then coalesce((select array_agg(v::public.sos_tipo_ocorrencia)
                          from jsonb_array_elements_text(p->'atende_tipos') v), '{}')
           else '{}' end,
      nullif(trim(p->>'observacoes'), ''), auth.uid())
    returning id into v_id;
  else
    update public.sos_prestadores
    set nome = trim(p->>'nome'),
        tipo = v_tipo,
        nivel = coalesce(nullif(p->>'nivel', '')::public.sos_nivel_prestador, nivel),
        situacao = coalesce(nullif(p->>'situacao', '')::public.sos_situacao_prestador, situacao),
        documento = nullif(trim(p->>'documento'), ''),
        telefone = nullif(trim(p->>'telefone'), ''),
        email = nullif(trim(p->>'email'), ''),
        responsavel = nullif(trim(p->>'responsavel'), ''),
        base_latitude = nullif(p->>'base_latitude', '')::double precision,
        base_longitude = nullif(p->>'base_longitude', '')::double precision,
        base_municipio = nullif(trim(p->>'base_municipio'), ''),
        base_uf = nullif(trim(p->>'base_uf'), ''),
        raio_atuacao_km = coalesce(nullif(p->>'raio_atuacao_km', '')::numeric, raio_atuacao_km),
        comissao_pct = coalesce(nullif(p->>'comissao_pct', '')::numeric, comissao_pct),
        -- Veio a lista (mesmo vazia): troca. Não veio: fica como está.
        atende_tipos = case when jsonb_typeof(p->'atende_tipos') = 'array'
                            then coalesce((select array_agg(v::public.sos_tipo_ocorrencia)
                                           from jsonb_array_elements_text(p->'atende_tipos') v), '{}')
                            else atende_tipos end,
        observacoes = nullif(trim(p->>'observacoes'), '')
    where id = v_id;
    if not found then raise exception 'Prestador não encontrado.'; end if;
  end if;

  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.prestador', 'sos_prestadores', v_id, p);
  return (select to_jsonb(x) from public.sos_prestadores x where x.id = v_id);
end;
$$;

create or replace function public.sos_salvar_politica(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if not public.tem_permissao('sos', 'configurar') then raise exception 'Sem permissão.'; end if;
  if nullif(trim(p->>'nome'), '') is null then raise exception 'Dê um nome à onda.'; end if;
  if coalesce(nullif(p->>'raio_max_km', '')::numeric, 60) <= coalesce(nullif(p->>'raio_min_km', '')::numeric, 0) then
    raise exception 'O raio final tem que ser maior que o inicial.';
  end if;

  if v_id is null then
    insert into public.sos_politica_despacho
      (ordem, nome, tipo_prestador, niveis, raio_min_km, raio_max_km, situacoes, espera_seg,
       prioridades, max_ofertas, ativo, observacoes, aceita_sem_posicao)
    values (
      coalesce(nullif(p->>'ordem', '')::int,
               (select coalesce(max(ordem), 0) + 1 from public.sos_politica_despacho)),
      trim(p->>'nome'),
      nullif(p->>'tipo_prestador', '')::public.sos_tipo_prestador,
      case when jsonb_typeof(p->'niveis') = 'array'
           then coalesce((select array_agg(v::public.sos_nivel_prestador)
                          from jsonb_array_elements_text(p->'niveis') v), '{}')
           else '{}' end,
      coalesce(nullif(p->>'raio_min_km', '')::numeric, 0),
      coalesce(nullif(p->>'raio_max_km', '')::numeric, 60),
      -- Situação é a única lista em que vazio não faz sentido: onda que não
      -- diz em que situação o mecânico entra não chamaria ninguém.
      case when jsonb_typeof(p->'situacoes') = 'array'
           then coalesce((select array_agg(v::public.sos_situacao_mecanico)
                          from jsonb_array_elements_text(p->'situacoes') v), '{disponivel}')
           else '{disponivel}' end,
      coalesce(nullif(p->>'espera_seg', '')::int, 90),
      case when jsonb_typeof(p->'prioridades') = 'array'
           then coalesce((select array_agg(v::public.sos_prioridade)
                          from jsonb_array_elements_text(p->'prioridades') v), '{}')
           else '{}' end,
      coalesce(nullif(p->>'max_ofertas', '')::int, 0),
      coalesce((p->>'ativo')::boolean, true),
      nullif(trim(p->>'observacoes'), ''),
      coalesce((p->>'aceita_sem_posicao')::boolean, false))
    returning id into v_id;
  else
    update public.sos_politica_despacho
    set ordem = coalesce(nullif(p->>'ordem', '')::int, ordem),
        nome = trim(p->>'nome'),
        tipo_prestador = nullif(p->>'tipo_prestador', '')::public.sos_tipo_prestador,
        -- Lista vazia aqui é regra: "qualquer nível", "qualquer prioridade".
        niveis = case when jsonb_typeof(p->'niveis') = 'array'
                      then coalesce((select array_agg(v::public.sos_nivel_prestador)
                                     from jsonb_array_elements_text(p->'niveis') v), '{}')
                      else niveis end,
        raio_min_km = coalesce(nullif(p->>'raio_min_km', '')::numeric, raio_min_km),
        raio_max_km = coalesce(nullif(p->>'raio_max_km', '')::numeric, raio_max_km),
        situacoes = case when jsonb_typeof(p->'situacoes') = 'array'
                         then coalesce((select array_agg(v::public.sos_situacao_mecanico)
                                        from jsonb_array_elements_text(p->'situacoes') v), situacoes)
                         else situacoes end,
        espera_seg = coalesce(nullif(p->>'espera_seg', '')::int, espera_seg),
        prioridades = case when jsonb_typeof(p->'prioridades') = 'array'
                           then coalesce((select array_agg(v::public.sos_prioridade)
                                          from jsonb_array_elements_text(p->'prioridades') v), '{}')
                           else prioridades end,
        max_ofertas = coalesce(nullif(p->>'max_ofertas', '')::int, max_ofertas),
        ativo = coalesce((p->>'ativo')::boolean, ativo),
        observacoes = nullif(trim(p->>'observacoes'), ''),
        aceita_sem_posicao = coalesce((p->>'aceita_sem_posicao')::boolean, aceita_sem_posicao)
    where id = v_id;
    if not found then raise exception 'Onda não encontrada.'; end if;
  end if;

  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.politica', 'sos_politica_despacho', v_id, p);
  return (select to_jsonb(x) from public.sos_politica_despacho x where x.id = v_id);
end;
$$;

revoke execute on function public.sos_salvar_prestador(jsonb), public.sos_salvar_politica(jsonb) from public, anon;
grant execute on function public.sos_salvar_prestador(jsonb), public.sos_salvar_politica(jsonb)
  to authenticated, service_role;
