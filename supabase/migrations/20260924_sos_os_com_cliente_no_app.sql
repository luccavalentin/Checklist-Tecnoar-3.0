-- ════════════════════════════════════════════════════════════════════════════
-- OS aberta pelo app do mecânico com cliente escolhido ou cadastrado na hora
-- ════════════════════════════════════════════════════════════════════════════
--
-- Até aqui a OS do app só abria a partir de um veículo JÁ cadastrado
-- (sos_os_criar), e o cliente vinha do dono do veículo. Sem veículo no
-- cadastro — a produção tem zero —, o mecânico não conseguia abrir OS nenhuma.
--
-- sos_os_abrir segue o mesmo caminho do chamado aberto pelo mecânico:
--
--   cliente   escolhido pela busca (sos_buscar_cliente_campo) OU cadastrado
--             na hora em public.clientes — a MESMA tabela do Checklist. Antes
--             de cadastrar, reaproveita quem já existe pelo CPF/CNPJ ou pelo
--             celular: nada de cliente duplicado.
--   veículo   escolhido entre os do cliente OU pela placa (sos_garantir_veiculo
--             acha o cadastro existente ou cria). A OS exige veículo.
--   OS        mesma inserção de sos_os_criar: status de entrada, o mecânico
--             escalado como principal, evento na linha do tempo.
--
-- sos_os_criar continua existindo para não quebrar versão antiga do app.

create or replace function public.sos_os_abrir(p jsonb)
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
  v_tel_dig  text := regexp_replace(coalesce(p->>'telefone', ''), '\D', '', 'g');
  v_doc      text := nullif(trim(coalesce(p->>'documento', '')), '');
  v_doc_dig  text := regexp_replace(coalesce(p->>'documento', ''), '\D', '', 'g');
  v_problema text := nullif(trim(coalesce(p->>'problema', '')), '');
  v_km       integer := nullif(regexp_replace(coalesce(p->>'km', ''), '\D', '', 'g'), '')::integer;
  v_u        uuid := (select id from public.usuarios where id = auth.uid());
  v_v        public.veiculos;
  v_status   uuid;
  v_os       uuid;
  v_numero   bigint;
  v_novo_cli boolean := false;
  v_nome_mec text;
begin
  if not public.tem_permissao('ordens_servico', 'criar') then
    raise exception 'Seu perfil não permite abrir OS. Peça ao administrador a permissão de criar OS.';
  end if;
  if v_problema is null then raise exception 'Descreva o problema.'; end if;
  if v_doc is not null and length(v_doc_dig) not in (11, 14) then
    raise exception 'CPF com 11 números ou CNPJ com 14.';
  end if;

  -- Toque duplo: o segundo pedido espera o primeiro.
  perform pg_advisory_xact_lock(hashtextextended('sos_os_abrir:' || coalesce(auth.uid()::text, ''), 0));

  -- Veículo escolhido define o cliente (o dono do cadastro).
  if v_vei is not null then
    select cliente_id into v_dono from public.veiculos where id = v_vei and situacao = 'ativo';
    if not found then raise exception 'Veículo não encontrado.'; end if;
    if v_cli is not null and v_dono is not null and v_dono <> v_cli then
      raise exception 'Este veículo pertence a outro cliente.';
    end if;
    v_cli := coalesce(v_cli, v_dono);
  end if;

  if v_cli is null then
    if v_nome is null or length(v_nome) < 3 then
      raise exception 'Informe o cliente: busque pelo nome, telefone, CPF/CNPJ ou placa, ou cadastre um novo.';
    end if;
    if length(v_tel_dig) not between 10 and 11 then
      raise exception 'Celular do cliente com DDD: 10 ou 11 números.';
    end if;

    -- Quem já existe é reaproveitado: primeiro pelo documento, depois pelo celular.
    if length(v_doc_dig) in (11, 14) then
      select id into v_cli from public.clientes
      where situacao = 'ativo' and documento_digitos = v_doc_dig
      order by updated_at desc limit 1;
    end if;
    if v_cli is null then
      select id into v_cli from public.clientes
      where situacao = 'ativo' and regexp_replace(coalesce(celular, ''), '\D', '', 'g') = v_tel_dig
      order by updated_at desc limit 1;
    end if;

    if v_cli is null then
      insert into public.clientes (tipo_pessoa, nome_razao, celular, documento, origem, notificar_whatsapp, criado_por)
      values (
        case when length(v_doc_dig) = 14 then 'juridica' else 'fisica' end::public.tipo_pessoa,
        v_nome, v_tel, v_doc, 'manual', true, v_u
      )
      returning id into v_cli;
      v_novo_cli := true;
    end if;
  elsif not exists (select 1 from public.clientes where id = v_cli and situacao = 'ativo') then
    raise exception 'Cliente não encontrado ou inativo.';
  end if;

  -- A OS exige veículo: sem o escolhido, vale a placa informada.
  if v_vei is null then
    if nullif(p->>'placa', '') is null then
      raise exception 'Informe a placa do veículo: a OS precisa do veículo.';
    end if;
    v_vei := public.sos_garantir_veiculo(v_cli, p->>'placa', nullif(p->>'veiculo_descricao', ''), null);
  end if;

  select * into v_v from public.veiculos where id = v_vei;
  if v_v.cliente_id is distinct from v_cli then
    raise exception 'Esta placa já está cadastrada para outro cliente. Busque pela placa para abrir a OS no cadastro certo.';
  end if;

  select id into v_status from public.status_os
  where situacao = 'ativo' and categoria = 'entrada'
  order by ordem limit 1;

  insert into public.ordens_servico (tipo, cliente_id, veiculo_id, status_id, km, problema_alegado, aberta_por)
  values ('os', v_cli, v_vei, v_status, coalesce(v_km, v_v.km_atual), v_problema, v_u)
  returning id, numero into v_os, v_numero;

  if v_u is not null then
    insert into public.os_mecanicos (os_id, usuario_id, principal) values (v_os, v_u, true) on conflict do nothing;
  end if;
  insert into public.os_eventos (os_id, tipo, titulo, descricao, usuario_id)
  values (v_os, 'os', 'OS aberta pelo app SOS', v_problema, v_u);

  -- Cliente novo cadastrado em campo: a central confere o cadastro.
  if v_novo_cli then
    select nome_completo into v_nome_mec from public.usuarios where id = auth.uid();
    perform public.sos_notificar(u, 'Cliente cadastrado em campo',
      coalesce(v_nome_mec, 'Mecânico') || ' cadastrou ' || v_nome || ' ao abrir a OS nº ' || v_numero ||
      '. Complete o cadastro (endereço, e-mail).', '/cadastros/clientes')
    from public.sos_usuarios_central() u;
  end if;

  return jsonb_build_object('id', v_os, 'numero', v_numero, 'cliente_id', v_cli, 'veiculo_id', v_vei, 'cliente_novo', v_novo_cli);
end;
$$;

revoke execute on function public.sos_os_abrir(jsonb) from public, anon;
grant execute on function public.sos_os_abrir(jsonb) to authenticated;
