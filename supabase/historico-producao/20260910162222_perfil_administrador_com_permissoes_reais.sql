-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260910162222.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Dois problemas somados deixavam a conta de gestão sem enxergar nada.
--
-- 1. O perfil "Administrador" existia mas tinha ZERO permissões. Quem o
--    recebia não via nada. As outras contas administrativas funcionavam por
--    acaso: elas têm is_admin = true, que ignora o perfil por completo. Ou
--    seja, o perfil nunca tinha sido exercitado de verdade.
-- 2. A conta sistemas@tecnoarfreios.com.br foi criada sem is_admin (a função
--    de criação nunca concede esse privilégio, de propósito), então caiu no
--    perfil vazio e ficou sem nada.

-- Preenche o perfil Administrador com todas as ações de todos os recursos.
-- Assim ele passa a significar o que o nome diz, mesmo para quem não tem a
-- flag is_admin.
insert into public.perfil_permissoes (perfil_id, recurso, acao)
select p.id, r.chave, a.acao
from public.perfis_acesso p
cross join public.recursos r
cross join (
  select unnest(enum_range(null::public.acao_permissao)) as acao
) a
where p.nome = 'Administrador'
on conflict do nothing;

-- Promove a conta de gestão. Ato deliberado, feito aqui e não pela função de
-- criação de contas: lá, aceitar is_admin vindo da requisição permitiria que
-- qualquer um com permissão de criar usuário se promovesse por JSON.
update public.usuarios
set is_admin = true
where email = 'sistemas@tecnoarfreios.com.br';;
