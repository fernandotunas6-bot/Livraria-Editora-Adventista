"""Capa a partir de uma fotografia do livro tirada pelo dono (cantos medidos à mão).

    python3 capa_da_fotografia.py foto.webp saida.webp '[[x,y],[x,y],[x,y],[x,y]]' [--aparar e,c,d,b]

Os cantos são os da frente do livro: sup. esq., sup. dir., inf. dir., inf. esq. A capa endireita-se
à proporção que tem (média das arestas opostas: chega para uma foto tirada quase de frente) e não
se deforma nem se corta para caber nos 400×600 do catálogo: ocupa a largura toda, e as faixas que
sobram em cima e em baixo continuam a própria fotografia (reflexo da orla, desfocado e um pouco
escurecido, para não parecer parte da capa). --aparar tira píxeis da capa já endireitada (a
1200 px de altura) à esquerda, em cima, à direita e em baixo, para largar a parede, a sombra da
aresta e a ranhura da capa dura junto à lombada.

Usado em 2026-11-14 para «O Poder Medicinal dos Sucos» (LIV-159), com
'[[34,18],[1226,21],[1138,1440],[80,1436]]' --aparar 30,5,3,4 sobre a foto de 1236×1464.
"""
import json, sys
import cv2, numpy as np
from PIL import Image, ImageEnhance, ImageFilter

TAM = (400, 600)


def endireitar(src, quad, aparar=(0, 0, 0, 0), alt=1200):
    bgr = cv2.imread(src)
    q = np.array(quad, np.float32)
    larg_m = (np.linalg.norm(q[1] - q[0]) + np.linalg.norm(q[2] - q[3])) / 2
    alt_m = (np.linalg.norm(q[3] - q[0]) + np.linalg.norm(q[2] - q[1])) / 2
    larg = round(alt * larg_m / alt_m)
    dst = np.array([[0, 0], [larg, 0], [larg, alt], [0, alt]], np.float32)
    capa = cv2.warpPerspective(bgr, cv2.getPerspectiveTransform(q, dst), (larg, alt),
                               flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
    e, c, d, b = aparar
    capa = capa[c:alt - b, e:larg - d]
    return Image.fromarray(cv2.cvtColor(capa, cv2.COLOR_BGR2RGB))


def em_400x600(im):
    im = im.resize((TAM[0], round(im.height * TAM[0] / im.width)), Image.LANCZOS)
    if im.height >= TAM[1]:  # mais alta do que 2:3: corta ao centro (não acontece com estes livros)
        y = (im.height - TAM[1]) // 2
        return im.crop((0, y, TAM[0], y + TAM[1]))
    y0 = (TAM[1] - im.height) // 2
    y1 = TAM[1] - im.height - y0

    def faixa(caixa):
        f = im.crop(caixa).transpose(Image.FLIP_TOP_BOTTOM).filter(ImageFilter.GaussianBlur(10))
        return ImageEnhance.Brightness(f).enhance(0.8)

    out = Image.new('RGB', TAM)
    if y0:
        out.paste(faixa((0, 0, TAM[0], y0)), (0, 0))
    if y1:
        out.paste(faixa((0, im.height - y1, TAM[0], im.height)), (0, y0 + im.height))
    out.paste(im, (0, y0))
    return out


if __name__ == '__main__':
    src, saida, quad = sys.argv[1], sys.argv[2], json.loads(sys.argv[3])
    aparar = (0, 0, 0, 0)
    if '--aparar' in sys.argv:
        aparar = tuple(int(v) for v in sys.argv[sys.argv.index('--aparar') + 1].split(','))
    em_400x600(endireitar(src, quad, aparar)).save(saida, 'WEBP', quality=86, method=6)
    print(saida)
