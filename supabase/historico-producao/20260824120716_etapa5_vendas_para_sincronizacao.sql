-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824120716.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Vendas: base usada pela sincronização da Omie e pelo módulo Comercial.
create table public.vendas (
  id               uuid primary key default gen_random_uuid(),
  numero           text not null,
  cliente_id       uuid references public.clientes (id) on delete set null,
  vendedor_id      uuid references public.vendedores (id) on delete set null,
  data_venda       date not null default current_date,
  valor_total      numeric(14, 2) not null default 0,
  etapa            text,
  observacoes      text,
  origem           public.origem_registro not null default 'omie',
  omie_id          text,
  omie_cliente_id  text,
  sincronizado_em  timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index vendas_omie_uk on public.vendas (omie_id) where omie_id is not null;
create index vendas_data_ix on public.vendas (data_venda desc);
create index vendas_cliente_ix on public.vendas (cliente_id);
create trigger vendas_updated_at before update on public.vendas
  for each row execute function public.tg_set_updated_at();

create table public.venda_itens (
  id           uuid primary key default gen_random_uuid(),
  venda_id     uuid not null references public.vendas (id) on delete cascade,
  produto_id   uuid references public.produtos (id) on delete set null,
  descricao    text not null,
  quantidade   numeric(14, 3) not null default 1,
  valor_unitario numeric(14, 2) not null default 0,
  valor_total  numeric(14, 2) not null default 0,
  omie_produto_id text
);
create index venda_itens_venda_ix on public.venda_itens (venda_id);
create index venda_itens_produto_ix on public.venda_itens (produto_id);

alter table public.vendas enable row level security;
create policy vendas_ler on public.vendas for select to authenticated
  using (public.tem_permissao('estoque_vendas', 'visualizar'));
create policy vendas_escrever on public.vendas for all to authenticated
  using (public.tem_permissao('estoque_vendas', 'editar'))
  with check (public.tem_permissao('estoque_vendas', 'editar'));

alter table public.venda_itens enable row level security;
create policy venda_itens_ler on public.venda_itens for select to authenticated
  using (public.tem_permissao('estoque_vendas', 'visualizar'));
create policy venda_itens_escrever on public.venda_itens for all to authenticated
  using (public.tem_permissao('estoque_vendas', 'editar'))
  with check (public.tem_permissao('estoque_vendas', 'editar'));

-- Vincula vendas importadas ao cliente local quando o id da Omie já existe.
create or replace function public.tg_venda_vincular_cliente()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.cliente_id is null and new.omie_cliente_id is not null then
    select c.id into new.cliente_id from public.clientes c where c.omie_id = new.omie_cliente_id;
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_venda_vincular_cliente() from public, anon, authenticated;

create trigger vendas_vincular_cliente
  before insert or update of omie_cliente_id on public.vendas
  for each row execute function public.tg_venda_vincular_cliente();;
