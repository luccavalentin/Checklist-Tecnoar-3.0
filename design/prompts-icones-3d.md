# Ícones 3D do app do mecânico — prompts de geração

Para trocar os ícones de linha (lucide) por ícones volumétricos no app SOS.

## A regra que decide o resultado

**Gere o conjunto inteiro numa imagem só, em grade.** Ícone gerado um a um
nunca casa com o anterior: muda o ângulo, a luz, o brilho do material e a
espessura. Numa grade única o modelo é obrigado a manter tudo igual, e depois
você recorta. Só volte ao prompt individual para refazer um que saiu ruim — e
aí mande junto a imagem da grade como referência de estilo.

## A paleta (não deixe o modelo inventar)

| Cor | Hex | Onde usar |
| --- | --- | --- |
| Laranja Tecnoar | `#FF6600` | Cor principal do objeto, o acento da marca |
| Azul-marinho | `#0D1C33` | Corpo escuro, contraste, sombras profundas |
| Azul Tecnoar | `#002061` | Partes secundárias, metal escuro |
| Ciano | `#00AFEF` | Detalhes vivos: luz, vidro, indicadores |
| Branco gelo | `#F5F7FB` | Plástico claro, realces |

---

## 1. Prompt mestre — a grade dos 9 ícones

Use este primeiro. Funciona em ChatGPT (GPT Image), Gemini, Firefly e Leonardo.

```
A single image containing a 3x3 grid of nine 3D app icons, evenly spaced on a
plain neutral light gray background (#EEF1F6), generous padding between them.

STYLE — identical across all nine, non-negotiable:
soft matte plastic with gently rounded edges and slightly beveled corners,
clean studio lighting from the upper left, soft contact shadow directly beneath
each object, subtle ambient occlusion, no harsh specular highlights, no glossy
reflections, no glass, no chrome. Friendly and chunky, slightly oversized
proportions, like premium mobile app icons. Front-facing view tilted about 15
degrees, same camera angle, same focal length, same scale and same lighting for
every single icon.

COLOR — use only these: orange #FF6600 as the dominant accent, deep navy
#0D1C33 for dark bodies, cyan #00AFEF for small live details like lights and
indicators, off-white #F5F7FB for light plastic. No other hues.

THE NINE OBJECTS, left to right, top to bottom:
1. A simple house with a rounded roof — orange roof, off-white walls.
2. A chunky telephone handset — navy body, orange accent.
3. An emergency siren beacon dome, lit — orange dome, cyan glow, navy base.
4. A cardboard-style box, closed, seen from a corner — navy box, orange tape.
5. A rounded human bust silhouette inside a circle — navy figure, orange circle.
6. A clipboard with a curled list of lines (no readable text) — off-white sheet,
   orange clip, navy board.
7. An adjustable wrench, laid at a slight diagonal — navy steel, orange grip.
8. A pause symbol: two thick vertical rounded bars — orange bars, navy plate.
9. A bell, slightly tilted as if ringing — orange bell, navy clapper.

NO text, NO letters, NO numbers, NO logos, NO brand marks anywhere in the image.
Each object centered in its cell, isolated, no props, no scenery, no drop shadow
touching the neighbors. Crisp edges, high detail, 4K.
```

### Versão Midjourney (mesma coisa, com parâmetros)

```
3x3 grid of nine 3D app icons on flat neutral light gray background, soft matte
plastic, rounded beveled edges, studio light from upper left, soft contact
shadow, ambient occlusion, no gloss no chrome no glass, chunky friendly
proportions, front view tilted 15 degrees, identical camera and lighting for all
nine, color palette strictly orange #FF6600 deep navy #0D1C33 cyan #00AFEF
off-white #F5F7FB :: house with rounded roof, telephone handset, lit emergency
siren beacon, closed cardboard box, person bust in a circle, clipboard with
lines, adjustable wrench, pause bars, tilted ringing bell :: no text no letters
no logos, each object isolated and centered --ar 1:1 --v 6.1 --style raw --q 2
```

---

## 2. Prompts individuais

Para refazer um ícone sozinho. **Anexe a grade como referência** e mantenha o
bloco de estilo igual — é ele que segura a consistência.

> **Bloco de estilo (cole no começo de todo prompt individual):**
> `3D app icon, soft matte plastic, rounded beveled edges, studio lighting from
> the upper left, soft contact shadow beneath, ambient occlusion, no gloss, no
> chrome, no glass, chunky friendly proportions, front view tilted 15 degrees,
> centered, isolated on transparent background, colors strictly orange #FF6600,
> deep navy #0D1C33, cyan #00AFEF, off-white #F5F7FB, no text, no logos, 4K`

| # | Onde aparece | Objeto a pedir depois do bloco de estilo |
| --- | --- | --- |
| 1 | Aba **Início** | `a simple house with a rounded orange roof and off-white walls, a small cyan window` |
| 2 | Aba **Chamados** | `a chunky telephone handset in deep navy with an orange mouthpiece, floating slightly` |
| 3 | Botão central **Atendimento** | `an emergency siren beacon with a translucent orange dome lit from inside, cyan light escaping, navy ribbed base` |
| 4 | Aba **Produtos** | `a closed shipping box seen from a top corner, navy cardboard with an orange packing tape strip across the lid` |
| 5 | Aba **Perfil** | `a rounded human head-and-shoulders bust in deep navy, centered inside a thick orange ring` |
| 6 | **Histórico de chamados** | `a clipboard with an off-white sheet showing three soft horizontal lines, orange metal clip at the top, navy backing board` |
| 7 | **Ordens de serviço** | `an adjustable wrench laid at a slight diagonal, navy brushed steel head with a thick orange rubber grip` |
| 8 | **Pausa e outras opções** | `a pause symbol, two thick vertical rounded bars in orange, resting on a soft navy rounded square plate` |
| 9 | **Avisos** | `a bell tilted as if ringing, orange body with a navy clapper and two small cyan motion arcs beside it` |

Extras do menu "Ver todos", se quiser completar:

| Onde | Objeto |
| --- | --- |
| **Serviços** | `a document sheet with a folded corner, off-white paper, orange folded corner, three soft navy lines` |
| **Tecno IA** | `a rounded brain shape split in two halves, one navy and one orange, with small cyan circuit nodes on the surface` |

---

## 3. Como pedir os arquivos

Depois de gerar:

- **Formato:** PNG com fundo transparente (alfa), não JPG.
- **Tamanho:** 1024×1024 por ícone. O app desenha em ~28 px na barra e ~32 px
  nos atalhos, mas sobra é o que permite tela retina e mudança de layout depois.
- **Recorte:** mesma margem em todos. Se um ícone ficar maior que os outros
  dentro do quadrado, ele parece desalinhado na barra mesmo estando centralizado.
- **Nomes sugeridos:** `inicio.png`, `chamados.png`, `atendimento.png`,
  `produtos.png`, `perfil.png`, `historico.png`, `ordens.png`, `pausa.png`,
  `avisos.png`.
- **Onde colocar:** `app/public/icones-3d/`.

## 4. O que conferir antes de aprovar

1. **Os nove lado a lado, no mesmo tamanho.** Se um parecer de outro conjunto,
   é ele que precisa voltar — não os outros.
2. **Em 28 px.** Reduza a imagem para o tamanho real da barra. Ícone 3D bonito
   em 1024 px vira borrão em 28: se não der para reconhecer, simplifique o
   objeto (menos detalhe, silhueta mais forte).
3. **No tema escuro.** O app abre no escuro por padrão. Objeto navy sobre fundo
   navy some — por isso o laranja é a cor dominante, não o azul.
4. **Silhueta.** Tampe a cor e olhe só a forma: ainda dá para dizer o que é?

## 5. Depois que você gerar

Me mande os arquivos que eu troco os `lucide-react` por eles em
`app/src/mecanico/CascaMecanico.tsx` (barra de abas) e
`app/src/mecanico/PainelMecanico.tsx` (acessos rápidos), mantendo os ícones de
linha como reserva para o caso de a imagem não carregar.
