-- ============================================================================
-- SOS Tecnoar — despacho em ondas, prestadores e cliente avulso
-- ============================================================================
-- As quatro migrações de 20260928 a 20261001 juntas, na ordem, para colar no
-- SQL Editor do Supabase de uma vez só.
--
-- COMO USAR
--   1. Supabase → SQL Editor → New query.
--   2. Cole este arquivo inteiro e clique em Run.
--   3. Confira no fim: a consulta de verificação imprime o que foi criado.
--
-- É SEGURO RODAR?
--   Sim, e mais de uma vez: tudo é idempotente (create ... if not exists,
--   create or replace, insert ... where not exists). Rodar duas vezes não
--   duplica nada — é exatamente o que a suíte de testes faz a cada execução.
--
-- O QUE MUDA NA OPERAÇÃO, NO MINUTO SEGUINTE
--   * O chamado passa a ser OFERECIDO em ondas, não mais gritado para todo
--     mecânico disponível. A onda 1 é a Tecnoar em até 60 km, por 90 s.
--   * O mecânico fora do raio deixa de receber push E deixa de ver o chamado.
--   * A linha do tempo do chamado passa a mostrar cada onda.
--   * Nenhum parceiro nasce cadastrado: na prática o atendimento segue 100%
--     Tecnoar, só que com raio. A última onda alcança qualquer distância, que
--     é o comportamento de hoje, como rede de segurança.
--
-- COMO VOLTAR ATRÁS, SE PRECISAR
--   Nada é apagado nem renomeado. Para desligar o despacho em ondas e voltar
--   ao comportamento antigo na hora, sem desfazer migração:
--       update public.sos_config set despacho_em_ondas = false;
--
-- Gerado de supabase/migrations/ — não edite aqui: a fonte são as migrações.
-- ============================================================================



-- ==========================================================================
-- ARQUIVO 1 de 4: 20260928_sos_prestadores.sql
-- ==========================================================================

-- SOS Tecnoar — prestadores: o atendimento deixa de ser só da equipe.
-- Roda depois de 20260927_sos_whatsapp_atendimento.sql. Idempotente.
--
-- Até aqui "mecânico" era, por definição de schema, funcionário da Tecnoar:
-- sos_chamados.mecanico_id aponta para usuarios e ponto final. Para o socorro
-- alcançar a estrada inteira, a Tecnoar precisa acionar oficinas parceiras
-- quando o mecânico próprio não chega — e o chamado precisa registrar de quem
-- foi o atendimento, para repasse e para relatório.
--
-- O desenho: todo mecânico pertence a um PRESTADOR. A Tecnoar é o prestador
-- nº 1, tipo 'proprio', e só pode existir um próprio (índice único parcial).
-- Parceiro é prestador tipo 'parceiro'.
--
-- O mecânico parceiro continua sendo uma linha em `usuarios` — identidade e
-- permissão são do Checklist, já testadas — mas com perfil restrito: ele não
-- é EQUIPE, então `sos_eh_equipe()` passa a recusá-lo e ele não vê a central,
-- o despacho, o cadastro nem o catálogo. O que ele pode ver do chamado é
-- fechado pela oferta, em 20260930_sos_ofertas_e_despacho.sql.
--
-- Esta migração NÃO liga parceiro nenhum: cria a estrutura e coloca toda a
-- equipe atual no prestador próprio. Nada muda para quem usa o app hoje.

-- =============================================================== tipos
do $$ begin
  create type public.sos_tipo_prestador as enum ('proprio', 'parceiro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sos_nivel_prestador as enum ('ouro', 'prata', 'bronze');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sos_situacao_prestador as enum ('ativo', 'suspenso', 'inativo');
exception when duplicate_object then null; end $$;

-- =========================================================== prestadores
create table if not exists public.sos_prestadores (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  tipo               public.sos_tipo_prestador not null default 'parceiro',
  nivel              public.sos_nivel_prestador not null default 'bronze',
  situacao           public.sos_situacao_prestador not null default 'ativo',
  documento          text,
  documento_digitos  text generated always as (regexp_replace(coalesce(documento, ''), '\D', '', 'g')) stored,
  telefone           text,
  email              text,
  responsavel        text,
  -- Base de operação do parceiro. Mecânico parceiro sem posição ao vivo
  -- (app fechado) entra no despacho pela distância da BASE — é o que a
  -- oficina garante atender, e sem isso o parceiro só existiria no mapa
  -- quando estivesse com o app aberto.
  base_latitude      double precision,
  base_longitude     double precision,
  base_municipio     text,
  base_uf            text,
  -- Até onde este prestador se compromete a ir.
  raio_atuacao_km    numeric not null default 60 check (raio_atuacao_km > 0),
  -- Repasse: quanto do atendimento fica com o parceiro.
  comissao_pct       numeric not null default 0 check (comissao_pct between 0 and 100),
  -- Vazio = atende qualquer ocorrência.
  atende_tipos       public.sos_tipo_ocorrencia[] not null default '{}',
  observacoes        text,
  criado_por         uuid references public.usuarios(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Um único prestador próprio: a Tecnoar. O resto é parceiro.
create unique index if not exists sos_prestadores_proprio_uk
  on public.sos_prestadores (tipo) where tipo = 'proprio';
create unique index if not exists sos_prestadores_documento_uk
  on public.sos_prestadores (documento_digitos) where documento_digitos <> '';
create index if not exists sos_prestadores_despacho_ix
  on public.sos_prestadores (tipo, situacao, nivel);

create or replace function public.sos_prestadores_antes()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sos_prestadores_antes on public.sos_prestadores;
create trigger sos_prestadores_antes
  before insert or update on public.sos_prestadores
  for each row execute function public.sos_prestadores_antes();

-- A Tecnoar nasce aqui, com o nome que a empresa já tem no cadastro.
insert into public.sos_prestadores (nome, tipo, nivel, situacao, raio_atuacao_km)
select coalesce(
         (select nullif(trim(nome_fantasia), '') from public.dados_empresa where singleton),
         (select nullif(trim(razao_social), '') from public.dados_empresa where singleton),
         'Tecnoar'),
       'proprio', 'ouro', 'ativo', 60
where not exists (select 1 from public.sos_prestadores where tipo = 'proprio');

-- O prestador próprio é lido em despacho, aceite e relatório: uma função só,
-- para ninguém sair gravando o id na mão.
create or replace function public.sos_prestador_proprio()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id from public.sos_prestadores where tipo = 'proprio' limit 1
$$;

-- ==================================================== mecânico ↔ prestador
alter table public.sos_mecanicos
  add column if not exists prestador_id uuid references public.sos_prestadores(id) on delete restrict;

update public.sos_mecanicos
set prestador_id = public.sos_prestador_proprio()
where prestador_id is null;

alter table public.sos_mecanicos
  alter column prestador_id set default public.sos_prestador_proprio();

do $$ begin
  alter table public.sos_mecanicos alter column prestador_id set not null;
exception when others then null; end $$;

create index if not exists sos_mecanicos_prestador_ix
  on public.sos_mecanicos (prestador_id, situacao);

-- Quem atendeu. Fica no chamado para o repasse e o relatório não dependerem
-- da ficha do mecânico, que muda de prestador se ele trocar de oficina.
alter table public.sos_chamados
  add column if not exists prestador_id uuid references public.sos_prestadores(id) on delete set null;

update public.sos_chamados c
set prestador_id = coalesce(
      (select m.prestador_id from public.sos_mecanicos m where m.usuario_id = c.mecanico_id),
      public.sos_prestador_proprio())
where c.mecanico_id is not null and c.prestador_id is null;

create index if not exists sos_chamados_prestador_ix
  on public.sos_chamados (prestador_id, recebido_em desc);

-- ============================================================== quem é quem
-- O prestador da pessoa logada (null para cliente e para quem nunca abriu o
-- app de atendimento).
create or replace function public.sos_meu_prestador()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.prestador_id from public.sos_mecanicos m where m.usuario_id = auth.uid()
$$;

-- Mecânico de oficina parceira. Usado para fechar a porta da central: ele
-- atende, mas não é da casa.
create or replace function public.sos_eh_parceiro()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.sos_mecanicos m
    join public.sos_prestadores p on p.id = m.prestador_id
    where m.usuario_id = auth.uid() and p.tipo = 'parceiro'
  )
$$;

-- EQUIPE é a Tecnoar. Antes bastava ter a permissão `sos`; agora o parceiro
-- é excluído mesmo que um perfil mal configurado lhe dê a permissão — a
-- barreira fica no banco, não na tela.
create or replace function public.sos_eh_equipe()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios u
    where u.id = auth.uid() and u.situacao = 'ativo'
      and (u.is_admin or public.tem_permissao('sos', 'visualizar'))
  ) and not public.sos_eh_parceiro()
$$;

-- =================================================================== RLS
alter table public.sos_prestadores enable row level security;

drop policy if exists sos_prestadores_ler on public.sos_prestadores;
create policy sos_prestadores_ler on public.sos_prestadores
  for select to authenticated using (
    (select public.sos_eh_equipe()) or id = (select public.sos_meu_prestador())
  );

-- ================================================================== RPCs
-- Lista para a Gestão SOS, com o desempenho de cada prestador no mês.
create or replace function public.sos_listar_prestadores()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.sos_eh_equipe() then '[]'::jsonb else
    coalesce((
      select jsonb_agg(x order by x->>'tipo', x->>'nivel', x->>'nome') from (
        select to_jsonb(p) || jsonb_build_object(
          'mecanicos', (select count(*)::int from public.sos_mecanicos m where m.prestador_id = p.id),
          'disponiveis', (select count(*)::int from public.sos_mecanicos m
                          where m.prestador_id = p.id and m.situacao = 'disponivel'),
          'atendimentos_mes', (select count(*)::int from public.sos_chamados c
                               where c.prestador_id = p.id
                                 and c.recebido_em >= date_trunc('month', now())),
          'nota_media', (select round(avg(c.avaliacao_nota), 1) from public.sos_chamados c
                         where c.prestador_id = p.id and c.avaliacao_nota is not null)
        ) as x
        from public.sos_prestadores p
      ) t
    ), '[]'::jsonb)
  end
$$;

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
      coalesce((select array_agg(v::public.sos_tipo_ocorrencia)
                from jsonb_array_elements_text(coalesce(p->'atende_tipos', '[]'::jsonb)) v), '{}'),
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
        atende_tipos = coalesce((select array_agg(v::public.sos_tipo_ocorrencia)
                                 from jsonb_array_elements_text(p->'atende_tipos') v), atende_tipos),
        observacoes = nullif(trim(p->>'observacoes'), '')
    where id = v_id;
    if not found then raise exception 'Prestador não encontrado.'; end if;
  end if;

  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.prestador', 'sos_prestadores', v_id, p);
  return (select to_jsonb(x) from public.sos_prestadores x where x.id = v_id);
end;
$$;

-- Visitante sem login não chama nada disto.
revoke execute on function public.sos_prestador_proprio(), public.sos_meu_prestador(),
  public.sos_eh_parceiro(), public.sos_listar_prestadores(), public.sos_salvar_prestador(jsonb)
  from public, anon;
grant execute on function public.sos_prestador_proprio(), public.sos_meu_prestador(),
  public.sos_eh_parceiro(), public.sos_listar_prestadores(), public.sos_salvar_prestador(jsonb)
  to authenticated, service_role;


-- ==========================================================================
-- ARQUIVO 2 de 4: 20260929_sos_solicitante_avulso.sql
-- ==========================================================================

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


-- ==========================================================================
-- ARQUIVO 3 de 4: 20260930_sos_ofertas_e_politica.sql
-- ==========================================================================

-- SOS Tecnoar — a oferta e a política de despacho.
-- Roda depois de 20260929_sos_solicitante_avulso.sql. Idempotente.
--
-- O problema que esta migração resolve: hoje o chamado não é oferecido, é
-- gritado. `sos_chamados_depois` percorre TODO mecânico disponível e manda
-- push, e `sos_home_mecanico` lista TODO chamado em aberto — sem raio nenhum.
-- `sos_config.raio_busca_km` existe desde a primeira migração e nunca foi
-- usado em lugar algum. Resultado: pane em Rondonópolis acorda o mecânico de
-- Cuiabá e o de São Paulo com o mesmo alarme, e nenhum dos dois sabe se o
-- chamado é para ele.
--
-- Duas peças novas:
--
-- 1. sos_politica_despacho — as ONDAS, em dados e não em código. Cada linha
--    diz: a quem oferecer (tipo e nível de prestador), em que faixa de
--    distância, com que situação de mecânico, e quanto tempo esperar antes de
--    abrir a onda seguinte. A regra "até 60 km é sempre Tecnoar" é a onda 1
--    com tipo_prestador = 'proprio' e raio_max_km = 60. Mudar para 80 km é
--    editar um campo na Gestão SOS, não fazer deploy.
--
-- 2. sos_ofertas — a quem o chamado foi oferecido, quando, até quando, e o que
--    a pessoa respondeu. É o que torna o despacho auditável: dela saem o
--    funil (quantos viram × quantos aceitaram), o tempo de resposta por
--    prestador e a confiabilidade que realimenta a pontuação. E é ela que
--    fecha a RLS: o mecânico passa a ver o chamado porque TEM OFERTA, não
--    porque o chamado existe.
--
-- O motor que cria as ofertas e vira as ondas vem em
-- 20261001_sos_motor_de_ondas.sql. Esta migração só prepara o terreno — e
-- traz a chave de desligar (`sos_config.despacho_em_ondas`), para a central
-- voltar ao comportamento antigo sem precisar de migração se algo der errado
-- na estrada.

-- =============================================================== tipos
do $$ begin
  create type public.sos_resposta_oferta as enum ('aceita', 'recusada', 'expirada', 'cancelada');
exception when duplicate_object then null; end $$;

-- ========================================================= configuração
alter table public.sos_config
  add column if not exists despacho_em_ondas boolean not null default true;

-- Emergência não espera o mesmo que um pneu furado: a espera de cada onda é
-- encurtada por esta porcentagem quando a prioridade é 'emergencia'.
alter table public.sos_config
  add column if not exists onda_emergencia_pct numeric not null default 50
  check (onda_emergencia_pct > 0 and onda_emergencia_pct <= 100);

-- Posição de mecânico mais velha que isto não conta para distância: ele pode
-- ter andado 200 km desde então. Sem posição válida vale a base do prestador.
alter table public.sos_config
  add column if not exists posicao_valida_min integer not null default 120;

-- ====================================================== política de ondas
create table if not exists public.sos_politica_despacho (
  id              uuid primary key default gen_random_uuid(),
  ordem           integer not null,
  nome            text not null,
  -- null = qualquer prestador. 'proprio' = só a Tecnoar.
  tipo_prestador  public.sos_tipo_prestador,
  -- Vazio = qualquer nível.
  niveis          public.sos_nivel_prestador[] not null default '{}',
  raio_min_km     numeric not null default 0 check (raio_min_km >= 0),
  raio_max_km     numeric not null default 60 check (raio_max_km > 0),
  -- Em que situação o mecânico entra nesta onda. A onda 1 chama só quem está
  -- disponível; as seguintes alargam para quem está em pausa ou terminando.
  situacoes       public.sos_situacao_mecanico[] not null default '{disponivel}',
  -- Quanto esperar antes de abrir a onda seguinte. 0 = última onda: fica
  -- aberta até alguém aceitar ou a central assumir.
  espera_seg      integer not null default 90 check (espera_seg >= 0),
  -- Vazio = vale para qualquer prioridade.
  prioridades     public.sos_prioridade[] not null default '{}',
  -- Quantos mecânicos recebem a oferta de uma vez. 0 = todos os elegíveis.
  max_ofertas     integer not null default 0 check (max_ofertas >= 0),
  -- Mecânico sem posição recente E sem base de prestador não tem distância:
  -- não se sabe se ele está dentro do raio. Nas ondas com raio apertado ele
  -- fica fora (é o que dá sentido aos 60 km); nas ondas de reforço ele entra,
  -- para ninguém ficar sem socorro porque o celular estava com a tela
  -- apagada. Limitação conhecida: PWA não manda GPS em segundo plano.
  aceita_sem_posicao boolean not null default false,
  ativo           boolean not null default true,
  observacoes     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (raio_max_km > raio_min_km)
);

create unique index if not exists sos_politica_ordem_uk
  on public.sos_politica_despacho (ordem) where ativo;

create or replace function public.sos_politica_antes()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sos_politica_antes on public.sos_politica_despacho;
create trigger sos_politica_antes
  before insert or update on public.sos_politica_despacho
  for each row execute function public.sos_politica_antes();

-- As ondas padrão. Só entram num banco que ainda não tem política nenhuma:
-- o que a central ajustar depois não é desfeito por reexecução.
insert into public.sos_politica_despacho
  (ordem, nome, tipo_prestador, niveis, raio_min_km, raio_max_km, situacoes, espera_seg,
   max_ofertas, aceita_sem_posicao, observacoes)
select * from (values
  (1, 'Tecnoar perto', 'proprio'::public.sos_tipo_prestador, '{}'::public.sos_nivel_prestador[],
      0::numeric, 60::numeric, '{disponivel}'::public.sos_situacao_mecanico[], 90, 0, false,
      'A janela exclusiva da Tecnoar: até 60 km, só mecânico próprio disponível e com posição conhecida.'),
  (2, 'Tecnoar — todos', 'proprio', '{}',
      0, 60, '{disponivel,pausa,em_atendimento}', 90, 0, true,
      'Ninguém com posição em 60 km: chama todo mecânico próprio, inclusive em pausa, terminando ou com o app fechado.'),
  (3, 'Tecnoar longe', 'proprio', '{}',
      60, 120, '{disponivel,pausa}', 120, 0, false,
      'Ainda Tecnoar, agora de 60 a 120 km.'),
  (4, 'Parceiro perto', 'parceiro', '{ouro,prata}',
      0, 60, '{disponivel}', 120, 0, false,
      'Só quando a Tecnoar não alcança: parceiro ouro e prata em até 60 km.'),
  (5, 'Parceiro — qualquer um', 'parceiro', '{}',
      0, 250, '{disponivel,pausa}', 120, 0, true,
      'Parceiro de qualquer nível, até 250 km.'),
  (6, 'Tecnoar — qualquer distância', 'proprio', '{}',
      0, 3000, '{disponivel,pausa}', 0, 0, true,
      'Rede de segurança: é o comportamento antigo do SOS (qualquer mecânico da casa vê o chamado). Fica aberta até alguém aceitar ou a central assumir — melhor um mecânico longe do que caminhoneiro sozinho na pista.')
) as v(ordem, nome, tipo_prestador, niveis, raio_min_km, raio_max_km, situacoes, espera_seg,
       max_ofertas, aceita_sem_posicao, observacoes)
where not exists (select 1 from public.sos_politica_despacho);

-- =============================================================== ofertas
create table if not exists public.sos_ofertas (
  id            uuid primary key default gen_random_uuid(),
  chamado_id    uuid not null references public.sos_chamados(id) on delete cascade,
  mecanico_id   uuid not null references public.usuarios(id) on delete cascade,
  prestador_id  uuid not null references public.sos_prestadores(id) on delete restrict,
  onda          integer not null default 1,
  politica_id   uuid references public.sos_politica_despacho(id) on delete set null,
  -- Como estava no momento da oferta: serve para medir o despacho depois,
  -- sem depender da posição de agora.
  distancia_km  numeric,
  eta_min       integer,
  por_base      boolean not null default false,
  enviada_em    timestamptz not null default now(),
  expira_em     timestamptz,
  respondida_em timestamptz,
  -- null = aberta, esperando resposta.
  resposta      public.sos_resposta_oferta,
  motivo        text
);

-- Uma oferta por mecânico por onda: o vigia reabrindo a onda não duplica.
create unique index if not exists sos_ofertas_uk
  on public.sos_ofertas (chamado_id, mecanico_id, onda);
-- A fila do mecânico e a RLS batem nisto.
create index if not exists sos_ofertas_abertas_ix
  on public.sos_ofertas (mecanico_id, chamado_id) where resposta is null;
create index if not exists sos_ofertas_chamado_ix
  on public.sos_ofertas (chamado_id, onda, resposta);
-- O vigia varre ofertas vencidas.
create index if not exists sos_ofertas_vencendo_ix
  on public.sos_ofertas (expira_em) where resposta is null;
create index if not exists sos_ofertas_prestador_ix
  on public.sos_ofertas (prestador_id, enviada_em desc);

-- ================================================= onda atual do chamado
alter table public.sos_chamados
  add column if not exists onda_atual smallint not null default 0;
alter table public.sos_chamados
  add column if not exists onda_em timestamptz;
alter table public.sos_chamados
  add column if not exists onda_expira_em timestamptz;
-- Acabaram as ondas e ninguém aceitou: a central precisa assumir na mão.
alter table public.sos_chamados
  add column if not exists sem_prestador_em timestamptz;

-- O vigia procura chamado com onda vencida: índice estreito, varredura curta.
create index if not exists sos_chamados_onda_ix
  on public.sos_chamados (onda_expira_em)
  where status in ('recebido', 'procurando_mecanico');

-- Posição do mecânico entra no pré-filtro por retângulo (ver
-- `sos_candidatos` em 20261001): sem índice, cada chamado varre a tabela.
create index if not exists sos_mecanicos_posicao_ix
  on public.sos_mecanicos (latitude, longitude) where situacao <> 'offline';

-- ============================================================= atalhos
create or replace function public.sos_despacho_em_ondas()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select despacho_em_ondas from public.sos_config where singleton), false)
$$;

-- O chamado está oferecido a mim agora? É isto que abre a porta do mecânico,
-- no lugar de "o chamado existe e está sem dono".
create or replace function public.sos_tem_oferta(p_chamado uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sos_ofertas o
    where o.chamado_id = p_chamado and o.mecanico_id = auth.uid() and o.resposta is null
  )
$$;

-- =================================================================== RLS
alter table public.sos_politica_despacho enable row level security;
alter table public.sos_ofertas           enable row level security;

drop policy if exists sos_politica_ler on public.sos_politica_despacho;
create policy sos_politica_ler on public.sos_politica_despacho
  for select to authenticated using ((select public.sos_eh_equipe()));

drop policy if exists sos_ofertas_ler on public.sos_ofertas;
create policy sos_ofertas_ler on public.sos_ofertas
  for select to authenticated using (
    mecanico_id = (select auth.uid()) or (select public.sos_eh_equipe())
  );

-- Chamado despachado em ondas só aparece para quem recebeu a oferta. Com as
-- ondas desligadas — ou no modo manual de distribuição, em que o chamado
-- nunca passa pelo despacho (`onda_atual = 0`) e a fila é da central —
-- continua como antes: qualquer chamado em aberto. É o que faz a chave de
-- desligar valer de verdade.
drop policy if exists sos_chamados_ler on public.sos_chamados;
create policy sos_chamados_ler on public.sos_chamados
  for select to authenticated using (
    (select public.sos_eh_equipe())
    or mecanico_id = (select auth.uid())
    or conta_usuario_id = (select auth.uid())
    or cliente_id = (select public.sos_cliente_atual())
    or (
      (select public.sos_eh_mecanico())
      and mecanico_id is null
      and status in ('recebido', 'procurando_mecanico')
      and (
        onda_atual = 0
        or not (select public.sos_despacho_em_ondas())
        or exists (select 1 from public.sos_ofertas o
                   where o.chamado_id = public.sos_chamados.id
                     and o.mecanico_id = (select auth.uid())
                     and o.resposta is null)
      )
    )
  );

create or replace function public.sos_pode_ver_chamado(p_chamado uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sos_chamados c
    where c.id = p_chamado
      and (
        public.sos_eh_equipe()
        or c.mecanico_id = auth.uid()
        or c.conta_usuario_id = auth.uid()
        or c.cliente_id = public.sos_cliente_atual()
        or (public.sos_eh_mecanico() and c.mecanico_id is null
            and c.status in ('recebido', 'procurando_mecanico')
            and (c.onda_atual = 0 or not public.sos_despacho_em_ondas()
                 or public.sos_tem_oferta(p_chamado)))
      )
  )
$$;

-- ================================================== política pela central
create or replace function public.sos_listar_politica()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.sos_eh_equipe() then '[]'::jsonb else
    coalesce((select jsonb_agg(to_jsonb(p) order by p.ordem) from public.sos_politica_despacho p), '[]'::jsonb)
  end
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
      coalesce((select array_agg(v::public.sos_nivel_prestador)
                from jsonb_array_elements_text(coalesce(p->'niveis', '[]'::jsonb)) v), '{}'),
      coalesce(nullif(p->>'raio_min_km', '')::numeric, 0),
      coalesce(nullif(p->>'raio_max_km', '')::numeric, 60),
      coalesce((select array_agg(v::public.sos_situacao_mecanico)
                from jsonb_array_elements_text(coalesce(p->'situacoes', '[]'::jsonb)) v), '{disponivel}'),
      coalesce(nullif(p->>'espera_seg', '')::int, 90),
      coalesce((select array_agg(v::public.sos_prioridade)
                from jsonb_array_elements_text(coalesce(p->'prioridades', '[]'::jsonb)) v), '{}'),
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
        niveis = coalesce((select array_agg(v::public.sos_nivel_prestador)
                           from jsonb_array_elements_text(p->'niveis') v), niveis),
        raio_min_km = coalesce(nullif(p->>'raio_min_km', '')::numeric, raio_min_km),
        raio_max_km = coalesce(nullif(p->>'raio_max_km', '')::numeric, raio_max_km),
        situacoes = coalesce((select array_agg(v::public.sos_situacao_mecanico)
                              from jsonb_array_elements_text(p->'situacoes') v), situacoes),
        espera_seg = coalesce(nullif(p->>'espera_seg', '')::int, espera_seg),
        prioridades = coalesce((select array_agg(v::public.sos_prioridade)
                                from jsonb_array_elements_text(p->'prioridades') v), prioridades),
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

revoke execute on function public.sos_despacho_em_ondas(), public.sos_tem_oferta(uuid),
  public.sos_listar_politica(), public.sos_salvar_politica(jsonb) from public, anon;
grant execute on function public.sos_despacho_em_ondas(), public.sos_tem_oferta(uuid),
  public.sos_listar_politica(), public.sos_salvar_politica(jsonb) to authenticated, service_role;


-- ==========================================================================
-- ARQUIVO 4 de 4: 20261001_sos_motor_de_ondas.sql
-- ==========================================================================

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


-- ============================================================================
-- VERIFICAÇÃO — o que deve aparecer depois do Run
-- ============================================================================
select 'prestador próprio' as item, nome as valor from public.sos_prestadores where tipo = 'proprio'
union all
select 'ondas configuradas', count(*)::text from public.sos_politica_despacho where ativo
union all
select 'despacho em ondas ligado', despacho_em_ondas::text from public.sos_config where singleton
union all
select 'mecânicos ligados ao prestador', count(*)::text from public.sos_mecanicos where prestador_id is not null
union all
select 'funções sos_ no banco', count(*)::text from pg_proc
  where pronamespace = 'public'::regnamespace and proname like 'sos\_%';

-- As seis ondas, na ordem em que o chamado passa por elas:
select ordem, nome, coalesce(tipo_prestador::text, 'qualquer') as prestador,
       raio_min_km || '–' || raio_max_km || ' km' as faixa,
       case when espera_seg = 0 then 'fica aberta' else espera_seg || ' s' end as espera
from public.sos_politica_despacho where ativo order by ordem;
