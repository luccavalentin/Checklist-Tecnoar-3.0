# Ícones de ocorrência — 24/10/2026

O usuário pediu a regeneração dos oito ícones da etapa de descrição do problema, com materiais realistas e cores idênticas nos temas claro e escuro. A imagem anterior de pneu continha transparência em partes da borracha: o suporte claro aparecia por dentro do objeto.

As novas imagens foram geradas com a ferramenta integrada `imagegen`. O conjunto inclui freio, motor, câmbio, bateria, pneu preto, vazamento de óleo âmbar, caminhão laranja e caixa de ferramentas. Cada objeto foi gerado separadamente, com fundo transparente, perspectiva de três quartos, iluminação superior esquerda e cores naturais. Os prompts completos e as origens estão em `prompts-ocorrencias-v2.json`.

Os arquivos usados pelo aplicativo estão em `app/public/sos/mobile-3d/ocorrencia-*-v2.webp`. `scripts/design/preparar-ocorrencias-v2.py` reduz os renders para até 320 px e converte para WebP, preservando o canal alfa original, sem remover fundos por cor. `PECA_OCORRENCIA` centraliza o conjunto; os sintomas de pedal, partida e pneu reutilizam as mesmas novas peças.

A imagem permanece sem filtros, com opacidade 1 e composição normal. Apenas a superfície do botão responde ao tema e à seleção. Nomes novos de arquivo evitam reutilizar as versões antigas do cache.

A verificação local está em `tmp/verificar-ocorrencias-v2.mjs`, com capturas e resultados em `output/playwright/ocorrencias-v2`. Confere carregamento das oito imagens, cores sem filtros, ausência de overflow e seleção/desseleção do pneu em celular estreito, celular claro/escuro e desktop. Usa dados simulados.
