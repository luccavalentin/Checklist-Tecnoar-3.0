# Autohospedar o Supabase na VPS — plano

Levantamento de 25/10/2026, antes de qualquer alteração. Nada foi mexido para
escrever este documento: os números abaixo foram medidos no projeto
`zdhebeqlhynffxfmedvj` e na VPS `srv1950838`.

O objetivo declarado é tirar o sistema do Supabase hospedado e colocar banco,
autenticação, storage, tempo real e funções de borda 100% na VPS.

---

## 0. Onde estamos — 26/10/2026

Diário da execução. As seções seguintes são o plano original, mantido como
foi escrito; esta é a única que muda a cada etapa.

### Pronto e conferido

| O quê | Estado |
| --- | --- |
| Pilha do Supabase na VPS | 11 serviços de pé em `/opt/supabase`, todos `healthy` |
| Portas | **nenhuma** publicada; a VPS segue só com 22, 80 e 443 |
| Banco copiado | 96 tabelas com a MESMA contagem de linhas da produção, 198 funções, 343 índices, 292 políticas, 60 gatilhos, 58 enums, 4 contas |
| `pg_cron` | 1.6.4, igual à produção; as 6 tarefas agendadas, com `sos_girar_ondas` a 15s e `sos_vigiar` a 30s |
| Extensões | `pg_trgm`, `pg_net`, `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements` |
| Funções de borda | as 11 enviadas; o runtime as serve (401 de autenticação, que é o esperado) |
| Prova de ponta a ponta | os dois aplicativos rodaram contra a VPS por túnel SSH, com dados reais e sem erro de console |
| Backup | `/opt/supabase/backup.sh`, testado: 2,2 MB comprimidos |
| E-mails de conta | 4 templates em `supabase/emails/`, servidos em `public/emails/` |

### Falta

| O quê | Depende de |
| --- | --- |
| Agendar o backup no cron | um comando, bloqueado pela proteção da sessão |
| Cópia do backup para FORA da VPS | escolher o destino |
| DNS `api.tecnoarsistemas.com.br` → 179.199.140.86 | painel da Hostinger (o DNS está lá, não no Cloudflare) |
| Ligar o roteamento no Traefik | o DNS acima; trocar `traefik.enable` para `true` em `docker-compose.borda.yml` |
| SMTP | SendPulse em moderação desde 26/10 |
| Arquivos do storage | de propósito: só na virada, senão nascem novos no meio |
| Virada e APK | tudo acima |

### Detalhes que custaram tempo (para não repetir)

- **`COMPOSE_FILE` no `.env` oficial desliga o override automático.** Com ele
  apontando só para `docker-compose.yml`, os ajustes de porta eram ignorados em
  silêncio e o Postgres subiu exposto em 0.0.0.0 — numa VPS sem firewall ativo.
  Hoje a variável lista os três arquivos.
- **O banco do Supabase só atende em IPv6.** O host tem; os containers do
  compose, não. O cliente roda num container com `--network host`.
- **Senha com `@` quebra a URL `postgresql://`.** A conexão usa `PGPASSWORD` e
  parâmetros, não URL.
- **`docker compose exec -T` engole o stdin do script.** Dentro de heredoc,
  precisa de `< /dev/null`, ou o resto do script desaparece sem erro.
- A senha do banco de produção está em `/opt/supabase/.senha-producao` (600).
  Apagar quando a migração terminar.

### Retomar os testes contra a VPS

```bash
ssh -i ~/.ssh/tecnoar_vps -N -L 8000:172.16.1.5:8000 root@179.199.140.86
```

Com o túnel aberto, `checklist-na-vps` e `sos-na-vps` no `launch.json` sobem os
dois aplicativos apontados para lá (`.env.vps`).

---

## 1. A conclusão primeiro

**É possível, e o porte dos dados torna o risco baixo.** O banco inteiro tem
43 MB, são 4 contas de autenticação e 5 arquivos no storage. Isso cabe num
`pg_dump` de segundos, dá para ensaiar a migração quantas vezes quiser, e a
volta atrás é trocar duas variáveis e republicar.

**Mas a economia é zero, porque hoje não se paga nada.** A organização
`sistemacrmchecklist` está no **plano gratuito**. Migrar não corta custo
nenhum: corta vínculo. Se a razão for soberania do dado, independência de
fornecedor ou política interna, o plano abaixo entrega isso. Se a razão for
conta alta, não há conta.

A troca real é esta:

| | Supabase hospedado (hoje) | Autohospedado na VPS |
| --- | --- | --- |
| Custo em dinheiro | R$ 0 (plano gratuito) | R$ 0 de licença; consome recursos da VPS que você já paga |
| Quem mantém no ar | Supabase | Você |
| Quem atualiza segurança | Supabase | Você |
| Quem responde às 3h da manhã | Supabase | Você |
| Teto de crescimento | 500 MB de banco no gratuito; acima disso, US$ 25/mês | 370 GB livres no disco |
| Dado sai do país? | Não (região `sa-east-1`, São Paulo) | Não |
| Ponto único de falha | Separado da VPS | VPS cai, cai tudo junto |

A última linha é a que merece pensamento. Hoje, se a VPS morre, o banco
sobrevive e os dados estão a salvo. Depois da migração, um disco com defeito
leva os dois sistemas e o banco de uma vez — por isso o backup para fora da
VPS deixa de ser opcional e vira parte da migração, não um "depois a gente vê".

### Correção a algo que eu disse antes

Falei em perder "backups automáticos e point-in-time recovery". No plano
gratuito esses recursos não estão incluídos, então não há o que perder — o que
existe é a ausência de rotina de backup **hoje**, que é um risco que já corre
solto e que este plano resolve de passagem. Confira no painel do Supabase
antes de decidir, mas não conte com backup que você não viu.

---

## 2. O que foi medido

### Banco de produção

| Medida | Valor |
| --- | --- |
| Tamanho total | 43 MB |
| Postgres | 17.6.1 |
| Região | `sa-east-1` (São Paulo) |
| Tabelas em `public` | 96 |
| Funções em `public` | 198 |
| Políticas de acesso | 292 |
| Segredos no `supabase_vault` | nenhum |
| Contas em `auth.users` | 4 |
| Arquivos no storage | 5 (44 kB), buckets `evidencias` e `sos` |
| Extensões | `pg_cron`, `pg_net`, `pg_stat_statements`, `pg_trgm`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp` |

Linhas que importam: 3.755 produtos, 3.601 vendas, 14.456 itens de venda,
1.340 clientes, 606 fornecedores, 488 permissões de perfil.

### Rotinas agendadas (`pg_cron`)

| Tarefa | Frequência |
| --- | --- |
| `sos_girar_ondas` | a cada 15 segundos |
| `sos_vigiar` | a cada 30 segundos |
| `tecnoar-avisos-de-prazo` | a cada 15 minutos |
| `sos_lembretes` | 07:15 diariamente |
| `sos_limpar_posicoes` | 03:30 diariamente |
| `sos_limpar_log_cron` | 03:45 diariamente |

As duas primeiras são o coração do despacho do SOS e rodam em **segundos**,
não em minutos. Agendamento em segundos exige `pg_cron` 1.5 ou mais novo;
produção está na **1.6.4**, e a imagem oficial do Supabase traz versão
equivalente. Mesmo assim é item de verificação obrigatório: se o agendador cair
para o mínimo de um minuto, o socorro passa a girar quatro vezes mais devagar
sem erro nenhum na tela.

### Funções de borda (11 no ar)

`admin-usuarios`, `omie`, `omie-envio`, `omie-produto`, `omie-diagnostico`,
`ia`, `ia-modelos`, `sos-ia`, `push`, `placa`.

O código-fonte de todas está em `supabase/functions/` no repositório — isso
economiza a maior parte do trabalho. Os segredos que elas leem do ambiente
são `PLACA_API_KEY`, `PLACA_MODELO`, `PLACA_PROVEDOR`, mais os três que o
Supabase injeta sozinho (`SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`). As chaves de IA e do Omie ficam em tabela, não
em variável de ambiente, e migram com o `pg_dump`. O `supabase_vault` está
instalado mas **vazio** — não há segredo guardado nele para migrar.

### Tempo real

19 assinaturas de mudança no banco (`postgres_changes`), 5 usos de broadcast e
1 de presença. É o que faz o chat aparecer na hora, o mapa dos mecânicos andar
e a central ver chamado novo sem recarregar. É também o serviço mais sensível
de operar por conta própria.

### Autenticação

O aplicativo usa cadastro, login, troca de senha, recuperação de senha e
atualização de conta. **Quem manda esses e-mails hoje é o Supabase.**
Autohospedado, sem um SMTP configurado, a recuperação de senha simplesmente
para de funcionar — e o usuário só descobre quando precisa dela.

### VPS

| Medida | Valor |
| --- | --- |
| CPU | 8 núcleos |
| Memória | 31 GB, com 4,4 GB em uso e 26 GB disponíveis |
| Disco | 387 GB, com 370 GB livres |
| Containers hoje | 16 (Traefik, dois WordPress, loja, CRM, Evolution, Checklist) |

O Supabase autohospedado, com o módulo de analytics desligado, ocupa algo
entre 2 e 3 GB de memória. Cabe com folga larga.

---

## 3. O que precisa subir

| Serviço | Papel | Dificuldade |
| --- | --- | --- |
| Postgres (imagem `supabase/postgres`) | o banco, com as extensões | baixa |
| PostgREST | expõe as 117 funções que os apps chamam | baixa |
| GoTrue | autenticação | **média** — depende de SMTP |
| Realtime | chat, mapa, central ao vivo | **alta** |
| Storage API | anexos e evidências | baixa |
| Edge Runtime | as 11 funções de borda | média |
| Kong | porta de entrada da API | baixa |
| Studio | painel de administração | baixa |
| Analytics (Logflare) | registro de chamadas | **desligar** — é o que mais pesa e não é usado |

Fora da lista acima, mas parte do trabalho: Traefik roteando o novo subdomínio,
certificado Let's Encrypt, e o Postgres **sem porta aberta para a internet** —
acesso só pela rede interna do Docker e, para administração, por túnel SSH.

---

## 4. Custos

### Em dinheiro

| Item | Hoje | Depois | Observação |
| --- | --- | --- | --- |
| Supabase | R$ 0 | R$ 0 | plano gratuito dos dois lados da conta |
| VPS | já paga | a mesma | consumo sobe 2–3 GB de RAM e ~2 GB de disco |
| SMTP para e-mails de conta | embutido no Supabase | R$ 0 no começo | com 4 contas, qualquer plano gratuito de envio cobre; se o app crescer para centenas de cadastros, aí vira custo |
| Backup fora da VPS | não existe hoje | R$ 0 a ~R$ 15/mês | depende de onde guardar; 43 MB comprimidos cabem em quase qualquer lugar gratuito |
| **Total** | **R$ 0** | **R$ 0 a ~R$ 15/mês** | |

Economia futura: se o banco passar de 500 MB ou o projeto precisar de recursos
pagos, o Supabase hospedado iria para US$ 25/mês. No ritmo atual — 43 MB depois
de dois meses de uso — isso está longe.

### Em trabalho

| Fase | Esforço | Sistema no ar? |
| --- | --- | --- |
| 0. Preparo e decisões | 1–2 h | sim |
| 1. Subir a pilha na VPS, em paralelo | 2–3 h | sim |
| 2. Migrar uma cópia dos dados e validar | 2–3 h | sim |
| 3. Ensaio completo da virada | 1–2 h | sim |
| 4. Virada real | 30 min | **não, ~15 min** |
| 5. Acompanhamento com o Supabase intacto | 1 semana | sim |

Somando: entre 7 e 11 horas de trabalho, das quais **cerca de 15 minutos de
indisponibilidade real** para quem usa o sistema.

### O custo escondido

O que não aparece em nota fiscal: a partir da virada, atualização de segurança
do Postgres, do GoTrue e do Realtime passa a ser tarefa sua, e uma falha às 3h
da manhã não tem para quem ligar. Isso não é argumento contra — é o preço de
não ter vínculo, e precisa estar na conta antes, não depois.

---

## 5. A janela

A virada em si é curta porque os dados são pequenos. O que determina a janela
não é o `pg_dump`, é o aplicativo instalado no celular.

### O detalhe que decide tudo: o APK

`VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` são **embutidas no pacote
em tempo de compilação**, não lidas em tempo de execução. O site republica e
pronto; o aplicativo Android instalado no celular do mecânico continua
apontando para o endereço antigo até ser atualizado.

Consequência prática: **o Supabase hospedado não pode ser desligado no dia da
virada.** Ele fica no ar, intocado, até o último aparelho estar com a versão
nova. Só depois disso é que se apaga o projeto — e é isso que remove o vínculo
de verdade.

### Sugestão de janela

| Quando | O quê |
| --- | --- |
| Terça a quinta, fora de pico | fases 0 a 3, sem tocar em produção |
| **Domingo de manhã, 7h às 8h** | virada: migração final, troca das variáveis, deploy, validação |
| Domingo à tarde | APK novo gerado e distribuído à equipe |
| Semana seguinte | acompanhamento, Supabase hospedado ainda no ar |
| Após 1 semana sem incidente | desligar o projeto no Supabase |

Domingo de manhã porque o SOS é 24 horas: não existe horário sem chamado
possível, mas existe o horário de menor movimento. Durante os 15 minutos de
virada, um pedido de socorro que chegue vai falhar — por isso a central precisa
estar avisada e com o telefone à mão.

---

## 6. Plano, fase a fase

### Fase 0 — Preparo (sem tocar em nada)

1. Decidir o subdomínio da API (sugestão: `api.tecnoarsistemas.com.br`).
2. Escolher e testar o SMTP. Sem ele, não se vira a chave.
3. Definir onde ficará o backup fora da VPS.
4. Copiar do painel do Supabase o **JWT secret** atual. Reaproveitá-lo faz as
   sessões abertas continuarem valendo; trocá-lo desloga todo mundo. Com 4
   contas, qualquer um dos dois serve — mas é decisão, não acaso.
5. Aplicar as duas migrações que estão pendentes (ver seção 8), para o banco
   novo já nascer completo.

### Fase 1 — Subir a pilha, em paralelo

6. `docker compose` do Supabase em `/opt/supabase`, na rede `borda` que já
   existe, com analytics desligado.
7. Traefik roteando o subdomínio, certificado emitido.
8. Postgres **sem** porta publicada.
9. Confirmar que as extensões subiram, com atenção especial ao `pg_cron` e ao
   agendamento em segundos.

### Fase 2 — Migrar uma cópia e validar

10. `pg_dump` do banco hospedado, incluindo os schemas `auth` e `storage`.
11. Restaurar no Postgres da VPS.
12. Copiar os 5 arquivos do storage.
13. Publicar as 11 funções de borda no Edge Runtime, com os segredos.
14. Recriar as 6 tarefas do `pg_cron`.
15. Subir uma build de teste apontada para o novo endereço, em subdomínio
    separado, e **validar de verdade** (seção 7).

### Fase 3 — Ensaio

16. Repetir a fase 2 do zero, cronometrando. O ensaio existe para medir o
    tempo real da virada e achar o passo esquecido enquanto isso ainda é
    barato.

### Fase 4 — Virada

17. Avisar a central.
18. `pg_dump` final (poucos segundos neste tamanho).
19. Restaurar por cima da cópia.
20. Trocar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no `.env`.
21. `deploy/publicar.sh`.
22. Validar pela lista da seção 7.
23. Gerar e distribuir o APK novo.

### Fase 5 — Encerrar o vínculo

24. Uma semana de acompanhamento com o projeto hospedado intacto.
25. Confirmar que nenhum aparelho ainda fala com o endereço antigo.
26. Backup final do projeto hospedado, guardado fora da VPS.
27. Apagar o projeto no Supabase. **Aqui o vínculo acaba.**

---

## 7. Como saber que funcionou

Validação a fazer no ambiente de teste (fase 2) e repetir na virada (fase 4).
Não vale "abriu a tela": vale o caminho inteiro.

| # | O que testar | Por que este |
| --- | --- | --- |
| 1 | Entrar com conta existente | prova que os hashes de senha migraram |
| 2 | Recuperar senha pelo e-mail | prova o SMTP, o item mais provável de falhar |
| 3 | Criar conta nova no app | prova o cadastro ponta a ponta |
| 4 | Abrir chamado de SOS | o fluxo principal do produto |
| 5 | Chamado aparecer na central **sem recarregar** | prova o tempo real |
| 6 | Mensagem no chat chegar nos dois lados | prova broadcast e presença |
| 7 | Mecânico andar no mapa | prova as posições e o tempo real sob carga |
| 8 | Anexar foto num chamado | prova o storage |
| 9 | Gerar PDF de checklist | prova o caminho mais pesado do navegador |
| 10 | Enviar um cliente ao Omie | prova as funções de borda com segredo |
| 11 | Perguntar algo à Tecno IA | prova as funções de borda com chave de terceiro |
| 12 | Receber uma notificação push | prova `pg_net` saindo da VPS |
| 13 | Esperar o vigia escalonar um chamado | prova o `pg_cron` em segundos |
| 14 | Conta sem permissão não lê o que não deve | prova que as políticas vieram junto |

O item 13 é o que mais gente esquece e o que mais dói: se o `pg_cron` não
disparar em segundos, o despacho do SOS degrada silenciosamente — ninguém vê
erro, os chamados só demoram mais.

---

## 8. Pendências que já existem, independentemente disso

Encontradas no backteste de 25/10/2026 e não relacionadas à migração, mas que
devem ser resolvidas antes de clonar o banco, para a cópia nascer correta:

| Pendência | Efeito hoje |
| --- | --- |
| `20261009_conversa_completa.sql` nunca aplicada | `sos_apagar_mensagem` e `sos_marcar_mensagens_entregues` não existem: apagar mensagem e o segundo tique falham no chat do chamado |
| `20261024_chat_equipe_tecnoar.sql` nunca aplicada | o Chat com a Tecnoar mostra "canal ainda não ativado" |

Das 117 funções que os dois aplicativos chamam, **111 existem e estão
liberadas** em produção. As 6 que faltam são exatamente as dessas duas
migrações.

---

## 9. Decisões que travam o começo

1. ~~**SMTP**~~ — **resolvido em 25/10/2026: SendPulse**. Plano gratuito:
   12.000 e-mails por mês, 400 por dia e **50 por hora**, com mensagem de até
   1 MB. O teto por hora é o primeiro a apertar, mas está muito acima do
   movimento atual. Os quatro templates estão em `supabase/emails/`, com a
   configuração em `supabase/emails/LEIA-ME.md`.
2. **Subdomínio da API**: `api.tecnoarsistemas.com.br` ou outro.
3. **Backup**: onde fica a cópia fora da VPS, e com que frequência.
4. **JWT secret**: reaproveitar o atual (ninguém desloga) ou gerar novo.

A 2 e a 3 não têm resposta óbvia e são suas. A 4 eu recomendo reaproveitar,
por não haver motivo para desconectar as quatro contas.

O domínio `tecnoarsistemas.com.br` precisa ser verificado no SendPulse com SPF
e DKIM, e o acesso ao SMTP só é liberado depois que eles ativam o perfil da
conta — não é imediato. Esse é o item com prazo fora do nosso controle, então
convém abrir a conta antes de marcar a janela.
