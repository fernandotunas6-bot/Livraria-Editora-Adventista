# Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
# © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

"""Fotografias das lojas físicas: de uma pasta de originais para WebP prontas para o site.

As fotografias chegam das lojas como JPEG de telemóvel (1280×960, 150 KB cada). O site mostra-as
em dois tamanhos muito diferentes — a miniatura do cartão da loja tem menos de 100 px de largura e
a galeria da loja escolhida chega aos 600 px — por isso guarda-se cada uma em dois tamanhos e o
navegador escolhe (`lojaSrcSet`, app/web/src/lib/stores.js). Servir a de 1280 px a uma miniatura
custava-lhe 150 KB por loja na lista.

Correr da raiz do repositório, uma vez por loja, à medida que as fotografias chegam:
    python3 scripts/imagens/lojas.py huambo /caminho/para/fotos/*.jpg

Escreve `app/web/public/images/lojas/<slug>-<n>.webp` (1280 px) e `.../480/<slug>-<n>.webp`,
pela ordem em que os ficheiros forem dados, e imprime os caminhos para a migração que os
guarda na coluna `gallery` da loja. Precisa do Pillow (`pip install pillow`).
"""
import sys
from pathlib import Path

from PIL import Image, ImageOps

RAIZ = Path(__file__).resolve().parents[2]
LOJAS = RAIZ / 'app/web/public/images/lojas'
LARGURAS = (480, 1280)  # as mesmas de `lojaSrcSet` (app/web/src/lib/stores.js)
QUALIDADE = 78
MAIOR = max(LARGURAS)


def converter(slug, origens):
    LOJAS.mkdir(parents=True, exist_ok=True)
    (LOJAS / '480').mkdir(parents=True, exist_ok=True)
    caminhos = []
    for n, origem in enumerate(origens, start=1):
        nome = f'{slug}-{n}.webp'
        with Image.open(origem) as bruta:
            # O EXIF das fotografias de telemóvel guarda a rotação à parte dos pixels: sem isto,
            # uma fotografia tirada na vertical aparece deitada no site.
            img = ImageOps.exif_transpose(bruta).convert('RGB')
            for largura in LARGURAS:
                destino = LOJAS / (nome if largura == MAIOR else f'{largura}/{nome}')
                escala = min(1, largura / img.width)
                tamanho = (round(img.width * escala), round(img.height * escala))
                img.resize(tamanho, Image.LANCZOS).save(
                    destino, 'WEBP', quality=QUALIDADE, method=6)
                print(f'{destino.relative_to(RAIZ)}: {tamanho[0]}×{tamanho[1]}, '
                      f'{destino.stat().st_size // 1024} KB')
        caminhos.append(f'/images/lojas/{nome}')
    return caminhos


def main(argv):
    if len(argv) < 3:
        sys.exit('uso: python3 scripts/imagens/lojas.py <slug-da-loja> <foto> [foto...]')
    slug, origens = argv[1], [Path(p) for p in argv[2:]]
    em_falta = [p for p in origens if not p.is_file()]
    if em_falta:
        sys.exit('não encontrei: ' + ', '.join(str(p) for p in em_falta))
    caminhos = converter(slug, origens)
    print('\ngallery (pela ordem dada):')
    for c in caminhos:
        print(f'  {c}')


if __name__ == '__main__':
    main(sys.argv)
