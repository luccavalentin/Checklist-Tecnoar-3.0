# E-mails de conta

Os quatro e-mails que o sistema manda sozinho: confirmação de cadastro,
recuperação de senha, troca de endereço e convite de acesso. São os únicos
pontos em que a Tecnoar aparece na caixa de entrada de alguém — por isso não
são o padrão cinza do Supabase.

| Arquivo | Quando dispara | Gatilho no código |
| --- | --- | --- |
| `confirmacao.html` | cadastro novo no app | `supabase.auth.signUp` |
| `recuperacao.html` | esqueci a senha | `supabase.auth.resetPasswordForEmail` |
| `troca-email.html` | troca de endereço da conta | `supabase.auth.updateUser` |
| `convite.html` | conta criada pela central | função `admin-usuarios` |

Não há template de link mágico porque o sistema não usa login sem senha.

## Servem os dois sistemas

Checklist e SOS dividem o mesmo projeto Supabase e a mesma tabela de contas,
então **estes quatro templates valem para os dois**. Não existe um conjunto de
e-mails para o Checklist e outro para o app: quem redefine a senha no painel
da central recebe o mesmo `recuperacao.html` que o motorista recebe no
celular. Por isso o texto fala de "sua conta Tecnoar" e não de um produto só.

Quem decide para onde o link leva não é o template, é o sistema que disparou:

| Pediu em | Volta para |
| --- | --- |
| `checklist.tecnoarsistemas.com.br` | `…/nova-senha` do Checklist |
| `sos.tecnoarsistemas.com.br` | `…/nova-senha` do app SOS |

Isso funciona porque as duas telas de "Esqueci a senha" mandam
`redirectTo: window.location.origin + '/nova-senha'`, cada uma com o próprio
endereço. **Mas o Supabase só obedece a endereços autorizados.** Em
Authentication → URL Configuration → Redirect URLs precisam constar:

```
https://checklist.tecnoarsistemas.com.br/**
https://sos.tecnoarsistemas.com.br/**
```

Faltando um deles, o link do e-mail ignora o destino e joga a pessoa no Site
URL padrão — na prática, o funcionário do Checklist cai no app do motorista, e
acha que o link está quebrado. Conferir isso é parte da configuração, não
detalhe.

## Como foram feitos

E-mail não é página web: Outlook renderiza com o motor do Word, Gmail corta o
`<style>` em alguns casos e **a maioria dos clientes bloqueia imagem por
padrão**. O que foi feito por causa disso:

- **Tabelas, não `flex` nem `grid`.** É o único layout que todo cliente entende.
- **Estilo embutido em cada elemento.** O `<style>` do topo serve só para o
  modo escuro e para telas estreitas; se for descartado, o e-mail continua
  inteiro.
- **Marca em texto, não em imagem.** A assinatura "TECNOAR" com o fio
  laranja-ciano é HTML puro: aparece igual com imagens bloqueadas, que é como
  boa parte das pessoas vê o primeiro e-mail de um remetente novo. Quando
  houver um PNG da logo hospedado (SVG não funciona em e-mail), dá para trocar
  — mas aí o `alt` precisa carregar o nome, porque muita gente nunca vai ver a
  imagem.
- **Botão à prova de Outlook.** O trecho `<!--[if mso]>` desenha o botão em
  VML; o resto do mundo usa o `<a>` normal.
- **Link em texto embaixo do botão.** Cliente de e-mail corporativo reescreve
  ou quebra link; ter o endereço copiável evita o suporte.
- **Modo escuro de verdade.** Quem lê no celular à noite recebe o e-mail
  escuro, não um retângulo branco.
- **Prévia da caixa de entrada.** A primeira linha que aparece ao lado do
  assunto é escrita de propósito, em vez de o cliente pegar o começo do HTML.
- **O "não foi você" fecha todo e-mail de segurança**, dizendo o que acontece
  se a pessoa ignorar — é o que separa um e-mail confiável de um que parece
  golpe.

## Variáveis

O GoTrue troca na hora do envio:

| Variável | O que vira |
| --- | --- |
| `{{ .ConfirmationURL }}` | o link de ação, com o token |
| `{{ .Email }}` | o endereço do destinatário |
| `{{ .SiteURL }}` | o endereço do sistema |
| `{{ .Token }}` | o código de 6 dígitos, se for usar código em vez de link |

## Assuntos sugeridos

| Template | Assunto |
| --- | --- |
| `confirmacao.html` | Confirme seu e-mail — SOS Tecnoar |
| `recuperacao.html` | Redefinir sua senha — Tecnoar |
| `troca-email.html` | Confirme seu novo e-mail — Tecnoar |
| `convite.html` | Seu acesso ao Sistema Operacional Tecnoar |

Sem emoji e sem "!!!": e-mail de conta que parece propaganda cai em spam e
perde a confiança de quem precisa justamente confiar nele.

## Aplicar — Supabase hospedado (hoje)

1. **Painel → Authentication → Emails → SMTP Settings**, ativar SMTP próprio:

   | Campo | Valor |
   | --- | --- |
   | Host | `smtp-pulse.com` |
   | Porta | `465` (SSL) ou `587` (TLS) |
   | Usuário | o login SMTP da conta SendPulse |
   | Senha | a **senha SMTP**, gerada em SMTP → Configurações → Geral |
   | Remetente | `sistemas@tecnoarfreios.com.br` |
   | Nome | `Tecnoar` |

   A senha SMTP **não é** a senha de entrar no SendPulse: é outra, gerada no
   painel. E o endereço remetente precisa estar verificado lá antes do primeiro
   envio, senão o SendPulse recusa.

2. **Authentication → Emails → Templates**: colar o conteúdo de cada arquivo
   no template correspondente e ajustar o assunto.

Sem SMTP próprio, o Supabase limita o envio a poucos e-mails por hora e manda
do domínio dele — o que, para recuperação de senha, significa cliente sem
acesso e ligação para a central.

## Aplicar — Supabase na VPS (depois da migração)

O GoTrue lê os templates por URL, não por colagem. Os arquivos estão copiados
em `public/emails/`, então saem no build e já ficam servidos:

```
GOTRUE_MAILER_TEMPLATES_CONFIRMATION = https://checklist.tecnoarsistemas.com.br/emails/confirmacao.html
GOTRUE_MAILER_TEMPLATES_RECOVERY     = https://checklist.tecnoarsistemas.com.br/emails/recuperacao.html
GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE = https://checklist.tecnoarsistemas.com.br/emails/troca-email.html
GOTRUE_MAILER_TEMPLATES_INVITE       = https://checklist.tecnoarsistemas.com.br/emails/convite.html

GOTRUE_SMTP_HOST        = smtp-pulse.com
GOTRUE_SMTP_PORT        = 465
GOTRUE_SMTP_USER        = <login SMTP do SendPulse>
GOTRUE_SMTP_PASS        = <senha SMTP do SendPulse>
GOTRUE_SMTP_ADMIN_EMAIL = sistemas@tecnoarfreios.com.br
GOTRUE_SMTP_SENDER_NAME = Tecnoar
GOTRUE_SMTP_MAX_FREQUENCY = 10s
```

`MAX_FREQUENCY` existe por causa do teto de 50 por hora do plano gratuito: ele
impede que um pico de cadastros estoure a cota e deixe o resto da fila sem
e-mail nenhum.

`supabase/emails/` é a origem; `public/emails/` é a cópia publicada. Mexeu num,
copie para o outro — se divergirem, vale o que está em `public/`, porque é o
que o GoTrue lê.

## Antes de confiar

Mandar um de cada para uma conta Gmail e uma Outlook, e conferir:

- [ ] chega na caixa de entrada, não no spam
- [ ] com imagens bloqueadas continua legível
- [ ] no celular, no escuro, o texto tem contraste
- [ ] o botão abre o endereço certo
- [ ] o link em texto pode ser copiado inteiro
- [ ] o remetente aparece como "Tecnoar", não como um endereço cru

O domínio precisa estar verificado no SendPulse com SPF e DKIM, senão o Gmail
marca como suspeito mesmo com o conteúdo correto.

## Limites do plano gratuito do SendPulse

| Limite | Valor |
| --- | --- |
| Por mês | 12.000 e-mails |
| Por dia | 400 |
| Por hora | 50 |
| Tamanho da mensagem | 1 MB |
| Endereços remetentes | 2 a 3, conforme a conta |

Os templates daqui pesam cerca de 9 KB, bem abaixo do teto de 1 MB. O limite
que importa é o de **50 por hora**: folgado para o movimento de hoje, mas é o
primeiro a estourar num mutirão de cadastro da equipe. Se isso acontecer, o
e-mail não atrasa — ele simplesmente não sai, e quem está esperando a
recuperação de senha liga para a central.

O acesso ao SMTP só aparece depois que o SendPulse ativa o perfil da conta;
não é imediato ao cadastrar.
