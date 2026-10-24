"""Reduz os renders originais sem remover cores nem reconstruir a transparência."""
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
manifest = json.loads((root / 'design/prompts-ocorrencias-v2.json').read_text(encoding='utf-8'))
out = root / 'app/public/sos/mobile-3d'
for asset in manifest:
    with Image.open(asset['source']) as original:
        image = original.convert('RGBA')
        image.thumbnail((320, 320), Image.Resampling.LANCZOS)
        target = out / f"ocorrencia-{asset['key']}-v2.webp"
        image.save(target, 'WEBP', quality=94, method=6, exact=True)
        print(f'{target.name}: {target.stat().st_size} bytes')
