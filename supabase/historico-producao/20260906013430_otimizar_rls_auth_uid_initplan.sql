-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260906013430.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.


-- Envolve auth.uid() em (select ...) nas policies que o chamavam direto,
-- para o Postgres avaliar uma vez por query em vez de uma vez por linha.

ALTER POLICY evidencias_excluir ON public.evidencias
  USING ((criado_por = (select auth.uid())) OR usuario_atual_admin());

ALTER POLICY ia_conversas_excluir ON public.ia_conversas
  USING ((usuario_id = (select auth.uid())) AND tem_permissao('tecnoar_ia', 'criar'));

ALTER POLICY ia_conversas_ler ON public.ia_conversas
  USING (tem_permissao('tecnoar_ia', 'visualizar') AND ((usuario_id = (select auth.uid())) OR tem_permissao('tecnoar_ia', 'configurar')));

ALTER POLICY ia_conversas_editar ON public.ia_conversas
  USING ((usuario_id = (select auth.uid())) AND tem_permissao('tecnoar_ia', 'criar'))
  WITH CHECK (usuario_id = (select auth.uid()));

ALTER POLICY ia_feedback_gravar ON public.ia_feedback
  USING (usuario_id = (select auth.uid()))
  WITH CHECK ((usuario_id = (select auth.uid())) AND tem_permissao('tecnoar_ia', 'criar'));

ALTER POLICY ia_fontes_ler ON public.ia_fontes
  USING (EXISTS (
    SELECT 1 FROM ia_mensagens m
    JOIN ia_conversas c ON c.id = m.conversa_id
    WHERE m.id = ia_fontes.mensagem_id
      AND (c.usuario_id = (select auth.uid()) OR tem_permissao('tecnoar_ia', 'configurar'))
  ));

ALTER POLICY ia_mensagens_ler ON public.ia_mensagens
  USING (EXISTS (
    SELECT 1 FROM ia_conversas c
    WHERE c.id = ia_mensagens.conversa_id
      AND (c.usuario_id = (select auth.uid()) OR tem_permissao('tecnoar_ia', 'configurar'))
  ));

ALTER POLICY notificacoes_proprias ON public.notificacoes
  USING (usuario_id = (select auth.uid()));

ALTER POLICY notificacoes_atualizar_proprias ON public.notificacoes
  USING (usuario_id = (select auth.uid()))
  WITH CHECK (usuario_id = (select auth.uid()));

ALTER POLICY apontamentos_escrever ON public.os_apontamentos
  USING ((usuario_id = (select auth.uid())) OR tem_permissao('ordens_servico', 'editar'))
  WITH CHECK ((usuario_id = (select auth.uid())) OR tem_permissao('ordens_servico', 'editar'));

ALTER POLICY up_ler ON public.usuario_permissoes
  USING ((usuario_id = (select auth.uid())) OR tem_permissao('perfis_permissoes', 'visualizar'));

ALTER POLICY usuarios_ler_proprio ON public.usuarios
  USING (id = (select auth.uid()));

ALTER POLICY usuarios_atualizar_proprio ON public.usuarios
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));;
