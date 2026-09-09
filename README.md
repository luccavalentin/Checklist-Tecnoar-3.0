# Sistema Operacional Tecnoar

Sistema de gestão da oficina Tecnoar Freios: recepção, ordens de serviço, pátio,
checklists técnicos e laboratório de peças.

## Documentação

- **[DOCUMENTACAO-TECNICA.md](DOCUMENTACAO-TECNICA.md)** — arquitetura, modelo de
  dados, segurança e RLS, fluxos, integrações, implantação e diagnóstico.
- **[MANUAL-DO-USUARIO.md](MANUAL-DO-USUARIO.md)** — uso no dia a dia da oficina.
- **[deploy/README.md](deploy/README.md)** — infraestrutura da VPS.

> **Regra do projeto:** nada de dado fictício. Sem dado real → estado vazio.
> Erro → estado de erro com nova tentativa. Resultado zero → zero.
> Nenhum botão pode parecer funcional sem funcionar.

## Rodar

```bash
npm install
npm run dev
```

Build de produção e verificação de tipos:

```bash
npm run build
```

## Configuração

Copie `.env.example` para `.env` e preencha:

| Variável | Descrição |
| --- | --- |
| `VITE_SUPABASE_URL` | URL do projeto Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave publicável (o acesso real é controlado por RLS) |

## Primeiro acesso

O banco começa sem nenhum usuário. **A primeira conta criada em
“Solicitar acesso” vira o administrador ativo do sistema** — é o bootstrap
obrigatório, sem ele ninguém poderia aprovar ninguém.

Todas as contas seguintes nascem **pendentes**, sem perfil de acesso e sem
privilégio administrativo, até que um administrador as libere.

## Stack

- **Vite + React + TypeScript**
- **Tailwind CSS v4** — tokens de tema em `src/styles/theme.css`
- **React Router** — rotas com carregamento sob demanda
- **TanStack Query** — cache e revalidação de dados
- **Supabase** — Auth, Postgres com RLS, Storage e Edge Functions
- **vite-plugin-pwa** — aplicativo instalável

## Organização

```
src/
  auth/          sessão, rotas protegidas
  busca/         registro de fontes da Busca Global
  componentes/
    marca/       logo oficial (3 versões)
    ui/          design system: botões, campos, tabela, estados, sobreposições
  layout/        shell do app, navegação, topo, notificações, ajuda
  lib/           cliente Supabase e utilitários
  paginas/       telas
  tema/          tema claro/escuro
  tipos/         tipos gerados do banco
design/          artboards da direção visual e vetores da marca
supabase/
  functions/     código das Edge Functions (omie, omie-envio) e o
                 dicionário de campos Tecnoar ↔ Omie
```

### Adicionando um módulo

1. Rota e ícone em `src/layout/navegacao.ts` (o menu é gerado a partir daí).
2. Tela em `src/paginas/…`, montada sobre os componentes de `componentes/ui`.
3. Registrar a tela em `TELAS` no `src/App.tsx`. Rotas sem tela registrada caem
   em `ModuloPendente`, que declara honestamente que o módulo não está no ar.
4. Se o módulo tiver busca, registrar uma fonte em `src/busca/`.

### Identidade visual

Três versões oficiais em `public/brand/`: `tecnoar-negativo.svg` (fundos
escuros), `tecnoar-positivo.svg` (fundos claros) e `tecnoar-mono.svg`.
O componente `<Logo>` escolhe sozinho conforme o tema.
Não criar símbolo reduzido alternativo nem recolorir a marca.

Paleta: Navy `#081830` · Laranja `#FC6400` · Ciano `#00A8E8`.

### Integração Omie

O fluxo é de mão dupla:

- **`omie`** traz da Omie: clientes/fornecedores, produtos, serviços, posição
  de estoque e pedidos de venda.
- **`omie-envio`** leva para a Omie: clientes, fornecedores, produtos e
  serviços criados aqui. Usa o UUID do Tecnoar como código de integração, então
  reenviar atualiza em vez de duplicar.

O mapeamento de campos é único e vive em
`supabase/functions/_compartilhado/mapa.ts`, documentado em
`supabase/functions/_dicionario-omie.md`. **Todo campo novo no cadastro de
produtos precisa entrar nesse dicionário antes de aparecer na tela** — é o que
impede o erro clássico de gravar preço de venda numa coluna chamada custo.

### Banco de dados

Migrações aplicadas via Supabase. Após qualquer mudança de schema, regerar
`src/tipos/supabase.ts` a partir dos tipos do projeto.

Tabelas da fundação: `usuarios`, `perfis_acesso`, `notificacoes`,
`artigos_ajuda`, `dados_empresa`, `auditoria` — todas com RLS ativa.
