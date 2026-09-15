-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260910161637.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Quatro tabelas nomeiam o registro por colunas diferentes das que eu supus.
-- Rótulo errado faria a confirmação mostrar vazio, e confirmar exclusão sem
-- ver o que se exclui é pior do que não ter o botão.
update public.registros_excluiveis set campo_rotulo = 'nome_razao' where tabela = 'clientes';
update public.registros_excluiveis set campo_rotulo = 'descricao'  where tabela = 'fornecedores';
update public.registros_excluiveis set campo_rotulo = 'descricao'  where tabela = 'vendedores';
update public.registros_excluiveis set campo_rotulo = 'descricao'  where tabela = 'checklist_modelos';;
