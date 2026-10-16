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
