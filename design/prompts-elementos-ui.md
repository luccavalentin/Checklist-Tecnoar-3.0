# Elementos de interface — prompts para gerar

Para colar no ChatGPT (GPT Image). Complementa `prompts-3d-app.md`, que tem
os veículos, as peças e a cena de socorro.

---

## Leia isto antes de gerar botão

**Botão não deve virar imagem.** Não é preguiça minha — é que botão-imagem
quebra quatro coisas de uma vez:

1. **Não tem estado.** Pressionado, desabilitado, carregando, foco de teclado.
   Cada estado viraria um arquivo novo, e eles teriam que combinar entre si.
2. **Não tem o texto certo.** "Pedir socorro" muda para "Enviando…" e para
   "Ver o socorro". Texto dentro de imagem não muda, e modelo de imagem ainda
   erra letra.
3. **Não escala.** Um PNG de 320 px fica borrado no Galaxy S24 Ultra, e um de
   1024 px pesa em todo carregamento.
4. **Não troca de tema.** Claro e escuro dobrariam o número de arquivos.

O botão de SOS que você já viu é CSS puro: nítido em qualquer densidade,
afunda ao toque, responde aos dois temas e pesa zero byte. **Ele fica como
está.**

O que ganha de verdade com imagem gerada está abaixo — e é bastante coisa.

---

## A paleta (a mesma dos outros prompts)

| Cor | Hex | Onde |
| --- | --- | --- |
| Laranja Tecnoar | `#FC6400` | O acento. Uma peça por objeto |
| Azul-marinho | `#0D1C33` | Corpo escuro |
| Grafite | `#232A35` | Metal fosco, o volume |
| Aço claro | `#AAB8CC` | Aresta torneada que pega a luz |
| Ciano Tecnoar | `#00A8E8` | Vidro, luz acesa, o mecânico |

**Luz sempre do alto à esquerda (315°)** e **fundo transparente**. Isso não é
detalhe: todo o CSS do app foi desenhado nessa fonte de luz.

---

## 1. Os pinos do mapa — o maior ganho agora

Hoje o pino é a logo dentro de uma bolha branca. Num mapa escuro isso vira um
adesivo colado. Pinos 3D com sombra própria **pousam** no mapa.

```
A single image: a 2x3 grid of six 3D map pin renders on a fully transparent
background (alpha channel, PNG), generous even padding between them.

STYLE - identical for all six, non-negotiable:
Premium 3D map marker, teardrop pin shape with a circular head and a tapered
point at the bottom. Dark graphite body (#232A35) with a brushed steel rim
(#AAB8CC) and a glossy inset face. Matte metal, crisp bevels, a small soft
elliptical shadow UNDER the tip as if the pin is standing on a surface. No
text, no letters, no logos, no outlines, no cartoon styling.

CAMERA - identical for all six:
Viewed from slightly above and straight on, pin standing upright, same angle,
same focal length, same size, centered in its cell.

LIGHT - identical for all six:
One soft key light from the upper left at 315 degrees, dim cool fill from the
lower right, bright specular only on the steel rim facing the key.

THE SIX PINS, in reading order:
1. Inset face glowing warm orange (#FC6400), with a small truck silhouette
   embossed into it
2. Inset face glowing cyan (#00A8E8), with a small wrench silhouette embossed
3. Inset face glowing cyan, with a small tow-truck silhouette embossed
4. Inset face dark and unlit, grey, switched off
5. Inset face glowing orange, with a warning triangle embossed
6. Inset face glowing green (#2BB673), with a check mark embossed
```

**Salvar** em `app/public/sos/pinos/`, 256×256 PNG transparente:

```
veiculo.png (1)   mecanico.png (2)   guincho.png (3)
inativo.png (4)   alerta.png (5)     concluido.png (6)
```

---

## 2. Textura de aço escovado — serve de fundo, não de botão

Esta é a melhor compra do conjunto: **um arquivo só** que o CSS repete como
fundo em dezenas de superfícies, somado aos gradientes que já existem. Dá ao
metal uma granulação real que gradiente nenhum reproduz.

```
A seamless tileable texture of brushed stainless steel, top-down flat view,
fine horizontal brushing marks, subtle grain, no scratches, no dents, no
reflections of any object, no vignette, perfectly even lighting across the
whole image so the edges tile without a visible seam. Neutral dark grey,
around #2A313D. No text, no logo, no border. Square, 512x512.
```

**Salvar** como `app/public/sos/textura-aco.png`. Me avisa quando estiver lá
que eu ligo no CSS — é uma linha em cada superfície de metal.

---

## 3. Os vazios — onde o app mais parece sistema

Tela de histórico sem nada, nenhuma revisão, nenhum veículo. Hoje é um ícone
cinza no meio do branco.

```
A single image: a 1x3 row of three 3D scene renders on a fully transparent
background (alpha channel, PNG), generous padding between them, no ground
plane, no scenery, no sky.

STYLE - identical for all three:
Dark graphite and deep navy objects (#232A35, #0D1C33) with brushed steel
details (#AAB8CC) and one orange accent each (#FC6400). Matte surfaces, soft
contact shadow beneath each scene. Calm and quiet, not sad, not cute. No
people, no faces, no text, no logos.

CAMERA: three-quarter view from slightly above, same angle for all three.
LIGHT: one soft key from the upper left at 315 degrees, dim cool fill from the
lower right.

THE THREE SCENES:
1. A closed steel folder or document tray, empty, lid slightly open, an orange
   tab on its edge  (for "no history yet")
2. A desk calendar standing closed, clean, with an orange ribbon marker
   (for "no scheduled maintenance")
3. An empty steel parking chock or wheel stand on the ground, waiting, with an
   orange stripe  (for "no vehicle registered")
```

**Salvar** em `app/public/sos/vazios/`, 512×512 PNG transparente:

```
historico.png (1)   revisoes.png (2)   veiculos.png (3)
```

---

## 4. Os ícones da barra de baixo, em volume

Os cinco da barra inferior. Como objetos, a barra deixa de ser uma régua de
ícones de linha.

```
A single image: a 1x5 row of five small 3D icon renders on a fully transparent
background (alpha channel, PNG), generous even padding between them.

STYLE - identical for all five, non-negotiable:
Small machined metal objects, dark graphite (#232A35) with brushed steel edges
(#AAB8CC) catching the light, one orange element each (#FC6400). Compact and
solid, not chunky, not rounded like toys. Matte metal, crisp chamfers, soft
contact shadow. No text, no letters, no outlines.

CAMERA: three-quarter view from about 25 degrees above, identical for all
five, each object filling the same proportion of its cell.
LIGHT: one soft key from the upper left at 315 degrees, dim cool fill from the
lower right.

THE FIVE OBJECTS:
1. A small house with an orange door
2. A truck cab seen three-quarter front, orange mirror arm
3. A ventilated brake disc rotor standing upright, orange hub
4. A stopwatch lying flat, orange crown
5. A steel ID card or tag, orange stripe along one edge
```

**Salvar** em `app/public/sos/barra/`, 256×256 PNG transparente:

```
inicio.png (1)   veiculos.png (2)   sos.png (3)
historico.png (4)   conta.png (5)
```

---

## 5. O avatar do mecânico, sem rosto

Quando o mecânico não tem foto, hoje aparecem as iniciais num círculo. Isto é
melhor, e não obriga ninguém a escolher de quem é o rosto.

```
A single 3D render on a fully transparent background (alpha channel, PNG), no
ground plane.

A mechanic's steel helmet or cap seen three-quarter front, empty, no head
inside, no face, resting at a slight angle. Dark graphite body (#232A35),
brushed steel brim (#AAB8CC), one orange band around it (#FC6400). Matte
surfaces, crisp bevels, soft contact shadow beneath. No text, no logo, no
person, no face.

LIGHT: one soft key from the upper left at 315 degrees, dim cool fill from the
lower right. Square framing, object centered.
```

**Salvar** como `app/public/sos/avatar-mecanico.png`, 256×256.

---

## O que NÃO pedir

- **Botão, campo, caixa, barra, cartão.** Veja a nota do topo.
- **Pessoas e rostos.** Envelhecem mal e parecem banco de imagem.
- **A logo da Tecnoar dentro do render.** Ela já está no app em SVG nítido;
  dentro de uma imagem sai borrada e torta.
- **Texto de qualquer tipo.** Modelo de imagem erra letra, e não dá para
  traduzir depois.

---

## Enquanto as imagens não chegam

O app já lê o PNG quando ele existe e cai no ícone de linha quando não existe
(`app/src/comum/Arte.tsx`). Gere na ordem que quiser: cada arquivo que cair na
pasta aparece na próxima vez que você abrir a tela, sem deploy.

**A ordem que eu sugiro, por impacto:** pinos do mapa (1) → veículos (prompt 1
do outro arquivo) → vazios (3) → textura (2) → barra (4) → avatar (5).
