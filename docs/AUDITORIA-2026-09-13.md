# Auditoria do sistema — 13/09/2026

Leitura completa das camadas: banco (90 tabelas, 153 funções, 285 políticas de
acesso, 57 gatilhos, 4 rotinas agendadas), Edge Functions (9), Checklist
(`src/`, ~61 mil linhas), app SOS (`app/` + `src/sos`, ~24 mil linhas) e
infraestrutura (VPS, Traefik, nginx, deploy). Três perguntas:

| Pergunta | Nota | Resposta curta |
| --- | --- | --- |
| Aguenta escalar com qualidade? | **5/10** | Aguenta o porte atual com folga (banco de 35 MB). Cresce mal em pontos conhecidos e corrigíveis: totais feitos no navegador que erram sem aviso acima de 1.000 linhas, tempo real que recarrega telas inteiras, serviços de mapa gratuitos no caminho do socorro, operação sem monitoramento nem ambiente de teste. |
| Tem facilidade de manutenção? | **4/10** | A base técnica é boa (TypeScript rigoroso, regras no banco, testes do SOS em Postgres real), mas o processo não protege o código: o SOS inteiro não está no git, o banco não era recriável pelo repositório, não há CI, lint nem testes de tela, e o acesso ao banco está espalhado por dezenas de telas. |
| Quem mexer vai entender? | **7/10** | Sim, na maior parte. Os comentários explicam o *porquê* (acima da média), os nomes são consistentes em português e a documentação é extensa. Atrapalham: telas de 800 a 1.350 linhas misturando dados, regra e visual; dois estilos de tela no Checklist; dois kits de interface no app; funções redefinidas em várias migrações. |

---

## O que já foi corrigido nesta auditoria

| # | Problema | Correção | Onde |
| --- | --- | --- | --- |
| 1 | **Segurança (crítico):** nome de cliente com código (cadastro público do app) rodava no navegador de quem exportava a lista em PDF — podia roubar a sessão de um admin. | Todo texto do cadastro é escapado antes de montar o HTML. | `src/lib/utils.ts` (`escaparHtml`, `escaparCampos`), `Clientes.tsx`, `Fornecedores.tsx` |
| 2 | **LGPD (crítico):** quem soubesse o celular ou CPF/CNPJ de um cliente herdava o cadastro dele no app (histórico, OS, valores, veículos). | Só herda com o e-mail confirmado pelo link de confirmação. Documento/celular iguais → cadastro novo + aviso à central para vincular. | `supabase/migrations/20260920_sos_seguranca_e_escala.sql` |
| 3 | **Segurança (alto):** quem podia "editar usuários" redefinia a senha de um admin (a senha era o próprio e-mail) e entrava na conta dele. | Senha temporária aleatória; só administrador mexe em administrador ou cria conta com perfil de sistema. | `supabase/functions/admin-usuarios` (publicada, v3) |
| 4 | Código de produção só no servidor (`ia`, `ia-modelos`, `placa`, `omie-diagnostico`). | Trazido para o repositório, igual ao publicado. | `supabase/functions/` |
| 5 | O banco não era recriável: 79 migrações de produção, 14 no repositório. | Histórico completo da produção exportado. | `supabase/historico-producao/` |
| 6 | Cada ponto de GPS (a cada 4 s) regravava o chamado e fazia central e cliente recarregarem tudo. | Chamado só muda quando a previsão muda de minuto ou a distância anda 200 m; GPS a cada 8 s. | migração 20260920, `src/sos/useRastreio.ts` |
| 7 | 29 chaves estrangeiras do SOS sem índice; log do pg_cron crescendo ~2.900 linhas/dia. | Índices criados; limpeza diária do log (3 dias). | migração 20260920 |
| 8 | Duas funções de exclusão chamáveis por visitante sem login. | Porta fechada para visitante (a equipe continua usando). | migração 20260920 |
| 9 | Dois pedidos de SOS simultâneos podiam abrir dois chamados. | Trava por conta no banco. | migração 20260920 |
| 10 | iPhone com sinal fraco: pedido de SOS dava "Load failed" ou ficava travado em "Enviando…". | Erro de rede do Safari reconhecido e prazo de 20 s: o pedido vai para a fila do aparelho. | `src/sos/api.ts`, `app/src/cliente/FluxoSOS.tsx` |
| 11 | Dados pessoais (nome, telefone, GPS do pedido) ficavam no aparelho depois de sair/excluir a conta. | Limpeza única ao sair e ao excluir (preferências do aparelho ficam). | `app/src/sessao.tsx` (`limparDadosLocais`) |
| 12 | Todo aparelho baixava 1,8 MB de gerador de PDF na instalação. | Baixa só no primeiro laudo e fica guardado. Instalação: Checklist 4,1→2,6 MB; app 4,1→2,3 MB. | `vite.config.ts`, `vite.app.config.ts` |
| 13 | Cabeçalhos de segurança sumiam em todas as telas do Checklist; nenhum site barrava ser embutido em outro (clickjacking). | Cabeçalhos repetidos onde o nginx não herda; `X-Frame-Options`, `frame-ancestors` e HSTS. | `deploy/nginx-app.conf` (vale no próximo deploy) |
| 14 | Dependência `xlsx` com vulnerabilidade alta e sem uso. | Removida. | `package.json` |
| 15 | Documentação mandava reaplicar o arquivo principal do SOS (voltaria 14 funções à versão antiga, sem erro); endereços `/app/` e lista de funções desatualizados. | Corrigida. | `DOCUMENTACAO-TECNICA.md`, `README.md` |

Validação: `tsc` sem erros, os dois builds, 147 etapas de teste do banco, banco
real idêntico ao testado (impressão `e3c5b91f…`), nginx validado na VPS.

---

## O que falta — por prioridade

### Agora (risco de perder trabalho ou dados)

1. **Commitar e dar push** — ~42 mil linhas (todo o SOS, migrações, testes,
   funções) existem só neste computador. Depois, fazer `deploy/publicar.sh`
   recusar publicar com árvore suja e gravar o commit publicado. *(P)*
2. **Backup testado** — confirmar o plano do Supabase (PITR), fazer `pg_dump`
   periódico + cópia do Storage (fotos, assinaturas) fora do Supabase e testar
   uma restauração. *(M)*
3. **Ligar no Supabase Auth:** confirmação de e-mail (sem ela, conta do app
   nunca herda cadastro sozinha — a central vincula) e proteção contra senha
   vazada. *(P, no painel)*

### Próximas semanas (qualidade que aparece)

4. **Totais corretos com volume** — somas da Visão Geral, uso de tags,
   exportação de clientes e Garantias (teto de 200) passam a vir do banco ou
   paginados; hoje erram sem aviso acima de 1.000 linhas. *(M)*
5. **Monitoramento** — Sentry (ou tabela própria) nos dois apps e nas funções;
   monitor de disponibilidade no `/healthz`; alerta se o vigia do SOS parar. *(P–M)*
6. **CI mínimo** — a cada push: `tsc`, `test:sos` e build. Depois ESLint (há
   25 `eslint-disable` para um linter que não existe) e Vitest na fila
   offline e no mapeamento Omie. *(M)*
7. **Ambiente de teste** — segundo projeto Supabase (ou branching); hoje teste
   de banco real é feito em produção dentro de transação desfeita. *(M)*
8. **Deploy com volta** — imagem marcada com o commit, manter as últimas 3,
   `curl` nos dois domínios após publicar. *(M)*
9. **Tempo real por Broadcast** — central e mecânico assinam tabelas inteiras e
   recarregam tudo a cada evento; trocar por canais específicos e atualizar o
   cache com o próprio evento. *(M/G)*
10. **Retenção** — `notificacoes`, `sos_eventos`, `sos_ia_mensagens` e
    `auditoria` crescem para sempre. *(P)*
11. **Omie** — não apagar cliente que perdeu a tag (apaga em cascata agendamentos,
    contratos e histórico do SOS): inativar. *(P)*

### Contínuo (manutenção e leitura)

12. **Camada de dados no Checklist** — 393 chamadas diretas ao Supabase em 64
    telas; criar `src/dados/<domínio>.ts` com chaves de cache padronizadas,
    como já é feito em `src/sos/api.ts`. Migrar tela a tela. *(G)*
13. **Quebrar arquivos gigantes** — Fornecedores (1.355 linhas),
    ConfiguracoesSOS (1.330), Clientes (1.087), EditorOS (1.039),
    DetalheChamado, Usuarios, Checklists; no app, FluxoSOS, ChamadoCliente,
    EmServico. *(M/G)*
14. **Um kit de interface** — Checklist tem páginas "Premium" com cores fixas e
    componentes próprios (`KpiCard` definido 8 vezes); o app tem dois kits
    (`comum/ui.tsx` e `mecanico/ui.tsx`) e utilitários duplicados que já
    divergem. *(M)*
15. **Migrações imutáveis e uma função por arquivo** para as funções grandes do
    SOS (`sos_vigiar` existe em duas cópias de ~200 linhas). *(M)*
16. **Tipos do banco regenerados** — `src/tipos/supabase.ts` não conhece
    nenhuma tabela `sos_`; os tipos do SOS são escritos à mão. *(P)*
17. **Mapa e rotas** — OSRM de demonstração, Nominatim e tiles do OSM não
    permitem uso comercial intenso; contratar provedor quando o volume
    crescer. *(M)*

---

## Pontos fortes (manter)

- **Regras no banco:** RLS com `(select auth.uid())`, 105 funções privilegiadas
  com `search_path` fixo, transições de chamado explícitas, travas `for update`
  no aceite e no cancelamento, chaves fora da API (`privado.config`).
- **Testes do SOS em Postgres de verdade** (147 etapas) + impressão md5 que
  prova que a produção roda exatamente o código testado. Raro nesse porte.
- **Comentários que explicam decisões** (`tempoReal.ts`, `filaOffline.ts`,
  `OrdensServico.tsx`, cabeçalho da migração do SOS) — o padrão a seguir.
- **Fila offline do mecânico** bem desenhada: ordem por chamado, reenvio sem
  duplicar, trava entre abas, hora real do toque.
- **TypeScript estrito** e limpo (1 `any` em ~85 mil linhas), rotas sob
  demanda, paginação no servidor nas listas principais, container sem root,
  TLS automático, nenhum segredo no repositório.
