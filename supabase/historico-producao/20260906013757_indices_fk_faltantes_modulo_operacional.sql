-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260906013757.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.


-- Índices para FKs sem cobertura nas tabelas mais quentes do sistema
-- (OS, checklist, garantias, pátio, CRM). Reduz custo de joins e de
-- verificação de integridade referencial em updates/deletes.

create index if not exists checklist_defeitos_aprovado_por_ix on public.checklist_defeitos (aprovado_por);
create index if not exists checklist_defeitos_produto_ix on public.checklist_defeitos (produto_id);
create index if not exists checklist_defeitos_resposta_ix on public.checklist_defeitos (resposta_id);
create index if not exists checklist_defeitos_servico_ix on public.checklist_defeitos (servico_id);

create index if not exists checklist_respostas_item_ix on public.checklist_respostas (item_id);
create index if not exists checklist_respostas_respondido_por_ix on public.checklist_respostas (respondido_por);

create index if not exists checklists_cliente_ix on public.checklists (cliente_id);
create index if not exists checklists_especialidade_ix on public.checklists (especialidade_id);
create index if not exists checklists_modelo_ix on public.checklists (modelo_id);

create index if not exists conflitos_resolvido_por_ix on public.conflitos_sincronizacao (resolvido_por);
create index if not exists conflitos_sincronizacao_ix on public.conflitos_sincronizacao (sincronizacao_id);

create index if not exists entradas_patio_recebido_por_ix on public.entradas_patio (recebido_por);

create index if not exists estoque_movimentos_os_ix on public.estoque_movimentos (os_id);
create index if not exists estoque_movimentos_usuario_ix on public.estoque_movimentos (usuario_id);
create index if not exists estoque_movimentos_venda_ix on public.estoque_movimentos (venda_id);

create index if not exists eventos_veiculo_registrado_por_ix on public.eventos_veiculo (registrado_por);

create index if not exists follow_ups_concluido_por_ix on public.follow_ups (concluido_por);
create index if not exists follow_ups_criado_por_ix on public.follow_ups (criado_por);
create index if not exists follow_ups_interacao_ix on public.follow_ups (interacao_id);
create index if not exists follow_ups_responsavel_ix on public.follow_ups (responsavel_id);

create index if not exists garantias_criada_por_ix on public.garantias (criada_por);
create index if not exists garantias_os_produto_ix on public.garantias (os_produto_id);
create index if not exists garantias_os_servico_ix on public.garantias (os_servico_id);
create index if not exists garantias_produto_ix on public.garantias (produto_id);
create index if not exists garantias_servico_ix on public.garantias (servico_id);

create index if not exists interacoes_contato_ix on public.interacoes (contato_id);
create index if not exists interacoes_os_ix on public.interacoes (os_id);
create index if not exists interacoes_responsavel_ix on public.interacoes (responsavel_id);

create index if not exists os_aberta_por_ix on public.ordens_servico (aberta_por);
create index if not exists os_encerrada_por_ix on public.ordens_servico (encerrada_por);
create index if not exists os_entrada_ix on public.ordens_servico (entrada_id);
create index if not exists os_saida_por_ix on public.ordens_servico (saida_por);

create index if not exists os_eventos_usuario_ix on public.os_eventos (usuario_id);
create index if not exists os_mecanicos_especialidade_ix on public.os_mecanicos (especialidade_id);
create index if not exists os_produtos_aprovado_por_ix on public.os_produtos (aprovado_por);
create index if not exists os_servicos_aprovado_por_ix on public.os_servicos (aprovado_por);
create index if not exists os_servicos_servico_ix on public.os_servicos (servico_id);
create index if not exists os_tags_tag_ix on public.os_tags (tag_id);

create index if not exists pecas_teste_especialidade_ix on public.pecas_teste (especialidade_id);
create index if not exists pecas_teste_os_ix on public.pecas_teste (os_id);
create index if not exists pecas_teste_recebido_por_ix on public.pecas_teste (recebido_por);
create index if not exists pecas_teste_veiculo_ix on public.pecas_teste (veiculo_id);

create index if not exists pecas_teste_eventos_usuario_ix on public.pecas_teste_eventos (usuario_id);

create index if not exists retornos_garantia_ix on public.retornos (garantia_id);
create index if not exists retornos_os_origem_ix on public.retornos (os_origem_id);
create index if not exists retornos_os_retorno_ix on public.retornos (os_retorno_id);
create index if not exists retornos_responsavel_ix on public.retornos (responsavel_id);
create index if not exists retornos_veiculo_ix on public.retornos (veiculo_id);

create index if not exists termos_recusa_defeito_ix on public.termos_recusa (defeito_id);
create index if not exists termos_recusa_responsavel_ix on public.termos_recusa (responsavel_id);
create index if not exists termos_recusa_veiculo_ix on public.termos_recusa (veiculo_id);

create index if not exists veiculo_proprietarios_cliente_ix on public.veiculo_proprietarios (cliente_id);
create index if not exists veiculo_proprietarios_registrado_por_ix on public.veiculo_proprietarios (registrado_por);;
