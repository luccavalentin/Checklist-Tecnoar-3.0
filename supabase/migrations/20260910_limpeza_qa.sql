-- Limpeza dos residuos de QA que travam a exclusao do veiculo e do cliente
-- de teste. Restrito por id: nenhuma linha fora desta lista e tocada.
--
-- As 4 entradas de patio sao de 24/08 a 31/08, todas do veiculo QAP-1234
-- "Cavalo de teste QA", e todas com saida_em nulo — ficaram orfas quando as
-- OS de teste foram excluidas. A peca PT-2026-00001 e do mesmo periodo.
--
-- Rodar no SQL Editor do projeto zdhebeqlhynffxfmedvj.

begin;

-- 1. Eventos da peca em teste, se houver, antes da peca.
delete from pecas_teste_eventos
where peca_id = '4e757471-21aa-43f7-99d3-b5064de659f6';

delete from pecas_teste
where id = '4e757471-21aa-43f7-99d3-b5064de659f6';

-- 2. As 4 entradas de patio de teste.
delete from entradas_patio
where id in (
  '86f82a47-300f-49f2-a9e8-7b5ae9244420',  -- 24/08
  'a11669b2-13aa-450c-bcf9-01104108ef29',  -- 27/08
  'a86393ea-5bc0-4a04-88b8-ed1db7c6b2a4',  -- 27/08
  '1ba86acc-c2f2-42b9-90d3-48392d6fe157'   -- 31/08
);

commit;

-- Depois disto, o veiculo QAP-1234 e o cliente "Cliente Recepcao QA" passam a
-- ser excluidos pelo botao Excluir das proprias telas, sem mais SQL.
