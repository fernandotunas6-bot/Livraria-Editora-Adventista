# Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
# © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

"""Montagens de produto: recorte (máscara), fundo neutro, sombra suave."""
import numpy as np, cv2
from PIL import Image, ImageFilter
FUNDO = (244, 241, 236)  # papel quente, perto do bg-muted da loja
def pele(rgb):
    ycc = cv2.cvtColor(rgb, cv2.COLOR_RGB2YCrCb)
    Y, Cr, Cb = ycc[..., 0], ycc[..., 1].astype(int), ycc[..., 2].astype(int)
    return (Cr >= 135) & (Cr <= 180) & (Cb >= 77) & (Cb <= 135) & (Y > 35)
def limpa(m, abrir=3, fechar=9):
    m = m.astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((abrir, abrir), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((fechar, fechar), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    if n < 2: return m.astype(bool)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); m = (lab == i).astype(np.uint8)
    cnt, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    f = np.zeros_like(m); cv2.drawContours(f, cnt, -1, 1, -1)   # tapa buracos
    return f.astype(bool)
def montar(rgba, tam=(340, 510), larg=0.74, cy=0.47, sombra=True, fundo=FUNDO, escala=2):
    """rgba: PIL RGBA já recortado. Devolve PIL RGB tam, desenhado a 2x e reduzido."""
    W, H = tam[0]*escala, tam[1]*escala
    o = rgba.copy(); f = min(W*larg/o.width, H*0.80/o.height)
    o = o.resize((round(o.width*f), round(o.height*f)), Image.LANCZOS)
    base = Image.new('RGBA', (W, H), fundo + (255,))
    x = (W - o.width)//2; y = round(H*cy - o.height/2)
    if sombra:
        a = np.asarray(o)[..., 3].astype(np.float32)/255
        sh = Image.fromarray((a*95).astype(np.uint8)).filter(ImageFilter.GaussianBlur(9*escala))
        lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); blk = Image.new('RGBA', o.size, (40, 30, 20, 255))
        lay.paste(blk, (x + 3*escala, y + 7*escala), sh); base.alpha_composite(lay)
    base.alpha_composite(o, (x, y))
    return base.convert('RGB').resize(tam, Image.LANCZOS)
