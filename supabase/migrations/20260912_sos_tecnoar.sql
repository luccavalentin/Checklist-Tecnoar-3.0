-- SOS Tecnoar: socorro mecânico com pedido, aceite, deslocamento acompanhado
-- no mapa, atendimento com itens do catálogo e conclusão — tudo ligado aos
-- clientes, veículos, produtos, serviços e OS que já existem no Checklist.
--
-- COMO APLICAR: projeto zdhebeqlhynffxfmedvj → SQL Editor → colar o arquivo
-- inteiro → Run. É idempotente (pode rodar de novo). Depois, regerar
-- `src/tipos/supabase.ts` (nunca editar à mão).
--
-- Decisões que explicam o desenho:
--
-- 1. O cliente final entra pelo MESMO Supabase Auth, mas NÃO vira linha em
--    `usuarios` — isso o deixaria entrar no Checklist. Ele vira
--    `sos_contas_cliente`, amarrado a um `clientes` já existente (achado por
--    CPF/CNPJ ou celular) ou criado na hora. Um cliente só, um cadastro só.
--    O cadastro do app manda `tipo_conta = 'sos_cliente'` nos metadados e um
--    gatilho impede que essa conta caia em `usuarios` como "pendente".
-- 2. `notificacoes` e `push_inscricoes` passam a apontar para `auth.users`
--    em vez de `usuarios`. Como `usuarios.id` é sempre um `auth.users.id`,
--    nada muda para a equipe; e o cliente passa a receber o mesmo push, pelo
--    mesmo gatilho `notificacoes_push`, sem função nova.
-- 3. Toda mudança de estado do chamado passa por RPC `security definer`:
--    quem pode aceitar, avançar, cancelar e em que ordem é regra do banco,
--    não do aplicativo. As tabelas ficam legíveis por RLS e quase nunca
--    escrevíveis direto.
-- 4. Produtos e serviços usados no socorro vêm de `produtos`/`servicos` (o
--    catálogo do Checklist, com o preço de lá) e viram `os_produtos`/
--    `os_servicos` quando o chamado ganha OS. Nada de cadastro paralelo.
-- 5. Posição em tempo real é linha em `sos_posicoes` publicada pelo Realtime.
--    30 dias depois de encerrar, o rastro é apagado (localização é dado
--    sensível — LGPD).
-- 6. Aviso por WhatsApp (Evolution API) é canal COMPLEMENTAR, disparado por
--    pg_net depois que o chamado já existe no banco. Nunca o contrário.
-- 7. O app do cliente e do mecânico mora em /app/ (mesmo domínio do
--    Checklist); os links das notificações apontam para lá.

begin;

-- ============================================================== enums
do $$ begin
  create type public.sos_status as enum (
    'solicitado',          -- só existe no aparelho, antes de o servidor confirmar
    'recebido',            -- chegou na Tecnoar
    'procurando_mecanico', -- equipe avisada, ninguém aceitou ainda
    'aceito',              -- mecânico aceitou
    'a_caminho',
    'no_local',
    'servico_iniciado',
    'servico_finalizado',
    'concluido',
    'cancelado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sos_tipo_ocorrencia as enum (
    'freios', 'nao_liga', 'mecanico', 'parado', 'pane_eletrica', 'acidente', 'roda_pneu', 'vazamento', 'desconhecido', 'outro'
  );
exception when duplicate_object then null; end $$;
-- Em bancos onde o tipo já existia sem os valores novos.
alter type public.sos_tipo_ocorrencia add value if not exists 'vazamento';
alter type public.sos_tipo_ocorrencia add value if not exists 'desconhecido';

do $$ begin
  create type public.sos_prioridade as enum ('normal', 'alta', 'emergencia');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sos_papel as enum ('cliente', 'mecanico', 'central', 'sistema');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sos_origem as enum ('app', 'central', 'ia', 'whatsapp', 'telefone');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sos_tipo_agendamento as enum ('revisao', 'manutencao', 'orcamento', 'outro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sos_status_agendamento as enum ('solicitado', 'confirmado', 'realizado', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sos_situacao_mecanico as enum ('disponivel', 'em_atendimento', 'indisponivel', 'pausa', 'offline');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.sos_tipo_anexo as enum ('foto', 'audio', 'video', 'documento', 'assinatura');
exception when duplicate_object then null; end $$;

-- ============================================================== notificações para qualquer conta
-- usuarios.id ⊂ auth.users.id: trocar o alvo da chave não invalida nenhuma
-- linha existente e abre o sino/push para o cliente final.
alter table public.notificacoes drop constraint if exists notificacoes_usuario_id_fkey;
alter table public.notificacoes
  add constraint notificacoes_usuario_id_fkey
  foreign key (usuario_id) references auth.users(id) on delete cascade;

alter table public.push_inscricoes drop constraint if exists push_inscricoes_usuario_id_fkey;
alter table public.push_inscricoes
  add constraint push_inscricoes_usuario_id_fkey
  foreign key (usuario_id) references auth.users(id) on delete cascade;

-- Cada conta lê e marca só as próprias notificações (política a mais, não
-- substitui as existentes da equipe).
drop policy if exists notificacoes_proprias_sos on public.notificacoes;
create policy notificacoes_proprias_sos on public.notificacoes
  for select to authenticated
  using (usuario_id = (select auth.uid()));

drop policy if exists notificacoes_proprias_sos_marcar on public.notificacoes;
create policy notificacoes_proprias_sos_marcar on public.notificacoes
  for update to authenticated
  using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

-- ============================================================== conta de cliente não vira funcionário
-- O cadastro de qualquer conta nova cai em `usuarios` como pendente (é assim
-- que o "Solicitar acesso" chega ao administrador). Quem se cadastra pelo app
-- SOS avisa nos metadados; essa linha é descartada antes de existir — sem
-- pedido de acesso falso na tela do administrador.
create or replace function public.sos_ignorar_conta_cliente()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1 from auth.users a
    where a.id = new.id and coalesce(a.raw_user_meta_data->>'tipo_conta', '') = 'sos_cliente'
  ) and coalesce(new.situacao::text, 'pendente') = 'pendente' then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists sos_ignorar_conta_cliente on public.usuarios;
create trigger sos_ignorar_conta_cliente
  before insert on public.usuarios
  for each row execute function public.sos_ignorar_conta_cliente();

-- ============================================================== tabelas
create table if not exists public.sos_contas_cliente (
  usuario_id            uuid primary key references auth.users(id) on delete cascade,
  cliente_id            uuid references public.clientes(id) on delete set null,
  nome                  text not null,
  telefone              text,
  telefone_digitos      text,
  documento_digitos     text,
  email                 text,
  veiculo_principal_id  uuid references public.veiculos(id) on delete set null,
  aceite_termos_em      timestamptz,
  aceite_localizacao_em timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists sos_contas_cliente_cliente on public.sos_contas_cliente (cliente_id);

create table if not exists public.sos_config (
  singleton             boolean primary key default true check (singleton),
  modo_distribuicao     text not null default 'inteligente' check (modo_distribuicao in ('manual', 'inteligente')),
  raio_busca_km         numeric not null default 80,
  -- Sem rota calculada, a previsão de chegada usa esta média.
  velocidade_media_kmh  numeric not null default 40,
  tempo_aceite_seg      integer not null default 120,
  telefone_central      text,
  whatsapp_ativo        boolean not null default false,
  whatsapp_url          text,
  whatsapp_instancia    text,
  whatsapp_destinos     text[] not null default '{}',
  mensagem_espera       text not null default 'Recebemos seu pedido. Estamos acionando a equipe e você acompanha tudo por aqui.',
  lembrete_meses        integer not null default 6,
  lembrete_km           integer not null default 10000,
  -- O cliente pode cancelar sozinho até este status (exclusive).
  cancelamento_cliente_ate public.sos_status not null default 'servico_iniciado',
  -- Ao finalizar o serviço, o chamado vira OS sozinho (itens incluídos).
  gerar_os_ao_finalizar boolean not null default true,
  atualizado_por        uuid,
  updated_at            timestamptz not null default now()
);
alter table public.sos_config add column if not exists gerar_os_ao_finalizar boolean not null default true;
-- Vigia (sos_vigiar): "disponível" sem sinal do app por este tempo vira offline
-- (0 = nunca); serviço finalizado sem avaliação é concluído depois destas horas.
alter table public.sos_config add column if not exists offline_apos_min integer not null default 240;
alter table public.sos_config add column if not exists concluir_apos_horas integer not null default 24;
insert into public.sos_config (singleton) values (true) on conflict do nothing;

create table if not exists public.sos_mecanicos (
  usuario_id        uuid primary key references public.usuarios(id) on delete cascade,
  aceita_sos        boolean not null default true,
  situacao          public.sos_situacao_mecanico not null default 'offline',
  -- Espelho de `situacao = 'disponivel'`, mantido por gatilho: filtro barato.
  disponivel        boolean not null default false,
  latitude          double precision,
  longitude         double precision,
  precisao_m        real,
  posicao_em        timestamptz,
  veiculo_apoio     text,
  telefone_contato  text,
  mostrar_telefone  boolean not null default false,
  chamado_atual_id  uuid,
  situacao_em       timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.sos_mecanicos add column if not exists situacao public.sos_situacao_mecanico not null default 'offline';
alter table public.sos_mecanicos add column if not exists situacao_em timestamptz not null default now();

create or replace function public.sos_mecanicos_antes()
returns trigger
language plpgsql
as $$
begin
  new.disponivel := new.situacao = 'disponivel';
  if tg_op = 'INSERT' or new.situacao is distinct from old.situacao then
    new.situacao_em := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sos_mecanicos_antes on public.sos_mecanicos;
create trigger sos_mecanicos_antes
  before insert or update on public.sos_mecanicos
  for each row execute function public.sos_mecanicos_antes();

create table if not exists public.sos_chamados (
  id                    uuid primary key default gen_random_uuid(),
  numero                bigint generated always as identity,
  protocolo             text unique,
  cliente_id            uuid not null references public.clientes(id),
  veiculo_id            uuid references public.veiculos(id),
  conta_usuario_id      uuid references auth.users(id) on delete set null,
  aberto_por_equipe     uuid references public.usuarios(id) on delete set null,
  origem                public.sos_origem not null default 'app',
  tipo_ocorrencia       public.sos_tipo_ocorrencia not null default 'outro',
  descricao             text,
  prioridade            public.sos_prioridade not null default 'normal',
  status                public.sos_status not null default 'recebido',
  -- Onde o veículo está. `ponto_ajustado` = o cliente arrastou o pino.
  latitude              double precision,
  longitude             double precision,
  precisao_m            real,
  endereco              text,
  ponto_ajustado        boolean not null default false,
  telefone_contato      text,
  mecanico_id           uuid references public.usuarios(id) on delete set null,
  atribuido_em          timestamptz,
  atribuido_por         uuid references public.usuarios(id) on delete set null,
  os_id                 uuid references public.ordens_servico(id) on delete set null,
  diagnostico           text,
  servico_realizado     text,
  observacoes_finais    text,
  pecas_utilizadas      text,
  distancia_km          numeric,
  eta_min               integer,
  recebido_em           timestamptz not null default now(),
  aceito_em             timestamptz,
  a_caminho_em          timestamptz,
  chegou_em             timestamptz,
  iniciado_em           timestamptz,
  finalizado_em         timestamptz,
  concluido_em          timestamptz,
  cancelado_em          timestamptz,
  cancelado_por         uuid references auth.users(id) on delete set null,
  cancelado_por_papel   public.sos_papel,
  motivo_cancelamento   text,
  tempo_aceite_seg      integer,
  tempo_deslocamento_seg integer,
  tempo_servico_seg     integer,
  tempo_total_seg       integer,
  avaliacao_nota        smallint check (avaliacao_nota between 1 and 5),
  avaliacao_comentario  text,
  avaliado_em           timestamptz,
  contexto_ia           jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists sos_chamados_status on public.sos_chamados (status, recebido_em desc);
create index if not exists sos_chamados_cliente on public.sos_chamados (cliente_id, recebido_em desc);
create index if not exists sos_chamados_mecanico on public.sos_chamados (mecanico_id, recebido_em desc);
create index if not exists sos_chamados_veiculo on public.sos_chamados (veiculo_id);
create index if not exists sos_chamados_conta on public.sos_chamados (conta_usuario_id, recebido_em desc);

alter table public.sos_mecanicos
  drop constraint if exists sos_mecanicos_chamado_atual_fk;
alter table public.sos_mecanicos
  add constraint sos_mecanicos_chamado_atual_fk
  foreign key (chamado_atual_id) references public.sos_chamados(id) on delete set null;

-- Vigia do SOS: desde quando a espera atual corre e o que já foi avisado —
-- cada aviso sai uma vez só.
alter table public.sos_chamados add column if not exists espera_desde timestamptz;
alter table public.sos_chamados add column if not exists alerta_nivel smallint not null default 0;
alter table public.sos_chamados add column if not exists alerta_em timestamptz;
alter table public.sos_chamados add column if not exists eta_inicial_min integer;
alter table public.sos_chamados add column if not exists atraso_avisado_em timestamptz;
alter table public.sos_chamados add column if not exists sinal_avisado_em timestamptz;
update public.sos_chamados set espera_desde = coalesce(atribuido_em, recebido_em) where espera_desde is null;

-- Pulso do app do mecânico (a cada minuto com o app aberto). Fica fora de
-- `sos_mecanicos` de propósito: aquela tabela está no Realtime e o pulso
-- acordaria a central inteira a cada minuto por mecânico.
create table if not exists public.sos_presenca (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  visto_em   timestamptz not null default now()
);

create table if not exists public.sos_eventos (
  id            uuid primary key default gen_random_uuid(),
  chamado_id    uuid not null references public.sos_chamados(id) on delete cascade,
  tipo          text not null,
  titulo        text not null,
  descricao     text,
  dados         jsonb,
  latitude      double precision,
  longitude     double precision,
  autor_id      uuid references auth.users(id) on delete set null,
  autor_papel   public.sos_papel not null default 'sistema',
  autor_nome    text,
  ocorrido_em   timestamptz not null default now()
);
create index if not exists sos_eventos_chamado on public.sos_eventos (chamado_id, ocorrido_em);

create table if not exists public.sos_posicoes (
  id            bigint generated always as identity primary key,
  chamado_id    uuid not null references public.sos_chamados(id) on delete cascade,
  autor_id      uuid not null references auth.users(id) on delete cascade,
  papel         public.sos_papel not null,
  latitude      double precision not null,
  longitude     double precision not null,
  precisao_m    real,
  velocidade_ms real,
  rumo          real,
  registrado_em timestamptz not null default now()
);
create index if not exists sos_posicoes_chamado on public.sos_posicoes (chamado_id, registrado_em desc);

create table if not exists public.sos_mensagens (
  id            uuid primary key default gen_random_uuid(),
  chamado_id    uuid not null references public.sos_chamados(id) on delete cascade,
  autor_id      uuid references auth.users(id) on delete set null,
  autor_papel   public.sos_papel not null,
  autor_nome    text,
  texto         text,
  midia_caminho text,
  midia_tipo    text,
  rapida        boolean not null default false,
  lida_em       timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.sos_mensagens add column if not exists rapida boolean not null default false;
create index if not exists sos_mensagens_chamado on public.sos_mensagens (chamado_id, created_at);

create table if not exists public.sos_recusas (
  id          uuid primary key default gen_random_uuid(),
  chamado_id  uuid not null references public.sos_chamados(id) on delete cascade,
  mecanico_id uuid not null references public.usuarios(id) on delete cascade,
  motivo      text,
  created_at  timestamptz not null default now()
);
create index if not exists sos_recusas_chamado on public.sos_recusas (chamado_id);

create table if not exists public.sos_compartilhamentos (
  id          uuid primary key default gen_random_uuid(),
  chamado_id  uuid not null references public.sos_chamados(id) on delete cascade,
  token       text not null unique,
  criado_por  uuid references auth.users(id) on delete set null,
  expira_em   timestamptz not null,
  revogado_em timestamptz,
  acessos     integer not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.sos_agendamentos (
  id              uuid primary key default gen_random_uuid(),
  cliente_id      uuid not null references public.clientes(id) on delete cascade,
  veiculo_id      uuid references public.veiculos(id) on delete set null,
  conta_usuario_id uuid references auth.users(id) on delete set null,
  tipo            public.sos_tipo_agendamento not null default 'revisao',
  descricao       text,
  data_preferida  date,
  periodo         text check (periodo in ('manha', 'tarde', 'qualquer')),
  status          public.sos_status_agendamento not null default 'solicitado',
  data_confirmada timestamptz,
  observacoes_equipe text,
  os_id           uuid references public.ordens_servico(id) on delete set null,
  atendido_por    uuid references public.usuarios(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists sos_agendamentos_status on public.sos_agendamentos (status, created_at desc);

create table if not exists public.sos_lembretes (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references public.clientes(id) on delete cascade,
  veiculo_id    uuid references public.veiculos(id) on delete cascade,
  chave         text not null unique,
  tipo          text not null check (tipo in ('tempo', 'km', 'item')),
  titulo        text not null,
  mensagem      text,
  vence_em      date,
  vence_km      integer,
  origem_os_id  uuid references public.ordens_servico(id) on delete set null,
  lido_em       timestamptz,
  dispensado_em timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists sos_lembretes_cliente on public.sos_lembretes (cliente_id, created_at desc);

create table if not exists public.sos_contatos_emergencia (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  nome        text not null,
  telefone    text not null,
  relacao     text,
  avisar_sos  boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Produtos e serviços usados no atendimento: sempre do catálogo do Checklist.
-- `os_item_id` aponta o item espelhado na OS, para remoção e conferência.
create table if not exists public.sos_itens (
  id              uuid primary key default gen_random_uuid(),
  chamado_id      uuid not null references public.sos_chamados(id) on delete cascade,
  tipo            text not null check (tipo in ('produto', 'servico')),
  produto_id      uuid references public.produtos(id) on delete set null,
  servico_id      uuid references public.servicos(id) on delete set null,
  codigo          text,
  descricao       text not null,
  unidade         text,
  quantidade      numeric not null default 1 check (quantidade > 0),
  valor_unitario  numeric not null default 0 check (valor_unitario >= 0),
  desconto        numeric not null default 0 check (desconto >= 0),
  valor_total     numeric generated always as (round(quantidade * valor_unitario - desconto, 2)) stored,
  os_item_id      uuid,
  adicionado_por  uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  check ((tipo = 'produto' and servico_id is null) or (tipo = 'servico' and produto_id is null))
);
create index if not exists sos_itens_chamado on public.sos_itens (chamado_id, created_at);

-- Fotos, áudios, vídeos e assinatura. Arquivo no bucket `sos`, em
-- `<chamado_id>/...`; aqui fica o registro com a etapa em que foi feito.
create table if not exists public.sos_anexos (
  id          uuid primary key default gen_random_uuid(),
  chamado_id  uuid not null references public.sos_chamados(id) on delete cascade,
  caminho     text not null unique,
  tipo        public.sos_tipo_anexo not null default 'foto',
  etapa       text not null default 'abertura' check (etapa in ('abertura', 'diagnostico', 'antes', 'depois', 'conclusao', 'outro')),
  legenda     text,
  tamanho_bytes bigint,
  autor_id    uuid references auth.users(id) on delete set null,
  autor_papel public.sos_papel not null default 'sistema',
  created_at  timestamptz not null default now()
);
create index if not exists sos_anexos_chamado on public.sos_anexos (chamado_id, created_at);

-- Fotos, áudios e vídeos do SOS ficam num bucket próprio: o `evidencias`
-- pertence à OS e suas políticas pressupõem funcionário.
insert into storage.buckets (id, name, public, file_size_limit)
values ('sos', 'sos', false, 52428800)
on conflict (id) do nothing;

-- ============================================================== funções de apoio
create or replace function public.sos_cliente_atual()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select cliente_id from public.sos_contas_cliente where usuario_id = auth.uid()
$$;

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
  )
$$;

create or replace function public.sos_eh_mecanico()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.usuarios u
    left join public.funcoes f on f.id = u.funcao_id
    left join public.sos_mecanicos m on m.usuario_id = u.id
    where u.id = auth.uid() and u.situacao = 'ativo'
      and (coalesce(f.atua_como_mecanico, false) or m.usuario_id is not null)
  )
$$;

-- Quem recebe o alerta de novo SOS na central: admins e quem tem `sos`.
create or replace function public.sos_usuarios_central()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id
  from public.usuarios u
  where u.situacao = 'ativo'
    and (
      u.is_admin
      or exists (select 1 from public.perfil_permissoes pp
                 where pp.perfil_id = u.perfil_id and pp.recurso = 'sos' and pp.acao = 'visualizar')
      or exists (select 1 from public.usuario_permissoes up
                 where up.usuario_id = u.id and up.recurso = 'sos' and up.acao = 'visualizar' and up.concedida)
    )
$$;

create or replace function public.sos_nome_conta(p_usuario uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select nome_completo from public.usuarios where id = p_usuario),
    (select nome from public.sos_contas_cliente where usuario_id = p_usuario),
    'Sistema'
  )
$$;

create or replace function public.sos_papel_atual()
returns public.sos_papel
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when public.sos_eh_equipe() then 'central'::public.sos_papel
    when public.sos_eh_mecanico() then 'mecanico'::public.sos_papel
    else 'cliente'::public.sos_papel
  end
$$;

-- Haversine em km. Suficiente para ordenar mecânicos e estimar chegada.
create or replace function public.sos_distancia_km(
  lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision
)
returns numeric
language sql
immutable
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else round((
      2 * 6371 * asin(sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2)
        + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
      ))
    )::numeric, 2)
  end
$$;

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
            and c.status in ('recebido', 'procurando_mecanico'))
      )
  )
$$;

-- Quem mexe no atendimento: o mecânico do chamado ou a central com `editar`.
create or replace function public.sos_pode_atender(p_chamado uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sos_chamados c
    where c.id = p_chamado
      and (c.mecanico_id = auth.uid() or public.tem_permissao('sos', 'editar'))
  )
$$;

create or replace function public.sos_registrar_evento(
  p_chamado uuid, p_tipo text, p_titulo text, p_descricao text default null,
  p_dados jsonb default null, p_lat double precision default null, p_lng double precision default null,
  p_papel public.sos_papel default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.sos_eventos (chamado_id, tipo, titulo, descricao, dados, latitude, longitude, autor_id, autor_papel, autor_nome)
  values (
    p_chamado, p_tipo, p_titulo, p_descricao, p_dados, p_lat, p_lng, auth.uid(),
    coalesce(p_papel, case when auth.uid() is null then 'sistema'::public.sos_papel else public.sos_papel_atual() end),
    case when auth.uid() is null then 'Sistema' else public.sos_nome_conta(auth.uid()) end
  );
end;
$$;

-- Aviso é a mais: nunca derruba a operação que o gerou.
create or replace function public.sos_notificar(p_destinatario uuid, p_titulo text, p_mensagem text, p_link text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_destinatario is null then return; end if;
  insert into public.notificacoes (usuario_id, tipo, titulo, mensagem, link)
  values (p_destinatario, 'sistema', p_titulo, p_mensagem, p_link);
exception when others then
  null;
end;
$$;

create or replace function public.sos_rotulo_status(p public.sos_status)
returns text
language sql
immutable
as $$
  select case p
    when 'solicitado' then 'SOS solicitado'
    when 'recebido' then 'SOS recebido pela Tecnoar'
    when 'procurando_mecanico' then 'Procurando mecânico'
    when 'aceito' then 'Mecânico aceitou'
    when 'a_caminho' then 'Mecânico a caminho'
    when 'no_local' then 'Mecânico chegou'
    when 'servico_iniciado' then 'Serviço iniciado'
    when 'servico_finalizado' then 'Serviço finalizado'
    when 'concluido' then 'Atendimento concluído'
    when 'cancelado' then 'Cancelado'
  end
$$;

create or replace function public.sos_rotulo_ocorrencia(p public.sos_tipo_ocorrencia)
returns text
language sql
immutable
as $$
  select case p::text
    when 'freios' then 'Problema nos freios'
    when 'nao_liga' then 'Veículo não liga'
    when 'mecanico' then 'Pane mecânica'
    when 'pane_eletrica' then 'Pane elétrica'
    when 'roda_pneu' then 'Roda ou pneu'
    when 'vazamento' then 'Vazamento'
    when 'parado' then 'Caminhão parado'
    when 'acidente' then 'Acidente'
    when 'desconhecido' then 'Problema desconhecido'
    else 'Outro'
  end
$$;

-- WhatsApp complementar via Evolution API (pg_net). A chave fica em privado.config.
create or replace function public.sos_avisar_whatsapp(p_chamado uuid, p_cabecalho text default null)
returns void
language plpgsql
security definer
set search_path = public, privado, extensions, pg_temp
as $$
declare
  v_cfg    public.sos_config;
  v_c      record;
  v_chave  text;
  v_texto  text;
  v_dest   text;
begin
  select * into v_cfg from public.sos_config where singleton;
  if not v_cfg.whatsapp_ativo or v_cfg.whatsapp_url is null or v_cfg.whatsapp_instancia is null
     or coalesce(array_length(v_cfg.whatsapp_destinos, 1), 0) = 0 then
    return;
  end if;
  select valor into v_chave from privado.config where chave = 'sos_whatsapp_apikey';
  if v_chave is null then return; end if;

  select c.protocolo, c.tipo_ocorrencia, c.descricao, c.endereco, c.latitude, c.longitude, c.telefone_contato,
         c.recebido_em, cl.nome_razao as cliente, v.placa, v.marca, v.modelo
    into v_c
  from public.sos_chamados c
  join public.clientes cl on cl.id = c.cliente_id
  left join public.veiculos v on v.id = c.veiculo_id
  where c.id = p_chamado;

  v_texto := coalesce(p_cabecalho, '🚨 NOVO SOS TECNOAR') || E'\n\n'
    || 'Cliente: ' || v_c.cliente || E'\n'
    || 'Veículo: ' || coalesce(nullif(concat_ws(' ', v_c.marca, v_c.modelo), ''), '-') || E'\n'
    || 'Placa: ' || coalesce(v_c.placa, '-') || E'\n'
    || 'Problema: ' || public.sos_rotulo_ocorrencia(v_c.tipo_ocorrencia) || coalesce(' — ' || v_c.descricao, '') || E'\n'
    || 'Horário: ' || to_char(v_c.recebido_em at time zone 'America/Sao_Paulo', 'HH24:MI') || E'\n'
    || 'Telefone: ' || coalesce(v_c.telefone_contato, '-') || E'\n'
    || case when v_c.latitude is not null
         then 'Localização: https://maps.google.com/?q=' || v_c.latitude || ',' || v_c.longitude || E'\n'
         else coalesce('Localização: ' || v_c.endereco || E'\n', '') end
    || E'\nProtocolo:\n' || v_c.protocolo;

  foreach v_dest in array v_cfg.whatsapp_destinos loop
    perform net.http_post(
      url     := rtrim(v_cfg.whatsapp_url, '/') || '/message/sendText/' || v_cfg.whatsapp_instancia,
      headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', v_chave),
      body    := jsonb_build_object('number', regexp_replace(v_dest, '\D', '', 'g'), 'text', v_texto)
    );
  end loop;
exception when others then
  null;
end;
$$;

-- Veículo do cliente pela placa, sem duplicar: reaproveita o cadastro que
-- existir (mesma placa) e só cria quando não há nenhum.
create or replace function public.sos_garantir_veiculo(
  p_cliente uuid, p_placa text, p_descricao text default null, p_tipo text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_placa text := nullif(upper(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_id    uuid;
  v_dono  uuid;
begin
  if v_placa is null then return null; end if;
  select id, cliente_id into v_id, v_dono from public.veiculos
  where upper(regexp_replace(placa, '[^A-Za-z0-9]', '', 'g')) = v_placa
  order by (cliente_id = p_cliente) desc nulls last, (situacao = 'ativo') desc, updated_at desc
  limit 1;
  if v_id is not null then
    if v_dono is null then
      update public.veiculos set cliente_id = p_cliente where id = v_id;
    end if;
    return v_id;
  end if;
  insert into public.veiculos (cliente_id, placa, descricao, tipo)
  values (p_cliente, v_placa, coalesce(nullif(trim(p_descricao), ''), 'Veículo ' || v_placa),
          nullif(p_tipo, '')::public.tipo_veiculo)
  returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================== gatilhos
create or replace function public.sos_chamados_antes()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.protocolo := 'SOS-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYY') || '-' || lpad(new.numero::text, 6, '0');
    new.espera_desde := coalesce(new.espera_desde, now());
  else
    -- Nova espera (voltou para a fila, ou foi atribuído a outro mecânico):
    -- o prazo de aceite recomeça e os avisos do vigia zeram.
    if new.status in ('recebido', 'procurando_mecanico')
       and (new.mecanico_id is distinct from old.mecanico_id or old.status not in ('recebido', 'procurando_mecanico')) then
      new.espera_desde := now();
      new.alerta_nivel := 0;
      new.alerta_em := null;
    end if;
    -- Saída para o cliente: guarda a previsão inicial, base do "atrasado".
    if new.status = 'a_caminho' and old.status is distinct from 'a_caminho' then
      new.eta_inicial_min := new.eta_min;
      new.atraso_avisado_em := null;
      new.sinal_avisado_em := null;
    elsif new.mecanico_id is distinct from old.mecanico_id then
      new.eta_inicial_min := null;
      new.atraso_avisado_em := null;
      new.sinal_avisado_em := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists sos_chamados_antes on public.sos_chamados;
create trigger sos_chamados_antes
  before insert or update on public.sos_chamados
  for each row execute function public.sos_chamados_antes();

-- Depois de nascer: avisa central, mecânicos disponíveis e WhatsApp. Depois
-- de mudar de status: avisa quem não fez a mudança.
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
    -- Só quem está disponível recebe o chamado automático.
    if new.status = 'procurando_mecanico' then
      for v_u in select m.usuario_id from public.sos_mecanicos m
                 join public.usuarios u on u.id = m.usuario_id and u.situacao = 'ativo'
                 where m.aceita_sos and m.situacao = 'disponivel' loop
        if v_u is distinct from auth.uid() then
          perform public.sos_notificar(v_u, '🚨 Novo SOS para aceitar',
            concat_ws(' · ', v_cliente, v_placa, public.sos_rotulo_ocorrencia(new.tipo_ocorrencia)), v_link_app);
        end if;
      end loop;
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

    -- Central: só o que exige olhar (cancelamento, finalização)
    if new.status in ('cancelado', 'servico_finalizado') then
      for v_u in select * from public.sos_usuarios_central() loop
        if v_u is distinct from auth.uid() then
          perform public.sos_notificar(v_u, v_titulo, coalesce(v_cliente, ''), v_link_sis);
        end if;
      end loop;
    end if;
  end if;

  -- Atribuição pela central: o mecânico escolhido é avisado.
  if tg_op = 'UPDATE' and new.mecanico_id is not null and new.mecanico_id is distinct from old.mecanico_id
     and new.mecanico_id is distinct from auth.uid()
     and new.status in ('recebido', 'procurando_mecanico', 'a_caminho') then
    perform public.sos_notificar(new.mecanico_id, '🚨 SOS atribuído a você · ' || new.protocolo,
      concat_ws(' · ', v_cliente, v_placa, new.endereco), v_link_app);
  end if;

  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists sos_chamados_depois on public.sos_chamados;
create trigger sos_chamados_depois
  after insert or update on public.sos_chamados
  for each row execute function public.sos_chamados_depois();

-- Mensagem nova avisa o outro lado.
create or replace function public.sos_mensagens_depois()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c record;
begin
  select id, protocolo, conta_usuario_id, mecanico_id into v_c from public.sos_chamados where id = new.chamado_id;
  if new.autor_papel = 'cliente' then
    perform public.sos_notificar(v_c.mecanico_id, 'Mensagem do cliente · ' || v_c.protocolo, left(new.texto, 120), '/app/chamado/' || v_c.id);
  else
    perform public.sos_notificar(v_c.conta_usuario_id, 'Nova mensagem · ' || v_c.protocolo, left(new.texto, 120), '/app/chamado/' || v_c.id);
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists sos_mensagens_depois on public.sos_mensagens;
create trigger sos_mensagens_depois
  after insert on public.sos_mensagens
  for each row execute function public.sos_mensagens_depois();

-- ============================================================== RPCs — identidade
create or replace function public.sos_meu_papel()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_u   public.usuarios;
  v_c   public.sos_contas_cliente;
  v_mec public.sos_mecanicos;
begin
  if auth.uid() is null then
    return jsonb_build_object('papel', 'anonimo');
  end if;
  select * into v_u from public.usuarios where id = auth.uid();
  if found and v_u.situacao = 'ativo' then
    select * into v_mec from public.sos_mecanicos where usuario_id = auth.uid();
    return jsonb_build_object(
      'papel', case when public.sos_eh_mecanico() then 'mecanico' else 'equipe' end,
      'central', public.sos_eh_equipe(),
      'usuario_id', v_u.id,
      'nome', v_u.nome_completo,
      'avatar_url', v_u.avatar_url,
      'telefone', v_u.telefone,
      'mecanico', case when v_mec.usuario_id is null then null else to_jsonb(v_mec) end
    );
  end if;
  if found and v_u.situacao = 'pendente' then
    return jsonb_build_object('papel', 'equipe_pendente', 'nome', v_u.nome_completo);
  end if;
  select * into v_c from public.sos_contas_cliente where usuario_id = auth.uid();
  if found then
    return jsonb_build_object(
      'papel', 'cliente',
      'usuario_id', v_c.usuario_id,
      'nome', v_c.nome,
      'telefone', v_c.telefone,
      'email', v_c.email,
      'cliente_id', v_c.cliente_id,
      'veiculo_principal_id', v_c.veiculo_principal_id,
      'aceite_termos_em', v_c.aceite_termos_em,
      'aceite_localizacao_em', v_c.aceite_localizacao_em
    );
  end if;
  return jsonb_build_object('papel', 'novo',
    'nome', (select raw_user_meta_data->>'nome_completo' from auth.users where id = auth.uid()),
    'email', (select email from auth.users where id = auth.uid()));
end;
$$;

-- Primeiro acesso do cliente: acha o cadastro pelo documento ou celular; se
-- não existe, cria. Nunca duplica.
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
  v_tel   text := nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), '');
  v_doc   text := nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '');
  v_cli   uuid;
  v_nome  text := nullif(trim(p_nome), '');
  v_email text := coalesce(nullif(trim(p_email), ''), (select email from auth.users where id = auth.uid()));
  v_sit   text;
begin
  if auth.uid() is null then raise exception 'Sessão necessária.'; end if;
  if v_nome is null then raise exception 'Informe seu nome.'; end if;
  if v_tel is null or length(v_tel) < 10 then raise exception 'Informe um celular com DDD.'; end if;
  if v_doc is not null and length(v_doc) not in (11, 14) then raise exception 'CPF ou CNPJ incompleto.'; end if;

  select situacao::text into v_sit from public.usuarios where id = auth.uid();
  if v_sit is not null and v_sit <> 'pendente' then
    raise exception 'Esta conta é da equipe Tecnoar. Entre como mecânico.';
  end if;
  if v_sit = 'pendente' then
    -- Pedido de acesso criado sozinho quando a conta nasceu pelo app: some.
    if coalesce((select raw_user_meta_data->>'tipo_conta' from auth.users where id = auth.uid()), '') = 'sos_cliente' then
      delete from public.usuarios where id = auth.uid() and situacao = 'pendente';
    else
      raise exception 'Esta conta tem um pedido de acesso à equipe em análise. Use outro e-mail para o app de cliente.';
    end if;
  end if;

  if v_doc is not null then
    select id into v_cli from public.clientes where documento_digitos = v_doc and situacao = 'ativo' limit 1;
  end if;
  if v_cli is null then
    -- Últimos 8 dígitos evitam diferença de DDI/9º dígito entre cadastros.
    select id into v_cli from public.clientes
    where situacao = 'ativo'
      and (right(regexp_replace(coalesce(celular, ''), '\D', '', 'g'), 8) = right(v_tel, 8)
           or right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = right(v_tel, 8))
    order by created_at limit 1;
  end if;
  if v_cli is null then
    -- `documento_digitos` é coluna gerada a partir de `documento`.
    insert into public.clientes (tipo_pessoa, nome_razao, documento, celular, email, origem, notificar_whatsapp)
    values (
      (case when v_doc is not null and length(v_doc) = 14 then 'juridica' else 'fisica' end)::public.tipo_pessoa,
      v_nome, nullif(trim(p_documento), ''), p_telefone, v_email, 'manual', true
    )
    returning id into v_cli;
  end if;

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

create or replace function public.sos_atualizar_conta(
  p_nome text default null, p_telefone text default null, p_veiculo_principal uuid default null,
  p_aceite_localizacao boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_veiculo_principal is not null and not exists (
    select 1 from public.veiculos where id = p_veiculo_principal and cliente_id = public.sos_cliente_atual()
  ) then
    raise exception 'Veículo não pertence a você.';
  end if;
  update public.sos_contas_cliente
  set nome = coalesce(nullif(trim(p_nome), ''), nome),
      telefone = coalesce(p_telefone, telefone),
      telefone_digitos = coalesce(nullif(regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g'), ''), telefone_digitos),
      veiculo_principal_id = coalesce(p_veiculo_principal, veiculo_principal_id),
      aceite_localizacao_em = case when p_aceite_localizacao then coalesce(aceite_localizacao_em, now())
                                   when p_aceite_localizacao = false then null else aceite_localizacao_em end,
      updated_at = now()
  where usuario_id = auth.uid();
  return public.sos_meu_papel();
end;
$$;

-- Cliente cadastra um veículo pela placa (sem duplicar a placa).
create or replace function public.sos_cadastrar_veiculo(p_placa text, p_descricao text default null, p_tipo text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cli uuid := public.sos_cliente_atual(); v_id uuid;
begin
  if v_cli is null then raise exception 'Conclua seu cadastro primeiro.'; end if;
  if length(regexp_replace(coalesce(p_placa, ''), '[^A-Za-z0-9]', '', 'g')) <> 7 then
    raise exception 'Placa inválida (7 caracteres).';
  end if;
  v_id := public.sos_garantir_veiculo(v_cli, p_placa, p_descricao, p_tipo);
  update public.sos_contas_cliente set veiculo_principal_id = coalesce(veiculo_principal_id, v_id), updated_at = now()
  where usuario_id = auth.uid();
  return v_id;
end;
$$;

-- Equipe amarra uma conta do app a outro cadastro (cliente errado no primeiro acesso).
create or replace function public.sos_vincular_cliente(p_usuario uuid, p_cliente uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.tem_permissao('sos', 'editar') then raise exception 'Sem permissão.'; end if;
  update public.sos_contas_cliente set cliente_id = p_cliente, updated_at = now() where usuario_id = p_usuario;
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.vincular_cliente', 'sos_contas_cliente', p_usuario, jsonb_build_object('cliente_id', p_cliente));
end;
$$;

-- Dados que qualquer pessoa pode saber (telefone da central, nome).
create or replace function public.sos_info_publica()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'empresa', coalesce(e.nome_fantasia, e.razao_social, 'Tecnoar'),
    'telefone', coalesce(c.telefone_central, e.suporte_telefone, e.celular, e.telefone),
    'whatsapp', coalesce(e.celular, e.suporte_telefone),
    'politica_privacidade_url', e.politica_privacidade_url,
    'mensagem_espera', c.mensagem_espera,
    'cancelamento_cliente_ate', c.cancelamento_cliente_ate
  )
  from public.sos_config c
  left join public.dados_empresa e on e.singleton
  where c.singleton
$$;

-- ============================================================== RPCs — chamado
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
$$;

create or replace function public.sos_aceitar(p_chamado uuid, p_lat double precision default null, p_lng double precision default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c   public.sos_chamados;
  v_cfg public.sos_config;
  v_dist numeric;
  v_atual uuid;
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
  select chamado_atual_id into v_atual from public.sos_mecanicos where usuario_id = auth.uid();
  if v_atual is not null and v_atual <> p_chamado and exists (
    select 1 from public.sos_chamados where id = v_atual and status not in ('servico_finalizado', 'concluido', 'cancelado')
  ) then
    raise exception 'Termine o atendimento atual antes de aceitar outro.';
  end if;
  select * into v_cfg from public.sos_config where singleton;

  v_dist := public.sos_distancia_km(p_lat, p_lng, v_c.latitude, v_c.longitude);

  update public.sos_chamados
  set mecanico_id = auth.uid(), status = 'a_caminho', aceito_em = now(), a_caminho_em = now(),
      atribuido_em = coalesce(atribuido_em, now()),
      tempo_aceite_seg = extract(epoch from now() - recebido_em)::int,
      distancia_km = coalesce(v_dist, distancia_km),
      eta_min = case when v_dist is not null then greatest(1, ceil(v_dist / v_cfg.velocidade_media_kmh * 60))::int else eta_min end
  where id = p_chamado;

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

create or replace function public.sos_recusar(p_chamado uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_c public.sos_chamados;
begin
  if not public.sos_eh_mecanico() then raise exception 'Só mecânicos recusam chamados.'; end if;
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  insert into public.sos_recusas (chamado_id, mecanico_id, motivo) values (p_chamado, auth.uid(), p_motivo);
  -- Atribuição direta recusada volta para a fila e a central fica sabendo.
  if v_c.mecanico_id = auth.uid() and v_c.status in ('recebido', 'procurando_mecanico') then
    update public.sos_chamados set mecanico_id = null, atribuido_em = null, atribuido_por = null,
      status = 'procurando_mecanico' where id = p_chamado;
  end if;
  perform public.sos_registrar_evento(p_chamado, 'recusa', 'Mecânico recusou', p_motivo, null, null, null, 'mecanico');
end;
$$;

-- Central escolhe o mecânico. `p_confirmar` pula o aceite (mecânico avisado por telefone).
create or replace function public.sos_atribuir(p_chamado uuid, p_mecanico uuid, p_confirmar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_c public.sos_chamados; v_nome text;
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

  update public.sos_chamados
  set mecanico_id = p_mecanico, atribuido_em = now(), atribuido_por = auth.uid(),
      status = case when p_confirmar and status in ('recebido', 'procurando_mecanico') then 'a_caminho'
                    when not p_confirmar and status in ('recebido') then 'procurando_mecanico'
                    else status end,
      aceito_em = case when p_confirmar then coalesce(aceito_em, now()) else aceito_em end,
      a_caminho_em = case when p_confirmar then coalesce(a_caminho_em, now()) else a_caminho_em end,
      tempo_aceite_seg = case when p_confirmar then coalesce(tempo_aceite_seg, extract(epoch from now() - recebido_em)::int) else tempo_aceite_seg end
  where id = p_chamado;

  insert into public.sos_mecanicos (usuario_id, chamado_atual_id, situacao)
  values (p_mecanico, case when p_confirmar then p_chamado end, case when p_confirmar then 'em_atendimento'::public.sos_situacao_mecanico else 'offline' end)
  on conflict (usuario_id) do update
    set chamado_atual_id = coalesce(excluded.chamado_atual_id, public.sos_mecanicos.chamado_atual_id),
        situacao = case when p_confirmar then 'em_atendimento'::public.sos_situacao_mecanico else public.sos_mecanicos.situacao end;

  perform public.sos_registrar_evento(p_chamado, 'atribuicao',
    case when p_confirmar then 'Central escalou ' || v_nome || ' (a caminho)' else 'Central atribuiu a ' || v_nome end,
    null, jsonb_build_object('mecanico_id', p_mecanico, 'confirmado', p_confirmar), null, null, 'central');

  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.atribuir', 'sos_chamados', p_chamado, jsonb_build_object('mecanico_id', p_mecanico, 'confirmar', p_confirmar));

  return (select to_jsonb(c) from public.sos_chamados c where c.id = p_chamado);
end;
$$;

-- Copia para a OS os itens do chamado que ainda não estão lá.
create or replace function public.sos_sincronizar_itens_os(p_chamado uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_os  uuid;
  v_it  public.sos_itens;
  v_id  uuid;
  v_ord integer;
  v_n   integer := 0;
begin
  select os_id into v_os from public.sos_chamados where id = p_chamado;
  if v_os is null then return 0; end if;
  for v_it in select * from public.sos_itens where chamado_id = p_chamado and os_item_id is null order by created_at loop
    if v_it.tipo = 'produto' then
      select coalesce(max(ordem), 0) + 1 into v_ord from public.os_produtos where os_id = v_os;
      insert into public.os_produtos (os_id, produto_id, codigo, descricao, unidade, quantidade, valor_unitario, desconto, ordem)
      values (v_os, v_it.produto_id, v_it.codigo, v_it.descricao, coalesce(v_it.unidade, 'UN'), v_it.quantidade, v_it.valor_unitario, v_it.desconto, v_ord)
      returning id into v_id;
    else
      select coalesce(max(ordem), 0) + 1 into v_ord from public.os_servicos where os_id = v_os;
      insert into public.os_servicos (os_id, servico_id, codigo, descricao, quantidade, valor_unitario, desconto, ordem)
      values (v_os, v_it.servico_id, v_it.codigo, v_it.descricao, v_it.quantidade, v_it.valor_unitario, v_it.desconto, v_ord)
      returning id into v_id;
    end if;
    update public.sos_itens set os_item_id = v_id where id = v_it.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Vira OS na oficina: mesmo cliente, mesmo veículo, mecânico escalado, itens
-- do catálogo copiados e histórico ligado.
create or replace function public.sos_gerar_os(p_chamado uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c      public.sos_chamados;
  v_papel  public.sos_papel := public.sos_papel_atual();
  v_status uuid;
  v_os     uuid;
  v_km     integer;
begin
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_c.os_id is not null then return v_c.os_id; end if;
  if v_papel = 'cliente' then raise exception 'Sem permissão.'; end if;
  if v_papel = 'mecanico' and v_c.mecanico_id <> auth.uid() then raise exception 'Este chamado é de outro mecânico.'; end if;
  if v_papel = 'central' and not public.tem_permissao('ordens_servico', 'criar') then raise exception 'Sem permissão para abrir OS.'; end if;
  if v_c.veiculo_id is null then raise exception 'Informe o veículo antes de gerar a OS.'; end if;

  select id into v_status from public.status_os
  where situacao = 'ativo' and categoria = 'entrada' order by ordem limit 1;
  select km_atual into v_km from public.veiculos where id = v_c.veiculo_id;

  insert into public.ordens_servico (tipo, cliente_id, veiculo_id, status_id, km, problema_alegado, diagnostico, observacoes, aberta_por, prioridade)
  values ('os', v_c.cliente_id, v_c.veiculo_id, v_status, v_km,
    concat_ws(' — ', 'SOS ' || v_c.protocolo, public.sos_rotulo_ocorrencia(v_c.tipo_ocorrencia), v_c.descricao),
    v_c.diagnostico,
    concat_ws(E'\n', 'Atendimento SOS em ' || coalesce(v_c.endereco, 'local informado no app'), v_c.servico_realizado, v_c.observacoes_finais),
    case when v_papel <> 'cliente' then auth.uid() end,
    case v_c.prioridade when 'emergencia' then 3 when 'alta' then 2 else 1 end)
  returning id into v_os;

  if v_c.mecanico_id is not null then
    insert into public.os_mecanicos (os_id, usuario_id, principal) values (v_os, v_c.mecanico_id, true)
    on conflict do nothing;
  end if;
  insert into public.os_eventos (os_id, tipo, titulo, descricao, usuario_id, dados)
  values (v_os, 'os', 'OS gerada a partir do SOS ' || v_c.protocolo, v_c.descricao,
    case when v_papel <> 'cliente' then auth.uid() end, jsonb_build_object('sos_chamado_id', p_chamado));

  update public.sos_chamados set os_id = v_os where id = p_chamado;
  perform public.sos_sincronizar_itens_os(p_chamado);
  -- Sem item do catálogo, o serviço descrito entra como linha para a oficina precificar.
  if not exists (select 1 from public.sos_itens where chamado_id = p_chamado and tipo = 'servico')
     and nullif(v_c.servico_realizado, '') is not null then
    insert into public.os_servicos (os_id, descricao, quantidade, valor_unitario, ordem)
    values (v_os, left('Socorro: ' || v_c.servico_realizado, 200), 1, 0,
            (select coalesce(max(ordem), 0) + 1 from public.os_servicos where os_id = v_os));
  end if;

  perform public.sos_registrar_evento(p_chamado, 'os', 'OS gerada', null, jsonb_build_object('os_id', v_os), null, null, v_papel);
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.gerar_os', 'sos_chamados', p_chamado, jsonb_build_object('os_id', v_os));
  return v_os;
end;
$$;

-- Avanço de etapa pelo mecânico (ou central). A ordem é fixa; pular não é permitido.
create or replace function public.sos_avancar(
  p_chamado uuid, p_status public.sos_status,
  p_lat double precision default null, p_lng double precision default null, p_dados jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c     public.sos_chamados;
  v_papel public.sos_papel := public.sos_papel_atual();
  v_cfg   public.sos_config;
  v_ok    boolean;
  v_dist  numeric;
begin
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_papel = 'cliente' then raise exception 'Cliente não altera a etapa.'; end if;
  -- Quem é mecânico E central age como mecânico no próprio chamado.
  if v_c.mecanico_id = auth.uid() then
    v_papel := 'mecanico';
  elsif v_papel = 'mecanico' then
    raise exception 'Este chamado é de outro mecânico.';
  elsif not public.tem_permissao('sos', 'editar') then
    raise exception 'Sem permissão.';
  end if;
  select * into v_cfg from public.sos_config where singleton;

  v_ok := (v_c.status, p_status) in (
    ('recebido', 'procurando_mecanico'),
    ('aceito', 'a_caminho'),
    ('a_caminho', 'no_local'),
    ('no_local', 'servico_iniciado'),
    ('servico_iniciado', 'servico_finalizado'),
    ('servico_finalizado', 'concluido')
  );
  if not v_ok then
    raise exception 'De "%" não dá para ir para "%".', public.sos_rotulo_status(v_c.status), public.sos_rotulo_status(p_status);
  end if;

  if p_status = 'servico_finalizado' then
    if nullif(trim(coalesce(p_dados->>'diagnostico', v_c.diagnostico, '')), '') is null
       or nullif(trim(coalesce(p_dados->>'servico_realizado', v_c.servico_realizado, '')), '') is null then
      raise exception 'Diagnóstico e serviço realizado são obrigatórios para finalizar.';
    end if;
  end if;

  -- "Cheguei" com GPS longe do cliente fica registrado (sem bloquear: o
  -- pino pode estar errado). A central vê a distância na linha do tempo.
  if p_status = 'no_local' then
    v_dist := public.sos_distancia_km(p_lat, p_lng, v_c.latitude, v_c.longitude);
  end if;

  update public.sos_chamados
  set status = p_status,
      a_caminho_em = case when p_status = 'a_caminho' then now() else a_caminho_em end,
      chegou_em = case when p_status = 'no_local' then now() else chegou_em end,
      iniciado_em = case when p_status = 'servico_iniciado' then now() else iniciado_em end,
      finalizado_em = case when p_status = 'servico_finalizado' then now() else finalizado_em end,
      concluido_em = case when p_status = 'concluido' then now() else concluido_em end,
      diagnostico = coalesce(nullif(trim(p_dados->>'diagnostico'), ''), diagnostico),
      servico_realizado = coalesce(nullif(trim(p_dados->>'servico_realizado'), ''), servico_realizado),
      observacoes_finais = coalesce(nullif(trim(p_dados->>'observacoes'), ''), observacoes_finais),
      pecas_utilizadas = coalesce(nullif(trim(p_dados->>'pecas'), ''), pecas_utilizadas),
      tempo_deslocamento_seg = case when p_status = 'no_local' and a_caminho_em is not null
                                    then extract(epoch from now() - a_caminho_em)::int else tempo_deslocamento_seg end,
      tempo_servico_seg = case when p_status = 'servico_finalizado' and iniciado_em is not null
                               then extract(epoch from now() - iniciado_em)::int else tempo_servico_seg end,
      tempo_total_seg = case when p_status in ('servico_finalizado', 'concluido')
                             then extract(epoch from now() - recebido_em)::int else tempo_total_seg end,
      distancia_km = case when p_status = 'no_local' then 0 else distancia_km end,
      eta_min = case when p_status in ('no_local', 'servico_iniciado', 'servico_finalizado', 'concluido') then 0 else eta_min end
  where id = p_chamado;

  if p_status in ('servico_finalizado', 'concluido') then
    update public.sos_mecanicos set chamado_atual_id = null,
      situacao = case when situacao = 'em_atendimento' then 'disponivel'::public.sos_situacao_mecanico else situacao end
    where usuario_id = v_c.mecanico_id and chamado_atual_id = p_chamado;
  end if;

  perform public.sos_registrar_evento(p_chamado, 'status', public.sos_rotulo_status(p_status),
    case when p_status = 'no_local' and v_dist > 0.5
         then 'GPS do mecânico a ' || v_dist || ' km do ponto informado.'
         else coalesce(nullif(p_dados->>'servico_realizado', ''), nullif(p_dados->>'observacoes', '')) end,
    jsonb_build_object('status', p_status, 'distancia_km', v_dist) || coalesce(p_dados, '{}'::jsonb), p_lat, p_lng, v_papel);

  if p_status = 'servico_finalizado' then
    if v_c.veiculo_id is not null then
      insert into public.eventos_veiculo (veiculo_id, cliente_id, tipo, titulo, descricao, referencia_tabela, referencia_id, registrado_por)
      values (v_c.veiculo_id, v_c.cliente_id, 'sos', 'Socorro realizado',
        concat_ws(' — ', coalesce(nullif(p_dados->>'diagnostico', ''), v_c.diagnostico), coalesce(nullif(p_dados->>'servico_realizado', ''), v_c.servico_realizado)),
        'sos_chamados', p_chamado, auth.uid());
      if v_cfg.gerar_os_ao_finalizar and v_c.os_id is null then
        begin
          perform public.sos_gerar_os(p_chamado);
        exception when others then
          -- OS é consequência, não condição: a finalização nunca falha por ela.
          perform public.sos_registrar_evento(p_chamado, 'os', 'OS não gerada automaticamente', sqlerrm, null, null, null, 'sistema');
        end;
      end if;
    end if;
    perform public.sos_sincronizar_itens_os(p_chamado);
  end if;

  return (select to_jsonb(c) from public.sos_chamados c where c.id = p_chamado);
end;
$$;

-- Diagnóstico e anotações durante o serviço, sem mudar de etapa.
create or replace function public.sos_salvar_atendimento(p_chamado uuid, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.sos_pode_atender(p_chamado) then raise exception 'Sem permissão.'; end if;
  update public.sos_chamados
  set diagnostico = case when p_dados ? 'diagnostico' then nullif(trim(p_dados->>'diagnostico'), '') else diagnostico end,
      servico_realizado = case when p_dados ? 'servico_realizado' then nullif(trim(p_dados->>'servico_realizado'), '') else servico_realizado end,
      observacoes_finais = case when p_dados ? 'observacoes' then nullif(trim(p_dados->>'observacoes'), '') else observacoes_finais end
  where id = p_chamado and status not in ('concluido', 'cancelado');
  return (select to_jsonb(c) from public.sos_chamados c where c.id = p_chamado);
end;
$$;

create or replace function public.sos_cancelar(p_chamado uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c     public.sos_chamados;
  v_papel public.sos_papel := public.sos_papel_atual();
  v_cfg   public.sos_config;
begin
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_c.status in ('concluido', 'cancelado') then raise exception 'Chamado já encerrado.'; end if;
  select * into v_cfg from public.sos_config where singleton;

  if v_papel = 'cliente' then
    if v_c.conta_usuario_id is distinct from auth.uid() and v_c.cliente_id is distinct from public.sos_cliente_atual() then
      raise exception 'Este chamado não é seu.';
    end if;
    if v_c.status >= v_cfg.cancelamento_cliente_ate then
      raise exception 'O serviço já começou. Fale com a Tecnoar para cancelar.';
    end if;
  elsif v_papel = 'mecanico' then
    raise exception 'Mecânico não cancela: peça à central.';
  elsif not public.tem_permissao('sos', 'cancelar') then
    raise exception 'Sem permissão para cancelar.';
  end if;
  if nullif(trim(coalesce(p_motivo, '')), '') is null then raise exception 'Informe o motivo.'; end if;

  update public.sos_chamados
  set status = 'cancelado', cancelado_em = now(), cancelado_por = auth.uid(), cancelado_por_papel = v_papel,
      motivo_cancelamento = p_motivo, eta_min = null
  where id = p_chamado;
  update public.sos_mecanicos set chamado_atual_id = null,
    situacao = case when situacao = 'em_atendimento' then 'disponivel'::public.sos_situacao_mecanico else situacao end
  where chamado_atual_id = p_chamado;

  perform public.sos_registrar_evento(p_chamado, 'status', 'Cancelado', p_motivo, jsonb_build_object('status', 'cancelado'), null, null, v_papel);
  if v_papel = 'central' then
    insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
    values (auth.uid(), 'sos.cancelar', 'sos_chamados', p_chamado, jsonb_build_object('motivo', p_motivo));
  end if;
  return (select to_jsonb(c) from public.sos_chamados c where c.id = p_chamado);
end;
$$;

-- Posição durante o chamado. Mecânico atualiza também a própria ficha e a
-- previsão de chegada; cliente só o rastro do chamado.
create or replace function public.sos_registrar_posicao(
  p_chamado uuid, p_lat double precision, p_lng double precision,
  p_precisao real default null, p_velocidade real default null, p_rumo real default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c     public.sos_chamados;
  v_papel public.sos_papel;
  v_cfg   public.sos_config;
  v_dist  numeric;
  v_eta   integer;
begin
  select * into v_c from public.sos_chamados where id = p_chamado;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_c.status in ('concluido', 'cancelado', 'servico_finalizado') then
    return jsonb_build_object('ok', false, 'motivo', 'encerrado');
  end if;

  if v_c.mecanico_id = auth.uid() then
    v_papel := 'mecanico';
  elsif v_c.conta_usuario_id = auth.uid() then
    v_papel := 'cliente';
  else
    raise exception 'Só cliente e mecânico do chamado registram posição.';
  end if;

  insert into public.sos_posicoes (chamado_id, autor_id, papel, latitude, longitude, precisao_m, velocidade_ms, rumo)
  values (p_chamado, auth.uid(), v_papel, p_lat, p_lng, p_precisao, p_velocidade, p_rumo);

  if v_papel = 'mecanico' then
    select * into v_cfg from public.sos_config where singleton;
    v_dist := public.sos_distancia_km(p_lat, p_lng, v_c.latitude, v_c.longitude);
    v_eta := case when v_dist is null then null
                  when v_c.status in ('no_local', 'servico_iniciado') then 0
                  else greatest(1, ceil(v_dist / v_cfg.velocidade_media_kmh * 60))::int end;
    update public.sos_mecanicos
    set latitude = p_lat, longitude = p_lng, precisao_m = p_precisao, posicao_em = now()
    where usuario_id = auth.uid();
    perform public.sos_pulso();
    if v_c.status in ('aceito', 'a_caminho') then
      -- Posição voltou: se o vigia tinha avisado "sem sinal", pode avisar de novo.
      update public.sos_chamados set distancia_km = v_dist, eta_min = v_eta, sinal_avisado_em = null where id = p_chamado;
    end if;
  else
    -- O cliente pode ter se movido (ou o GPS melhorou): o pino segue a posição real.
    if v_c.status not in ('no_local', 'servico_iniciado') and not v_c.ponto_ajustado then
      update public.sos_chamados set latitude = p_lat, longitude = p_lng, precisao_m = p_precisao where id = p_chamado;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'distancia_km', v_dist, 'eta_min', v_eta);
end;
$$;

-- Disponível / em atendimento / indisponível / pausa / offline.
-- Com chamado em andamento, só "em atendimento" (ou pausa) faz sentido.
create or replace function public.sos_definir_situacao(
  p_situacao public.sos_situacao_mecanico,
  p_lat double precision default null, p_lng double precision default null,
  p_veiculo_apoio text default null, p_telefone text default null, p_mostrar_telefone boolean default null,
  p_aceita_sos boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_atual uuid;
begin
  if not public.sos_eh_mecanico() then raise exception 'Só mecânicos definem disponibilidade.'; end if;
  select chamado_atual_id into v_atual from public.sos_mecanicos where usuario_id = auth.uid();
  if v_atual is not null and p_situacao in ('disponivel', 'offline', 'indisponivel')
     and exists (select 1 from public.sos_chamados where id = v_atual and status not in ('servico_finalizado', 'concluido', 'cancelado')) then
    raise exception 'Você tem um atendimento em andamento. Finalize-o antes de mudar a situação.';
  end if;
  insert into public.sos_mecanicos (usuario_id, situacao, latitude, longitude, posicao_em, veiculo_apoio, telefone_contato, mostrar_telefone, aceita_sos)
  values (auth.uid(), p_situacao, p_lat, p_lng, case when p_lat is null then null else now() end,
          p_veiculo_apoio, p_telefone, coalesce(p_mostrar_telefone, false), coalesce(p_aceita_sos, true))
  on conflict (usuario_id) do update
    set situacao = excluded.situacao,
        latitude = coalesce(excluded.latitude, public.sos_mecanicos.latitude),
        longitude = coalesce(excluded.longitude, public.sos_mecanicos.longitude),
        posicao_em = coalesce(excluded.posicao_em, public.sos_mecanicos.posicao_em),
        veiculo_apoio = coalesce(p_veiculo_apoio, public.sos_mecanicos.veiculo_apoio),
        telefone_contato = coalesce(p_telefone, public.sos_mecanicos.telefone_contato),
        mostrar_telefone = coalesce(p_mostrar_telefone, public.sos_mecanicos.mostrar_telefone),
        aceita_sos = coalesce(p_aceita_sos, public.sos_mecanicos.aceita_sos),
        chamado_atual_id = case when excluded.situacao in ('disponivel', 'offline', 'indisponivel') then null
                                else public.sos_mecanicos.chamado_atual_id end;
  perform public.sos_pulso();
  return (select to_jsonb(m) from public.sos_mecanicos m where m.usuario_id = auth.uid());
end;
$$;

-- Posição do mecânico fora de chamado (para o mapa da central e o despacho).
create or replace function public.sos_atualizar_posicao_mecanico(p_lat double precision, p_lng double precision, p_precisao real default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.sos_mecanicos
  set latitude = p_lat, longitude = p_lng, precisao_m = p_precisao, posicao_em = now()
  where usuario_id = auth.uid() and situacao <> 'offline';
  perform public.sos_pulso();
end;
$$;

-- Sugestão de despacho: livre, perto, com a especialidade certa e menos
-- carregado. Posição com mais de 2 h não conta.
create or replace function public.sos_sugerir_mecanicos(p_chamado uuid)
returns table (
  usuario_id uuid, nome text, avatar_url text, funcao text, especialidades text,
  situacao public.sos_situacao_mecanico, disponivel boolean, aceita_sos boolean, em_atendimento boolean, chamado_atual_id uuid,
  distancia_km numeric, eta_min integer, posicao_em timestamptz, telefone text,
  afinidade boolean, atendimentos_hoje integer, nota_media numeric, recusou boolean, pontuacao numeric
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with c as (select latitude, longitude, tipo_ocorrencia from public.sos_chamados where id = p_chamado),
       cfg as (select velocidade_media_kmh, raio_busca_km from public.sos_config where singleton),
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
         select u.id, u.nome_completo, u.avatar_url, f.nome as funcao,
                (select string_agg(e.nome, ', ' order by e.nome) from public.usuario_especialidades ue
                   join public.especialidades e on e.id = ue.especialidade_id where ue.usuario_id = u.id) as especialidades,
                coalesce(m.situacao, 'offline'::public.sos_situacao_mecanico) as situacao,
                coalesce(m.aceita_sos, true) as aceita_sos, m.chamado_atual_id,
                case when m.posicao_em > now() - interval '2 hours'
                     then public.sos_distancia_km(m.latitude, m.longitude, c.latitude, c.longitude) end as dist,
                m.posicao_em, coalesce(case when m.mostrar_telefone then m.telefone_contato end, u.telefone) as telefone,
                (select count(*)::int from public.sos_chamados x where x.mecanico_id = u.id
                   and x.recebido_em > date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as hoje,
                (select round(avg(x.avaliacao_nota), 1) from public.sos_chamados x where x.mecanico_id = u.id and x.avaliacao_nota is not null) as nota,
                exists (select 1 from public.sos_recusas r where r.chamado_id = p_chamado and r.mecanico_id = u.id) as recusou,
                cfg.velocidade_media_kmh, chave.rx
         from public.usuarios u
         join public.funcoes f on f.id = u.funcao_id
         left join public.sos_mecanicos m on m.usuario_id = u.id
         cross join c cross join cfg cross join chave
         where u.situacao = 'ativo' and (f.atua_como_mecanico or m.usuario_id is not null)
           and public.sos_eh_equipe()
       )
  select b.id, b.nome_completo, b.avatar_url, b.funcao, b.especialidades,
         b.situacao, b.situacao = 'disponivel', b.aceita_sos, b.chamado_atual_id is not null, b.chamado_atual_id,
         b.dist,
         case when b.dist is not null then greatest(1, ceil(b.dist / b.velocidade_media_kmh * 60))::int end,
         b.posicao_em, b.telefone,
         coalesce(b.rx is not null and b.especialidades ~* b.rx, false),
         b.hoje, b.nota, b.recusou,
         -- Quanto maior, melhor. Distância pesa mais; especialidade desempata forte.
         round((
           case b.situacao when 'disponivel' then 100 when 'pausa' then 20 when 'em_atendimento' then 10 else 0 end
           + case when b.dist is null then 0 else greatest(0, 60 - b.dist) end
           + case when b.rx is not null and b.especialidades ~* b.rx then 25 else 0 end
           - b.hoje * 4
           + coalesce(b.nota, 3) * 2
           - case when b.recusou then 50 else 0 end
           - case when not b.aceita_sos then 80 else 0 end
         )::numeric, 1)
  from base b
  order by 19 desc, b.dist asc nulls last, b.nome_completo
$$;

create or replace function public.sos_vincular_os(p_chamado uuid, p_os uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.tem_permissao('sos', 'editar') then raise exception 'Sem permissão.'; end if;
  if not exists (select 1 from public.ordens_servico o join public.sos_chamados c on c.id = p_chamado
                 where o.id = p_os and o.cliente_id = c.cliente_id) then
    raise exception 'A OS precisa ser do mesmo cliente.';
  end if;
  update public.sos_chamados set os_id = p_os where id = p_chamado;
  perform public.sos_sincronizar_itens_os(p_chamado);
  perform public.sos_registrar_evento(p_chamado, 'os', 'OS vinculada', null, jsonb_build_object('os_id', p_os), null, null, 'central');
end;
$$;

create or replace function public.sos_avaliar(p_chamado uuid, p_nota smallint, p_comentario text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_c public.sos_chamados;
begin
  select * into v_c from public.sos_chamados where id = p_chamado for update;
  if not found then raise exception 'Chamado não encontrado.'; end if;
  if v_c.conta_usuario_id is distinct from auth.uid() and v_c.cliente_id is distinct from public.sos_cliente_atual() then
    raise exception 'Só o cliente avalia.';
  end if;
  if v_c.status not in ('servico_finalizado', 'concluido') then raise exception 'Avalie depois de concluído.'; end if;
  if p_nota not between 1 and 5 then raise exception 'Nota de 1 a 5.'; end if;
  update public.sos_chamados
  set avaliacao_nota = p_nota, avaliacao_comentario = nullif(trim(p_comentario), ''), avaliado_em = now(),
      status = 'concluido', concluido_em = coalesce(concluido_em, now()),
      tempo_total_seg = coalesce(tempo_total_seg, extract(epoch from now() - recebido_em)::int)
  where id = p_chamado;
  perform public.sos_registrar_evento(p_chamado, 'avaliacao', 'Cliente avaliou: ' || p_nota || ' estrela(s)', p_comentario,
    jsonb_build_object('nota', p_nota), null, null, 'cliente');
  return (select to_jsonb(c) from public.sos_chamados c where c.id = p_chamado);
end;
$$;

-- Link temporário para familiar/frota acompanhar sem entrar no app.
create or replace function public.sos_compartilhar(p_chamado uuid, p_horas integer default 12)
returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare v_token text;
begin
  if not public.sos_pode_ver_chamado(p_chamado) then raise exception 'Sem acesso ao chamado.'; end if;
  v_token := encode(gen_random_bytes(18), 'hex');
  insert into public.sos_compartilhamentos (chamado_id, token, criado_por, expira_em)
  values (p_chamado, v_token, auth.uid(), now() + make_interval(hours => least(greatest(p_horas, 1), 72)));
  perform public.sos_registrar_evento(p_chamado, 'compartilhamento', 'Acompanhamento compartilhado', null, null, null, null, null);
  return v_token;
end;
$$;

-- Página pública: status, previsão e posição APROXIMADA (3 casas ≈ 100 m).
create or replace function public.sos_acompanhar(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_s public.sos_compartilhamentos;
  v_c public.sos_chamados;
  v_pos record;
begin
  select * into v_s from public.sos_compartilhamentos where token = p_token and revogado_em is null and expira_em > now();
  if not found then return jsonb_build_object('ok', false, 'motivo', 'link_invalido'); end if;
  update public.sos_compartilhamentos set acessos = acessos + 1 where id = v_s.id;
  select * into v_c from public.sos_chamados where id = v_s.chamado_id;
  select latitude, longitude, registrado_em into v_pos from public.sos_posicoes
  where chamado_id = v_c.id and papel = 'mecanico' order by registrado_em desc limit 1;
  return jsonb_build_object(
    'ok', true,
    'protocolo', v_c.protocolo,
    'status', v_c.status,
    'status_rotulo', public.sos_rotulo_status(v_c.status),
    'eta_min', v_c.eta_min,
    'distancia_km', v_c.distancia_km,
    'mecanico', split_part(coalesce((select nome_completo from public.usuarios where id = v_c.mecanico_id), ''), ' ', 1),
    'veiculo', (select concat_ws(' ', marca, modelo) from public.veiculos where id = v_c.veiculo_id),
    'cliente_lat', round(v_c.latitude::numeric, 3), 'cliente_lng', round(v_c.longitude::numeric, 3),
    'mecanico_lat', round(v_pos.latitude::numeric, 3), 'mecanico_lng', round(v_pos.longitude::numeric, 3),
    'posicao_em', v_pos.registrado_em,
    'recebido_em', v_c.recebido_em, 'aceito_em', v_c.aceito_em, 'chegou_em', v_c.chegou_em,
    'finalizado_em', v_c.finalizado_em, 'concluido_em', v_c.concluido_em, 'cancelado_em', v_c.cancelado_em,
    'expira_em', v_s.expira_em
  );
end;
$$;

create or replace function public.sos_enviar_mensagem(
  p_chamado uuid, p_texto text, p_midia_caminho text default null, p_midia_tipo text default null, p_rapida boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_papel public.sos_papel;
begin
  if not public.sos_pode_ver_chamado(p_chamado) then raise exception 'Sem acesso ao chamado.'; end if;
  if nullif(trim(coalesce(p_texto, '')), '') is null and p_midia_caminho is null then raise exception 'Mensagem vazia.'; end if;
  if exists (select 1 from public.sos_chamados where id = p_chamado and status in ('concluido', 'cancelado')) then
    raise exception 'Chamado encerrado: a conversa foi fechada.';
  end if;
  select case when c.mecanico_id = auth.uid() then 'mecanico'::public.sos_papel
              when c.conta_usuario_id = auth.uid() then 'cliente'::public.sos_papel
              else public.sos_papel_atual() end
    into v_papel from public.sos_chamados c where c.id = p_chamado;
  insert into public.sos_mensagens (chamado_id, autor_id, autor_papel, autor_nome, texto, midia_caminho, midia_tipo, rapida)
  values (p_chamado, auth.uid(), v_papel, public.sos_nome_conta(auth.uid()), left(p_texto, 2000), p_midia_caminho, p_midia_tipo, coalesce(p_rapida, false))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.sos_marcar_mensagens_lidas(p_chamado uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.sos_pode_ver_chamado(p_chamado) then return; end if;
  update public.sos_mensagens set lida_em = now()
  where chamado_id = p_chamado and lida_em is null and autor_id is distinct from auth.uid();
end;
$$;

-- ============================================================== RPCs — atendimento (catálogo e mídia)
-- Busca no catálogo do Checklist para o mecânico: só o que é preciso para
-- lançar o item (sem custo, sem fornecedor).
-- A versão vigente (20260921) devolve mais colunas de estoque; o drop deixa
-- a sequência de migrações rodar de novo sem erro de tipo de retorno.
drop function if exists public.sos_catalogo(text, text, integer);
drop function if exists public.sos_catalogo(text, text, integer, integer);
create or replace function public.sos_catalogo(p_termo text, p_tipo text default null, p_limite integer default 30)
returns table (tipo text, id uuid, codigo text, descricao text, unidade text, preco numeric, saldo numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from (
    select 'produto'::text, p.id, p.codigo, p.descricao, p.unidade, p.preco_venda, p.saldo
    from public.produtos p
    where (p_tipo is null or p_tipo = 'produto') and p.situacao = 'ativo' and not coalesce(p.bloqueado, false)
      and (p.descricao ilike '%' || p_termo || '%' or p.codigo ilike p_termo || '%' or coalesce(p.referencia, '') ilike p_termo || '%')
    union all
    select 'servico'::text, s.id, s.codigo, s.descricao, null, s.valor_padrao, null
    from public.servicos s
    where (p_tipo is null or p_tipo = 'servico') and s.situacao = 'ativo'
      and (s.descricao ilike '%' || p_termo || '%' or s.codigo ilike p_termo || '%')
  ) t
  where (public.sos_eh_mecanico() or public.sos_eh_equipe()) and length(trim(coalesce(p_termo, ''))) >= 2
  order by 4
  limit least(greatest(p_limite, 1), 60)
$$;

create or replace function public.sos_adicionar_item(p_chamado uuid, p_tipo text, p_ref uuid, p_quantidade numeric default 1)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c   public.sos_chamados;
  v_id  uuid;
  v_p   public.produtos;
  v_s   public.servicos;
begin
  if not public.sos_pode_atender(p_chamado) then raise exception 'Sem permissão.'; end if;
  select * into v_c from public.sos_chamados where id = p_chamado;
  if v_c.status in ('concluido', 'cancelado') then raise exception 'Chamado encerrado.'; end if;
  if coalesce(p_quantidade, 0) <= 0 then raise exception 'Quantidade inválida.'; end if;

  if p_tipo = 'produto' then
    select * into v_p from public.produtos where id = p_ref and situacao = 'ativo';
    if not found then raise exception 'Produto não encontrado no catálogo.'; end if;
    insert into public.sos_itens (chamado_id, tipo, produto_id, codigo, descricao, unidade, quantidade, valor_unitario, adicionado_por)
    values (p_chamado, 'produto', v_p.id, v_p.codigo, v_p.descricao, v_p.unidade, p_quantidade, coalesce(v_p.preco_venda, 0), auth.uid())
    returning id into v_id;
  elsif p_tipo = 'servico' then
    select * into v_s from public.servicos where id = p_ref and situacao = 'ativo';
    if not found then raise exception 'Serviço não encontrado no catálogo.'; end if;
    insert into public.sos_itens (chamado_id, tipo, servico_id, codigo, descricao, quantidade, valor_unitario, adicionado_por)
    values (p_chamado, 'servico', v_s.id, v_s.codigo, v_s.descricao, p_quantidade, coalesce(v_s.valor_padrao, 0), auth.uid())
    returning id into v_id;
  else
    raise exception 'Tipo de item inválido.';
  end if;

  perform public.sos_registrar_evento(p_chamado, 'item', 'Item lançado: ' || coalesce(v_p.descricao, v_s.descricao),
    null, jsonb_build_object('item_id', v_id, 'tipo', p_tipo, 'quantidade', p_quantidade), null, null, null);
  -- Chamado que já tem OS recebe o item lá também.
  perform public.sos_sincronizar_itens_os(p_chamado);
  return (select to_jsonb(i) from public.sos_itens i where i.id = v_id);
end;
$$;

create or replace function public.sos_alterar_item(p_item uuid, p_quantidade numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_i public.sos_itens;
begin
  select * into v_i from public.sos_itens where id = p_item;
  if not found then raise exception 'Item não encontrado.'; end if;
  if not public.sos_pode_atender(v_i.chamado_id) then raise exception 'Sem permissão.'; end if;
  if coalesce(p_quantidade, 0) <= 0 then raise exception 'Quantidade inválida.'; end if;
  update public.sos_itens set quantidade = p_quantidade where id = p_item;
  if v_i.os_item_id is not null then
    update public.os_produtos set quantidade = p_quantidade where id = v_i.os_item_id;
    update public.os_servicos set quantidade = p_quantidade where id = v_i.os_item_id;
  end if;
end;
$$;

create or replace function public.sos_remover_item(p_item uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_i public.sos_itens;
begin
  select * into v_i from public.sos_itens where id = p_item;
  if not found then return; end if;
  if not public.sos_pode_atender(v_i.chamado_id) then raise exception 'Sem permissão.'; end if;
  if v_i.os_item_id is not null then
    update public.os_produtos set situacao = 'cancelado' where id = v_i.os_item_id;
    update public.os_servicos set situacao = 'cancelado' where id = v_i.os_item_id;
  end if;
  delete from public.sos_itens where id = p_item;
  perform public.sos_registrar_evento(v_i.chamado_id, 'item', 'Item removido: ' || v_i.descricao, null, null, null, null, null);
end;
$$;

create or replace function public.sos_registrar_anexo(
  p_chamado uuid, p_caminho text, p_tipo public.sos_tipo_anexo default 'foto',
  p_etapa text default null, p_legenda text default null, p_tamanho bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_papel public.sos_papel; v_c public.sos_chamados;
begin
  if not public.sos_pode_ver_chamado(p_chamado) then raise exception 'Sem acesso ao chamado.'; end if;
  if split_part(p_caminho, '/', 1) <> p_chamado::text then raise exception 'Arquivo fora da pasta do chamado.'; end if;
  select * into v_c from public.sos_chamados where id = p_chamado;
  v_papel := case when v_c.mecanico_id = auth.uid() then 'mecanico'::public.sos_papel
                  when v_c.conta_usuario_id = auth.uid() then 'cliente'::public.sos_papel
                  else public.sos_papel_atual() end;
  insert into public.sos_anexos (chamado_id, caminho, tipo, etapa, legenda, tamanho_bytes, autor_id, autor_papel)
  values (p_chamado, p_caminho, coalesce(p_tipo, 'foto'),
          coalesce(nullif(p_etapa, ''), case v_c.status when 'no_local' then 'antes' when 'servico_iniciado' then 'diagnostico'
                                                        when 'servico_finalizado' then 'depois' else 'abertura' end),
          nullif(trim(p_legenda), ''), p_tamanho, auth.uid(), v_papel)
  on conflict (caminho) do update set legenda = coalesce(excluded.legenda, public.sos_anexos.legenda)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.sos_remover_anexo(p_anexo uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_a public.sos_anexos;
begin
  select * into v_a from public.sos_anexos where id = p_anexo;
  if not found then return; end if;
  if v_a.autor_id is distinct from auth.uid() and not public.tem_permissao('sos', 'editar') then
    raise exception 'Só quem enviou (ou a central) remove o arquivo.';
  end if;
  -- O arquivo sai antes, pela API do Storage (o app chama `remove`): apagar a
  -- linha de storage.objects por SQL deixaria o arquivo órfão e o Supabase
  -- bloqueia. Aqui sai só o registro.
  delete from public.sos_anexos where id = p_anexo;
end;
$$;

-- ============================================================== RPCs — cliente
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
  if v_cli is null then return jsonb_build_object('ok', false); end if;
  select * into v_conta from public.sos_contas_cliente where usuario_id = auth.uid();

  select v.id, v.placa, v.marca, v.modelo, v.ano, v.km_atual, v.descricao, v.tipo
    into v_vei
  from public.veiculos v
  where v.cliente_id = v_cli and v.situacao = 'ativo'
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
    'total_veiculos', (select count(*) from public.veiculos where cliente_id = v_cli and situacao = 'ativo'),
    'ultimo_servico', case when v_os.id is null then null else jsonb_build_object(
      'os_id', v_os.id, 'numero', v_os.numero, 'em', coalesce(v_os.encerrada_em, v_os.aberta_em), 'km', v_os.km,
      'servicos', v_os.servicos, 'status', v_os.status, 'encerrada', v_os.encerrada_em is not null) end,
    'veiculo_na_oficina', exists (select 1 from public.ordens_servico o where o.cliente_id = v_cli and o.situacao = 'ativo'
                                  and o.encerrada_em is null and (v_vei.id is null or o.veiculo_id = v_vei.id)),
    'proxima_revisao', case when v_lemb.titulo is null then null else to_jsonb(v_lemb) end,
    'chamado_ativo', (select to_jsonb(c) from public.sos_chamados c
                      where c.cliente_id = v_cli and c.status not in ('servico_finalizado', 'concluido', 'cancelado')
                      order by c.recebido_em desc limit 1),
    'pendente_avaliacao', (select to_jsonb(c) from public.sos_chamados c
                      where c.cliente_id = v_cli and c.status = 'servico_finalizado' and c.avaliado_em is null
                      order by c.finalizado_em desc limit 1),
    'agendamentos_abertos', (select count(*) from public.sos_agendamentos where cliente_id = v_cli and status in ('solicitado', 'confirmado')),
    'lembretes', (select count(*) from public.sos_lembretes where cliente_id = v_cli and dispensado_em is null and lido_em is null)
  );
end;
$$;

-- Histórico de serviços do cliente (OS + SOS), com nome do mecânico sem
-- expor a tabela `usuarios`.
create or replace function public.sos_historico_cliente(p_veiculo uuid default null, p_limite integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cli as (select public.sos_cliente_atual() as id),
  os as (
    select jsonb_build_object(
      'tipo', 'os', 'id', o.id, 'numero', o.numero, 'em', coalesce(o.encerrada_em, o.aberta_em),
      'veiculo_id', o.veiculo_id, 'placa', v.placa, 'veiculo', concat_ws(' ', v.marca, v.modelo),
      'km', o.km, 'problema', o.problema_alegado, 'diagnostico', o.diagnostico,
      'status', s.nome, 'status_cor', s.cor, 'encerrada', o.encerrada_em is not null,
      'valor_total', o.valor_total,
      'servicos', (select jsonb_agg(jsonb_build_object('descricao', x.descricao, 'quantidade', x.quantidade, 'valor', x.valor_total) order by x.ordem)
                   from public.os_servicos x where x.os_id = o.id and x.situacao = 'ativo'),
      'produtos', (select jsonb_agg(jsonb_build_object('descricao', x.descricao, 'quantidade', x.quantidade, 'valor', x.valor_total) order by x.ordem)
                   from public.os_produtos x where x.os_id = o.id and x.situacao = 'ativo'),
      'mecanicos', (select string_agg(u.nome_completo, ', ') from public.os_mecanicos m join public.usuarios u on u.id = m.usuario_id where m.os_id = o.id),
      'sos_protocolo', (select c.protocolo from public.sos_chamados c where c.os_id = o.id limit 1),
      'sos_id', (select c.id from public.sos_chamados c where c.os_id = o.id limit 1)
    ) as item, coalesce(o.encerrada_em, o.aberta_em) as em
    from public.ordens_servico o
    join cli on o.cliente_id = cli.id
    left join public.veiculos v on v.id = o.veiculo_id
    left join public.status_os s on s.id = o.status_id
    where o.situacao = 'ativo' and o.tipo = 'os' and (p_veiculo is null or o.veiculo_id = p_veiculo)
  ),
  sos as (
    select jsonb_build_object(
      'tipo', 'sos', 'id', c.id, 'protocolo', c.protocolo, 'em', c.recebido_em, 'status', c.status,
      'status_rotulo', public.sos_rotulo_status(c.status),
      'veiculo_id', c.veiculo_id, 'placa', v.placa, 'veiculo', concat_ws(' ', v.marca, v.modelo),
      'ocorrencia', c.tipo_ocorrencia, 'ocorrencia_rotulo', public.sos_rotulo_ocorrencia(c.tipo_ocorrencia),
      'diagnostico', c.diagnostico, 'servico', c.servico_realizado,
      'mecanico', (select nome_completo from public.usuarios where id = c.mecanico_id), 'os_id', c.os_id,
      'nota', c.avaliacao_nota
    ) as item, c.recebido_em as em
    from public.sos_chamados c
    join cli on c.cliente_id = cli.id
    left join public.veiculos v on v.id = c.veiculo_id
    where c.os_id is null and (p_veiculo is null or c.veiculo_id = p_veiculo)
  )
  select coalesce(jsonb_agg(item order by em desc), '[]'::jsonb)
  from (select * from (select * from os union all select * from sos) u order by em desc limit p_limite) t
$$;

-- Chamados do cliente (ativos e anteriores), com o essencial para a lista.
create or replace function public.sos_meus_chamados(p_limite integer default 50)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(x order by (x->>'recebido_em') desc), '[]'::jsonb) from (
    select to_jsonb(c) || jsonb_build_object(
      'placa', v.placa, 'veiculo', concat_ws(' ', v.marca, v.modelo),
      'status_rotulo', public.sos_rotulo_status(c.status),
      'ocorrencia_rotulo', public.sos_rotulo_ocorrencia(c.tipo_ocorrencia),
      'mecanico_nome', (select nome_completo from public.usuarios where id = c.mecanico_id)
    ) as x
    from public.sos_chamados c
    left join public.veiculos v on v.id = c.veiculo_id
    where c.conta_usuario_id = auth.uid() or c.cliente_id = public.sos_cliente_atual()
    order by c.recebido_em desc
    limit least(greatest(p_limite, 1), 200)
  ) t
$$;

-- Tudo que a tela de um chamado precisa, numa ida só — para cliente,
-- mecânico e central. Cada um vê o que lhe cabe (o telefone do mecânico só
-- se ele liberou; o do cliente só para quem atende).
create or replace function public.sos_detalhe_chamado(p_chamado uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_c     public.sos_chamados;
  v_eh_cliente boolean;
  v_mec   record;
begin
  if not public.sos_pode_ver_chamado(p_chamado) then raise exception 'Sem acesso ao chamado.'; end if;
  select * into v_c from public.sos_chamados where id = p_chamado;
  v_eh_cliente := v_c.conta_usuario_id = auth.uid()
                  or (v_c.cliente_id = public.sos_cliente_atual() and not public.sos_eh_equipe() and v_c.mecanico_id is distinct from auth.uid());

  select u.id, u.nome_completo, u.avatar_url, m.latitude, m.longitude, m.posicao_em, m.veiculo_apoio,
         case when m.mostrar_telefone or not v_eh_cliente then coalesce(m.telefone_contato, u.telefone) end as telefone,
         (select round(avg(x.avaliacao_nota), 1) from public.sos_chamados x where x.mecanico_id = u.id and x.avaliacao_nota is not null) as nota,
         (select count(*) from public.sos_chamados x where x.mecanico_id = u.id and x.status = 'concluido') as atendimentos
    into v_mec
  from public.usuarios u left join public.sos_mecanicos m on m.usuario_id = u.id
  where u.id = v_c.mecanico_id;

  return jsonb_build_object(
    'chamado', to_jsonb(v_c) || jsonb_build_object(
      'status_rotulo', public.sos_rotulo_status(v_c.status),
      'ocorrencia_rotulo', public.sos_rotulo_ocorrencia(v_c.tipo_ocorrencia)),
    'papel', case when v_c.mecanico_id = auth.uid() then 'mecanico'
                  when v_eh_cliente then 'cliente'
                  when public.sos_eh_equipe() then 'central'
                  else 'mecanico_candidato' end,
    'cliente', (select jsonb_build_object('id', cl.id, 'nome', cl.nome_razao,
                  'telefone', case when v_eh_cliente or public.sos_eh_equipe() or v_c.mecanico_id = auth.uid()
                                   then coalesce(v_c.telefone_contato, cl.celular, cl.telefone) end)
                from public.clientes cl where cl.id = v_c.cliente_id),
    'veiculo', (select jsonb_build_object('id', v.id, 'placa', v.placa, 'marca', v.marca, 'modelo', v.modelo,
                  'ano', v.ano, 'descricao', v.descricao, 'tipo', v.tipo, 'km_atual', v.km_atual)
                from public.veiculos v where v.id = v_c.veiculo_id),
    'mecanico', case when v_mec.id is null then null else jsonb_build_object(
                  'id', v_mec.id,
                  'nome', case when v_eh_cliente then split_part(v_mec.nome_completo, ' ', 1) || coalesce(' ' || nullif(split_part(v_mec.nome_completo, ' ', 2), ''), '') else v_mec.nome_completo end,
                  'avatar_url', v_mec.avatar_url, 'telefone', v_mec.telefone, 'veiculo_apoio', v_mec.veiculo_apoio,
                  'latitude', v_mec.latitude, 'longitude', v_mec.longitude, 'posicao_em', v_mec.posicao_em,
                  'nota', v_mec.nota, 'atendimentos', v_mec.atendimentos) end,
    'os', (select jsonb_build_object('id', o.id, 'numero', o.numero, 'status', s.nome, 'status_cor', s.cor, 'valor_total', o.valor_total, 'encerrada_em', o.encerrada_em)
           from public.ordens_servico o left join public.status_os s on s.id = o.status_id where o.id = v_c.os_id),
    'eventos', (select coalesce(jsonb_agg(to_jsonb(e) order by e.ocorrido_em), '[]'::jsonb) from public.sos_eventos e where e.chamado_id = p_chamado),
    'itens', (select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at), '[]'::jsonb) from public.sos_itens i where i.chamado_id = p_chamado),
    'anexos', (select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at), '[]'::jsonb) from public.sos_anexos a where a.chamado_id = p_chamado),
    'mensagens', (select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb) from public.sos_mensagens m where m.chamado_id = p_chamado),
    'ultima_posicao_mecanico', (select to_jsonb(p) from public.sos_posicoes p where p.chamado_id = p_chamado and p.papel = 'mecanico' order by p.registrado_em desc limit 1),
    'ultima_posicao_cliente', (select to_jsonb(p) from public.sos_posicoes p where p.chamado_id = p_chamado and p.papel = 'cliente' order by p.registrado_em desc limit 1)
  );
end;
$$;

create or replace function public.sos_solicitar_agendamento(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cli uuid := public.sos_cliente_atual(); v_id uuid; v_u uuid;
begin
  if v_cli is null then
    if public.sos_eh_equipe() then v_cli := nullif(p->>'cliente_id', '')::uuid; end if;
    if v_cli is null then raise exception 'Conclua seu cadastro primeiro.'; end if;
  end if;
  insert into public.sos_agendamentos (cliente_id, veiculo_id, conta_usuario_id, tipo, descricao, data_preferida, periodo)
  values (v_cli, nullif(p->>'veiculo_id', '')::uuid, auth.uid(),
    coalesce(nullif(p->>'tipo', '')::public.sos_tipo_agendamento, 'revisao'),
    nullif(trim(p->>'descricao'), ''), nullif(p->>'data_preferida', '')::date, coalesce(nullif(p->>'periodo', ''), 'qualquer'))
  returning id into v_id;
  for v_u in select * from public.sos_usuarios_central() loop
    perform public.sos_notificar(v_u, 'Pedido de agendamento',
      (select nome_razao from public.clientes where id = v_cli) || ' · ' || coalesce(p->>'tipo', 'revisão'), '/sos/agendamentos');
  end loop;
  return v_id;
end;
$$;

create or replace function public.sos_atualizar_agendamento(
  p_id uuid, p_status public.sos_status_agendamento, p_data_confirmada timestamptz default null,
  p_observacoes text default null, p_os uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_a public.sos_agendamentos;
begin
  select * into v_a from public.sos_agendamentos where id = p_id for update;
  if not found then raise exception 'Agendamento não encontrado.'; end if;
  if public.sos_eh_equipe() then
    if not public.tem_permissao('sos', 'editar') then raise exception 'Sem permissão.'; end if;
    update public.sos_agendamentos
    set status = p_status, data_confirmada = coalesce(p_data_confirmada, data_confirmada),
        observacoes_equipe = coalesce(p_observacoes, observacoes_equipe), os_id = coalesce(p_os, os_id),
        atendido_por = auth.uid(), updated_at = now()
    where id = p_id;
    perform public.sos_notificar(v_a.conta_usuario_id,
      case p_status when 'confirmado' then 'Revisão confirmada' when 'cancelado' then 'Agendamento cancelado'
                    when 'realizado' then 'Revisão realizada' else 'Agendamento atualizado' end,
      coalesce(p_observacoes, to_char(p_data_confirmada at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')),
      '/app/revisoes');
  elsif v_a.conta_usuario_id = auth.uid() and p_status = 'cancelado' then
    update public.sos_agendamentos set status = 'cancelado', updated_at = now() where id = p_id;
  else
    raise exception 'Sem permissão.';
  end if;
end;
$$;

-- Lembretes de manutenção a partir das OS: tempo desde a última OS encerrada
-- e km rodado desde então. Roda todo dia (pg_cron) ou pelo botão da central.
create or replace function public.sos_gerar_lembretes()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_cfg public.sos_config; v_n integer := 0; r record; v_inicio timestamptz := now();
begin
  -- pg_cron roda sem usuário; pela tela, só a central.
  if auth.uid() is not null and not public.tem_permissao('sos', 'editar') then raise exception 'Sem permissão.'; end if;
  select * into v_cfg from public.sos_config where singleton;
  for r in
    select v.id as veiculo_id, v.cliente_id, v.placa, v.km_atual, o.id as os_id, o.encerrada_em, o.km as km_os
    from public.veiculos v
    join lateral (
      select o.id, o.encerrada_em, o.km from public.ordens_servico o
      where o.veiculo_id = v.id and o.situacao = 'ativo' and o.encerrada_em is not null
      order by o.encerrada_em desc limit 1
    ) o on true
    where v.situacao = 'ativo' and v.cliente_id is not null
      and exists (select 1 from public.sos_contas_cliente c where c.cliente_id = v.cliente_id)
  loop
    if r.encerrada_em < now() - make_interval(months => v_cfg.lembrete_meses) then
      insert into public.sos_lembretes (cliente_id, veiculo_id, chave, tipo, titulo, mensagem, vence_em, origem_os_id)
      values (r.cliente_id, r.veiculo_id, 'tempo:' || r.os_id, 'tempo',
        'Hora de revisar o ' || r.placa,
        'Faz mais de ' || v_cfg.lembrete_meses || ' meses desde o último serviço na Tecnoar. Agende uma revisão.',
        (r.encerrada_em + make_interval(months => v_cfg.lembrete_meses))::date, r.os_id)
      on conflict (chave) do nothing;
      if found then v_n := v_n + 1; end if;
    end if;
    if r.km_os is not null and r.km_atual is not null and r.km_atual - r.km_os >= v_cfg.lembrete_km then
      insert into public.sos_lembretes (cliente_id, veiculo_id, chave, tipo, titulo, mensagem, vence_km, origem_os_id)
      values (r.cliente_id, r.veiculo_id, 'km:' || r.os_id, 'km',
        'Revisão por quilometragem: ' || r.placa,
        'Seu veículo rodou ' || (r.km_atual - r.km_os) || ' km desde o último serviço. Vale uma revisão dos freios.',
        r.km_os + v_cfg.lembrete_km, r.os_id)
      on conflict (chave) do nothing;
      if found then v_n := v_n + 1; end if;
    end if;
  end loop;
  -- Avisa quem ganhou lembrete novo nesta rodada.
  for r in
    select l.id, l.titulo, l.mensagem, c.usuario_id from public.sos_lembretes l
    join public.sos_contas_cliente c on c.cliente_id = l.cliente_id
    where l.created_at >= v_inicio
  loop
    perform public.sos_notificar(r.usuario_id, r.titulo, r.mensagem, '/app/revisoes');
  end loop;
  return v_n;
end;
$$;

create or replace function public.sos_marcar_lembrete(p_id uuid, p_dispensar boolean default false)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.sos_lembretes
  set lido_em = coalesce(lido_em, now()), dispensado_em = case when p_dispensar then now() else dispensado_em end
  where id = p_id and cliente_id = public.sos_cliente_atual()
$$;

-- ============================================================== RPCs — mecânico
-- Painel do mecânico: situação, chamado atual, chamados aguardando e o dia.
create or replace function public.sos_home_mecanico()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare v_m public.sos_mecanicos; v_hoje timestamptz;
begin
  if not public.sos_eh_mecanico() then return jsonb_build_object('ok', false); end if;
  select * into v_m from public.sos_mecanicos where usuario_id = auth.uid();
  v_hoje := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  return jsonb_build_object(
    'ok', true,
    'nome', (select nome_completo from public.usuarios where id = auth.uid()),
    'ficha', to_jsonb(v_m),
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
                       'distancia_km', public.sos_distancia_km(v_m.latitude, v_m.longitude, c.latitude, c.longitude),
                       'para_mim', c.mecanico_id = auth.uid(),
                       'recusei', exists (select 1 from public.sos_recusas r where r.chamado_id = c.id and r.mecanico_id = auth.uid())) as x
                     from public.sos_chamados c
                     where c.status in ('recebido', 'procurando_mecanico')
                       and (c.mecanico_id is null or c.mecanico_id = auth.uid())) t),
    'hoje', jsonb_build_object(
      'atendimentos', (select count(*) from public.sos_chamados where mecanico_id = auth.uid() and recebido_em >= v_hoje),
      'concluidos', (select count(*) from public.sos_chamados where mecanico_id = auth.uid() and status in ('servico_finalizado', 'concluido') and finalizado_em >= v_hoje),
      'nota_media', (select round(avg(avaliacao_nota), 1) from public.sos_chamados where mecanico_id = auth.uid() and avaliacao_nota is not null)
    ),
    'historico', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                    select jsonb_build_object('id', c.id, 'protocolo', c.protocolo, 'status', c.status,
                      'status_rotulo', public.sos_rotulo_status(c.status),
                      'ocorrencia_rotulo', public.sos_rotulo_ocorrencia(c.tipo_ocorrencia),
                      'cliente_nome', (select nome_razao from public.clientes where id = c.cliente_id),
                      'placa', (select placa from public.veiculos where id = c.veiculo_id),
                      'recebido_em', c.recebido_em, 'finalizado_em', c.finalizado_em, 'nota', c.avaliacao_nota) as x
                    from public.sos_chamados c
                    where c.mecanico_id = auth.uid() and c.status in ('servico_finalizado', 'concluido', 'cancelado')
                    order by c.recebido_em desc limit 20) t)
  );
end;
$$;

-- ============================================================== RPCs — central
create or replace function public.sos_indicadores(p_inicio timestamptz default date_trunc('day', now()), p_fim timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.sos_eh_equipe() then jsonb_build_object('ok', false) else jsonb_build_object(
    'ok', true,
    'aguardando', (select count(*) from public.sos_chamados where status in ('recebido', 'procurando_mecanico')),
    'aguardando_mecanico', (select count(*) from public.sos_chamados where status in ('recebido', 'procurando_mecanico') and mecanico_id is null),
    'aceitos', (select count(*) from public.sos_chamados where status = 'aceito'),
    'a_caminho', (select count(*) from public.sos_chamados where status = 'a_caminho'),
    'no_local', (select count(*) from public.sos_chamados where status = 'no_local'),
    'em_servico', (select count(*) from public.sos_chamados where status = 'servico_iniciado'),
    'finalizados_periodo', (select count(*) from public.sos_chamados where status in ('servico_finalizado', 'concluido') and coalesce(finalizado_em, concluido_em) between p_inicio and p_fim),
    'cancelados_periodo', (select count(*) from public.sos_chamados where status = 'cancelado' and cancelado_em between p_inicio and p_fim),
    'abertos_periodo', (select count(*) from public.sos_chamados where recebido_em between p_inicio and p_fim),
    'aguardando_mais_antigo', (select min(recebido_em) from public.sos_chamados where status in ('recebido', 'procurando_mecanico')),
    'tempo_medio_aceite_seg', (select round(avg(tempo_aceite_seg)) from public.sos_chamados where recebido_em between p_inicio and p_fim and tempo_aceite_seg is not null),
    'tempo_medio_deslocamento_seg', (select round(avg(tempo_deslocamento_seg)) from public.sos_chamados where recebido_em between p_inicio and p_fim and tempo_deslocamento_seg is not null),
    'tempo_medio_servico_seg', (select round(avg(tempo_servico_seg)) from public.sos_chamados where recebido_em between p_inicio and p_fim and tempo_servico_seg is not null),
    'tempo_medio_total_seg', (select round(avg(tempo_total_seg)) from public.sos_chamados where recebido_em between p_inicio and p_fim and tempo_total_seg is not null),
    'nota_media', (select round(avg(avaliacao_nota), 2) from public.sos_chamados where avaliado_em between p_inicio and p_fim),
    'avaliacoes', (select count(*) from public.sos_chamados where avaliado_em between p_inicio and p_fim),
    'mecanicos', (select jsonb_build_object(
                    'disponivel', count(*) filter (where m.situacao = 'disponivel'),
                    'em_atendimento', count(*) filter (where m.situacao = 'em_atendimento'),
                    'pausa', count(*) filter (where m.situacao = 'pausa'),
                    'indisponivel', count(*) filter (where m.situacao = 'indisponivel'),
                    'offline', count(*) filter (where m.situacao = 'offline'))
                  from public.sos_mecanicos m join public.usuarios u on u.id = m.usuario_id and u.situacao = 'ativo'),
    'mecanicos_disponiveis', (select count(*) from public.sos_mecanicos m join public.usuarios u on u.id = m.usuario_id and u.situacao = 'ativo' where m.situacao = 'disponivel'),
    'mecanicos_em_atendimento', (select count(*) from public.sos_mecanicos where situacao = 'em_atendimento'),
    'agendamentos_pendentes', (select count(*) from public.sos_agendamentos where status = 'solicitado'),
    'por_ocorrencia', (select coalesce(jsonb_object_agg(tipo_ocorrencia, n), '{}'::jsonb) from (select tipo_ocorrencia, count(*) n from public.sos_chamados where recebido_em between p_inicio and p_fim group by 1) t),
    'por_mecanico', (select coalesce(jsonb_agg(jsonb_build_object('mecanico_id', mecanico_id, 'nome', u.nome_completo, 'atendimentos', n, 'nota_media', nota) order by n desc), '[]'::jsonb)
                     from (select mecanico_id, count(*) n, round(avg(avaliacao_nota), 2) nota from public.sos_chamados
                           where mecanico_id is not null and recebido_em between p_inicio and p_fim group by 1) t
                     join public.usuarios u on u.id = t.mecanico_id)
  ) end
$$;

-- Relatório gerencial do período: volume, prazos, qualidade, quem atendeu,
-- quem chamou e o que foi usado do catálogo. Tudo num JSON para a tela.
create or replace function public.sos_relatorio(p_inicio timestamptz, p_fim timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with cfg as (select tempo_aceite_seg from public.sos_config where singleton),
  c as (select * from public.sos_chamados where recebido_em >= p_inicio and recebido_em < p_fim),
  it as (select i.* from public.sos_itens i join c on c.id = i.chamado_id)
  select case when not public.sos_eh_equipe() then jsonb_build_object('ok', false) else jsonb_build_object(
    'ok', true,
    'inicio', p_inicio, 'fim', p_fim,
    'total', (select count(*) from c),
    'concluidos', (select count(*) from c where status in ('servico_finalizado', 'concluido')),
    'cancelados', (select count(*) from c where status = 'cancelado'),
    'em_aberto', (select count(*) from c where status not in ('servico_finalizado', 'concluido', 'cancelado')),
    'emergencias', (select count(*) from c where prioridade = 'emergencia'),
    'os_geradas', (select count(*) from c where os_id is not null),
    'valor_itens', (select coalesce(sum(valor_total), 0) from it),
    'aceite_no_prazo_pct', (select round(100.0 * count(*) filter (where c.tempo_aceite_seg <= cfg.tempo_aceite_seg)
                                         / nullif(count(*) filter (where c.tempo_aceite_seg is not null), 0), 1)
                            from c cross join cfg),
    'tempo_medio_aceite_seg', (select round(avg(tempo_aceite_seg)) from c),
    'tempo_medio_deslocamento_seg', (select round(avg(tempo_deslocamento_seg)) from c),
    'tempo_medio_servico_seg', (select round(avg(tempo_servico_seg)) from c),
    'tempo_medio_total_seg', (select round(avg(tempo_total_seg)) from c),
    'nota_media', (select round(avg(avaliacao_nota), 2) from c),
    'avaliacoes', (select count(avaliacao_nota) from c),
    'por_dia', (select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'total', n, 'concluidos', ok) order by dia), '[]'::jsonb) from (
                  select (recebido_em at time zone 'America/Sao_Paulo')::date as dia, count(*) n,
                         count(*) filter (where status in ('servico_finalizado', 'concluido')) ok
                  from c group by 1) t),
    'por_hora', (select coalesce(jsonb_object_agg(h, n), '{}'::jsonb) from (
                  select extract(hour from recebido_em at time zone 'America/Sao_Paulo')::int h, count(*) n from c group by 1) t),
    'por_ocorrencia', (select coalesce(jsonb_object_agg(tipo_ocorrencia, n), '{}'::jsonb) from (
                  select tipo_ocorrencia, count(*) n from c group by 1) t),
    'por_origem', (select coalesce(jsonb_object_agg(origem, n), '{}'::jsonb) from (select origem, count(*) n from c group by 1) t),
    'por_mecanico', (select coalesce(jsonb_agg(x order by (x->>'atendimentos')::int desc), '[]'::jsonb) from (
                  select jsonb_build_object(
                    'mecanico_id', c.mecanico_id, 'nome', u.nome_completo,
                    'atendimentos', count(*),
                    'concluidos', count(*) filter (where c.status in ('servico_finalizado', 'concluido')),
                    'cancelados', count(*) filter (where c.status = 'cancelado'),
                    'tempo_medio_aceite_seg', round(avg(c.tempo_aceite_seg)),
                    'tempo_medio_deslocamento_seg', round(avg(c.tempo_deslocamento_seg)),
                    'tempo_medio_servico_seg', round(avg(c.tempo_servico_seg)),
                    'nota_media', round(avg(c.avaliacao_nota), 2),
                    'recusas', (select count(*) from public.sos_recusas r where r.mecanico_id = c.mecanico_id
                                 and r.created_at >= p_inicio and r.created_at < p_fim),
                    'valor_itens', (select coalesce(sum(i.valor_total), 0) from it i join c c2 on c2.id = i.chamado_id where c2.mecanico_id = c.mecanico_id)
                  ) as x
                  from c join public.usuarios u on u.id = c.mecanico_id
                  group by c.mecanico_id, u.nome_completo) t),
    'por_cliente', (select coalesce(jsonb_agg(x order by (x->>'chamados')::int desc), '[]'::jsonb) from (
                  select jsonb_build_object(
                    'cliente_id', c.cliente_id, 'nome', cl.nome_razao, 'chamados', count(*),
                    'valor_itens', (select coalesce(sum(i.valor_total), 0) from it i join c c2 on c2.id = i.chamado_id where c2.cliente_id = c.cliente_id)
                  ) as x
                  from c join public.clientes cl on cl.id = c.cliente_id
                  group by c.cliente_id, cl.nome_razao
                  order by count(*) desc limit 15) t),
    'itens', (select coalesce(jsonb_agg(x order by (x->>'valor_total')::numeric desc), '[]'::jsonb) from (
                  select jsonb_build_object(
                    'tipo', tipo, 'produto_id', produto_id, 'servico_id', servico_id, 'codigo', max(codigo),
                    'descricao', max(descricao), 'quantidade', sum(quantidade), 'valor_total', sum(valor_total),
                    'chamados', count(distinct chamado_id)
                  ) as x
                  from it group by tipo, produto_id, servico_id, coalesce(produto_id, servico_id)::text || descricao
                  order by sum(valor_total) desc limit 40) t),
    'motivos_cancelamento', (select coalesce(jsonb_agg(jsonb_build_object('motivo', motivo, 'papel', papel, 'n', n) order by n desc), '[]'::jsonb) from (
                  select coalesce(nullif(trim(motivo_cancelamento), ''), 'Sem motivo') motivo, cancelado_por_papel papel, count(*) n
                  from c where status = 'cancelado' group by 1, 2 order by 3 desc limit 10) t)
  ) end
$$;

-- Central gere a ficha do mecânico no SOS sem depender do celular dele:
-- tirar de "disponível" quem saiu sem avisar, desligar o SOS de alguém,
-- registrar a viatura. Também inclui no SOS um usuário cuja função não é de
-- mecânico (ex.: supervisor que atende socorro).
create or replace function public.sos_central_mecanico(p_usuario uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_atual uuid; v_sit public.sos_situacao_mecanico := nullif(p->>'situacao', '')::public.sos_situacao_mecanico;
begin
  if not public.tem_permissao('sos', 'editar') then raise exception 'Sem permissão.'; end if;
  if not exists (select 1 from public.usuarios where id = p_usuario and situacao = 'ativo') then
    raise exception 'Usuário inválido ou inativo.';
  end if;
  select chamado_atual_id into v_atual from public.sos_mecanicos where usuario_id = p_usuario;
  if v_sit in ('disponivel', 'offline', 'indisponivel') and v_atual is not null
     and exists (select 1 from public.sos_chamados where id = v_atual and status not in ('servico_finalizado', 'concluido', 'cancelado')) then
    raise exception 'Este mecânico está num atendimento. Troque o mecânico do chamado antes.';
  end if;
  insert into public.sos_mecanicos (usuario_id, situacao, aceita_sos, veiculo_apoio, telefone_contato, mostrar_telefone)
  values (p_usuario, coalesce(v_sit, 'offline'), coalesce((p->>'aceita_sos')::boolean, true),
          nullif(p->>'veiculo_apoio', ''), nullif(p->>'telefone', ''), coalesce((p->>'mostrar_telefone')::boolean, false))
  on conflict (usuario_id) do update
    set situacao = coalesce(v_sit, public.sos_mecanicos.situacao),
        aceita_sos = coalesce((p->>'aceita_sos')::boolean, public.sos_mecanicos.aceita_sos),
        veiculo_apoio = case when p ? 'veiculo_apoio' then nullif(p->>'veiculo_apoio', '') else public.sos_mecanicos.veiculo_apoio end,
        telefone_contato = case when p ? 'telefone' then nullif(p->>'telefone', '') else public.sos_mecanicos.telefone_contato end,
        mostrar_telefone = coalesce((p->>'mostrar_telefone')::boolean, public.sos_mecanicos.mostrar_telefone),
        chamado_atual_id = case when coalesce(v_sit, public.sos_mecanicos.situacao) in ('disponivel', 'offline', 'indisponivel')
                                then null else public.sos_mecanicos.chamado_atual_id end;
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.mecanico', 'sos_mecanicos', p_usuario, p);
  return (select to_jsonb(m) from public.sos_mecanicos m where m.usuario_id = p_usuario);
end;
$$;

-- Mapa e lista da central: mecânicos com posição e situação.
-- Recriada (e não só substituída): as colunas do retorno podem mudar entre versões.
drop function if exists public.sos_mecanicos_mapa();
create or replace function public.sos_mecanicos_mapa()
returns table (
  usuario_id uuid, nome text, avatar_url text, situacao public.sos_situacao_mecanico, aceita_sos boolean,
  latitude double precision, longitude double precision, posicao_em timestamptz, chamado_atual_id uuid,
  veiculo_apoio text, telefone text, especialidades text, visto_em timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id, u.nome_completo, u.avatar_url, coalesce(m.situacao, 'offline'), coalesce(m.aceita_sos, true),
         m.latitude, m.longitude, m.posicao_em, m.chamado_atual_id, m.veiculo_apoio,
         coalesce(m.telefone_contato, u.telefone),
         (select string_agg(e.nome, ', ' order by e.nome) from public.usuario_especialidades ue
            join public.especialidades e on e.id = ue.especialidade_id where ue.usuario_id = u.id),
         pr.visto_em
  from public.usuarios u
  left join public.funcoes f on f.id = u.funcao_id
  left join public.sos_mecanicos m on m.usuario_id = u.id
  left join public.sos_presenca pr on pr.usuario_id = u.id
  where public.sos_eh_equipe() and u.situacao = 'ativo' and (coalesce(f.atua_como_mecanico, false) or m.usuario_id is not null)
  order by case coalesce(m.situacao, 'offline') when 'em_atendimento' then 0 when 'disponivel' then 1 when 'pausa' then 2 when 'indisponivel' then 3 else 4 end,
           u.nome_completo
$$;

-- Lista da central com os dados de exibição já juntos (cliente, placa, mecânico).
create or replace function public.sos_listar_chamados(p_filtro jsonb default '{}'::jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.sos_eh_equipe() then '[]'::jsonb else coalesce((
    select jsonb_agg(x order by (x->>'ordem_prioridade')::int, (x->>'recebido_em') desc) from (
      select to_jsonb(c) || jsonb_build_object(
        'cliente_nome', cl.nome_razao,
        'placa', v.placa, 'veiculo', nullif(concat_ws(' ', v.marca, v.modelo), ''),
        'mecanico_nome', u.nome_completo,
        'status_rotulo', public.sos_rotulo_status(c.status),
        'ocorrencia_rotulo', public.sos_rotulo_ocorrencia(c.tipo_ocorrencia),
        'os_numero', (select numero from public.ordens_servico where id = c.os_id),
        'mensagens_nao_lidas', (select count(*) from public.sos_mensagens m where m.chamado_id = c.id and m.lida_em is null and m.autor_papel = 'cliente'),
        'ordem_prioridade', case when c.status in ('recebido', 'procurando_mecanico') then 0
                                 when c.status in ('aceito', 'a_caminho', 'no_local', 'servico_iniciado') then 1
                                 when c.status = 'servico_finalizado' then 2 else 3 end
      ) as x
      from public.sos_chamados c
      join public.clientes cl on cl.id = c.cliente_id
      left join public.veiculos v on v.id = c.veiculo_id
      left join public.usuarios u on u.id = c.mecanico_id
      where (nullif(p_filtro->>'status', '') is null or c.status::text = any (string_to_array(p_filtro->>'status', ',')))
        and (nullif(p_filtro->>'mecanico_id', '') is null or c.mecanico_id = (p_filtro->>'mecanico_id')::uuid)
        and (nullif(p_filtro->>'ocorrencia', '') is null or c.tipo_ocorrencia::text = p_filtro->>'ocorrencia')
        and (nullif(p_filtro->>'de', '') is null or c.recebido_em >= (p_filtro->>'de')::timestamptz)
        and (nullif(p_filtro->>'ate', '') is null or c.recebido_em < (p_filtro->>'ate')::timestamptz + interval '1 day')
        and (nullif(trim(p_filtro->>'busca'), '') is null
             or c.protocolo ilike '%' || trim(p_filtro->>'busca') || '%'
             or cl.nome_razao ilike '%' || trim(p_filtro->>'busca') || '%'
             or upper(regexp_replace(coalesce(v.placa, ''), '[^A-Za-z0-9]', '', 'g')) like '%' || upper(regexp_replace(p_filtro->>'busca', '[^A-Za-z0-9]', '', 'g')) || '%'
             or coalesce(v.modelo, '') ilike '%' || trim(p_filtro->>'busca') || '%')
        and (coalesce((p_filtro->>'ativos')::boolean, false) = false or c.status not in ('concluido', 'cancelado'))
      order by c.recebido_em desc
      limit least(coalesce((p_filtro->>'limite')::int, 200), 500)
    ) t), '[]'::jsonb) end
$$;

create or replace function public.sos_salvar_config(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, privado, pg_temp
as $$
begin
  if not public.tem_permissao('sos', 'configurar') then raise exception 'Sem permissão.'; end if;
  update public.sos_config
  set modo_distribuicao = coalesce(p->>'modo_distribuicao', modo_distribuicao),
      raio_busca_km = coalesce((p->>'raio_busca_km')::numeric, raio_busca_km),
      velocidade_media_kmh = coalesce((p->>'velocidade_media_kmh')::numeric, velocidade_media_kmh),
      tempo_aceite_seg = coalesce((p->>'tempo_aceite_seg')::int, tempo_aceite_seg),
      telefone_central = case when p ? 'telefone_central' then nullif(p->>'telefone_central', '') else telefone_central end,
      whatsapp_ativo = coalesce((p->>'whatsapp_ativo')::boolean, whatsapp_ativo),
      whatsapp_url = case when p ? 'whatsapp_url' then nullif(p->>'whatsapp_url', '') else whatsapp_url end,
      whatsapp_instancia = case when p ? 'whatsapp_instancia' then nullif(p->>'whatsapp_instancia', '') else whatsapp_instancia end,
      whatsapp_destinos = case when p ? 'whatsapp_destinos' then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(p->'whatsapp_destinos') x) else whatsapp_destinos end,
      mensagem_espera = coalesce(nullif(p->>'mensagem_espera', ''), mensagem_espera),
      lembrete_meses = coalesce((p->>'lembrete_meses')::int, lembrete_meses),
      lembrete_km = coalesce((p->>'lembrete_km')::int, lembrete_km),
      cancelamento_cliente_ate = coalesce(nullif(p->>'cancelamento_cliente_ate', '')::public.sos_status, cancelamento_cliente_ate),
      gerar_os_ao_finalizar = coalesce((p->>'gerar_os_ao_finalizar')::boolean, gerar_os_ao_finalizar),
      offline_apos_min = greatest(0, coalesce((p->>'offline_apos_min')::int, offline_apos_min)),
      concluir_apos_horas = greatest(1, coalesce((p->>'concluir_apos_horas')::int, concluir_apos_horas)),
      atualizado_por = auth.uid(), updated_at = now()
  where singleton;
  -- A chave da Evolution API nunca volta para o app: só entra.
  if nullif(p->>'whatsapp_apikey', '') is not null then
    insert into privado.config (chave, valor) values ('sos_whatsapp_apikey', p->>'whatsapp_apikey')
    on conflict (chave) do update set valor = excluded.valor;
  end if;
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'sos.config', 'sos_config', '00000000-0000-0000-0000-000000000000'::uuid, p - 'whatsapp_apikey');
  return (select to_jsonb(c) || jsonb_build_object('whatsapp_apikey_definida', exists (select 1 from privado.config where chave = 'sos_whatsapp_apikey'))
          from public.sos_config c where c.singleton);
end;
$$;

create or replace function public.sos_config_atual()
returns jsonb
language sql
stable
security definer
set search_path = public, privado, pg_temp
as $$
  select case when not public.sos_eh_equipe() then null else
    to_jsonb(c) || jsonb_build_object('whatsapp_apikey_definida', exists (select 1 from privado.config where chave = 'sos_whatsapp_apikey'))
  end from public.sos_config c where c.singleton
$$;

-- Central abre chamado em nome do cliente (telefone/WhatsApp) — o mesmo
-- `sos_abrir_chamado` cuida; aqui só a busca de cliente por nome/doc/placa.
create or replace function public.sos_buscar_cliente(p_termo text)
returns table (cliente_id uuid, nome text, documento text, celular text, veiculos jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.nome_razao, c.documento, coalesce(c.celular, c.telefone),
         (select jsonb_agg(jsonb_build_object('id', v.id, 'placa', v.placa, 'descricao', concat_ws(' ', v.marca, v.modelo, v.ano)))
          from public.veiculos v where v.cliente_id = c.id and v.situacao = 'ativo')
  from public.clientes c
  where public.sos_eh_equipe() and c.situacao = 'ativo' and length(trim(coalesce(p_termo, ''))) >= 2
    and (c.nome_razao ilike '%' || p_termo || '%'
         or (length(regexp_replace(p_termo, '\D', '', 'g')) >= 3 and c.documento_digitos like regexp_replace(p_termo, '\D', '', 'g') || '%')
         or exists (select 1 from public.veiculos v where v.cliente_id = c.id
                    and upper(regexp_replace(v.placa, '[^A-Za-z0-9]', '', 'g')) like upper(regexp_replace(p_termo, '[^A-Za-z0-9]', '', 'g')) || '%'))
  order by c.nome_razao limit 20
$$;

-- Contas do app (clientes) para a central conferir vínculo e acesso.
create or replace function public.sos_contas_app(p_termo text default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when not public.sos_eh_equipe() then '[]'::jsonb else coalesce((
    select jsonb_agg(jsonb_build_object(
      'usuario_id', a.usuario_id, 'nome', a.nome, 'telefone', a.telefone, 'email', a.email,
      'cliente_id', a.cliente_id, 'cliente_nome', cl.nome_razao, 'created_at', a.created_at,
      'ultimo_acesso', (select last_sign_in_at from auth.users where id = a.usuario_id),
      'chamados', (select count(*) from public.sos_chamados where conta_usuario_id = a.usuario_id),
      'veiculos', (select count(*) from public.veiculos where cliente_id = a.cliente_id and situacao = 'ativo')
    ) order by a.created_at desc)
    from public.sos_contas_cliente a
    left join public.clientes cl on cl.id = a.cliente_id
    where nullif(trim(p_termo), '') is null or a.nome ilike '%' || p_termo || '%' or a.email ilike '%' || p_termo || '%'
       or coalesce(a.telefone_digitos, '') like '%' || regexp_replace(p_termo, '\D', '', 'g') || '%'
  ), '[]'::jsonb) end
$$;

-- Limpeza do rastro: 30 dias após encerrar, a localização some.
create or replace function public.sos_limpar_posicoes()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  with apagadas as (
    delete from public.sos_posicoes p
    using public.sos_chamados c
    where c.id = p.chamado_id and c.status in ('concluido', 'cancelado')
      and coalesce(c.concluido_em, c.cancelado_em, c.updated_at) < now() - interval '30 days'
    returning 1
  ) select count(*) into v_n from apagadas;
  delete from public.sos_compartilhamentos where expira_em < now() - interval '7 days';
  return v_n;
end;
$$;

-- ============================================================== vigia
-- Pulso do app do mecânico: "estou com o app aberto". O vigia usa para não
-- deixar "disponível" quem fechou o app há horas; a central vê "app visto há".
create or replace function public.sos_pulso()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.sos_presenca (usuario_id, visto_em)
  select auth.uid(), now() where exists (select 1 from public.usuarios where id = auth.uid())
  on conflict (usuario_id) do update set visto_em = now()
$$;

create or replace function public.sos_texto_duracao(p_seg integer)
returns text
language sql
immutable
as $$
  select case when p_seg < 90 then p_seg || ' s'
              when p_seg < 5400 then round(p_seg / 60.0) || ' min'
              else round(p_seg / 3600.0, 1) || ' h' end
$$;

-- Push para os mecânicos disponíveis que ainda não recusaram este chamado.
create or replace function public.sos_avisar_mecanicos(p_chamado uuid, p_titulo text, p_mensagem text, p_exceto uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_u uuid; v_n integer := 0;
begin
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

-- Roda a cada 30 s (pg_cron). É o que garante que nenhum SOS fica esquecido:
--   1. ninguém aceitou no prazo → avisa de novo mecânicos e central, subindo o
--      tom (1×, 3× e 6× o prazo de aceite); atribuição direta sem resposta
--      volta para todos no modo inteligente;
--   2. deslocamento atrasado, ou sem posição do mecânico → central, e o próprio
--      mecânico recebe um push para reabrir o app;
--   3. serviço finalizado sem avaliação por muito tempo → concluído;
--   4. "disponível" com o app fechado há horas → offline (o despacho não conta
--      com quem não vai responder).
-- Cada aviso é marcado no chamado e sai uma vez só.
create or replace function public.sos_vigiar()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cfg     public.sos_config;
  v_lim     integer;
  v_c       record;
  v_u       uuid;
  v_idade   integer;
  v_min     integer;
  v_prazo   integer;
  v_nivel   smallint;
  v_nome    text;
  v_resumo  text;
  v_link    text;
  n_espera  integer := 0;
  n_devolv  integer := 0;
  n_atraso  integer := 0;
  n_sinal   integer := 0;
  n_concl   integer := 0;
  n_off     integer := 0;
begin
  -- Execuções sobrepostas (cron atrasado) não duplicam avisos.
  if not pg_try_advisory_xact_lock(hashtext('sos_vigiar')) then
    return jsonb_build_object('ok', false, 'motivo', 'em_execucao');
  end if;
  select * into v_cfg from public.sos_config where singleton;
  v_lim := greatest(coalesce(v_cfg.tempo_aceite_seg, 120), 30);

  -- 1. Esperando mecânico além do prazo de aceite.
  for v_c in
    select c.id, c.protocolo, c.mecanico_id, c.conta_usuario_id, c.recebido_em,
           coalesce(c.espera_desde, c.recebido_em) as desde, c.alerta_nivel, c.tipo_ocorrencia,
           cl.nome_razao as cliente, v.placa
    from public.sos_chamados c
    join public.clientes cl on cl.id = c.cliente_id
    left join public.veiculos v on v.id = c.veiculo_id
    where c.status in ('recebido', 'procurando_mecanico')
      and coalesce(c.espera_desde, c.recebido_em) <= now() - make_interval(secs => v_lim)
    order by c.recebido_em
  loop
    v_idade := extract(epoch from now() - v_c.desde)::int;
    v_min := greatest(1, round(extract(epoch from now() - v_c.recebido_em) / 60.0))::int;
    v_resumo := concat_ws(' · ', v_c.cliente, v_c.placa, public.sos_rotulo_ocorrencia(v_c.tipo_ocorrencia));
    v_link := '/sos?chamado=' || v_c.id;

    -- 1a. Atribuído pela central a um mecânico que não respondeu.
    if v_c.mecanico_id is not null then
      v_nome := coalesce((select split_part(nome_completo, ' ', 1) from public.usuarios where id = v_c.mecanico_id), 'O mecânico');
      if v_cfg.modo_distribuicao = 'inteligente' then
        update public.sos_chamados
        set mecanico_id = null, atribuido_em = null, atribuido_por = null, status = 'procurando_mecanico'
        where id = v_c.id;
        perform public.sos_registrar_evento(v_c.id, 'alerta', v_nome || ' não respondeu',
          'Sem resposta em ' || public.sos_texto_duracao(v_idade) || '. O chamado voltou para todos os mecânicos disponíveis.',
          jsonb_build_object('mecanico_id', v_c.mecanico_id, 'motivo', 'sem_resposta'), null, null, 'sistema');
        for v_u in select * from public.sos_usuarios_central() loop
          perform public.sos_notificar(v_u, '⚠️ ' || v_nome || ' não respondeu · ' || v_c.protocolo,
            'O SOS voltou para todos os mecânicos disponíveis. ' || v_resumo, v_link);
        end loop;
        perform public.sos_avisar_mecanicos(v_c.id, '🚨 SOS esperando mecânico · ' || v_c.protocolo, v_resumo, v_c.mecanico_id);
        n_devolv := n_devolv + 1;
      elsif v_c.alerta_nivel = 0 then
        update public.sos_chamados set alerta_nivel = 1, alerta_em = now() where id = v_c.id;
        perform public.sos_registrar_evento(v_c.id, 'alerta', v_nome || ' ainda não respondeu',
          'Sem resposta em ' || public.sos_texto_duracao(v_idade) || '.', jsonb_build_object('mecanico_id', v_c.mecanico_id), null, null, 'sistema');
        for v_u in select * from public.sos_usuarios_central() loop
          perform public.sos_notificar(v_u, '⚠️ ' || v_nome || ' não respondeu · ' || v_c.protocolo,
            'Escolha outro mecânico ou ligue para ele. ' || v_resumo, v_link);
        end loop;
        perform public.sos_notificar(v_c.mecanico_id, '🚨 SOS aguardando sua resposta · ' || v_c.protocolo, v_resumo, '/app/chamado/' || v_c.id);
        n_espera := n_espera + 1;
      end if;
      continue;
    end if;

    -- 1b. Ninguém com o chamado: o tom sobe com o tempo.
    v_nivel := case when v_idade >= 6 * v_lim then 3 when v_idade >= 3 * v_lim then 2 else 1 end;
    if v_nivel <= v_c.alerta_nivel then continue; end if;

    update public.sos_chamados set alerta_nivel = v_nivel, alerta_em = now() where id = v_c.id;
    perform public.sos_registrar_evento(v_c.id, 'alerta',
      case v_nivel when 1 then 'Ainda sem mecânico' when 2 then 'Central acionada' else 'Alerta máximo: sem mecânico' end,
      'Aguardando há ' || v_min || ' min. ' ||
      case v_nivel
        when 1 then case when v_cfg.modo_distribuicao = 'inteligente' then 'Mecânicos disponíveis e central avisados de novo.' else 'Central avisada de novo.' end
        when 2 then 'A central foi acionada para despachar pessoalmente.'
        else 'Alerta máximo enviado à central.' end,
      jsonb_build_object('nivel', v_nivel), null, null, 'sistema');

    for v_u in select * from public.sos_usuarios_central() loop
      perform public.sos_notificar(v_u,
        case v_nivel when 1 then '⏱ SOS sem mecânico há ' when 2 then '🔴 SOS sem mecânico há ' else '🔴🔴 SOS parado há ' end
          || v_min || ' min · ' || v_c.protocolo,
        case when v_nivel = 1 then v_resumo else 'Despache manualmente ou ligue para o cliente. ' || v_resumo end,
        v_link);
    end loop;
    if v_cfg.modo_distribuicao = 'inteligente' then
      perform public.sos_avisar_mecanicos(v_c.id, '⏱ SOS esperando há ' || v_min || ' min · ' || v_c.protocolo, v_resumo, null);
    end if;
    if v_nivel >= 2 then
      perform public.sos_avisar_whatsapp(v_c.id, '⚠️ SOS SEM MECÂNICO HÁ ' || v_min || ' MIN');
    end if;
    if v_nivel = 2 and v_c.conta_usuario_id is not null then
      perform public.sos_notificar(v_c.conta_usuario_id, 'Seu SOS continua em andamento · ' || v_c.protocolo,
        'A central da Tecnoar está cuidando do seu chamado pessoalmente e pode te ligar.', '/app/chamado/' || v_c.id);
    end if;
    n_espera := n_espera + 1;
  end loop;

  -- 2. Deslocamento: atrasado, ou sem posição do mecânico.
  for v_c in
    select c.id, c.protocolo, c.mecanico_id, c.eta_inicial_min, c.eta_min,
           greatest(c.a_caminho_em, c.atribuido_em) as saiu_em, c.atraso_avisado_em, c.sinal_avisado_em,
           cl.nome_razao as cliente, m.posicao_em, u.nome_completo
    from public.sos_chamados c
    join public.clientes cl on cl.id = c.cliente_id
    left join public.sos_mecanicos m on m.usuario_id = c.mecanico_id
    left join public.usuarios u on u.id = c.mecanico_id
    where c.status in ('aceito', 'a_caminho') and c.mecanico_id is not null
      and (c.atraso_avisado_em is null or c.sinal_avisado_em is null)
  loop
    if v_c.saiu_em is null then continue; end if;
    v_nome := coalesce(nullif(split_part(v_c.nome_completo, ' ', 1), ''), 'O mecânico');
    v_min := greatest(0, round(extract(epoch from now() - v_c.saiu_em) / 60.0))::int;
    v_link := '/sos?chamado=' || v_c.id;

    -- Atrasado: 1,5× a previsão inicial + 10 min de folga (sem previsão, 30 min).
    v_prazo := greatest(15, ceil(coalesce(v_c.eta_inicial_min, 30) * 1.5)::int + 10);
    if v_c.atraso_avisado_em is null and v_min >= v_prazo then
      update public.sos_chamados set atraso_avisado_em = now() where id = v_c.id;
      perform public.sos_registrar_evento(v_c.id, 'alerta', 'Deslocamento atrasado',
        'A caminho há ' || v_min || ' min' || coalesce(' (previsão inicial: ' || v_c.eta_inicial_min || ' min)', '')
          || coalesce(', faltando cerca de ' || v_c.eta_min || ' min', '') || '.',
        jsonb_build_object('minutos', v_min, 'eta_inicial_min', v_c.eta_inicial_min), null, null, 'sistema');
      for v_u in select * from public.sos_usuarios_central() loop
        perform public.sos_notificar(v_u, '⏰ ' || v_nome || ' atrasado · ' || v_c.protocolo,
          'A caminho há ' || v_min || ' min' || coalesce(' (previsão era ' || v_c.eta_inicial_min || ' min)', '') || '. ' || v_c.cliente, v_link);
      end loop;
      n_atraso := n_atraso + 1;
    end if;

    -- Sem posição: 8 min sem nada do GPS do mecânico, depois de 5 min de saída.
    if v_c.sinal_avisado_em is null and v_c.saiu_em <= now() - interval '5 minutes'
       and coalesce(v_c.posicao_em, '-infinity'::timestamptz) < now() - interval '8 minutes' then
      update public.sos_chamados set sinal_avisado_em = now() where id = v_c.id;
      perform public.sos_registrar_evento(v_c.id, 'alerta', 'Sem posição do mecânico',
        coalesce('Última posição há ' || round(extract(epoch from now() - v_c.posicao_em) / 60.0) || ' min.', 'O mecânico ainda não enviou posição.')
          || ' O app dele pode estar fechado.',
        null, null, null, 'sistema');
      for v_u in select * from public.sos_usuarios_central() loop
        perform public.sos_notificar(v_u, '📡 Sem sinal de ' || v_nome || ' · ' || v_c.protocolo,
          'Ligue para o mecânico: o cliente não está vendo a posição dele. ' || v_c.cliente, v_link);
      end loop;
      perform public.sos_notificar(v_c.mecanico_id, '📍 Abra o SOS Tecnoar',
        'O cliente não está vendo sua posição. Toque para voltar ao atendimento.', '/app/chamado/' || v_c.id);
      n_sinal := n_sinal + 1;
    end if;
  end loop;

  -- 3. Serviço finalizado e o cliente não avaliou: conclui sozinho.
  for v_c in
    select c.id from public.sos_chamados c
    where c.status = 'servico_finalizado'
      and c.finalizado_em < now() - make_interval(hours => greatest(coalesce(v_cfg.concluir_apos_horas, 24), 1))
  loop
    update public.sos_chamados set status = 'concluido', concluido_em = now() where id = v_c.id;
    perform public.sos_registrar_evento(v_c.id, 'status', public.sos_rotulo_status('concluido'),
      'Concluído automaticamente: o cliente não avaliou em ' || greatest(coalesce(v_cfg.concluir_apos_horas, 24), 1) || ' h.',
      jsonb_build_object('status', 'concluido', 'automatico', true), null, null, 'sistema');
    n_concl := n_concl + 1;
  end loop;

  -- 4. "Disponível" sem nenhum sinal do app (pulso, GPS ou mudança de situação).
  if coalesce(v_cfg.offline_apos_min, 240) > 0 then
    for v_c in
      select m.usuario_id from public.sos_mecanicos m
      left join public.sos_presenca p on p.usuario_id = m.usuario_id
      where m.situacao = 'disponivel' and m.chamado_atual_id is null
        and greatest(m.situacao_em, coalesce(p.visto_em, m.situacao_em), coalesce(m.posicao_em, m.situacao_em))
            < now() - make_interval(mins => greatest(v_cfg.offline_apos_min, 15))
    loop
      update public.sos_mecanicos set situacao = 'offline' where usuario_id = v_c.usuario_id;
      perform public.sos_notificar(v_c.usuario_id, 'Você ficou offline no SOS',
        'O app ficou fechado por muito tempo. Abra o SOS Tecnoar e toque em FICAR DISPONÍVEL para voltar a receber chamados.', '/app/');
      n_off := n_off + 1;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'espera', n_espera, 'devolvidos', n_devolv, 'atrasos', n_atraso,
                            'sem_sinal', n_sinal, 'concluidos', n_concl, 'offline', n_off);
end;
$$;

-- ============================================================== permissões (menu + RLS)
insert into public.recursos (chave, nome, grupo, ordem, acoes)
values ('sos', 'SOS Tecnoar', 'operacao', 35, array['visualizar', 'criar', 'editar', 'cancelar', 'configurar', 'exportar']::public.acao_permissao[])
on conflict (chave) do update set nome = excluded.nome, acoes = excluded.acoes;

insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, 'sos', a
from public.perfis_acesso p
cross join unnest(array['visualizar', 'criar', 'editar', 'cancelar', 'configurar', 'exportar']::public.acao_permissao[]) a
where p.is_system
on conflict do nothing;

-- Os demais perfis NÃO ganham a central automaticamente: mecânico também vê
-- OS, e herdar o SOS por isso o faria receber a sirene da central na
-- oficina e ver o despacho. Quem opera a central é liberado em Perfis e
-- Permissões (o recurso `sos` já aparece lá).

-- Mecânicos de oficina passam a aceitar SOS por padrão (começam offline e
-- ficam disponíveis no app).
insert into public.sos_mecanicos (usuario_id)
select u.id from public.usuarios u join public.funcoes f on f.id = u.funcao_id
where f.atua_como_mecanico and u.situacao = 'ativo'
on conflict do nothing;

-- Presença: só as funções do SOS leem e gravam (sem política = sem acesso direto).
alter table public.sos_presenca            enable row level security;
alter table public.sos_contas_cliente      enable row level security;
alter table public.sos_config              enable row level security;
alter table public.sos_mecanicos           enable row level security;
alter table public.sos_chamados            enable row level security;
alter table public.sos_eventos             enable row level security;
alter table public.sos_posicoes            enable row level security;
alter table public.sos_mensagens           enable row level security;
alter table public.sos_recusas             enable row level security;
alter table public.sos_compartilhamentos   enable row level security;
alter table public.sos_agendamentos        enable row level security;
alter table public.sos_lembretes           enable row level security;
alter table public.sos_contatos_emergencia enable row level security;
alter table public.sos_itens               enable row level security;
alter table public.sos_anexos              enable row level security;

drop policy if exists sos_contas_propria on public.sos_contas_cliente;
create policy sos_contas_propria on public.sos_contas_cliente
  for select to authenticated using (usuario_id = (select auth.uid()) or (select public.sos_eh_equipe()));

drop policy if exists sos_config_equipe on public.sos_config;
create policy sos_config_equipe on public.sos_config
  for select to authenticated using ((select public.sos_eh_equipe()) or (select public.sos_eh_mecanico()));

drop policy if exists sos_mecanicos_ler on public.sos_mecanicos;
create policy sos_mecanicos_ler on public.sos_mecanicos
  for select to authenticated using (usuario_id = (select auth.uid()) or (select public.sos_eh_equipe()));

drop policy if exists sos_chamados_ler on public.sos_chamados;
create policy sos_chamados_ler on public.sos_chamados
  for select to authenticated using (
    (select public.sos_eh_equipe())
    or mecanico_id = (select auth.uid())
    or conta_usuario_id = (select auth.uid())
    or cliente_id = (select public.sos_cliente_atual())
    or ((select public.sos_eh_mecanico()) and mecanico_id is null and status in ('recebido', 'procurando_mecanico'))
  );

-- Central ajusta dados descritivos direto (prioridade, endereço, observação);
-- estado só por RPC.
drop policy if exists sos_chamados_editar_central on public.sos_chamados;
create policy sos_chamados_editar_central on public.sos_chamados
  for update to authenticated
  using ((select public.tem_permissao('sos', 'editar')))
  with check ((select public.tem_permissao('sos', 'editar')));

drop policy if exists sos_eventos_ler on public.sos_eventos;
create policy sos_eventos_ler on public.sos_eventos
  for select to authenticated using ((select public.sos_pode_ver_chamado(chamado_id)));

drop policy if exists sos_posicoes_ler on public.sos_posicoes;
create policy sos_posicoes_ler on public.sos_posicoes
  for select to authenticated using ((select public.sos_pode_ver_chamado(chamado_id)));

drop policy if exists sos_mensagens_ler on public.sos_mensagens;
create policy sos_mensagens_ler on public.sos_mensagens
  for select to authenticated using ((select public.sos_pode_ver_chamado(chamado_id)));

drop policy if exists sos_recusas_ler on public.sos_recusas;
create policy sos_recusas_ler on public.sos_recusas
  for select to authenticated using (mecanico_id = (select auth.uid()) or (select public.sos_eh_equipe()));

drop policy if exists sos_compartilhamentos_ler on public.sos_compartilhamentos;
create policy sos_compartilhamentos_ler on public.sos_compartilhamentos
  for select to authenticated using ((select public.sos_pode_ver_chamado(chamado_id)));
drop policy if exists sos_compartilhamentos_revogar on public.sos_compartilhamentos;
create policy sos_compartilhamentos_revogar on public.sos_compartilhamentos
  for update to authenticated using (criado_por = (select auth.uid()) or (select public.sos_eh_equipe()));

drop policy if exists sos_agendamentos_ler on public.sos_agendamentos;
create policy sos_agendamentos_ler on public.sos_agendamentos
  for select to authenticated using (cliente_id = (select public.sos_cliente_atual()) or (select public.sos_eh_equipe()));

drop policy if exists sos_lembretes_ler on public.sos_lembretes;
create policy sos_lembretes_ler on public.sos_lembretes
  for select to authenticated using (cliente_id = (select public.sos_cliente_atual()) or (select public.sos_eh_equipe()));

drop policy if exists sos_contatos_proprios on public.sos_contatos_emergencia;
create policy sos_contatos_proprios on public.sos_contatos_emergencia
  for all to authenticated using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
drop policy if exists sos_contatos_equipe on public.sos_contatos_emergencia;
create policy sos_contatos_equipe on public.sos_contatos_emergencia
  for select to authenticated using ((select public.sos_eh_equipe()));

drop policy if exists sos_itens_ler on public.sos_itens;
create policy sos_itens_ler on public.sos_itens
  for select to authenticated using ((select public.sos_pode_ver_chamado(chamado_id)));

drop policy if exists sos_anexos_ler on public.sos_anexos;
create policy sos_anexos_ler on public.sos_anexos
  for select to authenticated using ((select public.sos_pode_ver_chamado(chamado_id)));

-- O cliente final enxerga SÓ o que é dele nas tabelas que já existem.
-- São políticas a mais; as da equipe continuam iguais.
drop policy if exists clientes_sos_proprio on public.clientes;
create policy clientes_sos_proprio on public.clientes
  for select to authenticated using (id = (select public.sos_cliente_atual()));

drop policy if exists veiculos_sos_proprios on public.veiculos;
create policy veiculos_sos_proprios on public.veiculos
  for select to authenticated using (cliente_id = (select public.sos_cliente_atual()));

-- Km e apelido do próprio veículo o cliente pode manter.
drop policy if exists veiculos_sos_editar on public.veiculos;
create policy veiculos_sos_editar on public.veiculos
  for update to authenticated
  using (cliente_id = (select public.sos_cliente_atual()))
  with check (cliente_id = (select public.sos_cliente_atual()));

drop policy if exists ordens_servico_sos_proprias on public.ordens_servico;
create policy ordens_servico_sos_proprias on public.ordens_servico
  for select to authenticated using (cliente_id = (select public.sos_cliente_atual()));

drop policy if exists os_servicos_sos on public.os_servicos;
create policy os_servicos_sos on public.os_servicos
  for select to authenticated using (os_id in (select id from public.ordens_servico where cliente_id = (select public.sos_cliente_atual())));

drop policy if exists os_produtos_sos on public.os_produtos;
create policy os_produtos_sos on public.os_produtos
  for select to authenticated using (os_id in (select id from public.ordens_servico where cliente_id = (select public.sos_cliente_atual())));

drop policy if exists eventos_veiculo_sos on public.eventos_veiculo;
create policy eventos_veiculo_sos on public.eventos_veiculo
  for select to authenticated using (veiculo_id in (select id from public.veiculos where cliente_id = (select public.sos_cliente_atual())));

drop policy if exists status_os_sos on public.status_os;
create policy status_os_sos on public.status_os
  for select to authenticated using ((select public.sos_cliente_atual()) is not null);

-- ============================================================== trava: cliente do app só vê o que é dele
-- Até o SOS, toda conta logada era da equipe; políticas antigas do tipo
-- "autenticado pode ler" eram seguras por isso. Agora há clientes de fora com
-- login. Em vez de confiar que nenhuma política antiga seja ampla demais, uma
-- política RESTRITIVA (soma com AND a qualquer outra) em cada tabela garante:
-- conta de cliente do app nunca passa do que é dela, seja qual for a regra
-- que já existia. Para a equipe a trava é neutra.
create or replace function public.sos_eh_conta_cliente()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.sos_contas_cliente where usuario_id = auth.uid())
     and not exists (select 1 from public.usuarios where id = auth.uid())
$$;

do $$
declare
  t record;
  -- Tabelas que o cliente lê, com a condição do que é dele.
  proprias constant jsonb := jsonb_build_object(
    'clientes', 'id = (select public.sos_cliente_atual())',
    'veiculos', 'cliente_id = (select public.sos_cliente_atual())',
    'ordens_servico', 'cliente_id = (select public.sos_cliente_atual())',
    'os_servicos', 'os_id in (select o.id from public.ordens_servico o where o.cliente_id = (select public.sos_cliente_atual()))',
    'os_produtos', 'os_id in (select o.id from public.ordens_servico o where o.cliente_id = (select public.sos_cliente_atual()))',
    'eventos_veiculo', 'veiculo_id in (select v.id from public.veiculos v where v.cliente_id = (select public.sos_cliente_atual()))',
    'notificacoes', 'usuario_id = (select auth.uid())',
    'push_inscricoes', 'usuario_id = (select auth.uid())',
    'status_os', 'true'
  );
  v_cond text;
begin
  for t in
    select c.relname
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relrowsecurity
      and c.relname not like 'sos\_%'
  loop
    v_cond := proprias->>t.relname;
    execute format('drop policy if exists sos_trava_cliente on public.%I', t.relname);
    execute format(
      'create policy sos_trava_cliente on public.%I as restrictive for all to authenticated using (%s) with check (%s)',
      t.relname,
      'not (select public.sos_eh_conta_cliente())' || coalesce(' or (' || v_cond || ')', ''),
      -- Escrita direta do cliente só nas próprias notificações/inscrições de push
      -- e no km do próprio veículo; o resto passa pelas RPCs.
      case when t.relname in ('notificacoes', 'push_inscricoes', 'veiculos')
           then 'not (select public.sos_eh_conta_cliente())' || coalesce(' or (' || v_cond || ')', '')
           else 'not (select public.sos_eh_conta_cliente())' end
    );
  end loop;
end $$;

-- Arquivos: o cliente só alcança o bucket do SOS (e, dentro dele, a política
-- abaixo limita aos chamados dele). Fotos de OS de outros clientes, nunca.
drop policy if exists sos_trava_cliente_arquivos on storage.objects;
create policy sos_trava_cliente_arquivos on storage.objects
  as restrictive for all to authenticated
  using (bucket_id = 'sos' or not (select public.sos_eh_conta_cliente()))
  with check (bucket_id = 'sos' or not (select public.sos_eh_conta_cliente()));

-- Bucket `sos`: arquivos vivem em `<chamado_id>/...`; quem vê o chamado vê o arquivo.
drop policy if exists sos_storage_ler on storage.objects;
create policy sos_storage_ler on storage.objects
  for select to authenticated
  using (bucket_id = 'sos' and (select public.sos_pode_ver_chamado(((storage.foldername(name))[1])::uuid)));
drop policy if exists sos_storage_gravar on storage.objects;
create policy sos_storage_gravar on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sos' and (select public.sos_pode_ver_chamado(((storage.foldername(name))[1])::uuid)));
-- Remover pela API do Storage: quem enviou o anexo, ou a central com `editar`.
drop policy if exists sos_storage_remover on storage.objects;
create policy sos_storage_remover on storage.objects
  for delete to authenticated
  using (bucket_id = 'sos' and exists (
    select 1 from public.sos_anexos a
    where a.caminho = name and (a.autor_id = (select auth.uid()) or (select public.tem_permissao('sos', 'editar')))));

-- ============================================================== grants
-- Nada disto é chamável sem login, exceto o que é explicitamente público.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like 'sos\_%'
  loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
    execute format('grant execute on function %s to authenticated, service_role', f.assinatura);
  end loop;
end $$;

-- Rotinas internas não são chamadas pelo app.
revoke execute on function public.sos_limpar_posicoes(), public.sos_avisar_whatsapp(uuid, text),
  public.sos_vigiar(), public.sos_avisar_mecanicos(uuid, text, text, uuid), public.sos_texto_duracao(integer),
  public.sos_ignorar_conta_cliente(), public.sos_mecanicos_antes(),
  public.sos_chamados_antes(), public.sos_chamados_depois(), public.sos_mensagens_depois(),
  public.sos_sincronizar_itens_os(uuid), public.sos_registrar_evento(uuid, text, text, text, jsonb, double precision, double precision, public.sos_papel),
  public.sos_notificar(uuid, text, text, text), public.sos_garantir_veiculo(uuid, text, text, text), public.sos_usuarios_central(),
  public.sos_nome_conta(uuid)
  from authenticated;

-- Funções sem `security definer` também ficam com search_path fixo.
alter function public.sos_rotulo_status(public.sos_status) set search_path = public, pg_temp;
alter function public.sos_rotulo_ocorrencia(public.sos_tipo_ocorrencia) set search_path = public, pg_temp;
alter function public.sos_distancia_km(double precision, double precision, double precision, double precision) set search_path = public, pg_temp;
alter function public.sos_texto_duracao(integer) set search_path = public, pg_temp;
alter function public.sos_mecanicos_antes() set search_path = public, pg_temp;
alter function public.sos_chamados_antes() set search_path = public, pg_temp;

-- Página de acompanhamento e telefone da central: sem login.
grant execute on function public.sos_acompanhar(text), public.sos_info_publica(),
  public.sos_rotulo_status(public.sos_status), public.sos_rotulo_ocorrencia(public.sos_tipo_ocorrencia) to anon;

-- ============================================================== realtime
do $$
declare t text;
begin
  foreach t in array array['sos_chamados', 'sos_posicoes', 'sos_mensagens', 'sos_eventos', 'sos_mecanicos',
                           'sos_agendamentos', 'sos_itens', 'sos_anexos'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
-- Linha inteira no evento de UPDATE (o app precisa do estado novo completo).
alter table public.sos_chamados replica identity full;
alter table public.sos_mecanicos replica identity full;

-- ============================================================== rotinas
-- O vigia depende do pg_cron: garante a extensão onde ela existe (Supabase).
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension pg_cron with schema pg_catalog;
  end if;
exception when others then
  raise notice 'pg_cron indisponível (%): ative em Database → Extensions para o vigia do SOS rodar.', sqlerrm;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('sos_lembretes', 'sos_limpar_posicoes', 'sos_vigiar');
    perform cron.schedule('sos_lembretes', '15 7 * * *', $c$ select public.sos_gerar_lembretes() $c$);
    perform cron.schedule('sos_limpar_posicoes', '30 3 * * *', $c$ select public.sos_limpar_posicoes() $c$);
    -- A cada 30 s (pg_cron 1.5+); versões antigas aceitam no máximo 1 min.
    begin
      perform cron.schedule('sos_vigiar', '30 seconds', $c$ select public.sos_vigiar() $c$);
    exception when others then
      perform cron.schedule('sos_vigiar', '* * * * *', $c$ select public.sos_vigiar() $c$);
    end;
  end if;
end $$;

commit;
