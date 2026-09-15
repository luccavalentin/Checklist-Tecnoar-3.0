-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260912210537.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

create or replace function public.sos_abrir_chamado(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_papel   public.sos_papel := public.sos_papel_atual();
  v_cli     uuid;
  v_vei     uuid := nullif(p->>'veiculo_id', '')::uuid;
  v_cfg     public.sos_config;
  v_id      uuid;
  v_status  public.sos_status;
  v_tel     text;
  v_existe  public.sos_chamados;
begin
  if auth.uid() is null then raise exception 'Sessão necessária.'; end if;
  select * into v_cfg from public.sos_config where singleton;

  if v_papel = 'central' then
    if not public.tem_permissao('sos', 'criar') then raise exception 'Sem permissão para abrir SOS.'; end if;
    v_cli := nullif(p->>'cliente_id', '')::uuid;
    if v_cli is null then raise exception 'Informe o cliente.'; end if;
  else
    v_cli := public.sos_cliente_atual();
    if v_cli is null then raise exception 'Conclua seu cadastro antes de pedir socorro.'; end if;
    -- Toque duplo, rede lenta, nervosismo: um SOS ativo por conta. O segundo
    -- pedido devolve o primeiro em vez de criar outro.
    select * into v_existe from public.sos_chamados
    where conta_usuario_id = auth.uid() and status not in ('servico_finalizado', 'concluido', 'cancelado')
    order by recebido_em desc limit 1;
    if found then
      return to_jsonb(v_existe) || jsonb_build_object('ja_existia', true);
    end if;
  end if;

  -- Veículo: o já cadastrado do cliente, ou um novo pela placa (sem duplicar).
  if v_vei is not null then
    if not exists (select 1 from public.veiculos where id = v_vei and (cliente_id = v_cli or v_papel = 'central')) then
      raise exception 'Veículo não pertence a este cliente.';
    end if;
  elsif nullif(p->>'placa', '') is not null then
    v_vei := public.sos_garantir_veiculo(v_cli, p->>'placa', nullif(p->>'veiculo_descricao', ''), nullif(p->>'veiculo_tipo', ''));
  elsif v_papel <> 'central' then
    -- Sem escolha no app: o veículo principal da conta (sem ele não nasce OS).
    select c.veiculo_principal_id into v_vei from public.sos_contas_cliente c
    join public.veiculos v on v.id = c.veiculo_principal_id and v.cliente_id = v_cli
    where c.usuario_id = auth.uid();
  end if;

  select coalesce(nullif(p->>'telefone_contato', ''), c.telefone, cl.celular, cl.telefone)
    into v_tel
  from public.clientes cl
  left join public.sos_contas_cliente c on c.usuario_id = auth.uid()
  where cl.id = v_cli;

  v_status := case when v_cfg.modo_distribuicao = 'inteligente' then 'procurando_mecanico' else 'recebido' end;

  insert into public.sos_chamados (
    cliente_id, veiculo_id, conta_usuario_id, aberto_por_equipe, origem, tipo_ocorrencia, descricao, prioridade,
    status, latitude, longitude, precisao_m, endereco, ponto_ajustado, telefone_contato, contexto_ia
  ) values (
    v_cli, v_vei,
    case when v_papel = 'central' then (select usuario_id from public.sos_contas_cliente where cliente_id = v_cli order by updated_at desc limit 1)
         else auth.uid() end,
    case when v_papel = 'central' then auth.uid() else null end,
    coalesce(nullif(p->>'origem', '')::public.sos_origem,
             (case when v_papel = 'central' then 'central' else 'app' end)::public.sos_origem),
    coalesce(nullif(p->>'tipo_ocorrencia', '')::public.sos_tipo_ocorrencia, 'outro'),
    nullif(trim(p->>'descricao'), ''),
    coalesce(nullif(p->>'prioridade', '')::public.sos_prioridade,
             (case when (p->>'tipo_ocorrencia') in ('freios', 'acidente') then 'emergencia'
                   when (p->>'tipo_ocorrencia') in ('parado', 'nao_liga') then 'alta'
                   else 'normal' end)::public.sos_prioridade),
    v_status,
    (p->>'latitude')::double precision, (p->>'longitude')::double precision, (p->>'precisao_m')::real,
    nullif(p->>'endereco', ''), coalesce((p->>'ponto_ajustado')::boolean, false), v_tel, p->'contexto_ia'
  ) returning id into v_id;

  perform public.sos_registrar_evento(v_id, 'status', public.sos_rotulo_status('recebido'),
    nullif(trim(p->>'descricao'), ''), jsonb_build_object('status', 'recebido', 'precisao_m', p->>'precisao_m'),
    (p->>'latitude')::double precision, (p->>'longitude')::double precision);
  if v_status = 'procurando_mecanico' then
    perform public.sos_registrar_evento(v_id, 'status', public.sos_rotulo_status('procurando_mecanico'),
      'Mecânicos disponíveis avisados automaticamente.', jsonb_build_object('status', 'procurando_mecanico'), null, null, 'sistema');
  end if;

  if v_vei is not null then
    insert into public.eventos_veiculo (veiculo_id, cliente_id, tipo, titulo, descricao, referencia_tabela, referencia_id)
    values (v_vei, v_cli, 'sos', 'SOS solicitado', nullif(trim(p->>'descricao'), ''), 'sos_chamados', v_id);
  end if;

  return (select to_jsonb(c) from public.sos_chamados c where c.id = v_id);
end;
$$;;
