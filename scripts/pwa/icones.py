"""Recorta os ícones nos tamanhos que os apps usam.

O SOS sai do emblema redondo (design/sos-emblema.png, fundo transparente); o
Checklist, dos desenhos gerados por gerar-icones.mjs.

Uso (depois de rodar `node scripts/pwa/gerar-icones.mjs`):
    python scripts/pwa/icones.py
"""

from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
ORIGEM = RAIZ / 'tmp' / 'icones'
EMBLEMA = Image.open(RAIZ / 'design' / 'sos-emblema.png').convert('RGBA')

# Azul-marinho da marca, do centro para a borda: o mesmo da tela de abertura.
MARINHO_CENTRO = (15, 44, 85)
MARINHO_BORDA = (5, 15, 32)
MARINHO = (8, 21, 42)


def gravar(im: Image.Image, destino: Path) -> None:
    destino.parent.mkdir(parents=True, exist_ok=True)
    im.save(destino)
    print('gravado', destino.relative_to(RAIZ), f'{im.width}px')


def salvar(origem: str, destino: Path, lado: int) -> None:
    gravar(Image.open(ORIGEM / origem).convert('RGBA').resize((lado, lado), Image.LANCZOS), destino)


def fundo_marinho(lado: int) -> Image.Image:
    centro = Image.new('RGB', (lado, lado), MARINHO_CENTRO)
    borda = Image.new('RGB', (lado, lado), MARINHO_BORDA)
    # radial_gradient é preto no centro e branco na borda.
    mascara = Image.radial_gradient('L').resize((lado, lado), Image.LANCZOS)
    return Image.composite(borda, centro, mascara).convert('RGBA')


def emblema(lado: int, ocupa: float = 1.0, fundo: bool = False) -> Image.Image:
    """O emblema do SOS ao centro de um quadrado de `lado` px.

    `ocupa` é a fração do lado que o emblema toma. Sem `fundo` o quadrado fica
    transparente (o emblema já é redondo); com ele, azul-marinho — o iPhone e a
    máscara do Android não aceitam transparência.
    """
    tamanho = round(lado * ocupa)
    # Reduz com a cor já multiplicada pelo alfa: sem isso a borda ganha um fio escuro.
    arte = EMBLEMA.convert('RGBa').resize((tamanho, tamanho), Image.LANCZOS).convert('RGBA')
    tela = fundo_marinho(lado) if fundo else Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    tela.alpha_composite(arte, ((lado - tamanho) // 2, (lado - tamanho) // 2))
    return tela


# ── app SOS ────────────────────────────────────────────────────────────────
sos = RAIZ / 'app' / 'public'
gravar(emblema(512), sos / 'icone-512.png')
gravar(emblema(192), sos / 'icone-192.png')
# O Android recorta em círculo (ou no formato do aparelho) e só garante o
# círculo central de 80%: o emblema fica inteiro dentro dele.
gravar(emblema(512, 0.76, fundo=True), sos / 'icone-maskable-512.png')
gravar(emblema(180, 0.92, fundo=True).convert('RGB'), sos / 'apple-touch-icon.png')
gravar(emblema(64), sos / 'icone-64.png')
gravar(emblema(32), sos / 'favicon-32.png')
emblema(256).save(sos / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
print('gravado app/public/favicon.ico')

# ── Checklist ──────────────────────────────────────────────────────────────
check = RAIZ / 'public'
salvar('checklist.png', check / 'icon-512.png', 512)
salvar('checklist.png', check / 'icon-192.png', 192)
salvar('checklist-maskable.png', check / 'icon-maskable-512.png', 512)
salvar('checklist.png', check / 'apple-touch-icon.png', 180)
salvar('checklist-favicon.png', check / 'favicon-64.png', 64)
salvar('checklist-favicon.png', check / 'favicon-32.png', 32)

# ── app nativo (Capacitor) ─────────────────────────────────────────────────
nativo = RAIZ / 'assets'
gravar(emblema(1024, 0.92, fundo=True).convert('RGB'), nativo / 'icon-only.png')
# Ícone adaptável do Android: o gerador do Capacitor já encolhe a camada da
# frente para a área visível; a folga é só para o recorte em círculo.
gravar(emblema(1024, 0.88), nativo / 'icon-foreground.png')
Image.new('RGB', (1024, 1024), MARINHO).save(nativo / 'icon-background.png')

# Tela de abertura do app nativo: o emblema ao centro do azul-marinho.
for nome in ('splash.png', 'splash-dark.png'):
    tela = Image.new('RGBA', (2732, 2732), MARINHO + (255,))
    tela.alpha_composite(emblema(760), ((2732 - 760) // 2, (2732 - 760) // 2))
    tela.convert('RGB').save(nativo / nome)
print('gravado assets/splash.png e splash-dark.png')
