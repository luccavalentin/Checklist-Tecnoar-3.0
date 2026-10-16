-- SOS Tecnoar — qualquer caminhoneiro pede socorro, sem entrar no cadastro
-- antes da hora. Roda depois de 20260928_sos_prestadores.sql. Idempotente.
--
-- O SOS passa a aceitar quem não é cliente da Tecnoar: o cara quebrou na
-- estrada, baixa o app, pede socorro. Só que, até aqui, `sos_registrar_conta`
-- criava uma linha em `clientes` no momento do CADASTRO — e `clientes` é o
-- cadastro fiscal da empresa, sincronizado com a Omie. Abrir o app ao público
-- desse jeito enche a Omie de gente que só olhou a tela e nunca pediu nada.
--
-- A correção é mover a criação do cadastro para o momento em que ela
-- significa algo: o PRIMEIRO PEDIDO. Quem baixou e não pediu socorro é uma
-- conta do app (`sos_contas_cliente`) sem vínculo nenhum com `clientes`.
-- Quem pediu consumiu serviço, precisa de OS e de nota — e aí sim entra no
-- cadastro, no mesmo instante, dentro da transação do pedido.
--
-- O que NÃO muda: `sos_chamados.cliente_id` continua `not null`. Chamado
-- sempre tem cadastro, porque o cadastro nasce junto com ele. Nenhuma das
-- ~40 funções que contam com `cliente_id` precisou ser revista, e a OS, o
-- estoque, o laudo e os relatórios seguem iguais.
--
-- Herança de cadastro: quem já é cliente da Tecnoar continua caindo no
-- cadastro dele ao se registrar, pela regra de 20260920 (e-mail confirmado
-- igual ao do cadastro). O que saiu foi só a criação de cadastro NOVO.

-- ============================================ cadastro na hora do pedido
-- Devolve o cadastro de cliente da conta logada, criando-o se for a primeira
-- vez que faz falta. Chamada de dentro do pedido de socorro, nunca do
-- cadastro da conta.
create or replace function public.sos_garantir_cliente_da_conta()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conta    public.sos_contas_cliente;
  v_cli      uuid;
  v_doc      text;
  v_tel      text;
  v_doc_livre boolean;
  v_parecido public.clientes;
  v_u        uuid;
begin
  if auth.uid() is null then raise exception 'Sessão necessária.'; end if;
  select * into v_conta from public.sos_contas_cliente where usuario_id = auth.uid();
  if not found then raise exception 'Conclua seu cadastro antes de pedir socorro.'; end if;
  if v_conta.cliente_id is not null then return v_conta.cliente_id; end if;

  -- Dois toques ao mesmo tempo não abrem dois cadastros: o segundo espera o
  -- primeiro e lê o que ele gravou.
  perform pg_advisory_xact_lock(hashtextextended('sos_cliente_conta:' || auth.uid()::text, 0));
  select cliente_id into v_cli from public.sos_contas_cliente where usuario_id = auth.uid();
  if v_cli is not null then return v_cli; end if;

  v_doc := nullif(v_conta.documento_digitos, '');
  v_tel := nullif(v_conta.telefone_digitos, '');

  -- Documento ou celular de um cadastro que já existe: pode ser a mesma
  -- pessoa ou alguém se passando por ela. Não herda nada — nasce cadastro
  -- próprio e a central é avisada para vincular se for mesmo a mesma pessoa
  -- (SOS → Clientes do app → Vincular).
  if v_doc is not null then
    select * into v_parecido from public.clientes
    where documento_digitos = v_doc and situacao = 'ativo' limit 1;
  end if;
  if v_parecido.id is null and v_tel is not null then
    -- Últimos 8 dígitos evitam diferença de DDI/9º dígito entre cadastros.
    select * into v_parecido from public.clientes
    where situacao = 'ativo'
      and (right(regexp_replace(coalesce(celular, ''), '\D', '', 'g'), 8) = right(v_tel, 8)
           or right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = right(v_tel, 8))
    order by created_at limit 1;
  end if;

  -- `documento_digitos` é coluna gerada e única em `clientes`: com um cadastro
  -- parecido, o documento fica só na conta do app até a central conferir.
  v_doc_livre := v_doc is not null and v_parecido.id is null;

  insert into public.clientes (tipo_pessoa, nome_razao, documento, celular, email, origem, notificar_whatsapp)
  values (
    (case when v_doc is not null and length(v_doc) = 14 then 'juridica' else 'fisica' end)::public.tipo_pessoa,
    v_conta.nome,
    case when v_doc_livre then v_doc end,
    v_conta.telefone, v_conta.email, 'manual', true)
  returning id into v_cli;

  update public.sos_contas_cliente
  set cliente_id = v_cli, updated_at = now()
  where usuario_id = auth.uid();

  -- Veículo que a conta cadastrou antes de ter cadastro de cliente.
  update public.veiculos
  set cliente_id = v_cli, updated_at = now()
  where id = v_conta.veiculo_principal_id and cliente_id is null;

  if v_parecido.id is not null then
    for v_u in select * from public.sos_usuarios_central() loop
      perform public.sos_notificar(v_u, 'Conta do app para conferir',
        coalesce(v_conta.nome, 'Uma conta do app') || ' pediu socorro com '
          || case when v_doc is not null and v_parecido.documento_digitos = v_doc then 'o documento' else 'o celular' end
          || ' de ' || v_parecido.nome_razao || '. Se for a mesma pessoa, vincule em SOS → Clientes do app.',
        '/sos/clientes');
    end loop;
  end if;

  return v_cli;
end;
$$;

-- ====================================================== cadastro da conta
-- Igual a 20260920, menos uma coisa: não cria mais cadastro de cliente. A
-- herança do cadastro existente (e-mail confirmado) continua, porque aí a
-- pessoa JÁ é cliente da Tecnoar e nada é criado.
create or replace function public.sos_registrar_conta(
  p_nome text, p_telefone text, p_documento text default null, p_email text default null,
  p_aceite_termos boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tel         text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_doc         text := nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '');
  v_cli         uuid;
  v_nome        text := nullif(trim(p_nome), '');
  v_email_conta text;
  v_confirmado  boolean;
  v_email       text;
  v_sit         text;
begin
  if auth.uid() is null then raise exception 'Sessão necessária.'; end if;
  if v_nome is null then raise exception 'Informe seu nome.'; end if;
  if v_tel is null or length(v_tel) < 10 then raise exception 'Informe um celular com DDD.'; end if;
  if v_doc is not null and length(v_doc) not in (11, 14) then raise exception 'CPF ou CNPJ incompleto.'; end if;

  -- Confirmado = recebeu o e-mail de confirmação e clicou no link. Com a
  -- confirmação desligada no Auth, `email_confirmed_at` é preenchido na hora
  -- (sem `confirmation_sent_at`) e não prova nada: aí nunca herda cadastro.
  select nullif(lower(trim(u.email)), ''), u.email_confirmed_at is not null and u.confirmation_sent_at is not null
    into v_email_conta, v_confirmado
  from auth.users u where u.id = auth.uid();
  v_email := coalesce(nullif(trim(p_email), ''), v_email_conta);

  select situacao::text into v_sit from public.usuarios where id = auth.uid();
  -- Funcionário ativo pode ter também o perfil de cliente (modo cliente do app).
  if v_sit is not null and v_sit not in ('pendente', 'ativo') then
    raise exception 'Esta conta da equipe está inativa. Fale com a Tecnoar.';
  end if;
  if v_sit = 'pendente' then
    -- Pedido de acesso criado sozinho quando a conta nasceu pelo app: some.
    if coalesce((select raw_user_meta_data->>'tipo_conta' from auth.users where id = auth.uid()), '') = 'sos_cliente' then
      delete from public.usuarios where id = auth.uid() and situacao = 'pendente';
    else
      raise exception 'Esta conta tem um pedido de acesso à equipe em análise. Use outro e-mail para o app de cliente.';
    end if;
  end if;

  -- Já tem conta de cliente: só atualiza os dados, o vínculo não muda aqui.
  select cliente_id into v_cli from public.sos_contas_cliente where usuario_id = auth.uid();

  -- A mesma pessoa: e-mail confirmado da conta = e-mail do cadastro. Quem já
  -- é cliente da Tecnoar entra direto no histórico dele.
  if v_cli is null and v_confirmado and v_email_conta is not null then
    select id into v_cli from public.clientes
    where situacao = 'ativo' and lower(trim(email)) = v_email_conta
    order by created_at limit 1;
  end if;

  -- Sem cadastro para herdar, a conta fica avulsa. Ela entra em `clientes`
  -- no primeiro pedido de socorro (`sos_garantir_cliente_da_conta`).
  insert into public.sos_contas_cliente (usuario_id, cliente_id, nome, telefone, telefone_digitos, documento_digitos, email, aceite_termos_em)
  values (auth.uid(), v_cli, v_nome, p_telefone, v_tel, v_doc, v_email, case when p_aceite_termos then now() end)
  on conflict (usuario_id) do update
    set cliente_id = coalesce(public.sos_contas_cliente.cliente_id, excluded.cliente_id),
        nome = excluded.nome, telefone = excluded.telefone, telefone_digitos = excluded.telefone_digitos,
        documento_digitos = coalesce(excluded.documento_digitos, public.sos_contas_cliente.documento_digitos),
        email = coalesce(excluded.email, public.sos_contas_cliente.email),
        aceite_termos_em = coalesce(public.sos_contas_cliente.aceite_termos_em, excluded.aceite_termos_em),
        updated_at = now();

  return public.sos_meu_papel();
end;
$$;

-- ============================================================ o pedido
-- Igual a 20260920, com duas correções:
--   1. conta sem cadastro não é mais recusada: o cadastro nasce aqui;
--   2. "é a central abrindo para outro?" passa a olhar se a pessoa tem CONTA
--      de cliente, não se ela tem CADASTRO. Antes, funcionário no modo
--      cliente com conta avulsa caía no fluxo da central e ouvia "Informe o
--      cliente".
create or replace function public.sos_abrir_chamado(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_papel   public.sos_papel := public.sos_papel_atual();
  v_central boolean;
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

  v_central := v_papel = 'central'
    and (nullif(p->>'cliente_id', '') is not null
         or not exists (select 1 from public.sos_contas_cliente where usuario_id = auth.uid()));

  if v_central then
    if not public.tem_permissao('sos', 'criar') then raise exception 'Sem permissão para abrir SOS.'; end if;
    v_cli := nullif(p->>'cliente_id', '')::uuid;
    if v_cli is null then raise exception 'Informe o cliente.'; end if;
  else
    -- Toque duplo, rede lenta, nervosismo: um SOS ativo por conta. A trava
    -- por conta faz o segundo pedido simultâneo esperar o primeiro e
    -- devolver o mesmo chamado, em vez de criar outro. Vem antes do cadastro
    -- para que o segundo toque também não crie um cadastro a mais.
    perform pg_advisory_xact_lock(hashtextextended('sos_abrir:' || auth.uid()::text, 0));
    select * into v_existe from public.sos_chamados
    where conta_usuario_id = auth.uid() and status not in ('servico_finalizado', 'concluido', 'cancelado')
    order by recebido_em desc limit 1;
    if found then
      return to_jsonb(v_existe) || jsonb_build_object('ja_existia', true);
    end if;
    -- Cliente novo na estrada: o cadastro nasce agora, com o pedido.
    v_cli := public.sos_garantir_cliente_da_conta();
  end if;

  -- Veículo: o já cadastrado do cliente, ou um novo pela placa (sem duplicar).
  if v_vei is not null then
    if not exists (select 1 from public.veiculos where id = v_vei and (cliente_id = v_cli or v_central)) then
      raise exception 'Veículo não pertence a este cliente.';
    end if;
  elsif nullif(p->>'placa', '') is not null then
    v_vei := public.sos_garantir_veiculo(v_cli, p->>'placa', nullif(p->>'veiculo_descricao', ''), nullif(p->>'veiculo_tipo', ''));
  elsif not v_central then
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
    case when v_central then (select usuario_id from public.sos_contas_cliente where cliente_id = v_cli order by updated_at desc limit 1)
         else auth.uid() end,
    case when v_central then auth.uid() else null end,
    coalesce(nullif(p->>'origem', '')::public.sos_origem,
             (case when v_central then 'central' else 'app' end)::public.sos_origem),
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
    (p->>'latitude')::double precision, (p->>'longitude')::double precision,
    (case when v_central then 'central' else 'cliente' end)::public.sos_papel);
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
$$;

-- ====================================================== veículo da conta
-- A conta avulsa cadastra o caminhão antes de precisar de socorro. O veículo
-- nasce sem dono em `veiculos` (que não vai para a Omie) e fica amarrado à
-- conta por `veiculo_principal_id`; `sos_garantir_cliente_da_conta` o adota
-- quando o cadastro nasce.
create or replace function public.sos_cadastrar_veiculo(p_placa text, p_descricao text default null, p_tipo text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cli   uuid := public.sos_cliente_atual();
  v_id    uuid;
  v_conta boolean;
begin
  select true into v_conta from public.sos_contas_cliente where usuario_id = auth.uid();
  if not coalesce(v_conta, false) then raise exception 'Conclua seu cadastro primeiro.'; end if;
  if length(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g')) <> 7 then
    raise exception 'Placa inválida (7 caracteres).';
  end if;
  v_id := public.sos_garantir_veiculo(v_cli, p_placa, p_descricao, p_tipo);
  update public.sos_contas_cliente set veiculo_principal_id = coalesce(veiculo_principal_id, v_id), updated_at = now()
  where usuario_id = auth.uid();
  return v_id;
end;
$$;

-- ========================================================= home do cliente
-- Só a guarda muda: a tela abre para quem tem CONTA, não para quem tem
-- cadastro. Conta avulsa vê a home com o nome dela e o botão de socorro; as
-- consultas por `cliente_id` nulo devolvem vazio, que é o certo.
create or replace function public.sos_home_cliente()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_cli   uuid := public.sos_cliente_atual();
  v_conta public.sos_contas_cliente;
  v_vei   record;
  v_os    record;
  v_lemb  record;
begin
  select * into v_conta from public.sos_contas_cliente where usuario_id = auth.uid();
  if not found then return jsonb_build_object('ok', false); end if;

  select v.id, v.placa, v.marca, v.modelo, v.ano, v.km_atual, v.descricao, v.tipo
    into v_vei
  from public.veiculos v
  where (v.cliente_id = v_cli or (v_cli is null and v.id = v_conta.veiculo_principal_id))
    and v.situacao = 'ativo'
  order by (v.id = v_conta.veiculo_principal_id) desc nulls last, v.updated_at desc limit 1;

  select o.id, o.numero, o.encerrada_em, o.aberta_em, o.km,
         (select string_agg(s.descricao, ', ') from public.os_servicos s where s.os_id = o.id and s.situacao = 'ativo') as servicos,
         (select nome from public.status_os where id = o.status_id) as status
    into v_os
  from public.ordens_servico o
  where o.cliente_id = v_cli and o.situacao = 'ativo' and (v_vei.id is null or o.veiculo_id = v_vei.id)
  order by coalesce(o.encerrada_em, o.aberta_em) desc limit 1;

  select l.id, l.titulo, l.mensagem, l.vence_em, l.vence_km into v_lemb from public.sos_lembretes l
  where l.cliente_id = v_cli and l.dispensado_em is null and (v_vei.id is null or l.veiculo_id = v_vei.id)
  order by l.vence_em nulls last limit 1;

  return jsonb_build_object(
    'ok', true,
    'nome', v_conta.nome,
    'veiculo', case when v_vei.id is null then null else to_jsonb(v_vei) end,
    'total_veiculos', (select count(*) from public.veiculos
                       where situacao = 'ativo'
                         and (cliente_id = v_cli or (v_cli is null and id = v_conta.veiculo_principal_id))),
    'ultimo_servico', case when v_os.id is null then null else jsonb_build_object(
      'os_id', v_os.id, 'numero', v_os.numero, 'em', coalesce(v_os.encerrada_em, v_os.aberta_em), 'km', v_os.km,
      'servicos', v_os.servicos, 'status', v_os.status, 'encerrada', v_os.encerrada_em is not null) end,
    'veiculo_na_oficina', exists (select 1 from public.ordens_servico o where o.cliente_id = v_cli and o.situacao = 'ativo'
                                  and o.encerrada_em is null and (v_vei.id is null or o.veiculo_id = v_vei.id)),
    'proxima_revisao', case when v_lemb.titulo is null then null else to_jsonb(v_lemb) end,
    -- Pela conta, não pelo cadastro: o chamado do primeiro pedido aparece
    -- mesmo no instante em que o cadastro está nascendo.
    'chamado_ativo', (select to_jsonb(c) from public.sos_chamados c
                      where (c.conta_usuario_id = auth.uid() or c.cliente_id = v_cli)
                        and c.status not in ('servico_finalizado', 'concluido', 'cancelado')
                      order by c.recebido_em desc limit 1),
    'pendente_avaliacao', (select to_jsonb(c) from public.sos_chamados c
                      where (c.conta_usuario_id = auth.uid() or c.cliente_id = v_cli)
                        and c.status = 'servico_finalizado' and c.avaliado_em is null
                      order by c.finalizado_em desc limit 1),
    'agendamentos_abertos', (select count(*) from public.sos_agendamentos where cliente_id = v_cli and status in ('solicitado', 'confirmado')),
    'lembretes', (select count(*) from public.sos_lembretes where cliente_id = v_cli and dispensado_em is null and lido_em is null)
  );
end;
$$;

-- =================================================================== RLS
-- O veículo que a conta avulsa cadastrou ainda não tem dono em `clientes`:
-- sem esta política ela não veria o próprio caminhão na tela.
drop policy if exists veiculos_sos_conta on public.veiculos;
create policy veiculos_sos_conta on public.veiculos
  for select to authenticated using (
    cliente_id is null
    and id = (select c.veiculo_principal_id from public.sos_contas_cliente c
              where c.usuario_id = (select auth.uid()))
  );

revoke execute on function public.sos_garantir_cliente_da_conta() from public, anon;
grant execute on function public.sos_garantir_cliente_da_conta() to authenticated, service_role;
