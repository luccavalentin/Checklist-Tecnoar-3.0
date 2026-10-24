# Elementos 3D do SOS Tecnoar — prompts para gerar

Para colar no ChatGPT (GPT Image). Cada bloco entre ``` vai inteiro, de uma vez.

> **Este arquivo substitui `prompts-icones-3d.md`.** Aquele pedia *"soft matte
> plastic, friendly and chunky, like premium mobile app icons"* — plástico
> fofo. É a direção errada para um app que um motorista abre parado no
> acostamento às duas da manhã. Aqui a linguagem é a do botão de socorro:
> **metal usinado, instrumento de precisão, luz de uma fonte só.**

---

## As três regras que decidem o resultado

**1. Gere o conjunto inteiro numa imagem só, em grade.**
Objeto gerado um a um nunca casa com o anterior — muda o ângulo, a altura da
câmera, a direção da luz e o acabamento do material. Numa grade única o modelo
é obrigado a manter tudo igual. Depois você recorta. Só volte ao prompt
individual para refazer um que saiu ruim, e aí mande a grade junto como
referência de estilo.

**2. A luz vem SEMPRE do alto à esquerda.**
Não é capricho: todo o CSS do app — o aro do disco, o domo do cubo, o chanfro
dos furos, a sombra projetada — foi desenhado com a fonte a 315°. Uma imagem
iluminada de outro lado denuncia na hora que foi colada ali, por mais bonita
que seja sozinha.

**3. Fundo transparente, sempre.**
O app tem tema claro e escuro. Imagem com fundo sólido só funciona num dos
dois e obriga a fazer tudo em dobro.

## A paleta (não deixe o modelo inventar)

| Cor | Hex | Onde |
| --- | --- | --- |
| Laranja Tecnoar | `#FC6400` | O acento. Uma peça por objeto, nunca o objeto todo |
| Azul-marinho | `#0D1C33` | Corpo escuro |
| Grafite | `#232A35` | Metal fosco, o volume principal |
| Aço claro | `#AAB8CC` | Aresta torneada, o brilho que pega a luz |
| Ciano Tecnoar | `#00A8E8` | Vidro, luz acesa, indicador vivo |

---

## 1. Os veículos — o conjunto que mais muda o app

Hoje a tela "Meus veículos" mostra um ícone de linha genérico. Com o render do
caminhão certo, ela deixa de ser uma LISTA DE REGISTROS e passa a ser **o seu
caminhão** — que é a diferença entre sistema e app.

São caminhões brasileiros: cabine sobre motor (Scania, Volvo, Mercedes, VW),
não o bicudo americano. Isso está dito no prompt de propósito.

```
A single image: a 3x4 grid of twelve photorealistic 3D vehicle renders on a
fully transparent background (alpha channel, PNG), generous even padding
between them.

STYLE - identical for all twelve, non-negotiable:
Studio product render of a clean modern commercial vehicle. Dark graphite and
deep navy bodywork (#232A35 and #0D1C33) with brushed steel trim (#AAB8CC) and
exactly one orange accent per vehicle (#FC6400) on a small detail such as a
mirror arm, a wheel hub or a thin body stripe. Matte automotive paint with a
soft clearcoat sheen, no chrome glare, no decals, no logos, no text, no
license plates, no brand badges.

CAMERA - identical for all twelve:
Three-quarter front view from the left side, camera slightly above the
windshield line, long lens, no perspective distortion, every vehicle at the
same angle, same scale relative to its own length, and centered in its cell.

LIGHT - identical for all twelve:
A single large soft key light from the upper left at about 315 degrees, cool
neutral fill from the right at a quarter of the intensity, a soft elliptical
contact shadow on the ground directly beneath each vehicle. No rim lights from
behind, no lens flare, no reflections of an environment.

THE TWELVE VEHICLES, in reading order:
1. European cab-over semi-truck tractor unit, 4x2, no trailer attached
2. European cab-over semi-truck tractor unit, 6x4, three axles, no trailer
3. A dry-box semi-trailer alone, no tractor, landing gear down
4. Full articulated combination: cab-over tractor plus one dry-box semi-trailer
5. B-train double trailer combination: tractor plus two linked box trailers
6. Road train: tractor plus two box trailers joined by a dolly
7. Spread-axle semi-trailer with widely separated rear axles, no tractor
8. Two-axle rigid box truck, 4x2, short wheelbase
9. Three-axle rigid box truck, 6x2
10. Modern intercity coach bus
11. Large panel cargo van, high roof
12. Four-door pickup truck with a cargo bed

Headlights and marker lights softly lit in cyan-white (#00A8E8), dim, as if
the vehicle is parked with its running lights on. Tires dark matte, no brand
markings on the sidewalls.
```

**O que fazer com o resultado:** recorte cada veículo em PNG quadrado com
transparência, 1024×1024, com uma margem de respiro de uns 8% em volta. Salve
em `app/public/sos/veiculos/` com estes nomes exatos — eles batem com os tipos
que o banco já usa:

```
cavalo.png      (1)        bitrem.png      (5)      truck.png        (9)
cavalo-6x4.png  (2)        rodotrem.png    (6)      onibus.png      (10)
carreta.png     (3)        vanderleia.png  (7)      van.png         (11)
conjunto.png    (4)        toco.png        (8)      utilitario.png  (12)
```

---

## 2. As ocorrências — o que quebrou no caminhão

São os seis problemas que o app pergunta ao abrir um socorro. Hoje são ícones
de linha. Como objetos usinados viram **peças de verdade** — e a Tecnoar é
fabricante de freio, então a peça é o idioma natural da casa.

```
A single image: a 2x4 grid of eight 3D object renders on a fully transparent
background (alpha channel, PNG), generous even padding between them.

STYLE - identical for all eight, non-negotiable:
Precision machined mechanical parts, studio product render. Dark graphite
metal (#232A35) with turned steel edges that catch the light (#AAB8CC), fine
lathe machining marks on flat faces, crisp chamfers on every hole and edge.
Exactly one orange element per object (#FC6400) and nothing more. Matte metal,
no chrome, no mirror reflections, no glass domes, no cartoon styling, no
rounded toy proportions, no outlines, no text, no labels.

CAMERA - identical for all eight:
Three-quarter view from the upper left, about 25 degrees above the object,
same angle, same focal length, each object filling the same proportion of its
cell, centered.

LIGHT - identical for all eight:
One large soft key light from the upper left at 315 degrees, dim cool fill
from the lower right, soft contact shadow beneath each object. Bright specular
only on turned edges facing the key light. No backlight.

THE EIGHT OBJECTS, in reading order:
1. A ventilated cross-drilled brake disc rotor with a brake caliper mounted on
   it, the caliper body in orange
2. A heavy-duty truck starter motor, cylindrical, with an orange solenoid
3. A sectioned engine block fragment showing a piston and connecting rod, with
   an orange piston crown
4. A truck electrical relay box with a bundle of wires, one wire in orange,
   and a small cyan indicator light
5. A heavy truck tire mounted on a steel rim, visibly deflated and flattened
   at the bottom, with an orange valve stem
6. A fluid hose fitting with a single heavy drop of dark fluid falling from
   it, the hose collar in orange
7. A hydraulic brake master cylinder with an orange reservoir cap
8. A closed steel toolbox with an orange latch
```

**Nomes dos arquivos**, em `app/public/sos/ocorrencias/`, 512×512 PNG com
transparência — estes batem com os valores que o banco já grava:

```
freios.png (1)      nao_liga.png (2)     mecanico.png (3)
pane_eletrica.png (4)   roda_pneu.png (5)    vazamento.png (6)
[o 7 é reserva]     outro.png (8)
```

---

## 3. A cena do socorro — uma imagem só, para os vazios

As telas de histórico e de "nenhum chamado" hoje são um vazio com um ícone
cinza no meio. É o momento em que o app mais parece sistema. Uma cena boa
resolve as duas.

```
A single wide 3D render on a fully transparent background (alpha channel,
PNG), no ground plane, no sky, no scenery.

A European cab-over semi-truck tractor with a box trailer, stopped at an
angle, seen in three-quarter rear view from the left. A reflective warning
triangle stands on the ground behind it, closer to the camera and sharply in
focus. The truck hazard lights are lit in warm amber (#FC6400), glowing
softly. A service van with a low-profile light bar is approaching from the
left in the background, slightly out of focus, its beacon lit cyan (#00A8E8).

STYLE: cinematic night, dark graphite and deep navy palette (#232A35,
#0D1C33), matte surfaces, no chrome glare, no text anywhere, no logos, no
license plates, no people, no faces.

LIGHT: a single cool moonlight key from the upper left at 315 degrees; the
only warm light in the frame comes from the truck own hazard lights. Soft
contact shadows under both vehicles. No lens flare.

Composition: the truck occupies the right two thirds, with empty transparent
space on the left for text to sit over.
```

Salvar como `app/public/sos/cena-socorro.png`, 2048 de largura.

---

## O que NÃO pedir

- **Pessoas e rostos.** Envelhecem mal, parecem banco de imagem e obrigam a
  escolher de quem é o rosto. A foto genérica que acabou de sair do topo de
  "Meus veículos" era exatamente isso.
- **Logo da Tecnoar dentro do render.** A marca já está no topo do app em SVG
  nítido. Dentro de uma imagem ela sai borrada, torta, e não dá para corrigir
  sem gerar tudo de novo.
- **Texto de qualquer tipo.** Modelo de imagem erra letra, e não dá para
  traduzir depois.
- **Fundo, chão ou cenário** nos itens 1 e 2. Transparente, sempre.

---

## Enquanto as imagens não chegam

O app não fica esperando: o código vai ler o PNG quando ele existir e cair no
ícone de linha quando não existir. Pode gerar na ordem que quiser, e cada
arquivo que você soltar na pasta já aparece na próxima vez que abrir a tela.
