-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260827105842.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Produtor rural sai do sistema: não é usado na operação da Tecnoar.
-- Nenhum dos 1.926 cadastros tinha o campo marcado, então a coluna sai
-- inteira em vez de ficar escondida na tela e viva no banco.
alter table clientes drop column if exists produtor_rural;
alter table fornecedores drop column if exists produtor_rural;;
