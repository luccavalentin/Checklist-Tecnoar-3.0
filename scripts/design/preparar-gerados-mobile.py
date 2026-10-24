"""Derivados locais dos renders gerados com imagegen em 23/10/2026."""
from pathlib import Path
from PIL import Image
import json

root = Path(__file__).resolve().parents[2]
generated = Path.home() / '.codex/generated_images/01a16b33-29b5-7b83-adb5-7205ae6c4dc3'
out = root / 'app/public/sos/mobile-3d'
assets = {
    'termos-3d': 'exec-d3eafa06-d08b-4562-b12e-93c0906a65aa.png',
    'sair-3d': 'exec-2f329847-c5de-4e05-a2df-0aa34c1f7adc.png',
    'excluir-3d': 'exec-4d660e09-e4e0-404e-b9f2-d1368f0b9a40.png',
    'enviar-3d': 'exec-e70f62e0-6606-4234-8e4d-f9a1dc3aabe8.png',
    'manometro': 'exec-97d107f8-3750-43e2-909d-967b7e685cf5.png',
    'freio-travado': 'exec-11aebb9c-6049-4b1f-9481-d038d7f0c1c3.png',
    'chiado-ar': 'exec-06933e34-ac21-4609-ba06-6a959881aded.png',
    'roda-quente': 'exec-19aed878-186d-4662-9a28-8a07ab1b25de.png',
    'alerta-painel': 'exec-959b25eb-956e-4691-b884-8dbaf13e88a7.png',
    'pino-brasil': 'exec-90321b75-4461-4291-9af1-9d95baf0e0b7.png',
    'pino-veiculo-premium': 'exec-f328ed63-5538-4aed-b784-057ea5526f61.png',
    'ligar-central-3d': 'exec-fd30069a-f480-4b72-a135-73ac8f4ed84f.png',
    'cancelar-socorro-3d': 'exec-683ac7b8-39c6-4150-97f7-4c8741d026f6.png',
}
manifest = root / 'design/prompts-refinamento-premium-2026-10-24.json'
if manifest.exists():
    assets.update({a['key']: a['source'] for a in json.loads(manifest.read_text(encoding='utf-8'))})
for name, source in assets.items():
    with Image.open(generated / source) as im:
        if name.endswith('-premium') or name in ('ligar-central-3d', 'cancelar-socorro-3d'):
            # A ponta precisa coincidir com a base da caixa do Leaflet.
            bbox = im.getchannel('A').point(lambda v: 255 if v > 32 else 0).getbbox()
            if bbox:
                im = im.crop(bbox)
        im.thumbnail((256, 320) if name == 'pino-veiculo-premium' else (256, 256), Image.Resampling.LANCZOS)
        im.save(out / f'{name}.webp', 'WEBP', quality=92, method=6)
print(f'{len(assets)} assets 3D preparados')
