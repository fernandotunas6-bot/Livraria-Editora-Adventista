# Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
# © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

"""Endireita a frente de uma maquete 3D da CPB (livro em pé sobre fundo preto ou branco)."""
import sys, json, numpy as np, cv2
from PIL import Image

def linha(xs, ys, it=4, tol=1.5):
    """Ajusta x = a*y + b (ou y = a*x + b) por mínimos quadrados, descartando desvios."""
    xs, ys = np.asarray(xs, float), np.asarray(ys, float)
    ok = np.ones(len(xs), bool)
    for _ in range(it):
        a, b = np.polyfit(ys[ok], xs[ok], 1)
        r = np.abs(xs - (a*ys + b))
        lim = max(tol, 2.5*np.median(r[ok]))
        ok = r <= lim
    return a, b

def cruza(v, h):
    """v: x = a1*y + b1 ; h: y = a2*x + b2"""
    a1, b1 = v; a2, b2 = h
    y = (a2*b1 + b2) / (1 - a2*a1)
    return a1*y + b1, y

def achatar(src, fundo='preto', thr=14, dr=None, db=None, inset=1.5, out=None, dbg=None, quad=None, faixa=True, lombada=0.0, topo=0.0, tam=(340, 510)):
    """Devolve os quatro cantos da frente do livro (sup. esq., sup. dir., inf. dir., inf. esq.).

    fundo:   'preto' ou 'branco' (cor do fundo da maqueta) ou 'alfa' (PNG com transparência).
    faixa:   True quando o livro mostra a faixa das páginas à direita e a base em baixo (maqueta
             da CPB em pé); a aresta da capa procura-se então para dentro dessas faixas.
    lombada: fracção da largura onde procurar a dobra da lombada à esquerda (0 = sem lombada).
    topo:    idem para a aresta de cima (páginas visíveis por cima da capa).
    quad:    cantos dados à mão, quando a detecção não acerta.
    inset:   píxeis a recolher para dentro, para não apanhar a orla do fundo.
    out/dbg: grava a frente endireitada (tam, 340×510 por omissão) e a imagem com o contorno detectado.
    """
    im = Image.open(src).convert('RGBA')
    bgc = (0, 0, 0) if fundo == 'preto' else (255, 255, 255)
    base = Image.new('RGBA', im.size, bgc + (255,)); base.alpha_composite(im)
    a = np.asarray(base.convert('RGB')).astype(np.int16)
    H, W = a.shape[:2]
    if not faixa:
        dr = 0 if dr is None else dr; db = 0 if db is None else db
    if fundo == 'alfa':
        mask = np.asarray(im)[..., 3] > 170
    elif fundo == 'preto':
        mask = a.max(axis=2) > thr
    else:
        mask = (255 - a.min(axis=2)) > thr
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask, 8)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); mask = lab == i
    g = cv2.cvtColor(a.astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
    ys_obj = np.where(mask.any(1))[0]; xs_obj = np.where(mask.any(0))[0]
    y0, y1 = ys_obj[0], ys_obj[-1]; x0, x1 = xs_obj[0], xs_obj[-1]
    hh, ww = y1 - y0, x1 - x0
    Y = np.arange(int(y0 + .12*hh), int(y1 - .12*hh))
    X = np.arange(int(x0 + .12*ww), int(x1 - .12*ww))
    L = [np.argmax(mask[y]) for y in Y]
    R = [W - 1 - np.argmax(mask[y][::-1]) for y in Y]
    T = [np.argmax(mask[:, x]) for x in X]
    B = [H - 1 - np.argmax(mask[:, x][::-1]) for x in X]
    # aresta interior à direita (faixa das páginas) e em baixo (base do livro)
    gx = np.abs(np.diff(g, axis=1)); gy = np.abs(np.diff(g, axis=0))
    Rf = []
    for y, r in zip(Y, R):
        if dr is not None: Rf.append(r - dr); continue
        lo, hi = r - 16, r - 3
        Rf.append(lo + int(np.argmax(gx[y, lo:hi])) + 1)
    Bf = []
    for x, b in zip(X, B):
        if db is not None: Bf.append(b - db); continue
        lo, hi = b - 26, b - 8
        Bf.append(lo + int(np.argmax(gy[lo:hi, x])) + 1)
    gs = cv2.GaussianBlur(g, (0, 0), 1.2)
    if lombada:
        gxs = np.abs(np.diff(gs, axis=1)); Lf = []
        for y, l in zip(Y, L):
            lo, hi = l + 3, l + int(lombada*ww)
            Lf.append(lo + int(np.argmax(gxs[y, lo:hi])) + 1)
        L = Lf
    if topo:
        gys = np.abs(np.diff(gs, axis=0)); Tf = []
        for x, t in zip(X, T):
            lo, hi = t + 2, t + int(topo*hh)
            Tf.append(lo + int(np.argmax(gys[lo:hi, x])) + 1)
        T = Tf
    vL = linha(L, Y); vR = linha(Rf, Y)
    hT = linha(T, X); hB = linha(Bf, X)
    tl = cruza(vL, hT); tr = cruza(vR, hT); br = cruza(vR, hB); bl = cruza(vL, hB)
    q = np.array([tl, tr, br, bl], np.float32)
    if quad is not None: q = np.array(quad, np.float32)
    # recolhe ligeiramente para dentro (borda anti-aliasing)
    c = q.mean(0); q = q + (c - q) / np.linalg.norm(c - q, axis=1, keepdims=True) * inset
    tw, th = tam
    dst = np.array([[0, 0], [tw - 1, 0], [tw - 1, th - 1], [0, th - 1]], np.float32)
    M = cv2.getPerspectiveTransform(q, dst)
    rgb = np.asarray(base.convert('RGB'))
    flat = cv2.warpPerspective(rgb, M, (tw, th), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
    if out: Image.fromarray(flat).save(out)
    if dbg:
        d = rgb.copy()
        cv2.polylines(d, [q.astype(np.int32)], True, (255, 0, 255), 1)
        Image.fromarray(d).save(dbg)
    return q.round(1).tolist()

if __name__ == '__main__':
    print(json.dumps(achatar(sys.argv[1], out=sys.argv[2], dbg=sys.argv[3] if len(sys.argv) > 3 else None)))
