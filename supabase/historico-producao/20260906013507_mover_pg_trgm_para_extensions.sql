-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260906013507.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.


create schema if not exists extensions;
alter extension pg_trgm set schema extensions;;
