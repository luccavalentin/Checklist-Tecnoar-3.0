-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260906013528.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.


DROP FUNCTION public.indicadores_patio();

CREATE FUNCTION public.indicadores_patio()
 RETURNS TABLE(no_patio bigint, entradas_hoje bigint, aguardando_triagem bigint, em_diagnostico bigint, aguardando_aprovacao bigint, aguardando_peca bigint, em_manutencao bigint, checklist_final bigint, aguardando_faturamento bigint, prontos bigint, urgentes bigint, sla_vencido bigint, tempo_medio_segundos numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    (select count(*) from public.vw_patio),
    (select count(*) from public.entradas_patio where entrada_em::date = current_date),
    (select count(*) from public.vw_patio where status_categoria = 'entrada'),
    (select count(*) from public.vw_patio where status_categoria = 'diagnostico'),
    (select count(*) from public.vw_patio where status_categoria = 'aprovacao'),
    (select count(*) from public.vw_patio where status_categoria = 'espera'),
    (select count(*) from public.vw_patio where status_categoria = 'execucao'),
    (select count(*) from public.vw_patio where status_categoria = 'finalizacao' and lower(status_nome) like '%checklist%'),
    (select count(*) from public.vw_patio where status_categoria = 'finalizacao' and lower(status_nome) like '%fatur%'),
    (select count(*) from public.vw_patio where status_categoria = 'concluido'),
    (select count(*) from public.vw_patio where prioridade > 0),
    (select count(*) from public.vw_patio where sla_vencido),
    (select avg(segundos_na_oficina) from public.vw_patio)
  where public.tem_permissao('patio', 'visualizar');
$function$;;
