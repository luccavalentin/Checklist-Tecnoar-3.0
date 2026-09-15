-- Migração aplicada em produção (projeto zdhebeqlhynffxfmedvj), versão 20260906013618.
-- Exportada de supabase_migrations.schema_migrations: é o registro do que rodou. Não edite.


-- Registro "100 CARGAS, TRANSPORTES E LOGISTICA LTDA (cópia)": sem documento,
-- sem omie_id, zero vínculos em OS/veículos/vendas/contatos. Duplicata de
-- importação manual do cadastro que já existe com CNPJ e omie_id corretos.
delete from public.clientes
where id = '17000328-5a82-4793-a4f4-86715bebb968'
  and documento is null
  and omie_id is null
  and not exists (select 1 from ordens_servico where cliente_id = clientes.id)
  and not exists (select 1 from veiculo_proprietarios where cliente_id = clientes.id)
  and not exists (select 1 from vendas where cliente_id = clientes.id)
  and not exists (select 1 from cliente_contatos where cliente_id = clientes.id);;
