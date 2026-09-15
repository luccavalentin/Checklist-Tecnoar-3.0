-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260909165605.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.

-- Nestas três políticas, auth.uid(), usuario_atual_ativo() e tem_permissao()
-- eram reavaliadas UMA VEZ POR LINHA inserida. O resultado não varia entre as
-- linhas de um mesmo INSERT — depende só da sessão — então é trabalho repetido.
--
-- Envolver a chamada em (select ...) faz o Postgres resolvê-la uma única vez,
-- como InitPlan, e reutilizar o valor. A semântica não muda; todas as funções
-- envolvidas são STABLE.
--
-- Onde isso pesa: a recepção grava várias evidências de uma vez (as fotos do
-- veículo chegando). Com N fotos eram N avaliações; agora é uma.

alter policy auditoria_inserir on public.auditoria
  with check (usuario_id = (select auth.uid()));

alter policy evidencias_criar on public.evidencias
  with check (
    (select public.usuario_atual_ativo())
    and criado_por = (select auth.uid())
  );

alter policy ia_conversas_criar on public.ia_conversas
  with check (
    (select public.tem_permissao('tecnoar_ia', 'criar'::public.acao_permissao))
    and usuario_id = (select auth.uid())
  );;
