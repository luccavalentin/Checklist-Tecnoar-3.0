-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260901134359.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Funções de gatilho não são API. O PostgREST publica tudo que está em
-- `public` com EXECUTE concedido, então estas apareciam como /rest/v1/rpc/…
-- para o navegador. O gatilho continua rodando normalmente: quem o dispara é
-- o Postgres, não o papel da requisição.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public' and t.typname = 'trigger'
  loop
    execute format('revoke execute on function %s from anon, authenticated', f.assinatura);
  end loop;
end $$;;
