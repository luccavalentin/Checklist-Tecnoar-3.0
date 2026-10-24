# Implementação do redesign SOS Tecnoar

Autorizada pelo usuário em 22/10/2026, com marca original, cores oficiais, imagens ultrarrealistas, elementos 3D e movimento. Sistema implementado documentado em `DESIGN.md`.

## Direction contract

THESIS: usar a precisão de visualização automotiva para dar identidade ao socorro, mantendo o pedido de ajuda como ação principal.

OWN-WORLD: navy #0D1C33, azul #002061, ciano #00AFEF, laranja #FF6600, variantes oficiais da marca, Geist local, imagens de veículos com materiais físicos e controles com profundidade curta.

STORY: reconhecer a Tecnoar, iniciar SOS, confirmar dados, acompanhar a equipe e conversar. O usuário vê estados reais do sistema; busca, aceite e deslocamento continuam distintos.

FIRST VIEWPORT: marca no cabeçalho, frota acima do título, SOS central, instrução curta e telefone/WhatsApp. Veículo e atalhos ficam abaixo. Em tela baixa, arte e botão reduzem sem perder o alvo de toque, e conteúdo secundário pode rolar.

FORM: composição mobile aprovada na conversa; seed de exploração ad8a879f. A direção explicitamente escolhida pelo usuário prevaleceu sobre alternativas de exploração.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Escopo entregue

- Início do cliente: frota, SOS tátil, marca original, contatos inline, temas claro e escuro, sem duplicação de SOS na barra inicial.
- Acompanhamento: cabeçalho compacto, elemento de localização 3D, previsão e distância acessíveis na primeira dobra de 390 × 844, chat dedicado preservado.
- Mecânico: cena de frota, superfícies e hierarquia operacional, alerta com elemento 3D e ações refinadas.
- Componentes: resposta ao toque, entrada de páginas e painéis, foco de teclado e redução de movimento.
- Fontes Geist e Geist Mono locais com licença, evitando dependência de Google Fonts em tempo de execução.
- Cache PWA inclui WebP e fontes; PNGs de origem não entram no precache do redesign.
- Checklist: favicon SVG e PNGs com a marca original. Ícones de instalação do SOS não foram substituídos por essa mudança.

## Verificação

- `npm run build`: TypeScript, build do Checklist e build do aplicativo, com geração dos service workers, passaram.
- Inspeção em oito combinações de telas/tema/tamanho, incluindo celular 360 × 640, 390 × 844 e desktop 1440 × 1000: nenhuma rolagem horizontal, erro JavaScript ou falha de carregamento dos assets.
- Início em 390 × 844 cabe na altura da tela nos dois temas. No aparelho de 360 × 640, conteúdo secundário usa rolagem vertical, com SOS visível.
- Navegação do SOS, envio por pressão longa e proteção contra toque rápido passaram com backend simulado.
- Cancelamento, limite de cancelamento, cadastro de veículo, disponibilidade e aceite do mecânico passaram nos testes direcionados.
- Estados adicionais: sem internet mantém telefone e SOS; imagem indisponível não bloqueia o pedido; chamado aceito não oferece pedido duplicado nem anuncia ETA de deslocamento; chat abre a partir do acompanhamento; redução de movimento foi conferida.
- Detector mecânico Impeccable: nenhuma ocorrência nos arquivos de apresentação verificados.

Capturas e relatório: `output/playwright/redesign-tecnoar/`. Os dados dessas capturas são sintéticos e os testes interceptam o backend. A data antiga visível em posições de exemplo não corresponde à operação real.

## Limites

Implementado localmente, sem publicação. Não é uma recomposição individual de todas as telas. O mapa permanece real e interativo; a imagem do caminhão é decorativa. Os PNGs e WebPs têm aparência 3D; rotação livre exigiria modelos 3D próprios. GPS em segundo plano e entrega de push em aparelho físico não foram validados nesta alteração visual.
