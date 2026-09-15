# Histórico de migrações da produção

Cópia fiel do que rodou no banco de produção (projeto `zdhebeqlhynffxfmedvj`),
exportada de `supabase_migrations.schema_migrations` em 13/09/2026. Um arquivo
por migração, na ordem em que foram aplicadas (`<versão>_<nome>.sql`).

## Por que existe

Até aqui, a base do Checklist (etapas 1 a 15, OS, checklists, pátio, IA,
Omie, notificações…) foi criada direto no banco e **não estava no
repositório**: o código não recriava o banco. Esta pasta fecha essa lacuna —
é o registro do que está em produção, para ler, auditar e montar um banco novo
(staging, teste, recuperação).

## Como usar

- **Entender uma tabela ou função:** procure o nome aqui (a versão mais nova
  vence) e em `../migrations/`.
- **Montar um banco novo do zero:** aplique estes arquivos em ordem de
  versão num projeto vazio. Eles já incluem o módulo SOS (as versões
  `20260912…` em diante são as mesmas de `../migrations/20260912_*.sql` em
  diante, aplicadas em partes).
- **Não edite** estes arquivos: mudança nova vai em `../migrations/` e,
  depois de aplicada, entra aqui na próxima exportação.

## Limites conhecidos

- Migrações aplicadas colando no SQL Editor não entram no histórico. Pelo
  menos `../migrations/20260902_financeiro.sql`,
  `20260910_acao_inativar_faltante.sql` e `20260910_exclusao_veiculo_cliente.sql`
  não aparecem aqui — confira no banco antes de assumir que rodaram.
- Dados (clientes, produtos…) não estão aqui, só a estrutura e os dados de
  configuração que as migrações inserem.
- Para exportar de novo: `select version, name, statements from
  supabase_migrations.schema_migrations order by version`.
