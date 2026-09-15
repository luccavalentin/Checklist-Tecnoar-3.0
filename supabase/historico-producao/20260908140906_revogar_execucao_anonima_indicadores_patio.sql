-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260908140906.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- indicadores_patio() é SECURITY DEFINER e estava exposta ao papel anônimo
-- via /rest/v1/rpc. Ela já se protege internamente com tem_permissao(), então
-- não havia vazamento — mas essa proteção é uma linha de SQL dentro do corpo
-- da função: qualquer reescrita futura que a remova viraria um vazamento
-- silencioso, sem login. Revogar o EXECUTE tira a função do alcance de quem
-- não está autenticado, independentemente do que o corpo dela faça.
revoke execute on function public.indicadores_patio() from anon;;
