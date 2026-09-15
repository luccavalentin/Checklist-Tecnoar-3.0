-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260910161602.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Exclusão de registros, centralizada no banco.
--
-- Por que aqui e não em cada tela: a regra precisa valer para qualquer caminho
-- que chegue aos dados. Uma checagem em React protege o botão, não a tabela —
-- quem chamar a API direto passa por cima. Aqui não passa.
--
-- Três proteções, nesta ordem:
--   1. Permissão: a ação 'inativar' sobre o recurso da tela, convenção já usada
--      no resto do sistema.
--   2. Origem Omie: cadastro sincronizado do ERP é controlado por lá. Excluir
--      aqui não o remove da Omie — a próxima sincronização o traria de volta,
--      e nesse meio-tempo os dois sistemas discordariam.
--   3. Registro em auditoria ANTES de apagar, com a linha inteira em JSON. Sem
--      isso, "sumiu do sistema" não teria resposta possível.

create table if not exists public.registros_excluiveis (
  tabela   text primary key,
  recurso  text not null references public.recursos(chave),
  rotulo   text not null,
  -- Coluna que dá nome ao registro na confirmação. Ver ninhada de UUIDs não
  -- ajuda ninguém a decidir se aquilo pode ser apagado.
  campo_rotulo text not null default 'nome',
  tem_origem boolean not null default false
);

insert into public.registros_excluiveis (tabela, recurso, rotulo, campo_rotulo, tem_origem) values
  ('clientes',          'clientes',       'cliente',              'nome_razao_social', true),
  ('veiculos',          'veiculos',       'veículo',              'placa',             false),
  ('produtos',          'produtos',       'produto',              'descricao',         true),
  ('servicos',          'servicos',       'serviço',              'descricao',         true),
  ('fornecedores',      'fornecedores',   'fornecedor',           'nome_razao_social', true),
  ('vendedores',        'vendedores',     'vendedor',             'nome',              true),
  ('ordens_servico',    'ordens_servico', 'ordem de serviço',     'numero',            false),
  ('entradas_patio',    'recepcao',       'entrada de pátio',     'id',                false),
  ('checklists',        'checklists',     'checklist',            'id',                false),
  ('checklist_modelos', 'checklists',     'modelo de checklist',  'nome',              false),
  ('garantias',         'garantias',      'garantia',             'id',                false),
  ('retornos',          'garantias',      'retorno',              'id',                false),
  ('pecas_teste',       'pecas_em_teste', 'peça em teste',        'descricao',         false),
  ('vendas',            'estoque_vendas', 'venda',                'id',                true),
  ('faturas',           'indicadores',    'fatura',               'id',                false),
  ('interacoes',        'crm',            'interação',            'id',                false),
  ('follow_ups',        'follow_up',      'follow-up',            'id',                false),
  ('tags',              'tags',           'etiqueta',             'nome',              false),
  ('especialidades',    'especialidades', 'especialidade',        'nome',              false),
  ('funcoes',           'funcoes',        'cargo',                'nome',              false),
  ('status_os',         'status_os',      'status de OS',         'nome',              false)
on conflict (tabela) do nothing;

alter table public.registros_excluiveis enable row level security;

drop policy if exists registros_excluiveis_ler on public.registros_excluiveis;
create policy registros_excluiveis_ler on public.registros_excluiveis
  for select to authenticated using (true);

/* ------------------------------------------------------------ prévia */
create or replace function public.previa_exclusao(p_tabela text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cfg   public.registros_excluiveis%rowtype;
  v_linha jsonb;
  v_arrasta jsonb := '[]'::jsonb;
  v_bloqueio text := null;
  v_qtd bigint;
  v_rel record;
begin
  select * into v_cfg from public.registros_excluiveis where tabela = p_tabela;
  if not found then
    return jsonb_build_object('pode', false, 'motivo', 'Este tipo de registro não pode ser excluído.');
  end if;

  if not public.tem_permissao(v_cfg.recurso, 'inativar') then
    return jsonb_build_object('pode', false, 'motivo', 'Seu perfil não permite excluir ' || v_cfg.rotulo || '.');
  end if;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_tabela)
    into v_linha using p_id;

  if v_linha is null then
    return jsonb_build_object('pode', false, 'motivo', 'Registro não encontrado.');
  end if;

  if v_cfg.tem_origem and v_linha->>'origem' = 'omie' then
    return jsonb_build_object(
      'pode', false,
      'motivo', 'Este ' || v_cfg.rotulo || ' veio da Omie e é controlado por lá. Exclua na Omie e sincronize.'
    );
  end if;

  -- O que o banco impede (RESTRICT) e o que ele arrasta junto (CASCADE).
  -- Contar de verdade, registro a registro: dizer "vai apagar itens" sem número
  -- deixa a decisão tão cega quanto não avisar nada.
  for v_rel in
    select tc.table_name as filha,
           kcu.column_name as coluna,
           rc.delete_rule as regra
    from information_schema.table_constraints tc
    join information_schema.referential_constraints rc on rc.constraint_name = tc.constraint_name
    join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name
    join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and ccu.table_name = p_tabela
      and ccu.column_name = 'id'
      and rc.delete_rule in ('RESTRICT', 'NO ACTION', 'CASCADE')
  loop
    execute format('select count(*) from public.%I where %I = $1', v_rel.filha, v_rel.coluna)
      into v_qtd using p_id;

    if v_qtd > 0 then
      if v_rel.regra = 'CASCADE' then
        v_arrasta := v_arrasta || jsonb_build_object('tabela', v_rel.filha, 'qtd', v_qtd);
      else
        v_bloqueio := coalesce(v_bloqueio || ', ', '') || v_rel.filha || ' (' || v_qtd || ')';
      end if;
    end if;
  end loop;

  if v_bloqueio is not null then
    return jsonb_build_object(
      'pode', false,
      'motivo', 'Não é possível excluir: existem registros que dependem deste — ' || v_bloqueio ||
                '. Exclua ou desvincule esses registros primeiro.'
    );
  end if;

  return jsonb_build_object(
    'pode', true,
    'rotulo', coalesce(v_linha->>v_cfg.campo_rotulo, v_cfg.rotulo),
    'tipo', v_cfg.rotulo,
    'arrasta', v_arrasta
  );
end;
$$;

/* ---------------------------------------------------------- exclusão */
create or replace function public.excluir_registro(p_tabela text, p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cfg    public.registros_excluiveis%rowtype;
  v_previa jsonb;
  v_linha  jsonb;
begin
  -- A prévia já aplica permissão, origem Omie e dependências. Repetir a
  -- verificação aqui seria duplicar regra; chamar a mesma função garante que
  -- o que a tela mostrou é exatamente o que o banco vai cobrar.
  v_previa := public.previa_exclusao(p_tabela, p_id);
  if (v_previa->>'pode')::boolean is not true then
    return jsonb_build_object('ok', false, 'erro', v_previa->>'motivo');
  end if;

  select * into v_cfg from public.registros_excluiveis where tabela = p_tabela;

  execute format('select to_jsonb(t) from public.%I t where t.id = $1', p_tabela)
    into v_linha using p_id;

  -- Auditoria antes de apagar: depois da exclusão não há de onde tirar isto.
  insert into public.auditoria (usuario_id, acao, entidade, entidade_id, dados)
  values (auth.uid(), 'excluir', p_tabela, p_id::text,
          jsonb_build_object('registro', v_linha, 'arrastou', v_previa->'arrasta'));

  execute format('delete from public.%I where id = $1', p_tabela) using p_id;

  return jsonb_build_object('ok', true);
exception
  when foreign_key_violation then
    return jsonb_build_object('ok', false,
      'erro', 'Não é possível excluir: outro registro depende deste.');
end;
$$;

revoke execute on function public.previa_exclusao(text, uuid) from public;
revoke execute on function public.excluir_registro(text, uuid) from public;
grant execute on function public.previa_exclusao(text, uuid) to authenticated, service_role;
grant execute on function public.excluir_registro(text, uuid) to authenticated, service_role;;
