-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260827103717.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Checklist: reabrir para correção, excluir, e identificação livre de cliente/veículo.

/**
 * Reabre um checklist concluído.
 *
 * Errar a marcação acontece — e hoje o operador não tinha saída a não ser
 * começar outro. A reabertura exige motivo e fica no histórico, porque este
 * documento é assinado pelo cliente: mudar depois precisa deixar rastro.
 */
create or replace function reabrir_checklist(p_checklist uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_os uuid;
begin
  if not tem_permissao('checklists', 'editar') then
    raise exception 'Sem permissão para reabrir checklists.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Informe o motivo da reabertura.' using errcode = '22023';
  end if;

  select os_id into v_os from checklists where id = p_checklist;
  if not found then
    raise exception 'Checklist não encontrado.' using errcode = 'P0002';
  end if;

  update checklists
     set situacao = 'em_andamento', concluido_em = null, updated_at = now()
   where id = p_checklist;

  if v_os is not null then
    insert into os_eventos (os_id, tipo, titulo, descricao, usuario_id)
    values (v_os, 'checklist', 'Checklist reaberto', btrim(p_motivo), auth.uid());
  end if;
end;
$$;

revoke all on function reabrir_checklist(uuid, text) from public, anon;
grant execute on function reabrir_checklist(uuid, text) to authenticated, service_role;

/**
 * Exclui um checklist.
 *
 * Só sai de vez o que ainda não foi concluído: um checklist concluído é a
 * prova do estado em que o veículo chegou, e apagar isso apaga a defesa da
 * oficina. Concluído se cancela — fica no lugar, marcado, com motivo.
 */
create or replace function excluir_checklist(p_checklist uuid, p_motivo text default null)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_situacao situacao_checklist;
  v_os uuid;
  v_numero integer;
begin
  if not tem_permissao('checklists', 'excluir') then
    raise exception 'Sem permissão para excluir checklists.' using errcode = '42501';
  end if;

  select situacao, os_id, numero into v_situacao, v_os, v_numero
  from checklists where id = p_checklist;
  if not found then
    raise exception 'Checklist não encontrado.' using errcode = 'P0002';
  end if;

  if v_situacao = 'concluido' then
    if coalesce(btrim(p_motivo), '') = '' then
      raise exception 'Checklist concluído não é apagado: informe o motivo do cancelamento.'
        using errcode = '22023';
    end if;
    update checklists
       set situacao = 'cancelado',
           observacoes = concat_ws(E'\n', observacoes, 'Cancelado: ' || btrim(p_motivo)),
           updated_at = now()
     where id = p_checklist;

    if v_os is not null then
      insert into os_eventos (os_id, tipo, titulo, descricao, usuario_id)
      values (v_os, 'checklist', 'Checklist cancelado', btrim(p_motivo), auth.uid());
    end if;
    return 'cancelado';
  end if;

  delete from checklists where id = p_checklist;

  if v_os is not null then
    insert into os_eventos (os_id, tipo, titulo, descricao, usuario_id)
    values (v_os, 'checklist', 'Checklist removido',
            concat('CHK ', lpad(v_numero::text, 4, '0')), auth.uid());
  end if;
  return 'excluido';
end;
$$;

revoke all on function excluir_checklist(uuid, text) from public, anon;
grant execute on function excluir_checklist(uuid, text) to authenticated, service_role;

/**
 * Garante cliente e veículo a partir do que o operador digitou.
 *
 * O checklist precisa de dono e de placa. Quando o atendente digita um nome ou
 * uma placa que ainda não existe, o cadastro nasce aqui — em vez de obrigar a
 * sair da tela, abrir Cadastros, criar e voltar. O cadastro criado assim fica
 * com origem `manual`, que é justamente a fila de envio para a Omie.
 *
 * É idempotente pela placa normalizada e pelo documento: chamar duas vezes com
 * os mesmos dados devolve o mesmo par, não cria duplicata.
 */
create or replace function garantir_cliente_e_veiculo(
  p_cliente_id uuid,
  p_cliente_nome text,
  p_cliente_documento text,
  p_veiculo_id uuid,
  p_placa text,
  p_veiculo_descricao text default null,
  p_veiculo_tipo tipo_veiculo default null
)
returns table (cliente_id uuid, veiculo_id uuid, cliente_criado boolean, veiculo_criado boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_cliente uuid := p_cliente_id;
  v_veiculo uuid := p_veiculo_id;
  v_placa text := upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g'));
  v_doc text := regexp_replace(coalesce(p_cliente_documento, ''), '\D', '', 'g');
  v_nome text := btrim(coalesce(p_cliente_nome, ''));
  v_cliente_criado boolean := false;
  v_veiculo_criado boolean := false;
begin
  if not tem_permissao('checklists', 'criar') then
    raise exception 'Sem permissão para esta ação.' using errcode = '42501';
  end if;

  /* ------------------------------------------------------------ cliente */
  if v_cliente is null and v_nome <> '' then
    if v_doc <> '' then
      select id into v_cliente from clientes where documento_digitos = v_doc limit 1;
    end if;
    if v_cliente is null then
      select id into v_cliente from clientes
       where lower(nome_razao) = lower(v_nome) and situacao = 'ativo' limit 1;
    end if;
    if v_cliente is null then
      if not tem_permissao('clientes', 'criar') then
        raise exception 'Este cliente ainda não existe e seu perfil não permite cadastrar clientes.'
          using errcode = '42501';
      end if;
      insert into clientes (nome_razao, documento, tipo_pessoa, origem)
      values (v_nome, nullif(v_doc, ''),
              case when length(v_doc) = 14 then 'juridica' else 'fisica' end, 'manual')
      returning id into v_cliente;
      v_cliente_criado := true;
    end if;
  end if;

  /* ------------------------------------------------------------ veículo */
  if v_veiculo is null and v_placa <> '' then
    select id into v_veiculo from veiculos where placa_normalizada = v_placa limit 1;
    if v_veiculo is null then
      if not tem_permissao('veiculos', 'criar') then
        raise exception 'Esta placa ainda não existe e seu perfil não permite cadastrar veículos.'
          using errcode = '42501';
      end if;
      insert into veiculos (placa, descricao, tipo, cliente_id, origem)
      values (p_placa, nullif(btrim(coalesce(p_veiculo_descricao, '')), ''),
              coalesce(p_veiculo_tipo, 'outro'), v_cliente, 'manual')
      returning id into v_veiculo;
      v_veiculo_criado := true;
    elsif v_cliente is not null then
      /* Veículo já existia sem dono: aproveita a informação nova. */
      update veiculos set cliente_id = v_cliente
       where id = v_veiculo and cliente_id is null;
    end if;
  end if;

  return query select v_cliente, v_veiculo, v_cliente_criado, v_veiculo_criado;
end;
$$;

revoke all on function garantir_cliente_e_veiculo(uuid, text, text, uuid, text, text, tipo_veiculo)
  from public, anon;
grant execute on function garantir_cliente_e_veiculo(uuid, text, text, uuid, text, text, tipo_veiculo)
  to authenticated, service_role;;
