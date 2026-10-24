# Sistema visual Tecnoar

## Atualização mobile — 23 de outubro de 2026

A referência visual atual para início, acesso, conta e Tecno IA são as imagens fornecidas pelo usuário nesta data: estrada molhada ao anoitecer, oficina industrial, navy profundo, laranja luminoso, filetes ciano e peças metálicas 3D. Esta seção substitui a orientação anterior de superfícies sólidas e frota em diorama nessas quatro telas. O aplicativo continua implementado em React web, com empacotamento Capacitor para celular.

O usuário solicitou o mesmo destaque para todas as telas. Veículos, histórico, revisões e contato também recebem cabeçalhos, peças 3D e acabamento coerente. As fichas de veículos mostram a ilustração acima dos dados para preservar a leitura da placa; a seleção do tipo no cadastro utiliza as imagens fornecidas. A casca interna compartilha superfícies e ações, mantendo estados semânticos de revisão, erro e atendimento.

`app/src/comum/mobile-cinematico.css` concentra a adaptação. O início mostra a fotografia da estrada, marca oficial, ação SOS HTML, contatos, veículo e atalhos. Em aparelhos baixos, o SOS e os canais de contato têm prioridade e os atalhos podem exigir rolagem. A navegação inferior preserva safe areas. O tema claro continua disponível.

Os assets fornecidos ficam em `app/public/sos/mobile-3d`, otimizados em WebP, com transparência preservada. `ARTE_MOBILE` e `VEICULO_MOBILE`, em `comum/kit3d.ts`, mapeiam os recursos. `scripts/design/preparar-referencias-mobile.py` registra a correspondência com os arquivos originais. O conjunto inclui sirene, WhatsApp, ícones de conta, navegação, veículos, câmera e robô. O botão SOS mantém a peça anterior, a marca oficial e os rótulos HTML, com alternativa funcional quando as imagens falham.

Refinamentos solicitados em seguida: o SOS do menu reutiliza o mesmo botão da tela inicial, com duas batidas por ciclo de 1,65s e pausa; o botão de revisão usa a arte fornecida e fica limitado a 150px nas fichas de veículo; filtros do histórico têm acabamento metálico/laranja com texto HTML. Avatar, veículo no canto da conta, aparência, notificações, menus e nove sintomas da IA receberam as peças 3D correspondentes. O ícone de enviar e cinco peças de diagnóstico foram gerados com imagegen. Proveniência, prompts e integração estão em `design/elementos-3d-2026-10-23.md`.

O login usa campos de 16px para evitar zoom automático no Safari e oferece os contatos existentes antes da autenticação. A conta mantém edição, preferências, notificações, privacidade e exclusão. A Tecno IA mantém envio de texto e foto e o guia offline; o novo ícone de câmera não introduz gravação de áudio. Nenhuma arte representa disponibilidade, ETA ou estado operacional.

Validação local com dados simulados: capturas em `output/playwright/mobile-referencias`, celulares de 320 × 640 e 390 × 844, tema claro/escuro e coluna em desktop. Os resultados ficam em `resultado.json`. A validação não substitui teste físico de GPS, push ou rastreamento.

Estado documentado em 22 de outubro de 2026. Este documento descreve o sistema implementado no aplicativo SOS e a atualização pontual do favicon do Checklist. Não representa um redesenho completo de todas as telas do produto.

## Direção e uso

O SOS é uma interface operacional para clientes com urgência mecânica e profissionais em atendimento. A composição deve transmitir precisão, confiança e prontidão. A identidade 3D aparece em imagens de frota e localização; controles, textos e dados continuam elementos nativos da interface.

No início do cliente, a sequência principal é marca, frota, mensagem, botão SOS, orientação e canais de contato. O veículo e os atalhos são secundários. O SOS não se repete na navegação inferior enquanto o cliente está no início. Nas outras telas da casca, o botão central abre um pedido ou acompanha o chamado ativo. WhatsApp aparece inline no início e permanece condicionado à conexão.

Quando existe chamado ativo ou pedido pendente sem sinal, a tela usa os componentes reais correspondentes no lugar da composição de novo pedido. Não inserir artes sobre esses controles.

## Marca e cor

Usar os arquivos oficiais de `brand/tecnoar-positivo.svg` e `brand/tecnoar-negativo.svg`, escolhendo a versão pela superfície. Preservar proporção, desenho e cores. Não substituir a marca por texto digitado, iniciais ou uma interpretação gerada.

| Papel | Cor implementada |
| --- | --- |
| Navy principal, cabeçalhos e tema escuro | `#0D1C33` |
| Azul institucional | `#002061` |
| Ciano da marca, indicadores e foco | `#00AFEF` |
| Laranja da marca e ação SOS | `#FF6600` |
| Fundo claro do início | `#F5F7FB` |
| Superfície escura do cliente | `#162A45` |
| Texto principal claro | `#0D1C33` |
| Texto secundário escuro | `#C4D3E5` |

Ciano e laranja puros não são a escolha automática para texto pequeno sobre branco. Há variantes escuras como `#006895` e `#AD4300` no tema claro, e variantes mais claras no tema escuro. Estados operacionais mantêm cores semânticas de atenção, erro e sucesso. Não comunicar estado exclusivamente pela cor.

## Tipografia e ícones

O aplicativo carrega Geist e Geist Mono locais em `app/public/fonts`, definidos em `tecnoar-fonts.css`, com arquivos WOFF2 latin e latin-ext. `app/index.html` antecipa o arquivo latin de Geist. Proveniência e licença acompanham os arquivos em `SOURCES.md` e `OFL.txt`. O Checklist preserva sua tipografia existente.

Geist compõe texto e títulos, com hierarquia por peso e tamanho. Títulos usam espaçamento levemente fechado e quebra equilibrada. Reservar Geist Mono para contextos em que a largura fixa ajuda; números de tempo, distância e valores podem usar algarismos tabulares. Ações e navegação usam Lucide React com rótulos visíveis ou nomes acessíveis.

## Assets 3D

Os arquivos de produção ficam em `app/public/sos/kit-3d`, e `app/src/comum/kit3d.ts` é a única porta para eles: nenhum caminho de imagem é escrito solto numa tela.

| Arquivo | Uso |
| --- | --- |
| `botao-sos.webp` | Botão de socorro do início e da tela sem sinal |
| `diorama.webp` | Frota no painel do especialista |
| `diorama-faixa.webp` | A mesma cena cortada em faixa, para a tira baixa do início |
| `cobertura.webp` | Cúpula de alcance: área de atendimento e fora de cobertura |
| `pino-cliente.webp`, `pino-especialista.webp` | Pinos do mapa e do alerta de chamado |
| `mapa-escuro.webp`, `mapa-claro.webp` | Terreno de navegação para composições sem mapa ao vivo |
| `freio`, `motor`, `cambio`, `bateria`, `pneu`, `vazamento`, `caminhao`, `outro` | Tipo de pane na escolha do pedido |
| `chat`, `ligar`, `local`, `estrela`, `concluido`, `tempo`, `estrada`, `seguranca` | Ações e dados onde o ícone de traço fica pequeno demais |
| `casa`, `veiculos`, `historico`, `conta`, `ia`, `revisoes` | Abas da barra inferior e atalhos do início |

Todas foram geradas com a mesma montagem: alumínio usinado, verniz laranja `#ff6600`, fio de luz ciano `#00afef` e luz principal no alto à esquerda. Peça nova repete material, luz e ângulo — meia dúzia de renders ao lado de ícones de traço lê como erro, não como escolha. Não gerar texto dentro das imagens.

Tamanho manda no formato. Peça detalhada abaixo de ~28 px vira borrão: por isso a estrela é 3D na avaliação (46 px) e continua de traço nas listas, e acidente não tem peça — ele não é um quadradinho na grade. O grupo das abas e atalhos é a exceção, e foi desenhado para isso: silhueta grossa, poucas partes, muito contraste, para ler a 24 px. Peça do grupo detalhado não serve de aba, nem a de aba serve de ilustração.

Peça fora do foco recua — `saturate` baixo e opacidade menor —, e a do item escolhido acende e cresce um fio. Vale na barra inferior, nos atalhos do início e nos tipos de pane: é o que deixa a tela dizer onde a pessoa está sem precisar de mais uma cor.

Toda peça pequena entra por `comum/Arte.tsx`, que cai no ícone de traço se o arquivo não carregar. Nenhuma tela fica com buraco enquanto uma arte não existe.

Arte decorativa tem `alt` vazio, `aria-hidden` e `onError` que a esconde, e não captura toques nem impede a ação SOS. O controle SOS continua um botão HTML: "SOS TECNOAR" é texto por cima da peça, e o CSS tem um aro laranja de reserva atrás — se a imagem não carregar, o alvo continua redondo, legível e tocável. Pedido de socorro não pode depender de um arquivo.

## Componentes e composição

- `cliente/inicio/BotaoSOS.tsx` e `botaoSOS.css`: o botão de socorro, seus três estados (pronto, ao vivo, sem sinal) e o aro de reserva.
- `cliente/inicio/inicio-premium.css`: composição inicial, temas claro e escuro e redução da arte em telas baixas.
- `cliente/chamado/avaliacao.css`: estrelas 3D e o selo de concluído da avaliação.
- `comum/experiencia.css`: acabamento de botões, navegação, cabeçalhos de conversa, folhas e movimentos compartilhados do SOS.
- `cliente/chamado/acompanhamento-premium.css`: cabeçalho navy com marca e pin discreto, previsão, perfil do mecânico e conversa.
- `mecanico/mecanico3d.css`: frota, disponibilidade, área de atendimento, resumos e ações do profissional.

Preferir superfícies sólidas, raios de 12–16 px e sombras suaves com deslocamento. Folhas inferiores e navegação têm raios maiores por sua função. Alvos principais são amplos para toque; não reduzir o SOS para acomodar decoração. Em telas compactas, reduzir primeiro a altura da frota e os espaços auxiliares. Usar safe areas do dispositivo.

O acompanhamento conserva o mapa Leaflet, rota, pinos e dados reais. A folha inferior alterna entre recolhida e expandida; em telas largas torna-se coluna lateral. Conversa, orçamento, previsão, posição desatualizada e canais de ajuda permanecem acessíveis por componentes existentes. Nunca substituir o mapa por uma imagem nem inventar ETA, distância, disponibilidade ou avaliações para preencher a composição.

## Movimento e acessibilidade

Os botões de ação do cliente e do mecânico compartilham o acabamento de `comum/botoes-3d.css`, derivado da referência de Agendar revisão: face envernizada, aro metálico e filete ciano. Ações principais usam laranja, secundárias azul e destrutivas vermelho. Textos continuam HTML; carregamento, foco, desabilitado e resposta ao toque permanecem funcionais. Botões de navegação e escolhas compactas usam uma versão reduzida do relevo. O botão com a imagem original de Agendar revisão mantém sua arte e limite de 150 px no cartão do veículo.

Movimentos têm função de resposta ao toque, entrada curta de conteúdo ou orientação espacial da folha. Ações usam cerca de 120–180 ms; folhas e cabeçalhos usam cerca de 180–280 ms. A entrada da frota inicial tem 680 ms. Curvas predominantes são `cubic-bezier(.23,1,.32,1)` e `cubic-bezier(.32,.72,0,1)`.

O botão de socorro é a exceção que fica em laço: o brilho respira em 3,4 s e duas ondas saem com saída longa, uma laranja e uma ciano. Pulso rápido é brinquedo; o que transmite prontidão é a batida calma de um equipamento ligado. As estrelas da avaliação entram uma a uma, com 60 ms entre elas, porque é o único momento em que a tela pede algo sem ter nada urgente em troca.

Não adicionar movimento contínuo a imagens decorativas. Não animar a posição do mecânico independentemente de dados reais. Respeitar `prefers-reduced-motion`: remover entradas e animações e tornar transições praticamente imediatas. Manter foco visível, rótulos acessíveis, textos selecionáveis quando úteis e contraste nos dois temas.

## Checklist e instalação

O favicon do Checklist deriva da marca positiva original, centralizada sobre branco: `public/favicon-tecnoar-oficial.svg` e PNGs de 32, 64 e 180 px. `index.html` usa esses recursos para favicon e Apple touch icon. Os ícones de instalação existentes e os ícones Android não foram redesenhados por essa alteração.

Checklist e SOS têm configurações PWA distintas. O SOS inclui WebP e WOFF2 no precache; fontes e arte não devem exigir serviços externos para aparecer depois de instaladas e armazenadas. Preservar a atualização por confirmação para não trocar a versão durante um chamado.

## Validação e limites

### Continuação: conversa e atendimento

A conversa do cliente recebe as peças 3D por propriedades opcionais de `TelaConversa`, preservando os fluxos de texto, localização, áudio, leitura e anexos. O cabeçalho traz a identidade Tecnoar; o campo tem fonte mínima de 16 px e pode encolher sem criar overflow em 320 px. Indicadores pequenos de leitura e navegação conservam seu traço funcional.

No mecânico, os atalhos de ligação, chat e WhatsApp usam o mesmo material. O alerta de novo SOS usa o distintivo da marca em uma caixa com dimensões coincidentes, sem a antiga arte azul ou corte na base. Aceitar mantém a mesma ação e recebe o componente compartilhado; conclusão e cancelamento usam as peças de estado já existentes.

O relatório `output/playwright/continuacao-conversa-atendimento/resultado.json` registra nove cenários em temas claro e escuro, telas compactas e desktop. Seleção de foto e envio de texto foram testados com respostas simuladas; não foram enviadas mensagens reais. Gravação de microfone e entrega em rede móvel não são confirmadas por essa validação visual.

### Refinamento premium de 24/10/2026

O cartão de socorro ativo no início usa selo SOS 3D, título de 18 px e ação limitada a 230 px. O botão com a imagem de Agendar revisão fica em 180 px, ou 150 px nos cartões de veículo. Placas do cliente e do mecânico compartilham metal escuro, aro chanfrado, rebites discretos e caracteres em relevo. Filtros de histórico usam faces navy e cobre escuro para a seleção.

Os oito renders novos estão listados com prompts e originais em `design/prompts-refinamento-premium-2026-10-24.json`: navegação, cérebro azul e laranja, compartilhar, centralizar e cadeado. `scripts/design/preparar-gerados-mobile.py` recompõe os WebP otimizados. Imagens não carregam dados pessoais nem substituem os rótulos HTML.

As janelas do cliente e do mecânico abrem no centro com a logo, altura máxima de 90dvh e rolagem interna. `useDialogo` mantém o foco dentro da janela, permite Escape e devolve o foco ao controle de origem. Os avisos do app também aparecem centralizados com logo; o Checklist conserva seu comportamento anterior, pois essa apresentação é uma opção do provedor usada apenas pelo app.

Foram verificados login do cliente e mecânico, exibição da senha, início com chamado ativo, placas, filtros, agendamento, seleção dos tipos de serviço, cancelamento com motivo obrigatório e aviso de sucesso. Capturas em `output/playwright/qualidade-premium-24`; testes usam respostas simuladas e não alteram chamados reais. A revisão da versão do mecânico também cobriu os 12 cenários do relatório `output/playwright/mecanico-mobile-3d/resultado.json`.

### Identidade na versão do mecânico

O painel, a navegação, o perfil e a IA técnica compartilham a paleta azul Tecnoar, laranja e ciano, os painéis metálicos e as imagens 3D da versão do cliente. O cabeçalho usa a oficina como cenário e uma viatura compacta. `ArteMecanico.tsx` centraliza as peças dos controles; `mecanico-mobile.css` aplica a composição às telas operacionais. Ícones de direção, campos e indicadores pequenos conservam traços simples para leitura precisa. Disponibilidade, prioridade e estados de atendimento mantêm suas cores semânticas.

A confirmação visual abrange 12 cenários de painel, perfil, chamados, produtos, OS, novo chamado, atendimento e IA, incluindo 320 px, 390 px, desktop e os dois temas. O relatório está em `output/playwright/mecanico-mobile-3d`; as capturas usam dados simulados. Foram conferidos carregamento de imagens, overflow, navegação de novo chamado, troca de tema, confirmação de saída e habilitação do envio da IA.

A revisão desta etapa consultou código e as capturas de `output/playwright/redesign-tecnoar`, incluindo início claro/escuro, compacto, desktop, acompanhamento, conversa, pedido e mecânico. O relatório de captura registra imagens carregadas, ausência de overflow horizontal e ausência de erros nas rotas capturadas. Recursos do favicon foram verificados com HTTP 200 e MIME de imagem correto. Typecheck e build foram executados durante a implementação.

Capturas com dados de demonstração não validam GPS de aparelho físico, rastreamento em segundo plano, entrega de push em dispositivo, aceitação simultânea por profissionais ou condições reais de rede. A lógica existente dessas funções foi preservada; testes operacionais físicos continuam sendo uma etapa distinta.

Atenção de composição: no acompanhamento recolhido em 390 × 844, o novo cabeçalho e o acesso à conversa deixam parte da previsão abaixo da primeira dobra. A folha permite rolagem; futuras alterações devem priorizar previsão e frescor da posição antes de aumentar decoração. No início compacto, atalhos secundários podem exigir rolagem; o SOS permanece visível.
