# Manual do Usuário — Sistema Operacional Tecnoar

Guia de uso do dia a dia na oficina. Não é preciso saber nada de informática
para seguir este manual.

Endereço do sistema: **https://checklist.tecnoarsistemas.com.br**

---

## 1. Primeiros passos

### Entrar no sistema

Abra o endereço no navegador e informe o e-mail e a senha que a Tecnoar
forneceu. Se esqueceu a senha, use **Esqueci minha senha** na própria tela.

### Ainda não tem conta

Clique em **Solicitar acesso** e preencha seus dados. Sua conta fica
**aguardando liberação** até que um administrador aprove e defina o que você
pode acessar. Enquanto isso, ao entrar você verá um aviso de acesso pendente —
é normal, não é erro.

### Instalar no celular ou tablet

O sistema funciona como aplicativo. No navegador do aparelho, abra o menu e
escolha **Instalar aplicativo** (ou **Adicionar à tela de início**). Ele passa a
abrir como app, em tela cheia, com ícone próprio.

Vale a pena instalar em quem trabalha no pátio: a câmera para fotos das avarias
funciona melhor, e o acesso fica a um toque.

### Quando aparecer aviso de atualização

De tempos em tempos surge um aviso de que há uma versão nova. Aceite quando
estiver num bom momento — o sistema não interrompe o que você está fazendo para
se atualizar sozinho. Se estiver no meio de um checklist, termine primeiro.

### Por que não vejo todos os menus

O sistema mostra apenas o que o seu perfil permite. Se falta um menu que você
precisa, fale com o administrador — não é defeito.

---

## 2. Como o sistema está organizado

O menu segue a ordem real do trabalho. Os itens numerados são o caminho do
veículo, da chegada à entrega:

```
01 Recepção  →  02 Ordem de Serviço  →  03 Checklist de Entrada
      →  execução do serviço  →  04 Checklist de Saída  →  05 Saída do Pátio
```

Os demais grupos apoiam esse caminho:

| Grupo | Para que serve |
| --- | --- |
| **Início** | Visão geral do dia |
| **Cadastros** | Clientes, veículos, produtos, serviços, equipe |
| **Operação** | O caminho do veículo, pátio, garantias, peças em teste |
| **Relacionamento** | CRM e follow-up com o cliente |
| **Comercial** | Estoque |
| **Gestão** | Financeiro, indicadores, performance, checklist 5S |
| **Inteligência** | Base técnica, e-books e a Tecnoar IA |
| **Sistema** | Configurações, permissões, integrações |

---

## 3. O caminho do veículo

### 01 — Recepção

É onde o veículo entra no sistema. Registre:

1. **Cliente e veículo.** Comece pela placa. Se o veículo já esteve aqui, o
   sistema reconhece e traz os dados — não cadastre de novo. Se for a primeira
   vez, cadastre na hora.
2. **Quilometragem.** O sistema mostra o último km registrado, para conferência.
3. **Avarias.** Marque no mapa do veículo o que já chegou danificado: batido,
   riscado, amassado, quebrado, faltante ou trincado.
4. **Fotos.** Registre o estado de chegada.

> **As fotos da recepção são a sua defesa.** Avaria não registrada na chegada
> vira discussão na entrega, e sem foto a oficina perde. Fotografe mesmo quando
> parecer exagero.

Concluída a recepção, o veículo aparece no **Painel do Pátio**.

### 02 — Ordem de Serviço

A OS é o documento central do atendimento. Nela você lança:

- **Serviços** a executar;
- **Produtos e peças** utilizados;
- **Mecânicos** responsáveis;
- **Apontamentos** de tempo — quando começou, pausou e concluiu cada trabalho.

Os totais são recalculados sozinhos conforme você inclui itens.

Uma OS pode ser de três tipos: **OS**, **Orçamento** ou **Garantia**.

**Encerrar a OS** fecha o atendimento. Se algo estiver pendente, o sistema
avisa. **Reabrir** é possível, mas exige informar o motivo — que fica registrado.

### 03 e 04 — Checklists de Entrada e Saída

O checklist é preenchido a partir de um **modelo** montado pela empresa. Cada
item recebe uma resposta:

| Resposta | Quando usar |
| --- | --- |
| **OK / Conforme** | Item verificado e em ordem |
| **Não OK / Não conforme** | Problema encontrado |
| **Não se aplica** | Item não existe neste veículo |
| **Não verificado** | Não foi possível verificar |

Item marcado como **não conforme** gera um defeito registrado, que pode virar
uma **ação corretiva** com responsável e prazo.

> Responda **Não verificado** quando não deu para checar. Não marque OK "para
> adiantar": o checklist de entrada é o que prova o estado em que o veículo
> chegou, e um OK falso se volta contra a oficina.

Ao terminar, **conclua** o checklist. Se precisar corrigir algo depois, é
possível reabrir informando o motivo.

### 05 — Saída do Pátio

Última etapa. O sistema **confere se a OS pode sair** — checklists concluídos,
pendências resolvidas — e só então libera.

Na liberação você registra:

- **Forma de pagamento**: dinheiro, pix, débito, crédito, boleto,
  transferência, faturado ou outro;
- **Valor pago**;
- **Faturamento**, se for o caso, com número de parcelas, primeiro vencimento e
  intervalo entre elas.

O recibo de saída pode ser gerado e entregue ao cliente.

---

## 4. Painel do Pátio

Mostra todos os veículos na oficina e em que ponto cada um está:

| Situação | Significa |
| --- | --- |
| **Entrada** | Chegou, aguarda triagem |
| **Diagnóstico** | Em avaliação técnica |
| **Aprovação** | Aguardando o cliente aprovar |
| **Espera** | Parado aguardando peça |
| **Execução** | Em manutenção |
| **Finalização** | Checklist final ou faturamento |
| **Concluído** | Pronto para entrega |

O painel destaca **veículos urgentes** e os que estão com **SLA vencido** —
passaram do prazo combinado. São os que exigem atenção primeiro.

### Modo TV

O mesmo painel em tela cheia, para exibir num televisor da oficina. Toda a
equipe vê a situação sem precisar perguntar.

---

## 5. Minha Operação

A sua fila pessoal: o que está atribuído a você e o que está em andamento.
É por aqui que o mecânico começa o dia.

---

## 6. Peças em Teste

Controle do laboratório. Cada peça percorre um ciclo:

```
Recebida → Aguardando teste → Em teste → (Aguardando peça)
        → Reparada ou Reprovada → Aguardando cliente → Entregue
```

O protocolo de recebimento pode ser impresso e entregue a quem trouxe a peça.
O sistema acompanha o **prazo de cada etapa** e sinaliza atrasos.

---

## 7. Garantias e Retornos

**Garantias** registram a cobertura de produtos e serviços entregues, com prazo
de vigência. Uma garantia pode estar vigente, expirada, acionada ou cancelada.

**Retornos** são veículos que voltaram. Cada retorno recebe uma análise e uma
decisão:

| Decisão | Significa |
| --- | --- |
| **Procedente** | O problema é responsabilidade da oficina |
| **Improcedente** | Não tem relação com o serviço feito |
| **Cortesia** | Não é obrigação, mas será atendido |

Registre a decisão sempre, mesmo quando improcedente — é esse histórico que
mostra, no fim do mês, onde o retrabalho está nascendo.

Quando o cliente recusa um serviço recomendado, gere o **termo de recusa**.
É o documento que protege a oficina se o problema recusado causar dano depois.

---

## 8. Checklist de Abertura e Fechamento (5S)

Rotina diária da oficina, com dois momentos: **abertura** e **fechamento**.
Serve para manter organização e segurança do ambiente. Não conformidades
seguem o mesmo caminho dos checklists técnicos: viram ação corretiva com
responsável.

---

## 9. Cadastros

Base de tudo. Cadastro malfeito aparece depois como retrabalho.

| Cadastro | Observação |
| --- | --- |
| **Clientes** | Com contatos e etiquetas de segmentação |
| **Veículos** | Vinculados ao proprietário; histórico de donos preservado |
| **Produtos** | Peças e insumos, com estoque |
| **Serviços** | Serviços executáveis e valores |
| **Fornecedores** | Quem abastece a oficina |
| **Vendedores** | Com regra de comissão |
| **Usuários** | Quem acessa o sistema |
| **Funções e Especialidades** | Cargo e habilidade técnica do mecânico |
| **Status da OS** | Etapas do fluxo, ajustáveis à operação |
| **Tags** | Etiquetas de classificação |

> Antes de cadastrar cliente ou veículo, **procure primeiro**. Duplicidade
> divide o histórico do mesmo cliente em dois cadastros, e o histórico é o que dá
> valor ao sistema.

---

## 10. Relacionamento

**CRM** reúne o cliente e tudo que aconteceu com ele: veículos, atendimentos,
interações. A visão **Cliente 360** mostra esse conjunto numa tela só.

**Interações** podem ser registradas como ligação, WhatsApp, e-mail, visita ou
observação.

**Follow-up** é a agenda de retorno: o que precisa ser retomado e quando.

---

## 11. Estoque

Posição atual das peças, calculada a partir dos movimentos: entrada, saída,
ajuste, reserva e liberação. Peças usadas numa OS baixam do estoque.

Quem tem permissão de sincronizar pode trazer a posição do ERP Omie.

---

## 12. Gestão

**Financeiro** — faturas, parcelas e recebimentos.

**Indicadores** — números do período: pátio, vendas, estoque, CRM.

**Performance** — desempenho da equipe, a partir de eventos registrados:
OS concluída, checklist concluído, retorno vinculado, não conformidade no 5S,
apontamento concluído. Permite filtrar por função e especialidade.

Como os eventos são gerados pelo próprio uso do sistema, **a qualidade do
indicador depende da disciplina do preenchimento**. Apontamento não registrado
é hora que não aparece em lugar nenhum.

---

## 13. Inteligência

**Base Técnica** — artigos técnicos da oficina, com busca. Artigos passam por
rascunho, revisão, aprovação e publicação.

**E-books** — materiais em capítulos, para leitura e consulta.

**Tecnoar IA** — assistente que responde com base no conhecimento cadastrado.
Precisa ser configurado em Sistema → Integrações por quem tem permissão.

---

## 14. Sistema

Área administrativa.

- **Dados da Empresa** — informações que saem nos documentos.
- **Perfis e Permissões** — o que cada perfil pode fazer.
- **Exceções por usuário** — ajuste individual fora do perfil.
- **Integrações** — conexão com o ERP Omie e com a IA.
- **Configurações** — preferências, incluindo tema claro ou escuro.

### Sobre permissões

Cada tela é controlada por um par de **recurso** e **ação**. As ações são:
visualizar, criar, editar, aprovar, cancelar, inativar, configurar, exportar e
sincronizar.

O caminho recomendado é definir tudo em **perfis** e usar exceções individuais
só quando realmente necessário. Exceção espalhada vira confusão: com o tempo
ninguém mais sabe por que fulano enxerga uma tela que o colega de mesma função
não enxerga.

---

## 15. Dúvidas comuns

**Uma tela abre vazia.**
Ou não há dados no período, ou seu perfil não permite ver esses registros.
O sistema mostra vazio de propósito em vez de inventar número — se havia dados
esperados, fale com o administrador.

**Marquei algo errado no checklist.**
Reabra o checklist e informe o motivo. A correção fica registrada; nada é
apagado silenciosamente.

**Encerrei a OS antes da hora.**
Reabra informando o motivo.

**O veículo não aparece no pátio.**
Confirme se a recepção foi concluída. O veículo só entra no painel depois disso.

**Não consigo liberar a saída.**
O sistema bloqueia quando há pendência — checklist não concluído, por exemplo.
A tela indica o que falta.

**Cadastrei o cliente duas vezes.**
Fale com o administrador para unificar. Não continue usando os dois: o histórico
fica partido ao meio.

**O sistema parece desatualizado.**
Feche e abra o aplicativo. Se persistir, aceite o aviso de atualização quando
ele aparecer.
