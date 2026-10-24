# SOS Tecnoar — identidade e movimento

## Diretrizes confirmadas pelo cliente

Preservar a logomarca original, tons e cores oficiais. Criar uma experiência sofisticada com elementos 3D, motion, efeitos e cuidado com interação. Esta diretriz substitui propostas aproximadas de cores e marcas tipográficas no documento de prompts.

## Marca original

- Arquivos: `app/public/brand/tecnoar-positivo.svg`, `tecnoar-negativo.svg` e `tecnoar-mono.svg`.
- Azul: `#002061`.
- Ciano: `#00AFEF`.
- Laranja: `#FF6600`.
- Navy: `#0D1C33`.
- Branco: `#FFFFFF`.

Esses valores foram lidos no SVG original. Usar as variantes fornecidas, sem redesenhar, distorcer, aplicar perspectiva ou transformar a marca em uma nova ilustração. Elementos 3D podem carregar as cores da marca; a marca aplicada sobre eles permanece o arquivo oficial.

## Motion proposto

| Interação | Movimento e função | Tempo de referência |
| --- | --- | --- |
| Abrir início | Entrada curta do caminhão e dos textos, sem impedir o SOS | 280 ms |
| Pressionar SOS | Escala de 0,97 e redução da sombra; retorno imediato ao soltar | 120 ms |
| Confirmar solicitação | Painel inferior sobe da borda com fundo progressivamente atenuado | 240 ms |
| Buscar equipe | Indicador indeterminado pequeno; dados estáveis | Enquanto houver busca real |
| Aceite confirmado | Transição de status, check desenhado uma vez e aviso acessível | 220 ms |
| Equipe saiu | Troca de etapa e revelação do resumo de rota | 240 ms |
| Nova posição | Interpolação curta entre posições válidas recebidas | Até 800 ms, sem inventar percurso |
| Abrir chat | Transição curta que mantém o contexto do atendimento | 180 ms |
| Enviar mensagem | Aparição breve do balão e estado pendente inequívoco | 140 ms |
| Expandir detalhe | Altura e opacidade com possibilidade de interrupção | 220 ms |
| Chegada | Atualização da etapa e feedback discreto | 220 ms |
| Finalização | Check e pequeno gesto de luz no objeto 3D, uma única vez | 300 ms |
| Erro | Mensagem junto ao controle; preservar o conteúdo digitado | Imediato |

Curva para painéis: `cubic-bezier(0.32, 0.72, 0, 1)`. Curva para feedback: `cubic-bezier(0.23, 1, 0.32, 1)`. Evitar `transition: all`. Priorizar transform e opacity.

## 3D e efeitos

O caminhão e a viatura devem compartilhar câmera, luz e materiais. Render estático não equivale a modelo 3D interativo. A primeira versão pode combinar renders transparentes com movimentos discretos da composição; rotação real exige modelo 3D próprio. Reflexos e iluminação devem apoiar o volume, sem reduzir contraste dos controles.

O mapa permanece interativo e conectado aos dados. Sem mover veículo quando não houver posição nova, sem caminho inventado e sem manter aparência de localização atual quando o sinal estiver desatualizado.

## Acessibilidade e comportamento

Respeitar `prefers-reduced-motion`, com transições de opacidade curtas ou ausência de movimento. Sem flashes. Sem loops decorativos em chat ou formulários. Botões utilizáveis mesmo durante a entrada visual. Gestos de arrastar possuem alternativa por toque. Vibração é complementar, dependente do aparelho e nunca a única confirmação.

## Próxima referência visual

A imagem da tela inicial em geração é um estudo de composição. A versão final precisa usar o SVG oficial no aplicativo; qualquer texto de marca sintetizado pelo gerador não substitui esse arquivo.
