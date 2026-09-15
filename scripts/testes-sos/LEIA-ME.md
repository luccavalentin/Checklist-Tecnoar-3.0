# Teste das migrações do SOS

Roda todas as migrações do SOS (`supabase/migrations/20260912_*` em diante,
na ordem) num PostgreSQL de verdade (PGlite, em memória) sobre um esqueleto do
banco gerado de `src/tipos/supabase.ts`, e simula o ciclo inteiro: cadastro do
cliente, pedido, despacho, aceite, posição, chat, itens do catálogo,
finalização com OS gerada, avaliação, recusa, cancelamento, WhatsApp,
agendamento, vigia (escalonamento, atraso, sem sinal, offline), contrato com
prazo, taxa de deslocamento, orçamento com assinatura, IA (configuração e
credencial), exclusão de conta (LGPD) — e a RLS no pior caso (uma política
antiga liberando tudo a qualquer conta logada).

```bash
cd scripts/testes-sos
npm install
cd ../..
npm run test:sos
```

Rode sempre que mudar uma migração do SOS. Pega o que a leitura não pega: tipo
de coluna errado, enum sem conversão, função que quebra só em tempo de
execução.

`COLUNAS_TEXTO=referencia_id,entidade_id node scripts/testes-sos/teste-sos.mjs`
repete tudo com essas colunas como `text` (como estão no banco real).

## Conferir que o banco real tem o código testado

`impressao.mjs` imprime o md5 dos corpos de todas as funções `sos_*` depois de
aplicar as migrações aqui. No banco real (SQL Editor ou MCP):

```sql
select count(*) as n,
  md5(string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || '):' || md5(replace(p.prosrc, E'\r', '')),
                 ',' order by p.proname, pg_get_function_identity_arguments(p.oid))) as impressao
from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'sos\_%';
```

Os dois números têm que bater.

## Limites do esqueleto

O esqueleto não conhece gatilhos nem restrições que só existem no banco real.
Por isso, depois de aplicar, vale um teste de ponta a ponta no banco real
dentro de um bloco que se desfaz (`do $$ … raise exception 'RESULTADO %' $$`).
Sequências (`numero`, `codigo`) não voltam no rollback: devolva com `setval`.
