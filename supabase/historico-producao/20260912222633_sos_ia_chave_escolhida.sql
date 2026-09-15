-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260912222633.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- IA do SOS: vale a origem da chave escolhida na tela. Com "usar a chave da
-- Tecnoar IA" marcado, usa a de lá mesmo que exista uma chave própria salva
-- (antes a própria tinha preferência e a escolha na tela não valia).

create or replace function public.sos_ia_publico()
returns jsonb
language sql
stable
security definer
set search_path = public, privado, pg_temp
as $$
  select jsonb_build_object(
    'ativa', c.ia_ativa and case
      when c.ia_usar_chave_tecnoar_ia then exists (select 1 from public.integracoes i where i.provedor = c.ia_provedor and i.app_key is not null)
      else exists (select 1 from privado.config where chave = 'sos_ia_apikey') end,
    'atendimento', c.ia_atendimento, 'foto', c.ia_foto, 'kit', c.ia_kit, 'resumo', c.ia_resumo)
  from public.sos_config c where c.singleton
$$;

-- Só para a função `sos-ia` (chave de serviço): provedor, modelo e chave.
create or replace function public.sos_ia_credencial()
returns jsonb
language sql
stable
security definer
set search_path = public, privado, pg_temp
as $$
  select jsonb_build_object(
    'ativa', c.ia_ativa, 'provedor', c.ia_provedor,
    -- O modelo é escolhido na tela (ao reaproveitar a chave da Tecnoar IA, a
    -- tela já traz o modelo de lá).
    'modelo', coalesce(nullif(c.ia_modelo, ''), (select ambiente from public.integracoes where provedor = c.ia_provedor)),
    'chave', case
      when c.ia_usar_chave_tecnoar_ia then (select app_key from public.integracoes where provedor = c.ia_provedor)
      else (select valor from privado.config where chave = 'sos_ia_apikey') end,
    'instrucoes', c.ia_instrucoes,
    'atendimento', c.ia_atendimento, 'foto', c.ia_foto, 'kit', c.ia_kit, 'resumo', c.ia_resumo,
    'limite_cliente_dia', c.ia_limite_cliente_dia,
    'telefone_central', coalesce(c.telefone_central, (select coalesce(suporte_telefone, celular, telefone) from public.dados_empresa where singleton)))
  from public.sos_config c where c.singleton
$$;

revoke execute on function public.sos_ia_credencial() from public, anon, authenticated;
grant execute on function public.sos_ia_credencial() to service_role;
revoke execute on function public.sos_ia_publico() from public, anon;
grant execute on function public.sos_ia_publico() to authenticated, service_role;;
