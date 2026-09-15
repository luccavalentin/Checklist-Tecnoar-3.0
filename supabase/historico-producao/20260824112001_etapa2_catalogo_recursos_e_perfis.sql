-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824112001.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ============================================================
-- Catálogo de recursos protegidos (configuração do sistema)
-- ============================================================
insert into public.recursos (chave, nome, grupo, acoes, ordem) values
  ('clientes',          'Clientes',              'Cadastros',      '{visualizar,criar,editar,inativar,exportar}',                       10),
  ('fornecedores',      'Fornecedores',          'Cadastros',      '{visualizar,criar,editar,inativar,exportar}',                       20),
  ('vendedores',        'Vendedores',            'Cadastros',      '{visualizar,criar,editar,inativar,exportar}',                       30),
  ('usuarios',          'Usuários',              'Cadastros',      '{visualizar,criar,editar,inativar,exportar}',                       40),
  ('veiculos',          'Veículos',              'Cadastros',      '{visualizar,criar,editar,inativar,exportar}',                       50),
  ('produtos',          'Produtos',              'Cadastros',      '{visualizar,criar,editar,inativar,exportar,sincronizar}',           60),
  ('servicos',          'Serviços',              'Cadastros',      '{visualizar,criar,editar,inativar,exportar,sincronizar}',           70),
  ('especialidades',    'Especialidades',        'Cadastros',      '{visualizar,criar,editar,inativar}',                                80),
  ('funcoes',           'Funções e cargos',      'Cadastros',      '{visualizar,criar,editar,inativar}',                                90),
  ('status_os',         'Status da OS',          'Cadastros',      '{visualizar,criar,editar,inativar,configurar}',                    100),
  ('tags',              'Tags',                  'Cadastros',      '{visualizar,criar,editar,inativar}',                               110),

  ('recepcao',          'Recepção',              'Operação',       '{visualizar,criar,editar,cancelar}',                               200),
  ('ordens_servico',    'Ordens de Serviço',     'Operação',       '{visualizar,criar,editar,aprovar,cancelar,exportar}',              210),
  ('patio',             'Painel do Pátio',       'Operação',       '{visualizar,editar,configurar}',                                   220),
  ('minha_operacao',    'Minha Operação',        'Operação',       '{visualizar,editar}',                                              230),
  ('checklists',        'Checklists',            'Operação',       '{visualizar,criar,editar,aprovar,inativar,configurar,exportar}',   240),
  ('pecas_em_teste',    'Peças em Teste',        'Operação',       '{visualizar,criar,editar,aprovar,cancelar,exportar,configurar}',   250),
  ('garantias',         'Garantias e Retornos',  'Operação',       '{visualizar,criar,editar,aprovar,cancelar,exportar}',              260),

  ('crm',               'CRM',                   'Relacionamento', '{visualizar,criar,editar,exportar}',                               300),
  ('follow_up',         'Follow-up',             'Relacionamento', '{visualizar,criar,editar,cancelar}',                               310),

  ('estoque_vendas',    'Estoque e Vendas',      'Comercial',      '{visualizar,editar,exportar,sincronizar}',                         400),

  ('indicadores',       'Indicadores',           'Gestão',         '{visualizar,exportar}',                                            500),
  ('performance',       'Performance',           'Gestão',         '{visualizar,editar,configurar,exportar}',                          510),
  ('checklist_5s',      'Checklist Diário / 5S', 'Gestão',         '{visualizar,criar,editar,aprovar,configurar,exportar}',            520),

  ('tecnoar_ia',        'Tecnoar IA',            'Inteligência',   '{visualizar,criar,configurar}',                                    600),
  ('base_tecnica',      'Base Técnica',          'Inteligência',   '{visualizar,criar,editar,aprovar,inativar,exportar}',              610),
  ('ebooks',            'E-books',               'Inteligência',   '{visualizar,criar,editar,exportar}',                               620),

  ('integracoes',       'Integrações',           'Sistema',        '{visualizar,configurar,sincronizar}',                              700),
  ('perfis_permissoes', 'Perfis e Permissões',   'Sistema',        '{visualizar,criar,editar,inativar,configurar}',                    710),
  ('dados_empresa',     'Dados da Empresa',      'Sistema',        '{visualizar,editar}',                                              720),
  ('auditoria',         'Auditoria',             'Sistema',        '{visualizar,exportar}',                                            730);

-- ============================================================
-- Perfis de acesso iniciais (configuração editável, não dado operacional)
-- ============================================================
insert into public.perfis_acesso (nome, descricao) values
  ('Operação Mecânica', 'Executa serviços, checklists e diagnósticos. Não altera cadastros nem valores.'),
  ('Recepção',          'Recebe veículos, abre OS e atende clientes.'),
  ('Gestão',            'Acompanha indicadores, aprova e configura a operação.')
on conflict do nothing;

-- Operação Mecânica
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, x.recurso, x.acao::public.acao_permissao
from public.perfis_acesso p
cross join (values
  ('clientes','visualizar'), ('veiculos','visualizar'), ('produtos','visualizar'), ('servicos','visualizar'),
  ('status_os','visualizar'), ('tags','visualizar'), ('especialidades','visualizar'),
  ('ordens_servico','visualizar'), ('ordens_servico','editar'),
  ('patio','visualizar'),
  ('minha_operacao','visualizar'), ('minha_operacao','editar'),
  ('checklists','visualizar'), ('checklists','criar'), ('checklists','editar'),
  ('pecas_em_teste','visualizar'), ('pecas_em_teste','criar'), ('pecas_em_teste','editar'),
  ('garantias','visualizar'), ('garantias','criar'),
  ('checklist_5s','visualizar'), ('checklist_5s','criar'), ('checklist_5s','editar'),
  ('tecnoar_ia','visualizar'), ('tecnoar_ia','criar'),
  ('base_tecnica','visualizar'), ('ebooks','visualizar')
) as x(recurso, acao)
where p.nome = 'Operação Mecânica'
on conflict do nothing;

-- Recepção
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, x.recurso, x.acao::public.acao_permissao
from public.perfis_acesso p
cross join (values
  ('clientes','visualizar'), ('clientes','criar'), ('clientes','editar'),
  ('veiculos','visualizar'), ('veiculos','criar'), ('veiculos','editar'),
  ('produtos','visualizar'), ('servicos','visualizar'), ('status_os','visualizar'), ('tags','visualizar'),
  ('especialidades','visualizar'),
  ('recepcao','visualizar'), ('recepcao','criar'), ('recepcao','editar'),
  ('ordens_servico','visualizar'), ('ordens_servico','criar'), ('ordens_servico','editar'), ('ordens_servico','exportar'),
  ('patio','visualizar'),
  ('checklists','visualizar'),
  ('pecas_em_teste','visualizar'), ('pecas_em_teste','criar'),
  ('garantias','visualizar'), ('garantias','criar'),
  ('crm','visualizar'), ('crm','criar'), ('crm','editar'),
  ('follow_up','visualizar'), ('follow_up','criar'), ('follow_up','editar'),
  ('estoque_vendas','visualizar'),
  ('base_tecnica','visualizar'), ('ebooks','visualizar')
) as x(recurso, acao)
where p.nome = 'Recepção'
on conflict do nothing;

-- Gestão — tudo, menos configurar perfis e permissões
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, r.chave, a
from public.perfis_acesso p
cross join public.recursos r
cross join lateral unnest(r.acoes) a
where p.nome = 'Gestão'
  and not (r.chave = 'perfis_permissoes' and a in ('criar','editar','inativar','configurar'))
on conflict do nothing;

-- ============================================================
-- Funções e cargos iniciais (editáveis pelo administrador)
-- ============================================================
insert into public.funcoes (nome, descricao, atua_como_mecanico, atua_no_laboratorio, is_system) values
  ('Administrador',           'Responsável pela configuração do sistema.',                     false, false, true),
  ('Gestor',                  'Acompanha e aprova a operação.',                                false, false, false),
  ('Recepção',                'Atendimento, recepção de veículos e abertura de OS.',           false, false, false),
  ('Mecânico',                'Executa diagnóstico e manutenção nos veículos.',                true,  false, false),
  ('Mecânico de Laboratório', 'Executa testes e reparos de peças no laboratório.',             true,  true,  false),
  ('Administrativo',          'Rotinas administrativas internas.',                             false, false, false),
  ('Financeiro',              'Faturamento e controle financeiro.',                            false, false, false),
  ('Vendedor',                'Vendas de peças e serviços.',                                   false, false, false)
on conflict do nothing;

-- ============================================================
-- Provisionamento: primeiro usuário recebe função de sistema
-- ============================================================
create or replace function public.tg_provisionar_usuario()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_primeiro   boolean;
  v_perfil_id  uuid;
  v_funcao_id  uuid;
begin
  select not exists (select 1 from public.usuarios) into v_primeiro;

  if v_primeiro then
    select id into v_perfil_id from public.perfis_acesso where is_system and lower(nome) = 'administrador';
    select id into v_funcao_id from public.funcoes       where is_system and lower(nome) = 'administrador';
  end if;

  insert into public.usuarios (id, nome_completo, email, telefone, situacao, is_admin, perfil_id, funcao_id)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nome_completo'), ''), split_part(new.email, '@', 1)),
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'telefone'), ''),
    case when v_primeiro then 'ativo'::public.situacao_usuario else 'pendente'::public.situacao_usuario end,
    v_primeiro,
    v_perfil_id,
    v_funcao_id
  )
  on conflict (id) do nothing;

  return new;
end;
$$;
revoke execute on function public.tg_provisionar_usuario() from public, anon, authenticated;

-- A coluna textual de função sai de cena: a fonte passa a ser funcoes.
alter table public.usuarios drop column funcao;;
