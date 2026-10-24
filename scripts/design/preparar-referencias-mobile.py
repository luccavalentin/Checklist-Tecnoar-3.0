"""Otimiza as imagens fornecidas pelo usuário, preservando cor e transparência."""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
downloads = Path.home() / 'Downloads'
out = root / 'app/public/sos/mobile-3d'
out.mkdir(parents=True, exist_ok=True)
sources = {
    'estrada': (downloads / 'Caminhão na estrada molhada ao anoitecer.png', 1080),
    'oficina': (downloads / 'Garagem Industrial com Caminhão e Reflexos.png', 1080),
    'sirene': (downloads / 'Giroflex de emergência futurista laranja.png', 240),
    'selo-sos': (downloads / 'Distintivo SOS de Emergência Futurista.png', 480),
    'whatsapp': (downloads / 'Ícone WhatsApp Verde com Acabamento Dourado.png', 160),
    'ligar': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 20_58_58-1.png', 160),
    'agendar-revisao': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 21_00_39-1.png', 720),
    'tema-claro': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 21_01_15-6.png', 160),
    'tema-escuro': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 21_01_15-7.png', 160),
    'tema-auto': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 21_01_14-5.png', 160),
    'periodo-qualquer': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 21_01_13-4.png', 160),
    'historico': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 20_59_01-5.png', 160),
    'ia': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 20_58_59-3.png', 160),
    'revisoes': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 21_01_11-1.png', 160),
    'ferramentas': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 21_01_12-2.png', 160),
    'caminhao': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 21_01_04-1.png', 320),
    'veiculo-toco': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 20_58_59-2.png', 256),
    'veiculo-truck': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 21_01_05-2.png', 256),
    'veiculo-carreta': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 21_01_06-4.png', 256),
    'veiculo-onibus': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 21_01_07-5.png', 256),
    'veiculo-van': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 21_01_09-7.png', 256),
    'veiculo-utilitario': (downloads / 'Imagem do ChatGPT 23 de out. de 2026, 21_01_09-8.png', 256),
}
for group in ('conta', 'nav', 'ia'):
    for source in (root / 'tmp/elementos-referencia' / group).glob('*.png'):
        sources[source.stem] = (source, 256 if group == 'ia' else 160)
for name, (source, size) in sources.items():
    with Image.open(source) as im:
        if name == 'agendar-revisao':
            # Retira somente as margens transparentes do botão exportado.
            bbox = im.getchannel('A').point(lambda v: 255 if v > 32 else 0).getbbox()
            if bbox:
                im = im.crop(bbox)
        im.thumbnail((size, size), Image.Resampling.LANCZOS)
        im.save(out / f'{name}.webp', 'WEBP', quality=88, method=6)
print(f'{len(sources)} imagens preparadas em {out}')
