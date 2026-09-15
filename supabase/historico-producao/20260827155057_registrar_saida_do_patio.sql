-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260827155057.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

/**
 * Registra a saída do veículo do pátio.
 *
 * É o ato que fecha a OS: confere pendências, resolve o financeiro (pago na
 * hora ou faturado em parcelas), abre as garantias do que foi feito e libera
 * a entrada do pátio. Tudo numa transação — meio caminho aqui deixaria o
 * veículo fora do pátio com a OS aberta, ou a garantia sem a OS encerrada.
 *
 * Recusa a saída com item pendente de aprovação e com saldo em aberto sem
 * fatura: veículo que sai sem uma dessas duas coisas resolvidas vira cobrança
 * perdida ou discussão com o cliente.
 */
create or replace function registrar_saida_patio(
  p_os uuid,
  p_forma forma_pagamento default null,
  p_valor_pago numeric default null,
  p_faturar boolean default false,
  p_parcelas integer default null,
  p_primeiro_vencimento date default null,
  p_intervalo_dias integer default 30,
  p_condicao text default null,
  p_observacao text default null
)
returns table (recibo integer, fatura_id uuid, garantias_criadas integer, saida_em timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_os ordens_servico%rowtype;
  v_pendentes integer;
  v_saida timestamptz := now();
  v_pago numeric;
  v_saldo numeric;
  v_fatura uuid;
  v_recibo integer;
  v_garantias integer := 0;
  v_chk checklists%rowtype;
  v_parcela integer;
  v_valor_parcela numeric;
  v_resto numeric;
  v_item record;
begin
  if not tem_permissao('ordens_servico', 'editar') then
    raise exception 'Sem permissão para dar saída em ordens de serviço.' using errcode = '42501';
  end if;

  select * into v_os from ordens_servico where id = p_os for update;
  if not found then
    raise exception 'Ordem de serviço não encontrada.' using errcode = 'P0002';
  end if;
  if v_os.saida_em is not null then
    raise exception 'Esta OS já teve a saída registrada em %.', to_char(v_os.saida_em, 'DD/MM/YYYY HH24:MI')
      using errcode = '22023';
  end if;

  select count(*) into v_pendentes from (
    select 1 from os_servicos where os_id = p_os and aprovacao = 'pendente' and situacao = 'ativo'
    union all
    select 1 from os_produtos where os_id = p_os and aprovacao = 'pendente' and situacao = 'ativo'
  ) x;
  if v_pendentes > 0 then
    raise exception 'Há % item(ns) aguardando aprovação do cliente. Resolva antes da saída.', v_pendentes
      using errcode = '22023';
  end if;

  v_pago := greatest(coalesce(p_valor_pago, v_os.valor_pago), 0);
  if v_pago > v_os.valor_total then
    raise exception 'O valor recebido passa do total da OS.' using errcode = '22023';
  end if;
  v_saldo := v_os.valor_total - v_pago;

  if v_saldo > 0.005 and not p_faturar then
    raise exception 'Saldo de % em aberto. Receba o valor ou gere a fatura.', to_char(v_saldo, 'FM999G999D00')
      using errcode = '22023';
  end if;

  /* --------------------------------------------------------- faturamento */
  if p_faturar and v_saldo > 0.005 then
    if coalesce(p_parcelas, 0) < 1 then
      raise exception 'Informe em quantas parcelas o saldo será faturado.' using errcode = '22023';
    end if;

    insert into faturas (os_id, cliente_id, valor_total, condicao, emitida_por, observacoes)
    values (
      p_os,
      v_os.cliente_id,
      v_saldo,
      coalesce(nullif(btrim(p_condicao), ''), p_parcelas || 'x de ' || coalesce(p_intervalo_dias, 30) || ' dias'),
      auth.uid(),
      p_observacao
    )
    returning id into v_fatura;

    /* A divisão sobra centavos: o resto vai na primeira parcela, que é como
       o financeiro faz no papel. */
    v_valor_parcela := trunc(v_saldo / p_parcelas, 2);
    v_resto := v_saldo - (v_valor_parcela * p_parcelas);

    for v_parcela in 1..p_parcelas loop
      insert into fatura_parcelas (fatura_id, numero, vencimento, valor)
      values (
        v_fatura,
        v_parcela,
        coalesce(p_primeiro_vencimento, current_date + coalesce(p_intervalo_dias, 30))
          + ((v_parcela - 1) * coalesce(p_intervalo_dias, 30)),
        v_valor_parcela + (case when v_parcela = 1 then v_resto else 0 end)
      );
    end loop;
  end if;

  /* ------------------------------------------------------------ garantia */
  select * into v_chk from checklists
   where os_id = p_os and tipo = 'final_os' and situacao = 'concluido'
   order by concluido_em desc limit 1;

  if found and coalesce(v_chk.garantia_dias, 0) > 0 then
    for v_item in
      select 'servico'::text tipo, s.id item_id, s.servico_id ref, s.descricao
        from os_servicos s
       where s.os_id = p_os and s.situacao = 'ativo' and s.aprovacao <> 'recusado'
      union all
      select 'produto', p.id, p.produto_id, p.descricao
        from os_produtos p
       where p.os_id = p_os and p.situacao = 'ativo' and p.aprovacao <> 'recusado'
    loop
      insert into garantias (
        cliente_id, veiculo_id, os_id, tipo_item,
        os_servico_id, os_produto_id, servico_id, produto_id,
        descricao_item, inicio, fim, km_inicial, km_limite, politica, criada_por
      ) values (
        v_os.cliente_id, v_os.veiculo_id, p_os,
        (case when v_item.tipo = 'servico' then 'servico' else 'produto' end)::tipo_item_garantia,
        (case when v_item.tipo = 'servico' then v_item.item_id end),
        (case when v_item.tipo = 'produto' then v_item.item_id end),
        (case when v_item.tipo = 'servico' then v_item.ref end),
        (case when v_item.tipo = 'produto' then v_item.ref end),
        v_item.descricao,
        v_saida::date,
        v_saida::date + v_chk.garantia_dias,
        v_os.km,
        (case when v_chk.garantia_km is not null and v_os.km is not null
              then v_os.km + v_chk.garantia_km end),
        concat_ws(' · ',
          v_chk.garantia_dias || ' dias',
          nullif(v_chk.garantia_km, 0) || ' km',
          nullif(btrim(coalesce(v_chk.garantia_observacao, '')), '')
        ),
        auth.uid()
      );
      v_garantias := v_garantias + 1;
    end loop;
  end if;

  /* ------------------------------------------------------------- fechamento */
  select coalesce(max(recibo_numero), 0) + 1 into v_recibo from ordens_servico;

  update ordens_servico
     set valor_pago = v_pago,
         forma_pagamento = coalesce(p_forma, forma_pagamento),
         pago_em = case when v_saldo <= 0.005 then coalesce(pago_em, v_saida) else null end,
         condicao_pagamento = coalesce(nullif(btrim(p_condicao), ''), condicao_pagamento),
         observacao_pagamento = coalesce(nullif(btrim(p_observacao), ''), observacao_pagamento),
         saida_em = v_saida,
         saida_por = auth.uid(),
         recibo_numero = v_recibo,
         encerrada_em = coalesce(encerrada_em, v_saida),
         encerrada_por = coalesce(encerrada_por, auth.uid())
   where id = p_os;

  if v_os.entrada_id is not null then
    update entradas_patio
       set saida_em = v_saida, situacao = 'concluida'
     where id = v_os.entrada_id and saida_em is null;
  end if;

  insert into os_eventos (os_id, tipo, titulo, descricao, usuario_id)
  values (
    p_os, 'saida', 'Veículo liberado do pátio',
    concat_ws(' · ',
      'Recibo ' || lpad(v_recibo::text, 5, '0'),
      case when v_fatura is not null then 'faturado em ' || p_parcelas || 'x' else 'quitado' end,
      case when v_garantias > 0 then v_garantias || ' garantia(s) aberta(s)' end
    ),
    auth.uid()
  );

  return query select v_recibo, v_fatura, v_garantias, v_saida;
end;
$$;

revoke all on function registrar_saida_patio(uuid, forma_pagamento, numeric, boolean, integer, date, integer, text, text)
  from public, anon;
grant execute on function registrar_saida_patio(uuid, forma_pagamento, numeric, boolean, integer, date, integer, text, text)
  to authenticated, service_role;;
