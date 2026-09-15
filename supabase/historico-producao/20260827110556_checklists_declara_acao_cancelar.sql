-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260827110556.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- O catálogo de recursos é a fonte das permissões do administrador
-- (`minhas_permissoes` monta a lista a partir de `recursos.acoes`). Sem
-- declarar `cancelar` aqui, nem o admin recebia a ação e o botão de remover
-- checklist nunca aparecia.
update recursos
   set acoes = acoes || array['cancelar']::acao_permissao[]
 where chave = 'checklists'
   and not ('cancelar' = any (acoes));

select chave, acoes::text from recursos where chave = 'checklists';
