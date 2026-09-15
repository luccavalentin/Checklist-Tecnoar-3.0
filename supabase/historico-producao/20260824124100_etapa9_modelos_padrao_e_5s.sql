-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824124100.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ============================================================
-- ETAPA 9 — Modelos padrão Tecnoar + não conformidades do 5S
-- ============================================================

create type public.status_acao as enum ('aberta', 'em_andamento', 'concluida', 'cancelada');
create type public.prioridade_acao as enum ('baixa', 'media', 'alta', 'critica');

-- Ações corretivas: nascem de uma não conformidade e seguem até a conclusão.
create table public.acoes_corretivas (
  id             uuid primary key default gen_random_uuid(),
  numero         bigint generated always as identity,
  checklist_id   uuid references public.checklists (id) on delete set null,
  resposta_id    uuid references public.checklist_respostas (id) on delete set null,
  origem         text not null default '5s',
  setor          text,
  problema       text not null,
  acao           text,
  responsavel_id uuid references public.usuarios (id) on delete set null,
  prioridade     public.prioridade_acao not null default 'media',
  prazo          date,
  status         public.status_acao not null default 'aberta',
  conclusao      text,
  concluida_em   timestamptz,
  concluida_por  uuid references public.usuarios (id) on delete set null,
  criada_por     uuid references public.usuarios (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index acoes_status_ix on public.acoes_corretivas (status, prazo);
create index acoes_responsavel_ix on public.acoes_corretivas (responsavel_id, status);
create index acoes_checklist_ix on public.acoes_corretivas (checklist_id);
create trigger acoes_updated_at before update on public.acoes_corretivas
  for each row execute function public.tg_set_updated_at();

alter table public.acoes_corretivas enable row level security;
create policy acoes_ler on public.acoes_corretivas for select to authenticated
  using (public.tem_permissao('checklist_5s', 'visualizar') or public.tem_permissao('checklists', 'visualizar'));
create policy acoes_escrever on public.acoes_corretivas for all to authenticated
  using (public.tem_permissao('checklist_5s', 'editar') or public.tem_permissao('checklist_5s', 'criar'))
  with check (public.tem_permissao('checklist_5s', 'editar') or public.tem_permissao('checklist_5s', 'criar'));

-- ============================================================
-- Modelos padrão Tecnoar (configuração inicial, editável)
-- ============================================================
do $$
declare
  v_tecnico uuid;
  v_final   uuid;
  v_abert   uuid;
  v_fecha   uuid;
  v_ordem   integer;

  procedure_itens text[];
begin
  -- ---------------- Checklist técnico do caminhão ----------------
  insert into public.checklist_modelos (descricao, tipo)
  values ('Checklist técnico — freio a ar (cavalo e carreta)', 'tecnico_inicial')
  returning id into v_tecnico;

  v_ordem := 0;

  -- Passos iniciais
  for procedure_itens in select array[t] from unnest(array[
    'Verificar se o ar está carregado',
    'Abaixar o eixo'
  ]) as t loop
    v_ordem := v_ordem + 1;
    insert into public.checklist_modelo_itens (modelo_id, versao, secao, ordem, texto, tipo_resposta)
    values (v_tecnico, 1, 'Passos iniciais', v_ordem, procedure_itens[1], 'estado');
  end loop;

  -- Cavalo
  for procedure_itens in select array[t] from unnest(array[
    'Válvula APU e filtro APU',
    'Válvula circuito protetora',
    'Válvula distribuidora',
    'Válvula relé',
    'Válvula freio de mão e reboque',
    'Válvula do pedal',
    'Servo de embreagem (ar e óleo)',
    'Transferência ou redutor do câmbio',
    'Válvula do freio motor',
    'Mangueiras e conexões com água e sabão'
  ]) as t loop
    v_ordem := v_ordem + 1;
    insert into public.checklist_modelo_itens (modelo_id, versao, secao, ordem, texto, tipo_resposta)
    values (v_tecnico, 1, 'Cavalo', v_ordem, procedure_itens[1], 'estado');
  end loop;

  for procedure_itens in select array[t] from unnest(array[
    'Calçar o veículo e soltar o freio de mão',
    'Pisar no freio e verificar cuícas e vazamentos'
  ]) as t loop
    v_ordem := v_ordem + 1;
    insert into public.checklist_modelo_itens (modelo_id, versao, secao, ordem, texto, tipo_resposta)
    values (v_tecnico, 1, 'Cavalo — teste com freio', v_ordem, procedure_itens[1], 'estado');
  end loop;

  -- Carreta
  for procedure_itens in select array[t] from unnest(array[
    'Válvulas push-pull',
    'Cuícas',
    'Sistema do botão',
    'Mangueiras, flexíveis e conexões'
  ]) as t loop
    v_ordem := v_ordem + 1;
    insert into public.checklist_modelo_itens (modelo_id, versao, secao, ordem, texto, tipo_resposta)
    values (v_tecnico, 1, 'Carreta', v_ordem, procedure_itens[1], 'estado');
  end loop;

  -- Erguer o eixo
  for procedure_itens in select array[t] from unnest(array[
    'Bolsas dos suspensores',
    'Possíveis retornos de cuícas'
  ]) as t loop
    v_ordem := v_ordem + 1;
    insert into public.checklist_modelo_itens (modelo_id, versao, secao, ordem, texto, tipo_resposta)
    values (v_tecnico, 1, 'Erguer o eixo', v_ordem, procedure_itens[1], 'estado');
  end loop;

  -- ---------------- Checklist final da OS ----------------
  insert into public.checklist_modelos (descricao, tipo)
  values ('Checklist final da OS — liberação do veículo', 'final_os')
  returning id into v_final;

  v_ordem := 0;
  for procedure_itens in select array[t] from unnest(array[
    'Reparo executado conforme o diagnóstico',
    'Montagem concluída e componentes fixados',
    'Ausência de vazamentos após o reparo',
    'Acionamento do sistema conferido',
    'Funcionamento verificado com o motor ligado',
    'Teste final de frenagem realizado',
    'Itens de segurança conferidos',
    'Evidências finais registradas',
    'Área de trabalho limpa e ferramentas recolhidas'
  ]) as t loop
    v_ordem := v_ordem + 1;
    insert into public.checklist_modelo_itens (modelo_id, versao, secao, ordem, texto, tipo_resposta, exige_evidencia)
    values (v_final, 1, 'Conferência final', v_ordem, procedure_itens[1], 'estado', v_ordem = 8);
  end loop;

  -- ---------------- 5S abertura ----------------
  insert into public.checklist_modelos (descricao, tipo)
  values ('Checklist diário 5S — abertura', 'diario_abertura')
  returning id into v_abert;

  v_ordem := 0;
  for procedure_itens in select array[secao, t] from (values
    ('1S — Utilização', 'Somente o necessário está no posto de trabalho'),
    ('1S — Utilização', 'Materiais sem uso foram retirados da área'),
    ('1S — Utilização', 'Peças aguardando descarte estão identificadas'),
    ('2S — Organização', 'Cada ferramenta está no seu lugar definido'),
    ('2S — Organização', 'Peças e insumos estão identificados'),
    ('2S — Organização', 'Corredores e saídas estão desobstruídos'),
    ('3S — Limpeza', 'Piso limpo e sem óleo ou graxa'),
    ('3S — Limpeza', 'Bancadas e equipamentos limpos'),
    ('3S — Limpeza', 'Resíduos descartados corretamente'),
    ('4S — Padronização', 'Rotina de abertura seguida conforme o padrão'),
    ('4S — Padronização', 'Sinalização e identificações legíveis'),
    ('4S — Padronização', 'EPIs disponíveis e em condição de uso'),
    ('5S — Disciplina', 'Equipe cumpriu o padrão definido'),
    ('5S — Disciplina', 'Pendências do dia anterior foram tratadas'),
    ('Liberação', 'Oficina liberada para operação'),
    ('Liberação', 'Postos de trabalho preparados'),
    ('Liberação', 'Equipamentos e ferramentas disponíveis')
  ) as x(secao, t) loop
    v_ordem := v_ordem + 1;
    insert into public.checklist_modelo_itens (modelo_id, versao, secao, ordem, texto, tipo_resposta)
    values (v_abert, 1, procedure_itens[1], v_ordem, procedure_itens[2], 'conformidade');
  end loop;

  -- ---------------- 5S fechamento ----------------
  insert into public.checklist_modelos (descricao, tipo)
  values ('Checklist diário 5S — fechamento', 'diario_fechamento')
  returning id into v_fecha;

  v_ordem := 0;
  for procedure_itens in select array[secao, t] from (values
    ('1S — Utilização', 'Nada desnecessário ficou no posto de trabalho'),
    ('2S — Organização', 'Peças e materiais guardados nos lugares definidos'),
    ('3S — Limpeza', 'Piso, bancadas e equipamentos limpos'),
    ('4S — Padronização', 'Rotina de fechamento seguida conforme o padrão'),
    ('5S — Disciplina', 'Pendências do dia registradas'),
    ('Encerramento', 'Ferramentas guardadas'),
    ('Encerramento', 'Caixas de ferramentas conferidas'),
    ('Encerramento', 'Equipamentos desligados'),
    ('Encerramento', 'Luzes conferidas'),
    ('Encerramento', 'Portas e portões fechados'),
    ('Encerramento', 'Nenhum ponto de água aberto')
  ) as x(secao, t) loop
    v_ordem := v_ordem + 1;
    insert into public.checklist_modelo_itens (modelo_id, versao, secao, ordem, texto, tipo_resposta)
    values (v_fecha, 1, procedure_itens[1], v_ordem, procedure_itens[2], 'conformidade');
  end loop;
end $$;;
