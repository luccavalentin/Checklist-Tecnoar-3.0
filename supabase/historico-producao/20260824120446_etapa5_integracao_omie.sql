-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824120446.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ============================================================
-- ETAPA 5 — Integração Omie (opcional)
-- ============================================================

create type public.status_integracao as enum ('nao_configurada', 'configurada', 'conectada', 'erro');
create type public.tipo_sincronizacao as enum ('clientes', 'fornecedores', 'produtos', 'servicos', 'estoque', 'vendas');
create type public.resultado_sincronizacao as enum ('em_andamento', 'concluida', 'concluida_com_falhas', 'falhou', 'cancelada');

-- ---------- credenciais ----------
-- Sem política de RLS para `authenticated`: as credenciais NUNCA saem do
-- servidor. Só a Edge Function (service_role) lê esta tabela.
create table public.integracoes (
  id                uuid primary key default gen_random_uuid(),
  provedor          text not null unique,
  ambiente          text not null default 'producao',
  app_key           text,
  app_secret        text,
  ativa             boolean not null default false,
  status            public.status_integracao not null default 'nao_configurada',
  ultima_conexao_em timestamptz,
  ultimo_erro       text,
  configurado_por   uuid references public.usuarios (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.integracoes enable row level security;
create trigger integracoes_updated_at before update on public.integracoes
  for each row execute function public.tg_set_updated_at();

insert into public.integracoes (provedor) values ('omie') on conflict do nothing;

-- ---------- histórico de sincronizações ----------
create table public.sincronizacoes (
  id            uuid primary key default gen_random_uuid(),
  provedor      text not null default 'omie',
  tipo          public.tipo_sincronizacao not null,
  resultado     public.resultado_sincronizacao not null default 'em_andamento',
  iniciada_em   timestamptz not null default now(),
  finalizada_em timestamptz,
  processados   integer not null default 0,
  novos         integer not null default 0,
  atualizados   integer not null default 0,
  falhas        integer not null default 0,
  mensagem      text,
  executada_por uuid references public.usuarios (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index sincronizacoes_ix on public.sincronizacoes (provedor, iniciada_em desc);

alter table public.sincronizacoes enable row level security;
create policy sincronizacoes_ler on public.sincronizacoes for select to authenticated
  using (public.tem_permissao('integracoes', 'visualizar'));

-- ---------- conflitos que exigem revisão humana ----------
create table public.conflitos_sincronizacao (
  id               uuid primary key default gen_random_uuid(),
  sincronizacao_id uuid references public.sincronizacoes (id) on delete set null,
  provedor         text not null default 'omie',
  tipo             public.tipo_sincronizacao not null,
  entidade_local   text,
  registro_local   uuid,
  identificador    text,
  motivo           text not null,
  dados_externos   jsonb,
  resolvido_em     timestamptz,
  resolvido_por    uuid references public.usuarios (id) on delete set null,
  decisao          text,
  created_at       timestamptz not null default now()
);
create index conflitos_pendentes_ix on public.conflitos_sincronizacao (resolvido_em, created_at desc);

alter table public.conflitos_sincronizacao enable row level security;
create policy conflitos_ler on public.conflitos_sincronizacao for select to authenticated
  using (public.tem_permissao('integracoes', 'visualizar'));
create policy conflitos_resolver on public.conflitos_sincronizacao for update to authenticated
  using (public.tem_permissao('integracoes', 'sincronizar'))
  with check (public.tem_permissao('integracoes', 'sincronizar'));

-- ---------- estado visível da integração (sem segredos) ----------
create or replace function public.integracao_estado(p_provedor text default 'omie')
returns table (
  provedor          text,
  ambiente          text,
  ativa             boolean,
  status            public.status_integracao,
  ultima_conexao_em timestamptz,
  ultimo_erro       text,
  tem_credenciais   boolean,
  app_key_mascarada text,
  atualizada_em     timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    i.provedor,
    i.ambiente,
    i.ativa,
    i.status,
    i.ultima_conexao_em,
    i.ultimo_erro,
    (i.app_key is not null and i.app_secret is not null) as tem_credenciais,
    case
      when i.app_key is null then null
      when length(i.app_key) <= 4 then repeat('•', length(i.app_key))
      else repeat('•', greatest(length(i.app_key) - 4, 0)) || right(i.app_key, 4)
    end as app_key_mascarada,
    i.updated_at
  from public.integracoes i
  where i.provedor = p_provedor
    and public.tem_permissao('integracoes', 'visualizar');
$$;
revoke execute on function public.integracao_estado(text) from public, anon;
grant execute on function public.integracao_estado(text) to authenticated;;
