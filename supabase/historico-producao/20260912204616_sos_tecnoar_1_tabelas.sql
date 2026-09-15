-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260912204616.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- SOS Tecnoar (parte 1/8): tipos, notificações para qualquer conta, tabelas.
-- Fonte: supabase/migrations/20260912_sos_tecnoar.sql

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

-- Sem RLS nenhuma tabela nova fica exposta entre uma parte e outra: a parte
-- 8 cria as políticas; até lá, só as funções (security definer) acessam.
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
alter table public.sos_anexos              enable row level security;;
