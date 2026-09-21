# Documentação Técnica — Sistema Operacional Tecnoar 3.0

Documento de referência para quem desenvolve, mantém ou assume o sistema.
Para o manual de uso da oficina, veja [MANUAL-DO-USUARIO.md](MANUAL-DO-USUARIO.md).

---

## 1. O que o sistema é

Sistema de gestão da oficina Tecnoar Freios. Cobre o ciclo completo do veículo —
da chegada à entrega — e os cadastros, indicadores e integrações que sustentam
esse ciclo.

O escopo vai além de "checklists": há ordens de serviço com apontamento de
mão de obra, controle de pátio, laboratório de peças em teste, garantias e
retornos, estoque, financeiro com faturamento parcelado, CRM, base técnica e
um módulo de IA.

### Regra fundadora do projeto

> Nada de dado fictício. Sem dado real → estado vazio. Erro → estado de erro com
> nova tentativa. Resultado zero → zero. Nenhum botão pode parecer funcional
> sem funcionar.

Essa regra não é estilo: numa oficina, um número inventado na tela vira decisão
errada no pátio. Ao implementar qualquer tela nova, prefira mostrar vazio a
mostrar um placeholder plausível.

---

## 2. Arquitetura

```
┌─────────────────────────────────────────────┐
│  Navegador / PWA instalado                  │
│  React + TypeScript + Tailwind              │
└───────────────────┬─────────────────────────┘
                    │  HTTPS
┌───────────────────▼─────────────────────────┐
│  Supabase (projeto zdhebeqlhynffxfmedvj)    │
│  ├── Auth        sessão e senha             │
│  ├── PostgREST   API gerada do schema       │
│  ├── Postgres    dados + RLS + RPCs         │
│  ├── Storage     fotos, vídeos, documentos  │
│  └── Edge Funcs  omie, ia, sos-ia, push…    │
└─────────────────────────────────────────────┘
```

Não existe backend próprio. O navegador fala direto com o Supabase, e **toda a
autorização vive no banco** — em políticas de RLS e em funções `SECURITY
DEFINER`. Isso é deliberado: como o bundle é público e as chaves ficam
visíveis no navegador, qualquer regra de acesso escrita apenas no React seria
contornável por quem abrisse o DevTools. Ver §5.

### Stack

| Camada | Tecnologia |
| --- | --- |
| Build | Vite 6 |
| Interface | React 18, TypeScript 5.9 |
| Estilo | Tailwind CSS v4 (tokens em `src/styles/theme.css`) |
| Rotas | React Router 6, com carregamento sob demanda |
| Dados | TanStack Query 5 (cache e revalidação) |
| Formulários | React Hook Form + Zod |
| Backend | Supabase (Postgres 15, Auth, Storage, Edge Functions) |
| Documentos | pdfmake (OS, recibos, protocolos, termos) |
| Planilhas | SheetJS (exportações) |
| Aplicativo | vite-plugin-pwa (instalável, offline parcial) |

---

## 3. Estrutura do código

```
src/
  auth/            sessão, provedor de autenticação, rotas protegidas
  busca/           fontes da Busca Global (cada módulo registra a sua)
  componentes/
    marca/         logo oficial nas três versões
    padroes/       padrões de listagem e formulário reaproveitados
    saida/         componentes do fluxo de saída do pátio
    ui/            design system: botão, campo, tabela, estados, sobreposições
  dados/           hooks de acesso a dados
  documentos/      geração de PDF (OS, recibo, protocolo, termo)
  layout/          shell, navegação, topo, notificações, ajuda
  lib/             cliente Supabase e utilitários
  paginas/         telas, agrupadas por domínio
  permissoes/      provedor de permissões efetivas
  styles/          tokens de tema
  tema/            alternância claro/escuro
  tipos/           tipos gerados do banco (não editar à mão)
design/            artboards da direção visual e vetores da marca
deploy/            infraestrutura: nginx do container, Traefik, scripts
supabase/
  functions/       Edge Functions (admin-usuarios, ia, ia-modelos, placa, omie,
                   omie-envio, push, sos-ia) e o dicionário de campos
  migrations/      migrações SQL
```

### Como o menu e as rotas se relacionam

O menu **não** é escrito à mão em cada tela. Ele é gerado a partir de
`src/layout/navegacao.ts`, onde cada item declara rótulo, rota, ícone, etapa de
implantação e o **recurso** que controla seu acesso.

Para adicionar um módulo:

1. Declare o item em `src/layout/navegacao.ts`.
2. Crie a tela em `src/paginas/…`, montada sobre `componentes/ui`.
3. Registre a tela no mapa `TELAS` em `src/App.tsx`.
4. Se o módulo tiver busca, registre uma fonte em `src/busca/`.

Rotas declaradas no menu mas ausentes de `TELAS` caem em `ModuloPendente`, que
declara abertamente que o módulo ainda não está no ar — em vez de abrir uma tela
vazia que parece quebrada.

---

## 4. Modelo de dados

**71 tabelas** e **7 views**, todas no schema `public`, todas com RLS ativa.

### Domínios

**Operação do veículo**
`entradas_patio`, `ordens_servico`, `status_os`, `os_servicos`, `os_produtos`,
`os_mecanicos`, `os_apontamentos`, `os_eventos`, `os_tags`, `avarias_veiculo`,
`eventos_veiculo`, `evidencias`, `assinaturas`, `termos_recusa`

**Checklists**
`checklist_modelos`, `checklist_modelo_itens`, `checklists`,
`checklist_respostas`, `checklist_defeitos`, `acoes_corretivas`

**Pós-venda**
`garantias`, `retornos`, `pecas_teste`, `pecas_teste_eventos`

**Cadastros**
`clientes`, `cliente_contatos`, `cliente_tags`, `veiculos`,
`veiculo_proprietarios`, `produtos`, `servicos`, `fornecedores`, `vendedores`,
`tags`, `especialidades`, `funcoes`, `usuarios`, `usuario_especialidades`

**Acesso**
`perfis_acesso`, `perfil_permissoes`, `usuario_permissoes`, `recursos`

**Comercial e financeiro**
`vendas`, `venda_itens`, `estoque_movimentos`, `faturas`, `fatura_parcelas`

**Relacionamento**
`interacoes`, `follow_ups`

**Gestão**
`criterios_performance`, `eventos_performance`

**Conhecimento e IA**
`artigos_tecnicos`, `artigo_versoes`, `artigos_ajuda`, `ebooks`,
`ebook_capitulos`, `ia_config`, `ia_conversas`, `ia_mensagens`,
`ia_aprendizados`, `ia_dominios`, `ia_equipamentos`, `ia_feedback`, `ia_fontes`

**Sistema**
`parametros`, `dados_empresa`, `auditoria`, `notificacoes`, `integracoes`,
`sincronizacoes`, `conflitos_sincronizacao`

### Views

| View | Serve para |
| --- | --- |
| `vw_patio` | Situação consolidada de cada veículo no pátio (categoria, SLA, tempo) |
| `vw_estoque` | Posição de estoque calculada a partir dos movimentos |
| `vw_minhas_tarefas` | Fila pessoal do usuário logado |
| `vw_mecanicos` | Mecânicos ativos e suas especialidades |
| `vw_mecanicos_laboratorio` | Recorte de mecânicos habilitados ao laboratório |
| `vw_clientes_relacionamento` | Cliente com dados de relacionamento agregados |
| `vw_ebook_capitulos` | Capítulos com metadados do e-book |

Todas as views têm **`security_invoker = true`**. Isso importa: sem esse ajuste,
uma view roda com os privilégios de quem a criou e **contorna a RLS das tabelas
de origem** — seria a porta de saída mais fácil para vazar a base inteira.
Ao criar qualquer view nova, defina `security_invoker` explicitamente.

### Regeneração de tipos

`src/tipos/supabase.ts` é gerado a partir do schema. Depois de qualquer
migração, regere o arquivo — não o edite à mão. Tipos desatualizados quebram
em produção sem erro visível em desenvolvimento.

---

## 5. Segurança e permissões

### As três camadas

1. **Autenticação** — Supabase Auth. Sem sessão, nada acontece.
2. **Autorização por recurso** — matriz `recurso × ação`, aplicada tanto na
   interface quanto no banco.
3. **RLS** — política por tabela. É a camada que decide de fato, e a única em
   que se pode confiar.

### Matriz de permissões

Uma permissão é o par `recurso:ação`. As ações possíveis (`acao_permissao`):

`visualizar` · `criar` · `editar` · `aprovar` · `cancelar` · `inativar` ·
`configurar` · `exportar` · `sincronizar`

As permissões efetivas de um usuário vêm de três origens combinadas:

- o **perfil de acesso** (`perfis_acesso` → `perfil_permissoes`);
- **exceções individuais** (`usuario_permissoes`), que concedem ou retiram algo
  fora do perfil;
- a flag de **administrador**, que dá acesso total.

No front, `ProvedorPermissoes` chama a RPC `minhas_permissoes()` uma vez por
sessão e monta um `Set` de `recurso:acao`. O hook `usePermissoes()` expõe
`pode(recurso, acao)` e `podeVer(recurso)`.

**Isso é conveniência de interface, não segurança.** Esconder um botão não
protege nada — quem chamar a API direto continua passando. A proteção real é a
RLS, que usa a função `tem_permissao(recurso, acao)` dentro das políticas.
Ao criar uma tela nova, a pergunta certa não é "escondi o botão?", é "a política
da tabela cobre esta operação?".

### Estado atual da RLS (auditado)

- RLS ativa nas **71 tabelas**.
- **Nenhuma política concede acesso ao papel anônimo.** Verificado na prática:
  a tabela `clientes`, com 1.339 registros, retorna vazio para requisição sem
  login.
- O papel `anon` possui `GRANT` nas tabelas — isso é o padrão do Supabase e não
  é problema, porque a RLS bloqueia antes.
- `integracoes` tem RLS ativa e **zero políticas de propósito**: guarda
  credenciais de integração e é inalcançável pela API. O acesso se dá só pela
  função `integracao_estado()`. O linter do Supabase sinaliza essa tabela —
  é falso positivo, não "corrija".

### Funções `SECURITY DEFINER`

As RPCs do sistema rodam como `SECURITY DEFINER` e se protegem internamente com
`tem_permissao(...)`. São acessíveis ao papel `authenticated`, o que é o
desenho pretendido.

Atenção ao publicar uma função nova: o Postgres concede `EXECUTE` ao pseudo-papel
`PUBLIC` por padrão, o que a torna **acessível sem login**. Revogar só de `anon`
não resolve. O padrão correto:

```sql
revoke execute on function public.minha_funcao() from public;
grant  execute on function public.minha_funcao() to authenticated, service_role;
```

### Chaves no navegador

`VITE_SUPABASE_PUBLISHABLE_KEY` é embutida no bundle em tempo de build e fica
visível para qualquer visitante. Isso é esperado — é uma chave publicável. Quem
protege os dados é a RLS. Nunca coloque uma chave de serviço em variável `VITE_`.

### Primeiro acesso

O banco nasce sem usuários. **A primeira conta criada em "Solicitar acesso" vira
o administrador ativo** — é o bootstrap obrigatório, já que sem ele ninguém
poderia aprovar ninguém. Todas as contas seguintes nascem **pendentes**, sem
perfil e sem privilégio, até liberação por um administrador.

### Desempenho das políticas

Uma política de RLS roda para cada linha afetada. Se ela chama `auth.uid()`,
`tem_permissao()` ou qualquer função `STABLE` diretamente, essa chamada é
refeita linha a linha — mesmo quando o resultado depende só da sessão e não
muda entre as linhas.

Envolver a chamada em `(select ...)` faz o Postgres resolvê-la uma única vez,
como InitPlan. A semântica é idêntica; o custo cai de N avaliações para uma:

```sql
-- Evite:
with check (criado_por = auth.uid())
-- Prefira:
with check (criado_por = (select auth.uid()))
```

Isso já foi aplicado em `auditoria_inserir`, `evidencias_criar` e
`ia_conversas_criar`. O caso que mais pesava era `evidencias`: a recepção grava
várias fotos do veículo numa tacada só, então eram N avaliações por lote.
**Ao escrever política nova, use o `(select ...)` desde o início.**

### Pendências de desempenho deliberadamente não resolvidas

O linter aponta três grupos que **não** devem ser "corrigidos" às cegas:

- **38 chaves estrangeiras sem índice** (INFO). A maioria são colunas de
  auditoria (`criado_por`, `registrado_por`) que ninguém usa como filtro.
  Indexar todas custa escrita em toda inserção para benefício nenhum. Indexe
  sob demanda, quando uma consulta real ficar lenta.
- **88 índices nunca usados** (INFO). Não os remova agora: a base tem pouco
  uso real, então "nunca usado" significa "ainda não exercitado", não "inútil".
  A estatística só terá valor depois de alguns meses de operação.
- **36 tabelas com políticas permissivas múltiplas** (WARN). Vêm do padrão
  `X_ler` + `X_escrever`, ambas permissivas para SELECT. Consolidar mexe no
  desenho de segurança e exige reteste completo de permissões — só encare com
  tempo e com um caso de lentidão medido, nunca para zerar o relatório.

### Pendência conhecida

A proteção contra senhas vazadas do Supabase Auth está **desligada**. Ela cruza
a senha escolhida com a base do HaveIBeenPwned e recusa as comprometidas. Numa
oficina, onde senha fraca é a regra, vale ativar em
**Supabase → Authentication → Policies → Leaked password protection**.

---

## 6. Fluxo operacional

O menu numera as etapas porque elas têm ordem real:

```
01 Recepção → 02 Ordem de Serviço → 03 Checklist de Entrada
   → execução → 04 Checklist de Saída → 05 Saída do Pátio
```

**01 Recepção** — registra a entrada em `entradas_patio`. Identifica cliente e
veículo (RPC `garantir_cliente_e_veiculo`, que cria ou reaproveita ambos numa
operação só, evitando duplicidade de placa), consulta `ultimo_km_veiculo` e
registra avarias e evidências fotográficas da chegada.

A identificação pode começar por uma foto: a função de borda `placa` manda a
imagem para a Tecnoar IA já configurada na central (`ia_config` +
`integracoes` — sem chave nova nem fornecedor novo) e devolve campos. Foto da
placa preenche a placa; foto do CRLV preenche também marca, modelo, ano, cor,
renavam e chassi, e acha o proprietário pelo CPF/CNPJ em `documento_digitos`.
Campo ilegível volta nulo: a função não chuta, e nada é gravado sem o operador
conferir na tela. Ler foto exige modelo com visão: se a central estiver num
modelo de texto, a resposta diz qual trocar, e `PLACA_MODELO` aponta um modelo
com visão só para esta função. `PLACA_PROVEDOR=plate_recognizer` troca para um
ALPR dedicado (só placa, sem documento).

**02 Ordem de Serviço** — abre a OS ligada à entrada. Serviços, produtos,
mecânicos e apontamentos de tempo entram em tabelas próprias. `recalcular_totais_os`
consolida os valores; `encerrar_os` e `reabrir_os` controlam o ciclo, com
motivo obrigatório na reabertura.

**03/04 Checklists** — `iniciar_checklist` instancia um modelo
(`checklist_modelos`) numa execução (`checklists`), e `concluir_checklist`
a fecha. Respostas possíveis: `ok`, `nao_ok`, `nao_se_aplica`,
`nao_verificado`, `conforme`, `nao_conforme`. Item não conforme gera defeito e
pode gerar ação corretiva.

**Pátio** — `vw_patio` consolida a situação. As categorias de status
(`categoria_status_os`) são: `entrada`, `diagnostico`, `aprovacao`, `espera`,
`execucao`, `finalizacao`, `concluido`, `cancelado`. O Modo TV é a mesma
visão em tela cheia, para o telão da oficina.

**05 Saída do Pátio** — `situacao_para_saida` verifica se a OS pode sair;
`registrar_saida_patio` executa a liberação, registrando forma de pagamento,
valor, faturamento e parcelas.

**Pós-venda** — garantias (`garantias`), retornos com decisão
(`pendente`, `procedente`, `improcedente`, `cortesia`) e o laboratório de peças
em teste, com ciclo próprio: `recebida` → `aguardando_teste` → `em_teste` →
`aguardando_peca` → `reparada`/`reprovada` → `aguardando_cliente` → `entregue`.

---

## 7. Principais RPCs

| Função | Papel |
| --- | --- |
| `minhas_permissoes()` | Permissões efetivas da sessão |
| `tem_permissao(recurso, acao)` | Usada dentro das políticas de RLS |
| `garantir_cliente_e_veiculo(...)` | Cria ou reaproveita cliente e veículo |
| `ultimo_km_veiculo(veiculo)` | Última quilometragem registrada |
| `iniciar_checklist(...)` / `concluir_checklist(...)` | Ciclo do checklist |
| `reabrir_checklist(...)` / `excluir_checklist(...)` | Correções com motivo |
| `encerrar_os(os, forcar)` / `reabrir_os(os, motivo)` | Ciclo da OS |
| `recalcular_totais_os(os)` | Consolida valores da OS |
| `situacao_para_saida(os)` | Verifica se pode liberar |
| `registrar_saida_patio(...)` | Executa a saída e o faturamento |
| `movimentar_estoque(...)` | Entrada, saída, ajuste, reserva, liberação |
| `indicadores_patio()` · `indicadores_gestao(...)` · `indicadores_vendas(...)` · `indicadores_crm()` · `indicadores_estoque()` | Painéis |
| `performance_equipe(...)` · `alertas_gestao(...)` | Gestão |
| `sla_pecas_teste()` | SLA do laboratório |
| `integracao_estado(provedor)` · `omie_pendentes_de_envio()` | Integrações |
| `buscar_artigos(...)` · `publicar_artigo(...)` | Base técnica |

---

## 8. Integrações

### Omie (ERP)

Fluxo de mão dupla, em duas Edge Functions:

- **`omie`** traz da Omie: clientes, fornecedores, produtos, serviços, posição
  de estoque e pedidos de venda.
- **`omie-envio`** leva para a Omie: clientes, fornecedores, produtos e serviços
  criados aqui. Usa o UUID do Tecnoar como código de integração, então reenviar
  **atualiza em vez de duplicar**.

O mapeamento de campos é único e vive em
`supabase/functions/_compartilhado/mapa.ts`, documentado em
`supabase/functions/_dicionario-omie.md`.

> **Todo campo novo no cadastro de produtos precisa entrar nesse dicionário
> antes de aparecer na tela.** É o que impede o erro clássico de gravar preço de
> venda numa coluna chamada custo — erro que só aparece semanas depois, na
> conciliação.

Sincronizações ficam registradas em `sincronizacoes`, e divergências em
`conflitos_sincronizacao`.

### Inteligência artificial

Módulo de produto, não de desenvolvimento: a oficina configura seu próprio
provedor em **Sistema → Integrações**. Provedores suportados: Anthropic, OpenAI
e Gemini, além de transcrição de áudio. As chaves ficam em `ia_config`, e o
histórico em `ia_conversas` / `ia_mensagens`.

---

## 9. PWA

Configurado em `vite.config.ts` com `registerType: 'prompt'` — a atualização é
oferecida ao usuário, não imposta no meio de um checklist.

Decisão relevante: `navigateFallbackDenylist` exclui `/api`, `/rest/v1`,
`/auth/v1`, `/storage/v1` e `/functions/v1` do cache. **Dado operacional
desatualizado é pior do que um estado de erro honesto** — um mecânico não pode
ver a OS de ontem achando que é a de hoje.

Fontes do Google têm cache de longa duração; o resto do runtime não.

---

## 10. Infraestrutura e implantação

### Onde roda

VPS Hostinger `srv1950838` (KVM 8), IP `179.199.140.86`. Cada sistema da empresa
roda em seu próprio container, atrás de um proxy compartilhado:

```
Internet ─► :443 Traefik ─► rede "borda" ─┬─► checklist-tecnoar (:8080)
             (TLS automático)             └─► demais sistemas
```

Endereço: **https://checklist.tecnoarsistemas.com.br**
Certificado Let's Encrypt, renovação automática, HTTP redirecionado para HTTPS.

`borda` é uma rede Docker externa e compartilhada. É a única coisa em comum
entre os sistemas: nenhum enxerga processo, volume ou rede interna do outro.

### Arquivos

| Arquivo | Papel |
| --- | --- |
| `Dockerfile` | Build em dois estágios: node compila, nginx alpine serve |
| `docker-compose.yml` | Container do sistema e labels de roteamento |
| `deploy/nginx-app.conf` | nginx interno do container (HTTP puro, porta 8080) |
| `deploy/borda/docker-compose.yml` | Traefik. Vive em `/opt/borda` na VPS |
| `deploy/provisionar-vps.sh` | Docker, rede e firewall. Roda uma vez |
| `deploy/publicar.sh` | Deploy. É o comando do dia a dia |

### Publicar uma atualização

```bash
deploy/publicar.sh
```

O build acontece na VPS, dentro do Dockerfile. Se falhar, o container antigo
continua no ar — nada é trocado antes da imagem nova existir.

### Detalhes de cache que não são opcionais

Em `deploy/nginx-app.conf`:

- `/assets/*` tem hash no nome → cache de um ano, imutável.
- **`sw.js` e `index.html` vão com `no-store`.** Se o service worker entrar em
  cache, a versão instalada no celular da oficina congela e **nenhuma atualização
  chega mais** — sem erro visível. Não relaxe esses cabeçalhos.

### Adicionar outro sistema à mesma VPS

Não se toca no Traefik. No projeto novo, quatro labels no `docker-compose.yml`
(router, domínio, entrypoint, porta), um registro A no DNS apontando para
`179.199.140.86`, e `docker compose up -d`. O certificado é emitido sozinho.
Modelo pronto em [deploy/README.md](deploy/README.md).

### Armadilha registrada

O Traefik **v3.3 não conversa com o Docker 29**: negocia a versão 1.24 da API,
abaixo do mínimo 1.40 aceito pelo daemon, e simplesmente não enxerga os
containers — sem erro no compose, só certificado que nunca sai. A stack usa
v3.6 com `DOCKER_API_VERSION` fixado. Se aparecer "client version 1.24 is too
old" nos logs do Traefik, é isso.

---

## 11. Diagnóstico

```bash
docker ps                                  # o que está no ar
docker logs -f checklist-tecnoar           # log da aplicação
docker logs -f traefik                     # roteamento e certificados
docker compose -f /opt/checklist-tecnoar/docker-compose.yml restart
```

Verificações rápidas de saúde:

```bash
curl -sI https://checklist.tecnoarsistemas.com.br/          # deve dar 200
curl -sI https://checklist.tecnoarsistemas.com.br/sw.js | grep -i cache-control
                                                            # deve dizer no-store
```

| Sintoma | Causa provável |
| --- | --- |
| Atualização não chega nos aparelhos | Cabeçalho de cache do `sw.js` alterado |
| Certificado não emite | DNS não aponta para a VPS, ou porta 443 fechada |
| Tela abre vazia sem erro | RLS bloqueando: falta política ou permissão no perfil |
| RPC retorna 401 | Falta `grant execute ... to authenticated` |
| Tipos divergentes em produção | `src/tipos/supabase.ts` não regerado após migração |

---

## 12. Ambiente de desenvolvimento

```bash
npm install
npm run dev        # servidor local
npm run build      # verificação de tipos + build de produção
npm run typecheck  # só os tipos
```

Variáveis em `.env` (copie de `.env.example`):

| Variável | Descrição |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave publicável (o acesso real é da RLS) |

### Identidade visual

Três versões oficiais em `public/brand/`: `tecnoar-negativo.svg` (fundos
escuros), `tecnoar-positivo.svg` (fundos claros) e `tecnoar-mono.svg`.
O componente `<Logo>` escolhe sozinho conforme o tema. Não criar símbolo
reduzido alternativo nem recolorir a marca.

Paleta: Navy `#081830` · Laranja `#FC6400` · Ciano `#00A8E8`.

---

## 13. SOS Tecnoar

Socorro mecânico com acompanhamento em tempo real, ligado ao Checklist. Três
ambientes, um banco:

| Ambiente | Onde | Quem usa |
| --- | --- | --- |
| **Central SOS** | Checklist → menu **SOS Tecnoar** (`/sos`) | Equipe com permissão `sos` |
| **App do cliente** | `https://sos.tecnoarsistemas.com.br` (subdomínio próprio) | Proprietário ou motorista |
| **App do mecânico** | o mesmo endereço, entrando com o usuário do Checklist | **Todo usuário ativo do Checklist** |

O app é outro aplicativo: build `vite.app.config.ts` (sai em `dist/app`),
servido pelo mesmo container num `server` próprio do nginx e num roteador
próprio do Traefik (certificado separado). O endereço fica em
`src/sos/endereco.ts` (`URL_APP_SOS`, `URL_CHECKLIST`; `VITE_SOS_URL` e
`VITE_CHECKLIST_URL` trocam). Links antigos `…/app/…` redirecionam, e os links
de notificação gravados como `/app/...` são convertidos pelo app e pelo
service worker (`public/sw-notificacoes.js`).

O Checklist continua sendo a fonte da verdade: cliente, veículo, produto,
serviço, mecânico e OS são os mesmos registros — o SOS nunca cadastra em
paralelo. Os produtos e serviços lançados no atendimento vêm do catálogo
(com preço e estoque) e viram itens da OS.

### Ativação (uma vez)

1. Banco: aplicar **todas** as migrações `supabase/migrations/20260912_*` em
   diante, **na ordem**, num banco que ainda não tem o SOS (em produção isso
   já foi feito — confira em `supabase/historico-producao/`). **Nunca reaplique
   um arquivo antigo sozinho**: várias funções foram redefinidas em migrações
   posteriores, e rodar de novo o `20260912_sos_tecnoar.sql` volta essas
   funções à versão antiga sem dar erro. Mudança nova = migração nova.
2. Regerar `src/tipos/supabase.ts` (a camada `src/sos/api.ts` funciona sem
   isso, mas o tipo gerado passa a conhecer as tabelas `sos_*`).
3. Na Central → **Configurações**: modo de distribuição, velocidade média,
   telefone da central e, se quiser, WhatsApp (Evolution API).
4. Mecânicos: todo usuário ativo do Checklist entra no app. Cada um toca
   **Ficar disponível** — só aí passa a aparecer no despacho da central (quem
   tem função "atua como mecânico" aparece desde o início).

Sem a migração, as telas do SOS mostram "O SOS Tecnoar ainda não foi ativado
no banco de dados" — nada quebra no restante do sistema.

### Fluxo de um chamado

```
cliente toca SOS ──► sos_abrir_chamado ──► status recebido/procurando_mecanico
                                              │  notifica central (sino + push + sirene)
                                              │  notifica mecânicos DISPONÍVEIS
                                              │  WhatsApp (se configurado)
mecânico aceita ──► sos_aceitar ─────────► a_caminho  (posição ao vivo nos 2 lados)
"Cheguei"       ──► sos_avancar ─────────► no_local
"Iniciar"       ──► sos_avancar ─────────► servico_iniciado  (diagnóstico, itens, fotos)
"Finalizar"     ──► sos_avancar ─────────► servico_finalizado ──► OS gerada sozinha
cliente avalia  ──► sos_avaliar ─────────► concluido
```

A ordem é regra do banco (`sos_avancar` recusa pular etapa). Cliente cancela
até a etapa configurada; mecânico nunca cancela; a central cancela com
permissão `sos:cancelar` e motivo obrigatório. Toda mudança fica em
`sos_eventos` (linha do tempo) e as ações da central em `auditoria`.

### Contas

- **Cliente**: entra pelo mesmo Supabase Auth, com `tipo_conta = 'sos_cliente'`
  nos metadados. Vira `sos_contas_cliente` ligado a um `clientes` existente
  (por CPF/CNPJ ou celular) ou criado na hora. **Nunca** vira linha em
  `usuarios`: o gatilho `sos_ignorar_conta_cliente` descarta o "pedido de
  acesso" automático e o Checklist redireciona essa conta para o app do SOS.
- **Mecânico**: qualquer `usuarios` ativo usa o app de atendimento
  (`sos_eh_mecanico`, `20260917_sos_toda_equipe_no_app.sql`). Mapa e
  sugestão de despacho da central listam quem tem função de mecânico ou ficha
  em `sos_mecanicos` — a ficha nasce quando a pessoa define a situação no app.
  Situação: disponível · em atendimento · pausa · indisponível · offline. Só
  **disponível** recebe chamado automático.
- **Central**: `usuarios` com `sos:visualizar` (admins sempre).
- **Equipe também cliente** (`20260918_sos_equipe_tambem_cliente.sql`): um
  funcionário ativo pode ter conta de cliente (`sos_registrar_conta` aceita;
  `sos_meu_papel` devolve `cliente` junto). No app, `CartaoModoApp` alterna
  entre o app do mecânico e o do cliente (modo guardado no aparelho,
  `app/src/sessao.tsx`). No chamado, o papel sai do vínculo com ele
  (`sos_papel_no_chamado`: dono do pedido = cliente, mecânico dele =
  mecânico); `sos_abrir_chamado` só usa o fluxo da central quando ela informa
  `cliente_id`. A Tecno IA técnica do mecânico é a ação `atendimento` com
  `perfil: 'tecnico'` (`sosIaTecnica`).

### Tabelas

`sos_chamados` (o chamado e todos os carimbos de tempo), `sos_eventos`
(linha do tempo), `sos_posicoes` (rastro GPS; apagado 30 dias após encerrar —
LGPD), `sos_mensagens` (chat), `sos_itens` (produtos/serviços do catálogo,
espelhados na OS por `os_item_id`), `sos_anexos` (fotos, áudios, vídeos no
bucket privado `sos`, pasta = id do chamado), `sos_mecanicos` (situação e
posição), `sos_recusas`, `sos_compartilhamentos` (link público temporário),
`sos_agendamentos`, `sos_lembretes` (revisão por tempo/km, gerados todo dia
pelo `pg_cron`), `sos_contatos_emergencia`, `sos_contas_cliente`,
`sos_config` (linha única).

Leitura por RLS (cada lado só vê o que é seu); escrita quase sempre por RPC
`security definer`. O cliente final ganha políticas **adicionais** de leitura
só dos próprios registros em `clientes`, `veiculos`, `ordens_servico`,
`os_servicos`, `os_produtos` e `eventos_veiculo`.

### Tempo real

Supabase Realtime sobre `sos_chamados`, `sos_posicoes`, `sos_mensagens`,
`sos_eventos`, `sos_itens`, `sos_anexos`, `sos_mecanicos` e
`sos_agendamentos`. O Realtime respeita a RLS. O mecânico manda posição a
cada ~25 m / 15 s durante o chamado; disponível sem chamado, a cada ~150 m /
2 min. A previsão de chegada é recalculada no servidor a cada posição.

Quando o canal cai (túnel, aparelho dormindo), as telas não dependem dele:
cada consulta tem intervalo de segurança e recarrega ao voltar o foco ou a
internet.

### Vigia (`sos_vigiar`, pg_cron a cada 30 s)

O que garante que nenhum SOS fica esquecido, com todas as telas fechadas:

| Situação | O que acontece |
| --- | --- |
| Ninguém aceitou no prazo (`tempo_aceite_seg`) | Nível 1: mecânicos disponíveis (menos quem recusou) e central avisados de novo. 3× o prazo: central acionada, WhatsApp, cliente tranquilizado. 6×: alerta máximo. |
| Mecânico escolhido pela central não respondeu | Modo inteligente: o SOS volta para todos. Modo manual: central e mecânico avisados. |
| Deslocamento além de 1,5× a previsão inicial + 10 min | Central avisada ("atrasado"). |
| 8 min sem posição do mecânico em deslocamento | Central avisada e o mecânico recebe push para reabrir o app. |
| Serviço finalizado sem avaliação por `concluir_apos_horas` | Concluído automaticamente. |
| "Disponível" sem sinal do app por `offline_apos_min` | Vira offline (sai do despacho) e o mecânico é avisado. |

Cada aviso é marcado no chamado (`alerta_nivel`, `atraso_avisado_em`,
`sinal_avisado_em`) e sai uma vez só; a espera recomeça (`espera_desde`) quando
o chamado é atribuído ou volta para a fila. O app do mecânico manda um pulso
(`sos_pulso`) por minuto com a tela aberta, gravado em `sos_presenca` — fora
do Realtime, para não acordar a central a cada minuto. A central vê os avisos
nos cartões e a sirene volta a tocar quando um SOS é escalado.

Limite da plataforma: app instalado pelo navegador não manda GPS com a tela
bloqueada. O vigia detecta e avisa; só um app de loja resolveria.

O vigia também avisa quando estoura o **prazo de chegada de um contrato**, e a
central vê a saúde dele (`sos_vigia_status`: última execução no pg_cron,
falhas na última hora).

### Atendimento premium (`20260914_sos_premium_ia.sql`)

- **Orçamento pelo app**: o mecânico (ou a central) envia com o mecânico no
  local (`sos_enviar_orcamento`); o cliente aprova **assinando** na tela — a
  assinatura vai para o bucket `sos` como anexo — ou recusa
  (`sos_responder_orcamento`). A central pode registrar a resposta dada por
  telefone, sempre com observação. Com `exigir_aprovacao_orcamento`, o serviço
  só começa com orçamento aprovado (trava no gatilho `sos_chamados_antes`).
  Item alterado depois da resposta marca `orcamento_desatualizado`.
- **Taxa de deslocamento**: na chegada (`no_local`), o gatilho
  `sos_chamados_deslocamento` lança o item de deslocamento (km do aceite ×
  valor do km, com taxa mínima; ida e volta opcional), que segue para a OS.
  Valores do contrato do cliente têm prioridade.
- **Contratos de frotistas** (`sos_contratos`): um ativo por cliente, com prazo
  de chegada (SLA), prioridade mínima e valor de km próprios; o chamado herda
  prazo e prioridade ao nascer. Relatórios mostram % no prazo.
- **Mapa de calor** nos relatórios (`pontos`, agregados a ~1 km).
- **Laudo em PDF** (`src/sos/laudo.ts`, sobre `src/documentos/pdf.ts`):
  cliente, veículo, linha do tempo, diagnóstico, itens, orçamento com
  assinatura, fotos e avaliação. No celular vai em dois toques
  (`useLaudoSOS`): o 1º monta o PDF, o 2º abre a folha de compartilhar — o
  Safari do iPhone só a abre direto do toque.

### OS em campo (`20260919_sos_os_em_campo.sql`)

O mecânico gera a OS pelo app logo na chegada (`sos_gerar_os`). O gatilho
`sos_chamados_texto_os` leva diagnóstico, serviço e observações registrados
depois para a OS — sem trocar o que a oficina já editou nela e nunca em OS
encerrada — e, na finalização sem serviço do catálogo, lança "Socorro: …"
como linha para precificar. A quilometragem lida no painel entra por
`sos_registrar_km` (veículo e OS; recusa km menor que o do cadastro).

### OS e estoque no app (`20260921_sos_os_e_estoque_no_app.sql`)

Produtos e serviços do app são **o cadastro do sistema** (`produtos`,
`servicos`, sincronizados com a Omie) — `sos_catalogo` lista tudo, com termo
vazio e paginação (`20260922`). Estoque:

```
disponível = saldo (Omie) − reservado (Omie) − comprometido (Tecnoar)
comprometido = peças de OS aberta (estado necessário/reservado/utilizado)
             + peças lançadas em chamado SOS que ainda não entraram em OS
```

A Omie é a dona do saldo (a sincronização sobrescreve `saldo`/`reservado`); o
Tecnoar só desconta o que já prometeu. Peça lançada no chamado fica
**reservada até a OS ser efetivada** (encerrada) ou o chamado cancelado. Na OS
ela entra como `reservado` (havia estoque) ou `necessario` (faltou — a central
recebe "Peça sem estoque") e vira `utilizado` na finalização do socorro.

O mecânico vê e mexe nas OS dele pelo app (`sos_minhas_os`, `sos_os_detalhe`,
`sos_os_adicionar_item`, `sos_os_alterar_item`, `sos_os_atualizar`); OS de
socorro aberto recebe item pelo chamado (os dois lados iguais). Abrir OS pelo
app (`sos_os_buscar_veiculo`, `sos_os_criar`) exige `ordens_servico:criar`.
Tudo registra `os_eventos` ("… pelo app SOS").

### Chamado aberto pelo mecânico (`20260922_sos_chamado_pelo_mecanico.sql`)

Além de aceitar da fila, o mecânico abre o próprio chamado
(`sos_mecanico_abrir_chamado`, app `/novo-chamado`): acha o cliente por nome,
telefone, documento ou placa (`sos_buscar_cliente_campo`, com a OS aberta de
cada veículo) ou cadastra na hora (mesmo celular = mesmo cliente; a central é
avisada para completar o cadastro). Nasce já com ele — `no_local` (está com o
cliente) ou `a_caminho` (distância e previsão calculadas) — com origem
`mecanico`, na mesma fila/mapa da central. Um atendimento aberto por vez.
Ponto marcado à mão no mapa vai com `ponto_ajustado`
(`20260923_sos_ponto_ajustado_mecanico.sql`), como no pedido do cliente.
Pode abrir OS nova junto ou **ligar à OS já aberta** do veículo
(`sos_os_para_vincular` + `sos_vincular_os`, que também vale no atendimento e
para a central): os itens do chamado vão para a OS.

Entrada do app: cliente em `/entrar`, mecânico em `/mecanico/entrar` (usuário
e senha do sistema; conta de cliente é recusada ali). O aparelho lembra a
última porta (`sos.entrada`); pessoa da equipe que entra pela porta do cliente
usa o app como cliente.

GPS: `posicaoPrecisa` (`src/sos/geo.ts`) só aceita leitura nova (sem cache),
vai trocando pela melhor e para em ±10 m (ou na melhor em até 45 s);
`acompanharPosicao` descarta o "pulo" de leitura de antena logo depois de uma
de GPS.

### Sem sinal no campo (`20260916_sos_hora_do_aparelho.sql`)

O app do mecânico guarda no aparelho as ações feitas sem internet (etapas,
diagnóstico, mensagens) e envia sozinho quando o sinal volta, na ordem
(`app/src/mecanico/filaOffline.ts`). Etapa que sai com mais de 1 min de atraso
leva `registrado_no_aparelho_em`, e `sos_avancar` usa essa hora para
`chegou_em`, tempos e SLA — só se for passada, de no máximo 12 h, e nunca antes
da etapa anterior; fora disso vale a hora do servidor. O evento guarda
`hora_da_etapa`.

### IA do SOS (função `sos-ia`)

Configurada **dentro da Gestão SOS** (Configurações): provedor (Anthropic,
OpenAI ou Gemini), modelo, chave própria (gravada em `privado.config`, nunca
volta para a tela) ou a mesma chave da Tecnoar IA (`integracoes`), recursos
ligados e limite diário por cliente. Ações da função:

| Ação | Quem | O que faz |
| --- | --- | --- |
| `atendimento` | cliente (TECNO IA) | Triagem por conversa, com foto; segurança primeiro; sugere abrir o SOS (tipo, prioridade, descrição) ou agendar. |
| `foto` | quem vê o chamado | Analisa uma foto do chamado e registra na linha do tempo. |
| `kit` | mecânico / central | O que levar: hipóteses, ferramentas, cuidados e peças conferidas no catálogo do Checklist (preço e estoque). |
| `resumo` | mecânico / central | Registro técnico (diagnóstico, serviço, observações) para a OS. |
| `testar` | central (`configurar`) | Confere provedor, modelo e chave. |

Tudo que o usuário vê passa pela sessão dele (as RPCs conferem o acesso ao
chamado); a chave de serviço só lê a credencial (`sos_ia_credencial`, fechada
para contas logadas) e grava o uso em `sos_ia_mensagens`. Erros temporários
do provedor (429/5xx) têm uma segunda tentativa automática. Sem internet, o
app volta para o guia rápido offline.

### LGPD

Termos de uso e política de privacidade no app; o cliente exclui a própria
conta (`sos_excluir_minha_conta`): saem conta, rastro de localização,
contatos de emergência e conversas com a IA; o histórico de serviço da
empresa (chamados e OS) fica, sem vínculo com a conta.

### Testes

`npm run test:sos` — todas as migrações do SOS num PostgreSQL local (PGlite)
com o ciclo completo (135 etapas) + impressão digital das funções para
comparar com o banco real (ver `scripts/testes-sos/LEIA-ME.md`).

### Mapas

Base OpenStreetMap (sem chave; tema escuro por filtro de cor), rota pelo OSRM público com
fallback para linha reta × 1,3 e velocidade média da configuração, endereço
pelo Nominatim (1 consulta/s, com cache). "Ir até o cliente" abre Google Maps,
Waze ou Apple Maps.

### Código

| Caminho | Conteúdo |
| --- | --- |
| `src/sos/` | Camada compartilhada: tipos, API (uma função por RPC), rótulos, GPS/rota, mapa, tempo real, alerta sonoro, componentes (chat, galeria, itens do catálogo, linha do tempo) |
| `src/paginas/sos/` | Central SOS no Checklist |
| `src/layout/AlertaSOS.tsx` | Alerta global de novo SOS (sirene + banner) em qualquer tela do Checklist |
| `app/` | App SOS (cliente e mecânico): build próprio (`vite.app.config.ts`), manifesto "SOS Tecnoar", service worker próprio, servido na raiz de `sos.tecnoarsistemas.com.br` |

`npm run build` gera os dois: `dist/` (Checklist) e `dist/app/` (App SOS).
`npm run dev:app` sobe o app em `http://localhost:5174/`.

### WhatsApp (opcional)

Evolution API, disparada pelo banco (`pg_net`) **depois** que o chamado já
existe — canal complementar, nunca condição. A chave fica em `privado.config`
(`sos_whatsapp_apikey`) e nunca volta para o navegador.
