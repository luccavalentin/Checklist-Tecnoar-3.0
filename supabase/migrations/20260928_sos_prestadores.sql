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
