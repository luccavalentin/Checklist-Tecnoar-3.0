# Elementos 3D — refinamentos de 23/10/2026

Ferramenta: imagegen integrada, com fundo transparente. Os seis renders foram inspecionados e os derivados WebP foram salvos em `app/public/sos/mobile-3d/`. O script `scripts/design/preparar-gerados-mobile.py` registra os arquivos originais e a otimização, sem remover a transparência.

## Prompt de enviar

Use case: stylized-concept. Create ONE production-ready 3D mobile app SEND button icon for the SOS Tecnoar automotive assistance app. A bold unmistakable upward-pointing arrow (send message) in glossy thick orange enamel #ff6600, seated inside a dark navy #031426 round mechanical button with a machined brushed aluminum silver rim and a thin electric cyan #00afef illuminated channel. Front-facing nearly orthographic view, centered symmetrical composition, chunky highly legible silhouette at 40px. Premium realistic industrial 3D rendering, polished orange lacquer, precise metal bevels, warm upper-left key light and cool cyan rim highlights. Icon occupies 88 percent of square canvas, complete object not cropped. True transparent background including outside the circular object, no ground plane, no cast shadow outside the object, no white matte, no black rectangle. Only one arrow and one circular rim. No words, no lettering, no SOS, no logos, no collage, no variants.

Arquivo: `enviar-3d.webp`.

## Prompt compartilhado dos diagnósticos

Use case stylized-concept. ONE ultrarealistic 3D mobile app icon, isolated on TRUE TRANSPARENT background. SOS Tecnoar industrial visual family: brushed machined aluminum, dark navy #031426, orange enamel #ff6600, thin cyan #00afef rim light. Real mechanical materials, warm light upper left, front three-quarter angle, complete centered object occupying 85% of square frame, simple bold silhouette legible at 64px. No text, no letters, no logo, no tile, no background, no ground plane. Subject:

Cada linha abaixo foi enviada em uma chamada separada, acrescentada ao prompt compartilhado.

- `manometro.webp`: a truck pneumatic air-pressure gauge, round brushed steel bezel, dark dial with simple tick marks, orange needle pointing into a small red low-pressure sector, short metal air fitting below. No numbers.
- `freio-travado.webp`: a realistic truck ventilated steel brake disc with glossy orange caliper, and a small sturdy brushed steel padlock with orange face locked across its hub. Compact single mechanical assembly.
- `chiado-ar.webp`: a realistic small truck pneumatic brass and steel hose coupling, short curved orange air hose with a visible split, and three short cyan translucent jet streaks escaping from the leak. Clearly compressed AIR, no liquid drops.
- `roda-quente.webp`: a truck tire and metal wheel hub with an orange-hot brake disc visible inside, a small restrained curl of gray smoke rising from the hub. Real rubber tread, no flames, legible compact object.
- `alerta-painel.webp`: a thick glossy orange warning triangle with a recessed dark navy exclamation mark on its face, brushed silver beveled edges, cyan edge highlights, small black instrument-panel mounting base.

## Integração

`comum/kit3d.ts` concentra os caminhos de produção. O guia rápido tem nove peças, combinando os cinco renders novos com freio, motor, pneu e diagnóstico do kit existente. A lista de socorros usa as peças de ocorrência existentes; o histórico geral usa o giroflex fornecido pelo usuário.

Os arquivos enviados pelo usuário alimentam o botão de revisão, o distintivo SOS, os controles de aparência e o cérebro da IA. A arte de revisão foi aparada somente nas margens transparentes e otimizada em WebP; o botão continua HTML e tem rótulo acessível e alternativa quando a imagem falha. No cartão de veículo, sua largura máxima é 150px.

O menu inferior reutiliza `BotaoSOS`, a mesma peça da tela inicial. Ambos pulsam em duas batidas, com pausa; o estado ativo continua levando ao chamado existente. A animação para fora da área visível, quando a aba fica oculta e com movimento reduzido.

A conta recebe aro metálico no avatar e veículo pequeno no canto direito do cartão de identidade, escolhido pelo tipo cadastrado. Não foram adicionados selos de categoria, assinatura ou benefícios sem dados reais.

Verificação local com dados simulados: telas em 320 e 390px, filtros do histórico, abertura de agendamento, navegação SOS, nove imagens do guia, imagens do menu, troca de tema e botão de enviar habilitado ao escrever. Capturas e resultados em `output/playwright/refinamentos-3d`.


## Pino Brasil — etapa de localização

Gerado com a ferramenta integrada imagegen, sem CLI. Asset final: `app/public/sos/mobile-3d/pino-brasil.webp`. Original preservado: `exec-90321b75-4461-4291-9af1-9d95baf0e0b7.png`.

Prompt: Create a single isolated ultra-realistic premium 3D app icon for a Brazilian truck roadside assistance mobile app: a thick polished orange enamel location pin rising behind a small folded navy blue metal map whose raised silver outline is the geographically recognizable silhouette of Brazil, with a small cyan point marker. Brushed aluminum bevels, glossy orange #ff6600, navy #002061, thin cyan #00afef illuminated edge accents. Three-quarter product view, studio lighting from upper left, sophisticated realistic machined materials, clear chunky silhouette readable at 48 pixels. Centered, entire object visible, tight transparent padding, genuinely transparent background. No words, no letters, no text, no floor, no scenery. One asset only.

Validação visual em 320 px, 390 px e desktop. GPS simulado nos testes; ajuste no mapa e confirmação do ponto funcionais.


## Pino do veículo no resumo

Ferramenta integrada imagegen. Asset final: `app/public/sos/mobile-3d/pino-veiculo-premium.webp`; original: `exec-f328ed63-5538-4aed-b784-057ea5526f61.png`. Exportado com transparência e margens transparentes removidas para ancorar a ponta. Exibido em 52 × 68 px no Leaflet.

Prompt: Generate one premium ultra-photorealistic 3D GPS location map pin for Tecnoar truck roadside assistance app. Strong classic teardrop silhouette, broad round head, tapered sharp tip at bottom center. Glossy deep orange enamel #ff6600 face, thick polished brushed aluminum beveled rim, dark navy sidewalls, subtle thin cyan illuminated inner rim. In the head a beautifully realistic small silver semi-truck front embossed medallion, clearly recognizable at small sizes. Sophisticated automotive industrial product rendering, convincing physical volume, crisp highlights and reflections, studio softbox at upper left. Almost straight-on with very slight 3D perspective, upright and symmetric, no tilted pin. One isolated object, tightly framed with 4 percent transparent padding, entire tip visible. Genuinely transparent background, no cast ground shadow below the tip, no pedestal, no floor, no text, no letters, no logo, no other objects. Designed to be displayed at 60 pixels high on a street map, bold uncluttered details.


## Contato e cancelamento no acompanhamento

Gerados com imagegen integrado. Assets finais: `app/public/sos/mobile-3d/ligar-central-3d.webp` e `app/public/sos/mobile-3d/cancelar-socorro-3d.webp`. WhatsApp reaproveita a imagem verde e dourada fornecida pelo usuário. Originais preservados: `exec-fd30069a-f480-4b72-a135-73ac8f4ed84f.png` e `exec-683ac7b8-39c6-4150-97f7-4c8741d026f6.png`.

Prompt ligação: One single ultra-realistic premium 3D icon for a truck roadside assistance mobile application, isolated telephone handset angled upright, polished orange enamel #ff6600, thick brushed aluminum side trim, dark navy inset, subtle cyan #00afef light accents, studio automotive product photography softbox lighting, sophisticated machined physical materials, clear broad silhouette readable at 40px. Small curved three-dimensional metallic sound-wave arcs adjacent to handset, not flat illustration. No text no letters no background no floor no pedestal. Entire object visible centered tightly framed with transparent background. Consistent style with premium orange navy chrome Tecnoar app icons.

Prompt cancelar: One single ultra-realistic premium 3D cancel icon for a truck roadside assistance mobile application: a substantial circular prohibition ring with diagonal slash, glossy muted red-orange enamel, brushed aluminum bevels, deep navy thickness visible at a very slight three-quarter angle, narrow orange reflected light highlights, physical sculpted realistic machined industrial product, sophisticated studio softbox top-left lighting. Strong readable clean silhouette at 40px, no text no letters no extra symbols no background no floor no pedestal. Entire icon visible centered tightly framed with genuine transparent background. Match premium orange navy chrome Tecnoar mobile app icon family, cancellation must read immediately as circle with diagonal bar.

Validados em 320 px, 390 px e desktop: links preservados, ícones carregados, confirmação de cancelamento abre sem mutação e exige motivo.
