-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260824221439.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- ETAPA 15 — Segurança: ninguém sem sessão executa função do schema público.

/* Os dois gatilhos ficaram sem search_path fixo. Um search_path mutável deixa
   a função vulnerável a ser resolvida contra um schema plantado pelo chamador. */
alter function tg_peca_prazo() set search_path = public, pg_temp;
alter function tg_peca_entrega() set search_path = public, pg_temp;

/**
 * Retira o EXECUTE de PUBLIC e de `anon` em tudo que vive no schema público e
 * devolve apenas para quem precisa.
 *
 * Sem isso, qualquer visitante sem sessão consegue chamar as RPC pela API REST.
 * As funções checam permissão por dentro e devolveriam vazio, mas a superfície
 * exposta não precisa existir. Funções de gatilho não são chamadas por
 * ninguém diretamente — rodam no contexto do dono da tabela — então ficam sem
 * nenhum GRANT.
 */
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura,
           p.prorettype = 'trigger'::regtype as eh_gatilho
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon', f.assinatura);
    execute format('grant execute on function %s to service_role', f.assinatura);
    if not f.eh_gatilho then
      -- `authenticated` precisa manter o EXECUTE: as políticas de RLS chamam
      -- tem_permissao/usuario_atual_* no contexto do próprio usuário.
      execute format('grant execute on function %s to authenticated', f.assinatura);
    end if;
  end loop;
end;
$$;;
