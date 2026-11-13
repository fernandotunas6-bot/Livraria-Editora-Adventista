#!/usr/bin/env python3
"""Capas tipográficas para os produtos que vieram do KiGest sem fotografia.

Os 287 artigos que a loja vende e o site não tinha chegaram do KiGest só com nome, preço e
existência — não há fotografia de nenhum. Publicá-los sem capa punha no catálogo uma caixa
cinzenta com «No Image» em inglês (o PLACEHOLDER dos componentes), e repetir a mesma
`capa-por-definir.webp` 287 vezes dava uma grelha de produtos todos iguais, onde o cliente não
distingue um do outro.

Aqui gera-se uma capa por produto, no desenho da casa — o mesmo gradiente azul, o mesmo emblema,
a mesma moldura preta da `capa-por-definir.webp` — com o título do produto no lugar onde aquela
diz «Capa por definir». É uma capa tipográfica e vê-se que o é: não imita a arte da editora nem
se faz passar pela capa verdadeira. Quando houver fotografia, substitui-se no painel.

Correr da raiz do repositório:
    python3 scripts/catalogo/capa_tipografica.py docs/catalogo/mapa-kigest-<data>.json
Precisa do Pillow (`pip install pillow`).
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parents[2]
DESTINO = RAIZ / 'app/web/public/images/capas/kigest'
EMBLEMA = RAIZ / 'app/web/public/logo-icon.png'

# Medidas e cores lidas da capa-por-definir.webp, para as duas ficarem da mesma família.
LARGURA, ALTURA = 400, 600
MOLDURA = 10
TOPO = (12, 72, 107)
FUNDO = (7, 34, 52)
TITULO = (255, 255, 255)
ASSINATURA = (150, 185, 210)
EMBLEMA_CAIXA = (149, 200, 254, 315)  # esquerda, topo, direita, base
TITULO_TOPO = 360
TITULO_BASE = 500
ASSINATURA_Y = 522

SERIF_NEGRITO = ['/System/Library/Fonts/Supplemental/Georgia Bold.ttf',
                 '/Library/Fonts/Georgia Bold.ttf',
                 '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf']
SERIF = ['/System/Library/Fonts/Supplemental/Georgia.ttf',
         '/Library/Fonts/Georgia.ttf',
         '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf']


def fonte(caminhos, tamanho):
    for c in caminhos:
        if Path(c).exists():
            return ImageFont.truetype(c, tamanho)
    raise SystemExit(f'nenhuma das fontes existe: {caminhos}')


def ficheiro_de(titulo):
    """Nome de ficheiro a partir do título, como o das capas de `capas/novos`."""
    sem_acento = unicodedata.normalize('NFKD', titulo).encode('ascii', 'ignore').decode()
    limpo = re.sub(r'[^a-zA-Z0-9]+', '-', sem_acento).strip('-').lower()
    return f'{limpo[:70].rstrip("-")}.webp'


def fundo():
    img = Image.new('RGB', (LARGURA, ALTURA), FUNDO)
    desenho = ImageDraw.Draw(img)
    for y in range(ALTURA):
        p = y / (ALTURA - 1)
        cor = tuple(round(TOPO[i] + (FUNDO[i] - TOPO[i]) * p) for i in range(3))
        desenho.line([(0, y), (LARGURA, y)], fill=cor)
    desenho.rectangle([0, 0, LARGURA - 1, ALTURA - 1], outline=(0, 0, 0), width=MOLDURA)
    return img


def com_emblema(img):
    # O logo-icon.png é o emblema na cor escura da marca (#013766), que num fundo azul-escuro
    # não se vê. Aproveita-se a sua silhueta e pinta-se de branco — é a versão clara oficial,
    # a mesma do logo-light.png, que é a que a marca usa sobre fundo escuro.
    silhueta = Image.open(EMBLEMA).convert('RGBA')
    emblema = Image.new('RGBA', silhueta.size, (255, 255, 255, 0))
    emblema.putalpha(silhueta.getchannel('A').point(lambda a: round(a * 0.92)))
    x0, y0, x1, y1 = EMBLEMA_CAIXA
    largura, altura = x1 - x0, y1 - y0
    escala = min(largura / emblema.width, altura / emblema.height)
    novo = emblema.resize((round(emblema.width * escala), round(emblema.height * escala)), Image.LANCZOS)
    img.paste(novo, (x0 + (largura - novo.width) // 2, y0 + (altura - novo.height) // 2), novo)
    return img


def quebrar(texto, fonte_, desenho, largura_util):
    linhas, actual = [], ''
    for palavra in texto.split():
        tentativa = f'{actual} {palavra}'.strip()
        if desenho.textlength(tentativa, font=fonte_) <= largura_util or actual == '':
            actual = tentativa
        else:
            linhas.append(actual)
            actual = palavra
    if actual:
        linhas.append(actual)
    return linhas


def escrever_titulo(img, titulo):
    desenho = ImageDraw.Draw(img)
    largura_util = LARGURA - 2 * (MOLDURA + 26)
    altura_util = TITULO_BASE - TITULO_TOPO
    # O corpo desce até o título caber na caixa: um nome curto fica grande, um longo encolhe.
    for tamanho in range(30, 13, -1):
        f = fonte(SERIF_NEGRITO, tamanho)
        linhas = quebrar(titulo, f, desenho, largura_util)
        entrelinha = round(tamanho * 1.28)
        if len(linhas) * entrelinha <= altura_util and len(linhas) <= 5:
            break
    else:
        # Nem no corpo mais pequeno cabe: corta-se com reticências na última linha que cabe.
        linhas = linhas[:5]
        linhas[-1] = f'{linhas[-1][:28].rstrip()}…'
    y = TITULO_TOPO + (altura_util - len(linhas) * entrelinha) // 2
    for linha in linhas:
        desenho.text((LARGURA / 2, y), linha, font=f, fill=TITULO, anchor='ma')
        y += entrelinha
    f = fonte(SERIF, 15)
    desenho.text((LARGURA / 2, ASSINATURA_Y), 'Livraria Adventista', font=f, fill=ASSINATURA, anchor='ma')
    return img


def capa(titulo):
    return escrever_titulo(com_emblema(fundo()), titulo)


def main():
    if len(sys.argv) < 2:
        raise SystemExit('uso: capa_tipografica.py <mapa-kigest-<data>.json>')
    mapa = json.loads(Path(sys.argv[1]).read_text('utf8'))
    DESTINO.mkdir(parents=True, exist_ok=True)
    vistos, feitas = {}, 0
    for produto in mapa['novos']:
        nome = ficheiro_de(produto['titulo'])
        if nome in vistos:
            # Dois títulos diferentes a dar o mesmo nome de ficheiro: o segundo leva a
            # referência do KiGest ao fim, para não escrever por cima do primeiro.
            nome = f'{nome[:-5]}-{produto["kigest_ref"].lower()}.webp'
        vistos[nome] = produto['titulo']
        capa(produto['titulo']).save(DESTINO / nome, 'WEBP', quality=82, method=6)
        feitas += 1
    print(f'{feitas} capas em {DESTINO.relative_to(RAIZ)}')


if __name__ == '__main__':
    main()
