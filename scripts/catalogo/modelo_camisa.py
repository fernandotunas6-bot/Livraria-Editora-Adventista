# Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
# © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

"""Modelo de camisa (t-shirt e polo) desenhado em código, para aplicar a estampa."""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops

S = 4  # super-amostragem

def _suaviza(pts, n=24):
    """Curva de Catmull-Rom fechada a partir dos pontos de controlo."""
    p = np.array(pts, dtype=float)
    p = np.vstack([p[-1], p, p[0], p[1]])
    saida = []
    for i in range(1, len(p)-2):
        p0, p1, p2, p3 = p[i-1], p[i], p[i+1], p[i+2]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t*t, t*t*t
            saida.append(0.5*((2*p1) + (-p0+p2)*t + (2*p0-5*p1+4*p2-p3)*t2 + (-p0+3*p1-3*p2+p3)*t3))
    return [tuple(q) for q in saida]

def _corpo(W, H):
    x = lambda f: f*W
    y = lambda f: f*H
    return _suaviza([
        (x(.355), y(.075)), (x(.30), y(.085)),                   # ombro esq.
        (x(.175), y(.145)), (x(.055), y(.265)),                  # manga esq.
        (x(.085), y(.375)), (x(.175), y(.415)),                  # punho esq.
        (x(.215), y(.345)), (x(.207), y(.62)), (x(.212), y(.895)),# lado esq.
        (x(.215), y(.925)), (x(.33), y(.933)), (x(.50), y(.935)),  # bainha
        (x(.67), y(.933)), (x(.785), y(.925)), (x(.788), y(.895)),
        (x(.793), y(.62)), (x(.785), y(.345)),                     # lado dir.
        (x(.825), y(.415)), (x(.915), y(.375)),                  # punho dir.
        (x(.945), y(.265)), (x(.825), y(.145)),                  # manga dir.
        (x(.70), y(.085)), (x(.645), y(.075)),
        (x(.50), y(.075)),
    ], n=28)

def _gola(W, H, tipo):
    """Furo da gola."""
    if tipo == 't':
        return [W*.385, H*.045, W*.615, H*.155]
    return [W*.40, H*.045, W*.60, H*.135]

def camisa(cor=(28, 28, 30), tipo='t', fundo=(250, 250, 250), tam=(1000, 1200)):
    W, H = tam[0]*S, tam[1]*S
    im = Image.new('RGB', (W, H), fundo)
    mask = Image.new('L', (W, H), 0)
    dm = ImageDraw.Draw(mask)
    dm.polygon(_corpo(W, H), fill=255)
    if tipo == 't':
        dm.ellipse(_gola(W, H, 't'), fill=0)

    tecido = Image.new('RGB', (W, H), cor)
    # sombreado suave: mais escuro nas bordas e nas dobras laterais
    g = np.linspace(-1, 1, W)[None, :]**2 + np.linspace(-0.3, 1, H)[:, None]**2*0.35
    som = (np.clip(1 - 0.28*g, 0.6, 1.08)*255).astype(np.uint8)
    tecido = ImageChops.multiply(tecido, Image.fromarray(som, 'L').convert('RGB'))
    im.paste(tecido, (0, 0), mask)

    d = ImageDraw.Draw(im)
    esc = tuple(max(0, c-26) for c in cor)
    cla = tuple(min(255, c+52) if sum(cor) < 300 else max(0, c-16) for c in cor)
    if tipo == 't':
        g = _gola(W, H, 't')
        d.ellipse([g[0]-W*.016, g[1]-H*.009, g[2]+W*.016, g[3]+H*.006], outline=cla, width=int(W*.011))
        d.ellipse(g, outline=esc, width=int(W*.004))
    # costuras das mangas e da bainha
    d.line([(W*.098, H*.368), (W*.172, H*.405)], fill=esc, width=int(W*.005))
    d.line([(W*.902, H*.368), (W*.828, H*.405)], fill=esc, width=int(W*.005))
    d.line([(W*.214, H*.902), (W*.786, H*.902)], fill=esc, width=int(W*.004))

    # sombra por baixo
    sombra = mask.filter(ImageFilter.GaussianBlur(W*.012))
    base = Image.new('RGB', (W, H), fundo)
    base.paste(Image.new('RGB', (W, H), (205, 205, 208)), (int(W*.004), int(H*.006)), sombra)
    base.paste(im, (0, 0), mask)
    if tipo == 'polo':
        # o colarinho fica por cima do furo da gola, por isso desenha-se no fim
        db = ImageDraw.Draw(base)
        col = tuple(min(255, c+22) if sum(cor) < 300 else max(0, c-12) for c in cor)
        db.polygon([(W*.405, H*.062), (W*.50, H*.150), (W*.595, H*.062),
                    (W*.588, H*.045), (W*.412, H*.045)], fill=col, outline=esc, width=int(W*.004))
        db.line([(W*.50, H*.150), (W*.50, H*.055)], fill=esc, width=int(W*.003))
        db.rectangle([W*.472, H*.140, W*.528, H*.285], fill=col, outline=esc, width=int(W*.003))
        for k in range(3):
            cy = H*(.172 + k*.047)
            db.ellipse([W*.4925, cy-W*.010, W*.5075, cy+W*.010], fill=esc)
    return base.resize(tam, Image.LANCZOS)

def aplicar(camisa_im, estampa, centro=(0.5, 0.42), largura=0.42, opac=0.97):
    """Põe a estampa sobre a camisa, com ligeira perda de contraste (tecido)."""
    W, H = camisa_im.size
    alvo = round(W*largura)
    e = estampa.copy()
    e = e.resize((alvo, max(1, round(e.height*alvo/e.width))), Image.LANCZOS)
    if e.mode != 'RGBA': e = e.convert('RGBA')
    a = e.split()[3].point(lambda v: int(v*opac))
    e.putalpha(a)
    x, y = round(W*centro[0] - e.width/2), round(H*centro[1] - e.height/2)
    fora = camisa_im.copy()
    fora.paste(e, (x, y), e)
    return fora
