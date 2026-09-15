-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260827105652.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- `tipo_pessoa` e `origem` são enums: o CASE devolvia texto e o insert falhava.
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
      values (
        v_nome,
        nullif(v_doc, ''),
        (case when length(v_doc) = 14 then 'juridica' else 'fisica' end)::tipo_pessoa,
        'manual'::origem_registro
      )
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
      values (
        p_placa,
        nullif(btrim(coalesce(p_veiculo_descricao, '')), ''),
        coalesce(p_veiculo_tipo, 'outro'::tipo_veiculo),
        v_cliente,
        'manual'::origem_registro
      )
      returning id into v_veiculo;
      v_veiculo_criado := true;
    elsif v_cliente is not null then
      update veiculos set cliente_id = v_cliente
       where id = v_veiculo and cliente_id is null;
    end if;
  end if;

  return query select v_cliente, v_veiculo, v_cliente_criado, v_veiculo_criado;
end;
$$;;
