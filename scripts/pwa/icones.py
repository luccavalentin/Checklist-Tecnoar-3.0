"""Recorta os ícones gerados por gerar-icones.mjs nos tamanhos que os apps usam.

Uso (depois de rodar `node scripts/pwa/gerar-icones.mjs`):
    python scripts/pwa/icones.py
"""

from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[2]
ORIGEM = RAIZ / 'tmp' / 'icones'


def salvar(origem: str, destino: Path, lado: int) -> None:
    im = Image.open(ORIGEM / origem).convert('RGBA').resize((lado, lado), Image.LANCZOS)
    destino.parent.mkdir(parents=True, exist_ok=True)
    im.save(destino)
    print('gravado', destino.relative_to(RAIZ), f'{lado}px')


# ── app SOS ────────────────────────────────────────────────────────────────
sos = RAIZ / 'app' / 'public'
salvar('sos.png', sos / 'icone-512.png', 512)
salvar('sos.png', sos / 'icone-192.png', 192)
salvar('sos-maskable.png', sos / 'icone-maskable-512.png', 512)
salvar('sos.png', sos / 'apple-touch-icon.png', 180)
salvar('sos-favicon.png', sos / 'icone-64.png', 64)
salvar('sos-favicon.png', sos / 'favicon-32.png', 32)

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
salvar('sos.png', nativo / 'icon-only.png', 1024)
salvar('sos-maskable.png', nativo / 'icon-foreground.png', 1024)
Image.new('RGB', (1024, 1024), (8, 21, 42)).save(nativo / 'icon-background.png')

# Tela de abertura do app nativo: o ícone ao centro do azul-marinho.
icone = Image.open(ORIGEM / 'sos.png').convert('RGBA').resize((760, 760), Image.LANCZOS)
for nome in ('splash.png', 'splash-dark.png'):
    tela = Image.new('RGBA', (2732, 2732), (8, 21, 42, 255))
    tela.alpha_composite(icone, ((2732 - 760) // 2, (2732 - 760) // 2))
    tela.convert('RGB').save(nativo / nome)
print('gravado assets/splash.png e splash-dark.png')
