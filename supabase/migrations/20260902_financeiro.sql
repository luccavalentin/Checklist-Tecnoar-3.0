-- ===========================================================================
-- Módulo financeiro — o que falta no banco
-- ===========================================================================
--
-- O módulo já entregue roda sobre o que existia: `faturas` e `fatura_parcelas`
-- dão contas a receber, faturamento e recebimentos. Falta o outro lado — o que
-- sai — e a categorização que transforma os dois num resultado.
--
-- Esta migração NÃO foi aplicada: a conexão administrativa com o Supabase
-- perdeu permissão durante a sessão. Aplique com:
--
--   supabase db push          (ou cole no SQL Editor do painel)
--
-- Depois de aplicar, regere `src/tipos/supabase.ts` e troque, em
-- `src/layout/navegacao.ts`, o `recurso: 'indicadores'` do item Financeiro por
-- `recurso: 'financeiro'`.

-- --------------------------------------------------------------- categorias
-- Sem categoria, "saiu R$ 4.200" não vira informação. Com ela, vira
-- "R$ 4.200 em peças" e o resultado do mês passa a ter leitura.
create table if not exists public.categorias_financeiras (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  tipo        text not null check (tipo in ('receita', 'despesa')),
  descricao   text,
  situacao    situacao_registro not null default 'ativo',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (nome, tipo)
);

comment on table public.categorias_financeiras is
  'Plano de contas simples: para onde o dinheiro vai ou de onde vem.';

-- ------------------------------------------------------------ contas a pagar
create table if not exists public.contas_pagar (
  id             uuid primary key default gen_random_uuid(),
  descricao      text not null,
  fornecedor_id  uuid references public.fornecedores (id) on delete set null,
  categoria_id   uuid references public.categorias_financeiras (id) on delete set null,
  documento      text,
  emissao        date not null default current_date,
  vencimento     date not null,
  valor          numeric(14,2) not null check (valor > 0),
  -- Pagamento parcial acontece: o saldo é `valor - valor_pago`, não um booleano.
  valor_pago     numeric(14,2) not null default 0 check (valor_pago >= 0),
  pago_em        date,
  forma_pagamento forma_pagamento,
  observacao     text,
  situacao       situacao_registro not null default 'ativo',
  criado_por     uuid references public.usuarios (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists contas_pagar_vencimento_idx
  on public.contas_pagar (vencimento) where pago_em is null;
create index if not exists contas_pagar_fornecedor_idx
  on public.contas_pagar (fornecedor_id);

comment on table public.contas_pagar is
  'O que a oficina deve. Espelha fatura_parcelas do outro lado do caixa.';

-- ------------------------------------------------------------- movimentações
-- Caixa realizado. Recebimento e pagamento viram linha aqui, e é desta tabela
-- que sai o extrato — não da soma de duas tabelas com regras diferentes.
create table if not exists public.movimentos_financeiros (
  id            uuid primary key default gen_random_uuid(),
  tipo          text not null check (tipo in ('entrada', 'saida')),
  ocorrido_em   date not null default current_date,
  valor         numeric(14,2) not null check (valor > 0),
  categoria_id  uuid references public.categorias_financeiras (id) on delete set null,
  forma_pagamento forma_pagamento,
  descricao     text not null,
  -- Origem opcional: de qual parcela ou conta esta linha nasceu.
  parcela_id    uuid references public.fatura_parcelas (id) on delete set null,
  conta_id      uuid references public.contas_pagar (id) on delete set null,
  os_id         uuid references public.ordens_servico (id) on delete set null,
  registrado_por uuid references public.usuarios (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists movimentos_financeiros_data_idx
  on public.movimentos_financeiros (ocorrido_em desc);

-- ---------------------------------------------------------------------- RLS
alter table public.categorias_financeiras enable row level security;
alter table public.contas_pagar           enable row level security;
alter table public.movimentos_financeiros enable row level security;

do $$
declare t text;
begin
  foreach t in array array['categorias_financeiras', 'contas_pagar', 'movimentos_financeiros'] loop
    execute format($f$
      create policy %I on public.%I for select to authenticated
        using (public.tem_permissao('financeiro', 'visualizar'));
    $f$, t || '_le', t);
    execute format($f$
      create policy %I on public.%I for all to authenticated
        using (public.tem_permissao('financeiro', 'editar'))
        with check (public.tem_permissao('financeiro', 'editar'));
    $f$, t || '_escreve', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- permissões
-- Sem registrar o recurso, o menu não aparece para ninguém.
insert into public.recursos (chave, nome, descricao)
values ('financeiro', 'Financeiro', 'Contas a receber e a pagar, faturamento e relatórios.')
on conflict (chave) do nothing;

-- Concede ao(s) perfil(is) de sistema com poder administrativo.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, 'financeiro', a
from public.perfis_acesso p
cross join unnest(array['visualizar', 'criar', 'editar', 'exportar']::acao_permissao[]) a
where p.is_system
on conflict do nothing;

-- --------------------------------------------------------------- categorias
insert into public.categorias_financeiras (nome, tipo) values
  ('Serviços',            'receita'),
  ('Peças',               'receita'),
  ('Outras receitas',     'receita'),
  ('Compra de peças',     'despesa'),
  ('Folha e encargos',    'despesa'),
  ('Aluguel',             'despesa'),
  ('Energia e água',      'despesa'),
  ('Ferramentas',         'despesa'),
  ('Impostos',            'despesa'),
  ('Outras despesas',     'despesa')
on conflict (nome, tipo) do nothing;
