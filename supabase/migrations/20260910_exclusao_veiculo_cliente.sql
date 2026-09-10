-- Permite excluir veiculo e cliente, e alinha a permissao da OS.
--
-- A previa_exclusao nao tem lista de bloqueio escrita nela: ela le a regra da
-- chave estrangeira. CASCADE vira "arrasta junto" (com contagem na tela),
-- RESTRICT vira bloqueio. Duas regras estavam erradas.

begin;

-- 1. Entrada de patio nao existe sem o veiculo e o cliente dela. Estava como
--    RESTRICT, e era o que travava a exclusao dos dois.
alter table public.entradas_patio
  drop constraint entradas_patio_veiculo_id_fkey,
  add constraint entradas_patio_veiculo_id_fkey
    foreign key (veiculo_id) references public.veiculos(id) on delete cascade;

alter table public.entradas_patio
  drop constraint entradas_patio_cliente_id_fkey,
  add constraint entradas_patio_cliente_id_fkey
    foreign key (cliente_id) references public.clientes(id) on delete cascade;

-- 2. Peca em teste e dado de laboratorio com valor proprio: perde o vinculo,
--    nao a existencia. E o que ja acontecia com o veiculo (pecas_teste
--    .veiculo_id ja era SET NULL); ter duas regras para o mesmo registro era
--    incoerencia, nao decisao.
alter table public.pecas_teste
  drop constraint pecas_teste_cliente_id_fkey,
  add constraint pecas_teste_cliente_id_fkey
    foreign key (cliente_id) references public.clientes(id) on delete set null;

-- 3. A acao 'inativar' nao existia para ordens_servico, entao o botao Excluir
--    da OS era codigo inalcancavel na tela — nem admin recebia a permissao.
--    A funcao no banco sempre cobrou tem_permissao(recurso,'inativar').
update public.recursos
set acoes = array['visualizar','criar','editar','aprovar','cancelar','inativar','exportar']
where chave = 'ordens_servico';

commit;

-- Ordens de servico, garantias, retornos e termos de recusa seguem RESTRICT de
-- proposito: sao registros operacionais e fiscais. Apagar um cliente nao pode
-- levar embora a historia de servico dele em silencio — apaga-se a OS antes,
-- de forma consciente.
