-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260906064521.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.


-- Estes conflitos diziam "produto ainda não existe" antes do fallback de
-- ConsultarProduto entrar na sincronização de estoque. O produto já existe
-- localmente agora (criado neste ou em sync anterior); a próxima sincronização
-- de estoque atualiza o saldo normalmente. Marca como resolvido para a fila
-- de revisão manual não mostrar pendência que já não existe.
update conflitos_sincronizacao c
set resolvido_em = now(),
    decisao = 'Resolvido automaticamente: produto já existe no Tecnoar (criado via ConsultarProduto na sincronização de estoque).'
where c.resolvido_em is null
  and c.entidade_local = 'produtos'
  and c.motivo like '%ainda não existe%'
  and exists (select 1 from produtos p where p.omie_id = c.identificador);;
