"""Otimiza os novos ícones sem remover fundos por cor nem alterar os materiais."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
assets = json.loads((root / 'design/prompts-profissionais-v3.json').read_text(encoding='utf-8'))
for asset in assets:
    with Image.open(asset['source']) as original:
        image = original.convert('RGBA')
        image.thumbnail((320, 320), Image.Resampling.LANCZOS)
        target = root / 'app/public/sos/mobile-3d' / f"{asset['key']}.webp"
        image.save(target, 'WEBP', quality=94, method=6, exact=True)
        print(f'{target.name}: {target.stat().st_size} bytes')
