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
│  └── Edge Funcs  omie, omie-envio           │
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
| Interface | React 18, TypeScript 5.7 |
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
  functions/       Edge Functions (omie, omie-envio) e o dicionário de campos
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
