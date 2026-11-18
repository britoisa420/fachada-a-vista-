# Gera fotos de teste (fachada e propostas) para o teste ponta a ponta.
import sys, os
from PIL import Image, ImageDraw
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
def facade(path, wall, sign, text, glow=False):
    im = Image.new('RGB', (1600, 1067), '#cfd9e0'); d = ImageDraw.Draw(im)
    d.rectangle([200, 40, 1400, 900], fill=wall)
    for x in (380, 940): d.rectangle([x, 160, x+260, 380], fill='#2f4049')
    d.rectangle([280, 600, 860, 900], fill='#2f4049'); d.rectangle([960, 580, 1280, 900], fill='#2f4049')
    d.rectangle([480, 450, 1120, 560], fill=sign)
    d.text((560, 480), text, fill='#ffe3a3' if glow else '#555', font_size=60)
    d.rectangle([0, 900, 1600, 1067], fill='#a8a39b')
    im.save(path, quality=88)
facade(f'{out}/fachada.jpg', '#d9cdb8', '#e8e1d2', 'LOJA TESTE')
facade(f'{out}/proposta-a.jpg', '#34383b', '#1f2224', 'LOJA TESTE', True)
facade(f'{out}/proposta-b.jpg', '#e9e4da', '#0f4c5c', 'LOJA TESTE', True)
facade(f'{out}/proposta-a-v2.jpg', '#2b3d33', '#111', 'LOJA TESTE', True)
Image.new('RGB', (400, 300), '#888').save(f'{out}/pequena.jpg')
Image.new('RGBA', (300, 120), (20, 60, 120, 255)).save(f'{out}/logo.png')
for i in range(1, 5): Image.new('RGB', (800, 600), ['#a33', '#3a3', '#33a', '#aa3'][i-1]).save(f'{out}/ref{i}.jpg')
open(f'{out}/falsa.jpg', 'w').write('isto não é uma imagem')
print('ok')
